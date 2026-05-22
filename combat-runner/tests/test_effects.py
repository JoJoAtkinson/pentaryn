from pathlib import Path
from gui.state import EncounterState, NPCState
from gui.command_model import Effect
from gui.effects import apply_effect

def _es():
    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="m", name="Marwen", max_hp=32, ac=15, speed="30",
                            cr=5, kind="pc", id="2"))
    return es

def test_amount_applies_damage():
    es = _es()
    apply_effect(es, Effect(kind="amount", amount=8, amount_tags={"type": "slashing"}),
                 target_ids=["2"], actor=None)
    assert es.combatant_by_id("2").hp == 24

def test_amount_heal_via_direction_tag():
    es = _es(); es.combatant_by_id("2").member_hp[0] = 10
    apply_effect(es, Effect(kind="amount", amount=12, amount_tags={"direction": "heal"}),
                 target_ids=["2"], actor=None)
    assert es.combatant_by_id("2").hp == 22

def test_condition_applies_with_duration():
    es = _es()
    apply_effect(es, Effect(kind="condition", condition="stun", duration=2),
                 target_ids=["2"], actor=None)
    npc = es.combatant_by_id("2")
    assert "stunned" in npc.conditions
    assert npc.condition_durations.get("stunned") == 2

def test_condition_default_duration_one():
    es = _es()
    apply_effect(es, Effect(kind="condition", condition="prone", duration=None),
                 target_ids=["2"], actor=None)
    assert es.combatant_by_id("2").condition_durations.get("prone") == 1

def test_condition_toggles_off():
    es = _es(); es.combatant_by_id("2").conditions.add("prone")
    apply_effect(es, Effect(kind="condition", condition="prone"),
                 target_ids=["2"], actor=None)
    assert "prone" not in es.combatant_by_id("2").conditions

def test_condition_duration_zero_treated_as_one_round():
    """`3 0 stun` parses to duration=0; effects.py must normalize that to the
    1-round default so the condition expires (not become permanent)."""
    es = _es()
    apply_effect(es, Effect(kind="condition", condition="stun", duration=0),
                 target_ids=["2"], actor=None)
    npc = es.combatant_by_id("2")
    assert "stunned" in npc.conditions
    # A duration of 1 must be recorded — NOT a missing key (which is permanent).
    assert npc.condition_durations.get("stunned") == 1
    # ...and it expires on the next round tick.
    expired = npc.tick_condition_durations()
    assert "stunned" in expired
    assert "stunned" not in npc.conditions


def test_amount_multi_target():
    es = _es()
    es.npcs.append(NPCState(slug="b", name="Bazgar", max_hp=49, ac=18, speed="30",
                            cr=5, kind="pc", id="1"))
    apply_effect(es, Effect(kind="amount", amount=3, amount_tags={"type": "poison"}),
                 target_ids=["1", "2"], actor=None)
    assert es.combatant_by_id("1").hp == 46
    assert es.combatant_by_id("2").hp == 29
