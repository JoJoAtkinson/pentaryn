"""NPCTab — one tab in the main window.

Composes the sheet panel (left: status + HP bar + action chips) and the console
panel (right: combat log + input). Per-NPC state lives in `self.npc_state`
(a `gui.state.NPCState`).

This module is the thinnest possible wiring between the widgets and the state.
Command parsing is delegated to `gui.dispatcher.parse`, which returns a
`ParsedCommand`; the tab forwards it to `MainWindow._on_command` via the
`command_requested` signal. The actual roll mechanics still happen in
`scripts.dnd_roller.roll_combat_action`.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any

from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSizePolicy,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from .command_model import Effect, ParsedCommand
from .dispatcher import parse as parse_command
from .event_bus import (
    Event,
    EventBus,
    action_event,
    bloodied_event,
    condition_event,
    damage_event,
    death_event,
    heal_event,
)
from .state import NPCState
from .widgets.action_chips import ActionChipGrid
from .widgets.command_input import CommandInput
from .widgets.hp_bar import HPBar
from .widgets.suggestion_bar import Suggestion, SuggestionBar

# Lazy import of the dice/action runner — scripts/dnd_roller.py is the
# authoritative implementation. Importing on first use keeps the GUI launch
# snappy (chromadb etc. is heavy at import time even if we don't need it).
_dnd_roller = None


# ───────── slot refresh-mode semantics ─────────
#
# A combat action's `slots` block declares a `refresh` mode. The validator
# (scripts/combat_actions_db.py) accepts: round | turn | encounter |
# short_rest | long_rest. The shipped data only uses `round`, `short_rest`
# and `long_rest`, but we honor all five here so new data never silently
# fails to refill.
#
# Pragmatic at-the-table semantics for a per-encounter tool:
#   - `round` / `turn`  → refill at the start of every round (mid-combat).
#   - `encounter`/`short_rest`/`long_rest` → these recharge on a rest, which
#     the table normally takes BEFORE a fresh combat. So they arrive full at
#     encounter start (seeded by app/state) and must NOT refill mid-encounter.
#
# `_ROUND_REFRESH_MODES` is the set whose slots the round-event handler is
# allowed to top up. Anything outside it is intentionally left untouched.
_ROUND_REFRESH_MODES = frozenset({"round", "turn"})


# ───────── background dice-cache pre-warm ─────────

# Keep the disk-backed quantum-RNG cache above this many numbers. A typical
# combat action burns well under a dozen; staying above the low-water mark
# means the synchronous roll on the UI thread always hits a warm cache and
# never has to do a (blocking) network fetch.
_CACHE_LOW_WATER = 64
# Target fill level for a pre-warm fetch — a full quantum batch is 1024.
_CACHE_REFILL_TARGET = 256

# Shared thread pool for cache pre-warm workers. One global pool (not one per
# tab) so N tabs don't spawn N redundant fetches; capped at a single thread so
# concurrent fetches can't race on the roller's module-level cache list.
_PREWARM_POOL: QThreadPool | None = None
# Set while a pre-warm worker is in flight, so we don't queue duplicates.
_PREWARM_IN_FLIGHT = False


def _prewarm_pool() -> QThreadPool:
    global _PREWARM_POOL
    if _PREWARM_POOL is None:
        _PREWARM_POOL = QThreadPool()
        _PREWARM_POOL.setMaxThreadCount(1)
    return _PREWARM_POOL


class _PrewarmSignals(QObject):
    """Signals for a cache pre-warm worker. A QRunnable can't own signals, so
    they live on this QObject (mirrors suggestion_driver._WorkerSignals)."""

    done = Signal(bool)  # success flag — emitted on the GUI thread


class _CachePrewarmWorker(QRunnable):
    """Off-thread top-up of the dnd_roller quantum-RNG cache.

    Runs `_ensure_numbers` (async) inside a private event loop on a worker
    thread. If the network is unavailable the roller falls back to local RNG
    internally; either way this never blocks the UI thread. The synchronous
    roll path stays synchronous — it just always finds a warm cache.
    """

    def __init__(self, target: int, signals: _PrewarmSignals) -> None:
        super().__init__()
        self._target = target
        self._signals = signals
        self.setAutoDelete(True)

    def run(self) -> None:  # executes on a pool worker thread
        ok = False
        try:
            roller = _get_roller()
            ok = bool(asyncio.run(roller._ensure_numbers(self._target)))
        except Exception:  # noqa: BLE001 — offline / fetch failure must not crash
            ok = False
        try:
            self._signals.done.emit(ok)
        except RuntimeError:
            # Signals object already torn down (app closing) — nothing to do.
            pass


def _get_roller():
    """Lazy import scripts/dnd_roller; returns the module."""
    global _dnd_roller
    if _dnd_roller is None:
        repo_root = Path(__file__).resolve().parents[2]
        scripts_dir = repo_root / "scripts"
        if str(scripts_dir) not in sys.path:
            sys.path.insert(0, str(scripts_dir))
        spec = importlib.util.spec_from_file_location(
            "dnd_roller", scripts_dir / "dnd_roller.py"
        )
        _dnd_roller = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_dnd_roller)
    return _dnd_roller


# ───────── action-output markdown → HTML ─────────

_DICE_FONT_CSS = "font-family: 'DnD Dice', 'SF Mono', Menlo, monospace;"

_FENCED_RE = re.compile(r"```(.*?)```", re.DOTALL)
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_ITAL_STAR_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_ITAL_UNDER_RE = re.compile(r"_(.+?)_")


def _escape_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _render_action_markdown(text: str) -> str:
    """Convert the dnd_roller action-output markdown to display HTML.

    Strategy:
      1. Split on ``` fences. Even-indexed chunks are prose, odd-indexed are code.
      2. Inside code: HTML-escape, wrap in <pre> with the dice-font stack so
         emoji-as-glyphs render with the custom font.
      3. Outside code: HTML-escape, then apply bold/italic inline regex
         replacements, then convert newlines to <br>.
    """
    parts = _FENCED_RE.split(text)
    out: list[str] = []
    for i, chunk in enumerate(parts):
        if i % 2 == 1:
            # fenced code block — drop a leading newline if present, escape, wrap
            code = chunk.lstrip("\n").rstrip("\n")
            out.append(
                f'<pre style="{_DICE_FONT_CSS} margin:4px 0; padding:6px 8px; '
                f'background:#0e1116; border-left:3px solid #448aff;">'
                f"{_escape_html(code)}</pre>"
            )
        else:
            inline = _escape_html(chunk)
            inline = _BOLD_RE.sub(r"<b>\1</b>", inline)
            inline = _ITAL_STAR_RE.sub(r"<i>\1</i>", inline)
            inline = _ITAL_UNDER_RE.sub(r"<i>\1</i>", inline)
            inline = inline.replace("\n", "<br>")
            out.append(
                f'<div style="{_DICE_FONT_CSS} font-size:12px;">{inline}</div>'
            )
    return "".join(out)


_PLAYER_ACTIONS = [
    "Cast", "Attack", "Dodge", "Dash", "Disengage", "Help", "Hide", "Ready", "Retreat"
]


class NPCTab(QWidget):
    """One combat tab for one NPC instance."""

    # Emitted whenever the NPC's state changes (HP, conditions, recharges).
    # The main window listens to update tab titles + fire suggestion refresh.
    state_changed = Signal()

    # Emitted on `/quit`.
    quit_requested = Signal()

    # Emitted on every command submit. Carries the parsed `ParsedCommand`
    # (kind ∈ command|set_target|unparseable). MainWindow._on_command handles
    # snapshotting, target resolution, effect application, and the LLM fallback.
    command_requested = Signal(object)  # ParsedCommand

    # Emitted after any state-changing command completes. Carries the raw input
    # text + a snapshot of the tab's NPCState. Callers can use this to build an
    # audit trail or show a per-command review prompt.
    review_needed = Signal(str, object)  # (raw_command, npc_state snapshot)

    def __init__(
        self,
        npc_state: NPCState,
        actions: list[dict[str, Any]],
        log_path: Path,
        parent: QWidget | None = None,
        event_bus: EventBus | None = None,
    ) -> None:
        super().__init__(parent)
        self.npc_state = npc_state
        self.actions = actions  # action summaries from combat_actions_db.list_actions
        self.log_path = Path(log_path)
        self.event_bus = event_bus
        if self.event_bus is not None:
            self.event_bus.subscribe("round_advanced", self._on_round_event)

        # Signals object for cache pre-warm workers. Parented to `self` so it
        # is torn down with the tab; workers emit `done` back here.
        self._prewarm_signals = _PrewarmSignals(self)
        self._prewarm_signals.done.connect(self._on_prewarm_done)

        self._build_ui()
        self._refresh()

        # Cold-boot warm-up: top up the dice cache off-thread now, so the
        # first roll of the session never has to fetch on the UI thread.
        self._maybe_prewarm_cache()

    # ─────────── UI construction ───────────

    def _build_ui(self) -> None:
        # Fixed 50/50 split — no resizable splitter. Different tabs have
        # different sheet content (more action chips, longer immunity strings,
        # bigger mob HP bars), and Qt's stretch-with-Preferred-sizehint will
        # let those internal widths leak out and shift the panel boundary on
        # tab switch. `QSizePolicy.Ignored` for the horizontal axis tells Qt
        # "don't care what the content wants — give me exactly the stretched
        # share". That fixes the split at 50/50 regardless of content.
        root = QHBoxLayout(self)
        root.setContentsMargins(8, 8, 8, 8)
        root.setSpacing(8)
        sheet = self._build_sheet_panel()
        console = self._build_console_panel()
        sheet.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Expanding)
        console.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Expanding)
        root.addWidget(sheet, 1)
        root.addWidget(console, 1)

    def _build_sheet_panel(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        # Title
        self.title_label = QLabel()
        self.title_label.setObjectName("NPCTitle")
        self.title_label.setStyleSheet("font-size: 17px; font-weight: 600; color: #ffffff;")
        layout.addWidget(self.title_label)

        # Subtitle (CR, immunities)
        self.subtitle_label = QLabel()
        self.subtitle_label.setObjectName("NPCSubtitle")
        self.subtitle_label.setStyleSheet("color: #8a8f96; font-size: 11px;")
        layout.addWidget(self.subtitle_label)

        # Status strip
        self.status_label = QLabel()
        self.status_label.setObjectName("NPCStatusStrip")
        self.status_label.setStyleSheet(
            "color: #b8bdc4; padding: 8px 10px; background: #14171b; "
            "border-left: 3px solid #448aff; border-radius: 4px;"
        )
        self.status_label.setWordWrap(True)
        layout.addWidget(self.status_label)

        # HP bar
        self.hp_bar = HPBar()
        layout.addWidget(self.hp_bar)

        # Conditions row
        self.conditions_label = QLabel()
        self.conditions_label.setObjectName("ConditionsRow")
        self.conditions_label.setStyleSheet("color: #ff9800; font-size: 11px; padding: 4px 0;")
        self.conditions_label.setWordWrap(True)
        layout.addWidget(self.conditions_label)

        # ── kind-aware action area ──
        if self.npc_state.kind == "pc":
            self._build_player_action_area(layout)
        else:
            self._build_npc_action_area(layout)

        layout.addStretch(1)

        # Start-turn manual override button
        btn_label = (
            "Start player's turn"
            if self.npc_state.kind == "pc"
            else "Start NPC's turn (refresh reaction + recharges)"
        )
        self.start_turn_btn = QPushButton(btn_label)
        self.start_turn_btn.setStyleSheet(
            "padding: 6px 10px; background: #2a2f38; color: #d6dade; "
            "border: 1px solid #448aff; border-radius: 4px; font-size: 11px;"
        )
        self.start_turn_btn.clicked.connect(self._on_start_turn)
        layout.addWidget(self.start_turn_btn)

        return panel

    def _build_npc_action_area(self, layout: QVBoxLayout) -> None:
        """Builds the DB-driven action chip grid (NPC-only path)."""
        chips_header = QLabel("Actions (click or type)")
        chips_header.setStyleSheet(
            "color: #6c8eba; font-size: 10px; text-transform: uppercase; "
            "letter-spacing: 0.1em; padding-top: 8px;"
        )
        layout.addWidget(chips_header)
        self.action_grid = ActionChipGrid(cols=2)
        self.action_grid.chip_clicked.connect(self._on_chip_clicked)
        self.action_grid.show_narration_requested.connect(self._on_show_narration)
        self.action_grid.toggle_used_requested.connect(self._on_toggle_used)
        self.action_grid.edit_spec_requested.connect(self._on_edit_spec)
        layout.addWidget(self.action_grid)

    def _build_player_action_area(self, layout: QVBoxLayout) -> None:
        """Builds the generic player action chip row (PC-only path)."""
        # Set action_grid to None so _refresh won't try to call grid methods
        self.action_grid = None  # type: ignore[assignment]

        chips_header = QLabel("Actions")
        chips_header.setStyleSheet(
            "color: #6c8eba; font-size: 10px; text-transform: uppercase; "
            "letter-spacing: 0.1em; padding-top: 8px;"
        )
        layout.addWidget(chips_header)

        row_widget = QWidget()
        row_layout = QHBoxLayout(row_widget)
        row_layout.setContentsMargins(0, 0, 0, 0)
        row_layout.setSpacing(4)
        for action_name in _PLAYER_ACTIONS:
            btn = QPushButton(action_name)
            btn.setFixedHeight(28)
            btn.setStyleSheet(
                "padding: 2px 8px; background: #1e2530; color: #d6dade; "
                "border: 1px solid #3a4253; border-radius: 4px; font-size: 11px;"
            )
            btn.clicked.connect(lambda checked=False, a=action_name: self._on_player_action(a))
            row_layout.addWidget(btn)
        row_layout.addStretch(1)
        layout.addWidget(row_widget)

    def _build_console_panel(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        log_header = QLabel("Combat log")
        log_header.setStyleSheet("color: #6c8eba; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;")
        layout.addWidget(log_header)

        self.log_view = QTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setObjectName("CombatLog")
        # `DnD Dice` is the custom font registered in app._load_dice_font(); it
        # has glyphs for d4/d6/d8/d10/d12/d20 numerals. Qt falls back to the
        # next family for any codepoint the dice font lacks (i.e. normal text).
        self.log_view.setStyleSheet(
            "background: #14171b; color: #b8bdc4; border: 1px solid #2a2f38; "
            "font-family: 'DnD Dice', 'SF Mono', Menlo, monospace; font-size: 12px;"
        )
        layout.addWidget(self.log_view, 1)

        # Suggestion bar (v0.2): 3 LLM-prefetched action shortcuts above the input
        self.suggestion_bar = SuggestionBar(max_buttons=3)
        self.suggestion_bar.suggestion_chosen.connect(self._on_suggestion_chosen)
        layout.addWidget(self.suggestion_bar)

        # Command input
        self.input = CommandInput()
        self.input.preview_changed.connect(self._on_preview_changed)
        self.input.submitted.connect(self._on_submitted)
        layout.addWidget(self.input)

        return panel

    # ─────────── refresh helpers ───────────

    def _refresh(self) -> None:
        """Re-render everything from current state."""
        s = self.npc_state
        self.title_label.setText(self._title_text())
        self.subtitle_label.setText(self._subtitle_text())
        self.status_label.setText(self._status_text())
        self.hp_bar.set_state(s.member_hp, s.max_hp)
        self.conditions_label.setText(self._conditions_text())
        if self.action_grid is not None:  # NPC-only
            # Action chips with USED set
            used = {a for a, st in s.recharges.items() if st == "USED"}
            # An action with slots=0 also renders as USED (greyed-out, not clickable)
            for a in self.actions:
                slot_cfg = a.get("slots") or {}
                if isinstance(slot_cfg, dict) and slot_cfg.get("count"):
                    remaining = s.slots_remaining.get(a["action"], slot_cfg["count"])
                    if remaining <= 0:
                        used.add(a["action"])
            self.action_grid.set_actions(self.actions, used_actions=used, slot_remaining=dict(s.slots_remaining))
        # Inform command input of HP context for live preview
        self.input.update_context(s.member_hp, s.max_hp)

    def _title_text(self) -> str:
        s = self.npc_state
        if s.count > 1:
            return f"{s.name}  ×{s.count}"
        return s.name

    def _subtitle_text(self) -> str:
        s = self.npc_state
        parts = [f"CR {s.cr:g}"]
        if s.immunities:
            parts.append("immune: " + ", ".join(s.immunities))
        return " · ".join(parts)

    def _status_text(self) -> str:
        s = self.npc_state
        hp_text = f"<b>HP</b> {s.hp}/{s.max_total_hp}"
        parts = [f"{hp_text} · <b>AC</b> {s.ac} · <b>Speed</b> {s.speed}"]
        public_notes = [n for n in s.pinned_notes if not n.startswith("_")]
        if public_notes:
            parts.append(" · ".join(public_notes))
        return "  ".join(parts)

    def _actor_prefix(self) -> str:
        return self.npc_state.name

    def _conditions_text(self) -> str:
        s = self.npc_state
        chips: list[str] = []
        for c in sorted(s.conditions):
            duration = s.condition_durations.get(c)
            if duration is not None and duration > 0:
                chips.append(f"[{c} · {duration}r]")
            else:
                chips.append(f"[{c}]")
        if s.reaction_used:
            chips.append("[reaction used]")
        for action, status in s.recharges.items():
            if status == "USED":
                chips.append(f"[{action} used]")
        return "  ".join(chips) if chips else ""

    # ─────────── input handling ───────────

    def _on_submitted(self, text: str) -> None:
        """Parse a raw command and hand the ParsedCommand to MainWindow.

        All dispatch — snapshotting, target resolution, effect application,
        the LLM fallback — happens in MainWindow._on_command. The tab is just
        the input surface.
        """
        cmd = parse_command(text)
        self.command_requested.emit(cmd)

    def _on_chip_clicked(self, action_name: str) -> None:
        """Clicking an action chip is equivalent to typing the action name —
        an action effect against the active (this) tab's combatant."""
        cmd = ParsedCommand(
            kind="command",
            raw=action_name,
            target_ids=[self.npc_state.id] if self.npc_state.id else [],
            effects=[Effect(kind="action", action_token=action_name)],
        )
        self.command_requested.emit(cmd)

    def _on_show_narration(self, action_name: str) -> None:
        """Right-click → Show full narration. Pulls the full row from the DB
        (action summaries truncate at 80 chars) and dumps it in the log."""
        action = next((a for a in self.actions if a.get("action") == action_name), None)
        narration = (action or {}).get("narration_preview") or ""
        # Try the underlying DB for full text if the summary truncated it
        if narration.endswith("..."):
            try:
                # Lazy import the DB to get the full row
                import importlib.util
                import sys
                from pathlib import Path

                from PySide6.QtCore import QCoreApplication  # noqa: F401
                scripts_dir = Path(__file__).resolve().parents[2] / "scripts"
                if str(scripts_dir) not in sys.path:
                    sys.path.insert(0, str(scripts_dir))
                db = importlib.import_module("combat_actions_db")
                full = db.get(self.npc_state.slug, action_name)
                if full and isinstance(full.get("narration"), str):
                    narration = full["narration"]
            except Exception:
                pass
        if not narration:
            narration = "(no narration on this action)"
        from PySide6.QtWidgets import QMessageBox
        QMessageBox.information(self, action_name.replace("_", " ").title(), narration)

    def _on_toggle_used(self, action_name: str) -> None:
        """Right-click → manually flip the recharge/USED state. Useful when
        the DM realises they mis-counted a recharge slot."""
        current = self.npc_state.recharges.get(action_name)
        if current == "USED":
            self.npc_state.mark_action_available(action_name)
            self._append_log(f"<span style='color:#66bb6a'>{action_name} → AVAILABLE</span>")
        else:
            self.npc_state.mark_action_used(action_name)
            self._append_log(f"<span style='color:#6c8eba'>{action_name} → USED</span>")
        self._refresh()
        self.state_changed.emit()

    def _on_edit_spec(self, action_name: str) -> None:
        """Right-click → Edit spec. Editor dialog is a future enhancement; for
        now just point the user at the file + the MCP tool."""
        from PySide6.QtWidgets import QMessageBox
        QMessageBox.information(
            self,
            "Edit spec",
            f"In-app spec editing is on the roadmap. For now, edit "
            f"`combat-runner/actions.jsonl` directly or call:\n\n"
            f"  combat_action_upsert(npc='{self.npc_state.slug}', "
            f"action='{action_name}', spec={{...}})\n\n"
            f"Then run `python scripts/combat_actions_db.py validate` "
            f"and re-launch the encounter to pick up changes.",
        )

    # ─────────── player action handlers (PC-only path) ───────────

    def _clear_disengaging(self) -> None:
        """Remove the private _disengaging flag from pinned_notes."""
        self.npc_state.pinned_notes = [
            n for n in self.npc_state.pinned_notes if n != "_disengaging"
        ]

    def _on_player_action(self, action_name: str) -> None:
        """Handle a generic player action chip click."""
        name = self.npc_state.name
        if action_name == "Cast":
            self._player_action_cast()
        elif action_name == "Retreat":
            self._player_action_retreat()
        elif action_name == "Disengage":
            self._append_log(f"<span style='color:#66bb6a'>{name}: Disengage</span>")
            # Suppress the next OA prompt — flag stored on state for one command
            self._clear_disengaging()
            self.npc_state.pinned_notes.append("_disengaging")
            self._refresh()
            self.state_changed.emit()
        elif action_name == "Dodge":
            self.npc_state.add_condition("dodging")
            self._append_log(f"<span style='color:#66bb6a'>{name}: Dodge — dodging condition applied</span>")
            self._refresh()
            self.state_changed.emit()
            if self.event_bus is not None:
                from .event_bus import condition_event
                self.event_bus.emit(condition_event(self.npc_state.slug, "dodging", applied=True))
        else:
            # Attack, Dash, Help, Hide, Ready — log a line
            self._append_log(f"<span style='color:#b8bdc4'>{name}: {action_name}</span>")
            self.state_changed.emit()

    def _player_action_cast(self) -> None:
        """Prompt for spell name + level, then fire spell_cast event."""
        from PySide6.QtWidgets import QDialog, QDialogButtonBox, QFormLayout, QLineEdit, QSpinBox
        dlg = QDialog(self)
        dlg.setWindowTitle("Cast a Spell")
        form = QFormLayout(dlg)
        spell_input = QLineEdit()
        spell_input.setPlaceholderText("e.g. Fireball")
        level_spin = QSpinBox()
        level_spin.setRange(0, 9)
        level_spin.setValue(1)
        form.addRow("Spell name:", spell_input)
        form.addRow("Spell level:", level_spin)
        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(dlg.accept)
        buttons.rejected.connect(dlg.reject)
        form.addRow(buttons)
        if dlg.exec() != QDialog.DialogCode.Accepted:
            return
        spell_name = spell_input.text().strip()
        if not spell_name:
            return
        level = level_spin.value()
        # Level 0 is a cantrip — avoid the awkward "0th" ordinal.
        if level == 0:
            level_str = "cantrip"
        else:
            ordinal_suffix = "st" if level == 1 else "nd" if level == 2 else "rd" if level == 3 else "th"
            level_str = f"{level}{ordinal_suffix}"
        self._append_log(
            f"<span style='color:#ce93d8'>{self.npc_state.name}: casts {spell_name} ({level_str})</span>"
        )
        if self.event_bus is not None:
            from .event_bus import spell_cast_event
            self.event_bus.emit(spell_cast_event(
                caster=self.npc_state.id or self.npc_state.slug,
                spell_name=spell_name,
                spell_level=level,
            ))
        self.state_changed.emit()

    def _player_action_retreat(self) -> None:
        """Log Retreat and fire move_away event (main window handles OA prompt)."""
        name = self.npc_state.name
        # Check and clear _disengaging flag
        if "_disengaging" in self.npc_state.pinned_notes:
            self._clear_disengaging()
            self.npc_state.in_melee = False
            self._append_log(
                f"<span style='color:#66bb6a'>{name}: Retreat (Disengage active — no OA)</span>"
            )
            self._refresh()
            self.state_changed.emit()
            return
        self._append_log(f"<span style='color:#ff9800'>{name}: Retreat</span>")
        if self.event_bus is not None and self.npc_state.in_melee:
            from .event_bus import move_away_event
            self.event_bus.emit(move_away_event(
                combatant_id=self.npc_state.id or self.npc_state.slug,
                combatant_slug=self.npc_state.slug,
            ))
        self.npc_state.in_melee = False
        self._refresh()
        self.state_changed.emit()

    def try_player_action(self, token: str) -> bool:
        """For a PC tab, fuzzy-match `token` against `_PLAYER_ACTIONS` and run
        it. Returns True if a unique match was found and run, else False.

        Tightest-first ordering: exact → unique prefix → unique substring
        (all case-insensitive). NPC tabs always return False (their action
        resolution goes through MainWindow against the DB action surface).
        """
        if self.npc_state.kind != "pc":
            return False
        q = token.lower().strip()
        if not q:
            return False
        player_match: str | None = None
        exact = [a for a in _PLAYER_ACTIONS if a.lower() == q]
        if exact:
            player_match = exact[0]
        else:
            prefix = [a for a in _PLAYER_ACTIONS if a.lower().startswith(q)]
            if len(prefix) == 1:
                player_match = prefix[0]
            elif not prefix:
                sub = [a for a in _PLAYER_ACTIONS if q in a.lower()]
                if len(sub) == 1:
                    player_match = sub[0]
        if player_match is None:
            return False
        self._on_player_action(player_match)
        return True

    # ─────────── dice-cache pre-warm ───────────

    def _cache_level(self) -> int | None:
        """Current number of cached random numbers, or None if unknown
        (roller not importable). Reads the roller's module-level cache list."""
        try:
            roller = _get_roller()
            return len(roller._number_cache)
        except Exception:  # noqa: BLE001
            return None

    def _maybe_prewarm_cache(self) -> None:
        """If the dice cache has run low, top it up on a background thread.

        Keeps the synchronous roll on the UI thread fast: by the time the next
        roll happens the cache is warm, so `roll_combat_action` never has to
        do a (blocking, ~1s rate-limited / ~10s timeout) network fetch. Safe
        to call liberally — it no-ops when the cache is healthy or a pre-warm
        is already in flight.
        """
        global _PREWARM_IN_FLIGHT
        if _PREWARM_IN_FLIGHT:
            return
        level = self._cache_level()
        if level is None or level >= _CACHE_LOW_WATER:
            return
        _PREWARM_IN_FLIGHT = True
        worker = _CachePrewarmWorker(_CACHE_REFILL_TARGET, self._prewarm_signals)
        _prewarm_pool().start(worker)

    def _on_prewarm_done(self, ok: bool) -> None:  # noqa: ARG002 — slot signature
        """Pre-warm worker finished (success or graceful offline fallback)."""
        global _PREWARM_IN_FLIGHT
        _PREWARM_IN_FLIGHT = False

    # ─────────── action execution ───────────

    def _run_action(self, action_name: str) -> dict | None:
        """Call scripts.dnd_roller.roll_combat_action and append its output.

        Returns the parsed result dict (including the structured ``rolls``
        sidecar) so an external caller — the directed-command lifecycle in
        MainWindow — can route save-bearing damage through
        ``apply_uncertain_damage``. Returns ``None`` on an error / exception.
        """
        roller = _get_roller()
        try:
            result_json = roller.roll_combat_action(
                npc=self.npc_state.slug,
                action=action_name,
                log_path=str(self.log_path),
            )
            result = json.loads(result_json)
        except Exception as exc:
            self._append_log(f"<span style='color:#ff5252'>ERROR running {action_name}: {exc}</span>")
            return None
        finally:
            # The roll just consumed numbers from the dice cache. Top it back
            # up off-thread now so the *next* roll never blocks the UI thread.
            self._maybe_prewarm_cache()

        if "error" in result:
            self._append_log(f"<span style='color:#ff5252'>{result['error']}</span>")
            return None

        output = result.get("output", "")
        self._append_log(
            f"<span style='color:#8a8f96'>{self._actor_prefix()}:</span> "
            f"<span style='color:#6c8eba'>{action_name.replace('_', ' ')}</span>"
        )
        self._append_log_pre(output)

        # Bookkeeping: area actions with `recharge` mark themselves USED.
        # We surface this in the action chip grid on refresh.
        # The actions DB tells us the action's type via the per-NPC action list.
        action_entry = next((a for a in self.actions if a["action"] == action_name), None)
        if action_entry and action_entry.get("type") == "area" and action_entry.get("recharge"):
            self.npc_state.mark_action_used(action_name)

        if action_entry and action_entry.get("type") == "reaction":
            self.npc_state.reaction_used = True

        # Decrement slot counter (streamline #6). Initialize from slots.count
        # on first use; clamp at 0.
        slot_cfg = (action_entry or {}).get("slots") or {}
        if isinstance(slot_cfg, dict) and slot_cfg.get("count"):
            current = self.npc_state.slots_remaining.get(action_name, slot_cfg["count"])
            new = max(0, current - 1)
            self.npc_state.slots_remaining[action_name] = new
            self._append_log(
                f"<span style='color:#6c8eba'>{action_name} slots: {new}/{slot_cfg['count']} remaining</span>"
            )

        self._refresh()
        self.state_changed.emit()
        if self.event_bus is not None:
            atype = (action_entry or {}).get("type") or ""
            self.event_bus.emit(action_event(self.npc_state.slug, action_name, tags=(atype,) if atype else ()))
        return result

    def _apply_damage(self, amount: int, member: int | None, dtype: str | None) -> None:
        result = self.npc_state.apply_damage(amount, member=member)
        if result.get("skipped"):
            # Mirror heal's guard so an invalid member index or "no alive
            # members" path doesn't log a bogus "HP 0/max" line.
            self._append_log(f"<span style='color:#6c8eba'>damage {amount} skipped: {result['skipped']}</span>")
            return
        member_str = f"m{result['member']}" if self.npc_state.count > 1 and result.get("member") else ""
        dtype_str = f" {dtype}" if dtype else ""
        suffix = " · **killed**" if result.get("killed") else ""
        self._append_log(
            f"<span style='color:#8a8f96'>{self._actor_prefix()}:</span> "
            f"<span style='color:#ff5252'>−{amount}{dtype_str}</span> "
            f"{member_str} → HP {result['after']}/{self.npc_state.max_hp}{suffix}"
        )
        self._refresh()
        self.state_changed.emit()
        if self.event_bus is not None:
            # No melee/range info from the sigil; matcher falls to medium-confidence,
            # which is fine — the DM still sees the reaction prompt.
            self.event_bus.emit(damage_event(self.npc_state.slug, amount, damage_type=dtype))
            # Broadcasts: bloodied (transition only) + death. These drive the
            # watch system (allies can react with "heal X" suggestions etc.).
            if result.get("became_bloodied"):
                self.event_bus.emit(bloodied_event(self.npc_state.slug))
            if result.get("killed"):
                self.event_bus.emit(death_event(self.npc_state.slug))

    def _apply_heal(self, amount: int, member: int | None) -> None:
        result = self.npc_state.apply_heal(amount, member=member)
        if result.get("skipped"):
            self._append_log(f"<span style='color:#6c8eba'>heal {amount} skipped: {result['skipped']}</span>")
            return
        member_str = f"m{result['member']}" if self.npc_state.count > 1 and result.get("member") else ""
        self._append_log(
            f"<span style='color:#8a8f96'>{self._actor_prefix()}:</span> "
            f"<span style='color:#66bb6a'>+{amount}</span> {member_str} "
            f"→ HP {result['after']}/{self.npc_state.max_hp}"
        )
        self._refresh()
        self.state_changed.emit()
        if self.event_bus is not None:
            self.event_bus.emit(heal_event(self.npc_state.slug, amount))

    def _toggle_condition(self, cond: str, target_hint: str | None, duration: int | None = None) -> None:
        is_present = self.npc_state.toggle_condition(cond, duration=duration)
        suffix_parts = []
        if target_hint:
            suffix_parts.append(f"target: {target_hint}")
        if is_present and duration:
            suffix_parts.append(f"{duration} rounds")
        suffix = f" ({'; '.join(suffix_parts)})" if suffix_parts else ""
        verb = "applied" if is_present else "removed"
        self._append_log(
            f"<span style='color:#8a8f96'>{self._actor_prefix()}:</span> "
            f"<span style='color:#ff9800'>{verb} condition: {cond}</span>{suffix}"
        )
        self._refresh()
        self.state_changed.emit()
        if self.event_bus is not None:
            self.event_bus.emit(condition_event(self.npc_state.slug, cond, applied=is_present))

    def _on_start_turn(self) -> None:
        """Manual turn-start: refresh reaction + recharges for THIS NPC only."""
        self.npc_state.start_turn()
        # Roll any USED recharges
        for action, status in list(self.npc_state.recharges.items()):
            if status == "USED":
                action_entry = next((a for a in self.actions if a["action"] == action), None)
                if action_entry and action_entry.get("recharge") is not None:
                    threshold = int(action_entry["recharge"])
                    roller = _get_roller()
                    roll_result = json.loads(roller.roll_dice(1, 6, description=f"{self.npc_state.slug} {action} recharge"))
                    roll = roll_result.get("total_with_bonuses", 0)
                    if roll >= threshold:
                        self.npc_state.mark_action_available(action)
                        self._append_log(f"<span style='color:#66bb6a'>{action} recharged (rolled {roll})</span>")
                    else:
                        self._append_log(f"<span style='color:#8a8f96'>{action} not recharged (rolled {roll})</span>")
        self._refresh()
        self.state_changed.emit()

    # ─────────── live preview ───────────

    def _on_preview_changed(self, member, projected_hp) -> None:
        if member is None or projected_hp is None:
            self.hp_bar.clear_preview()
        else:
            self.hp_bar.set_preview(member, projected_hp)

    # ─────────── log helpers ───────────

    def _append_log(self, html: str) -> None:
        self.log_view.append(html)
        self._scroll_log_to_bottom()

    def _append_log_pre(self, plain_text: str) -> None:
        """Render action output as styled HTML.

        The output from `roll_combat_action` is markdown-ish:
          - `**bold**` headers
          - ```fenced``` code blocks containing the to-hit/dmg summary table
            with custom dice-font emoji glyphs (⚛️ 🔝 🔚)
          - `_italic_` roll-log lines
          - `*italic*` narration
        We render bold/italic inline, keep fenced blocks in a `<pre>` so
        whitespace + dice glyphs survive, and emit the whole thing as HTML
        rather than a single `<pre>` so it actually looks like a combat log.
        """
        self.log_view.append(_render_action_markdown(plain_text))
        self._scroll_log_to_bottom()

    def _on_round_event(self, event: Event) -> None:
        """Append a visual divider to this tab's combat log when the round
        advances, AND tick down any active condition durations. Conditions
        that expire (hit 0 rounds remaining) are auto-removed and logged."""
        round_num = event.payload.get("round_num", "?")
        divider = (
            f'<div style="margin:10px 0 6px 0; padding:4px 8px; '
            f'background:#1e2530; border-left:3px solid #66bb6a; '
            f'color:#66bb6a; font-weight:bold; letter-spacing:0.05em;">'
            f'── Round {round_num} ──</div>'
        )
        self.log_view.append(divider)
        # Clear any stale _disengaging flag. The flag is only valid for the
        # current turn (Disengage → immediate Retreat). If the round rolls over
        # without the player having Retreated, the protection has lapsed.
        if "_disengaging" in self.npc_state.pinned_notes:
            self._clear_disengaging()
        # Tick durations; log expirations
        expired = self.npc_state.tick_condition_durations()
        for cond in expired:
            self._append_log(
                f"<span style='color:#ffb74d'>condition expired: {cond}</span>"
            )
            if self.event_bus is not None:
                self.event_bus.emit(condition_event(self.npc_state.slug, cond, applied=False))
        # Refresh per-round slots (streamline #6).
        #
        # Only `round`/`turn` refresh modes refill on a round event. The
        # rest-based modes (`encounter`/`short_rest`/`long_rest`) recharge on
        # a rest, not mid-combat — they arrive full at encounter start and are
        # intentionally left alone here. See `_ROUND_REFRESH_MODES` above.
        refreshed_actions: list[str] = []
        for action in self.actions:
            slot_cfg = action.get("slots") or {}
            if not isinstance(slot_cfg, dict):
                continue
            refresh_mode = slot_cfg.get("refresh")
            count = slot_cfg.get("count")
            if not count or refresh_mode not in _ROUND_REFRESH_MODES:
                continue
            action_name = action.get("action")
            if action_name and self.npc_state.slots_remaining.get(action_name, count) < count:
                self.npc_state.slots_remaining[action_name] = count
                refreshed_actions.append(action_name)
        for n in refreshed_actions:
            self._append_log(f"<span style='color:#66bb6a'>{n} slots refreshed</span>")
        if expired or refreshed_actions:
            self._refresh()
            self.state_changed.emit()
        self._scroll_log_to_bottom()

    def _scroll_log_to_bottom(self) -> None:
        scroll = self.log_view.verticalScrollBar()
        if scroll is not None:
            scroll.setValue(scroll.maximum())

    # ─────────── public API (called by main window after external state change) ───────────

    def refresh(self) -> None:
        """Force a re-render after the main window mutates this tab's state
        (e.g. via round advance, LLM tool call, etc.)."""
        self._refresh()

    def run_action_externally(self, action_name: str) -> dict | None:
        """Public hook so MainWindow can fire a matched reaction in this tab
        (e.g. after the user clicks TRIGGER in the reaction prompt dialog).

        Returns the parsed ``roll_combat_action`` result dict (with the
        structured ``rolls`` sidecar) so the directed-command lifecycle can
        route save-bearing damage through ``apply_uncertain_damage``.
        ``None`` on error.
        """
        return self._run_action(action_name)

    def set_suggestions(self, suggestions: list[Suggestion]) -> None:
        """Main window calls this after the LLM controller returns suggestions
        for this tab. Empty list clears the bar."""
        self.suggestion_bar.set_suggestions(suggestions)

    def show_suggestions_loading(self) -> None:
        self.suggestion_bar.set_loading()

    # ─────────── internal: suggestion click ───────────

    def _on_suggestion_chosen(self, action_name: str) -> None:
        """Treat a suggestion-button click as an action against this tab's
        combatant — the same path as an action chip click."""
        self._on_chip_clicked(action_name)
