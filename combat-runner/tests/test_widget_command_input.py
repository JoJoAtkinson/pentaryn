"""CommandInput widget tests — sigil preview signals + submit + history."""

from __future__ import annotations

from gui.widgets.command_input import CommandInput
from PySide6.QtCore import Qt
from PySide6.QtTest import QTest


def test_typing_damage_emits_preview(qtbot):
    """New grammar: `<id> <num> <dmg-tag>` fires a preview."""
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[84], max_hp_per_member=84)

    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))

    # New grammar: `2 18 melee` = 18 melee damage to combatant #2.
    # For a single-member NPC (count=1), the only alive member is idx 0.
    qtbot.keyClicks(inp, "2 18 melee")
    # Should have emitted at least once with (member_idx=0, projected=66)
    assert (0, 66) in captured


def test_typing_heal_emits_preview(qtbot):
    """New grammar: `<id> <num> heal` fires a heal preview."""
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[50], max_hp_per_member=84)

    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))

    qtbot.keyClicks(inp, "2 10 heal")
    assert (0, 60) in captured


def test_typing_mob_target_emits_correct_member(qtbot):
    """New grammar: `<id> m<n> <num> <dmg-tag>` targets a mob member."""
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[12, 12, 12], max_hp_per_member=12)

    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))

    qtbot.keyClicks(inp, "7 m2 5 melee")
    # member arg 2 → 0-indexed 1, projected 12-5=7
    assert (1, 7) in captured


def test_default_damage_targets_highest_alive_in_mob(qtbot):
    """Without m<n>, damage defaults to the highest-numbered alive member."""
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[12, 12, 12], max_hp_per_member=12)
    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))
    qtbot.keyClicks(inp, "7 5 melee")
    # default = highest-numbered alive (idx 2 in 3-mob); projected = 12-5=7
    assert (2, 7) in captured


def test_default_heal_targets_lowest_alive(qtbot):
    """Without m<n>, heal defaults to the lowest-numbered alive member."""
    inp = CommandInput()
    qtbot.addWidget(inp)
    # m1 dead, m2 and m3 alive
    inp.update_context(member_hp=[0, 6, 12], max_hp_per_member=12)
    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))
    qtbot.keyClicks(inp, "7 3 heal")
    # lowest-numbered alive = idx 1 (m2), projected = 6+3 = 9
    assert (1, 9) in captured


def test_old_sigil_damage_does_not_fire_preview(qtbot):
    """Old `-N` sigils are now unparseable and must NOT fire a preview."""
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[84], max_hp_per_member=84)
    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))
    qtbot.keyClicks(inp, "-18")
    # Only (None, None) clears should appear — never a numeric member/hp pair.
    assert all(pair == (None, None) for pair in captured)


def test_old_sigil_heal_does_not_fire_preview(qtbot):
    """Old `+N` sigils are now unparseable and must NOT fire a preview."""
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[50], max_hp_per_member=84)
    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))
    qtbot.keyClicks(inp, "+10")
    assert all(pair == (None, None) for pair in captured)


def test_non_preview_text_emits_clear(qtbot):
    """A bare verb (no id, no amount) emits (None, None) only."""
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
    """An m<n> that exceeds the member count clears the preview."""
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.update_context(member_hp=[12, 12], max_hp_per_member=12)  # count=2
    captured = []
    inp.preview_changed.connect(lambda m, hp: captured.append((m, hp)))
    qtbot.keyClicks(inp, "7 m99 5 melee")
    # m99 is out-of-range for a 2-member mob → (None, None)
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


def test_tag_typeahead_popup_shows_while_typing_directed_command(qtbot):
    """Regression: typing a partial tag after `<id> <amount> ` must surface the
    completer popup with the applicable hint_pool candidates.

    Previously the completer matched the whole line (`3 12 f`) against the
    bare tag candidates (`fire`, `cold`, …); nothing started with `3 12 f`
    so `completionCount()` was 0 and the popup never appeared, even though
    the model was swapped correctly. The _LastTokenCompleter narrows
    matching to the trailing partial token (`f`).
    """
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.show()
    qtbot.waitExposed(inp)
    QTest.keyClicks(inp, "3 12 f")

    completer = inp._completer
    # splitPath() narrows matching to the trailing token, so the completer
    # finds the `f...` tags rather than matching the whole line against none.
    completions = {
        completer.completionModel().index(i, 0).data()
        for i in range(completer.completionCount())
    }
    assert "fire" in completions
    assert "force" in completions
    # The popup itself is visible to the DM.
    assert completer.popup().isVisible()


def test_tag_typeahead_popup_shows_for_second_tag(qtbot):
    """A partial second tag after a completed first tag also pops the popup,
    scoped to the still-open facets (delivery applies, type already filled)."""
    inp = CommandInput()
    qtbot.addWidget(inp)
    inp.show()
    qtbot.waitExposed(inp)
    QTest.keyClicks(inp, "3 12 fire m")

    completer = inp._completer
    completions = {
        completer.completionModel().index(i, 0).data()
        for i in range(completer.completionCount())
    }
    assert "melee" in completions  # delivery facet still open
    assert completer.popup().isVisible()
