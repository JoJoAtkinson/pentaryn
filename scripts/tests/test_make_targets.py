"""Every module's make targets resolve to the right ops command (python-tooling-1).

`make -n` only prints recipes, so this runs nothing. Written against the hand-kept
per-module lines first; the pattern rules that replace them must pass it unchanged.
"""

from __future__ import annotations

import shutil
import subprocess

import pytest

from scripts.foundry.ops import config as cfg

pytestmark = [
    pytest.mark.repo,
    pytest.mark.skipif(shutil.which("make") is None, reason="make not installed"),
]

# The modules whose targets existed before the pattern rules: everything registered
# except walls (its check target is foundry-walls-test), importer (staged by the actor
# pipeline) and pings (registered later, python-tooling-3).
_HAND_KEPT = sorted(set(cfg.MODULES) - {"walls", "importer", "pings"})


def _dry(target: str) -> str:
    proc = subprocess.run(["make", "-n", target], cwd=cfg.REPO_ROOT,
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, f"make -n {target}: {proc.stderr}"
    return proc.stdout


@pytest.mark.parametrize("module", _HAND_KEPT)
def test_module_check_target(module):
    assert f"module-check {module}" in _dry(f"foundry-{module}-check")


@pytest.mark.parametrize("module", _HAND_KEPT)
def test_module_sync_target(module):
    assert f"module-sync {module}" in _dry(f"foundry-{module}-sync")


@pytest.mark.parametrize("target, expect", [
    ("foundry-walls-test", "module-check walls"),
    ("foundry-walls-sync", "module-sync walls"),
    ("foundry-walls-wasm", "walls-wasm"),
    ("foundry-walls-bench", "walls-bench"),
    ("foundry-sync", "scripts.foundry.ops stage"),
    ("foundry-adjustments-check", "scripts.foundry.update.adjustments --exposure"),
    ("foundry-admin-check", "admin_password"),
])
def test_explicit_targets_keep_their_recipes(target, expect):
    assert expect in _dry(target)


# ── added with the pattern rules (python-tooling-1, -8; W4) ──────────────────

@pytest.mark.parametrize("module", sorted(cfg.MODULES))
def test_every_registered_module_has_a_check_target(module):
    assert f"module-check {module}" in _dry(f"foundry-{module}-check")


@pytest.mark.parametrize("target, expect", [
    ("foundry-pings-sync", "module-sync pings"),
    ("foundry-walls-check", "module-check walls"),
    ("foundry-modules-check", "module-check --all"),
    ("foundry-lib-check", "node foundry/lib/test/run.mjs"),
    ("foundry-lib-vendor", "module-vendor sync --all"),
    ("foundry-conformance", "module-conformance"),
    ("test", "pytest -q"),
])
def test_new_targets(target, expect):
    assert expect in _dry(target)


def test_parameterised_targets():
    def dry(*argv):
        return subprocess.run(["make", "-n", *argv], cwd=cfg.REPO_ROOT, capture_output=True,
                              text=True, timeout=30)
    assert "module-vendor sync names" in dry("foundry-lib-vendor", "M=names").stdout
    assert "module-conformance --module names --markdown" in dry(
        "foundry-conformance", "M=names", "MD=1").stdout
    assert "module-check --all --json" in dry("foundry-modules-check", "JSON=1").stdout
    out = dry("foundry-module-new", "M=demo", "TITLE=Pentaryn Demo", "TIER=small").stdout
    assert 'module-new demo --title "Pentaryn Demo" --tier small' in out
    refused = dry("foundry-module-new")
    assert refused.returncode != 0 and "M=<short> is required" in refused.stderr


def test_check_all_includes_tests_and_modules():
    out = _dry("check-all")
    for expect in ("check_context.py", "check_lore_links.py", "pytest -q",
                   "foundry/lib/test/run.mjs", "module-check --all"):
        assert expect in out, expect
