"""SuggestionBar — three slug buttons above the command input.

Each button shows a short suggestion slug + the action it would dispatch.
Click → emits `suggestion_chosen(action_name)`. The NPCTab connects that to
its fast-path dispatcher, so suggestion clicks are instant.

The bar is rebuilt every time the LLM controller returns a new batch of
suggestions. While a new batch is loading, the bar can show a faint "thinking"
hint via `set_loading()`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QHBoxLayout, QLabel, QPushButton, QSizePolicy, QWidget


@dataclass(frozen=True)
class Suggestion:
    """One pre-computed action suggestion.

    `slug` is the human-readable label rendered on the button (max ~50 chars).
    `action_name` is what gets dispatched on click (must match an action in the
    DB for the current NPC, otherwise dispatch falls through to LLM).
    `target_npc` is an optional sticky target injected by the watch system —
    when set, the dispatched action gets logged with "→ {target}" so the DM
    knows which ally the broadcast suggestion was tied to.
    """

    slug: str
    action_name: str
    target_npc: str | None = None


class SuggestionBar(QWidget):
    """Row of suggestion buttons above the command input."""

    suggestion_chosen = Signal(str)  # action_name

    def __init__(self, max_buttons: int = 3, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._max_buttons = max_buttons
        self._layout = QHBoxLayout(self)
        self._layout.setContentsMargins(0, 4, 0, 4)
        self._layout.setSpacing(6)
        self._buttons: list[QPushButton] = []
        self._loading_label: QLabel | None = None
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._render_empty()

    # ─────────── public API ───────────

    def set_suggestions(self, suggestions: Iterable[Suggestion]) -> None:
        """Replace the buttons with the given suggestions. Truncates to max_buttons.
        Pass an empty iterable to clear."""
        self._clear()
        suggestions = list(suggestions)[: self._max_buttons]
        if not suggestions:
            self._render_empty()
            return

        for s in suggestions:
            btn = QPushButton(self._format_slug(s.slug))
            btn.setObjectName("SuggestionButton")
            btn.setStyleSheet(
                "QPushButton {"
                "  background: #1e2530;"
                "  color: #ffffff;"
                "  border: 1px solid #448aff;"
                "  padding: 6px 10px;"
                "  border-radius: 4px;"
                "  text-align: left;"
                "  font-size: 11px;"
                "}"
                "QPushButton:hover { background: #2a3550; }"
            )
            btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
            btn.clicked.connect(lambda _checked=False, action=s.action_name: self.suggestion_chosen.emit(action))
            self._layout.addWidget(btn, 1)
            self._buttons.append(btn)

    def set_loading(self) -> None:
        """Show a faint 'thinking…' hint while the LLM is generating suggestions."""
        self._clear()
        self._loading_label = QLabel("thinking…")
        self._loading_label.setStyleSheet("color: #6c8eba; font-style: italic; font-size: 10px;")
        self._loading_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        self._layout.addWidget(self._loading_label, 1)

    def clear(self) -> None:
        self._clear()
        self._render_empty()

    def current_suggestions(self) -> list[str]:
        """Test-only: action names currently displayed."""
        # action_name is captured in the connected slot's default arg; we can't
        # easily recover it from the button. Return the button texts as a proxy.
        return [b.text() for b in self._buttons]

    # ─────────── internals ───────────

    def _clear(self) -> None:
        while self._layout.count():
            item = self._layout.takeAt(0)
            if w := item.widget():
                w.deleteLater()
        self._buttons.clear()
        self._loading_label = None

    def _render_empty(self) -> None:
        # An empty bar still occupies a fixed slot so the layout doesn't jump.
        spacer = QLabel("")
        spacer.setStyleSheet("min-height: 28px;")
        self._layout.addWidget(spacer)

    @staticmethod
    def _format_slug(slug: str) -> str:
        # Keep slugs tight; truncate with ellipsis past ~70 chars
        s = slug.strip()
        if len(s) > 70:
            s = s[:67] + "…"
        return s
