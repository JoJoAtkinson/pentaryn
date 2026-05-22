"""End-to-end watch test — boot the real MainWindow, damage one NPC into
bloodied range, assert the OTHER NPC's suggestion bar surfaces the watching
action with the bloodied target inlined."""

from __future__ import annotations

import pytest
from PySide6.QtCore import Qt

from gui.app import build_main_window
from gui.encounter_picker import discover_encounters
from gui.main_window import MainWindow
from gui.npc_tab import NPCTab
from gui.widgets.suggestion_bar import Suggestion


@pytest.fixture
def mountin_pass_win(qtbot) -> MainWindow:
    encounters = discover_encounters()
    pick = next((e for e in encounters if e.name == "mountin-pass"), None)
    if pick is None:
        pytest.skip("mountin-pass not discoverable")
    counts = {npc.slug: 1 for npc in pick.npcs}
    win = build_main_window(pick, counts, with_llm=False)
    qtbot.addWidget(win)
    return win


def _tab_for(win, slug) -> NPCTab:
    for i in range(win.tabs.count()):
        t = win.tabs.widget(i)
        if isinstance(t, NPCTab) and t.npc_state.slug == slug:
            return t
    pytest.fail(f"no tab for {slug}")


def test_bloodied_stalker_surfaces_cure_wounds_on_aelric(mountin_pass_win):
    """The Glacier Stalker has 84 max HP. Drop him to 30 HP (below half=42)
    → bloodied event fires → Aelric's `cure_wounds` watch (declared
    {event: bloodied, scope: ally}) surfaces with the stalker as target."""
    win = mountin_pass_win
    stalker = _tab_for(win, "glacier-stalker")
    aelric = _tab_for(win, "aelric-frostweaver")
    assert stalker.npc_state.max_hp == 84

    # Damage Stalker enough to cross the half-HP threshold (84/2 = 42)
    stalker.npc_state.apply_damage(50)  # 84 → 34, bloodied
    # Manually fire the event-emit path (the apply_damage in the state model
    # doesn't auto-emit; that happens in NPCTab._apply_damage. Trigger it directly):
    from gui.event_bus import bloodied_event
    win.event_bus.emit(bloodied_event("glacier-stalker"))

    # Inspect Aelric's bar — should have at least one cure_wounds suggestion.
    # Watch buckets are keyed on the stable tab identity id(NPCTab).
    watch_buckets = win._watch_suggestions
    aelric_key = id(_tab_for(win, "aelric-frostweaver"))
    assert aelric_key in watch_buckets
    suggestions = watch_buckets[aelric_key]
    assert any(s.action_name == "cure_wounds" for s in suggestions)
    cure = next(s for s in suggestions if s.action_name == "cure_wounds")
    assert cure.target_npc == "glacier-stalker"
    # And the slug includes the target name
    assert "Glacier Stalker" in cure.slug or "glacier-stalker" in cure.slug.lower()


def test_recovered_target_prunes_watch_suggestion(mountin_pass_win):
    """If a healing event un-bloodies the target, the watch suggestion
    auto-clears on the next event cycle (no LLM needed)."""
    win = mountin_pass_win
    stalker = _tab_for(win, "glacier-stalker")
    from gui.event_bus import bloodied_event, heal_event
    stalker.npc_state.apply_damage(50)  # bloodied at 34/84
    win.event_bus.emit(bloodied_event("glacier-stalker"))
    aelric_key = id(_tab_for(win, "aelric-frostweaver"))
    # Confirm a watch suggestion exists
    assert any(s.action_name == "cure_wounds" for s in win._watch_suggestions.get(aelric_key, []))
    # Heal stalker back above half (84/2 = 42, heal 10 → 44)
    stalker.npc_state.apply_heal(10)
    # Heal event triggers the pruning pass
    win.event_bus.emit(heal_event("glacier-stalker", 10))
    # cure_wounds suggestion is gone
    assert not any(s.action_name == "cure_wounds" for s in win._watch_suggestions.get(aelric_key, []))


def test_death_pruning(mountin_pass_win):
    """If the target dies, the watch suggestion auto-clears (no point healing
    a corpse)."""
    win = mountin_pass_win
    stalker = _tab_for(win, "glacier-stalker")
    from gui.event_bus import bloodied_event, death_event
    stalker.npc_state.apply_damage(50)
    win.event_bus.emit(bloodied_event("glacier-stalker"))
    aelric_key = id(_tab_for(win, "aelric-frostweaver"))
    assert any(s.action_name == "cure_wounds" for s in win._watch_suggestions.get(aelric_key, []))
    # Kill the stalker
    stalker.npc_state.apply_damage(100)
    win.event_bus.emit(death_event("glacier-stalker"))
    # cure_wounds suggestion is pruned
    assert not any(s.action_name == "cure_wounds" for s in win._watch_suggestions.get(aelric_key, []))
