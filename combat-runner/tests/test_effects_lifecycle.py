from pathlib import Path
from gui.state import EncounterState, NPCState
from gui.effects import apply_uncertain_damage, apply_hit

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
