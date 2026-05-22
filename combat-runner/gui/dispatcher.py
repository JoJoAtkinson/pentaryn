"""Command dispatcher — turns raw user input into structured actions.

Sigil-first, fast-path-friendly:

  attack          → fuzzy action match, instant if unique
  -18             → damage to active NPC's default-routed member
  -18 fire        → damage with type tag (for event triggers)
  m3 -5           → damage to mob member 3
  +10             → heal (default target = lowest-numbered alive)
  @prone          → toggle condition
  @grappled tenza → toggle condition with target hint
  @               → open condition autocomplete (handled by widget)
  note ...        → DM log entry (no LLM)
  /reorder a b c  → reorder tabs
  /quit | /exit   → close session (handled by main window)
  44 10 fire      → directed damage to combatant id 44 with type tag
  44              → jump to combatant id 44's tab
  <free form>     → fall through to LLM

All parsing is regex-based; no LLM call from this module. The dispatcher
returns a `ParsedInput` describing what should happen; the caller (NPC tab or
main window) executes the action.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class InputKind(Enum):
    """High-level classification of what the user typed."""

    ACTION = "action"        # fuzzy match → roll_combat_action
    DAMAGE = "damage"        # `-N [type]` or `m<n> -N [type]`
    HEAL = "heal"            # `+N` or `m<n> +N`
    CONDITION = "condition"  # `@cond [target]`
    CONDITION_MENU = "condition_menu"  # bare `@` → open autocomplete
    NOTE = "note"            # `note <text>` — log only, no LLM
    REORDER = "reorder"      # `/reorder <slug...>` — tab order
    QUIT = "quit"            # `/quit` | `/exit`
    DIRECTED = "directed"   # `<id> <amount> [<tags…>]` — target a specific combatant
    JUMP = "jump"           # `<id>` alone → focus that combatant's tab
    AMBIGUOUS = "ambiguous"  # fuzzy match found 2+ — caller routes to LLM
    UNKNOWN = "unknown"      # nothing matched — caller routes to LLM


@dataclass
class ParsedInput:
    """Structured result of dispatcher.parse(). Caller acts on `kind`."""

    kind: InputKind
    raw: str
    # ACTION / AMBIGUOUS / UNKNOWN
    action_name: str | None = None
    candidate_actions: list[str] = field(default_factory=list)
    # DAMAGE / HEAL
    amount: int = 0
    damage_type: str | None = None
    member: int | None = None  # 1-indexed mob member; None = default routing
    # CONDITION
    condition: str | None = None
    condition_target: str | None = None  # e.g. "tenza" in "@grappled tenza"
    condition_duration: int | None = None  # rounds; from `@stun 5`
    # NOTE
    note_text: str | None = None
    # REORDER
    reorder_slugs: list[str] = field(default_factory=list)
    # DIRECTED / JUMP
    target_id: str | None = None      # the repeated-digit id label
    target_member: int | None = None  # optional mob member within target (m<n>)
    resolved_tags: dict = field(default_factory=dict)  # facet→canonical from resolve_tags
    tag_errors: list[str] = field(default_factory=list)  # unrecognized tokens


# ─────────────────────────── Regex patterns ───────────────────────────
# Each regex returns the user's intent without consulting state. The
# Dispatcher applies fuzzy matching against the active NPC's actions in a
# second pass for verb inputs.

_DAMAGE_RE = re.compile(r"^-(\d+)(?:\s+(\w+))?$", re.IGNORECASE)
_HEAL_RE = re.compile(r"^\+(\d+)$")
# Members are 1-indexed; reject m0 explicitly so a typo silently no-ops via
# the LLM fallback rather than dropping through apply_damage as a `skipped`
# result that the UI then logs as "HP 0/max".
_MOB_DAMAGE_RE = re.compile(r"^m([1-9]\d*)\s+-(\d+)(?:\s+(\w+))?$", re.IGNORECASE)
_MOB_HEAL_RE = re.compile(r"^m([1-9]\d*)\s+\+(\d+)$", re.IGNORECASE)
# `@stun 5` or `@grappled tenza` or just `@prone`. The trailing token is
# numeric → duration in rounds; otherwise → a free-form target hint.
_CONDITION_RE = re.compile(r"^@(\w[\w-]*)(?:\s+(.+))?$")
_CONDITION_DURATION_RE = re.compile(r"^\d+$")
_CONDITION_MENU_RE = re.compile(r"^@$")
_NOTE_RE = re.compile(r"^note\s+(.+)$", re.IGNORECASE)
_REORDER_RE = re.compile(r"^/reorder\s+(.+)$", re.IGNORECASE)
_QUIT_RE = re.compile(r"^/(quit|exit)$", re.IGNORECASE)

# A valid combatant id: one digit repeated 1-N times. "44" ok, "45" invalid.
_REPEATED_DIGIT_RE = re.compile(r'^(\d)\1*$')
# Optional mob-member target within a directed command: m2
_DIRECTED_MOB_RE = re.compile(r'^m([1-9]\d*)$', re.IGNORECASE)


def _fuzzy_match_actions(
    query: str, available_actions: list[dict[str, Any]]
) -> list[str]:
    """Return action_name list for entries where `query` matches the action's
    name or any verb (case-insensitive substring). Tightest-first ordering:
    exact name match → exact verb match → prefix → substring.

    `available_actions` is a list of dicts with at least `action` and `verbs`
    keys (matches the combat_actions_db.list_actions shape).
    """
    q = query.lower().strip()
    if not q:
        return []

    exact_name: list[str] = []
    exact_verb: list[str] = []
    prefix_match: list[str] = []
    substring_match: list[str] = []

    for entry in available_actions:
        name = (entry.get("action") or "").lower()
        verbs = [v.lower() for v in entry.get("verbs", [])]
        if name == q:
            exact_name.append(entry["action"])
            continue
        if q in verbs:
            exact_verb.append(entry["action"])
            continue
        if name.startswith(q) or any(v.startswith(q) for v in verbs):
            prefix_match.append(entry["action"])
            continue
        if q in name or any(q in v for v in verbs):
            substring_match.append(entry["action"])

    # Tightest matches first. De-dup while preserving order.
    seen: set[str] = set()
    out: list[str] = []
    for bucket in (exact_name, exact_verb, prefix_match, substring_match):
        for name in bucket:
            if name not in seen:
                seen.add(name)
                out.append(name)
    return out


class Dispatcher:
    """Parses user input into ParsedInput. Stateless — pass the active NPC's
    action surface on each call via `parse()`. The caller is responsible for
    executing the parsed action (typically NPCTab.execute_parsed)."""

    def parse(
        self, raw_input: str, available_actions: list[dict[str, Any]] | None = None
    ) -> ParsedInput:
        """Classify `raw_input` against the active NPC's available actions.

        `available_actions` is a list of action summary dicts (as returned by
        `combat_actions_db.list_actions`). If None, action matching is skipped
        and any verb-like input becomes UNKNOWN (the caller routes to LLM).
        """
        s = (raw_input or "").strip()
        result = ParsedInput(kind=InputKind.UNKNOWN, raw=s)

        if not s:
            return result

        # Directed command: starts with a digit
        if s[0].isdigit():
            return self._parse_directed(s)

        # 1) Sigil patterns — exact regex (fastest)
        if m := _QUIT_RE.match(s):
            result.kind = InputKind.QUIT
            return result

        if m := _REORDER_RE.match(s):
            slugs = [tok for tok in re.split(r"\s+", m.group(1).strip()) if tok]
            result.kind = InputKind.REORDER
            result.reorder_slugs = slugs
            return result

        if m := _NOTE_RE.match(s):
            result.kind = InputKind.NOTE
            result.note_text = m.group(1).strip()
            return result

        if m := _CONDITION_MENU_RE.match(s):
            result.kind = InputKind.CONDITION_MENU
            return result

        if m := _CONDITION_RE.match(s):
            result.kind = InputKind.CONDITION
            result.condition = m.group(1).strip().lower()
            trailing = (m.group(2) or "").strip() or None
            # If the trailing token is a bare integer, treat it as duration;
            # otherwise it's the target hint (`@grappled tenza`).
            if trailing and _CONDITION_DURATION_RE.match(trailing):
                result.condition_duration = int(trailing)
            else:
                result.condition_target = trailing
            return result

        if m := _MOB_DAMAGE_RE.match(s):
            result.kind = InputKind.DAMAGE
            result.member = int(m.group(1))
            result.amount = int(m.group(2))
            result.damage_type = (m.group(3) or "").strip().lower() or None
            return result

        if m := _MOB_HEAL_RE.match(s):
            result.kind = InputKind.HEAL
            result.member = int(m.group(1))
            result.amount = int(m.group(2))
            return result

        if m := _DAMAGE_RE.match(s):
            result.kind = InputKind.DAMAGE
            result.amount = int(m.group(1))
            result.damage_type = (m.group(2) or "").strip().lower() or None
            return result

        if m := _HEAL_RE.match(s):
            result.kind = InputKind.HEAL
            result.amount = int(m.group(1))
            return result

        # 2) Action fuzzy match — only if action surface provided
        if available_actions:
            matches = _fuzzy_match_actions(s, available_actions)
            if len(matches) == 1:
                result.kind = InputKind.ACTION
                result.action_name = matches[0]
                return result
            elif len(matches) >= 2:
                result.kind = InputKind.AMBIGUOUS
                result.candidate_actions = matches
                return result

        # 3) Nothing matched — caller falls through to LLM
        return result

    def _parse_directed(self, s: str) -> ParsedInput:
        """Parse a directed command: <id> [m<n>] [<amount>] [<tags…>]
        or bare <id> (no amount) → JUMP.
        """
        from .command_tags import resolve_tags  # lazy import keeps module lightweight

        result = ParsedInput(kind=InputKind.UNKNOWN, raw=s)
        tokens = s.split()
        if not tokens:
            return result

        id_token = tokens[0]
        if not _REPEATED_DIGIT_RE.match(id_token):
            # "45" or other non-uniform number — not a directed command, fall through
            return result  # UNKNOWN → caller routes to LLM

        # Bare id alone → JUMP (focus that combatant's tab)
        if len(tokens) == 1:
            result.kind = InputKind.JUMP
            result.target_id = id_token
            return result

        result.target_id = id_token
        rest = tokens[1:]  # everything after the id

        # Optional mob member: m<n>
        if rest and (m := _DIRECTED_MOB_RE.match(rest[0])):
            result.target_member = int(m.group(1))
            rest = rest[1:]

        if not rest:
            # id + optional mob only — treat as JUMP to that id
            result.kind = InputKind.JUMP
            return result

        # Amount must be an *unsigned* integer (0 is valid).
        # A leading '+' or '-' makes the token look signed; directed commands
        # carry direction via tags (e.g. `heal`), not a sign. Reject signed
        # amounts so `44 +5` and `44 -5` route to the LLM instead of silently
        # being parsed as 5 damage.
        amount_token = rest[0]
        if amount_token and amount_token[0] in ("+", "-"):
            result.kind = InputKind.UNKNOWN
            result.target_id = None
            return result
        try:
            result.amount = int(amount_token)
            if result.amount < 0:
                raise ValueError
        except ValueError:
            result.kind = InputKind.UNKNOWN
            result.target_id = None
            return result

        rest = rest[1:]

        # Remaining tokens are tags — resolve through faceted taxonomy
        resolved, errors = resolve_tags(rest)
        result.resolved_tags = resolved
        result.tag_errors = errors
        result.kind = InputKind.DIRECTED

        # Derive damage_type from resolved tags for back-compat with existing
        # event_bus callers that look at damage_type directly.
        result.damage_type = resolved.get("type")

        return result
