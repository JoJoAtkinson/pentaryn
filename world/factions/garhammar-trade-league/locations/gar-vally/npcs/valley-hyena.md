---
name: Valley Hyena
created: 2026-05-11
status: active
location: gar-vally
count: 3
tags: ["#combat-runner", "#beast", "#hyena", "#gar-vally", "#pack-animal", "#cr-1-8"]
---
# Valley Hyena

**HP** 5 (1d6+2) **·** **AC** 12 (natural) **·** **Speed** 50 ft. **·** **Saves** — **·** **Darkvision 60 ft.** **·** **CR** 1/8 (25 XP each)

> Pack-animal kin-hunters that fight alongside the gnolls. Default count is 3 so the segmented HP bar drains right-to-left as members fall. Pack Tactics apply when an ally is within 5 ft of the target.

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist (Haiku's responsibility, not in the DB)

1. Recount alive members (`alive_count`).
2. No reactions, no recharges. Simple pack.
3. Pack Tactics: advantage on attacks when an ally (gnoll OR hyena) is within 5 ft of the target.

---

## Tactics — when the DM asks "what does it do?"

- **Default:** close to melee, snap with bite, exploit Pack Tactics.
- **Wounded ally nearby:** stays near the gnoll line; doesn't break off.
- **Target spread out at range:** chase the closest target; hyenas have 50 ft speed.

---

## Description

A wild hyena with matted fur and gnoll clan-marks painted on its hide. Larger than a normal hyena. Eyes bright with hunger.
