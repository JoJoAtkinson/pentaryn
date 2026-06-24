# Testbot decision — thrall-derro saving throw contradiction

- **Run timestamp:** `20260624T000000`
- **Fire:** #256
- **Phase:** A (mechanical regression)
- **Result:** FLAGGED (no auto-fix)

## What was found

`world/factions/dulgarum-oathholds/locations/thrulm/npcs/thrall-derro.md` contains a direct
mechanical contradiction:

**Stat block line:**
> Saving Throws | None; dominated mind has no saves

**Fractured Will trait:**
> When the derro is forced to act against its original oath (e.g., told to attack other derro),
> it makes a **DC 14 Wisdom saving throw**.

These cannot both be true. A creature cannot have "no saves" and simultaneously make a DC 14
Wisdom saving throw.

## Why not auto-fixed

The resolution requires a design decision:

**Option A:** The "no saves" wording is intentional flavour — the thrall is completely dominated
and has no agency. In this case, remove the DC 14 Wis save from Fractured Will entirely and
replace it with an automatic effect (e.g., "it takes 2d4 psychic damage and cannot attack its
own kind this turn").

**Option B:** Fractured Will is intentionally an exception to the domination — the remnants of
the original oath fight through even a dominated mind. In this case, the saving throw line should
read "Saving Throws — none (Wis modifier only for Fractured Will)" and the trait should specify
the roll is unmodified (Wis –1 or +0 without proficiency).

Option B is more mechanically interesting (moments of the original personality fighting through)
but both are valid. Neither is a simple arithmetic fix.

## Recommended action for Joe

Decide which interpretation is correct, then:
- **Option A:** Delete `DC 14 Wisdom saving throw` from Fractured Will; replace with automatic damage/restriction.
- **Option B:** Change saving throw line from `None; dominated mind has no saves` to `Wis –1 (no proficiency, Fractured Will only)`.

Next fire will re-flag this if not resolved.
