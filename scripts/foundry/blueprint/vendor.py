#!/usr/bin/env python3
"""Vendor the shared kit (foundry/lib) into a module, and prove the copies are identical.

Modules cannot import across module directories (the imports gate fails a `../` that leaves the
module, scripts/foundry/ops/modules.py), so shared code is VENDORED: one canonical file in
foundry/lib, a byte-identical copy in each module's lib/, and this gate proving identity by sha256.

    vendor.py sync  <module…|--all> [--tier small|full] [--kit a,b] [--root DIR]
    vendor.py check <module…|--all> [--root DIR] [--json]

`--all` means every module that already HAS a lib/kit.lock.json — the migrated ones. `sync --all`
skips a module without a lock (listed, never written): adopting the kit is a per-module step,
`vendor.py sync <short> --tier full`, never a side effect of a bulk re-vendor. `check --all` FAILS
one (since migration Stage 5, 2026-10-12, every module vendors the kit — the strict gate).

A module names its kit in `lib/kit.lock.json` — `{"version", "tier", "files"}` — written only by
`sync`. `tier` is what `--tier` chose (kept on a re-sync); the scorer falls back to it while
`module.json` has no `flags.pentaryn.tier` (that edit waits for the Wave 7 restart batch).
`module.json` is never touched: a kit bump must not be a 19-module Foundry restart.

`sync` refuses a kit file whose `packages` (kit.json) the module's `relationships` do not name: the
bytes of such a file name a third-party package, and the Saturday updater's exposure grep would
start counting the module as exposed to it.

A kit file is `<name>.mjs` unless its kit.json row says `"ext": "css"` (a shared stylesheet, D7):
it is vendored to `lib/<name>.css` the same way, and a module loads it by listing `lib/<name>.css`
in `module.json` `styles` (a manifest edit, so it rides a restart batch). `check` fails a
`styles` entry naming a `lib/*.css` the lock does not list.

Read-only except for the module's `lib/`, `test/kit/` and `lib/kit.lock.json`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
LIB_ROOT = REPO_ROOT / "foundry" / "lib"
MODULE_ROOT = REPO_ROOT / "foundry" / "module"
KIT_HEADER = "// pentaryn kit "
CSS_KIT_HEADER = "/* pentaryn kit "
KIT_EXTS = ("mjs", "css")


class VendorError(Exception):
    """A refusal: nothing was written."""


def load_kit(lib_root: Path = LIB_ROOT) -> dict:
    return json.loads((lib_root / "kit.json").read_text(encoding="utf-8"))


def closure(names: list[str], kit: dict) -> list[str]:
    """`names` plus every dependency, in kit.json order."""
    files = kit["files"]
    want: set[str] = set()
    stack = list(names)
    while stack:
        n = stack.pop()
        if n not in files:
            raise VendorError(f"unknown kit file {n!r} (kit.json lists: {', '.join(files)})")
        if n in want:
            continue
        want.add(n)
        stack.extend(files[n].get("deps", []))
    return [n for n in files if n in want]


def kit_file(name: str, kit: dict) -> str:
    """The file name of a kit entry: `<name>.mjs`, or `<name>.<ext>` when kit.json gives `ext`."""
    ext = (kit["files"].get(name) or {}).get("ext", "mjs")
    if ext not in KIT_EXTS:
        raise VendorError(f"kit file {name!r}: ext {ext!r} is not one of {', '.join(KIT_EXTS)}")
    return f"{name}.{ext}"


def _lib_files(lib_dir: Path) -> list[Path]:
    return sorted(f for ext in KIT_EXTS for f in lib_dir.glob(f"*.{ext}")) if lib_dir.is_dir() else []


def _is_kit_copy(path: Path) -> bool:
    head = path.read_text(encoding="utf-8", errors="replace")[:32]
    return head.startswith(KIT_HEADER) or head.startswith(CSS_KIT_HEADER)


def header_version(path: Path) -> str | None:
    """The kit version a copy's first line names (`// pentaryn kit 1.1.0 · …`), or None."""
    head = path.read_text(encoding="utf-8", errors="replace")[:80]
    for prefix in (KIT_HEADER, CSS_KIT_HEADER):
        if head.startswith(prefix):
            word = head[len(prefix):].split(None, 1)
            return word[0] if word else None
    return None


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def related_packages(manifest: dict) -> set[str]:
    rel = manifest.get("relationships") or {}
    out: set[str] = set()
    for kind in ("systems", "requires", "recommends", "conflicts"):
        for entry in rel.get(kind) or []:
            if isinstance(entry, dict) and entry.get("id"):
                out.add(entry["id"])
    return out


def resolve_module(arg: str, root: Path = MODULE_ROOT) -> Path:
    """`demo`, `pentaryn-demo`, or a path to a module directory."""
    p = Path(arg)
    if (p / "module.json").exists():
        return p.resolve()
    for name in (arg, f"pentaryn-{arg}"):
        if (root / name / "module.json").exists():
            return (root / name).resolve()
    raise VendorError(f"no module {arg!r} under {root}")


def all_modules(root: Path = MODULE_ROOT) -> list[Path]:
    return sorted(p for p in root.iterdir() if (p / "module.json").exists())


def read_lock(module_dir: Path) -> dict | None:
    path = module_dir / "lib" / "kit.lock.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:  # py-blueprint-ROB-4: that module's problem, not a traceback
        raise VendorError(f"{module_dir.name}: lib/kit.lock.json is not valid JSON: {exc}") from exc


def plan(module_dir: Path, tier: str | None = None, extra: list[str] | None = None, *,
         lib_root: Path = LIB_ROOT, manifest: dict | None = None) -> dict:
    """What `sync` would vendor — `{"tier", "files"}` — after every closure/package/ext check.

    Pure: reads kit.json, the lock and the manifest (or `manifest`, the one about to be written)
    and raises VendorError on a refusal, so a caller can refuse before writing anything (PYB-E7).
    """
    kit = load_kit(lib_root)
    if manifest is None:
        manifest = json.loads((module_dir / "module.json").read_text(encoding="utf-8"))
    lock = read_lock(module_dir)

    # an explicit tier wins; else the existing lock; else the manifest's tier (default full)
    manifest_tier = ((manifest.get("flags") or {}).get("pentaryn") or {}).get("tier")  # py-blueprint-MAINT-7
    if tier is None and lock and lock.get("files"):
        base = list(lock["files"])
        lock_tier = lock.get("tier") or manifest_tier
    else:
        t = tier or manifest_tier or "full"
        if t not in kit["tiers"]:
            raise VendorError(f"unknown tier {t!r}")
        base = list(kit["tiers"][t])
        lock_tier = t
    names = closure(base + list(extra or []), kit)

    related = related_packages(manifest)
    for n in names:
        meta = kit["files"][n]
        if meta.get("status") == "deferred":
            raise VendorError(f"{n} is deferred (kit.json status) and has no canonical file yet")
        missing = [p for p in meta.get("packages", []) if p not in related]
        if missing:
            raise VendorError(f"{kit_file(n, kit)} names {', '.join(missing)} — add it to module.json "
                              f"relationships first (refused: {module_dir.name})")
    for n in names:  # a bad `ext` refuses here, before anything is written
        kit_file(n, kit)
    return {"tier": lock_tier, "files": names}


def sync(module_dir: Path, *, tier: str | None = None, extra: list[str] | None = None,
         lib_root: Path = LIB_ROOT) -> list[str]:
    """Copy the kit closure and the test kit into the module. Returns the files written."""
    kit = load_kit(lib_root)
    planned = plan(module_dir, tier, extra, lib_root=lib_root)
    names, lock_tier = planned["files"], planned["tier"]

    written: list[str] = []
    lib_dir = module_dir / "lib"
    lib_dir.mkdir(exist_ok=True)
    keep = set()
    for n in names:
        fname = kit_file(n, kit)
        keep.add(fname)
        dst = lib_dir / fname
        dst.write_bytes((lib_root / fname).read_bytes())
        written.append(str(dst.relative_to(module_dir)))
    # a kit file the lock no longer lists is removed; anything else in lib/ is left for check() to report
    for stale in _lib_files(lib_dir):
        if stale.name not in keep and _is_kit_copy(stale):
            stale.unlink()

    kit_dir = module_dir / "test" / "kit"
    kit_dir.mkdir(parents=True, exist_ok=True)
    for f in kit["testKit"]:
        dst = kit_dir / f
        dst.write_bytes((lib_root / "test-kit" / f).read_bytes())
        written.append(str(dst.relative_to(module_dir)))

    # the lock records the tier so a module is scored by it before its module.json gains
    # flags.pentaryn.tier in the Wave 7 restart batch (conformance Module.tier reads it second)
    lock_out = {"version": kit["version"], **({"tier": lock_tier} if lock_tier else {}), "files": names}
    (lib_dir / "kit.lock.json").write_text(json.dumps(lock_out, indent=2) + "\n", encoding="utf-8")
    written.append("lib/kit.lock.json")
    return written


def _lib_imports(module_dir: Path) -> set[str]:
    """Kit file stems imported as ./lib/x.mjs (or ../lib/x.mjs from a subfolder) by the module's own code."""
    import re
    names: set[str] = set()
    pattern = re.compile(r"""["'](?:\./|(?:\.\./)+)lib/([\w-]+)\.mjs["']""")
    for f in module_dir.rglob("*.mjs"):
        rel = f.relative_to(module_dir).parts
        if rel[0] in ("lib", "node_modules") or rel[:2] == ("test", "kit"):
            continue
        names.update(pattern.findall(f.read_text(encoding="utf-8", errors="replace")))
    return names


def _lib_styles(module_dir: Path) -> set[str]:
    """Kit stylesheet stems the manifest loads as `lib/<name>.css`."""
    import re
    try:
        manifest = json.loads((module_dir / "module.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    out: set[str] = set()
    for s in manifest.get("styles") or []:
        m = re.fullmatch(r"(?:\./)?lib/([\w-]+)\.css", str(s))
        if m:
            out.add(m.group(1))
    return out


def check(module_dir: Path, *, lib_root: Path = LIB_ROOT) -> list[str]:
    """Problems that mean the vendored copies are not the canonical kit. Empty = healthy."""
    kit = load_kit(lib_root)
    problems: list[str] = []
    name = module_dir.name
    try:
        lock = read_lock(module_dir)
    except VendorError as exc:
        return [str(exc)]
    if lock is None:
        return [f"{name}: no lib/kit.lock.json — run vendor.py sync {name}"]
    if lock.get("version") != kit["version"]:
        problems.append(f"{name}: lock version {lock.get('version')} ≠ kit {kit['version']} — run vendor.py sync {name}")
    files = list(lock.get("files") or [])
    try:
        need = closure(files, kit)
    except VendorError as exc:
        problems.append(f"{name}: {exc}")
        need = files
    for n in need:
        if n not in files:
            problems.append(f"{name}: lock is missing {n} (a dependency of the locked files)")
    locked_names = set()
    for n in files:
        if n not in kit["files"]:
            locked_names.add(f"{n}.mjs")       # unknown to kit.json: the closure above reported it
            continue
        try:
            fname = kit_file(n, kit)
        except VendorError as exc:
            problems.append(f"{name}: {exc}")
            continue
        locked_names.add(fname)
        copy, canon = module_dir / "lib" / fname, lib_root / fname
        if not copy.exists():
            problems.append(f"{name}: lib/{fname} is locked but missing")
        elif canon.exists() and sha(copy) != sha(canon):
            at, locked = header_version(copy), lock.get("version")
            if at and locked and at != locked:
                problems.append(f"{name}: lib/{fname} differs from foundry/lib/{fname} — vendored at {at}, "
                                f"lock is {locked}; run vendor.py sync {name}")
            else:
                problems.append(f"{name}: lib/{fname} differs from foundry/lib/{fname} — never edit a copy; "
                                f"edit the canonical file and re-vendor")
    lib_dir = module_dir / "lib"
    for f in _lib_files(lib_dir):
        if f.name not in locked_names:
            problems.append(f"{name}: lib/{f.name} is not in kit.lock.json")
    for f in kit["testKit"]:
        copy = module_dir / "test" / "kit" / f
        if not copy.exists():
            problems.append(f"{name}: test/kit/{f} is missing")
        elif sha(copy) != sha(lib_root / "test-kit" / f):
            problems.append(f"{name}: test/kit/{f} differs from foundry/lib/test-kit/{f}")
    for n in sorted(_lib_imports(module_dir) - set(files)):
        problems.append(f"{name}: code imports ./lib/{n}.mjs, which kit.lock.json does not list")
    for n in sorted(_lib_styles(module_dir) - set(files)):
        problems.append(f"{name}: module.json styles lists lib/{n}.css, which kit.lock.json does not list")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for cmd in ("sync", "check"):
        p = sub.add_parser(cmd)
        p.add_argument("modules", nargs="*")
        p.add_argument("--all", action="store_true")
        p.add_argument("--root", type=Path, default=MODULE_ROOT)
        p.add_argument("--lib", type=Path, default=LIB_ROOT)
        if cmd == "sync":
            p.add_argument("--tier", choices=("small", "full"))
            p.add_argument("--kit", default="", help="extra kit files, comma-separated")
        else:
            p.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    skipped: list[str] = []
    try:
        if args.all:
            targets = []
            for mod in all_modules(args.root):
                try:
                    locked = read_lock(mod) is not None
                except VendorError:
                    locked = True  # a corrupt lock: sync/check report it as that module's ✗
                (targets if locked else skipped).append(mod)
            skipped = [m.name for m in skipped]
        else:
            targets = [resolve_module(m, args.root) for m in args.modules]
    except VendorError as exc:
        print(f"  ✗ {exc}", file=sys.stderr)
        return 1
    if not targets and not skipped:
        ap.error("name a module or pass --all")
    if skipped and not getattr(args, "json", False):
        if args.cmd == "check":
            print(f"  ✗ no lib/kit.lock.json (every module vendors the kit since Stage 5): {', '.join(skipped)}")
        else:
            print(f"  · skipped (no lib/kit.lock.json, not migrated): {', '.join(skipped)}")

    if args.cmd == "sync":
        rc = 0
        for mod in targets:
            try:
                files = sync(mod, tier=args.tier, extra=[k for k in args.kit.split(",") if k],
                             lib_root=args.lib)
                print(f"  ✓ {mod.name}: {len(files)} file(s) vendored")
            except VendorError as exc:
                print(f"  ✗ {exc}", file=sys.stderr)
                rc = 1
        return rc

    report = {mod.name: check(mod, lib_root=args.lib) for mod in targets}
    if args.json:
        print(json.dumps({"modules": report, "skipped": skipped}, indent=2) if args.all else json.dumps(report, indent=2))
    else:
        for name, problems in report.items():
            if problems:
                for p in problems:
                    print(f"  ✗ {p}")
            else:
                print(f"  ✓ {name}: vendored kit identical to foundry/lib")
    return 1 if any(report.values()) or skipped else 0


if __name__ == "__main__":
    raise SystemExit(main())
