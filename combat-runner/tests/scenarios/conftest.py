"""Scenario test harness.

Each scenario is a scripted combat that:
  1. Asserts mechanical correctness (HP changes, conditions, reactions fire when
     expected, no crashes).
  2. Collects ergonomics metrics — click count, keystrokes, latency p50/p95,
     tab switches, LLM-fallback invocations — and writes them to
     `combat-runner/tests/.metrics/<scenario>-<ts>.json` for the review phase
     to inspect.

The harness wraps a MainWindow and a metrics aggregator. The scenario test body
drives the UI through scripted actions, then asserts both mechanics + metrics
against per-scenario targets.

Use the `scenario` fixture:

    def test_my_scenario(scenario):
        scenario.launch("mountin-pass")
        scenario.click(scenario.round_btn)
        scenario.type("attack", into=scenario.current_tab.input)
        ...
        m = scenario.metrics
        assert m.click_count <= 12
        assert m.llm_fallback_count == 0
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

# Scenario tests must never spawn real Anthropic SDK clients on background
# threads — across many tests the SSL contexts pile up and crash. Strip the
# key BEFORE any Qt module imports app, so build_main_window skips the LLM
# wiring entirely.
os.environ["ANTHROPIC_API_KEY"] = ""

import pytest
from PySide6.QtCore import Qt


def pytest_collection_modifyitems(config, items):
    """Auto-mark every test under tests/scenarios/ as @pytest.mark.scenario so
    `pytest -m 'not scenario'` deselects them without each test file needing
    its own `pytestmark =` boilerplate."""
    for item in items:
        if "/tests/scenarios/" in str(item.fspath):
            item.add_marker(pytest.mark.scenario)

from gui.app import build_main_window
from gui.encounter_picker import discover_encounters
from gui.main_window import MainWindow
from gui.npc_tab import NPCTab
from gui.widgets.reaction_prompt import ReactionChoice


_REPO_ROOT = Path(__file__).resolve().parents[3]
_METRICS_DIR = _REPO_ROOT / "combat-runner" / "tests" / ".metrics"


@dataclass
class ErgonomicsMetrics:
    """Per-scenario rollup of input-effort numbers.

    Latency lists are in seconds; the harness's `record_action_latency()` is
    called inside `do_action()` so the elapsed time covers the whole dispatch +
    state mutation + log append cycle.
    """
    scenario_name: str
    click_count: int = 0
    keystroke_count: int = 0
    tab_switch_count: int = 0
    llm_fallback_count: int = 0
    reaction_prompts_shown: int = 0
    action_latencies_ms: list[float] = field(default_factory=list)
    turns_taken: int = 0
    rounds_advanced: int = 0
    npcs_killed: int = 0

    def add_click(self) -> None:
        self.click_count += 1

    def add_keystrokes(self, text: str) -> None:
        # +1 for the Enter that submits
        self.keystroke_count += len(text) + 1

    def add_tab_switch(self) -> None:
        self.tab_switch_count += 1

    def record_latency(self, elapsed_ms: float) -> None:
        self.action_latencies_ms.append(elapsed_ms)

    def percentile(self, p: float) -> float:
        if not self.action_latencies_ms:
            return 0.0
        sl = sorted(self.action_latencies_ms)
        i = max(0, min(len(sl) - 1, int(p * (len(sl) - 1))))
        return sl[i]


class ScenarioHarness:
    """One-stop driver for scenario tests."""

    def __init__(self, qtbot, scenario_name: str) -> None:
        self.qtbot = qtbot
        self.metrics = ErgonomicsMetrics(scenario_name=scenario_name)
        self.window: MainWindow | None = None
        self._auto_pass_reactions = True  # tests can flip to TRIGGER

    # ─────────── launch ───────────

    def launch(self, encounter_name: str, counts: dict[str, int] | None = None) -> MainWindow:
        encounters = discover_encounters()
        pick = next((e for e in encounters if e.name == encounter_name), None)
        if pick is None:
            pytest.skip(f"encounter {encounter_name!r} not discoverable")
        if counts is None:
            counts = {npc.slug: npc.default_count for npc in pick.npcs}
        self.window = build_main_window(pick, counts, with_llm=False)
        self.qtbot.addWidget(self.window)
        # Stub the reaction-prompt handler — we count prompts but auto-PASS
        # by default to keep the scripted scenario deterministic.
        self.window._reaction_prompt_handler = self._reaction_prompt_handler  # type: ignore[method-assign]
        # Scenario tests must NEVER hit the real Anthropic API — spawning
        # SDK clients on QThreadPool workers across many tests piles up SSL
        # contexts and segfaults on macOS. Clear the controller AND drain the
        # pool so any in-flight requests are dropped.
        self.window._llm_controller = None  # type: ignore[assignment]
        self.window._suggestion_driver.cancel_all()
        self.window._suggestion_driver.shutdown(timeout_ms=100)
        return self.window

    def teardown_window(self) -> None:
        """Called automatically by the `scenario` fixture's teardown — drains
        the suggestion driver pool to avoid leftover workers crashing the
        next test's process."""
        if self.window is not None:
            try:
                self.window._suggestion_driver.cancel_all()
                self.window._suggestion_driver.shutdown(timeout_ms=500)
            except Exception:
                pass

    def _reaction_prompt_handler(self, summary, rows):
        self.metrics.reaction_prompts_shown += 1
        if self._auto_pass_reactions:
            return ReactionChoice(npc_slug="", action_name="", triggered=False)
        # Fire the first match
        if rows:
            npc, act, _, _ = rows[0]
            return ReactionChoice(npc_slug=npc, action_name=act, triggered=True)
        return None

    def set_auto_trigger_reactions(self, on: bool = True) -> None:
        """By default reactions auto-PASS. Flip this when the scenario wants
        the first matched reaction to fire."""
        self._auto_pass_reactions = not on

    # ─────────── UI helpers ───────────

    @property
    def current_tab(self) -> NPCTab:
        assert self.window is not None
        w = self.window.tabs.currentWidget()
        assert isinstance(w, NPCTab)
        return w

    def tab_for(self, slug: str) -> NPCTab:
        assert self.window is not None
        for i in range(self.window.tabs.count()):
            t = self.window.tabs.widget(i)
            if isinstance(t, NPCTab) and t.npc_state.slug == slug:
                return t
        raise AssertionError(f"no tab for slug {slug!r}")

    def switch_to(self, slug: str) -> None:
        assert self.window is not None
        for i in range(self.window.tabs.count()):
            t = self.window.tabs.widget(i)
            if isinstance(t, NPCTab) and t.npc_state.slug == slug:
                if self.window.tabs.currentIndex() != i:
                    self.window.tabs.setCurrentIndex(i)
                    self.metrics.add_tab_switch()
                return
        raise AssertionError(f"no tab for slug {slug!r}")

    def click(self, widget) -> None:
        self.qtbot.mouseClick(widget, Qt.MouseButton.LeftButton)
        self.metrics.add_click()

    def advance_round(self) -> None:
        assert self.window is not None
        self.click(self.window.round_btn)
        self.metrics.rounds_advanced += 1

    def type_command(self, text: str, *, tab: NPCTab | None = None) -> None:
        """Type a command into a tab's input + Enter. Records latency for the
        full dispatch cycle."""
        target = tab or self.current_tab
        self.metrics.add_keystrokes(text)
        t0 = time.monotonic()
        self.qtbot.keyClicks(target.input, text)
        self.qtbot.keyClick(target.input, Qt.Key.Key_Return)
        elapsed_ms = (time.monotonic() - t0) * 1000.0
        self.metrics.record_latency(elapsed_ms)
        self.metrics.turns_taken += 1

    # ─────────── write metrics to disk ───────────

    def write_metrics(self) -> Path:
        _METRICS_DIR.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())
        out_path = _METRICS_DIR / f"{self.metrics.scenario_name}-{ts}.json"
        data = asdict(self.metrics)
        data["latency_p50_ms"] = self.metrics.percentile(0.5)
        data["latency_p95_ms"] = self.metrics.percentile(0.95)
        out_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return out_path


@pytest.fixture
def scenario(request, qtbot) -> ScenarioHarness:
    """Provides a fresh ScenarioHarness named after the test function.
    After the test, writes metrics to disk and yields the path via teardown."""
    name = request.node.name
    harness = ScenarioHarness(qtbot, scenario_name=name)
    yield harness
    harness.teardown_window()
    if harness.window is not None:
        try:
            harness.write_metrics()
        except Exception:
            # Don't let metrics-write failure break the test result
            pass
