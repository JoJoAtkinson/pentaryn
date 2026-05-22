"""Unit tests for combat-runner/gui/dispatcher.py — sigil parsing + fuzzy match."""

from __future__ import annotations

import pytest

from gui.dispatcher import Dispatcher, InputKind, _fuzzy_match_actions


@pytest.fixture
def dispatcher() -> Dispatcher:
    return Dispatcher()


# ─────────── damage sigils ───────────

def test_simple_damage(dispatcher):
    p = dispatcher.parse("-18")
    assert p.kind is InputKind.DAMAGE
    assert p.amount == 18
    assert p.damage_type is None
    assert p.member is None


def test_damage_with_type_tag(dispatcher):
    p = dispatcher.parse("-18 fire")
    assert p.kind is InputKind.DAMAGE
    assert p.amount == 18
    assert p.damage_type == "fire"


def test_mob_damage(dispatcher):
    p = dispatcher.parse("m3 -5")
    assert p.kind is InputKind.DAMAGE
    assert p.amount == 5
    assert p.member == 3


def test_mob_damage_with_type(dispatcher):
    p = dispatcher.parse("m2 -7 cold")
    assert p.kind is InputKind.DAMAGE
    assert p.amount == 7
    assert p.member == 2
    assert p.damage_type == "cold"


# ─────────── heal sigils ───────────

def test_simple_heal(dispatcher):
    p = dispatcher.parse("+10")
    assert p.kind is InputKind.HEAL
    assert p.amount == 10
    assert p.member is None


def test_mob_heal(dispatcher):
    p = dispatcher.parse("m1 +5")
    assert p.kind is InputKind.HEAL
    assert p.amount == 5
    assert p.member == 1


# ─────────── conditions ───────────

def test_condition_toggle(dispatcher):
    p = dispatcher.parse("@prone")
    assert p.kind is InputKind.CONDITION
    assert p.condition == "prone"
    assert p.condition_target is None


def test_condition_with_target(dispatcher):
    p = dispatcher.parse("@grappled tenza")
    assert p.kind is InputKind.CONDITION
    assert p.condition == "grappled"
    assert p.condition_target == "tenza"


def test_bare_at_opens_menu(dispatcher):
    p = dispatcher.parse("@")
    assert p.kind is InputKind.CONDITION_MENU


def test_condition_normalizes_case(dispatcher):
    p = dispatcher.parse("@Prone")
    assert p.kind is InputKind.CONDITION
    assert p.condition == "prone"


# ─────────── notes ───────────

def test_note_command(dispatcher):
    p = dispatcher.parse("note PC casts Hold Person on stalker")
    assert p.kind is InputKind.NOTE
    assert p.note_text == "PC casts Hold Person on stalker"


def test_note_case_insensitive(dispatcher):
    p = dispatcher.parse("NOTE check Stalker HP")
    assert p.kind is InputKind.NOTE


# ─────────── reorder + quit ───────────

def test_reorder_command(dispatcher):
    p = dispatcher.parse("/reorder stalker aelric gnoll-pack")
    assert p.kind is InputKind.REORDER
    assert p.reorder_slugs == ["stalker", "aelric", "gnoll-pack"]


def test_quit_and_exit(dispatcher):
    assert dispatcher.parse("/quit").kind is InputKind.QUIT
    assert dispatcher.parse("/exit").kind is InputKind.QUIT
    assert dispatcher.parse("/Quit").kind is InputKind.QUIT


# ─────────── action fuzzy match ───────────

def test_exact_verb_match_is_action(dispatcher, sample_actions):
    p = dispatcher.parse("attack", sample_actions)
    assert p.kind is InputKind.ACTION
    assert p.action_name == "multiattack"


def test_exact_action_name_match(dispatcher, sample_actions):
    p = dispatcher.parse("multiattack", sample_actions)
    assert p.kind is InputKind.ACTION
    assert p.action_name == "multiattack"


def test_case_insensitive_match(dispatcher, sample_actions):
    p = dispatcher.parse("BREATH", sample_actions)
    assert p.kind is InputKind.ACTION
    assert p.action_name == "glacial_roar"


def test_prefix_match_unique(dispatcher, sample_actions):
    # "froz" is unique to frozen_bile (action name prefix). "frost" would be
    # ambiguous because glacial_roar's "frost breath" verb also starts with it.
    p = dispatcher.parse("froz", sample_actions)
    assert p.kind is InputKind.ACTION
    assert p.action_name == "frozen_bile"


def test_legitimately_ambiguous_query_routes_to_llm(dispatcher, sample_actions):
    """'attack' matches multiattack (exact verb) AND pounce (substring of name
    via 'leap_attack' style)... actually 'attack' is unique to multiattack here.
    Use a query that matches two: 'leap' matches pounce verb 'leap' AND nothing
    else here. Force a real ambiguity with synthetic actions below."""
    actions = [
        {"action": "frost_ray", "verbs": ["ray", "frost ray", "blast"]},
        {"action": "glacial_roar", "verbs": ["frost breath", "roar"]},
    ]
    p = dispatcher.parse("frost", actions)
    assert p.kind is InputKind.AMBIGUOUS
    assert set(p.candidate_actions) == {"frost_ray", "glacial_roar"}


def test_substring_match(dispatcher, sample_actions):
    p = dispatcher.parse("bile", sample_actions)  # only frozen_bile has this verb
    assert p.kind is InputKind.ACTION
    assert p.action_name == "frozen_bile"


def test_ambiguous_match_returns_candidates(dispatcher):
    """If two actions both contain the query as a substring of their verbs,
    we get AMBIGUOUS (caller routes to LLM)."""
    actions = [
        {"action": "action_a", "verbs": ["leap_attack", "jump_attack"]},
        {"action": "action_b", "verbs": ["leap_strike", "leap_kick"]},
    ]
    p = dispatcher.parse("leap", actions)
    assert p.kind is InputKind.AMBIGUOUS
    assert set(p.candidate_actions) == {"action_a", "action_b"}


def test_no_match_returns_unknown(dispatcher, sample_actions):
    p = dispatcher.parse("teleport to mars", sample_actions)
    assert p.kind is InputKind.UNKNOWN


def test_empty_input_returns_unknown(dispatcher):
    p = dispatcher.parse("")
    assert p.kind is InputKind.UNKNOWN


def test_whitespace_only_input_returns_unknown(dispatcher):
    p = dispatcher.parse("    ")
    assert p.kind is InputKind.UNKNOWN


def test_sigil_takes_precedence_over_action_fuzzy(dispatcher, sample_actions):
    """A `-N` sigil should never be misinterpreted as a verb even if it
    technically contains letters that fuzzy-match."""
    p = dispatcher.parse("-18", sample_actions)
    assert p.kind is InputKind.DAMAGE


# ─────────── _fuzzy_match_actions ordering ───────────

def test_fuzzy_match_orders_exact_name_first():
    actions = [
        {"action": "pounce", "verbs": ["leap"]},
        {"action": "leap_attack", "verbs": ["pounce"]},
    ]
    matches = _fuzzy_match_actions("pounce", actions)
    # exact name match (action="pounce") should be first
    assert matches[0] == "pounce"


def test_fuzzy_match_orders_verb_over_substring():
    actions = [
        {"action": "thing_with_attack_in_name", "verbs": ["other"]},
        {"action": "thing_b", "verbs": ["attack"]},
    ]
    matches = _fuzzy_match_actions("attack", actions)
    assert matches[0] == "thing_b"


# ─────────── ambiguous → LLM fallback contract ───────────

def test_action_dispatch_skipped_when_no_actions_available(dispatcher):
    """If we don't pass available_actions, a bare verb becomes UNKNOWN
    (caller routes to LLM)."""
    p = dispatcher.parse("attack")
    assert p.kind is InputKind.UNKNOWN


def test_m0_damage_is_rejected_not_silently_no_op(dispatcher):
    """Regression for review-1 B1: `m0 -5` previously parsed as a valid mob
    sigil but became a silent no-op via apply_damage(member=0). Reject in the
    regex so it routes to LLM fallback instead."""
    p = dispatcher.parse("m0 -5")
    assert p.kind is InputKind.UNKNOWN  # falls through to LLM


def test_m0_heal_is_rejected(dispatcher):
    p = dispatcher.parse("m0 +5")
    assert p.kind is InputKind.UNKNOWN


def test_m1_damage_still_works(dispatcher):
    """Sanity: 1-indexed mob targeting is unaffected by the m0 fix."""
    p = dispatcher.parse("m1 -5")
    assert p.kind is InputKind.DAMAGE
    assert p.amount == 5
    assert p.member == 1


def test_m10_damage_still_works(dispatcher):
    """Two-digit member indices are still accepted."""
    p = dispatcher.parse("m10 -5")
    assert p.kind is InputKind.DAMAGE
    assert p.amount == 5
    assert p.member == 10
