"""Validation tests for the streamline-batch schema additions:
  - apply_condition_on_hit (#7) — structured rider per attack
  - slots (#6)                  — first-class per-day/encounter charges
  - extra_damage (#5)           — second damage type per attack
  - reaction_kind (#4)          — damage / movement / buff variants
  - upsert_many (#3)            — bulk atomic write
"""

from __future__ import annotations

import sys
from pathlib import Path
import tempfile
import os

import pytest

_SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(_SCRIPTS))
from combat_actions_db import upsert, upsert_many, validate_spec, read_all  # noqa: E402


def _base_attack():
    return {
        "type": "single_attack",
        "narration": "thwack",
        "attacks": [
            {"name": "Hit", "to_hit_bonus": 5, "damage": "1d8", "damage_modifier": 3, "damage_type": "slashing"}
        ],
    }


# ─────────── extra_damage ───────────

def test_extra_damage_accepts_full_block():
    spec = _base_attack()
    spec["attacks"][0]["extra_damage"] = {"dice": "2d6", "type": "psychic"}
    assert validate_spec(spec) == []


def test_extra_damage_missing_type_errors():
    spec = _base_attack()
    spec["attacks"][0]["extra_damage"] = {"dice": "2d6"}
    errs = validate_spec(spec)
    assert any("extra_damage missing" in e for e in errs)


def test_extra_damage_not_dict_errors():
    spec = _base_attack()
    spec["attacks"][0]["extra_damage"] = "2d6 psychic"
    errs = validate_spec(spec)
    assert any("extra_damage must be a dict" in e for e in errs)


# ─────────── apply_condition_on_hit ───────────

def test_apply_condition_on_hit_full_block():
    spec = _base_attack()
    spec["attacks"][0]["apply_condition_on_hit"] = {
        "condition": "frightened",
        "save_dc": 14,
        "save_ability": "wis",
        "duration_rounds": 1,
    }
    assert validate_spec(spec) == []


def test_apply_condition_rejects_bogus_ability():
    spec = _base_attack()
    spec["attacks"][0]["apply_condition_on_hit"] = {
        "condition": "frightened", "save_dc": 14, "save_ability": "luck",
    }
    errs = validate_spec(spec)
    assert any("save_ability" in e for e in errs)


def test_apply_condition_requires_save_dc():
    spec = _base_attack()
    spec["attacks"][0]["apply_condition_on_hit"] = {
        "condition": "prone", "save_ability": "str",
    }
    errs = validate_spec(spec)
    assert any("save_dc" in e for e in errs)


# ─────────── slots ───────────

def test_slots_block_accepted():
    spec = {
        "type": "utility", "narration": "moonbeam", "effect": "radiant pillar",
        "slots": {"count": 1, "refresh": "long_rest"},
    }
    assert validate_spec(spec) == []


def test_slots_rejects_bogus_refresh():
    spec = {
        "type": "utility", "narration": "x", "effect": "y",
        "slots": {"count": 1, "refresh": "weekly"},
    }
    errs = validate_spec(spec)
    assert any("refresh" in e for e in errs)


def test_slots_requires_positive_count():
    spec = {
        "type": "utility", "narration": "x", "effect": "y",
        "slots": {"count": 0, "refresh": "long_rest"},
    }
    errs = validate_spec(spec)
    assert any("count" in e for e in errs)


# ─────────── reaction_kind ───────────

def test_reaction_kind_movement_no_damage_required():
    """Streamline #4: an Incorporeal-Escape-style reaction has no damage field."""
    spec = {
        "type": "reaction",
        "reaction_kind": "movement",
        "narration": "blurs through stone",
        "effect": "Move up to speed without provoking opportunity attacks.",
    }
    assert validate_spec(spec) == []


def test_reaction_kind_buff_no_damage_required():
    spec = {
        "type": "reaction",
        "reaction_kind": "buff",
        "narration": "shield of force flickers in",
        "effect": "+5 AC vs the triggering attack until start of next turn.",
    }
    assert validate_spec(spec) == []


def test_reaction_kind_default_is_damage_back_compat():
    """Existing reactions in the DB don't have `reaction_kind`; default must
    remain `damage` (with damage.dice + attacker_save required)."""
    spec = {
        "type": "reaction",
        "narration": "frost shards",
        "damage": {"dice": "1d8", "type": "cold"},
        "attacker_save": {"dc": 15, "ability": "Con"},
    }
    assert validate_spec(spec) == []


def test_reaction_kind_invalid():
    spec = {
        "type": "reaction",
        "reaction_kind": "telepathy",
        "narration": "x",
    }
    errs = validate_spec(spec)
    assert any("reaction_kind" in e for e in errs)


# ─────────── upsert_many ───────────

def test_upsert_many_bulk_writes_atomically(tmp_path, monkeypatch):
    """One read + one write for many records. Verifies the persisted file
    matches the input set and uses a temp DB so we don't touch the prod one."""
    test_db = tmp_path / "actions.jsonl"
    monkeypatch.setenv("DND_COMBAT_ACTIONS_DB", str(test_db))

    persisted = upsert_many([
        ("test-npc-a", "swing", _base_attack()),
        ("test-npc-a", "shoot", {
            "type": "single_attack", "narration": "twang",
            "attacks": [{"name": "Shot", "to_hit_bonus": 4, "damage": "1d6", "damage_modifier": 1, "damage_type": "piercing"}],
        }),
        ("test-npc-b", "stomp", _base_attack()),
    ])
    assert len(persisted) == 3
    all_records = read_all()
    keys = {(r["npc"], r["action"]) for r in all_records}
    assert ("test-npc-a", "swing") in keys
    assert ("test-npc-a", "shoot") in keys
    assert ("test-npc-b", "stomp") in keys


def test_upsert_many_rejects_atomically_on_any_invalid(tmp_path, monkeypatch):
    """If even ONE spec is invalid, the entire batch fails — no partial writes."""
    test_db = tmp_path / "actions.jsonl"
    monkeypatch.setenv("DND_COMBAT_ACTIONS_DB", str(test_db))
    with pytest.raises(ValueError, match="invalid entries"):
        upsert_many([
            ("ok-npc", "swing", _base_attack()),
            ("bad-npc", "broken", {"type": "weird-type", "narration": "x"}),
        ])
    # Nothing should have been written
    assert not test_db.exists() or read_all() == []
