"""Pending-effect records + memento undo stack. Pure Python."""
from __future__ import annotations

from dataclasses import dataclass
from gui.state import EncounterState, deserialize_encounter, serialize_encounter


@dataclass
class PendingEffect:
    """An applied-but-unconfirmed effect, kept so `hit` can upgrade it."""
    combatant_id: str
    full_amount: int
    applied_amount: int
    kind: str            # "save" | "attack"
    resolved: bool = False


class UndoStack:
    """Memento undo: a LIFO of full encounter snapshots (serialized dicts)."""

    def __init__(self, cap: int = 50) -> None:
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
