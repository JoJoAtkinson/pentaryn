"""Validator tests for the optional `trigger` block on combat_actions_db specs.

The trigger block is what lets event-driven reactions (Rime Reflex, Counterspell)
auto-fire when matching events fly across the event bus. The validator must
reject malformed triggers loudly so the daemon-authored DB rows don't silently
ship with broken triggers.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# combat_actions_db lives under scripts/ — add it to the path
_SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(_SCRIPTS))

from combat_actions_db import validate_spec  # noqa: E402


def _base_reaction_spec() -> dict:
    """Minimal valid reaction spec we'll layer trigger blocks onto."""
    return {
        "type": "reaction",
        "narration": "snap-cold counter",
        "damage": {"dice": "1d6", "type": "cold"},
        "attacker_save": {"dc": 14, "ability": "DEX"},
    }


def test_no_trigger_field_is_fine():
    spec = _base_reaction_spec()
    assert validate_spec(spec) == []


def test_well_formed_self_trigger_passes():
    spec = _base_reaction_spec()
    spec["trigger"] = {
        "scope": "self",
        "event": "damage",
        "match": "melee damage within 5 ft",
    }
    assert validate_spec(spec) == []


def test_well_formed_global_trigger_passes():
    spec = _base_reaction_spec()
    spec["trigger"] = {
        "scope": "global",
        "event": "spell_cast",
        "match": "any creature casts a spell within 60 ft",
    }
    assert validate_spec(spec) == []


def test_trigger_must_be_a_dict():
    spec = _base_reaction_spec()
    spec["trigger"] = "melee damage"  # string, not a dict
    errors = validate_spec(spec)
    assert any("must be a dict" in e for e in errors)


def test_trigger_rejects_bogus_scope():
    spec = _base_reaction_spec()
    spec["trigger"] = {"scope": "party", "event": "damage", "match": "x"}
    errors = validate_spec(spec)
    assert any("trigger.scope" in e for e in errors)


def test_trigger_rejects_bogus_event():
    spec = _base_reaction_spec()
    spec["trigger"] = {"scope": "self", "event": "explosion", "match": "x"}
    errors = validate_spec(spec)
    assert any("trigger.event" in e for e in errors)


def test_trigger_rejects_missing_match():
    spec = _base_reaction_spec()
    spec["trigger"] = {"scope": "self", "event": "damage"}  # no match
    errors = validate_spec(spec)
    assert any("trigger.match" in e for e in errors)


def test_trigger_rejects_empty_match():
    spec = _base_reaction_spec()
    spec["trigger"] = {"scope": "self", "event": "damage", "match": "   "}
    errors = validate_spec(spec)
    assert any("trigger.match" in e for e in errors)


def test_trigger_on_non_reaction_action_is_allowed():
    """Triggers aren't reaction-only — a utility action could declare a trigger
    too (e.g., Shield as a utility that auto-prompts on incoming attack). The
    validator should not gate the trigger on `type == reaction`."""
    spec = {
        "type": "utility",
        "narration": "+5 AC until start of next turn",
        "effect": "AC +5 vs the triggering attack",
        "trigger": {
            "scope": "self",
            "event": "damage",
            "match": "incoming attack hits",
        },
    }
    assert validate_spec(spec) == []
