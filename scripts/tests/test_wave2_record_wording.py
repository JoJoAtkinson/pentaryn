"""Defect wave 3 (docs): the wave-2 records' live-check steps say what the code really does.

The wave-2 live run (context/plans/defect-wave-2-2026-10-12/README.md, "Record wording to
correct") found steps whose expected result did not match the declared behaviour. Each test
pins the corrected wording so a later edit cannot quietly put the wrong expectation back.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WAVE2 = ROOT / "context/plans/defect-wave-2-2026-10-12"


def _read(name: str) -> str:
    return (WAVE2 / name).read_text(encoding="utf-8")


def _step(text: str, start: str, end: str) -> str:
    """The text from the first `start` to the next `end` after it."""
    i = text.index(start)
    j = text.index(end, i + len(start))
    return text[i:j]


def test_kit_names_ext_3_expects_three_toasted_labels():
    """sync counts the prototype token plus each placed token: 1 + 2 = 3."""
    step = " ".join(_step(_read("kit.md"), "- **names-ext-3**", "- Every other item").split())
    assert "the toast count is 3" in step
    assert "toast count is 2" not in step


def test_ties_ui_e4_steps_match_the_declared_toggle():
    """A second press on the same face closes the card, so two quick presses end with none open."""
    block = _step(_read("ties-ui.md"), "**ties-ui-E4**", "**ties-ui-rob-7**")
    lines = [ln for ln in block.splitlines() if ln[:2] in ("1.", "2.", "3.")]
    step1 = lines[0]
    assert "twice" in step1
    assert "exactly one card is open" not in step1
    assert "never more than one card is open" in step1
    assert "no card is open afterwards" in step1


def test_riders_async_5_sets_the_type_before_retiring():
    """retireManual leaves a typeless Affinity alone, so setType has to run first."""
    step = _step(_read("riders.md"), "- **riders-async-5**", "- **riders-maint-02")
    assert step.index("setType(") < step.index("retireManual(")


def test_attunement_ext_8_detail_lists_only_missing_hooks():
    """The hooks check's detail is the list of MISSING hooks, so a healthy selftest shows none."""
    step = " ".join(_step(_read("attunement.md"), "- **EXT-8:**", "- **perf-1:**").split())
    assert "names all four hooks" not in step
    assert "detail is `null`" in step
    assert "only the missing hooks" in step
