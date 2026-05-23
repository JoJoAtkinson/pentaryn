"""AoE actions must roll damage ONCE and apply to every target equally.

D&D 5e rule: a single area-of-effect roll, each creature in the area makes
its own save against that one number. The runner was rolling damage anew
for EACH target because main_window looped over targets and called
`run_action_externally` per iteration — so a 30-ft cone hitting two PCs
produced two independent damage rolls (e.g. 27 and 31). Wrong.

Multiattack / single_attack DOES roll independently per target (each attack
in a multiattack is its own to-hit + damage), so the per-target loop is
correct there — the fix is type-specific.
"""
from __future__ import annotations

from unittest.mock import patch
from pathlib import Path

import pytest


def _boot(qtbot, party_config=None, player_selections=None):
    """Boot the thrulm encounter headlessly with a party. Returns (app, win)."""
    import sys
    sys.path.insert(0, "combat-runner")
    from PySide6.QtWidgets import QApplication
    from gui.encounter_picker import discover_encounters
    from gui.app import build_main_window
    app = QApplication.instance() or QApplication([])
    enc = next(e for e in discover_encounters() if e.name == "mountin-pass")
    counts = {n.slug: n.default_count for n in enc.npcs if n.slug == "glacier-stalker"}
    # disable every other npc
    for n in enc.npcs:
        counts.setdefault(n.slug, 0)
    counts["glacier-stalker"] = 1
    pc = party_config or {
        "party": "Test",
        "players": [
            {"name": "Bazgar", "id": "1", "max_hp": 49, "ac": 18},
            {"name": "Marwen", "id": "2", "max_hp": 32, "ac": 15},
            {"name": "Sabriel", "id": "3", "max_hp": 44, "ac": 19},
        ],
    }
    sel = player_selections or {
        p["id"]: {"included": True, "current_hp": p["max_hp"]}
        for p in pc["players"]
    }
    win = build_main_window(enc, counts, with_llm=False,
                            party_config=pc, player_selections=sel)
    qtbot.addWidget(win)
    return win


def test_aoe_action_rolls_damage_once_across_targets(qtbot, tmp_path):
    """Fire glacial_roar against three PCs; assert run_action_externally was
    called exactly ONCE (not once per target)."""
    win = _boot(qtbot)
    from gui.npc_tab import NPCTab
    # Find the Glacier Stalker tab and patch its run_action_externally
    stalker_tab = None
    for i in range(win.tabs.count()):
        t = win.tabs.widget(i)
        if isinstance(t, NPCTab) and t.npc_state.slug == "glacier-stalker":
            stalker_tab = t
            break
    assert stalker_tab is not None, "no glacier-stalker tab"

    call_count = {"n": 0}
    real = stalker_tab.run_action_externally

    def counting(action_name):
        call_count["n"] += 1
        return real(action_name)

    with patch.object(stalker_tab, "run_action_externally", side_effect=counting):
        # Switch to stalker tab and fire glacial_roar against three PCs
        win.tabs.setCurrentWidget(stalker_tab)
        from PySide6.QtTest import QTest
        from PySide6.QtCore import Qt
        QTest.keyClicks(stalker_tab.input, "123 roar")
        QTest.keyClick(stalker_tab.input, Qt.Key.Key_Return)

    assert call_count["n"] == 1, (
        f"AoE must roll once; got {call_count['n']} rolls for 3 targets"
    )


def test_aoe_action_applies_same_damage_total_to_each_target(qtbot, tmp_path):
    """Beyond just one roll, the same damage_total must land on every target's
    pending-damage record."""
    win = _boot(qtbot)
    from gui.npc_tab import NPCTab
    stalker_tab = next(
        t for t in (win.tabs.widget(i) for i in range(win.tabs.count()))
        if isinstance(t, NPCTab) and t.npc_state.slug == "glacier-stalker"
    )
    win.tabs.setCurrentWidget(stalker_tab)
    from PySide6.QtTest import QTest
    from PySide6.QtCore import Qt
    QTest.keyClicks(stalker_tab.input, "123 roar")
    QTest.keyClick(stalker_tab.input, Qt.Key.Key_Return)

    # Inspect the encounter's pending_effects — each target should have an
    # entry with the SAME full_amount.
    pending = list(win.encounter_state.pending_effects)
    target_ids = {"1", "2", "3"}
    by_target = {p.combatant_id: p for p in pending if p.combatant_id in target_ids}
    assert set(by_target.keys()) == target_ids, (
        f"expected pending records for {target_ids}, got {set(by_target.keys())}"
    )
    full_amounts = {p.full_amount for p in by_target.values()}
    assert len(full_amounts) == 1, (
        f"all targets must share the SAME damage roll for an AoE; "
        f"got distinct amounts {full_amounts}"
    )


def test_multiattack_still_rolls_independently_per_target(qtbot, tmp_path):
    """Regression guard: a multi-target multiattack must keep rolling per-target
    (each attack in a multiattack is independently rolled)."""
    win = _boot(qtbot)
    from gui.npc_tab import NPCTab
    stalker_tab = next(
        t for t in (win.tabs.widget(i) for i in range(win.tabs.count()))
        if isinstance(t, NPCTab) and t.npc_state.slug == "glacier-stalker"
    )
    win.tabs.setCurrentWidget(stalker_tab)

    call_count = {"n": 0}
    real = stalker_tab.run_action_externally

    def counting(action_name):
        call_count["n"] += 1
        return real(action_name)

    with patch.object(stalker_tab, "run_action_externally", side_effect=counting):
        from PySide6.QtTest import QTest
        from PySide6.QtCore import Qt
        # Glacier Stalker's "multiattack" verb → 3 attacks against 2 targets
        QTest.keyClicks(stalker_tab.input, "12 multiattack")
        QTest.keyClick(stalker_tab.input, Qt.Key.Key_Return)

    # Multiattack should roll per target (2 calls for 2 targets) — independent
    # attacks (e.g. claw at Bazgar, claw at Marwen) genuinely roll separately.
    assert call_count["n"] == 2, (
        f"multiattack should roll per-target; got {call_count['n']} calls for 2 targets"
    )
