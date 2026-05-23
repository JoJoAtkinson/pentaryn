"""Regression: multiattack to-hit narrative must show per-attack totals, not a sum.

Each to-hit roll is independent — the DM compares each value against the
target's AC separately. A trailing "= 40" implies the rolls were summed,
which is the right shape for damage dice but never for to-hits.

The fix surfaces each attack's final to-hit (roll + bonus) inline, e.g.:
    ⚛️ 🔝(10+6=16) 🔝(6+6=12) 🔝(6+6=12)
…with no trailing aggregate.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dnd_roller import roll_combat_action  # noqa: E402


def test_multiattack_to_hits_show_per_attack_totals():
    """For a 2-attack multiattack, the to-hits narrative must surface BOTH
    final to-hit values (each = d20 + bonus) and NOT a sum of all to-hits."""
    raw = roll_combat_action(npc="deep-watch-derro", action="multiattack")
    parsed = json.loads(raw)
    output = parsed["output"]

    # Extract the to-hits line (matches `_to-hits:_ ...`).
    m = re.search(r"_to-hits:_(.+)", output)
    assert m, f"no _to-hits:_ line in output:\n{output}"
    line = m.group(1).strip()

    # 1) MUST NOT end with " = <number>" — that's the sum-aggregate shape.
    assert not re.search(r"=\s*\d+\s*$", line), (
        f"to-hits line should not surface a sum-aggregate: {line!r}"
    )

    # 2) Each attack's final to-hit value must appear in the line. Since the
    #    rolls are random, we can't assert exact values; what we CAN assert is
    #    that the line contains as many `=<num>` per-roll annotations as there
    #    are attacks. Deep-watch-derro's multiattack has 2 hand-axe attacks.
    per_roll_totals = re.findall(r"=\s*(\d+)\b", line)
    assert len(per_roll_totals) == 2, (
        f"expected 2 per-attack `=<total>` annotations, got {per_roll_totals!r} "
        f"in line {line!r}"
    )


def test_multiattack_three_attacks_three_per_roll_totals():
    """Beholder multiattack has 3 attacks (2 tentacles + 1 maw) — line must
    show 3 per-attack totals."""
    raw = roll_combat_action(npc="beholder-thrulm", action="multiattack")
    parsed = json.loads(raw)
    m = re.search(r"_to-hits:_(.+)", parsed["output"])
    assert m
    line = m.group(1).strip()
    per_roll_totals = re.findall(r"=\s*(\d+)\b", line)
    assert len(per_roll_totals) == 3, (
        f"beholder multiattack has 3 attacks; per-roll totals = {per_roll_totals!r}"
    )
    # Also: no trailing "= sum" aggregate.
    assert not re.search(r"=\s*\d+\s*$", line) or len(per_roll_totals) == 3, line


def test_single_attack_to_hit_still_shows_one_total():
    """A single_attack (1 attack) still must show its final to-hit value
    inline. With one attack, the visual ambiguity is small, but consistency
    matters — every attack roll's narrative shape is identical."""
    raw = roll_combat_action(npc="deep-watch-derro", action="crossbow")
    parsed = json.loads(raw)
    m = re.search(r"_to-hits:_(.+)", parsed["output"])
    assert m
    line = m.group(1).strip()
    per_roll_totals = re.findall(r"=\s*(\d+)\b", line)
    assert len(per_roll_totals) == 1, (
        f"single_attack should surface exactly 1 per-roll total; got {per_roll_totals!r} "
        f"in line {line!r}"
    )


def test_damage_narrative_still_includes_sum():
    """Sanity: the FIX must not regress the damage narratives. Damage dice
    SHOULD show a trailing `= <total>` (rolls are summed for one attack's
    total damage). This test guards against me over-correcting."""
    raw = roll_combat_action(npc="deep-watch-derro", action="multiattack")
    parsed = json.loads(raw)
    output = parsed["output"]

    # First damage line (Hand Axe 1).
    m = re.search(r"_Hand Axe 1 dmg:_\s*(.+)", output)
    assert m, f"no Hand Axe 1 damage line in output:\n{output}"
    line = m.group(1).strip()
    assert re.search(r"=\s*\d+\s*$", line), (
        f"damage line MUST surface its sum-aggregate: {line!r}"
    )
