---
title: "Space Journey — PC tune-up (Ballad Quinn & Pip Locksley)"
created: 2026-08-16
last_modified: 2026-08-16
status: active
tags: [oneshot, space-journey, twenty-one, pregens, foundry, 5.5e, level-5, change-record]
---

# Space Journey — PC tune-up

**Change record for the two pregens actually in play.** Kris plays the Bard, Kyle plays the Rogue.
The other six pregens were **not touched**.

> ⚠️ **This file supersedes [space-journey-pregens.md](space-journey-pregens.md) for these two
> characters only.** That file still describes their *original* builds — including a pinned
> prepared list for Ballad built around Heroism, and Cunning Strike pre-resolved to *Trip* for Pip.
> Both are now out of date. The other six entries there are still accurate.

Companions: [space-journey-story-outline.md](space-journey-story-outline.md) (the ten scenes),
[twenty-one-social-map.md](twenty-one-social-map.md) (the cast and their ties).

---

## 1. Scope and identification

| | Player | Character | Build | Foundry actor id |
|---|---|---|---|---|
| Bard | Kristine | **Ballad Quinn** | Human Bard 5, College of Lore, Entertainer | `opMBKiyGpxSJQkg7` |
| Rogue | Kyle | **Pip Locksley** | Halfling Rogue 5, Thief, Criminal | `mfkhAL0SzLJ34KfA` |

Both tokens are placed in scene **`1. Trophy Gallery (Run 20)`** (`OyBj2br7fV2Lzuyx`), side by side
at (1960, 1680) and (2100, 1680).

**System:** Foundry v14.365, dnd5e 5.3.3, world `ardenhaven`, **D&D 2024 rules**.
Items were pulled from the 2024 packs — `dnd5e.spells24`, `dnd5e.equipment24`,
`dnd-players-handbook.feats` — not the 2014 `dnd5e.items` pack, except where an item exists
only there (Potion of Greater Healing, Potion of Fire Resistance).

**Party size is the dominant design constraint: two PCs, level 5, no cleric and no frontliner.**
Almost every judgement below follows from that.

### Ownership (changed 2026-08-16)

Previously both actors were GM-only and neither player had a character assigned, so neither
could open a sheet or move a token.

| Player | Owns | `user.character` |
|---|---|---|
| Kristine | Ballad Quinn — **OWNER** | Ballad Quinn |
| Kyle | Pip Locksley — **OWNER** | Pip Locksley |

Neither can see the other's sheet (owner-on-mine, nothing-on-yours). Granting mutual **OBSERVER**
was offered and not taken — revisit if they want to coordinate HP and slots at the table.

---

## 2. How the review was done

A nine-agent workflow: four recon agents (scenario capability-demand brief from the outline and
social map; 2024 Bard research; 2024 Rogue research; magic-item research), two designers, then
**two Fable reviewers** — one rules referee on legality and arithmetic, one veteran-DM pass on
design fit — then a revision agent folding both reviews in.

The review layer earned its keep: Fable caught a **2014 Lucky feat description**, an **illegal
double-*Light* cantrip**, a false "allies don't save against Hypnotic Pattern" claim, a wrong
"Fast Hands administers potions" note, and several arithmetic slips in the designers' own work.

Joe's stated constraint, verbatim: *"I don't want to power play as in picking busted broken or
most power builds, but I do want smart picks. Meaning someone who is playing smart, optimized
picks, but not hacking the system."*

---

## 3. Accuracy bugs found (both sheets were materially broken)

### Ballad Quinn

| Issue | Was | Now |
|---|---|---|
| **No instrument, no instrument proficiency** | none | 7 instruments (Lute, Pan Flute, Horn, Drum, Flute, Viol, Lyre) + lute and concealed pan flute in inventory |
| **Four skill proficiencies missing** | 5 proficient | 9 — added Acrobatics, Perception, Investigation, Sleight of Hand |
| **Second origin feat missing** (Human *Versatile*) | only Musician | added **Lucky** |
| **Level-4 feat missing** | CHA 18 hardcoded | added **Fey-Touched** (legalises CHA 18; grants Misty Step + Command) |
| **Rapier illegal** — 2024 Bard is simple weapons only | rapier + proficiency | both removed; light crossbow + 2 daggers issued |
| No starting equipment, 0 gp | — | full class + Entertainer packages, 30 gp |

**The instrument was the critical one.** The instrument *is* the spellcasting focus. Without it,
Invisibility, Suggestion, Shatter and Hypnotic Pattern were all literally uncastable.

### Pip Locksley

| Issue | Was | Now |
|---|---|---|
| **No Thieves' Tools proficiency** — granted twice over, by Rogue core traits *and* Criminal | none | proficient, **+8**, two sets carried |
| **Level-4 ASI never applied** | DEX 16 | **DEX 18** → AC 16, attack +8, init +8, Cunning Strike DC 15 |
| **Two class skills never recorded** | 4 proficient | 6 — added Investigation and Deception |
| **Weapon Mastery choices blank** | none | **Shortsword (Vex) + Shortbow (Vex)** |
| **No ranged weapon at all** | dagger only | shortbow + quiver + 40 arrows |
| Size not set | Medium | **Small** (Halfling Nimbleness and Naturally Stealthy depend on it) |
| No starting equipment, 0 gp | — | full Rogue + Criminal packages, 24 gp |

**The missing ASI was the biggest single change on either sheet.**

---

## 4. Decisions Joe made

| Decision | Chosen |
|---|---|
| Bard spell list | **Full rebuild** — 4 spells + 2 cantrips swapped |
| Expertise moved to Perception | **Rogue only** — Ballad keeps Performance Expertise |
| Magic gear | **As proposed** — full slate |

On the Expertise call: the designers wanted Perception Expertise on *both*, because Oz's ring on
someone's hand is the adventure's only working detection channel and Insight is nullified by
design. Joe kept Ballad's Performance Expertise — he is a bard called Ballad Quinn with an
Entertainer background, and the newly-applied Perception *proficiency* already took him from
+1 to +4.

---

## 5. Where the reviewers were overruled

**Kept STR at 10 on both.** Fable's referee correctly found both arrays are 2 points over legal
point-buy and wanted STR dropped to 8. Rejected: these are pregens, not tournament entries, and
the "fix" would have put both PCs at STR 8 walking into a burning building with crush and climb
hazards — the referee's own open questions then warned the fire scene would kill them on
arithmetic. Don't manufacture a problem to satisfy a spreadsheet.

**Ballad's initiative is +3, not the +4 every agent claimed.** That +4 assumed Jack of All Trades
applies to initiative — true in 2014, **not in 2024**. The 2024 wording is "an ability check that
uses a **Skill** proficiency you lack," and initiative uses no skill. Both Fable and the designers
got this wrong. The `jackOfAllTrades` actor flag is set and the system is correctly not applying
it to initiative.

---

## 6. Final state (verified against computed sheet values)

### Ballad Quinn — Human Bard 5 (Lore)

**AC 15 · HP 38 · Init +3 · Spell DC 15 · Spell attack +7 · Slots 4/3/2 · Speed 30**
**Saves:** CHA +9 · DEX +7 · CON +4 · INT +3 · WIS +2 · STR +2
**Skills:** Persuasion +11 · Performance +11 · Deception +8 · Sleight of Hand +6 ·
Acrobatics +6 · Investigation +5 · Arcana +5 · History +5 · Perception +4 (passive 14) · Insight +2

**Cantrips (3):** Vicious Mockery · Light · Minor Illusion
**Prepared (9):** Healing Word · Faerie Fire · Dissonant Whispers · Invisibility · Suggestion ·
Lesser Restoration · Shatter · Hypnotic Pattern · Dispel Magic
**Always prepared, free 1/day each (Fey-Touched):** Misty Step · Command — these do **not**
count against the nine.

| Spell change | Why |
|---|---|
| **+ Healing Word** | The party's only healing. Bonus action at 60 ft reaches a downed partner across a plaza. |
| **+ Lesser Restoration** | 2024 **bonus action**, ends Paralyzed — the answer to Hold Monster landing on Pip. |
| **+ Shatter** | Non-concentration AoE on clumped low-HP mobs; doesn't compete with Hypnotic Pattern. |
| **+ Dispel Magic** | The finale is won by removing a possession, not by damage. |
| **+ Light / + Minor Illusion** | Non-concentration light (Scene 8 ships with none); illusion marking, free. |
| **− Heroism** | A third concentration spell at Touch range, in a party that needs Healing Word more. |
| **− Enhance Ability** | Buys a concentration slot to fix what Expertise ×2 + JoAT + Bardic Inspiration already solve. |
| **− Slow** | Same slot, same save, same shape as Hypnotic Pattern and strictly worse. |
| **− Major Image** | Concentration illusion that can't damage; Minor Illusion covers the practical use free. |
| **− Dancing Lights / − Prestidigitation** | Concentration light competes with Hypnotic Pattern; Prestidigitation goes unused across ten scenes. |

**Attuned 3/3:** Cloak of Protection · Stone of Good Luck · Periapt of Wound Closure
**Other magic:** Pipes of Haunting (no attunement — the substitute frontliner, *and* a magical
instrument, so it doubles as the concealed backup focus)
**Consumables:** 2× Potion of Healing, 1× Potion of Fire Resistance
**Mundane:** lute + concealed pan flute, light crossbow + 40 bolts, 2 daggers, thieves' tools,
rope, grappling hook, hooded lantern, 3 oil, 5 torches, manacles, Entertainer's Pack,
2 costumes, 30 gp

### Pip Locksley — Halfling Rogue 5 (Thief), **Small**

**AC 16 · HP 38 · Init +8 · Cunning Strike DC 15 · Sneak Attack 3d6 · Speed 30**
**Saves:** DEX +8 · INT +5 · CHA +3 · CON +3 · WIS +2 · STR +2
**Skills:** Stealth +11 · Perception +8 (**passive 18**) · Thieves' Tools +8 ·
Sleight of Hand +8 · Acrobatics +8 · Deception +6 · Investigation +5 · Insight +2

**Weapon Mastery: Shortsword (Vex) + Shortbow (Vex).** Both Vex deliberately — the "ally within
5 feet" Sneak Attack trigger is effectively dead in a two-person party, so Pip must generate his
own advantage at **both** ranges. Turn 1: don't move → Steady Aim → shoot → Sneak Attack → Vex
latches. Turn 2+: advantage already in hand, bonus action free for Hide or Disengage.
Only **one** mastery may be swapped per long rest — Shortbow → Scimitar (Nick) is the intended flex.

**Attuned 2/3** — third slot deliberately left open for mid-session loot:
Cloak of Elvenkind · Stone of Good Luck
**Other magic (no attunement):** Goggles of Night (darkvision 60 ft — halflings have none, and the
villain holds the only lantern) · Immovable Rod · Dust of Disappearance
**Consumables:** 3× Potion of Healing, 1× Potion of Greater Healing, 1× Potion of Fire Resistance
**Mundane:** shortbow + quiver + 40 arrows, 4 daggers, shortsword, scimitar, thieves' tools ×2,
poisoner's kit (Cunning Strike: Poison requires it), disguise kit, crowbar, Burglar's Pack, rope,
grappling hook, caltrops, 3 bags of ball bearings, manacles, hooded lantern, 3 oil, 10 candles,
5 torches, 24 gp

**Not pre-loaded, hand out as an Act Two reward:** **+1 Shortsword**.

---

## 7. Open rulings still owed by the DM

1. **Define The Lunge.** Set the save ability — **CHA** is the *Magic Jar* precedent and gives
   Ballad (+9) a reason to interpose for Pip (+3) — and rule explicitly whether **Dispel Magic or
   Lesser Restoration ends a landed possession.** Without that, "cure it rather than kill it" is a
   strategy with no verb attached.
2. **Rescale Oz's finale HP for two PCs** — roughly 150–170 rather than a four-player number.
3. **Pencil in two short rests**, after Scene 4 and after Scene 7. Font of Inspiration and hit dice
   are this duo's only mid-night recovery, and the outline currently guarantees neither.
4. **Scene 3's mob temperature climbs faster than two mouths can talk it down.** Decide whether
   Widow Cress is guaranteed reachable — she is the lever that makes the arithmetic close.

Also undefined and worth a decision before play: the **Scene 7 smoke/suffocation and crush saves**
and **Scene 5 `Break the Line`**. Both PCs are STR 10 with no STR or CON save proficiency; run
these as DEX saves or Acrobatics checks rather than STR, or allow Acrobatics/Sleight of Hand as an
alternative to Scene 4's DC 12 Athletics rope-grab.

---

## 8. Implementation notes (for whoever edits these next)

- `system.tools` is keyed by tool id, **not** name: `lute`, `panflute`, `horn`, `drum`, `flute`,
  `viol`, `lyre`, `thief` (thieves' tools), `pois`, `disg`. Shape is `{value, ability, bonus}`.
- Weapon Mastery lives in **two places**: the actor's selected weapon types at
  `system.traits.weaponProf.mastery.value` (`["shortsword","shortbow"]`), and the mastery
  *property* each weapon item declares at `item.system.mastery`. Both are needed.
- Spell preparation shape here is `system.preparation = {mode, prepared}`. Fey-Touched grants must
  be `mode: "always"` or they eat two of the nine prepared slots.
- **Gotcha hit during this edit:** passing two update objects with the **same `_id`** to
  `updateEmbeddedDocuments` silently drops the first. That is what initially lost Ballad's Cloak of
  Protection attunement (AC read 14 instead of 15). Merge per-item updates into one object.
- Verify by reading **derived** values after `actor.reset()`, not `_source` — this world has a
  standing stale-prepared-data quirk.
