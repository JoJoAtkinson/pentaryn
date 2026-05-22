"""Condition-duration tests.

In the `<who> <stream>` grammar a condition's duration is a number written
BEFORE the condition word: `5 stun` = stun for 5 rounds. A bare condition word
defaults to 1 round. round_advanced ticks the timer down; on the final tick the
condition auto-removes. Manual toggle-off mid-duration also clears the timer
(the "cured by a spell" case).
"""

from __future__ import annotations

from gui.dispatcher import parse
from gui.state import NPCState


def test_parses_num_before_condition_as_duration():
    """`3 5 stun` — target 3, stun for 5 rounds (number before condition word)."""
    c = parse("3 5 stun")
    assert c.kind == "command"
    eff = c.effects[0]
    assert eff.kind == "condition"
    assert eff.condition == "stunned"
    assert eff.duration == 5


def test_bare_condition_has_no_explicit_duration():
    """A bare condition word leaves duration None — caller applies the 1-round default."""
    c = parse("3 prone")
    eff = c.effects[0]
    assert eff.kind == "condition"
    assert eff.condition == "prone"
    assert eff.duration is None


def test_forced_condition_with_at_escape_hatch():
    """`@prone` forces the condition reading; duration still None for a bare word."""
    c = parse("3 @prone")
    eff = c.effects[0]
    assert eff.kind == "condition"
    assert eff.condition == "prone"
    assert eff.duration is None
    assert eff.forced_condition is True


def test_apply_condition_with_duration():
    n = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30 ft", cr=1)
    assert n.add_condition("stunned", duration=5) is True
    assert "stunned" in n.conditions
    assert n.condition_durations["stunned"] == 5


def test_tick_decrements_and_auto_removes_on_zero():
    n = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30 ft", cr=1)
    n.add_condition("stunned", duration=2)
    expired = n.tick_condition_durations()
    assert expired == []
    assert n.condition_durations["stunned"] == 1
    expired = n.tick_condition_durations()
    assert expired == ["stunned"]
    assert "stunned" not in n.conditions
    assert "stunned" not in n.condition_durations


def test_manual_toggle_off_clears_duration():
    """Cured by a spell mid-duration: toggle removes both condition and timer."""
    n = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30 ft", cr=1)
    n.add_condition("paralyzed", duration=10)
    n.toggle_condition("paralyzed")  # toggle off
    assert "paralyzed" not in n.conditions
    assert "paralyzed" not in n.condition_durations


def test_indefinite_condition_never_ticks():
    n = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30 ft", cr=1)
    n.add_condition("blinded")  # no duration → indefinite
    assert n.tick_condition_durations() == []
    assert "blinded" in n.conditions
    # Multiple ticks still don't expire it
    for _ in range(20):
        n.tick_condition_durations()
    assert "blinded" in n.conditions


def test_duration_roundtrips_through_serialize():
    from gui.state import EncounterState, deserialize_encounter, serialize_encounter
    from pathlib import Path
    npc = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30 ft", cr=1)
    npc.add_condition("paralyzed", duration=3)
    enc = EncounterState(name="t", root=Path("/tmp"), log_path=Path("/tmp/l.md"), npcs=[npc])
    blob = serialize_encounter(enc)
    restored = deserialize_encounter(blob)
    assert restored.npcs[0].condition_durations == {"paralyzed": 3}
    assert "paralyzed" in restored.npcs[0].conditions
