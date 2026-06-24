---
name: The Hunger Below (Beholder)
description: "An eye-creature drawn to the void left by a sealed god; feeds on the absence of divinity"
type: creature
tags: ["#npc", "#combat", "#combat-runner", "#beholder", "#thrulm", "#boss", "#aberration", "#cr-13"]
status: active
created: 2026-04-26
last-modified: 2026-04-26
---

# The Hunger Below (Unnamed Beholder)

**HP** 110 (13d10+39) **·** **AC** 17 **·** **Speed** 0 ft., fly 30 ft. (hover) **·** **Saves** Dex +6, Wis +5 **·** **Immunities** charmed, exhaustion, frightened, paralyzed, petrified, poisoned, prone, restrained **·** **Truesight** 120 ft. **·** **CR** 13 (10,000 XP)

> Action mechanics live in `combat-runner/actions.jsonl` — see **Ready actions** for verbs and call signatures.

---

## Start-of-turn checklist

1. **Antireality** reaction resets to AVAILABLE. Declare it when the *attacker announces their attack*, before any dice (see BUG-F7-02 fix note in DB).
2. If **Disintegration Ray** USED: roll d6 — recovers on 5–6.
3. If **Void Scream** USED: roll d6 — recovers on 6 only.
4. **Legendary Resistance (3/Day):** mark each use. Refills at dawn (i.e., never mid-combat).
5. **Void-Feeding:** If the beholder is near the shrine altar, add +1 to all attack rolls and damage rolls manually at the table (not baked into DB values).
6. Reset legendary actions to 3.

---

*Lesson: Not all hungers are created in the normal way.*

An aberration drawn to the sealed shrine by the *void* left behind when a god was bound and imprisoned. It does not hunt with eyes—it hunts with the warping of space around the shrine's empty throne.

It is territorial, but not mindless. It gathers thralls. It shapes the derro who touch the shrine's power. It *understands* that something sacred once lived here, and it feeds on the wrongness of that absence.

---

## Combat Stats (Battle-Ready Zone)

| **AC** | **HP** | **Speed** |
|--------|--------|-----------|
| 17 (alien hide) | 110 (13d10 + 39) | 0 ft., fly 30 ft. (hover) |

| **STR** | **DEX** | **CON** | **INT** | **WIS** | **CHA** |
|---------|---------|---------|---------|---------|----------|
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
- *(FIX-R247-A) Removed: "Advantage on checks to resist being turned by divine magic" — redundant with frightened condition immunity. Any Turn mechanic applies the Turned/frightened condition; the beholder's explicit frightened immunity means no save is ever made, making any advantage on that save meaningless. Same pattern as Rager Madness Endurance fix (earlier fire).*

**Clay-Shaping.** The beholder can transmute raw clay into derro through a transmutation ritual that takes 1 minute of uninterrupted concentration. During the ritual, the beholder cannot move, attack, or use other abilities. The ritual requires a 5-foot cube of clay (plentiful in Thrulm deposits). When complete, a **Derro Guard** or **Thrall Derro** fully-formed emerges (beholder's choice). The new derro is charmed by the beholder and obeys its telepathic commands. A derro created this way lasts for 7 days before the clay either hardens permanently (becoming a real creature that retains charm toward the beholder) or crumbles (if not tended). The beholder can have up to 6 derro under this charm at any time.

**Lair Actions (Thrulm)** The beholder can take lair actions while in the chamber. On initiative count 20 (losing ties), it takes a lair action.

---

## Actions

**Multiattack.** The beholder makes three attacks: two with **Tentacle Lash** and one with **Maw**.

**Tentacle Lash.** *Melee Weapon Attack:* +6 to hit, reach 10 ft., one target. *Hit:* 13 (3d6 + 3) bludgeoning damage, and the target is grappled (escape DC 16). The beholder has four tentacles; it can grapple up to four creatures at once. Each tentacle can be targeted separately (AC 15, 15 HP).

**Maw.** *Melee Weapon Attack:* +6 to hit, reach 5 ft., one target. *Hit:* 21 (4d8 + 3) piercing damage. If the target is a creature grappled by the beholder, the target has disadvantage on ability checks to escape the grapple.
- *(FIX-R220-A) BUG-R216-01 resolved: prior text read "disadvantage on the saving throw" — the Maw is a weapon attack with no saving throw. Correct mechanic is disadvantage on the contested Athletics/Acrobatics check to escape the grapple (PHB "Grappled" condition). First logged R216, reproduced R217–R219, fixed R220.)*

**Disintegration Ray (Recharge 5–6).** *Ranged Spell Attack:* +6 to hit, range 120 ft., one creature. *Hit:* 45 (10d8) force damage. If this damage reduces the target to 0 hit points, the target is disintegrated (turned to ash). A creature reduced to 0 HP by this attack cannot be restored to life except by true resurrection or wish.

**Void Scream (Recharge 6).** The beholder emits a piercing sound that warps reality around the shrine. Each creature within 30 feet that can hear it must make a DC 16 Wisdom saving throw, taking 33 (6d10) psychic damage on a failed save, or half as much on a successful one. On a failed save, the target is also **frightened** of the beholder for 1 minute (DC 16 Wisdom saving throw at the end of each of the target's turns ends the effect). Creatures within 10 feet of the shrine have disadvantage on this save.
- *(FIX-FC46-A) Void Scream FRIGHTENED rider:* The DB action has always included FRIGHTENED on a failed VS save (confirmed in roller output from the 46th cycle). The .md description was missing this rider. FRIGHTENED imposes: disadvantage on attack rolls while the beholder is in line of sight; the target cannot willingly move closer to the beholder. This does NOT affect a creature already prone or grappled (they are already disadvantaged or immobilized). Frightened PCs attempting to flee provoke opportunity attacks if not using Disengage.*
- *(FIX-FC48-A) VS vs unconscious PCs ("can hear it" clause):* VS affects creatures that **can hear** the scream. An unconscious creature is "unaware of its surroundings" (PHB 294) — ruling: **unconscious creatures cannot hear VS and are excluded from its effect**. Do NOT apply VS damage to a PC already at 0 HP, even if they are within 30 ft. (If applied, 33–35 psychic damage on a 0-HP PC with ≤33 max HP triggers instant death — mechanically valid but anticlimactic and likely unintended.) Redirect VS to conscious targets only. (48th-FC-cycle flag: Marwen at 0 HP, within 30 ft — confirmed ruling needed; excluded from VS this run.)*

---

## Bonus Actions

**Shrine-Drift.** The beholder moves up to 30 feet. It can move through other creatures and objects as if they were difficult terrain; it takes 5 (1d10) force damage if it ends its turn inside a creature or object.

**Compel Thrall (1/Turn).** The beholder targets one creature it can see within 60 feet that is charmed by it (usually a dominated derro). The target must succeed on a DC 16 Charisma saving throw or move up to 30 feet toward the beholder or another target the beholder designates.

---

## Reactions

**Antireality.** When the beholder is targeted by an attack it can see, it can use its reaction to impose disadvantage on that attack roll (once per round). The stone beneath it ripples as if underwater.
- *(DM timing note — FIX-F33-A, BUG-F7-02 CLOSED R224): Declare Antireality the moment the attacker announces their attack, before any dice are rolled — the runner now fires the prompt on the `action_executed` event (pre-roll). DB `effect` field corrected at R224: prior spec said "+2 AC after seeing the roll"; now reads "disadvantage on the triggering attack roll." Trigger key also corrected from `"damage"` to `"action_executed"`. See DB for authoritative current text.)*
- *(FIX-R122-A) Regression note: the fire #6 and fire #33 fixes both regressed in commit 9a3ee5f (R107 area; the add-#combat-runner commit overwrote accumulated text). Restored here at R122.)*

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

**Against Melee:** Grapples with tentacles and drags into difficult terrain; uses ranged attacks while keeping distance.

**Against Clerics/Paladins:** Focuses on **Drain Divinity** to remove their healing and buffs. It *hates* sanctified weapons and holy water (treats them as if from a higher plane).

**Environmental Use:** 
- Hovers near the shrine altar to maximize Void-Feeding bonus
- Uses lair terrain (pillars, collapsed shrine remains) for cover
- Draws thrall derro into combat on initiative count 20 to overwhelm the party

**Retreat:** If reduced below 30 HP, the beholder retreats deeper into the lower shaft, using thralls to block pursuit. If below 20 HP, it attempts to crush/disintegrate the party while fleeing.

---

## Lair Actions

On initiative count 20 (losing ties), the beholder takes a lair action to move or use one of the following options:

**Unstable Ground.** One creature the beholder can see within 60 feet must succeed on a DC 16 Dexterity saving throw or fall prone as the stone buckles beneath it.

**Manifest Thralls.** Up to three derro that are charmed by the beholder and within 60 feet of it gain temporary hit points equal to the beholder's Charisma modifier (minimum 1). They can immediately use their reaction to move or make a weapon attack.

**Void Eruption.** Each creature within 20 feet of the shrine must make a DC 16 Dexterity saving throw, taking 11 (2d10) force damage on a failed save.

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
