"""SuggestionBar widget tests."""

from __future__ import annotations

from PySide6.QtCore import Qt

from gui.widgets.suggestion_bar import Suggestion, SuggestionBar


def test_empty_bar_renders_a_spacer(qtbot):
    bar = SuggestionBar()
    qtbot.addWidget(bar)
    # No buttons present
    assert bar.current_suggestions() == []


def test_set_suggestions_creates_buttons(qtbot):
    bar = SuggestionBar()
    qtbot.addWidget(bar)
    bar.set_suggestions([
        Suggestion(slug="Multiattack on Tenza", action_name="multiattack"),
        Suggestion(slug="Snow Vanish · retreat", action_name="snow_vanish"),
        Suggestion(slug="Glacial Roar · 3+ targets", action_name="glacial_roar"),
    ])
    assert len(bar.current_suggestions()) == 3


def test_truncates_to_max_buttons(qtbot):
    bar = SuggestionBar(max_buttons=3)
    qtbot.addWidget(bar)
    bar.set_suggestions([Suggestion(slug=f"slug {i}", action_name=f"action_{i}") for i in range(10)])
    assert len(bar.current_suggestions()) == 3


def test_clicking_a_suggestion_emits_action_name(qtbot):
    bar = SuggestionBar()
    qtbot.addWidget(bar)
    bar.set_suggestions([
        Suggestion(slug="Hit the wizard", action_name="frost_ray"),
        Suggestion(slug="Teleport away", action_name="misty_step"),
    ])

    received: list[str] = []
    bar.suggestion_chosen.connect(received.append)

    # Click the second button
    buttons = bar.findChildren(type(bar.findChild(type(bar))))  # any child widget
    # More reliable: walk layout
    btns = []
    for i in range(bar._layout.count()):
        w = bar._layout.itemAt(i).widget()
        if w and hasattr(w, "click"):
            btns.append(w)
    assert len(btns) >= 2
    btns[1].click()
    assert received == ["misty_step"]


def test_set_loading_replaces_buttons(qtbot):
    bar = SuggestionBar()
    qtbot.addWidget(bar)
    bar.set_suggestions([Suggestion(slug="x", action_name="a")])
    bar.set_loading()
    assert bar.current_suggestions() == []


def test_clear_resets_to_empty(qtbot):
    bar = SuggestionBar()
    qtbot.addWidget(bar)
    bar.set_suggestions([Suggestion(slug="x", action_name="a")])
    bar.clear()
    assert bar.current_suggestions() == []


def test_long_slug_is_truncated(qtbot):
    bar = SuggestionBar()
    qtbot.addWidget(bar)
    long_slug = "x" * 200
    bar.set_suggestions([Suggestion(slug=long_slug, action_name="action_a")])
    rendered = bar.current_suggestions()[0]
    assert len(rendered) <= 72  # 67 + ellipsis + slack
    assert rendered.endswith("…")
