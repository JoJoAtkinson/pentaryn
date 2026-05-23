"""Format a combat-action spec as a compact HTML block for the combat log.

The `info <id|name>` verb (dispatcher) looks up an action by panel number or
name on the active NPC's tab, then calls `format_action_info(spec)` to turn
the full DB row into a single HTML string that `_append_log` can render.

Goals:
  * One log entry per `info` call — no multi-line cascade.
  * Read at a glance: action name + type on top, key mechanic on second line,
    flavor/effect text last.
  * No surprises: every spec type produces output without raising.
"""
from __future__ import annotations

from typing import Any


def _attack_line(atk: dict[str, Any]) -> str:
    name = atk.get("name", "Attack")
    bonus = atk.get("to_hit_bonus", 0)
    dice = atk.get("damage", "?d?")
    mod = atk.get("damage_modifier", 0)
    dtype = atk.get("damage_type", "")
    dmg_str = f"{dice}+{mod}" if mod else dice
    line = f"<b>{name}</b> +{bonus} to hit, {dmg_str} {dtype}"
    if extra := atk.get("extra_damage"):
        edmg = extra.get("dice", "")
        emod = extra.get("modifier", 0)
        etype = extra.get("type", "")
        line += f" + {edmg}{'+' + str(emod) if emod else ''} {etype}"
    if cond := atk.get("apply_condition_on_hit"):
        line += (
            f" → on hit: DC {cond.get('save_dc', '?')} "
            f"{cond.get('save_ability', '?').upper()} vs {cond.get('condition', '?')}"
        )
    if rider := atk.get("rider_on_hit"):
        line += f" → {rider}"
    return line


def _save_phrase(save: dict[str, Any] | None) -> str:
    if not save:
        return ""
    dc = save.get("dc", "?")
    abil = save.get("ability", "?")
    on_save = save.get("on_save", "")
    s = f"DC {dc} {abil} save"
    if on_save:
        s += f" ({on_save} on save)"
    return s


def _trigger_phrase(trig: dict[str, Any] | None) -> str:
    if not trig:
        return ""
    scope = trig.get("scope", "")
    event = trig.get("event", "")
    match = trig.get("match", "")
    parts = []
    if scope and event:
        parts.append(f"{scope}/{event}")
    if match:
        parts.append(f'"{match}"')
    return " — ".join(parts)


def _header(spec: dict[str, Any]) -> str:
    name = spec.get("action", "?").replace("_", " ")
    atype = spec.get("type", "?")
    recharge = spec.get("recharge")
    range_ = spec.get("range")
    area = spec.get("area")
    bits = [f"<b>{name}</b>", f"<i>{atype}</i>"]
    if recharge:
        bits.append(f"recharge {recharge}+")
    if range_:
        bits.append(f"range {range_}")
    if area:
        bits.append(f"area {area}")
    if slots := spec.get("slots"):
        bits.append(f"slots {slots.get('count', '?')}/{slots.get('count', '?')} ({slots.get('refresh', '?')})")
    return " · ".join(bits)


def format_action_info(spec: dict[str, Any]) -> str:
    """Produce a single HTML block describing this action's mechanics.

    Suitable for `tab._append_log()`. Returns plain HTML (no <html>/<body>
    wrappers) — the QTextEdit-style log renders inline tags.
    """
    lines: list[str] = []
    lines.append(f"<span style='color:#cdb4ff'>ℹ {_header(spec)}</span>")

    atype = spec.get("type", "")

    if verbs := spec.get("verbs"):
        verb_str = ", ".join(verbs)
        lines.append(f"<span style='color:#7d8590'>verbs:</span> {verb_str}")

    if atype in ("multiattack", "single_attack"):
        for atk in spec.get("attacks", []) or []:
            lines.append(_attack_line(atk))
        if pre := spec.get("pre_save"):
            lines.append(f"<span style='color:#ffb86b'>pre-attack save:</span> {pre}")
        if prereq := spec.get("prerequisite"):
            lines.append(f"<span style='color:#7d8590'>prereq:</span> {prereq}")

    elif atype == "area":
        dmg = spec.get("damage", {}) or {}
        dmg_line = f"<b>{dmg.get('dice', '?d?')}</b> {dmg.get('type', '')}"
        save_line = _save_phrase(spec.get("save"))
        if save_line:
            dmg_line += f" — {save_line}"
        lines.append(dmg_line)

    elif atype == "utility":
        if roll := spec.get("roll"):
            label = roll.get("label", "Check")
            dice = roll.get("dice", "1d20")
            mod = roll.get("modifier", 0)
            mod_str = f"+{mod}" if mod >= 0 else str(mod)
            lines.append(f"<b>{label}</b>: {dice}{mod_str}")
            if notes := roll.get("notes"):
                lines.append(f"<span style='color:#7d8590'>{notes}</span>")
        if effect := spec.get("effect"):
            lines.append(effect)

    elif atype == "reaction":
        kind = spec.get("reaction_kind", "damage")
        lines.append(f"<span style='color:#7d8590'>reaction ({kind}):</span> {_trigger_phrase(spec.get('trigger'))}")
        if kind == "damage":
            dmg = spec.get("damage", {}) or {}
            dmg_line = f"<b>{dmg.get('dice', '?d?')}</b> {dmg.get('type', '')}"
            save_line = _save_phrase(spec.get("attacker_save"))
            if save_line:
                dmg_line += f" — attacker {save_line}"
            lines.append(dmg_line)
        else:
            if effect := spec.get("effect"):
                lines.append(effect)

    # Narration goes last — italic, dim, set off from the mechanics.
    if narration := spec.get("narration"):
        lines.append(f"<i style='color:#7d8590'>{narration}</i>")

    return "<br/>".join(lines)
