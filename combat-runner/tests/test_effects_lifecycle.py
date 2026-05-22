from pathlib import Path
from gui.state import (
    EncounterState,
    NPCState,
    deserialize_encounter,
    serialize_encounter,
)
from gui.effects import apply_uncertain_damage, apply_hit, clear_stale_pending


def _mob_es():
    """Encounter state with a 3-member mob (each member 20 HP, total 60 HP)."""
    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    mob = NPCState(slug="pack", name="Pack", max_hp=20, ac=13, speed="30",
                   cr=1, kind="npc", id="9", count=3)
    # __post_init__ fires automatically; mob.member_hp == [20, 20, 20]
    es.npcs.append(mob)
    return es

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


# ─── mob-member threading ────────────────────────────────────────────────────


def test_uncertain_damage_mob_member_applies_to_named_member():
    """apply_uncertain_damage(member=3) applies assumed damage to member 3, not default."""
    es = _mob_es()
    mob = es.combatant_by_id("9")
    assert mob.member_hp == [20, 20, 20]  # precondition

    # A save-half area action vs mob member 3: minimum (half) should hit member 3.
    apply_uncertain_damage(
        es, "9", full_amount=10, kind="save", on_save="half", source="fireball", member=3
    )

    # Applied half (5) goes to member 3 (index 2), not the default routing.
    assert mob.member_hp[0] == 20, "member 1 must be untouched"
    assert mob.member_hp[1] == 20, "member 2 must be untouched"
    assert mob.member_hp[2] == 15, "member 3 must take 5 (half of 10)"

    # One PendingEffect recorded.
    assert len(es.pending_effects) == 1
    assert es.pending_effects[0].full_amount == 10
    assert es.pending_effects[0].applied_amount == 5
    assert es.pending_effects[0].resolved is False


def test_uncertain_damage_mob_member_hit_upgrades_named_member():
    """After apply_uncertain_damage(member=3), apply_hit upgrades member 3, not default."""
    es = _mob_es()
    mob = es.combatant_by_id("9")

    apply_uncertain_damage(
        es, "9", full_amount=10, kind="save", on_save="half", source="fireball", member=3
    )
    # Precondition: only member 3 was touched so far.
    assert mob.member_hp == [20, 20, 15]

    # DM rules the save failed — apply the remaining 5 to confirm the hit.
    apply_hit(es, ["9"])

    # Member 3 should now have 10 HP (20 - 5 initial - 5 upgrade).
    assert mob.member_hp[0] == 20, "member 1 must be untouched after hit"
    assert mob.member_hp[1] == 20, "member 2 must be untouched after hit"
    assert mob.member_hp[2] == 10, "member 3 must have taken full 10 damage"
    assert es.pending_effects[0].resolved is True
