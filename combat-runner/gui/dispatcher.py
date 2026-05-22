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
       m<n>                    -> mob-member modifier on the next amount
       <dmg-tag> with no num    -> unparseable (the DM meant an amount)

Anything that doesn't fit -> `kind="unparseable"` (the caller routes to LLM).
"""

from __future__ import annotations

import re

from .command_model import Effect, ParsedCommand
from .command_tags import resolve_tags
from .state import STANDARD_CONDITIONS
from .targeting import classify_who

_NUMBER_RE = re.compile(r"^\d+$")
_MOB_RE = re.compile(r"^m([1-9]\d*)$", re.IGNORECASE)


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
    """True if `token` (after stripping a leading '@') names a condition.

    Matches an entry of STANDARD_CONDITIONS by prefix so short forms like
    `stun` -> `stunned` are accepted; normalization to the catalog name
    happens later in effects.py, not here.
    """
    word, _ = _strip_at(token)
    word = word.lower()
    if not word:
        return False
    return any(c == word or c.startswith(word) for c in STANDARD_CONDITIONS)


def parse(raw: str) -> ParsedCommand:
    """Parse a raw command string into a `ParsedCommand`."""
    raw = raw or ""
    use_current = bool(raw) and raw[0].isspace()
    tokens = raw.split()

    cmd = ParsedCommand(kind="unparseable", raw=raw)

    if not tokens:
        return cmd

    # 1) <who> — the first token. Leading whitespace means the whole input is
    # the <stream> and <who> resolves to the current sticky target.
    if use_current:
        stream = tokens
    else:
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
    pending_member: int | None = None
    i = 0
    n = len(stream)
    ok = True

    while i < n:
        tok = stream[i]

        # m<n> — mob-member modifier on the next amount effect.
        if (m := _MOB_RE.match(tok)) is not None:
            pending_member = int(m.group(1))
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
                    member=pending_member,
                ))
                pending_member = None
                i = j
                continue

            if nxt is not None and _is_condition(nxt):
                word, forced = _strip_at(nxt)
                effects.append(Effect(
                    kind="condition",
                    condition=word.lower(),
                    duration=number,
                    forced_condition=forced,
                ))
                i += 2
                continue

            # nothing / another number after -> action by number.
            effects.append(Effect(kind="action", action_token=tok))
            i += 1
            continue

        # a condition word with no preceding number.
        if _is_condition(tok):
            word, forced = _strip_at(tok)
            effects.append(Effect(
                kind="condition",
                condition=word.lower(),
                duration=None,
                forced_condition=forced,
            ))
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

    cmd.kind = "command"
    cmd.use_current = use_current and not cmd.target_ids
    cmd.effects = effects
    return cmd
