---
name: Gnoll Pack
created: 2026-05-10
status: active
location: mountin-pass
count: 3
tags: ["#combat-runner", "#humanoid", "#gnoll", "#pack", "#mountin-pass", "#cr-1-2"]
---
# Gnoll Pack

**HP** 22 (5d8) **·** **AC** 15 (hide armor + shield) **·** **Speed** 30 ft. **·** **Saves** Str +2, Con +0 **·** **Darkvision 60 ft.** **·** **CR** 1/2 (100 XP each)

> Three gnoll skirmishers travelling together. Each tracks its own HP — the segmented HP bar drains right-to-left as members fall. Multiattack auto-shrinks (drops 1 attack per dead member). Pack tactics apply when an ally is within 5 ft of the target.

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist (Haiku's responsibility, not in the DB)

1. Recount alive members (`alive_count`).
2. Multiattack ROLLS one (claw + bite) PAIR PER ALIVE MEMBER — runner shrinks the attacks list automatically as members fall.
3. No reactions, no recharges. Simple pack.

---

## Tactics — when the DM asks "what does it do?"

- **Surrounded / advantage:** use multiattack and try to bring an ally within 5 ft of an isolated PC (Pack Tactics: advantage on attacks when an ally is within 5 ft of the target).
- **Single PC down to ≤ 2 alive members:** stay in melee. Don't break off — gnolls fight to the death.
- **Spread out at range:** open with longbow_volley (the pack's only ranged option) until at least one closes to melee range.
- **An ally drops a PC** within reach: Rampage — that gnoll moves up to half its speed and makes one bite as a bonus action (DM, run this as a manual `+attack bite` if the moment arises).

---

## Description

Mottled-fur skirmishers in scavenged hide armor, painted with red ash. They hunt as a pack, shoulder-to-shoulder, snapping and chittering. Up close they reek of carrion and burnt resin.

Sound: a kind of half-laughing yip that rises to a shriek when an opponent falls. PCs who've fought gnolls before know to keep moving — a stationary target gets sandwiched.
