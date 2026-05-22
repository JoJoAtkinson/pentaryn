"""Regression tests for Fix B — snapshot load must restore `slots_remaining`,
and slots must be seeded at encounter construction.

Background: `_load_snapshot`'s in-place patch loop used to copy ~9 NPCState
fields but omit `slots_remaining`, so loading a snapshot silently refilled
every limited-use action. And `slots_remaining` was never seeded at launch,
so it read empty until first use.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from PySide6.QtCore import Qt

from gui.app import build_main_window
from gui.encounter_picker import discover_encounters
from gui.main_window import MainWindow
from gui.state import NPCState


@pytest.fixture
def mountin_pass_window(qtbot) -> MainWindow:
    encounters = discover_encounters()
    pick = next((e for e in encounters if e.name == "mountin-pass"), None)
    if pick is None:
        pytest.skip("mountin-pass encounter not discoverable from this checkout")
    counts = {npc.slug: 1 for npc in pick.npcs}
    win = build_main_window(pick, counts)
    qtbot.addWidget(win)
    return win


def test_seed_slots_remaining_prefills_from_actions():
    """Actions carrying a `slots` block should pre-fill slots_remaining at full
    count; actions without one should leave no key."""
    npc = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30 ft.", cr=1)
    actions = [
        {"action": "frozen_bile", "slots": {"count": 3, "refresh": "encounter"}},
        {"action": "multiattack"},  # no slots block
        {"action": "day_power", "slots": {"count": 1, "refresh": "long_rest"}},
    ]
    MainWindow._seed_slots_remaining(npc, actions)
    assert npc.slots_remaining == {"frozen_bile": 3, "day_power": 1}


def test_seed_slots_remaining_does_not_overwrite_existing():
    """A mid-fight launch / restored count must not be clobbered back to full."""
    npc = NPCState(slug="x", name="X", max_hp=10, ac=10, speed="30 ft.", cr=1)
    npc.slots_remaining["frozen_bile"] = 1  # already partly spent
    actions = [{"action": "frozen_bile", "slots": {"count": 3, "refresh": "encounter"}}]
    MainWindow._seed_slots_remaining(npc, actions)
    assert npc.slots_remaining["frozen_bile"] == 1


def test_snapshot_load_restores_slots_remaining(mountin_pass_window, tmp_path, monkeypatch):
    """Saving with a spent slot then loading must restore the spent count, not
    refill it."""
    win = mountin_pass_window
    npc = win.encounter_state.npcs[0]
    # Spend a slot, then snapshot.
    npc.slots_remaining["__test_slot__"] = 1
    from gui.state import serialize_encounter
    snap_path = tmp_path / "snap.json"
    snap_path.write_text(json.dumps(serialize_encounter(win.encounter_state)), encoding="utf-8")

    # Mutate live state: pretend the slot got refilled / spent differently.
    npc.slots_remaining["__test_slot__"] = 99

    # Force the load dialog to return our snapshot path.
    monkeypatch.setattr(
        "gui.main_window.QFileDialog.getOpenFileName",
        lambda *a, **kw: (str(snap_path), "JSON (*.json)"),
    )
    win._load_snapshot()

    # The restored count (1) must win — not the stale live value (99).
    assert win.encounter_state.npcs[0].slots_remaining["__test_slot__"] == 1


def test_launched_npc_has_slots_seeded(mountin_pass_window):
    """Every NPC built by the launcher should have slots_remaining as a dict
    (seeded — not necessarily non-empty if no action carries a slots block)."""
    win = mountin_pass_window
    for npc in win.encounter_state.npcs:
        assert isinstance(npc.slots_remaining, dict)
