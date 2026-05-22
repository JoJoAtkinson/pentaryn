"""Command dispatcher — the `<who> <stream>` grammar parser.

Pure Python: no Qt, no state mutation, no LLM. `parse(raw)` turns a raw
input string into a `ParsedCommand` (see `gui/command_model.py`).

Grammar (see docs/superpowers/specs/2026-05-22-combat-command-grammar-design.md):

    <who> <stream>

  <who>  — the first token. A leading digit string is an explicit target
           (digit-run split); leading whitespace / sigil / word resolves to
           the current sticky target.
  <stream> — a left-to-right sequence of effect groups:
       undo / hit              -> bare-word effects
       <num> <dmg-tag…>        -> an `amount` group, qualified by tags
       <num> <condition>       -> a `condition`, num = duration
       <num>                   -> an `action` (panel hotkey number)
       <condition>             -> a `condition`, default duration
       <verb>                  -> an `action` by name
       m<n> / m<digits> / m    -> mob-member modifier on the next effect
       <dmg-tag> with no num    -> unparseable (the DM meant an amount)

Anything that doesn't fit -> `kind="unparseable"` (the caller routes to LLM).
"""

from __future__ import annotations

import re

from .command_model import Effect, ParsedCommand
from .command_tags import resolve_tags
from .state import canonicalize_condition
from .targeting import _ALL_DIGITS as _NUMBER_RE
from .targeting import classify_who, split_runs

# Mob-member modifier. `m` alone -> all alive members; `m<digits>` -> a member
# selection (digit-run split, see `_mob_members`).
_MOB_RE = re.compile(r"^m(\d*)$", re.IGNORECASE)

# Sane bounds — a fat-fingered `2 999999 fire` or a giant condition duration is
# almost certainly a typo. Out-of-range commands route to `unparseable` so the
# LLM fallback lets the DM clarify rather than silently nuking a combatant.
_AMOUNT_MIN, _AMOUNT_MAX = 1, 1000
_DURATION_MAX = 100

# Sigil-first patterns for out-of-band commands that can't be confused with
# the `<who> <stream>` grammar: they start with a literal keyword or `/`.
_NOTE_RE = re.compile(r"^note\s+(.+)$", re.IGNORECASE)
_REORDER_RE = re.compile(r"^/reorder\s+(.+)$", re.IGNORECASE)
_QUIT_RE = re.compile(r"^/(quit|exit)$", re.IGNORECASE)


def _effects_in_bounds(effects: list[Effect]) -> bool:
    """True if every amount / condition-duration in *effects* is within range."""
    for eff in effects:
        if eff.kind == "amount":
            if not (_AMOUNT_MIN <= eff.amount <= _AMOUNT_MAX):
                return False
        elif eff.kind == "condition":
            # duration is None (default applied later) or an explicit int.
            # `0` is NOT out-of-range: `3 0 stun` is a valid "default duration"
            # spelling that effects.py normalizes to 1 round. Only a duration
            # ABOVE the cap (a giant typo) is rejected here.
            if eff.duration is not None and eff.duration > _DURATION_MAX:
                return False
    return True


def _is_damage_tag(token: str) -> bool:
    """True if `token` is a recognized damage-tag (type / delivery / direction).

    `resolve_tags` seeds the required `direction` facet with its default and
    reports unknown tokens via `errors`, so a real tag is one that resolves
    with no errors. The bare direction tokens `dmg` / `dam` resolve to exactly
    the default `{"direction": "damage"}` — they are still real tags (spec
    §2.2 lists `dmg` as a damage-tag), so we accept them explicitly.
    """
    resolved, errors = resolve_tags([token])
    if errors:
        return False
    return bool(resolved)


def _strip_at(token: str) -> tuple[str, bool]:
    """Return (word, forced) — strips a single leading '@' escape hatch."""
    if token.startswith("@"):
        return token[1:], True
    return token, False


def _is_condition(token: str) -> bool:
    """True if `token` (after stripping a leading '@') canonicalizes to a known
    condition.  Uses ``canonicalize_condition`` — the single source of truth —
    so dispatcher and effects can never drift.
    """
    word, _ = _strip_at(token)
    return canonicalize_condition(word) is not None


def _mob_members(digits: str) -> list[int]:
    """Convert the digit-run of an `m<digits>` modifier into a member list.

    Contract (mirrors `Effect.members`):
      ""    -> []          `m` alone -> all alive members
      "3"   -> [3]         single digit -> member 3
      "12"  -> [1, 2]      multi-digit -> digit-run split (targeting.split_runs)
      "11"  -> [11]        a repeated-digit run is ONE member id
      "122" -> [1, 22]     mixed runs -> [1, 22]

    Reuses `targeting.split_runs` so member selection follows the same
    digit-run rule the `<who>` slot uses for combatant ids.
    """
    if not digits:
        return []
    return [int(run) for run in split_runs(digits)]


def parse(raw: str) -> ParsedCommand:
    """Parse a raw command string into a `ParsedCommand`."""
    raw = raw or ""

    # Out-of-band sigil forms — checked BEFORE the `<who>` path so they are
    # never accidentally routed to the LLM. These forms are unambiguous:
    # a leading `note ` or `/` cannot start a valid `<who> <stream>` command.
    s = raw.strip()
    if m := _NOTE_RE.match(s):
        return ParsedCommand(kind="note", raw=raw, note_text=m.group(1).strip())
    if m := _REORDER_RE.match(s):
        slugs = [tok for tok in re.split(r"\s+", m.group(1).strip()) if tok]
        return ParsedCommand(kind="reorder", raw=raw, reorder_slugs=slugs)
    if _QUIT_RE.match(s):
        return ParsedCommand(kind="quit", raw=raw)

    tokens = raw.split()

    cmd = ParsedCommand(kind="unparseable", raw=raw)

    if not tokens:
        return cmd

    # 1) <who> — the first token. A leading digit-run is an explicit target;
    # a leading sigil / bare word means the whole input is the <stream> and
    # <who> resolves to the current sticky target. (A literal leading space is
    # never seen here — the GUI consumes it as a current-target autocomplete
    # before the string reaches the parser.)
    use_current = False
    who = classify_who(tokens[0])
    if who.mode == "explicit":
        cmd.target_ids = who.ids
        stream = tokens[1:]
    else:
        # current target (leading sigil / word). The first token is part
        # of the <stream>, not a consumed <who>.
        use_current = True
        stream = tokens

    # 2) <who> alone -> set the sticky target.
    if not stream:
        if cmd.target_ids:
            cmd.kind = "set_target"
        # use_current with nothing -> stays unparseable
        return cmd

    # 3) Walk the <stream> left to right.
    effects: list[Effect] = []
    # Pending mob-member selection from an `m<...>` modifier. `None` = none
    # seen; otherwise a list per the `Effect.members` contract ([] = all).
    pending_members: list[int] | None = None
    i = 0
    n = len(stream)
    ok = True

    while i < n:
        tok = stream[i]

        # m<n> / m<digits> / m — mob-member modifier on the next effect.
        if (m := _MOB_RE.match(tok)) is not None:
            pending_members = _mob_members(m.group(1))
            i += 1
            continue

        # bare words: undo / hit
        low = tok.lower()
        if low == "undo":
            effects.append(Effect(kind="undo"))
            i += 1
            continue
        if low == "hit":
            effects.append(Effect(kind="hit"))
            i += 1
            continue

        # a number — meaning set by the following token.
        if _NUMBER_RE.match(tok):
            number = int(tok)
            nxt = stream[i + 1] if i + 1 < n else None

            if nxt is not None and _is_damage_tag(nxt):
                # amount group: consume following damage-tags.
                tags: list[str] = []
                j = i + 1
                while j < n and _is_damage_tag(stream[j]):
                    tags.append(stream[j])
                    j += 1
                resolved, _ = resolve_tags(tags)
                effects.append(Effect(
                    kind="amount",
                    amount=number,
                    amount_tags=resolved,
                    members=pending_members,
                ))
                pending_members = None
                i = j
                continue

            if nxt is not None and _is_condition(nxt):
                word, forced = _strip_at(nxt)
                canonical = canonicalize_condition(word)
                # canonicalize_condition returning None here is impossible
                # (_is_condition already passed), but handle gracefully.
                if canonical is None:
                    ok = False
                    break
                # Carry any pending member selection onto the condition so the
                # applier (fix agent 2) can REJECT member-scoped conditions —
                # the parser only carries the info, it never rejects here.
                effects.append(Effect(
                    kind="condition",
                    condition=canonical,
                    duration=number,
                    forced_condition=forced,
                    members=pending_members,
                ))
                pending_members = None
                i += 2
                continue

            # nothing / another number after -> action by number.
            effects.append(Effect(kind="action", action_token=tok))
            i += 1
            continue

        # a condition word with no preceding number.
        if _is_condition(tok):
            word, forced = _strip_at(tok)
            canonical = canonicalize_condition(word)
            if canonical is None:
                ok = False
                break
            # Carry any pending member selection onto the condition so the
            # applier can reject member-scoped conditions (see above).
            effects.append(Effect(
                kind="condition",
                condition=canonical,
                duration=None,
                forced_condition=forced,
                members=pending_members,
            ))
            pending_members = None
            i += 1
            continue

        # a damage-tag with no leading number -> unparseable.
        if _is_damage_tag(tok):
            ok = False
            break

        # a forced-condition token (@word) that didn't match a condition
        # is still off-grammar -> unparseable.
        if tok.startswith("@"):
            ok = False
            break

        # any other non-number, non-condition word -> action by name. An
        # action-by-name is a single verb: it is only valid as the sole token
        # of the stream. Two bare words in a row don't chain (-> LLM).
        if n != 1:
            ok = False
            break
        effects.append(Effect(kind="action", action_token=tok))
        i += 1

    if not ok or not effects:
        cmd.kind = "unparseable"
        cmd.effects = []
        return cmd

    # Reject implausible amounts / durations — route to the LLM so the DM can
    # clarify rather than applying an obviously-mistyped command.
    if not _effects_in_bounds(effects):
        cmd.kind = "unparseable"
        cmd.effects = []
        return cmd

    cmd.kind = "command"
    cmd.use_current = use_current and not cmd.target_ids
    cmd.effects = effects
    return cmd
