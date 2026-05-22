"""Tests for review-related fixes in MainWindow.

Covers:
  - Fix 1: snapshot save→load round-trips in_melee and pinned_notes
  - Fix 2: directed command to an out-of-range mob member logs an error and fires no events
  - Fix 3: stale-review advisory downgrade when target HP changes between enqueue and return
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from dataclasses import dataclass, field

import pytest
from PySide6.QtCore import Qt

from gui.dispatcher import parse
from gui.main_window import MainWindow
from gui.state import EncounterState, NPCState, serialize_encounter


# ─────────── shared fixtures ───────────


@pytest.fixture
def tmp_encounter(tmp_path):
    """Two-NPC encounter: a single-creature actor and a 3-member mob target."""
    actor = NPCState(
        slug="pc-fighter",
        name="Fighter",
        max_hp=50,
        ac=16,
        speed="30 ft.",
        cr=0.0,
        kind="pc",
    )
    actor.id = "1"

    mob = NPCState(
        slug="gnoll-mob",
        name="Gnoll Mob",
        max_hp=12,
        ac=13,
        speed="30 ft.",
        cr=0.5,
        count=3,
    )
    mob.id = "2"

    return EncounterState(
        name="test-review",
        root=tmp_path,
        log_path=tmp_path / "combat.md",
        npcs=[actor, mob],
    )


@pytest.fixture
def window(qtbot, tmp_encounter):
    """MainWindow for the two-NPC encounter, no LLM wired."""
    win = MainWindow(tmp_encounter)
    qtbot.addWidget(win)
    return win


# ─────────── Fix 1: snapshot round-trip of in_melee and pinned_notes ───────────


def test_snapshot_restores_in_melee(window, tmp_path, monkeypatch):
    """After loading a snapshot, in_melee must match the saved value."""
    npc = window.encounter_state.npcs[0]
    npc.in_melee = True

    snap_path = tmp_path / "snap.json"
    snap_path.write_text(json.dumps(serialize_encounter(window.encounter_state)), encoding="utf-8")

    # Mutate live state to something different.
    npc.in_melee = False

    monkeypatch.setattr(
        "gui.main_window.QFileDialog.getOpenFileName",
        lambda *a, **kw: (str(snap_path), "JSON (*.json)"),
    )
    window._load_snapshot()

    assert window.encounter_state.npcs[0].in_melee is True


def test_snapshot_restores_pinned_notes(window, tmp_path, monkeypatch):
    """After loading a snapshot, pinned_notes must match the saved list."""
    npc = window.encounter_state.npcs[0]
    npc.pinned_notes = ["concentrated on web", "grappling goblin"]

    snap_path = tmp_path / "snap.json"
    snap_path.write_text(json.dumps(serialize_encounter(window.encounter_state)), encoding="utf-8")

    # Wipe live state.
    npc.pinned_notes = []

    monkeypatch.setattr(
        "gui.main_window.QFileDialog.getOpenFileName",
        lambda *a, **kw: (str(snap_path), "JSON (*.json)"),
    )
    window._load_snapshot()

    assert window.encounter_state.npcs[0].pinned_notes == ["concentrated on web", "grappling goblin"]


def test_snapshot_restores_in_melee_false(window, tmp_path, monkeypatch):
    """Restoring a snapshot where in_melee is False clears a previously-True value."""
    npc = window.encounter_state.npcs[1]  # mob
    npc.in_melee = False

    snap_path = tmp_path / "snap.json"
    snap_path.write_text(json.dumps(serialize_encounter(window.encounter_state)), encoding="utf-8")

    npc.in_melee = True  # changed after snapshot

    monkeypatch.setattr(
        "gui.main_window.QFileDialog.getOpenFileName",
        lambda *a, **kw: (str(snap_path), "JSON (*.json)"),
    )
    window._load_snapshot()

    assert window.encounter_state.npcs[1].in_melee is False


# ─────────── Fix 2: out-of-range mob member logs error, no event fired ───────────


def test_out_of_range_mob_member_logs_error(window, qtbot):
    """A directed damage to m99 (out of range for a 3-member mob) should log
    a warning on the actor tab.

    Mob-member grammar: '<target_id> m<n> <amount> <dmg-tag>'
    e.g. '2 m99 10 dmg' means: target combatant #2, member 99, 10 damage.
    """
    window.tabs.setCurrentIndex(0)  # actor is tab 0

    cmd = parse("2 m99 10 dmg")
    assert cmd.effects[0].member == 99, "precondition: parser sets member on the amount"
    window._on_command(cmd)

    actor_tab = window.tabs.widget(0)
    log_html = actor_tab.log_view.toHtml()
    assert "no such target" in log_html or "m99" in log_html


def test_out_of_range_mob_member_fires_no_damage_event(window, qtbot):
    """A skipped command must not emit any damage/heal event on the bus."""
    events_received: list = []
    window.event_bus.subscribe_all(events_received.append)

    window.tabs.setCurrentIndex(0)
    window._on_command(parse("2 m99 10 dmg"))

    # No damage/heal event should have been emitted for this skipped command.
    kinds = [e.kind for e in events_received]
    assert "damage" not in kinds and "heal" not in kinds, f"Unexpected events: {kinds}"


def test_out_of_range_mob_member_does_not_change_hp(window):
    """HP must be unchanged after a skipped m-targeted command."""
    mob = window.encounter_state.npcs[1]
    before_hp = mob.hp

    window.tabs.setCurrentIndex(0)
    window._on_command(parse("2 m99 8 dmg"))

    assert mob.hp == before_hp


def test_dead_mob_member_heal_skipped_logs_error(window, qtbot):
    """Healing a dead member (m1 when m1 is dead) returns skipped → logs a warning."""
    mob = window.encounter_state.npcs[1]
    mob.member_hp[0] = 0  # kill m1 directly

    window.tabs.setCurrentIndex(0)
    window._on_command(parse("2 m1 5 heal"))

    actor_tab = window.tabs.widget(0)
    log_html = actor_tab.log_view.toHtml()
    assert "no such target" in log_html or "m1" in log_html
    # m1 HP must stay 0 — the skip prevented any mutation.
    assert mob.member_hp[0] == 0


def test_valid_mob_member_still_applies_damage(window):
    """A valid m2 target on a 3-member mob should apply damage normally."""
    mob = window.encounter_state.npcs[1]
    before_m2 = mob.member_hp[1]

    window.tabs.setCurrentIndex(0)
    window._on_command(parse("2 m2 5 dmg"))

    assert mob.member_hp[1] == before_m2 - 5


# ─────────── Fix 3: stale-review advisory downgrade ───────────


def _make_fake_result(text: str = "review text", error: str | None = None):
    """Build a minimal RunResult-like object (avoids importing llm_controller)."""
    class FakeResult:
        pass

    r = FakeResult()
    r.text = text
    r.error = error
    r.tool_calls = []
    return r


def test_review_advisory_when_hp_changed(window, qtbot):
    """If target HP changed after enqueue, _on_review_finished should downgrade
    to advisory log (no state mutation, advisory text logged on the tab)."""
    target_npc = window.encounter_state.npcs[1]  # mob
    hp_at_enqueue = target_npc.hp

    # Simulate HP change after enqueue (rapid command arrived).
    target_npc.member_hp[0] = max(0, target_npc.member_hp[0] - 5)
    assert target_npc.hp != hp_at_enqueue, "HP should have changed for this test to be meaningful"

    # Track any refreshes that happen.
    refresh_calls: list[str] = []
    original_refresh = window.tabs.widget(1).refresh
    window.tabs.widget(1).refresh = lambda: refresh_calls.append("refresh")  # type: ignore

    result = _make_fake_result("deal 5 piercing")
    window._on_review_finished(result, target_npc, hp_at_enqueue=hp_at_enqueue)

    # The advisory text should appear on the mob's tab.
    mob_tab = window.tabs.widget(1)
    log_html = mob_tab.log_view.toHtml()
    assert "advisory" in log_html or "state changed" in log_html or "⟳" in log_html

    # In advisory mode, refresh() on the target tab should NOT have been called
    # (we skipped the normal refresh path).
    assert "refresh" not in refresh_calls


def test_review_applies_normally_when_hp_unchanged(window, qtbot):
    """If HP is unchanged, _on_review_finished proceeds normally (refresh, title update)."""
    target_npc = window.encounter_state.npcs[1]
    hp_at_enqueue = target_npc.hp

    refresh_calls: list[str] = []
    original_refresh = window.tabs.widget(1).refresh
    window.tabs.widget(1).refresh = lambda: refresh_calls.append("refresh")  # type: ignore

    result = _make_fake_result("looks fine")
    # Emit so we can catch the signal.
    received = []
    window.llm_run_finished.connect(received.append)

    window._on_review_finished(result, target_npc, hp_at_enqueue=hp_at_enqueue)

    # Normal path: refresh was called, signal emitted.
    assert "refresh" in refresh_calls
    assert received


def test_review_without_hp_snapshot_applies_normally(window):
    """When hp_at_enqueue is None (legacy callers), no stale check occurs."""
    target_npc = window.encounter_state.npcs[0]

    received = []
    window.llm_run_finished.connect(received.append)

    result = _make_fake_result("ok")
    window._on_review_finished(result, target_npc, hp_at_enqueue=None)

    assert received


# ─────────── Fix 4: _LLMWorkerBase is shared base class ───────────


def test_worker_base_class_hierarchy():
    """_LLMRunWorker and _LLMReviewWorker both inherit from _LLMWorkerBase."""
    from gui.main_window import _LLMWorkerBase, _LLMRunWorker, _LLMReviewWorker
    assert issubclass(_LLMRunWorker, _LLMWorkerBase)
    assert issubclass(_LLMReviewWorker, _LLMWorkerBase)


def test_worker_base_has_marshalled_dispatch():
    """_LLMWorkerBase defines _marshalled_dispatch (not duplicated on subclasses)."""
    from gui.main_window import _LLMWorkerBase, _LLMRunWorker, _LLMReviewWorker
    # The method should live on the base, not be re-defined on each subclass.
    assert "_marshalled_dispatch" in _LLMWorkerBase.__dict__
    assert "_marshalled_dispatch" not in _LLMRunWorker.__dict__
    assert "_marshalled_dispatch" not in _LLMReviewWorker.__dict__
