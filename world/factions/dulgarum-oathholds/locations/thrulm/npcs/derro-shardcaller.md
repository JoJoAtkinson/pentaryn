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
4. **Pack Tactics Voice (passive):** when an ally within 30 ft hits, the target has disadvantage on the *next* saving throw before end of its next turn — call this out in the reply so the DM remembers it. **Toggle, not stackable:** the target either has disadv or it doesn't; multiple hits in the same round simply refresh the duration, not grant "disadv on two saves."

---

## Tactics — when the DM asks "what does it do?"

- **Position:** 40–60 ft behind the front line. Stays out of melee, uses other derro as cover.
- **Round 1, in range of a caster:** Multiattack (two Shard-Throws, +4 to hit, range 30/60) on the visible spellcaster / healer first.
- **3+ enemies in a line:** **Shard-Barrage** (Recharge 5–6) — 15-ft line, DC 13 Dex, 3d6 piercing, half on save.
- **Bonus action — Call Weakness:** target the ally hitting hardest; that ally gets advantage on its next **attack roll**. **Do not Call Weakness an ally who plans to use Shard-Barrage this turn** — Barrage is a save-based area effect (no attack roll), so the advantage is wasted. Call Weakness is for Multiattack turns only. Save the 3 uses for the fight's most dangerous round. With multiple shardcallers, stagger targets — don't double-buff the same ally. **When calling on the Rager before a Berserk turn:** advantage applies to the Rager's *first* Greataxe swing only (the benefit is spent after that roll); remaining Berserk swings are flat rolls. Still worth using — the first swing is typically the highest-value opportunity. **Initiative priority (DD-39):** Call Weakness on the ally whose turn comes NEXT in initiative order — prefer an ally whose turn falls BEFORE the party's highest-damage dealer. Avoid CW on an ally who acts after the biggest threat in the current round; that ally is likely to be killed before benefiting. Never CW an ally at ≤20 HP (DD-8/DD-25 guard still applies). **Range note (DD-41):** CW has 30 ft range — once the Rager charges to melee (~40 ft from the SC's back-line position, SC-to-Rager gap grows to ~50 ft), CW is out of range. Fire CW on the Rager in R1 before it charges (when SC acts first in initiative); R2+ CW on a melee Rager is impossible without SC repositioning into danger. If the Rager is out of range, hold the charge for the next eligible ally or the fight's most dangerous remaining round.
- **Stagger Barrages (multiple shardcallers):** when 2+ shardcallers have Barrage available, only one fires per round unless a truly decisive line-up exists. A staggered barrage keeps pressure across multiple rounds; a simultaneous triple-barrage R1 depletes all area coverage instantly and leaves rounds 2+ as pure multiattack. **In shardcaller-only formations (no melee allies), when stagger is active:** the two non-barrage shardcallers are multiattacking this round — they SHOULD use Call Weakness on each other (not on the barrage-firing shardcaller, whose advantage would be wasted on a save-based attack). This is the one formation where CW pays off: both multiattacking SCs get attack-roll advantage simultaneously.
- **If a melee threat closes within 15 ft:** Tactical Retreat (no OA), then continue throwing.
- **Below 12 HP:** retreat behind a Rager or pillar; only fire if no melee can reach.

## Description (one line)

Wiry derro draped in obsidian pouches and bone-charm cords; voice carries strangely far, like the stone repeats it.

---

## Position & Role

Back line, 40–60 ft from enemies. Calls weaknesses, scatters lines with barrages, never lets melee close.
