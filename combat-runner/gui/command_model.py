"""Parsed-command data model — the contract between dispatcher and main_window."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

EffectKind = Literal["action", "amount", "condition", "hit", "save", "undo"]


@dataclass
class Effect:
    """One effect group parsed from a command's <stream>."""
    kind: EffectKind
    # kind == "action"
    action_token: str = ""              # "2" (panel #) or "cleave" (name)
    # kind == "amount"
    amount: int = 0
    amount_tags: dict[str, str] = field(default_factory=dict)  # facet -> canonical
    # mob-member selection, from an `m<...>` modifier (attaches to the next
    # effect — an `amount` to be applied per-member, or a `condition` so the
    # applier can REJECT member-scoped conditions). Contract:
    #   None      -> no `m` modifier given; use default routing
    #   []        -> `m` alone (no digits) -> ALL alive members
    #   [1, 2]    -> an explicit member set (1-indexed member numbers)
    # `m<n>` with one digit -> [n]; `m<digits>` with 2+ digits -> a digit-run
    # member SET via targeting.split_runs (`m12` -> [1,2], `m11` -> [11]).
    members: list[int] | None = None
    # kind == "condition"
    condition: str = ""
    duration: int | None = None         # None -> caller applies default (1 round)
    forced_condition: bool = False      # True when written with the @ escape hatch
    # kind in ("hit", "save", "undo") -> no extra fields
    # `save` resolves a pending effect as a save/miss — confirms the assumed
    # minimum (already applied) and marks the pending record resolved + logs.


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
