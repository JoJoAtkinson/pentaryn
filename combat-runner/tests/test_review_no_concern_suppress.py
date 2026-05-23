"""Lightweight review: when the LLM reviewer has nothing to flag and made
no corrections, the wall-of-text "**No issues detected.**" analysis is
suppressed entirely. Real concerns + tool-call corrections still surface.

User flow: the DM types a perfectly normal command (e.g. `2 27 melee`). The
async reviewer fires, finds nothing wrong, and currently writes a multi-
paragraph analysis ending in "No issues detected." That's noise. Cleaner:
silence when there's nothing to say.
"""
from __future__ import annotations

from gui.llm_controller import _should_suppress_review


def test_suppress_verbose_no_issues_analysis():
    text = (
        "I need to review this carefully. **Analysis:** 1. Actor & Target… "
        "2. Command: clean. 3. Magnitude check: fine. **No issues detected.** "
        "The command and its outcome are sound."
    )
    assert _should_suppress_review(text, tool_calls=[]) is True


def test_suppress_no_concerns_phrasing():
    assert _should_suppress_review("No concerns. Command looks fine.", []) is True


def test_suppress_command_is_correct_phrasing():
    assert _should_suppress_review("The command is correct and the delta is appropriate.", []) is True


def test_suppress_command_is_sound_phrasing():
    assert _should_suppress_review("Damage is sound. Target alive.", []) is True


def test_do_not_suppress_when_tool_calls_present():
    """Any actual mutation must reach the log even if the text reads 'no issues'."""
    text = "No issues with the damage type, but I'm setting HP to 0 explicitly."
    tool_calls = [{"name": "set_hp", "input": {"combatant_id": "5", "hp": 0}}]
    assert _should_suppress_review(text, tool_calls) is False


def test_do_not_suppress_brief_actionable_advisory():
    """A short note flagging a real concern stays visible."""
    text = "Wait — Marwen is a PC. Did you mean to attack the stalker instead?"
    assert _should_suppress_review(text, []) is False


def test_do_not_suppress_empty_text():
    """Empty text isn't 'suppressed' — there's nothing to suppress. The
    upstream check (`if result.text`) handles the no-log path already.
    Returning False here keeps the contract clean: this helper only fires
    for non-empty content."""
    assert _should_suppress_review("", []) is False


def test_do_not_suppress_immunity_flag():
    """A real immunity-rule flag must surface even if the surrounding text
    happens to mention 'no issues' in another sentence."""
    text = (
        "Fire damage on a fire elemental. Target has immunity to fire — "
        "applied delta should be 0, not 14."
    )
    assert _should_suppress_review(text, []) is False


def test_case_insensitive_marker_match():
    assert _should_suppress_review("NO ISSUES DETECTED. Looks Clean.", []) is True
