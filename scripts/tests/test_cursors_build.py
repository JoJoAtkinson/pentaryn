"""The cursor build tool and its icon sources, outside the module (cursors guide step 7).

`build.mjs --check-sources` proves every KEYS source exists without @resvg; the credits check is
finding -35's recipe: every credited alternate (`src/alt-*.svg`) is named in `src/CREDITS.md`.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
TOOL = REPO / "scripts" / "foundry" / "cursors"
MODULE = REPO / "foundry" / "module" / "pentaryn-cursors"


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_build_check_sources_passes():
    run = subprocess.run(["node", str(TOOL / "build.mjs"), "--check-sources"],
                         capture_output=True, text=True, timeout=60)
    assert run.returncode == 0, run.stdout + run.stderr
    assert "all" in run.stdout and "present" in run.stdout


def test_every_source_and_alternate_is_credited():
    credits = (TOOL / "src" / "CREDITS.md").read_text(encoding="utf-8")
    svgs = sorted(p.name for p in (TOOL / "src").glob("*.svg"))
    assert any(n.startswith("alt-") for n in svgs), "the credited alternates are kept (finding -35)"
    assert [n for n in svgs if f"`{n}`" not in credits] == []


def test_the_module_ships_neither_the_tool_nor_the_sources():
    assert not (MODULE / "tools").exists()
    assert not (MODULE / "assets" / "src").exists()
    assert not (MODULE / "DESIGN.md").exists()
