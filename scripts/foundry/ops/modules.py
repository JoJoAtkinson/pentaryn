"""Check and install the in-house Foundry modules.

Copy, never symlink: a stale copy has to be a real, visible failure mode.

The check step exists because of how Foundry fails here — a broken esmodule fails
*silently* at load time and the module simply never registers. No error in the
console, no entry in Manage Modules that looks wrong; it is just absent. So nothing
reaches Data/ until its sources have been proved.

There are four gates, and each one sees something the others cannot:

    parse      `node --check` on every .mjs, JSON.parse on every .json
    imports    every named import exists in the file it is imported FROM
    i18n       every key the code localises exists in lang/en.json
    node-test  the module's own suite, where it has one

They run in that order and stop at the first failure. `imports` is the one added
after 2026-08-22, when an `export` was deleted out from under two importers: every
file parsed, this check went green, and the module never initialised. `node --check`
reads one file at a time and cannot see across the gap between them.

None of them can tell you the module WORKS. They tell you it can load.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from . import config as cfg, jsscan
from .service import _say

OK, FAIL = 0, 1

# Build output and vendored code are not ours to check.
_SKIP_DIRS = {"node_modules", "target", ".git"}


def _sources(spec: cfg.ModuleSpec) -> list[Path]:
    """Every .mjs the module owns, tests included, build output excluded."""
    return sorted(f for f in spec.src.rglob("*.mjs")
                  if not _SKIP_DIRS & set(f.relative_to(spec.src).parts))


def _rel(spec: cfg.ModuleSpec, path: Path) -> str:
    return str(path.relative_to(spec.src))


def _node_available() -> bool:
    return shutil.which("node") is not None


def _check_parse(spec: cfg.ModuleSpec) -> int:
    """`node --check` every .mjs, and JSON.parse every .json the module declares."""
    if not _node_available():
        _say("▸ node not installed — skipping the syntax check")
        return OK

    for f in _sources(spec):
        proc = subprocess.run(["node", "--check", str(f)],
                              capture_output=True, text=True)
        if proc.returncode != 0:
            _say(f"✗ syntax error in {f}")
            print(proc.stderr)
            return FAIL

    for rel in ("module.json", "lang/en.json"):
        path = spec.src / rel
        if not path.exists():
            continue
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            _say(f"✗ malformed JSON in {rel}: {exc}")
            return FAIL

    _say(f"✓ {spec.name} sources parse")
    return OK


def _check_imports(spec: cfg.ModuleSpec) -> int:
    """Every named import must be exported by the file it claims to come from.

    This is the gap `node --check` leaves. It parses one file at a time, so on
    2026-08-22 an `export` was deleted out from under two importers, all nine files
    parsed clean, the check went green — and the module never initialised: no
    settings registered, sheet tab blank, nothing in the console. A missing named
    export is a load-time error in an ES module, and this is the only gate that sees
    it before the browser does.

    What it does NOT see, and says so out loud below: `import(expr)` with a computed
    specifier, and which members of an `import * as NS` are actually reached.
    """
    files = _sources(spec)
    if not files:
        _say(f"▸ {spec.name}: no .mjs sources to cross-check")
        return OK

    scanned = {f: jsscan.scan(f) for f in files}
    exports: dict[Path, set[str]] = {}
    stars: dict[Path, list[str]] = {}
    for path, src in scanned.items():
        exports[path], stars[path] = jsscan.exports_of(src)

    def resolve(origin: Path, spec_str: str) -> Path | None:
        target = (origin.parent / spec_str).resolve()
        try:
            target.relative_to(spec.src.resolve())
        except ValueError:
            return None          # reaches outside the module — not ours to resolve
        return target

    def exported(path: Path, name: str, seen: set[Path] | None = None) -> bool:
        """Membership, following `export * from` / `export {x} from` one hop at a time."""
        seen = seen or set()
        if path in seen:
            return False
        seen.add(path)
        if name in exports.get(path, ()):
            return True
        for spec_str in stars.get(path, ()):
            nxt = resolve(path, spec_str)
            if nxt and nxt in exports and exported(nxt, name, seen):
                return True
        return False

    problems: list[str] = []
    notes: list[str] = []
    n_named = n_edges = 0

    for path, src in scanned.items():
        for imp in jsscan.imports_of(src):
            where = f"{_rel(spec, path)}:{imp.line}"
            if imp.spec is None:
                # An honest "cannot tell": `import(someVariable)`. Never passed silently.
                notes.append(f"{where} imports a computed specifier — not resolvable statically")
                continue
            if not imp.spec.startswith("."):
                continue         # bare specifier: Foundry core or a CDN, out of scope
            n_edges += 1
            target = resolve(path, imp.spec)
            if target is None:
                problems.append(f"{where} imports {imp.spec} — outside the module directory")
                continue
            if not target.exists():
                problems.append(f"{where} imports {imp.spec} — no such file")
                continue
            if target not in exports:
                notes.append(f"{where} imports {imp.spec} — present but not scanned")
                continue
            for name in imp.names:
                n_named += 1
                if exported(target, name):
                    continue
                have = ", ".join(sorted(exports[target])) or "(nothing)"
                kind = "await import" if imp.dynamic else "import"
                problems.append(
                    f"{where} {kind} {{ {name} }} from {imp.spec} — not exported there\n"
                    f"      {_rel(spec, target)} exports: {have}")

    # An entry point named in module.json that does not exist fails exactly the same
    # way — silently, at load — so it belongs in the same gate.
    manifest = spec.src / "module.json"
    if manifest.exists():
        data = json.loads(manifest.read_text(encoding="utf-8"))
        declared = [*data.get("esmodules", []), *data.get("styles", []),
                    *(l.get("path", "") for l in data.get("languages", []))]
        for rel in filter(None, declared):
            if not (spec.src / rel).exists():
                problems.append(f"module.json declares {rel} — no such file")

    if problems:
        _say(f"✗ {spec.name}: {len(problems)} broken import(s)")
        for p in problems:
            print(f"    {p}")
        return FAIL

    _say(f"✓ {spec.name} imports resolve ({len(files)} files, "
         f"{n_edges} local edge{'' if n_edges == 1 else 's'}, {n_named} named)")
    for n in notes:
        print(f"    ▸ {n}")
    return OK


def _check_i18n(spec: cfg.ModuleSpec) -> int:
    """Every i18n key the code asks for must exist in the module's lang file.

    Foundry does not fail on a missing key — `localize` hands back the key itself, so
    the UI reads `PENTARYN_TIES.row.remove` where a tooltip should be and nothing
    anywhere says why. Cheap to catch here; invisible everywhere else.

    The reverse direction — keys in the JSON that nothing references — is reported,
    never failed, and is split in two. A key is DEAD only when its text appears
    nowhere in the sources. When the key is reachable but only through a computed
    name (`f(labelKey, …)`, `` t(`stance.${s.key}`) ``, a helper that forwards its
    argument) it is UNVERIFIABLE, and saying so is the point: the ad-hoc version of
    this check reported exactly those as dead, and they were all live.
    """
    langs = sorted((spec.src / "lang").glob("*.json")) if (spec.src / "lang").is_dir() else []
    if not langs:
        return OK                # no lang file, nothing claimed, nothing to prove

    en = next((p for p in langs if p.stem == "en"), langs[0])
    known = jsscan.load_lang(en)
    if not known:
        _say(f"✗ {spec.name}: {_rel(spec, en)} defines no keys")
        return FAIL
    namespaces = {k.split(".", 1)[0] for k in known}

    definite: list[jsscan.Ref] = []
    prefixes: set[str] = set()
    soft: set[str] = set()
    opaque: list[jsscan.Ref] = []
    for f in _sources(spec):
        use = jsscan.key_uses(jsscan.scan(f), namespaces, set(known))
        definite += use.definite
        prefixes |= use.prefixes
        soft |= use.soft
        opaque += use.opaque

    # module.json carries keys too (a setting's `name`, a title), and they localise
    # through the same table.
    manifest = spec.src / "module.json"
    if manifest.exists():
        text = manifest.read_text(encoding="utf-8")
        for key in known:
            if f'"{key}"' in text:
                soft.add(key)

    missing = [r for r in definite if r.key not in known]
    if missing:
        _say(f"✗ {spec.name}: {len(missing)} i18n key(s) not in {_rel(spec, en)}")
        for r in sorted(missing, key=lambda r: (r.path.name, r.line)):
            print(f"    {_rel(spec, r.path)}:{r.line}  {r.key}")
        return FAIL

    used = {r.key for r in definite}
    unused = [k for k in known if k not in used]
    dead = [k for k in unused
            if k not in soft and not any(k.startswith(p) for p in prefixes)]
    unverifiable = len(unused) - len(dead)

    _say(f"✓ {spec.name} i18n: {len(used)}/{len(known)} keys referenced directly, "
         f"{unverifiable} reachable only dynamically, {len(dead)} unreferenced")
    if dead:
        # A warning, not a failure. An unreferenced key costs nothing at runtime, and
        # a half-landed feature is a perfectly good reason for one to exist today.
        print(f"    ▸ no reference found for: {', '.join(sorted(dead))}")
    if opaque:
        print(f"    ▸ {len(opaque)} call site(s) pass the key as a variable — "
              f"those keys cannot be proved either way")
    return OK


def _check_node_test(spec: cfg.ModuleSpec) -> int:
    """Run the module's own test suite. Pure geometry — Foundry can stay stopped."""
    # The suite writes straight to the real stdout while our own `print` is buffered
    # when the output is a pipe; without this the ✓ lines land after the suite's.
    sys.stdout.flush()
    runner = spec.src / "test/run.mjs"
    if not runner.exists():
        _say(f"✗ no test runner at {runner}")
        return FAIL
    if not _node_available():
        _say("✗ node is not installed — cannot run the suite")
        return FAIL
    return subprocess.run(["node", str(runner)]).returncode


_CHECKS = {
    "parse": _check_parse,
    "imports": _check_imports,
    "i18n": _check_i18n,
    "node-test": _check_node_test,
}


def check(name: str) -> int:
    """Run every gate the spec names. Cheapest and most diagnostic first.

    Stops at the first failure: past a syntax error the later gates would only report
    consequences of it, and a wall of them buries the one line that matters.
    """
    spec = cfg.MODULES[name]
    for gate in spec.check:
        if (checker := _CHECKS.get(gate)) and (rc := checker(spec)) != OK:
            return rc
    return OK


def sync(name: str) -> int:
    """Prove the sources, then copy the module into Foundry's Data/modules."""
    spec = cfg.MODULES[name]
    if (rc := check(name)) != 0:
        return rc
    if not spec.src.is_dir():
        _say(f"✗ no module at {spec.src}")
        return FAIL

    cfg.FOUNDRY_MODULES.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(spec.dst, ignore_errors=True)
    shutil.copytree(spec.src, spec.dst)
    _say(f"✓ module → {spec.dst}")
    for line in spec.after_sync:
        print(f"    {line}")
    return OK


# ── walls-only extras ─────────────────────────────────────────────────────────

def walls_wasm() -> int:
    """Build the compiled backend.

    Needs rustup plus the wasm32-unknown-unknown target:
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
        rustup target add wasm32-unknown-unknown

    Rust rather than C/C++ on purpose: no FMA contraction, no fast-math, so float
    semantics are strict IEEE-754 by default — which is what keeps the compiled
    engine bit-identical to the JS one.
    """
    src = cfg.MODULES["walls"].src
    wasm_dir = src / "wasm"
    env = {**os.environ, "PATH": f"{Path.home() / '.cargo/bin'}:{os.environ.get('PATH', '')}"}
    rc = subprocess.run(
        ["cargo", "build", "--release", "--target", "wasm32-unknown-unknown"],
        cwd=wasm_dir, env=env,
    ).returncode
    if rc != 0:
        return rc

    built = wasm_dir / "target/wasm32-unknown-unknown/release/wall_engine.wasm"
    dest = src / "wall-engine.wasm"
    shutil.copy2(built, dest)
    _say(f"✓ wall-engine.wasm ({dest.stat().st_size / 1024:.0f} KB)")
    return OK


def walls_bench(grid: str | None = None) -> int:
    """Scaling curve: at what map size does this stop being instant?"""
    bench = cfg.MODULES["walls"].src / "test/bench.mjs"
    cmd = ["node", str(bench)] + ([grid] if grid else [])
    return subprocess.run(cmd).returncode
