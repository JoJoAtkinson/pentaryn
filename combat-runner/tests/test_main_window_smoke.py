"""End-to-end smoke tests for v0.1 main window.

These exercise the full launch path headlessly: discover encounters,
build a real EncounterState, instantiate MainWindow, run a few commands
through the input, verify state updates.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from PySide6.QtCore import Qt

from gui.app import build_main_window
from gui.encounter_picker import discover_encounters
from gui.main_window import MainWindow
from gui.npc_tab import NPCTab


@pytest.fixture
def mountin_pass_window(qtbot) -> MainWindow:
    """Build a real MainWindow for the mountin-pass encounter."""
    encounters = discover_encounters()
    pick = next((e for e in encounters if e.name == "mountin-pass"), None)
    if pick is None:
        pytest.skip("mountin-pass encounter not discoverable from this checkout")
    counts = {npc.slug: 1 for npc in pick.npcs}
    win = build_main_window(pick, counts)
    qtbot.addWidget(win)
    return win


def test_window_constructs_with_real_encounter(mountin_pass_window):
    win = mountin_pass_window
    assert win.tabs.count() >= 1
    assert win.encounter_state.round_num == 1
    # Tab 0 is a real NPCTab
    assert isinstance(win.tabs.widget(0), NPCTab)


def test_round_button_advances(mountin_pass_window, qtbot):
    win = mountin_pass_window
    assert win.encounter_state.round_num == 1
    qtbot.mouseClick(win.round_btn, Qt.MouseButton.LeftButton)
    assert win.encounter_state.round_num == 2
    assert "R2" in win.round_btn.text()


def test_tab_title_shows_hp(mountin_pass_window):
    win = mountin_pass_window
    tab0 = win.tabs.widget(0)
    title = win.tabs.tabText(0)
    assert tab0.npc_state.name in title or tab0.npc_state.slug in title.lower().replace(" ", "-")
    assert str(tab0.npc_state.max_hp) in title


def test_damage_via_command_input_updates_state(mountin_pass_window, qtbot):
    """Self-target damage `0 18 dmg` (0 = the active combatant) → HP drops."""
    win = mountin_pass_window
    tab = win.tabs.widget(0)
    assert isinstance(tab, NPCTab)
    starting_hp = tab.npc_state.hp

    qtbot.keyClicks(tab.input, "0 18 dmg")
    qtbot.keyClick(tab.input, Qt.Key.Key_Return)

    assert tab.npc_state.hp == starting_hp - 18


def test_heal_via_command_input_updates_state(mountin_pass_window, qtbot):
    win = mountin_pass_window
    tab = win.tabs.widget(0)
    tab.npc_state.apply_damage(30)
    starting_hp = tab.npc_state.hp

    qtbot.keyClicks(tab.input, "0 10 heal")
    qtbot.keyClick(tab.input, Qt.Key.Key_Return)

    assert tab.npc_state.hp == starting_hp + 10


def test_condition_toggle_via_self_target(mountin_pass_window, qtbot):
    """`0 prone` toggles the prone condition on the active combatant."""
    win = mountin_pass_window
    tab = win.tabs.widget(0)
    assert "prone" not in tab.npc_state.conditions

    qtbot.keyClicks(tab.input, "0 prone")
    qtbot.keyClick(tab.input, Qt.Key.Key_Return)
    assert "prone" in tab.npc_state.conditions

    qtbot.keyClicks(tab.input, "0 prone")
    qtbot.keyClick(tab.input, Qt.Key.Key_Return)
    assert "prone" not in tab.npc_state.conditions


def test_action_chip_click_runs_action(mountin_pass_window, qtbot):
    """Clicking a chip should call roll_combat_action and append output to the log.
    Mocking the roller would be cleaner; here we trust the real one (combat-runner
    actions DB has glacier-stalker pre-loaded)."""
    win = mountin_pass_window
    tab = win.tabs.widget(0)
    initial_log_text = tab.log_view.toPlainText()

    chips = tab.action_grid.chips()
    # Find an action that's not a reaction (chips for reactions still emit but
    # their behavior is gated by the action runner — picking multiattack here
    # for a deterministic result).
    multiattack_chip = next((c for c in chips if c.action_name == "multiattack"), None)
    if multiattack_chip is None:
        pytest.skip("multiattack action not in DB for glacier-stalker")
    qtbot.mouseClick(multiattack_chip, Qt.MouseButton.LeftButton)

    # Wait for the click handler to run + log update
    qtbot.wait(100)
    new_log_text = tab.log_view.toPlainText()
    assert new_log_text != initial_log_text
    # Real action runner output contains ⚛️ quantum marker (or at least the action name)
    assert "Multiattack" in new_log_text or "to-hit" in new_log_text.lower()
