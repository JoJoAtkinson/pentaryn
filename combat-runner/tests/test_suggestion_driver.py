"""Background suggestion driver tests.

Verifies the QThreadPool worker contract:
  - request_for_tab → worker runs → suggestions_ready emitted on the GUI thread
  - Newer request for same tab → older worker's result is dropped (stale)
  - Failures emit suggestion_failed and don't crash
  - Multiple tabs run independently
"""

from __future__ import annotations

import threading
import time

import pytest
from PySide6.QtCore import QObject

from gui.suggestion_driver import SuggestionDriver
from gui.widgets.suggestion_bar import Suggestion


def _ready_collector(driver: SuggestionDriver) -> list[tuple[int, list]]:
    """Collect every suggestions_ready emission into a list."""
    received: list[tuple[int, list]] = []
    driver.suggestions_ready.connect(lambda idx, sl: received.append((idx, sl)))
    return received


def _failed_collector(driver: SuggestionDriver) -> list[tuple[int, str]]:
    received: list[tuple[int, str]] = []
    driver.suggestion_failed.connect(lambda idx, err: received.append((idx, err)))
    return received


def test_driver_emits_suggestions_ready(qtbot):
    driver = SuggestionDriver()
    received = _ready_collector(driver)

    def fetcher() -> list[Suggestion]:
        return [Suggestion(slug="hit", action_name="multiattack")]

    with qtbot.waitSignal(driver.suggestions_ready, timeout=8000) as blocker:
        driver.request_for_tab(0, fetcher)
    tab_idx, suggestions = blocker.args
    assert tab_idx == 0
    assert len(suggestions) == 1
    assert suggestions[0].action_name == "multiattack"
    driver.shutdown()


def test_driver_drops_stale_results(qtbot):
    """A second request before the first completes should discard the first's result."""
    driver = SuggestionDriver()
    received = _ready_collector(driver)
    start_gate = threading.Event()
    release_gate = threading.Event()

    def slow_fetcher() -> list[Suggestion]:
        start_gate.set()
        release_gate.wait(timeout=3.0)
        return [Suggestion(slug="OLD", action_name="multiattack")]

    def fast_fetcher() -> list[Suggestion]:
        return [Suggestion(slug="NEW", action_name="vanish")]

    # Submit the slow one
    driver.request_for_tab(0, slow_fetcher)
    # Wait until the slow worker is actually running before queuing the new one
    assert start_gate.wait(2.0)
    # Bump generation by queuing a new request
    driver.request_for_tab(0, fast_fetcher)
    # Wait for the FAST one to deliver
    qtbot.waitUntil(lambda: any(idx == 0 and sl and sl[0].action_name == "vanish" for idx, sl in received), timeout=8000)
    # Now release the slow one — its result must NOT show up
    release_gate.set()
    # Give the slow worker time to finish + driver to (drop) its result
    qtbot.wait(300)
    new_action_names = [s.action_name for _, sl in received for s in sl]
    assert "vanish" in new_action_names
    assert "multiattack" not in new_action_names  # OLD slug discarded
    driver.shutdown()


def test_driver_routes_failures_to_failed_signal(qtbot):
    driver = SuggestionDriver()
    received = _failed_collector(driver)

    def boom_fetcher() -> list[Suggestion]:
        raise RuntimeError("LLM said no")

    with qtbot.waitSignal(driver.suggestion_failed, timeout=8000) as blocker:
        driver.request_for_tab(0, boom_fetcher)
    tab_idx, error = blocker.args
    assert tab_idx == 0
    assert "LLM said no" in error
    driver.shutdown()


def test_per_tab_generations_are_independent(qtbot):
    driver = SuggestionDriver()
    received = _ready_collector(driver)

    def fetcher_for(label: str):
        def _f() -> list[Suggestion]:
            return [Suggestion(slug=label, action_name="action_" + label)]
        return _f

    # Request for tab 0 and tab 1 in quick succession — both should deliver.
    driver.request_for_tab(0, fetcher_for("tab0"))
    driver.request_for_tab(1, fetcher_for("tab1"))

    qtbot.waitUntil(
        lambda: any(idx == 0 for idx, _ in received) and any(idx == 1 for idx, _ in received),
        timeout=8000,
    )
    by_tab = {idx: sl for idx, sl in received}
    assert by_tab[0][0].slug == "tab0"
    assert by_tab[1][0].slug == "tab1"
    driver.shutdown()


def test_cancel_all_makes_pending_results_stale(qtbot):
    driver = SuggestionDriver()
    received = _ready_collector(driver)
    start_gate = threading.Event()
    release_gate = threading.Event()

    def slow_fetcher() -> list[Suggestion]:
        start_gate.set()
        release_gate.wait(timeout=3.0)
        return [Suggestion(slug="HANGING", action_name="dodge")]

    driver.request_for_tab(0, slow_fetcher)
    start_gate.wait(2.0)
    driver.cancel_all()
    release_gate.set()
    qtbot.wait(300)
    # The slow result was cancelled (generation bumped); should NOT be in received
    assert all(s.action_name != "dodge" for _, sl in received for s in sl)
    driver.shutdown()


def test_current_generation_increments_per_request(qtbot):
    driver = SuggestionDriver()
    g0 = driver.current_generation(0)
    driver.request_for_tab(0, lambda: [])
    assert driver.current_generation(0) == g0 + 1
    driver.request_for_tab(0, lambda: [])
    assert driver.current_generation(0) == g0 + 2
    # tab 1 starts at 0
    assert driver.current_generation(1) == 0
    driver.shutdown()
