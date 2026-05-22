"""Mob support tests using the real gnoll-pack NPC.

Verifies the v0.4 mob features end-to-end:
  - encounter_picker discovers the pack with default_count from frontmatter
  - NPCState boots with member_hp = [22, 22, 22]
  - apply_damage routes to the highest-numbered alive member by default
  - explicit member targeting via `m1` / `m2` / `m3` overrides the default
  - segmented HP bar receives the per-member state
  - the multiattack action exists in the DB and has 6 attack slots (2 per member)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from gui.app import build_main_window
from gui.encounter_picker import discover_encounters
from gui.npc_tab import NPCTab

# Make the scripts/combat_actions_db importable in this test module
_SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(_SCRIPTS))
from combat_actions_db import get  # noqa: E402


def _mountin_pass():
    encs = discover_encounters()
    return next((e for e in encs if e.name == "mountin-pass"), None)


@pytest.fixture
def gnoll_window(qtbot):
    pick = _mountin_pass()
    if pick is None:
        pytest.skip("mountin-pass encounter not discoverable")
    if not any(n.slug == "gnoll-pack" for n in pick.npcs):
        pytest.skip("gnoll-pack not discoverable yet")
    counts = {npc.slug: npc.default_count for npc in pick.npcs}
    win = build_main_window(pick, counts)
    qtbot.addWidget(win)
    return win


def _gnoll_tab(win) -> NPCTab:
    for i in range(win.tabs.count()):
        t = win.tabs.widget(i)
        if isinstance(t, NPCTab) and t.npc_state.slug == "gnoll-pack":
            return t
    pytest.fail("gnoll-pack tab not present")


def test_gnoll_pack_default_count_three(gnoll_window):
    tab = _gnoll_tab(gnoll_window)
    assert tab.npc_state.count == 3
    assert tab.npc_state.member_hp == [22, 22, 22]
    assert tab.npc_state.max_total_hp == 66
    assert tab.npc_state.alive_count == 3


def test_default_damage_routes_to_highest_numbered_alive(gnoll_window):
    tab = _gnoll_tab(gnoll_window)
    result = tab.npc_state.apply_damage(10)
    assert result["member"] == 3
    assert tab.npc_state.member_hp == [22, 22, 12]


def test_killing_member_3_routes_next_to_member_2(gnoll_window):
    tab = _gnoll_tab(gnoll_window)
    tab.npc_state.apply_damage(22)  # m3: 22 -> 0
    assert tab.npc_state.member_hp[2] == 0
    assert tab.npc_state.alive_count == 2
    # Next default damage hits m2
    result = tab.npc_state.apply_damage(5)
    assert result["member"] == 2
    assert tab.npc_state.member_hp == [22, 17, 0]


def test_explicit_member_one_targets_member_one(gnoll_window):
    tab = _gnoll_tab(gnoll_window)
    result = tab.npc_state.apply_damage(7, member=1)
    assert result["member"] == 1
    assert tab.npc_state.member_hp == [15, 22, 22]


def test_multiattack_action_has_six_attacks(gnoll_window):
    """The pack's multiattack carries 6 attacks (claw+bite × 3 members). The
    runner is expected to filter by alive_count before rolling."""
    spec = get("gnoll-pack", "multiattack")
    assert spec is not None
    assert len(spec["attacks"]) == 6


def test_segmented_hp_bar_renders_three_segments(gnoll_window):
    tab = _gnoll_tab(gnoll_window)
    # The HPBar widget gets set_state(member_hp, max_hp). Verify it stores 3 segments.
    # (Visual rendering isn't asserted; we just assert it received the right state.)
    assert tab.hp_bar._member_hp == [22, 22, 22]
    assert tab.hp_bar._max_per_member == 22


def test_damage_via_command_input_targets_highest_alive_member(gnoll_window, qtbot):
    """Self-target damage `0 8 dmg` routes to the highest alive member (m3)."""
    from PySide6.QtCore import Qt
    tab = _gnoll_tab(gnoll_window)
    gnoll_window.tabs.setCurrentWidget(tab)
    qtbot.keyClicks(tab.input, "0 8 dmg")
    qtbot.keyClick(tab.input, Qt.Key.Key_Return)
    assert tab.npc_state.member_hp == [22, 22, 14]


def test_explicit_member_sigil_overrides_default(gnoll_window, qtbot):
    """`0 m1 5 dmg` targets mob member 1 explicitly → member 1 drops to 17."""
    from PySide6.QtCore import Qt
    tab = _gnoll_tab(gnoll_window)
    gnoll_window.tabs.setCurrentWidget(tab)
    qtbot.keyClicks(tab.input, "0 m1 5 dmg")
    qtbot.keyClick(tab.input, Qt.Key.Key_Return)
    assert tab.npc_state.member_hp == [17, 22, 22]
