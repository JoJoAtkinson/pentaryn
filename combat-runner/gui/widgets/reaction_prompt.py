"""ReactionPromptDialog — modal shown when an event matches one or more
declared triggers.

Flow:
  1. Event fires on the bus (damage, spell_cast, etc.)
  2. TriggerMatcher returns one or more TriggerMatch entries
  3. MainWindow constructs this dialog with the matches + event summary
  4. DM sees each candidate reaction with a TRIGGER button per match;
     a single PASS button at the bottom dismisses without firing anything
  5. On TRIGGER click: dialog stores `(npc_slug, action_name)` in
     `chosen_reaction` and accepts. MainWindow then switches to that NPC's
     tab, calls roll_combat_action, marks the reaction USED, logs to console.

Why a single-choice model (not multi-select)?
  Reactions are one-per-creature-per-round. A single event matching multiple
  reactions almost always means TWO creatures each have a different reaction
  to fire. In practice the DM picks one — the rare "both fire" case can be
  handled by re-emitting the event, which surfaces only the remaining match
  after the first reaction is marked USED.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


@dataclass(frozen=True)
class ReactionChoice:
    """What the DM picked. `triggered=False` means PASS — nothing fires."""

    npc_slug: str
    action_name: str
    triggered: bool


class ReactionPromptDialog(QDialog):
    """Modal: one candidate per row, each row has a TRIGGER button.

    Construct with:
      event_summary: one-line description ("glacier-stalker took 9 melee damage")
      matches: iterable of (npc_slug, action_name, match_text, confidence) tuples
               — kept as plain tuples so callers don't have to import TriggerMatch
               into this widget (keeps the widget Qt-only).

    After exec_(), inspect `dialog.chosen_reaction`:
      - ReactionChoice(triggered=True, ...)  → fire that reaction
      - ReactionChoice(triggered=False, ...) → DM passed; do nothing
      - None  → dialog was force-closed (treat as PASS)
    """

    def __init__(
        self,
        event_summary: str,
        matches: Iterable[tuple[str, str, str, float]],
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.setWindowTitle("Reaction available")
        self.setModal(True)
        self.chosen_reaction: ReactionChoice | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(10)

        # Event header
        header = QLabel(event_summary)
        header.setStyleSheet("color: #ffffff; font-size: 13px; font-weight: bold;")
        header.setWordWrap(True)
        layout.addWidget(header)

        subheader = QLabel("Trigger which reaction?")
        subheader.setStyleSheet("color: #b0bec5; font-size: 11px;")
        layout.addWidget(subheader)

        # Divider
        line = QFrame()
        line.setFrameShape(QFrame.Shape.HLine)
        line.setStyleSheet("color: #37474f;")
        layout.addWidget(line)

        # One row per match
        self._match_count = 0
        for npc_slug, action_name, match_text, confidence in matches:
            layout.addWidget(self._build_match_row(npc_slug, action_name, match_text, confidence))
            self._match_count += 1

        if self._match_count == 0:
            # Shouldn't happen — caller is supposed to skip the dialog when no
            # matches — but render a graceful empty state instead of crashing.
            empty = QLabel("(no reactions available)")
            empty.setStyleSheet("color: #78909c; font-style: italic;")
            layout.addWidget(empty)

        # PASS button at the bottom
        bottom_row = QHBoxLayout()
        bottom_row.addStretch(1)
        self._pass_btn = QPushButton("Pass — no reaction")
        self._pass_btn.setObjectName("PassButton")
        self._pass_btn.setStyleSheet(
            "QPushButton {"
            "  background: #37474f;"
            "  color: #ffffff;"
            "  border: 1px solid #546e7a;"
            "  padding: 6px 14px;"
            "  border-radius: 4px;"
            "}"
            "QPushButton:hover { background: #455a64; }"
        )
        self._pass_btn.clicked.connect(self._on_pass)
        bottom_row.addWidget(self._pass_btn)
        layout.addLayout(bottom_row)

        # ESC = PASS, ENTER = first trigger (matches users' muscle memory)
        self._pass_btn.setShortcut("Escape")

    # ─────────── public ───────────

    def match_count(self) -> int:
        """Test-only: how many candidate rows are showing."""
        return self._match_count

    # ─────────── internals ───────────

    def _build_match_row(
        self, npc_slug: str, action_name: str, match_text: str, confidence: float
    ) -> QWidget:
        row = QFrame()
        row.setObjectName("ReactionRow")
        row.setStyleSheet(
            "QFrame#ReactionRow {"
            "  background: #1e2530;"
            "  border: 1px solid #37474f;"
            "  border-radius: 4px;"
            "}"
        )
        h = QHBoxLayout(row)
        h.setContentsMargins(10, 8, 10, 8)
        h.setSpacing(10)

        info = QVBoxLayout()
        info.setSpacing(2)
        title = QLabel(f"<b>{npc_slug}</b> — {action_name}")
        title.setStyleSheet("color: #ffffff; font-size: 12px;")
        info.addWidget(title)

        # Confidence badge: high (≥1.0) = green, medium (0.5) = amber, else grey
        conf_color = self._confidence_color(confidence)
        sub = QLabel(f"<span style='color:{conf_color}'>•</span> {match_text}")
        sub.setStyleSheet("color: #b0bec5; font-size: 10px;")
        sub.setTextFormat(Qt.TextFormat.RichText)
        info.addWidget(sub)

        h.addLayout(info, 1)

        trigger_btn = QPushButton("Trigger")
        trigger_btn.setObjectName(f"TriggerButton_{npc_slug}_{action_name}")
        trigger_btn.setStyleSheet(
            "QPushButton {"
            "  background: #448aff;"
            "  color: #ffffff;"
            "  border: 1px solid #2962ff;"
            "  padding: 6px 14px;"
            "  border-radius: 4px;"
            "  font-weight: bold;"
            "}"
            "QPushButton:hover { background: #5c9eff; }"
        )
        trigger_btn.clicked.connect(
            lambda _checked=False, n=npc_slug, a=action_name: self._on_trigger(n, a)
        )
        h.addWidget(trigger_btn)

        return row

    @staticmethod
    def _confidence_color(confidence: float) -> str:
        if confidence >= 1.0:
            return "#66bb6a"
        if confidence >= 0.5:
            return "#ffa726"
        return "#90a4ae"

    def _on_trigger(self, npc_slug: str, action_name: str) -> None:
        self.chosen_reaction = ReactionChoice(
            npc_slug=npc_slug, action_name=action_name, triggered=True
        )
        self.accept()

    def _on_pass(self) -> None:
        self.chosen_reaction = ReactionChoice(npc_slug="", action_name="", triggered=False)
        self.reject()
