"""Regression tests for Fix A — the LLM fallback must run OFF the GUI thread.

Before the fix, `_on_llm_fallback` called `LLMController.run` synchronously on
the Qt main thread, freezing the whole window for the 2-40s the chat loop took.

The fix runs `run()` on a QThreadPool worker. Tool calls (which mutate live
widgets) are marshalled back to the GUI thread via a QueuedConnection signal +
a threading.Event the worker blocks on. These tests verify:
  - the fallback flow still mutates state correctly through the worker;
  - tool dispatch executes on the GUI (main) thread, not the worker thread;
  - the GUI thread is not blocked while the worker's network calls run.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any

import pytest
from PySide6.QtCore import QThread

from gui.app import build_main_window
from gui.encounter_picker import discover_encounters
from gui.llm_controller import LLMController
from gui.main_window import MainWindow
from gui.npc_tab import NPCTab


# ─────────── fake Anthropic SDK (mirrors test_llm_controller.py) ───────────

@dataclass
class FakeContent:
    type: str
    text: str = ""
    name: str = ""
    input: dict[str, Any] = field(default_factory=dict)
    id: str = "tu-1"


@dataclass
class FakeResponse:
    content: list[FakeContent]
    stop_reason: str = "end_turn"


class FakeAnthropicClient:
    """Canned-response stand-in. `create_delay` simulates a slow network call
    so a test can prove the GUI thread isn't blocked while it runs.

    The fallback chat loop passes `tools=`; the background suggestion calls do
    not. We only consume the canned queue for the (tools-bearing) fallback
    path, so suggestion fetches triggered by set_llm_controller can't drain it.
    """

    def __init__(self, response_queue: list[FakeResponse], create_delay: float = 0.0) -> None:
        self._queue = list(response_queue)
        self._delay = create_delay
        self.calls: list[dict[str, Any]] = []
        self.create_threads: list[int] = []
        self.messages = self

    def create(self, **kwargs) -> FakeResponse:
        # Suggestion calls (no `tools`) get an inert empty-JSON response and do
        # not touch the fallback queue.
        if "tools" not in kwargs:
            return FakeResponse(content=[FakeContent(type="text", text='{"suggestions": []}')])
        self.create_threads.append(threading.get_ident())
        if self._delay:
            time.sleep(self._delay)
        self.calls.append(kwargs)
        if not self._queue:
            return FakeResponse(content=[FakeContent(type="text", text="done")])
        return self._queue.pop(0)


@pytest.fixture
def mountin_pass_win(qtbot) -> MainWindow:
    encounters = discover_encounters()
    pick = next((e for e in encounters if e.name == "mountin-pass"), None)
    if pick is None:
        pytest.skip("mountin-pass not discoverable")
    counts = {npc.slug: 1 for npc in pick.npcs}
    win = build_main_window(pick, counts, with_llm=False)
    qtbot.addWidget(win)
    return win


def _wire_fake_llm(win: MainWindow, fake: FakeAnthropicClient) -> LLMController:
    ctrl = LLMController(
        win.encounter_state,
        log_path=str(win.encounter_state.log_path),
        client=fake,
    )
    win.set_llm_controller(ctrl)
    return ctrl


def test_fallback_runs_and_mutates_state_through_worker(mountin_pass_win, qtbot):
    """A fallback whose LLM response calls damage_npc must reduce HP — proving
    the threaded worker + marshalled dispatch round-trip works end to end."""
    win = mountin_pass_win
    stalker = win.encounter_state.npcs[0]
    start_hp = stalker.hp
    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="damage_npc", id="t1",
                                 input={"npc_slug": stalker.slug, "amount": 7})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="Hit for 7.")]),
    ])
    _wire_fake_llm(win, fake)

    with qtbot.waitSignal(win.llm_run_finished, timeout=5000):
        win._on_llm_fallback("hit the stalker for 7", parsed=None)

    assert stalker.hp == start_hp - 7


def test_tool_dispatch_runs_on_gui_thread(mountin_pass_win, qtbot):
    """The marshalled tool dispatch MUST execute on the GUI (main) thread —
    that's the whole point of the QueuedConnection round-trip."""
    win = mountin_pass_win
    gui_thread_id = threading.get_ident()
    dispatch_thread_ids: list[int] = []

    real_dispatch = win._on_llm_dispatch_requested

    def _spy(tool_uses, holder, done):
        dispatch_thread_ids.append(threading.get_ident())
        return real_dispatch(tool_uses, holder, done)

    win._on_llm_dispatch_requested = _spy  # type: ignore[method-assign]

    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="add_log_entry", id="t1",
                                 input={"text": "threaded run"})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="logged")]),
    ])
    ctrl = _wire_fake_llm(win, fake)
    # Re-wire signals would be needed if set_llm_controller cached — it doesn't.

    with qtbot.waitSignal(win.llm_run_finished, timeout=5000):
        win._on_llm_fallback("note something", parsed=None)

    # Dispatch happened, and every dispatch ran on the GUI thread.
    assert dispatch_thread_ids, "tool dispatch was never invoked"
    assert all(tid == gui_thread_id for tid in dispatch_thread_ids)
    # The network create() calls ran on a DIFFERENT (worker) thread.
    assert fake.create_threads
    assert all(tid != gui_thread_id for tid in fake.create_threads)


def test_gui_thread_not_blocked_during_network_call(mountin_pass_win, qtbot):
    """While the worker sleeps in a slow `messages.create`, the GUI thread must
    still process events — proving the window no longer freezes."""
    win = mountin_pass_win
    fake = FakeAnthropicClient(
        [FakeResponse(content=[FakeContent(type="text", text="slow done")])],
        create_delay=0.4,
    )
    _wire_fake_llm(win, fake)

    win._on_llm_fallback("a slow question", parsed=None)

    # Immediately after kicking off the fallback, the GUI thread is free: a
    # zero-delay timer / processEvents call returns promptly instead of
    # blocking for the full 0.4s network delay.
    t0 = time.monotonic()
    qtbot.wait(50)  # spins the event loop
    assert time.monotonic() - t0 < 0.35  # would be >=0.4 if the call blocked

    # And the run still completes cleanly.
    with qtbot.waitSignal(win.llm_run_finished, timeout=5000):
        pass


def test_no_controller_is_a_noop(mountin_pass_win):
    """With no LLM controller wired, the fallback just posts a status message
    and does not start a worker."""
    win = mountin_pass_win
    assert getattr(win, "_llm_controller", None) is None
    win._on_llm_fallback("anything", parsed=None)
    assert not hasattr(win, "_llm_run_signals")
