# Defect wave 2026-10-12 — pentaryn-combat

**Read this when** you need the history of the 2026-10-12 defect wave for the combat module
(`foundry/module/pentaryn-combat`): what was fixed, why, and how to check it live. History, not
instructions.

Branch `fix/combat-2026-10-12`, approved by Joe on 2026-10-12 (~11:00 EDT): "take all of those,
and if I don't mention it take recommendation". Source records:
[`final-review-2026-10-12/combat-hud.md`](../final-review-2026-10-12/combat-hud.md) (edge-1,
edge-2) and [`final-review-2026-10-12/combat-core.md`](../final-review-2026-10-12/combat-core.md)
(EC-5, EC-6). Every item was verified (holds = true); nothing was reverted.

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| edge-1 | An Opportunity Attack through the Reaction slot greyed the pip but never wrote `flags.pentaryn-combat.reaction`, so re-opening the HUD relit it and `inspect().reaction` missed it. | Recommendation: write the flag after a used OA in combat. | A used OA in combat now saves the Reaction as spent (same flag as Shield/Counterspell); it stays grey on re-open and comes back at the start of the creature's turn. Out of combat nothing is written. No new hook. README reactionSlot row updated. | `837af68b` | `turnflow.test.mjs` "edge-1: an Opportunity Attack through the Reaction slot records flags.pentaryn-combat.reaction (on and off your turn)" |
| edge-2 | Any token on the scene changing actorId (Wild Shape, revert) aborted the running Full Attack / follow-up. | Recommendation: compare against the running creature's own token. | The sequence remembers its creature's token ids when it starts; only those tokens changing body abort it. | `f5ecba42` | `hud.test.mjs` "other triggers: …" — new edge-2 assertion (another token's shape change does not abort) |
| EC-6 | With setting "Full Attack for Multiattack" Off, Full Attack was still sized from the Multiattack (wolf got 2). README promised Off = Multiattack card only. | Recommendation: honour the setting. | With the setting Off, Full Attack counts only class features (Extra Attack 2, Two Extra Attacks 3, Three Extra Attacks 4, Thirsting Blade 2 with a pact weapon); a creature without them gets 1. All countFor callers pass the setting. README settings row, lang Hint and api-manifest `count` doc updated. | `4e6148f1` | `api.test.mjs` "EC-6: Multiattack Off sizes Full Attack from class features, not the Multiattack (wolf 1, Extra Attack 2)" |
| EC-5 | `riderDice(frenzy, null/''/0)` gave `0d6`: the card showed "+ Frenzy 0d6" and Auto spent the once-per-turn Frenzy for nothing. | "no positive count = no rider, no spend" | Frenzy dice = Rage Damage bonus in d6s (2d6/3d6/4d6). With no positive bonus there is no Frenzy button, no Auto dice and no spend. No Barbarian-level fallback (the stock activity rolls from the same scale). README Attack card row updated. | `854ef619` | `core.test.mjs` "EC-5: Frenzy's dice are its Rage Damage bonus in d6s; no positive bonus is no dice, never 0d6"; `riders.test.mjs` "EC-5: a Frenzy with no Rage Damage bonus is no rider — no button, no auto dice, no spend" |

## Goldens changed

- `foundry/module/pentaryn-combat/test/golden/describe.json` — one row, the `count` API doc
  (EC-6): now "…a Multiattack's total while setting multiattack is on…". No other golden changed.

## Gate

`make foundry-combat-check` green after every commit; final run: 257 tests pass, 326 core
fixtures pass, vendored kit identical, conformance 96 % (accepted exceptions C21, C23
unchanged). The log prints a stub-only `ready` error ("Cannot add property combat, object is not
extensible", from `lib/publish.mjs` aliasing into the test stub); neither file was touched by
this wave and the gate exits 0.

No version bump; the module CHANGELOG has no "Unreleased" header, so no line was added.

## Live check after deploy

Use only ZZ-prefixed scratch actors and a ZZ-prefixed scratch scene. Never Caven, Marrith, Talo
or a campaign scene. Delete the scratch documents afterwards.

- **edge-1**
  1. On scene `ZZ Combat Wave`, create `ZZ OA Fighter` (PC with a weapon) and `ZZ OA Target`; start combat with both, `ZZ OA Target` active.
  2. From `ZZ OA Fighter`'s HUD Reaction bar, make an Opportunity Attack with the weapon. Check `actor.getFlag("pentaryn-combat","reaction")` is `{ combatId: <this combat> }` and the pip stays grey after closing and re-opening the HUD.
  3. Advance to `ZZ OA Fighter`'s turn: the flag clears and the Reaction pip is lit again.
- **edge-2**
  1. Same scene: give `ZZ FA Fighter` Extra Attack, start a Full Attack against `ZZ OA Target`, and leave it mid-sequence.
  2. Change another token's actorId (e.g. Wild Shape `ZZ Druid` into a beast): `pentaryn.combat` `running()` still has `abort === false` and the Full Attack continues.
  3. Change `ZZ FA Fighter`'s own token actorId: the running sequence aborts.
- **EC-6**
  1. Turn the "Full Attack for Multiattack" setting Off. Create `ZZ Wolf` (NPC with a Multiattack feature, no Extra Attack) and `ZZ EA Fighter` (Fighter 5 with Extra Attack).
  2. `api.count(ZZ Wolf)` / `api.plan(ZZ Wolf).swings.length` are 1; for `ZZ EA Fighter` they are 2. The HUD Full Attack tile matches.
  3. Turn the setting back On: `ZZ Wolf` returns to its Multiattack total.
- **EC-5**
  1. Create `ZZ Berserker` (Barbarian 9, Path of the Berserker, raging) and attack `ZZ OA Target`: the attack card offers "+ Frenzy 3d6".
  2. Create `ZZ Frenzy NoScale` with a Frenzy feature but no Rage Damage scale: the card shows no Frenzy button, and with the Frenzy rider on Auto no dice are added and Frenzy is not marked spent for the turn.
