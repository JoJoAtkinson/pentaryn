"""Wave 3 walls-retire (2026-10-13): Joe retired pentaryn-walls — he walls scenes with prefabs.

The source stays in the repo; every doc a reader lands on says it is retired, so nobody follows
an old "enable it on a scratch world" step back into syncing it."""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.repo


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def _read_this_when(text: str) -> str:
    start = text.index("**Read this when:**")
    return text[start:text.index("\n\n", start)]


@pytest.mark.parametrize("rel", ["context/foundry/walls.md", "foundry/module/pentaryn-walls/README.md"])
def test_the_walls_docs_open_on_retired(rel):
    text = _read(rel)
    assert "\nstatus: retired\n" in text.split("\n---", 1)[0] + "\n", rel
    line = _read_this_when(text)
    assert "retired 2026-10-13" in line and "prefabs" in line, rel


def test_pentaryn_md_module_list_says_retired():
    text = _read("context/pentaryn.md")
    (row,) = [ln for ln in text.splitlines() if ln.startswith("| `pentaryn-walls` |")]
    assert "Retired 2026-10-13" in row and "prefabs" in row
    assert "`pentaryn-walls` 0.2.0 is retired (2026-10-13" in text


def test_the_foundry_router_marks_walls_retired():
    text = _read("context/foundry/README.md")
    (row,) = [ln for ln in text.splitlines() if ln.startswith("| Completing hand-drawn walls")]
    assert "retired 2026-10-13" in row
