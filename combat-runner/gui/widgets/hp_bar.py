"""HP bar widget — single-creature or segmented (mob) modes.

Renders a horizontal bar broken into N segments (one per mob member; single
creature = 1 segment). Each segment fills from left as a percentage of that
member's max HP. Dead members render as a dark slab.

Live preview: `set_preview(member_idx, projected_hp)` overlays a red (damage)
or green (heal) ghost on the affected segment. `clear_preview()` reverts.

Pure PySide6 — no business logic. Reads state externally via `set_state()`.
"""

from __future__ import annotations

from PySide6.QtCore import QRect, QSize
from PySide6.QtGui import QColor, QPainter, QPaintEvent
from PySide6.QtWidgets import QWidget

# qt-material dark theme palette (dark_blue.xml accent: #448aff).
_COLOR_BG = QColor("#14171b")
_COLOR_BORDER = QColor("#2a2f38")
_COLOR_HEALTHY = QColor("#448aff")     # primary accent
_COLOR_BLOODIED = QColor("#ff7043")    # warning orange (≤ half)
_COLOR_CRITICAL = QColor("#ff5252")    # red (≤ quarter)
_COLOR_DEAD = QColor("#3a3a3a")        # dim grey
_COLOR_PREVIEW_DAMAGE = QColor(255, 82, 82, 130)   # red, half-alpha
_COLOR_PREVIEW_HEAL = QColor(102, 187, 106, 140)   # green, half-alpha
_COLOR_DIVIDER = QColor("#1e2026")


class HPBar(QWidget):
    """Horizontal HP bar with optional segmentation for mobs.

    Public API:
      set_state(member_hp: list[int], max_hp_per_member: int) — refresh display
      set_preview(member_idx: int, projected_hp: int) — overlay preview
      clear_preview() — remove overlay
    """

    BAR_HEIGHT = 18

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._member_hp: list[int] = [0]
        self._max_per_member: int = 1
        self._preview_member: int | None = None
        self._preview_projected: int | None = None
        self.setMinimumHeight(self.BAR_HEIGHT)
        self.setMinimumWidth(120)

    # ─────────── public API ───────────

    def set_state(self, member_hp: list[int], max_hp_per_member: int) -> None:
        """Update HP and trigger a repaint. Pass per-member HP list and the
        shared max HP. For single-creature, pass [current_hp] and the max."""
        self._member_hp = list(member_hp) if member_hp else [0]
        self._max_per_member = max(1, int(max_hp_per_member))
        self.update()

    def set_preview(self, member_idx: int, projected_hp: int) -> None:
        """Show a damage/heal preview overlay on the given 0-indexed member.
        Clamp projected_hp to [0, max_per_member]."""
        self._preview_member = max(0, min(member_idx, len(self._member_hp) - 1))
        self._preview_projected = max(0, min(projected_hp, self._max_per_member))
        self.update()

    def clear_preview(self) -> None:
        self._preview_member = None
        self._preview_projected = None
        self.update()

    def sizeHint(self) -> QSize:
        return QSize(280, self.BAR_HEIGHT)

    # ─────────── rendering ───────────

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 (Qt API)
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, False)
        rect = self.rect().adjusted(0, 0, -1, -1)

        # Background + outer border
        painter.fillRect(rect, _COLOR_BG)
        painter.setPen(_COLOR_BORDER)
        painter.drawRect(rect)

        count = len(self._member_hp)
        if count == 0:
            return

        # Compute segment widths (last segment absorbs rounding)
        usable_w = rect.width() - 1
        seg_w = usable_w / count
        for i, hp in enumerate(self._member_hp):
            x0 = int(rect.left() + i * seg_w)
            x1 = int(rect.left() + (i + 1) * seg_w) if i < count - 1 else rect.right()
            seg_rect = QRect(x0 + 1, rect.top() + 1, x1 - x0 - 1, rect.height() - 1)

            if hp <= 0:
                painter.fillRect(seg_rect, _COLOR_DEAD)
            else:
                # Pick fill color by HP fraction
                frac = hp / self._max_per_member
                if frac > 0.5:
                    fill_color = _COLOR_HEALTHY
                elif frac > 0.25:
                    fill_color = _COLOR_BLOODIED
                else:
                    fill_color = _COLOR_CRITICAL
                fill_w = max(1, int(seg_rect.width() * frac))
                fill_rect = QRect(seg_rect.left(), seg_rect.top(), fill_w, seg_rect.height())
                painter.fillRect(seg_rect, _COLOR_BG)  # empty area
                painter.fillRect(fill_rect, fill_color)

            # Preview overlay on this segment if it's the previewed member
            if self._preview_member == i and self._preview_projected is not None:
                current = self._member_hp[i]
                projected = self._preview_projected
                if projected < current:
                    # Damage preview: red overlay from projected → current
                    proj_frac = projected / self._max_per_member
                    proj_w = max(0, int(seg_rect.width() * proj_frac))
                    diff_rect = QRect(
                        seg_rect.left() + proj_w,
                        seg_rect.top(),
                        max(1, int(seg_rect.width() * (current / self._max_per_member)) - proj_w),
                        seg_rect.height(),
                    )
                    painter.fillRect(diff_rect, _COLOR_PREVIEW_DAMAGE)
                elif projected > current:
                    # Heal preview: green overlay from current → projected
                    cur_frac = current / self._max_per_member
                    cur_w = max(0, int(seg_rect.width() * cur_frac))
                    diff_rect = QRect(
                        seg_rect.left() + cur_w,
                        seg_rect.top(),
                        max(1, int(seg_rect.width() * (projected / self._max_per_member)) - cur_w),
                        seg_rect.height(),
                    )
                    painter.fillRect(diff_rect, _COLOR_PREVIEW_HEAL)

            # Segment divider (between segments, not on the last)
            if i < count - 1:
                painter.setPen(_COLOR_DIVIDER)
                painter.drawLine(x1, rect.top() + 1, x1, rect.bottom() - 1)
