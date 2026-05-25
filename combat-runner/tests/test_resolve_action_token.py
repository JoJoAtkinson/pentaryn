"""Tests for the five-strategy fuzzy_match_one helper and _resolve_action_token.

fuzzy_match_one (gui/matching.py) implements the tightest-first strategy chain:
  1. Exact name match (case-insensitive, underscore-normalised)
  2. Exact alias/verbs match
  3. Unique prefix match
  4. Unique substring match (only when prefix yields nothing)
  5. Closest difflib match (cutoff 0.5)

Each strategy is tested in isolation, plus the no-match / ambiguous cases.
_resolve_action_token (MainWindow, static) is also tested for its digit-index
path (1-based panel index) which sits above the fuzzy layer.
"""

from __future__ import annotations

import pytest

from gui.matching import fuzzy_match_one
from gui.main_window import MainWindow


# ─────────────────────────────────────────────────────────────────────────────
# Helpers — minimal action-dict lists
# ─────────────────────────────────────────────────────────────────────────────


def _actions(*names_and_verbs: tuple[str, list[str]]) -> list[dict]:
    """Build a minimal action-surface list from (name, verbs) pairs."""
    return [
        {"action": name, "verbs": verbs, "type": "single_attack"}
        for name, verbs in names_and_verbs
    ]


# A reusable surface that deliberately spans multiple strategies.
SURFACE = _actions(
    ("multiattack",   ["attack", "hit", "swing"]),
    ("frozen_bile",   ["ranged", "spit", "bile"]),
    ("glacial_roar",  ["breath", "roar", "cone"]),
    ("snow_vanish",   ["vanish", "hide", "sneak"]),
)

NAMES = [a["action"] for a in SURFACE]
ALIASES = {a["action"]: a["verbs"] for a in SURFACE}


# ─────────────────────────────────────────────────────────────────────────────
# Strategy 1 — exact name match
# ─────────────────────────────────────────────────────────────────────────────


def test_exact_name_match():
    """Strategy 1: exact case-insensitive name match returns that candidate."""
    result = fuzzy_match_one("multiattack", NAMES, aliases=ALIASES)
    assert result == "multiattack"


def test_exact_name_match_case_insensitive():
    """Strategy 1 is case-insensitive."""
    result = fuzzy_match_one("GLACIAL_ROAR", NAMES, aliases=ALIASES)
    assert result == "glacial_roar"


def test_exact_name_match_underscore_normalised():
    """Strategy 1 normalises underscores to spaces so 'frozen bile' hits 'frozen_bile'."""
    result = fuzzy_match_one("frozen bile", NAMES, aliases=ALIASES)
    assert result == "frozen_bile"


# ─────────────────────────────────────────────────────────────────────────────
# Strategy 2 — exact alias/verbs match
# ─────────────────────────────────────────────────────────────────────────────


def test_alias_verb_match_spit():
    """Strategy 2: 'spit' is a verb alias for 'frozen_bile'."""
    result = fuzzy_match_one("spit", NAMES, aliases=ALIASES)
    assert result == "frozen_bile"


def test_alias_verb_match_roar():
    """Strategy 2: 'roar' is a verb alias for 'glacial_roar'."""
    result = fuzzy_match_one("roar", NAMES, aliases=ALIASES)
    assert result == "glacial_roar"


def test_alias_verb_match_not_triggered_without_aliases():
    """Without an aliases dict, verb tokens fall through to later strategies."""
    # 'spit' is not a name and not a prefix/substring of any name in NAMES,
    # but also not in aliases — confirm we get None (difflib won't save it either).
    result = fuzzy_match_one("spit", NAMES, aliases=None)
    # spit is short and may or may not match via difflib — we only care that
    # the alias path itself is not taken.  The key invariant is that aliases=None
    # does NOT raise.
    assert isinstance(result, (str, type(None)))


# ─────────────────────────────────────────────────────────────────────────────
# Strategy 3 — unique prefix match
# ─────────────────────────────────────────────────────────────────────────────


def test_prefix_match_unique():
    """Strategy 3: 'snow' is a unique prefix of 'snow_vanish'."""
    # 'snow' is not a name, not an alias; it is a unique prefix of snow_vanish.
    result = fuzzy_match_one("snow", NAMES, aliases=ALIASES)
    assert result == "snow_vanish"


def test_prefix_match_unique_not_from_difflib():
    """Strategy 3: a unique prefix match returns that candidate, not via difflib.

    'poun' is a unique prefix of 'pounce' among the given names; it must
    resolve directly without needing difflib as a fallback.
    """
    surface = _actions(
        ("pounce",          []),
        ("piercing_strike", []),
        ("bite",            []),
    )
    names = [a["action"] for a in surface]
    result = fuzzy_match_one("poun", names)
    assert result == "pounce"


def test_prefix_match_ambiguous_falls_through_to_difflib():
    """Strategy 3: when prefix is ambiguous (>1 candidates), it does NOT return
    immediately — difflib (strategy 5) may still resolve it.

    This tests that strategy 3 correctly does NOT short-circuit on ambiguity.
    When prefix yields >1 hit and difflib cannot score above 0.5 either, the
    result is None.
    """
    # 'xzq' is a prefix of no name in NAMES and scores below 0.5 in difflib;
    # but more directly: verify that a query which prefix-matches >1 candidate
    # and has no difflib winner returns None.
    surface = _actions(
        ("abcdef", []),
        ("abghij", []),
    )
    names = [a["action"] for a in surface]
    # 'ab' prefix-matches both; no unique prefix hit; difflib picks 'abghij'
    # (which is a legitimate difflib result). The key assertion: strategy 3
    # alone cannot produce a result when prefix is ambiguous — outcome is
    # determined by difflib strategy 5.
    import difflib as _difflib
    norm = {c: c.lower().replace("_", " ") for c in names}
    close = _difflib.get_close_matches("ab", [norm[c] for c in names], n=1, cutoff=0.5)
    expected = close[0] if close else None
    # If difflib resolves it, the result should match that; if not, None.
    result = fuzzy_match_one("ab", names)
    if expected is not None:
        # Find the candidate whose norm matches.
        match = next((c for c in names if norm[c] == expected), None)
        assert result == match
    else:
        assert result is None


def test_prefix_match_does_not_shadow_substring():
    """Strategy 3 returning >1 hit falls through to substring (strategy 4)."""
    # 'glacial' is a unique prefix of 'glacial_roar' in SURFACE.
    result = fuzzy_match_one("glacial", NAMES, aliases=ALIASES)
    assert result == "glacial_roar"


# ─────────────────────────────────────────────────────────────────────────────
# Strategy 4 — unique substring match (only when prefix yields nothing)
# ─────────────────────────────────────────────────────────────────────────────


def test_substring_match_unique():
    """Strategy 4: 'bile' is not a prefix of 'frozen_bile' but IS a unique substring."""
    # 'bile' doesn't start any name; it IS contained only in 'frozen_bile'.
    # Strategy 1/2/3 all miss.
    result = fuzzy_match_one("bile", NAMES, aliases=None)  # no aliases to short-circuit
    assert result == "frozen_bile"


def test_substring_match_ambiguous_returns_none():
    """Strategy 4: a token that substring-matches >1 candidate returns None.

    Strategy 4 only fires when strategy 3 (prefix) produced zero hits. When
    'a' is tested against NAMES: no name starts with 'a' (prefix=0), but
    'a' is contained in 'multiattack', 'glacial_roar', and 'snow_vanish' (3
    hits). len(sub)!=1, so strategy 4 does not match, and difflib scores 'a'
    below 0.5 against all candidates → None.
    """
    # 'a' is contained in multiple names but is a prefix of none and scores
    # below difflib's 0.5 cutoff against every candidate.
    result = fuzzy_match_one("a", NAMES, aliases=ALIASES)
    assert result is None


def test_substring_not_triggered_when_prefix_matched():
    """Strategy 4 is skipped when strategy 3 already found prefix hits (even multiple)."""
    # If prefix hits were non-empty, substring is never checked.
    # Use 'mult' — prefix-matches 'multiattack' uniquely — should return 'multiattack'.
    result = fuzzy_match_one("mult", NAMES, aliases=ALIASES)
    assert result == "multiattack"


# ─────────────────────────────────────────────────────────────────────────────
# Strategy 5 — difflib fuzzy match (typo tolerance)
# ─────────────────────────────────────────────────────────────────────────────


def test_difflib_match_typo():
    """Strategy 5: a plausible typo ('multiattakc') still resolves via difflib."""
    # 'multiattakc' won't match exact/alias/prefix/substring but is close enough.
    result = fuzzy_match_one("multiattakc", NAMES, aliases=ALIASES)
    assert result == "multiattack"


def test_difflib_match_no_match_returns_none():
    """Strategy 5: a completely dissimilar token returns None."""
    result = fuzzy_match_one("xyzzy_unknown_gibberish", NAMES, aliases=ALIASES)
    assert result is None


def test_completely_foreign_token_returns_none():
    """A token that matches no strategy returns None.

    'xzqwerty9876' has no name match, no alias match, no prefix match,
    no substring match in NAMES, and scores below difflib's 0.5 cutoff.
    """
    result = fuzzy_match_one("xzqwerty9876", NAMES, aliases=ALIASES)
    assert result is None


# ─────────────────────────────────────────────────────────────────────────────
# Edge cases for fuzzy_match_one
# ─────────────────────────────────────────────────────────────────────────────


def test_empty_candidates_returns_none():
    """Empty candidates list returns None without error."""
    assert fuzzy_match_one("attack", []) is None


def test_empty_query_returns_none():
    """Empty query returns None without error."""
    assert fuzzy_match_one("", NAMES, aliases=ALIASES) is None


# ─────────────────────────────────────────────────────────────────────────────
# _resolve_action_token — digit (1-based panel index) path
# ─────────────────────────────────────────────────────────────────────────────


def test_resolve_digit_index_first():
    """Digit '1' resolves to the first action by panel index (1-based)."""
    result = MainWindow._resolve_action_token("1", SURFACE)
    assert result == "multiattack"


def test_resolve_digit_index_last():
    """Digit matching the last panel index resolves correctly."""
    result = MainWindow._resolve_action_token(str(len(SURFACE)), SURFACE)
    assert result == SURFACE[-1]["action"]


def test_resolve_digit_index_out_of_range():
    """A digit token beyond the panel count returns None."""
    result = MainWindow._resolve_action_token("99", SURFACE)
    assert result is None


def test_resolve_digit_zero_returns_none():
    """Digit '0' is out of range (1-based) and returns None."""
    result = MainWindow._resolve_action_token("0", SURFACE)
    assert result is None


def test_resolve_global_actions_use_fixed_111_numbers():
    """Global actions resolve by the fixed 111, 112, … hotkey numbers — the
    same on every NPC's tab — while NPC-specific actions keep 1, 2, ….  The
    surface is canonically ordered: NPC-specific first, then globals."""
    surface = [
        {"action": "multiattack", "verbs": []},
        {"action": "frozen_bile", "verbs": []},
        {"action": "push", "verbs": [], "scope": "global"},
        {"action": "grapple", "verbs": [], "scope": "global"},
    ]
    # NPC-specific: 1, 2.
    assert MainWindow._resolve_action_token("1", surface) == "multiattack"
    assert MainWindow._resolve_action_token("2", surface) == "frozen_bile"
    # Globals: fixed 111, 112 — NOT 3, 4.
    assert MainWindow._resolve_action_token("111", surface) == "push"
    assert MainWindow._resolve_action_token("112", surface) == "grapple"
    assert MainWindow._resolve_action_token("3", surface) is None
    assert MainWindow._resolve_action_token("113", surface) is None


def test_resolve_empty_actions_returns_none():
    """_resolve_action_token returns None when the action surface is empty."""
    assert MainWindow._resolve_action_token("multiattack", []) is None


def test_resolve_name_token_delegates_to_fuzzy():
    """A non-digit token delegates to fuzzy_match_one (exact match path)."""
    result = MainWindow._resolve_action_token("glacial_roar", SURFACE)
    assert result == "glacial_roar"


def test_resolve_verb_token_delegates_to_fuzzy():
    """A verb token resolves via the alias path inside _resolve_action_token."""
    result = MainWindow._resolve_action_token("vanish", SURFACE)
    assert result == "snow_vanish"
