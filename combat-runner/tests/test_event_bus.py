"""EventBus + TriggerMatcher tests — pure Python, no Qt."""

from __future__ import annotations

import pytest

from gui.event_bus import (
    EventBus,
    TriggerMatch,
    TriggerMatcher,
    TriggerSpec,
    action_event,
    condition_event,
    damage_event,
    heal_event,
    note_event,
    round_event,
    spell_cast_event,
)


# ─────────── EventBus basics ───────────

def test_subscribe_receives_emitted_event():
    bus = EventBus()
    received: list = []
    bus.subscribe("damage", received.append)
    bus.emit(damage_event("stalker", 12, damage_type="cold"))
    assert len(received) == 1
    assert received[0].subject_npc == "stalker"
    assert "cold" in received[0].tags


def test_subscribers_for_other_kinds_are_not_called():
    bus = EventBus()
    damage_received: list = []
    heal_received: list = []
    bus.subscribe("damage", damage_received.append)
    bus.subscribe("heal", heal_received.append)
    bus.emit(damage_event("stalker", 5))
    assert len(damage_received) == 1
    assert len(heal_received) == 0


def test_wildcard_subscribers_get_everything():
    bus = EventBus()
    audit: list = []
    bus.subscribe_all(audit.append)
    bus.emit(damage_event("stalker", 1))
    bus.emit(heal_event("aelric", 10))
    bus.emit(round_event(2))
    assert [e.kind for e in audit] == ["damage", "heal", "round_advanced"]


def test_listener_exception_does_not_crash_bus():
    bus = EventBus()
    other_received: list = []

    def boom(_event):
        raise RuntimeError("listener exploded")

    bus.subscribe("damage", boom)
    bus.subscribe("damage", other_received.append)
    # Should NOT raise — bad listener logs and we continue
    bus.emit(damage_event("stalker", 1))
    assert len(other_received) == 1


def test_unsubscribe_removes_listener():
    bus = EventBus()
    received: list = []
    listener = received.append
    bus.subscribe("damage", listener)
    bus.emit(damage_event("a", 1))
    bus.unsubscribe("damage", listener)
    bus.emit(damage_event("b", 2))
    assert len(received) == 1
    assert received[0].subject_npc == "a"


# ─────────── event constructors ───────────

def test_damage_event_collects_tags():
    e = damage_event("stalker", 18, damage_type="fire", melee=True, range_ft=5)
    assert "fire" in e.tags
    assert "melee" in e.tags
    assert e.payload["amount"] == 18
    assert e.payload["range_ft"] == 5


def test_spell_cast_event_targets_subject_npc():
    e = spell_cast_event(caster="PC:Lyric", spell_name="Hold Person", target_npc="stalker", spell_level=2)
    assert e.subject_npc == "stalker"
    assert e.payload["spell_name"] == "Hold Person"
    assert e.payload["spell_level"] == 2


def test_condition_event_kind_depends_on_applied():
    applied = condition_event("stalker", "prone", applied=True)
    removed = condition_event("stalker", "prone", applied=False)
    assert applied.kind == "condition_applied"
    assert removed.kind == "condition_removed"


# ─────────── TriggerMatcher ───────────

@pytest.fixture
def rime_reflex_trigger():
    """Glacier Stalker's reaction — fires when subject Stalker takes melee damage within 5 ft."""
    return TriggerSpec(
        scope="self",
        event="damage",
        match="melee damage within 5 ft",
        npc_slug="glacier-stalker",
        action_name="rime_reflex",
    )


@pytest.fixture
def counterspell_trigger():
    """Aelric's reaction — global, fires when ANY spell is cast within 60 ft."""
    return TriggerSpec(
        scope="global",
        event="spell_cast",
        match="PC casts a spell within 60 ft",
        npc_slug="aelric-frostweaver",
        action_name="counterspell",
    )


def test_self_trigger_matches_when_subject_matches(rime_reflex_trigger):
    matcher = TriggerMatcher([rime_reflex_trigger])
    event = damage_event("glacier-stalker", 9, melee=True, range_ft=5)
    matches = matcher.find_matches(event)
    assert len(matches) == 1
    assert matches[0].trigger.action_name == "rime_reflex"
    assert matches[0].confidence >= 1.0


def test_self_trigger_does_not_match_when_subject_is_different(rime_reflex_trigger):
    matcher = TriggerMatcher([rime_reflex_trigger])
    event = damage_event("aelric-frostweaver", 9, melee=True, range_ft=5)
    matches = matcher.find_matches(event)
    assert matches == []


def test_global_trigger_matches_regardless_of_subject(counterspell_trigger):
    matcher = TriggerMatcher([counterspell_trigger])
    event = spell_cast_event(caster="PC:Lyric", spell_name="Hold Person", target_npc="glacier-stalker", range_ft=40)
    matches = matcher.find_matches(event)
    assert len(matches) == 1
    assert matches[0].trigger.action_name == "counterspell"


def test_used_reaction_filters_trigger_out(rime_reflex_trigger):
    matcher = TriggerMatcher([rime_reflex_trigger])
    event = damage_event("glacier-stalker", 9, melee=True, range_ft=5)
    matches = matcher.find_matches(event, used_reactions_by_npc={"glacier-stalker": True})
    assert matches == []


def test_range_gate_excludes_out_of_range_events(rime_reflex_trigger):
    matcher = TriggerMatcher([rime_reflex_trigger])
    # Stalker takes damage but the attacker is 30 ft away (ranged hit) — should NOT trigger
    event = damage_event("glacier-stalker", 9, ranged=True, range_ft=30)
    matches = matcher.find_matches(event)
    assert matches == []


def test_damage_type_keyword_filter_excludes_wrong_type():
    """A trigger that expects 'fire damage' shouldn't fire on a cold damage event."""
    trig = TriggerSpec(
        scope="self",
        event="damage",
        match="fire damage",
        npc_slug="some-npc",
        action_name="fire_absorb",
    )
    matcher = TriggerMatcher([trig])
    event = damage_event("some-npc", 10, damage_type="cold")
    matches = matcher.find_matches(event)
    assert matches == []


def test_damage_type_keyword_filter_matches_right_type():
    trig = TriggerSpec(
        scope="self",
        event="damage",
        match="fire damage",
        npc_slug="some-npc",
        action_name="fire_absorb",
    )
    matcher = TriggerMatcher([trig])
    event = damage_event("some-npc", 10, damage_type="fire")
    matches = matcher.find_matches(event)
    assert len(matches) == 1


def test_no_keyword_match_returns_medium_confidence(rime_reflex_trigger):
    """A vague match string with no keyword overlap returns 0.5 confidence —
    the UI should still prompt the DM in that case."""
    vague = TriggerSpec(
        scope="self",
        event="damage",
        match="something happens",
        npc_slug="stalker",
        action_name="vague_react",
    )
    matcher = TriggerMatcher([vague])
    event = damage_event("stalker", 1)
    matches = matcher.find_matches(event)
    assert len(matches) == 1
    assert matches[0].confidence == 0.5


def test_matches_sort_by_confidence():
    high = TriggerSpec(
        scope="self", event="damage",
        match="melee damage within 5 ft",
        npc_slug="x", action_name="high_conf",
    )
    medium = TriggerSpec(
        scope="self", event="damage",
        match="something happens",
        npc_slug="x", action_name="med_conf",
    )
    matcher = TriggerMatcher([medium, high])
    event = damage_event("x", 5, melee=True, range_ft=5)
    matches = matcher.find_matches(event)
    # High-confidence trigger comes first
    assert matches[0].trigger.action_name == "high_conf"
    assert matches[1].trigger.action_name == "med_conf"


def test_event_subject_none_skips_self_triggers(rime_reflex_trigger):
    matcher = TriggerMatcher([rime_reflex_trigger])
    event = round_event(2)  # round events have subject_npc=None
    # But round event's kind is "round_advanced", not "damage" — no candidates at all
    assert matcher.find_matches(event) == []


def test_wrong_damage_type_still_misses_even_with_modifier_hit():
    """Regression for review-1 B2: a fire-melee trigger should NOT fire on a
    cold-melee event. Previously dtype_misses + modifier_hits > 0 still returned
    1.0."""
    trig = TriggerSpec(
        scope="self",
        event="damage",
        match="fire melee damage within 5 ft",
        npc_slug="fire-elemental",
        action_name="fire_aura",
    )
    matcher = TriggerMatcher([trig])
    event = damage_event("fire-elemental", 8, damage_type="cold", melee=True, range_ft=5)
    assert matcher.find_matches(event) == []


def test_untyped_damage_event_still_surfaces_typed_trigger_as_ambiguous():
    """Regression for review-1 B3: a `-12` sigil emits damage with no damage_type.
    A "fire damage" trigger should still surface (at medium confidence) so the
    DM sees the prompt. Previously this fell to 0.0 and silently never fired."""
    trig = TriggerSpec(
        scope="self",
        event="damage",
        match="fire damage",
        npc_slug="fire-elemental",
        action_name="fire_aura",
    )
    matcher = TriggerMatcher([trig])
    event = damage_event("fire-elemental", 12)  # no damage_type
    matches = matcher.find_matches(event)
    assert len(matches) == 1
    assert matches[0].confidence == 0.5


def test_valid_trigger_events_set_matches_event_kind_literal():
    """Drift insurance (review-1 N1): the validator's allowed event names must
    stay in sync with the EventKind Literal in event_bus.py."""
    from typing import get_args
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    from combat_actions_db import _VALID_TRIGGER_EVENTS  # noqa: E402
    from gui.event_bus import EventKind
    assert _VALID_TRIGGER_EVENTS == set(get_args(EventKind))


def test_move_away_event_kind_accepted(sample_npc):
    from gui.event_bus import EventBus, move_away_event
    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)
    bus.emit(move_away_event("3", sample_npc.slug))
    assert len(received) == 1
    assert received[0].payload["combatant_id"] == "3"


def test_collect_triggers_from_db_handles_missing_trigger_field():
    """If an action doesn't declare a `trigger` block, it shouldn't appear in
    the trigger list."""
    from gui.event_bus import collect_triggers_from_db

    class FakeDB:
        def list_actions(self, npc):
            return [
                {"action": "multiattack", "verbs": ["attack"]},
                {"action": "rime_reflex", "verbs": [], "trigger": {
                    "scope": "self", "event": "damage",
                    "match": "melee damage within 5 ft",
                }},
            ]

    triggers = collect_triggers_from_db(FakeDB(), ["glacier-stalker"])
    assert len(triggers) == 1
    assert triggers[0].action_name == "rime_reflex"
    assert triggers[0].npc_slug == "glacier-stalker"
