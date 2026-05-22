"""Pending-effect records + memento undo stack. Pure Python."""
from __future__ import annotations

from dataclasses import dataclass

from .state import EncounterState, deserialize_encounter, serialize_encounter

# Maximum number of undo snapshots retained; older snapshots are evicted FIFO.
_DEFAULT_UNDO_CAP = 50


@dataclass
class PendingEffect:
    """An applied-but-unconfirmed effect, kept so `hit` can upgrade it.

    `source` is a short label (the action name) so `apply_hit`'s match is
    unambiguous and the log/marker can name what is unresolved. `round` is the
    encounter round the effect was created in — a pending effect from a prior
    round is stale and is auto-cleared on round advance (spec §4).
    """
    combatant_id: str
    full_amount: int
    applied_amount: int
    kind: str            # "save" | "attack"
    resolved: bool = False
    source: str = ""     # action name that created this pending effect
    round: int = 0       # encounter round the effect was created in
    member: int | None = None  # mob-member index (1-indexed) the effect targets


class UndoStack:
    """Memento undo: a LIFO of full encounter snapshots (serialized dicts)."""

    def __init__(self, cap: int = _DEFAULT_UNDO_CAP) -> None:
        self._cap = cap
        self._snapshots: list[dict] = []

    def snapshot(self, state: EncounterState) -> None:
        self._snapshots.append(serialize_encounter(state))
        if len(self._snapshots) > self._cap:
            self._snapshots.pop(0)

    def undo(self) -> EncounterState | None:
        """Pop the most recent snapshot and rebuild it. None if empty."""
        if not self._snapshots:
            return None
        return deserialize_encounter(self._snapshots.pop())

    def discard_last(self) -> None:
        """Drop the most recent snapshot without rebuilding it.

        Used to undo a `snapshot()` call for a command that turned out to be a
        no-op — keeping the invariant 'one snapshot per *mutating* command'.
        """
        if self._snapshots:
            self._snapshots.pop()

    def peek(self) -> dict | None:
        """Return the most recent snapshot dict (not popped). None if empty."""
        return self._snapshots[-1] if self._snapshots else None
