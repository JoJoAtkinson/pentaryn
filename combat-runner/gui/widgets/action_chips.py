"""Action chip grid — clickable action cards for the active NPC.

Each chip shows its panel hotkey number + action name + a verb hint. Clicking
emits `chip_clicked(action_name)`. USED actions render greyed-out and don't emit
on click. Chips render in the order they are passed in — the caller supplies the
canonical surface order (NPC-specific actions first, then `scope: "global"`
ones), which is also the order the panel hotkey numbers index. Global actions
are visually segregated under a divider; their numbers continue from the
NPC-specific block.

The grid uses a 2-column flow layout (configurable via cols arg).
"""

from __future__ import annotations

from typing import Any

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QFrame,
    QGridLayout,
    QLabel,
    QMenu,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from ..action_numbering import GLOBAL_ACTION_BASE


class ActionChip(QFrame):
    """One clickable action card. Emits clicked(action_name) on press."""

    clicked = Signal(str)  # action name
    # Right-click context-menu signals — listened to by NPCTab so the heavy
    # lifting (DB lookup, dialog construction) stays out of this widget.
    show_narration_requested = Signal(str)  # action_name
    toggle_used_requested = Signal(str)     # action_name
    edit_spec_requested = Signal(str)       # action_name

    def __init__(
        self,
        action_name: str,
        verbs: list[str],
        is_used: bool = False,
        is_global: bool = False,
        meta: str | None = None,  # e.g. "range 30/60 ft" or "recharge 5+"
        narration: str | None = None,
        action_type: str | None = None,
        number: int | None = None,  # 1-based panel hotkey number
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.action_name = action_name
        self.is_used = is_used
        self.is_global = is_global
        self.number = number
        self.narration = narration or ""
        self.action_type = action_type or ""

        self.setObjectName("ActionChip")
        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.setCursor(Qt.CursorShape.PointingHandCursor if not is_used else Qt.CursorShape.ArrowCursor)
        self.setProperty("used", is_used)
        self.setProperty("global_action", is_global)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 6, 8, 6)
        layout.setSpacing(2)

        name_label = QLabel(self._format_name())
        name_label.setObjectName("ActionChipName")
        name_label.setStyleSheet("font-weight: 600; color: #ffffff;")
        layout.addWidget(name_label)

        verbs_text = ", ".join(verbs[:5])  # cap to first 5 to keep chip tight
        if meta:
            verbs_text = f"{verbs_text} · {meta}" if verbs_text else meta
        if verbs_text:
            verbs_label = QLabel(verbs_text)
            verbs_label.setObjectName("ActionChipVerbs")
            verbs_label.setStyleSheet("color: #6c8eba; font-size: 10px;")
            verbs_label.setWordWrap(True)
            layout.addWidget(verbs_label)

        # Visual state for used
        if is_used:
            self.setStyleSheet("ActionChip { background: #14171b; }")
            name_label.setStyleSheet("font-weight: 600; color: #6c8eba; text-decoration: line-through;")

    def _format_name(self) -> str:
        # snake_case → Title Case for display, prefixed with the panel hotkey
        # number so the DM can see what to type (e.g. "1 · Tail Sweep").
        name = self.action_name.replace("_", " ").title()
        if self.number is not None:
            return f"{self.number} · {name}"
        return name

    def mousePressEvent(self, event) -> None:  # noqa: N802 (Qt API)
        if event.button() == Qt.MouseButton.LeftButton and not self.is_used:
            self.clicked.emit(self.action_name)
        super().mousePressEvent(event)

    def contextMenuEvent(self, event) -> None:  # noqa: N802 (Qt API)
        """Right-click → small actions menu. Lets the DM peek at the full
        narration without firing the action, manually flip the USED state
        for recharge-y actions, or jump to the spec editor (deferred — emits
        a signal for the host to handle)."""
        menu = QMenu(self)

        if self.narration:
            show_narr = QAction("Show full narration", menu)
            show_narr.triggered.connect(lambda: self.show_narration_requested.emit(self.action_name))
            menu.addAction(show_narr)

        toggle_label = "Mark AVAILABLE" if self.is_used else "Mark USED"
        toggle_used = QAction(toggle_label, menu)
        toggle_used.triggered.connect(lambda: self.toggle_used_requested.emit(self.action_name))
        menu.addAction(toggle_used)

        menu.addSeparator()
        edit = QAction("Edit spec…", menu)
        edit.triggered.connect(lambda: self.edit_spec_requested.emit(self.action_name))
        menu.addAction(edit)

        menu.exec(event.globalPos())


class ActionChipGrid(QWidget):
    """Container that arranges ActionChip widgets in a 2-column grid.
    Per-NPC actions render first; global actions go in a second labeled section."""

    chip_clicked = Signal(str)  # forwards the clicked chip's action name
    # Context-menu forward signals
    show_narration_requested = Signal(str)
    toggle_used_requested = Signal(str)
    edit_spec_requested = Signal(str)

    def __init__(self, cols: int = 2, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._cols = cols
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(0, 0, 0, 0)
        self._layout.setSpacing(8)
        self._chips: list[ActionChip] = []
        self._slot_remaining_by_action: dict[str, int] = {}

    def set_actions(
        self,
        actions: list[dict[str, Any]],
        used_actions: set[str] | None = None,
        slot_remaining: dict[str, int] | None = None,
    ) -> None:
        """Populate the grid from a list of action summary dicts.

        Each dict needs: `action` (str), `verbs` (list[str]). Optional:
        `scope` (str, "global" segregates under a divider), `range`, `area`,
        `recharge`, `prerequisite` (any of these surface as meta text under
        the verbs).

        Chips render in the given list order — the caller supplies the
        canonical surface order, which is also the order the panel hotkey
        numbers index. Each chip is labelled with its 1-based number; the
        global block's numbers continue from the NPC-specific block.
        """
        used_actions = used_actions or set()
        self._slot_remaining_by_action = slot_remaining or {}
        # Clear existing chips
        while self._layout.count():
            item = self._layout.takeAt(0)
            if w := item.widget():
                w.deleteLater()
        self._chips.clear()

        # Split into NPC-specific vs global while PRESERVING the incoming
        # order — the caller already sorted; re-sorting here would desync the
        # chip numbers from the panel hotkeys.
        per_npc: list[dict[str, Any]] = []
        globals_: list[dict[str, Any]] = []
        for a in actions:
            if a.get("scope") == "global":
                globals_.append(a)
            else:
                per_npc.append(a)

        # Render per-NPC actions first, numbered from 1.
        if per_npc:
            self._add_grid_section(per_npc, used_actions, start_number=1)

        # Then a separator + globals, on the fixed GLOBAL_ACTION_BASE numbers
        # (111, 112, …) — the same on every NPC's tab.
        if globals_:
            if per_npc:
                divider = QLabel("— Global actions —")
                divider.setStyleSheet("color: #6c8eba; font-size: 10px; padding-top: 8px;")
                divider.setAlignment(Qt.AlignmentFlag.AlignCenter)
                self._layout.addWidget(divider)
            self._add_grid_section(
                globals_, used_actions,
                start_number=GLOBAL_ACTION_BASE, is_global=True)

        self._layout.addStretch(1)

    def _add_grid_section(
        self,
        items: list[dict[str, Any]],
        used: set[str],
        start_number: int,
        is_global: bool = False,
    ) -> None:
        grid_host = QWidget(self)
        grid = QGridLayout(grid_host)
        grid.setContentsMargins(0, 0, 0, 0)
        grid.setSpacing(6)

        for i, a in enumerate(items):
            r, c = divmod(i, self._cols)
            meta = (
                a.get("range")
                or a.get("area")
                or self._format_trigger(a.get("trigger"))
                or a.get("prerequisite")
            )
            if a.get("recharge") is not None:
                meta = f"recharge {a['recharge']}+" if meta is None else f"{meta} · recharge {a['recharge']}+"
            # Slot indicator (streamline #6). The grid receives the per-action
            # remaining-slot count via `slot_remaining_by_action`; falls back
            # to slots.count for the "starting" display.
            slot_cfg = a.get("slots") or {}
            if isinstance(slot_cfg, dict) and slot_cfg.get("count"):
                remaining = self._slot_remaining_by_action.get(a["action"], slot_cfg["count"])
                slot_str = f"{remaining}/{slot_cfg['count']} {slot_cfg.get('refresh', 'long_rest').replace('_', ' ')}"
                meta = slot_str if meta is None else f"{meta} · {slot_str}"
            chip = ActionChip(
                action_name=a["action"],
                verbs=a.get("verbs", []),
                is_used=a["action"] in used,
                is_global=is_global,
                meta=meta,
                narration=a.get("narration_preview") or a.get("narration"),
                action_type=a.get("type"),
                number=start_number + i,
                parent=grid_host,
            )
            chip.show_narration_requested.connect(self.show_narration_requested.emit)
            chip.toggle_used_requested.connect(self.toggle_used_requested.emit)
            chip.edit_spec_requested.connect(self.edit_spec_requested.emit)
            chip.clicked.connect(self.chip_clicked.emit)
            self._chips.append(chip)
            grid.addWidget(chip, r, c)

        self._layout.addWidget(grid_host)

    def chips(self) -> list[ActionChip]:
        """Test-only: return the rendered chip widgets in render order."""
        return list(self._chips)

    @staticmethod
    def _format_trigger(trig) -> str | None:
        """Render an action's `trigger` block as a chip-meta string.
        Accepts either the new `{scope, event, match}` dict shape or the
        legacy free-form string. None → returns None (no meta added)."""
        if trig is None:
            return None
        if isinstance(trig, dict):
            scope = trig.get("scope", "self")
            match = trig.get("match", "")
            return f"trigger ({scope}): {match}" if match else f"trigger ({scope})"
        return f"trigger: {trig}"
