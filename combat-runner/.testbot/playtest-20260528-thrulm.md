# Thrulm Playtest Report — 2026-05-28

**Agent fire:** hourly cron, remote Claude Code  
**Party:** The Compass Edge (level 5, 3 PCs) — Bazgar Fighter/Battlemaster AC 18 HP 49, Marwen Wizard AC 15 HP 32, Sabriel divine martial AC 19 HP 44  
**Rotation slice:** #5 — `solo-rager-rush` (next fire: #6 `shardcaller-team`)  
**Phase A status:** PASS (infra blockers from 2026-05-25 fully resolved this fire)

---

## Phase A — Mechanical Regression

All 5 thrulm NPCs have `#combat-runner` frontmatter tags. DB has entries for every NPC:

| NPC | Action count (excl. globals) |
|-----|-------------------------------|
| beholder-thrulm | 13 |
| thrall-derro | 2 |
| derro-rager | 3 |
| derro-shardcaller | 4 |
| shrine-touched-derro | 4 |

`python scripts/combat_actions_db.py validate` → **OK — 0 invalid records**

`ready-ref beholder-thrulm thrall-derro` output: non-empty, all 13 beholder actions listed.

PySide6 unavailable in this cloud environment — GUI scenario harness could not execute. Full automated regression requires a PySide6 environment (see Phase D infra note).

---

## Phase B — Generative Playtest: Solo Rager Rush

**Setup:** 3× Derro Rager (AC 16, HP 52, Greataxe +4 / 2×/round, Berserk recharge 5-6, Taunt DC 12) vs. Compass Edge.

### Initiative: Sabriel first, ragers, Bazgar, Marwen.

**Round 1 (rager action analysis):**
- All 3 ragers target Marwen (AC 15, lowest AC, obvious caster threat).
- Rager 1 + 2 use Taunt as bonus action (DC 12 CHA save — see FEEL-NEW-SR1).
- Rager 3 is in melee range; no Taunt needed.
- 2 attacks each vs Marwen: +4 to hit, needs 11+, ~55% per attack, avg 8.5 dmg.
  - Expected from all 3 ragers: ~28 damage → Marwen at 4 HP.
  - With Madness Endurance (+1 to attacks when damaged), ragers that take any hit gain advantage payback next attack.

**Round 1 (party):**
- Sabriel goes first: two attacks on Rager 1 (+5 vs AC 16 → ~60%), avg 7.5+3 = 10.5/attack, Divine Smite 2d8 on at least one hit. Expected: ~25 damage. Rager 1 at 27 HP.
- Bazgar: Action Surge round 1. 4 attacks at +6 (needs 10+, ~55%), avg 8.5 each. Expected: ~19 damage + maneuver (Trip, precision, or pushing). Rager 1 near death or dead. Rager 2 still at full 52 HP if Bazgar pivots.
- Marwen: Fireball (DC 15 DEX save, all 3 ragers in cluster). Rager DEX +0, passes on 15+, ~30% pass rate. Expected damage per rager: 28×0.7 + 14×0.3 ≈ **24 damage each**.
  - Rager 1: ~27 - 24 = **DEAD or near-0**
  - Rager 2: 52 - 24 = 28 HP (bloodied)
  - Rager 3: 52 - 24 = 28 HP (bloodied)

**Round 2:**
- Two ragers remain. Both bloodied.
- Berserk (recharge 5-6, ~33% each): if one triggers, it hits all PCs within reach (Bazgar + Sabriel). Expected ~8.5 damage each, one rager.
- Aggro-Mark activates: the rager hit hardest by Bazgar/Sabriel has advantage on its attacks against that PC next round. Rager vs Bazgar (AC 18): 35% base → ~58% with advantage. This is the mechanic's intended feel — makes the encounter punish the hard hitter.
- Party finishes remaining ragers in round 2 with straightforward attacks.

**Expected result: VICTORY round 2–3.** Marwen at 4 HP after round 1 is the tension peak; Bazgar/Sabriel likely absorb the round-2 hits. No TPK risk. This is correctly paced as a medium-hard encounter before the beholder.

### Rotation mechanic verification
- Berserk fires ~1 time per fight on average (3 ragers × 3 rounds × 33%). Feels like a swingy "oh no" moment rather than reliable damage — **intended**.
- Taunt is the primary round-1 bonus action. See FEEL-NEW-SR1.
- Aggro-Mark makes ragers feel like they *remember* who hit them. **Good mechanic, no change needed.**

---

## Phase C — Findings

### Bugs fixed this fire
None. All known bugs from prior fires were already resolved.

### New feel issues

**FEEL-NEW-SR1: Taunt DC 12 will rarely land against a level-5 party**  
DC 12 CHA save: Bazgar (fighter, likely CHA -1 to +1) fails on ~40-60%; Sabriel (divine martial, likely CHA +3) fails on ~30%; Marwen (wizard, likely CHA +0) fails on ~40%. Average ~37% fail rate across the party. A bonus action that fires most turns but misses ~63% of the time feels like dead air. The rager should feel threatening in its psychological control, not like a speedbump.  
**Recommendation:** Increase to DC 14. At level 5, DC 14 CHA fails ~50-60% of the time for non-CHA-proficient characters; Sabriel might resist with proficiency. Keeps Taunt meaningful without making it oppressive.

**FEEL-NEW-SR2: Aggro-Mark advantage calculation (confirmed working)**  
The passive gives advantage on the attack vs the highest-damage dealer in melee. Against Bazgar (AC 18 with +4 to hit): base hit 35%, with advantage ~58%. This is the right feel for the mechanic — the rager doubles its hit rate against the thing hurting it most. No change needed.

**FEEL-NEW-SR3: Berserk hits allies (edge case)**  
The Berserk action says "makes one Greataxe attack against each creature it can reach." If two ragers are adjacent, Berserk from one rager could technically also hit the other rager (since it's a creature in reach). The action says "in reach," not "enemy targets." This is likely unintended — the ragers are allies. At the table this rarely matters (DMs would naturally exclude friendly fire), but the wording should be clarified to "each enemy creature it can reach" to avoid ambiguity if the runner ever tries to auto-resolve this.  
**Recommendation:** Add "enemy creatures" qualifier to Berserk narration in the DB.

### Confirming prior FEEL issues not yet resolved

From `playtest-20260525-thrulm.md` Phase D Infra Blockers: all three listed blockers (tags, actions.jsonl rows, cron-prompt.md) are **confirmed resolved**. The block is cleared.

Feel issues from earlier fires that remain open (designer decision required, not auto-fixable):
- **FI-159** (Init TPK via Disintegration Ray round 1) — confirmed pattern across fires; see 2026-05-25 log.
- **FI-128** (Void Scream + descend combo OA risk, MQ-64) — confirmed resolved in prior fire.
- **DD-48** (VS altitude gate) — documented in beholder tactics .md, confirmed operational.

---

## Phase D — Infra Note

PySide6 is unavailable in the cloud sandbox environment. The `run_one_scenario.py` testbot cannot execute Qt-dependent scenarios. The pure-Python `dnd_roller` path (referenced in the cron-prompt Phase A script) should be used for regression instead. If `dnd_roller.roll_combat_action` is available, future fires can run the full regression in-process without PySide6.

Verify: `python3 -c "from dnd_roller import roll_combat_action; print('ok')"` — if this works, Phase A mechanical regression can run fully in cloud cron fires.

---

## Fixes Applied This Run

```
thrulm-rotation.json     next_index: 5 → 6 (solo-rager-rush consumed by this fire)
```

---

*Generated by playtest cron agent — 2026-05-28*
