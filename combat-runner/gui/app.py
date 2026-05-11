"""Application entry point.

`python -m combat_runner.gui.app` or `make combat-gui`:
  - Boots QApplication
  - Applies qt-material dark_blue theme
  - Shows the encounter picker
  - On Launch → builds EncounterState + MainWindow
  - On Encounter→Switch menu → re-opens the picker

Designed so the launch flow can also be invoked headlessly for testing via
`build_main_window(encounter, counts)` — pytest-qt grabs that and skips the dialog.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QFontDatabase
from PySide6.QtWidgets import QApplication, QMessageBox

# Load .env so ANTHROPIC_API_KEY is available for v0.2+ LLM features
try:
    from dotenv import load_dotenv
    _REPO_ROOT = Path(__file__).resolve().parents[2]
    load_dotenv(_REPO_ROOT / ".env", override=False)
except ImportError:
    pass

# qt-material is optional at import time — gracefully fall back to default dark
try:
    from qt_material import apply_stylesheet
    _QT_MATERIAL_AVAILABLE = True
except ImportError:
    _QT_MATERIAL_AVAILABLE = False


from .encounter_picker import DiscoveredEncounter, EncounterPicker
from .main_window import MainWindow
from .state import EncounterState, NPCState


_REPO_ROOT = Path(__file__).resolve().parents[2]


# ─────────── headless-friendly construction helpers (used by tests) ───────────

def build_encounter_state(
    encounter: DiscoveredEncounter, counts: dict[str, int]
) -> EncounterState:
    """Build the EncounterState from picker output. Pure construction — no UI."""
    # Per-session log file mirrors the existing CLI scheme.
    timestamp = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    mem_dir = _REPO_ROOT / "combat-runner" / ".memory" / encounter.name
    mem_dir.mkdir(parents=True, exist_ok=True)
    log_path = mem_dir / f"log-{timestamp}.md"

    npcs: list[NPCState] = []
    for picker_npc in encounter.npcs:
        count = counts.get(picker_npc.slug, 1)
        # Extract more details from the .md frontmatter for HP/AC/etc.
        details = _parse_npc_details(picker_npc.md_path, picker_npc.slug, picker_npc.name)
        npc_state = NPCState(
            slug=picker_npc.slug,
            name=picker_npc.name,
            max_hp=details["max_hp"],
            ac=details["ac"],
            speed=details["speed"],
            cr=details["cr"],
            immunities=details["immunities"],
            count=count,
        )
        npcs.append(npc_state)

    return EncounterState(
        name=encounter.name,
        root=encounter.root,
        log_path=log_path,
        npcs=npcs,
    )


def _parse_npc_details(md_path: Path, slug: str, name: str) -> dict:
    """Best-effort parse of the NPC's status line and frontmatter to extract
    max_hp / ac / speed / cr / immunities. Falls back to safe defaults if the
    file's not in the expected format."""
    import re
    defaults = {
        "max_hp": 30,
        "ac": 12,
        "speed": "30 ft.",
        "cr": 1.0,
        "immunities": (),
    }
    try:
        text = md_path.read_text(encoding="utf-8")
    except OSError:
        return defaults

    # Status line: `**HP** 84 (8d10+40) **·** **AC** 16 ...`
    hp_match = re.search(r"\*\*HP\*\*\s*(\d+)", text)
    ac_match = re.search(r"\*\*AC\*\*\s*(\d+)", text)
    speed_match = re.search(r"\*\*Speed\*\*\s*([^*]+?)\s*\*\*", text)
    cr_match = re.search(r"\*\*CR\*\*\s*([\d/.]+)", text)
    immunity_match = re.search(r"\*\*([A-Za-z]+)\s+immunity\*\*", text)

    out = dict(defaults)
    if hp_match:
        out["max_hp"] = int(hp_match.group(1))
    if ac_match:
        out["ac"] = int(ac_match.group(1))
    if speed_match:
        out["speed"] = speed_match.group(1).strip()
    if cr_match:
        try:
            cr_str = cr_match.group(1)
            if "/" in cr_str:
                num, den = cr_str.split("/")
                out["cr"] = float(num) / float(den)
            else:
                out["cr"] = float(cr_str)
        except (ValueError, ZeroDivisionError):
            pass
    if immunity_match:
        out["immunities"] = (immunity_match.group(1).lower(),)
    return out


def build_main_window(encounter: DiscoveredEncounter, counts: dict[str, int], with_llm: bool = True) -> MainWindow:
    """Build a MainWindow ready to show. Used by both `main()` and tests.

    If `ANTHROPIC_API_KEY` is set AND `with_llm` is True, an LLM meta-controller
    is constructed and plugged in. Scenario tests pass `with_llm=False` to keep
    the QThreadPool free of real Anthropic SDK clients (otherwise SSL contexts
    pile up across many tests and segfault).
    """
    es = build_encounter_state(encounter, counts)
    win = MainWindow(es)
    # Plug in LLM controller. The on_state_changed callback walks every tab and
    # refreshes from the live state — that's how LLM tool calls (set_hp, etc.)
    # propagate to the UI.
    import os
    if with_llm and os.environ.get("ANTHROPIC_API_KEY"):
        try:
            from .llm_controller import LLMController

            def _refresh_all_tabs() -> None:
                for i in range(win.tabs.count()):
                    tab = win.tabs.widget(i)
                    if hasattr(tab, "refresh"):
                        tab.refresh()
                win.round_btn.setText(win._round_btn_text())

            controller = LLMController(
                encounter_state=es,
                log_path=str(es.log_path),
                on_state_changed=_refresh_all_tabs,
            )
            win.set_llm_controller(controller)
        except Exception:
            # LLM is a nice-to-have; never block boot on its failure.
            pass
    return win


# ─────────── main entry ───────────

def _load_dice_font() -> None:
    """Register `fonts/dnd-dice.ttf` with Qt so the combat log can render the
    custom d4/d6/d8/d10/d12/d20 glyphs. Logs a warning and continues if the
    file is missing or fails to load — text falls back to the dice numerals."""
    import logging
    font_path = _REPO_ROOT / "fonts" / "dnd-dice.ttf"
    if not font_path.exists():
        logging.getLogger(__name__).warning("dnd-dice.ttf not found at %s", font_path)
        return
    font_id = QFontDatabase.addApplicationFont(str(font_path))
    if font_id < 0:
        logging.getLogger(__name__).warning("failed to load dnd-dice font at %s", font_path)


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("Combat Runner")
    _load_dice_font()

    if _QT_MATERIAL_AVAILABLE:
        apply_stylesheet(app, theme="dark_blue.xml")

    # Main loop: show picker → build window → on close, optionally re-open picker
    current_window: MainWindow | None = None
    picker = EncounterPicker()

    def _launch(encounter: DiscoveredEncounter, counts: dict[str, int]) -> None:
        nonlocal current_window
        try:
            current_window = build_main_window(encounter, counts)
        except Exception as exc:
            QMessageBox.critical(None, "Launch failed", f"{exc}")
            picker.show()
            return
        current_window.encounter_switch_requested.connect(_switch)
        current_window.show()

    def _switch() -> None:
        nonlocal current_window
        if current_window is not None:
            current_window.close()
            current_window = None
        new_picker = EncounterPicker()
        new_picker.launched.connect(_launch)
        new_picker.show()

    picker.launched.connect(_launch)
    if not picker.encounters:
        QMessageBox.warning(
            None,
            "No encounters found",
            "Tag at least one NPC .md file with <code>#combat-runner</code> to enable discovery.",
        )
        return 0
    picker.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
