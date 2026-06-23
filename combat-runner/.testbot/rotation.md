# Thrulm Playtest Rotation

Each hourly fire picks one slice using `date.day % len(slices)`.
Add new slices at the bottom; never reorder (that would scramble the rotation).

---

## Slices

0. **Round 1 Opening Volley** — Beholder acts first (initiative 20+). Simulate: lair action → bonus action Shrine-Drift → multiattack (2× Tentacle Lash + Maw) → legendary actions vs all three PCs. Track HP. Look for action-economy dominance and grapple-snowball risk.

1. **Drain Divinity Economy Check** — Simulate a round where the beholder spends all 3 legendary actions on Drain Divinity vs Sabriel (Paladin). Compare temp HP gained vs damage forgone from 1 Tentacle + 1 Void Ray alternative. Flag if the trade is clearly suboptimal.

2. **Disintegration Ray Perma-Death Scenario** — Beholder recharges Disintegration Ray, targets Marwen (32 HP wizard). Simulate hit and no-hit. Note: zero-HP = permanent death (no revival except true resurrection/wish). Evaluate feel at level 5.

3. **Grapple Lock Simulation** — Beholder opens by grappling Bazgar with two tentacles. Track escape attempts (STR Athletics vs DC 16) over 3 rounds. Look for: impossible escape odds, interaction with Maw rider, how grappled status interacts with prone.

4. **Void Scream Area Coverage** — Beholder uses Void Scream (recharge 6). Three PCs at different distances. Simulate DC 16 Wis saves at average (+1/+2/+4 WIS mod). Check: does 6d10 psychic reliably drop the wizard in one hit? Is half-damage meaningful for anyone?

5. **Thrall Derro Swarm Round** — 3 thrall derro act under Compel Thrall. Simulate their combined output vs Marwen (weakest target). Check: is thrall damage trivial (as intended for minions) or surprisingly threatening at low AC 15?

6. **Shrine-Touched + Beholder Tag-Team** — Shrine-touched derro uses Ancient Resonance (2d10 necrotic cone) while beholder uses Void Ray on the same target. Stack damage and check if combined output leaves any recovery window for the party.

7. **Legendary Resistance Trigger** — Simulate a round where Marwen casts a save-based spell (e.g. Hold Person DC 14). Beholder fails the save, uses Legendary Resistance. Log: how many LR uses does the party realistically force before the beholder runs out? (3 total)

8. **Antireality Reaction Economy** — PC makes attack vs beholder AC 17. Beholder uses Antireality (imposes **disadvantage** on the triggering attack roll — pre-roll, fires on `action_executed` event per R224 fix; NOT "+2 AC"). Evaluate whether halving the hit-rate on one attack per round meaningfully changes outcomes. Is this a feel-good reaction or a dominant one?

9. **Retreat Sequence** — Beholder drops below 30 HP. Simulate tactical retreat using Shrine-Drift + thrall screen. Does the movement math let it escape? Can the party pursue a hovering, phasing creature?
