"""Background suggestion driver — fires LLM `suggest_next_actions` calls
off-thread, posts results back to the GUI, cancels stale results.

Design:
  - One driver per MainWindow. Owns a QThreadPool + per-tab "generation" counter.
  - When a tab's state changes, `request_for_tab(tab_idx)` increments that tab's
    generation, submits a worker. The worker calls
    `llm_controller.suggest_next_actions(...)` synchronously.
  - When the worker returns, it compares its captured generation to the current
    tab generation. If they don't match, the result is stale (newer request
    already in flight) and discarded silently.
  - If they match, emits `suggestions_ready(tab_idx, list[Suggestion])` on the
    GUI thread.

We use Qt signal/slot (with `Qt.QueuedConnection` semantics from QRunnable) so
the GUI thread is never blocked and no QObject is mutated off-thread.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal

from .state import NPCState
from .widgets.suggestion_bar import Suggestion


logger = logging.getLogger(__name__)


class _WorkerSignals(QObject):
    """Signals emitted from a worker. Must live on a QObject so they can be
    connected; the worker itself is a QRunnable (not a QObject)."""

    finished = Signal(int, int, list)  # (tab_idx, generation, suggestions)
    failed = Signal(int, int, str)     # (tab_idx, generation, error_message)


class _SuggestionWorker(QRunnable):
    """One off-thread call to `suggest_next_actions`. Captures its tab_idx +
    generation so the driver can drop stale results without coordination."""

    def __init__(
        self,
        tab_idx: int,
        generation: int,
        fetcher: Callable[[], list[Suggestion]],
        signals: _WorkerSignals,
    ) -> None:
        super().__init__()
        self._tab_idx = tab_idx
        self._generation = generation
        self._fetcher = fetcher
        self._signals = signals
        self.setAutoDelete(True)

    def run(self) -> None:
        try:
            suggestions = self._fetcher()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Suggestion worker tab=%d gen=%d failed: %s", self._tab_idx, self._generation, exc)
            self._signals.failed.emit(self._tab_idx, self._generation, str(exc))
            return
        self._signals.finished.emit(self._tab_idx, self._generation, suggestions)


class SuggestionDriver(QObject):
    """Coordinates async suggestion fetches across multiple tabs.

    Public API:
      - `request_for_tab(tab_idx, fetcher)` — submit a new fetch. `fetcher` is a
        zero-arg callable that returns `list[Suggestion]`. The driver wraps it
        in a worker and tags with a fresh generation. The caller is expected to
        bind tab/state/log into the fetcher via closure.
      - signals `suggestions_ready(tab_idx, list[Suggestion])` and
        `suggestion_failed(tab_idx, str)` — emitted only for the latest
        generation per tab. Stale results are dropped.

    Lifetime: holds a QThreadPool and a dict of per-tab generation counters.
    Safe to use across the lifetime of a MainWindow.
    """

    suggestions_ready = Signal(int, list)  # (tab_idx, list[Suggestion])
    suggestion_failed = Signal(int, str)   # (tab_idx, error_message)

    def __init__(self, parent: QObject | None = None, max_threads: int = 2) -> None:
        super().__init__(parent)
        self._pool = QThreadPool(self)
        self._pool.setMaxThreadCount(max_threads)
        self._generation: dict[int, int] = {}
        self._signals = _WorkerSignals(self)
        self._signals.finished.connect(self._on_finished)
        self._signals.failed.connect(self._on_failed)

    # ─────────── public API ───────────

    def request_for_tab(self, tab_idx: int, fetcher: Callable[[], list[Suggestion]]) -> int:
        """Submit a new suggestion fetch for `tab_idx`. Returns the generation
        number assigned (test-only — production code can ignore it)."""
        self._generation[tab_idx] = self._generation.get(tab_idx, 0) + 1
        gen = self._generation[tab_idx]
        worker = _SuggestionWorker(tab_idx, gen, fetcher, self._signals)
        self._pool.start(worker)
        return gen

    def cancel_all(self) -> None:
        """Bump every tab's generation so any in-flight worker becomes stale.
        Doesn't actually preempt threads — just makes their results un-deliverable."""
        for k in list(self._generation.keys()):
            self._generation[k] = self._generation.get(k, 0) + 1

    def shutdown(self, timeout_ms: int = 2000) -> None:
        """Drain the pool. Used by MainWindow on close to avoid lingering threads."""
        self._pool.waitForDone(timeout_ms)

    def current_generation(self, tab_idx: int) -> int:
        return self._generation.get(tab_idx, 0)

    # ─────────── slots ───────────

    def _on_finished(self, tab_idx: int, generation: int, suggestions: list) -> None:
        # Drop stale results (a newer request was queued after this one)
        if generation != self._generation.get(tab_idx, 0):
            logger.debug("dropping stale suggestion result tab=%d gen=%d (latest=%d)",
                         tab_idx, generation, self._generation.get(tab_idx, 0))
            return
        self.suggestions_ready.emit(tab_idx, suggestions)

    def _on_failed(self, tab_idx: int, generation: int, error: str) -> None:
        if generation != self._generation.get(tab_idx, 0):
            return
        self.suggestion_failed.emit(tab_idx, error)
