"""ReactionPromptDialog widget tests.

Verifies the modal's contract:
  - 1 match → 1 trigger button → click sets chosen_reaction and accept()s
  - N matches → N trigger buttons → clicking any one sets chosen_reaction
  - Pass button rejects with triggered=False
  - Empty match list still renders (defensive) without crashing
"""

from __future__ import annotations

import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QDialog, QPushButton

from gui.widgets.reaction_prompt import ReactionChoice, ReactionPromptDialog


def _trigger_buttons(dlg: ReactionPromptDialog) -> list[QPushButton]:
    return [
        b for b in dlg.findChildren(QPushButton)
        if (b.objectName() or "").startswith("TriggerButton_")
    ]


def test_single_match_renders_one_trigger_button(qtbot):
    dlg = ReactionPromptDialog(
        event_summary="glacier-stalker took 9 melee damage",
        matches=[("glacier-stalker", "rime_reflex", "melee damage within 5 ft", 1.0)],
    )
    qtbot.addWidget(dlg)
    assert dlg.match_count() == 1
    assert len(_trigger_buttons(dlg)) == 1


def test_clicking_trigger_sets_chosen_and_accepts(qtbot):
    dlg = ReactionPromptDialog(
        event_summary="glacier-stalker took 9 melee damage",
        matches=[("glacier-stalker", "rime_reflex", "melee damage within 5 ft", 1.0)],
    )
    qtbot.addWidget(dlg)
    btn = _trigger_buttons(dlg)[0]
    btn.click()
    assert dlg.result() == QDialog.DialogCode.Accepted
    assert dlg.chosen_reaction is not None
    assert dlg.chosen_reaction.triggered is True
    assert dlg.chosen_reaction.npc_slug == "glacier-stalker"
    assert dlg.chosen_reaction.action_name == "rime_reflex"


def test_pass_button_rejects_with_triggered_false(qtbot):
    dlg = ReactionPromptDialog(
        event_summary="glacier-stalker took 9 melee damage",
        matches=[("glacier-stalker", "rime_reflex", "melee damage within 5 ft", 1.0)],
    )
    qtbot.addWidget(dlg)
    pass_btn = dlg.findChild(QPushButton, "PassButton")
    assert pass_btn is not None
    pass_btn.click()
    assert dlg.result() == QDialog.DialogCode.Rejected
    assert dlg.chosen_reaction is not None
    assert dlg.chosen_reaction.triggered is False


def test_multi_match_renders_one_trigger_per_candidate(qtbot):
    dlg = ReactionPromptDialog(
        event_summary="PC casts Hold Person",
        matches=[
            ("aelric-frostweaver", "counterspell", "PC casts a spell within 60 ft", 1.0),
            ("hedge-wizard", "counterspell", "any spell cast within 60 ft", 0.5),
        ],
    )
    qtbot.addWidget(dlg)
    assert dlg.match_count() == 2
    buttons = _trigger_buttons(dlg)
    assert len(buttons) == 2


def test_multi_match_clicking_second_button_chooses_second(qtbot):
    dlg = ReactionPromptDialog(
        event_summary="PC casts Hold Person",
        matches=[
            ("aelric-frostweaver", "counterspell", "PC casts a spell", 1.0),
            ("hedge-wizard", "counterspell", "any spell within 60 ft", 0.5),
        ],
    )
    qtbot.addWidget(dlg)
    buttons = _trigger_buttons(dlg)
    # Click the second button (hedge-wizard)
    second_btn = next(
        b for b in buttons if "hedge-wizard" in (b.objectName() or "")
    )
    second_btn.click()
    assert dlg.chosen_reaction is not None
    assert dlg.chosen_reaction.npc_slug == "hedge-wizard"
    assert dlg.chosen_reaction.triggered is True


def test_empty_matches_renders_gracefully(qtbot):
    """Defensive: caller should skip the dialog when no matches, but if it
    happens anyway we shouldn't crash."""
    dlg = ReactionPromptDialog(event_summary="something happened", matches=[])
    qtbot.addWidget(dlg)
    assert dlg.match_count() == 0
    # PASS still works
    pass_btn = dlg.findChild(QPushButton, "PassButton")
    pass_btn.click()
    assert dlg.result() == QDialog.DialogCode.Rejected


def test_chosen_reaction_is_none_before_any_click(qtbot):
    dlg = ReactionPromptDialog(
        event_summary="evt",
        matches=[("a", "b", "c", 1.0)],
    )
    qtbot.addWidget(dlg)
    assert dlg.chosen_reaction is None
