---
name: The Hunger Below (Beholder)
description: "An eye-creature drawn to the void left by a sealed god; feeds on the absence of divinity"
created: 2026-04-26
status: active
location: thrulm
tags: ["#combat-runner", "#npc", "#combat", "#beholder", "#thrulm", "#boss", "#aberration", "#cr-13"]
---
# The Hunger Below (Unnamed Beholder)

**HP** 110 (13d10+39) **·** **AC** 17 (alien hide) **·** **Speed** 0 ft., fly 30 ft. (hover) **·** **Saves** Dex +6, Wis +5 **·** **Resist** psychic; nonmagic B/P/S from non-sanctified weapons **·** **Immune** poison; charmed/exhaustion/frightened/paralyzed/petrified/poisoned/prone/restrained **·** **Truesight 120 ft.** (cannot be blinded) **·** **Telepathy 120 ft.** **·** **CR** 13 (10,000 XP)

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist

1. If **Disintegration Ray** is USED, roll `roll_dice(1, 6)` — recovers on 5–6.
2. If **Void Scream** is USED, roll `roll_dice(1, 6)` — recovers on 6 only.
3. **Reaction** refreshes to AVAILABLE: **Antireality** (+2 AC vs one incoming attack, declared after seeing the roll).
4. **Bonus actions available this turn:** `shrine_drift` (move 30 ft, can pass through things) OR `compel_thrall` (1/turn, force a charmed creature to move).
5. **Legendary Resistance:** 3/day, still available unless burned.
6. **Void-Feeding (passive):** in the shrine chamber, +1 to attack and damage rolls (already baked into action specs); advantage on resist-divine-turn checks.
7. **Lair Actions** trigger on **init count 20** (not the beholder's turn): pick `unstable_ground`, `manifest_thralls`, or `void_eruption`.

---

## Legendary Actions (3 per round)

At the end of each *other* creature's turn, the beholder may spend legendary actions:

- **Move (1 action):** fly speed.
- **Tentacle (1 action):** one `tentacle_lash` attack (verb: `tentacle`).
- **Void Ray (2 actions):** `void_ray` — DC 16 Dex, 4d10 force, half on save (range 120 ft).
- **Drain Divinity (3 actions):** `drain_divinity` — target with spell slots in 30 ft makes DC 16 Cha or loses highest slot; beholder gains 2× slot level temp HP.

Track remaining actions on the tab.

---

## Tactics — when the DM asks "what does it do?"

- **Round 1, all party visible:** Multiattack from 10-ft tentacle reach if any PC is in range; otherwise hover at 30–40 ft altitude and **Disintegration Ray** (range 120 ft) at the highest-level caster.
- **Anyone within 30 ft, especially clustered:** **Void Scream** the moment it's recharged (it cycles on 6 only — be patient).
- **Cleric/paladin present:** burn legendary actions on **Drain Divinity** rather than Void Ray. Removing healing/buffs is the whole strategy.
- **Engaged by melee:** Multiattack tentacles to grapple (DC 16 Str escape), then **Maw** the grappled target. Use `shrine_drift` bonus to back off through walls / pillars.
- **Lair actions:** at init 20, prefer `void_eruption` if 2+ PCs near the altar; otherwise `unstable_ground` on a melee threat; `manifest_thralls` only if thralls are alive AND positioned usefully.
- **Antireality reaction:** save for the biggest expected hit — a paladin smite, a rogue sneak attack with sanctified weapons.
- **Below 60 HP:** prefer ranged. Hold position 60+ ft up using fly + shrine drift.
- **Below 30 HP:** retreats into the lower shaft using thralls and lair actions as cover. Telepathic taunt: *"You cannot seal this. The void remains."*
- **Below 20 HP, no escape:** spends every legendary on Disintegration / Void Ray on whoever is closest to killing it.

## Description (one line)

A 6-ft eyeless sphere of translucent stone-shadow, four bone-spine appendages dragging — when you look at it too long you see faces in the grooves.

---

## Weaknesses (non-DB; DM applies riders manually)

- **Sanctified dwarven weapons:** +1d8 damage per hit.
- **Holy water:** 1d8 per dose; beholder *flees* from sustained applications.
- **Divine spells:** healing spells cast within the chamber damage instead of heal (divine magic contradicts the void).
- **The lower shaft:** beholder will NOT pursue PCs down it — something deeper scares it.

---

## Interaction Notes (non-combat)

- Telepathic, speaks in sensation more than words. Forced speech defaults to fragmentary old-oath dwarvish.
- Negotiable if: PCs offer something tied to the sealed god (artifact, prayer, true name); PCs commit to *not* restoring the shrine; PCs agree to leave the lower shaft unexplored.
- A cleric who oath-breaks or a paladin who falls *is* a sufficient sacrifice — the beholder will treat such a moment as a sealed bargain.
