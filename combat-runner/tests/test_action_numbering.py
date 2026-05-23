"""Tests for gui/action_numbering — panel hotkey numbering.

NPC-specific actions number 1, 2, 3, …; global actions get the fixed
GLOBAL_ACTION_BASE (111), +1, +2, … so a global is the same number on every
combatant's tab and never collides with an NPC's 1..N.
"""

from __future__ import annotations

from gui.action_numbering import (
    GLOBAL_ACTION_BASE,
    panel_number,
    resolve_panel_number,
)


def _surface() -> list[dict]:
    """A canonically-ordered surface: NPC-specific actions, then globals."""
    return [
        {"action": "multiattack"},
        {"action": "frozen_bile"},
        {"action": "glacial_roar"},
        {"action": "push", "scope": "global"},
        {"action": "grapple", "scope": "global"},
    ]


def test_global_action_base_is_111():
    assert GLOBAL_ACTION_BASE == 111


def test_panel_number_npc_actions_count_from_one():
    s = _surface()
    assert panel_number(s, 0) == 1
    assert panel_number(s, 1) == 2
    assert panel_number(s, 2) == 3


def test_panel_number_global_actions_count_from_111():
    s = _surface()
    assert panel_number(s, 3) == 111
    assert panel_number(s, 4) == 112


def test_resolve_panel_number_round_trips():
    s = _surface()
    for i in range(len(s)):
        n = panel_number(s, i)
        assert resolve_panel_number(s, n) is s[i]


def test_resolve_panel_number_out_of_range_returns_none():
    s = _surface()
    assert resolve_panel_number(s, 4) is None        # gap between 3 and 111
    assert resolve_panel_number(s, 99) is None       # past the NPC actions
    assert resolve_panel_number(s, 113) is None      # past the globals
    assert resolve_panel_number(s, 0) is None        # 1-based — 0 is invalid


def test_numbering_with_only_globals():
    """A surface of only global actions still numbers them from 111."""
    s = [{"action": "push", "scope": "global"},
         {"action": "grapple", "scope": "global"}]
    assert panel_number(s, 0) == 111
    assert panel_number(s, 1) == 112
    assert resolve_panel_number(s, 111)["action"] == "push"
    assert resolve_panel_number(s, 1) is None        # no NPC-specific actions
