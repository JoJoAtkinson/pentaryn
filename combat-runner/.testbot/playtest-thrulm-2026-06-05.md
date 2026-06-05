# Thrulm Playtest Report — 2026-06-05

**Party:** The Compass Edge (3 PCs, Level 5) — Bazgar HP49/AC18, Marwen HP32/AC15, Sabriel HP44/AC19  
**Encounter:** The Hunger Below (Beholder CR 13) + Thrulm derro roster  
**Branch:** playtest-auto  
**Rotation slot:** N/A — no `run-counter` file found; first run

---

## Phase A — Mechanical Regression

### BUG-01 (BLOCKER): No `#combat-runner` tag in any thrulm NPC file
**Files:** All 6 files in `world/factions/dulgarum-oathholds/locations/thrulm/npcs/`  
**Impact:** Combat runner launcher scans for the literal string `#combat-runner` in the first ~30 lines. None of the thrulm NPCs have this tag. The entire encounter is invisible to the runner. **Status: UNFIXED — Joe must decide whether to wire thrulm into the runner.**

### BUG-02 (BLOCKER): Zero DB entries in `combat-runner/actions.jsonl` for thrulm NPCs
**Impact:** The runner injects compact "Ready actions" into the system prompt from the DB. With no rows for any of `beholder-thrulm`, `deep-watch-derro`, `thrall-derro`, `shrine-touched-derro`, `derro-rager`, `derro-shardcaller`, the runner has no action specs to work with. **Status: UNFIXED — requires `combat_action_upsert` calls per action (significant authoring work, flagged for Joe).**

### BUG-03 (FIXED): Thrall Derro "Multiattack" header mislabeled
**File:** `npcs/thrall-derro.md` line 51  
**Issue:** Action header says "Multiattack" but body says "makes one melee attack. It does not make additional attacks." Classic copy/paste error.  
**Fix applied:** Renamed to "Attack."

### BUG-04 (FIXED): Deep Watch Derro missing CR
**File:** `npcs/deep-watch-derro.md`  
**Issue:** No Challenge Rating in the stat block; encounter guide says CR 1/8.  
**Fix applied:** Added `| **Challenge** | 1/8 (25 XP) |` row.

### BUG-05 (FIXED): Derro Rager "Madness Endurance" redundant with Condition Immunity
**File:** `npcs/derro-rager.md` line 39  
**Issue:** Trait grants advantage on saves vs frightened, but frightened is in Condition Immunities. Immunity makes the advantage dead text.  
**Fix applied:** Removed the advantage clause; kept the "gains +1 to attack rolls when damaged" clause.

### BUG-06 (FLAGGED, NOT FIXED): Beholder PB inconsistency — attacks/saves/skills use PB +3, DCs use correct PB +5
**File:** `npcs/beholder-thrulm.md`  
**Details:**
- CR 13 → correct PB = +5
- Saves listed: Dex +6, Wis +5 (consistent with PB+3; correct values: Dex +8, Wis +7)
- Skills listed: Arcana +6, Perception +5 (correct: +8, +7)
- Attack bonus: +6 to hit (correct for DEX +3 + PB+5: +8)
- Save DCs: DC 16 — correctly calculated as 8 + PB+5 + INT+3 = 16 ✓

The DCs are right; attacks/saves/skills are 2 points low. This may be intentional nerfs for feel (makes the beholder less accurate, more beatable for a lower-level party), but it's inconsistent. **Flagged for Joe's decision.** If intentional, DCs should be noted as "boosted relative to attacks for design reasons." If a bug, add 2 to all attack rolls and proficiency-keyed saves/skills.

### BUG-07 (FIXED): Tentacle Lash average damage inflated
**File:** `npcs/beholder-thrulm.md`  
**Issue:** "16 (3d6 + 3)" — 3d6+3 average = 13.5 ≈ 14, not 16.  
**Fix applied:** Changed to "14 (3d6 + 3)."

### BUG-08 (FIXED): Derro Rager Greataxe average damage inflated
**File:** `npcs/derro-rager.md`  
**Issue:** "10 (1d12 + 2)" — 1d12+2 average = 8.5 ≈ 9, not 10.  
**Fix applied:** Changed to "9 (1d12 + 2)."

### BUG-09 (FLAGGED, NOT FIXED): Void-Feeding "advantage vs divine turning" never applies
**File:** `npcs/beholder-thrulm.md`  
**Issue:** Beholders are aberrations. Turn Undead (and Turn the Unholy) affects undead/fiends, not aberrations. If Sabriel is a Paladin or Cleric, no standard Channel Divinity turning option targets aberrations. This trait line does nothing in any standard encounter.  
**Suggestion:** Replace with "advantage on saving throws against effects that impose the Frightened condition from divine sources" or "resistance to radiant damage," either of which actually interacts with the encounter.

### BUG-10 (FLAGGED, NOT FIXED): Antireality reaction timing is ambiguous
**File:** `npcs/beholder-thrulm.md` line 82  
**Issue:** "When the beholder is **hit** by an attack it can see, it can use its reaction to gain +2 AC against that attack (after seeing the roll)."
- "When hit" suggests the attack already landed — gaining AC post-hit does nothing.
- "After seeing the roll" suggests it knows the roll and applies AC retroactively — this is mechanically unusual and potentially more powerful than Shield.
- Likely intent: triggers when *targeted* (not hit), before the attack resolves, granting +2 AC. Compare to Shield spell ("when you are hit by an attack").  
**Suggestion:** Rewrite as: "When the beholder is targeted by a melee or ranged attack it can see, it can use its reaction to gain +2 to its AC against that attack, potentially turning a hit into a miss."

### BUG-11 (FIXED): Cheat sheet recommends psychic damage vs psychic-resistant Thrall
**File:** `COMBAT-CHEAT-SHEET.md` "What Kills What Fastest" table  
**Issue:** "Thrall | Psychic, melee | Psychic Scream, Dissonant Whispers | Low HP, no resistances." Thrall Derro has psychic resistance — the "no resistances" is wrong and the recommended damage type is the worst choice.  
**Fix applied:** Changed to force/fire recommendations with note about psychic resistance.

---

## Phase B — Generative Playtest: Encounter 5 (Full Power Confrontation)

**Scenario:** Compass Edge vs Beholder (full power) + 3 Thrall Derro + 2 Shrine-Touched Derro.  
**Setup:** Party is at ~70% HP from Encounter 4. No short rest available.  
**Simulated rotation:** 3 full combat rounds.

### Round 1 (Initiative Order)

**Init 20 (Lair Action):** Void Eruption — 20-ft radius around shrine. All 3 PCs in range (they're advancing toward altar). DC 16 DEX save.
- L5 DEX saves: Bazgar +3≈38%, Marwen +5≈55%, Sabriel +2≈35% chance of saving.
- Expected damage: ~8.25 avg to each PC (half on save). Party takes ~25 total.

**Beholder (Init +3, likely goes 18-23):** Multiattack → 2 Tentacle Lash + 1 Maw.
- Targets Marwen (lowest AC, identified as caster).
- Tentacle 1 vs AC 15: need 9+ = 60% hit → 14 bludgeoning + grappled.
- Tentacle 2 vs AC 15: 60% hit → 14 bludgeoning.
- Maw vs grappled Marwen: 60% hit → 22 piercing.
- Expected damage to Marwen round 1: 14+14+22 = 50 avg. **Marwen is dead if all hit.** Starting HP was ~22 after Encounter 4 → dead on first hit.
- Legendary Actions (3 available): Move + Void Ray (2 LA) targeting Sabriel.
  - Void Ray DC 16 DEX: 22 force damage on fail, 11 on save.
  - Sabriel DEX save: +2 → 35% save → expected ~18 damage.

**Shrine-Touched Derro (Init +2):** Multiattack → 2 Shrine-Axe attacks vs Bazgar.
- +4 to hit vs AC 18: need 14+ = 35% hit. Expected: ~7 slashing + ~4 necrotic per hit → ~11 avg/hit.
- 2 attacks at 35%: expected ~7.7 damage to Bazgar.

**Bazgar (Fighter):** Action Surge available. 4 attacks vs beholder.
- Beholder AC 17, Bazgar +8 to hit → need 9+ = 60% hit.
- Issue: Beholder hovering 40-60 ft up. **Bazgar has no reach. He cannot attack the beholder.**

**Marwen (Wizard):** Dead or dying after round 1 beholder focus.

**Sabriel (Divine Martial):** Likely the last standing. Cure Wounds or Shield of Faith on self, or attacks.

**Round 1 summary:** Marwen down round 1. Bazgar stranded on the ground. Sabriel damaged. The encounter is over in 2 rounds. Total party HP depleted by ~60-70% in round 1 alone.

### Balance Findings

**FEEL-01 (Critical): Disintegration at 0 HP is campaign-ending at L5**
Marwen (32 HP max, ~22 at Encounter 5 entry) is one-shotted by Disintegration Ray (45 force damage, Recharge 5-6). "Cannot be restored except by True Resurrection or Wish" = permanent character death at L5. The encounter notes say the party is "meant to lose," but disintegration is not a graceful loss — it's campaign-ending. **Recommendation:** Add a DM note that in narrative TPK scenarios, disintegration "captures" the PC in a void-stasis rather than killing them permanently. This preserves the flavor (the beholder feeds on them) without ending the campaign.

**FEEL-02 (Critical): Melee party members are spectators**
Beholder hovers 40-60 ft up. Bazgar (Fighter, melee) and Sabriel (divine martial, melee) cannot reach it. The tactical guidance for "Fighter? → Go for the Rager or Shardcaller" in the cheat sheet acknowledges this implicitly, but the encounter-5 composition (beholder + thralls at the altar) leaves no Rager or Shardcaller present. Two of the three PCs have nothing effective to do vs the main threat.  
**Recommendation:** State explicitly that the beholder descends to reach-10 when using Tentacle Lash, then rises. Or add a note that Bazgar should be targeting thrall derro while Marwen/Sabriel engage the beholder at range.

**FEEL-03 (Design gap): Drain Divinity (3 LA) is crowded out by Void Ray (2 LA)**
In every simulated round, Void Ray + Move = 3 LA exactly, leaving nothing for Drain Divinity. The beholder effectively never Drains Divinity unless it doesn't need to reposition. **Recommendation:** Drain Divinity → 2 LA cost.

**FEEL-04 (Design gap): Clay-Shaping never fires in this encounter**
Against a L5 party, the beholder dies in 2-3 rounds of focused fire. Clay-Shaping (10-round ritual) will never be used in combat. **Recommendation:** Move Clay-Shaping to pre-combat (1d3 fresh thralls already shaped), or add a scripted trigger for it.

**FEEL-05: Shrine proximity disadvantage stacks lethally for Sabriel**
Void Scream DC 16 WIS + disadvantage within 10 ft of shrine. Sabriel's WIS save (likely +3) means ~74% failure with disadvantage. If Sabriel is the main healer, Void Scream + Drain Divinity in consecutive rounds removes all healing.  
**Recommendation:** Document the 20-25 ft "shrine edge" as the safe healing zone in the cheat sheet.

**FEEL-06: run-counter file missing** — Fixed in Phase C (created at 0).

**FEEL-07: No thrulm scenario in scenarios.yml**
All 12 existing scenarios cover mountin-pass, gar-vally, black-ledger. Thrulm is unrepresented. The testbot cannot run an automated playtest until scenarios are added.

---

## Phase C — Auto-fixes Applied

| Fix | File | Change |
|-----|------|--------|
| BUG-03 | `npcs/thrall-derro.md` | "Multiattack" header → "Attack" |
| BUG-04 | `npcs/deep-watch-derro.md` | Added CR 1/8 (25 XP) row |
| BUG-05 | `npcs/derro-rager.md` | Removed redundant "advantage vs frightened" from Madness Endurance |
| BUG-07 | `npcs/beholder-thrulm.md` | Tentacle Lash avg 16 → 14 |
| BUG-08 | `npcs/derro-rager.md` | Greataxe avg 10 → 9 |
| BUG-11 | `COMBAT-CHEAT-SHEET.md` | Thrall row: fixed damage type recommendation + resistance note |
| FEEL-06 | `combat-runner/.testbot/run-counter` | Created at 0 |

---

## Flagged for Joe (Not Auto-fixed)

| ID | File | Issue | Suggested Action |
|----|------|--------|------------------|
| BUG-01 | All thrulm NPCs | No `#combat-runner` tag — runner can't discover them | Add tag to whichever NPCs should be combat-runner NPCs; author DB entries |
| BUG-02 | `combat-runner/actions.jsonl` | Zero thrulm DB entries | Run `combat_action_upsert` for each NPC action (significant work) |
| BUG-06 | `npcs/beholder-thrulm.md` | Attack/save/skill bonuses use PB+3 (not PB+5 for CR 13) | Intentional nerf? If yes, note it. If bug, add +2 to all attack rolls and prof-keyed saves/skills |
| BUG-09 | `npcs/beholder-thrulm.md` | "Advantage vs divine turning" never applies vs aberrations | Replace with "advantage on saves vs frightened from divine sources" or "resistance to radiant" |
| BUG-10 | `npcs/beholder-thrulm.md` | Antireality reaction timing contradicts itself ("when hit" + "after seeing roll") | Rewrite: trigger on "targeted" not "hit," add "potentially turning a hit into a miss" |
| FEEL-01 | `npcs/beholder-thrulm.md` | Disintegration at L5 = permanent PC death; needs safety valve | Add DM note: in TPK scenarios, consider "void-captured" narrative instead of permanent death |
| FEEL-02 | `encounters.md` | Hovering beholder strands melee PCs | Clarify hover pattern; beholder should descend to 10 ft for tentacle attacks |
| FEEL-03 | `npcs/beholder-thrulm.md` | Drain Divinity costs 3 LA, crowded out by Move+Void Ray in every round | Reduce to 2 LA cost |
| FEEL-07 | `.testbot/scenarios.yml` | No thrulm scenario | Add at minimum a basic beholder-enters scenario |
