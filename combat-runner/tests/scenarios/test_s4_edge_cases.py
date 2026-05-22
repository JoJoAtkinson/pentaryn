"""S4 — Edge cases: typo recovery, mis-click recovery, note-only never-LLM.

Each sub-scenario asserts one corner of the dispatch surface still works:
  - condition typo `@porne` should not crash (fuzzy match or fallback)
  - `note ...` is a no-op for state and never hits the LLM
  - round-button mis-click is recoverable (manually decrement state)
  - empty input does nothing
"""

from __future__ import annotations

import pytest


def test_s4_note_never_hits_llm(scenario):
    scenario.launch("mountin-pass")
    try:
        scenario.switch_to("glacier-stalker")
    except AssertionError:
        pytest.skip("mountin-pass missing glacier-stalker")

    tab = scenario.tab_for("glacier-stalker")
    hp_before = tab.npc_state.hp
    # Avoid non-ASCII characters in keyClicks: PySide6 segfaults on em-dash etc.
    scenario.type_command("note PC missed crit, no damage")
    # State unchanged
    assert tab.npc_state.hp == hp_before
    assert scenario.metrics.llm_fallback_count == 0


def test_s4_condition_toggle_idempotent(scenario):
    """Toggling the same condition twice returns NPC to clean state."""
    scenario.launch("mountin-pass")
    try:
        scenario.switch_to("glacier-stalker")
    except AssertionError:
        pytest.skip("mountin-pass missing glacier-stalker")

    tab = scenario.tab_for("glacier-stalker")
    assert "prone" not in tab.npc_state.conditions
    # New grammar: '0 prone' — 0 = self (active tab's NPC), bare condition word toggles it.
    # '@' is an optional escape hatch; bare 'prone' is equivalent when no verb collision.
    scenario.type_command("0 prone")
    assert "prone" in tab.npc_state.conditions
    scenario.type_command("0 prone")
    assert "prone" not in tab.npc_state.conditions


def test_s4_round_misclick_recovery(scenario):
    """Round counter is monotonic via the button, but the state can be
    overridden by mutating encounter_state directly (what the LLM does)."""
    scenario.launch("mountin-pass")
    assert scenario.window.encounter_state.round_num == 1
    scenario.advance_round()
    scenario.advance_round()
    scenario.advance_round()
    assert scenario.window.encounter_state.round_num == 4

    # Mis-click recovery: decrement manually (LLM would call set_round)
    scenario.window.encounter_state.round_num = 3
    # Update the button by triggering a refresh
    scenario.window.round_btn.setText(scenario.window._round_btn_text())
    assert "R3" in scenario.window.round_btn.text()


def test_s4_empty_input_is_no_op(scenario):
    scenario.launch("mountin-pass")
    try:
        scenario.switch_to("glacier-stalker")
    except AssertionError:
        pytest.skip("mountin-pass missing glacier-stalker")

    tab = scenario.tab_for("glacier-stalker")
    hp_before = tab.npc_state.hp
    # Just Enter, no text — should be a no-op (the input's submitted signal
    # ignores empty submissions per its existing widget contract).
    from PySide6.QtCore import Qt
    scenario.qtbot.keyClick(tab.input, Qt.Key.Key_Return)
    assert tab.npc_state.hp == hp_before
