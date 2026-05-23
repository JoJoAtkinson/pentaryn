"""(B) scripts/srd_corrections.yml — house-rules + known-changed authoring guide.

NOT used at runtime by the MCP / SRD path. Consulted ONLY by
`combat_action_upsert` after a row is validated. When the action name being
upserted matches an entry in the corrections file, the tool scans the spec's
text fields for the entry's `expected_phrases` and `banned_phrases` and
returns warnings (never errors — the row still persists).

This gives Joe a single human-readable place to:
  * remind future authoring sessions of a known rule update (Counterspell),
  * pin a house-rule tweak (e.g., "we play with INT-scaling Fireball DCs"),
  * leave a note next to the spell so a quick scan surfaces all house rules.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_corrections_file_exists_and_loads():
    from srd_corrections import load_corrections
    corrections = load_corrections()
    assert isinstance(corrections, dict)
    # Counterspell is the first canonical entry — locks the file's existence.
    assert "counterspell" in corrections.get("spells", {})


def test_counterspell_correction_carries_expected_phrases():
    from srd_corrections import load_corrections
    c = load_corrections()["spells"]["counterspell"]
    assert "Constitution" in c["expected_phrases"]
    assert "not expended" in c["expected_phrases"]
    # And banned 2014 phrasings
    assert "ability check" in c["banned_phrases"]


def test_warnings_for_unknown_action_are_empty():
    """An NPC action that isn't in the corrections file produces no warnings.
    This is the common case — most actions are bespoke and have no SRD parent."""
    from srd_corrections import warnings_for_upsert
    warnings = warnings_for_upsert(
        action="glacial_roar",
        spec={"type": "area", "narration": "...", "damage": {"dice": "8d6", "type": "cold"},
              "save": {"dc": 15, "ability": "Con", "on_save": "half"}},
    )
    assert warnings == []


def test_warnings_fire_on_banned_phrase():
    """Upserting a counterspell row with 2014 'ability check' language must
    produce a warning."""
    from srd_corrections import warnings_for_upsert
    warnings = warnings_for_upsert(
        action="counterspell",
        spec={
            "type": "utility",
            "narration": "...",
            "roll": {"label": "Counterspell ability check", "dice": "1d20",
                     "modifier": 4, "notes": "DC 10 + spell level on the caster's roll."},
        },
    )
    assert warnings, "expected a warning about the 2014 'ability check' phrasing"
    joined = " | ".join(warnings).lower()
    assert "ability check" in joined or "2014" in joined or "banned" in joined


def test_warnings_fire_on_missing_expected_phrase():
    """Upserting a counterspell row without 'Constitution' or 'not expended'
    must produce a warning (something is off about the encoding)."""
    from srd_corrections import warnings_for_upsert
    warnings = warnings_for_upsert(
        action="counterspell",
        spec={
            "type": "utility",
            "narration": "Magic shatters into glittering motes.",
            "effect": "Spell is countered.",  # No Con save, no slot-not-expended note
        },
    )
    assert warnings, "expected a warning about missing expected phrases"


def test_no_warnings_when_spec_matches_2024_phrasing():
    """The current canonical encoding of Counterspell — what got committed in
    actions.jsonl after the fix — must produce NO warnings."""
    from srd_corrections import warnings_for_upsert
    warnings = warnings_for_upsert(
        action="counterspell",
        spec={
            "type": "utility",
            "narration": "Magic shatters.",
            "effect": (
                "**Reaction (2024 rules).** [ASK PLAYER: the CASTING creature makes a "
                "Constitution saving throw. DC = 10 + the level of the slot Counterspell "
                "was cast at — default 3rd-level = **DC 13**]. On a FAIL: the spell "
                "dissipates. If cast with a spell slot, the slot is NOT expended."
            ),
        },
    )
    assert warnings == [], f"expected no warnings on canonical spec; got {warnings!r}"


def test_upsert_returns_warnings_via_mcp_wrapper():
    """The MCP-facing `combat_action_upsert` includes a `warnings` array in
    its JSON response when corrections raise concerns. Successful upserts
    with no concerns omit the field or return [] — either is fine."""
    from dnd_roller import combat_action_upsert
    raw = combat_action_upsert(
        npc="aelric-frostweaver",
        action="counterspell",
        spec={
            "type": "utility",
            "narration": "test (will be overwritten by anti-2014 phrase test).",
            "roll": {"label": "Counterspell ability check", "dice": "1d20",
                     "modifier": 4, "notes": "auto-counters spells of 3rd-level or lower."},
        },
    )
    result = json.loads(raw)
    assert result.get("ok") is True
    assert "warnings" in result, "upsert must include warnings field"
    assert result["warnings"], "expected warnings on 2014-phrase counterspell upsert"
    # Restore the canonical 2024 row so this test doesn't poison the DB.
    from combat_actions_db import upsert as raw_upsert
    raw_upsert("aelric-frostweaver", "counterspell", {
        "type": "utility",
        "verbs": ["counterspell", "counter", "stop spell", "negate"],
        "prerequisite": "Creature within 60 ft just started casting a spell with Verbal, Somatic, or Material components that Aelric can see; uses Aelric's reaction.",
        "narration": "He snaps his fingers — frost crackles in the air between his hand and the caster, and their magic shatters into glittering motes.",
        "effect": (
            "**Reaction (2024 rules).** [ASK PLAYER: the CASTING creature makes a "
            "Constitution saving throw. DC = 10 + the level of the slot Counterspell was "
            "cast at — default 3rd-level = **DC 13** (upcast 4th = DC 14, 5th = DC 15, …)]. "
            "On a FAIL: the spell dissipates with no effect, and the action / Bonus Action / "
            "Reaction used to cast it is wasted. If cast with a spell slot, the slot is NOT "
            "expended. On a SUCCESS: the spell goes off as normal. Shares Aelric's "
            "one-per-round reaction slot with Shield."
        ),
        "trigger": {"scope": "global", "event": "spell_cast", "match": "any creature casts a spell within 60 ft"},
    })
