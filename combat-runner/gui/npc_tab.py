"""NPCTab — one tab in the main window.

Composes the sheet panel (left: status + HP bar + action chips) and the console
panel (right: combat log + input). Per-NPC state lives in `self.npc_state`
(a `gui.state.NPCState`).

This module is the thinnest possible wiring between the widgets and the state.
Dispatch logic (parsing user input → state mutations + log writes) is delegated
to `gui.dispatcher.Dispatcher`. The actual roll mechanics still happen in
`scripts.dnd_roller.roll_combat_action` (called via the dispatcher's
action-execution helper).
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSizePolicy,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from .dispatcher import Dispatcher, InputKind, ParsedInput
from .event_bus import EventBus, condition_event, damage_event, heal_event
from .state import NPCState
from .widgets.action_chips import ActionChipGrid
from .widgets.command_input import CommandInput
from .widgets.hp_bar import HPBar
from .widgets.suggestion_bar import Suggestion, SuggestionBar


# Lazy import of the dice/action runner — scripts/dnd_roller.py is the
# authoritative implementation. Importing on first use keeps the GUI launch
# snappy (chromadb etc. is heavy at import time even if we don't need it).
_dnd_roller = None


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


class NPCTab(QWidget):
    """One combat tab for one NPC instance."""

    # Emitted whenever the NPC's state changes (HP, conditions, recharges).
    # The main window listens to update tab titles + fire suggestion refresh.
    state_changed = Signal()

    # Emitted when the dispatcher routes input to the LLM fallback path.
    # The main window owns the LLM controller; the tab just signals.
    llm_fallback_requested = Signal(str, object)  # (input_text, parsed_input)

    # Emitted when the user types `/reorder` — main window applies it.
    reorder_requested = Signal(list)  # list of slugs

    # Emitted on `/quit`.
    quit_requested = Signal()

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
        self.dispatcher = Dispatcher()
        self.event_bus = event_bus

        self._build_ui()
        self._refresh()

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

        # Action chip grid
        chips_header = QLabel("Actions (click or type)")
        chips_header.setStyleSheet("color: #6c8eba; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; padding-top: 8px;")
        layout.addWidget(chips_header)

        self.action_grid = ActionChipGrid(cols=2)
        self.action_grid.chip_clicked.connect(self._on_chip_clicked)
        layout.addWidget(self.action_grid)

        layout.addStretch(1)

        # Start-turn manual override button
        self.start_turn_btn = QPushButton("Start NPC's turn (refresh reaction + recharges)")
        self.start_turn_btn.setStyleSheet(
            "padding: 6px 10px; background: #2a2f38; color: #d6dade; "
            "border: 1px solid #448aff; border-radius: 4px; font-size: 11px;"
        )
        self.start_turn_btn.clicked.connect(self._on_start_turn)
        layout.addWidget(self.start_turn_btn)

        return panel

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
        # Action chips with USED set
        used = {a for a, st in s.recharges.items() if st == "USED"}
        self.action_grid.set_actions(self.actions, used_actions=used)
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
        return f"{hp_text} · <b>AC</b> {s.ac} · <b>Speed</b> {s.speed}"

    def _conditions_text(self) -> str:
        s = self.npc_state
        chips: list[str] = []
        for c in sorted(s.conditions):
            chips.append(f"[{c}]")
        if s.reaction_used:
            chips.append("[reaction used]")
        for action, status in s.recharges.items():
            if status == "USED":
                chips.append(f"[{action} used]")
        return "  ".join(chips) if chips else ""

    # ─────────── input handling ───────────

    def _on_submitted(self, text: str) -> None:
        parsed = self.dispatcher.parse(text, available_actions=self.actions)
        self._handle_parsed(parsed)

    def _on_chip_clicked(self, action_name: str) -> None:
        """Clicking an action chip is equivalent to typing the action name."""
        parsed = ParsedInput(kind=InputKind.ACTION, raw=action_name, action_name=action_name)
        self._handle_parsed(parsed)

    def _handle_parsed(self, parsed: ParsedInput) -> None:
        if parsed.kind is InputKind.ACTION:
            self._run_action(parsed.action_name)
        elif parsed.kind is InputKind.DAMAGE:
            self._apply_damage(parsed.amount, parsed.member, parsed.damage_type)
        elif parsed.kind is InputKind.HEAL:
            self._apply_heal(parsed.amount, parsed.member)
        elif parsed.kind is InputKind.CONDITION:
            self._toggle_condition(parsed.condition, parsed.condition_target)
        elif parsed.kind is InputKind.CONDITION_MENU:
            self._append_log("(condition autocomplete menu — handled by widget in v0.2)")
        elif parsed.kind is InputKind.NOTE:
            self._append_log(f"📝 note: {parsed.note_text}")
        elif parsed.kind is InputKind.REORDER:
            self.reorder_requested.emit(parsed.reorder_slugs)
        elif parsed.kind is InputKind.QUIT:
            self.quit_requested.emit()
        else:
            # AMBIGUOUS or UNKNOWN → LLM fallback (main window owns the controller)
            self.llm_fallback_requested.emit(parsed.raw, parsed)
            self._append_log(f"<span style='color:#6c8eba'>(routing to LLM: {parsed.raw!r})</span>")

    # ─────────── action execution ───────────

    def _run_action(self, action_name: str) -> None:
        """Call scripts.dnd_roller.roll_combat_action and append its output."""
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
            return

        if "error" in result:
            self._append_log(f"<span style='color:#ff5252'>{result['error']}</span>")
            return

        output = result.get("output", "")
        self._append_log_pre(output)

        # Bookkeeping: area actions with `recharge` mark themselves USED.
        # We surface this in the action chip grid on refresh.
        # The actions DB tells us the action's type via the per-NPC action list.
        action_entry = next((a for a in self.actions if a["action"] == action_name), None)
        if action_entry and action_entry.get("type") == "area" and action_entry.get("recharge"):
            self.npc_state.mark_action_used(action_name)

        if action_entry and action_entry.get("type") == "reaction":
            self.npc_state.reaction_used = True

        self._refresh()
        self.state_changed.emit()

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
            f"<span style='color:#ff5252'>−{amount}{dtype_str}</span> "
            f"{member_str} → HP {result['after']}/{self.npc_state.max_hp}{suffix}"
        )
        self._refresh()
        self.state_changed.emit()
        if self.event_bus is not None:
            # No melee/range info from the sigil; matcher falls to medium-confidence,
            # which is fine — the DM still sees the reaction prompt.
            self.event_bus.emit(damage_event(self.npc_state.slug, amount, damage_type=dtype))

    def _apply_heal(self, amount: int, member: int | None) -> None:
        result = self.npc_state.apply_heal(amount, member=member)
        if result.get("skipped"):
            self._append_log(f"<span style='color:#6c8eba'>heal {amount} skipped: {result['skipped']}</span>")
            return
        member_str = f"m{result['member']}" if self.npc_state.count > 1 and result.get("member") else ""
        self._append_log(
            f"<span style='color:#66bb6a'>+{amount}</span> {member_str} "
            f"→ HP {result['after']}/{self.npc_state.max_hp}"
        )
        self._refresh()
        self.state_changed.emit()
        if self.event_bus is not None:
            self.event_bus.emit(heal_event(self.npc_state.slug, amount))

    def _toggle_condition(self, cond: str, target_hint: str | None) -> None:
        is_present = self.npc_state.toggle_condition(cond)
        suffix = f" (target hint: {target_hint})" if target_hint else ""
        verb = "applied" if is_present else "removed"
        self._append_log(f"<span style='color:#ff9800'>{verb} condition: {cond}</span>{suffix}")
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

    def _scroll_log_to_bottom(self) -> None:
        scroll = self.log_view.verticalScrollBar()
        if scroll is not None:
            scroll.setValue(scroll.maximum())

    # ─────────── public API (called by main window after external state change) ───────────

    def refresh(self) -> None:
        """Force a re-render after the main window mutates this tab's state
        (e.g. via round advance, LLM tool call, etc.)."""
        self._refresh()

    def run_action_externally(self, action_name: str) -> None:
        """Public hook so MainWindow can fire a matched reaction in this tab
        (e.g. after the user clicks TRIGGER in the reaction prompt dialog)."""
        self._run_action(action_name)

    def set_suggestions(self, suggestions: list[Suggestion]) -> None:
        """Main window calls this after the LLM controller returns suggestions
        for this tab. Empty list clears the bar."""
        self.suggestion_bar.set_suggestions(suggestions)

    def show_suggestions_loading(self) -> None:
        self.suggestion_bar.set_loading()

    # ─────────── internal: suggestion click ───────────

    def _on_suggestion_chosen(self, action_name: str) -> None:
        """Treat a suggestion-button click as instant fast-path dispatch."""
        parsed = ParsedInput(kind=InputKind.ACTION, raw=action_name, action_name=action_name)
        self._handle_parsed(parsed)
