"""HP bar widget tests — needs qtbot (pytest-qt)."""

from __future__ import annotations

from PySide6.QtCore import QSize

from gui.widgets.hp_bar import HPBar


def test_hp_bar_constructs_with_defaults(qtbot):
    bar = HPBar()
    qtbot.addWidget(bar)
    assert bar.sizeHint().width() > 0
    assert bar.minimumHeight() == HPBar.BAR_HEIGHT


def test_set_state_triggers_repaint(qtbot):
    bar = HPBar()
    qtbot.addWidget(bar)
    # No exceptions on various shapes
    bar.set_state([84], 84)
    bar.set_state([10, 10, 10], 10)
    bar.set_state([0, 5, 10], 10)


def test_set_preview_clamps_within_range(qtbot):
    bar = HPBar()
    qtbot.addWidget(bar)
    bar.set_state([10], 10)
    bar.set_preview(0, -50)   # would go negative
    assert bar._preview_projected == 0
    bar.set_preview(0, 999)   # would exceed max
    assert bar._preview_projected == 10
    bar.set_preview(5, 5)     # out-of-range member
    assert bar._preview_member == 0  # clamped to last valid


def test_clear_preview_resets(qtbot):
    bar = HPBar()
    qtbot.addWidget(bar)
    bar.set_state([10], 10)
    bar.set_preview(0, 5)
    bar.clear_preview()
    assert bar._preview_member is None
    assert bar._preview_projected is None


def test_segmented_state_does_not_crash_on_paint(qtbot):
    bar = HPBar()
    qtbot.addWidget(bar)
    bar.resize(300, 20)
    bar.set_state([5, 3, 0], 10)  # mixed alive/dead, full repaint
    bar.show()
    qtbot.waitExposed(bar)
    bar.hide()  # cleanup
