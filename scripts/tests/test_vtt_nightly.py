"""The 03:00 nightly is BOSS/WSL-only: off it, every entry point refuses cleanly.

Nothing here runs the real job: the script is copied into a tmp repo (so its log lands
there) and stopped at the host guard by a fake `uname`; the make targets are stopped at
vtt-nightly-host-check by a POWERSHELL that does not exist.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from scripts.foundry.ops import config as cfg

ROOT = Path(cfg.REPO_ROOT)
SCRIPT = ROOT / "automation/bin/vtt-nightly.sh"
PS1 = ROOT / "automation/windows/register-vtt-nightly.ps1"


def test_the_nightly_script_refuses_off_linux_with_a_finished_line(tmp_path):
    repo = tmp_path / "repo"
    (repo / "automation/bin").mkdir(parents=True)
    script = repo / "automation/bin/vtt-nightly.sh"
    shutil.copy(SCRIPT, script)
    home = tmp_path / "home"
    (home / ".local/bin").mkdir(parents=True)
    fake = home / ".local/bin/uname"           # the script's PATH starts at ~/.local/bin
    fake.write_text("#!/bin/sh\necho Darwin\n")
    fake.chmod(0o755)
    env = {**os.environ, "HOME": str(home), "DRY": "1"}
    proc = subprocess.run(["bash", str(script)], env=env, capture_output=True, text=True,
                          timeout=30)
    assert proc.returncode == 75
    logs = list((repo / ".state/logs").glob("vtt-nightly-*.log"))
    lines = logs[0].read_text().splitlines()
    assert "BOSS/WSL-only" in lines[-2]
    assert lines[-1].endswith("finished rc=75")
    assert not (repo / ".run/vtt-nightly.lock").exists()


@pytest.mark.skipif(shutil.which("make") is None, reason="make not installed")
@pytest.mark.parametrize("target", ["vtt-nightly", "vtt-nightly-dry", "vtt-nightly-register",
                                    "vtt-nightly-unregister"])
def test_the_nightly_make_targets_say_boss_only_off_wsl(tmp_path, target):
    proc = subprocess.run(["make", "--no-print-directory", target,
                           f"POWERSHELL={tmp_path / 'no-powershell.exe'}"],
                          cwd=ROOT, capture_output=True, text=True, timeout=30)
    assert proc.returncode != 0
    assert "BOSS/WSL only" in proc.stdout


def test_the_register_script_is_pure_ascii():
    """Windows PowerShell 5.1 reads a BOM-less .ps1 as cp1252: an em-dash in a string
    decodes to a closing smart quote and the whole file fails to parse."""
    bad = [i for i, line in enumerate(PS1.read_bytes().splitlines(), 1)
           if any(b > 0x7F for b in line)]
    assert bad == []
