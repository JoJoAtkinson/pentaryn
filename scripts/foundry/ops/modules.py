"""Check and install the in-house Foundry modules.

Copy, never symlink: a stale copy has to be a real, visible failure mode.

The check step exists because of how Foundry fails here — a parse error in an
esmodule fails *silently* at load time and the module simply never registers. No
error in the console, no entry in Manage Modules that looks wrong; it is just absent.
So nothing reaches Data/ until its sources have been proved.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from . import config as cfg
from .service import _say

OK, FAIL = 0, 1


def _node_available() -> bool:
    return shutil.which("node") is not None


def _check_parse(spec: cfg.ModuleSpec) -> int:
    """`node --check` every .mjs, and JSON.parse every .json the module declares."""
    if not _node_available():
        _say("▸ node not installed — skipping the syntax check")
        return OK

    for f in sorted(spec.src.glob("*.mjs")):
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


def _check_node_test(spec: cfg.ModuleSpec) -> int:
    """Run the module's own test suite. Pure geometry — Foundry can stay stopped."""
    runner = spec.src / "test/run.mjs"
    if not runner.exists():
        _say(f"✗ no test runner at {runner}")
        return FAIL
    if not _node_available():
        _say("✗ node is not installed — cannot run the suite")
        return FAIL
    return subprocess.run(["node", str(runner)]).returncode


_CHECKS = {"parse": _check_parse, "node-test": _check_node_test}


def check(name: str) -> int:
    spec = cfg.MODULES[name]
    checker = _CHECKS.get(spec.check)
    return OK if checker is None else checker(spec)


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
