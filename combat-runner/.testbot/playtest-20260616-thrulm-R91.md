# Thrulm Playtest Report — 2026-06-16 (Fire R91)

**Agent fire:** hourly cron, remote Claude Code (fire R91)
**Party:** The Compass Edge (level 5, 3 PCs) — Bazgar HP49/AC18, Marwen HP32/AC15, Sabriel HP44/AC19
**Branch:** playtest-auto (checked out, up to date with origin)
**Run counter:** 91 → 92
**Scenario (index 91 % 51 = 40):** `thrulm-rager-taunt-no-attack-penalty`
**Phase A status:** PASS — 0 invalid DB records. No auto-fixes applied. All carry-forward.

---

## Phase A — Mechanical Regression

### Infrastructure (confirmed OK)

| Check | Result |
|-------|--------|
| All 6 NPCs have `#combat-runner` frontmatter tag | ✅ PASS |
| All 6 NPCs have ≥1 row in `actions.jsonl` | ✅ PASS (29 rows total) |
| `python scripts/combat_actions_db.py validate` | ✅ OK — 0 invalid records |

**NPC DB row counts (stable):**

| NPC | Rows |
|-----|------|
| beholder-thrulm | 14 |
| deep-watch-derro | 2 |
| derro-rager | 3 |
| derro-shardcaller | 4 |
| shrine-touched-derro | 4 |
| thrall-derro | 2 |

### Damage average audit

All parenthesised averages verified correct (carry-forward from R90 — no source file changes):

- Beholder: Tentacle Lash `13 (3d6+3)` ✓, Maw `21 (4d8+3)` ✓, DR `45 (10d8)` ✓, VS `33 (6d10)` ✓
- Beholder LA: Void Ray `22 (4d10)` ✓, Void Eruption `11 (2d10)` ✓
- Deep Watch: Hand Axe `3 (1d6)` ✓, Crossbow `6 (1d8+2)` ✓
- Thrall: Hand Axe Weak `2 (1d4)` ✓, Dagger `4 (1d4+2)` ✓
- Rager: Greataxe `8 (1d12+2)` ✓
- All HP formulas verified ✓

### Condition immunity / trait-text cross-check

Carry-forward from R90 — scan clean. No new conflicts.

### Cheat sheet cross-check

No new drift. Carry-forward: BUG-TD-CR (Thrall CR 1/4 listed in cheat sheet, missing from stat block),
"Last Updated: 2026-06-05" stale cosmetic.

### New Phase A findings

None this fire.

---

## Phase B — Generative Playtest: `thrulm-rager-taunt-no-attack-penalty`

**Scenario rotation:** scenarios.yml index 40 (91 % 51 = 40). Next fire index = 92 % 51 = 41 (`thrulm-shardcaller-tr-then-throw`).

**Scenario premise:** Rager uses Taunt on Marwen (DC 12 CHA save → attack-roll disadvantage vs non-Rager
targets). Marwen then uses Shatter (save-based, not an attack roll) on the Shardcaller. Regression test:
Taunt should NOT suppress save-DC spell damage events.

### Verb/mechanic walkthrough

**Taunt dispatch:** DB verbs for `taunt`: `["taunt", "roar", "mark", "challenge"]`. ✓
**Shardcaller -13:** Direct HP event, not routed through any NPC action. No dispatch ambiguity. ✓
**HP assertion:** Shardcaller starts at 33, takes 13 thunder → 20. assert_hp: 20. ✓

### Manual dice simulation

**Initiative context (representative):**

| Init | Actor |
|------|-------|
| 14 | Rager |
| 13 | Marwen |
| 10 | Shardcaller |

**Rager's turn (init 14):**
- Multiattack: 2× Greataxe on Bazgar (+4 vs AC 18, needs 14+, 30% hit each)
  - Expected: 0-1 hits avg, 0.30 × 8 + 0.30 × 8 = ~5 dmg on Bazgar
- Taunt (BA) vs Marwen: DC 12 CHA save. Marwen CHA +0, needs 12+, 45% success.
  - 55% chance: Marwen has disadvantage on attack rolls vs non-Rager.
  - This round: Marwen will use Shatter (save-based) — Taunt has zero mechanical effect.

**Marwen's turn (init 13, Taunt active but irrelevant):**
- Shatter (3d8 thunder, DC 14 CON save, 10-ft radius around Shardcaller)
  - Shardcaller CON 12 (+1), needs 13+, 40% success.
  - Expected: 60% × 13.5 + 40% × 6.75 = 8.1 + 2.7 = 10.8 avg damage
  - Whether Marwen passed or failed the Taunt save is irrelevant — Shatter is not an attack roll.
  - Shardcaller: 33 − 13 = 20 ✓ (using scenario's avg for regression assertion)
  - Also within cone: possibly Bazgar (if adjacent to Shardcaller at 40+ ft — unlikely). DM confirmation needed on positioning.

**Shardcaller CON concentration note:** If Shardcaller had concentration active (e.g., Call Weakness
buff on an ally), the Shatter damage triggers a CON save (DC = max(10, damage/2) = max(10, 5-6) = 10).
Shardcaller CON +1 → d20+1 vs DC 10, ~60% success. Concentration maintained ~60% of the time after
a Shatter hit. Noted for DM awareness; not a bug.

### Key findings from this simulation

**1. Taunt on save-based casters: near-zero value (FEEL-R91-01)**

Marwen at level 5 has Fireball, Shatter, Thunderwave, Hold Person — all save-based. Taunt's "attack-roll
disadvantage" applies only to her Fire Bolt cantrip and any Scorching Ray she might use. In standard
play, a Wizard 5 defaults to Fireball → Shatter over cantrips when spell slots are available. The Rager
spent a bonus action to apply a condition Marwen trivially bypasses.

**Correct Taunt target this party:** Bazgar (Fighter 5, ALL attacks are weapon rolls +7 to hit). A Taunt
on Bazgar drops his hit rate on Shardcaller/Shrine-Touched from ~55% to ~30% (disadvantage on 11+,
squaring probability). Against the current party, Rager Taunt priority should be:

1. **Bazgar** (weapon attacks only — Taunt is maximally effective)
2. **Sabriel** (divine martial — weapon attacks plus smite riders; Taunt reduces attack-roll frequency)
3. **Marwen** (LAST — save-based spell primary; Taunt has near-zero effect on her highest-value turns)

Current Taunt priority note ("prefer back-line caster") is generically correct for _attack-roll casters_
(Eldritch Blast warlock, Scorching Ray sorcerer) but wrong for a save-based Wizard.

**2. Rager Berserk + Taunt timing (confirmed):**

Taunt fires as a bonus action. Berserk is the recharge action — both compete with the same action economy
differently. Berserk uses the main action; Taunt uses the bonus action. They DON'T conflict. A Rager can:
- R1: Multiattack (2× Greataxe), Taunt (BA) ✓
- Or: Berserk (action, 1 Greataxe vs each creature in reach), Taunt (BA) ✓

The scenario confirmed Taunt fires without conflict alongside the Multiattack sequence. No bonus-action
double-spend risk. ✓

**3. Shardcaller at 20 HP (post-Shatter): still viable**

Shardcaller at 20 HP retains all actions (Shard-Throw, Call Weakness, Shard-Barrage if recharged,
Tactical Retreat). The below-12-HP threshold (tactical note: "retreat behind a Rager") is at 12 HP.
At 20 HP: Shardcaller should continue back-line pressure. If a second Shatter follows, Shardcaller is
at 7-20 HP depending on save → retreat triggered.

**4. Taunt + Prone stacking (feel note):**

If Bazgar is taunted (disadvantage on attacks vs non-Rager) AND the beholder uses Unstable Ground
(prone → disadvantage on ranged attacks from prone), and Bazgar uses ranged (unlikely for a Fighter but
Battlemaster has some options via maneuvers), he'd have double-disadvantage on some actions. In practice:
Bazgar is melee-primary; prone + taunt don't interact unless Bazgar is knocked prone while trying to
shoot (unusual). Not a bug, just a note for edge-case DM awareness.

---

## Phase C — Auto-Fixes Applied

**None.** No auto-fixable arithmetic errors, missing `#combat-runner` tags, or redundant immunity text
found this fire.

---

## New Issues Logged

**FEEL-R91-01 (NEW):** Rager Taunt priority note should distinguish attack-roll vs save-based casters.
Against Marwen (save-based Wizard 5), Taunting Bazgar is strictly better. Logged in decisions file
`20260616T173000-thrulm-R91.md`. Needs Joe's decision on whether to add the caveat.

All other findings are carry-forwards — see decisions log for full list.

---

## Still Open — Needs Human Decision

See decisions log `20260616T173000-thrulm-R91.md` for full priority queue. Top items:

1. **BUG-F7-02** (82+ fires): Antireality non-functional in runner — needs MCP fix.
2. **BUG-PB-MISMATCH:** Beholder CR 13 vs PB+3. Most significant inconsistency.
3. **NEW-R90-01:** Prone advantage applies to TL at ≤5 ft; Unstable Ground tactics note needs correction.
4. **FEEL-F77-01** (14+ fires): Bazgar zero R1 agency (62% downed-before-turn-1 rate).
5. **FEEL-R91-01** (NEW): Rager Taunt priority note wrong for save-based caster parties.

---

*Next fire: scenarios.yml index 92 % 51 = 41 → `thrulm-shardcaller-tr-then-throw`*
