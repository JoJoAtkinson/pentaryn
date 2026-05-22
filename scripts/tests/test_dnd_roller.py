"""Tests for the D&D roller's pure logic (narrative, bonuses, validation)."""
from __future__ import annotations

import json

import pytest

from scripts import dnd_roller


@pytest.fixture(autouse=True)
def reset_cache():
    """Reset module-level cache state before each test."""
    dnd_roller._number_cache.clear()
    dnd_roller._source_cache.clear()
    yield
    dnd_roller._number_cache.clear()
    dnd_roller._source_cache.clear()


def _seed_cache(numbers: list[int], source: str = "quantumnumbers") -> None:
    """Helper: pre-populate the cache with deterministic numbers."""
    dnd_roller._number_cache.extend(numbers)
    dnd_roller._source_cache.extend([source] * len(numbers))


def test_roll_dice_returns_required_json_fields():
    """Result JSON must include narrative, rolls, source, total fields."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert "narrative" in result
    assert "rolls" in result
    assert "source" in result
    assert "total_raw" in result
    assert "total_with_bonuses" in result
    assert "dice_notation" in result


def test_roll_dice_rolls_match_modulo():
    """Each roll = (uint16 % dice_size) + 1."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert result["rolls"] == [15, 12, 18]


def test_bonuses_applied_per_die():
    """When bonuses=[2,3,4], each roll gets its own bonus."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(
        num_dice=3, dice_size=20, bonuses=[2, 3, 4]
    ))
    assert result["rolls"] == [15, 12, 18]
    assert result["bonuses"] == [2, 3, 4]
    assert result["rolls_with_bonuses"] == [17, 15, 22]
    assert result["total_raw"] == 45
    assert result["total_with_bonuses"] == 54


def test_modifier_applied_to_total_only():
    """`modifier` adds to the final total but not per-die."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(
        num_dice=3, dice_size=20, modifier=5
    ))
    assert result["rolls"] == [15, 12, 18]
    assert result["total_raw"] == 45
    assert result["total_with_bonuses"] == 50


def test_bonuses_and_modifier_combined():
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(
        num_dice=3, dice_size=20, bonuses=[2, 2, 2], modifier=5
    ))
    assert result["total_raw"] == 45
    assert result["total_with_bonuses"] == 56  # 51 + 5


def test_bonuses_length_mismatch_raises():
    _seed_cache([14, 11, 17])
    with pytest.raises(ValueError, match="bonuses"):
        dnd_roller.roll_dice(num_dice=3, dice_size=20, bonuses=[2, 3])


def test_quantum_marker_present_when_source_quantum():
    _seed_cache([14, 11, 17], source="quantumnumbers")
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert result["narrative"].startswith("⚛️")
    assert result["source"] == "quantumnumbers"


def test_no_quantum_marker_when_random_org_fallback():
    _seed_cache([14, 11, 17], source="random_org")
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert not result["narrative"].startswith("⚛️")
    assert result["source"] == "random_org"


def test_narrative_includes_dice_glyph():
    _seed_cache([14, 11, 17], source="random_org")
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    # Assert against the live mapping so the test can't drift if the glyph
    # codepoint changes again (was a PUA codepoint, now a U+1F51x emoji).
    assert dnd_roller._DICE_GLYPHS[20] in result["narrative"]


def test_dice_notation_field():
    _seed_cache([14, 11, 17])
    r1 = json.loads(dnd_roller.roll_dice(3, 20))
    assert r1["dice_notation"] == "3d20"

    _seed_cache([14, 11, 17])
    r2 = json.loads(dnd_roller.roll_dice(3, 20, modifier=5))
    assert r2["dice_notation"] == "3d20+5"

    _seed_cache([14, 11, 17])
    r3 = json.loads(dnd_roller.roll_dice(3, 20, modifier=-2))
    assert r3["dice_notation"] == "3d20-2"


def test_bonuses_none_means_zero_bonuses():
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert result["rolls_with_bonuses"] == result["rolls"]
    assert result["bonuses"] == [0, 0, 0]


def test_invalid_dice_size_raises():
    _seed_cache([14])
    with pytest.raises(ValueError, match="dice_size"):
        dnd_roller.roll_dice(num_dice=1, dice_size=7)


def test_modifier_out_of_range_raises():
    _seed_cache([14])
    with pytest.raises(ValueError, match="modifier"):
        dnd_roller.roll_dice(num_dice=1, dice_size=20, modifier=5000)


# ───────────────────────── _parse_dice_spec bounds (A3-E2) ─────────────────

@pytest.mark.parametrize("bad", ["0d6", "2d0", "1000d6", "garbage", "2d5", ""])
def test_parse_dice_spec_rejects_bad_input(bad):
    """_parse_dice_spec must reject out-of-bounds counts/sizes and garbage."""
    with pytest.raises(ValueError):
        dnd_roller._parse_dice_spec(bad)


@pytest.mark.parametrize(
    "good,expected",
    [("2d6", (2, 6)), ("1d20", (1, 20)), ("100d4", (100, 4)), (" 3 d 8 ", (3, 8))],
)
def test_parse_dice_spec_accepts_valid(good, expected):
    assert dnd_roller._parse_dice_spec(good) == expected


def test_parse_dice_spec_rejects_leading_zeros():
    """Leading-zero dice (A3-E10) must be rejected, not silently corrected."""
    with pytest.raises(ValueError):
        dnd_roller._parse_dice_spec("03d06")


# ───────────────────────── _confined_log_path (C3-F1) ──────────────────────

def test_confined_log_path_accepts_repo_relative_md(tmp_path, monkeypatch):
    """A repo-relative .md path resolves inside the repo and is accepted."""
    p = dnd_roller._confined_log_path("combat-runner/test-log.md")
    assert p.suffix == ".md"
    assert dnd_roller._REPO_ROOT in p.parents


def test_confined_log_path_rejects_outside_repo():
    with pytest.raises(ValueError, match="inside the repo"):
        dnd_roller._confined_log_path("/tmp/evil-log.md")


def test_confined_log_path_rejects_traversal():
    with pytest.raises(ValueError, match="inside the repo"):
        dnd_roller._confined_log_path("../../../../tmp/evil.md")


def test_confined_log_path_rejects_non_md():
    with pytest.raises(ValueError, match=r"\.md"):
        dnd_roller._confined_log_path("combat-runner/evil.zshrc")


def test_log_combat_event_rejects_bad_path():
    """log_combat_event returns a structured error (not a crash) on a bad path."""
    result = json.loads(dnd_roller.log_combat_event("/etc/passwd", "x"))
    assert result["logged"] is False
    assert "error" in result


# ───────────────────────── combat_action_upsert robustness (A4-M1) ─────────

def test_combat_action_upsert_non_dict_spec_returns_ok_false():
    """A non-dict spec must yield {"ok": false}, not an uncaught crash."""
    result = json.loads(
        dnd_roller.combat_action_upsert("x", "y", ["not", "a", "dict"])
    )
    assert result["ok"] is False
    assert "error" in result


# ───────────────────────── combat action runner ────────────────────────────

def _run_action(monkeypatch, tmp_path, npc, action, spec):
    """Seed a tmp DB with one action and run it through roll_combat_action."""
    import scripts.combat_actions_db as cdb

    db = tmp_path / "actions.jsonl"
    monkeypatch.setenv("DND_COMBAT_ACTIONS_DB", str(db))
    cdb.upsert(npc, action, spec)
    return json.loads(dnd_roller.roll_combat_action(npc, action))


def test_reaction_movement_path_no_damage_roll(monkeypatch, tmp_path):
    """A reaction_kind=movement spec prints the effect, no damage roll."""
    result = _run_action(
        monkeypatch, tmp_path, "wraith", "phase_escape",
        {
            "type": "reaction",
            "reaction_kind": "movement",
            "narration": "poof",
            "effect": "The wraith slips through the wall.",
        },
    )
    assert "error" not in result
    assert "slips through the wall" in result["output"]
    assert result["action_type"] == "reaction"


def test_reaction_buff_path(monkeypatch, tmp_path):
    result = _run_action(
        monkeypatch, tmp_path, "cleric", "shield_of_faith",
        {
            "type": "reaction",
            "reaction_kind": "buff",
            "narration": "glow",
            "effect": "+2 AC until the start of the cleric's next turn.",
        },
    )
    assert "error" not in result
    assert "+2 AC" in result["output"]


def test_slots_surfaced_in_output(monkeypatch, tmp_path):
    """A spec with `slots` runs and surfaces a charge-tracking reminder."""
    result = _run_action(
        monkeypatch, tmp_path, "mage", "blink",
        {
            "type": "utility",
            "narration": "vanishes",
            "effect": "Teleports 30ft.",
            "slots": {"count": 3, "refresh": "long_rest"},
        },
    )
    assert "error" not in result
    assert "charge" in result["output"].lower()


def test_extra_damage_folded_into_total(monkeypatch, tmp_path):
    """extra_damage is rolled and added to the attack's damage total."""
    # 5 numbers: 1 to-hit + 1 base damage + ... extra damage roll.
    _seed_cache([10, 0, 0, 0, 0, 0, 0, 0], source="random_org")
    result = _run_action(
        monkeypatch, tmp_path, "fire-knight", "flame_strike",
        {
            "type": "single_attack",
            "narration": "burn",
            "attacks": [
                {
                    "name": "Longsword",
                    "to_hit_bonus": 5,
                    "damage": "1d8",
                    "damage_modifier": 3,
                    "damage_type": "slashing",
                    "extra_damage": {"dice": "2d6", "type": "fire"},
                }
            ],
        },
    )
    assert "error" not in result
    assert "extra_damage" in result["output"]
    assert "fire" in result["output"]
