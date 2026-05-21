---
name: Jorran the Hunt-Captain
created: 2026-05-11
status: active
location: gar-vally
tags: ["#combat-runner", "#humanoid", "#gnoll", "#gar-vally", "#named", "#cr-1"]
---
# Jorran the Hunt-Captain

**HP** 27 (5d8+5) **·** **AC** 15 (leather armor, shield) **·** **Speed** 40 ft. **·** **Saves** Str +5, Dex +4 **·** **Darkvision 60 ft.** **·** **CR** 1 (200 XP)

> Named hunt-captain — wears the dwarf-prospector's pickaxe around his neck as his trophy and identity. Pack Tactics + Lunar Hunt (+1d4 to first attack each round at night).

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist (Haiku's responsibility, not in the DB)

1. Reaction refreshes (Eat the Fallen — once per turn).
2. **Lunar Hunt**: if night/outdoors, add +1d4 to the first attack roll this round (DM tracks).
3. **Pack Tactics**: advantage on melee attacks when an ally is within 5 ft of the target.
4. **Sun-Burdened**: disadvantage on attacks in direct sunlight.

---

## Tactics

- **Round 1, fresh:** position to flank with a warrior; multiattack the lowest-AC enemy.
- **Mid-fight:** target casters / wounded enemies. If moonlight active, leverage the +1d4 stealth opener.
- **Below half HP:** disengage toward the matron or reinforcements.
- **Reaction:** if an adjacent gnoll drops, fire `eat_the_fallen` for the temp-HP + advantage boost.

---

## Description

A massive, scarred gnoll in leather armor with a bone-carved shield. A dwarf-forged prospector's pickaxe hangs from a cord around his neck — both trophy and talisman. Confident, commanding, respectful to the matron.
