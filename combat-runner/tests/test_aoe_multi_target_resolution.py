"""Verify the multi-target save/hit grammar resolves an AoE's pending damage.

Demonstrates the full at-table flow:

  Stalker fires `123 roar`  →  one damage roll, three pending effects (one per PC,
                                same full_amount, assumed-saved applied).
  DM types `12 save`        →  PC 1 and PC 2 stay at the saved minimum.
  DM types `3 hit`          →  PC 3 upgrades to the full failed-save damage.

Or with different splits:
  `123 hit`                 →  all three failed (full damage to each).
  `123 save`                →  all three saved (no upgrade beyond the minimum).
"""
from __future__ import annotations

from pathlib import Path

import pytest


def _boot(qtbot):
    import sys
    sys.path.insert(0, "combat-runner")
    from PySide6.QtWidgets import QApplication
    from gui.encounter_picker import discover_encounters
    from gui.app import build_main_window
    app = QApplication.instance() or QApplication([])
    enc = next(e for e in discover_encounters() if e.name == "mountin-pass")
    counts = {n.slug: 0 for n in enc.npcs}
    counts["glacier-stalker"] = 1
    pc = {
        "party": "Test",
        "players": [
            {"name": "Bazgar", "id": "1", "max_hp": 49, "ac": 18},
            {"name": "Marwen", "id": "2", "max_hp": 32, "ac": 15},
            {"name": "Sabriel", "id": "3", "max_hp": 44, "ac": 19},
        ],
    }
    sel = {
        p["id"]: {"included": True, "current_hp": p["max_hp"]}
        for p in pc["players"]
    }
    win = build_main_window(enc, counts, with_llm=False,
                            party_config=pc, player_selections=sel)
    qtbot.addWidget(win)
    return win


def _fire(win, tab, text: str) -> None:
    from PySide6.QtTest import QTest
    from PySide6.QtCore import Qt
    win.tabs.setCurrentWidget(tab)
    QTest.keyClicks(tab.input, text)
    QTest.keyClick(tab.input, Qt.Key.Key_Return)


def _hp(win, cid: str) -> int:
    return win.encounter_state.combatant_by_id(cid).hp


def _pending_for(win, cid: str):
    """Return the LAST unresolved PendingEffect for combatant cid (or None)."""
    return next(
        (p for p in reversed(list(win.encounter_state.pending_effects))
         if p.combatant_id == cid and not p.resolved),
        None,
    )


def test_split_save_some_hit_others(qtbot):
    """`123 roar` → `12 save` (1 + 2 confirmed saved) → `3 hit` (3 failed)."""
    win = _boot(qtbot)
    from gui.npc_tab import NPCTab
    stalker = next(
        t for t in (win.tabs.widget(i) for i in range(win.tabs.count()))
        if isinstance(t, NPCTab) and t.npc_state.slug == "glacier-stalker"
    )

    _fire(win, stalker, "123 roar")
    pending = {cid: _pending_for(win, cid) for cid in ("1", "2", "3")}
    assert all(p is not None for p in pending.values())
    full = pending["1"].full_amount
    half = pending["1"].applied_amount  # the assumed-saved minimum
    assert full > half, f"expected full > half; got full={full}, half={half}"
    assert all(p.full_amount == full for p in pending.values()), (
        "same AoE roll must yield identical full_amount across targets"
    )

    # HP after the initial fire: each PC at max_hp - half
    hp_after_roar = {cid: _hp(win, cid) for cid in ("1", "2", "3")}

    _fire(win, stalker, "12 save")
    # PC 1 and 2 stay at the saved minimum; their pending effects are resolved.
    for cid in ("1", "2"):
        assert _pending_for(win, cid) is None, f"{cid} pending should be resolved"
        assert _hp(win, cid) == hp_after_roar[cid], (
            f"{cid} HP changed after `save` (should be unchanged)"
        )

    _fire(win, stalker, "3 hit")
    # PC 3 upgrades to full damage; the remaining (full - half) is dealt.
    assert _pending_for(win, "3") is None, "3 pending should be resolved"
    assert _hp(win, "3") == hp_after_roar["3"] - (full - half), (
        f"3 HP after `hit` should be down by full-half; "
        f"was {hp_after_roar['3']}, now {_hp(win, '3')}, full={full}, half={half}"
    )


def test_all_three_hit_via_combined_who(qtbot):
    """`123 hit` upgrades every PC's pending to full damage in one command."""
    win = _boot(qtbot)
    from gui.npc_tab import NPCTab
    stalker = next(
        t for t in (win.tabs.widget(i) for i in range(win.tabs.count()))
        if isinstance(t, NPCTab) and t.npc_state.slug == "glacier-stalker"
    )

    _fire(win, stalker, "123 roar")
    pending = {cid: _pending_for(win, cid) for cid in ("1", "2", "3")}
    full = pending["1"].full_amount
    half = pending["1"].applied_amount
    hp_after_roar = {cid: _hp(win, cid) for cid in ("1", "2", "3")}

    _fire(win, stalker, "123 hit")
    for cid in ("1", "2", "3"):
        assert _pending_for(win, cid) is None
        assert _hp(win, cid) == hp_after_roar[cid] - (full - half), (
            f"{cid} not upgraded to full damage"
        )


def test_all_three_save_via_combined_who(qtbot):
    """`123 save` confirms every PC saved; HP doesn't change beyond the initial."""
    win = _boot(qtbot)
    from gui.npc_tab import NPCTab
    stalker = next(
        t for t in (win.tabs.widget(i) for i in range(win.tabs.count()))
        if isinstance(t, NPCTab) and t.npc_state.slug == "glacier-stalker"
    )

    _fire(win, stalker, "123 roar")
    hp_after_roar = {cid: _hp(win, cid) for cid in ("1", "2", "3")}

    _fire(win, stalker, "123 save")
    for cid in ("1", "2", "3"):
        assert _pending_for(win, cid) is None
        assert _hp(win, cid) == hp_after_roar[cid], (
            f"{cid} HP changed after `save` (should be unchanged)"
        )
