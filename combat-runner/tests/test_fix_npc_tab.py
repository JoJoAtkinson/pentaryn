"""Regression tests for two verified NPCTab bugs.

Fix 1 — slot `refresh` modes silently never refill.
  The round-event handler used to only honor `refresh: "round"`. The shipped
  data also uses `short_rest`/`long_rest`. Correct at-the-table semantics:
  `round`/`turn` slots refill each round; rest-based modes arrive full at
  encounter start and must NOT refill mid-encounter.

Fix 2 — action dispatch could freeze the UI on a network dice fetch.
  The synchronous roll on the UI thread drains a quantum-RNG cache; on drain
  it blocks on a network fetch. The tab now pre-warms the cache off-thread
  via a QThreadPool/QRunnable so the synchronous roll always hits a warm
  cache and never has to fetch.
"""

from __future__ import annotations

from pathlib import Path

from gui.event_bus import EventBus, round_event
from gui.npc_tab import (
    _ROUND_REFRESH_MODES,
    NPCTab,
    _CachePrewarmWorker,
    _PrewarmSignals,
)
from gui.state import NPCState


# ───────── helpers ─────────

def _npc() -> NPCState:
    return NPCState(slug="frost-yeti", name="Frost Yeti", max_hp=60, ac=15, speed="40 ft", cr=3)


def _action(name: str, refresh: str, count: int = 2) -> dict:
    return {
        "npc": "frost-yeti",
        "action": name,
        "type": "single_attack",
        "verbs": [name],
        "slots": {"count": count, "refresh": refresh},
    }


def _tab(qtbot, actions, npc=None, bus=None) -> NPCTab:
    tab = NPCTab(
        npc_state=npc or _npc(),
        actions=actions,
        log_path=Path("/tmp/test-fix-npc-tab.md"),
        event_bus=bus,
    )
    qtbot.addWidget(tab)
    return tab


# ───────── Fix 1: slot refresh modes ─────────

def test_round_refresh_modes_constant_excludes_rest_modes():
    """The set of modes the round handler refills is exactly round + turn."""
    assert _ROUND_REFRESH_MODES == frozenset({"round", "turn"})
    for mode in ("short_rest", "long_rest", "encounter"):
        assert mode not in _ROUND_REFRESH_MODES


def test_round_event_refills_round_mode_slots(qtbot):
    bus = EventBus()
    npc = _npc()
    npc.slots_remaining["frost_breath"] = 0  # fully drained
    tab = _tab(qtbot, [_action("frost_breath", "round", count=1)], npc=npc, bus=bus)

    bus.emit(round_event(2))

    assert tab.npc_state.slots_remaining["frost_breath"] == 1


def test_round_event_does_not_refill_long_rest_slots(qtbot):
    """A `long_rest` slot drained mid-combat must stay drained on a round
    advance — it only recharges on a rest, which precedes a fresh combat."""
    bus = EventBus()
    npc = _npc()
    npc.slots_remaining["avalanche"] = 0
    tab = _tab(qtbot, [_action("avalanche", "long_rest", count=3)], npc=npc, bus=bus)

    bus.emit(round_event(2))

    assert tab.npc_state.slots_remaining["avalanche"] == 0


def test_round_event_does_not_refill_short_rest_slots(qtbot):
    bus = EventBus()
    npc = _npc()
    npc.slots_remaining["second_wind"] = 0
    tab = _tab(qtbot, [_action("second_wind", "short_rest", count=1)], npc=npc, bus=bus)

    bus.emit(round_event(3))

    assert tab.npc_state.slots_remaining["second_wind"] == 0


def test_round_event_mixed_modes_only_round_refills(qtbot):
    """A `round` slot and a `long_rest` slot drained together: only the
    round-mode one refills on the round event."""
    bus = EventBus()
    npc = _npc()
    npc.slots_remaining["claw_flurry"] = 0
    npc.slots_remaining["avalanche"] = 0
    tab = _tab(
        qtbot,
        [_action("claw_flurry", "round", count=2), _action("avalanche", "long_rest", count=2)],
        npc=npc,
        bus=bus,
    )

    bus.emit(round_event(2))

    assert tab.npc_state.slots_remaining["claw_flurry"] == 2  # refilled
    assert tab.npc_state.slots_remaining["avalanche"] == 0    # untouched


# ───────── Fix 2: background dice-cache pre-warm ─────────

def test_prewarm_worker_runs_offthread_without_blocking(qtbot):
    """The pre-warm worker tops up the dice cache on a worker thread and emits
    `done` back on the GUI thread. Network failure must degrade gracefully —
    `done` still fires (with ok=False), never an unhandled exception."""
    signals = _PrewarmSignals()
    results: list[bool] = []
    signals.done.connect(results.append)

    worker = _CachePrewarmWorker(target=8, signals=signals)
    # Run directly (QRunnable.run is just a method) — exercises the offline-safe
    # path: even if the network is down, run() must not raise.
    worker.run()

    qtbot.waitUntil(lambda: len(results) == 1, timeout=15000)
    assert isinstance(results[0], bool)


def test_run_action_triggers_prewarm_when_cache_low(qtbot, monkeypatch):
    """After a roll, a low cache must kick off exactly one background pre-warm;
    the roll itself stays synchronous and is never blocked."""
    import gui.npc_tab as npc_tab_mod

    actions = [{"npc": "frost-yeti", "action": "bite", "type": "single_attack", "verbs": ["bite"]}]
    tab = _tab(qtbot, actions)

    # Pretend the roll itself succeeded with trivial output.
    monkeypatch.setattr(
        npc_tab_mod._get_roller(),
        "roll_combat_action",
        lambda **kw: '{"output": "bite hits"}',
    )
    # Force a "low cache" reading and capture pre-warm submissions.
    monkeypatch.setattr(tab, "_cache_level", lambda: 0)
    started: list[object] = []
    monkeypatch.setattr(npc_tab_mod, "_PREWARM_IN_FLIGHT", False)
    monkeypatch.setattr(
        npc_tab_mod._prewarm_pool(), "start", lambda w: started.append(w)
    )

    tab._run_action("bite")

    assert len(started) == 1
    assert isinstance(started[0], npc_tab_mod._CachePrewarmWorker)


def test_prewarm_noops_when_cache_is_warm(qtbot, monkeypatch):
    """A healthy cache must not spawn a pre-warm worker — no wasted fetches."""
    import gui.npc_tab as npc_tab_mod

    tab = _tab(qtbot, [])
    monkeypatch.setattr(tab, "_cache_level", lambda: 10_000)  # well above low-water
    started: list[object] = []
    monkeypatch.setattr(npc_tab_mod, "_PREWARM_IN_FLIGHT", False)
    monkeypatch.setattr(npc_tab_mod._prewarm_pool(), "start", lambda w: started.append(w))

    tab._maybe_prewarm_cache()

    assert started == []
