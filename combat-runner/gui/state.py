"""Per-tab state model.

Each combat tab has one NPCState. EncounterState owns the collection of tabs
plus the cross-tab bits (round counter, log path).

This module is pure Python — no Qt imports — so unit tests run instantly and
the dispatcher / event bus can mutate state without dragging in the GUI layer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


# ─────────────────────────── condition catalog ───────────────────────────
# D&D 5.5e standard conditions plus a few app-specific markers (dodging,
# grappling-target). The GUI uses this list to populate the @ autocomplete.
STANDARD_CONDITIONS: tuple[str, ...] = (
    "blinded",
    "charmed",
    "deafened",
    "frightened",
    "grappled",
    "incapacitated",
    "invisible",
    "paralyzed",
    "petrified",
    "poisoned",
    "prone",
    "restrained",
    "stunned",
    "unconscious",
    # App-specific
    "dodging",
    "concentrating",
    "bloodied",  # auto-applied at HP <= half max
)


# ─────────────────────────── NPC state ───────────────────────────

@dataclass
class NPCState:
    """Mutable per-tab combat state for one NPC (or one mob)."""

    slug: str
    name: str
    max_hp: int
    ac: int
    speed: str  # free-form text e.g. "50 ft., climb 40 ft."
    cr: float
    immunities: tuple[str, ...] = ()

    # Single-creature defaults; mob support extends these.
    count: int = 1
    member_hp: list[int] = field(default_factory=list)

    # Conditions (set; order doesn't matter except for display).
    conditions: set[str] = field(default_factory=set)
    # Optional countdown per condition. Missing key = indefinite. Integer
    # values are decremented on round advance; when they hit 0 the condition
    # auto-removes. Manual removal (toggle off) clears the entry too — so a
    # mid-fight "remove paralysis" spell works regardless of duration.
    condition_durations: dict[str, int] = field(default_factory=dict)

    # Reaction lifecycle (one reaction per NPC per round).
    reaction_used: bool = False

    # Recharge-ability tracking: action_name → "AVAILABLE" | "USED".
    recharges: dict[str, str] = field(default_factory=dict)
    # Per-action slot counters (streamline #6). Authoritative for "Once per day",
    # "3/day", etc. Map: action_name → remaining_count. A missing key means the
    # action has no `slots` block. MainWindow._seed_slots_remaining pre-fills
    # this dict from the action DB at encounter construction, so every
    # slots-bearing action is present (at full count) before its first use.
    slots_remaining: dict[str, int] = field(default_factory=dict)

    # Player-as-combatant fields (Task 1.1). All have defaults so existing NPC
    # callers need no changes.
    kind: str = "npc"            # "npc" or "pc"
    id: str = ""                 # permanent repeated-digit label ("1", "22", etc.)
    in_melee: bool = False       # set True when actor/target of a melee-tagged command
    pinned_notes: list[str] = field(default_factory=list)  # free-form tracked state

    # Action chips that are USED for the current turn (e.g. bonus actions).
    # Refreshed at start of NPC's turn (or at round advance via the meta-controller).
    bonus_used: bool = False

    # Per-NPC turn counter (informational; the round counter is on EncounterState).
    turn_taken_this_round: bool = False

    def __post_init__(self) -> None:
        # Initialize per-member HP for mobs. For count=1, member_hp has a single slot.
        if not self.member_hp:
            self.member_hp = [self.max_hp] * max(1, self.count)
        elif len(self.member_hp) != self.count:
            # Defensive: resize if explicit member_hp was given but doesn't match count.
            self.member_hp = (
                self.member_hp + [self.max_hp] * (self.count - len(self.member_hp))
            )[: self.count]

    # ──── HP queries ────

    @property
    def hp(self) -> int:
        """Sum of per-member HP. For single-creature NPCs this is member_hp[0]."""
        return sum(self.member_hp)

    @property
    def max_total_hp(self) -> int:
        return self.max_hp * self.count

    @property
    def is_dead(self) -> bool:
        return all(h <= 0 for h in self.member_hp)

    @property
    def alive_count(self) -> int:
        return sum(1 for h in self.member_hp if h > 0)

    @property
    def is_bloodied(self) -> bool:
        return 0 < self.hp <= self.max_total_hp // 2

    def alive_member_indices(self) -> list[int]:
        """1-indexed member numbers that are still alive (highest first)."""
        return [i + 1 for i, h in enumerate(self.member_hp) if h > 0][::-1]

    # ──── HP mutations ────

    def apply_damage(self, amount: int, member: int | None = None) -> dict[str, Any]:
        """Apply damage to a specific member or route to the default target.

        Default routing: highest-numbered alive member (so the segmented HP bar
        visually drains right→left). Damage that would reduce HP below 0 is clamped
        to 0 (5e excess damage is for massive-damage rules; not modeled here).

        Returns a delta dict for logging: {member, before, after, killed: bool}.
        """
        if amount < 0:
            raise ValueError("apply_damage amount must be non-negative; use apply_heal for positive deltas")

        target_idx = self._resolve_damage_target(member)
        if target_idx is None:
            return {"member": None, "before": 0, "after": 0, "killed": False, "skipped": "no alive members"}

        before = self.member_hp[target_idx]
        was_bloodied = self.is_bloodied
        after = max(0, before - amount)
        self.member_hp[target_idx] = after
        killed = before > 0 and after == 0
        # Auto-apply 'bloodied' marker on the NPC (whole-NPC threshold)
        if self.is_bloodied:
            self.conditions.add("bloodied")
        became_bloodied = (not was_bloodied) and self.is_bloodied
        return {
            "member": target_idx + 1,  # 1-indexed for display
            "before": before,
            "after": after,
            "killed": killed,
            "became_bloodied": became_bloodied,
        }

    def apply_heal(self, amount: int, member: int | None = None) -> dict[str, Any]:
        if amount < 0:
            raise ValueError("apply_heal amount must be non-negative")

        target_idx = self._resolve_heal_target(member)
        if target_idx is None:
            return {"member": None, "before": 0, "after": 0, "skipped": "no member to heal"}

        before = self.member_hp[target_idx]
        if before <= 0:
            # 5e rule: healing a dead creature requires Revivify or similar; modeled
            # here as a no-op unless the DM explicitly resurrects via set_hp.
            return {"member": target_idx + 1, "before": 0, "after": 0, "skipped": "dead member"}
        after = min(self.max_hp, before + amount)
        self.member_hp[target_idx] = after
        if not self.is_bloodied and "bloodied" in self.conditions:
            self.conditions.discard("bloodied")
        return {"member": target_idx + 1, "before": before, "after": after}

    def set_member_hp(self, member: int, hp: int) -> None:
        """Force-set a specific member's HP (1-indexed). For meta-controller use."""
        idx = member - 1
        if not (0 <= idx < self.count):
            raise IndexError(f"member {member} out of range (count={self.count})")
        self.member_hp[idx] = max(0, min(self.max_hp, hp))
        # Bloodied recalc
        if self.is_bloodied:
            self.conditions.add("bloodied")
        else:
            self.conditions.discard("bloodied")

    def _resolve_damage_target(self, member: int | None) -> int | None:
        """Return 0-indexed member idx for damage routing. None if no valid target."""
        if member is not None:
            idx = member - 1
            if 0 <= idx < self.count:
                return idx  # explicit target, even if already dead (caller handles)
            return None
        # Default: highest-numbered alive (so bar drains right→left)
        alive = [i for i, h in enumerate(self.member_hp) if h > 0]
        return alive[-1] if alive else None

    def _resolve_heal_target(self, member: int | None) -> int | None:
        if member is not None:
            idx = member - 1
            if 0 <= idx < self.count:
                return idx
            return None
        # Heal lowest-numbered alive (heals the front first)
        alive = [i for i, h in enumerate(self.member_hp) if h > 0]
        return alive[0] if alive else None

    # ──── conditions ────

    def add_condition(self, name: str, duration: int | None = None) -> bool:
        """Returns True if newly added, False if already present (in which
        case the existing duration is *not* overwritten — caller should call
        set_condition_duration explicitly to refresh).
        `duration=None` means indefinite (no auto-decrement)."""
        name = name.lower().strip()
        if not name:
            return False
        if name in self.conditions:
            return False
        self.conditions.add(name)
        if duration is not None and duration > 0:
            self.condition_durations[name] = int(duration)
        return True

    def remove_condition(self, name: str) -> bool:
        name = name.lower().strip()
        if name in self.conditions:
            self.conditions.discard(name)
            self.condition_durations.pop(name, None)
            return True
        return False

    def toggle_condition(self, name: str, duration: int | None = None) -> bool:
        """Toggle a condition; returns the new state (True=present).
        `duration` only applies when applying (not removing); ignored on toggle-off."""
        name = name.lower().strip()
        if name in self.conditions:
            self.conditions.discard(name)
            self.condition_durations.pop(name, None)
            return False
        self.conditions.add(name)
        if duration is not None and duration > 0:
            self.condition_durations[name] = int(duration)
        return True

    def tick_condition_durations(self) -> list[str]:
        """Decrement every numeric duration by 1. Conditions that hit 0 are
        auto-removed. Returns the list of conditions that expired this tick
        (so the UI can log them)."""
        expired: list[str] = []
        for name in list(self.condition_durations.keys()):
            self.condition_durations[name] -= 1
            if self.condition_durations[name] <= 0:
                expired.append(name)
                self.condition_durations.pop(name, None)
                self.conditions.discard(name)
        return expired

    # ──── lifecycle ────

    def start_turn(self) -> None:
        """Refresh reaction + bonus action availability; mark turn taken."""
        self.reaction_used = False
        self.bonus_used = False
        self.turn_taken_this_round = True

    def end_round(self) -> None:
        """Clear the turn-taken flag (about to roll into a new round)."""
        self.turn_taken_this_round = False

    def mark_action_used(self, action: str) -> None:
        """Record that a recharge ability was used (will need a d6 to refresh)."""
        self.recharges[action] = "USED"

    def mark_action_available(self, action: str) -> None:
        self.recharges[action] = "AVAILABLE"

    def is_action_used(self, action: str) -> bool:
        return self.recharges.get(action) == "USED"


# ─────────────────────────── Encounter state ───────────────────────────

@dataclass
class EncounterState:
    """Top-level state: which encounter, which tabs, round counter, log path."""

    name: str  # encounter slug (matches the folder name)
    root: Path  # encounter root dir
    log_path: Path  # write target for the session log
    npcs: list[NPCState] = field(default_factory=list)
    round_num: int = 1
    active_tab_index: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def npc_by_slug(self, slug: str) -> NPCState | None:
        # Slugs aren't guaranteed unique when the user spawns duplicates;
        # tab_index uniquely identifies an instance.
        for npc in self.npcs:
            if npc.slug == slug:
                return npc
        return None

    def combatant_by_id(self, combatant_id: str) -> NPCState | None:
        """Look up a combatant by its permanent id label. Returns first match.

        Returns None immediately for an empty string — unassigned combatants
        all have ``id == ""`` so matching on an empty key would return an
        arbitrary unassigned combatant rather than a meaningful result.
        """
        if not combatant_id:
            return None
        for npc in self.npcs:
            if npc.id == combatant_id:
                return npc
        return None

    def npc_by_tab_index(self, idx: int) -> NPCState | None:
        if 0 <= idx < len(self.npcs):
            return self.npcs[idx]
        return None

    @property
    def active_npc(self) -> NPCState | None:
        return self.npc_by_tab_index(self.active_tab_index)

    def advance_round(self) -> None:
        """Round + 1. Refresh every NPC's reaction-used flag. Caller handles recharge rolls."""
        self.round_num += 1
        for npc in self.npcs:
            npc.reaction_used = False
            npc.bonus_used = False
            npc.turn_taken_this_round = False

    def set_round(self, round_num: int) -> None:
        """Set absolute round (e.g. LLM meta-controller correcting a mis-click)."""
        self.round_num = max(1, round_num)

    def reorder_tabs(self, new_slugs: list[str]) -> None:
        """Reorder NPCs by slug. Slugs not in the list keep their relative order at the end.
        If a listed slug doesn't exist, ignore it (don't raise — LLM-friendly)."""
        by_slug: dict[str, list[NPCState]] = {}
        for npc in self.npcs:
            by_slug.setdefault(npc.slug, []).append(npc)
        reordered: list[NPCState] = []
        # Take from each requested slug's bucket in order; duplicates per slug
        # are placed in their original relative order.
        for slug in new_slugs:
            bucket = by_slug.get(slug, [])
            if bucket:
                reordered.append(bucket.pop(0))
        # Append remaining (un-listed) NPCs in their original order.
        for npc in self.npcs:
            if npc not in reordered:
                reordered.append(npc)
        # Keep the active tab pointing at the same NPC instance after reorder.
        active = self.active_npc
        self.npcs = reordered
        if active is not None and active in self.npcs:
            self.active_tab_index = self.npcs.index(active)
        else:
            self.active_tab_index = 0


# ─────────────────────────── ID alphabet ───────────────────────────

def _id_alphabet() -> Iterator[str]:
    """Yields: '1','2',...,'9','0', '11','22',...,'99','00', '111',... indefinitely."""
    digit = 1
    while True:
        for d in "1234567890":
            yield d * digit
        digit += 1


def assign_combatant_ids(npcs: list[NPCState], reserved: set[str] | None = None) -> None:
    """Assign permanent id labels to any combatant whose id is empty "".
    Skips labels already claimed by reserved (e.g. player ids from party config).
    Mutates npcs in place; idempotent for combatants that already have an id.
    """
    reserved = reserved or set()
    taken = {n.id for n in npcs if n.id} | reserved
    gen = _id_alphabet()

    def _next_free() -> str:
        while True:
            label = next(gen)
            if label not in taken:
                taken.add(label)
                return label

    for npc in npcs:
        if not npc.id:
            npc.id = _next_free()


# ─────────────────────────── Serialization (LLM boundary) ───────────────────────────
# Used by the LLM meta-controller. Internal mutations skip this layer for speed.
# When the LLM asks for `update_state_json(patch)`, the caller rebuilds an
# EncounterState from the dict via `from_dict`. If reconstruction raises any
# Exception, the in-memory state is untouched and the LLM receives a structured
# error — that's the "schema enforcement" gate.

def _serialize_npc(npc: NPCState) -> dict[str, Any]:
    return {
        "slug": npc.slug,
        "name": npc.name,
        "max_hp": npc.max_hp,
        "ac": npc.ac,
        "speed": npc.speed,
        "cr": npc.cr,
        "immunities": list(npc.immunities),
        "count": npc.count,
        "member_hp": list(npc.member_hp),
        "conditions": sorted(npc.conditions),
        "condition_durations": dict(npc.condition_durations),
        "reaction_used": npc.reaction_used,
        "bonus_used": npc.bonus_used,
        "recharges": dict(npc.recharges),
        "slots_remaining": dict(npc.slots_remaining),
        "turn_taken_this_round": npc.turn_taken_this_round,
        "kind": npc.kind,
        "id": npc.id,
        "in_melee": npc.in_melee,
        "pinned_notes": list(npc.pinned_notes),
    }


def _deserialize_npc(d: dict[str, Any]) -> NPCState:
    required = ("slug", "name", "max_hp", "ac", "speed", "cr")
    for key in required:
        if key not in d:
            raise ValueError(f"NPC dict missing required key {key!r}")

    # Pre-construction validation: if both count and member_hp are explicitly
    # provided, they MUST agree. __post_init__ silently normalizes, but the LLM
    # boundary should reject ambiguous input.
    declared_count = d.get("count")
    declared_member_hp = d.get("member_hp")
    if declared_count is not None and declared_member_hp is not None:
        if len(declared_member_hp) != declared_count:
            raise ValueError(
                f"NPC {d.get('slug')!r}: member_hp len {len(declared_member_hp)} "
                f"!= count {declared_count}"
            )

    npc = NPCState(
        slug=str(d["slug"]),
        name=str(d["name"]),
        max_hp=int(d["max_hp"]),
        ac=int(d["ac"]),
        speed=str(d["speed"]),
        cr=float(d["cr"]),
        immunities=tuple(d.get("immunities", []) or []),
        count=int(d.get("count", 1) or 1),
        member_hp=list(d.get("member_hp", [])) or [],
        conditions=set(d.get("conditions", []) or []),
        condition_durations={k: int(v) for k, v in (d.get("condition_durations", {}) or {}).items() if isinstance(v, (int, float))},
        reaction_used=bool(d.get("reaction_used", False)),
        bonus_used=bool(d.get("bonus_used", False)),
        recharges=dict(d.get("recharges", {}) or {}),
        slots_remaining={k: int(v) for k, v in (d.get("slots_remaining", {}) or {}).items() if isinstance(v, (int, float))},
        turn_taken_this_round=bool(d.get("turn_taken_this_round", False)),
        kind=str(d.get("kind", "npc")),
        id=str(d.get("id", "")),
        in_melee=bool(d.get("in_melee", False)),
        pinned_notes=list(d.get("pinned_notes", []) or []),
    )
    # Belt-and-suspenders: post-construction sanity check (should be unreachable
    # given the pre-check above, but defends against future regressions).
    if len(npc.member_hp) != npc.count:
        raise ValueError(f"NPC {npc.slug!r}: member_hp len {len(npc.member_hp)} != count {npc.count}")
    return npc


def serialize_encounter(es: EncounterState) -> dict[str, Any]:
    """Full encounter state as a plain dict. Safe to json.dumps."""
    return {
        "name": es.name,
        "root": str(es.root),
        "log_path": str(es.log_path),
        "round_num": es.round_num,
        "active_tab_index": es.active_tab_index,
        "created_at": es.created_at.isoformat() if es.created_at else None,
        "npcs": [_serialize_npc(n) for n in es.npcs],
    }


def deserialize_encounter(d: dict[str, Any]) -> EncounterState:
    """Reconstruct an EncounterState from a serialized dict. Raises on any
    validation failure; callers should catch and present the error to the LLM."""
    required = ("name", "root", "log_path", "npcs")
    for key in required:
        if key not in d:
            raise ValueError(f"Encounter dict missing required key {key!r}")
    npcs = [_deserialize_npc(n) for n in d["npcs"]]
    created_at = d.get("created_at")
    if isinstance(created_at, str):
        created = datetime.fromisoformat(created_at)
    else:
        created = datetime.now(timezone.utc)
    es = EncounterState(
        name=str(d["name"]),
        root=Path(d["root"]),
        log_path=Path(d["log_path"]),
        npcs=npcs,
        round_num=int(d.get("round_num", 1)),
        active_tab_index=int(d.get("active_tab_index", 0)),
        created_at=created,
    )
    if es.active_tab_index < 0 or es.active_tab_index >= len(es.npcs):
        # Clamp rather than raise (LLM-friendly).
        es.active_tab_index = max(0, min(es.active_tab_index, max(0, len(es.npcs) - 1)))
    return es


def state_schema() -> dict[str, Any]:
    """Lightweight self-describing schema for the LLM. Not full JSON Schema —
    just a sketch of the expected shape with type hints. Cheap to ship in a
    system prompt or surface via a `get_state_schema()` tool."""
    return {
        "EncounterState": {
            "name": "string (encounter slug)",
            "root": "string (encounter folder path)",
            "log_path": "string (per-session log file path)",
            "round_num": "integer >= 1",
            "active_tab_index": "integer (0-indexed tab position)",
            "created_at": "ISO 8601 datetime string (optional)",
            "npcs": "list of NPCState dicts (order = tab order, left to right)",
        },
        "NPCState": {
            "slug": "string (matches NPC's .md file stem)",
            "name": "string (display name)",
            "max_hp": "integer (per-creature for mobs)",
            "ac": "integer",
            "speed": "string (free-form, e.g. '50 ft., climb 40 ft.')",
            "cr": "number (challenge rating)",
            "immunities": "list of strings (damage types)",
            "count": "integer >= 1 (mob member count)",
            "member_hp": "list of integers (length == count; element i = member (i+1)'s current HP)",
            "conditions": "list of strings (lowercase condition names)",
            "reaction_used": "bool (true if reaction spent this round)",
            "bonus_used": "bool (true if bonus action spent this turn)",
            "recharges": "dict of {action_name: 'USED'|'AVAILABLE'}",
            "turn_taken_this_round": "bool",
            "kind": "string ('npc' or 'pc')",
            "id": "string (permanent repeated-digit combatant label; '' = unassigned)",
            "in_melee": "bool (true if this combatant is currently in melee engagement)",
            "pinned_notes": "list of strings (free-form tracked state shown on the tab)",
        },
        "constraints": [
            "len(npcs[i].member_hp) must equal npcs[i].count",
            "0 <= active_tab_index < len(npcs)",
            "round_num >= 1",
            "max_hp > 0; ac > 0",
            "id must be '' or a repeated-digit string",
        ],
    }
