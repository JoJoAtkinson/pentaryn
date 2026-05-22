"""Unit tests for combat-runner/gui/state.py — pure Python, no Qt."""

from __future__ import annotations

from pathlib import Path

import pytest

from gui.state import (
    NPCState,
    EncounterState,
    serialize_encounter,
    deserialize_encounter,
    state_schema,
)


# ─────────── NPCState basics ───────────

def test_single_creature_initializes_with_full_hp(sample_npc):
    assert sample_npc.hp == 84
    assert sample_npc.max_total_hp == 84
    assert sample_npc.count == 1
    assert sample_npc.member_hp == [84]
    assert sample_npc.alive_count == 1
    assert not sample_npc.is_dead
    assert not sample_npc.is_bloodied


def test_mob_initializes_with_full_hp_per_member(mob_npc):
    assert mob_npc.count == 3
    assert mob_npc.member_hp == [12, 12, 12]
    assert mob_npc.hp == 36
    assert mob_npc.max_total_hp == 36
    assert mob_npc.alive_count == 3


# ─────────── damage routing ───────────

def test_single_creature_damage_clamps_at_zero(sample_npc):
    result = sample_npc.apply_damage(100)
    assert result["before"] == 84
    assert result["after"] == 0
    assert result["killed"] is True
    assert sample_npc.is_dead


def test_damage_applies_bloodied_marker_at_or_below_half(sample_npc):
    sample_npc.apply_damage(42)  # exactly half
    assert sample_npc.hp == 42
    assert sample_npc.is_bloodied
    assert "bloodied" in sample_npc.conditions


def test_damage_above_half_does_not_set_bloodied(sample_npc):
    sample_npc.apply_damage(20)
    assert sample_npc.hp == 64
    assert not sample_npc.is_bloodied
    assert "bloodied" not in sample_npc.conditions


def test_mob_default_damage_routes_to_highest_alive(mob_npc):
    # First hit lands on member 3 (highest, rightmost — bar drains right→left)
    result = mob_npc.apply_damage(5)
    assert result["member"] == 3
    assert mob_npc.member_hp == [12, 12, 7]


def test_mob_default_damage_drains_right_to_left(mob_npc):
    mob_npc.apply_damage(12)  # kills member 3
    assert mob_npc.member_hp == [12, 12, 0]
    assert mob_npc.alive_count == 2
    mob_npc.apply_damage(12)  # kills member 2
    assert mob_npc.member_hp == [12, 0, 0]
    mob_npc.apply_damage(12)  # kills member 1
    assert mob_npc.member_hp == [0, 0, 0]
    assert mob_npc.is_dead


def test_mob_explicit_member_target_overrides_default(mob_npc):
    result = mob_npc.apply_damage(8, member=1)
    assert result["member"] == 1
    assert mob_npc.member_hp == [4, 12, 12]
    # Default damage now routes to member 3 (still highest-alive at full HP — wait, all 3 alive)
    result = mob_npc.apply_damage(4)
    assert result["member"] == 3  # default = highest-numbered alive
    assert mob_npc.member_hp == [4, 12, 8]


def test_dead_member_is_skipped_for_default_routing(mob_npc):
    mob_npc.apply_damage(12, member=3)  # kill m3
    assert mob_npc.member_hp == [12, 12, 0]
    result = mob_npc.apply_damage(5)  # default → next-highest alive (m2)
    assert result["member"] == 2
    assert mob_npc.member_hp == [12, 7, 0]


def test_damage_to_specific_dead_member_is_recorded_but_does_no_more(mob_npc):
    mob_npc.apply_damage(12, member=3)
    # Targeting m3 (dead) again is allowed; HP already at 0
    result = mob_npc.apply_damage(5, member=3)
    assert result["after"] == 0


def test_apply_damage_negative_amount_raises(sample_npc):
    with pytest.raises(ValueError):
        sample_npc.apply_damage(-5)


# ─────────── heal routing ───────────

def test_heal_clamped_to_max(sample_npc):
    sample_npc.apply_damage(50)
    result = sample_npc.apply_heal(999)
    assert result["after"] == 84
    assert sample_npc.hp == 84


def test_heal_default_targets_lowest_numbered_alive(mob_npc):
    mob_npc.apply_damage(5, member=1)
    mob_npc.apply_damage(5, member=2)
    mob_npc.apply_damage(5, member=3)
    result = mob_npc.apply_heal(3)
    assert result["member"] == 1  # lowest-numbered alive heals first
    assert mob_npc.member_hp == [10, 7, 7]


def test_heal_skips_dead_members_by_default(mob_npc):
    mob_npc.apply_damage(12, member=1)  # kill m1
    mob_npc.apply_damage(5)  # damages m3 (default)
    result = mob_npc.apply_heal(3)
    assert result["member"] == 2  # m1 dead, so m2 is lowest alive
    assert mob_npc.member_hp == [0, 12, 7]  # m2 already full so heal capped
    # Actually m2 was full; heal would no-op. Let's redo with m2 damaged.
    mob_npc.member_hp = [0, 7, 7]
    result = mob_npc.apply_heal(3)
    assert result["member"] == 2
    assert mob_npc.member_hp == [0, 10, 7]


def test_heal_on_dead_member_is_no_op(mob_npc):
    mob_npc.apply_damage(12, member=2)
    result = mob_npc.apply_heal(5, member=2)
    assert result.get("skipped") == "dead member"
    assert mob_npc.member_hp[1] == 0


def test_heal_removes_bloodied_when_back_above_half(sample_npc):
    sample_npc.apply_damage(50)
    assert "bloodied" in sample_npc.conditions
    sample_npc.apply_heal(30)  # back to 64 (>half)
    assert "bloodied" not in sample_npc.conditions


# ─────────── conditions ───────────

def test_add_remove_toggle_conditions(sample_npc):
    assert sample_npc.add_condition("prone") is True
    assert "prone" in sample_npc.conditions
    assert sample_npc.add_condition("prone") is False  # already present
    assert sample_npc.remove_condition("prone") is True
    assert "prone" not in sample_npc.conditions
    assert sample_npc.toggle_condition("grappled") is True
    assert sample_npc.toggle_condition("grappled") is False


def test_conditions_normalize_to_lowercase(sample_npc):
    sample_npc.add_condition("Prone")
    assert "prone" in sample_npc.conditions


# ─────────── lifecycle ───────────

def test_start_turn_refreshes_reaction_and_bonus(sample_npc):
    sample_npc.reaction_used = True
    sample_npc.bonus_used = True
    sample_npc.start_turn()
    assert sample_npc.reaction_used is False
    assert sample_npc.bonus_used is False
    assert sample_npc.turn_taken_this_round is True


def test_advance_round_resets_all_npcs(sample_encounter, sample_npc):
    sample_npc.reaction_used = True
    sample_encounter.round_num = 3
    sample_encounter.advance_round()
    assert sample_encounter.round_num == 4
    assert sample_npc.reaction_used is False
    assert sample_npc.turn_taken_this_round is False


def test_set_round_clamps_to_minimum_of_1(sample_encounter):
    sample_encounter.set_round(0)
    assert sample_encounter.round_num == 1
    sample_encounter.set_round(-5)
    assert sample_encounter.round_num == 1
    sample_encounter.set_round(10)
    assert sample_encounter.round_num == 10


# ─────────── tab reordering ───────────

def test_reorder_tabs_basic():
    es = EncounterState(
        name="multi",
        root=Path("/tmp"),
        log_path=Path("/tmp/log.md"),
        npcs=[
            NPCState(slug="a", name="A", max_hp=10, ac=10, speed="30 ft", cr=1),
            NPCState(slug="b", name="B", max_hp=10, ac=10, speed="30 ft", cr=1),
            NPCState(slug="c", name="C", max_hp=10, ac=10, speed="30 ft", cr=1),
        ],
    )
    es.reorder_tabs(["c", "a", "b"])
    assert [n.slug for n in es.npcs] == ["c", "a", "b"]


def test_reorder_preserves_active_tab_pointer():
    es = EncounterState(
        name="multi",
        root=Path("/tmp"),
        log_path=Path("/tmp/log.md"),
        npcs=[
            NPCState(slug="a", name="A", max_hp=10, ac=10, speed="30 ft", cr=1),
            NPCState(slug="b", name="B", max_hp=10, ac=10, speed="30 ft", cr=1),
        ],
    )
    es.active_tab_index = 1  # B is active
    es.reorder_tabs(["b", "a"])
    assert es.active_npc.slug == "b"
    assert es.active_tab_index == 0  # B is now at index 0


def test_reorder_with_unknown_slug_keeps_rest_in_original_order():
    es = EncounterState(
        name="multi",
        root=Path("/tmp"),
        log_path=Path("/tmp/log.md"),
        npcs=[
            NPCState(slug="a", name="A", max_hp=10, ac=10, speed="30 ft", cr=1),
            NPCState(slug="b", name="B", max_hp=10, ac=10, speed="30 ft", cr=1),
        ],
    )
    es.reorder_tabs(["unknown", "b"])
    assert [n.slug for n in es.npcs] == ["b", "a"]


# ─────────── serialization (LLM boundary) ───────────

def test_round_trip_preserves_state(sample_encounter, sample_npc):
    sample_npc.apply_damage(20)
    sample_npc.add_condition("prone")
    sample_npc.mark_action_used("glacial_roar")
    sample_npc.reaction_used = True

    d = serialize_encounter(sample_encounter)
    rebuilt = deserialize_encounter(d)

    assert rebuilt.name == sample_encounter.name
    assert rebuilt.round_num == sample_encounter.round_num
    assert len(rebuilt.npcs) == 1
    n = rebuilt.npcs[0]
    assert n.slug == "glacier-stalker"
    assert n.hp == 64
    assert "prone" in n.conditions
    assert n.recharges == {"glacial_roar": "USED"}
    assert n.reaction_used is True


def test_deserialize_with_missing_required_key_raises():
    bad = {
        "name": "x",
        "root": "/tmp",
        "log_path": "/tmp/log.md",
        # missing 'npcs'
    }
    with pytest.raises(ValueError, match="missing required key"):
        deserialize_encounter(bad)


def test_deserialize_with_mismatched_member_hp_raises():
    bad = {
        "name": "x",
        "root": "/tmp",
        "log_path": "/tmp/log.md",
        "npcs": [
            {
                "slug": "a", "name": "A",
                "max_hp": 10, "ac": 10, "speed": "30 ft", "cr": 1,
                "count": 3,
                "member_hp": [10, 10],  # mismatch: count=3 but only 2 entries
            }
        ],
    }
    with pytest.raises(ValueError, match="member_hp len"):
        deserialize_encounter(bad)


def test_deserialize_clamps_invalid_active_tab_index():
    d = {
        "name": "x",
        "root": "/tmp",
        "log_path": "/tmp/log.md",
        "active_tab_index": 99,  # way out of bounds
        "npcs": [
            {"slug": "a", "name": "A", "max_hp": 10, "ac": 10, "speed": "30 ft", "cr": 1},
        ],
    }
    es = deserialize_encounter(d)
    assert es.active_tab_index == 0


def test_state_schema_has_expected_top_level_keys():
    schema = state_schema()
    assert "EncounterState" in schema
    assert "NPCState" in schema
    assert "constraints" in schema
    assert "npcs" in schema["EncounterState"]
    assert "member_hp" in schema["NPCState"]


# ─── pending_effects round-trip (A3-H1) ───────────────────────────────────

def test_pending_effects_round_trip_as_pending_effect_instances():
    """serialize → deserialize must rebuild PendingEffect dataclasses, not
    leave raw dicts (which would crash apply_hit / dataclasses.asdict)."""
    from gui.history import PendingEffect

    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="g", name="Goblin", max_hp=10, ac=12,
                            speed="30", cr=1, id="2"))
    es.pending_effects.append(
        PendingEffect(combatant_id="2", full_amount=18,
                      applied_amount=9, kind="save", resolved=False)
    )

    blob = serialize_encounter(es)
    # serialized form is a plain dict (json-safe)
    assert isinstance(blob["pending_effects"][0], dict)

    restored = deserialize_encounter(blob)
    assert len(restored.pending_effects) == 1
    pe = restored.pending_effects[0]
    assert isinstance(pe, PendingEffect)
    assert pe.combatant_id == "2"
    assert pe.full_amount == 18
    assert pe.applied_amount == 9
    assert pe.kind == "save"
    assert pe.resolved is False


def test_pending_effects_round_trip_via_json():
    """A JSON serialize/parse cycle (the real undo/load path) still yields
    PendingEffect instances."""
    import json

    from gui.history import PendingEffect

    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="g", name="Goblin", max_hp=10, ac=12,
                            speed="30", cr=1, id="2"))
    es.pending_effects.append(
        PendingEffect(combatant_id="2", full_amount=12, applied_amount=0,
                      kind="attack", resolved=True)
    )
    restored = deserialize_encounter(json.loads(json.dumps(serialize_encounter(es))))
    assert all(isinstance(p, PendingEffect) for p in restored.pending_effects)
    assert restored.pending_effects[0].resolved is True


def test_deserialize_pending_effect_missing_key_raises():
    bad = {
        "name": "x", "root": "/tmp", "log_path": "/tmp/log.md",
        "npcs": [],
        "pending_effects": [{"combatant_id": "2", "full_amount": 5}],  # missing keys
    }
    with pytest.raises(ValueError, match="pending_effect dict missing"):
        deserialize_encounter(bad)
