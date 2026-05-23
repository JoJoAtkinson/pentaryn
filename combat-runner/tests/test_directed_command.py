"""Tests for MainWindow._on_command — the <who> <stream> grammar fast path.

All tests use a two-NPC EncounterState (actor + target) and call `_on_command`
directly with a `ParsedCommand` built via `gui.dispatcher.parse`. No LLM
controller is wired so the review path is a no-op and no network traffic occurs.
"""

from __future__ import annotations

import pytest

from gui.dispatcher import parse
from gui.main_window import MainWindow
from gui.state import EncounterState, NPCState


@pytest.fixture
def two_npc_encounter(tmp_path):
    """Two-NPC encounter: actor (id='1') and target (id='2')."""
    actor = NPCState(
        slug="pc-rogue", name="Vessa", max_hp=40, ac=15,
        speed="30 ft.", cr=0.0, kind="pc",
    )
    actor.id = "1"

    target = NPCState(
        slug="goblin-grunt", name="Goblin Grunt", max_hp=30, ac=13,
        speed="30 ft.", cr=0.25,
    )
    target.id = "2"

    return EncounterState(
        name="test-encounter",
        root=tmp_path,
        log_path=tmp_path / "combat.md",
        npcs=[actor, target],
    )


@pytest.fixture
def window(qtbot, two_npc_encounter):
    """MainWindow with two-NPC encounter, no LLM controller wired."""
    win = MainWindow(two_npc_encounter)
    qtbot.addWidget(win)
    return win


# ─────────── directed damage ───────────


def test_directed_damage_reduces_target_hp(window):
    """A directed damage command '2 12 dmg' subtracts 12 from target HP."""
    target = window.encounter_state.npcs[1]
    starting_hp = target.hp

    cmd = parse("2 12 dmg")
    assert cmd.kind == "command" and cmd.target_ids == ["2"]
    window._on_command(cmd)

    assert target.hp == starting_hp - 12


def test_directed_damage_with_type_tag(window):
    """'2 8 slash' applies 8 damage qualified by slashing type."""
    target = window.encounter_state.npcs[1]
    starting_hp = target.hp

    window.tabs.setCurrentIndex(0)
    window._on_command(parse("2 8 slash"))

    assert target.hp == starting_hp - 8


def test_directed_heal_increases_target_hp(window):
    """'2 6 heal' heals combatant 2 by 6."""
    target = window.encounter_state.npcs[1]
    target.member_hp[0] = 10
    window._on_command(parse("2 6 heal"))
    assert target.hp == 16


# ─────────── set_target ───────────


def test_set_target_does_not_switch_tabs(window):
    """A bare id '2' sets the sticky target WITHOUT switching tabs — the
    active tab is the ACTOR, and you set a target to then act on it from the
    actor's tab."""
    window.tabs.setCurrentIndex(0)
    cmd = parse("2")
    assert cmd.kind == "set_target"
    window._on_command(cmd)
    assert window.tabs.currentIndex() == 0   # no jump
    assert window.encounter_state.current_target == ["2"]


def test_set_target_from_non_actor_tab_stays_put(window):
    """set_target never switches tabs, whichever tab is active."""
    window.tabs.setCurrentIndex(1)
    window._on_command(parse("1"))
    assert window.tabs.currentIndex() == 1   # stays put
    assert window.encounter_state.current_target == ["1"]


# ─────────── condition ───────────


def test_directed_condition_applies(window):
    """'2 prone' toggles the prone condition on combatant 2."""
    target = window.encounter_state.npcs[1]
    window._on_command(parse("2 prone"))
    assert "prone" in target.conditions


# ─────────── unknown target ───────────


def test_unknown_target_id_does_not_crash(window):
    """A command pointing to an id not in the encounter falls back gracefully:
    no exception, no HP change."""
    target = window.encounter_state.npcs[1]
    starting_hp = target.hp

    window._on_command(parse("9 15 dmg"))  # id 9 does not exist

    assert target.hp == starting_hp


def test_unparseable_routes_without_crash(window):
    """An unparseable command routes to the LLM fallback without crashing."""
    received: list = []
    window._on_llm_fallback = lambda text, parsed=None, **kw: received.append(text)  # type: ignore
    window._on_command(parse("2 melee"))  # damage-tag with no number -> unparseable
    assert received
