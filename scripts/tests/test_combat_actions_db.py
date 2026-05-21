"""Tests for the combat-actions JSONL DB: validation, get() precedence, round-trip."""
from __future__ import annotations

import pytest

from scripts import combat_actions_db as cdb


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    """Point the DB at a tmp file for every test (never touch the real DB)."""
    db = tmp_path / "actions.jsonl"
    monkeypatch.setenv("DND_COMBAT_ACTIONS_DB", str(db))
    yield db


# ───────────────────────── good specs, one per type ────────────────────────

GOOD_SPECS = {
    "multiattack": {
        "type": "multiattack",
        "narration": "two swings",
        "attacks": [
            {"name": "Claw", "to_hit_bonus": 5, "damage": "2d6", "damage_type": "slashing"},
            {"name": "Bite", "to_hit_bonus": 4, "damage": "1d8", "damage_type": "piercing"},
        ],
    },
    "single_attack": {
        "type": "single_attack",
        "narration": "one swing",
        "attacks": [
            {"name": "Sword", "to_hit_bonus": 6, "damage": "1d10", "damage_type": "slashing"},
        ],
    },
    "area": {
        "type": "area",
        "narration": "fire everywhere",
        "area": "20ft cone",
        "damage": {"dice": "8d6", "type": "fire"},
        "save": {"dc": 15, "ability": "dex"},
    },
    "utility": {
        "type": "utility",
        "narration": "sneaks off",
        "roll": {"dice": "1d20", "modifier": 8, "label": "Stealth"},
    },
    "reaction": {
        "type": "reaction",
        "narration": "counterstrike",
        "damage": {"dice": "2d8", "type": "force"},
        "attacker_save": {"dc": 14, "ability": "dex"},
    },
}


@pytest.mark.parametrize("kind", sorted(GOOD_SPECS))
def test_validate_spec_accepts_good_spec(kind):
    assert cdb.validate_spec(GOOD_SPECS[kind]) == []


def test_validate_spec_accepts_utility_effect_only():
    spec = {"type": "utility", "narration": "buff", "effect": "Gains +2 AC."}
    assert cdb.validate_spec(spec) == []


def test_validate_spec_accepts_reaction_movement():
    """A movement reaction is now executable by the runner — must validate."""
    spec = {
        "type": "reaction",
        "reaction_kind": "movement",
        "narration": "poof",
        "effect": "The wraith slips through the wall.",
    }
    assert cdb.validate_spec(spec) == []


def test_validate_spec_accepts_reaction_buff():
    spec = {
        "type": "reaction",
        "reaction_kind": "buff",
        "narration": "glow",
        "effect": "+2 AC until next turn.",
    }
    assert cdb.validate_spec(spec) == []


def test_validate_spec_accepts_extra_damage():
    spec = {
        "type": "single_attack",
        "narration": "flametongue",
        "attacks": [
            {
                "name": "Sword",
                "to_hit_bonus": 6,
                "damage": "1d8",
                "damage_type": "slashing",
                "extra_damage": {"dice": "2d6", "type": "fire"},
            }
        ],
    }
    assert cdb.validate_spec(spec) == []


# ───────────────────────── rejection cases (specific errors) ───────────────

def test_validate_spec_rejects_non_dict():
    errs = cdb.validate_spec(["not", "a", "dict"])
    assert errs
    assert "JSON object" in errs[0]


def test_validate_spec_rejects_none():
    errs = cdb.validate_spec(None)
    assert errs and "JSON object" in errs[0]


@pytest.mark.parametrize("bad_dice", ["8", "2d6+3", "garbage", "0d6", "2d0", "2d5", "03d06"])
def test_validate_spec_rejects_bad_area_dice(bad_dice):
    """area.damage.dice must be a valid NdM string the runner can execute."""
    spec = {
        "type": "area",
        "narration": "x",
        "area": "20ft",
        "damage": {"dice": bad_dice, "type": "fire"},
        "save": {"dc": 13, "ability": "dex"},
    }
    errs = cdb.validate_spec(spec)
    assert errs
    assert any("area.damage.dice" in e for e in errs)


def test_validate_spec_rejects_bad_attack_dice():
    spec = {
        "type": "single_attack",
        "narration": "x",
        "attacks": [
            {"name": "Bite", "to_hit_bonus": 5, "damage": "lots", "damage_type": "piercing"},
        ],
    }
    errs = cdb.validate_spec(spec)
    assert errs
    assert any("attacks[0].damage" in e for e in errs)


def test_validate_spec_rejects_bad_extra_damage_dice():
    spec = {
        "type": "single_attack",
        "narration": "x",
        "attacks": [
            {
                "name": "Sword",
                "to_hit_bonus": 6,
                "damage": "1d8",
                "damage_type": "slashing",
                "extra_damage": {"dice": "2d6+3", "type": "fire"},
            }
        ],
    }
    errs = cdb.validate_spec(spec)
    assert errs
    assert any("extra_damage.dice" in e for e in errs)


def test_validate_spec_rejects_bad_utility_roll_dice():
    spec = {"type": "utility", "narration": "x", "roll": {"dice": "d20", "label": "Stealth"}}
    errs = cdb.validate_spec(spec)
    assert errs
    assert any("utility.roll.dice" in e for e in errs)


def test_validate_spec_rejects_bad_reaction_dice():
    spec = {
        "type": "reaction",
        "narration": "x",
        "damage": {"dice": "999d6", "type": "force"},
        "attacker_save": {"dc": 14, "ability": "dex"},
    }
    errs = cdb.validate_spec(spec)
    assert errs
    assert any("reaction.damage.dice" in e for e in errs)


def test_validate_spec_accepts_well_formed_slots():
    """A well-formed `slots` block validates — the runner surfaces it as a
    track-by-hand reminder, so the spec is still executable."""
    spec = {
        "type": "utility",
        "narration": "x",
        "effect": "blink",
        "slots": {"count": 3, "refresh": "long_rest"},
    }
    assert cdb.validate_spec(spec) == []


def test_validate_spec_rejects_malformed_slots():
    """A malformed `slots` block (bad refresh / non-positive count) is rejected."""
    spec = {
        "type": "utility",
        "narration": "x",
        "effect": "blink",
        "slots": {"count": 0, "refresh": "fortnight"},
    }
    errs = cdb.validate_spec(spec)
    assert errs
    assert any("slots.count" in e for e in errs)
    assert any("slots.refresh" in e for e in errs)


def test_validate_spec_rejects_bad_type():
    errs = cdb.validate_spec({"type": "nonsense", "narration": "x"})
    assert errs and "type must be one of" in errs[0]


def test_validate_spec_rejects_non_dict_area_damage():
    spec = {
        "type": "area",
        "narration": "x",
        "damage": "2d6",
        "save": {"dc": 13, "ability": "dex"},
    }
    errs = cdb.validate_spec(spec)
    assert errs
    assert any("area.damage must be an object" in e for e in errs)


# ───────────────────────── get() precedence ────────────────────────────────

def test_get_exact_action_name_beats_verb():
    """An exact action-name match wins over a verb match on another row."""
    cdb.upsert("ogre", "smash", {**GOOD_SPECS["single_attack"], "verbs": ["smash"]})
    cdb.upsert("ogre", "stomp", {**GOOD_SPECS["single_attack"], "verbs": ["smash"]})
    # 'smash' is both an action name (row 1) and a verb (row 2) — name wins.
    rec = cdb.get("ogre", "smash")
    assert rec is not None
    assert rec["action"] == "smash"


def test_get_verb_match_case_insensitive():
    cdb.upsert("ogre", "club", {**GOOD_SPECS["single_attack"], "verbs": ["Bash"]})
    assert cdb.get("ogre", "bash")["action"] == "club"
    assert cdb.get("ogre", "BASH")["action"] == "club"


def test_get_returns_none_for_unknown():
    cdb.upsert("ogre", "club", GOOD_SPECS["single_attack"])
    assert cdb.get("ogre", "nonexistent") is None
    assert cdb.get("nobody", "club") is None


# ───────────────────────── upsert → read_all round-trip ────────────────────

def test_upsert_read_all_round_trip():
    cdb.upsert("goblin", "stab", GOOD_SPECS["single_attack"])
    cdb.upsert("goblin", "fireball", GOOD_SPECS["area"])
    records = cdb.read_all()
    assert len(records) == 2
    by_action = {r["action"]: r for r in records}
    assert by_action["stab"]["type"] == "single_attack"
    assert by_action["fireball"]["type"] == "area"
    assert all("updated_at" in r for r in records)


def test_upsert_replaces_existing():
    cdb.upsert("goblin", "stab", GOOD_SPECS["single_attack"])
    cdb.upsert("goblin", "stab", {**GOOD_SPECS["single_attack"], "narration": "REVISED"})
    records = [r for r in cdb.read_all() if r["action"] == "stab"]
    assert len(records) == 1
    assert records[0]["narration"] == "REVISED"


def test_upsert_rejects_bad_spec():
    with pytest.raises(ValueError, match="invalid spec"):
        cdb.upsert("goblin", "broken", {"type": "area", "narration": "x",
                                        "damage": {"dice": "garbage"},
                                        "save": {"dc": 13, "ability": "dex"}})
