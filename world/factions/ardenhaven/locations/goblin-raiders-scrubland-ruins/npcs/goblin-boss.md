---
name: Goblin Boss
created: 2026-05-21
last_modified: 2026-08-09
status: active
location: goblin-raiders-scrubland-ruins
count: 1
tags: ["combat-runner", "humanoid", "goblinoid", "goblin-raiders-scrubland-ruins", "cr-1"]
---
# Goblin Boss

**HP** 21 (6d6) **·** **AC** 17 (chain shirt, shield) **·** **Speed** 30 ft. **·** **Save** Dex +2 **·** **Stealth** +6 **·** **Darkvision** 60 ft. **·** **Passive Perception** 9 **·** **CR** 1 (200 XP)

> Action mechanics live in `combat-runner/actions.jsonl` — see the launcher's **Ready actions** reference for verbs.

---

## Start-of-turn checklist

1. **Nimble Escape** — bonus-action Disengage or Hide, available every turn.
2. **Redirect Attack** (reaction) refreshes to AVAILABLE at the start of this turn — one use per round.
3. **Multiattack** = two weapon attacks: scimitar in melee, or a shortbow volley at range.

---

## Tactics — when the DM asks "what does it do?"

- **Round 1:** stays at the back of the warband, shortbow volley on the most dangerous-looking PC, shouts orders.
- **Redirect Attack:** when something would hit the boss and a raider is within 5 ft, swap places — the raider eats the hit. Spend it freely; raiders are expendable.
- **Multiattack:** closes to scimitar range only when it has a safe target or its raiders are already dead.
- **Parley:** if the fight turns, the boss offers to talk, surrender, or trade information — and it lies. It bolts the instant the party lowers their guard.
- **Last stand:** alone and below ~8 HP → Disengage, Dash, flee into the cave's back chamber.

## Variant notes — see [`_overview.md`](../_overview.md)

**Same statblock in all three variants** — 200 XP, ×1, never scale this one up.

- **v1 — The Second Warband:** as above. The parley is one shouted line when the fight turns, it is a lie, and nothing is built on it.
- **v2 — Ghask's Word:** he has a name, a voice, and a plan. **He calls the parley at the top of round 2 — before he is losing** — and every word of it is a positioning move: his raiders `nimble_escape` into flanking angles instead of attacking while he backs off ten to fifteen feet a round, still talking, steering the party toward the 3-ft cave mouth. Betrayal fires at the end of the second full round of talking or the moment a PC sheathes a weapon, hands something over, or puts their head in the hole. **He does not shoot on the betrayal round** — he Disengages, Dashes, and keeps talking from 90 ft. **He lies about what he will do. He never lies about what he knows**, and once beaten he will trade real information for his life and honour it.
- **v3 — The Fifth Goblin:** unnamed again, and **his parley is honest.** He sent the fifth goblin down the stair, he will not go himself, and he wants out of this cave more than he wants the cave. Terms: the loot is yours, the hole in the back wall is yours, we walk north, you don't follow. He means it. He will also **kick the fire pit out** if he is losing badly and knows exactly what that brings down on everyone.

## Description (one line)

A scar-faced goblin a head taller than its kin, barking orders from behind a wall of expendable raiders.
