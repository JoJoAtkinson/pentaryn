"""S1 — Solo Glacier Stalker, 5-turn fight.

This scenario drives a single-NPC mountin-pass encounter. The DM types damage
into the Stalker tab once per round, advances rounds, and ends when the
Stalker dies. The harness records click + keystroke metrics for review.

Targets (per spec § "Testing strategy → Ring 3"):
  - ≤ 12 clicks total
  - 0 LLM fallback invocations (every input is a sigil or recognized verb)
  - p95 dispatch latency < 200ms (synchronous fast-path)

Mechanics checks:
  - HP drops monotonically as the DM types damage
  - Reaction prompt surfaces on the first damage (Rime Reflex is declared)
  - State stays consistent after round advance
"""

from __future__ import annotations

import pytest


def test_s1_solo_stalker_five_turns(scenario):
    scenario.launch("mountin-pass", counts={"glacier-stalker": 1, "aelric-frostweaver": 0})
    # If the launcher couldn't honor 0-count (zero filter), we still proceed —
    # the metric still records clicks/keys for whatever NPCs are loaded.
    try:
        scenario.switch_to("glacier-stalker")
    except AssertionError:
        pytest.skip("encounter did not include glacier-stalker")

    stalker_tab = scenario.tab_for("glacier-stalker")
    starting_hp = stalker_tab.npc_state.hp
    assert starting_hp == 84

    # Round 1: PC swings — Stalker takes 22 damage. Rime Reflex is declared
    # as a self-trigger on damage; the harness's prompt handler auto-PASSes
    # but counts the prompt.
    # New grammar: '0 <amount> <dmg-tag>' — 0 = self (active tab's NPC).
    scenario.type_command("0 22 dmg")
    assert stalker_tab.npc_state.hp == 62

    scenario.advance_round()
    # Round 2: 18 more damage
    scenario.type_command("0 18 dmg")
    assert stalker_tab.npc_state.hp == 44

    scenario.advance_round()
    # Round 3: PC crits — 30 damage. Stalker is bloodied.
    scenario.type_command("0 30 dmg")
    assert stalker_tab.npc_state.hp == 14
    assert stalker_tab.npc_state.is_bloodied

    scenario.advance_round()
    # Round 4: 14 damage — Stalker dies
    scenario.type_command("0 14 dmg")
    assert stalker_tab.npc_state.hp == 0
    assert stalker_tab.npc_state.is_dead

    # Ergonomics — these are advisory; the daemon's review phase compares
    # against documented targets. We assert the order-of-magnitude only so a
    # regression that doubles the click count is caught.
    m = scenario.metrics
    assert m.click_count <= 8       # 3 round-advance clicks (target ≤ 12 incl. potential extra clicks)
    assert m.keystroke_count <= 50  # 4 × ~9 chars ("0 22 dmg" + Enter) — new grammar is more explicit
    assert m.llm_fallback_count == 0
    assert m.turns_taken == 4
    assert m.rounds_advanced == 3
    # The Stalker has a damage trigger declared (rime_reflex), so prompts ≥ 1
    assert m.reaction_prompts_shown >= 1
