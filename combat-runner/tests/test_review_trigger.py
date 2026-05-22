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
    """A damage command that changes HP triggers _enqueue_review.

    New signature: _enqueue_review(cmd, actor, ids, before, after, **kwargs).
    """
    enqueue_calls: list[tuple] = []

    def fake_enqueue(cmd, actor, ids, before, after, **kwargs):
        enqueue_calls.append((cmd, actor, ids, before, after))

    window._enqueue_review = fake_enqueue

    cmd = parse("2 10 dmg")
    window._on_command(cmd)

    assert len(enqueue_calls) == 1, f"Expected 1 enqueue call, got {enqueue_calls}"
    got_cmd, actor, ids, before, after = enqueue_calls[0]
    assert got_cmd.raw == "2 10 dmg"
    # actor is the active NPC (id=1)
    assert actor is not None
    assert actor.id == "1"
    # ids resolves to combatant id=2
    assert ids == ["2"]
    # before / after are serialized encounter snapshots (dicts)
    assert isinstance(before, dict) and isinstance(after, dict)
    assert before != after, "snapshot diff should be non-empty for a real mutation"


def test_heal_command_enqueues_review(window):
    """A heal command that changes HP triggers _enqueue_review."""
    # First damage the target so a heal will change state.
    window.encounter_state.combatant_by_id("2").apply_damage(20)

    enqueue_calls: list[tuple] = []

    def fake_enqueue(cmd, actor, ids, before, after, **kwargs):
        enqueue_calls.append((cmd, actor, ids))

    window._enqueue_review = fake_enqueue

    cmd = parse("2 5 heal")
    window._on_command(cmd)

    assert len(enqueue_calls) == 1, f"Expected 1 enqueue call, got {enqueue_calls}"
    _, actor, ids = enqueue_calls[0]
    assert actor.id == "1"
    assert ids == ["2"]


def test_condition_command_enqueues_review(window):
    """A condition command that changes state triggers _enqueue_review."""
    enqueue_calls: list[tuple] = []

    def fake_enqueue(cmd, actor, ids, before, after, **kwargs):
        enqueue_calls.append((cmd, actor, ids))

    window._enqueue_review = fake_enqueue

    # Apply 'prone' to combatant 2 (known condition — should change state).
    cmd = parse("2 @prone")
    window._on_command(cmd)

    assert len(enqueue_calls) == 1, f"Expected 1 enqueue call, got {enqueue_calls}"
    _, actor, ids = enqueue_calls[0]
    assert actor.id == "1"
    assert ids == ["2"]


# ─────────── non-mutating commands do NOT enqueue a review ───────────


def test_set_target_does_not_enqueue_review(window):
    """set_target (bare '<id>') must NOT trigger _enqueue_review."""
    enqueue_calls: list[tuple] = []

    def fake_enqueue(cmd, actor, ids, before, after):
        enqueue_calls.append((cmd,))

    window._enqueue_review = fake_enqueue

    cmd = parse("2")
    assert cmd.kind == "set_target", f"Precondition: expected set_target, got {cmd.kind!r}"
    window._on_command(cmd)

    assert enqueue_calls == [], f"set_target must not enqueue review, got {enqueue_calls}"


def test_unparseable_does_not_enqueue_review(window, monkeypatch):
    """An unparseable command (LLM fallback path) must NOT trigger _enqueue_review."""
    enqueue_calls: list[tuple] = []

    def fake_enqueue(cmd, actor, ids, before, after):
        enqueue_calls.append((cmd,))

    window._enqueue_review = fake_enqueue

    # Patch _on_llm_fallback so we don't need a real LLM controller.
    window._on_llm_fallback = lambda *a, **kw: None

    cmd = parse("!!this is unparseable!!")
    assert cmd.kind == "unparseable", f"Precondition failed: got {cmd.kind!r}"
    window._on_command(cmd)

    assert enqueue_calls == [], f"unparseable must not enqueue review, got {enqueue_calls}"


def test_noop_unknown_condition_does_not_enqueue_review(window, monkeypatch):
    """An unknown @condition (unparseable path) must NOT trigger _enqueue_review.

    `parse("2 @totally_unknown_condition_xyz")` returns kind="unparseable" because
    Fix 2 made unknown forced-condition tokens unparseable. This test verifies the
    unparseable path does not enqueue, complementing test_unparseable_does_not_enqueue_review.
    """
    enqueue_calls: list[tuple] = []

    def fake_enqueue(cmd, actor, ids, before, after):
        enqueue_calls.append((cmd,))

    window._enqueue_review = fake_enqueue
    window._on_llm_fallback = lambda *a, **kw: None

    cmd = parse("2 @totally_unknown_condition_xyz")
    assert cmd.kind == "unparseable", (
        f"Precondition: expected unparseable, got {cmd.kind!r}"
    )
    before_hp = window.encounter_state.combatant_by_id("2").hp
    window._on_command(cmd)

    assert window.encounter_state.combatant_by_id("2").hp == before_hp
    assert enqueue_calls == [], (
        f"unparseable command must not enqueue review, got {enqueue_calls}"
    )


# ─────────── _enqueue_review hands the controller real context ───────────


def test_enqueue_review_passes_real_applied_delta(window):
    """_enqueue_review must call review_command with the REAL before→after
    delta + immunities + roster — not applied_direction=None / target-only.

    Mocked controller — no live API.
    """
    captured: dict = {}

    class FakeController:
        def review_command(self, **kw):
            captured.update(kw)
            from gui.llm_controller import RunResult
            return RunResult()

    window._llm_controller = FakeController()

    # Give the target an immunity so GAP 2 is exercised.
    target = window.encounter_state.combatant_by_id("2")
    target.immunities = ("fire",)

    cmd = parse("2 10 fire")
    window._on_command(cmd)
    # Drain the single-thread LLM pool so the worker finishes.
    window._llm_pool.waitForDone(5000)

    assert captured, "review_command was never called"
    # GAP 1: real applied direction + amount, not None.
    assert captured["applied_direction"] == "damage"
    assert captured["applied_amount"] == 10
    # GAP 1 + 3: affected carries before→after HP.
    affected = captured["affected"]
    assert len(affected) == 1
    a = affected[0]
    assert a["id"] == "2"
    assert a["hp_before"] == 40
    assert a["hp_after"] == 30
    # GAP 2: immunities are present.
    assert "fire" in a["immunities"]
    # GAP 4: roster lists every combatant with kind.
    roster_ids = {r["id"] for r in captured["roster"]}
    assert roster_ids == {"1", "2"}
    assert all("kind" in r and "name" in r for r in captured["roster"])


def test_enqueue_review_multi_target_includes_all(window, tmp_path):
    """A multi-target command puts ALL targets in `affected`."""
    # Add a third combatant so we can target two at once.
    extra = _npc("Extra", "3", 30)
    window.encounter_state.npcs.append(extra)

    captured: dict = {}

    class FakeController:
        def review_command(self, **kw):
            captured.update(kw)
            from gui.llm_controller import RunResult
            return RunResult()

    window._llm_controller = FakeController()

    cmd = parse("23 8 fire")  # targets combatants 2 and 3
    assert cmd.target_ids == ["2", "3"], f"precondition: {cmd.target_ids}"
    window._on_command(cmd)
    window._llm_pool.waitForDone(5000)

    assert captured, "review_command was never called"
    affected_ids = {a["id"] for a in captured["affected"]}
    assert affected_ids == {"2", "3"}, (
        f"multi-target command must review all targets, got {affected_ids}"
    )


def test_noop_command_does_not_enqueue_review(window):
    """A genuine no-op *command* must NOT trigger _enqueue_review.

    `"prone"` (a bare-word condition) parses as kind="command", use_current=True
    with no explicit target ids. When encounter_state.current_target is empty
    (the default), _resolve_targets returns [] and _handle_command applies
    nothing (it logs a 'no current target' warning and returns) — state is
    unchanged, the undo snapshot is discarded, and review must be skipped.

    This guards the `after == before` review gate in _on_command: if that gate were
    broken so a no-op command DID enqueue review, this test would catch it.
    """
    enqueue_calls: list[tuple] = []

    def fake_enqueue(cmd, actor, ids, before, after):
        enqueue_calls.append((cmd,))

    window._enqueue_review = fake_enqueue

    # Precondition: no current_target set so the command resolves to empty ids.
    window.encounter_state.current_target = []

    cmd = parse("prone")
    assert cmd.kind == "command", (
        f"Precondition: expected command, got {cmd.kind!r}"
    )
    assert cmd.use_current is True, "Precondition: bare-word grammar must use_current"

    before_hp = window.encounter_state.npcs[0].hp
    before_stack_depth = len(window.undo_stack._snapshots)

    window._on_command(cmd)

    # State unchanged — no target resolved, no HP moved.
    assert window.encounter_state.npcs[0].hp == before_hp
    # No-op: the eager snapshot must have been discarded (discard_last called).
    assert len(window.undo_stack._snapshots) == before_stack_depth, (
        f"No-op command must not leave an undo snapshot; "
        f"stack depth was {before_stack_depth}, now {len(window.undo_stack._snapshots)}"
    )
    assert enqueue_calls == [], (
        f"No-op command (empty target set) must not enqueue review, got {enqueue_calls}"
    )


# ─────────── G3/G7/G8: enriched payload from _enqueue_review ───────────


def _capture_controller(window):
    """Attach a FakeController that records the review_command kwargs."""
    captured: dict = {}

    class FakeController:
        def review_command(self, **kw):
            captured.update(kw)
            from gui.llm_controller import RunResult
            return RunResult()

    window._llm_controller = FakeController()
    return captured


def test_enqueue_review_carries_actor_and_per_combatant_kind(window):
    """The payload carries the acting combatant and each combatant's
    allegiance (kind) so the review can reason about friendly fire."""
    captured = _capture_controller(window)

    cmd = parse("2 10 melee")
    window._on_command(cmd)
    window._llm_pool.waitForDone(5000)

    assert captured, "review_command was never called"
    # Actor is explicit with a kind.
    assert captured["actor"]["id"] == "1"
    assert "kind" in captured["actor"]
    # Each affected combatant carries its kind.
    assert all("kind" in a for a in captured["affected"])
    # Roster carries kind for every combatant.
    assert all("kind" in r for r in captured["roster"])


def test_enqueue_review_carries_applied_amount(window):
    """The applied (== typed) amount rides into the review payload."""
    captured = _capture_controller(window)

    cmd = parse("2 25 melee")
    window._on_command(cmd)
    window._llm_pool.waitForDone(5000)

    assert captured, "review_command was never called"
    assert captured["applied_amount"] == 25


def test_enqueue_review_carries_condition_durations(window):
    """Each affected target's condition durations ride in `affected`."""
    captured = _capture_controller(window)

    # Pre-seed an implausible duration on the target, then issue a mutating
    # command so _enqueue_review snapshots the live condition_durations map.
    target = window.encounter_state.combatant_by_id("2")
    target.condition_durations["frightened"] = 90
    target.conditions.add("frightened")

    cmd = parse("2 @prone")
    window._on_command(cmd)
    window._llm_pool.waitForDone(5000)

    assert captured, "review_command was never called"
    affected = captured["affected"]
    a = next(x for x in affected if x["id"] == "2")
    assert "durations_after" in a
    assert a["durations_after"].get("frightened") == 90


def test_enqueue_review_flags_malformed_id_fallback(window):
    """A command using id `0` (resolves to actor-self) surfaces an
    id-resolution fallback flag in the payload."""
    captured = _capture_controller(window)

    cmd = parse("0 @prone")
    assert cmd.target_ids == ["0"], f"precondition: {cmd.target_ids}"
    window._on_command(cmd)
    window._llm_pool.waitForDone(5000)

    assert captured, "review_command was never called"
    fallbacks = captured.get("id_fallbacks") or []
    assert any(fb["token"] == "0" for fb in fallbacks), (
        f"id 0 must be flagged as a fallback, got {fallbacks}"
    )


def test_enqueue_review_flags_unresolved_id_fallback(window):
    """A genuinely malformed id — one that maps to no combatant — is surfaced
    as an `(unresolved)` id-resolution fallback. The command must also mutate
    at least one valid target so the review actually fires (a whole-command
    no-op correctly skips review)."""
    captured = _capture_controller(window)

    # `13` run-splits to ids {1, 3}: id 1 exists (its HP mutates → review
    # fires), id 3 does not exist (the malformed-id fallback under test).
    cmd = parse("13 8 fire")
    assert cmd.target_ids == ["1", "3"], f"precondition: {cmd.target_ids}"
    window._on_command(cmd)
    window._llm_pool.waitForDone(5000)

    assert captured, "review_command was never called"
    fallbacks = captured.get("id_fallbacks") or []
    assert any(
        fb["token"] == "3" and fb["resolved_to"] == "(unresolved)"
        for fb in fallbacks
    ), f"id 3 must be flagged as unresolved, got {fallbacks}"


def test_enqueue_review_no_id_fallback_for_clean_ids(window):
    """A command with a valid explicit id carries no fallback flag."""
    captured = _capture_controller(window)

    cmd = parse("2 10 melee")
    window._on_command(cmd)
    window._llm_pool.waitForDone(5000)

    assert captured, "review_command was never called"
    assert not (captured.get("id_fallbacks") or []), (
        "a clean valid id must not be flagged as a fallback"
    )
