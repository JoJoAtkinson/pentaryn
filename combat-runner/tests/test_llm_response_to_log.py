"""LLM text responses go into the log, not the disappearing status-bar footer.

User flow that motivated this: typing `does counterspell take an action`
parses as unparseable → LLM fallback → model replies with text. The reply
was flashed in the status bar for 5s, then gone. The DM wants it retained
in the log so they can refer back to it during the session.

Also: the existing "Combat log" sub-tab is renamed to "Log" (it now holds
informational/Q&A entries alongside combat events), and entries carry an
optional `kind` tag (info/error/spell/event) styled distinctly so a later
filter UI has something to work with.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest


def _boot(qtbot):
    import sys
    sys.path.insert(0, "combat-runner")
    from PySide6.QtWidgets import QApplication
    from gui.encounter_picker import discover_encounters
    from gui.app import build_main_window
    app = QApplication.instance() or QApplication([])
    enc = next(e for e in discover_encounters() if e.name == "thrulm")
    counts = {n.slug: 0 for n in enc.npcs}
    counts["beholder-thrulm"] = 1
    win = build_main_window(enc, counts, with_llm=False)
    qtbot.addWidget(win)
    return win


def _active_log_text(win) -> str:
    from gui.npc_tab import NPCTab
    cur = win.tabs.currentWidget()
    assert isinstance(cur, NPCTab)
    return cur.log_view.toPlainText()


def _make_run_result(text: str = "", error: str | None = None, tool_calls=None):
    from gui.llm_controller import RunResult
    return RunResult(text=text, tool_calls=tool_calls or [], error=error)


# ─────────── Tab rename + label semantics ───────────

def test_console_tab_zero_renamed_to_log(qtbot, tmp_path):
    """The sub-tab previously labeled 'Combat log' is now just 'Log' — it
    holds Q&A + system messages alongside combat events."""
    from gui.state import NPCState
    from gui.npc_tab import NPCTab
    state = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30", cr=1)
    tab = NPCTab(npc_state=state, actions=[], log_path=tmp_path / "log.md")
    qtbot.addWidget(tab)
    label = tab.console_tabs.tabText(0)
    assert label == "Log", f"sub-tab 0 should be 'Log', got {label!r}"


def test_unread_indicator_uses_log_base_label(qtbot, tmp_path):
    """When a log entry lands while the Stat block is visible, the marker
    builds on top of the 'Log' name (not 'Combat log')."""
    from gui.state import NPCState
    from gui.npc_tab import NPCTab
    state = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30", cr=1)
    tab = NPCTab(npc_state=state, actions=[], log_path=tmp_path / "log.md")
    qtbot.addWidget(tab)
    tab.console_tabs.setCurrentIndex(1)
    tab.receive_external_log("entry", kind="info")
    assert "● Log" == tab.console_tabs.tabText(0), (
        f"unread indicator should read '● Log', got {tab.console_tabs.tabText(0)!r}"
    )


# ─────────── LLM-finished routing: text + error + no-text ───────────

def test_llm_text_response_appears_in_active_tab_log(qtbot):
    win = _boot(qtbot)
    result = _make_run_result(text="Counterspell takes a Reaction (per PHB).")
    win._on_llm_finished(result)
    text = _active_log_text(win)
    assert "Counterspell takes a Reaction (per PHB)." in text


def test_llm_text_response_tagged_with_info_kind(qtbot):
    """The line entered the log via receive_external_log(kind='info') so a
    future filter UI can show/hide Q&A separately from rolls."""
    win = _boot(qtbot)
    from gui.npc_tab import NPCTab
    cur = win.tabs.currentWidget()
    assert isinstance(cur, NPCTab)
    captured: list[tuple[str, str | None]] = []
    orig = cur.receive_external_log

    def spy(text, kind=None):
        captured.append((text, kind))
        return orig(text, kind=kind)
    cur.receive_external_log = spy  # type: ignore[method-assign]

    result = _make_run_result(text="counterspell answer here")
    win._on_llm_finished(result)
    assert captured, "receive_external_log was never called"
    text, kind = captured[-1]
    assert "counterspell answer here" in text
    assert kind == "info", f"expected kind='info', got {kind!r}"


def test_llm_text_response_not_in_status_bar(qtbot):
    """The status bar (footer) MUST NOT carry the text reply — that was the
    bug. It should be empty (the persistent 'thinking…' message cleared)."""
    win = _boot(qtbot)
    # Simulate the in-flight thinking message that real _on_llm_fallback sets.
    win.statusBar().showMessage("LLM thinking about: 'does counterspell take an action' …")
    result = _make_run_result(text="Counterspell takes a Reaction.")
    win._on_llm_finished(result)
    bar_text = win.statusBar().currentMessage()
    assert "Counterspell" not in bar_text, (
        f"text reply should NOT appear in status bar; got {bar_text!r}"
    )


def test_llm_error_appears_in_active_tab_log(qtbot):
    win = _boot(qtbot)
    result = _make_run_result(error="rate limited")
    win._on_llm_finished(result)
    text = _active_log_text(win)
    assert "rate limited" in text


def test_llm_error_tagged_with_error_kind(qtbot):
    win = _boot(qtbot)
    from gui.npc_tab import NPCTab
    cur = win.tabs.currentWidget()
    assert isinstance(cur, NPCTab)
    captured: list[tuple[str, str | None]] = []
    cur.receive_external_log = lambda text, kind=None: captured.append((text, kind))  # type: ignore[method-assign]

    result = _make_run_result(error="something broke")
    win._on_llm_finished(result)
    assert captured
    text, kind = captured[-1]
    assert "something broke" in text
    assert kind == "error", f"expected kind='error', got {kind!r}"


def test_tool_only_run_does_not_push_redundant_log_entry(qtbot):
    """If the LLM only fired tools (no text reply), those tools already
    surfaced their own log lines (via _tool_add_log_entry). Don't double-
    log a generic 'ran N tools' line."""
    win = _boot(qtbot)
    from gui.npc_tab import NPCTab
    cur = win.tabs.currentWidget()
    assert isinstance(cur, NPCTab)
    captured: list[tuple[str, str | None]] = []
    cur.receive_external_log = lambda text, kind=None: captured.append((text, kind))  # type: ignore[method-assign]

    result = _make_run_result(text="", tool_calls=[{"tool": "apply_damage"}])
    win._on_llm_finished(result)
    assert captured == [], (
        f"tool-only run should not push a redundant log entry; got {captured!r}"
    )


def test_thinking_status_clears_when_no_text_and_no_error(qtbot):
    """For tool-only runs, the status bar's 'thinking…' message should still
    clear when the run finishes (the live indicator's job is done)."""
    win = _boot(qtbot)
    win.statusBar().showMessage("LLM thinking about: '2 -8 fire' …")
    result = _make_run_result(text="", tool_calls=[{"tool": "apply_damage"}])
    win._on_llm_finished(result)
    bar_text = win.statusBar().currentMessage()
    assert "thinking" not in bar_text.lower(), (
        f"stale 'thinking…' left in status bar after finish; got {bar_text!r}"
    )


# ─────────── kind-styling in receive_external_log ───────────

def test_receive_external_log_color_per_kind(qtbot, tmp_path):
    """Different kinds use distinct colors so the eye can scan the log.
    No filter UI yet, but visual differentiation lays the groundwork."""
    from gui.state import NPCState
    from gui.npc_tab import NPCTab
    state = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30", cr=1)
    tab = NPCTab(npc_state=state, actions=[], log_path=tmp_path / "log.md")
    qtbot.addWidget(tab)

    tab.receive_external_log("a spell happened", kind="spell")
    tab.receive_external_log("an info reply", kind="info")
    tab.receive_external_log("an error broke", kind="error")
    tab.receive_external_log("a generic event", kind="event")
    html = tab.log_view.toHtml()
    # Colors must differ — exact hex matters less than that they're distinct.
    # Pull all `color:#...` from log; assert each kind got its own bucket.
    import re
    colors = re.findall(r"color\s*:\s*(#[0-9a-fA-F]{6})", html)
    # Build a per-text mapping by re-running and looking up surroundings.
    # Simpler check: the FOUR entries each contributed a `color:#…` styling.
    # The set of distinct colors must be at LEAST 3 (info/error/spell at minimum;
    # event MAY collapse to a default — that's acceptable).
    assert len(set(colors)) >= 3, (
        f"need at least 3 distinct colors for kinds {{spell,info,error}}; "
        f"got colors={set(colors)!r}"
    )
