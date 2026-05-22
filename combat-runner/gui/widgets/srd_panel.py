"""SRD search dock panel — always-on rules / spell / condition lookup.

Lives as a `QDockWidget` on the right side of the main window (toggle via
View → SRD Search). Input box, a result list, and a markdown preview.

Routing:
  - `spell: name` → search_spells(name=...)
  - `cond: name` → list_conditions(name=...)
  - bare text → search_rules(query=...)
  - empty → clears

The functions are imported lazily from `scripts/srd5_2.py` (in-process; no
MCP transport overhead). Synchronous — the lookups are disk-cached and
millisecond-fast for cache hits.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Any

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDockWidget,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)


_REPO_ROOT = Path(__file__).resolve().parents[3]


def _get_srd():
    """Lazy import scripts/srd5_2 so the GUI boot doesn't pay for chromadb."""
    scripts_dir = _REPO_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    return importlib.import_module("srd5_2")


class SrdSearchPanel(QWidget):
    """The widget shown inside the dock. Standalone QWidget so it can also
    be embedded elsewhere or in tests."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(4)

        hint = QLabel("<i>Try: <code>fireball</code> · <code>spell: fly</code> · <code>cond: charmed</code></i>")
        hint.setStyleSheet("color: #6c8eba; font-size: 10px;")
        layout.addWidget(hint)

        self.input = QLineEdit()
        self.input.setPlaceholderText("Search rules · spells · conditions…")
        self.input.returnPressed.connect(self._run_search)
        layout.addWidget(self.input)

        self.results = QListWidget()
        self.results.itemClicked.connect(self._on_pick)
        self.results.setMaximumHeight(180)
        layout.addWidget(self.results)

        self.detail = QTextBrowser()
        self.detail.setStyleSheet(
            "background: #14171b; color: #b8bdc4; border: 1px solid #2a2f38; "
            "font-size: 11px; padding: 6px;"
        )
        layout.addWidget(self.detail, 1)

        # Cache the last result set so click-to-detail doesn't refetch
        self._last_results: list[dict[str, Any]] = []
        self._last_kind: str = ""  # "spell" | "condition" | "rule"

    # ─────────── search dispatch ───────────

    def _run_search(self) -> None:
        text = self.input.text().strip()
        if not text:
            self.results.clear()
            self.detail.clear()
            return
        try:
            srd = _get_srd()
        except Exception as exc:  # noqa: BLE001
            self.detail.setMarkdown(f"**SRD module failed to load:** `{exc}`")
            return

        kind, query = self._classify(text)
        try:
            if kind == "spell":
                payload = srd.search_spells(name=query)
                hits = payload.get("results", []) if isinstance(payload, dict) else []
            elif kind == "condition":
                payload = srd.list_conditions(name=query, source="core,a5e-ag")
                hits = payload.get("results", []) if isinstance(payload, dict) else []
            else:
                payload = srd.search_rules(query=query)
                hits = payload.get("results", []) if isinstance(payload, dict) else []
        except Exception as exc:  # noqa: BLE001
            self.detail.setMarkdown(f"**Search failed:** `{exc}`")
            return

        self._last_results = hits
        self._last_kind = kind
        self.results.clear()
        if not hits:
            self.detail.setMarkdown(f"*No {kind} matches for `{query}`.*")
            return
        for h in hits[:40]:
            label = h.get("name") or h.get("key") or "(unnamed)"
            extra = self._extra_label(h, kind)
            item = QListWidgetItem(f"{label}{extra}")
            item.setData(Qt.ItemDataRole.UserRole, h)
            self.results.addItem(item)
        # Auto-open the first result
        if self.results.count() > 0:
            self.results.setCurrentRow(0)
            self._render_detail(self._last_results[0])

    @staticmethod
    def _classify(text: str) -> tuple[str, str]:
        """Determine (kind, query) from the raw input."""
        low = text.lower()
        if low.startswith("spell:"):
            return ("spell", text[6:].strip())
        if low.startswith("cond:") or low.startswith("condition:"):
            return ("condition", text.split(":", 1)[1].strip())
        return ("rule", text)

    @staticmethod
    def _extra_label(entry: dict[str, Any], kind: str) -> str:
        if kind == "spell":
            lvl = entry.get("level")
            school = entry.get("school")
            if lvl is not None:
                return f"  · level {lvl}{(' ' + school) if school else ''}"
        return ""

    def _on_pick(self, item: QListWidgetItem) -> None:
        entry = item.data(Qt.ItemDataRole.UserRole)
        if isinstance(entry, dict):
            self._render_detail(entry)

    def _render_detail(self, entry: dict[str, Any]) -> None:
        """Pull the most-useful fields into a markdown block."""
        lines: list[str] = []
        name = entry.get("name") or entry.get("key") or "(unnamed)"
        lines.append(f"## {name}")
        for key in ("level", "school", "casting_time", "range", "duration", "components"):
            if key in entry and entry[key] not in (None, ""):
                lines.append(f"**{key.replace('_', ' ').title()}:** {entry[key]}")
        # Bigger text blocks
        for key in ("desc", "description", "higher_level"):
            if key in entry and entry[key]:
                lines.append("")
                lines.append(str(entry[key]))
        self.detail.setMarkdown("\n\n".join(lines))


def build_srd_dock(parent: QWidget) -> QDockWidget:
    """Convenience constructor returning a ready-to-add QDockWidget."""
    dock = QDockWidget("SRD search", parent)
    dock.setObjectName("SrdSearchDock")
    dock.setAllowedAreas(Qt.DockWidgetArea.RightDockWidgetArea | Qt.DockWidgetArea.LeftDockWidgetArea)
    dock.setWidget(SrdSearchPanel(dock))
    return dock
