---
name: The Hunger Below (Beholder)
description: "An eye-creature drawn to the void left by a sealed god; feeds on the absence of divinity"
type: creature
tags: ["#combat-runner", "#npc", "#combat", "#beholder", "#thrulm", "#boss", "#aberration"]
status: active
created: 2026-04-26
last-modified: 2026-04-26
---

# The Hunger Below (Unnamed Beholder)

*Lesson: Not all hungers are created in the normal way.*

An aberration drawn to the sealed shrine by the *void* left behind when a god was bound and imprisoned. It does not hunt with eyes—it hunts with the warping of space around the shrine's empty throne.

It is territorial, but not mindless. It gathers thralls. It shapes the derro who touch the shrine's power. It *understands* that something sacred once lived here, and it feeds on the wrongness of that absence.

---

## Combat Stats (Battle-Ready Zone)

| **AC** | **HP** | **Speed** |
|--------|--------|-----------|
| 17 (alien hide) | 110 (13d10 + 39) | 0 ft., fly 30 ft. (hover) |

| **STR** | **DEX** | **CON** | **INT** | **WIS** | **CHA** |
|---------|---------|---------|---------|---------|---------|
| 8 (-1) | 16 (+3) | 16 (+3) | 17 (+3) | 14 (+2) | 13 (+1) |

| **Saving Throws** | Dex +6, Wis +5 |
| **Skills** | Arcana +6, Perception +5 |
| **Damage Resistances** | psychic; nonmagic B/P/S from non-sanctified weapons |
| **Damage Immunities** | poison |
| **Condition Immunities** | charmed, exhaustion, frightened, paralyzed, petrified, poisoned, prone, restrained |
| **Senses** | truesight 120 ft. (can see in all directions at once) |
| **Languages** | All, telepathy 120 ft. |
| **Challenge** | 13 (10,000 XP) |

---

## Combat Traits

**Alien Perception (Not Eyes).** The beholder does not see with eyes. It perceives through the warping of space around desecrated sacred places. It has truesight 120 ft.; it cannot be blinded. When it loses sight of a creature, it can still sense them if they are within 60 feet of the shrine (the sealed god's power leaks at their edges).

**Legendary Resistance (3/Day).** If the beholder fails a saving throw, it can choose to succeed instead. When it does, the stone beneath it cracks and scars.

**Void-Feeding.** The beholder is strengthened by the absence of divinity. While within the chamber containing the sealed shrine, it gains:
- +1 to attack rolls and damage rolls
- Advantage on checks to resist being turned by divine magic

**Clay-Shaping.** The beholder can transmute raw clay into derro through a transmutation ritual that takes 1 minute of uninterrupted concentration. During the ritual, the beholder cannot move, attack, or use other abilities. The ritual requires a 5-foot cube of clay (plentiful in Thrulm deposits). When complete, a **Derro Guard** or **Thrall Derro** fully-formed emerges (beholder's choice). The new derro is charmed by the beholder and obeys its telepathic commands. A derro created this way lasts for 7 days before the clay either hardens permanently (becoming a real creature that retains charm toward the beholder) or crumbles (if not tended). The beholder can have up to 6 derro under this charm at any time.

**Lair Actions (Thrulm)** The beholder can take lair actions while in the chamber. On initiative count 20 (losing ties), it takes a lair action.

---

## Actions

**Multiattack.** The beholder makes three attacks: two with **Tentacle Lash** and one with **Maw**.

**Tentacle Lash.** *Melee Weapon Attack:* +6 to hit, reach 10 ft., one target. *Hit:* 14 (3d6 + 3) bludgeoning damage, and the target is grappled (escape DC 16). The beholder has four tentacles; it can grapple up to four creatures at once. Each tentacle can be targeted separately (AC 15, 15 HP).

**Maw.** *Melee Weapon Attack:* +6 to hit, reach 5 ft., one target. *Hit:* 22 (4d8 + 3) piercing damage. If the target is a creature grappled by the beholder, this attack is a critical hit instead.
- *(FIX-EV7-35-A) Maw vs already-downed grappled target:* If a tentacle hits and grapples a PC, then a second tentacle hit drops that PC to 0 HP in the same multiattack, the Maw auto-crit rider still technically applies (grapple persists through the downed state). At the table: **redirect Maw to the next available standing target in reach**. If no other target is in reach, **skip Maw** — the crit purpose (punishing a standing grappled target for maximum damage) is already moot once the target is unconscious. Firing Maw into a downed body deals 30+ damage in death-save failures, which is mechanically valid but wasteful and anticlimactic. The auto-crit rider applies to conscious grappled creatures only for DM intent.*

**Disintegration Ray (Recharge 5–6).** *Ranged Spell Attack:* +6 to hit, range 120 ft., one creature. *Hit:* 45 (10d8) force damage. If this damage reduces the target to 0 hit points, the target is disintegrated (turned to ash). A creature reduced to 0 HP by this attack cannot be restored to life except by true resurrection or wish.
- *(FIX-FC40-B) Disintegration + LoH DM note:* A disintegrated PC (turned to ash by DR) has no body — Lay on Hands, healing word, revivify, and other "restore HP to a dying creature" effects **cannot target ash**. If Sabriel attempts LoH on a disintegrated ally, the action is wasted. Announce disintegration explicitly when it occurs so the table tracks which bodies are gone. Target standing (conscious) PCs only — DR on a downed (non-disintegrated) target wastes the recharge on death saves, not elimination (see DR target note FIX-EV7-30-A).*

**Void Scream (Recharge 6).** The beholder emits a piercing sound that warps reality around the shrine. Each creature within 30 feet that can hear it must make a DC 16 Wisdom saving throw, taking 33 (6d10) psychic damage on a failed save, or half as much on a successful one. On a failed save, the target is also **frightened** of the beholder for 1 minute (DC 16 Wisdom saving throw at the end of each of the target's turns ends the effect). Creatures within 10 feet of the shrine have disadvantage on this save.
- *(FIX-FC46-A) Void Scream FRIGHTENED rider:* The DB action has always included FRIGHTENED on a failed VS save (confirmed in roller output from the 46th cycle). The .md description was missing this rider. FRIGHTENED imposes: disadvantage on attack rolls while the beholder is in line of sight; the target cannot willingly move closer to the beholder. This does NOT affect a creature already prone or grappled (they are already disadvantaged or immobilized). Frightened PCs attempting to flee provoke opportunity attacks if not using Disengage.*

---

## Bonus Actions

**Shrine-Drift.** The beholder moves up to 30 feet. It can move through other creatures and objects as if they were difficult terrain; it takes 5 (1d10) force damage if it ends its turn inside a creature or object.

**Compel Thrall (1/Turn).** The beholder targets one creature it can see within 60 feet that is charmed by it (usually a dominated derro). The target must succeed on a DC 16 Charisma saving throw or move up to 30 feet toward the beholder or another target the beholder designates.

---

## Reactions

**Antireality.** When the beholder is hit by an attack it can see, it can use its reaction to gain +2 AC against that attack (after seeing the roll). The stone beneath it ripples as if underwater.

---

## Legendary Actions

The beholder can take three legendary actions, choosing from the options below. Only one legendary action can be used at a time and only at the end of another creature's turn.

**Move.** The beholder moves up to its flying speed.

**Tentacle.** The beholder makes one **Tentacle Lash** attack.

**Void Ray (Costs 2 Actions).** The beholder targets one creature it can see within 120 feet. The target must make a DC 16 Dexterity saving throw, taking 22 (4d10) force damage on a failed save, or half as much on a successful one.

**Drain Divinity (Costs 3 Actions).** The beholder targets one creature within 30 feet that has spell slots, divine favor, or clerical powers. That creature must make a DC 16 Charisma saving throw. On a failed save, it loses one spell slot of the highest level it has remaining (or loses one use of a divine ability if it has no spells). The beholder gains temporary hit points equal to twice the spell level lost.

---

## Tactics

The beholder is intelligent and patient. Its strategy depends on the party composition:

**Against Casters:** Prioritizes disintegration of spellcasters; uses Void Scream to damage groups while isolating targets.
- *DR target note (FIX-EV7-30-A):* **Disintegration Ray targets conscious creatures only.** The disintegration rider ("reduces to 0 HP") does NOT trigger against already-downed targets — they are already at 0, so no reduction occurs (RAW PHB p.197: damage to 0-HP creature causes death save failures only). Against a downed target, DR is wasted. If all PCs are downed except one, hold DR for the standing target. Against a single standing PC, DR + high roll is the highest expected kill; don't waste the recharge on confirming a downed body.
- *DR vs nat-20 stabilized PC (MQ-FC45-A):* A PC who scored a natural 20 on a death save is restored to 1 HP and is **conscious** — they are a valid DR target. Do NOT skip DR on a PC just because they were recently downed. The nat-20 reset them to 1 HP (conscious body, valid disintegration target); fire DR immediately if recharged. A disintegrated 1-HP PC leaves no body — no revivify, LoH, or healing word can undo it. *(45th-FC-cycle confirm: Marwen stabilized nat-20 R4 → DR fired same turn → disintegrated. Dramatically decisive.)*

**Against Melee:** Grapples with tentacles and drags into difficult terrain; uses ranged attacks while keeping distance.
- *Maw timing note (FIX-FC39-A):* On multiattack, both Tentacle Lash attacks fire first. If either hits, that PC is grappled. The Maw's third attack MUST then target the grappled PC — this triggers the auto-crit rider (4d8+3 becomes 8d8+3, avg ~40 piercing). This is the highest single-turn damage output available to the beholder. Do NOT split Maw onto a different PC; the crit is the point. If both tentacle lashes miss, Maw hits any target normally (no crit opportunity). (39th-cycle confirm: Maw auto-crit never expressed in 10+ cycles because sim/DM targets a third PC — this note corrects that.)

**Against Clerics/Paladins:** Focuses on **Drain Divinity** to remove their healing and buffs. It *hates* sanctified weapons and holy water (treats them as if from a higher plane).
- *DD timing note:* The temp HP gain from DD is incidental (2–6 HP at most levels — noise vs 110 HP pool). The real value is slot attrition — denying L2/L3 smites. Use DD early (R1–R2) while the target's slot pool is full. After their L2+ slots are exhausted, switch to Void Ray or Tentacle instead.
- *DD vs VS sequencing note (FIX-EV7-30-B):* If Void Scream has NOT been used this combat AND Sabriel has L2+ smite slots remaining, prioritize **Drain Divinity (LA cost 3) as the post-Sabriel legendary action in R1**, before VS fires. DD early strips the smite pool; VS then fires R2 into a depleted paladin. If you spend R1 LA on Void Ray + Tentacle, VS fires R2 and kills Sabriel before DD ever executes — wasting the anti-divine counter entirely. (30th-cycle confirm: DD never fired because VS downed Sabriel before any DD window.)
- *R1 LA reserve protocol (FIX-FC40-A):* To have 3 LA available for DD after Sabriel's turn, the beholder must **skip ALL reactive LAs on Bazgar's and Marwen's turns in R1**. Spending 1 LA (Tentacle after Bazgar) + 2 LA (Void Ray after Marwen) exhausts the budget before Sabriel acts — DD never fires. R1 protocol: hold all 3 LA until Sabriel completes her turn, then spend the full budget on Drain Divinity. Resume reactive LAs from R2 onward. Exception: if Sabriel goes down before her R1 turn (e.g., from VS or heavy multiattack damage), the DD window is moot — shift to reactive LAs immediately. (40th-cycle confirm: LA consumed on Tentacle+VR R1 → 0 LA remaining for DD → DD never fires despite being optimal play.)
- *LoH override note:* If Sabriel uses Lay on Hands (not a spell) to revive a downed ally within the void-feeding zone, the beholder cannot counter with DD (LoH is not a spell slot). Prioritize Void Ray or a Tentacle LA to prevent the revived ally from acting.

**Environmental Use:** 
- Hovers near the shrine altar to maximize Void-Feeding bonus
- Uses lair terrain (pillars, collapsed shrine remains) for cover
- Draws thrall derro into combat on initiative count 20 to overwhelm the party
- *Lair timing note:* Lair actions fire at init 20. If the beholder has high initiative (>18), it acts almost immediately after the lair action — the lair sets up, the beholder executes. If the beholder has low initiative (≤12), PCs can act between the lair and the beholder's turn, creating counterplay.
- *VS positioning note:* "Within 10 ft of the shrine" for VS disadvantage applies to the physical shrine/altar in the corner of the chamber — not the beholder's current position. PCs at the vault entrance (threshold) are typically 40–60 ft from the shrine and do NOT start with shrine-proximity disadvantage. Only PCs who have advanced to within 10 ft of the altar (e.g., melee fighters engaging the beholder at the altar) should roll with disadvantage.
- *VS vs Multiattack R1 sequencing (FIX-EV7-32-A):* **R1 = Multiattack (grapple); R2 = Void Scream.** Do NOT fire VS on R1. The R1 protocol is: (1) Lair UG at init 20, (2) beholder Multiattack to build grapple pressure, (3) hold all 3 LA for DD post-Sabriel. VS fires R2 after DD has stripped smite slots and the party is weakened. Firing VS R1 burns the action before grapples land and negates the Maw auto-crit synergy entirely. If the beholder has initiative ≥ 18 and acts before all PCs, the temptation to VS immediately is a mistake — grapple first. (32nd-EV7-cycle confirm: R1 multiattack, R2 VS is the correct cadence; all prior EV7 TPKs that end R2–R3 follow this sequence.)

**Resistance reminder:** The beholder resists nonmagic bludgeoning, piercing, and slashing from non-sanctified weapons. Melee fighters without magical or sanctified weapons deal half damage. Paladin radiant smites and wizard spells (fire, force) are NOT resisted.

**Retreat:** If reduced below 30 HP, the beholder retreats deeper into the lower shaft, using thralls to block pursuit. If below 20 HP, it attempts to crush/disintegrate the party while fleeing.

---

## Lair Actions

On initiative count 20 (losing ties), the beholder takes a lair action to move or use one of the following options:

**Unstable Ground.** One creature the beholder can see within 60 feet must succeed on a DC 16 Dexterity saving throw or fall prone as the stone buckles beneath it.
- *Target priority note (FIX-FC39-B):* Prefer melee fighters (Bazgar, Sabriel) over back-line casters (Marwen). Prone on a melee fighter: costs them movement to stand up, halves their speed, imposes disadvantage on attack rolls — sustained melee disruption. Prone on a caster who is already at range: disadvantage on ranged attack rolls only, and they spend a bonus action-equivalent standing up but still cast freely. If Marwen is the only target in range, Unstable Ground is still worth using (DC 16 Dex is 30%+ failure rate for low-Dex casters). Rotate to Void Eruption once melee fighters cluster within 20 ft of the shrine (R3+).
- *Downed-target note (FIX-BEL3-38-B):* Do NOT target a downed (0 HP) PC with Unstable Ground — a prone body contributes nothing and the lair action is wasted entirely. If the primary melee target (Bazgar) is already down, shift to the next standing melee PC (Sabriel → Bazgar priority order), or use Void Eruption if any PC has advanced to within 20 ft of the shrine. Switch to Manifest Thralls only if thralls are up and facing AC ≤ 14 targets. (2nd BEL3 cycle: UG fired on downed Bazgar R3+R4, both wasted.)
- *Prone + ranged attack note (FIX-EV7-34-A):* RAW PHB — a prone target imposes DISADVANTAGE on ranged attack rolls against it (including ranged spell attacks like Disintegration Ray and Void Ray LA). If UG makes a PC prone, **do NOT use DR or Void Ray against that same target on the same or next turn** — beholder would attack at disadvantage, counteracting the goal. Use UG on a melee fighter to disrupt their mobility; use DR/VR against a standing (non-prone) target. If the only available DR/VR target is currently prone, either wait (prone ends when they stand) or switch to multiattack instead.

**Manifest Thralls.** Up to three derro that are charmed by the beholder and within 60 feet of it gain temporary hit points equal to the beholder's Charisma modifier (minimum 1). They can immediately use their reaction to move or make a weapon attack.
- *DM note:* If no thralls are alive or within 60 ft, this lair action does nothing — the beholder wastes its lair action. Use Unstable Ground or Void Eruption instead when thralls have been wiped.
- *Hit-rate note (FIX-BEL3-38-A):* If thralls are alive but landing 0 hits on a high-AC party (AC 18+), switch to Unstable Ground or Void Eruption — thrall +1 THP and reaction attacks add no real pressure against armored PCs. Manifest Thralls is strongest when thralls can actually hit (AC ≤ 14 targets).

**Void Eruption.** Each creature within 20 feet of the shrine must make a DC 16 Dexterity saving throw, taking 11 (2d10) force damage on a failed save.
- *VE vs downed PCs (MQ-FC45-B):* VE targets ALL creatures within 20 ft — no consciousness qualifier. A dying (0 HP) PC on the shrine floor within 20 ft takes VE damage; each hit counts as 1 failed death save (RAW PHB). This can accelerate death-save accumulation significantly if the party has downed PCs in the shrine zone. **DM option:** waive VE against downed bodies if the drama is better served by a focused kill, or if the downed PCs have been moved to the threshold (>20 ft from altar). The legal read is that VE hits them. *(45th-FC-cycle flag: sim excluded downed PCs from VE — this may have prolonged the fight by ~1 round.)*
- *Cinematic-kill note (FI-FC45-B):* If only one PC remains conscious at ≤ 10 HP and the beholder has a recharged main action (VS, DR, or grapple-Maw), consider holding the lair action (or using Manifest Thralls as a low-impact placeholder) to keep the dramatic killing blow for the beholder's own turn. The lair action firing first (init 20) can steal a kill that would read better as a named ability.

---

## Interaction Notes

**Motivations:** The beholder does not "want" anything in the way living things do. It *is* hunger made manifest—hunger for the sacred power that once filled this space, hunger for divinity to acknowledge it.

It can be *negotiated* with, but only if:
- The party offers it something connected to the god (an artifact, a prayer, a true name)
- The party is clearly not here to restore the shrine (which would starve it)
- The party agrees to leave the deeper shafts unexplored

**Communication:** Telepathy, but it speaks in sensation more than words. Flashes of emotion. Tastes. Cold pressure on the mind. If forced into speech, it defaults to incomplete dwarven (fragments of the old oath it half-remembers from the shrine).

**Weaknesses:**
- **Sanctified weapons:** Weapons blessed by dwarf-priests or the old faith deal an extra 1d8 damage
- **Holy water:** 1d8 damage per dose; it flees from sustained applications
- **Divine spells:** Healing spells cast within the chamber *hurt* it (deal damage instead of healing, as the divine magic contradicts the void)
- **The deeper shaft:** It cannot go deeper into the lower chamber willingly; something down there scares even this creature

**De-escalation Hooks:** If the party demonstrates they are not here to restore the shrine, the beholder may negotiate. It is willing to:
- Allow passage deeper if the party agrees to never speak of this place
- Abandon the thrall derro if offered a more "interesting" food source
- Leave Thrulm if a sufficient sacrifice of divinity is made (a cleric's oath-breaking, a paladin's fall from grace)

---

## Description

It has no eyes.

Where a beholder would have a central orb and eyestalks, this creature is a hollow *shape*—a roughly spherical mass of what looks like translucent stone or coagulated shadow, perhaps 6 feet across. Its surface is textured with grooves, veins, and marks that seem to shift when you're not looking directly at it. Where a mouth might be, there is a *gap*, a void within the void.

From its underside, four thick appendages hang—not tentacles, but more like reaching roots or bone-colored spines that drag across the stone. They are prehensile and intelligent, but they do not feel. They grip.

The most disturbing aspect: there are *no eyes*, yet you feel completely seen. The space around the creature warps as if reality is bending to accommodate something it can't quite process. When it hovers near the altar, the air thickens and tastes of copper. Torchlight seems to bend away from it rather than illuminate it.

If you look at it too long, you start to see faces in its grooves—expressions of something ancient realizing it's being observed.

---

## Lore & Background

**What Is It?**
The beholder arrived in Thrulm centuries after the shrine was sealed. It found the void—the absence where a god should be—and that void *attracted* it the way a wound attracts infection.

It did not create the sealed shrine or the oath. But it *benefits* from the violation of what was sacred.

**What Does It Want?**
It wants the world to acknowledge the void. To feed the absence. To make more places where gods should be but are not.

It is not evil in the way demons are evil. It is a *principle* made manifest. It is what happens when you seal away the holy.

**Why Is It Really Here?**
Some theories:
- It is a scavenger, drawn to dying gods
- It is a predator, hunting the *space* where divinity lived
- It is something that was *created* by the sealing itself—a consequence of binding sacred power so tightly
- It is the god's *opposite*—the thing the god fought against, now loose in the void left behind

---

## Combat Encounter Details

### Difficulty Scaling
- **Easy:** Beholder alone, no lair actions, reduced thrall derro (1-2)
- **Medium:** Beholder + 2 thrall derro, lair actions active
- **Hard:** Beholder + 3-4 thrall derro + 2 shrine-touched derro, lair actions, the creature uses Disintegration Ray freely
- **Deadly:** Full encounter with reinforcements arriving mid-combat if the party seems to be winning

### Environmental Factors
- **The Shrine's Presence:** Spell slots cast within 20 feet of the altar glow with anti-magic. Divine spellcasters feel watched.
- **The Lower Shaft:** 60 feet beyond the main chamber, a second descent continues into darkness. Something moves down there—not the beholder, but something worse.
- **Collapsed Structures:** Half-destroyed shrine remains provide cover and difficult terrain. Investigating them might reveal clues to the beholder's weakness or the god's true nature.

---

## Related Links

- [Dulgarum Faction Overview](../../_overview.md)
- [Thrulm Location](../_overview.md)
- [Deep Watch Derro](./deep-watch-derro.md)
- [Thrall Derro](./thrall-derro.md)
- [Shrine-Touched Derro](./shrine-touched-derro.md)
