"""Condition-duration tests.

`@stun 5` applies stunned for 5 rounds; round_advanced ticks it down; on the
5th tick the condition auto-removes with a log entry. Manual `@stun` toggle-off
mid-duration also clears the timer (covers the "cured by a spell" case).
"""

from __future__ import annotations

from gui.dispatcher import Dispatcher, InputKind
from gui.state import NPCState


def test_dispatcher_parses_at_stun_5_as_condition_with_duration():
    d = Dispatcher()
    p = d.parse("@stun 5")
    assert p.kind is InputKind.CONDITION
    assert p.condition == "stun"
    assert p.condition_duration == 5
    assert p.condition_target is None


def test_dispatcher_at_grappled_with_target_is_unchanged():
    """Trailing non-numeric token still parses as target hint, not duration."""
    d = Dispatcher()
    p = d.parse("@grappled tenza")
    assert p.kind is InputKind.CONDITION
    assert p.condition == "grappled"
    assert p.condition_duration is None
    assert p.condition_target == "tenza"


def test_dispatcher_bare_at_condition_no_duration():
    d = Dispatcher()
    p = d.parse("@prone")
    assert p.kind is InputKind.CONDITION
    assert p.condition_duration is None
    assert p.condition_target is None


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
