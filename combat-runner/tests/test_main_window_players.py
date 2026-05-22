"""Tests for Task 3.2 / 3.3 — tab titles with combatant id and Ctrl+N id-jump shortcuts.

Uses the `sample_encounter` fixture from conftest.py (one Glacier Stalker NPC).
MainWindow is constructed directly from EncounterState — no real encounter files needed.
"""

from __future__ import annotations

import pytest

from gui.main_window import MainWindow


def test_tab_title_includes_id(qtbot, sample_encounter):
    """_tab_title should prepend the combatant's id followed by ' · '."""
    sample_encounter.npcs[0].id = "5"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    assert "5 ·" in win.tabs.tabText(0)


def test_tab_title_no_id_omits_prefix(qtbot, sample_encounter):
    """When id is empty, the tab title should not show any id prefix."""
    sample_encounter.npcs[0].id = ""
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    title = win.tabs.tabText(0)
    assert " · " not in title


def test_ctrl_n_jumps_to_combatant_by_id(qtbot, sample_encounter):
    """_jump_to_combatant_by_id should switch tabs to the NPC with that id."""
    sample_encounter.npcs[0].id = "3"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    win.show()
    win._jump_to_combatant_by_id("3")
    assert win.tabs.currentIndex() == 0


def test_jump_to_nonexistent_id_is_noop(qtbot, sample_encounter):
    """_jump_to_combatant_by_id with an unknown id should not crash or change tab."""
    sample_encounter.npcs[0].id = "1"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    initial_idx = win.tabs.currentIndex()
    win._jump_to_combatant_by_id("9")  # no combatant with this id
    assert win.tabs.currentIndex() == initial_idx
