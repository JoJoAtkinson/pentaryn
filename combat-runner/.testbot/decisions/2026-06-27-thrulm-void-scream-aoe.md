---
fire: 80
date: 2026-06-27
scenario: thrulm-void-scream-aoe
phase_b_result: auto-fixed + feel-logged
---

# Fire #80 — thrulm-void-scream-aoe

## Phase A (Regression)

All clean. 6 NPCs tagged, DB validates 0 errors. Prior fixes (Shrine-Axe 5, Rager Greataxe 8, FIX-R220-A, FIX-R247-A, etc.) confirmed stable.

## Phase B (Scenario: thrulm-void-scream-aoe)

**Setup:** Beholder at default hover altitude (~50 ft), party clustered near the altar after dispatching 2 Thralls. Sabriel (Paladin, AC 19, HP 44) within 30 ft of shrine; Marwen (Cleric, AC 15, HP 32) and Bazgar (Fighter, AC 18, HP 49) adjacent. Beholder fires Void Scream.

**Bug found (auto-fixed):** The DB `void_scream` narration did not mention the FRIGHTENED rider condition. The rider was present in the stat block and COMBAT-CHEAT-SHEET.md but absent from the DB narration that the combat runner surfaces to the DM at table. DM running blind from the runner would apply psychic damage only, missing the 1-minute FRIGHTENED condition.

**Altitude constraint (auto-fixed as documentation):** Void Scream has a 30-ft radius sphere centered on the beholder. At default hover altitude (40-60 ft), beholder must descend to bring ground-level targets within range — same constraint as Drain Divinity, but not previously documented anywhere. Confirmed in stat block ("within 30 feet") and now added to DB narration and cheat sheet.

**Simulation results (Compass Edge, lvl 5):**
- Avg damage: 33 (6d10) psychic on failed save (DC 16 WIS), 16 on success
- Marwen (WIS save +1, HP 32): ~65% chance fail → expected ~23 dmg → near-dead or down
- Bazgar (WIS save +0, HP 49): ~70% fail → ~23 dmg → significantly damaged
- Sabriel (Paladin, CHA proficiency on WIS saves likely via Aura of Protection, +4+1=+5 total): ~35% fail → ~12 expected → manageable, and advantage from within-10-ft-of-shrine disadvantage offsets (shrine is within 10 ft)

## Phase C (Auto-fixes applied)

1. **`combat-runner/actions.jsonl` — void_scream narration**: Added FRIGHTENED rider text and altitude descent note. DB validates clean.
2. **`COMBAT-CHEAT-SHEET.md` — two edits**: Save DC table row for Void Scream now includes `30 ft radius from beholder — must descend from default hover`. "When Beholder Acts" section similarly updated.

## Feel Issues (log-only, needs human decision)

**FEEL-A80-01: FRIGHTENED duration vs level-5 WIS saves is punishing**
- FRIGHTENED lasts 1 minute; DC 16 Wis save ends each turn
- Bazgar (WIS +0): ~70% chance to fail each turn → expected ~3-4 rounds before ending
- Effect: disadvantage on all attack rolls while beholder in LoS; cannot move closer to beholder
- At level 5, DC 16 WIS saves are near the ceiling of what feels fair for a single non-boss action
- *Recommendation:* Consider reducing FRIGHTENED to `until end of beholder's next turn` (auto-expiring) or lowering DC to 14 for the rider condition specifically. Not an auto-fix (changes encounter balance).

**FEEL-A80-02: Beholder altitude creates interesting tactical depth but needs DM attention**
- Default hover at 40-60 ft means Void Scream and Drain Divinity BOTH require beholder to descend into melee-accessible range
- This is tactically correct and creates real decisions (descend = get hit, stay up = no VS/DD), but is easily missed mid-combat
- Now documented. DM should be explicitly reminded at combat start that the beholder hovering high is CHOOSING to forgo VS and DD.
- *Recommendation:* Add to `_overview.md` terrain notes: "Beholder begins hover at 50 ft; descending to 25 ft or below enables Void Scream and Drain Divinity but puts it within melee reach."

## Outstanding (need Joe decision — not auto-fixable)

- **Drain Divinity degenerate vs Sabriel**: 3 legendary actions every round = beholder does nothing else on turns Sabriel is nearby. Entire LA budget gone. Consider 2-LA cost.
- **Clay-Shaping**: Dead weight in any fight under 10 rounds. Move to downtime or replace with in-combat utility (e.g., spawn 1 Thrall as a 3-LA action instead of the full 1-minute ritual).
- **Manifest Thralls lair action**: CHA modifier = +1 → 1 THP per thrall. Effectively useless vs AC 18+ party. Redesign as "thralls get a free reaction attack" or "thralls move up to their speed toward a target" instead.
- **PB discrepancy**: Beholder stat block uses PB+5 (saving throws Dex +8, Wis +7; attacks +8) consistent with CR 13 table. Original design notes said PB+3. Saves are correct for CR 13 — but attack bonus at +8 is unusually high for a CR 13 (standard would be +7 or +8). Flag for review.
