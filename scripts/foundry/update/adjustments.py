#!/usr/bin/env python3
"""The adjustments registry, and the exposure grep that backs it up.

``foundry/adjustments.yml`` is the hand-kept list of every place our code leans on,
patches, works around or extends a third-party package. It is what makes "this update
touches something we adjusted" a fact Python can compute rather than a judgement an LLM
has to make, and it is the input to the analyst's *Still needed?* verdicts.

A curated list rots, so two things keep it honest:

* :func:`check` fails when a row's files are gone or none of them still carries one of
  the row's ``markers`` — ``make foundry-adjustments-check``.
* :func:`exposure` greps our modules and ``scripts/foundry`` for the package id and its
  aliases. The registry is the curated list; exposure is the safety net for the row
  nobody wrote yet. Core and the system are deliberately excluded from exposure — every
  file mentions ``dnd5e`` — so for those two the registry is the whole story.

  Exposure costs money — an exposed package whose notes are not a clean patch floors at
  an Opus analysis — so it matches *code*, not prose. Comments and docstrings are
  stripped first; the package id must stand alone (case-sensitive, not glued to a longer
  identifier, not a property of something else — ``update.levels`` is core's token field,
  ``flags.levels`` is the Levels module); and the updater's own source is not searched,
  because it names packages as examples. Before 2026-10-10 a plain substring match made
  ``levels`` "exposed" through ``DOCUMENT_OWNERSHIP_LEVELS`` in ten files, and
  multi-token-edit through a docstring in ``upstream.py`` — an Opus call on most
  Saturdays, for nothing.

Everything here is pure file reading. No network, no Foundry, no LLM.
"""

from __future__ import annotations

import hashlib
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = REPO_ROOT / "foundry" / "adjustments.yml"

# Where exposure looks. Tests and vendored bundles are not "our code that a release can
# break" in the sense that matters at 04:00, and they would flood the grep.
EXPOSURE_GLOBS = ("foundry/module/*/**/*.mjs", "foundry/module/*/**/*.js",
                  "scripts/foundry/**/*.py", "automation/smoke/*.mjs")
# The blueprint tooling (scorer, vendor, generator) reads package names from its own
# packages.json and never runs against a package's code, so it is not exposure either.
EXPOSURE_SKIP_PARTS = ("/test/", "/tests/", "/node_modules/", "/lang/", "__pycache__",
                       "/scripts/foundry/update/", "/scripts/foundry/blueprint/")
NO_EXPOSURE = {"core", "dnd5e"}

RETIRE_CLASSES = ("safe", "guarded", "never")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")


class RegistryError(ValueError):
    """The registry file is malformed."""


@dataclass(frozen=True)
class Adjustment:
    id: str
    packages: tuple[str, ...]
    modules: tuple[str, ...]
    files: tuple[str, ...]
    markers: tuple[str, ...]
    what: str
    why: str = ""
    native_when: str = ""
    retire_class: str = "never"
    check: str = ""

    def to_json(self) -> dict:
        return {"id": self.id, "packages": list(self.packages),
                "modules": list(self.modules), "files": list(self.files),
                "what": self.what, "why": self.why, "native_when": self.native_when,
                "retire_class": self.retire_class, "check": self.check}


@dataclass
class Registry:
    rows: list[Adjustment] = field(default_factory=list)
    aliases: dict[str, tuple[str, ...]] = field(default_factory=dict)
    path: Path | None = None
    _exposure: dict[str, list[str]] = field(default_factory=dict, repr=False)

    # ── lookups ──────────────────────────────────────────────────────────────

    def rows_for(self, package: str) -> list[Adjustment]:
        return [r for r in self.rows if package in r.packages]

    def ids(self) -> set[str]:
        return {r.id for r in self.rows}

    def by_id(self, row_id: str) -> Adjustment | None:
        return next((r for r in self.rows if r.id == row_id), None)

    def rows_hash(self, package: str) -> str:
        """Stable hash of the rows that bear on one package — part of the analysis
        cache key, so editing a row invalidates the cached plan for that package."""
        blob = repr(sorted((r.to_json() for r in self.rows_for(package)),
                           key=lambda d: d["id"]))
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    # ── exposure ─────────────────────────────────────────────────────────────

    def exposure(self, package: str, *, root: Path = REPO_ROOT) -> list[str]:
        """Repo-relative files of ours that name ``package`` or one of its aliases.

        Cached per registry instance, which is per run."""
        if package in NO_EXPOSURE:
            return []
        if package in self._exposure:
            return self._exposure[package]
        id_re = id_pattern(package)
        aliases = [a.lower() for a in self.aliases.get(package, ())]
        hits: list[str] = []
        for path in _exposure_files(root):
            try:
                code = strip_comments(path.read_text(encoding="utf-8", errors="replace"),
                                      path.suffix)
            except OSError:
                continue
            if id_re.search(code) or any(a in code.lower() for a in aliases):
                hits.append(str(path.relative_to(root)))
        self._exposure[package] = sorted(set(hits))
        return self._exposure[package]


def id_pattern(package: str) -> re.Pattern:
    """A package id used as code. Case-sensitive — Foundry package ids are.

    A hyphenated id cannot be a JS identifier, so standing alone (not glued to a longer
    name, not a property of something else) is enough. An id that *is* a valid
    identifier ("levels", "socketlib") is too easily a local variable or an object key —
    ``const levels``, ``{levels: w.levels}`` — so it must be quoted, a path segment, or a
    flags scope: ``get("levels")``, ``"socketlib.ready"``, ``modules/levels/``,
    ``flags.levels``."""
    pid = re.escape(package)
    tail = r"(?![\w$\-])"
    flags = rf"\bflags\??\.{pid}{tail}"
    if "-" in package:
        return re.compile(rf"(?<![\w$.\-]){pid}{tail}|{flags}")
    return re.compile(rf"(?<=[\"'`/]){pid}{tail}|{flags}")


_JS_BLOCK = re.compile(r"/\*.*?\*/", re.S)
_JS_LINE = re.compile(r"(?<![:\\'\"`])//[^\n]*")
_PY_DOC = re.compile(r'(?:"""|\'\'\').*?(?:"""|\'\'\')', re.S)
_PY_LINE = re.compile(r"(?m)^\s*#[^\n]*|\s#\s[^\n]*")


def strip_comments(text: str, suffix: str) -> str:
    """Comments and docstrings out — a heuristic, not a parser; good enough that prose
    ("light levels", "the eledryll bundles and mad-endlesswiz") stops reading as a use."""
    if suffix in (".mjs", ".js"):
        return _JS_LINE.sub("", _JS_BLOCK.sub("", text))
    if suffix == ".py":
        return _PY_LINE.sub("", _PY_DOC.sub("", text))
    return text


def _exposure_files(root: Path) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for pattern in EXPOSURE_GLOBS:
        for path in root.glob(pattern):
            rel = "/" + str(path.relative_to(root))
            if any(skip in rel for skip in EXPOSURE_SKIP_PARTS) or path in seen:
                continue
            if path.is_file():
                seen.add(path)
                out.append(path)
    return sorted(out)


# ── loading ──────────────────────────────────────────────────────────────────

def _as_tuple(value, *, field_name: str, row_id: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return tuple(v.strip() for v in value.split(",") if v.strip())
    if isinstance(value, list) and all(isinstance(v, str) for v in value):
        return tuple(value)
    raise RegistryError(f"{row_id}: `{field_name}` must be a string or a list of strings")


def load(path: Path = REGISTRY_PATH) -> Registry:
    """Load and validate. Raises :class:`RegistryError` on a malformed file."""
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except OSError as exc:
        raise RegistryError(f"cannot read {path}: {exc}") from exc
    except yaml.YAMLError as exc:
        raise RegistryError(f"{path} is not valid YAML: {exc}") from exc
    if isinstance(raw, list):           # the plan's original bare-list shape
        raw = {"adjustments": raw}
    if not isinstance(raw, dict):
        raise RegistryError(f"{path}: expected a mapping with `adjustments:`")

    rows: list[Adjustment] = []
    seen: set[str] = set()
    for entry in raw.get("adjustments") or []:
        if not isinstance(entry, dict):
            raise RegistryError("every adjustment must be a mapping")
        row_id = str(entry.get("id") or "")
        if not ID_RE.match(row_id):
            raise RegistryError(f"bad adjustment id {row_id!r}")
        if row_id in seen:
            raise RegistryError(f"duplicate adjustment id {row_id!r}")
        seen.add(row_id)
        packages = _as_tuple(entry.get("packages", entry.get("package")),
                             field_name="packages", row_id=row_id)
        modules = _as_tuple(entry.get("modules", entry.get("module")),
                            field_name="modules", row_id=row_id)
        files = _as_tuple(entry.get("files"), field_name="files", row_id=row_id)
        markers = _as_tuple(entry.get("markers"), field_name="markers", row_id=row_id)
        if not packages:
            raise RegistryError(f"{row_id}: no `packages`")
        if not files:
            raise RegistryError(f"{row_id}: no `files`")
        for f in files:
            if f.startswith("/") or ".." in Path(f).parts:
                raise RegistryError(f"{row_id}: file {f!r} must be repo-relative")
        retire = str(entry.get("retire_class") or "never")
        if retire not in RETIRE_CLASSES:
            raise RegistryError(f"{row_id}: retire_class must be one of {RETIRE_CLASSES}")
        what = str(entry.get("what") or "").strip()
        if not what:
            raise RegistryError(f"{row_id}: no `what`")
        rows.append(Adjustment(
            id=row_id, packages=packages, modules=modules, files=files, markers=markers,
            what=what, why=str(entry.get("why") or "").strip(),
            native_when=str(entry.get("native_when") or "").strip(),
            retire_class=retire, check=str(entry.get("check") or "").strip()))

    aliases: dict[str, tuple[str, ...]] = {}
    for pkg, terms in (raw.get("aliases") or {}).items():
        aliases[str(pkg)] = _as_tuple(terms, field_name="aliases", row_id=str(pkg))
    return Registry(rows=rows, aliases=aliases, path=path)


def load_or_empty(path: Path = REGISTRY_PATH) -> tuple[Registry, str | None]:
    """For the run path: a broken registry must not kill a Saturday. Returns the
    registry (empty on error) and the error, which the caller records."""
    try:
        return load(path), None
    except RegistryError as exc:
        return Registry(), str(exc)


# ── the check ────────────────────────────────────────────────────────────────

def check(registry: Registry, *, root: Path = REPO_ROOT) -> list[str]:
    """Problems that mean the registry has drifted from the code. Empty = healthy."""
    problems: list[str] = []
    for row in registry.rows:
        texts: list[str] = []
        for rel in row.files:
            path = root / rel
            if not path.is_file():
                problems.append(f"{row.id}: {rel} does not exist")
                continue
            texts.append(path.read_text(encoding="utf-8", errors="replace"))
        if not row.markers:
            problems.append(f"{row.id}: no `markers` — nothing proves the row is still true")
            continue
        missing = [m for m in row.markers if not any(m in t for t in texts)]
        if missing and texts:
            problems.append(f"{row.id}: no file still contains "
                            + ", ".join(repr(m) for m in missing))
    return problems


def main(argv: list[str] | None = None) -> int:
    try:
        registry = load()
    except RegistryError as exc:
        print(f"  ✗ {exc}", file=sys.stderr)
        return 1
    problems = check(registry)
    for p in problems:
        print(f"  ✗ {p}")
    if problems:
        print(f"  {len(problems)} problem(s) in {REGISTRY_PATH.relative_to(REPO_ROOT)}")
        return 1
    pkgs = sorted({p for r in registry.rows for p in r.packages})
    print(f"  ✓ {len(registry.rows)} adjustments across {len(pkgs)} packages: "
          + ", ".join(pkgs))
    if argv and "--exposure" in argv:
        for pkg in sorted(set(pkgs) | set(registry.aliases)):
            hits = registry.exposure(pkg)
            if hits:
                print(f"    {pkg}: {len(hits)} file(s) — " + ", ".join(hits[:8])
                      + (" …" if len(hits) > 8 else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
