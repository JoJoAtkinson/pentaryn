---
name: Gar-Vally Gnoll Encounter Design
description: Three-tier escalating encounter for Gar-Vally (gnoll territory, Garhammar Trade League), level 4 ×3 party. Approach A (lore-forward, parley-friendly) as default, Approach B (ambush, combat-first) as fallback.
type: encounter
created: 2026-05-09
scope: Complete location population with stat blocks, encounter flow, lore integration
---

# Gar-Vally Gnoll Encounter Design

## Overview

**Location:** `world/factions/garhammar-trade-league/locations/gar-vally/`
**Party Level:** 4 (3 players)
**Encounter Type:** Three-tier escalating social/combat hybrid
**Approach:** A (default, lore-forward) + B (fallback, combat-first)
**Tone:** Anthropological horror; gnolls are people with an alien ethics, not demons

---

## Core Premise

The gnolls of Gar-Vally do not worship the Demon of the Hungering Maw. They are a matriarchal, lunar, ancestor-eating culture with no pantheon—only spirits and the hunt. They are *people*. The party's first encounter with them should challenge assumptions about what "monster" means.

### Naming Schema (Critical)

**Gnolls do not name themselves. They take the names of their first humanoid victims.**

- **Unnamed gnolls (CR 1/2 mooks):** Young, unproven, haven't killed a named creature yet. Disposable, junior.
- **Named gnolls (CR 1+, captain, matron):** Each carries the name of a humanoid they've eaten. The dissonance is intentional: a scarred, brutal warrior answers to "Elara" (a halfling baker) or "Sister Vynn" (a cleric). This makes them *people wearing the dead*.
- **The Matron:** Carries multiple names. She is literally a vessel—she's eaten her predecessors in ritual, and they speak through her. Her introduction might be "I am the Vessel of *Marta* and *Gordin* and *Seresh*" (all eaten matrons).

This naming scheme forces the party to engage with the gnolls as a society with a different (dark, horrifying) ethics—not as faceless monsters.

---

## File Structure

```
world/factions/garhammar-trade-league/locations/gar-vally/
├── _overview.md                 # Valley geography, history, A.V. fragment, adventure hooks
├── README.md                    # GM quick-reference (combat cheat sheet, encounter flowchart)
├── encounters.md                # Tier-by-tier encounter details (scene description, skill DCs, combat setup)
└── npcs/
    ├── unnamed-gnoll-warrior.md         # CR 1/2 (used in all tiers)
    ├── jorran-hunt-captain.md           # CR 1 (named, dwarf prospector victim)
    ├── matron-of-the-valley.md          # CR 3 (carries multiple names, Vessel mechanic)
    ├── unnamed-hunt-lieutenant.md       # CR 1 (matron's chosen successor)
    ├── valley-hyena.md                  # CR 1/8 (beast support)
    └── ancestor-stir.md                 # CR 4 (secret, only if matron dies without rite)
```

---

## Stat-Block Roster & CR Budget

### Party Scaling

**Party:** 3 PCs at level 4
**Hard fight target:** ~700 XP
**Deadly threshold:** ~1100 XP

### Cast List

| Stat Block | Role | CR | Source Donor | Used In | Notes |
|---|---|---|---|---|---|
| Unnamed Gnoll Warrior | Mook (unproven rank-and-file) | 1/2 | a5e-mm gnoll | Tiers 1, 1B, 2, 3 | No victim-name. Carries *Sun-Burdened* (disadv in direct sun). Type: Humanoid, NOT Fiend. |
| Jorran the Hunt-Captain | Lieutenant; hunt leader | 1 | a5e-mm gnoll +1 level | Tiers 1B, 2, 3 | Named after a dwarf prospector. Carries *Lunar Hunt* (advantage on Stealth at night, +1d4 first attack under moon). |
| Matron of the Valley | Leader; lunar caster; social anchor | 3 | a5e-mm gnoll-pack-leader (CR 2) + spellcasting | Tier 3 only | Carries multiple victim-names (matrons she's eaten). Has *Vessel of Mothers* mechanic: if killed without rite, successor inherits her powers. |
| Unnamed Hunt-Lieutenant | Matron's chosen successor | 1 | a5e-mm gnoll +1 level | Tier 3 | Young, unnamed, waiting to prove herself. Will perform the rite on the matron if she falls in combat. |
| Valley Hyena | Beast pack support | 1/8 | a5e-mm hyena (CR 0 base) +1 HD | Tiers 1, 1B, 2 | Wears matron's clan-mark. Faster pack-hunter. |
| Ancestor-Stir (Secret) | Trump card; manifestation of eaten matron | 4 | tob2 emperor's-hyena (Undead) reskin | Tier 3 only (if matron dies *without* rite) | Only used if the party violates the cannibal-rite during matron's death. If matron is eaten ritually by her successor, this never manifests. |

**Encounter XP Budgets:**
- Tier 1 (patrol): 2 warrior + 1 hyena = 225 ×1.5 = **337 XP** (easy)
- Tier 1B (ambush): 3 warrior + 1 captain + 1 hyena = 550 ×1.5 = **825 XP** (hard)
- Tier 2 (hunt): 1 captain + 2 warrior + 1 hyena = 450 ×1.5 = **675 XP** (hard)
- Tier 3 (matron): 1 matron + 1 lieutenant + 2 warrior = 1100 ×2 = **2200 XP** (deadly, by design—combat is fail-state)

---

## Custom Mechanics (Design Once, Use Across Stat Blocks)

These mechanics are shared across multiple creatures. Design them once in a mechanics appendix.

### Sun-Burdened
**Used by:** Unnamed warriors, captain, matron (in direct sunlight)
**Effect:** Disadvantage on attack rolls while in direct sunlight. At night or indoors, no penalty.
**Narrative:** The gnolls see the sun as a watcher, a burner, an outsider. Daylight is unsettling to them.

### Lunar Hunt
**Used by:** Hunt-Captain, Matron
**Effect:** When a moon is visible (night, outdoors), gain advantage on Stealth rolls and +1d4 to the first attack roll of each round.
**Narrative:** The gnolls are most dangerous under moonlight—the moon is their mother.

### Eat the Fallen (Reaction)
**Used by:** All named gnolls (warrior, captain, lieutenant, matron)
**Trigger:** An ally gnoll (humanoid, not beast) drops to 0 HP within 5 feet.
**Effect:** This gnoll uses its reaction to "honour" the fallen—the gnoll gains 5 temporary HP and advantage on its next attack roll before the end of its next turn. 
**Narrative:** The gnolls perform a quick rite over their fallen kin, absorbing their strength and memory. This is not grotesque—it is sacred.

### Vessel of Mothers (Matron Only)
**Used by:** Matron of the Valley (CR 3)
**Trigger:** Matron is reduced to 0 HP.
**Effect:** If an unnamed Hunt-Lieutenant is within 5 feet and can perform a reaction, she may perform the *Rite of Succession*. If she does:
  - The matron dies, but the lieutenant **gains the matron's spell list and features** for 1 minute (as if possessed by the eaten matron's spirit).
  - The lieutenant becomes the new matron for mechanical purposes.
  - If the rite is completed, **Ancestor-Stir does NOT manifest**.
  
  If no successor is within reach OR the party prevents the rite (e.g., by grappling the lieutenant or destroying the matron's body):
  - The matron dies as normal.
  - Next round, **Ancestor-Stir manifests** in her place (a spiritual echo of a previous matron, CR 4 undead).

**Narrative:** The matron does not die alone. She is *eaten* by her successor, and her wisdom (literally, magically) flows into them. This is the apex of their culture: death is not ending, but inheritance.

---

## Tier-by-Tier Encounter Design

### Tier 1: Watcher Patrol (Approach A — Default)

**Location:** Road into Gar-Vally, dusk/sunset. Two stone outcroppings frame the path; the gnolls use them as a natural gate.

**Setup:** 2× Unnamed Gnoll Warriors + 1 Valley Hyena, alert but not hostile.

**Opening Scene (Read-Aloud):**
> *As the sun sinks toward the western peaks, the air cools. You hear it first—a long, low ululation echoing from the valley ahead, like wind through broken bone. The howl cuts off abruptly. Then silence, heavier than before. As you round the next bend, you see them.*
>
> *Two massive, hyena-headed figures stand blocking the path. Their fur is matted, their hides scarred. One wears a dwarf-carved breastplate, too small for its frame. The other is adorned with human finger-bones, threaded into braids. Behind them, a lean, snarling beast—hyena-like but larger, wilder. All three face the setting sun, which is sinking into their territory.*
>
> *They turn to look at you. The one with the breastplate makes a sound—not words, but a sharp, repeated bark. It gestures with a clawed hand, pointing down the road you came from. The message is clear: turn back.*

**Encounter:** The gnolls refuse to speak (treat the sun as hostile; they won't communicate in daylight). They communicate via signs, growls, and body language. They will NOT attack first.

**Skill Challenge (DC 12):** The party can attempt to parley using:
- **Insight:** Reading their body language and intentions (they're guards, not murderers)
- **Animal Handling:** Approaching the hyena, showing no threat
- **Deception or Persuasion:** Convincing them the party is harmless or worthy

**Success:** The gnolls step aside and escort the party into the valley, arriving by full night. The party learns: "the moon is mother, the sun is watcher." They may overhear the gnolls' reverence for the moon.

**Failure or Combat:** The party is forced back to the road OR chooses to fight. Combat is easy (337 XP). If the party wins without killing both gnolls, one flees to warn the hunt-captain. If the party kills both, the hunt-captain discovers the bodies and escalates to Tier 2 with reinforcements.

**Progression:** Regardless of outcome (parley, combat, or bypass), Tier 2 begins as the party approaches the valley center.

---

### Tier 1B: Ambush (Approach B — Fallback, Combat-First)

**Trigger:** Use this if the party shows up hostile, the first session needs a combat hook, or the DM prefers a fight-first narrative.

**Location:** Night on the road, party making camp before entering the valley.

**Setup:** 3× Unnamed Gnoll Warriors + Jorran the Hunt-Captain + 1 Valley Hyena, attacking under cover of darkness.

**Opening:** The hyena's snarl—close, too close. Surprise round if the party didn't post watch. Jorran leads the attack, using *Lunar Hunt* for advantage.

**Combat:** This is a hard fight (825 XP). The gnolls use pack tactics; they focus fire and use terrain. The hyena flanks.

**Negotiation Mid-Combat:** If the party tries to yield or parley (especially if they shout about the moon, show reverence, or spare a wounded gnoll), Jorran will pause and listen. A successful DC 13 Persuasion check can halt the combat.

**Outcome:**
- **Party Victorious:** Jorran and warriors fall. If the party allows the gnolls to eat their own fallen (the rite), the gnolls will speak after the fight: *"You fight like hunters. You may enter the valley."* If the party prevents the rite (burning bodies, desecrating dead), the gnolls retreat and Tier 2 becomes more hostile.
- **Party Yields:** Jorran accepts the surrender. The party is escorted deeper into the valley, disarmed, to meet the matron. Tier 3 is now high-stakes.
- **Party Flees:** The gnolls do not pursue far from the road—the valley is their hunting ground, not a wilderness. They'll meet the party again in Tier 2 or 3.

**Progression:** Tier 2 or 3, depending on party choices.

---

### Tier 2: Hunt-in-Progress (All Approaches)

**Location:** Deep in the valley at night. A clearing ringed by ancient stones. The moon is high.

**Setup:** Jorran the Hunt-Captain + 2× Unnamed Gnoll Warriors (+ hyena if not used in Tier 1B), standing over a freshly-killed great elk.

**Opening Scene (Read-Aloud):**
> *The air smells of copper and night-blooming flowers. As you push through the last of the scrub, the valley opens up. A massive elk lies in the center of a stone ring, its flank still steaming. The gnolls stand motionless around it.*
>
> *One of them—scarred, wearing a prospector's pickaxe on a cord around its neck—steps forward. When it speaks, its voice is rough but clear: "You come to the hunt." It is not a question.*
>
> *The gnoll picks up a cracked bone from the elk's ribs and, with ritual care, holds it toward the moon. The others fall silent. For a moment, the only sound is wind and the gnoll's soft chanting—words in a language you don't know, but the reverence is unmistakable.*
>
> *The gnoll turns back to you. "The kill-place spirit is honored. Now, you." Claws extend. "What have you taken? What will you offer?"*

**The Test:** Jorran (the scarred gnoll with the prospector's pickaxe—his victim-name is a dwarf miner he ate seasons ago) demands that the party offer a tribute: *something the party has killed, hunted, or taken.*

**Options:**
1. **Parley (DC 13 Persuasion/Insight):** The party offers a story, a song, a vow, or claims kinship with beasts. *"We hunt for survival, as you do. We respect the kill."* If successful, the gnolls accept this and escort the party to Tier 3.

2. **Offer a Kill:** The party produces a kill from their pack (a rabbit, a bird, anything). Jorran examines it. If it was hunted/killed, not taken from elsewhere, he accepts. The rite is brief but respectful. Tier 3 proceeds.

3. **Combat:** If the party refuses or attacks, combat begins (675 XP, hard). The warriors are disciplined; they protect the elk's body and use the stone ring as cover. Jorran uses *Lunar Hunt* and *Eat the Fallen* if his warriors drop.

4. **Stealth/Bypass:** The party can try to slip past unseen (DC 14 Stealth). Success means they avoid combat but lose the chance to learn the rite. Tier 3 begins; the matron is aware they're approaching.

**Progression:** Successful parley or kill-offering = clean ascent to Tier 3. Combat = Tier 3 is now tense; the matron suspects violence. Bypass = Tier 3 is surprised but cautious.

---

### Tier 3: Matron's Hearth (All Approaches)

**Location:** The valley's center. A natural amphitheater carved by ancient water. Bones are arranged in spiraling patterns on the ground—ancestor-maps. A fire burns in the center, burning slow and moon-bright.

**Setup:** Matron of the Valley (CR 3) + 1× Unnamed Hunt-Lieutenant + 2× Unnamed Gnoll Warriors, at rest around the fire. The matron is sharpening a blade, a ritual act.

**Opening Scene (Read-Aloud):**
> *The fire in the amphitheater is impossibly bright, but it casts no shadow—the moonlight and firelight are one. Bones spiral outward from the center in patterns that seem almost mathematical. You count at least a dozen distinct spirals, each radiating from a central point.*
>
> *A massive gnoll sits cross-legged across the fire, a blade in her claws, running a whetstone along its edge. Her hide is ancient—scarred, marked with symbols you recognize from tales: human letters, dwarf runes, elf glyphs, all carved or tattooed into her fur. When she looks up, you hear something strange: the sound of wind, the echo of voices layered over her own. When she speaks, she speaks in the singular, but it sounds like a chorus.*
>
> *"Welcome, travelers. You have walked the hunted path and lived. That is well." She sets down the blade. "I am the Vessel of Marta and Gordin and Seresh. I carry them. Through me, they eat and hunt still."*
>
> *The other gnolls—younger, unnamed, waiting—make a sound like wind through hollow trees. The matron gestures to the fire. "Sit, if you will speak."*

**The Negotiation (Social Setpiece):** This is NOT combat. The matron is genuinely interested in the party. She tests them with questions:

- *"You come to the moon's daughter, yet you fear the hunt. Why?"*
- *"Do you know what you are, in our sight? Prey with words. Tell me—what makes you more than meat?"*
- *"A human died on the road. We gave him to the spirits. Do you mourn him, or do you fear us?"*

**Skill Checks:** The party can use Insight, Perception, or Persuasion to understand the matron's intent:
- **Insight (DC 13):** She genuinely wants to understand the party, not kill them.
- **Perception (DC 14):** You notice the bones in the spirals are labeled (names carved into them)—they are ancestor-records, a genealogy written in bone.
- **Persuasion (DC 13):** If the party answers her questions honestly and with respect, she offers passage and a *name-bone*.

**If the party has the Raven quest:**
The matron's response to *"We came to teach you a god"* is:
> *"You come to give us belief. We have belief—older than your god-names. We believe in the dead. We believe in the hunt. We believe in the moon-mother. Your words are like sunlight on water: they catch, they shimmer, they drown. But perhaps the moon-mother is a spirit-of-the-hunt-place, waiting for the first one we eat in your god's name. We will consider it."*

This is not a "yes," but it's not a "no." Raven will not be satisfied, but the door is open for future negotiation—or betrayal.

**The Reward (Non-Combat):**
- A *name-bone* (a carved token bearing the matron's current name—one of her eaten mothers—and safe passage through gnoll territory)
- Confirmation of A.V.'s account (the demon-tracts are lies; the gnolls are people, not Yeenoghu-bound)
- A revelation: *"The elf who came before you—A.V.—she wrote truth. We do not worship. We inherit. When one of us eats the dead, their strength becomes ours. The matron before me is within me still. We are many and one."*
- Safe passage to Dulgarum's side of the mountain

**Combat (The Fail-State):**
If the party attacks, this is a deadly encounter (2200 XP). The matron does NOT fight to kill; she fights to *test* the party's resolve. If the party lands a killing blow:

The unnamed Hunt-Lieutenant (the young female gnoll, waiting to prove herself) uses her reaction to perform the **Rite of Succession:**
- She closes on the matron and performs the ritual eating (mechanically: the matron dies, and the lieutenant gains the matron's spell list, hit points, and abilities for 1 minute as if *possessed* by the matron's spirit).
- Combat continues with the "new" matron (actually, the old one speaking through her successor).
- This is still a deadly fight. The party will likely need to flee.

If the party destroys the matron's body or prevents the rite (e.g., grappling the lieutenant), the **Ancestor-Stir** manifests next round—an undead hyena-spirit (CR 4) that is the echo of a previous matron. This is a CR 4 encounter, forcing a retreat.

**The Point:** Combat with the matron is *unwinnable*. It is designed to break the party's will to fight. The victory condition is *not* defeating her—it is understanding her, hearing her, and choosing peace.

---

## Connection to Broader Campaign

### The Raven Hook ("A Soul Worth Sending")

If the party accepted Raven's quest, they arrived at Gar-Vally with a mandate: teach the gnolls a religion so Raven can later "harvest their bodies." The matron's response (see Tier 3, above) is: she will *consider* it, but she will not convert. 

**This creates a dilemma for the party:**
- Raven will be angry. She expected a "yes."
- But the gnolls are now *possible* allies, not mindless converts.
- If the party later betrays the gnolls to Raven, they have broken trust.
- If the party refuses Raven, they've made an enemy of an Elder.

This is intentional. The encounter should complicate the Raven narrative, not resolve it.

### A.V.'s Account

The matron (or her warriors) can confirm what A.V. wrote: the gnolls are not demon-bound. They have no pantheon. They eat the dead as an act of honor and inheritance. The Yeenoghu tracts are lies—probably spread by Calderon witch-hunters or old Garhammar propagandists.

If the party produces A.V.'s journal page, the matron may even offer *her own account*—an older, oral history that contradicts A.V.'s but validates her core thesis.

### The Name-Bone (Safe-Pass)

The *name-bone* the party receives is a physical token: a carved bone inscribed with the matron's name (one of her eaten mothers, e.g., "Gordin" or "Seresh"). If shown to any gnoll of Gar-Vally in the future, it grants safe passage and hospitality.

This is useful if the party must traverse the valley again, or if they betray the matron later and face her wrath.

---

## Treasure & Loot

### Non-Combat Reward (if matron is not killed)
- **Name-bone:** A carved bone token (treat as a safe-pass, not treasure)
- **Information:** Confirmation of A.V.'s thesis, intel on Dulgarum's eastern approach, knowledge of Calderon scouts
- **Passage:** Safe travel through Gar-Vally and gnoll territory

### Combat Reward (if any gnoll is slain)
- **Jorran the Hunt-Captain (if killed):** Dwarf-carved prospector's pickaxe (the artifact of his victim-name), worth 50 gp. Personal effects: a journal in dwarf script, detailing the prospector's final days. (Flavor, not mechanically valuable, but emotionally heavy.)
- **Warriors (if killed):** Minimal loot—bone weapons (20 gp each), hide armor (treat as leather, 20 gp).
- **Matron (if killed without rite):** None—her successor inherits her power. The Ancestor-Stir manifests and is lost to the aether.

---

## Appendices

### A. Mechanics Quick-Reference

| Mechanic | Used By | Effect |
|---|---|---|
| Sun-Burdened | Warriors, Captain, Matron | Disadv on attacks in direct sunlight |
| Lunar Hunt | Captain, Matron | Adv on Stealth at night; +1d4 to first attack under moon |
| Eat the Fallen | All named gnolls | Reaction when ally drops: gain 5 temp HP, adv on next attack |
| Vessel of Mothers | Matron only | When killed, successor may perform rite and inherit her powers; if prevented, Ancestor-Stir manifests |

### B. Stat-Block File Checklist

- [ ] unnamed-gnoll-warrior.md (CR 1/2)
- [ ] jorran-hunt-captain.md (CR 1, named)
- [ ] matron-of-the-valley.md (CR 3, multiple names, Vessel mechanic)
- [ ] unnamed-hunt-lieutenant.md (CR 1)
- [ ] valley-hyena.md (CR 1/8)
- [ ] ancestor-stir.md (CR 4, secret)

### C. Encounter Flowchart

```
Start: Road into Valley
│
├─ [Tier 1A: Watcher Patrol (default)]
│  ├─ Success (parley) → [Tier 2]
│  ├─ Combat victory → [Tier 2 hostile]
│  └─ Combat defeat / Bypass → [Tier 2 cautious]
│
├─ [Tier 1B: Ambush (fallback)]
│  ├─ Jorran falls (clean kill) → [Tier 2/3 open]
│  ├─ Party yields → [Tier 3 direct]
│  └─ Party flees → [Tier 2 tense]
│
├─ [Tier 2: Hunt-in-Progress]
│  ├─ Parley success → [Tier 3 open]
│  ├─ Combat victory → [Tier 3 hostile]
│  └─ Combat defeat / Bypass → [Tier 3 cautious]
│
└─ [Tier 3: Matron's Hearth]
   ├─ Social victory → Passage + Name-bone
   ├─ Combat attempted → Vessel of Mothers / Ancestor-Stir
   └─ Matron killed → [Campaign consequences]
```

---

## Notes for Implementation

1. **Names are critical:** Every named gnoll (Jorran, the matron) should have a clear victim-name and backstory. The dwarf prospector Jorran ate should be detailed enough to haunt the party if they learn about it.

2. **The Matron's Names:** The matron carries 3-4 eaten matrons' names. These should be diverse (a human, a dwarf, an elf) and her introduction should layer them: *"I am Gordin and Seresh and Marta, and they are me."* This is how you telegraph the *Vessel* mechanic without explaining it.

3. **Sun-Burdened and Lunar Hunt are environmental levers:** If Tier 1 or 2 happens in daylight (unlikely but possible), the gnolls have disadvantage. If Tier 3 happens under a full moon, the matron is at advantage. This makes environment matter.

4. **The Rite of Succession is the emotional climax:** If the party reaches Tier 3 and kills the matron, the image of her successor ritually eating her is the moment the party understands: *these are not monsters. They are people with an alien, terrible ethics.* The Vessel mechanic prevents a "easy victory," forcing the party to flee or yield. This is intentional.

5. **Raven's quest is a thread, not a knot:** The matron will not convert. But she will listen. This gives the party options in later sessions—they can try again, or they can betray her, or they can walk away. Keep Raven's quest unresolved.

---

## Completed

- [x] Location structure (files to create)
- [x] Stat-block roster (6 creatures, CR scaling)
- [x] Custom mechanics (4: Sun-Burdened, Lunar Hunt, Eat the Fallen, Vessel of Mothers)
- [x] Tier-by-tier encounter design (3 tiers + 1 fallback)
- [x] Lore integration (Raven hook, A.V. fragment, naming schema)
- [x] Treasure / outcomes
- [x] Appendices (mechanics quick-ref, file checklist, flowchart)

**Next: Hand off to writing-plans to build stat blocks.**
