"""CombatTabBar — QTabBar subclass with targeting arrow overlay.

Draws a small red downward triangle (▼) at the top edge of each tab that is
currently targeted, excluding the actor's own tab.

Usage::

    bar = CombatTabBar()
    tabs.setTabBar(bar)
    bar.set_targeting(targeted={1, 2}, actor=0)
"""

from __future__ import annotations

from PySide6.QtCore import QPoint
from PySide6.QtGui import QColor, QPainter, QPaintEvent, QPolygon
from PySide6.QtWidgets import QTabBar

_COLOR_ARROW = QColor("#ff5252")  # red — matches _COLOR_CRITICAL in hp_bar.py

# Triangle dimensions in logical pixels
_ARROW_HALF_W = 4   # half-width: total width = 8 px
_ARROW_HEIGHT = 5   # height: tip to base


class CombatTabBar(QTabBar):
    """QTabBar subclass that paints a red downward targeting arrow on targeted tabs.

    Public API:
      set_targeting(targeted, actor) — update targeting state and schedule repaint
      arrow_indices()               — returns the set of tabs that will show an arrow
    """

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._targeted: set[int] = set()
        self._actor: int = -1

    # ─────────── public API ───────────

    def set_targeting(self, targeted: set[int], actor: int) -> None:
        """Store the targeted tab indices and the actor tab index, then repaint."""
        self._targeted = set(targeted)
        self._actor = actor
        self.update()

    def arrow_indices(self) -> set[int]:
        """Return the subset of targeted indices that should show an arrow.

        The actor's own tab is excluded so the arrow only appears on the tabs
        that the actor is targeting.
        """
        return self._targeted - {self._actor}

    # ─────────── rendering ───────────

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 (Qt API)
        # Let the base class paint all tabs normally first.
        super().paintEvent(event)

        indices = self.arrow_indices()
        if not indices:
            return

        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        painter.setPen(_COLOR_ARROW)
        painter.setBrush(_COLOR_ARROW)

        count = self.count()
        for i in indices:
            if i < 0 or i >= count:
                continue  # guard against stale / invalid indices
            tab_rect = self.tabRect(i)
            cx = tab_rect.left() + tab_rect.width() // 2
            # Triangle sits at the very top edge of the tab bar.
            # Base at y=0, tip points downward to y=_ARROW_HEIGHT.
            top_y = tab_rect.top()
            triangle = QPolygon(
                [
                    QPoint(cx - _ARROW_HALF_W, top_y),           # top-left
                    QPoint(cx + _ARROW_HALF_W, top_y),           # top-right
                    QPoint(cx,                 top_y + _ARROW_HEIGHT),  # tip
                ]
            )
            painter.drawPolygon(triangle)

        painter.end()
