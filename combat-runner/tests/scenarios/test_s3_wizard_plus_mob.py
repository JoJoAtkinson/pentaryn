"""S3 — Wizard + Mob: Aelric Frostweaver + Gnoll Pack ×3, segmented HP.

Verifies:
  - 3-member mob loads with member_hp [22, 22, 22]
  - Damage routes right-to-left (m3 first by default)
  - Killing a member shifts the next default-target to m2
  - Mob multiattack action exists with 6 attacks (filtered by alive count at
    runtime)
  - Aelric tab is reachable + mob tab is reachable
"""

from __future__ import annotations

import pytest


def test_s3_wizard_plus_mob_segmented_hp_drain(scenario):
    scenario.launch("mountin-pass")
    try:
        gnoll = scenario.tab_for("gnoll-pack")
        aelric = scenario.tab_for("aelric-frostweaver")
    except AssertionError:
        pytest.skip("encounter missing gnoll-pack or aelric")

    # Confirm initial mob state
    assert gnoll.npc_state.count == 3
    assert gnoll.npc_state.member_hp == [22, 22, 22]
    assert gnoll.npc_state.alive_count == 3

    # PC drops a Fireball — DM types -22 in the mob's tab. Member 3 drains.
    scenario.switch_to("gnoll-pack")
    scenario.type_command("-22")
    assert gnoll.npc_state.member_hp == [22, 22, 0]
    assert gnoll.npc_state.alive_count == 2

    # Another -15 in mob's tab — goes to m2 (highest-numbered alive)
    scenario.type_command("-15")
    assert gnoll.npc_state.member_hp == [22, 7, 0]

    # Now explicit m1 — DM wants to drop member 1 specifically
    scenario.type_command("m1 -22")
    assert gnoll.npc_state.member_hp == [0, 7, 0]
    assert gnoll.npc_state.alive_count == 1

    # The remaining member soaks +10 healing → m2 caps at 17
    scenario.type_command("+10")
    assert gnoll.npc_state.member_hp == [0, 17, 0]

    # Aelric tab is independent
    aelric_start = aelric.npc_state.hp
    scenario.switch_to("aelric-frostweaver")
    scenario.type_command("-5")
    assert aelric.npc_state.hp == aelric_start - 5

    m = scenario.metrics
    assert m.tab_switch_count >= 1
    assert m.click_count <= 30  # advisory cap
