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
    QTextBrowser,
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


_DISCOVERY_FOLDER_NAMES = ("npcs", "members")


def _walk_to_encounter_root(npc_path: Path) -> Path:
    """Walk upward from a combat-runner-tagged file to the encounter folder.

    Supports both `npcs/` (monsters) and `members/` (PC-side characters like
    the black-ledger). Also supports nested grouping under either folder:
      <root>/npcs/<slug>.md                    → root
      <root>/npcs/gnolls/<slug>.md             → root (walks past gnolls/ AND npcs/)
      <root>/members/<slug>.md                 → root (party characters)
      <root>/npcs/wave1/<slug>.md              → root

    Strategy: walk up until we find a directory whose name is in
    `_DISCOVERY_FOLDER_NAMES`; its parent is the encounter root."""
    p = npc_path.parent
    cursor = p
    found_parent: Path | None = None
    while cursor != cursor.parent:  # stop at filesystem root
        if cursor.name in _DISCOVERY_FOLDER_NAMES:
            found_parent = cursor.parent
            break
        cursor = cursor.parent
    return found_parent if found_parent is not None else p


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


import yaml as _yaml  # stdlib fallback handled below


def load_party_config(path: Path) -> dict:
    """Load a combat-roster.yml and return its parsed dict.

    Returns a dict with keys 'party' (str) and 'players' (list of dicts).
    Each player dict has: name, id, max_hp, ac (all required).
    Raises ValueError on schema validation failure.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        raise ValueError(f"Cannot read party config {path}: {e}") from e

    try:
        import yaml
        data = yaml.safe_load(text)
    except Exception:
        # Fallback: manual YAML for the simple key: value format used here
        data = _parse_simple_roster_yaml(text)

    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected a mapping at top level")
    players = data.get("players", [])
    if not isinstance(players, list):
        raise ValueError(f"{path}: 'players' must be a list")
    required_keys = {"name", "id", "max_hp", "ac"}
    for i, p in enumerate(players):
        if not isinstance(p, dict):
            raise ValueError(f"{path}: player {i} is not a mapping")
        missing = required_keys - set(p.keys())
        if missing:
            raise ValueError(f"{path}: player {i} missing keys: {missing}")
        if not isinstance(p.get("max_hp"), int):
            raise ValueError(f"{path}: player {i} max_hp must be an integer")
        if not isinstance(p.get("ac"), int):
            raise ValueError(f"{path}: player {i} ac must be an integer")
    return data


def _parse_simple_roster_yaml(text: str) -> dict:
    """Minimal YAML-compatible parser for the combat-roster.yml format.
    Only handles: party: str, players: list of inline dicts.
    Used when the PyYAML library is not installed."""
    import re
    out: dict = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r'^party:\s*(.+)$', line)
        if m:
            out["party"] = m.group(1).strip().strip('"').strip("'")
            i += 1
            continue
        if line.strip() == "players:":
            players = []
            i += 1
            while i < len(lines) and lines[i].startswith("  "):
                entry_line = lines[i].strip().lstrip("- ").strip("{").strip("}")
                # Parse `key: value` pairs separated by commas
                player: dict = {}
                for kv in re.split(r',\s*', entry_line):
                    km = re.match(r'(\w+):\s*"?([^"]*)"?', kv.strip())
                    if km:
                        k, v = km.group(1), km.group(2)
                        if k in ("max_hp", "ac"):
                            player[k] = int(v)
                        else:
                            player[k] = v
                if player:
                    players.append(player)
                i += 1
            out["players"] = players
            continue
        i += 1
    return out


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
        # NOTE: defer `currentRowChanged` connection + setCurrentRow(0) until
        # the right pane is built (see end of this method). `setCurrentRow`
        # fires the signal synchronously, which would AttributeError on
        # `self.encounter_title` if the right pane doesn't exist yet.
        for enc in self.encounters:
            mtime_str = datetime.fromtimestamp(enc.latest_mtime, tz=timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
            item = QListWidgetItem(f"{enc.name}\n  {len(enc.npcs)} NPC{'s' if len(enc.npcs) != 1 else ''} · {mtime_str}")
            self.list_widget.addItem(item)
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

        # Preview pane: shows the encounter's _overview.md (terrain, hooks,
        # initial DM notes) when one exists. Big at-table win — DM-recall is
        # the #1 time-sink at session start.
        self.overview_view = QTextBrowser()
        self.overview_view.setOpenExternalLinks(False)
        self.overview_view.setStyleSheet(
            "background: #14171b; color: #b8bdc4; border: 1px solid #2a2f38; "
            "font-size: 11px; padding: 6px;"
        )
        self.overview_view.setMaximumHeight(160)
        right.addWidget(self.overview_view)

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

        # Now that the right pane exists, it's safe to wire the list-selection
        # signal and pre-select row 0 (which fires _on_select synchronously).
        self.list_widget.currentRowChanged.connect(self._on_select)
        if self.encounters:
            self.list_widget.setCurrentRow(0)
            self._on_select(0)

    # ─────────── helpers ───────────

    @staticmethod
    def _load_overview(enc: DiscoveredEncounter) -> str | None:
        """Look for `_overview.md` at the encounter root and return its body
        with the frontmatter stripped. Returns None if missing/unreadable."""
        path = enc.root / "_overview.md"
        if not path.exists():
            return None
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return None
        # Strip leading `---` frontmatter block
        if text.startswith("---"):
            end = text.find("---", 3)
            if end > 0:
                text = text[end + 3:].lstrip("\n")
        # Cap to a few hundred chars so the preview pane isn't a wall of text
        if len(text) > 1200:
            text = text[:1200].rstrip() + "\n\n*(truncated — open the file for the rest)*"
        return text

    # ─────────── selection handling ───────────

    def _on_select(self, row: int) -> None:
        if row < 0 or row >= len(self.encounters):
            return
        enc = self.encounters[row]
        self.encounter_title.setText(f"<b>{enc.name}</b>")
        self.encounter_root.setText(str(enc.root.relative_to(_REPO_ROOT)))

        # Load _overview.md if present (terrain / hooks / DM notes)
        self.overview_view.setMarkdown(self._load_overview(enc) or "*(no _overview.md at this encounter root)*")

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
