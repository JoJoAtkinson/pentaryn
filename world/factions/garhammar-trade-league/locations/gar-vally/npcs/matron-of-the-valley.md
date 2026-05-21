---
name: Matron of the Valley
created: 2026-05-11
status: active
location: gar-vally
tags: ["#combat-runner", "#humanoid", "#gnoll", "#gar-vally", "#leader", "#vessel", "#cr-3"]
---
# Matron of the Valley

**HP** 65 (10d10+20) **·** **AC** 16 (bone-carved armor) **·** **Speed** 40 ft. **·** **Saves** Str +5, Dex +5, Wis +4 **·** **Psychic resistance** **·** **Darkvision 120 ft.** **·** **CR** 3 (700 XP)

> The vessel of three eaten matrons. Pack Tactics + Lunar Hunt + Echoing Voice. Spell save DC 14. **She is not here to kill — she fights to test and force retreat.**

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist (Haiku's responsibility, not in the DB)

1. Reaction refreshes (Eat the Fallen — once per turn).
2. **Lunar Hunt**: at night, +1d4 to first attack roll this round.
3. **Pack Tactics**: advantage on melee attacks when an ally is within 5 ft of the target.
4. Track once/day slots manually: **Moonbeam · Enhance Ability · Speak with Animals**. DM marks them USED via the right-click chip menu.
5. Below half HP: do NOT retreat. Move closer to the Hunt-Lieutenant — the **Rite of Succession** is coming.

---

## Tactics

- **Round 1, RP-first:** if the party shows respect for the dead, talk — she WANTS to negotiate. Use `Echoing Voice` (free) to grant gnolls advantage.
- **Forced fight:** multiattack the loudest aggressor; cast `produce_flame` on backline casters.
- **Mid-fight:** `moonbeam` on the largest cluster (night only). `enhance_ability` (Str) on Jorran or the lieutenant.
- **Below half HP:** absolutely stay within 5 ft of the lieutenant. Set up the Rite.
- **Reaction:** if an adjacent gnoll drops, `eat_the_fallen` for temp-HP + advantage.

---

## Description

An ancient, scarred gnoll. Hide marked with ritual symbols — human letters, dwarf runes, elf script. Sits cross-legged by a fire, sharpening a blade with ritual slowness. When she speaks, her voice is many — Marta, Gordin, Seresh, all overlaid. Around her neck, bone-carved amulets bearing names.
