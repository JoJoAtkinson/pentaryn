# Thrulm Playtest — Feel Issues & Balance Notes
**Run date:** 2026-06-26  
**Party:** The Compass Edge (Bazgar Fighter-5, Marwen Wizard-5, Sabriel Divine Martial-5)  
**Encounter:** Beholder CR 13 + derro support

---

## Phase A — Mechanical Bugs (fixed this run)

### BUG-1 (fixed): Beholder proficiency bonus inconsistency
- **What broke:** Saving throw bonuses (Dex +6, Wis +5) implied PB +3, but save DCs (DC 16) implied PB +5. At CR 13, PB is +5. The attacks and saves were 2 lower than rules-correct.
- **Fix applied:** Dex save → +8, Wis save → +7; attack bonuses (Tentacle Lash, Maw, Disintegration Ray) all corrected to +8.
- **Play impact:** Moderate. The corrected +8 attack vs AC 18 (Bazgar) hits on 10+ (55%). Previously +6 hit on 12+ (45%). About one extra hit per two turns.

### BUG-2 (fixed): shrine-touched-derro Perception +1 wrong
- **What broke:** Perception +1 with WIS −1 and PB +3 is impossible. Should be Perception +2 (proficient, WIS −1 + PB +3).
- **Fix applied:** Perception → +2, passive Perception → 12.

### BUG-3 (wiring — fixed this run): No `#combat-runner` tags on any thrulm NPC
- All 6 thrulm NPCs were missing `#combat-runner` in tags. Added to beholder-thrulm, derro-rager, thrall-derro.
- **Note:** deep-watch-derro, derro-shardcaller, shrine-touched-derro are NOT yet wired (no DB entries). Next fire should author them.

### BUG-4 (wiring — fixed this run): No actions.jsonl entries for any thrulm NPC
- Authored 9 DB entries: 5 for beholder-thrulm, 3 for derro-rager, 1 for thrall-derro.
- **Note:** Beholder legendary actions (Move, Tentacle as legendary, Void Ray) are not individually modeled as DB entries. They are documented in the beholder .md start-of-turn checklist. Next fire should add `legendary_void_ray` and `legendary_tentacle` as single_attack entries.

---

## Phase B — Feel Issues (for human review)

### FEEL-1: Marwen is one-shotted by Disintegration Ray on almost any hit
- Marwen HP 32. Disintegration Ray avg 45 force damage, minimum 10.
- On any non-critting hit Marwen is dead. On a crit she's erased with the disintegrated rider.
- **Recommendation:** The beholder should NOT open with Disintegration Ray vs Marwen; that ends the fight in round 1 with a PC gone permanently (barring True Resurrection). Consider: beholder AI should Disintegration Ray Marwen only if she's below 20 HP, to avoid the "party fails to engage meaningfully because one PC is ash in round 1" feel.
- This is intentional design (party meant to lose) but the disintegration mechanic is emotionally costly. Worth flagging to the DM.

### FEEL-2: Void Scream DC 16 Wis — expect near-certain fail at level 5
- Level-5 party Wis saves: Fighter probably +1 to +2, Wizard +3 to +5, Divine Martial +4 to +7 (if Paladin).
- On a DC 16, Bazgar needs 14+ (35% pass), Marwen needs 11+ (50% pass), Sabriel varies.
- Avg 33 psychic damage on fail (half = 16 on success). One Void Scream takes Marwen to -1 HP on a fail.
- **Recommendation:** Recharge 6 (as written) is tight. If the beholder rolls Void Scream twice in 5 rounds, the party is likely TPK'd in a straight fight. This is per design.

### FEEL-3: Drain Divinity (legendary, 3 actions) — Sabriel is primary target
- At level 5, Sabriel likely has 3rd-level slots (paladin). Drain Divinity on a Cha-save-poor Sabriel loses her a smite slot, and the beholder gains 6 temp HP.
- DC 16 Cha save: Paladins typically have Cha +3–5, so +5 to +7 on save. Cha-primary Paladin (Cha 18 = +4 mod, PB +3 = +7) needs 9+ (60% pass). Cha-secondary needs less.
- **Recommendation:** If Sabriel has high Cha, Drain Divinity may feel underwhelming (60% fail rate). If low Cha, it's brutal. DM should verify Sabriel's actual Cha before the fight.

### FEEL-4: Legendary actions make the beholder feel "always active" — good, but complex
- 3 legendary actions per round means the beholder acts on most PCs' turns. At-table this will feel overwhelming.
- **Recommendation:** The start-of-turn checklist in the .md is the right tool. DM should pre-decide the legendary action budget each round (e.g., "round 2: Tentacle on Marwen's turn, Void Ray on Sabriel's turn"). The runner doesn't model legendary action state — track on paper.

### FEEL-5: Beholder Antireality reaction adds post-roll AC — unusual mechanic at table
- Antireality gives +2 AC AFTER seeing the roll, not before. DM needs to announce before the attack roll that the reaction is available, then decide after.
- **Recommendation:** Change the DB entry's match condition to `"attacker declares attack (pre-roll)"` to prompt the DM to make the decision before the roll. Currently it fires on `"damage"` which is post-roll. This is a minor UX note, not a mechanical bug.

### FEEL-6: Clay-Shaping not modeled (intentional)
- 1-minute ritual to create new derro — not usable in combat. No DB entry needed. Correctly omitted.

### FEEL-7: Void-Feeding bonus (+1 attack/damage near shrine) not tracked by runner
- While the beholder is at the altar, all its attacks are effectively +9 to hit and +1 damage. The runner has no "location" concept to auto-apply this.
- **Recommendation:** DM applies manually when the beholder is within the shrine aura. Log with `note beholder near shrine (+1 atk/dmg active)`.

---

## Phase D — What's Still Missing (for next fire)

- [ ] Add `#combat-runner` + DB entries for `deep-watch-derro`, `derro-shardcaller`, `shrine-touched-derro`
- [ ] Add `legendary_void_ray` (single_attack, costs 2, DC 16 Dex save, 4d10 force) and `legendary_tentacle` (single_attack, costs 1) as separate beholder DB entries
- [ ] Build thrulm encounter scenario that actually exercises Disintegration Ray recharge assertion
- [ ] Verify at-table with the GUI: does the `thrulm` encounter name resolve correctly in the picker? (launcher uses folder name = `thrulm`)
