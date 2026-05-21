"""Watch / broadcast / suggest system tests.

Schema:
    "watch": {
      "event": "bloodied" | "condition_applied" | "damage" | ...,
      "match": "paralyzed" | "fire" | "",   // optional sub-filter
      "scope": "self" | "ally" | "any",
      "priority": 10
    }

When an event matches, the action surfaces as a deterministic suggestion on
the OWNING NPC's tab — with the event's subject inlined as the target ('Cure
Wounds → Aelric').
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from gui.event_bus import (
    EventBus,
    WatchMatcher,
    WatchSpec,
    bloodied_event,
    collect_watches_from_db,
    condition_event,
    damage_event,
    heal_event,
)
from gui.state import NPCState


_SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(_SCRIPTS))
from combat_actions_db import validate_spec  # noqa: E402


# ─────────── WatchSpec validation ───────────

def test_watch_spec_validates_correctly():
    spec = {
        "type": "utility",
        "narration": "channel healing",
        "effect": "ally regains 2d8+3 HP",
        "watch": {"event": "bloodied", "scope": "ally", "priority": 20},
    }
    assert validate_spec(spec) == []


def test_watch_rejects_bogus_event():
    spec = {
        "type": "utility", "narration": "x", "effect": "y",
        "watch": {"event": "explosion", "scope": "ally"},
    }
    errs = validate_spec(spec)
    assert any("watch.event" in e for e in errs)


def test_watch_rejects_bogus_scope():
    spec = {
        "type": "utility", "narration": "x", "effect": "y",
        "watch": {"event": "bloodied", "scope": "party"},
    }
    errs = validate_spec(spec)
    assert any("watch.scope" in e for e in errs)


def test_watch_must_be_dict():
    spec = {
        "type": "utility", "narration": "x", "effect": "y",
        "watch": "an ally bloodies",
    }
    errs = validate_spec(spec)
    assert any("watch must be a dict" in e for e in errs)


# ─────────── WatchMatcher behaviour ───────────

@pytest.fixture
def cure_wounds_watch():
    return WatchSpec(
        event="bloodied", match="", scope="ally",
        npc_slug="aelric-frostweaver", action_name="cure_wounds", priority=20,
    )


def test_ally_scope_fires_for_different_subject(cure_wounds_watch):
    matcher = WatchMatcher([cure_wounds_watch])
    matches = matcher.find_matches(bloodied_event("glacier-stalker"))
    assert len(matches) == 1
    assert matches[0].watch.action_name == "cure_wounds"
    assert matches[0].target_npc == "glacier-stalker"


def test_ally_scope_does_not_fire_for_self(cure_wounds_watch):
    """A watch with scope=ally should NOT fire on its own NPC's bloodied event."""
    matcher = WatchMatcher([cure_wounds_watch])
    matches = matcher.find_matches(bloodied_event("aelric-frostweaver"))
    assert matches == []


def test_self_scope_fires_only_for_owning_npc():
    w = WatchSpec(event="condition_applied", match="paralyzed", scope="self",
                  npc_slug="aelric-frostweaver", action_name="freedom_of_movement")
    matcher = WatchMatcher([w])
    # Aelric himself gets paralyzed → his "self-cleanse" surfaces
    assert len(matcher.find_matches(condition_event("aelric-frostweaver", "paralyzed", applied=True))) == 1
    # Different NPC paralyzed → does NOT fire
    assert matcher.find_matches(condition_event("stalker", "paralyzed", applied=True)) == []


def test_match_filter_excludes_wrong_condition():
    """A watch with match='paralyzed' shouldn't fire on a 'prone' condition event."""
    w = WatchSpec(event="condition_applied", match="paralyzed", scope="ally",
                  npc_slug="healer", action_name="remove_paralysis")
    matcher = WatchMatcher([w])
    assert matcher.find_matches(condition_event("ally", "prone", applied=True)) == []
    assert len(matcher.find_matches(condition_event("ally", "paralyzed", applied=True))) == 1


def test_damage_type_filter():
    w = WatchSpec(event="damage", match="cold", scope="ally",
                  npc_slug="fire-priest", action_name="warming_touch")
    matcher = WatchMatcher([w])
    # Cold damage on ally → fire
    matches = matcher.find_matches(damage_event("ally", 5, damage_type="cold"))
    assert len(matches) == 1
    # Fire damage on ally → does not fire (wrong type)
    assert matcher.find_matches(damage_event("ally", 5, damage_type="fire")) == []


def test_matches_sort_by_priority_descending():
    high = WatchSpec(event="bloodied", match="", scope="ally", npc_slug="h",
                     action_name="emergency_heal", priority=99)
    low = WatchSpec(event="bloodied", match="", scope="ally", npc_slug="h",
                    action_name="basic_heal", priority=5)
    matcher = WatchMatcher([low, high])
    matches = matcher.find_matches(bloodied_event("ally"))
    assert matches[0].watch.action_name == "emergency_heal"
    assert matches[1].watch.action_name == "basic_heal"


def test_any_scope_fires_regardless_of_subject():
    w = WatchSpec(event="death", match="", scope="any",
                  npc_slug="lich", action_name="absorb_soul")
    matcher = WatchMatcher([w])
    assert len(matcher.find_matches({"kind": "death"} and __make_death_event("x"))) >= 1


def __make_death_event(slug):
    from gui.event_bus import death_event
    return death_event(slug)


# ─────────── DB collection ───────────

def test_collect_watches_from_db_handles_missing_field():
    class FakeDB:
        def list_actions(self, npc):
            return [
                {"action": "multiattack", "verbs": ["attack"]},  # no watch
                {"action": "cure_wounds", "verbs": [], "watch": {
                    "event": "bloodied", "scope": "ally", "priority": 15,
                }},
            ]
    watches = collect_watches_from_db(FakeDB(), ["healer"])
    assert len(watches) == 1
    assert watches[0].action_name == "cure_wounds"
    assert watches[0].priority == 15


# ─────────── state-side bloodied transition ───────────

def test_apply_damage_reports_became_bloodied_on_transition():
    """The half-HP transition is what makes the bloodied event fire only once."""
    npc = NPCState(slug="x", name="X", max_hp=20, ac=10, speed="30 ft", cr=1)
    # Take 5 damage — still above half (15/20 HP)
    r = npc.apply_damage(5)
    assert r["became_bloodied"] is False
    # Take 6 more (now 9/20 HP — below half)
    r = npc.apply_damage(6)
    assert r["became_bloodied"] is True
    # Take 1 more — still bloodied, but didn't TRANSITION this damage
    r = npc.apply_damage(1)
    assert r["became_bloodied"] is False
