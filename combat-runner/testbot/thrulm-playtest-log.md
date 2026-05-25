# Thrulm Playtest Log — 2026-05-25

**Branch:** playtest-auto  
**Party:** The Compass Edge (Bazgar Fighter 5 HP 49 AC 18, Marwen Wizard 5 HP 32 AC 15, Sabriel Divine Martial 5 HP 44 AC 19)  
**Encounter:** The Hunger Below (CR 13 Beholder) + Thrull Derro × 3–4 + variants  
**Design intent:** Party is meant to lose. Goal is to find balance/feel/rotation issues and mechanical bugs.

---

## Phase A — Mechanical Regression

### BUGS FIXED (auto-corrected in this commit)

| # | File | Issue | Before | After |
|---|------|-------|--------|-------|
| 1 | `beholder-thrulm.md` | Tentacle Lash avg damage wrong | 16 (3d6+3) | **14** (3d6+3 = 13.5) |
| 2 | `beholder-thrulm.md` | Maw avg damage wrong | 22 (4d8+3) | **21** (4d8+3 = 21.0) |
| 3 | `derro-rager.md` | Greataxe avg damage wrong | 10 (1d12+2) | **9** (1d12+2 = 8.5) |
| 4 | `shrine-touched-derro.md` | WIS score inconsistent with Perception +1 and passive Perception 11 | 8 (–1) | **12 (+1)** (only WIS 12 makes Perception+1 and passive 11 consistent) |
| 5 | `shrine-touched-derro.md` | Shrine-Axe necrotic avg damage wrong | 4 (1d8) | **5** (1d8 = 4.5) |
| 6 | `thrall-derro.md` | Dagger damage +2 mod with DEX +1 — unaccounted extra | 4 (1d4+2) | **3** (1d4+1, correct for DEX+1 finesse) |

### BUGS LOGGED (design call needed — not auto-fixed)

**Beholder save/skill bonuses use PB+3 instead of PB+5 (CR 13)**  
- Saving Throws Dex +6 and Wis +5 are correct only if PB = +3.
- Skills Arcana +6, Perception +5 similarly imply PB+3.
- But all DCs (Void Scream DC 16, Antireality AC boost, Void Ray DC 16, Drain Divinity DC 16) are consistent with PB+5 (e.g. 8 + PB5 + INT3 = 16 ✓).
- **Recommendation:** Decide whether the beholder is intentionally "weaker-save" (keep PB+3 for saves/skills but note it explicitly) or normalize to PB+5 (saves → Dex +8, Wis +7; skills → Arcana +8, Perception +7). The DCs appear intentionally at CR-13 level — the saves/skills do not match.

**Antireality reaction wording is mechanically ambiguous**  
- "When the beholder is hit by an attack it can see, it can use its reaction to gain +2 AC against that attack (after seeing the roll)."
- If the attack has already *hit*, a retroactive AC bonus cannot change the outcome. This is either: (a) meant to function like *Shield* (use *before* the hit is resolved), in which case "after seeing the roll" should read "after seeing the roll but before the hit is resolved"; or (b) meant to reduce damage, not prevent the hit. As written, it does nothing when triggered by a hit. Needs rewrite.

**Shard-Barrage DC 13 on Derro Shardcaller appears off by 1**  
- 8 + PB+2 + best ability mod (+2 WIS or +2 DEX) = 12. DC should be 12, not 13.
- Minor; not auto-fixed since it could be intentional +1 "flavor" bonus.

**Ancient Resonance DC 14 on Shrine-Touched Derro appears off by 1**  
- 8 + PB+3 + CON+2 = 13 (or DEX+2 = 13). DC should be 13, not 14.
- Minor; not auto-fixed for same reason.

**No `#combat-runner` tags on any thrulm NPC**  
- CRITICAL: The combat-runner launcher discovers NPCs by scanning for the literal string `#combat-runner` in their frontmatter tags. None of the five thrulm NPCs have this tag.
- No actions are registered in `combat-runner/actions.jsonl` for any thrulm NPC.
- Until these are added, the thrulm encounter **cannot be loaded by the GUI or the legacy launcher**.
- This was not auto-fixed because authoring combat-runner actions requires non-trivial design work (multiattack ordering, slot management, recharge tracking). Flagged for a dedicated authoring pass.

---

## Phase B — Playtest Slice: Encounter 4 (Analytical)

*No combat-runner scenario exists for thrulm; simulation is analytical.*  
*Scenario: Beholder + 3 Thrall Derro vs. Compass Edge, Void-Feeding active (beholder near shrine), Round 1–3 snapshot.*

### Initiative & Action Economy

**Beholder DEX +3 → likely wins initiative.** Gets first action.

**Beholder full-round action budget (in shrine, Void-Feeding +1 atk/dmg):**
- Bonus Action: Shrine-Drift (hover reposition)
- Multiattack: 2× Tentacle Lash (+7 hit, 15 avg dmg) + 1× Maw (+7 hit, 22 avg dmg if target grappled)
- Legendary Actions 3/round: most efficient = Tentacle×3 (3 damage rounds) or Void Ray×1 (22 force, costs 2) + Tentacle×1

**Grapple economy (key finding):**  
Escape DC 16 vs. Bazgar STR ~+6 (55% escape) and Marwen STR ~+0 (20% escape). The wizard is almost certain to stay grappled once caught, enabling Maw disadvantage on her saves. The beholder should prioritize grappling Marwen on Round 1.

### Round-by-Round Summary

**Round 1:**  
- Beholder grapples Marwen + Bazgar with Tentacle Lash (15 avg each if hit, ~65% vs AC15, ~50% vs AC18)
- Maw on Marwen if grappled: 22 avg = **Marwen goes to ~10 HP at most after one round** (32 HP − 15 Tentacle − 22 Maw = −5)
- Legendary Actions: Tentacle on Sabriel × 2 + Void Ray on Sabriel (22 force, DC 16 DEX) = meaningful pressure on all three
- **Marwen may drop Round 1** if Maw connects while grappled

**Round 2:**  
- Beholder likely saves Disintegration Ray for a dropped caster or uses Drain Divinity (3 legendary actions) to strip Sabriel's highest spell slot — gains 4–6 temp HP
- Thrall Derro: +1 to hit vs AC 18/15/19 = hit rate 15–35%. Damage 2–4/hit. **They contribute almost nothing.** Three thralls in three rounds: expected total damage ~6–10 HP across the party. Feel is "background noise," not threat.

**Round 3:**  
- Void Scream (Recharge 6, ~16% per round): if it fires, 33 avg psychic to all within 30 ft, DC 16 WIS. Marwen (no WIS save proficiency, ~+1 WIS save) will fail ~75% of the time for 33 damage = instant down. Sabriel (likely WIS save proficient = +5 ish) has ~50% chance to halve.
- Disintegration Ray (Recharge 5–6, ~30% cumulative by round 3): 45 force damage. At +7 vs AC 15 hits ~65% of the time. Against a downed Marwen who's been stabilized, this ends the character permanently (no resurrection without Wish/True Resurrection).

### Ability Rotation Issues Found

**1. Legendary Action budget forces a hard choice the tactics section doesn't mention.**  
Drain Divinity costs all 3 legendary actions. Using it means zero legendary Tentacle/Void Ray that round. The beholder's tactics describe using Drain Divinity "against clerics/paladins" but don't note that this forfeits all other legendary pressure that round. DM needs explicit guidance: use Drain Divinity on rounds when the beholder's main action is sufficient (e.g. after securing grapples when Maw can carry the damage).

**2. Clay-Shaping (1 minute, 10 rounds) is dead text in any combat.**  
Even in a 5-stage encounter where combat resets between stages, 1 minute of uninterrupted concentration is effectively "never in combat." The ability either needs a shorter ritual time (e.g. 3 rounds) or should be flagged as a pre-combat/interlude ability. As written, DMs reading the stat block mid-combat will look at it, look at the clock, and skip it. It's a tactical dead zone.

**3. Compel Thrall sequencing is unclear.**  
Bonus Action usable 1/turn. But the Thrall Derro "Compelled Movement" bonus action exists *in addition* to this. Is Compel Thrall redundant with the thrall's own Compelled Movement? The beholder uses its bonus action to move a thrall, but the thrall also has a bonus action that does the same thing. One of these should probably be a reaction or part of the thrall's lair-action trigger.

**4. Manifest Thralls (Lair Action) temp HP = CHA mod (+1) — negligible.**  
Three thrall derro each get 1 temp HP and a free move/attack. The temp HP is functionally irrelevant (1 HP). The free attack at +1 is rarely going to matter. This lair action reads as powerful but lands as noise. Consider bumping to PB temp HP (= +4) to make it feel meaningful.

---

## Phase C — Feel Issues Log

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| Disintegration Ray permanent-death clause (no resurrection except Wish) against a level-5 party is table-destabilizing | HIGH | Flag for DM review before running; consider adding a caveat (e.g. "only if reduced to 0 HP while already at half HP or lower") |
| Void Scream one-shots Marwen (32 HP vs 33 avg on a fail) | MEDIUM | Marwen's fragility is appropriate for the "meant to lose" design, but DM should know this before the session |
| Antireality reaction is functionally broken as written | HIGH | See bug log — needs rewrite |
| Clay-Shaping unusable in standard combat | MEDIUM | Mark as "between-combat / interlude" or reduce ritual time |
| Thrall Derro +1 to hit vs level-5 party = low engagement | LOW | Acceptable as flavor (dominated thralls are weak), but DM should brief players post-session on why the minions feel inconsequential |
| Legendary action budget trade-off (Drain Divinity costs all 3) not mentioned in tactics | MEDIUM | Add a tactics note: "Do not use Drain Divinity if Maw opportunities are available — it costs all legendary actions that round" |
| Beholder PB inconsistency (saves/skills PB+3, DCs PB+5) may confuse DMs | MEDIUM | Normalize or add an explicit note that save/skill bonuses are intentionally set at PB+3 |
| Manifest Thralls lair action grants 1 temp HP — near-zero impact | LOW | Bump to PB temp HP or change to a more meaningful benefit |

---

## Summary

- **6 math bugs fixed** in beholder, rager, shrine-touched, and thrall stat blocks.
- **2 critical design issues logged**: no `#combat-runner` tags on any thrulm NPC (encounter not loadable by combat runner), and Antireality reaction is mechanically broken.
- **Phase B playtest** confirms the encounter is lethal for the level-5 party as intended; key feel issues are the near-useless thrall derro, the Void Scream instant-kill window on the wizard, and Disintegration Ray's permanent-death clause.
- **Next step**: Author `#combat-runner` tags + `actions.jsonl` entries for the beholder and at least one derro variant to enable live headless testing.
