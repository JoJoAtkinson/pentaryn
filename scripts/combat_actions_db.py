#!/usr/bin/env python3
"""Combat-actions database (JSONL flat-file).

Replaces the per-NPC .actions.toml sidecars with one append-friendly file:
`combat-runner/actions.jsonl`. Composite key = (npc, action). One JSON object
per line. Tracked in git — this is authoritative campaign data, not
per-machine state.

Usage from Python:
    from combat_actions_db import upsert, list_actions, get
    upsert("glacier-stalker", "multiattack", {"type": "multiattack", ...})
    actions = list_actions(npc="glacier-stalker")
    spec = get("glacier-stalker", "attack")  # resolves verbs

Usage from CLI:
    python combat_actions_db.py list
    python combat_actions_db.py list --npc glacier-stalker
    python combat_actions_db.py get glacier-stalker attack
    python combat_actions_db.py validate

Stdlib only.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

_REPO_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_DB = _REPO_ROOT / "combat-runner" / "actions.jsonl"


def _db_path() -> Path:
    """Override-able for tests via DND_COMBAT_ACTIONS_DB env var."""
    return Path(os.environ.get("DND_COMBAT_ACTIONS_DB", str(_DEFAULT_DB)))


# ───────────────────────── core IO ─────────────────────────

def _iter_records() -> Iterable[dict]:
    """Yield every JSON record from the DB, skipping malformed lines (with warning)."""
    p = _db_path()
    if not p.exists():
        return
    with open(p, "r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as e:
                print(f"warn: {p}:{lineno} skipped malformed JSON: {e}", file=sys.stderr)


def read_all() -> list[dict]:
    """Load every record from the DB."""
    return list(_iter_records())


def _atomic_write(records: list[dict]) -> None:
    """Atomically rewrite the DB. Each record is one JSON line, sorted by (npc, action).

    fsync before rename protects against power-loss leaving a zero-byte file.
    """
    p = _db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    records = sorted(records, key=lambda r: (r.get("npc", ""), r.get("action", "")))
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", delete=False, dir=str(p.parent), suffix=".tmp"
    ) as tmp:
        for r in records:
            tmp.write(json.dumps(r, ensure_ascii=False, separators=(",", ":")))
            tmp.write("\n")
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = Path(tmp.name)
    tmp_path.replace(p)


# ───────────────────────── validation ─────────────────────────

_VALID_TYPES = {"multiattack", "single_attack", "area", "utility", "reaction"}

# A dice string must be 'NdM' — the only form the runner's _parse_dice_spec
# accepts. No leading zeros, no inline +N modifier, no flat numbers. The bounds
# (count 1-100, die size in the standard set) mirror _roll_dice_async /
# _parse_dice_spec exactly: NO spec may pass validate_spec that the runner
# cannot execute.
_DICE_SPEC_RE = re.compile(r"^\s*([1-9]\d*)\s*[dD]\s*([1-9]\d*)\s*$")
_VALID_DIE_SIZES = (4, 6, 8, 10, 12, 20, 100)


def _validate_dice(value: Any, where: str) -> list[str]:
    """Validate a single dice string against the runner's NdM grammar + bounds.

    Returns a list of error messages (empty = valid). Rejects non-strings,
    non-NdM forms (flat numbers, inline modifiers, garbage), leading zeros,
    out-of-range counts (1-100), and non-standard die sizes."""
    if not isinstance(value, str):
        return [f"{where} must be an 'NdM' dice string (e.g. '2d6'), got {type(value).__name__}"]
    m = _DICE_SPEC_RE.match(value)
    if not m:
        return [
            f"{where} must be an 'NdM' dice string with no leading zeros, "
            f"no inline modifier, and no flat numbers (e.g. '2d6'), got {value!r}"
        ]
    count, size = int(m.group(1)), int(m.group(2))
    if not (1 <= count <= 100):
        return [f"{where}: dice count must be 1-100, got {count} in {value!r}"]
    if size not in _VALID_DIE_SIZES:
        return [
            f"{where}: die size must be one of {list(_VALID_DIE_SIZES)}, "
            f"got d{size} in {value!r}"
        ]
    return []

# Mirror of gui.event_bus.EventKind. Duplicated here so this stdlib-only module
# stays import-free of the GUI package — the GUI re-checks at runtime anyway.
_VALID_TRIGGER_EVENTS = {
    "damage", "heal", "condition_applied", "condition_removed",
    "action_executed", "spell_cast", "round_advanced",
    "death", "bloodied", "note",
}
_VALID_TRIGGER_SCOPES = {"self", "global"}


_VALID_WATCH_SCOPES = {"self", "ally", "any"}
_VALID_SLOT_REFRESH = {"long_rest", "short_rest", "encounter", "round", "turn"}


def _validate_apply_condition_on_hit(cfg: Any) -> list[str]:
    """Structured rider: `apply_condition_on_hit: {condition, save_dc, save_ability,
    duration_rounds?}`. When the attack hits, the target makes the named save;
    on fail, the condition (with optional duration) gets applied. The runner
    emits a clear DM-instruction line for now (it can't roll PC saves); the
    DM applies via `@<cond> <duration>` on the target's tab."""
    errors: list[str] = []
    if not isinstance(cfg, dict):
        return ["apply_condition_on_hit must be a dict"]
    cond = cfg.get("condition")
    if not isinstance(cond, str) or not cond.strip():
        errors.append("apply_condition_on_hit.condition must be a non-empty string")
    save_dc = cfg.get("save_dc")
    if not isinstance(save_dc, int) or save_dc <= 0:
        errors.append("apply_condition_on_hit.save_dc must be a positive int")
    save_ability = cfg.get("save_ability")
    if not isinstance(save_ability, str) or save_ability.lower() not in {
        "str", "dex", "con", "int", "wis", "cha",
    }:
        errors.append("apply_condition_on_hit.save_ability must be one of str/dex/con/int/wis/cha")
    if "duration_rounds" in cfg and not (isinstance(cfg["duration_rounds"], int) and cfg["duration_rounds"] > 0):
        errors.append("apply_condition_on_hit.duration_rounds must be a positive int")
    return errors


def _validate_slots(cfg: Any) -> list[str]:
    """First-class per-day / per-encounter slot tracking. Schema:
        slots: {count: int, refresh: "long_rest"|"short_rest"|"encounter"|"round"|"turn"}
    The GUI tracks the charge chip; the MCP `roll_combat_action` runner does not
    decrement it (no persistent per-encounter state) but DOES surface it as a
    visible '(slots: N/N, refresh ...)' line so the DM tracks it by hand — so a
    spec carrying `slots` is still executable."""
    errors: list[str] = []
    if not isinstance(cfg, dict):
        return ["slots must be a dict with count + refresh"]
    count = cfg.get("count")
    if not isinstance(count, int) or count <= 0:
        errors.append("slots.count must be a positive int")
    refresh = cfg.get("refresh")
    if refresh not in _VALID_SLOT_REFRESH:
        errors.append(f"slots.refresh must be one of {sorted(_VALID_SLOT_REFRESH)}, got {refresh!r}")
    return errors


def _validate_attack_entry(atk: Any, i: int) -> list[str]:
    """Per-attack validation, extracted so it can be reused for nested checks.
    Recognizes optional `extra_damage: {dice, modifier?, type}` (streamline #5)
    and optional `apply_condition_on_hit` (streamline #7)."""
    errors: list[str] = []
    if not isinstance(atk, dict):
        return [f"attacks[{i}] must be a dict"]
    for k in ("name", "to_hit_bonus", "damage", "damage_type"):
        if k not in atk:
            errors.append(f"attacks[{i}] missing required key {k!r}")
    if "damage" in atk:
        errors.extend(_validate_dice(atk["damage"], f"attacks[{i}].damage"))
    if "extra_damage" in atk:
        extra = atk["extra_damage"]
        if not isinstance(extra, dict):
            errors.append(f"attacks[{i}].extra_damage must be a dict with dice + type")
        else:
            for k in ("dice", "type"):
                if k not in extra:
                    errors.append(f"attacks[{i}].extra_damage missing {k!r}")
            if "dice" in extra:
                errors.extend(
                    _validate_dice(extra["dice"], f"attacks[{i}].extra_damage.dice")
                )
    if "apply_condition_on_hit" in atk:
        errors.extend(
            f"attacks[{i}].apply_condition_on_hit: {e}"
            for e in _validate_apply_condition_on_hit(atk["apply_condition_on_hit"])
        )
    return errors


def _validate_watch(watch: Any) -> list[str]:
    """Validate an optional `watch: {event, match, scope, priority}` block.
    Watches drive deterministic suggestions on the owning NPC's bar when a
    matching event fires anywhere on the bus."""
    errors: list[str] = []
    if not isinstance(watch, dict):
        return ["watch must be a dict with keys event, match, scope"]
    event = watch.get("event")
    if event not in _VALID_TRIGGER_EVENTS:
        errors.append(f"watch.event must be one of {sorted(_VALID_TRIGGER_EVENTS)}, got {event!r}")
    scope = watch.get("scope", "ally")
    if scope not in _VALID_WATCH_SCOPES:
        errors.append(f"watch.scope must be one of {sorted(_VALID_WATCH_SCOPES)}, got {scope!r}")
    match = watch.get("match", "")
    if not isinstance(match, str):
        errors.append("watch.match must be a string (empty string = no sub-filter)")
    priority = watch.get("priority", 10)
    if not isinstance(priority, int):
        errors.append("watch.priority must be an integer")
    return errors


def _validate_trigger(trig: Any) -> list[str]:
    """Validate an optional `trigger: {scope, event, match}` block."""
    errors: list[str] = []
    if not isinstance(trig, dict):
        return ["trigger must be a dict with keys scope, event, match"]
    scope = trig.get("scope")
    if scope not in _VALID_TRIGGER_SCOPES:
        errors.append(f"trigger.scope must be one of {sorted(_VALID_TRIGGER_SCOPES)}, got {scope!r}")
    event = trig.get("event")
    if event not in _VALID_TRIGGER_EVENTS:
        errors.append(f"trigger.event must be one of {sorted(_VALID_TRIGGER_EVENTS)}, got {event!r}")
    match = trig.get("match")
    if not isinstance(match, str) or not match.strip():
        errors.append("trigger.match must be a non-empty string")
    return errors


def validate_spec(spec: dict) -> list[str]:
    """Return a list of error messages for a spec (empty list = valid)."""
    errors: list[str] = []
    if not isinstance(spec, dict):
        return [f"spec must be a JSON object, got {type(spec).__name__}"]
    t = spec.get("type")
    if t not in _VALID_TYPES:
        errors.append(f"type must be one of {sorted(_VALID_TYPES)}, got {t!r}")
        return errors  # downstream checks are type-conditional

    if "verbs" in spec and not isinstance(spec["verbs"], list):
        errors.append("verbs must be a list")
    if "narration" not in spec or not isinstance(spec.get("narration"), str):
        errors.append("narration is required and must be a string")

    # Optional trigger block — works on any action type (reaction uses it to
    # auto-fire; non-reaction actions can also declare triggers for future
    # automation hooks like "auto-cast Shield when targeted by attack").
    if "trigger" in spec:
        errors.extend(_validate_trigger(spec["trigger"]))

    # Optional scope field — when "global", this action is appended to every
    # NPC's action surface (Push, Grapple, Dodge, etc.). Default is per-NPC.
    if "scope" in spec:
        if spec["scope"] not in ("self", "global"):
            errors.append(f"scope must be 'self' or 'global', got {spec['scope']!r}")

    # Optional watch block — broadcasts events from other tabs surface this
    # action as a high-priority suggestion on the owning NPC's bar.
    if "watch" in spec:
        errors.extend(_validate_watch(spec["watch"]))

    # Optional slots field — first-class per-day / per-encounter charge tracking.
    if "slots" in spec:
        errors.extend(_validate_slots(spec["slots"]))

    if t in ("multiattack", "single_attack"):
        attacks = spec.get("attacks")
        if not isinstance(attacks, list) or not attacks:
            errors.append(f"{t} requires non-empty attacks list")
        else:
            for i, atk in enumerate(attacks):
                errors.extend(_validate_attack_entry(atk, i))
    elif t == "area":
        for k in ("damage", "save"):
            if k not in spec:
                errors.append(f"area requires {k!r}")
        if "damage" in spec:
            if not isinstance(spec["damage"], dict):
                errors.append("area.damage must be an object")
            elif "dice" not in spec["damage"]:
                errors.append("area.damage requires 'dice'")
            else:
                errors.extend(_validate_dice(spec["damage"]["dice"], "area.damage.dice"))
        if "save" in spec:
            if not isinstance(spec["save"], dict):
                errors.append("area.save must be an object")
            else:
                for k in ("dc", "ability"):
                    if k not in spec["save"]:
                        errors.append(f"area.save requires {k!r}")
    elif t == "utility":
        # Utility actions are either (a) a single roll the NPC makes (Stealth,
        # Counterspell check, etc.) or (b) a no-roll buff / instantaneous effect
        # (Mage Armor, Shield, Misty Step) where the spec carries an `effect`
        # string and the runner just prints it.
        has_roll = isinstance(spec.get("roll"), dict) and "dice" in spec.get("roll", {})
        has_effect = isinstance(spec.get("effect"), str) and bool(spec["effect"].strip())
        if not (has_roll or has_effect):
            errors.append("utility requires either roll.dice or non-empty effect text")
        if has_roll:
            errors.extend(_validate_dice(spec["roll"]["dice"], "utility.roll.dice"))
    elif t == "reaction":
        # Reactions come in three flavors:
        #   (a) damage  — classic counterstrike: needs damage.dice + attacker_save
        #   (b) movement — Incorporeal Escape, Misty Step: needs `effect` text
        #   (c) buff    — Shield, Bless: needs `effect` text
        # We disambiguate by `reaction_kind` (defaults to "damage" for back-compat).
        kind = spec.get("reaction_kind", "damage")
        if kind == "damage":
            damage = spec.get("damage")
            if not isinstance(damage, dict) or "dice" not in damage:
                errors.append("reaction (kind=damage) requires damage.dice")
            else:
                errors.extend(_validate_dice(damage["dice"], "reaction.damage.dice"))
            if "attacker_save" not in spec:
                errors.append("reaction (kind=damage) requires attacker_save")
        elif kind in ("movement", "buff"):
            has_effect = isinstance(spec.get("effect"), str) and bool(spec["effect"].strip())
            if not has_effect:
                errors.append(f"reaction (kind={kind}) requires a non-empty effect text")
        else:
            errors.append(f"reaction_kind must be one of damage/movement/buff, got {kind!r}")

    return errors


# ───────────────────────── public API ─────────────────────────

def upsert(npc: str, action: str, spec: dict) -> dict:
    """Add or replace the (npc, action) entry. Validates spec; raises on bad input.
    Returns the persisted record (with timestamp injected).
    """
    if not npc or not action:
        raise ValueError("npc and action are required non-empty strings")
    errors = validate_spec(spec)
    if errors:
        raise ValueError(f"invalid spec: {'; '.join(errors)}")

    record = {"npc": npc, "action": action, **spec}
    record["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    records = read_all()
    found = False
    for i, r in enumerate(records):
        if r.get("npc") == npc and r.get("action") == action:
            records[i] = record
            found = True
            break
    if not found:
        records.append(record)
    _atomic_write(records)
    return record


def upsert_many(entries: Iterable[tuple[str, str, dict]]) -> list[dict]:
    """Bulk version of upsert. One read + one write for N records, instead of
    N read+write cycles. `entries` is an iterable of (npc, action, spec) tuples.
    Validates EVERY spec before writing — if any one fails, NOTHING is written.
    Returns the list of persisted records (in input order)."""
    pending: list[tuple[str, str, dict]] = []
    errors: list[str] = []
    for i, (npc, action, spec) in enumerate(entries):
        if not npc or not action:
            errors.append(f"entry[{i}]: npc and action are required")
            continue
        spec_errors = validate_spec(spec)
        if spec_errors:
            errors.append(f"entry[{i}] ({npc}.{action}): {'; '.join(spec_errors)}")
            continue
        pending.append((npc, action, spec))
    if errors:
        raise ValueError(f"upsert_many: {len(errors)} invalid entries:\n  - " + "\n  - ".join(errors))

    records = read_all()
    by_key: dict[tuple[str, str], int] = {
        (r.get("npc", ""), r.get("action", "")): i for i, r in enumerate(records)
    }
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    persisted: list[dict] = []
    for npc, action, spec in pending:
        record = {"npc": npc, "action": action, **spec, "updated_at": now}
        key = (npc, action)
        if key in by_key:
            records[by_key[key]] = record
        else:
            by_key[key] = len(records)
            records.append(record)
        persisted.append(record)
    _atomic_write(records)
    return persisted


def delete(npc: str, action: str) -> bool:
    """Remove the (npc, action) entry. Returns True if it existed."""
    records = read_all()
    new_records = [r for r in records if not (r.get("npc") == npc and r.get("action") == action)]
    if len(new_records) == len(records):
        return False
    _atomic_write(new_records)
    return True


def get(npc: str, action_or_verb: str) -> dict | None:
    """Look up an action by name OR by any verb in its `verbs` list. Returns
    the full record or None.
    """
    target = action_or_verb.lower()
    npc_records = [r for r in read_all() if r.get("npc") == npc]
    # exact action name match wins
    for r in npc_records:
        if r.get("action") == action_or_verb:
            return r
    # verb match
    for r in npc_records:
        verbs = [v.lower() for v in r.get("verbs", [])]
        if target in verbs:
            return r
    return None


def list_actions(
    npc: str | None = None,
    npcs: list[str] | None = None,
    include_globals: bool = True,
) -> list[dict]:
    """Return lightweight summaries of every matching action.

    Filter by single npc, or by a list of npc slugs (encounter use case).
    By default also include any rows whose `scope == "global"` (universal
    actions like Push/Grapple/Dodge). Pass `include_globals=False` to suppress.
    Each summary contains: npc, action, type, verbs, narration_preview, range,
    area, recharge, prerequisite, trigger, scope. NOT the full attack/damage
    spec — that's behind get() / combat_action_run.
    """
    records = read_all()
    if npc or npcs:
        wanted = {npc} if npc else set(npcs or ())
        kept = []
        for r in records:
            if r.get("npc") in wanted:
                kept.append(r)
            elif include_globals and r.get("scope") == "global":
                kept.append(r)
        records = kept

    summaries = []
    for r in records:
        narration = (r.get("narration") or "").strip()
        if len(narration) > 80:
            narration = narration[:77] + "..."
        summary = {
            "npc": r.get("npc"),
            "action": r.get("action"),
            "type": r.get("type"),
            "verbs": r.get("verbs", []),
            "narration_preview": narration,
        }
        for opt in ("range", "area", "recharge", "prerequisite", "trigger", "scope", "watch"):
            if opt in r:
                summary[opt] = r[opt]
        summaries.append(summary)
    return summaries


def format_ready_reference(npcs: list[str]) -> str:
    """Build the system-prompt 'Ready actions' block for the launcher.

    Compact, scannable: one line per action, with verbs and any flagged
    constraint (range, area+recharge, prerequisite, reaction trigger).
    """
    summaries = list_actions(npcs=npcs)
    if not summaries:
        return "## Ready actions\n\n*(No actions in DB for this encounter's NPCs.)*\n"

    by_npc: dict[str, list[dict]] = {}
    for s in summaries:
        by_npc.setdefault(s["npc"], []).append(s)

    lines: list[str] = []
    lines.append("## Ready actions (preprocessed by launcher)\n")
    lines.append(
        "Resolve a turn with **`roll_combat_action(npc=\"<slug>\", "
        "action=\"<verb-or-name>\", log_path=\"<provided>\")`** — the tool runs "
        "every roll and returns the formatted reply. Print its `output` field "
        "verbatim and stop.\n"
    )
    for npc, acts in sorted(by_npc.items()):
        lines.append(f"\n### `{npc}`\n")
        for a in acts:
            verbs = ", ".join(a["verbs"]) if a["verbs"] else "*(auto-trigger only)*"
            tags: list[str] = []
            if "range" in a:
                tags.append(f"range {a['range']}")
            if "area" in a:
                tags.append(a["area"])
            if "recharge" in a:
                tags.append(f"recharge {a['recharge']}+")
            if "prerequisite" in a:
                tags.append(f"req: {a['prerequisite']}")
            if "trigger" in a:
                trig = a["trigger"]
                if isinstance(trig, dict):
                    tags.append(f"trigger ({trig.get('scope', 'self')}): {trig.get('match', '')}")
                else:
                    tags.append(f"trigger: {trig}")
            tag_str = f"  ({'; '.join(tags)})" if tags else ""
            lines.append(f"- **`{a['action']}`** — verbs: {verbs}{tag_str}")
    return "\n".join(lines) + "\n"


# ───────────────────────── CLI ─────────────────────────

def _cli() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Combat actions DB CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="List action summaries")
    p_list.add_argument("--npc", help="Filter by NPC slug")

    p_get = sub.add_parser("get", help="Get full spec for one action")
    p_get.add_argument("npc")
    p_get.add_argument("action_or_verb")

    p_validate = sub.add_parser("validate", help="Validate every record in the DB")

    p_delete = sub.add_parser("delete", help="Delete an action")
    p_delete.add_argument("npc")
    p_delete.add_argument("action")

    p_ref = sub.add_parser("ready-ref", help="Print the 'Ready actions' block for given NPC slugs")
    p_ref.add_argument("npcs", nargs="+")

    args = parser.parse_args()
    if args.cmd == "list":
        for s in list_actions(npc=args.npc):
            print(json.dumps(s, ensure_ascii=False))
    elif args.cmd == "get":
        spec = get(args.npc, args.action_or_verb)
        print(json.dumps(spec, indent=2, ensure_ascii=False) if spec else "null")
    elif args.cmd == "validate":
        bad = 0
        for r in read_all():
            errs = validate_spec({k: v for k, v in r.items() if k not in ("npc", "action", "updated_at")})
            if errs:
                bad += 1
                print(f"INVALID {r.get('npc')}.{r.get('action')}: {'; '.join(errs)}", file=sys.stderr)
        print(f"{'OK' if bad == 0 else 'FAIL'} — {bad} invalid record(s)")
        return 0 if bad == 0 else 1
    elif args.cmd == "delete":
        ok = delete(args.npc, args.action)
        print("deleted" if ok else "not found")
    elif args.cmd == "ready-ref":
        print(format_ready_reference(args.npcs))
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
