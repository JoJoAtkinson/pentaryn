"""Tests: async LLM review pipeline is triggered by mutating commands.

Covers the re-wired trigger in _on_command that calls _enqueue_review after
every real state mutation. Verifies:
  - A damage command triggers _enqueue_review with actor + target + raw string.
  - A heal command triggers _enqueue_review.
  - A condition command triggers _enqueue_review.
  - A set_target command does NOT trigger _enqueue_review.
  - An unparseable command does NOT trigger _enqueue_review.
  - A no-op command (e.g. condition that changes nothing) does NOT trigger review.
"""

from __future__ import annotations

import pathlib
from unittest.mock import MagicMock, patch, call

import pytest

from gui.dispatcher import parse
from gui.main_window import MainWindow
from gui.state import EncounterState, NPCState


# ─────────── fixtures ───────────


def _npc(name: str, nid: str, hp: int, *, kind: str = "npc") -> NPCState:
    n = NPCState(
        slug=name.lower(),
        name=name,
        max_hp=hp,
        ac=13,
        speed="30 ft.",
        cr=1.0,
        kind=kind,
    )
    n.id = nid
    return n


@pytest.fixture
def window(qtbot, tmp_path):
    """Two NPCs: Actor (id=1, npc) and Target (id=2, npc)."""
    npcs = [
        _npc("Actor", "1", 50),
        _npc("Target", "2", 40),
    ]
    es = EncounterState(
        name="review-trigger-test",
        root=pathlib.Path(tmp_path),
        log_path=pathlib.Path(tmp_path) / "combat.md",
        npcs=npcs,
    )
    win = MainWindow(es)
    qtbot.addWidget(win)
    # Set actor as active tab so encounter_state.active_npc is defined.
    win.tabs.setCurrentIndex(0)
    return win


# ─────────── mutating commands enqueue a review ───────────


def test_damage_command_enqueues_review(window):
    """A damage command that changes HP triggers _enqueue_review."""
    enqueue_calls: list[tuple] = []

    def fake_enqueue(raw, actor, target, *, applied_direction, applied_amount):
        enqueue_calls.append((raw, actor, target, applied_direction, applied_amount))

    window._enqueue_review = fake_enqueue

    cmd = parse("2 10 dmg")
    window._on_command(cmd)

    assert len(enqueue_calls) == 1, f"Expected 1 enqueue call, got {enqueue_calls}"
    raw, actor, target, direction, amount = enqueue_calls[0]
    assert raw == "2 10 dmg"
    # actor is the active NPC (id=1)
    assert actor is not None
    assert actor.id == "1"
    # target is combatant id=2
    assert target is not None
    assert target.id == "2"
    # direction and amount are None (passed through as-is from the new path)
    assert direction is None
    assert amount is None


def test_heal_command_enqueues_review(window):
    """A heal command that changes HP triggers _enqueue_review."""
    # First damage the target so a heal will change state.
    window.encounter_state.combatant_by_id("2").apply_damage(20)

    enqueue_calls: list[tuple] = []

    def fake_enqueue(raw, actor, target, *, applied_direction, applied_amount):
        enqueue_calls.append((raw, actor, target))

    window._enqueue_review = fake_enqueue

    cmd = parse("2 5 heal")
    window._on_command(cmd)

    assert len(enqueue_calls) == 1, f"Expected 1 enqueue call, got {enqueue_calls}"
    _, actor, target = enqueue_calls[0]
    assert actor.id == "1"
    assert target.id == "2"


def test_condition_command_enqueues_review(window):
    """A condition command that changes state triggers _enqueue_review."""
    enqueue_calls: list[tuple] = []

    def fake_enqueue(raw, actor, target, *, applied_direction, applied_amount):
        enqueue_calls.append((raw, actor, target))

    window._enqueue_review = fake_enqueue

    # Apply 'prone' to combatant 2 (known condition — should change state).
    cmd = parse("2 @prone")
    window._on_command(cmd)

    assert len(enqueue_calls) == 1, f"Expected 1 enqueue call, got {enqueue_calls}"
    _, actor, target = enqueue_calls[0]
    assert actor.id == "1"
    assert target.id == "2"


# ─────────── non-mutating commands do NOT enqueue a review ───────────


def test_set_target_does_not_enqueue_review(window):
    """set_target (bare '<id>') must NOT trigger _enqueue_review."""
    enqueue_calls: list[tuple] = []

    def fake_enqueue(raw, actor, target, *, applied_direction, applied_amount):
        enqueue_calls.append((raw,))

    window._enqueue_review = fake_enqueue

    cmd = parse("2")
    assert cmd.kind == "set_target", f"Precondition: expected set_target, got {cmd.kind!r}"
    window._on_command(cmd)

    assert enqueue_calls == [], f"set_target must not enqueue review, got {enqueue_calls}"


def test_unparseable_does_not_enqueue_review(window, monkeypatch):
    """An unparseable command (LLM fallback path) must NOT trigger _enqueue_review."""
    enqueue_calls: list[tuple] = []

    def fake_enqueue(raw, actor, target, *, applied_direction, applied_amount):
        enqueue_calls.append((raw,))

    window._enqueue_review = fake_enqueue

    # Patch _on_llm_fallback so we don't need a real LLM controller.
    window._on_llm_fallback = lambda *a, **kw: None

    cmd = parse("!!this is unparseable!!")
    assert cmd.kind == "unparseable", f"Precondition failed: got {cmd.kind!r}"
    window._on_command(cmd)

    assert enqueue_calls == [], f"unparseable must not enqueue review, got {enqueue_calls}"


def test_noop_command_does_not_enqueue_review(window):
    """A command that changes nothing (true no-op) must NOT trigger _enqueue_review.

    Applying prone to a combatant that already has prone is a no-op — state
    unchanged, so undo snapshot is discarded and review is skipped.
    """
    # Pre-apply prone to target so the next toggle is a no-op (removes it).
    # Actually, toggling OFF prone would change state. So we need a condition
    # that the parser rejects — an unknown condition.
    # Use a clearly unknown condition string to produce a no-op sentinel.
    enqueue_calls: list[tuple] = []

    def fake_enqueue(raw, actor, target, *, applied_direction, applied_amount):
        enqueue_calls.append((raw,))

    window._enqueue_review = fake_enqueue

    # An unknown condition produces a CONDITION_UNKNOWN_SENTINEL in fragments
    # and leaves state unchanged. The state diff check in _on_command then
    # discards the snapshot — and must NOT enqueue a review.
    cmd = parse("2 @totally_unknown_condition_xyz")
    before_hp = window.encounter_state.combatant_by_id("2").hp
    window._on_command(cmd)

    # HP unchanged, conditions unchanged (unknown condition was rejected).
    assert window.encounter_state.combatant_by_id("2").hp == before_hp
    assert enqueue_calls == [], (
        f"No-op command must not enqueue review, got {enqueue_calls}"
    )
