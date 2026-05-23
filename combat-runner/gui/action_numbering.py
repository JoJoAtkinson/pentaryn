"""Panel hotkey numbering for the action surface — pure, no Qt.

The action surface is a canonically-ordered list of action dicts: an NPC's own
actions first, then global / universal ones (`scope == "global"`).

NPC-specific actions number **1, 2, 3, …** by their order among themselves.
Global actions get **fixed** numbers from ``GLOBAL_ACTION_BASE`` (111, 112,
113, …): the same global action is the same number on every combatant's tab —
easy to memorise — and the 111+ range never collides with an NPC's 1..N.
"""

from __future__ import annotations

# Global / universal actions are numbered from here. Chosen well clear of any
# NPC-specific number, and easy to type (a run of 1s).
GLOBAL_ACTION_BASE = 111


def _is_global(action: dict) -> bool:
    return action.get("scope") == "global"


def panel_number(actions: list[dict], index: int) -> int:
    """The hotkey number for the action at `index` in the surface list.

    NPC-specific actions count 1, 2, 3, …; global actions count
    GLOBAL_ACTION_BASE, +1, +2, … — each by its order among its own kind.
    """
    action = actions[index]
    preceding = actions[:index]
    if _is_global(action):
        return GLOBAL_ACTION_BASE + sum(1 for a in preceding if _is_global(a))
    return 1 + sum(1 for a in preceding if not _is_global(a))


def resolve_panel_number(actions: list[dict], number: int) -> dict | None:
    """The action dict a typed hotkey `number` refers to, or None if out of range."""
    if number >= GLOBAL_ACTION_BASE:
        idx = number - GLOBAL_ACTION_BASE
        globals_ = [a for a in actions if _is_global(a)]
        return globals_[idx] if 0 <= idx < len(globals_) else None
    idx = number - 1
    npc = [a for a in actions if not _is_global(a)]
    return npc[idx] if 0 <= idx < len(npc) else None
