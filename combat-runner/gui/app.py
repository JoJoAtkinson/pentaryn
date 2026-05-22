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

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

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


from .encounter_picker import DiscoveredEncounter, EncounterPicker, load_party_config
from .main_window import MainWindow
from .state import EncounterState, NPCState, assign_combatant_ids

_REPO_ROOT = Path(__file__).resolve().parents[2]


# ─────────── headless-friendly construction helpers (used by tests) ───────────

def build_encounter_state(
    encounter: DiscoveredEncounter,
    counts: dict[str, int],
    party_config: dict | None = None,
    player_selections: dict[str, dict] | None = None,
) -> EncounterState:
    """Build the EncounterState from picker output. Pure construction — no UI.

    party_config: parsed output of load_party_config (if --party supplied).
    player_selections: {player_id: {current_hp: int, included: bool}} from picker UI.
    """
    # Per-session log file mirrors the existing CLI scheme.
    timestamp = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    mem_dir = _REPO_ROOT / "combat-runner" / ".memory" / encounter.name
    mem_dir.mkdir(parents=True, exist_ok=True)
    log_path = mem_dir / f"log-{timestamp}.md"

    combatants: list[NPCState] = []

    # 1. Build PC combatants from party config
    reserved_ids: set[str] = set()
    if party_config:
        player_selections = player_selections or {}
        for player in party_config.get("players", []):
            pid = str(player["id"])
            sel = player_selections.get(pid, {})
            if not sel.get("included", True):
                continue  # player sat this combat out
            current_hp = sel.get("current_hp", player["max_hp"])
            pc = NPCState(
                slug=f"pc-{pid}",
                name=player["name"],
                max_hp=player["max_hp"],
                ac=player["ac"],
                speed="30 ft.",  # PCs have no stored speed; placeholder
                cr=0.0,
                kind="pc",
                id=pid,
                member_hp=[current_hp],
            )
            combatants.append(pc)
            reserved_ids.add(pid)

    # 2. Build NPC combatants
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
        combatants.append(npc_state)

    # 3. Assign permanent ids (skipping player-reserved labels)
    assign_combatant_ids(combatants, reserved=reserved_ids)

    return EncounterState(
        name=encounter.name,
        root=encounter.root,
        log_path=log_path,
        npcs=combatants,
    )


def _parse_stat_table(text: str) -> dict | None:
    """Parse a Markdown stat-block table of the form:
        | **AC** | **HP** | **Speed** |
        |--------|--------|-----------|
        | 15 (...) | 27 (5d8+5) | 40 ft. |
    Cell ordering can be `AC HP Speed` or `HP AC Speed`. Extracts the leading
    integer from each cell (5e tables usually wrap with parenthetical detail).
    Returns a dict with any of `max_hp, ac, speed, cr` that were parseable,
    or None if no table was found.

    Also tries to pull Challenge / CR from a second row (`| **Challenge** | 1 (200 XP) |`).
    """
    import re as _re
    rows = text.splitlines()
    out: dict[str, int | str] = {}
    # Look for the header row containing both **HP** and **AC**
    for i, line in enumerate(rows):
        if "**AC**" in line and "**HP**" in line:
            # Column index map
            header_cells = [c.strip() for c in line.strip("|").split("|")]
            try:
                idx_ac = next(j for j, c in enumerate(header_cells) if "**AC**" in c)
                idx_hp = next(j for j, c in enumerate(header_cells) if "**HP**" in c)
                idx_speed = next((j for j, c in enumerate(header_cells) if "**Speed**" in c), -1)
            except StopIteration:
                continue
            # Skip the |---|---| separator row, find the data row
            for di in range(i + 1, min(i + 4, len(rows))):
                if "---" in rows[di]:
                    continue
                data_cells = [c.strip() for c in rows[di].strip("|").split("|")]
                if len(data_cells) <= max(idx_ac, idx_hp):
                    continue
                ac_match = _re.search(r"\d+", data_cells[idx_ac])
                hp_match = _re.search(r"\d+", data_cells[idx_hp])
                if ac_match:
                    out["ac"] = int(ac_match.group(0))
                if hp_match:
                    out["max_hp"] = int(hp_match.group(0))
                if idx_speed >= 0 and idx_speed < len(data_cells):
                    out["speed"] = data_cells[idx_speed]
                break
            break
    # Challenge row anywhere in the file
    chal = _re.search(r"\*\*Challenge\*\*\s*\|\s*([\d/.]+)", text)
    if chal:
        out["cr"] = chal.group(1)

    # Streamline #2 (variant): row-per-stat layout — the black-ledger members
    # use one row per attribute: `| **HP** | `21` (3d8) |` etc. Match each
    # individually if the column-style detector above didn't find what we need.
    def _row(label: str) -> _re.Match | None:
        # Look for `| **HP** | <value> |` row anywhere
        return _re.search(rf"^\s*\|\s*\*\*{label}\*\*\s*\|\s*([^|]+?)\s*\|", text, _re.MULTILINE)

    if "max_hp" not in out:
        m = _row("HP")
        if m:
            num = _re.search(r"\d+", m.group(1))
            if num:
                out["max_hp"] = int(num.group(0))
    if "ac" not in out:
        m = _row("AC")
        if m:
            num = _re.search(r"\d+", m.group(1))
            if num:
                out["ac"] = int(num.group(0))
    if "speed" not in out:
        m = _row("Speed")
        if m:
            out["speed"] = m.group(1).strip(" `")

    return out or None


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

    # Streamline #2: Markdown-table stat blocks (legacy / SRD-style).
    # Look for "| **AC** | **HP** | **Speed** |" rows followed by the data row.
    # Only applies when the status-line regexes didn't match — never override.
    if not (hp_match and ac_match):
        table_stats = _parse_stat_table(text)
        if table_stats:
            if not hp_match and "max_hp" in table_stats:
                hp_match = type("M", (), {"group": lambda _, n: str(table_stats["max_hp"])})()
            if not ac_match and "ac" in table_stats:
                ac_match = type("M", (), {"group": lambda _, n: str(table_stats["ac"])})()
            if not speed_match and "speed" in table_stats:
                speed_match = type("M", (), {"group": lambda _, n: table_stats["speed"]})()
            if not cr_match and "cr" in table_stats:
                cr_match = type("M", (), {"group": lambda _, n: table_stats["cr"]})()

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
    immunities: list[str] = []
    if immunity_match:
        immunities.append(immunity_match.group(1).lower())
    # G4(b): fold in standard 5e creature-type-derived damage immunities so the
    # LLM review sees them structured rather than having to infer from the
    # name. We scan the stat sheet for a creature-type keyword. The review
    # prompt still applies its own type-knowledge as a backstop — this just
    # makes the common cases (undead/construct) reliable.
    type_immunities = {
        "undead": ("poison", "necrotic"),
        "construct": ("poison",),
        "golem": ("poison",),
    }
    lowered = text.lower()
    for type_kw, imms in type_immunities.items():
        if re.search(rf"\b{type_kw}\b", lowered):
            immunities.extend(imms)
            break
    if immunities:
        # de-dup, preserve order
        seen: set[str] = set()
        out["immunities"] = tuple(
            i for i in immunities if not (i in seen or seen.add(i))
        )
    return out


def build_main_window(
    encounter: DiscoveredEncounter,
    counts: dict[str, int],
    with_llm: bool = True,
    party_config: dict | None = None,
    player_selections: dict[str, dict] | None = None,
) -> MainWindow:
    """Build a MainWindow ready to show. Used by both `main()` and tests.

    If `ANTHROPIC_API_KEY` is set AND `with_llm` is True, an LLM meta-controller
    is constructed and plugged in. Scenario tests pass `with_llm=False` to keep
    the QThreadPool free of real Anthropic SDK clients (otherwise SSL contexts
    pile up across many tests and segfault).

    party_config: parsed output of load_party_config (if --party supplied).
    player_selections: {player_id: {current_hp: int, included: bool}} from picker UI.
    """
    es = build_encounter_state(encounter, counts, party_config=party_config,
                               player_selections=player_selections)
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
    parser = argparse.ArgumentParser(prog="combat-gui", add_help=False)
    parser.add_argument("--party", metavar="PATH", default=None,
                        help="Path to a combat-roster.yml (party config)")
    args, _ = parser.parse_known_args()

    _party_config: dict | None = None
    if args.party:
        import logging
        try:
            _party_config = load_party_config(Path(args.party))
        except ValueError as exc:
            # Boot can't fail — warn and continue without party
            logging.getLogger(__name__).warning("party config load failed: %s", exc)

    app = QApplication(sys.argv)
    app.setApplicationName("Combat Runner")
    _load_dice_font()

    if _QT_MATERIAL_AVAILABLE:
        apply_stylesheet(app, theme="dark_blue.xml")

    # Main loop: show picker → build window → on close, optionally re-open picker
    current_window: MainWindow | None = None
    picker = EncounterPicker(party_config=_party_config)

    def _launch(
        encounter: DiscoveredEncounter,
        counts: dict[str, int],
        party_config: dict | None,
        player_selections: dict,
    ) -> None:
        nonlocal current_window
        try:
            current_window = build_main_window(encounter, counts,
                                               party_config=party_config,
                                               player_selections=player_selections)
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
        new_picker = EncounterPicker(party_config=_party_config)
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
