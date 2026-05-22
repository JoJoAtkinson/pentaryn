"""Tests for the new <who> <stream> command grammar wired into MainWindow.

The dispatcher now produces a `ParsedCommand` (kind ∈ command|set_target|
unparseable). NPCTab emits it via `command_requested`; MainWindow handles it
in `_on_command`. These tests exercise the integration end-to-end through a
real MainWindow + NPCTab harness (offscreen Qt).
"""

from __future__ import annotations

import pathlib

import pytest

from gui.main_window import MainWindow
from gui.state import EncounterState, NPCState


def _npc(name: str, nid: str, hp: int, *, kind: str = "npc") -> NPCState:
    n = NPCState(
        slug=name.lower(),
        name=name,
        max_hp=hp,
        ac=13,
        speed="30 ft.",
        cr=1.0,
        kind=kind,
    )
    n.id = nid
    return n


@pytest.fixture
def window(qtbot, tmp_path):
    """Three NPCs id 1/2/3 + one actor-PC id 4.

      idx0 One   (npc, id 1, 40 hp)
      idx1 Two   (npc, id 2, 40 hp)
      idx2 Three (npc, id 3, 40 hp)
      idx3 Actor (pc,  id 4, 50 hp)
    """
    npcs = [
        _npc("One", "1", 40),
        _npc("Two", "2", 40),
        _npc("Three", "3", 40),
        _npc("Actor", "4", 50, kind="pc"),
    ]
    es = EncounterState(
        name="grammar-test",
        root=pathlib.Path(tmp_path),
        log_path=pathlib.Path(tmp_path) / "combat.md",
        npcs=npcs,
    )
    win = MainWindow(es)
    qtbot.addWidget(win)
    return win


def _submit(window, text: str) -> None:
    """Submit `text` through the active tab's command input path."""
    tab = window.tabs.currentWidget()
    tab._on_submitted(text)


# ─────────────────────────── damage ───────────────────────────


def test_directed_damage(window):
    """'2 8 slash' damages combatant id 2 by 8."""
    two = window.encounter_state.combatant_by_id("2")
    before = two.hp
    window.tabs.setCurrentIndex(0)
    _submit(window, "2 8 slash")
    assert two.hp == before - 8


# ─────────────────────────── set_target ───────────────────────────


def test_set_target_sets_current_target_and_arrow(window):
    """'2' sets current_target to ['2']; the arrow shows on tab 2 once the
    actor is viewing a different tab (it is never drawn on the actor tab)."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "2")
    assert window.encounter_state.current_target == ["2"]
    # set_target jumps to the target tab — which becomes the actor, so no
    # arrow there. Switch back to a different tab and the arrow appears.
    window.tabs.setCurrentIndex(0)
    assert 1 in window.tabs.tabBar().arrow_indices()


# ─────────────────────────── current-target action ───────────────────────────


def test_leading_space_runs_action_against_current_target(window, monkeypatch):
    """' 1' with current_target ['2'] runs action 1 against combatant 2."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "2")  # set sticky target to id 2

    ran: list = []
    target_idx = 1  # combatant id 2 is at index 1
    target_tab = window.tabs.widget(target_idx)
    monkeypatch.setattr(
        target_tab, "run_action_externally", lambda name: ran.append(name)
    )
    _submit(window, " 1")
    assert ran, "action should have run against the current target"


# ─────────────────────────── undo ───────────────────────────


def test_undo_restores_prior_hp(window):
    """'undo' after a damage command restores the prior HP."""
    two = window.encounter_state.combatant_by_id("2")
    before = two.hp
    window.tabs.setCurrentIndex(0)
    _submit(window, "2 8 slash")
    assert two.hp == before - 8
    _submit(window, "undo")
    restored = window.encounter_state.combatant_by_id("2")
    assert restored.hp == before


# ─────────────────────────── multi-target ───────────────────────────


def test_multi_target_damage(window):
    """'123 3 poison' damages all of ids 1, 2, 3."""
    ones = [window.encounter_state.combatant_by_id(c) for c in ("1", "2", "3")]
    before = [c.hp for c in ones]
    window.tabs.setCurrentIndex(3)
    _submit(window, "123 3 poison")
    after = [window.encounter_state.combatant_by_id(c).hp for c in ("1", "2", "3")]
    assert after == [b - 3 for b in before]


# ─────────────────────────── targeting arrow ───────────────────────────


def test_arrow_never_on_actor_tab(window):
    """The arrow appears on targeted tabs and never on the active/actor tab."""
    window.tabs.setCurrentIndex(0)  # actor = tab 0 (combatant id 1)
    _submit(window, "1")  # target combatant id 1 — which is the actor's own tab
    # current_target is ['1'] but the actor tab (index 0) must NOT show an arrow.
    assert 0 not in window.tabs.tabBar().arrow_indices()


def test_arrow_on_targeted_tab(window):
    """Targeting non-actor combatants shows the arrow on each targeted tab."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "23")  # set_target {2,3} -> tabs 1 and 2; jumps to tab 1
    # Move the actor off a targeted tab so both arrows are visible.
    window.tabs.setCurrentIndex(3)
    arrows = window.tabs.tabBar().arrow_indices()
    assert arrows == {1, 2}


# ─────────────────────────── LLM fallback ───────────────────────────


def test_unparseable_routes_to_llm_fallback(window):
    """An unparseable input routes to the LLM fallback path."""
    received: list = []
    # _on_llm_fallback is the fallback entry point; spy on it.
    orig = window._on_llm_fallback
    window._on_llm_fallback = lambda text, parsed=None: received.append(text)  # type: ignore
    try:
        window.tabs.setCurrentIndex(0)
        _submit(window, "do something weird")
    finally:
        window._on_llm_fallback = orig  # type: ignore
    assert received and "do something weird" in received[0]
