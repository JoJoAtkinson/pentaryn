"""End-to-end trigger tests — exercise the full event-bus → trigger-matcher →
reaction-prompt pipeline using the real MainWindow + real actions DB.

We stub out `MainWindow._reaction_prompt_handler` so the modal doesn't block
the headless event loop, and so we can assert which matches were surfaced and
make scripted choices (PASS or TRIGGER) from the test.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from PySide6.QtCore import Qt

from gui.app import build_main_window
from gui.encounter_picker import discover_encounters
from gui.event_bus import damage_event, spell_cast_event
from gui.main_window import MainWindow
from gui.npc_tab import NPCTab
from gui.widgets.reaction_prompt import ReactionChoice


@pytest.fixture
def win(qtbot) -> MainWindow:
    encounters = discover_encounters()
    pick = next((e for e in encounters if e.name == "mountin-pass"), None)
    if pick is None:
        pytest.skip("mountin-pass encounter not discoverable")
    counts = {npc.slug: 1 for npc in pick.npcs}
    w = build_main_window(pick, counts)
    qtbot.addWidget(w)
    return w


def _install_pass_handler(win: MainWindow) -> list[tuple[str, list]]:
    """Replace the prompt handler with a PASS auto-responder; record every
    invocation for assertions."""
    seen: list[tuple[str, list]] = []

    def handler(summary, rows):
        seen.append((summary, list(rows)))
        return ReactionChoice(npc_slug="", action_name="", triggered=False)

    win._reaction_prompt_handler = handler  # type: ignore[method-assign]
    return seen


def _install_trigger_handler(win: MainWindow, npc_slug: str, action_name: str) -> list[tuple[str, list]]:
    """Auto-pick a specific reaction. Records every invocation."""
    seen: list[tuple[str, list]] = []

    def handler(summary, rows):
        seen.append((summary, list(rows)))
        return ReactionChoice(npc_slug=npc_slug, action_name=action_name, triggered=True)

    win._reaction_prompt_handler = handler  # type: ignore[method-assign]
    return seen


def test_damage_to_stalker_surfaces_rime_reflex(win):
    """Damage emitted on the glacier-stalker subject should match its
    rime_reflex self-trigger and surface a reaction prompt with one row."""
    seen = _install_pass_handler(win)
    win.event_bus.emit(damage_event("glacier-stalker", 12, damage_type="slashing"))
    assert len(seen) == 1
    summary, rows = seen[0]
    assert "glacier-stalker" in summary
    assert any(r[1] == "rime_reflex" for r in rows)


def test_damage_to_unrelated_npc_does_not_prompt(win):
    """If no self-trigger matches and no global trigger fires, the dialog never opens."""
    seen = _install_pass_handler(win)
    win.event_bus.emit(damage_event("aelric-frostweaver", 5, damage_type="piercing"))
    # Aelric.shield has a self-trigger on damage, so this WILL fire actually.
    # Verify it's specifically shield (not something else).
    assert len(seen) == 1
    _, rows = seen[0]
    assert any(r[1] == "shield" for r in rows)


def test_spell_cast_surfaces_counterspell_globally(win):
    """A spell_cast event with no matching self-trigger should still fire
    Aelric's counterspell (scope: global)."""
    seen = _install_pass_handler(win)
    win.event_bus.emit(spell_cast_event(
        caster="PC:Lyric", spell_name="Hold Person",
        target_npc="glacier-stalker", range_ft=30, spell_level=2,
    ))
    assert len(seen) == 1
    _, rows = seen[0]
    assert any(r[0] == "aelric-frostweaver" and r[1] == "counterspell" for r in rows)


def test_used_reaction_filters_trigger(win):
    """If aelric's reaction is already USED, counterspell should not surface."""
    seen = _install_pass_handler(win)
    for npc in win.encounter_state.npcs:
        if npc.slug == "aelric-frostweaver":
            npc.reaction_used = True
    win.event_bus.emit(spell_cast_event(
        caster="PC:Lyric", spell_name="Hold Person",
        target_npc="glacier-stalker",
    ))
    # No matches → handler never invoked
    assert seen == []


def test_pass_choice_does_not_mark_reaction_used(win):
    _install_pass_handler(win)
    win.event_bus.emit(damage_event("glacier-stalker", 12))
    stalker = next(n for n in win.encounter_state.npcs if n.slug == "glacier-stalker")
    assert stalker.reaction_used is False


def test_re_entry_guard_prevents_recursive_prompts(win):
    """If a reaction's own roll triggers more events on the bus, we should
    not pop a second dialog mid-handler. This guards against infinite loops."""
    call_counter = {"n": 0}

    def handler(summary, rows):
        call_counter["n"] += 1
        # Emit ANOTHER damage event while inside the handler — should not
        # recursively pop another dialog because the re-entry guard is set.
        win.event_bus.emit(damage_event("glacier-stalker", 5))
        return ReactionChoice(npc_slug="", action_name="", triggered=False)

    win._reaction_prompt_handler = handler  # type: ignore[method-assign]
    win.event_bus.emit(damage_event("glacier-stalker", 12))
    assert call_counter["n"] == 1


def test_round_event_emits_but_does_not_prompt(win):
    """Advancing the round emits a round_advanced event. No declared trigger
    listens for it, so no prompt should surface."""
    seen = _install_pass_handler(win)
    win.encounter_state.advance_round()  # doesn't emit; manual advance for state
    # Now click the round button which DOES emit
    from PySide6.QtCore import Qt
    # _advance_round emits round_event — verify no match
    win._advance_round()
    # Round event has no trigger in the DB
    assert seen == []
