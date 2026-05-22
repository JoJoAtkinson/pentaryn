"""Regression tests for Fix D — per-tab suggestion structures must survive a
/reorder.

Before the fix, SuggestionDriver's generation map and MainWindow's per-tab
dicts were keyed on the positional tab index. `/reorder` shuffled tab positions
without remapping those keys, so an in-flight suggestion worker could deliver
its result to the wrong NPC. Keying on the stable id(NPCTab) fixes this.
"""

from __future__ import annotations

import pytest

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


def test_suggestion_keyed_on_tab_id_not_index(mountin_pass_win):
    """A suggestion delivered for a tab key must land on that exact tab even
    after the tab's positional index changes via /reorder."""
    win = mountin_pass_win
    if win.tabs.count() < 2:
        pytest.skip("need >=2 NPCs to exercise reorder misrouting")

    tab_a = win.tabs.widget(0)
    tab_b = win.tabs.widget(1)
    slug_a = tab_a.npc_state.slug
    key_a = id(tab_a)

    # Reorder so tab_a moves to the back.
    other_slugs = [win.tabs.widget(i).npc_state.slug for i in range(win.tabs.count())]
    new_order = [s for s in other_slugs if s != slug_a] + [slug_a]
    win._handle_reorder_request(new_order)

    # tab_a is now at a different positional index, but its id() is unchanged.
    assert win.tabs.widget(win.tabs.count() - 1) is tab_a
    assert id(tab_a) == key_a

    # A suggestion delivered against key_a must still resolve to tab_a.
    sug = Suggestion(slug="Test pick", action_name="multiattack")
    win._on_suggestions_ready(key_a, [sug])
    rendered = win._llm_suggestions_by_tab.get(key_a)
    assert rendered == [sug]
    # And the tab the key resolves to is genuinely tab_a.
    assert win._tab_by_key(key_a) is tab_a


def test_watch_bucket_follows_npc_across_reorder(mountin_pass_win):
    """A watch suggestion stored for an NPC must still be retrievable for that
    NPC after a reorder shuffles tab positions."""
    win = mountin_pass_win
    if win.tabs.count() < 2:
        pytest.skip("need >=2 NPCs")

    tab = win.tabs.widget(0)
    key = id(tab)
    slug = tab.npc_state.slug
    win._watch_suggestions[key] = [Suggestion(slug="Heal", action_name="cure_wounds")]

    # Move this tab to the end.
    all_slugs = [win.tabs.widget(i).npc_state.slug for i in range(win.tabs.count())]
    win._handle_reorder_request([s for s in all_slugs if s != slug] + [slug])

    # The bucket is still keyed by the same id; _tab_key_for_slug resolves to it.
    assert win._tab_key_for_slug(slug) == key
    assert win._watch_suggestions[key][0].action_name == "cure_wounds"


def test_suggestion_driver_generation_keyed_on_stable_key(qtbot):
    """SuggestionDriver.current_generation must track per arbitrary key, so two
    different stable keys keep independent generation counters."""
    from gui.suggestion_driver import SuggestionDriver

    driver = SuggestionDriver()
    key1, key2 = 111111, 222222  # stand in for two id(NPCTab) values
    assert driver.current_generation(key1) == 0
    driver.request_for_tab(key1, lambda: [])
    driver.request_for_tab(key1, lambda: [])
    assert driver.current_generation(key1) == 2
    # Unrelated key is untouched.
    assert driver.current_generation(key2) == 0
    driver.shutdown(timeout_ms=2000)
