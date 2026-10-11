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
    ("foundry-module-index", "module-index"),
    ("test", "pytest -q"),
    ("foundry-eval-report", "scripts.foundry.ops eval-report"),
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
    assert "eval-report --since 2026-10-01 --json" in dry(
        "foundry-eval-report", "SINCE=2026-10-01", "JSON=1").stdout
    refused = dry("foundry-module-new")
    assert refused.returncode != 0 and "M=<short> is required" in refused.stderr


def test_check_all_includes_tests_and_modules():
    out = _dry("check-all")
    for expect in ("check_context.py", "check_lore_links.py", "pytest -q",
                   "foundry/lib/test/run.mjs", "module-check --all"):
        assert expect in out, expect


# ── two hosts, one cloud (rclone-two-hosts-2026-10 §7) ───────────────────────

def _dry_args(*argv):
    proc = subprocess.run(["make", "-n", *argv], cwd=cfg.REPO_ROOT, capture_output=True,
                          text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


def test_vtt_up_boots_before_the_prelaunch_backup():
    out = _dry("vtt-up")
    order = [out.index(s) for s in ("ops lock-check", "scripts.foundry.boot choose",
                                    "cloud backup --reason prelaunch", "cloud assets",
                                    "ops up", "ops tunnel-up")]
    assert order == sorted(order)
    assert out.count("scripts.foundry.boot choose") == 1      # once, not again for foundry-up
    # never blocks on the cloud: both cloud steps are their lifecycle variants
    assert "cloud backup --reason prelaunch --if-stopped" in out
    assert "cloud assets --if-reachable" in out


def test_foundry_up_runs_the_boot_step_and_marks_it_done():
    out = _dry("foundry-up")
    assert out.index("scripts.foundry.boot choose") < out.index("PENTARYN_BOOT_DONE=1")
    assert "--from" not in out


def test_from_is_passed_to_the_boot_step():
    assert "boot choose --from latest" in _dry_args("foundry-up", "FROM=latest")
    assert "boot choose --from local" in _dry_args("vtt-up", "FROM=local")
    name = "world-2026-10-11-030412-fvtt14.369-mac.tar.gz"
    assert f"boot choose --from {name}" in _dry_args("foundry-boot", f"FROM={name}")


def test_foundry_boot_alone_is_runnable():
    assert "scripts.foundry.boot choose" in _dry("foundry-boot")


@pytest.mark.parametrize("target, expect", [
    ("foundry-prune-untagged", "scripts.foundry.cloud prune-untagged"),
    ("foundry-cloud", "scripts.foundry.cloud status"),
    ("foundry-restore", "scripts.foundry.cloud restore"),
    ("vtt-update-install", 'host require-primary "the auto-updater"'),
    ("foundry-admin-key", "host.clipboard"),
])
def test_two_host_targets(target, expect):
    assert expect in _dry(target)


def test_clipboard_targets_never_name_pbcopy_directly():
    for target in ("foundry-key", "foundry-admin-key"):
        assert "pbcopy" not in _dry(target)
