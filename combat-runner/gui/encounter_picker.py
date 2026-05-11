"""Encounter picker dialog — shown at app launch and via Encounter → Switch menu.

Discovers encounters using the SAME rule as `combat-runner/launch.py`:
  every `.md` under `world/**` with `#combat-runner` in its first 30 lines →
  walk up past `npcs/` → the parent dir is the encounter root.

The dialog shows discovered encounters sorted by most-recent NPC-file mtime.
Selecting an encounter expands a per-NPC count panel; the user adjusts counts
and clicks Launch. Emits `launched(encounter_dict, counts_dict)` on Launch.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)


_REPO_ROOT = Path(__file__).resolve().parents[2]
_EXCLUDED_PATH_PARTS = {".history", ".cache", ".output", "image", "images"}
_COMBAT_TAG = "#combat-runner"
_FRONTMATTER_COUNT_RE = re.compile(r"^count\s*:\s*(\d+)\s*$", re.MULTILINE)


@dataclass
class DiscoveredNPC:
    slug: str
    name: str
    md_path: Path
    default_count: int = 1


@dataclass
class DiscoveredEncounter:
    name: str
    root: Path
    npcs: list[DiscoveredNPC]
    latest_mtime: float


# ─────────── Discovery (mirrors combat-runner/launch.py) ───────────

def _find_tagged_files() -> list[Path]:
    """All .md files under world/ whose first ~30 lines mention the combat tag."""
    matches: list[Path] = []
    world = _REPO_ROOT / "world"
    if not world.exists():
        return matches
    for md in world.rglob("*.md"):
        if any(part in _EXCLUDED_PATH_PARTS for part in md.parts):
            continue
        try:
            with md.open(encoding="utf-8") as f:
                head = "".join([next(f, "") for _ in range(30)])
        except OSError:
            continue
        if _COMBAT_TAG in head:
            matches.append(md)
    return matches


def _walk_to_encounter_root(npc_path: Path) -> Path:
    p = npc_path.parent
    while p.name == "npcs":
        p = p.parent
    return p


def _parse_default_count(md_path: Path) -> int:
    """Read the `count: N` field from frontmatter if present, default 1."""
    try:
        text = md_path.read_text(encoding="utf-8")
    except OSError:
        return 1
    # Only check inside the leading --- frontmatter block
    if not text.startswith("---"):
        return 1
    end = text.find("---", 3)
    if end < 0:
        return 1
    frontmatter = text[3:end]
    m = _FRONTMATTER_COUNT_RE.search(frontmatter)
    if m:
        try:
            return max(1, int(m.group(1)))
        except ValueError:
            return 1
    return 1


def _parse_name(md_path: Path) -> str:
    """Read `name: X` from frontmatter, fall back to filename stem in title case."""
    try:
        text = md_path.read_text(encoding="utf-8")
    except OSError:
        return md_path.stem.replace("-", " ").title()
    if text.startswith("---"):
        end = text.find("---", 3)
        if end > 0:
            m = re.search(r"^name\s*:\s*(.+?)\s*$", text[3:end], re.MULTILINE)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    return md_path.stem.replace("-", " ").title()


def discover_encounters() -> list[DiscoveredEncounter]:
    """Returns all discovered encounters, sorted by most-recent NPC mtime (newest first)."""
    npc_files = _find_tagged_files()
    by_root: dict[Path, list[Path]] = {}
    for nf in npc_files:
        root = _walk_to_encounter_root(nf)
        by_root.setdefault(root, []).append(nf)

    encounters: list[DiscoveredEncounter] = []
    for root, files in by_root.items():
        npcs: list[DiscoveredNPC] = []
        for f in sorted(files):
            npcs.append(
                DiscoveredNPC(
                    slug=f.stem,
                    name=_parse_name(f),
                    md_path=f,
                    default_count=_parse_default_count(f),
                )
            )
        latest = max(f.stat().st_mtime for f in files)
        encounters.append(
            DiscoveredEncounter(name=root.name, root=root, npcs=npcs, latest_mtime=latest)
        )

    encounters.sort(key=lambda e: e.latest_mtime, reverse=True)
    return encounters


# ─────────── Dialog ───────────

class EncounterPicker(QDialog):
    """Modal dialog: pick an encounter + set per-NPC count, then Launch."""

    launched = Signal(object, dict)  # (DiscoveredEncounter, {slug: count})

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Combat Runner — Pick an encounter")
        self.setMinimumSize(640, 480)

        self.encounters = discover_encounters()
        self._build_ui()

    def _build_ui(self) -> None:
        root = QHBoxLayout(self)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(12)

        # Left: encounter list
        left = QVBoxLayout()
        left.addWidget(QLabel("<b>Encounters</b> (most recent first)"))
        self.list_widget = QListWidget()
        self.list_widget.setMinimumWidth(220)
        self.list_widget.currentRowChanged.connect(self._on_select)
        for enc in self.encounters:
            mtime_str = datetime.fromtimestamp(enc.latest_mtime, tz=timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
            item = QListWidgetItem(f"{enc.name}\n  {len(enc.npcs)} NPC{'s' if len(enc.npcs) != 1 else ''} · {mtime_str}")
            self.list_widget.addItem(item)
        if self.encounters:
            self.list_widget.setCurrentRow(0)
        left.addWidget(self.list_widget, 1)
        left_panel = QFrame()
        left_panel.setLayout(left)
        root.addWidget(left_panel)

        # Right: details + per-NPC counts
        right = QVBoxLayout()
        self.encounter_title = QLabel("<i>Select an encounter</i>")
        self.encounter_title.setStyleSheet("font-size: 16px; font-weight: 600; padding-bottom: 4px;")
        right.addWidget(self.encounter_title)

        self.encounter_root = QLabel("")
        self.encounter_root.setStyleSheet("color: #6c8eba; font-size: 10px; padding-bottom: 8px;")
        right.addWidget(self.encounter_root)

        right.addWidget(QLabel("<b>Per-NPC counts</b>"))
        self.counts_form_host = QWidget()
        self.counts_form = QFormLayout(self.counts_form_host)
        self.counts_form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        right.addWidget(self.counts_form_host, 1)

        # Buttons
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        self.launch_btn = buttons.addButton("Launch", QDialogButtonBox.ButtonRole.AcceptRole)
        self.launch_btn.setEnabled(False)
        buttons.accepted.connect(self._on_launch)
        buttons.rejected.connect(self.reject)
        right.addWidget(buttons)
        root.addLayout(right, 1)

        # If we have an encounter pre-selected, populate the right pane
        if self.encounters:
            self._on_select(0)

    # ─────────── selection handling ───────────

    def _on_select(self, row: int) -> None:
        if row < 0 or row >= len(self.encounters):
            return
        enc = self.encounters[row]
        self.encounter_title.setText(f"<b>{enc.name}</b>")
        self.encounter_root.setText(str(enc.root.relative_to(_REPO_ROOT)))

        # Rebuild count form
        while self.counts_form.rowCount() > 0:
            self.counts_form.removeRow(0)
        self._count_spinboxes: dict[str, QSpinBox] = {}
        for npc in enc.npcs:
            spin = QSpinBox()
            spin.setRange(1, 20)
            spin.setValue(npc.default_count)
            spin.setSingleStep(1)
            label = QLabel(f"{npc.name}  ({npc.slug})")
            self.counts_form.addRow(label, spin)
            self._count_spinboxes[npc.slug] = spin

        self.launch_btn.setEnabled(True)

    def _on_launch(self) -> None:
        row = self.list_widget.currentRow()
        if row < 0 or row >= len(self.encounters):
            return
        enc = self.encounters[row]
        counts = {slug: spin.value() for slug, spin in self._count_spinboxes.items()}
        self.launched.emit(enc, counts)
        self.accept()
