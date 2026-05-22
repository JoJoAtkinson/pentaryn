"""CommandInput widget tests — sigil preview signals + submit + history."""

from __future__ import annotations

from PySide6.QtCore import Qt

from gui.widgets.command_input import CommandInput


def test_typing_damage_emits_preview(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[84], max_hp_per_member=84)

    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))

    qtbot.keyClicks(inp, "-18")
    # Should have emitted at least once with (member_idx=0, projected=66)
    assert (0, 66) in captured


def test_typing_heal_emits_preview(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[50], max_hp_per_member=84)

    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))

    qtbot.keyClicks(inp, "+10")
    assert (0, 60) in captured


def test_typing_mob_target_emits_correct_member(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[12, 12, 12], max_hp_per_member=12)

    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))

    qtbot.keyClicks(inp, "m2 -5")
    # member arg 2 → 0-indexed 1, projected 12-5=7
    assert (1, 7) in captured


def test_default_damage_targets_highest_alive_in_mob(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[12, 12, 12], max_hp_per_member=12)
    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))
    qtbot.keyClicks(inp, "-5")
    # default = highest-numbered alive (idx 2 in 3-mob); projected = 12-5=7
    assert (2, 7) in captured


def test_default_heal_targets_lowest_alive(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    # m1 dead, m2 and m3 alive
    inp.update_context(member_hp=[0, 6, 12], max_hp_per_member=12)
    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))
    qtbot.keyClicks(inp, "+3")
    # lowest-numbered alive = idx 1 (m2), projected = 6+3 = 9
    assert (1, 9) in captured


def test_non_preview_text_emits_clear(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[10], max_hp_per_member=10)
    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))
    qtbot.keyClicks(inp, "attack")
    # Should emit (None, None) cleanups throughout
    assert (None, None) in captured


def test_return_submits_and_clears(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[10], max_hp_per_member=10)
    received = []
    inp.submitted.connect(received.append)
    qtbot.keyClicks(inp, "attack")
    qtbot.keyClick(inp, Qt.Key.Key_Return)
    assert received == ["attack"]
    assert inp.text() == ""


def test_up_arrow_browses_history(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[10], max_hp_per_member=10)
    qtbot.keyClicks(inp, "attack")
    qtbot.keyClick(inp, Qt.Key.Key_Return)
    qtbot.keyClicks(inp, "vanish")
    qtbot.keyClick(inp, Qt.Key.Key_Return)
    qtbot.keyClick(inp, Qt.Key.Key_Up)
    assert inp.text() == "vanish"
    qtbot.keyClick(inp, Qt.Key.Key_Up)
    assert inp.text() == "attack"


def test_escape_clears_field(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[10], max_hp_per_member=10)
    qtbot.keyClicks(inp, "-5")
    qtbot.keyClick(inp, Qt.Key.Key_Escape)
    assert inp.text() == ""


def test_mob_target_out_of_range_clears_preview(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[12, 12], max_hp_per_member=12)  # count=2
    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))
    qtbot.keyClicks(inp, "m99 -5")
    # Should emit (None, None) — out-of-range
    assert (None, None) in captured


def test_tag_hint_pool_activates_after_directed_prefix(qtbot):
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.setText("3 12 f")
    model = inp._completer.model()
    strings = [model.data(model.index(i)) for i in range(model.rowCount())]
    assert any("fire" in s for s in strings)


def test_tag_hint_works_for_second_tag(qtbot):
    from gui.widgets.command_input import CommandInput
    widget = CommandInput()
    qtbot.addWidget(widget)
    widget.setText("3 12 fire m")   # first tag complete, typing second
    model = widget._completer.model()
    strings = [model.data(model.index(i)) for i in range(model.rowCount())]
    assert any("melee" in s for s in strings)


def test_tag_hint_after_first_tag_excludes_filled_type_facet(qtbot):
    from gui.widgets.command_input import CommandInput
    widget = CommandInput()
    qtbot.addWidget(widget)
    widget.setText("3 12 fire ")    # type facet filled, cursor on next tag
    model = widget._completer.model()
    strings = [model.data(model.index(i)) for i in range(model.rowCount())]
    assert not any(s == "cold" for s in strings)   # type facet already filled
