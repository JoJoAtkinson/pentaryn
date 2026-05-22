"""Regression tests for the native drag-reorder targeting bug.

`QTabWidget.setMovable(True)` lets the user drag tabs to reorder them. A native
drag reflows the QTabWidget's *widget indices* but does NOT touch
`EncounterState.npcs`. Before the fix, two pieces of code assumed
`npcs[i]` ⇄ `tabs.widget(i)`:

  * `EncounterState.active_npc` → `npcs[active_tab_index]` (active_tab_index is a
    Qt widget index) — so after a drag-reorder the directed-command actor was
    the wrong combatant.
  * `_on_directed_command` → `tabs.widget(npcs.index(target))` — so the target's
    tab refresh / re-title hit the wrong tab.

The fix mirrors a native `tabMoved` into `encounter_state.npcs`, keeping the
two orderings consistent (the same invariant `/reorder` already maintains).
"""

from __future__ import annotations

import pathlib

import pytest

from gui.dispatcher import Dispatcher
from gui.main_window import MainWindow
from gui.state import EncounterState, NPCState


def _pc(name: str, pid: str, hp: int) -> NPCState:
    n = NPCState(slug=f"pc-{pid}", name=name, max_hp=hp, ac=15,
                 speed="30 ft.", cr=0.0, kind="pc")
    n.id = pid
    return n


def _npc(name: str, nid: str, hp: int) -> NPCState:
    n = NPCState(slug=name.lower(), name=name, max_hp=hp, ac=13,
                 speed="30 ft.", cr=1.0)
    n.id = nid
    return n


@pytest.fixture
def party_window(qtbot, tmp_path):
    """Mirror the live `the-compass-edge` roster: PCs ids 1/2/3, NPC id 4.

      idx0 Bazgar  (pc, id 1, 49 hp)
      idx1 Marwen  (pc, id 2, 32 hp)
      idx2 Sabriel (pc, id 3, 44 hp)
      idx3 Aelric  (npc, id 4, 38 hp)
    """
    bazgar = _pc("Bazgar", "1", 49)
    marwen = _pc("Marwen", "2", 32)
    sabriel = _pc("Sabriel", "3", 44)
    aelric = _npc("Aelric", "4", 38)
    es = EncounterState(
        name="t",
        root=pathlib.Path(tmp_path),
        log_path=pathlib.Path(tmp_path) / "c.md",
        npcs=[bazgar, marwen, sabriel, aelric],
    )
    win = MainWindow(es)
    qtbot.addWidget(win)
    return win


def test_native_drag_reorder_keeps_npcs_in_sync(party_window):
    """A native QTabBar drag must mirror into encounter_state.npcs so that
    npcs[i] always corresponds to tabs.widget(i)."""
    win = party_window
    # Drag Aelric's tab (idx 3) to the front (idx 0).
    win.tabs.tabBar().moveTab(3, 0)

    tab_order = [win.tabs.widget(i).npc_state.name for i in range(win.tabs.count())]
    npcs_order = [n.name for n in win.encounter_state.npcs]
    assert tab_order == npcs_order == ["Aelric", "Bazgar", "Marwen", "Sabriel"]


def test_active_npc_correct_after_native_drag(party_window):
    """active_npc must follow the visually-selected tab, not a stale index."""
    win = party_window
    win.tabs.tabBar().moveTab(3, 0)        # Aelric dragged to front
    win.tabs.setCurrentIndex(0)            # user clicks the (now first) tab
    assert win.encounter_state.active_npc.name == "Aelric"


def test_directed_command_targets_correct_pc_after_native_drag(party_window):
    """The core bug: with the active tab on the dragged Aelric tab, a directed
    command `2 5 melee` must damage Marwen (id '2') — not Bazgar, and not as a
    phantom mob member — and the log must attribute the actor as Aelric."""
    win = party_window
    es = win.encounter_state
    bazgar = es.combatant_by_id("1")
    marwen = es.combatant_by_id("2")

    # User drags Aelric to the front and selects it.
    win.tabs.tabBar().moveTab(3, 0)
    win.tabs.setCurrentIndex(0)
    assert es.active_npc.name == "Aelric"

    marwen_before = marwen.hp
    bazgar_before = bazgar.hp

    parsed = Dispatcher().parse("2 5 melee")
    assert parsed.target_id == "2"
    assert parsed.target_member is None      # not a mob member

    win._on_directed_command(parsed)

    # Damage landed on Marwen (id '2'), Bazgar untouched.
    assert marwen.hp == marwen_before - 5
    assert bazgar.hp == bazgar_before

    # Log line is on the actor's (Aelric's) visible tab, attributed to Aelric.
    actor_tab = win.tabs.currentWidget()
    assert actor_tab.npc_state.name == "Aelric"
    log_html = actor_tab.log_view.toHtml()
    assert "Aelric" in log_html
    assert "#2" in log_html


def test_directed_refresh_hits_correct_target_tab_after_native_drag(party_window):
    """After a native drag, _on_directed_command must refresh/re-title the
    target's *own* tab, not whatever widget sits at npcs.index(target)."""
    win = party_window
    es = win.encounter_state
    marwen = es.combatant_by_id("2")

    win.tabs.tabBar().moveTab(3, 0)   # divergence between npcs list & tab order
    win.tabs.setCurrentIndex(0)

    parsed = Dispatcher().parse("2 7")
    win._on_directed_command(parsed)

    # The tab whose title now reflects Marwen's reduced HP is genuinely
    # Marwen's tab.
    marwen_tab_idx = next(
        i for i in range(win.tabs.count())
        if win.tabs.widget(i).npc_state is marwen
    )
    assert str(marwen.hp) in win.tabs.tabText(marwen_tab_idx)
