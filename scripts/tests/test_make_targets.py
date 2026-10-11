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
