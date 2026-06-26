---
name: Derro Rager
description: "Melee tank; draws aggro and absorbs punishment"
type: creature
tags: ["#npc", "#combat", "#combat-runner", "#derro", "#thrulm", "#melee", "#tank"]
status: active
created: 2026-04-26
last-modified: 2026-04-26
---

# Derro Rager (Melee Tank)

**HP** 52 (8d8+16) **·** **AC** 16 (half-plate) **·** **Speed** 30 ft. **·** **Saves** Str +4, Con +4 **·** Resist: poison **·** **CR** 2

> Action mechanics in `combat-runner/actions.jsonl`.

## Start-of-turn checklist

1. If **Berserk** USED, roll 1d6 — recovers on **5–6**.
2. **Bonus action Taunt** available every turn (no recharge).
3. If rager took damage last turn, it has +1 to attacks until end of this turn (Madness Endurance).

---

A derro pumped with madness-born strength. They charge into combat, soak hits meant for others, and punish anyone who ignores them. They fight with pure fury and pain-driven endurance.

---

## Combat Stats

| **AC** | **HP** | **Speed** |
|--------|--------|-----------|
| 16 (half-plate) | 52 (8d8 + 16) | 30 ft. |

| **STR** | **DEX** | **CON** | **INT** | **WIS** | **CHA** |
|---------|---------|---------|---------|---------|----------|
| 15 (+2) | 11 (+0) | 14 (+2) | 8 (-1) | 10 (+0) | 9 (-1) |

| **Saving Throws** | Str +4, Con +4 |
| **Skills** | Athletics +4 |
| **Damage Resistances** | poison |
| **Condition Immunities** | frightened |
| **Senses** | darkvision 120 ft., passive Perception 10 |
| **Languages** | Dwarvish, Undercommon |
| **Challenge** | 2 (450 XP) |

---

## Traits

**Madness Endurance.** When it takes damage, it gains +1 to attack rolls until the end of its next turn (pain fuels it).

**Incoming Damage Aggro.** When the rager takes damage from an enemy it can see, the next attack the rager makes against that enemy has advantage. It *remembers* who hit it.

---

## Actions

**Multiattack.** Two attacks with Greataxe.

**Greataxe.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 8 (1d12 + 2) slashing damage.

**Berserk (Recharge 5–6).** The rager makes one Greataxe attack against each creature it can reach. It cannot move on this turn.

---

## Bonus Actions

**Taunt.** The rager targets one creature it can see within 30 feet. That creature makes a DC 12 Charisma save or has disadvantage on attack rolls against targets other than the rager until the end of its next turn.

---

## Tactics

- **Charges in immediately** — gets to the strongest-looking enemy
- **Stays in melee** — rarely backs up
- **Marks the attacker** — goes after whoever just hit it hardest
- **Uses Taunt** — forces a target to either hit it or suffer disadvantage
- **Won't leave combat** — fights until it dies or drops

---

## Position & Role

**Where:** Front line, 5-10 feet from enemies  
**Goal:** Tank hits, keep enemies from getting past it  
**If hit:** Gets angrier, hits back harder, taunts the attacker

---

## Loot

- 12 gp
- Half-plate (worth 600 gp, but heavy and bulky)

---

## Related Links

- [Thrulm Location](../_overview.md)
