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
2. **Reaction** refreshes to AVAILABLE: **Oath-Breaking Retaliation** (counter-attack on damage taken). OBR fires **immediately when the shrine-touched takes damage** (during the attacker's turn) — interrupts between attacks if the attacker has multiattack. Spent for the round until this checklist runs again.
3. **Driven Escape** bonus action available — 30 ft, no OAs, but must move toward the shrine if not in sight of combat.
4. **Unstable Form:** if shrine-touched took 10+ damage in a single turn last round, it has **advantage on all attacks** until end of its next turn. *(All incoming damage counts toward this threshold, including OBR self-damage — if OBR fired last round, add the 1d4 psychic self-damage to the total when checking.)*
5. **Shrine-Bound:** if more than 300 ft from the shrine: takes 2d6 psychic at start of turn; cannot leave the chamber.

---

## Altar Zone (within 60 ft of altar)

> **Fire & radiant vulnerability suppressed.** The shrine's ambient power insulates shrine-touched from the damage types that would otherwise exploit their instability. Fire and radiant damage deals *normal* damage (not doubled) while the derro is within 60 ft of the altar stone.
>
> Effect ends immediately if the shrine-touched moves more than 60 ft from the altar.
>
> *(Playtest note: this is the primary reason to keep shrine-touched near the altar — pull them away to re-expose the vulnerability. Marwen's Fireball and Sabriel's Divine Smite both lose their fire/radiant bonus in this zone.)*

## Tactics — when the DM asks "what does it do?"

- **2+ enemies in a 15-ft cone:** **Ancient Resonance** (Recharge 5–6) — DC 14 Dex, 2d10 necrotic (save halves), +1d4 psychic on fail only. **Stagger rule (multiple shrine-touched):** if two shrine-touched both have Resonance available in the same round, only the one acting FIRST in initiative fires — the second uses Multiattack instead and holds Resonance for the next round. Prevents both burning AR R1 and leaving R2+ Resonance-dry. ⚠️ **Stagger is evaluated at the START of the round** — check both STDs *before any actions resolve*; if both have AR recharged, mark the lower-initiative STD as "holding AR" now. Do NOT wait until the lower-initiative STD's turn to make this check. ⚠️ **Stagger hold persists even after the higher-init STD fires:** once the lower-init STD is marked "holding AR" at round start, that hold is permanent for the round — it does NOT lift if the higher-init STD clears its own AR-available flag by acting. Evaluate once at round start and lock it in. **Stagger exemption (low HP):** a shrine-touched below 20 HP uses Driven Escape priority (see below) and is NOT subject to the stagger hold — it fires AR recklessly if AR is available and 2+ targets are in cone. ⚠️ **AR threatens concentration:** any caster who takes damage from AR must succeed on a Con save (DC = 10 or half damage taken, whichever is higher) or lose a concentration spell — call this out at the table when a caster is in the cone.
- **Unstable Form priority:** if UF is active (see checklist item 4), PREFER Multiattack over Ancient Resonance when only 2 enemies are in cone — UF grants advantage on attack rolls, which is wasted on the save-based AR. If 3+ enemies are in cone, AR wins regardless.
- **All other turns / after firing AR:** Multiattack — two Shrine-Axe strikes (slashing + necrotic per hit) on the closest enemy.
- **Reaction priority — Oath-Breaking Retaliation:** auto-fires after taking damage from a visible attacker **within melee reach (5 ft)** — i.e. after ALL damage from that attack is applied (including Divine Smite or other added damage); one Shrine-Axe counter-swing at the attacker. Self-damages 1d4 psychic regardless. OBR does NOT fire against ranged attackers, ranged-spell attackers, or area-effect damage (Fireball, etc.) — the shrine-touched cannot swing at someone not in reach. OBR does NOT fire while the shrine-touched is incapacitated, stunned, paralyzed, or otherwise unable to take reactions. If the trigger is ambiguous (attacker just moved away), OBR does not fire.
- **Pulled away from shrine (~150+ ft):** panic. Uses Ancient Resonance recklessly each turn it recharges, ignoring positioning.
- **Below 20 HP:** uses **Driven Escape (bonus action)** to move toward the altar — no opportunity attacks, no retreat. Main action: AR recklessly if available and 2+ targets in cone (stagger hold does not apply); otherwise Multiattack on the nearest PC. Never retreats away from the shrine.

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
