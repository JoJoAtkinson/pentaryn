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

import dataclasses
import importlib.util
import json
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from PySide6.QtCore import QEvent, QObject, QRunnable, Qt, QThreadPool, Signal
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
from .command_model import Effect, ParsedCommand
from .effects import _CONDITION_UNKNOWN_SENTINEL, apply_effect, apply_hit
from .history import UndoStack
from .npc_tab import NPCTab
from .state import EncounterState, NPCState, deserialize_encounter, serialize_encounter
from .suggestion_driver import SuggestionDriver
from .widgets.combat_tab_bar import CombatTabBar
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


class _LLMWorkerSignals(QObject):
    """Signals for the off-thread LLM fallback run. Lives on a QObject so it
    can carry queued cross-thread connections; the worker is a QRunnable."""

    # Emitted from the worker thread when the chat loop needs to dispatch a
    # batch of tool calls. The slot (on the GUI thread) must dispatch them,
    # store the result via the holder, and set the threading.Event so the
    # worker can resume. Connected with Qt.QueuedConnection.
    dispatch_requested = Signal(object, object, object)  # (tool_uses, holder, event)
    finished = Signal(object)  # (RunResult)


class _LLMWorkerBase(QRunnable):
    """Shared scaffolding for off-thread LLM workers.

    Holds the common __init__ setup (controller ref, signals, autoDelete) and
    the `_marshalled_dispatch` helper that shuttles tool-call batches back to
    the GUI thread via a QueuedConnection signal + blocking threading.Event.
    Both `_LLMRunWorker` and `_LLMReviewWorker` subclass this.
    """

    def __init__(self, controller: Any, signals: _LLMWorkerSignals) -> None:
        super().__init__()
        self._controller = controller
        self._signals = signals
        self.setAutoDelete(True)

    def _marshalled_dispatch(self, tool_uses: list[Any]) -> list[dict[str, Any]]:
        """Hand the tool batch to the GUI thread and block until it finishes."""
        holder: dict[str, Any] = {}
        done = threading.Event()
        self._signals.dispatch_requested.emit(tool_uses, holder, done)
        done.wait()
        if "error" in holder:
            # Re-raise on the worker thread so the chat loop's own try/except
            # records a clean RunResult error instead of hanging.
            raise RuntimeError(holder["error"])
        return holder.get("result", [])


class _LLMRunWorker(_LLMWorkerBase):
    """Runs one `LLMController.run` off the GUI thread.

    The network round-trips (`messages.create`) run here. Tool dispatch — which
    mutates live GUI state and touches widgets — is marshalled back to the GUI
    thread: the worker emits `dispatch_requested` (a QueuedConnection signal)
    and blocks on a threading.Event until the GUI-thread slot fills the result.
    """

    def __init__(self, controller: Any, text: str, active_npc_slug: str | None,
                 signals: _LLMWorkerSignals) -> None:
        super().__init__(controller, signals)
        self._text = text
        self._slug = active_npc_slug

    def run(self) -> None:
        try:
            result = self._controller.run(
                self._text,
                active_npc_slug=self._slug,
                dispatch_fn=self._marshalled_dispatch,
            )
        except Exception as exc:  # noqa: BLE001
            from .llm_controller import RunResult
            result = RunResult(error=f"LLM worker crashed: {exc}")
        self._signals.finished.emit(result)


class _LLMReviewWorker(_LLMWorkerBase):
    """Off-thread LLM review of an already-applied command.

    Mirrors `_LLMRunWorker`: the network round-trips run on the worker thread,
    tool dispatch is marshalled back to the GUI thread via `dispatch_requested`
    and a blocking threading.Event.
    """

    def __init__(
        self, controller: Any, raw_command: str, actor: dict, target: dict,
        applied_direction: str | None, applied_amount: int | None,
        log_tail: str, signals: _LLMWorkerSignals,
    ) -> None:
        super().__init__(controller, signals)
        self._raw = raw_command
        self._actor = actor
        self._target = target
        self._direction = applied_direction
        self._amount = applied_amount
        self._log_tail = log_tail

    def run(self) -> None:
        try:
            result = self._controller.review_command(
                raw=self._raw,
                actor=self._actor,
                target=self._target,
                applied_direction=self._direction,
                applied_amount=self._amount,
                log_tail=self._log_tail,
                dispatch_fn=self._marshalled_dispatch,
            )
        except Exception as exc:  # noqa: BLE001
            from .llm_controller import RunResult
            result = RunResult(error=f"review crashed: {exc}")
        self._signals.finished.emit(result)


class MainWindow(QMainWindow):
    """Top-level combat window."""

    # Signaled when the user picks Encounter→Switch encounter… from the menu.
    encounter_switch_requested = Signal()
    # Emitted on the GUI thread once an off-thread LLM fallback run completes
    # (carries the RunResult). Primarily a test seam for the threaded path.
    llm_run_finished = Signal(object)

    def __init__(self, encounter_state: EncounterState, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.encounter_state = encounter_state
        # Memento undo stack — every state-mutating command snapshots onto it
        # before applying, and an `undo` effect pops + restores it.
        self.undo_stack = UndoStack()

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
        # CombatTabBar paints the red ▼ targeting arrow. Installed before any
        # tab is added so tabRect()/count() are valid for the first paint.
        self.tabs.setTabBar(CombatTabBar())
        self.tabs.setMovable(True)  # drag-drop reorder, native
        self.tabs.setTabsClosable(False)  # we don't want accidental close mid-fight
        self.tabs.currentChanged.connect(self._on_tab_changed)
        # A native drag reflows QTabWidget widget indices but NOT
        # encounter_state.npcs. Mirror the move so npcs[i] always tracks
        # tabs.widget(i) — otherwise active_npc (indexed by tab position) and
        # directed-command tab refreshes resolve the wrong combatant.
        self.tabs.tabBar().tabMoved.connect(self._on_tab_moved)
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
        # Per-tab structures are keyed on a STABLE tab identity — id(NPCTab) —
        # not the positional tab index. /reorder shuffles indices but never
        # destroys the NPCTab widgets, so id() stays valid and an in-flight
        # suggestion worker can never deliver to the wrong NPC after a reorder.
        # Watch-driven suggestions per tab. Persist across LLM refreshes so a
        # "Heal Aelric" suggestion sticks until either the action fires or the
        # event becomes stale (e.g. Aelric is no longer bloodied).
        self._watch_suggestions: dict[int, list[Suggestion]] = {}
        self.event_bus.subscribe_all(self._on_event)
        self.event_bus.subscribe_all(self._on_event_for_watch)
        self.event_bus.subscribe("move_away", self._on_move_away_event)

        self._tab_action_surfaces: dict[int, list[dict]] = {}
        for npc in self.encounter_state.npcs:
            actions = self._db.list_actions(npc=npc.slug)
            # Seed per-action slot counters so every NPC starts the encounter
            # with its limited-use actions at full charge. Without this the
            # `slots_remaining` dict is empty until the first use, and
            # snapshot save/load round-trips an incomplete picture.
            self._seed_slots_remaining(npc, actions)
            tab = NPCTab(
                npc_state=npc,
                actions=actions,
                log_path=self.encounter_state.log_path,
                parent=self,
                event_bus=self.event_bus,
            )
            self._tab_action_surfaces[id(tab)] = actions
            tab.state_changed.connect(self._on_tab_state_changed)
            tab.quit_requested.connect(self.close)
            tab.command_requested.connect(self._on_command)
            self.tabs.addTab(tab, self._tab_title(npc))

        # Background suggestion driver — fires after every state_changed signal.
        # No-op until a LLM controller is plugged in via set_llm_controller().
        self._suggestion_driver = SuggestionDriver(self)
        self._suggestion_driver.suggestions_ready.connect(self._on_suggestions_ready)
        self._suggestion_driver.suggestion_failed.connect(self._on_suggestion_failed)

        # Dedicated single-thread pool for LLM fallback runs (run() blocks on
        # network round-trips). Kept separate from the suggestion pool so a
        # long fallback can't starve background suggestion fetches. Single
        # thread → at most one fallback in flight at a time.
        self._llm_pool = QThreadPool(self)
        self._llm_pool.setMaxThreadCount(1)
        # Set of in-flight _LLMWorkerSignals objects. Each worker holds its own
        # strong reference; we keep them here too so the QObjects aren't GC'd
        # while the worker thread holds them across network round-trips.
        self._inflight_llm_signals: set = set()
        # Rolling buffer of the last 10 raw command strings (newest last).
        # Populated by _on_command; passed to the LLM fallback for context.
        self._recent_commands: list[str] = []

        # Status bar at the bottom for transient messages
        self.setStatusBar(QStatusBar(self))
        self.statusBar().showMessage(f"Loaded {len(self.encounter_state.npcs)} NPC(s) · log → {self.encounter_state.log_path.name}")

    @staticmethod
    def _seed_slots_remaining(npc: NPCState, actions: list[dict]) -> None:
        """Pre-fill `npc.slots_remaining` from each action's `slots` block so a
        freshly-launched NPC starts with every limited-use action known and at
        full count. Existing entries are never overwritten (a restored snapshot
        or mid-fight launch keeps its real counts)."""
        for a in actions:
            slot_cfg = a.get("slots") or {}
            count = slot_cfg.get("count")
            action_name = a.get("action")
            if action_name and isinstance(count, int):
                npc.slots_remaining.setdefault(action_name, count)

    def _wire_shortcuts(self) -> None:
        # Ctrl+1 .. Ctrl+9 jump to the tab whose combatant has that permanent id
        for digit in "123456789":
            sc = QShortcut(QKeySequence(f"Ctrl+{digit}"), self)
            sc.activated.connect(lambda d=digit: self._jump_to_combatant_by_id(d))

        # Tab / Shift+Tab cycle the active combatant tab (turn order = left-to-
        # right tab order). Qt's focus framework consumes Tab for focus
        # traversal *inside* the focused QLineEdit before a QShortcut or the
        # window's keyPressEvent would ever see it — so a plain
        # `QShortcut(Qt.Key_Tab)` never fires. The robust interception point is
        # an application-level event filter that catches the KeyPress before
        # focus traversal runs. We scope it to events belonging to this window.
        app = QApplication.instance()
        if app is not None:
            app.installEventFilter(self)

    def eventFilter(self, obj, event) -> bool:  # noqa: N802 (Qt API)
        """Intercept Tab / Shift+Tab anywhere in this window and cycle the
        active combatant tab instead of doing Qt focus traversal. Focus is kept
        on the active tab's command input so the DM can keep typing."""
        if event.type() == QEvent.Type.KeyPress and event.key() in (
            Qt.Key.Key_Tab, Qt.Key.Key_Backtab,
        ):
            # Only act for events targeted at a widget inside this window.
            widget = obj if isinstance(obj, QWidget) else None
            if widget is not None and widget.window() is self:
                # Don't steal Tab while an autocomplete popup is open — the
                # command input uses Tab to accept a completion.
                current = self.tabs.currentWidget() if hasattr(self, "tabs") else None
                inp = getattr(current, "input", None)
                completer = getattr(inp, "completer", None)
                if completer is not None:
                    popup = inp.completer().popup()
                    if popup is not None and popup.isVisible():
                        return False
                backward = (
                    event.key() == Qt.Key.Key_Backtab
                    or bool(event.modifiers() & Qt.KeyboardModifier.ShiftModifier)
                )
                self._cycle_tab(-1 if backward else 1)
                self._focus_active_command_input()
                return True  # consume — no focus traversal
        return super().eventFilter(obj, event)

    def _focus_active_command_input(self) -> None:
        """Put keyboard focus on the active tab's command input so the DM can
        keep typing commands after a Tab cycle."""
        current = self.tabs.currentWidget() if hasattr(self, "tabs") else None
        inp = getattr(current, "input", None)
        if inp is not None:
            inp.setFocus(Qt.FocusReason.OtherFocusReason)

    def _jump_to_combatant_by_id(self, combatant_id: str) -> None:
        """Switch to the tab for the combatant with this permanent id."""
        for i, npc in enumerate(self.encounter_state.npcs):
            if npc.id == combatant_id:
                self.tabs.setCurrentIndex(i)
                return

    # ─────────── round counter ───────────

    def _round_btn_text(self) -> str:
        return f"  R{self.encounter_state.round_num}  "

    def _advance_round(self) -> None:
        self.encounter_state.advance_round()
        self._apply_round_change()

    def _apply_round_change(self) -> None:
        """Run the GUI-side effects of a round change: refresh tabs, update the
        counter button, and emit the `round_advanced` bus event (which ticks
        condition durations on every NPCTab + writes the round divider).

        Shared by the round button and the LLM round tools so the two paths
        cannot drift — the LLM `advance_round` / `set_round` tools call back
        into this via the `on_round_advanced` hook wired in set_llm_controller.
        """
        # A pending effect from a prior round is stale — resolve it (the
        # default "do nothing" outcome is a successful save / a miss). This
        # also clears its unresolved marker. Spec §4.
        from .effects import clear_stale_pending
        stale = clear_stale_pending(
            self.encounter_state, self.encounter_state.round_num
        )
        self._log_fragments(stale)
        # Refresh every tab; recharge rolls handled by each tab's start-of-turn,
        # but we trigger them here for round-button convenience.
        for i in range(self.tabs.count()):
            tab = self.tabs.widget(i)
            if isinstance(tab, NPCTab):
                tab.refresh()
        self.round_btn.setText(self._round_btn_text())
        self._refresh_pending_markers()
        self.statusBar().showMessage(f"Round → {self.encounter_state.round_num}", 3000)
        # Surface the round change as an event so condition durations tick
        # (NPCTab._on_round_event) and any "at start of round X" triggers fire.
        if hasattr(self, "event_bus"):
            self.event_bus.emit(round_event(self.encounter_state.round_num))

    # ─────────── tab management ───────────

    def _tab_title(self, npc: NPCState) -> str:
        id_prefix = f"{npc.id} · " if npc.id else ""
        # Minimal unresolved-effect marker (spec §6): a trailing " ?" when this
        # combatant has an unresolved PendingEffect. Cleared automatically once
        # the effect resolves (via `hit` or round-advance stale-clear), because
        # every repaint path re-derives the title through this method.
        suffix = " ?" if self._has_unresolved_pending(npc) else ""
        if npc.count > 1:
            return f"{id_prefix}{npc.name} ×{npc.count}  {npc.hp}/{npc.max_total_hp}{suffix}"
        return f"{id_prefix}{npc.name}  {npc.hp}/{npc.max_total_hp}{suffix}"

    def _has_unresolved_pending(self, npc: NPCState) -> bool:
        """True if *npc* has an unresolved PendingEffect (drives the tab marker)."""
        return any(
            pe.combatant_id == npc.id and not pe.resolved
            for pe in self.encounter_state.pending_effects
        )

    def _refresh_pending_markers(self) -> None:
        """Re-title every tab so the unresolved-effect marker reflects state."""
        for i in range(self.tabs.count()):
            tab = self.tabs.widget(i)
            if isinstance(tab, NPCTab):
                self.tabs.setTabText(i, self._tab_title(tab.npc_state))

    def _on_tab_changed(self, idx: int) -> None:
        self.encounter_state.active_tab_index = idx
        # The actor tab changed — re-evaluate which tabs show the targeting
        # arrow (the arrow is never painted on the active/actor tab).
        self._refresh_target_arrow()
        # Keep keyboard focus on the (new) active tab's command input so the DM
        # can keep typing commands no matter how the tab was switched.
        self._focus_active_command_input()

    def _on_tab_moved(self, from_idx: int, to_idx: int) -> None:
        """Mirror a native QTabBar drag-reorder into encounter_state.npcs.

        QTabWidget reflows its widget indices on a native drag but never
        touches the npcs list. Keeping the two in lock-step preserves the
        invariant npcs[i] ⇄ tabs.widget(i) that active_npc and the
        directed-command tab refresh both rely on. active_tab_index is kept
        pointed at the same combatant the user is currently viewing.
        """
        npcs = self.encounter_state.npcs
        if not (0 <= from_idx < len(npcs)) or not (0 <= to_idx < len(npcs)):
            return
        npc = npcs.pop(from_idx)
        npcs.insert(to_idx, npc)
        self.encounter_state.active_tab_index = self.tabs.currentIndex()
        # Tab indices shifted — re-map current_target ids onto the new layout.
        self._refresh_target_arrow()

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

    def _tab_by_key(self, tab_key: int) -> NPCTab | None:
        """Resolve a stable tab key — id(NPCTab) — back to the live widget.
        Returns None if no tab with that identity exists (e.g. a stale worker
        result for a tab that has since been removed)."""
        for i in range(self.tabs.count()):
            t = self.tabs.widget(i)
            if isinstance(t, NPCTab) and id(t) == tab_key:
                return t
        return None

    def _fire_suggestion_refresh(self) -> None:
        """Submit one async fetch per tab. Earlier in-flight workers' results
        are dropped via the generation counter in SuggestionDriver. Workers are
        keyed on id(NPCTab) so a /reorder mid-flight can't misroute results."""
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
                action_surface = self._tab_action_surfaces.get(id(tab), [])
                log_path = self.encounter_state.log_path

                def fetcher(controller=controller, npc=npc_state, surface=action_surface, lp=log_path):
                    log_tail = self._last_log_tail(lp, lines=10)
                    return controller.suggest_next_actions(npc, surface, log_tail)

                self._suggestion_driver.request_for_tab(id(tab), fetcher)

    @staticmethod
    def _last_log_tail(log_path, lines: int = 10) -> str | None:
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                return "".join(f.readlines()[-lines:])
        except OSError:
            return None

    def _on_suggestions_ready(self, tab_key: int, suggestions) -> None:
        if not hasattr(self, "_llm_suggestions_by_tab"):
            self._llm_suggestions_by_tab: dict[int, list] = {}
        self._llm_suggestions_by_tab[tab_key] = list(suggestions)
        # Re-render the combined bar — watches first, then LLM picks.
        self._refresh_suggestions_for_tab(tab_key)
        # Stale-watch cleanup: drop watch suggestions whose target NPC is no
        # longer bloodied / dead. Keeps the bar honest.
        self._prune_watch_suggestions(tab_key)

    def _on_suggestion_failed(self, tab_key: int, error: str) -> None:
        if not hasattr(self, "_llm_suggestions_by_tab"):
            self._llm_suggestions_by_tab = {}
        self._llm_suggestions_by_tab[tab_key] = []
        self._refresh_suggestions_for_tab(tab_key)
        self.statusBar().showMessage(f"Suggestion fetch failed: {error}", 4000)

    def _prune_watch_suggestions(self, tab_key: int) -> None:
        """Remove watch suggestions whose triggering condition no longer holds.
        Currently checks: targeted NPC is no longer bloodied (HP > half)."""
        bucket = self._watch_suggestions.get(tab_key, [])
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
            self._watch_suggestions[tab_key] = kept
            self._refresh_suggestions_for_tab(tab_key)

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

        # Full in-place restore — NPC fields, round_num, current_target,
        # pending_effects, active_tab_index, and the targeting arrow — via the
        # shared helper (also used by `_apply_undo`). Static stats (slug, kind,
        # id, max_hp, ac, …) are copied too, but for a matching-slug snapshot
        # they are identical to the live values, so the copy is a no-op.
        self._restore_encounter_state(restored)
        self._repaint_all_tabs()
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
        for tab_key in list(self._watch_suggestions.keys()):
            self._prune_watch_suggestions(tab_key)

        matches = self.watch_matcher.find_matches(event)
        if not matches:
            return
        for m in matches:
            tab_key = self._tab_key_for_slug(m.watch.npc_slug)
            if tab_key is None:
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
            bucket = self._watch_suggestions.setdefault(tab_key, [])
            # Dedupe by (action, target) so a repeated bloodied event doesn't
            # stack duplicate suggestions
            key = (sug.action_name, sug.target_npc)
            if not any((s.action_name, s.target_npc) == key for s in bucket):
                bucket.insert(0, sug)  # newest on top
            # Push to the suggestion bar (combined with LLM ones below)
            self._refresh_suggestions_for_tab(tab_key)

    def _refresh_suggestions_for_tab(self, tab_key: int) -> None:
        """Push the current combined (watch + LLM) suggestion list onto a tab.
        Watch suggestions always come first. `tab_key` is id(NPCTab)."""
        tab = self._tab_by_key(tab_key)
        if tab is None:
            return
        watch_subs = list(self._watch_suggestions.get(tab_key, []))
        llm_subs = getattr(self, "_llm_suggestions_by_tab", {}).get(tab_key, [])
        combined = watch_subs + llm_subs
        tab.set_suggestions(combined[:5])

    def _tab_key_for_slug(self, slug: str) -> int | None:
        """Return the stable tab key — id(NPCTab) — for the first tab whose NPC
        has this slug, or None. Used to route watch suggestions; stable across
        /reorder unlike a positional index."""
        for i in range(self.tabs.count()):
            t = self.tabs.widget(i)
            if isinstance(t, NPCTab) and t.npc_state.slug == slug:
                return id(t)
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

    def _on_move_away_event(self, event: Event) -> None:
        """When a combatant retreats while in_melee, prompt for opportunity attack.

        Any NPC (kind=="npc") that is alive and hasn't used their reaction is a
        candidate, provided they have at least one attack-type action. The DM can
        always dismiss the prompt to skip the OA."""
        if self._handling_event:
            return
        retreating_slug = event.subject_npc or "?"
        retreating_name = self._npc_display_name(retreating_slug)
        combatant_id = event.payload.get("combatant_id", "?")
        summary = f"{retreating_name} (#{combatant_id}) retreated — opportunity attack?"
        # Collect NPC candidates: alive, reaction not yet used, has an attack action.
        candidates = []
        for npc in self.encounter_state.npcs:
            if npc.kind != "npc":
                continue
            if npc.is_dead or npc.reaction_used:
                continue
            tab_key = self._tab_key_for_slug(npc.slug)
            actions = self._tab_action_surfaces.get(tab_key, []) if tab_key is not None else []
            atk = next(
                (a for a in actions if a.get("type") in ("single_attack", "multiattack")),
                None,
            )
            if atk:
                candidates.append((npc.slug, atk["action"], "melee opportunity attack", 0.8))
        if not candidates:
            return
        self._handling_event = True
        try:
            choice = self._reaction_prompt_handler(summary, candidates)
            if choice is not None and choice.triggered:
                self._fire_matched_reaction(choice.npc_slug, choice.action_name)
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

    def _on_llm_fallback(self, text: str, parsed, correction_ctx: dict | None = None) -> None:
        """Route fallback input to the LLM controller if one's been wired.

        The LLM call (up to 10 blocking network round-trips, 2-40s) runs on a
        QThreadPool worker so the window stays responsive — the DM can keep
        working on other tabs while it thinks. Tool calls mutate live widgets,
        so they are marshalled back to this (the GUI) thread via
        `_on_llm_dispatch_requested`. A "thinking…" status message stays up for
        the duration.

        ``correction_ctx`` — optional enriched context dict (assembled by
        ``build_correction_context``) injected as a JSON preamble in the text
        sent to the LLM so it can reason about encounter state, recent command
        history, and unconfirmed pending effects.
        """
        controller = getattr(self, "_llm_controller", None)
        if controller is None:
            self.statusBar().showMessage(f"LLM fallback (no controller): {text!r}", 5000)
            return
        active_npc = self.encounter_state.active_npc
        active_slug = active_npc.slug if active_npc is not None else None

        # When enriched context is available, prepend it as a compact JSON
        # section so the model can use state/history for fuzzy corrections.
        llm_text = text
        if correction_ctx is not None:
            try:
                ctx_json = json.dumps(correction_ctx, ensure_ascii=False)
                llm_text = f"[correction_context]{ctx_json}[/correction_context]\n{text}"
            except (TypeError, ValueError):
                pass  # malformed context — fall back to plain text

        # Persistent (no timeout) thinking indicator — cleared by the finished slot.
        self.statusBar().showMessage(f"LLM thinking about: {text!r} …")

        signals = _LLMWorkerSignals()
        # QueuedConnection so the dispatch slot runs on THIS (GUI) thread even
        # though the signal is emitted from the worker thread.
        signals.dispatch_requested.connect(
            self._on_llm_dispatch_requested, Qt.ConnectionType.QueuedConnection
        )
        self._inflight_llm_signals.add(signals)
        signals.finished.connect(
            self._on_llm_finished, Qt.ConnectionType.QueuedConnection
        )
        signals.finished.connect(
            lambda _result, s=signals: self._inflight_llm_signals.discard(s),
            Qt.ConnectionType.QueuedConnection,
        )
        worker = _LLMRunWorker(controller, llm_text, active_slug, signals)
        self._llm_pool.start(worker)

    def _on_llm_dispatch_requested(self, tool_uses, holder, done) -> None:
        """GUI-thread slot: dispatch a batch of LLM tool calls (which mutate
        live state + touch widgets), store the results in `holder`, then set
        the `done` Event to unblock the waiting worker thread."""
        try:
            controller = getattr(self, "_llm_controller", None)
            if controller is None:
                holder["error"] = "LLM controller went away mid-run"
            else:
                holder["result"] = controller.dispatch_tool_uses(tool_uses)
        except Exception as exc:  # noqa: BLE001
            holder["error"] = str(exc)
        finally:
            done.set()

    def _on_llm_finished(self, result) -> None:
        """GUI-thread slot: the LLM run completed. Refresh tabs + report."""
        for i in range(self.tabs.count()):
            t = self.tabs.widget(i)
            if isinstance(t, NPCTab):
                t.refresh()
        if result.error:
            self.statusBar().showMessage(f"LLM error: {result.error}", 5000)
        else:
            msg = result.text[:120] if result.text else f"LLM ran {len(result.tool_calls)} tool(s)"
            self.statusBar().showMessage(msg, 5000)
        self.llm_run_finished.emit(result)

    # ─────────── command grammar dispatch ───────────

    def _on_command(self, cmd: ParsedCommand) -> None:
        """Handle a parsed `<who> <stream>` command from any tab.

        Routes by `cmd.kind`:
          * ``unparseable`` → the LLM fallback path (raw text).
          * ``note``        → append a DM-only log entry; no LLM, no review.
          * ``reorder``     → call `_handle_reorder_request`; no LLM, no review.
          * ``quit``        → close the window.
          * ``set_target``  → resolve `target_ids`, set `current_target`,
                              jump to the first target tab, refresh the arrow.
          * ``command``     → snapshot, resolve targets, apply each Effect,
                              emit bus events, repaint, refresh the arrow.
        """
        # Record every raw command string for LLM context (rolling window of 10).
        if cmd.raw:
            self._recent_commands.append(cmd.raw)
            if len(self._recent_commands) > 10:
                self._recent_commands = self._recent_commands[-10:]

        # --- out-of-band commands (no LLM, no snapshot) ---
        if cmd.kind == "note":
            self._append_to_active_tab(
                f"<span style='color:#90caf9'>📝 {cmd.note_text}</span>"
            )
            return

        if cmd.kind == "reorder":
            self._handle_reorder_request(cmd.reorder_slugs)
            return

        if cmd.kind == "quit":
            self.close()
            return

        if cmd.kind == "unparseable":
            from .llm_controller import build_correction_context
            correction_ctx = build_correction_context(
                state_dict=serialize_encounter(self.encounter_state),
                recent_commands=self._recent_commands,
                pending=[
                    dataclasses.asdict(p)
                    for p in self.encounter_state.pending_effects
                ],
            )
            self._on_llm_fallback(cmd.raw, cmd, correction_ctx=correction_ctx)
            return

        # Snapshot BEFORE any mutation so `undo` can restore this exact state.
        # Invariant: exactly ONE snapshot per *mutating* `_on_command` — the
        # double-`undo()` logic in `_apply_undo` depends on it. We snapshot
        # eagerly here, then discard it below if the command turned out to be a
        # genuine no-op (e.g. an unknown-condition `command`). A bare
        # `set_target` IS a mutating command per the spec (it changes
        # `current_target`) — it is kept undoable, so its snapshot is retained.
        before = serialize_encounter(self.encounter_state)
        self.undo_stack.snapshot(self.encounter_state)

        # A command containing an `undo` effect mutates the undo stack itself;
        # never discard its snapshot (the state-diff check would be unreliable
        # once `_apply_undo` has rewritten the stack).
        has_undo_effect = cmd.kind == "command" and any(
            e.kind == "undo" for e in cmd.effects
        )

        if cmd.kind == "set_target":
            self._handle_set_target(cmd)
        elif cmd.kind == "command":
            self._handle_command(cmd)
        else:
            return

        # Discard the snapshot if nothing actually changed — keeps the
        # one-snapshot-per-mutation invariant. `set_target` and `undo`-bearing
        # commands are always treated as mutating.
        if cmd.kind != "set_target" and not has_undo_effect:
            after = serialize_encounter(self.encounter_state)
            if after == before:
                self.undo_stack.discard_last()
            else:
                # Re-wire: the old npc_tab dispatch path emitted review_needed
                # for every state-changing command. That signal path was removed
                # with the grammar rewrite. Call _enqueue_review directly here
                # so the always-on async LLM review fires on every real mutation.
                # Undo commands are excluded (reviewing a revert has no value).
                if not has_undo_effect:
                    actor = self.encounter_state.active_npc
                    ids = self._resolve_targets(cmd)
                    target = (
                        self.encounter_state.combatant_by_id(ids[0])
                        if ids else None
                    ) or actor
                    if target is not None:
                        self._enqueue_review(
                            cmd.raw, actor, target,
                            applied_direction=None,
                            applied_amount=None,
                        )

    def _resolve_targets(self, cmd: ParsedCommand) -> list[str]:
        """Resolve a ParsedCommand's <who> into concrete combatant id strings.

        ``"0"`` resolves to the active combatant's id; ``use_current`` resolves
        to ``encounter_state.current_target``.
        """
        if cmd.use_current:
            return list(self.encounter_state.current_target)
        active = self.encounter_state.active_npc
        active_id = active.id if active else ""
        resolved: list[str] = []
        for cid in cmd.target_ids:
            resolved.append(active_id if cid == "0" else cid)
        return resolved

    def _handle_set_target(self, cmd: ParsedCommand) -> None:
        """A bare <who> — set the sticky current target and jump to its tab."""
        ids = self._resolve_targets(cmd)
        self.encounter_state.current_target = list(ids)
        names = []
        first_idx: int | None = None
        for cid in ids:
            combatant = self.encounter_state.combatant_by_id(cid)
            if combatant is None:
                continue
            names.append(combatant.name)
            idx = self.encounter_state.npcs.index(combatant)
            if first_idx is None:
                first_idx = idx
        if first_idx is not None:
            self.tabs.setCurrentIndex(first_idx)
        self._refresh_target_arrow()
        if names:
            label = ", ".join(names)
            verb = "is" if len(names) == 1 else "are"
            self._append_to_active_tab(
                f"<span style='color:#6c8eba'>{label} {verb} now the target</span>"
            )

    def _handle_command(self, cmd: ParsedCommand) -> None:
        """Apply a `kind == "command"` ParsedCommand's effects."""
        ids = self._resolve_targets(cmd)
        # A command carrying explicit target_ids (not use_current) is sticky:
        # it also updates the current target.
        if cmd.target_ids and not cmd.use_current:
            self.encounter_state.current_target = list(ids)

        actor = self.encounter_state.active_npc

        for effect in cmd.effects:
            if effect.kind == "undo":
                self._apply_undo()
                continue
            if effect.kind == "action":
                self._apply_action_effect(effect, ids)
                continue
            if effect.kind == "hit":
                fragments = apply_hit(self.encounter_state, ids)
                self._log_fragments(fragments)
                continue
            # amount / condition → effects.apply_effect.
            # Snapshot HP per-target first so skipped no-ops (out-of-range mob
            # member etc.) emit no bus events — only targets whose HP actually
            # moved get a damage/heal event.
            hp_before = {
                cid: c.hp
                for cid in ids
                if (c := self.encounter_state.combatant_by_id(cid)) is not None
            }
            fragments = apply_effect(
                self.encounter_state, effect, target_ids=ids, actor=actor
            )
            self._log_fragments(fragments)
            if effect.kind == "amount":
                changed = [
                    cid for cid in ids
                    if (c := self.encounter_state.combatant_by_id(cid)) is not None
                    and c.hp != hp_before.get(cid)
                ]
                self._emit_amount_events(effect, changed)
                # A melee-tagged delivery sets in_melee on all targets AND the
                # actor (restored from old _on_directed_command behaviour).
                if effect.amount_tags.get("delivery") == "melee":
                    for cid in ids:
                        target_c = self.encounter_state.combatant_by_id(cid)
                        if target_c is not None:
                            target_c.in_melee = True
                    if actor is not None:
                        actor.in_melee = True
            elif effect.kind == "condition":
                # Only fire bus events when the condition actually applied.
                # If _apply_condition returned the sentinel (unknown condition),
                # fragments will contain it and we must NOT fire or auto-save.
                condition_applied = not any(
                    _CONDITION_UNKNOWN_SENTINEL in frag for frag in fragments
                )
                if condition_applied:
                    self._emit_condition_events(effect, ids)

        self._repaint_all_tabs()
        self._refresh_target_arrow()
        self._auto_save()

    def _restore_encounter_state(self, restored: EncounterState) -> None:
        """Fully swap a restored EncounterState into the live one.

        Shared by `_apply_undo` and `_load_snapshot`. Patches NPC field values
        in place (so tab widgets, which hold references to the live NPCState
        objects, stay valid — match by slug), then restores the cross-tab
        state: `round_num`, `current_target`, `pending_effects`, and
        `active_tab_index` (bounds-checked). Finally refreshes the targeting
        arrow so a restored `current_target` repaints correctly.

        Callers are responsible for repainting tabs and any caller-specific
        skip-field policy on the NPC patch (this helper copies every field).
        """
        by_slug = {n.slug: n for n in restored.npcs}
        for npc in self.encounter_state.npcs:
            src = by_slug.get(npc.slug)
            if src is None:
                continue
            for f in dataclasses.fields(NPCState):
                val = getattr(src, f.name)
                if isinstance(val, list):
                    val = list(val)
                elif isinstance(val, dict):
                    val = dict(val)
                elif isinstance(val, set):
                    val = set(val)
                setattr(npc, f.name, val)
        self.encounter_state.round_num = restored.round_num
        self.encounter_state.current_target = list(restored.current_target)
        self.encounter_state.pending_effects = list(restored.pending_effects)
        # Restore the active tab (part of EncounterState; bounds-checked since
        # the restored index may exceed the current tab count).
        idx = restored.active_tab_index
        if 0 <= idx < self.tabs.count():
            self.encounter_state.active_tab_index = idx
            self.tabs.setCurrentIndex(idx)
        self.round_btn.setText(self._round_btn_text())
        self._refresh_target_arrow()

    def _apply_undo(self) -> None:
        """Pop the undo stack and swap the restored state in."""
        # The current command's own pre-snapshot is on top; discard it so
        # `undo` reverts the PREVIOUS command, not this no-op one.
        self.undo_stack.undo()
        restored = self.undo_stack.undo()
        if restored is None:
            self._append_to_active_tab(
                "<span style='color:#ff9800'>nothing to undo</span>"
            )
            return
        self._restore_encounter_state(restored)
        self._repaint_all_tabs()
        self._append_to_active_tab(
            "<span style='color:#66bb6a'>↶ undo — reverted last command</span>"
        )

    def _apply_action_effect(self, effect: Effect, target_ids: list[str]) -> None:
        """Resolve an action token (panel number or fuzzy name) and run it.

        The action runs against each resolved target combatant via that tab's
        `run_action_externally` — the action rolls its own damage and applies
        its own riders.
        """
        token = effect.action_token
        for cid in target_ids:
            combatant = self.encounter_state.combatant_by_id(cid)
            if combatant is None:
                self._append_to_active_tab(
                    f"<span style='color:#ff5252'>unknown combatant id: #{cid}</span>"
                )
                continue
            idx = self.encounter_state.npcs.index(combatant)
            tab = self.tabs.widget(idx)
            if not isinstance(tab, NPCTab):
                continue
            # PC tabs: the generic player-action chips (Dodge → dodging
            # condition, Disengage → _disengaging flag, etc.) carry richer
            # behavior than the generic global utility actions, so they win.
            if tab.npc_state.kind == "pc" and tab.try_player_action(token):
                continue
            actions = self._tab_action_surfaces.get(id(tab), [])
            action_name = self._resolve_action_token(token, actions)
            if action_name is None:
                self._append_to_active_tab(
                    f"<span style='color:#ff9800'>no action {token!r} on "
                    f"{combatant.name}</span>"
                )
                continue
            # Run the action — `run_action_externally` returns the parsed
            # roll_combat_action result, including the structured `rolls`
            # sidecar. A save-bearing or attack-roll action's damage is
            # *uncertain*: route it through apply_uncertain_damage so the
            # default outcome is "saved"/"miss" and a later `hit` upgrades it
            # (spec §4). A no-save no-attack-roll action carries no `rolls`
            # damage and stays as printed text.
            result = tab.run_action_externally(action_name)
            self._route_uncertain_damage(result, cid, action_name)

    def _route_uncertain_damage(
        self, result: dict | None, combatant_id: str, action_name: str
    ) -> None:
        """Apply a rolled action's uncertain damage via the didn't-land lifecycle.

        Reads the structured ``rolls`` sidecar from a ``roll_combat_action``
        result. For a ``save``- or ``attack``-kind roll it applies the assumed
        minimum and records a ``PendingEffect`` (spec §4). A no-roll action
        (``rolls`` empty/absent) is a no-op here — it carries no HP damage.
        """
        if not isinstance(result, dict):
            return
        rolls = result.get("rolls") or {}
        if not isinstance(rolls, dict) or not rolls:
            return
        kind = rolls.get("kind")
        full_amount = rolls.get("damage_total")
        if kind not in ("save", "attack") or not isinstance(full_amount, int):
            return
        # Normalize on_save: the actions DB uses "half" / "no damage";
        # apply_uncertain_damage expects "half" / "none".
        on_save_raw = str(rolls.get("on_save", "none")).strip().lower()
        on_save = "half" if on_save_raw == "half" else "none"
        from .effects import apply_uncertain_damage
        fragments = apply_uncertain_damage(
            self.encounter_state,
            combatant_id,
            full_amount,
            kind=kind,
            on_save=on_save,
            source=action_name,
        )
        self._log_fragments(fragments)
        self._refresh_pending_markers()

    @staticmethod
    def _resolve_action_token(token: str, actions: list[dict]) -> str | None:
        """Resolve an `action_token` against an NPC's action surface.

        A digit string is a 1-based panel index. Otherwise the token is
        matched, tightest-first: exact action-name → exact `verbs` alias →
        unique prefix → unique substring → closest difflib match. Returns the
        canonical action name, or None.
        """
        if not actions:
            return None
        if token.isdigit():
            idx = int(token) - 1
            if 0 <= idx < len(actions):
                return actions[idx].get("action")
            return None
        q = token.lower().strip()
        names = [a.get("action", "") for a in actions if a.get("action")]
        norm = {n: n.lower().replace("_", " ") for n in names}

        exact = [n for n in names if norm[n] == q or n.lower() == q]
        if exact:
            return exact[0]
        # Exact match against an action's authored `verbs` aliases
        # (e.g. 'grab' → the grapple action's verbs list).
        for a in actions:
            verbs = [v.lower() for v in (a.get("verbs") or [])]
            if q in verbs and a.get("action"):
                return a["action"]
        prefix = [n for n in names if norm[n].startswith(q) or n.lower().startswith(q)]
        if len(prefix) == 1:
            return prefix[0]
        if not prefix:
            sub = [n for n in names if q in norm[n] or q in n.lower()]
            if len(sub) == 1:
                return sub[0]
        # Last resort: closest difflib match (handles abbreviations / typos
        # like 'grab' → 'grapple', 'attaccck' → 'attack'). The 0.5 cutoff is
        # deliberately loose — exact/prefix/substring already caught the easy
        # cases, so this only fires for genuine near-misses.
        import difflib
        close = difflib.get_close_matches(q, [norm[n] for n in names], n=1, cutoff=0.5)
        if close:
            for n in names:
                if norm[n] == close[0]:
                    return n
        return None

    def _emit_amount_events(self, effect: Effect, target_ids: list[str]) -> None:
        """Fire damage/heal/bloodied/death events for an applied amount."""
        if self.event_bus is None:
            return
        from .event_bus import bloodied_event, damage_event, death_event, heal_event

        is_heal = effect.amount_tags.get("direction") == "heal"
        dtype = effect.amount_tags.get("type")
        delivery = effect.amount_tags.get("delivery")
        for cid in target_ids:
            combatant = self.encounter_state.combatant_by_id(cid)
            if combatant is None:
                continue
            if is_heal:
                self.event_bus.emit(heal_event(combatant.slug, effect.amount))
            else:
                self.event_bus.emit(damage_event(
                    combatant.slug, effect.amount, damage_type=dtype,
                    melee=(delivery == "melee"), ranged=(delivery == "ranged"),
                ))
                if combatant.is_bloodied:
                    self.event_bus.emit(bloodied_event(combatant.slug))
                if combatant.is_dead:
                    self.event_bus.emit(death_event(combatant.slug))

    def _emit_condition_events(self, effect: Effect, target_ids: list[str]) -> None:
        """Fire condition_applied / condition_removed events."""
        if self.event_bus is None:
            return
        from .event_bus import condition_event
        for cid in target_ids:
            combatant = self.encounter_state.combatant_by_id(cid)
            if combatant is None:
                continue
            applied = any(
                effect.condition in c or c == effect.condition
                for c in combatant.conditions
            )
            self.event_bus.emit(
                condition_event(combatant.slug, effect.condition, applied=applied)
            )

    def _log_fragments(self, fragments: list[str]) -> None:
        """Append effect log fragments to the active tab's log view."""
        for frag in fragments:
            colour = "#ff5252" if frag.startswith("warn:") else "#b8bdc4"
            self._append_to_active_tab(f"<span style='color:{colour}'>{frag}</span>")

    def _repaint_all_tabs(self) -> None:
        """Refresh every tab widget + re-title it (HP shows in the title)."""
        for i in range(self.tabs.count()):
            tab = self.tabs.widget(i)
            if isinstance(tab, NPCTab):
                tab.refresh()
                self.tabs.setTabText(i, self._tab_title(tab.npc_state))

    def _refresh_target_arrow(self) -> None:
        """Map `current_target` ids → tab indices and update the tab bar arrow.

        The active tab is passed as the actor so the arrow is never painted on
        the actor's own tab (CombatTabBar excludes it).
        """
        bar = self.tabs.tabBar()
        if not isinstance(bar, CombatTabBar):
            return
        targeted: set[int] = set()
        for cid in self.encounter_state.current_target:
            combatant = self.encounter_state.combatant_by_id(cid)
            if combatant is None:
                continue
            try:
                targeted.add(self.encounter_state.npcs.index(combatant))
            except ValueError:
                continue
        bar.set_targeting(targeted, self.tabs.currentIndex())

    def _append_to_active_tab(self, html: str) -> None:
        """Append an HTML line to the currently-active tab's log view."""
        current = self.tabs.currentWidget()
        if current is not None and hasattr(current, "_append_log"):
            current._append_log(html)

    def _enqueue_review(
        self, raw_command: str, actor, target, *,
        applied_direction: str | None, applied_amount: int | None,
    ) -> None:
        """Enqueue an async LLM review for any state-changing command.
        No-ops if no LLM controller is wired.

        Stale-review mitigation: we record the target's HP at enqueue time.
        When the review result arrives (_on_review_finished), if the target's HP
        has changed in the meantime we downgrade any mutation to advisory — the
        review text is logged as a note rather than applied as a state change.
        This prevents a late-returning review from clobbering a more-recent
        command's result under rapid at-table input.
        """
        controller = getattr(self, "_llm_controller", None)
        if controller is None:
            return

        # Snapshot HP at enqueue to detect stale reviews later.
        hp_at_enqueue = target.hp

        actor_snapshot = {
            "id": actor.id if actor else None,
            "name": actor.name if actor else "?",
            "slug": actor.slug if actor else None,
        }
        target_snapshot = {
            "id": target.id,
            "name": target.name,
            "slug": target.slug,
            "hp": hp_at_enqueue,
            "max_hp": target.max_total_hp,
            "conditions": sorted(target.conditions),
            "in_melee": target.in_melee,
        }
        log_tail = self._last_log_tail(self.encounter_state.log_path, lines=8)

        signals = _LLMWorkerSignals()
        signals.dispatch_requested.connect(
            self._on_llm_dispatch_requested, Qt.ConnectionType.QueuedConnection
        )
        self._inflight_llm_signals.add(signals)
        signals.finished.connect(
            lambda result, rt=target, hp_snap=hp_at_enqueue:
                self._on_review_finished(result, rt, hp_snap),
            Qt.ConnectionType.QueuedConnection,
        )
        signals.finished.connect(
            lambda _result, s=signals: self._inflight_llm_signals.discard(s),
            Qt.ConnectionType.QueuedConnection,
        )

        worker = _LLMReviewWorker(
            controller=controller,
            raw_command=raw_command,
            actor=actor_snapshot,
            target=target_snapshot,
            applied_direction=applied_direction,
            applied_amount=applied_amount,
            log_tail=log_tail or "",
            signals=signals,
        )
        self._llm_pool.start(worker)

    def _on_review_finished(self, result, target_npc, hp_at_enqueue: int | None = None) -> None:
        """GUI-thread slot: review returned. Refresh tabs.

        If the target's HP changed since enqueue (rapid commands), the review
        is downgraded to advisory: any mutation is skipped and the review text
        is logged as a note so the DM can still read it without it clobbering
        the newer state.
        """
        state_changed = (
            hp_at_enqueue is not None and target_npc.hp != hp_at_enqueue
        )

        if state_changed and not result.error and result.text:
            # Advisory path — log the review text without mutating state.
            advisory_html = (
                f"<span style='color:#90a4ae'>⟳ review (advisory — state changed since): "
                f"{result.text[:200]}</span>"
            )
            # Append to the tab that owns this NPC.
            for i in range(self.tabs.count()):
                t = self.tabs.widget(i)
                if hasattr(t, "npc_state") and t.npc_state is target_npc:
                    if hasattr(t, "_append_log"):
                        t._append_log(advisory_html)
                    break
            self.llm_run_finished.emit(result)
            return

        for i in range(self.tabs.count()):
            t = self.tabs.widget(i)
            if hasattr(t, "refresh"):
                t.refresh()
            if hasattr(t, "npc_state") and t.npc_state is target_npc:
                self.tabs.setTabText(i, self._tab_title(target_npc))
        if result.error:
            self.statusBar().showMessage(f"review error: {result.error}", 3000)
        self.llm_run_finished.emit(result)

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
            "<p>At-table combat runner for D&amp;D 5.5e.</p>"
            "<p>Commands are <code>&lt;who&gt; &lt;stream&gt;</code>:</p>"
            "<ul>"
            "<li><code>2 8 melee slash</code> — 8 melee slashing damage to #2</li>"
            "<li><code>2 2</code> — run action #2 against #2</li>"
            "<li><code>3 tail-sweep</code> — run an action by name</li>"
            "<li><code>3 2 stun</code> — stun #3 for 2 rounds</li>"
            "<li><code>0 …</code> — target self · <code>123 …</code> — multi-target</li>"
            "<li><code>undo</code> — revert the last command</li>"
            "</ul>",
        )

    # ─────────── public API for LLM wiring ───────────

    def set_llm_controller(self, controller) -> None:
        """Plug in the LLM meta-controller. The controller's `on_state_changed`
        should already be wired to call `_refresh_all_tabs` so tool calls
        update the UI. Also fires an initial suggestion refresh so the bar
        populates before the first turn."""
        self._llm_controller = controller
        # Route the LLM round tools through the same round-change side effects
        # the round button uses, so condition durations tick consistently
        # regardless of whether the DM clicks the button or asks the LLM.
        bundle = getattr(controller, "_bundle", None)
        if bundle is not None:
            bundle.on_round_advanced = lambda _round: self._apply_round_change()
        self._fire_suggestion_refresh()

    def showEvent(self, event) -> None:  # noqa: N802 (Qt API)
        """Put initial keyboard focus on the active tab's command input so the
        DM can type commands the moment the window appears."""
        super().showEvent(event)
        self._focus_active_command_input()

    def closeEvent(self, event) -> None:  # noqa: N802 (Qt API)
        """Drain the suggestion + LLM thread pools before closing."""
        if hasattr(self, "_suggestion_driver"):
            self._suggestion_driver.cancel_all()
            self._suggestion_driver.shutdown(timeout_ms=2000)
        if hasattr(self, "_llm_pool"):
            # A blocked LLM worker waits on a threading.Event that only the GUI
            # thread sets — once we stop processing events it can deadlock. Give
            # it a bounded grace period, then move on regardless.
            self._llm_pool.waitForDone(2000)
        super().closeEvent(event)
