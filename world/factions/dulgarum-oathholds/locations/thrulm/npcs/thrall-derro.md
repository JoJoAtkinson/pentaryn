---
name: Thrall Derro
description: "Partially dominated by the beholder; caught between master and oath"
created: 2026-04-26
status: active
location: thrulm
tags: ["#combat-runner", "#npc", "#combat", "#derro", "#thrulm", "#thrall", "#beholder-touched", "#cr-1-4"]
---
# Thrall Derro (Beholder-Dominated)

**HP** 22 (4d8+4) **·** **AC** 14 (cracked leather) **·** **Speed** 30 ft. **·** **No saves (dominated mind)** **·** **Resist** psychic **·** **Immune** charmed (already enslaved), frightened **·** **Darkvision 120 ft.** **·** **CR** 1/4 (50 XP)

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist

1. If the beholder is alive and visible to the thrall: it moves where the beholder points (`compel_thrall` direction or last command).
2. If beholder cannot see thrall this turn: thrall stumbles forward toward the nearest enemy on a straight line.
3. **Degrading:** if a PC tried to heal/aid this thrall last turn, it lost any temp HP and took 1 psychic damage at start of turn.

---

## Tactics — when the DM asks "what does it do?"

- **Default action: hand axe (weak).** Single melee swing — the domination is incomplete; no multiattack.
- **At range (10+ ft):** switch to **dagger** (throw or stab — same statline, range 20/60).
- **Ordered against another derro:** thrall makes DC 14 Wis save (Fractured Will). On a success it resists for one round and moves at half speed. On a fail it obeys and takes 2 (1d4) psychic.
- **No tactical sense:** doesn't seek cover, doesn't flank, doesn't flee unless beholder commands.
- **If beholder dies mid-combat:** thrall drops prone, gasps for breath, then becomes hostile to *anyone* near it (last-gasp rage); if not engaged, weeps and is non-threatening.

## Description (one line)

A derro who was — armor too loose for the withered body inside, glassy eyes that track only the beholder.

---

## Interaction Notes (non-combat)

- Cannot be reasoned with while the beholder lives.
- Speech is slurred, monotone, occasional. Only when commanded.
- Killing the thrall is mercy.
- If captured and beholder is alive: thrall will attempt to alert it or escape at first opportunity.
