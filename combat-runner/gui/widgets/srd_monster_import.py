"""SRD-monster import wizard.

Search the SRD by name → pick a result → import as a `#combat-runner` NPC.
Writes:
  - `world/.../<encounter-folder>/npcs/<slug>.md` (stub stat sheet)
  - one DB row per attack in the SRD entry (`single_attack` or `multiattack`)

Limitations (v1):
  - SRD "Multiattack" action (referential — "makes 2 claw attacks") is skipped.
    The DM can wire one manually after import via `combat_action_upsert`.
  - Reactions in the SRD lack the structured `attacker_save` shape our DB
    needs, so they're skipped too.
  - Bonus/utility actions with no attack are imported as `utility` stubs with
    the `effect` text pulled from the SRD desc.

Even with those gaps this turns ~10 minutes of manual stat-block authoring
into one form submission.
"""

from __future__ import annotations

import importlib
import re
import sys
from pathlib import Path
from typing import Any

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)


_REPO_ROOT = Path(__file__).resolve().parents[3]


def _get_srd():
    scripts_dir = _REPO_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    return importlib.import_module("srd5_2")


def _get_db():
    scripts_dir = _REPO_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    return importlib.import_module("combat_actions_db")


# ─────────── attack mapping ───────────

def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _normalise_die(die_type: str | None) -> str:
    """SRD returns `D6`, `D8`, …; the combat_actions DB expects lowercase `d6`."""
    return (die_type or "").lower()


def _damage_type_str(attack: dict[str, Any]) -> str:
    """Pull the damage type. SRD has a `damage_type` AND an `extra_damage_type`
    — different attack records use different ones. Prefer `damage_type` when
    set, fall back to `extra_damage_type.key`."""
    dt = attack.get("damage_type")
    if isinstance(dt, dict) and dt.get("key"):
        return str(dt["key"]).lower()
    if isinstance(dt, str) and dt:
        return dt.lower()
    extra = attack.get("extra_damage_type")
    if isinstance(extra, dict) and extra.get("key"):
        return str(extra["key"]).lower()
    return "untyped"


def _action_to_spec(action: dict[str, Any]) -> dict[str, Any] | None:
    """Map one SRD action into a combat_actions_db spec dict, or None to skip.

    Skips Multiattack (referential), reactions (need structured attacker_save),
    and anything with no attacks AND no usable desc text."""
    name = (action.get("name") or "").strip()
    desc = (action.get("desc") or "").strip()
    if not name:
        return None

    name_lower = name.lower()
    if name_lower == "multiattack":
        return None  # Referential — needs manual setup
    if action.get("action_type") == "REACTION":
        return None  # Skip; doesn't fit our reaction schema cleanly

    attacks = action.get("attacks") or []
    if attacks:
        # Map each into an attacks[] entry (single_attack if one, multiattack if many)
        mapped: list[dict[str, Any]] = []
        for atk in attacks:
            mapped.append({
                "name": atk.get("name") or name,
                "to_hit_bonus": int(atk.get("to_hit_mod") or 0),
                "damage": f"{int(atk.get('damage_die_count') or 1)}{_normalise_die(atk.get('damage_die_type'))}",
                "damage_modifier": int(atk.get("damage_bonus") or 0),
                "damage_type": _damage_type_str(atk),
            })
        spec_type = "multiattack" if len(mapped) > 1 else "single_attack"
        first = attacks[0]
        spec: dict[str, Any] = {
            "type": spec_type,
            "verbs": _verbs_for(name),
            "narration": desc or name,
            "attacks": mapped,
        }
        # Range hint: melee weapons have reach, ranged have range/long_range
        if first.get("reach"):
            spec["range"] = f"reach {first['reach']} ft"
        elif first.get("range"):
            long_r = first.get("long_range") or first["range"]
            spec["range"] = f"{first['range']}/{long_r} ft"
        return spec

    # Non-attack action with desc → utility stub
    if desc:
        return {
            "type": "utility",
            "verbs": _verbs_for(name),
            "narration": name,
            "effect": desc,
        }
    return None


def _verbs_for(action_name: str) -> list[str]:
    """Auto-generate sensible verb list from the action name. The DM can edit."""
    low = action_name.lower()
    verbs: list[str] = []
    # The slug itself, hyphen-stripped
    slug_form = _slugify(action_name).replace("-", " ")
    if slug_form and slug_form != low:
        verbs.append(slug_form)
    # First word
    first = low.split()[0] if low else ""
    if first and first not in verbs:
        verbs.append(first)
    # Whole name lowercase
    if low not in verbs:
        verbs.append(low)
    return verbs[:5]


# ─────────── .md authoring ───────────

def _fmt_speed(speed: Any) -> str:
    """SRD speed can be a string, a list ('30 ft., climb 20 ft.'), or a dict
    of {walk, fly, climb, ...}. Reduce to the .md status-line form."""
    if isinstance(speed, str) and speed.strip():
        return speed.strip()
    if isinstance(speed, list):
        return ", ".join(str(p) for p in speed if p)
    if isinstance(speed, dict):
        unit = speed.get("unit") or "feet"
        unit_short = "ft." if unit.startswith("foot") or unit.startswith("feet") else unit
        parts: list[str] = []
        # Order: walk first, then specials
        for kind in ("walk", "fly", "climb", "swim", "burrow"):
            val = speed.get(kind)
            if val:
                label = f"{val} {unit_short}" if kind == "walk" else f"{kind} {val} {unit_short}"
                parts.append(label)
        if parts:
            return ", ".join(parts)
    return "30 ft."


def _build_md_frontmatter(monster: dict[str, Any], location: str, count: int = 1) -> str:
    name = monster.get("name") or "Unnamed"
    cr = monster.get("challenge_rating") or 1
    hp = monster.get("hit_points") or 10
    ac = monster.get("armor_class") or 10
    speed = _fmt_speed(monster.get("speed_all") or monster.get("speed"))
    # Tags: combat-runner is mandatory, plus a type-tag + cr-tag
    # SRD `type` can be a string OR a dict like {"name": "Humanoid", "key": "humanoid"}
    raw_type = monster.get("type")
    if isinstance(raw_type, dict):
        mtype = str(raw_type.get("key") or raw_type.get("name") or "").lower().strip()
    else:
        mtype = str(raw_type or "").lower().strip()
    tags = ["#combat-runner"]
    if mtype:
        tags.append(f"#{mtype}")
    if location:
        tags.append(f"#{location}")
    tags.append(f"#cr-{str(cr).replace('/', '-')}")
    tag_block = ", ".join(f'"{t}"' for t in tags)

    count_field = f"count: {count}\n" if count > 1 else ""

    return f"""---
name: {name}
created: imported-from-srd
status: active
location: {location}
{count_field}tags: [{tag_block}]
---
# {name}

**HP** {hp} **·** **AC** {ac} **·** **Speed** {speed} **·** **CR** {cr}

> Imported from SRD. Refine tactics / immunities / status line by hand.

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist

- Reaction refreshes (if any).
- Recharge rolls (if any).

## Tactics

*(edit me)*

## Description

*(edit me)*
"""


# ─────────── dialog ───────────

class SrdMonsterImportDialog(QDialog):
    """Search SRD → pick → import to a target encounter folder."""

    imported = Signal(str, str)  # (slug, md_path)

    def __init__(self, default_encounter_root: Path | None = None, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Add NPC from SRD")
        self.setMinimumSize(720, 520)
        self._target_dir = default_encounter_root
        self._last_results: list[dict[str, Any]] = []
        self._build_ui()

    # ─────────── UI ───────────

    def _build_ui(self) -> None:
        root = QVBoxLayout(self)

        # Search row
        search_row = QHBoxLayout()
        search_row.addWidget(QLabel("Search:"))
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("goblin · troll · frost giant · ...")
        self.search_input.returnPressed.connect(self._run_search)
        search_row.addWidget(self.search_input, 1)
        root.addLayout(search_row)

        # Results + preview side-by-side
        body = QHBoxLayout()
        self.results = QListWidget()
        self.results.setMinimumWidth(240)
        self.results.currentRowChanged.connect(self._on_select)
        body.addWidget(self.results, 1)

        self.preview = QTextBrowser()
        self.preview.setStyleSheet(
            "background: #14171b; color: #b8bdc4; border: 1px solid #2a2f38; "
            "font-size: 11px; padding: 6px;"
        )
        body.addWidget(self.preview, 2)
        root.addLayout(body, 1)

        # Target encounter row
        target_row = QHBoxLayout()
        target_row.addWidget(QLabel("Target encounter folder:"))
        self.target_label = QLabel(self._target_dir_display())
        self.target_label.setStyleSheet("color: #6c8eba;")
        target_row.addWidget(self.target_label, 1)
        from PySide6.QtWidgets import QPushButton
        pick_btn = QPushButton("Browse…")
        pick_btn.clicked.connect(self._pick_target)
        target_row.addWidget(pick_btn)
        root.addLayout(target_row)

        # Action buttons
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        self.import_btn = buttons.addButton("Import", QDialogButtonBox.ButtonRole.AcceptRole)
        self.import_btn.setEnabled(False)
        buttons.accepted.connect(self._on_import)
        buttons.rejected.connect(self.reject)
        root.addWidget(buttons)

    def _target_dir_display(self) -> str:
        if self._target_dir is None:
            return "<i>(none — pick one)</i>"
        try:
            return str(self._target_dir.relative_to(_REPO_ROOT))
        except ValueError:
            return str(self._target_dir)

    def _pick_target(self) -> None:
        start = str(self._target_dir or _REPO_ROOT / "world")
        choice = QFileDialog.getExistingDirectory(self, "Pick encounter folder", start)
        if choice:
            self._target_dir = Path(choice)
            self.target_label.setText(self._target_dir_display())

    # ─────────── search ───────────

    def _run_search(self) -> None:
        q = self.search_input.text().strip()
        if not q:
            return
        try:
            srd = _get_srd()
            payload = srd.search_monsters(name=q)
        except Exception as exc:  # noqa: BLE001
            QMessageBox.warning(self, "Search failed", str(exc))
            return
        hits = payload.get("results", []) if isinstance(payload, dict) else []
        self._last_results = hits
        self.results.clear()
        for h in hits:
            label = f"{h.get('name')} · CR {h.get('challenge_rating')} · HP {h.get('hit_points')}"
            item = QListWidgetItem(label)
            self.results.addItem(item)
        if hits:
            self.results.setCurrentRow(0)

    def _on_select(self, row: int) -> None:
        if row < 0 or row >= len(self._last_results):
            self.preview.clear()
            self.import_btn.setEnabled(False)
            return
        m = self._last_results[row]
        self.preview.setMarkdown(self._render_preview(m))
        self.import_btn.setEnabled(self._target_dir is not None)

    def _render_preview(self, m: dict[str, Any]) -> str:
        lines = [f"## {m.get('name')}"]
        lines.append(
            f"**CR** {m.get('challenge_rating')} · "
            f"**HP** {m.get('hit_points')} · "
            f"**AC** {m.get('armor_class')} · "
            f"**Speed** {m.get('speed_all') or m.get('speed')}"
        )
        actions = m.get("actions") or []
        importable = [a for a in actions if _action_to_spec(a) is not None]
        skipped = [a for a in actions if _action_to_spec(a) is None]
        lines.append("")
        lines.append(f"**Actions to import ({len(importable)}):**")
        for a in importable:
            spec = _action_to_spec(a)
            lines.append(f"- `{_slugify(a['name'])}` ({spec['type']})")
        if skipped:
            lines.append("")
            lines.append(f"**Skipped ({len(skipped)}):** " + ", ".join(a.get("name", "?") for a in skipped))
        return "\n\n".join(lines)

    # ─────────── import ───────────

    def _on_import(self) -> None:
        row = self.results.currentRow()
        if row < 0 or row >= len(self._last_results) or self._target_dir is None:
            return
        m = self._last_results[row]
        slug = _slugify(m.get("name") or "unnamed")

        # Determine encounter location name (parent of /npcs/ or the folder itself)
        npcs_dir = self._target_dir / "npcs"
        if self._target_dir.name == "npcs":
            npcs_dir = self._target_dir
        npcs_dir.mkdir(parents=True, exist_ok=True)
        encounter_root = npcs_dir.parent
        location = encounter_root.name

        md_path = npcs_dir / f"{slug}.md"
        if md_path.exists():
            if QMessageBox.question(
                self, "Overwrite?",
                f"{md_path.name} exists. Overwrite the .md AND its DB rows?",
            ) != QMessageBox.StandardButton.Yes:
                return

        md_path.write_text(_build_md_frontmatter(m, location=location), encoding="utf-8")

        # Write each action as a DB row
        db = _get_db()
        imported_actions: list[str] = []
        errors: list[str] = []
        for action in (m.get("actions") or []):
            spec = _action_to_spec(action)
            if spec is None:
                continue
            action_slug = _slugify(action["name"])
            try:
                db.upsert(slug, action_slug, spec)
                imported_actions.append(action_slug)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{action_slug}: {exc}")

        summary = (
            f"Imported `{slug}` → `{md_path.relative_to(_REPO_ROOT)}`\n"
            f"Actions written: {len(imported_actions)} ({', '.join(imported_actions) or 'none'})"
        )
        if errors:
            summary += "\n\nErrors:\n  " + "\n  ".join(errors)
        QMessageBox.information(self, "Imported", summary)
        self.imported.emit(slug, str(md_path))
        self.accept()
