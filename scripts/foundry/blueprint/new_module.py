#!/usr/bin/env python3
"""Generate a new Pentaryn Foundry module from the blueprint template.

    ./.venv/bin/python scripts/foundry/blueprint/new_module.py <short> --title "Pentaryn <Title>"
        [--description "…"] [--namespace <ns>] [--css-prefix <px->] [--tier small|full] [--kit a,b]
        [--no-dnd5e] [--out DIR] [--install] [--docs] [--docs-root DIR] [--check] [--force]

What it does, in order:
  1. validates <short> (^[a-z][a-z0-9]{1,15}$, not reserved) and refuses a namespace, module id or
     CSS prefix another module already uses (declared in flags.pentaryn, or found in source/CSS);
  2. renders foundry/blueprint/template/pentaryn-__SHORT__/ by literal placeholder replacement
     plus `@if full|small|dnd5e|nodnd5e` line blocks;
  3. vendors the kit closure for the tier (+ --kit) and the test kit, writing lib/kit.lock.json;
  4. runs `GOLDEN_UPDATE=1 node test/run.mjs` (writes the goldens), then `node test/run.mjs`;
     with --force on an existing folder it never writes goldens (see below);
  5. with --check, runs the ops gates (parse, imports, i18n, node-test) against the new folder,
     vendor.py check, and the conformance scorer — read-only use of the ops code;
  6. prints the manual follow-ups (ModuleSpec row with the real after_sync tuple from module.json,
     Makefile lines, routing rows, restart).

--check scores conformance as NOT installed, even with --install: C39 (ModuleSpec) and C46 (route)
are follow-ups printed after the check, so they are reported as pending, never as failures.

--force re-renders the template files over an existing folder and nothing else: it keeps
lib/kit.lock.json (and so every --kit extra the module added since), re-vendors from that lock,
leaves test/golden/ alone and runs the suite WITHOUT GOLDEN_UPDATE — a module mid-refactor must
never have its goldens rewritten (context/foundry/addon-blueprint.md §3.1 `--force`, §6).

It refuses to write under foundry/module/ unless --install is passed: that folder is what
`make foundry-<m>-sync` deploys, so a module lands there only on purpose.

Exit: 0 generated (and green), 1 a gate or test failed, 2 refused (nothing written).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from scripts.foundry.blueprint import vendor  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
TEMPLATE = REPO_ROOT / "foundry" / "blueprint" / "template"
MODULE_ROOT = REPO_ROOT / "foundry" / "module"
DEFAULT_APP = Path("/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app")

SHORT_RE = re.compile(r"^[a-z][a-z0-9]{1,15}$")
RESERVED = ("import", "moduleId", "contract", "_internals", "describe", "inspect", "namespaces",
            "published", "rules", "chain", "lib", "test", "core", "api", "settings")
CSS_RE = re.compile(r"^[a-z][a-z0-9]{0,5}-$")
FULL_ONLY = {"api-manifest.mjs", "api.mjs", "settings.mjs", "test/hooks.test.mjs", "test/api.test.mjs",
             "test/i18n.test.mjs", "lang/en.json"}
BLOCK = re.compile(r"^\s*(?://|/\*|<!--)\s*@(if|endif)\b\s*(\w*)\s*(?:\*/|-->)?\s*$")


class Refused(Exception):
    """Nothing was written."""


# ── validation and collisions ────────────────────────────────────────────────

def _modules(root: Path) -> list[Path]:
    return sorted(p for p in root.iterdir() if (p / "module.json").exists()) if root.is_dir() else []


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def namespace_owner(ns: str, roots: list[Path]) -> str | None:
    """A module that already publishes `ns`: declared, or found as game.pentaryn.<ns> / { ...current, <ns>: api }."""
    src_res = [re.compile(rf"game\.pentaryn\.{re.escape(ns)}\b"),
               re.compile(rf"\{{\s*\.\.\.\s*\w+\s*,\s*{re.escape(ns)}\s*:")]
    for root in roots:
        for mod in _modules(root):
            man = json.loads(_read(mod / "module.json"))
            if ((man.get("flags") or {}).get("pentaryn") or {}).get("namespace") == ns:
                return mod.name
            for f in mod.rglob("*.mjs"):
                if {"lib", "test", "node_modules"} & set(f.relative_to(mod).parts):
                    continue
                text = _read(f)
                if any(rx.search(text) for rx in src_res):
                    return mod.name
    return None


def css_owner(prefix: str, roots: list[Path], *, skip: str | None = None) -> str | None:
    sel = re.compile(rf"\.{re.escape(prefix)}[A-Za-z0-9_-]")
    for root in roots:
        for mod in _modules(root):
            if mod.name == skip:
                continue
            man = json.loads(_read(mod / "module.json"))
            if ((man.get("flags") or {}).get("pentaryn") or {}).get("cssPrefix") == prefix:
                return mod.name
            for css in mod.rglob("*.css"):
                if sel.search(_read(css)):
                    return mod.name
    return None


def pick_css_prefix(short: str, roots: list[Path], *, own: str | None = None) -> str:
    for n in range(1, len(short) + 1):
        cand = f"p{short[:n]}-"
        if CSS_RE.match(cand) and not css_owner(cand, roots, skip=own):
            return cand
    raise Refused(f"no free CSS prefix derived from {short!r}; pass --css-prefix")


def verified(app_root: Path) -> str:
    try:
        version = json.loads(_read(app_root / "package.json")).get("version", "")
    except (OSError, ValueError):
        return "14"
    m = re.match(r"^(\d+)\.(\d+)", version)
    return f"{m.group(1)}.{m.group(2)}" if m else "14"


# ── rendering ────────────────────────────────────────────────────────────────

def apply_blocks(text: str, flags: set[str]) -> str:
    """Keep or drop `@if <flag>` … `@endif` line blocks (nestable); marker lines are removed."""
    out, stack = [], []
    for line in text.splitlines(keepends=True):
        m = BLOCK.match(line)
        if m:
            if m.group(1) == "if":
                stack.append(m.group(2) in flags)
            elif stack:
                stack.pop()
            continue
        if all(stack):
            out.append(line)
    if stack:
        raise ValueError("unclosed @if block")
    return "".join(out)


def substitute(text: str, values: dict[str, str]) -> str:
    for key in sorted(values, key=len, reverse=True):
        text = text.replace(key, values[key])
    return text


def render(target: Path, values: dict[str, str], *, tier: str, dnd5e: bool, force: bool) -> list[str]:
    src_root = TEMPLATE / "pentaryn-__SHORT__"
    flags = {tier, "dnd5e" if dnd5e else "nodnd5e"}
    written = []
    for src in sorted(src_root.rglob("*")):
        if not src.is_file():
            continue
        rel_t = src.relative_to(src_root).as_posix()
        if tier == "small" and rel_t in FULL_ONLY:
            continue
        rel = substitute(rel_t, {"__SHORT__": values["__SHORT__"]})
        dst = target / rel
        if dst.exists() and not force:
            raise Refused(f"{dst} exists")
        if force and rel == "lib/kit.lock.json" and dst.exists():
            continue                      # the lock is vendor.py's; --force never resets it
        text = src.read_text(encoding="utf-8")
        vals = dict(values)
        if src.suffix == ".json":
            vals = {k: json.dumps(v)[1:-1] for k, v in values.items()}
        text = substitute(apply_blocks(text, flags), vals)
        if rel == "module.json":
            text = _manifest(text, tier=tier, dnd5e=dnd5e)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text, encoding="utf-8")
        written.append(rel)
    return written


def _manifest(text: str, *, tier: str, dnd5e: bool) -> str:
    man = json.loads(text)
    if tier == "small":
        man.pop("languages", None)
    if not dnd5e:
        man.setdefault("relationships", {})["systems"] = []
    return json.dumps(man, indent=2, ensure_ascii=False) + "\n"


def write_docs(docs_root: Path, values: dict[str, str], *, tier: str = "full", dnd5e: bool = True) -> list[Path]:
    """The use-doc and plan stubs, through the same `@if` blocks as the module files (render())."""
    short, ym = values["__SHORT__"], values["__YYYY_MM__"]
    flags = {tier, "dnd5e" if dnd5e else "nodnd5e"}
    plan = [(TEMPLATE / "docs/use-doc.md", docs_root / "context/foundry" / f"{short}.md"),
            (TEMPLATE / "docs/plan.md", docs_root / "context/plans" / f"{short}-{ym}.md")]
    out = []
    for src, dst in plan:
        if dst.exists():
            print(f"  ▸ {dst} exists — left alone")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(substitute(apply_blocks(src.read_text(encoding="utf-8"), flags), values), encoding="utf-8")
        out.append(dst)
    return out


# ── running ──────────────────────────────────────────────────────────────────

def run_tests(target: Path, *, write_goldens: bool = True) -> int:
    if shutil.which("node") is None:
        print("  ✗ node is not installed — cannot run the generated suite")
        return 1
    env = {k: v for k, v in os.environ.items() if k != "GOLDEN_UPDATE"}
    if write_goldens:
        rc = subprocess.run(["node", "test/run.mjs"], cwd=target, env={**env, "GOLDEN_UPDATE": "1"},
                            capture_output=True, text=True)
        if rc.returncode != 0:
            print(rc.stdout[-4000:], rc.stderr[-2000:])
            print("  ✗ writing the goldens failed")
            return 1
    else:
        print("  · --force: test/golden/ left alone (GOLDEN_UPDATE not set); a missing or changed golden "
              "fails below — update one file at a time with GOLDEN_UPDATE=1 node --test test/<file>.test.mjs")
    rc = subprocess.run(["node", "test/run.mjs"], cwd=target, env=env, capture_output=True, text=True)
    tail = [ln for ln in rc.stdout.splitlines() if ln.startswith("ℹ ")]
    print("  " + " · ".join(t[2:] for t in tail[:3]))
    if rc.returncode != 0:
        print(rc.stdout[-4000:], rc.stderr[-2000:])
        print("  ✗ the generated suite failed")
        return 1
    print("  ✓ goldens written and the suite passes" if write_goldens else "  ✓ the suite passes against the existing goldens")
    return 0


def run_checks(target: Path) -> int:
    """The ops gates against the new folder (read-only use of scripts/foundry/ops), vendor, conformance."""
    from scripts.foundry.blueprint import conformance
    from scripts.foundry.ops import config as ops_cfg, modules as ops_modules

    class TmpSpec(ops_cfg.ModuleSpec):
        def __init__(self, root: Path):
            super().__init__(root.name, check=("parse", "imports", "i18n", "node-test"))
            self._root = root

        @property
        def src(self) -> Path:
            return self._root

    spec = TmpSpec(target)
    for gate in spec.check:
        sys.stdout.flush()
        if ops_modules._CHECKS[gate](spec) != 0:
            print(f"  ✗ gate {gate} failed")
            return 1
    problems = vendor.check(target)
    for p in problems:
        print(f"  ✗ {p}")
    if problems:
        return 1
    print(f"  ✓ {target.name}: vendored kit identical to foundry/lib")
    # Scored as NOT installed even under foundry/module (--install): the repo-wiring rules (C39's
    # ModuleSpec, C46's route) are the manual follow-ups printed after this check, so they read n/a
    # here. `conformance.py --module <short>` scores them once step 10 of the use-doc is done.
    report = conformance.score_dir(target, installed=False)
    print(f"  {'✓' if not report['failing'] else '✗'} conformance {report['score']} % "
          f"({report['passed']}/{report['failClassRules']} fail-class rules)"
          + (f" — failing {', '.join(report['failing'])}" if report["failing"] else "")
          + (f"; warnings {', '.join(report['warnings'])}" if report["warnings"] else ""))
    print("  · pending follow-ups, not scored here: C39 (ModuleSpec in scripts/foundry/ops/config.py), "
          "C46 (route in context/foundry/README.md) — rerun conformance.py --module after wiring")
    return 1 if report["failing"] else 0


def after_sync_tuple(target: Path) -> str:
    """`after_sync=(...)` source for config.py, from module.json flags.pentaryn.afterSync (valid Python)."""
    try:
        lines = json.loads(_read(target / "module.json"))["flags"]["pentaryn"]["afterSync"]
    except (OSError, ValueError, KeyError, TypeError):
        lines = []
    lines = [str(x) for x in lines or []]
    if not lines:
        return "after_sync=()"
    return "after_sync=(" + ", ".join(repr(x) for x in lines) + ("," if len(lines) == 1 else "") + ")"


def _has_api_index(readme: Path | None = None) -> bool:
    """Whether context/foundry/README.md has the "Module APIs" index section yet (W7)."""
    path = readme or REPO_ROOT / "context" / "foundry" / "README.md"
    try:
        return "Module APIs" in path.read_text(encoding="utf-8")
    except OSError:
        return False


def _writes_after_sync(target: Path | None) -> bool:
    """Whether module.json carries flags.pentaryn.afterSync (ModuleSpec reads it there first)."""
    if target is None:
        return False
    try:
        lines = json.loads(_read(target / "module.json"))["flags"]["pentaryn"]["afterSync"]
    except (OSError, ValueError, KeyError, TypeError):
        return False
    return isinstance(lines, list) and bool(lines)


def registration_row(short: str, target: Path | None = None) -> list[str]:
    """The config.py MODULES row: every gate (ALL_GATES, so vendor + conformance run strict like
    every other row), and after_sync only when module.json has no afterSync to read (EXT-2)."""
    head = f'       "{short}": ModuleSpec("pentaryn-{short}", check=ALL_GATES'
    if _writes_after_sync(target):
        return [head + "),"]
    after = after_sync_tuple(target) if target is not None else "after_sync=()"
    return [head + ",", f"                  {after}),"]


def follow_ups(short: str, title: str, ns: str, installed: bool, target: Path | None = None) -> str:
    return "\n".join([
        "Manual follow-ups (not done by this script):",
        f"  1. {'' if installed else 'Move the folder to foundry/module/ (rerun with --install --out foundry/module). '}"
        "Register it in scripts/foundry/ops/config.py MODULES:",
        *registration_row(short, target),
        "  2. Makefile:",
        f"       foundry-{short}-check: ; @$(OPS) module-check {short}",
        f"       foundry-{short}-sync: foundry-{short}-check ; @$(OPS) module-sync {short}",
        f"  3. Routing: a row in context/foundry/README.md (Route by task + Module APIs) → context/foundry/{short}.md"
        + ("" if _has_api_index() else
           "\n     (the Module APIs index does not exist yet; add the section — pending wiring W7,"
           "\n     context/plans/addon-blueprint-2026-10/README.md §7)"),
        f"  4. make foundry-{short}-sync, then RESTART Foundry (module.json is read at startup),",
        f"     enable '{title}' in Manage Modules, reload, and check: game.pentaryn.{ns}.describe()",
    ])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Generate a Pentaryn module from the blueprint.")
    ap.add_argument("short")
    ap.add_argument("--title", required=True)
    ap.add_argument("--description", default="")
    ap.add_argument("--namespace")
    ap.add_argument("--css-prefix")
    ap.add_argument("--tier", choices=("small", "full"), default="full")
    ap.add_argument("--kit", default="", help="extra kit files, comma-separated (e.g. election,perf)")
    ap.add_argument("--no-dnd5e", action="store_true")
    ap.add_argument("--out", type=Path, default=MODULE_ROOT, help="parent folder (default foundry/module, needs --install)")
    ap.add_argument("--install", action="store_true", help="allow writing under foundry/module/")
    ap.add_argument("--docs", action="store_true", help="write the use-doc and plan stubs (never overwrites)")
    ap.add_argument("--docs-root", type=Path, default=REPO_ROOT)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--force", action="store_true", help="overwrite template files in an existing folder")
    ap.add_argument("--no-run", action="store_true", help="skip running the generated suite (tests only)")
    ap.add_argument("--modules-root", type=Path, default=MODULE_ROOT, help="where to look for collisions")
    ap.add_argument("--app-root", type=Path, default=Path(os.environ.get("FOUNDRY_APP_ROOT", DEFAULT_APP)))
    args = ap.parse_args(argv)

    try:
        short = args.short
        if not SHORT_RE.match(short):
            raise Refused(f"short name {short!r} must match {SHORT_RE.pattern}")
        if short in RESERVED:
            raise Refused(f"{short!r} is reserved ({', '.join(RESERVED)})")
        ns = args.namespace or short
        if ns in RESERVED or not re.match(r"^[a-z][A-Za-z0-9]*$", ns):
            raise Refused(f"namespace {ns!r} is reserved or not an identifier")

        out = args.out.resolve()
        mod_root = MODULE_ROOT.resolve()
        if (out == mod_root or mod_root in out.parents) and not args.install:
            raise Refused(f"{out} is under foundry/module/ — the folder sync deploys. Pass --install to mean it, "
                          "or --out somewhere else")
        target = out / f"pentaryn-{short}"
        if target.exists() and not args.force:
            raise Refused(f"{target} exists (--force overwrites template files only)")

        others = [r for r in {args.modules_root.resolve(), out} if r.is_dir()]
        if (args.modules_root / f"pentaryn-{short}").exists() and args.modules_root.resolve() != out:
            raise Refused(f"pentaryn-{short} already exists in {args.modules_root}")
        owner = namespace_owner(ns, others)
        if owner and owner != target.name:
            raise Refused(f"namespace {ns!r} is already published by {owner}")
        css = args.css_prefix or pick_css_prefix(short, others, own=target.name)
        if not CSS_RE.match(css):
            raise Refused(f"CSS prefix {css!r} must match {CSS_RE.pattern}")
        owner = css_owner(css, others)
        if owner and owner != target.name:
            raise Refused(f"CSS prefix {css!r} is already used by {owner}")
    except Refused as exc:
        print(f"  ✗ refused: {exc}", file=sys.stderr)
        return 2

    today = dt.date.today()
    values = {
        "__SHORT_UPPER__": short.upper(),
        "__SHORT__": short,
        "__Title__": args.title,
        "__MODULE__": f"pentaryn-{short}",
        "__NS__": ns,
        "__CSS__": css,
        "__DESC__": args.description or f"{args.title}. Exposes game.pentaryn.{ns}.",
        "__VERIFIED__": verified(args.app_root),
        "__TODAY__": today.isoformat(),
        "__YYYY_MM__": today.strftime("%Y-%m"),
        "__TIER__": args.tier,
    }
    existing = target.exists()
    rerender = args.force and existing
    try:
        files = render(target, values, tier=args.tier, dnd5e=not args.no_dnd5e, force=args.force)
        # a re-render keeps the module's own lock (tier=None): earlier --kit extras stay vendored
        has_lock = vendor.read_lock(target) is not None
        vendored = vendor.sync(target, tier=None if (rerender and has_lock) else args.tier,
                               extra=[k for k in args.kit.split(",") if k])
    except (Refused, vendor.VendorError) as exc:
        if not existing:  # "2 refused (nothing written)": drop only the folder this run created
            shutil.rmtree(target, ignore_errors=True)
        print(f"  ✗ refused: {exc}", file=sys.stderr)
        return 2
    print(f"  ✓ pentaryn-{short} → {target} ({len(files)} template files, {len(vendored)} vendored, tier {args.tier}, "
          f"namespace {ns}, CSS {css})")

    if args.docs:
        for p in write_docs(args.docs_root, values, tier=args.tier, dnd5e=not args.no_dnd5e):
            print(f"  ✓ {p}")

    rc = 0
    if not args.no_run:
        rc = run_tests(target, write_goldens=not rerender)
    if rc == 0 and args.check:
        rc = run_checks(target)
    print(follow_ups(short, args.title, ns, installed=args.install, target=target))
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
