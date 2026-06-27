---
fire: 81
date: 2026-06-27
slice: antireality-timing
id: antireality-precision
severity: observe
---

# Antireality × Battlemaster Precision Attack — Positive Interaction Log

**Not a bug. Logging as a positive design note.**

## Mechanics confirmed

Antireality is declared the moment Bazgar announces his attack, before any dice are
rolled (post-R224 timing fix). Bazgar then rolls 2d20 under disadvantage. Result:

- P(Antireality flips hit→miss): 55% × 45% × 2 = 49.5% of uses (one die hits, one
  misses; lower = miss)
- P(wasted — both dice hit): 30.25%
- P(no change — both dice miss): 20.25%

Simulated 3 rounds (6 attacks, AR on attack 1 each round):
- Flipped: 2/3 (rounds 1, 3)
- Wasted: 1/3 (round 2 — both [16,11] hit anyway)
- Net HP saved: ~16 (2 hits × avg 8 longsword)

## Positive interaction: Precision Attack

Bazgar is Battlemaster 5. After rolling the disadvantaged result and seeing a miss,
he can spend a Superiority Die (d8) and add it to the lower roll's total. Sequence:

1. Bazgar announces attack
2. Beholder declares Antireality (pre-roll — correct per R224)
3. Bazgar rolls 2d20 under disadvantage
4. Bazgar sees lower result (e.g., [14, 7] → 7+7=14 → miss)
5. **Bazgar can now use Precision Attack:** 14 + 1d8 (avg 4.5) → ~18.5 → probable HIT

This creates a recurring high-value use case for superiority dice that doesn't exist
against most other monsters. Antireality turns Precision Attack from "situational
accuracy recovery" into "the primary counter to the beholder's best reaction."

At Battlemaster 5 the party has 4 superiority dice. If Bazgar burns one per round to
counter Antireality, he can sustain 4 rounds before running dry. After that, Antireality
regains full value.

**Table feel:** This will generate a memorable moment the first time Bazgar counter-plays
Antireality — experienced players will recognize the interaction immediately.

## Antireality wasted by Unstable Ground

If the lair action Unstable Ground knocks Bazgar prone before his turn, Bazgar is
ALREADY rolling at disadvantage on melee attacks (prone attacker rule). Using Antireality
on his next attack adds nothing — disadvantage doesn't stack. DM should avoid using
Unstable Ground on Bazgar's turn if planning to use Antireality that round.

The reverse is also true: if Bazgar is knocked prone, the beholder should NOT use
Antireality — save the reaction for a non-disadvantaged attacker (e.g., Sabriel).

This is a meaningful DM choice: Unstable Ground + save Antireality for Sabriel, OR
skip lair action + use Antireality on Bazgar. Neither is wrong; the decision creates
texture.

## Recommendation

No change needed. The interaction is working as intended.
Consider adding a DM tip to the cheat sheet: "Don't waste Antireality on a prone
attacker — their first attack is already disadvantaged."
