---
name: Ancestor-Stir
created: 2026-05-11
status: active
location: gar-vally
tags: ["#combat-runner", "#undead", "#gnoll", "#gar-vally", "#secret", "#cr-4"]
---
# Ancestor-Stir

**HP** 52 (8d10+16) **·** **AC** 15 (ghostly resilience) **·** **Speed** 40 ft., fly 40 ft. (hover) **·** **Saves** Wis +4 **·** **Poison immunity** **·** **Truesight 120 ft.** **·** **CR** 4 (1,100 XP)

> Only manifests if the party PREVENTS the Rite of Succession. The trapped chorus of generations of matrons, given vengeful form. Resistant to cold/lightning/thunder + nonmagical bludgeoning/piercing/slashing. Immune to most physical conditions (charmed, exhaustion, frightened, grappled, paralyzed, petrified, poisoned, prone, restrained).

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist (Haiku's responsibility, not in the DB)

1. Reaction refreshes (Incorporeal Escape).
2. **Wail** recharge: if USED, roll a d6 — back to AVAILABLE on 5 or 6.
3. **Lunar Fury**: if night/moonlight, +2 to-hit AND +1d6 damage per attack (DM tracks).
4. **Ancient Sorrow** (round-1 only): every living gnoll within 60 ft of the manifestation must make DC 14 Wis save vs `frightened` for 1 min. Apply via `@frightened 10` on the affected NPC tabs.

---

## Tactics

- **Round 1:** trigger Ancient Sorrow on all gnolls in line of sight. Then `multiattack` with claws OR `wail` if 3+ PCs within 20 ft.
- **Mid-fight:** prefer `wail` if recharge available AND multiple targets clustered. Otherwise multiattack.
- **Reaction:** when hit, fire `incorporeal_escape` to reposition through walls / creatures.
- **No retreat:** fights to destruction.

---

## Description

The matron's corpse shudders. A terrible sound, like wind through a canyon of bones. A shape rises — incorporeal, hyena-shaped, too large, too many eyes, fur of shadow. Its howl carries the voices of generations.
