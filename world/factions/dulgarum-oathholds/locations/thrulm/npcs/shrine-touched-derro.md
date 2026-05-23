---
name: Shrine-Touched Derro
description: "Infused with power from the sealed shrine; dangerous and unstable"
created: 2026-04-26
status: active
location: thrulm
tags: ["#combat-runner", "#npc", "#combat", "#derro", "#thrulm", "#shrine-touched", "#magic", "#cr-3"]
---
# Shrine-Touched Derro (Blessed/Cursed)

**HP** 45 (7d8+14) **·** **AC** 16 (hardened skin) **·** **Speed** 30 ft. (+10 ft. within 60 ft of altar) **·** **Saves** Dex +5, Con +5 **·** **Resist** necrotic, psychic **·** **Immune** charmed, frightened **·** **Darkvision 120 ft.** **·** **Vulnerable** fire, radiant (suppressed within 60 ft of altar — see Altar Zone below) **·** **CR** 3 (700 XP)

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist

1. If **Ancient Resonance** is USED, roll `roll_dice(1, 6)` — recovers on 5–6.
2. **Reaction** refreshes to AVAILABLE: **Oath-Breaking Retaliation** (counter-attack on damage taken).
3. **Driven Escape** bonus action available — 30 ft, no OAs, but must move toward the shrine if not in sight of combat.
4. **Unstable Form:** if shrine-touched took 10+ damage in a single turn last round, it has **advantage on all attacks** until end of its next turn.
5. **Shrine-Bound:** if more than 300 ft from the shrine: takes 2d6 psychic at start of turn; cannot leave the chamber.

---

## Altar Zone (within 60 ft of altar)

> **Fire & radiant vulnerability suppressed.** The shrine's ambient power insulates shrine-touched from the damage types that would otherwise exploit their instability. Fire and radiant damage deals *normal* damage (not doubled) while the derro is within 60 ft of the altar stone.
>
> Effect ends immediately if the shrine-touched moves more than 60 ft from the altar.
>
> *(Playtest note: this is the primary reason to keep shrine-touched near the altar — pull them away to re-expose the vulnerability. Marwen's Fireball and Sabriel's Divine Smite both lose their fire/radiant bonus in this zone.)*

## Tactics — when the DM asks "what does it do?"

- **Round 1, near altar:** Multiattack — two Shrine-Axe strikes (slashing + necrotic per hit) on the closest enemy.
- **2+ enemies in a 15-ft cone:** **Ancient Resonance** (Recharge 5–6) — DC 14 Dex, 2d10 necrotic, +1d4 psychic on fail.
- **Reaction priority — Oath-Breaking Retaliation:** auto-fires when hit; one Shrine-Axe counter-swing at the attacker. Self-damages 1d4 psychic regardless.
- **Pulled away from shrine (~150+ ft):** panic. Uses Ancient Resonance recklessly each turn it recharges, ignoring positioning.
- **Below 20 HP:** drives toward the altar (Driven Escape) — never retreats away from the shrine.

## Description (one line)

Skin glowing faintly with shifting runes, eyes empty, voice fragmenting into a discordant hum — looks slightly out of phase with the world.

---

## Variant flavor (multiple shrine-touched in one fight)

- One hums at a different frequency.
- One's runes glow a different color.
- One is *fighting* the transformation — pleads in panicked dwarvish before the shrine's will reasserts.

---

## Interaction Notes (non-combat)

- Cannot be reasoned with; the dwarf is gone.
- Sanctified dwarven weapons hit it with advantage; running water disrupts its connection (disadvantage on saves while immersed).
- Cannot be turned or dominated — the shrine's will overrides.
