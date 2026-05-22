"""LLM meta-controller — fallback dispatch + background suggestions.

Two entry points:

  `run(user_input, encounter_state, active_npc_slug, log_path) -> RunResult`
      Synchronous (blocking) Anthropic call when the dispatcher's fast-path
      yields 0 matches or 2+ matches. The LLM has the full meta-controller
      tool surface (set_hp, add_condition, switch_tab, etc.); whichever tools
      it calls are dispatched in-process against the live EncounterState.

  `suggest_next_actions(tab_state_snapshot) -> list[Suggestion]`
      Background call from the suggestion bar. Returns 3 short slug + action
      pairs based on current state. Cancellable: spawn via `asyncio` or a
      QThread; the UI cancels in-flight calls on new state changes.

All Anthropic calls use prompt caching (`cache_control.ttl=1h`) on the system
prompt + tool definitions, so repeated calls within an encounter session are
cheap (cache-read price).

This module is intentionally side-effect free at import time — the Anthropic
client is constructed lazily on first call, so tests can mock it freely.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable

from .state import (
    EncounterState,
    NPCState,
    serialize_encounter,
    state_schema,
)
from .widgets.suggestion_bar import Suggestion

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
SUGGESTION_MODEL = "claude-haiku-4-5-20251001"  # could swap to a smaller/faster model later


# ─────────── pure helpers ───────────

def build_correction_context(
    state_dict: dict,
    recent_commands: list[str],
    pending: list[dict],
) -> dict:
    """Assemble the enriched context payload sent to the LLM fallback.

    Pure function — no side effects, no I/O, easily unit-tested.

    Returns a dict with three keys:
      ``state``           — the serialized EncounterState (as produced by
                            ``serialize_encounter``).
      ``recent_commands`` — a list of the last N raw command strings (newest
                            last), so the model can reason about history.
      ``pending``         — the serialized ``pending_effects`` list (dicts
                            from ``dataclasses.asdict``), enabling undo and
                            fuzzy correction of unconfirmed effects.
    """
    return {
        "state": state_dict,
        "recent_commands": list(recent_commands),
        "pending": list(pending),
    }


# ─────────── result types ───────────

@dataclass
class RunResult:
    """Outcome of an LLM fallback call."""

    text: str = ""                  # any narrative the model wrote
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None


@dataclass
class _StateBundle:
    """The mutable shared bundle that meta-controller tools update.

    The LLMController constructs one of these per session; tool calls mutate
    the EncounterState in place; the UI listens to a callback after each tool
    call so it can refresh affected tabs.
    """

    encounter: EncounterState
    log_path: str
    on_state_changed: Callable[[], None] | None = None
    # Invoked after a round-changing tool (advance_round / set_round) so the
    # GUI can run the SAME round-advance side effects the round button does —
    # most importantly ticking condition durations on every NPC. Wired by
    # MainWindow.set_llm_controller; None in headless / unit-test contexts.
    on_round_advanced: Callable[[int], None] | None = None

    def notify(self) -> None:
        if self.on_state_changed is not None:
            self.on_state_changed()

    def notify_round_advanced(self) -> None:
        if self.on_round_advanced is not None:
            self.on_round_advanced(self.encounter.round_num)


# ─────────── tool surface ───────────
# Each function maps cleanly to an Anthropic tool definition. The implementations
# mutate the live EncounterState; callers must call `bundle.notify()` after a
# successful state change to update the GUI.

def _find_npc(es: EncounterState, npc_slug: str) -> NPCState | None:
    """Find an NPC by slug, or None if not found. Tab-instance disambiguation
    is post-MVP; for now first-match wins."""
    for npc in es.npcs:
        if npc.slug == npc_slug:
            return npc
    return None


def _tool_set_hp(bundle: _StateBundle, npc_slug: str, hp: int, member: int | None = None) -> dict[str, Any]:
    npc = _find_npc(bundle.encounter, npc_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {npc_slug}"}
    if member is None:
        if npc.count > 1:
            return {
                "ok": False,
                "error": f"{npc_slug} is a mob (count={npc.count}); set_hp requires the `member` argument (1..{npc.count}). Use one call per member, or call `damage_npc` / `heal_npc` if you want the dispatcher to route automatically.",
            }
        npc.set_member_hp(1, hp)
    else:
        npc.set_member_hp(member, hp)
    bundle.notify()
    return {"ok": True, "hp_now": npc.hp, "max": npc.max_total_hp}


def _tool_damage_npc(bundle: _StateBundle, npc_slug: str, amount: int, damage_type: str | None = None, member: int | None = None) -> dict[str, Any]:
    npc = _find_npc(bundle.encounter, npc_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {npc_slug}"}
    if amount < 0:
        return {"ok": False, "error": "damage amount must be non-negative; use heal_npc for positive deltas"}
    result = npc.apply_damage(amount, member=member)
    bundle.notify()
    return {"ok": True, "applied": result, "hp_now": npc.hp, "damage_type": damage_type}


def _tool_heal_npc(bundle: _StateBundle, npc_slug: str, amount: int, member: int | None = None) -> dict[str, Any]:
    npc = _find_npc(bundle.encounter, npc_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {npc_slug}"}
    if amount < 0:
        return {"ok": False, "error": "heal amount must be non-negative"}
    result = npc.apply_heal(amount, member=member)
    bundle.notify()
    return {"ok": True, "applied": result, "hp_now": npc.hp}


def _tool_add_condition(bundle: _StateBundle, npc_slug: str, condition: str) -> dict[str, Any]:
    npc = _find_npc(bundle.encounter, npc_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {npc_slug}"}
    added = npc.add_condition(condition)
    bundle.notify()
    return {"ok": True, "added": added, "conditions": sorted(npc.conditions)}


def _tool_remove_condition(bundle: _StateBundle, npc_slug: str, condition: str) -> dict[str, Any]:
    npc = _find_npc(bundle.encounter, npc_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {npc_slug}"}
    removed = npc.remove_condition(condition)
    bundle.notify()
    return {"ok": True, "removed": removed, "conditions": sorted(npc.conditions)}


def _tool_mark_action_used(bundle: _StateBundle, npc_slug: str, action: str) -> dict[str, Any]:
    npc = _find_npc(bundle.encounter, npc_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {npc_slug}"}
    npc.mark_action_used(action)
    bundle.notify()
    return {"ok": True}


def _tool_mark_action_available(bundle: _StateBundle, npc_slug: str, action: str) -> dict[str, Any]:
    """Undo a mis-marked recharge — e.g. DM says 'I didn't actually use Frozen Bile'."""
    npc = _find_npc(bundle.encounter, npc_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {npc_slug}"}
    npc.mark_action_available(action)
    bundle.notify()
    return {"ok": True}


def _tool_refresh_reaction(bundle: _StateBundle, npc_slug: str) -> dict[str, Any]:
    npc = _find_npc(bundle.encounter, npc_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {npc_slug}"}
    npc.reaction_used = False
    bundle.notify()
    return {"ok": True}


def _apply_round_side_effects(bundle: _StateBundle) -> None:
    """Run the same round-advance side effects the GUI round button triggers.

    If a GUI round-advance callback is wired, defer to it (it emits the
    `round_advanced` bus event, which ticks condition durations + logs round
    dividers — keeping LLM and button behavior identical). In headless /
    unit-test contexts no callback is wired, so tick durations directly here
    instead, so condition timers still advance."""
    if bundle.on_round_advanced is not None:
        bundle.notify_round_advanced()
    else:
        for npc in bundle.encounter.npcs:
            npc.tick_condition_durations()


def _tool_set_round(bundle: _StateBundle, round_num: int) -> dict[str, Any]:
    prev = bundle.encounter.round_num
    bundle.encounter.set_round(round_num)
    # Only tick durations when the round actually moves forward — set_round is
    # also used to roll the counter *back* after a mis-click, which must not
    # consume condition timers.
    if bundle.encounter.round_num > prev:
        _apply_round_side_effects(bundle)
    bundle.notify()
    return {"ok": True, "round_num": bundle.encounter.round_num}


def _tool_advance_round(bundle: _StateBundle) -> dict[str, Any]:
    bundle.encounter.advance_round()
    _apply_round_side_effects(bundle)
    bundle.notify()
    return {"ok": True, "round_num": bundle.encounter.round_num}


def _tool_switch_tab(bundle: _StateBundle, npc_slug: str) -> dict[str, Any]:
    for i, npc in enumerate(bundle.encounter.npcs):
        if npc.slug == npc_slug:
            bundle.encounter.active_tab_index = i
            bundle.notify()
            return {"ok": True, "tab_index": i}
    return {"ok": False, "error": f"no tab for npc_slug={npc_slug}"}


def _tool_reorder_tabs(bundle: _StateBundle, new_order: list[str]) -> dict[str, Any]:
    bundle.encounter.reorder_tabs(new_order)
    bundle.notify()
    return {"ok": True, "new_order": [n.slug for n in bundle.encounter.npcs]}


def _tool_add_log_entry(bundle: _StateBundle, text: str, kind: str | None = None) -> dict[str, Any]:
    from datetime import datetime
    try:
        log_path = bundle.log_path
        with open(log_path, "a", encoding="utf-8") as f:
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            prefix = f"[{kind}] " if kind else ""
            f.write(f"- `{ts}` — {prefix}{text}\n")
        return {"ok": True}
    except OSError as e:
        return {"ok": False, "error": str(e)}


def _tool_get_state_schema(bundle: _StateBundle) -> dict[str, Any]:
    return {"ok": True, "schema": state_schema()}


def _tool_read_state(bundle: _StateBundle) -> dict[str, Any]:
    return {"ok": True, "state": serialize_encounter(bundle.encounter)}


# ─────────── lookup tools (in-process MCP-equivalents) ───────────
#
# The LLM gets a curated subset of the dnd-scripts MCP tools so it can answer
# "what does charmed do?" / "look up Fireball" / "roll 1d20" without needing
# a real MCP transport — these are just Python function calls against the same
# in-process modules the MCP server wraps. We intentionally expose only the
# narrow set the DM tends to want mid-fight; the full surface is excessive.

def _lookup_modules():
    """Lazy-import the SRD + roller modules. Avoids paying their startup cost
    (chromadb etc.) until the LLM actually calls a lookup tool."""
    import importlib.util
    import sys
    from pathlib import Path
    scripts_dir = Path(__file__).resolve().parents[2] / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    srd = importlib.import_module("srd5_2")
    roller = importlib.import_module("dnd_roller")
    return srd, roller


def _tool_roll_dice(num_dice: int, dice_size: int, modifier: int = 0, description: str | None = None) -> dict[str, Any]:
    _, roller = _lookup_modules()
    try:
        raw = roller.roll_dice(int(num_dice), int(dice_size), modifier=int(modifier), description=description)
        return {"ok": True, "result": json.loads(raw)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"roll_dice failed: {exc}"}


def _tool_list_conditions(name: str | None = None) -> dict[str, Any]:
    """Look up condition effects (charmed, prone, paralyzed, ...). Returns
    the rule text for each match."""
    srd, _ = _lookup_modules()
    try:
        # The MCP defaults — conditions live in `core`/`a5e-ag` not `srd-2024`
        return {"ok": True, "result": srd.list_conditions(name=name, source="core,a5e-ag")}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"list_conditions failed: {exc}"}


def _tool_search_rules(query: str) -> dict[str, Any]:
    """Free-text search across rule sections (cover, falling, grappling, ...)."""
    srd, _ = _lookup_modules()
    try:
        return {"ok": True, "result": srd.search_rules(query=query)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"search_rules failed: {exc}"}


def _tool_get_rule_section(key: str) -> dict[str, Any]:
    srd, _ = _lookup_modules()
    try:
        return {"ok": True, "result": srd.get_rule_section(key=key)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"get_rule_section failed: {exc}"}


def _tool_search_spells(name: str | None = None, level: int | None = None, school: str | None = None) -> dict[str, Any]:
    """Find spells by name / level / school. Returns full entries inline so
    you usually don't need a follow-up get_spell_details call."""
    srd, _ = _lookup_modules()
    try:
        kwargs: dict[str, Any] = {}
        if name is not None:
            kwargs["name"] = name
        if level is not None:
            kwargs["level"] = level
        if school is not None:
            kwargs["school"] = school
        return {"ok": True, "result": srd.search_spells(**kwargs)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"search_spells failed: {exc}"}


def _tool_get_spell_details(key: str) -> dict[str, Any]:
    srd, _ = _lookup_modules()
    try:
        return {"ok": True, "result": srd.get_spell_details(key=key)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"get_spell_details failed: {exc}"}


def _tool_apply_command(bundle: _StateBundle, command: str, target_slug: str) -> dict[str, Any]:
    """Validate and apply a command string via the same grammar parser the DM uses.

    Parses the raw command into a `ParsedCommand` and applies each `amount` /
    `condition` effect to the named NPC. Action / hit / undo effects are not
    applied here (they need GUI context) — they report ``ok=False``.
    """
    from .dispatcher import parse as parse_command
    from .effects import apply_effect

    parsed = parse_command(command)
    npc = _find_npc(bundle.encounter, target_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {target_slug}"}
    if parsed.kind == "unparseable":
        return {"ok": False, "error": f"command did not parse: {command!r}"}
    if not parsed.effects:
        return {"ok": False, "error": f"command carries no applicable effects: {command!r}"}

    for effect in parsed.effects:
        if effect.kind in ("action", "hit", "undo"):
            return {"ok": False,
                    "error": f"effect kind {effect.kind!r} cannot be applied via apply_command"}

    # apply_effect resolves targets via combatant_by_id; ensure the target NPC
    # has an id for the duration of the call (it may be unassigned in tests).
    restore_id = npc.id
    if not npc.id:
        npc.id = "__apply_command_target__"
    try:
        applied: list[str] = []
        for effect in parsed.effects:
            fragments = apply_effect(
                bundle.encounter, effect, target_ids=[npc.id], actor=None
            )
            applied.extend(fragments)
    finally:
        npc.id = restore_id

    # A fragment beginning with "warn:" means a skipped no-op (out-of-range
    # mob member, dead member, no alive members) — surface it as ok=False.
    skipped = [f for f in applied if f.startswith("warn:")]
    if skipped:
        return {"ok": False, "error": "; ".join(skipped)}
    bundle.notify()
    return {"ok": True, "applied": applied, "hp_now": npc.hp}


def _build_tool_definitions() -> list[dict[str, Any]]:
    """Return the Anthropic tool definitions in the format the SDK expects."""
    return [
        {
            "name": "set_hp",
            "description": "Set absolute HP for an NPC (or a specific mob member). Used to correct mis-applied damage or restore a creature to a known state.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "npc_slug": {"type": "string", "description": "NPC slug from the encounter."},
                    "hp": {"type": "integer", "description": "New current HP value (clamped to [0, max_hp])."},
                    "member": {"type": "integer", "description": "1-indexed mob member (omit for single-creature NPCs).", "minimum": 1},
                },
                "required": ["npc_slug", "hp"],
            },
        },
        {
            "name": "damage_npc",
            "description": "Apply damage to an NPC. Default routing: highest-numbered alive mob member (bar drains right→left). Pass `member` to target a specific one. damage_type is logged for event triggers.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "npc_slug": {"type": "string"},
                    "amount": {"type": "integer", "minimum": 0},
                    "damage_type": {"type": "string", "description": "Optional damage type tag (e.g. fire, cold, piercing)."},
                    "member": {"type": "integer", "minimum": 1},
                },
                "required": ["npc_slug", "amount"],
            },
        },
        {
            "name": "heal_npc",
            "description": "Heal an NPC. Default targets lowest-numbered alive member.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "npc_slug": {"type": "string"},
                    "amount": {"type": "integer", "minimum": 0},
                    "member": {"type": "integer", "minimum": 1},
                },
                "required": ["npc_slug", "amount"],
            },
        },
        {
            "name": "add_condition",
            "description": "Add a condition (prone, grappled, frightened, etc.) to an NPC. Case-insensitive; normalized to lowercase.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "npc_slug": {"type": "string"},
                    "condition": {"type": "string"},
                },
                "required": ["npc_slug", "condition"],
            },
        },
        {
            "name": "remove_condition",
            "description": "Remove a condition from an NPC.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "npc_slug": {"type": "string"},
                    "condition": {"type": "string"},
                },
                "required": ["npc_slug", "condition"],
            },
        },
        {
            "name": "mark_action_used",
            "description": "Mark a recharge ability USED (greys out the action chip and queues the d6 recharge roll for next turn).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "npc_slug": {"type": "string"},
                    "action": {"type": "string"},
                },
                "required": ["npc_slug", "action"],
            },
        },
        {
            "name": "mark_action_available",
            "description": "Undo a recharge ability's USED state — used when the DM says 'I didn't actually use that' or to manually re-enable an action mid-turn.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "npc_slug": {"type": "string"},
                    "action": {"type": "string"},
                },
                "required": ["npc_slug", "action"],
            },
        },
        {
            "name": "refresh_reaction",
            "description": "Reset an NPC's reaction-used flag (mark reaction AVAILABLE).",
            "input_schema": {
                "type": "object",
                "properties": {"npc_slug": {"type": "string"}},
                "required": ["npc_slug"],
            },
        },
        {
            "name": "set_round",
            "description": "Set the absolute round number (e.g. roll back if user mis-clicked the round button).",
            "input_schema": {
                "type": "object",
                "properties": {"round_num": {"type": "integer", "minimum": 1}},
                "required": ["round_num"],
            },
        },
        {
            "name": "advance_round",
            "description": "Increment the round counter and refresh every NPC's reaction-available flag.",
            "input_schema": {"type": "object", "properties": {}},
        },
        {
            "name": "switch_tab",
            "description": "Make a specific NPC's tab the active one.",
            "input_schema": {
                "type": "object",
                "properties": {"npc_slug": {"type": "string"}},
                "required": ["npc_slug"],
            },
        },
        {
            "name": "reorder_tabs",
            "description": "Reorder the tabs by slug. Slugs not in `new_order` keep their relative position at the end.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "new_order": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["new_order"],
            },
        },
        {
            "name": "add_log_entry",
            "description": "Append a freeform entry to the combat log file.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "kind": {"type": "string", "description": "Optional category tag (e.g. note, event, phase)."},
                },
                "required": ["text"],
            },
        },
        {
            "name": "get_state_schema",
            "description": "Returns the expected schema for the encounter state. Useful before constructing a payload for `update_state_json`.",
            "input_schema": {"type": "object", "properties": {}},
        },
        {
            "name": "read_state",
            "description": "Read the current encounter state as JSON. Includes every NPC's HP, conditions, recharges, etc.",
            "input_schema": {"type": "object", "properties": {}},
        },
        {
            "name": "apply_command",
            "description": (
                "Run a command string through the same parser the dispatcher uses "
                "and apply its effect to the encounter state. "
                "Use this when the review determines the fast-path result was wrong "
                "or when interpreting a free-form command (e.g. '33 is taunted'). "
                "The command is validated identically to DM-typed input. "
                "Returns the parsed result and any errors."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Command string, e.g. '3 12 fire' or '5 10 heal'"},
                    "target_slug": {"type": "string", "description": "NPC slug for the target (required to route the effect)"},
                },
                "required": ["command", "target_slug"],
            },
        },
        # ─── SRD lookups (in-process — no MCP transport) ────────────────────
        {
            "name": "roll_dice",
            "description": "Roll dice (uses the same quantum/PRNG path as the action runner). Use for ad-hoc rolls the DM asks for: '1d20+5 for me', 'roll a death save', etc.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "num_dice": {"type": "integer", "description": "How many dice to roll (e.g. 1, 2, 4)"},
                    "dice_size": {"type": "integer", "description": "Die size (4, 6, 8, 10, 12, 20, 100)"},
                    "modifier": {"type": "integer", "description": "Flat modifier added to the total (e.g. +5 for proficiency+ability)"},
                    "description": {"type": "string", "description": "Optional label for the log (e.g. 'death save', 'Stealth check')"},
                },
                "required": ["num_dice", "dice_size"],
            },
        },
        {
            "name": "list_conditions",
            "description": "Look up condition effects (charmed, prone, paralyzed, ...). Use when the DM asks 'what does X do?' or needs the full rule text mid-fight.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Condition name; partial match. Omit to list all."},
                },
            },
        },
        {
            "name": "search_rules",
            "description": "Free-text search across 5e rule sections (cover, falling, grappling, opportunity attacks, etc.).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Keyword query (e.g. 'opportunity attack', 'cover')"},
                },
                "required": ["query"],
            },
        },
        {
            "name": "get_rule_section",
            "description": "Fetch a specific rule section by its key (e.g. 'srd-2024_cover-and-line-of-sight'). Use after search_rules returns a key.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                },
                "required": ["key"],
            },
        },
        {
            "name": "search_spells",
            "description": "Find spells by name / level / school. Returns full entries inline (no need to chain to get_spell_details for most queries).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Partial name match (case-insensitive)"},
                    "level": {"type": "integer", "description": "Exact spell level (0=cantrip)"},
                    "school": {"type": "string", "description": "School: abjuration, evocation, ..."},
                },
            },
        },
        {
            "name": "get_spell_details",
            "description": "Fetch a spell's full entry by v2 key (e.g. 'srd-2024_fireball'). Use after search_spells returns a key.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                },
                "required": ["key"],
            },
        },
    ]


# Names of the tools the reviewer actually needs. The review path sends only
# these to reduce per-call token cost (~1800 tokens saved vs the full 22-tool set).
REVIEW_TOOL_NAMES: frozenset[str] = frozenset(
    {"apply_command", "add_condition", "add_log_entry", "read_state"}
)


def _build_review_tool_definitions(full_tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return the trimmed tool set for the review path (subset of the full set)."""
    return [t for t in full_tools if t["name"] in REVIEW_TOOL_NAMES]


def _build_tool_dispatch_table(bundle: _StateBundle) -> dict[str, Callable[..., dict[str, Any]]]:
    """Map tool name → callable (closures over the state bundle)."""
    return {
        "set_hp": lambda **kw: _tool_set_hp(bundle, **kw),
        "damage_npc": lambda **kw: _tool_damage_npc(bundle, **kw),
        "heal_npc": lambda **kw: _tool_heal_npc(bundle, **kw),
        "add_condition": lambda **kw: _tool_add_condition(bundle, **kw),
        "remove_condition": lambda **kw: _tool_remove_condition(bundle, **kw),
        "mark_action_used": lambda **kw: _tool_mark_action_used(bundle, **kw),
        "mark_action_available": lambda **kw: _tool_mark_action_available(bundle, **kw),
        "refresh_reaction": lambda **kw: _tool_refresh_reaction(bundle, **kw),
        "set_round": lambda **kw: _tool_set_round(bundle, **kw),
        "advance_round": lambda **kw: _tool_advance_round(bundle, **kw),
        "switch_tab": lambda **kw: _tool_switch_tab(bundle, **kw),
        "reorder_tabs": lambda **kw: _tool_reorder_tabs(bundle, **kw),
        "add_log_entry": lambda **kw: _tool_add_log_entry(bundle, **kw),
        "get_state_schema": lambda **kw: _tool_get_state_schema(bundle, **kw),
        "read_state": lambda **kw: _tool_read_state(bundle, **kw),
        "apply_command": lambda **kw: _tool_apply_command(bundle, **kw),
        # SRD lookups (stateless — no bundle needed)
        "roll_dice": lambda **kw: _tool_roll_dice(**kw),
        "list_conditions": lambda **kw: _tool_list_conditions(**kw),
        "search_rules": lambda **kw: _tool_search_rules(**kw),
        "get_rule_section": lambda **kw: _tool_get_rule_section(**kw),
        "search_spells": lambda **kw: _tool_search_spells(**kw),
        "get_spell_details": lambda **kw: _tool_get_spell_details(**kw),
    }


# ─────────── controller ───────────

class LLMController:
    """Wraps the Anthropic SDK with the meta-controller tool surface."""

    SYSTEM_PROMPT = (
        "You're the at-table combat assistant for a D&D 5.5e GUI. The user just typed "
        "something that didn't match any deterministic dispatcher pattern. Your job:\n"
        "  1. Figure out what they meant from the full encounter context (read_state if needed).\n"
        "  2. Use the appropriate tool category:\n"
        "     - STATE MUTATIONS (damage_npc, set_round, etc.) — for executing an action the user described.\n"
        "     - SRD LOOKUPS (list_conditions, search_rules, search_spells, get_spell_details, get_rule_section, roll_dice)\n"
        "       — for 'what does charmed do?', 'look up Fireball', 'roll 1d20', or any rules/effects question.\n"
        "       When the user asks about an effect, condition, or spell, CALL THE LOOKUP — don't answer from memory.\n"
        "  3. After tool calls, return ONE short sentence summarizing the result OR the rule text the user asked for.\n"
        "If the input is a typo'd verb (e.g. 'stallker attaccck'), prefer running the matched action via the existing dispatcher path — just report what you think they meant, don't call tools.\n"
        "If the input is a tactics question ('what should it do?'), consult the NPC's tactics section in your context and suggest concrete actions; don't call action-execution tools unless the user explicitly says to."
    )

    REVIEW_SYSTEM_PROMPT = (
        "You are an at-table D&D 5.5e combat reviewer. A DM just typed a command; "
        "the fast path already applied the deterministic effect. You are given the "
        "ACTOR who acted (with allegiance), the RAW command typed, the RAW amount "
        "the DM entered (before any cap), the REAL applied delta — for every "
        "affected combatant, its before→after HP and conditions (with remaining "
        "durations) — plus each target's damage immunities, an id-resolution flag, "
        "and a roster of every combatant (id, name, kind pc/npc). Judge the "
        "ORIGINAL COMMAND + CONTEXT, not just the applied delta. Your job:\n"
        "  1. IMMUNITY/RESISTANCE. Check the damage type against the target's "
        "     listed immunities AND standard 5e type-based immunities you infer "
        "     from the creature's name/type — the listed field may be incomplete. "
        "     Apply your own D&D knowledge: undead are immune to poison and "
        "     (by convention) necrotic; constructs/golems are immune to poison; "
        "     elementals are immune to their element; fiends/demons resist "
        "     cold/fire/lightning; etc. If the target is IMMUNE the damage should "
        "     have been 0; if RESISTANT, halved.\n"
        "  2. MAGNITUDE. Sanity-check the RAW amount the DM typed against the "
        "     target's max HP. A raw amount many times the target's max HP (e.g. "
        "     an 80 or 700 on a 32-HP target) is a likely typo and must be FLAGGED "
        "     even if HP only dropped to 0 / the heal capped harmlessly — the "
        "     clean delta does not excuse the absurd input.\n"
        "  3. ALLEGIANCE. Use the roster `kind`. Damaging an ally/PC (a kind=pc "
        "     combatant), or healing an enemy, is likely a wrong-target mistake — "
        "     flag it UNLESS the recent log shows it is intentional (a charmed "
        "     attacker, a sacrifice, friendly-fire the DM narrated). For a "
        "     multi-target command: an all-ENEMY multi-hit (AoE) is normal and "
        "     correct — NEVER flag it. Flag a multi-target command ONLY when its "
        "     target set INCLUDES an ally/PC (friendly fire).\n"
        "  4. RAW-COMMAND SCAN. Read the raw command string. If it lists 2+ "
        "     damage-type tags (e.g. 'fire necrotic'), the parser silently kept "
        "     only one — flag the ambiguity. If it used an id that did not "
        "     cleanly resolve (the id-resolution flag is set), flag that the "
        "     command referenced an unrecognised id.\n"
        "  5. DURATIONS. Flag an implausible condition duration — a duration "
        "     beyond ~10 rounds (e.g. frightened for 90 rounds) is almost "
        "     certainly a mistyped amount.\n"
        "  6. WRONG-TARGET NO-OPS. If the command itself looks wrong (heal on an "
        "     enemy, damage on an already-dead combatant, malformed id) emit a "
        "     short advisory line EVEN IF the applied delta is a clean zero/no-op. "
        "     A clean no-op delta does not excuse a wrong command.\n"
        "  7. If a state value is genuinely wrong, call apply_command (or set_hp) "
        "     to revise it. Then reply with ONE short sentence — for an advisory "
        "     with no correction, just the sentence. Do NOT prefix your text with "
        "     '⟳ review:' — the logger adds that.\n"
        "  8. If the command is free-form ('33 is taunted'), interpret it: prefer "
        "     add_condition for condition-like input, else add_log_entry.\n"
        "  9. If the command and its delta are both correct, stay silent (return "
        "     no text, no tools). Never block on uncertainty — if genuinely "
        "     unsure AND the command looks fine, stay silent.\n"
        "Be concise. Prefer a single corrective tool call. One sentence if you speak."
    )

    def __init__(
        self,
        encounter_state: EncounterState,
        log_path: str,
        on_state_changed: Callable[[], None] | None = None,
        client: Any | None = None,
        model: str = DEFAULT_MODEL,
    ) -> None:
        self.encounter_state = encounter_state
        self.log_path = log_path
        self.model = model
        self._bundle = _StateBundle(encounter=encounter_state, log_path=log_path, on_state_changed=on_state_changed)
        self._tools = _build_tool_definitions()
        self._review_tools = _build_review_tool_definitions(self._tools)
        self._dispatch = _build_tool_dispatch_table(self._bundle)
        self._client = client  # None → lazy-construct on first call
        # Accumulates the tool calls of the in-progress run() so both the
        # in-process and marshalled dispatch paths feed the same RunResult.
        self._run_tool_calls: list[dict[str, Any]] = []

    # ─────────── public API ───────────

    def run(
        self,
        user_input: str,
        active_npc_slug: str | None = None,
        dispatch_fn: Callable[[list[Any]], list[dict[str, Any]]] | None = None,
    ) -> RunResult:
        """Send the user's input to Haiku with the full tool surface. Blocking.

        Returns a RunResult with the model's text reply and any tool calls
        it dispatched. State mutations are already applied by the time this
        returns (in-process tool dispatch).

        `dispatch_fn` — optional. When the chat loop hits a `tool_use` block,
        it normally dispatches the tools in-process on the calling thread. The
        GUI runs `run()` on a worker thread (so the network round-trips don't
        freeze the window) but the tools mutate live widgets, which is only
        safe on the Qt main thread. The GUI therefore passes a `dispatch_fn`
        that marshals the dispatch onto the main thread and blocks the worker
        until it completes. `dispatch_fn` receives the list of tool_use blocks
        and must return the list of tool_result dicts (and is responsible for
        appending to `self._run_tool_calls` so RunResult.tool_calls is filled).
        """
        client = self._ensure_client()
        if client is None:
            return RunResult(error="ANTHROPIC_API_KEY not set")

        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": self._build_user_message(user_input, active_npc_slug),
            }
        ]
        return self._chat_loop(client, messages, dispatch_fn=dispatch_fn)

    @staticmethod
    def build_review_user_msg(
        raw: str,
        actor: dict,
        affected: list[dict],
        roster: list[dict],
        applied_direction: str | None,
        applied_amount: int | None,
        log_tail: str,
        raw_amount: int | None = None,
        id_fallbacks: list[dict] | None = None,
    ) -> str:
        """Build the review `user_msg` — the full context payload.

        Pure helper, no I/O, so tests can assert the context shape directly.

        ``affected`` — one dict per combatant the command actually mutated, each
        with: name, id, kind, hp_before, hp_after, max_hp, conditions_before,
        conditions_after, immunities, and optionally ``durations_after`` (a
        ``{condition: rounds}`` map) so the review can flag implausible
        durations. This is the REAL before→after delta the fast path produced.

        ``roster`` — every combatant in the fight (id, name, kind) so the review
        can catch wrong-target / wrong-allegiance mistakes (healed an enemy,
        damaged an ally).

        ``raw_amount`` — the number the DM literally typed, BEFORE any cap/clamp.
        Distinct from ``applied_amount`` (the delta the fast path actually
        applied). An absurd ``raw_amount`` should be flagged even when the
        applied delta capped harmlessly.

        ``id_fallbacks`` — list of ``{"token": <typed id>, "resolved_to": <id>}``
        for any target id that did not cleanly resolve (e.g. ``0`` → actor-self,
        or an unrecognised id). Empty / None means every id resolved cleanly.
        """
        actor_desc = (
            f"{actor.get('name', '?')} "
            f"(id={actor.get('id', '?')}, kind={actor.get('kind', '?')})"
        )
        if applied_direction:
            applied_desc = f"{applied_direction} {applied_amount}"
        else:
            applied_desc = "(no scalar amount — see per-target HP delta below)"

        if raw_amount is not None and raw_amount != applied_amount:
            raw_amount_desc = (
                f"Raw amount typed by DM (before cap/clamp): {raw_amount}"
                f" — sanity-check this against target max HP\n"
            )
        elif raw_amount is not None:
            raw_amount_desc = f"Raw amount typed by DM: {raw_amount}\n"
        else:
            raw_amount_desc = ""

        target_lines: list[str] = []
        for t in affected:
            imm = t.get("immunities") or []
            imm_desc = ", ".join(imm) if imm else "none listed"
            cond_before = t.get("conditions_before", [])
            cond_after = t.get("conditions_after", [])
            durations = t.get("durations_after") or {}
            if durations:
                dur_desc = ", ".join(
                    f"{c}={r}rd" for c, r in sorted(durations.items())
                )
                cond_after_desc = f"{cond_after} (durations: {dur_desc})"
            else:
                cond_after_desc = f"{cond_after}"
            cond_desc = (
                f"conditions {cond_before}"
                if cond_before == cond_after and not durations
                else f"conditions {cond_before}→{cond_after_desc}"
            )
            target_lines.append(
                f"  - {t.get('name', '?')} (id={t.get('id', '?')}, "
                f"kind={t.get('kind', '?')}): "
                f"HP {t.get('hp_before', '?')}→{t.get('hp_after', '?')}"
                f"/{t.get('max_hp', '?')}, {cond_desc}, "
                f"damage immunities: {imm_desc}; "
                f"resistances: unknown — infer from creature type/name"
            )
        targets_block = (
            "\n".join(target_lines) if target_lines
            else "  (no combatant HP/conditions changed)"
        )

        roster_lines = [
            f"  - id={c.get('id', '?')} {c.get('name', '?')} [{c.get('kind', '?')}]"
            for c in roster
        ]
        roster_block = "\n".join(roster_lines) if roster_lines else "  (empty)"

        if id_fallbacks:
            fb_lines = [
                f"  - typed id {fb.get('token', '?')!r} did not cleanly "
                f"resolve — fell back to id {fb.get('resolved_to', '?')!r}"
                for fb in id_fallbacks
            ]
            fallback_block = (
                "Id-resolution fallbacks (a typed id was malformed / "
                "unrecognised — confirm the DM intended this target):\n"
                + "\n".join(fb_lines) + "\n"
            )
        else:
            fallback_block = ""

        return (
            f"Actor (who acted): {actor_desc}\n"
            f"Command typed: {raw!r}\n"
            f"{raw_amount_desc}"
            f"Fast path applied: {applied_desc}\n"
            f"{fallback_block}"
            f"Affected combatants (before→after — this is what the fast path "
            f"actually did):\n{targets_block}\n"
            f"Full combatant roster:\n{roster_block}\n"
            f"Recent log:\n{log_tail}"
        )

    # Cap on review tool-call iterations. A thorough immunity / magnitude
    # check legitimately needs 4–6 round-trips; 7 leaves headroom. On a
    # cap-hit the last assistant text is RETURNED (not discarded) — see
    # `_chat_loop` — so a correction emitted before the cap still survives.
    REVIEW_MAX_ITERATIONS = 7

    @staticmethod
    def _strip_review_prefix(text: str) -> str:
        """Strip a leading '⟳ review:' (or a bare leading '⟳') the model may
        have emitted, so `_tool_add_log_entry` doesn't double-prefix the line
        (G10 — '⟳ review: ⟳ review: …')."""
        stripped = text.lstrip()
        for prefix in ("⟳ review:", "⟳review:", "⟳"):
            if stripped.startswith(prefix):
                return stripped[len(prefix):].lstrip()
        return text

    def review_command(
        self,
        raw: str,
        actor: dict,
        affected: list[dict],
        roster: list[dict],
        applied_direction: str | None,
        applied_amount: int | None,
        log_tail: str,
        dispatch_fn: Callable[[list[Any]], list[dict[str, Any]]] | None = None,
        raw_amount: int | None = None,
        id_fallbacks: list[dict] | None = None,
    ) -> "RunResult":
        """Async review of an already-applied command. Blocking — run off-thread.

        The fast path has already applied the deterministic effect; this asks
        the model to verify it (resistances/immunities/over-damage/wrong-target
        /free-form intent) and, if anything is wrong, revise via tools. If the
        review writes a sentence it is appended to the combat log with a
        `⟳ review:` prefix.

        ``affected`` carries the REAL before→after HP/conditions (with
        durations) for every target the command mutated; ``roster`` carries
        every combatant's id/name/kind so the review can reason about
        allegiance. ``raw_amount`` is the number the DM literally typed (before
        cap); ``id_fallbacks`` flags any id that did not cleanly resolve.

        On a tool-loop cap-hit the last assistant text is returned (not
        discarded), so a correction the model emitted before the cap still
        gets logged.
        """
        client = self._ensure_client()
        if client is None:
            return RunResult(error="no API key")

        user_msg = self.build_review_user_msg(
            raw, actor, affected, roster,
            applied_direction, applied_amount, log_tail,
            raw_amount=raw_amount, id_fallbacks=id_fallbacks,
        )

        messages = [{"role": "user", "content": user_msg}]
        result = self._chat_loop(
            client, messages,
            system_override=self.REVIEW_SYSTEM_PROMPT,
            dispatch_fn=dispatch_fn,
            max_iterations=self.REVIEW_MAX_ITERATIONS,
            tools_override=self._review_tools,
        )
        # Log the review line whenever the model spoke — even on a cap-hit,
        # where `result.error` is set but `result.text` carries a usable
        # correction (G1). Strip any '⟳ review:' the model self-prefixed (G10).
        if result.text:
            clean = self._strip_review_prefix(result.text)
            if clean:
                _tool_add_log_entry(self._bundle, f"⟳ review: {clean}", kind="review")
        return result

    def dispatch_tool_uses(self, tool_uses: list[Any]) -> list[dict[str, Any]]:
        """Dispatch a batch of tool_use blocks against the live state, returning
        the tool_result dicts. Mutates `EncounterState` and fires GUI refresh
        callbacks — MUST run on the Qt main thread when used from the GUI.

        Each dispatched call is also recorded in `self._run_tool_calls` so the
        enclosing `run()` can report them in RunResult.tool_calls.
        """
        tool_results: list[dict[str, Any]] = []
        for tu in tool_uses:
            handler = self._dispatch.get(tu.name)
            if handler is None:
                result = {"ok": False, "error": f"unknown tool: {tu.name}"}
            else:
                try:
                    result = handler(**dict(tu.input))
                except Exception as exc:  # noqa: BLE001
                    result = {"ok": False, "error": f"{tu.name} crashed: {exc}"}
            self._run_tool_calls.append({"name": tu.name, "input": dict(tu.input), "result": result})
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu.id,
                "content": json.dumps(result),
            })
        return tool_results

    def suggest_next_actions(
        self,
        tab: NPCState,
        action_surface: list[dict[str, Any]],
        recent_log_tail: str | None = None,
    ) -> list[Suggestion]:
        """Return up to 3 short slug+action suggestions for this NPC's next move.

        Synchronous — UI code should run this in a QThread so it doesn't block.
        Returns an empty list on any failure (no surfaced error; the UI just
        keeps showing whatever was there).
        """
        client = self._ensure_client()
        if client is None:
            return []

        # We only need the suggestion model to return JSON; no tool calls.
        prompt = self._build_suggestion_prompt(tab, action_surface, recent_log_tail)
        try:
            resp = client.messages.create(
                model=SUGGESTION_MODEL,
                max_tokens=400,
                system=[
                    {
                        "type": "text",
                        "text": (
                            "Return ONLY a JSON object with key 'suggestions' (list of 3 objects, "
                            "each with 'slug' and 'action' keys). The 'action' MUST match one of "
                            "the action names in the encounter's action surface (passed in the "
                            "user message). Slugs are short labels < 60 chars."
                        ),
                        "cache_control": {"type": "ephemeral", "ttl": "1h"},
                    }
                ],
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as exc:  # noqa: BLE001 — wide net intentional; suggestions are best-effort
            logger.warning("Suggestion call failed: %s", exc)
            return []

        text_blocks = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
        joined = "\n".join(text_blocks).strip()
        # Strip code fences if the model wrapped the JSON
        if joined.startswith("```"):
            joined = joined.strip("`").lstrip("json").strip()
        try:
            parsed = json.loads(joined)
        except json.JSONDecodeError:
            logger.warning("Suggestion JSON parse failed: %s", joined[:200])
            return []
        suggestions: list[Suggestion] = []
        for item in parsed.get("suggestions", []):
            slug = str(item.get("slug", "")).strip()
            action = str(item.get("action", "")).strip()
            if slug and action:
                suggestions.append(Suggestion(slug=slug, action_name=action))
        return suggestions[:3]

    # ─────────── internals ───────────

    def _ensure_client(self) -> Any | None:
        if self._client is not None:
            return self._client
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return None
        try:
            import anthropic  # local import keeps tests fast
            self._client = anthropic.Anthropic()
        except ImportError:
            logger.warning("anthropic SDK not installed; LLM controller disabled")
            return None
        return self._client

    def _build_user_message(self, user_input: str, active_npc_slug: str | None) -> str:
        npc_summaries = []
        for n in self.encounter_state.npcs:
            marker = " [active]" if n.slug == active_npc_slug else ""
            npc_summaries.append(
                f"  - {n.slug}{marker}: HP {n.hp}/{n.max_total_hp}, count={n.count}, "
                f"conditions={sorted(n.conditions)}, reaction_used={n.reaction_used}"
            )
        return (
            f"Round: {self.encounter_state.round_num}\n"
            f"Active NPC: {active_npc_slug or '(none)'}\n"
            f"All loaded NPCs:\n" + "\n".join(npc_summaries) + "\n\n"
            f"User typed: {user_input!r}\n\n"
            f"Decide what they meant and act."
        )

    def _build_suggestion_prompt(
        self,
        tab: NPCState,
        action_surface: list[dict[str, Any]],
        recent_log_tail: str | None,
    ) -> str:
        action_lines = [
            f"  - {a['action']} (verbs: {', '.join(a.get('verbs', [])[:5])})"
            for a in action_surface
        ]
        log_tail = f"\nRecent log:\n{recent_log_tail}" if recent_log_tail else ""
        return (
            f"NPC: {tab.slug} (HP {tab.hp}/{tab.max_total_hp}, "
            f"conditions={sorted(tab.conditions)}, reaction_used={tab.reaction_used})\n\n"
            f"Available actions:\n" + "\n".join(action_lines) + log_tail + "\n\n"
            "Return 3 likely next actions, in 'suggestions' JSON array. "
            "Each must include 'slug' (short label) and 'action' (must exactly match "
            "one of the available action names above)."
        )

    MAX_TOOL_LOOP_ITERATIONS = 10

    def _chat_loop(
        self,
        client: Any,
        messages: list[dict[str, Any]],
        dispatch_fn: Callable[[list[Any]], list[dict[str, Any]]] | None = None,
        system_override: str | None = None,
        max_iterations: int | None = None,
        tools_override: list[dict[str, Any]] | None = None,
    ) -> RunResult:
        """Run the chat loop, dispatching tool calls until end_turn.

        Only the `messages.create` network round-trips run here; tool dispatch
        is delegated to `dispatch_fn` (defaults to in-process
        `dispatch_tool_uses`). The GUI passes a `dispatch_fn` that marshals the
        dispatch onto the Qt main thread so the loop itself can run on a worker
        thread without freezing the window.

        `system_override` — when provided, replaces `SYSTEM_PROMPT` for this
        loop only (used by `review_command`). The `run()` path leaves it None
        and keeps using `SYSTEM_PROMPT`.

        `max_iterations` — optional cap on tool-call iterations. Defaults to
        None → uses MAX_TOOL_LOOP_ITERATIONS (keeps `run()` behavior unchanged).
        Pass a lower value (e.g. 2) in `review_command` to bound at-table
        latency and cost for the per-command review.

        `tools_override` — when provided, replaces `self._tools` for this loop
        only. The `run()` path leaves it None (full tool set). Pass
        `self._review_tools` in `review_command` to send only the ~4 tools the
        reviewer actually needs, cutting ~1800 input tokens per call.
        """
        if dispatch_fn is None:
            dispatch_fn = self.dispatch_tool_uses
        prompt_text = system_override if system_override is not None else self.SYSTEM_PROMPT
        iteration_cap = max_iterations if max_iterations is not None else self.MAX_TOOL_LOOP_ITERATIONS
        active_tools = tools_override if tools_override is not None else self._tools
        # Reset the per-run accumulator (dispatch_tool_uses appends into it).
        # LLM workers run on a single-thread pool (_llm_pool, maxThreadCount=1)
        # so this instance state is never shared concurrently between run() and
        # review_command() calls.
        self._run_tool_calls = []
        final_text = ""
        hit_cap = True  # cleared when the loop exits normally via stop_reason
        for _iteration in range(iteration_cap):
            try:
                resp = client.messages.create(
                    model=self.model,
                    max_tokens=500,
                    system=[
                        {
                            "type": "text",
                            "text": prompt_text,
                            "cache_control": {"type": "ephemeral", "ttl": "1h"},
                        }
                    ],
                    tools=active_tools,
                    messages=messages,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("LLM run call failed: %s", exc)
                return RunResult(text=final_text, tool_calls=list(self._run_tool_calls), error=str(exc))

            text_parts: list[str] = []
            tool_uses: list[Any] = []
            for block in resp.content:
                btype = getattr(block, "type", None)
                if btype == "text":
                    text_parts.append(block.text)
                elif btype == "tool_use":
                    tool_uses.append(block)
            if text_parts:
                final_text = "\n".join(text_parts).strip()

            if resp.stop_reason == "tool_use" and tool_uses:
                tool_results = dispatch_fn(tool_uses)
                messages.append({"role": "assistant", "content": resp.content})
                messages.append({"role": "user", "content": tool_results})
                continue
            # end_turn or no more tool uses
            messages.append({"role": "assistant", "content": resp.content})
            hit_cap = False
            break
        if hit_cap:
            logger.warning(
                "LLM tool loop reached iteration cap (%d); returning last "
                "assistant text (any tool calls already made stand)",
                iteration_cap,
            )
            # G1: do NOT discard. The model may have emitted a correct
            # correction in an earlier turn (and its tool calls already
            # mutated state) — return the last assistant text so the review
            # line still gets logged. `error` is set so callers that need to
            # know the loop was truncated still can, but `text` is the
            # authoritative result.
            return RunResult(
                text=final_text,
                tool_calls=list(self._run_tool_calls),
                error=f"reached tool-loop iteration cap ({iteration_cap}); returned last partial response",
            )
        return RunResult(text=final_text, tool_calls=list(self._run_tool_calls))
