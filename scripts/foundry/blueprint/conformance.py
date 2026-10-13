#!/usr/bin/env python3
"""Score in-house Foundry modules against the addon blueprint (rules C01–C62).

    conformance.py [--root foundry/module] [--snapshot DIR] [--module m …] [--json | --markdown]

Exit status: 0 when every scored module passes every fail-class rule or holds an exception for it,
1 when any fails without one or an exception is stale (so `conformance.py --module <short>` works as
the same gate `make foundry-<short>-check` runs), 2 for an unknown module. Exceptions are the rows
of exceptions.json beside this file (module id → rule id → reason, decision, until, match; Stage 5 step 2);
a stale row is one whose rule no longer fails. Modules listed in wait.json beside this file are
printed as WAIT: the fix phase does not edit them yet (it does not exempt them from the gate).

Every rule has a class — `fail`, `warn` or `manual` — and resolves to `pass | fail | warn | n/a |
manual`. The score is pass / (pass + fail) over the fail-class rules; warnings and the manual list
are reported separately and never move the score. Tier-aware: `[full]` rules are n/a for a module
whose tier is "small": `flags.pentaryn.tier` in module.json, else the `tier` vendor.py wrote into
lib/kit.lock.json, else full.

This is the ONLY implementation of the structural rules (blueprint D18); node tests cover
behaviour. It is a lexer plus regular expressions (scripts/foundry/ops/jsscan.py), not a parser:
it reads the shapes these modules use and says when a rule is heuristic.

Read-only. Package names come from packages.json beside this file, never from literals here —
scripts/foundry/**/*.py is in the updater's exposure grep.

`--snapshot DIR` scores a frozen copy laid out as DIR/module/<m>/ with DIR/adjustments.yml.
Repo-wiring rules (a ModuleSpec in ops/config.py, a route in context/foundry/README.md) are checked
against this repo for modules under the repo or a snapshot, and are n/a for a module generated
anywhere else (it is not installed yet; new_module.py prints those follow-ups).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from scripts.foundry.blueprint import vendor  # noqa: E402
from scripts.foundry.ops import jsscan  # noqa: E402
from scripts.foundry.update import adjustments as adj  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
MODULE_ROOT = REPO_ROOT / "foundry" / "module"
PACKAGES = json.loads((Path(__file__).with_name("packages.json")).read_text(encoding="utf-8"))
# module id → why the fix phase must not touch it now (wait.json; printed as WAIT)
WAIT: dict[str, str] = json.loads((Path(__file__).with_name("wait.json")).read_text(encoding="utf-8"))["modules"]
# module id → rule id → {reason, decision, until, match}: the only failing rules (and, by `match`,
# the only findings of each) the strict gate accepts
EXCEPTIONS: dict[str, dict[str, dict]] = json.loads(
    (Path(__file__).with_name("exceptions.json")).read_text(encoding="utf-8"))["modules"]

RESERVED_API = ("describe", "inspect", "settings", "trace", "version", "contract", "uninstall", "selftest")
README_SECTIONS = ("What the player sees", "Settings", "API", "Data written", "Flags other modules read",
                   "Events", "Patches and adjustments", "Two sessions", "Extending", "Pitfalls", "Files",
                   "Tests", "Sync")
SIZE_CAPS = {"entry": 150, "core": 600, "api": 300, "other": 500, "css": 400, "readme": 250}
HOT_HOOKS = tuple(PACKAGES["hotHooks"])
HOT_HOOK_PREFIXES = tuple(PACKAGES.get("hotHookPrefixes", ()))
READINESS = re.compile("|".join(re.escape(t) for t in PACKAGES["readinessTokens"]))
PRIVATE_PATTERNS = [re.compile(p) for p in PACKAGES.get("privateInternalPatterns", [])]
WORLD_ITER = re.compile(r"game\.actors\b|game\.scenes\b|canvas\.tokens\.placeables")


def is_hot_hook(name: str) -> bool:
    """A hook that fires per object per frame (C49, C60): an exact `hotHooks` row, or any name that
    starts with a `hotHookPrefixes` row (refreshTile, drawTokenLayer, hoverNote…)."""
    return name in HOT_HOOKS or name.startswith(HOT_HOOK_PREFIXES)


# role → roles it may import (use-doc §2). "glue" = a legacy file not yet given a role: allowed
# anything but the entry and test/, and listed so the migration can classify it.
ALLOWED = {
    "entry": {"feature", "ui", "adapter", "api", "settings", "core", "manifest", "lib", "glue"},
    "feature": {"ui", "adapter", "core", "settings", "manifest", "lib"},
    "ui": {"adapter", "core", "settings", "lib"},
    "adapter": {"core", "lib"},
    "api": {"core", "adapter", "settings", "manifest", "lib"},
    "settings": {"core", "lib"},
    "core": {"core"},
    "manifest": {"core"},
    "lib": {"lib"},
    "glue": {"feature", "ui", "adapter", "api", "settings", "core", "manifest", "lib", "glue"},
}
UI_NAME = re.compile(r"(-app|-ui|-dialog|dialog|hud|overlay|tray|strip|widget|popups?|editor|picker|bar)\.mjs$")
ADAPTER_NAME = re.compile(r"(^|/)(shapes|argon|piles|adapter|[\w-]+-adapter)\.mjs$")


# ── module model ─────────────────────────────────────────────────────────────

@dataclass
class Module:
    dir: Path
    manifest: dict
    files: dict[str, jsscan.Source]              # module-relative path → scan (non-lib, non-test)
    raw: dict[str, str]                          # module-relative path → source text
    lib_files: list[str]
    test_files: list[str]
    installed: bool                              # under the repo's module root or a snapshot
    registry: adj.Registry | None
    registry_root: Path
    all_manifests: dict[str, dict | None] = field(default_factory=dict)   # None: unreadable (C38 says so)
    registry_error: str | None = None            # why the registry could not be loaded (C47/C32 fail on it)

    @property
    def id(self) -> str:
        return self.manifest.get("id") or self.dir.name

    @property
    def short(self) -> str:
        return self.id.removeprefix("pentaryn-")

    @property
    def flags(self) -> dict:
        return (self.manifest.get("flags") or {}).get("pentaryn") or {}

    @property
    def tier(self) -> str:
        """module.json flags.pentaryn.tier, else lib/kit.lock.json's tier (vendor.py sync --tier
        writes it, so a migrated module is scored by its tier before the Wave 7 restart batch adds
        the flag), else "full"."""
        if self.flags.get("tier"):
            return self.flags["tier"]
        try:
            lock = vendor.read_lock(self.dir) or {}
        except (OSError, ValueError, vendor.VendorError):
            lock = {}
        return lock.get("tier") or "full"

    @property
    def entries(self) -> list[str]:
        return list(self.manifest.get("esmodules") or [])

    @property
    def entry(self) -> str | None:
        return self.entries[0] if self.entries else None

    def code(self, rel: str) -> str:
        return self.files[rel].code

    def reexports(self, rel: str) -> list[str]:
        """Module-relative targets of `rel`'s `export … from "./x"` and `export * [as N] from "./x"`."""
        src, out = self.files[rel], []
        base = (self.dir / rel).parent
        marks = [m.group(2) for m in jsscan._RE_EXPORT_LIST.finditer(src.code) if m.group(2)]
        marks += [m.group(2) for m in jsscan._RE_EXPORT_STAR.finditer(src.code)]
        for mark in marks:
            lit = src.str_at(mark)
            if not lit or not lit.plain or not lit.value.startswith("."):
                continue
            try:
                out.append((base / lit.value).resolve().relative_to(self.dir.resolve()).as_posix())
            except ValueError:
                pass
        return out

    def imports(self, rel: str) -> list[tuple[str, jsscan.Import]]:
        """(resolved module-relative target, import) for each relative import of `rel`."""
        out = []
        base = (self.dir / rel).parent
        for imp in jsscan.imports_of(self.files[rel]):
            if not imp.spec or not imp.spec.startswith("."):
                continue
            try:
                target = (base / imp.spec).resolve().relative_to(self.dir.resolve()).as_posix()
            except ValueError:
                target = imp.spec
            out.append((target, imp))
        return out


def _scan_dir(d: Path) -> tuple[dict, dict, list, list]:
    files, raw, lib, tests = {}, {}, [], []
    for f in sorted(d.rglob("*.mjs")):
        rel = f.relative_to(d).as_posix()
        parts = rel.split("/")
        if parts[0] in ("node_modules", "target") or "target" in parts:
            continue
        if parts[0] == "lib":
            lib.append(rel)
            continue
        if parts[0] == "test":
            tests.append(rel)
            continue
        raw[rel] = f.read_text(encoding="utf-8", errors="replace")
        files[rel] = jsscan.scan(f)
    return files, raw, lib, tests


class ManifestError(ValueError):
    """The scored module's own module.json cannot be read as a JSON object (main() exits 2 on it)."""


def read_manifest(d: Path) -> dict:
    try:
        man = json.loads((d / "module.json").read_text(encoding="utf-8"))
    except OSError as exc:
        raise ManifestError(f"module.json cannot be read: {exc}") from exc
    except ValueError as exc:
        raise ManifestError(f"module.json is not valid JSON: {exc}") from exc
    if not isinstance(man, dict):
        raise ManifestError(f"module.json is not valid JSON: a {type(man).__name__}, not an object")
    return man


def load_module(d: Path, *, installed: bool, registry: adj.Registry | None, registry_root: Path,
                all_manifests: dict[str, dict | None] | None = None, registry_error: str | None = None) -> Module:
    manifest = read_manifest(d)
    files, raw, lib, tests = _scan_dir(d)
    return Module(d, manifest, files, raw, lib, tests, installed, registry, registry_root, all_manifests or {},
                  registry_error)


def registry_failure(err: str) -> str:
    """The one line C47, C32 and main() report when adjustments.yml cannot be loaded."""
    return f"adjustments registry cannot be loaded: {err}"


# ── helpers ──────────────────────────────────────────────────────────────────

def strings(m: Module, rel: str) -> list[jsscan.Str]:
    return m.files[rel].strings


def all_code(m: Module) -> str:
    return "\n".join(s.code for s in m.files.values())


def lit_after(src: jsscan.Source, pos: int) -> jsscan.Str | None:
    """The string literal whose marker starts at/after `pos` (skipping whitespace)."""
    mm = re.compile(r"\s*\x01(\d+)\x01").match(src.code, pos)
    return src.strings[int(mm.group(1))] if mm else None


def match_paren(code: str, open_idx: int) -> int:
    """Index of the bracket closing the one at `open_idx` (code view: strings already lifted)."""
    pairs = {"(": ")", "{": "}", "[": "]"}
    stack = [pairs[code[open_idx]]]
    i = open_idx + 1
    while i < len(code) and stack:
        c = code[i]
        if c in pairs:
            stack.append(pairs[c])
        elif stack and c == stack[-1]:
            stack.pop()
        i += 1
    return i - 1


def depth_at(code: str, pos: int) -> int:
    return code.count("{", 0, pos) - code.count("}", 0, pos)


def _is_core_path(rel: str) -> bool:
    name = rel.split("/")[-1]
    return rel.startswith("core/") or name.endswith("-core.mjs") or name == "core.mjs"


def role_of(m: Module, rel: str, features: set[str]) -> str:
    if rel == m.entry or rel in m.entries:
        return "entry"
    if _is_core_path(rel):
        return "core"
    name = rel.split("/")[-1]
    if name == "api-manifest.mjs":
        return "manifest"
    if name == "api.mjs" or name.endswith("-api.mjs"):
        return "api"
    if name == "settings.mjs":
        return "settings"
    if rel in features:
        return "feature"
    if ADAPTER_NAME.search(rel):
        return "adapter"
    if UI_NAME.search(rel):
        return "ui"
    return "glue"


LIFECYCLE_HOOKS = {"init", "i18nInit", "setup", "ready"}


def registered_hook_names(m: Module) -> list[tuple[str, str]]:
    """(file, hook name) for every literal Hooks.on/once or reg.on/once registration."""
    out = []
    for rel, src in m.files.items():
        for mm in re.finditer(r"(?<![\w$])(?:Hooks|reg|ctx\.reg)\.(?:on|once)\(\s*\x01(\d+)\x01", src.code):
            out.append((rel, src.strings[int(mm.group(1))].value))
    return out


def feature_files(m: Module) -> set[str]:
    """The entry's `import * as` targets (D12), plus any file that exports install()."""
    out: set[str] = set()
    for e in m.entries:
        if e in m.files:
            out.update(t for t, imp in m.imports(e) if imp.namespace and not _is_core_path(t))
    for rel, src in m.files.items():
        names, _ = jsscan.exports_of(src)
        if "install" in names and rel not in m.entries:
            out.add(rel)
    return {f for f in out if f in m.files}


def package_hits(m: Module, *, include_lib: bool = True) -> dict[str, list[str]]:
    """package id → files whose code names it (comments stripped, adjustments.py's id rule + aliases)."""
    paths = [m.dir / rel for rel in m.files]
    if include_lib:
        paths += [m.dir / rel for rel in m.lib_files]
    hits: dict[str, list[str]] = {}
    for path in paths:
        code = adj.strip_comments(path.read_text(encoding="utf-8", errors="replace"), path.suffix)
        low = code.lower()
        for pkg, aliases in package_aliases(m).items():
            if adj.id_pattern(pkg).search(code) or any(a.lower() in low for a in aliases):
                hits.setdefault(pkg, []).append(path.relative_to(m.dir).as_posix())
    return hits


def package_aliases(m: Module | None = None) -> dict[str, list[str]]:
    """packages.json aliases merged with the adjustments registry's `aliases` — the registry is what
    the updater's exposure grep uses, so the scorer must never count fewer references than it."""
    out = {pkg: list(meta.get("aliases", [])) for pkg, meta in PACKAGES["packages"].items()}
    reg = m.registry if m is not None else None
    for pkg, terms in ((reg.aliases if reg is not None else {}) or {}).items():
        merged = out.setdefault(pkg, [])
        merged.extend(t for t in terms if t not in merged)
    return out


def related(m: Module) -> set[str]:
    return vendor.related_packages(m.manifest)


def lang_keys(m: Module) -> dict[str, str] | None:
    for lang in m.manifest.get("languages") or []:
        p = m.dir / (lang.get("path") or "")
        if lang.get("lang") == "en" and p.is_file():
            return jsscan.load_lang(p)
    p = m.dir / "lang" / "en.json"
    return jsscan.load_lang(p) if p.is_file() else None


def is_dnd5e_touch(m: Module) -> list[str]:
    spec = PACKAGES["dnd5e"]
    pats = [re.compile(p) for p in spec["codePatterns"]]
    str_pats = [re.compile(p) for p in spec.get("stringPatterns", [])]
    found = []
    for rel, src in m.files.items():
        if any(p.search(src.code) for p in pats) or any(
                s.value.startswith(tuple(spec["stringPrefixes"])) or s.value in spec["stringExact"]
                or any(sp.search(s.value) for sp in str_pats)
                for s in src.strings):
            found.append(rel)
    return found


# ── the rules ────────────────────────────────────────────────────────────────

@dataclass
class Result:
    id: str
    cls: str
    status: str
    detail: list[str] = field(default_factory=list)
    title: str = ""


RULES: list[tuple[str, str, bool, str]] = []   # (id, class, full_only, title)
_FUNCS = {}


def rule(rid: str, cls: str, title: str, *, full: bool = False):
    def deco(fn):
        RULES.append((rid, cls, full, title))
        _FUNCS[rid] = fn
        return fn
    return deco


def ok(detail=None):
    return "pass", list(detail or [])


def bad(detail):
    return "fail", list(detail)


def na(why):
    return "n/a", [why]


def _capped(detail: list[str], n: int = 12) -> list[str]:
    """The first `n` findings and a "… N more" line, for display only (to_markdown). Rules return
    every finding: the strict gate's `match` runs on the full list, and --json carries it (PYB-E6)."""
    return list(detail[:n]) + ([f"… {len(detail) - n} more"] if len(detail) > n else [])


@rule("C01", "fail", "module.json id == folder name")
def c01(m):
    return ok() if m.manifest.get("id") == m.dir.name else bad([f"id {m.manifest.get('id')!r} ≠ folder {m.dir.name!r}"])


@rule("C02", "warn", 'compatibility.minimum == "14"')
def c02(m):
    v = str((m.manifest.get("compatibility") or {}).get("minimum", ""))
    return ok() if v == "14" else ("warn", [f"minimum is {v or 'unset'} (raise in the Wave 7 restart batch)"])


@rule("C03", "fail", "dnd5e in relationships.systems iff the sources touch dnd5e")
def c03(m):
    touch = is_dnd5e_touch(m)
    systems = {s.get("id") for s in ((m.manifest.get("relationships") or {}).get("systems") or []) if isinstance(s, dict)}
    has = "dnd5e" in systems
    if bool(touch) == has:
        return ok()
    if touch:
        return bad([f"touches dnd5e ({', '.join(touch[:4])}) but relationships.systems does not name it"])
    return bad(["relationships.systems names dnd5e but no source touches it"])


@rule("C04", "fail", "languages present iff any i18n key literal or call")
def c04(m):
    uses = [rel for rel, src in m.files.items()
            if re.search(r"game\.i18n\b|(?<![\w$.])_loc\(", src.code)
            or any(re.match(r"PENTARYN_[A-Z0-9_]+\.", s.value) for s in src.strings)]
    has = bool(m.manifest.get("languages"))
    if bool(uses) == has:
        return ok()
    return bad([f"i18n used in {', '.join(uses[:4])} but no languages" if uses else "languages declared but nothing localises"])


@rule("C05", "fail", "every non-test, non-lib .mjs reachable from esmodules")
def c05(m):
    seen: set[str] = set()
    stack = [e for e in m.entries if e in m.files]
    while stack:
        f = stack.pop()
        if f in seen:
            continue
        seen.add(f)
        stack.extend(t for t, _ in m.imports(f) if t in m.files)
        stack.extend(t for t in m.reexports(f) if t in m.files)   # a barrel reaches what it re-exports
    orphans = sorted(set(m.files) - seen)
    return ok() if not orphans else bad([f"unreachable: {', '.join(orphans)}"])


@rule("C06", "fail", "every styles path exists")
def c06(m):
    missing = [s if isinstance(s, str) else str(s) for s in m.manifest.get("styles") or []
               if not (m.dir / (s if isinstance(s, str) else s.get("src", ""))).is_file()]
    return ok() if not missing else bad([f"missing: {', '.join(missing)}"])


@rule("C06w", "warn", "stylesheets live under styles/ (vendored lib/*.css kit files exempt)")
def c06w(m):
    # a vendored kit stylesheet (D7) is listed as lib/<name>.css by design (vendor.py docstring)
    outside = [s for s in m.manifest.get("styles") or [] if isinstance(s, str)
               and not s.startswith("styles/") and not re.fullmatch(r"lib/[\w-]+\.css", s)]
    return ok() if not outside else ("warn", [f"move to styles/ in Wave 7: {', '.join(outside)}"])


def flag_scope_uses(m: Module, scope: str) -> list[str]:
    """file:line where the code uses `scope` as a flag scope: the literal in get/set/unsetFlag(…),
    flags["…"] / flags?.["…"] / flags.<scope>, flags: {"…": …}, or a constant holding the literal used
    in any of those positions (walls' FLAG_SCOPE, used from another file)."""
    hits: list[str] = []
    consts: set[str] = set()
    for rel, src in m.files.items():
        for i, st in enumerate(src.strings):
            if st.plain and st.value == scope:
                for cm in re.finditer(rf"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\x01{i}\x01", src.code):
                    consts.add(cm.group(1))
    ident = re.fullmatch(r"[A-Za-z_$][\w$]*", scope) is not None
    for rel, src in m.files.items():
        code = src.code
        marks = [f"\x01{i}\x01" for i, st in enumerate(src.strings) if st.plain and st.value == scope]
        names = [re.escape(x) for x in marks] + [rf"\b{re.escape(c)}\b" for c in sorted(consts)]
        pats = []
        for n in names:
            pats += [rf"(?:get|set|unset)Flag\(\s*{n}", rf"flags\??\.?\[\s*{n}\s*\]", rf"flags\s*:\s*\{{\s*\[?\s*{n}\s*\]?\s*:"]
        if ident:
            pats.append(rf"flags\??\.{re.escape(scope)}\b")
        for pat in pats:
            for mm in re.finditer(pat, code):
                hits.append(f"{rel}:{src.line_of(mm.start())}")
    return sorted(set(hits), key=lambda h: (h.split(":")[0], int(h.split(":")[1])))


@rule("C07", "fail", "flags.pentaryn has tier, namespace, flagScope == id, cssPrefix, generation")
def c07(m):
    f = m.flags
    missing = [k for k in ("tier", "namespace", "flagScope", "cssPrefix", "generation") if k not in f]
    detail = [f"missing {', '.join(missing)}"] if missing else []
    if "flagScope" in f and f["flagScope"] != m.id:
        scope = f["flagScope"]
        where = flag_scope_uses(m, scope)
        if where:
            detail.append(f"flagScope {scope!r} ≠ {m.id!r} — Wave 7 DATA migration: the code writes flags "
                          f"under {scope!r} ({', '.join(where[:3])})")
        else:
            detail.append(f"flagScope {scope!r} ≠ {m.id!r} — manifest-only correction in Wave 7 (no flag is "
                          f"written under {scope!r}; no data moves)")
    return ok() if not detail else bad(detail)


@rule("C08", "fail", 'socket true iff the module uses its module.<id> channel (game.socket or a registrar)')
def c08(m):
    channels = set()          # identifiers bound to a "module.…" string anywhere in the module
    for src in m.files.values():
        for mm in re.finditer(r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*", src.code):
            lit = lit_after(src, mm.end())
            if lit and lit.prefix.startswith("module."):
                channels.add(mm.group(1))
    emits = []
    for rel, src in m.files.items():
        for mm in re.finditer(r"game\.socket\??\.(?:emit|on)\(\s*", src.code):
            lit = lit_after(src, mm.end())
            ident = re.match(r"[A-Za-z_$][\w$]*", src.code[mm.end():])
            if (lit and lit.prefix.startswith("module.")) or (not lit and ident and ident.group(0) in channels):
                emits.append(rel)
        if any(tok in src.code for tok in PACKAGES["socketRegistrars"]):
            emits.append(rel)
    has = m.manifest.get("socket") is True
    if bool(emits) == has:
        return ok()
    return bad([f"uses its socket channel in {', '.join(sorted(set(emits)))} but socket is not true" if emits
                else "socket: true but nothing uses the module.* channel"])


@rule("C09", "fail", "recommends carry reasons; every package named in code is in relationships")
def c09(m):
    detail = []
    for r in ((m.manifest.get("relationships") or {}).get("recommends") or []):
        if isinstance(r, dict) and not r.get("reason"):
            detail.append(f"recommends {r.get('id')} has no reason")
    rel = related(m)
    for pkg, files in sorted(package_hits(m).items()):
        if pkg not in rel:
            detail.append(f"code names {pkg} ({', '.join(files[:3])}) but relationships do not")
    return ok() if not detail else bad(detail)


@rule("C10", "warn", "size caps (entry 150, core 600, feature/ui/adapter 500, api 300, css 400, README 250)")
def c10(m):
    feats = feature_files(m)
    over = []
    for rel, text in m.raw.items():
        role = role_of(m, rel, feats)
        cap = SIZE_CAPS["entry"] if role == "entry" else SIZE_CAPS["core"] if role == "core" else \
            SIZE_CAPS["api"] if role == "api" else SIZE_CAPS["other"]
        n = text.count("\n") + 1
        if n > cap:
            over.append(f"{rel} {n}/{cap}")
    for css in m.dir.rglob("*.css"):
        if "node_modules" in css.parts:
            continue
        n = css.read_text(encoding="utf-8", errors="replace").count("\n") + 1
        if n > SIZE_CAPS["css"]:
            over.append(f"{css.relative_to(m.dir).as_posix()} {n}/{SIZE_CAPS['css']}")
    readme = m.dir / "README.md"
    if readme.exists():
        n = readme.read_text(encoding="utf-8").count("\n") + 1
        if n > SIZE_CAPS["readme"]:
            over.append(f"README.md {n}/{SIZE_CAPS['readme']}")
    return ok() if not over else ("warn", over)


CORE_GLOBAL = re.compile(r"(?<![\w$.])(game|canvas|ui|Hooks|CONFIG)\.")
CORE_FOUNDRY = re.compile(r"(?<![\w$.])foundry\.(?!utils\.)")


def core_files(m: Module) -> list[str]:
    return [r for r in m.files if _is_core_path(r)]


@rule("C11", "fail", "a pure core exists: no game/canvas/ui/Hooks/CONFIG, only foundry.utils")
def c11(m):
    cores = core_files(m)
    if not cores:
        return bad(["no *-core.mjs / core.mjs"])
    detail = []
    for rel in cores:
        code = m.code(rel)
        for rx in (CORE_GLOBAL, CORE_FOUNDRY):
            for mm in rx.finditer(code):
                detail.append(f"{rel}:{m.files[rel].line_of(mm.start())} {code[mm.start():mm.start() + 24].strip()}")
    return ok() if not detail else bad(detail)


@rule("C12", "fail", "MODULE defined once; no MOD / MODULE_ID / SCOPE")
def c12(m):
    defs = [(rel, m.files[rel].line_of(mm.start())) for rel in m.files
            for mm in re.finditer(r"(?:const|let|var)\s+MODULE\s*=", m.code(rel))]
    dups = [f"{rel}:{m.files[rel].line_of(mm.start())} {mm.group(1)}" for rel in m.files
            for mm in re.finditer(r"(?:const|let|var)\s+(MOD|MODULE_ID|SCOPE)\s*=", m.code(rel))]
    detail = []
    if len(defs) != 1:
        detail.append(f"MODULE defined {len(defs)}×" + (f": {', '.join(f'{r}:{n}' for r, n in defs)}" if defs else ""))
    detail += dups
    return ok() if not detail else bad(detail)


@rule("C13", "fail", "no .md in the module other than README / CHANGELOG")
def c13(m):
    extra = sorted(p.relative_to(m.dir).as_posix() for p in m.dir.rglob("*.md")
                   if p.relative_to(m.dir).as_posix() not in ("README.md", "CHANGELOG.md")
                   and not {"node_modules", "target"} & set(p.parts))
    return ok() if not extra else bad([f"move to context/plans/: {', '.join(extra)}"])


@rule("C14", "fail", "lib/kit.lock.json present and vendor.py check passes")
def c14(m):
    problems = vendor.check(m.dir)
    return ok() if not problems else bad(problems)


@rule("C15", "fail", "`import * as` only for feature files (from the entry) and core/ barrels")
def c15(m):
    detail = []
    for rel in m.files:
        for target, imp in m.imports(rel):
            if not imp.namespace:
                continue
            if _is_core_path(target):
                continue
            if rel in m.entries:
                src = m.files.get(target)
                if src is not None and "install" in jsscan.exports_of(src)[0]:
                    continue
                detail.append(f"{rel}:{imp.line} import * as … from {imp.spec} — not a feature (no install export)")
            else:
                detail.append(f"{rel}:{imp.line} import * as … from {imp.spec}")
    return ok() if not detail else bad(detail)


@rule("C16", "fail", "import direction (use-doc §2) less test/graph-allow.json; nothing imports the entry or test/")
def c16(m):
    allow = set()
    ga = m.dir / "test" / "graph-allow.json"
    if ga.exists():
        for e in json.loads(ga.read_text(encoding="utf-8")).get("allow") or []:
            allow.add((e.get("from"), e.get("to")))
    feats = feature_files(m)
    detail, unclassified = [], set()
    for rel in m.files:
        r_from = role_of(m, rel, feats)
        if r_from == "glue":
            unclassified.add(rel)
        for target, imp in m.imports(rel):
            if target.startswith("lib/"):
                r_to = "lib"
            elif target.startswith("test/"):
                detail.append(f"{rel}:{imp.line} imports test/ ({target})")
                continue
            elif target in m.files:
                r_to = role_of(m, target, feats)
            else:
                continue
            if r_to == "entry" and target != rel:
                detail.append(f"{rel}:{imp.line} imports the entry {target}")
                continue
            if r_to not in ALLOWED[r_from] and (rel, target) not in allow:
                detail.append(f"{rel} ({r_from}) → {target} ({r_to})")
    if unclassified and not detail:
        return ok([f"unclassified (glue): {', '.join(sorted(unclassified))}"])
    if detail and unclassified:
        detail.append(f"unclassified (glue): {', '.join(sorted(unclassified))}")
    return ok() if not detail else bad(detail)


@rule("C17", "fail", "module-scope Hooks.on/once only in the entry")
def c17(m):
    detail = []
    for rel in m.files:
        if rel == m.entry:
            continue
        code = m.code(rel)
        for mm in re.finditer(r"(?<![\w$.])Hooks\.(on|once)\(", code):
            if depth_at(code, mm.start()) == 0:
                detail.append(f"{rel}:{m.files[rel].line_of(mm.start())} Hooks.{mm.group(1)}")
    return ok() if not detail else bad(detail)


@rule("C18", "fail", "every feature file exports install and uninstall")
def c18(m):
    feats = feature_files(m)
    if not feats:
        other = sorted({n for _, n in registered_hook_names(m) if n not in LIFECYCLE_HOOKS})
        if not other:
            return na("no features: the module registers only lifecycle hooks (init/setup/ready) in its entry")
        return bad([f"no feature files (entry `import * as` targets exporting install), but it hooks "
                    f"{', '.join(other[:6])}{' …' if len(other) > 6 else ''}"])
    detail = []
    for rel in sorted(feats):
        names, _ = jsscan.exports_of(m.files[rel])
        miss = [n for n in ("install", "uninstall") if n not in names]
        if miss:
            detail.append(f"{rel}: no {', '.join(miss)}")
    return ok() if not detail else bad(detail)


def legacy_names(m: Module) -> set[str]:
    out = set()
    for rel, src in m.files.items():
        for mm in re.finditer(r"legacyName\s*:", src.code):
            lit = lit_after(src, mm.end())
            if lit:
                out.add(lit.value)
    return out


def hooks_table_names(m: Module) -> list[tuple[str, int, str]]:
    """(file, line, name) for every `name:` literal inside an `export const HOOKS = {…}` object —
    with the kit, emits go through emit(key) and the real names live only in these rows."""
    out = []
    for rel, src in m.files.items():
        code = src.code
        for mm in re.finditer(r"export\s+const\s+HOOKS\s*=\s*(?:Object\.freeze\(\s*)?\{", code):
            start = mm.end() - 1
            body = code[start:match_paren(code, start) + 1]
            for nm in re.finditer(r"(?<![\w$])name\s*:\s*\x01(\d+)\x01", body):
                lit = src.strings[int(nm.group(1))]
                out.append((rel, lit.line, lit.value))
    return out


@rule("C19", "fail", "emitted hook names are pentaryn-<short>.* or a HOOKS legacyName")
def c19(m):
    legacy = legacy_names(m)
    detail = []
    for rel, line, name in hooks_table_names(m):
        if not name.startswith(f"{m.id}."):
            detail.append(f"{rel}:{line} HOOKS row name {name!r} (an old name belongs in legacyName)")
    for rel, src in m.files.items():
        for mm in re.finditer(r"(?<![\w$.])Hooks\.(callAll|call)\(", src.code):
            lit = lit_after(src, mm.end())
            if lit is None:
                continue
            name = lit.value if lit.plain else lit.prefix
            if name.startswith(f"{m.id}.") or (lit.plain and name in legacy):
                continue
            if not lit.plain and (name == "${}." or name.startswith("${}")):
                continue
            detail.append(f"{rel}:{lit.line} emits {name!r}")
    return ok() if not detail else bad(sorted(set(detail)))


@rule("C20", "fail", "test/golden/hooks.json exists (full: hooks.test pins it; small: glue.test pins it)")
def c20(m):
    detail = []
    if not (m.dir / "test/golden/hooks.json").exists():
        detail.append("no test/golden/hooks.json")
    if m.tier == "small":
        glue = m.dir / "test/glue.test.mjs"
        text = glue.read_text(encoding="utf-8", errors="replace") if glue.exists() else ""
        if not re.search(r"""pinJSON\(\s*["']hooks["']""", text):
            detail.append('test/glue.test.mjs does not pin hooks (pinJSON("hooks", …))')
    return ok() if not detail else bad(detail)


@rule("C21", "fail", "game.settings.register|get only in settings.mjs or lib/")
def c21(m):
    detail = [f"{rel}:{m.files[rel].line_of(mm.start())}" for rel in m.files if rel.split("/")[-1] != "settings.mjs"
              for mm in re.finditer(r"game\.settings\??\.(register|get)\(", m.code(rel))]
    return ok() if not detail else bad(detail)


@rule("C22", "fail", "SETTINGS exported when any setting is registered")
def c22(m):
    registers = any(re.search(r"game\.settings\??\.register\(|defineSettings\(", m.code(r)) for r in m.files)
    if not registers:
        return na("no settings")
    exported = any("SETTINGS" in jsscan.exports_of(m.files[r])[0] for r in m.files)
    return ok() if exported else bad(["settings are registered but no file exports SETTINGS"])


@rule("C23", "fail", "never reads another pentaryn module's settings")
def c23(m):
    detail = []
    for rel, src in m.files.items():
        for mm in re.finditer(r"game\.settings\??\.get\(", src.code):
            lit = lit_after(src, mm.end())
            if lit and lit.value.startswith("pentaryn-") and lit.value != m.id:
                detail.append(f"{rel}:{lit.line} reads {lit.value}")
    return ok() if not detail else bad(detail)


@rule("C24", "fail", "no empty or comment-only catch")
def c24(m):
    detail = [f"{rel}:{m.files[rel].line_of(mm.start())}" for rel in m.files
              for mm in re.finditer(r"catch\s*(?:\([^)]*\))?\s*\{\s*\}", m.code(rel))]
    return ok() if not detail else bad(detail)


@rule("C25", "fail", "every console.* line carries the `<module> |` prefix (or the file logs through makeLog)")
def c25(m):
    detail = []
    for rel, src in m.files.items():
        for mm in re.finditer(r"(?<![\w$.])console\.(log|warn|error|info|debug)\(", src.code):
            lit = lit_after(src, mm.end())
            text = lit.value if lit else ""
            if lit and (" | " in text or text.startswith(f"{m.id} |") or text.startswith("${} |")):
                continue
            detail.append(f"{rel}:{src.line_of(mm.start())} console.{mm.group(1)} without the prefix")
    return ok() if not detail else bad(detail)


def _publishes(m: Module, rel: str, call: str) -> bool:
    """`setTimeout(fn, 0)` / `setTimeout(() => fn(), 0)` where `fn` is a function in the same file
    whose body publishes (game.pentaryn, publishNamespace) or whose name says it does."""
    inner = call[call.index("(") + 1:]
    fm = re.match(r"\s*(?:\(\s*\)\s*=>\s*\{?\s*)?([A-Za-z_$][\w$]*)\s*(?:\(\s*\))?\s*\}?\s*,", inner)
    if not fm:
        return False
    name = fm.group(1)
    if re.search(r"publish", name, re.I):
        return True
    code = m.code(rel)
    dm = re.search(rf"function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{|(?:const|let)\s+{re.escape(name)}\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{{", code)
    if not dm:
        return False
    body = code[dm.end() - 1:match_paren(code, dm.end() - 1) + 1]
    return "game.pentaryn" in body or re.search(r"(?<![\w$.])publishNamespace\(", body) is not None


@rule("C26", "fail", "no setTimeout(…, 0) around publish outside lib/; no setTimeout ≥ 100 ms for readiness")
def c26(m):
    detail = []
    for rel in m.files:
        code = m.code(rel)
        for mm in re.finditer(r"(?<![\w$.])setTimeout\(", code):
            end = match_paren(code, mm.end() - 1)
            call = code[mm.start():end + 1]
            delay = re.search(r",\s*(\d+)\s*\)$", call)
            ms = int(delay.group(1)) if delay else None
            if ms == 0 and ("game.pentaryn" in call or _publishes(m, rel, call)):
                detail.append(f"{rel}:{m.files[rel].line_of(mm.start())} setTimeout 0 around publish")
            elif ms is not None and ms >= 100 and READINESS.search(call):
                detail.append(f"{rel}:{m.files[rel].line_of(mm.start())} setTimeout {ms} ms for readiness")
    return ok() if not detail else bad(detail)


@rule("C27", "fail", "api-manifest.mjs exists and buildApi is used", full=True)
def c27(m):
    detail = []
    if "api-manifest.mjs" not in m.files:
        detail.append("no api-manifest.mjs")
    if not any(re.search(r"(?<![\w$.])buildApi\(", m.code(r)) for r in m.files):
        detail.append("buildApi not used")
    return ok() if not detail else bad(detail)


@rule("C28", "fail", "golden describe.json and surface.json present", full=True)
def c28(m):
    miss = [f for f in ("describe.json", "surface.json") if not (m.dir / "test/golden" / f).exists()]
    return ok() if not miss else bad([f"no test/golden/{f}" for f in miss])


OWN_SCOPE_IDENT = r"(?:MODULE|MOD|MODULE_ID|SCOPE)"
_COMPUTED_WRITES = (
    # [`flags.${MODULE}.x`]: v   — a computed key in an update payload
    re.compile(r"\[\s*`flags\.\$\{\s*" + OWN_SCOPE_IDENT + r"\s*\}[^`]*`\s*\]\s*:"),
    # foundry.utils.setProperty(data, `flags.${MODULE}.x`, v)
    re.compile(r"setProperty\(\s*[^,()]+,\s*`flags\.\$\{\s*" + OWN_SCOPE_IDENT + r"\s*\}"),
    # flags: { [MODULE]: {...} }  in create/update data
    re.compile(r"flags\s*:\s*\{\s*\[\s*" + OWN_SCOPE_IDENT + r"\s*\]\s*:"),
)
# a write whose statement names one of these documents is not an actor/token write (C29's scope)
_NON_ACTOR_DOC = re.compile(r"region|journal|page|wall|scene\.update|note", re.I)
# …and it must name an actor or token (the receiver, its source, or the update list)
_ACTOR_DOC = re.compile(r"actor|token", re.I)


def computed_flag_writes(m: Module, rel: str) -> list[int]:
    """Lines where `rel` writes its own flag scope through a computed path (R8): the template key
    `flags.${MODULE}.x`, `setProperty(…, "flags.${MODULE}…")`, or `flags: {[MODULE]: …}` — only where
    the statement reads as an actor or token write (it names an actor/token and no region, journal
    page, wall or note). Heuristic: a miss leaves C29 n/a, as before R8."""
    raw = m.raw.get(rel, "")
    lines = []
    for pat in _COMPUTED_WRITES:
        for mm in pat.finditer(raw):
            stmt_start = max(raw.rfind(";", 0, mm.start()), raw.rfind("\n\n", 0, mm.start()), mm.start() - 240)
            window = raw[stmt_start:mm.start()]
            if _NON_ACTOR_DOC.search(window) or not _ACTOR_DOC.search(window):
                continue
            lines.append(raw.count("\n", 0, mm.start()) + 1)
    return sorted(set(lines))


@rule("C29", "fail", "inspect() present when the module writes flags on actors/tokens", full=True)
def c29(m):
    writes = False
    for rel, src in m.files.items():
        if (re.search(r"\.setFlag\(", src.code)
                or any(s.prefix.startswith(f"flags.{m.id}.") for s in src.strings)
                or computed_flag_writes(m, rel)):
            writes = True
            break
    if not writes:
        return na("writes no flags of its own")
    has = any(re.search(r"(?<![\w$])inspect\s*[:(]", m.code(r)) for r in m.files) or any(
        s.value == "inspect" for r in m.files for s in strings(m, r))
    return ok() if has else bad(["writes flags but publishes no inspect(ref)"])


@rule("C30", "fail", "queries registered only through guarded / relayed / registerQueries")
def c30(m):
    detail = []
    for rel in m.files:
        code = m.code(rel)
        for mm in re.finditer(r"CONFIG\.queries\s*\[[^\]]*\]\s*=\s*", code):
            if not re.match(r"(?:guarded|relayed)\(", code[mm.end():mm.end() + 10]):
                detail.append(f"{rel}:{m.files[rel].line_of(mm.start())} unguarded query handler")
    return ok() if not detail else bad(detail)


@rule("C31", "manual", "writes return ok/fail; reads throw coded")
def c31(m):
    return "manual", ["review every API row with writes:true (describe().methods) against use-doc §5.1"]


def _register_tokens() -> list[str]:
    return [t for meta in PACKAGES["packages"].values() for t in meta.get("register", [])]


@rule("C32", "fail", "prototype patches only via wrapMethod/defineAccessor; rows ↔ patches agree")
def c32(m):
    detail = []
    reg_tokens = _register_tokens()
    for rel in m.files:
        code = m.code(rel)
        for rx, what in ((r"\.prototype\.[\w$]+\s*=(?!=)", "prototype assignment"),
                         (r"Object\.defineProperty\(\s*[\w$.]*prototype", "defineProperty on a prototype")):
            for mm in re.finditer(rx, code):
                detail.append(f"{rel}:{m.files[rel].line_of(mm.start())} {what}")
        for tok in reg_tokens:
            for mm in re.finditer(re.escape(tok) + r"\(", code):
                detail.append(f"{rel}:{m.files[rel].line_of(mm.start())} {tok}")
    named = set()
    for rel, src in m.files.items():
        for mm in re.finditer(r"adjustments\s*:", src.code):
            lit = lit_after(src, mm.end())
            if lit:
                named.add(lit.value)
    if m.registry is not None:
        ids = m.registry.ids()
        for n in sorted(named - ids):
            detail.append(f"wrapMethod names adjustments row {n!r}, which does not exist")
        # D2 / R1 (use-doc §5.6): `<short>-…` ids are exactly the rows a wrapMethod patch names;
        # a non-patch row (workaround, private read, third-party flag) takes its package's prefix
        for n in sorted(n for n in named & ids if not n.startswith(f"{m.short}-")):
            detail.append(f"wrapMethod names row {n!r}: a patch row's id starts {m.short}- (D2)")
        rows = [r for r in m.registry.rows if m.id in r.modules]
        if rows:
            sub = adj.Registry(rows=[_remap(r, m) for r in rows])
            detail += [f"adjustments: {p}" for p in adj.check(sub, root=m.registry_root)]
        for r in rows:
            if r.id.startswith(f"{m.short}-") and r.id not in named:
                comment_only = not any(mk in all_code(m) for mk in r.markers) and any(
                    mk in t for mk in r.markers for t in m.raw.values())
                if not comment_only:
                    detail.append(f"row {r.id} has no wrapMethod patch naming it — a non-patch row takes "
                                  f"its package's prefix (core-, dnd5e-, argon-, …; D2)")
    elif m.registry_error:
        detail.insert(0, registry_failure(m.registry_error))     # first, so the cap below never hides it
    return ok() if not detail else bad(detail)


def _remap(row: adj.Adjustment, m: Module) -> adj.Adjustment:
    """Point a row's repo paths at the tree being scored (a snapshot keeps modules under module/)."""
    files = []
    for f in row.files:
        if f.startswith("foundry/module/"):
            p = m.dir.parent / f.removeprefix("foundry/module/")
            files.append(str(p.relative_to(m.registry_root)) if p.is_relative_to(m.registry_root) else str(p))
        else:
            files.append(f)
    return adj.Adjustment(id=row.id, packages=row.packages, modules=row.modules, files=tuple(files),
                          markers=row.markers, what=row.what)


@rule("C33", "manual", "private-internal access is covered by an adjustments row")
def c33(m):
    hits = []
    for rel in m.files:
        code = m.code(rel)
        for tok in PACKAGES["privateInternals"]:
            n = code.count(tok)
            if n:
                hits.append(f"{rel}: {tok} ×{n}")
        n = len(re.findall(r"\._on[A-Z]\w+\b", code))
        if n:
            hits.append(f"{rel}: _on* private handler ×{n}")
        for pat in PRIVATE_PATTERNS:
            n = len(pat.findall(code))
            if n:
                hits.append(f"{rel}: {pat.pattern} ×{n}")
    rows = [r.id for r in (m.registry.rows if m.registry else []) if m.id in r.modules]
    if not hits:
        return na("no private-internal access found")
    return "manual", hits + [f"rows for this module: {', '.join(rows) or 'none'}"]


@rule("C34", "fail", "lang/en.json nested with one root PENTARYN_<SHORT>")
def c34(m):
    p = m.dir / "lang" / "en.json"
    if not p.exists():
        return na("no lang file")
    data = json.loads(p.read_text(encoding="utf-8"))
    want = f"PENTARYN_{m.short.upper().replace('-', '_')}"
    keys = list(data)
    if keys != [want]:
        return bad([f"top-level keys {keys[:4]}{'…' if len(keys) > 4 else ''}; want [{want!r}]"])
    if not isinstance(data[want], dict):
        return bad(["root is not an object"])
    return ok()


@rule("C35", "fail", "no two-branch i18n wrapper; definite key coverage ≥ 90 %")
def c35(m):
    known = lang_keys(m)
    if not known:
        return na("no lang file")
    detail = []
    for rel in m.files:
        code = m.code(rel)
        for mm in re.finditer(r"=>[^;\n]*\?[^;\n]*game\.i18n\.format\([^;\n]*:[^;\n]*game\.i18n\.localize\(", code):
            detail.append(f"{rel}:{m.files[rel].line_of(mm.start())} two-branch wrapper")
    namespaces = {k.split(".", 1)[0] for k in known}
    used = set()
    for rel, src in m.files.items():
        used |= {r.key for r in jsscan.key_uses(src, namespaces, set(known)).definite}
    cov = len(used & set(known)) / len(known)
    if cov < 0.9:
        detail.append(f"definite coverage {cov:.0%} ({len(used & set(known))}/{len(known)})")
    return ok([f"coverage {cov:.0%}"]) if not detail else bad(detail)


@rule("C36", "warn+manual", "hard-coded UI English")
def c36(m):
    n = 0
    where = []
    ctx = re.compile(r"(textContent|innerText|title|label|hint|content|placeholder)\s*[:=]\s*$|notifications\.\w+\(\s*$")
    for rel, src in m.files.items():
        for s in src.strings:
            if not re.match(r"^[A-Z][a-z]+(?:[ ,'’-]+[A-Za-z]+){1,}", s.value):
                continue
            idx = src.code.find(f"\x01{s.idx}\x01")
            if idx > 0 and ctx.search(src.code[max(0, idx - 40):idx]):
                n += 1
                where.append(f"{rel}:{s.line}")
    return ok() if not n else ("warn", [f"{n} literal(s): {', '.join(where[:8])}{' …' if n > 8 else ''}"])


def css_selectors(text: str) -> list[str]:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    sels = []
    depth = 0
    buf = ""
    for ch in text:
        if ch == "{":
            head = buf.strip()
            buf = ""
            if head.startswith("@"):
                depth += 1
                continue
            sels.extend(s.strip() for s in head.split(",") if s.strip())
            depth += 1
        elif ch == "}":
            depth -= 1
            buf = ""
        elif ch == ";":
            buf = ""
        else:
            buf += ch
    return sels


def own_css(m):
    """The module's own stylesheets. `lib/*.css` are vendored kit files (D7): shared CSS with one
    canonical copy in foundry/lib, proven byte-identical by vendor.py (C14), so their selectors and
    `!important`s are the kit's, not the module's, and C37/C37w do not score them."""
    for css in sorted(m.dir.rglob("*.css")):
        rel = css.relative_to(m.dir).parts
        if "node_modules" in css.parts or (len(rel) == 2 and rel[0] == "lib"):
            continue
        yield css


@rule("C37", "fail", "every CSS selector under .pentaryn-<short> or .<cssPrefix> (lib/*.css kit files exempt)")
def c37(m):
    prefix = m.flags.get("cssPrefix")
    allowed = [f".pentaryn-{m.short}"] + ([f".{prefix}"] if prefix else [])
    detail = []
    for css in own_css(m):
        for sel in css_selectors(css.read_text(encoding="utf-8", errors="replace")):
            if sel.startswith(("from", "to")) or re.fullmatch(r"\d+%", sel) or sel.startswith(":root"):
                continue
            if not any(a in sel for a in allowed):
                detail.append(f"{css.relative_to(m.dir).as_posix()}: {sel[:60]}")
    return ok() if not detail else bad(detail)


@rule("C37w", "warn", "!important count")
def c37w(m):
    n = sum(re.sub(r"/\*.*?\*/", "", css.read_text(encoding="utf-8", errors="replace"), flags=re.S).count("!important")
            for css in own_css(m))
    return ok() if not n else ("warn", [f"{n} !important (removing existing ones is [declared])"])


@rule("C38", "fail", "cssPrefix unique across modules")
def c38(m):
    prefix = m.flags.get("cssPrefix")
    if not prefix:
        return na("no cssPrefix declared (C07)")
    # all_manifests is keyed by folder name; the module itself is the sibling in m.dir or with m.id
    clash = [man.get("id") or mid for mid, man in m.all_manifests.items()
             if man is not None and mid != m.dir.name and man.get("id") != m.id
             and ((man.get("flags") or {}).get("pentaryn") or {}).get("cssPrefix") == prefix]
    skipped = [f"{mid}: module.json unreadable — not compared" for mid, man in m.all_manifests.items()
               if man is None and mid != m.dir.name]
    return ok(skipped) if not clash else bad([f"{prefix} also declared by {', '.join(clash)}"] + skipped)


def _spec_for(m: Module):
    try:
        from scripts.foundry.ops import config as ops_cfg
    except Exception:  # noqa: BLE001 — the scorer must run where ops cannot import
        return None, False
    for spec in ops_cfg.MODULES.values():
        if spec.name == m.id:
            return spec, True
    return None, True


@rule("C39", "fail", "test/run.mjs exists; the ModuleSpec runs node-test")
def c39(m):
    detail = []
    if not (m.dir / "test/run.mjs").exists():
        detail.append("no test/run.mjs")
    if m.installed:
        spec, loaded = _spec_for(m)
        if loaded and spec is None:
            detail.append("no ModuleSpec in scripts/foundry/ops/config.py")
        elif spec is not None and "node-test" not in spec.check:
            detail.append(f"ModuleSpec gates {spec.check} — no node-test")
    elif not detail:
        return na("not installed: the ModuleSpec part applies once it is under foundry/module")
    return ok() if not detail else bad(detail)


@rule("C40", "fail", "the tier's required test files are present")
def c40(m):
    need = ["core.test.mjs", "glue.test.mjs"]
    if m.tier != "small":
        need += ["hooks.test.mjs", "api.test.mjs", "i18n.test.mjs"]      # use-doc §6: i18n for full, or any small module with settings (§2 small + opt-in kit)
    elif any(re.search(r"game\.settings\??\.register\(|defineSettings\(", m.code(r)) for r in m.files):
        need.append("i18n.test.mjs")
    miss = [f for f in need if not (m.dir / "test" / f).exists()]
    return ok() if not miss else bad([f"missing test/{', test/'.join(miss)}"])


@rule("C41", "fail", "a test pins VERSION === module.json version")
def c41(m):
    for rel in m.test_files:
        if rel.startswith("test/kit/"):
            continue
        text = (m.dir / rel).read_text(encoding="utf-8", errors="replace")
        if "VERSION" in text and ("module.json" in text or "manifestOf" in text):
            return ok()
    return bad(["no test compares VERSION with module.json"])


@rule("C42", "manual", "fixtures are synthetic")
def c42(m):
    fx = sorted(p.relative_to(m.dir).as_posix() for p in (m.dir / "test" / "fixtures").rglob("*")
                if p.is_file()) if (m.dir / "test" / "fixtures").is_dir() else []
    return ("manual", [f"review: {', '.join(fx[:8])}"]) if fx else na("no test/fixtures")


@rule("C43", "fail", "test/run.mjs is the fixed body; self-running suites are listed in LEGACY")
def c43(m):
    run = m.dir / "test/run.mjs"
    if not run.exists():
        return na("no test/run.mjs (C39)")
    text = run.read_text(encoding="utf-8")
    if '"--test"' not in text:
        return bad(["test/run.mjs is not the fixed node:test body (use-doc §6)"])
    legacy = re.search(r"LEGACY\s*=\s*\[([^\]]*)\]", text)
    listed = set(re.findall(r"[\"']([^\"']+)[\"']", legacy.group(1))) if legacy else set()
    detail = []
    for rel in m.test_files:
        if rel.endswith(".test.mjs") or rel.startswith(("test/kit/", "test/fixtures/")) or rel == "test/run.mjs":
            continue
        src = (m.dir / rel).read_text(encoding="utf-8", errors="replace")
        if re.search(r"process\.exit|process\.exitCode", src) and rel not in listed:
            detail.append(f"{rel} runs itself but is not in LEGACY")
    return ok() if not detail else bad(detail)


@rule("C44", "fail", "README sections in order; Pitfalls and Extending present; no fixture counts")
def c44(m):
    p = m.dir / "README.md"
    if not p.exists():
        return bad(["no README.md"])
    text = p.read_text(encoding="utf-8")
    heads = [h.strip() for h in re.findall(r"(?m)^## (.+)$", text)]
    detail = []
    pos = -1
    for want in README_SECTIONS:
        idx = next((i for i, h in enumerate(heads) if h.startswith(want)), None)
        if idx is None:
            detail.append(f"missing ## {want}")
        elif idx < pos:
            detail.append(f"## {want} out of order")
        else:
            pos = idx
    if "**Read this when:**" not in text:
        detail.append("no **Read this when:** line")
    if re.search(r"\b\d+\s+(fixtures|cases|checks|assertions)\b", text):
        detail.append("hard-coded fixture count")
    return ok() if not detail else bad(detail)


@rule("C45", "fail", "CHANGELOG.md exists")
def c45(m):
    return ok() if (m.dir / "CHANGELOG.md").exists() else bad(["no CHANGELOG.md"])


@rule("C46", "fail", "a use-doc or a route in context/foundry/README.md")
def c46(m):
    if not m.installed:
        return na("not installed: add the routing row when it moves to foundry/module")
    if (REPO_ROOT / "context/foundry" / f"{m.short}.md").exists():
        return ok()
    idx = REPO_ROOT / "context/foundry/README.md"
    text = idx.read_text(encoding="utf-8") if idx.exists() else ""
    if m.id in text or f"`-{m.short}`" in text:
        return ok()
    return bad([f"no context/foundry/{m.short}.md and no route in context/foundry/README.md"])


@rule("C47", "fail", "adjustments rows exist for every package the code names")
def c47(m):
    if m.registry_error:
        return bad([registry_failure(m.registry_error)])
    if m.registry is None:
        return na("no registry")
    detail = []
    for pkg in sorted(package_hits(m)):
        if not any(pkg in r.packages and m.id in r.modules for r in m.registry.rows):
            detail.append(f"no adjustments row for {pkg} with modules: [{m.id}]")
    return ok() if not detail else bad(detail)


def _published_literal_keys(m: Module) -> list[tuple[str, int, str]]:
    """Top-level keys of the object literals a legacy module publishes on game.pentaryn."""
    return [(rel, line, p) for rel, line, p in _published_literal_paths(m) if "." not in p]


# Mirrors foundry/lib/api.mjs reservedClash: a reserved name at ANY depth of a published path.
# Flips to False together with kit K2 (top-level only) if Joe takes decision D1 option A.
RESERVED_ANY_DEPTH = True


def _published_literal_paths(m: Module) -> list[tuple[str, int, str]]:
    """Dotted paths of every key in the object literal a legacy module publishes, descending into
    nested object-literal values (`attributes: { describe }` → `attributes.describe`)."""
    out: list[tuple[str, int, str]] = []

    def collect(code: str, src, rel: str, ob: int, prefix: str) -> None:
        cb = match_paren(code, ob)
        body = code[ob + 1:cb]
        d = 0
        for km in re.finditer(r"[{}\[\]()]|(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?=[:,}(]|$)", body):
            tok = km.group(0)
            if tok in "{[(":
                d += 1
            elif tok in "}])":
                d -= 1
            elif d == 0 and km.group(1):
                path = f"{prefix}.{km.group(1)}" if prefix else km.group(1)
                out.append((rel, src.line_of(ob + 1 + km.start()), path))
                vm = re.match(r"\s*:\s*\{", body[km.end():])
                if vm:
                    collect(code, src, rel, ob + 1 + km.end() + vm.end() - 1, path)

    for rel, src in m.files.items():
        code = src.code
        if "pentaryn" not in "".join(s.value for s in src.strings) and "game.pentaryn" not in code:
            continue
        for mm in re.finditer(r"(?:const|let)\s+api\s*=\s*\{|game\.pentaryn\.[\w$]+\s*=\s*\{", code):
            collect(code, src, rel, mm.end() - 1, "")
    return out


@rule("C48", "fail", "no reserved API name reused by a non-kit member (at any depth, as the kit)")
def c48(m):
    if any(re.search(r"(?<![\w$.])buildApi\(", m.code(r)) for r in m.files):
        return ok(["kit-built: buildApi enforces it at load"])
    detail = [f"{rel}:{line} `{key}`" for rel, line, key in _published_literal_keys(m) if key in RESERVED_API]
    if RESERVED_ANY_DEPTH:
        detail += [f"{rel}:{line} `{path}` (nested; the kit refuses it at any depth)"
                   for rel, line, path in _published_literal_paths(m)
                   if "." in path and path.split(".")[-1] in RESERVED_API]
    return ok() if not detail else bad(detail)


@rule("C49", "warn+manual", "world iteration inside hot-hook handlers")
def c49(m):
    found = []
    for rel, src in m.files.items():
        code = src.code
        for mm in re.finditer(r"(?:Hooks|reg)\.on\(\s*\x01(\d+)\x01\s*,\s*", code):
            name = src.strings[int(mm.group(1))].value
            if not is_hot_hook(name):
                continue
            after = code[mm.end():]
            body = ""
            fn = re.match(r"(?:async\s*)?(?:function\s*\w*\s*)?\([^)]*\)\s*(?:=>)?\s*\{|(?:async\s*)?\w+\s*=>\s*\{", after)
            if fn:
                s = mm.end() + fn.end() - 1
                body = code[s:match_paren(code, s) + 1]
            else:
                ident = re.match(r"([A-Za-z_$][\w$]*)", after)
                if ident:
                    dm = re.search(rf"function\s+{re.escape(ident.group(1))}\s*\([^)]*\)\s*\{{", code)
                    if dm:
                        body = code[dm.end() - 1:match_paren(code, dm.end() - 1) + 1]
            n = len(WORLD_ITER.findall(body))
            if n:
                hot = "// hot:" in m.raw.get(rel, "")
                found.append(f"{rel}:{src.line_of(mm.start())} {name} ×{n}{'' if hot else ' (no // hot: comment)'}")
    return ok() if not found else ("warn", found)


def ready_bodies(src) -> list[tuple[bool, int, int]]:
    """(is_async, open brace, close brace) of every `ready` handler body in one file: an inline
    `Hooks.once("ready", () => {…})`, or a named one — `Hooks.once("ready", onReady)` plus
    `function onReady() {…}` in the same file (the template's hot-patchable entry shape). The kit's
    registrar form `reg.once("ready", …)` counts the same."""
    code = src.code
    out = []
    for rm in re.finditer(r"(?:Hooks|reg)\.once\(\s*\x01(\d+)\x01\s*,\s*(async\s*)?\(\)\s*=>\s*\{", code):
        if src.strings[int(rm.group(1))].value == "ready":
            s = rm.end() - 1
            out.append((bool(rm.group(2)), s, match_paren(code, s)))
    for rm in re.finditer(r"(?:Hooks|reg)\.once\(\s*\x01(\d+)\x01\s*,\s*([A-Za-z_$][\w$]*)\s*\)", code):
        if src.strings[int(rm.group(1))].value != "ready":
            continue
        fm = re.search(rf"(async\s+)?function\s+{re.escape(rm.group(2))}\s*\([^)]*\)\s*\{{", code)
        if fm:
            s = fm.end() - 1
            out.append((bool(fm.group(1)), s, match_paren(code, s)))
    return out


def on_ready_bodies(src) -> list[tuple[bool, int, int]]:
    """`ready_bodies` plus the entry-ctx helper form `ctx.onReady(() => {…})` (dropbin: the helper
    runs `fn` at once when the world is ready, else registers it with `reg.once("ready", …)`)."""
    code = src.code
    out = list(ready_bodies(src))
    for rm in re.finditer(r"(?<![\w$])(?:[\w$]+\.)?onReady\(\s*(async\s*)?\(\)\s*=>\s*\{", code):
        s = rm.end() - 1
        out.append((bool(rm.group(1)), s, match_paren(code, s)))
    return out


def _enclosing_function(code: str, i: int) -> tuple[str, bool, int] | None:
    """(name, is_async, body open) of the innermost `function NAME(…) {…}` holding offset `i`."""
    best = None
    for fm in re.finditer(r"(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{", code):
        s = fm.end() - 1
        if s < i < match_paren(code, s) and (best is None or s > best[2]):
            best = (fm.group(2), bool(fm.group(1)), s)
    return best


# a role gate before the publish in the synchronous ready body: `if (!isAnyGM()) return;`,
# `if (!game.user.isGM) return`, an active-GM check — then when: "ready:gm" (or "ready:<role>") is allowed
ROLE_GATE = re.compile(r"(?<![\w$])(?:isAnyGM|isActiveGM|isActiveGMOrLoneGM)\(|\.isGM\b|activeGM\b")


@rule("C50", "fail", "publish timing: when ≠ 'ready' iff not in the synchronous ready body")
def c50(m):
    calls = []
    for rel, src in m.files.items():
        code = src.code
        for mm in re.finditer(r"(?<![\w$.])publishNamespace\(", code):
            end = match_paren(code, mm.end() - 1)
            args = code[mm.end():end]
            when = None
            wm = re.search(r"when\s*:\s*\x01(\d+)\x01", args)
            if wm:
                when = src.strings[int(wm.group(1))].value
            sync = False
            gated = False
            inside = False
            for is_async, s, e in ready_bodies(src):
                if s < mm.start() < e:
                    inside = True
                    sync = not is_async and "await" not in code[s:mm.start()]
                    gated = ROLE_GATE.search(code[s:mm.start()]) is not None
            if not inside:
                # A named publisher (`function publish() {… publishNamespace(…) …}`) called, before
                # any await, from a synchronous ready body in any module file (dropbin: the ledger's
                # `ctx.onReady(() => { …; ctx.publish(); })`) publishes in the ready tick too.
                fn = _enclosing_function(code, mm.start())
                if fn and not fn[1] and "await" not in code[fn[2]:mm.start()]:
                    call = re.compile(rf"(?<![\w$])(?:[\w$]+\.)?{re.escape(fn[0])}\(")
                    pre_gate = ROLE_GATE.search(code[fn[2]:mm.start()]) is not None
                    for other in m.files.values():
                        for is_async, s, e in on_ready_bodies(other):
                            cm = call.search(other.code, s, e)
                            if cm and not is_async and "await" not in other.code[s:cm.start()]:
                                sync = True
                                gated = pre_gate or ROLE_GATE.search(other.code[s:cm.start()]) is not None
            calls.append((rel, src.line_of(mm.start()), when, sync, gated))
    if not calls:
        return na("publishNamespace not used yet")
    detail = []
    for rel, line, when, sync, gated in calls:
        if sync and when not in (None, "ready") and not (gated and str(when).startswith("ready:")):
            detail.append(f"{rel}:{line} publishes in the sync ready body with when={when!r}"
                          + ("" if gated else " (only a role-gated publish may say ready:<role>)"))
        if not sync and when in (None, "ready"):
            detail.append(f"{rel}:{line} publishes late/role-gated without recording when")
    return ok() if not detail else bad(detail)


@rule("C51", "fail", "every SETTINGS/KEYBINDINGS row has literal name and hint keys present in lang")
def c51(m):
    known = lang_keys(m) or {}
    rows_found = False
    detail = []
    for rel, src in m.files.items():
        code = src.code
        for mm in re.finditer(r"export\s+const\s+(SETTINGS|KEYBINDINGS)\s*=\s*(?:Object\.freeze\(\s*)?\[", code):
            rows_found = True
            start = mm.end() - 1
            body_end = match_paren(code, start)
            i = start + 1
            while True:
                ob = code.find("{", i, body_end)
                if ob < 0:
                    break
                cb = match_paren(code, ob)
                obj = code[ob:cb + 1]
                i = cb + 1
                if re.search(r"(?<![\w$])store\s*:\s*true", obj):
                    continue
                keym = re.search(r"(?<![\w$])key\s*:\s*\x01(\d+)\x01", obj)
                key = src.strings[int(keym.group(1))].value if keym else "?"
                for fld in ("name", "hint"):
                    fm = re.search(rf"(?<![\w$]){fld}\s*:\s*\x01(\d+)\x01", obj)
                    if not fm:
                        detail.append(f"{rel}: {mm.group(1)} {key}: no literal {fld}")
                    elif src.strings[int(fm.group(1))].value not in known:
                        detail.append(f"{rel}: {key}.{fld} {src.strings[int(fm.group(1))].value} not in lang")
    if not rows_found:
        return na("no SETTINGS table (C22)")
    return ok() if not detail else bad(detail)


@rule("C52", "fail", "every HOOKS row with legacyName has until")
def c52(m):
    detail = []
    for rel, src in m.files.items():
        code = src.code
        for mm in re.finditer(r"legacyName\s*:", code):
            ob = code.rfind("{", 0, mm.start())
            cb = match_paren(code, ob) if ob >= 0 else mm.end()
            if not re.search(r"(?<![\w$])until\s*:", code[ob:cb]):
                detail.append(f"{rel}:{src.line_of(mm.start())} legacyName without until")
    return ok() if not detail else bad(detail)



# ── async and concurrency (playbook §5.9) ────────────────────────────────────

HOOK_REG = re.compile(r"(?<![\w$])(?:Hooks|reg|ctx\.reg)\.(?:on|once)\(\s*\x01(\d+)\x01\s*,\s*")
VETOABLE = re.compile(r"^(?:[\w-]+\.)?pre[A-Z]")
PRE_DOC = re.compile(r"^pre(?:Create|Update|Delete)[A-Z]\w*$")
DOC_EVENT = re.compile(r"^(?:create|update|delete)[A-Z]\w*$")
# one USER, not one tab: the active GM, a runner pick, or the initiator (`userId !== game.user.id`,
# or the positive `userId === game.user.id`, either side, `game.user?.id` too — the hook's userId is
# the user who made the change, so every tab of that user passes, e.g. the MCP bridge tab and a GM
# browser tab). Like isActiveGM, it needs a claim where two tabs on one account matter; C61 accepts
# all of these and leaves the two-tab question to the manual review (§5.9.4)
ACTIVE_GATE = re.compile(r"(?<![\w$])(?:isActiveGM|isActiveGMOrLoneGM|pickRunner)\(|activeGM\b"
                         r"|(?<![\w$])\w*[uU]serId\s*[!=]==?\s*game\.(?:userId|user\??\.id)\b"
                         r"|game\.(?:userId|user\??\.id)\s*[!=]==?\s*\w*[uU]serId\b")
CLAIM = re.compile(r"(?<![\w$])(?:claimDocument|claimMessage)\(")
DEFER = re.compile(r"(?<![\w$.])(?:perFrame|coalesce)\(|(?<![\w$])debounce\(")
# a document or setting write in a listener body (a Map's `.delete(key)` is not one: a document's
# delete takes nothing or an options object)
DOC_WRITE = re.compile(r"\.(?:update|create)\(|\.delete\(\s*(?:\)|\{)|\.(?:set|unset)Flag\("
                       r"|(?:update|create|delete)(?:Embedded)?Documents\(|settings\.set\(|\.write\(")
# per-document writes only: the *EmbeddedDocuments calls are the batch §5.9 prescribes ("one
# parent.updateEmbeddedDocuments per group of writes"), so a per-parent loop of them passes
LOOP_AWAIT_METHODS = {"update", "create", "delete", "setFlag", "unsetFlag"}
QUERY_RECEIVERS = {"gm", "user", "activeGM", "recipient", "target", "owner"}


@dataclass
class Listener:
    rel: str
    line: int
    name: str
    is_async: bool
    body: str | None         # the handler's text (a `{…}` block or an arrow's expression)
    ident: str | None        # a named handler that could not be resolved in the same file


def _expr_end(code: str, i: int) -> int:
    """End of an expression starting at `i`: the first `,` `;` or unmatched closer at depth 0."""
    depth = 0
    while i < len(code):
        c = code[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            if depth == 0:
                return i
            depth -= 1
        elif c in ",;" and depth == 0:
            return i
        i += 1
    return i


def _call_args(code: str, open_paren: int) -> list[str]:
    """The top-level arguments of the call whose `(` is at `open_paren`, split on depth-0 `,`
    only — never `;`, which the lexer injects after every `${…}` of a template literal."""
    close, args, depth, start = match_paren(code, open_paren), [], 0, open_paren + 1
    for i in range(open_paren + 1, close):
        c = code[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == "," and depth == 0:
            args.append(code[start:i])
            start = i + 1
    if code[start:close].strip():
        args.append(code[start:close])
    return args


def _has_timeout(code: str, open_paren: int, opts_at: int) -> bool:
    """The call at `open_paren` passes a timeout. When its last argument is an object literal,
    that argument must be the options one (index `opts_at`) and name `timeout`; otherwise any
    `timeout` in the call counts (a variable or spread may carry it)."""
    args = _call_args(code, open_paren)
    last = args[-1].strip() if args else ""
    if last.startswith("{") and match_paren(last, 0) == len(last) - 1:
        return len(args) > opts_at and bool(re.search(r"\btimeout\b", last))
    return bool(re.search(r"\btimeout\b", code[open_paren:match_paren(code, open_paren) + 1]))


def _arrow_body(code: str, q: int) -> str:
    if q < len(code) and code[q] == "{":
        return code[q:match_paren(code, q) + 1]
    return code[q:_expr_end(code, q)]


# The kit's own listener wrappers (lib/hooks.mjs): handler_at reads the function they wrap.
GUARD_WRAP = re.compile(r"(?:ctx\.)?reg\.guard(?:SwallowAsync)?\(\s*\x01\d+\x01\s*,\s*")


def handler_at(code: str, pos: int, *, _depth: int = 0) -> tuple[bool, str | None, str | None]:
    """(is_async, body, unresolved identifier) of the function expression or name at `pos`,
    seen through reg.guard / reg.guardSwallowAsync."""
    if _depth == 0 and (g := GUARD_WRAP.match(code, pos)):
        pos = g.end()
    am = re.match(r"async\b\s*", code[pos:])
    is_async = bool(am)
    p = pos + (am.end() if am else 0)
    fm = re.match(r"function\b\s*\*?\s*[\w$]*\s*", code[p:])
    if fm and code[p + fm.end():p + fm.end() + 1] == "(":
        close = match_paren(code, p + fm.end())
        q = close + 1 + len(re.match(r"\s*", code[close + 1:]).group(0))
        if code[q:q + 1] == "{":
            return is_async, code[q:match_paren(code, q) + 1], None
        return is_async, None, None
    if code[p:p + 1] == "(":
        close = match_paren(code, p)
        ar = re.match(r"\s*=>\s*", code[close + 1:])
        if ar:
            return is_async, _arrow_body(code, close + 1 + ar.end()), None
    im = re.match(r"[A-Za-z_$][\w$]*\s*=>\s*", code[p:])
    if im:
        return is_async, _arrow_body(code, p + im.end()), None
    im = re.match(r"([A-Za-z_$][\w$]*)\s*[,)]", code[p:])
    if im and not is_async and _depth == 0:
        name = re.escape(im.group(1))
        dm = re.search(rf"(?<![\w$.])(async\s+)?function\s*\*?\s*{name}\s*\(", code)
        if dm:
            close = match_paren(code, dm.end() - 1)
            q = close + 1 + len(re.match(r"\s*", code[close + 1:]).group(0))
            body = code[q:match_paren(code, q) + 1] if code[q:q + 1] == "{" else None
            return bool(dm.group(1)), body, None
        dm = re.search(rf"(?<![\w$.])(?:const|let|var)\s+{name}\s*=\s*", code)
        if dm:
            return handler_at(code, dm.end(), _depth=1)
        return False, None, im.group(1)
    return is_async, None, None


def listeners(m: Module) -> list[Listener]:
    out = []
    for rel, src in m.files.items():
        for mm in HOOK_REG.finditer(src.code):
            name = src.strings[int(mm.group(1))].value
            is_async, body, ident = handler_at(src.code, mm.end())
            out.append(Listener(rel, src.line_of(mm.start()), name, is_async, body, ident))
    return out


def _with_called(code: str, body: str, more: tuple[str, ...] = ()) -> str:
    """`body` plus the bodies of functions it calls by name (one level), looked up in `code` (the
    listener's file) and then in `more` (the module files it imports)."""
    extra = []
    for name in set(re.findall(r"(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(", body)):
        for src in (code, *more):
            dm = re.search(rf"(?<![\w$.])(?:async\s+)?function\s*{re.escape(name)}\s*\(", src)
            if not dm:
                continue
            close = match_paren(src, dm.end() - 1)
            q = close + 1 + len(re.match(r"\s*", src[close + 1:]).group(0))
            if src[q:q + 1] == "{":
                extra.append(src[q:match_paren(src, q) + 1])
            break
    return "\n".join([body, *extra])


def _imported_code(m: Module, rel: str) -> tuple[str, ...]:
    """The code of the module's own files that `rel` imports (lib/ and outside files excluded)."""
    seen = []
    for target, _ in m.imports(rel):
        if target in m.files and target != rel and target not in seen:
            seen.append(target)
    return tuple(m.code(t) for t in seen)


@rule("C53", "fail", "no async listener on a vetoable hook (pre*, <pkg>.pre*): it can never veto")
def c53(m):
    bad_, unresolved = [], []
    for ls in listeners(m):
        if not VETOABLE.match(ls.name):
            continue
        if ls.is_async:
            bad_.append(f"{ls.rel}:{ls.line} {ls.name}")
        elif ls.ident:
            unresolved.append(f"{ls.rel}:{ls.line} {ls.name} → {ls.ident} (not in this file)")
    return bad(bad_) if bad_ else ok(unresolved)


@rule("C54", "warn+manual", "pre<Doc> listener gated on the active GM (pre* runs on the initiator only)")
def c54(m):
    found = [f"{ls.rel}:{ls.line} {ls.name}" for ls in listeners(m)
             if PRE_DOC.match(ls.name) and ls.body
             and re.search(r"activeGM\b|(?<![\w$])isActiveGM(?:OrLoneGM)?\(", ls.body)]
    return ok() if not found else ("warn", found)


@rule("C55", "fail", "every User#query / User.queryMany passes a timeout in its options argument (queryGM exempt)")
def c55(m):
    detail, unknown = [], []
    for rel, src in m.files.items():
        code = src.code
        for mm in re.finditer(r"((?<![\w$])(?:[A-Za-z_$][\w$]*\??\.)*[A-Za-z_$][\w$]*|\))\??\.query\(", code):
            recv = mm.group(1)
            last = recv.rstrip("?").split(".")[-1]
            user_like = (last in QUERY_RECEIVERS or "activeGM" in recv or "game.user" in recv
                         or (recv == ")" and "users" in code[max(0, mm.start() - 80):mm.start()]))
            where = f"{rel}:{src.line_of(mm.start())}"
            if not user_like:
                if last not in ("db", "sql", "index", "pool", "client"):
                    unknown.append(f"{where} {recv}.query( — is the receiver a User?")
                continue
            if not _has_timeout(code, mm.end() - 1, 2):
                detail.append(f"{where} {recv}.query( without timeout")
        for mm in re.finditer(r"(?<![\w$])(?:User\.)?queryMany\(", code):
            if not _has_timeout(code, mm.end() - 1, 3):
                detail.append(f"{rel}:{src.line_of(mm.start())} queryMany( without timeout")
    if detail:
        return bad(detail + unknown)
    return ("manual", unknown) if unknown else ok()


@rule("C56", "fail", "CONFIG.queries is assigned only by the kit (manifest query/relay rows)")
def c56(m):
    detail = []
    for rel, src in m.files.items():
        code = src.code
        hits = []
        for mm in re.finditer(r"CONFIG\.queries\s*\[", code):
            close = match_paren(code, mm.end() - 1)
            if re.match(r"\s*(?:\?\?|\|\||&&)?=(?!=)", code[close + 1:]):
                hits.append(mm.start())
        for mm in re.finditer(r"CONFIG\.queries\s*\.\s*[A-Za-z_$][\w$]*\s*(?:\?\?|\|\||&&)?=(?!=)"
                              r"|CONFIG\.queries\s*(?:\?\?|\|\||&&)?=(?!=)"
                              r"|Object\.assign\(\s*CONFIG\.queries\b", code):
            hits.append(mm.start())
        detail += [f"{rel}:{src.line_of(h)} hand-written CONFIG.queries assignment" for h in sorted(set(hits))]
    return ok() if not detail else bad(detail)


_NOT_A_FUNCTION = {"if", "for", "while", "switch", "with", "return", "typeof", "await", "new", "in", "of"}


def _binds_locally(code: str, name: str, pos: int) -> bool:
    """`name` is declared in this file (const/let/var, destructuring, function, class) or is a
    parameter of a function or arrow whose body holds `pos` — so an import of it is not what `pos`
    sees. Over-approximates: a name that might be shadowed counts as shadowed."""
    n = re.escape(name)
    word = rf"(?<![\w$.]){n}(?![\w$])"
    if re.search(rf"(?<![\w$.])(?:const|let|var)\s*(?:\s{n}(?![\w$])|[{{\[][^=;]*{word})"
                 rf"|(?<![\w$.])(?:function\s*\*?|class)\s*{n}(?![\w$])", code):
        return True
    for am in re.finditer(rf"{word}\s*=>\s*", code):           # `name => …`
        if am.end() <= pos < am.end() + len(_arrow_body(code, am.end())):
            return True
    for pm in re.finditer(r"\(", code):
        close = match_paren(code, pm.start())
        if not re.search(word, code[pm.start():close]):
            continue
        before = re.search(r"([A-Za-z_$][\w$]*)?\s*$", code[max(0, pm.start() - 64):pm.start()]).group(1)
        after = re.match(r"\s*(=>\s*|\{)", code[close + 1:])
        if not after or before in _NOT_A_FUNCTION:
            continue
        q = close + 1 + after.end() - (1 if after.group(1) == "{" else 0)
        if q <= pos < q + len(_arrow_body(code, q)):
            return True
    return False


def _imported_channel(m: Module, rel: str, name: str) -> jsscan.Str | None:
    """The module-scope `const <exported> = "module.…"` of the module file that `rel` statically
    imports `name` from (`{ exported }` or `{ exported as name }`); None when there is none."""
    for target, imp in m.imports(rel):
        braces = re.search(r"\{([^}]*)\}", imp.raw)
        if imp.dynamic or target not in m.files or target == rel or not braces:
            continue
        for part in braces.group(1).split(","):
            pm = re.fullmatch(r"\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*", part)
            if not pm or (pm.group(2) or pm.group(1)) != name:
                continue
            tsrc = m.files[target]
            for dm in re.finditer(rf"(?<![\w$.])const\s+{re.escape(pm.group(1))}\s*=\s*", tsrc.code):
                lit = lit_after(tsrc, dm.end())
                if depth_at(tsrc.code, dm.start()) == 0 and lit and lit.value.startswith("module."):
                    return lit
            return None
    return None


@rule("C57", "fail", "a game.socket module.* channel is exactly module.<module.json id>")
def c57(m):
    want = f"module.{m.id}"
    used, detail = False, []
    for rel, src in m.files.items():
        code = src.code
        consts = {}
        for mm in re.finditer(r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*", code):
            lit = lit_after(src, mm.end())
            if lit and lit.value.startswith("module."):
                consts[mm.group(1)] = lit
        for mm in re.finditer(r"game\.socket\??\.(?:emit|on|off)\(\s*", code):
            lit = lit_after(src, mm.end())
            if lit is None:
                ident = re.match(r"[A-Za-z_$][\w$]*", code[mm.end():])
                lit = consts.get(ident.group(0)) if ident else None
                if lit is None and ident and not _binds_locally(code, ident.group(0), mm.start()):
                    lit = _imported_channel(m, rel, ident.group(0))
            if lit is None or not lit.value.startswith("module."):
                continue                     # a core event (§5.6, C47) or unresolved
            used = True
            ok_ = lit.value == want if lit.plain else lit.value in ("module.${}", want)
            if not ok_:
                detail.append(f"{rel}:{src.line_of(mm.start())} channel {lit.value!r} ≠ {want!r}")
    if not used:
        return na("no module socket channel")
    return ok() if not detail else bad(detail)


_MEMO_STORE = re.compile(r"(?<![\w$.])[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\?\?=\s*$")


@rule("C58", "fail", "one serialStore per key across the module, at module scope or memoised (`x ??= serialStore(`)")
def c58(m):
    seen: dict[str, str] = {}
    tuples: dict[tuple, str] = {}
    detail, manual = [], []
    for rel, src in m.files.items():
        code = src.code
        for mm in re.finditer(r"(?<![\w$.])serialStore\(\s*(?:[\w$.]+|\x01\d+\x01)\s*,\s*", code):
            where = f"{rel}:{src.line_of(mm.start())}"
            if depth_at(code, mm.start()) > 0 and not _MEMO_STORE.search(code[max(0, mm.start() - 200):mm.start()]):
                detail.append(f"{where} serialStore not at module scope (use `x ??= serialStore(` or hoist)")
            lit = lit_after(src, mm.end())
            if lit is not None and lit.plain:
                keys = (lit.value,)
            elif code[mm.end():mm.end() + 1] == "[":
                inner = code[mm.end():match_paren(code, mm.end()) + 1]
                strs = src.marks_in(inner)
                if not strs or any(not s.plain for s in strs) or re.sub(r"[\s,\[\]]|\x01\d+\x01", "", inner):
                    manual.append(f"{where} non-literal key")
                    continue
                keys = tuple(sorted(s.value for s in strs))
            else:
                manual.append(f"{where} non-literal key")
                continue
            if keys in tuples:
                detail.append(f"{where} serialStore {list(keys)} again (first {tuples[keys]})")
                continue
            tuples[keys] = where
            for k in keys:
                if k in seen:
                    detail.append(f"{where} key {k!r} already in a serialStore at {seen[k]}")
                seen[k] = where
    return bad(detail + manual) if detail else ok(manual)


def _awaited_call(body: str, i: int) -> str | None:
    """The last method called in the `await` chain starting at `i` (`a.b(x).update(…)` → update)."""
    j, last = i, None
    while j < len(body):
        im = re.match(r"\s*\??\.?\s*([A-Za-z_$][\w$]*)", body[j:])
        if not im:
            break
        name = im.group(1)
        j += im.end()
        nxt = re.match(r"\s*(\?\.)?([(\[])", body[j:])
        while nxt:
            k = j + nxt.end() - 1
            if nxt.group(2) == "(":
                last = name
            j = match_paren(body, k) + 1
            nxt = re.match(r"\s*(\?\.)?([(\[])", body[j:])
        if not re.match(r"\s*\??\.", body[j:]):
            break
    return last


def loop_bodies(code: str) -> list[tuple[int, str]]:
    out = []
    for mm in re.finditer(r"(?<![\w$.])(?:for(?:\s+await)?|while)\s*\(", code):
        close = match_paren(code, mm.end() - 1)
        q = close + 1 + len(re.match(r"\s*", code[close + 1:]).group(0))
        if code[q:q + 1] == "{":
            out.append((mm.start(), code[q:match_paren(code, q) + 1]))
        else:
            out.append((mm.start(), code[q:_expr_end(code, q) + 1]))
    for mm in re.finditer(r"(?<![\w$.])do\s*(?=\{)", code):                   # do { … } while (…)
        out.append((mm.start(), code[mm.end():match_paren(code, mm.end()) + 1]))
    for mm in re.finditer(r"\.(?:forEach|map)\(\s*(?=async\b)", code):
        _, body, _ = handler_at(code, mm.end())
        if body:
            out.append((mm.start(), body))
    return out


def _awaits_doc_write(body: str) -> bool:
    return any(_awaited_call(body, am.end()) in LOOP_AWAIT_METHODS
               for am in re.finditer(r"(?<![\w$])await\s+", body))


def _writing_helpers(code: str) -> set[str]:
    """Names of this file's functions (`function f(`, `const f = async (…) =>`) whose body awaits a
    LOOP_AWAIT_METHODS call — C59 follows an awaited call one level into these (ac-5)."""
    out = set()
    decl = (r"(?<![\w$.])(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?=\()"
            r"|(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*")
    for dm in re.finditer(decl, code):
        name = dm.group(1) or dm.group(2)
        _, body, _ = handler_at(code, dm.start() if dm.group(1) else dm.end(), _depth=1)
        if body and _awaits_doc_write(body):
            out.add(name)
    return out


@rule("C59", "warn+manual", "no per-document await inside a loop (batch with updateDocuments/modifyBatch)")
def c59(m):
    found = []
    for rel, src in m.files.items():
        helpers = None
        for pos, body in loop_bodies(src.code):
            if _awaits_doc_write(body):
                found.append(f"{rel}:{src.line_of(pos)} — batch with updateDocuments/modifyBatch")
                continue
            # one level of indirection: `await dropFlags(a, keys)` where dropFlags is a same-file
            # function that awaits the write itself
            if helpers is None:
                helpers = _writing_helpers(src.code)
            for cm in re.finditer(r"(?<![\w$])await\s+([A-Za-z_$][\w$]*)\s*\(", body):
                if cm.group(1) in helpers:
                    found.append(f"{rel}:{src.line_of(pos)} — batch with updateDocuments/modifyBatch "
                                 f"(via {cm.group(1)}())")
                    break
    found = sorted(set(found), key=found.index)
    return ok() if not found else ("warn", found)


def _async_called(code: str, body: str, more: tuple[str, ...] = ()) -> str | None:
    """The first function `body` calls by bare name (`paint(`, `void paint(`) that is declared
    `async function paint` in `code` (the listener's file) or in `more` (the files it imports)."""
    for name in dict.fromkeys(re.findall(r"(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(", body)):
        decl = re.compile(rf"(?<![\w$.])async\s+function\s*{re.escape(name)}\s*\(")
        if any(decl.search(src) for src in (code, *more)):
            return name
    return None


@rule("C60", "warn", "no async listener, await or async-function call in a hot-hook handler (defer via perFrame/debounce/coalesce)")
def c60(m):
    found = []
    for ls in listeners(m):
        if not is_hot_hook(ls.name):
            continue
        body = ls.body or ""
        if DEFER.search(body):
            continue
        if ls.is_async or re.search(r"(?<![\w$])await\b", body):
            found.append(f"{ls.rel}:{ls.line} {ls.name}")
        elif name := _async_called(m.code(ls.rel), body, _imported_code(m, ls.rel)):
            # a sync handler that fires `void paint(t)` still starts one async job per frame
            found.append(f"{ls.rel}:{ls.line} {ls.name} — starts async {name}() per call")
    return ok() if not found else ("warn", found)


@rule("C61", "warn+manual", "a writing create*/update*/delete* listener runs on one client (active-GM gate or claim)")
def c61(m):
    found = []
    for ls in listeners(m):
        if not DOC_EVENT.match(ls.name) or not ls.body:
            continue
        # the write and the gate are both looked for in the body plus the functions it calls (same
        # file, then the module files it imports), so `void react(actor)` with the write in react()
        # is checked like an inline write, and an imported `isRunner()` wrapping pickRunner is a gate
        scope = _with_called(m.code(ls.rel), ls.body, _imported_code(m, ls.rel))
        if not DOC_WRITE.search(scope):
            continue
        if ACTIVE_GATE.search(scope) or CLAIM.search(scope):
            continue
        why = "any-GM gate only (runs in every GM tab)" if ROLE_GATE.search(scope) else "no gate"
        found.append(f"{ls.rel}:{ls.line} {ls.name} — {why}")
    return ok() if not found else ("warn", found)

# C62 mirrors the bridge's needsDoc (foundry-vtt-mcp packages/mcp-server/src/fork/tools/
# pentaryn-call.ts): a param with one of these kinds, or named `ref`, that the kit does not resolve
# (only a FIRST `ref` without resolve:false is) is refused over pentaryn-read/-write unless its
# `type` names a string form. Kit 1.1.0's `resolve: "self"` marker (W2-B4) passes anywhere: the
# function resolves a uuid/id/exact name itself. The bridge honours it on a first `ref` today (its
# test is `resolve !== false`); a non-first param carrying it is a recorded fork follow-up. Scope: a Document `kind` or a `ref` (a bare `type: "Actor"` with no
# kind is a live-Document param by design and is left alone).
DOC_KINDS = ("actor", "token", "item", "scene", "user", "journal", "message", "macro", "region",
             "combat", "table", "folder", "playlist")
STRING_FORMS = ("uuid", "id", "name", "string")
EVAL_JS_ONLY = re.compile(r"eval-js[ -]only", re.I)


@rule("C62", "fail", "a Document param the kit does not resolve names its string forms in `type` "
                     "(uuid/id/name), carries resolve:\"self\", or says eval-js only")
def c62(m):
    path = m.dir / "test/golden/describe.json"
    if not path.exists():
        return na("no test/golden/describe.json")
    methods = json.loads(path.read_text(encoding="utf-8")).get("methods") or []
    found = []
    for row in methods:
        if EVAL_JS_ONLY.search(str(row.get("doc") or "")):
            continue
        for i, p in enumerate(row.get("params") or []):
            if not isinstance(p, dict):
                continue
            is_ref = p.get("name") == "ref"
            if is_ref and i == 0 and p.get("resolve") is not False:
                continue                                     # the kit resolves it per call
            if not (is_ref or p.get("kind") in DOC_KINDS):
                continue
            if p.get("resolve") == "self":                   # kit 1.1.0 (W2-B4): the function resolves strings
                continue
            type_text = p.get("type") if isinstance(p.get("type"), str) else ""
            if any(w in STRING_FORMS for w in re.split(r"[^a-z0-9_]+", type_text.lower())):
                continue
            if EVAL_JS_ONLY.search(str(p.get("doc") or "")):
                continue
            why = ("a non-first ref" if is_ref and i else "resolve:false" if p.get("resolve") is False
                else "a Document kind the kit does not resolve")
            found.append(f"{row.get('path')}({p.get('name')}) kind {p.get('kind') or 'ref'}, {why}, "
                         f"type {type_text or '(none)'!s} — add uuid|id|exact name, or say eval-js only")
    return ok() if not found else bad(found)


# ── scoring ──────────────────────────────────────────────────────────────────

def score(m: Module) -> dict:
    results = []
    for rid, cls, full_only, title in RULES:
        if full_only and m.tier == "small":
            status, detail = "n/a", ["small tier"]
        else:
            try:
                status, detail = _FUNCS[rid](m)
            except Exception as exc:  # noqa: BLE001 — one broken rule must not sink the report
                # a crashed fail-class rule FAILS (it counts in the score and in `failing`); a
                # crashed warn/manual rule goes to the manual list
                status, detail = ("fail" if cls == "fail" else "manual", [f"rule crashed: {exc!r}"])
        results.append(Result(rid, cls, status, detail, title))
    fails = [r for r in results if r.cls == "fail" and r.status in ("pass", "fail")]
    passed = sum(r.status == "pass" for r in fails)
    total = len(fails)
    return {
        "module": m.id, "tier": m.tier, "score": round(100 * passed / total, 1) if total else 100.0,
        "passed": passed, "failClassRules": total,
        "failing": [r.id for r in results if r.status == "fail"],
        "warnings": [r.id for r in results if r.status == "warn"],
        # warn+manual rules (C36, C49): a hit is a warning AND an item on the manual review list
        "manual": [r.id for r in results if r.status == "manual"
                   or (r.status == "warn" and r.cls == "warn+manual")],
        "wait": WAIT.get(m.id),
        **verdict(m.id, results),
        "results": [r.__dict__ for r in results],
    }


def _unmatched(row: dict, detail: list[str]) -> list[str]:
    """The failing details a row's `match` patterns (regexes, `re.search`) do not cover. A row
    accepts the findings it was decided for, not every future finding of the same rule: a new
    unprefixed selector in a module with a C37 row is blocking, like in any other module."""
    pats = row.get("match")
    if not pats:
        return []
    return [d for d in detail if not any(re.search(p, d) for p in pats)]


def verdict(module_id: str, results) -> dict:
    """The strict gate over one module's results (Stage 5 step 2): `blocking` = failing rules with no
    exceptions.json row, or with a finding the row's `match` patterns do not cover (`unmatched`:
    rule → those findings); `accepted` = failing rules a row accepts (rule → reason); `stale` = rows
    whose rule no longer fails. The gate passes iff `blocking` and `stale` are both empty."""
    rows = EXCEPTIONS.get(module_id, {})
    failing = [r for r in results if r.status == "fail"]
    unmatched = {r.id: u for r in failing if r.id in rows and (u := _unmatched(rows[r.id], r.detail))}
    return {
        "blocking": [r.id for r in failing if r.id not in rows or r.id in unmatched],
        "accepted": {r.id: rows[r.id]["reason"] for r in failing if r.id in rows and r.id not in unmatched},
        "unmatched": unmatched,
        "stale": sorted(rid for rid in rows if rid not in {r.id for r in failing}),
    }


def gate_ok(report: dict) -> bool:
    """True when the strict gate passes this report (no blocking rule, no stale exception)."""
    return not report["blocking"] and not report["stale"]


def load_registry(reg_path: Path) -> tuple[adj.Registry | None, str | None]:
    """(registry, None), or (None, why) when it is broken or missing: C47 and C32 FAIL with that text."""
    try:
        return adj.load(reg_path), None
    except adj.RegistryError as exc:
        return None, str(exc)


def load_manifests(root: Path) -> dict[str, dict | None]:
    """Every sibling module.json under root, by folder name (C38's cssPrefix-clash check reads these).
    An unreadable one maps to None: C38 names it rather than one bad sibling crashing every score."""
    out: dict[str, dict | None] = {}
    for p in root.iterdir():
        if (p / "module.json").exists():
            try:
                out[p.name] = read_manifest(p)
            except ManifestError:
                out[p.name] = None
    return out


def score_dir(module_dir: Path, *, root: Path | None = None, registry_path: Path | None = None,
              installed: bool | None = None,
              registry: tuple[adj.Registry | None, str | None] | None = None,
              manifests: dict[str, dict] | None = None) -> dict:
    """Score one module directory (the entry point new_module.py and the tests use). A caller scoring
    many modules passes `registry` (load_registry's pair) and `manifests` (load_manifests of root),
    loaded once; omitted, each is loaded here."""
    module_dir = module_dir.resolve()
    root = (root or module_dir.parent).resolve()
    reg_path = registry_path or adj.REGISTRY_PATH
    registry, registry_error = registry if registry is not None else load_registry(reg_path)
    if installed is None:
        installed = root == MODULE_ROOT.resolve()
    if manifests is None:
        manifests = load_manifests(root)
    reg_root = reg_path.parent.parent if reg_path == adj.REGISTRY_PATH else reg_path.parent
    m = load_module(module_dir, installed=installed, registry=registry, registry_root=reg_root,
                    all_manifests=manifests, registry_error=registry_error)
    return score(m)


def to_markdown(reports: list[dict], *, title: str) -> str:
    lines = [f"# {title}", "", "| Module | Tier | Score | Failing (fail-class) | Warnings | Manual | WAIT |",
             "|---|---|---|---|---|---|---|"]
    for r in reports:
        wait = r.get("wait")
        lines.append(f"| `{r['module']}` | {r['tier']} | {r['score']} % ({r['passed']}/{r['failClassRules']}) | "
                     f"{', '.join(r['failing']) or '—'} | {', '.join(r['warnings']) or '—'} | {', '.join(r['manual']) or '—'} | "
                     f"{'**WAIT** — ' + wait.replace('|', '/') if wait else '—'} |")
    waiting = [r["module"] for r in reports if r.get("wait")]
    if waiting:
        lines += ["", f"**WAIT — do not edit yet** (scripts/foundry/blueprint/wait.json): {', '.join(waiting)}"]
    gated = [r for r in reports if r.get("accepted") or r.get("stale") or r.get("blocking")]
    if gated:
        lines += ["", "**Strict gate** (exceptions: scripts/foundry/blueprint/exceptions.json):", ""]
        for r in gated:
            parts = [f"blocking {', '.join(r['blocking'])}"] if r.get("blocking") else []
            parts += [f"accepted {', '.join(r['accepted'])}"] if r.get("accepted") else []
            parts += [f"STALE exception {', '.join(r['stale'])}"] if r.get("stale") else []
            lines.append(f"- `{r['module']}`: {'; '.join(parts)}")
    counts: dict[str, int] = {}
    for r in reports:
        for rid in r["failing"]:
            counts[rid] = counts.get(rid, 0) + 1
    titles = {rid: t for rid, _, _, t in RULES}
    lines += ["", "## Top failing rules", "", "| Rule | Modules failing | What it checks |", "|---|---|---|"]
    for rid, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"| {rid} | {n} | {titles.get(rid, '')} |")
    lines += ["", "## Per-module detail", ""]
    for r in reports:
        lines.append(f"### `{r['module']}` — {r['score']} %")
        lines.append("")
        for res in r["results"]:
            if res["status"] in ("fail", "warn"):
                detail = "; ".join(_capped(res["detail"]))[:400].replace("|", "\\|")
                lines.append(f"- **{res['id']}** {res['status']}: {detail}")
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Score modules against the Pentaryn addon blueprint.")
    ap.add_argument("--root", type=Path, default=MODULE_ROOT, help="directory holding module folders")
    ap.add_argument("--snapshot", type=Path, help="a frozen tree: DIR/module/<m>, DIR/adjustments.yml")
    ap.add_argument("--module", nargs="*", default=[], help="short name, id, or path")
    out = ap.add_mutually_exclusive_group()
    out.add_argument("--json", action="store_true")
    out.add_argument("--markdown", action="store_true")
    args = ap.parse_args(argv)

    root, reg_path, installed = args.root, adj.REGISTRY_PATH, None
    if args.snapshot:
        root = args.snapshot / "module"
        reg_path = args.snapshot / "adjustments.yml"
        installed = True
    targets = []
    for name in args.module:
        p = Path(name)
        if (p / "module.json").exists():
            targets.append(p)
        else:
            cand = [root / name, root / f"pentaryn-{name}"]
            hit = next((c for c in cand if (c / "module.json").exists()), None)
            if hit is None:
                print(f"  ✗ no module {name!r} under {root}", file=sys.stderr)
                return 2
            targets.append(hit)
    if not targets:
        targets = sorted(p for p in root.iterdir() if (p / "module.json").exists())

    registry = load_registry(reg_path)     # once per run, not once per module
    if registry[1]:
        print(f"  ✗ {registry_failure(registry[1])}", file=sys.stderr)
    manifests: dict[Path, dict[str, dict]] = {}   # one sibling scan per root, not one per module
    reports = []
    for t in targets:
        parent = t.resolve().parent
        if parent not in manifests:
            manifests[parent] = load_manifests(parent)
        try:
            reports.append(score_dir(t, root=parent, registry_path=reg_path, installed=installed,
                                     registry=registry, manifests=manifests[parent]))
        except ManifestError as exc:
            print(f"  ✗ {t.resolve().name}: {exc}", file=sys.stderr)
            return 2
    if args.json:
        print(json.dumps(reports, indent=2))
    elif args.markdown:
        print(to_markdown(reports, title="Conformance"))
    else:
        for r in reports:
            accepted = f"  accepted: {', '.join(r['accepted'])}" if r["accepted"] else ""
            stale = f"  STALE exception: {', '.join(r['stale'])}" if r["stale"] else ""
            print(f"  {r['module']:<22} {r['score']:>5} %  {'WAIT  ' if r.get('wait') else ''}"
                  f"fail: {', '.join(r['failing']) or '—'}  warn: {', '.join(r['warnings']) or '—'}"
                  f"  manual: {', '.join(r['manual']) or '—'}{accepted}{stale}")
        waiting = [f"{r['module']} ({r['wait']})" for r in reports if r.get("wait")]
        if waiting:
            print("  WAIT — do not edit yet (wait.json): " + "; ".join(waiting))
    return 0 if all(gate_ok(r) for r in reports) else 1


if __name__ == "__main__":
    raise SystemExit(main())
