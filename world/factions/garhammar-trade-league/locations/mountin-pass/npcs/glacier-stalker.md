---
name: Glacier Stalker
created: 2026-05-10
status: active
location: mountin-pass
tags: ["#combat-runner", "#beast", "#cold", "#ambush-predator", "#mountin-pass", "#cr-5"]
---
# Glacier Stalker

**HP** 84 (8d10+40) **·** **AC** 16 (natural) **·** **Speed** 50 ft., climb 40 ft. **·** **Saves** Str +7, Con +7 **·** **Cold immunity** **·** **Darkvision 90 ft.** **·** **CR** 5 (1,800 XP)

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist (Haiku's responsibility, not in the DB)

1. **Rime Reflex** refreshes to AVAILABLE.
2. If **Glacial Roar** is USED, roll a d6 (`roll_dice(1, 6)`) — recovers on 5 or 6.
3. **Snow Vanish** bonus action is available each turn.

---

## Tactics — when the DM asks "what does it do?"

- **Round 1, unseen:** Snow Vanish, then Pounce on the lowest-AC target next turn.
- **Mid-fight:** Multiattack the grappled or lowest-HP target. Use Glacial Roar only if **3+ PCs** are in a 30-ft cone.
- **Priority target far from melee** (DM names a backline wizard / healer 25+ ft away):
  - **Frozen Bile first** if the target is 30–60 ft away. Range 30/60, +5 to hit (auto-hits low-AC casters), no movement burned, no opportunity attacks from the front line. This is the safe answer.
  - **Pounce** only if there's a clear straight-line approach within the 50 ft speed AND the front line won't get a free swing on the way through. Pounce burns the whole turn into melee range — only worth it if you'll actually drop the target.
- **Below 25 HP:** Disengage upslope using climb speed (combined 50 + 40 ft. terrain), Snow Vanish to break line of sight, regroup.

## Description (one line)

A panther-sized predator armored in translucent crystalline plates along its spine; its breath fogs the air and frost creeps wherever it sets a paw.
