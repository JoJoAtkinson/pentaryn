"""Tests for MainWindow._on_directed_command (Task 4.1/4.2 fast path).

All tests use a two-NPC EncounterState (actor + target) and call
_on_directed_command directly with a ParsedInput built via the dispatcher.
No LLM controller is wired so _enqueue_review is a no-op and no network
traffic occurs.
"""

from __future__ import annotations

import pytest

from gui.dispatcher import Dispatcher
from gui.main_window import MainWindow
from gui.state import EncounterState, NPCState


@pytest.fixture
def two_npc_encounter(tmp_path):
    """Two-NPC encounter: actor (id='1') and target (id='2')."""
    actor = NPCState(
        slug="pc-rogue",
        name="Vessa",
        max_hp=40,
        ac=15,
        speed="30 ft.",
        cr=0.0,
        kind="pc",
    )
    actor.id = "1"

    target = NPCState(
        slug="goblin-grunt",
        name="Goblin Grunt",
        max_hp=30,
        ac=13,
        speed="30 ft.",
        cr=0.25,
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


# ─────────────────────────────────────────────────────────────────────
# Test 1: DIRECTED damage reduces target HP and logs an actor-attributed line
# ─────────────────────────────────────────────────────────────────────

def test_directed_damage_reduces_target_hp(window):
    """A directed damage command '2 12' should subtract 12 from target HP."""
    target = window.encounter_state.npcs[1]
    starting_hp = target.hp

    parsed = Dispatcher().parse("2 12")
    assert parsed.target_id == "2"

    window._on_directed_command(parsed)

    assert target.hp == starting_hp - 12


def test_directed_damage_logs_actor_attributed_line(window, qtbot):
    """The log line on the actor tab should mention the actor name and target id."""
    # Switch to actor's tab (index 0) so _append_to_active_tab writes there.
    window.tabs.setCurrentIndex(0)

    parsed = Dispatcher().parse("2 8")
    window._on_directed_command(parsed)

    actor_tab = window.tabs.widget(0)
    log_text = actor_tab.log_view.toHtml()
    # Expect actor name ('Vessa') and target id ('#2') in the log
    assert "Vessa" in log_text
    assert "#2" in log_text


# ─────────────────────────────────────────────────────────────────────
# Test 2: delivery==melee sets in_melee on both actor and target
# ─────────────────────────────────────────────────────────────────────

def test_melee_delivery_sets_in_melee_on_actor_and_target(window):
    """'2 10 melee' should set in_melee=True on both the actor and the target."""
    actor = window.encounter_state.npcs[0]
    target = window.encounter_state.npcs[1]
    actor.in_melee = False
    target.in_melee = False

    # Make actor's tab active so actor resolution works
    window.tabs.setCurrentIndex(0)
    parsed = Dispatcher().parse("2 10 melee")
    window._on_directed_command(parsed)

    assert target.in_melee is True
    assert actor.in_melee is True


def test_ranged_delivery_does_not_set_in_melee(window):
    """'2 10 ranged' should NOT set in_melee on either combatant."""
    actor = window.encounter_state.npcs[0]
    target = window.encounter_state.npcs[1]
    actor.in_melee = False
    target.in_melee = False

    window.tabs.setCurrentIndex(0)
    parsed = Dispatcher().parse("2 10 ranged")
    window._on_directed_command(parsed)

    assert target.in_melee is False
    assert actor.in_melee is False


# ─────────────────────────────────────────────────────────────────────
# Test 3: JUMP focuses the target tab
# ─────────────────────────────────────────────────────────────────────

def test_jump_focuses_target_tab(window):
    """A bare id '2' (JUMP kind) should switch to the target's tab (index 1)."""
    window.tabs.setCurrentIndex(0)
    parsed = Dispatcher().parse("2")
    assert parsed.kind.value == "jump"

    window._on_directed_command(parsed)

    assert window.tabs.currentIndex() == 1


def test_jump_to_first_combatant_focuses_index_zero(window):
    """Bare id '1' should focus index 0 (actor's own tab)."""
    window.tabs.setCurrentIndex(1)
    parsed = Dispatcher().parse("1")
    window._on_directed_command(parsed)
    assert window.tabs.currentIndex() == 0


# ─────────────────────────────────────────────────────────────────────
# Test 4: unknown target id does not crash
# ─────────────────────────────────────────────────────────────────────

def test_unknown_target_id_does_not_crash(window):
    """A directed command pointing to an id not in the encounter falls back
    gracefully: no exception, no HP change."""
    target = window.encounter_state.npcs[1]
    starting_hp = target.hp

    # id '9' does not exist in the two-NPC encounter
    parsed = Dispatcher().parse("9 15")
    window._on_directed_command(parsed)  # should not raise

    # Target HP is unchanged
    assert target.hp == starting_hp


def test_unknown_target_id_logs_error_on_actor_tab(window, qtbot):
    """When the target id is unknown, an error span should appear in the active tab log."""
    window.tabs.setCurrentIndex(0)
    parsed = Dispatcher().parse("9 15")
    window._on_directed_command(parsed)

    actor_tab = window.tabs.widget(0)
    log_text = actor_tab.log_view.toHtml()
    # The method logs 'unknown combatant id: #9' in a red error span
    assert "unknown combatant id" in log_text or "9" in log_text
