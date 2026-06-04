---
name: Derro Rager
description: "Melee tank; draws aggro and absorbs punishment"
created: 2026-04-26
status: active
location: thrulm
tags: ["#combat-runner", "#npc", "#combat", "#derro", "#thrulm", "#melee", "#tank", "#cr-2"]
---
# Derro Rager (Melee Tank)

**HP** 52 (8d8+16) **·** **AC** 16 (half-plate) **·** **Speed** 30 ft. **·** **Saves** Str +4, Con +4 **·** **Resist** poison **·** **Immune** frightened **·** **Darkvision 120 ft.** **·** **CR** 2 (450 XP)

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist

1. If **Berserk** is USED, roll `roll_dice(1, 6)` — recovers on 5–6.
2. If rager took damage last turn: +1 to attack rolls this turn (Madness Endurance). **DM applies manually — roller output does NOT include this bonus; add +1 to each printed to-hit result.**
3. If a specific enemy hit the rager last turn: **next** attack against that enemy has advantage (Incoming Damage Aggro — the rager remembers).
4. **Taunt** bonus action is available each turn. **Slowed exception (FI-192):** if the rager is under Slow (or any effect that restricts it to 1 action OR 1 bonus action per turn), Taunt is unavailable — use the action for a single greataxe attack instead; the bonus action is forfeited. Berserk is also unavailable under Slow per MQ-63.
5. **If PRONE (FIX-SRR13-A):** the rager has two options — **(a)** stand up (spend half movement, then act normally — Berserk's no-movement prereq is violated if movement was spent, so choose Multiattack instead) or **(b)** stay prone and Berserk (all Berserk and Multiattack attack rolls are made at disadvantage while prone — DM applies manually; roller output does NOT adjust for prone). Tactically: if 2+ PCs are in reach, option (b) can still deal net damage despite disadvantage; if only 1 PC is in reach, standing up and Multiattacking is almost always better.

---

## Tactics — when the DM asks "what does it do?"

- **Round 1:** Charge the strongest-looking enemy in reach. Multiattack (two greataxe swings).
- **Always Taunt the squishiest visible non-engaged target** (caster or rogue) on the bonus action — DC 12 Cha or disadvantage attacking anyone but the rager. **Unconscious/dead target guard (MQ-NEW-2):** skip any unconscious or dead creature as a Taunt target — unconscious targets auto-fail saves but cannot make attack rolls, making the effect null; if all valid targets are unconscious or dead, Taunt is wasted — skip it entirely. **Tiebreaker:** prefer a target who is currently attacking the Shardcaller or ignoring the rager entirely. If the squishiest target is already focused on the rager, redirect Taunt to whoever is threatening the back line instead — Taunt that forces someone onto the rager is wasted if they were already attacking the rager. **Limitation:** Taunt's disadvantage only applies to attack rolls — it does NOT affect saving throw-based spells (Fireball, Shard Barrage). A wizard relying exclusively on save-based spells is functionally immune to Taunt. **Scorching Ray is NOT save-based — it uses attack rolls and IS affected by Taunt's disadvantage if the taunted caster targets a non-taunting creature (MQ-36).** **Multi-Taunt ruling:** if two ragers Taunt the same target simultaneously, the target has disadvantage only on attacks vs creatures that are NOT either rager — they may attack either taunting rager without penalty. **Rager-only formation corollary (FI-31):** when all living ragers taunt the same PC, MQ-5's "not either rager" exclusion covers every NPC in the encounter — the PC has no disadvantage on any attack. In rager-only encounters, split Taunt across multiple PCs (one rager per target) rather than stacking on the same caster. **Split-target drop redirect (SIM-SRR10-A):** if your assigned split-target goes unconscious or dies, redirect Taunt to any living PC not already taunted this round. If all living PCs are already taunted by other ragers this round, skip Taunt per MQ-NEW-2.
- **If 2+ enemies in reach:** consider **Berserk** (Recharge 5–6) — one greataxe vs *each* creature in reach; rager cannot move that turn, so only fire when already in the right spot. **DB output always shows 3 attack lines — DM caps at actual in-reach creature count and skips excess lines (e.g. 2 PCs in reach → use lines 1–2 only).** **Involuntary movement voids Berserk (MQ-35):** If the rager was pushed or pulled out of melee reach this turn (Thunderwave, Repelling Blast, Shove, etc.), it cannot Berserk — it would need to spend movement to close the gap, which violates the no-movement prerequisite. Move normally and Multiattack instead. **Triple-Berserk independence (MQ-47):** When multiple ragers attempt Berserk in the same round, each rager's eligibility is assessed independently at the start of its own turn — a sibling's movement or position does not affect another rager's Berserk validity. **Berserk while Slowed (MQ-63):** If the rager is under the Slow spell (or any effect limiting it to 1 attack per turn), Berserk's sweep is restricted to 1 attack against 1 target — the no-movement prereq still applies, but the Slow restriction supersedes the multi-target clause. **Berserk + Taunt same turn (DD-45):** use both — Berserk hits everyone in reach; for the Taunt bonus action, target whichever PC will deal the most threatening action next (the action-surging fighter, the spell-slot caster) rather than whoever you just Berserked. The Taunt disadvantage compounds with Berserk: the taunted PC attacks with disadvantage on their turn even after being hit. In solo-rager encounters with no allies to protect, Taunt whoever poses the greatest follow-up threat (highest remaining resources).
- **Marked attacker:** remembered until the rager hits them — focus that target on the next turn.
- **Below 15 HP:** does NOT retreat. Madness Endurance keeps it swinging until 0. Use Berserk if available.

## Description (one line)

Scarred, pain-fueled, half-plate dented from too many fights — eyes too white, breathing too fast.

---

## Position & Role

Front line, 5–10 ft from enemies. Tanks hits; the more it's hit, the harder it swings.
