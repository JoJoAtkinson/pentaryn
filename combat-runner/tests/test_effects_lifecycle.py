from pathlib import Path
from gui.state import (
    EncounterState,
    NPCState,
    deserialize_encounter,
    serialize_encounter,
)
from gui.effects import apply_uncertain_damage, apply_hit, clear_stale_pending

def _es():
    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="m", name="Marwen", max_hp=32, ac=15, speed="30",
                            cr=5, kind="pc", id="2"))
    return es

def test_uncertain_save_applies_half():
    es = _es()
    apply_uncertain_damage(es, "2", full_amount=20, kind="save", on_save="half")
    assert es.combatant_by_id("2").hp == 22          # 32 - 10 (half)
    assert len(es.pending_effects) == 1
    p = es.pending_effects[0]
    assert p.applied_amount == 10 and p.full_amount == 20 and p.resolved is False

def test_uncertain_attack_applies_zero():
    es = _es()
    apply_uncertain_damage(es, "2", full_amount=15, kind="attack", on_save="none")
    assert es.combatant_by_id("2").hp == 32          # nothing applied yet

def test_hit_upgrades_to_full():
    es = _es()
    apply_uncertain_damage(es, "2", full_amount=20, kind="save", on_save="half")
    apply_hit(es, ["2"])
    assert es.combatant_by_id("2").hp == 12          # the remaining 10 now applied
    assert es.pending_effects[0].resolved is True

def test_hit_only_targets_named():
    es = _es()
    es.npcs.append(NPCState(slug="b", name="Bazgar", max_hp=49, ac=18, speed="30",
                            cr=5, kind="pc", id="1"))
    apply_uncertain_damage(es, "1", full_amount=20, kind="save", on_save="half")
    apply_uncertain_damage(es, "2", full_amount=20, kind="save", on_save="half")
    apply_hit(es, ["1"])                             # only Bazgar failed
    assert es.combatant_by_id("1").hp == 49 - 20     # full
    assert es.combatant_by_id("2").hp == 32 - 10     # still the assumed save


def test_uncertain_damage_records_source_and_round():
    es = _es()
    es.round_num = 3
    apply_uncertain_damage(
        es, "2", full_amount=20, kind="save", on_save="half", source="ice_storm"
    )
    p = es.pending_effects[0]
    assert p.source == "ice_storm"
    assert p.round == 3


def test_uncertain_damage_explicit_round_override():
    es = _es()
    es.round_num = 5
    apply_uncertain_damage(
        es, "2", full_amount=20, kind="save", on_save="half", round_num=2
    )
    assert es.pending_effects[0].round == 2


def test_clear_stale_pending_resolves_prior_round_effects():
    es = _es()
    es.round_num = 1
    apply_uncertain_damage(es, "2", full_amount=20, kind="save", on_save="half")
    # Round advances; the pending effect is now stale.
    es.round_num = 2
    fragments = clear_stale_pending(es, current_round=2)
    assert es.pending_effects[0].resolved is True
    assert fragments and "expired" in fragments[0]


def test_clear_stale_pending_keeps_current_round_effects():
    es = _es()
    es.round_num = 2
    apply_uncertain_damage(es, "2", full_amount=20, kind="save", on_save="half")
    # Same round — not stale.
    fragments = clear_stale_pending(es, current_round=2)
    assert es.pending_effects[0].resolved is False
    assert fragments == []


def test_pending_effect_source_round_round_trip():
    es = _es()
    es.round_num = 4
    apply_uncertain_damage(
        es, "2", full_amount=18, kind="attack", on_save="none", source="claw"
    )
    restored = deserialize_encounter(serialize_encounter(es))
    p = restored.pending_effects[0]
    assert p.source == "claw"
    assert p.round == 4
    assert p.kind == "attack"
    assert p.full_amount == 18
