"""Tests for Task 3.1 — kind-aware action area in NPCTab.

Verifies that:
- PC tabs render the generic player action buttons instead of the NPC action grid
- NPC tabs still render the action grid as before
- Player action chip handlers mutate state correctly (Dodge, Disengage, Retreat)
- Retreat + Disengage suppresses OA event; bare Retreat fires move_away
- command_requested signal fires when the user submits a command
- pinned_notes (public) appear in the status strip; private (_-prefixed) do not
"""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def pc_state():
    from gui.state import NPCState
    return NPCState(
        slug="pc-1",
        name="Vessa",
        max_hp=31,
        ac=15,
        speed="30 ft.",
        cr=0.0,
        kind="pc",
        id="1",
    )


@pytest.fixture
def npc_state():
    from gui.state import NPCState
    return NPCState(
        slug="goblin",
        name="Goblin",
        max_hp=7,
        ac=13,
        speed="30 ft.",
        cr=0.25,
    )


# ─────────────────────────────────────────────────────
# Action area — structural checks
# ─────────────────────────────────────────────────────

def test_pc_tab_has_no_action_grid(qtbot, pc_state):
    """PC tabs must set action_grid = None (no DB-driven chip grid)."""
    from gui.npc_tab import NPCTab
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    assert tab.action_grid is None


def test_pc_tab_has_player_action_buttons(qtbot, pc_state):
    """Every player action name from _PLAYER_ACTIONS must appear as a button."""
    from PySide6.QtWidgets import QPushButton

    from gui.npc_tab import NPCTab, _PLAYER_ACTIONS
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    labels = {btn.text() for btn in tab.findChildren(QPushButton)}
    for action in _PLAYER_ACTIONS:
        assert action in labels, f"Missing player action button: {action}"


def test_npc_tab_action_grid_present(qtbot, npc_state, sample_actions):
    """NPC tabs must still have a populated action_grid."""
    from gui.npc_tab import NPCTab
    tab = NPCTab(npc_state=npc_state, actions=sample_actions, log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    assert tab.action_grid is not None


# ─────────────────────────────────────────────────────
# Player action handlers
# ─────────────────────────────────────────────────────

def test_dodge_applies_condition(qtbot, pc_state):
    """Clicking Dodge applies 'dodging' to the PC's conditions."""
    from gui.npc_tab import NPCTab
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    tab._on_player_action("Dodge")
    assert "dodging" in pc_state.conditions


def test_disengage_sets_pinned_flag(qtbot, pc_state):
    """Clicking Disengage writes '_disengaging' into pinned_notes."""
    from gui.npc_tab import NPCTab
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    tab._on_player_action("Disengage")
    assert "_disengaging" in pc_state.pinned_notes


def test_retreat_clears_disengaging_flag_no_event(qtbot, pc_state):
    """Disengage then Retreat: OA event must NOT fire; _disengaging is cleared."""
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab

    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)

    pc_state.in_melee = True
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"),
                 event_bus=bus)
    qtbot.addWidget(tab)

    tab._on_player_action("Disengage")
    tab._on_player_action("Retreat")

    assert received == [], "Disengage should suppress OA move_away event"
    assert "_disengaging" not in pc_state.pinned_notes


def test_retreat_in_melee_fires_move_away(qtbot, pc_state):
    """Retreat without Disengage while in_melee=True fires a move_away event."""
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab

    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)

    pc_state.in_melee = True
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"),
                 event_bus=bus)
    qtbot.addWidget(tab)

    tab._on_player_action("Retreat")

    assert len(received) == 1, "Expected exactly one move_away event"


def test_retreat_clears_in_melee(qtbot, pc_state):
    """Retreat (with or without Disengage) must set in_melee=False."""
    from gui.npc_tab import NPCTab

    pc_state.in_melee = True
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)

    tab._on_player_action("Retreat")

    assert pc_state.in_melee is False


# ─────────────────────────────────────────────────────
# command_requested signal
# ─────────────────────────────────────────────────────

def test_directed_command_emits_signal(qtbot, pc_state):
    """Typing a directed command (e.g. '3 12 fire') emits command_requested
    carrying a `command`-kind ParsedCommand targeting id 3."""
    from gui.npc_tab import NPCTab

    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)

    received = []
    tab.command_requested.connect(received.append)

    tab._on_submitted("3 12 fire")

    assert len(received) == 1
    assert received[0].kind == "command"
    assert received[0].target_ids == ["3"]


def test_jump_command_emits_command_signal(qtbot, pc_state):
    """A bare id ('3') is a set_target command; it also emits command_requested."""
    from gui.npc_tab import NPCTab

    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)

    received = []
    tab.command_requested.connect(received.append)

    tab._on_submitted("3")

    assert len(received) == 1
    assert received[0].kind == "set_target"
    assert received[0].target_ids == ["3"]


# ─────────────────────────────────────────────────────
# pinned_notes in status strip
# ─────────────────────────────────────────────────────

def test_pinned_notes_shown_in_status(qtbot, pc_state):
    """Public pinned notes (no leading _) appear in the status label text."""
    from gui.npc_tab import NPCTab

    pc_state.pinned_notes = ["taunted"]
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)

    assert "taunted" in tab.status_label.text()


def test_private_pinned_notes_not_shown(qtbot, pc_state):
    """Private pinned notes (leading _) must NOT appear in the status label text."""
    from gui.npc_tab import NPCTab

    pc_state.pinned_notes = ["_disengaging"]
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)

    assert "_disengaging" not in tab.status_label.text()


def test_multiple_public_notes_shown(qtbot, pc_state):
    """Multiple public notes are all shown in the status label."""
    from gui.npc_tab import NPCTab

    pc_state.pinned_notes = ["concentrating", "hasted"]
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)

    text = tab.status_label.text()
    assert "concentrating" in text
    assert "hasted" in text


def test_mixed_notes_only_public_shown(qtbot, pc_state):
    """Mixed list: only non-underscore-prefixed notes appear in the status label."""
    from gui.npc_tab import NPCTab

    pc_state.pinned_notes = ["_disengaging", "taunted"]
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)

    text = tab.status_label.text()
    assert "taunted" in text
    assert "_disengaging" not in text


# ─────────────────────────────────────────────────────
# Fix 1: Disengage-active Retreat clears in_melee
# ─────────────────────────────────────────────────────

def test_retreat_disengage_active_clears_in_melee(qtbot, pc_state):
    """Retreat while _disengaging is set must clear in_melee even though no
    move_away event fires (the early-return path)."""
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab

    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)

    pc_state.in_melee = True
    pc_state.pinned_notes = ["_disengaging"]
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"),
                 event_bus=bus)
    qtbot.addWidget(tab)

    tab._player_action_retreat()

    assert pc_state.in_melee is False, "Disengage-active Retreat must set in_melee=False"
    assert received == [], "Disengage-active Retreat must not fire move_away event"


# ─────────────────────────────────────────────────────
# Generic player actions emit state_changed / write log
# ─────────────────────────────────────────────────────

@pytest.mark.parametrize("action_name", ["Attack", "Dash", "Help", "Hide", "Ready"])
def test_generic_player_action_emits_state_changed(qtbot, pc_state, action_name):
    """Generic player actions (Attack, Dash, Help, Hide, Ready) go through
    _on_player_action, emit state_changed, and write a log line without error."""
    from gui.npc_tab import NPCTab

    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)

    state_changed_count = []
    tab.state_changed.connect(lambda: state_changed_count.append(1))

    tab._on_player_action(action_name)

    assert len(state_changed_count) == 1, (
        f"{action_name}: expected state_changed to fire exactly once"
    )
    log_html = tab.log_view.toHtml()
    assert action_name in log_html, f"{action_name}: expected action name in combat log"


# ─────────────────────────────────────────────────────
# NPC tabs must not regress
# ─────────────────────────────────────────────────────

def test_npc_tab_refresh_does_not_crash(qtbot, npc_state, sample_actions):
    """_refresh on an NPC tab (action_grid != None) must work unchanged."""
    from gui.npc_tab import NPCTab

    tab = NPCTab(npc_state=npc_state, actions=sample_actions, log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    # Should not raise
    tab._refresh()


def test_pc_tab_refresh_does_not_crash(qtbot, pc_state):
    """_refresh on a PC tab (action_grid is None) must not raise."""
    from gui.npc_tab import NPCTab

    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    # Should not raise
    tab._refresh()


# ─────────────────────────────────────────────────────
# Actor attribution in combat log (Change 7)
# ─────────────────────────────────────────────────────

def test_damage_log_includes_actor_name(qtbot, npc_state):
    """After a damage effect, the combat log must contain the NPC's name.

    Ported from _apply_damage to effects.apply_effect (the production path).
    The fragment produced by apply_effect already contains the NPC name.
    """
    from gui.command_model import Effect
    from gui.effects import apply_effect
    from gui.npc_tab import NPCTab
    from gui.state import EncounterState

    npc_state.id = "9"  # assign a stable id so combatant_by_id can resolve it
    state = EncounterState(name="test", root=Path("/tmp"), log_path=Path("/tmp/log.md"), npcs=[npc_state])
    effect = Effect(kind="amount", amount=3)
    fragments = apply_effect(state, effect, target_ids=["9"], actor=None)

    tab = NPCTab(npc_state=npc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    for frag in fragments:
        tab._append_log(frag)

    log_html = tab.log_view.toHtml()
    assert npc_state.name in log_html, (
        f"Expected actor name '{npc_state.name}' in combat log after damage"
    )


def test_heal_log_includes_actor_name(qtbot, npc_state):
    """After a heal effect, the combat log must contain the NPC's name.

    Ported from _apply_heal to effects.apply_effect (the production path).
    """
    from gui.command_model import Effect
    from gui.effects import apply_effect
    from gui.npc_tab import NPCTab
    from gui.state import EncounterState

    # Damage first so there is HP to restore
    npc_state.apply_damage(4)
    npc_state.id = "9"  # assign a stable id so combatant_by_id can resolve it
    state = EncounterState(name="test", root=Path("/tmp"), log_path=Path("/tmp/log.md"), npcs=[npc_state])
    effect = Effect(kind="amount", amount=2, amount_tags={"direction": "heal"})
    fragments = apply_effect(state, effect, target_ids=["9"], actor=None)

    tab = NPCTab(npc_state=npc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    for frag in fragments:
        tab._append_log(frag)

    log_html = tab.log_view.toHtml()
    assert npc_state.name in log_html, (
        f"Expected actor name '{npc_state.name}' in combat log after heal"
    )


# ─────────────────────────────────────────────────────
# Fix 2 — _disengaging flag clears on round advance
# ─────────────────────────────────────────────────────

def test_disengaging_flag_cleared_on_round_advance(qtbot, pc_state):
    """A stale _disengaging flag must be cleared when the round advances,
    so a future Retreat in the next round correctly fires an OA event."""
    from gui.event_bus import Event, EventBus
    from gui.npc_tab import NPCTab

    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)

    pc_state.in_melee = True
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"),
                 event_bus=bus)
    qtbot.addWidget(tab)

    # Player Disengages but does NOT Retreat this turn
    tab._on_player_action("Disengage")
    assert "_disengaging" in pc_state.pinned_notes, "Flag should be set after Disengage"

    # Round advances (DM clicks next round)
    round_event = Event(kind="round_advanced", payload={"round_num": 2})
    tab._on_round_event(round_event)

    assert "_disengaging" not in pc_state.pinned_notes, (
        "_disengaging flag must be cleared on round advance"
    )

    # Retreat in the NEW round should now fire the OA event (no stale protection)
    pc_state.in_melee = True  # player is still in melee
    tab._on_player_action("Retreat")
    assert len(received) == 1, (
        "Retreat after round advance must fire move_away (stale Disengage expired)"
    )


# ─────────────────────────────────────────────────────
# Fix 3 — verb fuzzy-match for player actions
# ─────────────────────────────────────────────────────

def _pc_window(qtbot, tmp_path, pc_state):
    """Single-PC MainWindow — player actions resolve through MainWindow._on_command."""
    from gui.main_window import MainWindow
    from gui.state import EncounterState

    es = EncounterState(
        name="t", root=Path(tmp_path), log_path=Path(tmp_path) / "c.md",
        npcs=[pc_state],
    )
    win = MainWindow(es)
    qtbot.addWidget(win)
    return win


def test_typing_dodge_on_pc_tab_triggers_dodge(qtbot, tmp_path, pc_state):
    """`0 dodge` on a PC tab triggers the Dodge action (dodging condition)."""
    win = _pc_window(qtbot, tmp_path, pc_state)
    win.tabs.currentWidget()._on_submitted("0 dodge")
    assert "dodging" in pc_state.conditions, (
        "'0 dodge' on a PC tab must apply the dodging condition"
    )


def test_typing_disengage_on_pc_tab_sets_flag(qtbot, tmp_path, pc_state):
    """`0 disengage` (exact match) triggers the Disengage action."""
    win = _pc_window(qtbot, tmp_path, pc_state)
    win.tabs.currentWidget()._on_submitted("0 disengage")
    assert "_disengaging" in pc_state.pinned_notes


def test_typing_attack_prefix_on_pc_tab(qtbot, tmp_path, pc_state):
    """`0 att` (prefix of 'Attack') triggers the Attack action on a PC tab."""
    win = _pc_window(qtbot, tmp_path, pc_state)
    tab = win.tabs.currentWidget()
    tab._on_submitted("0 att")
    log_html = tab.log_view.toHtml()
    assert "Attack" in log_html


def test_npc_tab_verb_match_unaffected(qtbot, npc_state, sample_actions):
    """Fuzzy-match of DB actions on NPC tabs must still resolve via the grammar."""
    from gui.dispatcher import parse
    from gui.main_window import MainWindow

    # 'pounce' is an exact action name in sample_actions — it should parse as
    # a command carrying an action effect.
    c = parse("pounce")
    assert c.kind == "command"
    assert c.effects[0].kind == "action"
    assert c.effects[0].action_token == "pounce"
    # The action token resolves against the DB action surface.
    assert MainWindow._resolve_action_token("pounce", sample_actions) == "pounce"
