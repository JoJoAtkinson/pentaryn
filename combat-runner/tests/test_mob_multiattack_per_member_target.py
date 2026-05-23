"""Mob multiattacks against multiple targets distribute per-member, not per-attack.

User flow: `123 multiattack` on a 3-gnoll pack should mean "each gnoll attacks
a different PC" — one fire of multiattack, 6 rolls (3 claws + 3 bites),
distributed as:

  Claw 1 + Bite 1 → Bazgar  (member 1 → target 1)
  Claw 2 + Bite 2 → Marwen  (member 2 → target 2)
  Claw 3 + Bite 3 → Sabriel (member 3 → target 3)

Pending damage on each target = sum of THAT member's two attacks (~10-13
typical), NOT the whole pack's damage (~30+).

Was broken: the per-target loop fired multiattack 3 times (one per target),
resulting in 18 attacks rolled and each target accruing the whole pack's
damage as their pending amount.
"""
from __future__ import annotations

from unittest.mock import patch
from pathlib import Path

import pytest


def _boot(qtbot):
    """Boot mountin-pass with gnoll-pack at default count (3) and the
    Compass Edge party."""
    import sys
    sys.path.insert(0, "combat-runner")
    from PySide6.QtWidgets import QApplication
    from gui.encounter_picker import discover_encounters
    from gui.app import build_main_window
    app = QApplication.instance() or QApplication([])
    enc = next(e for e in discover_encounters() if e.name == "mountin-pass")
    counts = {n.slug: 0 for n in enc.npcs}
    counts["gnoll-pack"] = 3
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


def _pack_tab(win):
    from gui.npc_tab import NPCTab
    for i in range(win.tabs.count()):
        t = win.tabs.widget(i)
        if isinstance(t, NPCTab) and t.npc_state.slug == "gnoll-pack":
            return t
    raise AssertionError("no gnoll-pack tab")


def _fire(win, tab, text: str) -> None:
    from PySide6.QtTest import QTest
    from PySide6.QtCore import Qt
    win.tabs.setCurrentWidget(tab)
    QTest.keyClicks(tab.input, text)
    QTest.keyClick(tab.input, Qt.Key.Key_Return)


def _pending_for(win, cid: str):
    """Return the latest unresolved PendingEffect for combatant cid (or None)."""
    return next(
        (p for p in reversed(list(win.encounter_state.pending_effects))
         if p.combatant_id == cid and not p.resolved),
        None,
    )


def test_mob_multiattack_three_vs_three_rolls_action_once(qtbot):
    """`123 multiattack` on a 3-member gnoll-pack must call
    `run_action_externally` exactly ONCE (not three times)."""
    win = _boot(qtbot)
    pack = _pack_tab(win)
    assert pack.npc_state.count == 3, f"pack count should be 3, got {pack.npc_state.count}"

    # Count fires through EITHER path — the mob distribution uses
    # `run_action_externally_with_targets` rather than the no-targets variant.
    call_count = {"n": 0}
    real = pack.run_action_externally
    real_with = pack.run_action_externally_with_targets
    def counting(action_name):
        call_count["n"] += 1
        return real(action_name)
    def counting_with(action_name, target_names):
        call_count["n"] += 1
        return real_with(action_name, target_names=target_names)

    with patch.object(pack, "run_action_externally", side_effect=counting), \
         patch.object(pack, "run_action_externally_with_targets", side_effect=counting_with):
        _fire(win, pack, "123 multiattack")

    assert call_count["n"] == 1, (
        f"mob multiattack vs N==count targets must fire once; got {call_count['n']} fires"
    )


def test_each_target_pending_amount_is_per_member_share(qtbot):
    """Each target's pending damage = sum of their assigned member's attacks
    (approximately 10-13 for a gnoll claw+bite pair), NOT the whole pack
    total (~30+). The exact value depends on dice, so we assert the right
    *range* and the right *math*: per-target pending must be much less than
    the whole-pack total."""
    win = _boot(qtbot)
    pack = _pack_tab(win)
    _fire(win, pack, "123 multiattack")

    pendings = {cid: _pending_for(win, cid) for cid in ("1", "2", "3")}
    for cid, p in pendings.items():
        assert p is not None, f"target {cid} has no pending damage record"

    amounts = [p.full_amount for p in pendings.values()]
    # 3 gnolls, 2 attacks each (claw 1d4+2, bite 1d6+2). Max per member:
    #   (4+2) + (6+2) = 14. Min: (1+2) + (1+2) = 6. So each target's
    #   pending should sit comfortably in 6-14.
    for amt in amounts:
        assert 6 <= amt <= 14, (
            f"per-target pending should be 6-14 (single gnoll's claw+bite); got {amt} "
            f"— pre-fix, ALL targets accrued the pack's full ~30+ as their pending"
        )

    # Defensive: targets should NOT all share the same total (the AoE bug). Each
    # member rolled independently, so totals are very unlikely to all match.
    # (Statistically, a 1-in-many false positive — re-running passes.)
    assert len(set(amounts)) > 1, (
        "all targets share identical pending damage — looks like AoE-style "
        "shared-roll routing slipped into the mob path"
    )


def test_single_target_multiattack_still_fires_once_with_full_damage(qtbot):
    """Regression guard: a single-target multiattack on a mob (`2 multiattack`)
    keeps existing behavior — the WHOLE pack pile-on, one fire."""
    win = _boot(qtbot)
    pack = _pack_tab(win)

    # Count fires through EITHER path — the mob distribution uses
    # `run_action_externally_with_targets` rather than the no-targets variant.
    call_count = {"n": 0}
    real = pack.run_action_externally
    real_with = pack.run_action_externally_with_targets
    def counting(action_name):
        call_count["n"] += 1
        return real(action_name)
    def counting_with(action_name, target_names):
        call_count["n"] += 1
        return real_with(action_name, target_names=target_names)

    with patch.object(pack, "run_action_externally", side_effect=counting), \
         patch.object(pack, "run_action_externally_with_targets", side_effect=counting_with):
        _fire(win, pack, "2 multiattack")

    assert call_count["n"] == 1, "single-target mob multiattack should fire once"

    p = _pending_for(win, "2")
    assert p is not None
    # When the whole pack piles on one target, the pending damage is the
    # full pack swarm total — significantly more than one member's share.
    assert p.full_amount > 14, (
        f"single-target pile-on should accrue full pack damage (>14); got {p.full_amount}"
    )


def test_mob_multiattack_two_targets_partial_distribution(qtbot):
    """When target count < member count (`12 multiattack` on a 3-mob), the
    code shouldn't crash. Acceptable behaviors: distribute first two members
    to two targets and overflow the third to the last target, OR fall back
    to per-target multiattack loop. Either way: at most 2 fires, no crash,
    both targets get reasonable per-target damage."""
    win = _boot(qtbot)
    pack = _pack_tab(win)

    # Count fires through EITHER path — the mob distribution uses
    # `run_action_externally_with_targets` rather than the no-targets variant.
    call_count = {"n": 0}
    real = pack.run_action_externally
    real_with = pack.run_action_externally_with_targets
    def counting(action_name):
        call_count["n"] += 1
        return real(action_name)
    def counting_with(action_name, target_names):
        call_count["n"] += 1
        return real_with(action_name, target_names=target_names)

    with patch.object(pack, "run_action_externally", side_effect=counting), \
         patch.object(pack, "run_action_externally_with_targets", side_effect=counting_with):
        _fire(win, pack, "12 multiattack")

    assert call_count["n"] <= 2
    # Both targets should have pending records.
    assert _pending_for(win, "1") is not None
    assert _pending_for(win, "2") is not None
