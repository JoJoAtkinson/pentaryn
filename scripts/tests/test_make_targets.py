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
    ("foundry-importer-install", "scripts.foundry.ops importer-install"),
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


# ── module bundles (module-bundles-2026-10 §3.7, §3.8, S5) ───────────────────

def test_foundry_bundles_lists_and_never_sweeps():
    out = _dry("foundry-bundles")
    assert "scripts.foundry.cloud bundles" in out
    assert "bundles-gc" not in out


def test_foundry_bundles_gc_is_a_dry_run_unless_yes():
    dry = _dry("foundry-bundles-gc")
    assert "scripts.foundry.cloud bundles-gc" in dry
    assert "--yes" not in dry
    assert "scripts.foundry.cloud bundles-gc --yes" in _dry_args("foundry-bundles-gc", "YES=1")


def test_vtt_down_snapshots_after_everything_is_down():
    out = _dry("vtt-down")
    order = [out.index(s) for s in ("ops lock-check", "ops tunnel-down", "ops down",
                                    "cloud backup --reason shutdown")]
    assert order == sorted(order)


def test_help_names_the_bundle_targets_and_the_world_size():
    out = _dry_args("help")
    assert "make foundry-bundles " in out and "make foundry-bundles-gc" in out
    assert "YES=1 deletes" in out
    assert "~45 MB" in out


# ── defect wave 3 (2026-10-13): the shutdown backup belongs to foundry-down ──

def test_foundry_down_takes_the_shutdown_backup_after_the_server_stops_wave3_1():
    """Joe: the make commands back up on shutdown/restart. `foundry-down` stops the app,
    then takes the same background shutdown backup vtt-down always took."""
    out = _dry("foundry-down")
    assert out.index("ops down") < out.index("cloud backup --reason shutdown --background")
    waited = _dry_args("foundry-down", "WAIT=1")
    assert "cloud backup --reason shutdown" in waited and "--background" not in waited


@pytest.mark.parametrize("argv", [("vtt-down",), ("vtt-down", "WAIT=1")])
def test_vtt_down_backs_up_exactly_once_wave3_1(argv):
    """vtt-down reaches the backup through foundry-down; it must not take a second one.
    A regression guard, not a red-first test: vtt-down already backed up once before
    wave 3 (from its own recipe), and this pins that moving the backup into foundry-down
    did not double it."""
    out = _dry_args(*argv)
    assert out.count("scripts.foundry.cloud backup") == 1, out
    assert out.count("ops down") == 1


def test_a_restart_backs_up_once_wave3_1():
    """down then up: one shutdown backup, before the app starts again. foundry-up takes no
    pre-launch backup (only vtt-up's foundry-backup-safe does)."""
    out = _dry_args("foundry-down", "foundry-up")
    assert out.count("cloud backup --reason shutdown") == 1
    assert out.index("cloud backup --reason shutdown") < out.index("ops up")


def test_foundry_module_index_passes_check_through_wave3_2():
    """`make foundry-module-index --check`: GNU make reads `--check` as its own
    `--check-symlink-times` (-L), so it never reached the recipe and the table was
    rewritten. The target passes it through; CHECK=1 says the same thing."""
    plain = _dry("foundry-module-index")
    assert "module-index" in plain and "--check" not in plain
    assert "module-index --check" in _dry_args("foundry-module-index", "--check")
    assert "module-index --check" in _dry_args("foundry-module-index", "CHECK=1")


# `make -n` puts an `n` first in MAKEFLAGS, which hides both shapes that broke the first
# INDEX_CHECK: long options first (` --no-print-directory -L`) and no flags at all, where
# MAKEFLAGS is only the command-line assignments (`M=Lookup`). So these run make for real,
# with a second makefile that swaps OPS for a stub (recipes expand OPS when they run, so the
# later definition wins) — no `-n`, and no assignment unless the row is about one.

def _index_run(tmp_path, *argv, ops="echo OPS"):
    probe = tmp_path / "probe.mk"
    probe.write_text(f"OPS := {ops}\n", encoding="utf-8")
    return subprocess.run(["make", "-f", "Makefile", "-f", str(probe), "foundry-module-index", *argv],
                          cwd=cfg.REPO_ROOT, capture_output=True, text=True, timeout=120)


@pytest.mark.parametrize("argv", [
    ("--check",),
    ("--no-print-directory", "--check"),
    ("-s", "--no-print-directory", "--check"),
    ("-k", "-j2", "--no-print-directory", "--check"),
    ("--check", "M=Lookup"),
    ("--check", "-I", "Lib"),
    ("--check-symlink-times",),
    ("-L",),
    ("CHECK=1",),
], ids=" ".join)
def test_foundry_module_index_check_in_every_makeflags_shape_wave3_2(tmp_path, argv):
    proc = _index_run(tmp_path, *argv)
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip().splitlines()[-1] == "OPS module-index --check", proc.stdout


@pytest.mark.parametrize("argv", [
    (),
    ("WORLD=ardenford",),
    ("M=Lookup",),
    ("--no-print-directory", "WORLD=Lx"),
    ("TITLE=Pentaryn Lore", "ARGS=--kit -L"),
    ("-I", "Lib"),
    ("-s",),
    ("-j2",),
], ids=lambda a: " ".join(a) or "plain")
def test_foundry_module_index_regenerates_without_check_wave3_2(tmp_path, argv):
    """No --check asked: a capital L in an assignment or an option's argument is not -L."""
    proc = _index_run(tmp_path, *argv)
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip().splitlines()[-1] == "OPS module-index", proc.stdout


_INDEX_SHIM = """\
import sys
from pathlib import Path
sys.path.insert(0, ".")
from scripts.foundry.ops import cli, index
readme = Path(sys.argv[1])
is_current, write = index.is_current, index.write
index.is_current = lambda _readme=None, root=None: is_current(readme, root)
index.write = lambda _readme=None, root=None: write(readme, root)
sys.exit(cli.main(sys.argv[2:]))
"""


def _stale_readme(tmp_path):
    from scripts.foundry.ops import index
    readme = tmp_path / "README.md"
    readme.write_text(index.README.read_text(encoding="utf-8")
                      .replace(index.END, "| stale | row |\n" + index.END), encoding="utf-8")
    shim = tmp_path / "index_shim.py"
    shim.write_text(_INDEX_SHIM, encoding="utf-8")
    return readme, f"cd $(ROOT) && $(PY) {shim} {readme}"


def test_foundry_module_index_check_leaves_a_stale_table_wave3_2(tmp_path):
    """End to end against a throwaway README: the real ops CLI, reached through the real
    recipe, in the shape that broke (`--no-print-directory --check`)."""
    readme, ops = _stale_readme(tmp_path)
    before = readme.read_text(encoding="utf-8")
    proc = _index_run(tmp_path, "--no-print-directory", "--check", ops=ops)
    assert proc.returncode != 0, proc.stdout
    assert "module index stale" in proc.stdout
    assert readme.read_text(encoding="utf-8") == before


def test_foundry_module_index_with_an_assignment_regenerates_wave3_2(tmp_path):
    """No --check asked, but an assignment with a capital L: the table is rewritten."""
    readme, ops = _stale_readme(tmp_path)
    proc = _index_run(tmp_path, "M=Lookup", ops=ops)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "module index rewritten" in proc.stdout
    assert "| stale | row |" not in readme.read_text(encoding="utf-8")
