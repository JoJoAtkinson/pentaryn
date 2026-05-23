"""Tests for the action-info formatter (`gui/action_info.py:format_action_info`).

Formatter takes a full action spec dict (the same shape `combat_actions_db.get`
returns) and produces an HTML/markdown line block suitable for appending to a
tab's combat log via `_append_log`.
"""
from gui.action_info import format_action_info


def test_format_multiattack_includes_each_attack():
    spec = {
        "npc": "beholder-thrulm", "action": "multiattack",
        "type": "multiattack",
        "verbs": ["attack", "tentacle", "maw"],
        "narration": "Four spine-tentacles lash.",
        "attacks": [
            {"name": "Tentacle Lash 1", "to_hit_bonus": 6, "damage": "3d6",
             "damage_modifier": 3, "damage_type": "bludgeoning"},
            {"name": "Maw", "to_hit_bonus": 6, "damage": "4d8",
             "damage_modifier": 3, "damage_type": "piercing"},
        ],
    }
    html = format_action_info(spec)
    assert "multiattack" in html.lower()
    assert "Tentacle Lash 1" in html
    assert "Maw" in html
    assert "3d6" in html or "3d6+3" in html
    assert "bludgeoning" in html
    assert "piercing" in html


def test_format_single_attack_with_range_and_recharge():
    spec = {
        "npc": "x", "action": "disintegration_ray",
        "type": "single_attack",
        "verbs": ["disintegrate"],
        "range": "120 ft",
        "recharge": 5,
        "narration": "...",
        "attacks": [
            {"name": "Disintegration Ray", "to_hit_bonus": 6, "damage": "10d8",
             "damage_modifier": 0, "damage_type": "force"},
        ],
    }
    html = format_action_info(spec)
    assert "120 ft" in html
    # Recharge surface — humans say "5–6" or "(Recharge 5+)" colloquially
    assert "5" in html  # either form is acceptable
    assert "force" in html


def test_format_area_includes_save_dc_and_damage():
    spec = {
        "npc": "x", "action": "void_scream",
        "type": "area",
        "verbs": ["scream"],
        "area": "30-ft radius (self)",
        "recharge": 6,
        "narration": "...",
        "damage": {"dice": "6d10", "type": "psychic"},
        "save": {"dc": 16, "ability": "Wis", "on_save": "half"},
    }
    html = format_action_info(spec)
    assert "30-ft radius (self)" in html
    assert "DC 16" in html or "DC&nbsp;16" in html
    assert "Wis" in html
    assert "6d10" in html
    assert "psychic" in html


def test_format_utility_with_effect_text():
    spec = {
        "npc": "x", "action": "taunt",
        "type": "utility",
        "verbs": ["taunt"],
        "narration": "...",
        "effect": "Target one creature within 30 ft. [ASK PLAYER: DC 12 Cha save] — disadvantage vs others.",
    }
    html = format_action_info(spec)
    assert "Target one creature" in html
    assert "DC 12 Cha" in html


def test_format_utility_with_roll():
    spec = {
        "npc": "x", "action": "stealth",
        "type": "utility",
        "verbs": ["vanish"],
        "narration": "...",
        "roll": {"label": "Stealth", "dice": "1d20", "modifier": 6,
                 "notes": "Compare to passive Perception."},
    }
    html = format_action_info(spec)
    assert "Stealth" in html
    assert "1d20" in html
    # modifier surface
    assert "+6" in html or "6" in html


def test_format_reaction_buff_with_effect():
    spec = {
        "npc": "x", "action": "antireality",
        "type": "reaction",
        "verbs": [],
        "reaction_kind": "buff",
        "trigger": {"scope": "self", "event": "damage", "match": "hit by an attack"},
        "narration": "...",
        "effect": "+2 AC against the triggering attack (declared after seeing the roll).",
    }
    html = format_action_info(spec)
    assert "reaction" in html.lower()
    assert "+2 AC" in html
    # Trigger surface — DM needs to know when it fires
    assert "damage" in html.lower() or "hit by an attack" in html


def test_format_reaction_damage_with_save():
    spec = {
        "npc": "x", "action": "rime_reflex",
        "type": "reaction",
        "verbs": [],
        "trigger": {"scope": "self", "event": "damage", "match": "melee within 5 ft"},
        "narration": "...",
        "damage": {"dice": "1d8", "type": "cold"},
        "attacker_save": {"dc": 15, "ability": "Con", "on_save": "no damage"},
    }
    html = format_action_info(spec)
    assert "1d8" in html
    assert "cold" in html
    assert "DC 15" in html or "DC&nbsp;15" in html


def test_format_includes_verbs_for_dm_hint():
    """The DM benefits from knowing what verbs map to this action."""
    spec = {
        "npc": "x", "action": "multiattack",
        "type": "multiattack",
        "verbs": ["attack", "swing", "hit"],
        "narration": "...",
        "attacks": [{"name": "Bite", "to_hit_bonus": 4, "damage": "1d6",
                    "damage_modifier": 2, "damage_type": "piercing"}],
    }
    html = format_action_info(spec)
    assert "attack" in html.lower()


def test_format_handles_missing_optional_fields():
    """A minimal valid spec must still format without crashing."""
    spec = {
        "npc": "x", "action": "x",
        "type": "utility",
        "verbs": [],
        "narration": "...",
        "effect": "Just text.",
    }
    html = format_action_info(spec)
    assert "Just text" in html
