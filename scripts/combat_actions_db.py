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

# Mirror of gui.event_bus.EventKind. Duplicated here so this stdlib-only module
# stays import-free of the GUI package — the GUI re-checks at runtime anyway.
_VALID_TRIGGER_EVENTS = {
    "damage", "heal", "condition_applied", "condition_removed",
    "action_executed", "spell_cast", "round_advanced",
    "death", "bloodied", "note",
}
_VALID_TRIGGER_SCOPES = {"self", "global"}


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

    if t in ("multiattack", "single_attack"):
        attacks = spec.get("attacks")
        if not isinstance(attacks, list) or not attacks:
            errors.append(f"{t} requires non-empty attacks list")
        else:
            for i, atk in enumerate(attacks):
                for k in ("name", "to_hit_bonus", "damage", "damage_type"):
                    if k not in atk:
                        errors.append(f"attacks[{i}] missing required key {k!r}")
    elif t == "area":
        for k in ("damage", "save"):
            if k not in spec:
                errors.append(f"area requires {k!r}")
        if "damage" in spec and "dice" not in spec["damage"]:
            errors.append("area.damage requires 'dice'")
        if "save" in spec:
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
    elif t == "reaction":
        if "damage" not in spec or "dice" not in spec.get("damage", {}):
            errors.append("reaction requires damage.dice")
        if "attacker_save" not in spec:
            errors.append("reaction requires attacker_save")

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
        for opt in ("range", "area", "recharge", "prerequisite", "trigger", "scope"):
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
