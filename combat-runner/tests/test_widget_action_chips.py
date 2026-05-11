"""Action chip widget tests."""

from __future__ import annotations

from PySide6.QtCore import Qt

from gui.widgets.action_chips import ActionChip, ActionChipGrid


def test_chip_emits_clicked_signal(qtbot):
    chip = ActionChip("multiattack", ["attack", "swing"])
    qtbot.addWidget(chip)
    with qtbot.waitSignal(chip.clicked, timeout=500) as blocker:
        qtbot.mouseClick(chip, Qt.MouseButton.LeftButton)  # left button = 1
    assert blocker.args == ["multiattack"]


def test_used_chip_does_not_emit_clicked(qtbot):
    chip = ActionChip("glacial_roar", ["breath"], is_used=True)
    qtbot.addWidget(chip)
    received = []
    chip.clicked.connect(received.append)
    qtbot.mouseClick(chip, Qt.MouseButton.LeftButton)
    assert received == []


def test_grid_renders_per_npc_then_global(qtbot):
    grid = ActionChipGrid(cols=2)
    qtbot.addWidget(grid)
    actions = [
        {"action": "push", "verbs": ["push"], "scope": "global", "priority": 0},
        {"action": "multiattack", "verbs": ["attack"], "priority": 10},
        {"action": "vanish", "verbs": ["hide"], "priority": 5},
        {"action": "dodge", "verbs": ["dodge"], "scope": "global", "priority": 0},
    ]
    grid.set_actions(actions)
    chips = grid.chips()
    # Per-NPC actions render first (sorted by priority desc): multiattack, vanish
    # Then globals: dodge, push (alpha tiebreak)
    rendered_order = [c.action_name for c in chips]
    assert rendered_order == ["multiattack", "vanish", "dodge", "push"]


def test_grid_forwards_chip_click_signal(qtbot):
    grid = ActionChipGrid()
    qtbot.addWidget(grid)
    grid.set_actions([{"action": "multiattack", "verbs": ["attack"]}])
    chip = grid.chips()[0]
    with qtbot.waitSignal(grid.chip_clicked, timeout=500) as blocker:
        qtbot.mouseClick(chip, Qt.MouseButton.LeftButton)
    assert blocker.args == ["multiattack"]


def test_grid_marks_used_actions_greyed(qtbot):
    grid = ActionChipGrid()
    qtbot.addWidget(grid)
    grid.set_actions(
        [
            {"action": "multiattack", "verbs": ["attack"]},
            {"action": "glacial_roar", "verbs": ["breath"], "recharge": 5},
        ],
        used_actions={"glacial_roar"},
    )
    chips_by_name = {c.action_name: c for c in grid.chips()}
    assert chips_by_name["glacial_roar"].is_used is True
    assert chips_by_name["multiattack"].is_used is False


def test_grid_replaces_chips_on_set_actions(qtbot):
    grid = ActionChipGrid()
    qtbot.addWidget(grid)
    grid.set_actions([{"action": "a", "verbs": ["a"]}])
    assert len(grid.chips()) == 1
    grid.set_actions([{"action": "b", "verbs": ["b"]}, {"action": "c", "verbs": ["c"]}])
    assert len(grid.chips()) == 2
    assert {c.action_name for c in grid.chips()} == {"b", "c"}
