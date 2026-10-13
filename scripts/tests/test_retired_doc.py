"""context/foundry/retired.md — how to bring back an addon Joe retired and removed from the repo.

Walls (pentaryn-walls) is the first: retired 2026-10-13 (Joe uses prefabs), removed from the
repo the same day, an exact copy on branch `archive/pentaryn-walls`. The page must name the
branch and the removal commit, and say how to restore it; the routers must link it.
"""

from __future__ import annotations

import re
import shutil
import subprocess

import pytest

from scripts.foundry.ops import config as cfg

pytestmark = pytest.mark.repo
ROOT = cfg.REPO_ROOT
DOC = ROOT / "context/foundry/retired.md"


def _walls_section() -> str:
    text = DOC.read_text(encoding="utf-8")
    m = re.search(r"^## [^\n]*walls[^\n]*$(.*?)(?=^## |\Z)", text, re.M | re.S | re.I)
    assert m, "retired.md has a walls section"
    return m.group(1)


def test_the_page_opens_on_read_this_when():
    text = DOC.read_text(encoding="utf-8")
    (line,) = [ln for ln in text.splitlines() if ln.startswith("**Read this when:**")]
    assert "retired" in line and "back" in line


def test_the_walls_section_names_the_archive_and_how_to_restore():
    sec = _walls_section()
    for needle in ("archive/pentaryn-walls", "git revert", "git checkout origin/archive/pentaryn-walls --",
                   "game.pentaryn.walls.preview", "prefabs", "2026-10-13", "WASM",
                   "make foundry-walls-sync", "Manage Modules"):
        assert needle in sec, needle


def test_the_removal_sha_is_the_removal_commit():
    shas = re.findall(r"\b[0-9a-f]{40}\b", _walls_section())
    assert shas, "the full removal SHA is written down"
    if shutil.which("git") is None:
        pytest.skip("git not installed")
    for sha in set(shas):
        proc = subprocess.run(["git", "log", "-1", "--format=%s", sha], cwd=ROOT,
                              capture_output=True, text=True)
        if proc.returncode != 0:
            pytest.skip(f"{sha} not in this clone (shallow?)")
        assert proc.stdout.startswith("chore(walls): remove retired walls addon"), proc.stdout


def test_restore_names_the_remote_ref_a_clone_actually_has():
    """A normal clone has origin/archive/pentaryn-walls, not a local archive/pentaryn-walls."""
    sec = _walls_section()
    assert not re.search(r"git checkout archive/", sec), "bare branch name fails in a fresh clone"


def test_un_retiring_lists_the_tests_that_pin_walls_retired():
    sec = _walls_section()
    for test in ("test_help_offers_no_sync_for_a_retired_module_walls_retire",
                 "test_walls_is_retired_and_not_syncable_walls_retire",
                 "test_module_sync_does_not_offer_walls_walls_retire",
                 "test_sync_hint",
                 "test_a_retired_module_is_never_drift_walls_retire",
                 "test_retired_reads_the_ops_registry_walls_retire",
                 "test_risk_says_a_retired_module_is_never_synced_walls_retire"):
        assert test in sec, test


@pytest.mark.parametrize("router", ["context/foundry/README.md", "context/pentaryn.md"])
def test_the_routers_link_it(router):
    text = (ROOT / router).read_text(encoding="utf-8")
    assert re.search(r"\]\((?:foundry/)?retired\.md\)", text), router
