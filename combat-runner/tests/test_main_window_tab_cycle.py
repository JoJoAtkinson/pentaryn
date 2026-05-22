"""Regression tests for Tab-key combatant cycling.

The MainWindow docstring promises "Tab-key cycling between tabs", but
`_wire_shortcuts()` originally only wired Ctrl+1..9 — plain Tab fell through
to Qt's default focus-traversal, pulling focus out of the command input.

The fix installs an application-level event filter (`MainWindow.eventFilter`)
that intercepts Key_Tab / Key_Backtab *before* focus traversal, cycles the
active combat tab (wrapping), and keeps focus on the active tab's command
input. Cmd/Ctrl+Number direct-jump and the Ctrl+Tab menu actions are untouched.
"""

from __future__ import annotations

import pathlib

import pytest
from gui.main_window import MainWindow
from gui.state import EncounterState, NPCState
from PySide6.QtCore import Qt
from PySide6.QtGui import QKeyEvent
from PySide6.QtWidgets import QApplication


def _npc(name: str, nid: str, hp: int = 30) -> NPCState:
    n = NPCState(slug=name.lower(), name=name, max_hp=hp, ac=13,
                 speed="30 ft.", cr=1.0)
    n.id = nid
    return n


@pytest.fixture
def window(qtbot, tmp_path):
    """Three-combatant window: tabs A / B / C at indices 0 / 1 / 2."""
    es = EncounterState(
        name="t",
        root=pathlib.Path(tmp_path),
        log_path=pathlib.Path(tmp_path) / "c.md",
        npcs=[_npc("Alpha", "1"), _npc("Bravo", "2"), _npc("Charlie", "3")],
    )
    win = MainWindow(es)
    qtbot.addWidget(win)
    win.show()
    qtbot.waitExposed(win)
    return win


def _press(win, key, modifier=Qt.KeyboardModifier.NoModifier):
    """Send a KeyPress through the same path the app event filter sees:
    deliver it to whatever widget currently holds focus."""
    target = QApplication.focusWidget() or win
    ev = QKeyEvent(QKeyEvent.Type.KeyPress, key, modifier)
    QApplication.sendEvent(target, ev)


def test_tab_advances_to_next_combatant(window):
    window.tabs.setCurrentIndex(0)
    _press(window, Qt.Key.Key_Tab)
    assert window.tabs.currentIndex() == 1
    _press(window, Qt.Key.Key_Tab)
    assert window.tabs.currentIndex() == 2


def test_tab_wraps_at_end(window):
    window.tabs.setCurrentIndex(2)  # last tab
    _press(window, Qt.Key.Key_Tab)
    assert window.tabs.currentIndex() == 0  # wrapped to first


def test_shift_tab_goes_to_previous_and_wraps(window):
    window.tabs.setCurrentIndex(0)
    # Shift+Tab arrives as Key_Backtab on most platforms.
    _press(window, Qt.Key.Key_Backtab, Qt.KeyboardModifier.ShiftModifier)
    assert window.tabs.currentIndex() == 2  # wrapped backward
    _press(window, Qt.Key.Key_Backtab, Qt.KeyboardModifier.ShiftModifier)
    assert window.tabs.currentIndex() == 1


def test_shift_tab_via_tab_key_with_shift_modifier(window):
    """Some platforms send Shift+Tab as Key_Tab + ShiftModifier."""
    window.tabs.setCurrentIndex(1)
    _press(window, Qt.Key.Key_Tab, Qt.KeyboardModifier.ShiftModifier)
    assert window.tabs.currentIndex() == 0


def test_focus_stays_on_command_input_after_tab(window):
    """Before and after Tab the command input retains focus — the DM can keep
    typing. Tab must NOT pull focus into some other widget."""
    window.tabs.setCurrentIndex(0)
    start_tab = window.tabs.widget(0)
    start_tab.input.setFocus()
    assert QApplication.focusWidget() is start_tab.input

    _press(window, Qt.Key.Key_Tab)

    new_tab = window.tabs.widget(1)
    assert window.tabs.currentIndex() == 1
    # Focus is on the *new* active tab's command input — still a command input,
    # never an action chip / suggestion button / other form widget.
    assert QApplication.focusWidget() is new_tab.input


def test_can_type_command_after_tab_cycle(window, qtbot):
    """End-to-end: Tab to the next combatant, then type a damage command —
    it must land because focus is still in a command input."""
    window.tabs.setCurrentIndex(0)
    window.tabs.widget(0).input.setFocus()

    _press(window, Qt.Key.Key_Tab)
    bravo_tab = window.tabs.widget(1)
    start_hp = bravo_tab.npc_state.hp

    focused = QApplication.focusWidget()
    qtbot.keyClicks(focused, "-7")
    qtbot.keyClick(focused, Qt.Key.Key_Return)

    assert bravo_tab.npc_state.hp == start_hp - 7
