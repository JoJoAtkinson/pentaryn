"""Universal/global actions tests.

Verifies the v0.5 contract:
  - `combat_actions_db.list_actions(npc=...)` includes scope:global rows
  - All 8 starter universal actions are present
  - Action chips render globals in their own labeled section (visually
    segregated from per-NPC actions)
  - A global action can be dispatched from any NPC's tab via verb match
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(_SCRIPTS))
from combat_actions_db import list_actions  # noqa: E402


STARTER_GLOBALS = {"push", "grapple", "shove_prone", "disengage", "dodge", "dash", "help", "hide"}


def test_eight_starter_globals_exist():
    """All 8 universal actions must be in the DB after v0.5."""
    records = list_actions(npc="glacier-stalker")
    global_names = {a["action"] for a in records if a.get("scope") == "global"}
    assert STARTER_GLOBALS <= global_names, (
        f"missing globals: {STARTER_GLOBALS - global_names}"
    )


def test_list_actions_appends_globals_for_any_npc():
    """Every NPC sees the same global action set, even one with zero per-NPC actions."""
    a = list_actions(npc="glacier-stalker")
    b = list_actions(npc="aelric-frostweaver")
    c = list_actions(npc="gnoll-pack")
    globals_a = {x["action"] for x in a if x.get("scope") == "global"}
    globals_b = {x["action"] for x in b if x.get("scope") == "global"}
    globals_c = {x["action"] for x in c if x.get("scope") == "global"}
    assert globals_a == globals_b == globals_c
    assert STARTER_GLOBALS <= globals_a


def test_include_globals_false_suppresses():
    """Opt-out: passing include_globals=False returns only per-NPC actions."""
    records = list_actions(npc="glacier-stalker", include_globals=False)
    assert all(r.get("scope") != "global" for r in records)
    # And the stalker's actual actions are still there
    assert any(r["action"] == "multiattack" for r in records)


def test_per_npc_actions_have_no_scope_global():
    """Sanity: existing per-NPC actions in the DB should not be tagged
    scope:global accidentally."""
    records = list_actions(npc="glacier-stalker", include_globals=False)
    for r in records:
        assert r.get("scope") != "global"


def test_action_chips_segregates_globals(qtbot):
    """ActionChipGrid renders globals AFTER per-NPC actions with a divider."""
    from PySide6.QtWidgets import QLabel
    from gui.widgets.action_chips import ActionChipGrid

    grid = ActionChipGrid(cols=2)
    qtbot.addWidget(grid)
    grid.set_actions(list_actions(npc="glacier-stalker"))

    # Chip render order: per-NPC first, then globals. Sanity-check by finding
    # the global-action chips and asserting their actions match STARTER_GLOBALS.
    chips = grid.chips()
    global_chip_names = {c.action_name for c in chips if c.is_global}
    assert STARTER_GLOBALS <= global_chip_names

    # The divider QLabel ("— Global actions —") should be present
    divider_labels = [w for w in grid.findChildren(QLabel) if "Global actions" in (w.text() or "")]
    assert divider_labels, "expected a 'Global actions' divider label"


def test_dispatcher_resolves_global_verb(qtbot):
    """Typing `dodge` in a stalker tab should match the global dodge action,
    not need an LLM fallback."""
    from gui.dispatcher import Dispatcher, InputKind

    actions = list_actions(npc="glacier-stalker")
    d = Dispatcher()
    parsed = d.parse("dodge", available_actions=actions)
    assert parsed.kind is InputKind.ACTION
    assert parsed.action_name == "dodge"


def test_dispatcher_resolves_grapple_verb(qtbot):
    from gui.dispatcher import Dispatcher, InputKind
    actions = list_actions(npc="aelric-frostweaver")
    d = Dispatcher()
    parsed = d.parse("grab", available_actions=actions)
    assert parsed.kind is InputKind.ACTION
    assert parsed.action_name == "grapple"
