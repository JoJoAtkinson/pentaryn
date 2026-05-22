"""S2 — Party of two: Glacier Stalker + Aelric Frostweaver, 4 rounds.

Cross-NPC reactions and tab-switching are exercised. The DM types damage
into Aelric's tab → Shield reaction prompt should surface (Aelric's `shield`
has a `damage` self-trigger declared in actions.jsonl). On TRIGGER, the
harness fires the reaction and marks Aelric's reaction USED.

Targets:
  - ≤ 25 clicks total
  - 0-2 LLM fallbacks (advisory)
  - ≥ 1 tab switch (party-of-two combat always implies switching)
"""

from __future__ import annotations

import pytest


def test_s2_party_of_two_with_cross_reactions(scenario):
    scenario.launch("mountin-pass")
    try:
        scenario.tab_for("aelric-frostweaver")
        scenario.tab_for("glacier-stalker")
    except AssertionError:
        pytest.skip("mountin-pass missing one of the two NPCs")

    # The DM is going to fire Aelric's shield reaction when prompted.
    scenario.set_auto_trigger_reactions(True)

    aelric = scenario.tab_for("aelric-frostweaver")
    stalker = scenario.tab_for("glacier-stalker")

    # Round 1 — Aelric takes a hit (PC's enemy AOE collateral, w/e). Damage
    # event matches aelric.shield's self-damage trigger; harness auto-fires.
    # New grammar: '0 <amount> dmg' — 0 = self (active tab's NPC).
    scenario.switch_to("aelric-frostweaver")
    aelric_start = aelric.npc_state.hp
    scenario.type_command("0 10 dmg")
    assert aelric.npc_state.hp == aelric_start - 10

    # The Shield reaction is a `utility` with `effect` text — no automatic
    # state mutation but the harness counted the prompt + (set_auto_trigger)
    # caused the dialog to "click trigger".
    assert scenario.metrics.reaction_prompts_shown >= 1
    # Reaction USED tracking — shield is a utility, and the way main_window
    # detects reaction-USED is by action type == "reaction" OR via the trigger
    # firing. Currently shield is a utility, so reaction_used is left to the
    # external set in _fire_matched_reaction. Verify.
    assert aelric.npc_state.reaction_used is True

    # Round 2 — switch to stalker, take damage. Aelric's reaction is USED so
    # NO further Shield prompt should fire even on Aelric-targeted damage.
    prompts_before = scenario.metrics.reaction_prompts_shown
    scenario.advance_round()  # this refreshes reaction at NPC turn start (manual)
    # Note: advance_round in main_window does NOT reset reaction_used per-NPC
    # automatically — the per-tab "Start NPC's turn" button does. So
    # Aelric's reaction stays USED for this round.

    scenario.switch_to("glacier-stalker")
    scenario.type_command("0 15 dmg")
    assert stalker.npc_state.hp == 84 - 15  # stalker took 15

    # The Stalker has rime_reflex (damage self-trigger) — that prompts too,
    # but since auto_trigger_reactions is True, it fires. Reaction marked USED.
    assert stalker.npc_state.reaction_used is True

    # Round 3 — fresh round, Aelric resets reaction via "Start NPC's turn" button.
    scenario.advance_round()
    scenario.switch_to("aelric-frostweaver")
    aelric.start_turn_btn.click()
    scenario.metrics.add_click()
    assert aelric.npc_state.reaction_used is False  # refreshed

    m = scenario.metrics
    assert m.click_count <= 25
    assert m.tab_switch_count >= 1
    assert m.turns_taken >= 2
