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
from typing import Any, Callable, Optional

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

    def notify(self) -> None:
        if self.on_state_changed is not None:
            self.on_state_changed()


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


def _tool_set_round(bundle: _StateBundle, round_num: int) -> dict[str, Any]:
    bundle.encounter.set_round(round_num)
    bundle.notify()
    return {"ok": True, "round_num": bundle.encounter.round_num}


def _tool_advance_round(bundle: _StateBundle) -> dict[str, Any]:
    bundle.encounter.advance_round()
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
        self._dispatch = _build_tool_dispatch_table(self._bundle)
        self._client = client  # None → lazy-construct on first call

    # ─────────── public API ───────────

    def run(self, user_input: str, active_npc_slug: str | None = None) -> RunResult:
        """Send the user's input to Haiku with the full tool surface. Blocking.

        Returns a RunResult with the model's text reply and any tool calls
        it dispatched. State mutations are already applied by the time this
        returns (in-process tool dispatch).
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
        return self._chat_loop(client, messages)

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

    def _chat_loop(self, client: Any, messages: list[dict[str, Any]]) -> RunResult:
        """Run the chat loop, dispatching tool calls until end_turn."""
        all_tool_calls: list[dict[str, Any]] = []
        final_text = ""
        hit_cap = True  # cleared when the loop exits normally via stop_reason
        for _iteration in range(self.MAX_TOOL_LOOP_ITERATIONS):
            try:
                resp = client.messages.create(
                    model=self.model,
                    max_tokens=500,
                    system=[
                        {
                            "type": "text",
                            "text": self.SYSTEM_PROMPT,
                            "cache_control": {"type": "ephemeral", "ttl": "1h"},
                        }
                    ],
                    tools=self._tools,
                    messages=messages,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("LLM run call failed: %s", exc)
                return RunResult(error=str(exc))

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
                    all_tool_calls.append({"name": tu.name, "input": dict(tu.input), "result": result})
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": json.dumps(result),
                    })
                messages.append({"role": "assistant", "content": resp.content})
                messages.append({"role": "user", "content": tool_results})
                continue
            # end_turn or no more tool uses
            messages.append({"role": "assistant", "content": resp.content})
            hit_cap = False
            break
        if hit_cap:
            logger.warning(
                "LLM tool loop reached iteration cap (%d); response may be incomplete",
                self.MAX_TOOL_LOOP_ITERATIONS,
            )
            return RunResult(
                text=final_text,
                tool_calls=all_tool_calls,
                error=f"reached tool-loop iteration cap ({self.MAX_TOOL_LOOP_ITERATIONS}); response may be partial",
            )
        return RunResult(text=final_text, tool_calls=all_tool_calls)
