---
name: Aelric Frostweaver
created: 2026-05-10
status: active
location: mountin-pass
tags: ["#combat-runner", "#humanoid", "#wizard", "#cold", "#mountin-pass", "#cr-3", "#ally-of-glacier-stalker"]
---
# Aelric Frostweaver

**HP** 38 (7d8+7) **·** **AC** 12 (15 with Mage Armor) **·** **Speed** 30 ft. **·** **Saves** Int +6, Wis +4 **·** **Cold resistance** **·** **Darkvision 60 ft.** **·** **Passive Perception 12** **·** **CR** 3 (700 XP)

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist (Aelric's responsibility, not in the DB)

1. **Counterspell** reaction refreshes to AVAILABLE (one reaction per round).
2. **Shield** reaction refreshes to AVAILABLE (shares the reaction slot with Counterspell — only one per round).
3. If **Ice Storm** is USED, roll a d6 (`roll_dice(1, 6)`) — recovers on 5 or 6 (recharge 5–6).
4. **Misty Step** is available 3/day; track uses across turns.
5. **Mage Armor** is typically pre-cast before combat (AC starts at 15). If dispelled or dropped, recasting costs an Action.

---

## Tactics — when the DM asks "what does Aelric do?"

- **Round 1, ambush:** Mage Armor is already up. Stay 40-60 ft behind the Glacier Stalker. Open with **Ice Storm** if 2+ PCs are clustered; else **Frost Ray** on the wizard/healer.
- **Mid-fight:** Frost Ray every turn — single target, reliable 13ish cold damage at +6 to hit. Save Ice Storm for cluster opportunities.
- **PC casts a spell:** **Counterspell** if it's Healing Word / a buff / a save-or-suck control spell. Skip Counterspell on cantrips and low-damage spells (not worth burning the reaction).
- **PC enters Aelric's melee range** (5 ft.): **Misty Step** (bonus action) to teleport 30 ft. behind the Stalker. Then take a regular action.
- **Attacked and hit looks deadly** (AC was beaten by 5+): **Shield** reaction — +5 AC against this attack and any others until start of Aelric's next turn. Burns the reaction.
- **Below 15 HP:** Misty Step away from melee, use remaining turns on Frost Ray from distance. If party closes again, retreat via Misty Step → fly upslope on next turn (Aelric does not have flight — fall back to running, use Stalker as cover).
- **Synergy with Glacier Stalker:** Aelric stays back and softens targets with Frost Ray / Ice Storm; the Stalker tanks. When Stalker is bloodied, Aelric can drop concentration spells (he doesn't have any active — Ice Storm is instantaneous) and use a turn casting his Mage Armor again if it was dispelled. If the Stalker dies, Aelric immediately Misty Steps and tries to flee.

## Description (one line)

A gaunt man in frost-rimed robes, his eyes the same pale blue as glacier ice; his familiar — the Glacier Stalker — pads at his side like a hunting hound.
