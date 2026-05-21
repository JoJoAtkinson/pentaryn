---
name: Hunt-Lieutenant
created: 2026-05-11
status: active
location: gar-vally
tags: ["#combat-runner", "#humanoid", "#gnoll", "#gar-vally", "#successor", "#cr-1"]
---
# Hunt-Lieutenant

**HP** 22 (4d8+4) **·** **AC** 15 (leather armor) **·** **Speed** 40 ft. **·** **Saves** Dex +5 **·** **Darkvision 60 ft.** **·** **CR** 1 (200 XP)

> Chosen successor to the matron — waiting to earn her victim-name. Has the Rite of Succession reaction: if the matron drops within 5 ft, she can inherit the matron's stat block for 1 minute (DM tracks manually; not in the DB).

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist (Haiku's responsibility, not in the DB)

1. Reaction refreshes (Eat the Fallen — once per turn).
2. **Lunar Hunt**: at night, +1d4 to first attack roll this round.
3. **Pack Tactics**: advantage on melee attacks when an ally is within 5 ft of the target.
4. Stay within 5 ft of the matron whenever possible — the Rite of Succession is the encounter's central pivot.

---

## Tactics

- **Default:** stay defensive, near the matron. Multiattack opportunistically.
- **If the matron drops:** call **Rite of Succession** (DM-narrated, not a DB action). The lieutenant takes the matron's stat block; combat continues with her as the new matron.
- **Reaction:** if an adjacent gnoll drops, `eat_the_fallen` for temp-HP + advantage on next attack.

---

## Description

A younger, leaner gnoll. Stands always near the matron. Sharp eyes, dark fur, simple leather armor and no trophies. Waiting for her first true kill.
