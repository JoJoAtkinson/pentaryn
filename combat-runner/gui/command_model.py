"""Parsed-command data model — the contract between dispatcher and main_window."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

EffectKind = Literal["action", "amount", "condition", "hit", "undo"]


@dataclass
class Effect:
    """One effect group parsed from a command's <stream>."""
    kind: EffectKind
    # kind == "action"
    action_token: str = ""              # "2" (panel #) or "cleave" (name)
    # kind == "amount"
    amount: int = 0
    amount_tags: dict[str, str] = field(default_factory=dict)  # facet -> canonical
    member: int | None = None           # mob member (from m<n>), attaches to an amount
    # kind == "condition"
    condition: str = ""
    duration: int | None = None         # None -> caller applies default (1 round)
    forced_condition: bool = False      # True when written with the @ escape hatch
    # kind in ("hit", "undo") -> no extra fields


CommandKind = Literal["command", "set_target", "unparseable", "note", "reorder", "quit"]


@dataclass
class ParsedCommand:
    kind: CommandKind
    raw: str = ""
    target_ids: list[str] = field(default_factory=list)  # explicit ids; may contain "0"
    use_current: bool = False           # True when <who> resolved to the current target
    effects: list[Effect] = field(default_factory=list)
    # kind == "note"
    note_text: str = ""
    # kind == "reorder"
    reorder_slugs: list[str] = field(default_factory=list)
    # kind in ("quit",) -> no extra fields
