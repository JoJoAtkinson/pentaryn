"""Event bus — typed in-process pub/sub for combat events.

Pure Python (no Qt imports) so it's trivially testable and the dispatcher /
state mutations can fire events without dragging in the GUI layer.

Events are dataclasses with a `kind` discriminator. The bus has:
  - `emit(event)` — fan out to every subscribed listener for that kind, and to
    the wildcard "*" listeners
  - `subscribe(kind, fn)` — register a listener for one event kind
  - `subscribe_all(fn)` — register a listener for every kind (audit / log)

Trigger matching: separate concern, see `TriggerMatcher` below. Actions in the
DB can declare a `trigger: {scope, event, match}` block. When an event fires,
the trigger matcher finds candidate (npc, action) pairs that match, filters
out USED reactions, and the main window shows a modal prompt.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Literal


logger = logging.getLogger(__name__)


# ─────────── event kinds ───────────

EventKind = Literal[
    "damage",            # NPC takes damage (any source)
    "heal",              # NPC heals
    "condition_applied", # condition added
    "condition_removed", # condition removed
    "action_executed",   # NPC ran a roll_combat_action
    "spell_cast",        # PC or NPC cast a spell (DM-tagged event)
    "round_advanced",    # round counter incremented
    "death",             # NPC HP reached 0
    "bloodied",          # NPC dropped at or below half HP
    "note",              # DM note (informational only)
]


@dataclass
class Event:
    """Base event payload. Use one of the specialized constructors below."""

    kind: EventKind
    subject_npc: str | None = None  # the NPC the event happened TO, if applicable
    tags: tuple[str, ...] = ()       # free-form tags (e.g. "fire", "melee", "5ft")
    payload: dict[str, Any] = field(default_factory=dict)


def damage_event(npc_slug: str, amount: int, damage_type: str | None = None, melee: bool = False, ranged: bool = False, range_ft: int | None = None) -> Event:
    tags = []
    if damage_type:
        tags.append(damage_type.lower())
    if melee:
        tags.append("melee")
    if ranged:
        tags.append("ranged")
    payload = {"amount": amount, "damage_type": damage_type, "range_ft": range_ft}
    return Event(kind="damage", subject_npc=npc_slug, tags=tuple(tags), payload=payload)


def heal_event(npc_slug: str, amount: int) -> Event:
    return Event(kind="heal", subject_npc=npc_slug, payload={"amount": amount})


def condition_event(npc_slug: str, condition: str, applied: bool) -> Event:
    return Event(
        kind="condition_applied" if applied else "condition_removed",
        subject_npc=npc_slug,
        payload={"condition": condition.lower()},
    )


def action_event(npc_slug: str, action_name: str) -> Event:
    return Event(kind="action_executed", subject_npc=npc_slug, payload={"action": action_name})


def spell_cast_event(caster: str, spell_name: str, target_npc: str | None = None, range_ft: int | None = None, spell_level: int | None = None) -> Event:
    # `caster` is the entity that cast the spell — could be "PC" if external.
    # `subject_npc` is set to the TARGET (so self-scope triggers on the target work);
    # global-scope triggers (Counterspell) ignore subject and just match the event.
    tags = ("spell",)
    return Event(
        kind="spell_cast",
        subject_npc=target_npc,
        tags=tags,
        payload={
            "caster": caster,
            "spell_name": spell_name,
            "range_ft": range_ft,
            "spell_level": spell_level,
        },
    )


def round_event(round_num: int) -> Event:
    return Event(kind="round_advanced", subject_npc=None, payload={"round_num": round_num})


def note_event(text: str) -> Event:
    return Event(kind="note", subject_npc=None, payload={"text": text})


# ─────────── bus ───────────

Listener = Callable[[Event], None]


class EventBus:
    """Tiny synchronous pub/sub. Listeners run on the caller's thread.

    For the GUI use case we want events to surface in the same call frame as
    the mutation that emitted them (so a damage event fires while the dispatcher
    is mid-method, before control returns to the event loop). That keeps event
    ordering deterministic and trigger matching synchronous.
    """

    def __init__(self) -> None:
        self._by_kind: dict[str, list[Listener]] = {}
        self._wildcard: list[Listener] = []

    def subscribe(self, kind: EventKind, fn: Listener) -> None:
        self._by_kind.setdefault(kind, []).append(fn)

    def subscribe_all(self, fn: Listener) -> None:
        self._wildcard.append(fn)

    def unsubscribe(self, kind: EventKind, fn: Listener) -> None:
        if listeners := self._by_kind.get(kind):
            try:
                listeners.remove(fn)
            except ValueError:
                pass

    def emit(self, event: Event) -> None:
        """Fan out synchronously. Exceptions from listeners are logged and
        swallowed so one bad listener can't take down the bus."""
        for fn in list(self._by_kind.get(event.kind, [])):
            try:
                fn(event)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Listener %s raised on %s event: %s", fn, event.kind, exc)
        for fn in list(self._wildcard):
            try:
                fn(event)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Wildcard listener %s raised on %s: %s", fn, event.kind, exc)


# ─────────── trigger matching ───────────

@dataclass(frozen=True)
class TriggerSpec:
    """Parsed trigger block from an action's `trigger` field in actions.jsonl.

    Schema:
      scope: "self" | "global"
        self → fires only when this NPC is the event's subject_npc
        global → fires regardless of subject (e.g. Counterspell)
      event: one of EventKind
      match: human-readable description; the matcher does keyword/regex pre-filter
             and falls back to LLM only if there are too many candidates AND a
             match isn't obvious from tags/payload. For v0.3 we pre-filter with
             tags only — LLM fuzzy match is a v0.4 polish item.
    """

    scope: Literal["self", "global"]
    event: EventKind
    match: str
    npc_slug: str        # source: which NPC has this trigger declared on an action
    action_name: str     # source: which action will fire if matched


@dataclass(frozen=True)
class TriggerMatch:
    """A trigger that matched an emitted event."""

    trigger: TriggerSpec
    event: Event
    confidence: float  # 1.0 = exact tag match; 0.5 = keyword-only; 0.0 = needs LLM


class TriggerMatcher:
    """Matches emitted events against the action DB's `trigger` declarations.

    Construct with a sequence of TriggerSpec (collected by walking the actions
    DB at session start), then call `find_matches(event, used_reactions_by_npc)`
    on every event to get the list of TriggerMatch.
    """

    # Tag-keyword shortcuts. Split into two buckets because they behave
    # differently on "miss":
    #   - DAMAGE_TYPE keywords are mutually exclusive (fire vs cold). If the
    #     trigger says "fire damage" and the event is cold, that's a definitive
    #     no-match (return 0.0).
    #   - MODIFIER keywords (melee, ranged) describe the attack vector. The
    #     sigil dispatcher can't always supply this — `-12` damage emits no
    #     melee/ranged tag — so a "missing modifier" is *ambiguous*, not a
    #     definite miss. Fall through to medium confidence; the DM still gets
    #     prompted.
    _DAMAGE_TYPE_KEYWORDS = (
        ("fire", "fire"),
        ("cold", "cold"),
        ("piercing", "piercing"),
        ("slashing", "slashing"),
        ("bludgeoning", "bludgeoning"),
        ("radiant", "radiant"),
        ("necrotic", "necrotic"),
        ("poison", "poison"),
        ("acid", "acid"),
        ("thunder", "thunder"),
        ("lightning", "lightning"),
        ("force", "force"),
        ("psychic", "psychic"),
    )
    _MODIFIER_KEYWORDS = (
        ("melee", "melee"),
        ("ranged", "ranged"),
    )

    _RANGE_RE = re.compile(r"within\s+(\d+)\s*(?:ft|feet)", re.IGNORECASE)

    def __init__(self, triggers: Iterable[TriggerSpec]) -> None:
        # Index by event kind for O(1) candidate retrieval
        self._by_event: dict[str, list[TriggerSpec]] = {}
        for t in triggers:
            self._by_event.setdefault(t.event, []).append(t)

    def find_matches(
        self,
        event: Event,
        used_reactions_by_npc: dict[str, bool] | None = None,
    ) -> list[TriggerMatch]:
        """Return all TriggerMatch entries that could fire on this event.

        - Scope filter: self triggers require event.subject_npc == trigger.npc_slug;
          global triggers fire for any subject (including None).
        - Used-reaction filter: if a trigger's npc has its reaction USED, the
          trigger is dropped silently. (Reactions are limited to one per round
          per creature.)
        - Tag pre-filter: trigger.match keywords vs event.tags / payload give
          high-confidence matches without needing the LLM.
        """
        used = used_reactions_by_npc or {}
        candidates = self._by_event.get(event.kind, [])
        matches: list[TriggerMatch] = []

        for trig in candidates:
            # Scope gate
            if trig.scope == "self":
                if event.subject_npc != trig.npc_slug:
                    continue
            # Reaction availability
            if used.get(trig.npc_slug, False):
                continue
            # Match confidence — tag keywords + range check
            confidence = self._compute_confidence(trig, event)
            if confidence > 0:
                matches.append(TriggerMatch(trigger=trig, event=event, confidence=confidence))

        # Sort by descending confidence so the UI presents the most-likely first
        matches.sort(key=lambda m: -m.confidence)
        return matches

    def _compute_confidence(self, trig: TriggerSpec, event: Event) -> float:
        match_text = trig.match.lower()

        # Detect whether the event carries ANY damage-type information at all.
        # Sigil-emitted damage (`-12` with no damage_type) is "unknown type"
        # not "definitely not fire". A typed-trigger should still surface as
        # ambiguous in that case so the DM gets prompted.
        event_has_dtype_info = any(
            tag in {kw for kw, _ in self._DAMAGE_TYPE_KEYWORDS}
            for tag in event.tags
        )

        # Damage-type bucket: misses are decisive ONLY when the event explicitly
        # has a different damage type (fire trigger + cold event → 0.0). If the
        # event has no damage-type tag at all, treat the trigger's type keyword
        # as ambiguous rather than a miss.
        dtype_hits = 0
        dtype_misses = 0
        for keyword, expected_tag in self._DAMAGE_TYPE_KEYWORDS:
            if keyword in match_text:
                if expected_tag in event.tags:
                    dtype_hits += 1
                elif event_has_dtype_info:
                    dtype_misses += 1
                # else: event has no damage-type info — ambiguous, don't count

        # Modifier bucket: hits raise confidence; misses are ambiguous (the
        # caller may not have supplied the tag) — they neither boost nor block.
        modifier_hits = 0
        for keyword, expected_tag in self._MODIFIER_KEYWORDS:
            if keyword in match_text and expected_tag in event.tags:
                modifier_hits += 1

        # Range gate: if `within N ft` is in the match text, check payload
        range_m = self._RANGE_RE.search(match_text)
        if range_m:
            limit = int(range_m.group(1))
            event_range = event.payload.get("range_ft")
            # If event doesn't specify range, treat as ambiguous (mid confidence).
            if event_range is None:
                pass  # don't mark as miss
            elif event_range > limit:
                # event is OUT of range — this trigger does NOT fire
                return 0.0

        # Damage-type mismatch is ALWAYS decisive — a wrong-element event must
        # not fire even when other keywords (melee/ranged) match.
        if dtype_misses > 0 and dtype_hits == 0:
            return 0.0
        if dtype_hits > 0 or modifier_hits > 0:
            return 1.0
        # No keyword pre-filter hit; fall back to medium confidence — UI prompts
        # the DM rather than auto-deciding. (Could later defer to LLM here.)
        return 0.5


def collect_triggers_from_db(db_module: Any, npcs_in_play: Iterable[str]) -> list[TriggerSpec]:
    """Walk actions.jsonl entries for the in-play NPCs + every NPC's global
    actions, collect any `trigger` blocks into TriggerSpec list."""
    triggers: list[TriggerSpec] = []
    for slug in npcs_in_play:
        for entry in db_module.list_actions(npc=slug):
            t = entry.get("trigger")
            if not isinstance(t, dict):
                continue
            try:
                triggers.append(TriggerSpec(
                    scope=t.get("scope", "self"),
                    event=t.get("event", "damage"),
                    match=str(t.get("match", "")),
                    npc_slug=slug,
                    action_name=entry["action"],
                ))
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("malformed trigger on %s.%s: %s", slug, entry.get("action"), exc)
    return triggers
