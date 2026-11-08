---
created: 2026-10-21
last_modified: 2026-11-05
status: draft
tags: [pentaryn, raven, session-prep, balance]
---

# Raven's Trail: combat balance summary

Three level-12 PCs (Marrith, Sorcerer; Caven, Abjurer Wizard; Talo, Stars Druid), D&D 2024 rules, numbers taken from the Foundry exports. Each fight was simulated thousands of times in Node.js. Positioning is abstract: area spells catch a target set by the formation (clumped or spread). Party bots score every option by expected value. The **smart** bots heal, focus fire, Shield and Counterspell. The **dumb** bots pick random targets, use no reactions, rarely heal and overwrite concentration.

Targets for SMART play:
- win at least 97%;
- a PC dies in at most 2% of fights;
- some PC drops to 0 HP in 25-60% of fights;
- the fight lasts 3-6 rounds.

For DUMB play, at least one PC should die in roughly 10-35% of fights.

"Loss" means every PC was at 0 HP at the same moment. The sim stops there, so treat a loss as a TPK if the monsters keep swinging. The death % only counts deaths before that point, so it undercounts dumb-party deaths.

## Bottom line

1. **Each fight on its own, fresh, meets the smart targets.**

   | Fight | Smart, fresh: win / death / any down |
   |---|---|
   | Dragon | 99.8 / 0 / 29% (spread) |
   | Golems | 99.2 / 0.3 / 47% |
   | Ancient | 98.7 / 0.5 / 25% |

   Dumb parties die often in the golem and Ancient fights (15-20%). The dragon kills dumb parties less often (4-7% fresh, 16% depleted).

2. **None of them meets the targets as the second or third fight of a day with only short rests.** Across all 6 orders, three fights back to back with a short rest between (Hit Dice, Arcane Recovery, Sorcerous Restoration, +1 Wild Shape):
   - A smart, spread-out party survives the whole day in 89-95% of runs. A PC dies in 1.9-3.2%.
   - Clumped smart parties survive 71-77%.
   - With no short rests, survival is 37-68%.
   - Dumb parties almost never survive the day (0.5-4.6%).

   The third fight is won only 91-97% of the time, and someone goes down in 55-80% of them.

3. **What runs out is the "free" stuff, not slots.** Each PC has only one 6th-level slot per day. The smart party opens every fight with them (Summon Dragon, Summon Elemental, Summon Undead), so they are gone after fight 1. The other things that run out:
   - Potions: the party carries 9 and drinks 3.4 (dragon), 5.3 (golems) and 6.6 (Ancient) per fight.
   - Arcane Ward and the Ring of Spell Storing Shields.
   - Stone's Endurance, Cosmic Omen, Innate Sorcery and the Pearl of Power.

   Stripping all of these from an otherwise fresh party drops the win rate 4-5 points in each fight. Smart bots still end the day with about 60 of 141 slot levels unused.

4. **Main recommendation:** put a **long rest between sites**. They are three separate places, so travel justifies one. If two sites fall on the same day, run the later one in its **"lite"** version:
   - Dragon at **250 HP**.
   - Golems: drop the Bog Vessel, so **2 Stone vessels at 190 HP**.
   - Ancient: **1 Anchored Wraith instead of 2**.

   With the lite third fight, and the party spending its slots freely in the last fight as real players would, a smart party survives the day in **95-97.6%** of runs, with a PC death in **0.9-2.2%**.


---

## 1. The Sundered Amethyst Dragon (Dragon's Cave)

**Stat block.** Huge dragon, built on the Adult Brass base. About CR 14 by the math (11,500 XP; the story calls it CR 12).

**Defenses**
- AC 18, HP 300, initiative +1.
- STR 23, DEX 12, CON 21, INT 18, WIS 15, CHA 19.
- Saves STR +6, DEX +5, CON +9, INT +4, WIS +6, CHA +8. Blindsight.
- Legendary Resistance (2/Day).

**Soul Flicker.** At the end of each of its turns it swaps state; the starting state is random.
- **Living:** resists psychic. It can be charmed or frightened. It regains 10 HP at the start of its turn, unless it took radiant damage since its last turn.
- **Hollow:** immune to necrotic and poison, and to the charmed, frightened, poisoned and exhaustion conditions. Any charm or fear on it ends when it turns Hollow.

**Actions**
- **Multiattack:** 2 Rends.
- **Rend:** +10 to hit, 2d10+6 slashing plus 1d8 force (Living) or 1d8 necrotic (Hollow).
  - It aims every Rend at Caven (the shard).
  - If Caven has lain at 0 HP for a full round, one Rend per turn (50% chance) claws at the shard. It is an automatic crit, which counts as 2 failed death saves.
- **Sundered Breath (Recharge 5-6, not charged at the start):** 60-ft cone, DC 17 DEX save, 5d8 force + 5d8 necrotic (average 45, max 80), half on a success.
- **Soul Rupture (the first time it is Bloodied):** at the start of its next turn, a Shard Wail. Every conscious member of the party makes a DC 15 WIS save: 3d6 psychic, half on a success. Its next flicker is Hollow.

**Legendary Actions** (3 per round, one after each PC's turn)
- **Psionic Lash** at the PC who just acted: DC 15 WIS save. On a failure, 4d6 psychic and no reactions until the start of that PC's next turn. Nothing happens on a success.

**Reproduced (20,000 battles, intended tactic: everything at Caven).**

| Party, state, formation | Win | Loss | Any PC death | Any PC down | Rounds | HP left M / C / T | Reported (win / death / down) |
|---|---|---|---|---|---|---|---|
| smart fresh spread | 99.8 | 0.3 | 0.0 | 29.2 | 3.30 | 74 / 47 / 80 | 99.8 / 0.1 / 28.6 |
| smart fresh clumped | 95.3 | 4.7 | 0.2 | 37.3 | 3.53 | 61 / 42 / 66 | 95.4 / 0.2 / 36.5 |
| smart depleted spread | 95.0 | 5.0 | 0.9 | 75.7 | 3.96 | 41 / 24 / 41 | 95.5 / 0.9 / 74.8 |
| smart depleted clumped | 74.2 | 25.8 | 1.1 | 80.4 | 3.96 | | 75.9 / 0.8 / 79.3 |
| dumb fresh spread | 98.0 | 2.0 | 4.0 | 58.5 | 3.73 | | 98.1 / 4.2 / 58.5 |
| dumb fresh clumped | 87.8 | 12.3 | 6.6 | 64.5 | 3.85 | | 88.1 / 6.6 / 64.6 |
| dumb depleted spread | 79.7 | 20.3 | 15.5 | 93.2 | 3.87 | | 79.3 / 15.8 / 93.0 |
| dumb depleted clumped | 57.1 | 42.9 | 16.9 | 94.7 | 3.67 | | 57.2 / 16.5 / 94.3 |

All rows reproduce within 1.5 points. Caven takes the downs: 29% fresh, 75% depleted. Marrith and Talo drop in 1-2% of fresh, spread fights.

**Resources (smart, fresh).**
- Slots used, L1-L6: 6, 0, 0, 3, 11, 89%. Almost all of it is the 6th-level summons.
- 3.4 potions, the full 29-point Arcane Ward, and 1.4 Sorcery Points.
- Rounds: median 3, 90th percentile 4.

**Targeted checks**
- **One-shots:** none. In 0.0% of fights does a PC go from 90%+ HP to 0 in one dragon turn. The breath's maximum (80) is below Caven's 86 HP.
- **Two PCs dropped in one dragon turn:** 1.7% of fights spread, 9.2% clumped. Both PCs were always already hurt.
- **No stunlock.** The Lash only takes away reactions, until that PC's next turn.
- **Control spells:**
  - The smart bots never cast control into its 2 Legendary Resistances.
  - Forcing control (its value x4): it burns 0.8 LR per fight, and the win rate does not change (99.6%).
  - With LR 0 and forced control: 99.8% win, and downs fall from 29% to 14%. Hold Monster and Fear help, but the dragon is never shut down outright.
  - Banishment and Polymorph on a solo monster only stall the fight.
- **Other sensitivities:**

  | Variant | Win | Death | Down |
  |---|---|---|---|
  | Bear-tank Talo, dragon targets the bear, clumped | 90.2 | 1.9 | 26.9 |
  | No Arcane Ward at the start, clumped | 93.3 | 0.3 | 56.6 |
  | Dragon also attacks downed PCs, clumped | 95.7 | 1.7 | 37.2 |

  A bear-tanking Talo is a trap here: the bear costs Talo his spells and the breath still lands.

**Verdict.**
- **Fresh:** meets every target when spread. Clumped, the down and death rates stay on target but the win rate drops to 95.3%.
- **Depleted with no rest:** fails (95.0% win, 76% down).
- **After a short rest in the gauntlet:**
  - As fight 2: 99.0% win, 68% down, 0.4-0.5% death.
  - As fight 3: 96.2-97.4% win, 79-81% down, 1.1-1.7% death. That down rate is above the band.
- Dumb parties die in 4-7% of fresh fights, under the 10% aim, and lose 12% of clumped fights.

**Recommendations**
- Keep it as is if it is the first fight after a long rest.
- If it follows another fight the same day, use **HP 250**. As the third fight that gives 97.7-98.4% win and 1.0-1.1% death.
- At the table:
  - Keep the shard grab as the only finishing blow, and announce it ("it claws at the shard on his body") so the party knows to pick Caven up.
  - Let the players see the breath recharge, so spreading out is a real choice. Spread versus clumped is worth about 4 points of win rate fresh and 21 points depleted.

---

## 2. Raven's failed vessels (Where Caven Died)

**Stat blocks.** 13,600 XP (High budget: 14,100).

**Faceless Vessel and Caven's Vessel.** Two Stone Golems, MM 2024; only the HP is changed.
- AC 18, **HP 190** (printed: 220).
- Saves STR +6, DEX -1, CON +5, INT -4, WIS +0, CHA -5.
- Immune to poison and psychic damage, and to most conditions.
- Immutable Form, Magic Resistance.
- Multiattack: 2 Slams. **Slam:** +10 to hit, 2d8+6 bludgeoning + 2d8 force (average 24).
- **Slow (Recharge 5-6, Bonus Action):** no components, so it cannot be Counterspelled. DC 17 WIS, concentration. It only targets creatures that are not already Slowed.

**Bog Vessel.** A Flesh Golem as printed.
- AC 9, HP 127, Magic Resistance, Immutable Form, Berserk.
- **Aversion to Fire:** after taking fire damage it has Disadvantage on attacks until the end of its next turn.
- Multiattack: 2 Slams. **Slam:** +7 to hit, 2d8+4 bludgeoning + 1d8 lightning.

**Wake-up:** Caven's Vessel acts first in round 1; the others roll initiative. The default tactic is that all three hit Caven.

**Reproduced (20,000 battles, focus Caven, wake=one).** "Depleted" here includes the encounter's own short rest.

| Party, state, formation | Win | Loss | Any PC death | Any PC down | Rounds | HP left M / C / T | Reported (win / death / down) |
|---|---|---|---|---|---|---|---|
| smart fresh clumped | 99.2 | 0.8 | 0.3 | 46.9 | 5.46 | 96 / 52 / 91 | 98.9 / 0.3 / 46.3 |
| smart fresh spread | 99.7 | 0.3 | 0.1 | 34.8 | 5.24 | 98 / 57 / 94 | 99.8 / 0.1 / 34.0 |
| smart depleted+rest clumped | 97.2 | 2.8 | 0.8 | 58.9 | 5.96 | 88 / 42 / 80 | 97.0 / 0.7 / 58.6 |
| smart depleted+rest spread | 98.5 | 1.5 | 0.4 | 47.2 | 5.79 | | 98.6 / 0.3 / 47.0 |
| dumb fresh clumped | 50.5 | 49.5 | 18.5 | 98.4 | 5.99 | | 50.4 / 18.9 / 98.4 |
| dumb fresh spread | 64.5 | 35.5 | 15.0 | 97.0 | 5.87 | | |
| dumb depleted+rest clumped | 32.1 | 67.9 | 20.2 | 99.2 | 5.73 | | 31.4 / 20.5 / 99.2 |
| dumb depleted+rest spread | 44.2 | 55.8 | 18.0 | 98.5 | 5.77 | | |

All rows reproduce.

**Resources (smart, fresh).**
- Slots used, L1-L6: 12, 12, 8, 13, 25, 67%, plus 4 Sorcery Points.
- 5.3 potions (Caven about 3) and about 44 Arcane Ward points.
- Rounds: median 5, 90th percentile 6-7.

**Targeted checks**
- **Banishment is what decides this fight.** With CHA -5, a Stone Golem cannot pass DC 17 even with Advantage.
  - Caven casts Banishment about 1.95 times per fight. The sim lets the golems back in once only banished foes remain, and he banishes them again.
  - Without Banishment and Wall of Force: 95.5% win, 1.1% death, 60% down (clumped). That misses the target.
  - The rest of the control list (Hold Monster, Hypnotic Pattern, Fear, Polymorph) is blocked by its immunities, so forcing more control changes nothing.
- **Caven drops before he can act:** in 10.7% of fights (clumped; 7.6% spread), Caven goes from full HP to 0 before his next turn, because three golems take their turns in a row.
  - If all three golems act first (wake=first), this happens in 30.8% of fights and the win rate is 93.6%. Don't use it.
- **One-turn kills:** 0.1% of fights.
- **Attacking downed PCs is the real lethality switch.** If the golems keep slamming a downed Caven, smart-party deaths go from 0.3% to **10.7%** fresh, and to 18.3% depleted.
- **Other sensitivities:**
  - No Arcane Ward at the start: 97.4% win, 0.7% death, 63% down.
  - The fight does not depend on the zone spells, which the sim abstracts: without Wall of Fire, Conjure Animals, Flaming Sphere and Moonbeam it is 99.6% win.

**Verdict.**
- **Fresh:** meets the targets. A 47% down rate is in the band, but the pressure is almost all on Caven; Marrith and Talo end at 90%+ HP.
- **Depleted with the short rest:** meets the targets, just (97.2% win).
- **Dumb parties:** 15-20% deaths. On target.
- **In the gauntlet:** as the third fight it is the weakest link, at 91.3-91.8% win and 2.6-2.9% death. As the second fight: 96.9-97.2% win.

**Recommendations**
- At the table, once Caven drops the vessels **move to the nearest standing body**. Mindless golems stop once their target stops moving. This one rule is worth 10 points of death rate.
- Decide whether Banishment is meant to be the answer. If not, give each vessel a way out of it (for example, "Raven's anchor sigil: Advantage on CHA saves and +5"), and then expect about 95% win and 60% down. Otherwise, let it be the clever play.
- If this fight follows another the same day, drop the Bog Vessel (2 Stone vessels at 190 HP, 11,800 XP):
  - Alone: 99.9% win fresh, 99.4% depleted.
  - As the third fight in the gauntlet: 96.3-97.7% win.

---

## 3. The Unbound Ancient (Deep in the Ruins)

**Stat blocks.** 12,300 XP. The total sits under High on purpose, because the Anchored fade.

**Unbound Ancient.** A Death Knight Aspirant, CR 11, with the exported numbers.

*Defenses*
- AC 20, HP 178.
- Saves STR +5, DEX +4, CON +4, INT +0, WIS +5, CHA +3.
- Immune to necrotic and poison damage, and to the exhaustion, frightened and poisoned conditions. Magic Resistance.
- **Parry:** +4 AC against one melee hit.
- No legendary actions and no Legendary Resistance.

*Actions*
- **Multiattack:** 3 Dread Blades. **Dread Blade:** +9 to hit, 2d6+5 slashing + 3d8 necrotic (average 25.5).
- **Hellfire Orb** (reskinned to force + necrotic; **Recharge 6, uncharged at the start**): 6d6 force + 6d6 necrotic, DC 15 DEX save, 20-ft radius, half on a success.
- **Destructive Wave** (1/Day, 5th-level spell, can be Counterspelled): 5d6 thunder + 5d6 necrotic, DC 15 CON save, Prone on a failure. Used from round 2.
- **Marshal Undead:** the Anchored have Advantage on attacks and saves while the Ancient can act.

*Tactic ("mad"):* 75% of the time it swings at whoever hurt it last; otherwise at a random target.

**Lesser Anchored**

| Anchored | Count | AC | HP | Attack |
|---|---|---|---|---|
| Wraith | 2 | 13 | 67 | Life Drain +6, 4d8+3 necrotic |
| Specter | 4 | 12 | 22 | Life Drain +4, 2d6 necrotic |
| Wight | 1 | 14 | 82 | Sword +4, 1d8+2 slashing + 1d8 necrotic; Life Drain DC 13 CON |

- **Unbinding:** each one loses 8 HP at the end of its own turn and comes apart after 4 turns. All of them come apart when the Ancient dies.
- Life Drain lowers the target's max HP, and that max HP **returns when that Anchored comes apart**.

**Reproduced (20,000 battles, "mad" tactic).**

| Party, state, formation | Win | Loss | Any PC death | Any PC down | Rounds | HP left M / C / T | Reported (win / death / down) |
|---|---|---|---|---|---|---|---|
| smart fresh clumped | 98.7 | 1.3 | 0.5 | 25.3 | 5.35 | 70 / 69 / 60 | 98.4 / 0.6 / 25.7 |
| smart fresh spread | 99.8 | 0.2 | 0.2 | 18.7 | 5.20 | 79 / 81 / 70 | 99.8 / 0.2 / 19.4 |
| smart depleted clumped | 87.4 | 12.6 | 2.0 | 57.4 | 5.55 | 45 / 39 / 32 | 86.9 / 2.2 / 56.8 |
| smart depleted spread | 95.6 | 4.4 | 1.0 | 48.0 | 5.46 | | 95.3 / 1.1 / 48.0 |
| smart depleted+short rest clumped | 96.5 | 3.5 | 1.0 | 35.1 | 5.46 | | 96.9 / 1.0 / 35.7 |
| smart depleted+short rest spread | 99.3 | 0.7 | 0.4 | 26.7 | 5.28 | | 99.4 / 0.3 / 27.2 |
| dumb fresh clumped | 75.0 | 25.1 | 14.5 | 71.0 | 6.01 | | 75.9 / 13.8 / 70.7 |
| dumb fresh spread | 88.4 | 11.6 | 8.5 | 59.3 | 6.10 | | 88.3 / 8.4 / 59.5 |
| dumb depleted clumped | 32.3 | 67.7 | 21.1 | 92.2 | 5.00 | | 32.1 / 21.0 / 92.3 |
| dumb depleted+short rest clumped | 59.7 | 40.3 | 17.9 | 79.9 | 5.92 | | 60.4 / 18.0 / 79.9 |

All rows reproduce. Downs are spread over all three PCs; Talo goes down most (16%).

**Resources (smart, fresh).**
- Slots used, L1-L6: 13, 7, 14, 8, 16, 88%, plus 2.6 Sorcery Points.
- **6.6-6.9 potions** of the 9 the party carries, and about 42 Arcane Ward points.
- Rounds: median 5, 90th percentile 7.
- Top damage source: Marrith's Wall of Fire (110 per fight).

**Targeted checks**
- **Spike damage:**
  - In 1.8% of fights a PC at 90%+ HP is dropped by a single Ancient turn: three Blades including a crit. The victims split Caven 0.7%, Talo 0.6%, Marrith 0.5%.
  - In 3.3% of fights one PC takes 86+ damage in one monster's turn.
  - This is the swingiest of the three fights, but it is still rare.
  - The Orb alone (max 72) cannot drop a PC from full.
- **Control spells:**
  - Banishment works on the Ancient about 42% of the time (CHA +3 with Magic Resistance against DC 17). The bots cast it 1.7 times per fight. Banishing the Ancient also switches off Marshal Undead while the Anchored fade.
  - Wall of Force (no save) isolates it.
  - Without any control spells: 97.3% win, 1.2% death, 37% down. Control helps, but it does not shut the fight down.
  - Wraiths and Specters ignore charm and paralysis.
- **Caven's necromancy does nothing here.** Toll the Dead, Inflict Wounds, Blight and Circle of Death all hit necrotic immunity. Blight on undead does nothing under the 2024 rule.
- **Bear-tank Talo is a trap:** 90.8% win and 4.0% death when the Ancient targets the bear. Three Blades at +9 tear through the bear even with Barkskin's AC 17.
- **Hellfire Orb as printed** (Recharge 5-6, charged at the start): 92.2% win, 38% down. Keep the change.
- **RAW permanent Life Drain:** 1.8% death (versus 0.5%), and 4.9% of fights see a PC dropped from near full in one turn. Keep the "stolen life comes back" rule.
- **Zone spells:** without Wall of Fire, 98.9% win; with no zone spells at all, 99.3%. The fight does not hinge on the abstract zone ticks.

**Verdict.**
- **Fresh:** meets the targets. The down rate is at the bottom of the band: 25% clumped, 19% spread. It may feel a little easy when fresh.
- **Depleted with no rest:** fails (87.4% clumped).
- **Depleted with a short rest:** meets the targets.
- **Dumb parties:** 8.5-14.5% deaths fresh, 18-21% depleted. On target.
- **In the gauntlet:**
  - As the third fight: 94.8-95.1% win, about 2% death.
  - As the second fight: 98.0-98.4% win.

**Recommendations**
- Keep the final build if it is the first fight after a long rest.
- If it follows another fight the same day, use **1 Anchored Wraith** (10,500 XP). Alone that is 100% win, 9.5% down; as the third fight in the gauntlet, 97.7-97.8% win, 1.2-1.3% death.
- If it feels too easy fresh, six Specters instead of four raises downs to about 32%. Do that only when it is the first fight of the day.
- Telegraph the Orb: one Orb on a clumped party averages about 100 damage. Consider warning Talo's player that the Ancient punishes a bear.

---

## 4. Gauntlet: all three fights in one day, 5,000 runs per order

Between fights there is a short rest:
- Hit Dice (12 per PC for the day) are spent until each PC is at 90% HP.
- Arcane Recovery (6 slot levels, once per day).
- Sorcerous Restoration (+6 Sorcery Points, once).
- +1 Wild Shape use.

Everything else carries over from fight to fight: potions, Arcane Ward, ring Shields, Stone's Endurance, Omen, Innate Sorcery, the Pearl, the wand, the staff, free casts, and the 6th-level slots. Each fight uses its intended monster tactic. "Survived" means every fight won with no PC death. D = dragon, G = golems, A = Ancient.

**Smart, spread formation, short rests**

| Order | Survived | Any death | Wipe | Wipe at fight 1 / 2 / 3 | Fight 3 win | Fight 3 down | HP into fight 3 | Slot levels into fight 3 (of 141) |
|---|---|---|---|---|---|---|---|---|
| D G A | 91.6 | 2.6 | 8.0 | 0.2 / 2.8 / 5.0 | 94.8 | 55 | 89% | 89 |
| D A G | 88.8 | 3.2 | 10.7 | 0.2 / 2.0 / 8.5 | 91.3 | 73 | 89% | 94 |
| G D A | 93.7 | 2.1 | 6.1 | 0.3 / 1.0 / 4.8 | 95.1 | 56 | 88% | 94 |
| G A D | 95.1 | 1.9 | 4.4 | 0.3 / 1.6 / 2.6 | 97.4 | 79 | 92% | 89 |
| A D G | 90.1 | 3.2 | 9.2 | 0.1 / 1.0 / 8.1 | 91.8 | 75 | 89% | 95 |
| A G D | 92.4 | 2.6 | 7.0 | 0.1 / 3.1 / 3.7 | 96.2 | 81 | 92% | 85 |

The party ends the day at 48-65% HP, with about 61-67 slot levels left but no 6th-level slots and few potions.

**Other party profiles: survived % (any death %)**

| Profile | DGA | DAG | GDA | GAD | ADG | AGD |
|---|---|---|---|---|---|---|
| Smart, clumped, short rests | 76.7 (5.1) | 70.6 (6.9) | 76.3 (4.1) | 77.1 (3.6) | 72.1 (5.1) | 72.6 (3.8) |
| Nova (spends slots early), spread, short rests | 93.2 (2.2) | 83.8 (3.5) | 94.2 (2.2) | 81.8 (8.9) | 83.2 (3.8) | 79.9 (10.2) |
| Smart, spread, **no** short rests | 59.2 (7.7) | 42.9 (9.5) | 65.9 (6.3) | 67.8 (8.6) | 36.8 (10.4) | 66.4 (9.6) |
| Dumb, clumped, short rests | 0.7 (30.6) | 0.6 (33.7) | 0.8 (36.6) | 0.8 (38.8) | 0.6 (39.9) | 0.5 (35.3) |
| Dumb, spread, short rests | 3.9 (31.1) | 2.8 (34.9) | 4.2 (38.1) | 4.6 (44.8) | 3.4 (39.1) | 3.9 (38.6) |

A nova party empties its slots early. When the dragon comes last it reaches it with only about 40 slot levels left, and deaths reach 9-10%.

**The fixes, tested (smart, spread, short rests): survived % (any death %)**

| Variant | DGA | DAG | GDA | GAD | ADG | AGD |
|---|---|---|---|---|---|---|
| Third fight in its lite version | 94.4 (1.6) | 93.8 (2.2) | 96.2 (1.6) | 96.0 (1.8) | 95.3 (1.8) | 94.1 (2.0) |
| Lite third fight, and the party spends freely in the last fight | **96.0 (0.9)** | **95.0 (2.2)** | **97.6 (1.0)** | **97.1 (1.4)** | **96.2 (1.6)** | **95.2 (1.8)** |

In that last row the third fight itself is won 97.6-99.3% of the time.

**How close it gets.**
- The day is lost mostly in the third fight. Golems last is the worst order (91% win).
- Second fights lose about 1-3%.
- The risk falls mainly on Caven:
  - He is focused in two of the three fights.
  - His four potions are gone by fight 3.
  - His ward is not refreshed.
- A PC goes down in 55-81% of third fights.

**Gauntlet verdict.** As a one-day gauntlet, the three fights miss the smart targets: survival is 89-95% when the win target is 97%, and deaths are 1.9-3.2% against a 2% ceiling. Dumb parties are destroyed. With the later fight in its lite version, the smart party lands at about 95-97.6% survival and 1-2% deaths, which is borderline on target. With a long rest between sites, each fight is a fresh fight and meets the targets as shown in sections 1-3.

---

## 5. Concrete recommendations for Joe

1. **Long rest between sites.** This is the most important change. The three places are far apart, so let travel give it to them.
2. **Same-day "lite" versions** for any fight that is not the first since a long rest:

   | Fight | Full version | Lite version |
   |---|---|---|
   | Dragon | HP 300 | **HP 250** (everything else unchanged) |
   | Vessels | 2 Stone at 190 + Bog Vessel | **2 Stone at 190 HP, no Bog Vessel** (11,800 XP) |
   | Ancient | 2 Wraiths, 4 Specters, 1 Wight | **1 Wraith**, 4 Specters, 1 Wight (10,500 XP) |

3. **Table rules that keep the deaths in the "dumb play" column:**
   - Golems stop hitting a downed Caven (worth 10 points of death rate).
   - The dragon's shard grab happens only after Caven has lain down a full round, and it is announced.
   - Telegraph the breath recharge and the Hellfire Orb. Clumping is the biggest swing in every fight.
4. **Keep these design choices:**
   - The dragon's breath starts uncharged.
   - The Hellfire Orb is Recharge 6 and starts uncharged.
   - Max HP taken by Life Drain comes back when that Anchored comes apart.
   - Caven's Vessel waking first (wake=one), or 2024 surprise. **Never have all three golems act first** (93.6% win, and a 31% chance Caven drops before he acts).
5. **Know these before the session:**
   - Banishment beats the Stone vessels with no roll; decide whether that is intended.
   - Caven's necromancy does nothing against the Ancient.
   - A bear-tanking Talo is the riskiest reasonable play in the dragon and Ancient fights (about 90-92% win, 2-4% death).
   - The dragon and the vessels focus Caven: he drops in 29-47% of fresh fights even with smart play, while the other two rarely do.

## Caveats

- Positioning is abstract. Opportunity attacks, cover, flight, reach and the golems' Force Bolt are not modelled. Zone spells hit on a fixed chance, but no fight depends on them.
- The bots use heuristics with no lookahead. They hoard slots (about 60 slot levels left over at the end of the day) and lean hard on potions.
- "Loss" stops the sim, so dumb-party deaths are a minimum.
- Hypnotic Pattern's effect on allies is only priced into the bots' choices, never actually applied. Elemental Affinity is not added to zone damage. Battle Medic does not spend Hit Dice.

## Files

Everything is in `/tmp/claude-1000/-home-joe-code-pentaryn/a20a97ae-64e9-4c8f-9ecf-c5a47af47044/scratchpad/sim/`:

| What | File |
|---|---|
| Reproduction at 20,000 battles | `final/s1-out.json` |
| Spike, control and sensitivity tests | `final/s2-out.json`, `final/s3-out.json`, `final/s4-out.json` |
| Gauntlet grid | `final/gauntlet.jsonl` |
| Gauntlet with a lite third fight | `final/gauntlet-lite.jsonl` |
| Lite third fight, party spends freely in the last fight | `final/gauntlet-lastnova.jsonl` |
| Instrumented wrapper (spike metrics; options to strip resources, remove control or boost it) | `final/wrap.mjs` |
| Gauntlet runner | `final/gauntlet.mjs` |
| Batch runners | `tools/batch.mjs`, `tools/batch2.mjs` |

One engine change: `engine/run.mjs` now adds up the new `x_*` stats and prints `misc` to 4 decimal places.