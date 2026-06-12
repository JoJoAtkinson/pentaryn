# Thrulm Playtest Report — 2026-06-12 (Fire #8)

**Agent fire:** hourly cron, remote Claude Code (fire #8)  
**Party:** The Compass Edge (level 5, 3 PCs) — Bazgar HP49/AC18, Marwen HP32/AC15, Sabriel HP44/AC19  
**Branch:** playtest-auto (checked out, up to date with origin)  
**Rotation slice:** `antireality-timing` (rotation.yml index 7; **next fire: index 0** `round-1-opener`)  
**Phase A status:** PASS — 0 invalid DB records. 2 auto-fixes applied, existing bugs carried.

---

## Phase A — Mechanical Regression

### Infrastructure (confirmed OK)

| Check | Result |
|-------|--------|
| All 6 NPCs have `#combat-runner` frontmatter tag | ✅ PASS |
| All 6 NPCs have ≥1 row in `actions.jsonl` | ✅ PASS |
| `python scripts/combat_actions_db.py validate` | ✅ OK — 0 invalid records |

**NPC DB row counts (confirmed stable):**

| NPC | Rows |
|-----|------|
| beholder-thrulm | 14 |
| deep-watch-derro | 2 |
| derro-rager | 3 (multiattack + berserk + taunt) |
| derro-shardcaller | 4 (multiattack + shard_barrage + call_weakness + tactical_retreat) |
| shrine-touched-derro | 4 (multiattack + ancient_resonance + driven_escape + oath_breaking_retaliation) |
| thrall-derro | 2 (dagger + multiattack-as-single_attack) |

### Damage average audit

All parenthesised averages checked. No new errors. Tentacle Lash `14 (3d6+3)` and Rager Greataxe `9 (1d12+2)` are `x.5 → round-up` convention, documented as project convention (fire #7 BUG-A7-04 "No action"). Briefing example uses floor; project precedent uses round-up. Not changed this fire.

### Condition immunity / trait-text cross-check

No new conflicts. Carry-forward status: all immunities clean (fire #7 confirmed).

### Cheat sheet cross-check (COMBAT-CHEAT-SHEET.md)

**FIX-F8-01 (AUTO-FIXED):** SAVE DCs table — Void Scream row previously read `WIS (psychic damage)` with no mention of the FRIGHTENED rider. The FRIGHTENED on-fail effect was added to beholder-thrulm.md in a prior fire but was never propagated to the cheat sheet. Fixed to: `WIS (psychic damage; on FAILED save: also FRIGHTENED 1 min, DC 16 Wis save ends)`.

### Scenarios.yml

**FIX-F8-02 (AUTO-FIXED):** Two entries shared `id: thrulm-void-scream-aoe`. The earlier entry (plain verb-dispatch smoke test, no HP assertions) was renamed `thrulm-void-scream-verb`. The later entry (cycle-18 state-assertion test with `assert_hp` for all 3 PCs) retains `thrulm-void-scream-aoe`. Duplicate IDs risk test-runner confusion on scenario lookup.

### New bugs requiring human action

All findings are carry-forwards from fire #7 (see decisions log). No new design-decision bugs found this fire.

---

## Phase B — Generative Playtest: Antireality-Timing

**Rotation slice:** `antireality-timing` (rotation.yml index 7)

> Bazgar attacks beholder: +7 to hit vs AC 17. Simulate 3 rounds of Bazgar attacking. Count how many times Antireality flips a hit. Is the economy fair?

**Note:** This slice was written when Antireality was "+2 AC (post-roll)." It was changed to "disadvantage (pre-roll)" in fire #6. Both mechanics are evaluated below.

### Simulation — 3 rounds, Bazgar only

**Party setup:** Bazgar HP 49, AC 18, attack bonus +7 (Fighter 5, Extra Attack, Action Surge 1/short rest).  
**Beholder:** HP 110, AC 17, Antireality reaction (1/round).

#### Round 1 — Bazgar Action Surges (4 attacks total)

Initiative settled: beholder 15 > Bazgar 11.

**Beholder R1 turn:** Multiattack vs Bazgar (advantage — positioned to descend within 5 ft of Bazgar's standing position). TL-1: +6 vs AC 18 = hit (avg roll 14, adj advantage ~70% hit). TL-2: hit. Both grapple. Maw auto-crit (4d8+3 doubled = 8d8+3 avg 39 pierce). **Bazgar: 49 − 14 − 14 − 39 = −18 HP → 0 HP.** Bazgar KO'd before his turn.

*Antireality not relevant in R1 because Bazgar acts after beholder and is downed.*

#### Round 2 — Bazgar revived at 10 HP by Sabriel LoH in R1 end

**Bazgar R2 turn:** 2 attacks (no surge, used R1). Breaks grapple R1 end → free standing. Attacks beholder (+7 vs AC 17):

| Attack | d20 roll | Total | vs AC 17 | Antireality? | Result |
|--------|---------|-------|----------|--------------|--------|
| 1 | 12 | 19 | Hit | DB (+2 AC post-roll): 19 vs AC 19 = borderline; **+2 AC can't flip 19** (19 ≥ 19 still HIT). .md (disadvantage pre-roll): beholder commits; lower of 2d20: say {12, 7} → 7+7=14 → MISS | DB: Hit. .md: Miss |
| 2 | 8 | 15 | Miss | — | Miss regardless |

*DB mechanic (+2 AC, post-roll):* Beholder sees attack 1 = total 19. Uses Antireality: AC → 19. 19 ≥ 19 = **still hits!** Reaction wasted. Antireality achieved nothing.

*md mechanic (disadvantage, pre-roll):* Beholder commits on attack 1. Expected lower-of-2d20 + 7 = 14.2 vs AC 17 → ~30% hit. In this roll: miss. Reaction well-spent.

**DB result:** Antireality wasted (0 flips R2). Beholder hit once for avg 10-11 slashing.  
**md result:** Antireality flipped 1 hit to miss. Beholder takes 0 damage from attack 1; takes 0 from attack 2 (normal miss).

#### Round 3 — Bazgar at ~20 HP (Sabriel healed again or Bazgar used Second Wind)

**Bazgar R3 turn:** 2 attacks. Beholder bloodied slightly. Attack bonus still +7 vs AC 17.

| Attack | d20 roll | Total | vs AC 17 | Antireality? | Result |
|--------|---------|-------|----------|--------------|--------|
| 1 | 10 | 17 | Marginal hit | DB (+2 AC): 17 vs AC 19 = **MISS** ✓. .md (disadvantage): beholder commits; lower say {10, 5} → 5+7=12 → MISS | DB: Flipped. .md: Miss |
| 2 | 16 | 23 | Hit | — (Antireality spent) | Hit regardless |

*DB mechanic:* Attack 1 = 17, exactly in the marginal window (17–18). Antireality → AC 19. 17 < 19 = **miss**. Reaction correctly flips this marginal hit. Attack 2 = 23 hits (no reaction). Antireality useful this round.

*md mechanic:* Pre-roll commitment. Same result in this example (miss from disadvantage lower die). But beholder had no information about whether the roll would have been 17 (marginal) or 23 (clear hit). Had to commit blind.

### Antireality flip-rate count over 3 rounds (6 attack rolls)

| Round | DB (+2 AC) flips | .md (disadvantage) flips |
|-------|-----------------|--------------------------|
| R1 | 0 (Bazgar KO'd before acting) | 0 |
| R2 | 0 (reaction wasted on 19, not marginal) | 1 (pre-roll commitment covered it) |
| R3 | 1 (marginal 17, flip successful) | 1 |
| **Total** | **1 of 6 rolls** | **2 of 6 rolls** |

Expected by math: DB ≈ 10% per attack × 6 = 0.6 flips (got 1). md ≈ 25% per covered attack × 2 (one per round) = 0.5 flips (got 2). Both within variance of the math.

### Verdict

**DB mechanic (+2 AC, post-roll):**
- Effective only on marginal hits (total 17–18 with +7 attacker vs AC 17 = rolls of 10 or 11)
- Reaction wasted on any "clear hit" (total ≥ 19) — beholder gets nothing
- Tactical but weak; feels like a minor adjustment, not a reaction
- **Status: Weak AND wrong (outdated DB text)**

**md mechanic (disadvantage, pre-roll):**
- ~25% hit-flip per covered attack; visible and meaningful
- Pre-roll commitment is mechanically correct and narratively satisfying ("reality warps around the strike")
- Still overwhelmed by Action Surge (4 attacks in R1 → only 1 gets disadvantaged)
- **Status: Correct mechanic, DB not yet updated**

### New feel issues

See decisions log FEEL-F8-01, FEEL-F8-02, FEEL-F8-03.

---

## Phase C — Fixes and Log

### Auto-fixed

| ID | File | Change |
|----|------|--------|
| FIX-F8-01 | `world/factions/dulgarum-oathholds/locations/thrulm/COMBAT-CHEAT-SHEET.md` | VS SAVE DCs row: added FRIGHTENED rider |
| FIX-F8-02 | `combat-runner/.testbot/scenarios.yml` | Renamed duplicate `thrulm-void-scream-aoe` → `thrulm-void-scream-verb` |

### Logged (human decision required)

See `combat-runner/.testbot/decisions/20260612T160000-thrulm-08.md`:

| ID | Issue | Severity |
|----|-------|----------|
| FEEL-F8-01 | Antireality DB (+2 AC): ~10% flip rate at party level; reaction is near-invisible | Medium |
| FEEL-F8-02 | Antireality (.md): overwhelmed by Action Surge (4 attacks vs 1 reaction) | Low |
| INFO-F8-01 | Antireality timing: DB says post-roll, current .md requires pre-roll (part of BUG-F7-02) | High (same as BUG-F7-02) |
| FEEL-F8-03 | DD dominance is round-dependent; R2+ against slotless Sabriel, VR is better but not documented prominently | Low |

### Rotation updated

`combat-runner/.testbot/thrulm-rotation.json`: `next_index` advanced `7 → 0` (next fire uses `threshold-patrol` encounter composition; Phase B slice wraps to `round-1-opener`).

---

## Phase D — Commit

**Files changed:**
- `world/factions/dulgarum-oathholds/locations/thrulm/COMBAT-CHEAT-SHEET.md` — VS FRIGHTENED rider added
- `combat-runner/.testbot/scenarios.yml` — duplicate ID fixed
- `combat-runner/.testbot/thrulm-rotation.json` — next_index 7 → 0
- `combat-runner/.testbot/decisions/20260612T160000-thrulm-08.md` — new decisions log
- `combat-runner/.testbot/playtest-20260612-thrulm-fire8.md` — this report

---

## Still open from prior fires (carry-forward)

| ID | Origin | Issue |
|----|--------|-------|
| BUG-CR-PB | fire #5 | Beholder PB +3 attacks vs PB +5 DCs — design decision |
| DD-DD | fire #1 | Drain Divinity 3 LA = all LA every round |
| DD-CLY | fire #1 | Clay-Shaping dead weight in combat |
| DD-MT | fire #1 | Manifest Thralls 1 THP effectively useless vs AC 18+ |
| BUG-F7-02 | fire #7 | Antireality DB "+2 AC" vs .md "disadvantage" — needs MCP |
| BUG-F7-03 | fire #7 | void_ray type "area" for single-target save — needs MCP |
| LOG-F7-03 | fire #7 | "Derro Guard" NPC type referenced, no stat block |
| LOG-F7-05 | fire #7 | Shrine-Drift lacks "no OA" clause for beholder retreat |
| LOG-F7-06 | fire #7 | Retreat note "use thralls to block" unavailable at 28 HP threshold |
| BUG-A7-05 | fire #7 | Shrine-Touched cheat sheet init +2 vs implied +3 |
| BUG-A6-01 | fire #6 | Thrall Derro missing CR in stat block |

*Generated by playtest cron agent — 2026-06-12 fire #8*
