---
name: Derro Shardcaller
description: "Ranged tactical leader; calls formations and weaknesses"
created: 2026-04-26
status: active
location: thrulm
tags: ["#combat-runner", "#npc", "#combat", "#derro", "#thrulm", "#ranged", "#support", "#cr-2"]
---
# Derro Shardcaller (Tactical Support)

**HP** 33 (6d8+6) **·** **AC** 14 (leather) **·** **Speed** 30 ft. **·** **Saves** Wis +4 **·** **Resist** psychic **·** **Darkvision 120 ft., passive Perception 14** **·** **CR** 2 (450 XP)

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist

1. If **Shard-Barrage** is USED, roll `roll_dice(1, 6)` — recovers on 5–6.
2. **Call Weakness** (3/Day) — track uses across the encounter; bonus action when ready.
3. **Tactical Retreat** bonus action available each turn (move 30 ft away from nearest enemy without provoking).
4. **Pack Tactics Voice (passive):** when an ally within 30 ft hits, the target has disadvantage on the *next* saving throw before end of its next turn — call this out in the reply so the DM remembers it.

---

## Tactics — when the DM asks "what does it do?"

- **Position:** 40–60 ft behind the front line. Stays out of melee, uses other derro as cover.
- **Round 1, in range of a caster:** Multiattack (two Shard-Throws, +4 to hit, range 30/60) on the visible spellcaster / healer first.
- **3+ enemies in a line:** **Shard-Barrage** (Recharge 5–6) — 15-ft line, DC 13 Dex, 3d6 piercing, half on save.
- **Bonus action — Call Weakness:** target the ally hitting hardest; that ally gets advantage on its next attack. Save the 3 uses for the fight's most dangerous round.
- **If a melee threat closes within 15 ft:** Tactical Retreat (no OA), then continue throwing.
- **Below 12 HP:** retreat behind a Rager or pillar; only fire if no melee can reach.

## Description (one line)

Wiry derro draped in obsidian pouches and bone-charm cords; voice carries strangely far, like the stone repeats it.

---

## Position & Role

Back line, 40–60 ft from enemies. Calls weaknesses, scatters lines with barrages, never lets melee close.
