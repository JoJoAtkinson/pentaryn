"""End-to-end tests for the didn't-land / `hit` lifecycle through MainWindow.

The lifecycle (design spec §4) is: a save- or attack-bearing action applies the
*minimum* outcome immediately (a successful save / a miss) and records a
``PendingEffect``. A later ``hit`` command upgrades the targeted combatant(s) to
the full rolled damage. A pending effect from a prior round auto-clears on round
advance. An unresolved pending effect shows a `?` marker in the combatant's tab
title.

These tests drive the real ``_on_command`` path on an offscreen MainWindow but
monkeypatch ``run_action_externally`` so they exercise the lifecycle wiring
without hitting the dice roller / network.
"""

from __future__ import annotations

import pathlib

import pytest

from gui.main_window import MainWindow
from gui.state import EncounterState, NPCState


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
    """Two target NPCs (id 1/2, 40 hp) + an actor PC (id 3)."""
    npcs = [
        _npc("One", "1", 40),
        _npc("Two", "2", 40),
        _npc("Actor", "3", 50, kind="pc"),
    ]
    es = EncounterState(
        name="lifecycle-test",
        root=pathlib.Path(tmp_path),
        log_path=pathlib.Path(tmp_path) / "combat.md",
        npcs=npcs,
    )
    win = MainWindow(es)
    qtbot.addWidget(win)
    return win


def _submit(window, text: str) -> None:
    window.tabs.currentWidget()._on_submitted(text)


def _stub_action(window, *, on_save: str, damage_total: int, kind: str = "save"):
    """Make every NPCTab's `run_action_externally` return a synthetic result
    carrying a structured `rolls` sidecar — and register a fake action so the
    action token resolves."""
    fake_rolls = {
        "kind": kind,
        "damage_total": damage_total,
        "on_save": on_save,
    }
    result = {"output": "stub", "action_type": "area", "rolls": fake_rolls}
    for i in range(window.tabs.count()):
        tab = window.tabs.widget(i)
        # Register a fake action surface entry so `_resolve_action_token`
        # resolves the panel index 1.
        surface = window._tab_action_surfaces.setdefault(id(tab), [])
        surface.insert(0, {"action": "stub_blast", "type": "area"})
        tab.run_action_externally = lambda name, _r=result: _r


# ─────────────────────────── save lifecycle ───────────────────────────


def test_save_action_creates_pending_and_applies_minimum(window):
    """A save-bearing action (on_save=half) applies half immediately and
    records an unresolved PendingEffect."""
    _stub_action(window, on_save="half", damage_total=20)
    one = window.encounter_state.combatant_by_id("1")
    window.tabs.setCurrentIndex(2)  # actor tab
    _submit(window, "1 1")          # target id 1, run action #1
    assert one.hp == 40 - 10        # half of 20 applied immediately
    pending = window.encounter_state.pending_effects
    assert len(pending) == 1
    assert pending[0].combatant_id == "1"
    assert pending[0].resolved is False
    assert pending[0].full_amount == 20
    assert pending[0].source == "stub_blast"
    assert pending[0].round == window.encounter_state.round_num


def test_hit_upgrades_pending_to_full(window):
    """`hit` upgrades the targeted combatant's pending effect to full damage."""
    _stub_action(window, on_save="half", damage_total=20)
    one = window.encounter_state.combatant_by_id("1")
    window.tabs.setCurrentIndex(2)
    _submit(window, "1 1")
    assert one.hp == 30
    _submit(window, "1 hit")        # combatant 1 failed the save
    assert one.hp == 40 - 20        # remaining 10 applied
    assert window.encounter_state.pending_effects[0].resolved is True


def test_hit_wrong_target_does_not_upgrade(window):
    """`hit` against a combatant with nothing pending is a harmless warning."""
    _stub_action(window, on_save="half", damage_total=20)
    one = window.encounter_state.combatant_by_id("1")
    two = window.encounter_state.combatant_by_id("2")
    window.tabs.setCurrentIndex(2)
    _submit(window, "1 1")          # only combatant 1 has a pending effect
    assert one.hp == 30
    _submit(window, "2 hit")        # wrong target — id 2 has nothing pending
    assert two.hp == 40             # untouched
    assert one.hp == 30             # combatant 1 still at the assumed save
    assert window.encounter_state.pending_effects[0].resolved is False


def test_no_damage_action_applies_full_from_zero(window):
    """An on_save='no damage' action applies 0 up front; `hit` applies full."""
    _stub_action(window, on_save="no damage", damage_total=18)
    one = window.encounter_state.combatant_by_id("1")
    window.tabs.setCurrentIndex(2)
    _submit(window, "1 1")
    assert one.hp == 40             # nothing applied — assumed save = no damage
    _submit(window, "1 hit")
    assert one.hp == 40 - 18        # full 18 applied on hit


# ─────────────────────────── round-advance clear ───────────────────────────


def test_round_advance_clears_stale_pending(window):
    """A pending effect from a prior round resolves on round advance."""
    _stub_action(window, on_save="half", damage_total=20)
    window.tabs.setCurrentIndex(2)
    _submit(window, "1 1")
    pending = window.encounter_state.pending_effects[0]
    assert pending.resolved is False
    window._advance_round()
    assert pending.resolved is True


# ─────────────────────────── unresolved marker ───────────────────────────


def test_unresolved_marker_appears_and_clears(window):
    """The `?` tab-title marker appears for an unresolved effect and clears
    once `hit` resolves it."""
    _stub_action(window, on_save="half", damage_total=20)
    window.tabs.setCurrentIndex(2)
    _submit(window, "1 1")
    # combatant id 1 is at tab index 0.
    assert window.tabs.tabText(0).endswith(" ?")
    _submit(window, "1 hit")
    assert not window.tabs.tabText(0).endswith(" ?")


def test_unresolved_marker_clears_on_round_advance(window):
    """The marker clears when a stale pending effect is auto-resolved."""
    _stub_action(window, on_save="half", damage_total=20)
    window.tabs.setCurrentIndex(2)
    _submit(window, "1 1")
    assert window.tabs.tabText(0).endswith(" ?")
    window._advance_round()
    assert not window.tabs.tabText(0).endswith(" ?")
