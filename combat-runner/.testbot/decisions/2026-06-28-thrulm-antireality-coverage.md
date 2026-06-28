---
fire: 81
date: 2026-06-28
scenario: antireality-timing
phase_b_result: log-only (feel issues)
---

# Fire #81 — antireality-timing

## Phase A (Regression)

All clean. 6 NPCs tagged, DB validates 0 errors. No auto-fixes needed this run.

Confirmed stable from prior fires: Tentacle Lash avg 13, Maw avg 21, Disintegration Ray avg 45,
Void Scream avg 33, Void Ray avg 22, Void Eruption avg 11, Shrine-Drift avg 5, Rager Greataxe avg 8,
Shrine-Axe avg 5+4, Ancient Resonance avg 11+2, Shard-Throw avg 6, Shard-Barrage avg 10,
Hand Axe (Deep Watch) avg 3, Crossbow avg 6, Thrall Hand Axe avg 2, Thrall Dagger avg 3. All correct.

**New finding (log-only, design call):**

**PHASE-A-F81-01: Shrine-Touched Ancient Resonance DC 14 — formula gives DC 13**
- PB: +3 (explicitly listed); DEX modifier: +2 (DEX 15)
- Formula: 8 + PB + ability mod = 8 + 3 + 2 = 13
- Stat block reads DC 14. Off by 1.
- Cheat sheet also shows DC 14 (consistent between sources, so not a cheat-sheet drift).
- Same pattern as Shardcaller Shard-Barrage BUG-R314-02 (DC 13 vs formula DC 12). Both
  appear to use a "designer intent" flat DC one higher than the standard formula.
- Ruling: do not auto-fix. Joe may have intentionally set these at the round number.
  If standardizing, both shrines should drop by 1 together. Flag as a pair.

---

## Phase B (Scenario: antireality-timing)

**Setup:** Bazgar (Fighter 5 Battlemaster, HP 49, AC 18, attack bonus +7) engages beholder
(AC 17) in melee over 3 rounds. Beholder has Antireality reaction (once per round): imposes
disadvantage on the triggering attack roll, declared before the roll on `action_executed` event.

**Probability baseline:**
- Bazgar needs 10+ to hit AC 17 with +7: hits on 10+ = 55% base.
- Disadvantage reduces hit chance: P(both ≥10) = 0.55² ≈ 30%.
- Bazgar has 2 attacks per action at level 5 (Extra Attack).
- Antireality covers Attack 1 only each round (one reaction per round).

**Round-by-round simulation (representative rolls):**

Round 1:
- Attack 1 (disadvantage): rolls 14 / 8 → lower = 8, +7 = 15 (miss). Without Antireality: 14+7=21 HIT. **Flip: hit→miss.**
- Attack 2 (straight): roll 12, +7=19 HIT. Damage: 1d8+5 = avg 9.5 + superiority die if used.

Round 2:
- Attack 1 (disadvantage): rolls 11 / 7 → lower = 7, +7=14 (miss). Without Antireality: 11+7=18 HIT. **Flip: hit→miss.**
- Attack 2 (straight): roll 9, +7=16 (miss). Antireality irrelevant (attack 2 misses anyway).

Round 3:
- Attack 1 (disadvantage): rolls 16 / 13 → lower = 13, +7=20 HIT. Antireality did not prevent this.
- Attack 2 (straight): roll 6, +7=13 (miss).

Totals: 2 hits out of 6 attacks (without Antireality would be 3). Antireality converted 2 of 3
potential hits on Attack 1 into misses.

**Expected value over 3 rounds:**
- Without Antireality: 6 × 55% = 3.3 expected hits.
- With Antireality (covers attack 1 each round): (3 × 30%) + (3 × 55%) = 0.9 + 1.65 = 2.55 expected hits.
- Net reduction: 0.75 expected hits prevented per 3-round engagement.

**Legendary action cross-check (timing is unambiguous):**
- Antireality is a REACTION (not an LA). Cheat sheet and .md both clearly distinguish it.
- Beholder still has full 3 LA available independently: Tentacle (1), Void Ray (2), Drain Divinity (3).
- No confusion found between reaction and LA in documentation. ✓

---

## Feel Issues (log-only, needs human decision)

**FEEL-F81-01: Antireality covers only 50% of a level-5 Fighter's action economy**
- Bazgar has 2 attacks per action. Reaction covers only Attack 1. Attack 2 is unaffected.
- Against Action Surge (4 total attacks in one round), Antireality covers 25%.
- The beholder's most dangerous single-target threat is a Fighter in sustained melee.
  Antireality is its only defensive reaction and it halves in value against Extra Attack.
- Recommendation: consider adding "if Antireality triggers, the beholder may move 10 ft
  as part of the reaction" — keeps it reactive but creates positional benefit vs. gap
  in 2-attack coverage. Not an auto-fix; design call.

**FEEL-F81-02: Antireality vs. advantaged attacker is under-documented**
- If Bazgar has advantage (ally flanking, or Reckless from a Barbarian sub) and beholder
  imposes disadvantage via Antireality, advantage and disadvantage cancel → straight roll.
- Net effect: Antireality turns ~79% hit (advantage) into 55% hit (straight). Still meaningful,
  but noticeably weaker than full-disadvantage case.
- Cheat sheet and .md both say "impose disadvantage on the triggering attack roll" — correct
  mechanically, but the advantage-cancellation interaction is not explicitly flagged for the DM.
- Recommendation: add a DM note in the start-of-turn checklist or cheat sheet:
  "If attacker has advantage, Antireality cancels to straight roll (not full disadvantage)."

**FEEL-F81-03: Battlemaster Precision Attack erodes Antireality's defensive value**
- Bazgar at level 5 has 4 Superiority Dice (d8). Precision Attack (add d8 to attack roll
  after seeing it miss) stacks ON TOP of any roll — advantage/disadvantage don't block it.
- Scenario: Antireality imposes disadvantage on Attack 1. Bazgar rolls 7 / 9 → lower = 7,
  +7 = 14 (miss vs AC 17). Bazgar spends a Superiority Die: 14 + avg 4.5 = 18.5 → HIT.
- In this case Antireality fails to convert a hit into a miss because Precision Attack bypasses
  the roll entirely. Against a Battlemaster, Antireality's effective coverage drops further.
- Design note: Antireality's "disadvantage on the roll" text does not interact with features
  that modify the total AFTER the roll. No fix needed (correct 5e behavior), but worth
  documenting so the DM isn't confused when Antireality "fails" to prevent a Precision Attack hit.

---

## Outstanding (carry-forward — not auto-fixable)

- **Drain Divinity degenerate vs Sabriel**: 3 legendary actions every round vs. divine martial.
- **Clay-Shaping**: dead weight in combat. Replace or move to downtime.
- **Manifest Thralls lair action**: 1 THP (CHA +1). Effectively useless vs. AC 18+ party.
- **Beholder PB discrepancy**: Skills use PB+3, saving throws and attacks use PB+5 (consistent
  with CR 13). Joe must decide whether to lower CR or raise skills. Still open.
- **Shardcaller Shard-Barrage DC 13 vs formula DC 12**: BUG-R314-02, still open.
- **PHASE-A-F81-01 (above)**: Shrine-Touched DC 14 vs formula DC 13.
- **oath_breaking_retaliation**: DB has no embedded attack dice (1d8+1 slash + 1d8 necrotic).
  Runner narrates without rolling. BUG-DB-R156-01, still open.
