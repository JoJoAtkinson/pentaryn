"""MainWindow — the top-level combat window with tabs, menu bar, round counter.

For v0.1, supports:
  - Multiple tabs (one per spawned NPC instance)
  - File / Encounter / View / Help menu bar
  - Clickable round counter button
  - Tab-key cycling between tabs (Cmd+Number jumps directly)
  - Movable tabs (Qt's native drag-drop)

For v0.2 onward, LLM controller wiring + suggestion bar will be plugged in via
`set_llm_controller(controller)` hooks.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from PySide6.QtCore import Qt, QEvent, Signal
from PySide6.QtGui import QAction, QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QApplication,
    QFileDialog,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QStatusBar,
    QTabWidget,
    QToolBar,
    QWidget,
)

from .state import deserialize_encounter, serialize_encounter

from .event_bus import (
    Event,
    EventBus,
    TriggerMatch,
    TriggerMatcher,
    WatchMatcher,
    collect_triggers_from_db,
    collect_watches_from_db,
    round_event,
)
from .npc_tab import NPCTab
from .state import EncounterState, NPCState
from .suggestion_driver import SuggestionDriver
from .widgets.reaction_prompt import ReactionPromptDialog
from .widgets.srd_panel import build_srd_dock
from .widgets.suggestion_bar import Suggestion


_REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_actions_db():
    """Lazy import scripts/combat_actions_db."""
    scripts_dir = _REPO_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    spec = importlib.util.spec_from_file_location("combat_actions_db", scripts_dir / "combat_actions_db.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class MainWindow(QMainWindow):
    """Top-level combat window."""

    # Signaled when the user picks Encounter→Switch encounter… from the menu.
    encounter_switch_requested = Signal()

    def __init__(self, encounter_state: EncounterState, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.encounter_state = encounter_state

        self.setWindowTitle(f"Combat Runner — {encounter_state.name}")
        self.resize(1100, 720)

        self._build_menu()
        self._build_central()
        self._wire_shortcuts()
        # SRD lookup dock — hidden by default, toggle via View menu (Ctrl+/)
        self._srd_dock = build_srd_dock(self)
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, self._srd_dock)
        self._srd_dock.hide()

    # ─────────── UI scaffolding ───────────

    def _build_menu(self) -> None:
        menu_bar = self.menuBar()

        file_menu = menu_bar.addMenu("File")
        save_action = QAction("Save snapshot…", self)
        save_action.setShortcut(QKeySequence("Ctrl+S"))
        save_action.triggered.connect(self._save_snapshot)
        file_menu.addAction(save_action)
        load_action = QAction("Load snapshot…", self)
        load_action.setShortcut(QKeySequence("Ctrl+O"))
        load_action.triggered.connect(self._load_snapshot)
        file_menu.addAction(load_action)
        file_menu.addSeparator()
        quit_action = QAction("Close window", self)
        quit_action.setShortcut(QKeySequence.StandardKey.Close)
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)

        encounter_menu = menu_bar.addMenu("Encounter")
        switch_action = QAction("Switch encounter…", self)
        switch_action.setShortcut(QKeySequence("Ctrl+E"))
        switch_action.triggered.connect(self.encounter_switch_requested.emit)
        encounter_menu.addAction(switch_action)
        encounter_menu.addSeparator()
        add_from_srd_action = QAction("Add NPC from SRD…", self)
        add_from_srd_action.setShortcut(QKeySequence("Ctrl+N"))
        add_from_srd_action.triggered.connect(self._open_srd_import)
        encounter_menu.addAction(add_from_srd_action)

        view_menu = menu_bar.addMenu("View")
        prev_tab = QAction("Previous tab", self)
        prev_tab.setShortcut(QKeySequence("Ctrl+Shift+Tab"))
        prev_tab.triggered.connect(lambda: self._cycle_tab(-1))
        view_menu.addAction(prev_tab)
        next_tab = QAction("Next tab", self)
        next_tab.setShortcut(QKeySequence("Ctrl+Tab"))
        next_tab.triggered.connect(lambda: self._cycle_tab(1))
        view_menu.addAction(next_tab)
        view_menu.addSeparator()
        toggle_srd = QAction("Toggle SRD search panel", self)
        toggle_srd.setShortcut(QKeySequence("Ctrl+/"))
        toggle_srd.triggered.connect(self._toggle_srd_dock)
        view_menu.addAction(toggle_srd)

        help_menu = menu_bar.addMenu("Help")
        about = QAction("About Combat Runner", self)
        about.triggered.connect(self._show_about)
        help_menu.addAction(about)

        # Top-right round-counter button placed on a permanent toolbar so it
        # sits in the same row as the menu visually on macOS.
        round_bar = QToolBar()
        round_bar.setMovable(False)
        round_bar.setFloatable(False)
        round_bar.addWidget(QLabel("  "))  # spacer
        self.round_btn = QPushButton(self._round_btn_text())
        self.round_btn.setToolTip(
            "Click to advance the round (refreshes reactions + rolls recharges for every NPC).\n"
            "Use the LLM ('we're still on round X') if you mis-click."
        )
        self.round_btn.setStyleSheet(
            "padding: 4px 14px; background: #1e2530; color: #ffffff; "
            "border: 1px solid #448aff; border-radius: 4px; font-weight: 600;"
        )
        self.round_btn.clicked.connect(self._advance_round)
        round_bar.addWidget(self.round_btn)
        self.addToolBar(Qt.ToolBarArea.TopToolBarArea, round_bar)

    def _build_central(self) -> None:
        self.tabs = QTabWidget()
        self.tabs.setMovable(True)  # drag-drop reorder, native
        self.tabs.setTabsClosable(False)  # we don't want accidental close mid-fight
        self.tabs.currentChanged.connect(self._on_tab_changed)
        self.setCentralWidget(self.tabs)

        # Load action surface (DB) once, filter per-NPC. Stash for per-tab
        # action-surface lookups (suggestion fetcher uses this).
        self._db = _load_actions_db()

        # Event bus + trigger matcher — events fired by tab state mutations
        # flow to _on_event below, which surfaces a ReactionPromptDialog when
        # any declared trigger matches.
        self.event_bus = EventBus()
        npc_slugs = [n.slug for n in self.encounter_state.npcs]
        triggers = collect_triggers_from_db(self._db, npc_slugs)
        watches = collect_watches_from_db(self._db, npc_slugs)
        self.trigger_matcher = TriggerMatcher(triggers)
        self.watch_matcher = WatchMatcher(watches)
        self._handling_event = False  # re-entry guard for the trigger pipeline
        # Watch-driven suggestions per tab. Persist across LLM refreshes so a
        # "Heal Aelric" suggestion sticks until either the action fires or the
        # event becomes stale (e.g. Aelric is no longer bloodied).
        self._watch_suggestions: dict[int, list[Suggestion]] = {}
        self.event_bus.subscribe_all(self._on_event)
        self.event_bus.subscribe_all(self._on_event_for_watch)

        self._tab_action_surfaces: dict[int, list[dict]] = {}
        for tab_idx, npc in enumerate(self.encounter_state.npcs):
            actions = self._db.list_actions(npc=npc.slug)
            self._tab_action_surfaces[tab_idx] = actions
            tab = NPCTab(
                npc_state=npc,
                actions=actions,
                log_path=self.encounter_state.log_path,
                parent=self,
                event_bus=self.event_bus,
            )
            tab.state_changed.connect(self._on_tab_state_changed)
            tab.reorder_requested.connect(self._handle_reorder_request)
            tab.quit_requested.connect(self.close)
            tab.llm_fallback_requested.connect(self._on_llm_fallback)
            self.tabs.addTab(tab, self._tab_title(npc))

        # Background suggestion driver — fires after every state_changed signal.
        # No-op until a LLM controller is plugged in via set_llm_controller().
        self._suggestion_driver = SuggestionDriver(self)
        self._suggestion_driver.suggestions_ready.connect(self._on_suggestions_ready)
        self._suggestion_driver.suggestion_failed.connect(self._on_suggestion_failed)

        # Status bar at the bottom for transient messages
        self.setStatusBar(QStatusBar(self))
        self.statusBar().showMessage(f"Loaded {len(self.encounter_state.npcs)} NPC(s) · log → {self.encounter_state.log_path.name}")

    def _wire_shortcuts(self) -> None:
        # Cmd+1 .. Cmd+9 jump directly to that tab index
        for i in range(1, 10):
            sc = QShortcut(QKeySequence(f"Ctrl+{i}"), self)
            sc.activated.connect(lambda idx=i - 1: self._jump_to_tab(idx))

        # Tab key (when no widget consumes it) cycles forward
        # Note: in normal Qt, Tab is focus traversal — we intercept on the window
        # only when the focused widget isn't a QLineEdit/QTextEdit.

    # ─────────── round counter ───────────

    def _round_btn_text(self) -> str:
        return f"  R{self.encounter_state.round_num}  "

    def _advance_round(self) -> None:
        self.encounter_state.advance_round()
        # Refresh every tab; recharge rolls handled by each tab's start-of-turn,
        # but we trigger them here for round-button convenience.
        for i in range(self.tabs.count()):
            tab = self.tabs.widget(i)
            if isinstance(tab, NPCTab):
                tab.refresh()
        self.round_btn.setText(self._round_btn_text())
        self.statusBar().showMessage(f"Round → {self.encounter_state.round_num}", 3000)
        # Surface the round change as an event so any "at start of round X"
        # triggers (none yet, but the bus is generic) can fire.
        if hasattr(self, "event_bus"):
            self.event_bus.emit(round_event(self.encounter_state.round_num))

    # ─────────── tab management ───────────

    def _tab_title(self, npc: NPCState) -> str:
        if npc.count > 1:
            return f"{npc.name} ×{npc.count}  {npc.hp}/{npc.max_total_hp}"
        return f"{npc.name}  {npc.hp}/{npc.max_total_hp}"

    def _on_tab_changed(self, idx: int) -> None:
        self.encounter_state.active_tab_index = idx

    def _on_tab_state_changed(self) -> None:
        # Refresh tab titles (HP changes show in title)
        for i in range(self.tabs.count()):
            tab = self.tabs.widget(i)
            if isinstance(tab, NPCTab):
                self.tabs.setTabText(i, self._tab_title(tab.npc_state))
        # Auto-save after every state mutation. Crash recovery is the goal —
        # the most expensive accidental loss is half an hour of combat tracking.
        self._auto_save()
        # Kick off per-tab suggestion fetches in the background (no-op if no LLM)
        self._fire_suggestion_refresh()

    def _fire_suggestion_refresh(self) -> None:
        """Submit one async fetch per tab. Earlier in-flight workers' results
        are dropped via the generation counter in SuggestionDriver."""
        controller = getattr(self, "_llm_controller", None)
        if controller is None:
            return
        # Show "thinking…" hint on every tab; results replace it
        for i in range(self.tabs.count()):
            tab = self.tabs.widget(i)
            if isinstance(tab, NPCTab):
                tab.show_suggestions_loading()
                # Bind everything the worker needs via closure
                npc_state = tab.npc_state
                action_surface = self._tab_action_surfaces.get(i, [])
                log_path = self.encounter_state.log_path

                def fetcher(controller=controller, npc=npc_state, surface=action_surface, lp=log_path):
                    log_tail = self._last_log_tail(lp, lines=10)
                    return controller.suggest_next_actions(npc, surface, log_tail)

                self._suggestion_driver.request_for_tab(i, fetcher)

    @staticmethod
    def _last_log_tail(log_path, lines: int = 10) -> str | None:
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                return "".join(f.readlines()[-lines:])
        except OSError:
            return None

    def _on_suggestions_ready(self, tab_idx: int, suggestions) -> None:
        if not hasattr(self, "_llm_suggestions_by_tab"):
            self._llm_suggestions_by_tab: dict[int, list] = {}
        self._llm_suggestions_by_tab[tab_idx] = list(suggestions)
        # Re-render the combined bar — watches first, then LLM picks.
        self._refresh_suggestions_for_tab(tab_idx)
        # Stale-watch cleanup: drop watch suggestions whose target NPC is no
        # longer bloodied / dead. Keeps the bar honest.
        self._prune_watch_suggestions(tab_idx)

    def _on_suggestion_failed(self, tab_idx: int, error: str) -> None:
        if not hasattr(self, "_llm_suggestions_by_tab"):
            self._llm_suggestions_by_tab = {}
        self._llm_suggestions_by_tab[tab_idx] = []
        self._refresh_suggestions_for_tab(tab_idx)
        self.statusBar().showMessage(f"Suggestion fetch failed (tab {tab_idx}): {error}", 4000)

    def _prune_watch_suggestions(self, tab_idx: int) -> None:
        """Remove watch suggestions whose triggering condition no longer holds.
        Currently checks: targeted NPC is no longer bloodied (HP > half)."""
        bucket = self._watch_suggestions.get(tab_idx, [])
        if not bucket:
            return
        kept: list[Suggestion] = []
        for sug in bucket:
            if sug.target_npc is None:
                kept.append(sug)
                continue
            target_npc = next(
                (n for n in self.encounter_state.npcs if n.slug == sug.target_npc),
                None,
            )
            # Drop if the target is dead OR no longer bloodied (recovered).
            if target_npc is None or target_npc.is_dead:
                continue
            if not target_npc.is_bloodied:
                continue
            kept.append(sug)
        if len(kept) != len(bucket):
            self._watch_suggestions[tab_idx] = kept
            self._refresh_suggestions_for_tab(tab_idx)

    def _cycle_tab(self, direction: int) -> None:
        if self.tabs.count() == 0:
            return
        new_idx = (self.tabs.currentIndex() + direction) % self.tabs.count()
        self.tabs.setCurrentIndex(new_idx)

    def _jump_to_tab(self, idx: int) -> None:
        if 0 <= idx < self.tabs.count():
            self.tabs.setCurrentIndex(idx)

    def _handle_reorder_request(self, new_slugs: list[str]) -> None:
        """Handle `/reorder slug1 slug2 ...` from any tab."""
        self.encounter_state.reorder_tabs(new_slugs)
        # Rebuild tab order to match. NPCState is not hashable (mutable fields),
        # so we key on object identity via id().
        npc_to_tab: dict[int, NPCTab] = {}
        for i in range(self.tabs.count()):
            t = self.tabs.widget(i)
            if isinstance(t, NPCTab):
                npc_to_tab[id(t.npc_state)] = t

        # Remove all tabs (without deleting widgets), then re-add in new order
        while self.tabs.count() > 0:
            self.tabs.removeTab(0)
        for npc in self.encounter_state.npcs:
            tab = npc_to_tab.get(id(npc))
            if tab is None:
                continue
            self.tabs.addTab(tab, self._tab_title(npc))
        self.statusBar().showMessage(f"Reordered: {' → '.join(n.slug for n in self.encounter_state.npcs)}", 4000)

    # ─────────── snapshot save/load ───────────

    def _auto_save_path(self) -> Path:
        """Per-encounter auto-save file. Lives under combat-runner/.memory/
        which is already gitignored."""
        return _REPO_ROOT / "combat-runner" / ".memory" / self.encounter_state.name / "auto-save.json"

    def _auto_save(self) -> None:
        """Persist current state to the auto-save slot. Best-effort: a write
        failure shouldn't crash the GUI mid-fight."""
        try:
            path = self._auto_save_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            blob = serialize_encounter(self.encounter_state)
            path.write_text(json.dumps(blob, indent=2), encoding="utf-8")
        except (OSError, ValueError) as exc:
            self.statusBar().showMessage(f"auto-save failed: {exc}", 4000)

    def _save_snapshot(self) -> None:
        """Explicit Save snapshot → file dialog under .memory/<encounter>/."""
        default_dir = self._auto_save_path().parent
        default_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        default_path = str(default_dir / f"snapshot-{ts}.json")
        path, _ = QFileDialog.getSaveFileName(self, "Save snapshot", default_path, "JSON (*.json)")
        if not path:
            return
        try:
            blob = serialize_encounter(self.encounter_state)
            Path(path).write_text(json.dumps(blob, indent=2), encoding="utf-8")
            self.statusBar().showMessage(f"Saved {Path(path).name}", 4000)
        except (OSError, ValueError) as exc:
            QMessageBox.warning(self, "Save failed", str(exc))

    def _load_snapshot(self) -> None:
        """Load a snapshot file and replace the current encounter state.
        Replaces every tab's NPCState in-place so widget identity is preserved;
        falls back to a full rebuild if NPC slugs differ."""
        default_dir = self._auto_save_path().parent
        path, _ = QFileDialog.getOpenFileName(self, "Load snapshot", str(default_dir), "JSON (*.json)")
        if not path:
            return
        try:
            blob = json.loads(Path(path).read_text(encoding="utf-8"))
            restored = deserialize_encounter(blob)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            QMessageBox.warning(self, "Load failed", str(exc))
            return

        # If NPC slug set matches, do an in-place patch (preserves tabs, log views, etc.)
        cur_slugs = {n.slug for n in self.encounter_state.npcs}
        new_slugs = {n.slug for n in restored.npcs}
        if cur_slugs != new_slugs:
            QMessageBox.warning(
                self, "Mismatched encounter",
                f"Snapshot NPCs ({sorted(new_slugs)}) don't match this encounter "
                f"({sorted(cur_slugs)}). Switch encounters first or pick a matching snapshot.",
            )
            return

        # In-place patch
        by_slug = {n.slug: n for n in restored.npcs}
        for npc in self.encounter_state.npcs:
            src = by_slug[npc.slug]
            npc.max_hp = src.max_hp
            npc.member_hp = list(src.member_hp)
            npc.count = src.count
            npc.conditions = set(src.conditions)
            npc.condition_durations = dict(src.condition_durations)
            npc.reaction_used = src.reaction_used
            npc.bonus_used = src.bonus_used
            npc.recharges = dict(src.recharges)
            npc.turn_taken_this_round = src.turn_taken_this_round
        self.encounter_state.round_num = restored.round_num
        self.round_btn.setText(self._round_btn_text())
        for i in range(self.tabs.count()):
            t = self.tabs.widget(i)
            if isinstance(t, NPCTab):
                t.refresh()
        self.statusBar().showMessage(f"Loaded {Path(path).name} (round {restored.round_num})", 5000)

    # ─────────── watch / broadcast suggestions ───────────

    def _on_event_for_watch(self, event: Event) -> None:
        """Run the watch matcher on every event. For each match, append a
        deterministic suggestion to the owning NPC's bar so the DM sees
        'Cure Wounds → Aelric' the moment Aelric drops to bloodied.

        Also prunes stale suggestions (e.g. target is no longer bloodied)
        so the heal suggestion disappears once Aelric is back above half."""
        # Prune first — covers the case where this event is a heal that just
        # un-bloodied somebody.
        for tab_idx in list(self._watch_suggestions.keys()):
            self._prune_watch_suggestions(tab_idx)

        matches = self.watch_matcher.find_matches(event)
        if not matches:
            return
        for m in matches:
            tab_idx = self._tab_index_for_slug(m.watch.npc_slug)
            if tab_idx is None:
                continue
            target_name = self._npc_display_name(m.target_npc) if m.target_npc else None
            display_action = m.watch.action_name.replace("_", " ").title()
            slug = (
                f"{display_action} → {target_name}" if target_name else display_action
            )
            sug = Suggestion(
                slug=slug,
                action_name=m.watch.action_name,
                target_npc=m.target_npc,
            )
            bucket = self._watch_suggestions.setdefault(tab_idx, [])
            # Dedupe by (action, target) so a repeated bloodied event doesn't
            # stack duplicate suggestions
            key = (sug.action_name, sug.target_npc)
            if not any((s.action_name, s.target_npc) == key for s in bucket):
                bucket.insert(0, sug)  # newest on top
            # Push to the suggestion bar (combined with LLM ones below)
            self._refresh_suggestions_for_tab(tab_idx)

    def _refresh_suggestions_for_tab(self, tab_idx: int) -> None:
        """Push the current combined (watch + LLM) suggestion list onto a tab.
        Watch suggestions always come first."""
        tab = self.tabs.widget(tab_idx)
        if not isinstance(tab, NPCTab):
            return
        watch_subs = list(self._watch_suggestions.get(tab_idx, []))
        llm_subs = getattr(self, "_llm_suggestions_by_tab", {}).get(tab_idx, [])
        combined = watch_subs + llm_subs
        tab.set_suggestions(combined[:5])

    def _tab_index_for_slug(self, slug: str) -> int | None:
        for i in range(self.tabs.count()):
            t = self.tabs.widget(i)
            if isinstance(t, NPCTab) and t.npc_state.slug == slug:
                return i
        return None

    def _npc_display_name(self, slug: str) -> str:
        for npc in self.encounter_state.npcs:
            if npc.slug == slug:
                return npc.name
        return slug

    # ─────────── event bus + trigger handling ───────────

    def _on_event(self, event: Event) -> None:
        """Subscribed to every bus emission. Run the trigger matcher and, if
        anything matches, surface the reaction prompt dialog. Re-entry-guarded
        so a reaction's own emissions can't recursively pop more dialogs."""
        if self._handling_event:
            return
        used_by_npc = {n.slug: n.reaction_used for n in self.encounter_state.npcs}
        matches = self.trigger_matcher.find_matches(event, used_reactions_by_npc=used_by_npc)
        if not matches:
            return
        self._handling_event = True
        try:
            self._show_reaction_prompt(event, matches)
        finally:
            self._handling_event = False

    def _show_reaction_prompt(self, event: Event, matches: list[TriggerMatch]) -> None:
        summary = self._build_event_summary(event)
        rows = [
            (m.trigger.npc_slug, m.trigger.action_name, m.trigger.match, m.confidence)
            for m in matches
        ]
        choice = self._reaction_prompt_handler(summary, rows)
        if choice is None or not choice.triggered:
            return
        self._fire_matched_reaction(choice.npc_slug, choice.action_name)

    def _reaction_prompt_handler(self, summary: str, rows):
        """Show the modal dialog and return the user's ReactionChoice (or None
        if dismissed). Override (or monkey-patch in tests) to inject a non-modal
        flow — tests typically replace this with a lambda that auto-PASSes.

        Auto-PASS when running under the offscreen Qt platform (i.e. headless
        test runs) so blocking modals can't deadlock pytest. The real GUI runs
        under cocoa/xcb/etc. and uses the full dialog."""
        import os
        if os.environ.get("QT_QPA_PLATFORM") == "offscreen":
            return None
        dlg = ReactionPromptDialog(event_summary=summary, matches=rows, parent=self)
        dlg.exec()
        return dlg.chosen_reaction

    def _fire_matched_reaction(self, npc_slug: str, action_name: str) -> None:
        """Switch to the firing NPC's tab, mark the reaction USED, then run the
        action. Mark-before-run ensures a roll/dispatch failure can't leave a
        phantom reaction available to re-fire on the next event."""
        for i, npc in enumerate(self.encounter_state.npcs):
            if npc.slug != npc_slug:
                continue
            self.tabs.setCurrentIndex(i)
            tab = self.tabs.widget(i)
            if isinstance(tab, NPCTab):
                npc.reaction_used = True
                tab.run_action_externally(action_name)
                tab.refresh()
            self.statusBar().showMessage(f"{npc_slug} fired {action_name}", 3500)
            return

    @staticmethod
    def _build_event_summary(event: Event) -> str:
        """Short one-liner for the reaction prompt header."""
        if event.kind == "damage":
            amt = event.payload.get("amount", "?")
            dtype = event.payload.get("damage_type")
            dtype_s = f" {dtype}" if dtype else ""
            tags_s = f" [{', '.join(event.tags)}]" if event.tags else ""
            return f"{event.subject_npc} took {amt}{dtype_s} damage{tags_s}"
        if event.kind == "heal":
            return f"{event.subject_npc} healed {event.payload.get('amount', '?')}"
        if event.kind == "spell_cast":
            caster = event.payload.get("caster", "?")
            spell = event.payload.get("spell_name", "?")
            target = event.subject_npc or "(no target)"
            return f"{caster} cast {spell} → {target}"
        if event.kind in ("condition_applied", "condition_removed"):
            verb = "gained" if event.kind == "condition_applied" else "lost"
            return f"{event.subject_npc} {verb} {event.payload.get('condition', '?')}"
        if event.kind == "round_advanced":
            return f"Round → {event.payload.get('round_num', '?')}"
        return f"event: {event.kind} on {event.subject_npc}"

    def _on_llm_fallback(self, text: str, parsed) -> None:
        """Route fallback input to the LLM controller if one's been wired."""
        controller = getattr(self, "_llm_controller", None)
        if controller is None:
            self.statusBar().showMessage(f"LLM fallback (no controller): {text!r}", 5000)
            return
        active_npc = self.encounter_state.active_npc
        active_slug = active_npc.slug if active_npc is not None else None
        # Run synchronously for v0.2 simplicity; v0.3 can spin this off on a QThread
        # if blocking the UI becomes a problem.
        self.statusBar().showMessage(f"LLM thinking about: {text!r} ...", 1500)
        result = controller.run(text, active_npc_slug=active_slug)
        # Refresh all tabs after the LLM possibly mutated state
        for i in range(self.tabs.count()):
            t = self.tabs.widget(i)
            if isinstance(t, NPCTab):
                t.refresh()
        if result.error:
            self.statusBar().showMessage(f"LLM error: {result.error}", 5000)
        else:
            msg = result.text[:120] if result.text else f"LLM ran {len(result.tool_calls)} tool(s)"
            self.statusBar().showMessage(msg, 5000)

    # ─────────── help ───────────

    def _open_srd_import(self) -> None:
        """Encounter → Add NPC from SRD… dialog. After import the user has to
        Switch encounters to pick up the new NPC (we don't hot-reload yet)."""
        from .widgets.srd_monster_import import SrdMonsterImportDialog
        dlg = SrdMonsterImportDialog(default_encounter_root=self.encounter_state.root, parent=self)

        def _after_import(slug: str, md_path: str) -> None:
            QMessageBox.information(
                self, "Re-launch needed",
                f"Imported {slug}. Switch encounters (Ctrl+E) and re-launch "
                f"to add a tab for the new NPC.",
            )

        dlg.imported.connect(_after_import)
        dlg.exec()

    def _toggle_srd_dock(self) -> None:
        """Show/hide the SRD search dock + focus the input when shown."""
        if self._srd_dock.isVisible():
            self._srd_dock.hide()
        else:
            self._srd_dock.show()
            self._srd_dock.raise_()
            # Focus the input box
            panel = self._srd_dock.widget()
            if panel is not None and hasattr(panel, "input"):
                panel.input.setFocus()

    def _show_about(self) -> None:
        QMessageBox.information(
            self,
            "About Combat Runner",
            "<h3>dnd-combat GUI</h3>"
            "<p>At-table NPC runner for D&amp;D 5.5e.</p>"
            "<p>Type sigils in the command bar:</p>"
            "<ul>"
            "<li><code>attack</code> — fuzzy verb match → run action</li>"
            "<li><code>-18</code> / <code>+10</code> — damage / heal (live preview)</li>"
            "<li><code>m3 -5</code> — damage mob member 3</li>"
            "<li><code>@prone</code> — toggle condition</li>"
            "<li><code>note ...</code> — log entry (no LLM)</li>"
            "<li><code>/reorder a b c</code> — reorder tabs</li>"
            "</ul>",
        )

    # ─────────── public API for LLM wiring ───────────

    def set_llm_controller(self, controller) -> None:
        """Plug in the LLM meta-controller. The controller's `on_state_changed`
        should already be wired to call `_refresh_all_tabs` so tool calls
        update the UI. Also fires an initial suggestion refresh so the bar
        populates before the first turn."""
        self._llm_controller = controller
        self._fire_suggestion_refresh()

    def closeEvent(self, event) -> None:  # noqa: N802 (Qt API)
        """Drain the suggestion thread pool before closing."""
        if hasattr(self, "_suggestion_driver"):
            self._suggestion_driver.cancel_all()
            self._suggestion_driver.shutdown(timeout_ms=2000)
        super().closeEvent(event)
