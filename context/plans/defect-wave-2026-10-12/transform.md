---
title: "Defect wave 2026-10-12 — transform"
status: done
last_modified: 2026-10-12
---

# Defect wave 2026-10-12 — pentaryn-transform

**Read this when:** you need the history of the 2026-10-12 defect wave for pentaryn-transform — what was fixed, why, and how to check it live. History, not instructions; the use-doc is the module README.

Branch `fix/transform-2026-10-12`, off origin/main. Joe approved the wave on 2026-10-12 (~11:00 EDT): "take all of those, and if I don't mention it take recommendation". All changes are declared behaviour changes. No version bump; each fix has a line under the CHANGELOG's Unreleased header. Gate `make foundry-transform-check`: green at the final commit (280 tests, core 155, kit identical, conformance 49/49).

## Items

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| D8-starry | Starry Form ran down on world time, so it ended out of combat, and each combat tick rebuilt the Bonus bar and closed open pickers | Recommendation taken: count combat time only | Out of combat Starry Form stays on. In combat, each tick counts down from 600 s in the `starry.left` flag. A tick that only changes that flag no longer rebuilds the Bonus bar; turning the form on/off or changing constellation still does | 51c83a80, 47989f0e | test/starry.test.mjs, test/hud-bars.test.mjs (three 6 s ticks → 18 s counted, renders stay at 1) |
| ws-bonus-action | Play-test TF-1: HUD shifts should grey the Bonus Action pip and never block | Pip greys, nothing blocks | Nothing — already true on this base (`markBonusUsed` in doShift, returnToNormal and Starry; no code blocks on a spent Bonus Action) | none | none (a test could not fail on today's code) |
| wildcard-art | A player shifting into a beast with wildcard token art got the mystery-man placeholder ("Invalid Asset"), or a random image | Recommendation taken | The form always gets the first sorted matching image. Players without file-browse ask the GM via the new `formImage` query; if nothing matches or no GM is online, the beast's portrait is used | 82d56858 | test/wildcard-art.test.mjs |
| light-roundtrip | A light set on the druid's token by hand was lost on return from Wild Shape (the prototype light came back) | Recommendation taken | The shift saves the token's own light into dnd5e's snapshot, so it comes back on return. If a torch, Starry Form or Light cantrip lit it, the light from before that comes back, and pentaryn-senses relights it if the source is still on | 99f46611 | test/light-roundtrip.test.mjs |
| EC-1 | Uses spent or regained in beast form were not carried back when the feature's max uses is a formula (e.g. the Wild Shape scale) | Recommendation taken | A formula max now counts as a limit, so those uses carry back on revert | a10ce992 | test/formula-uses.test.mjs |
| R2-refund | Picking a constellation on the HUD spent the Wild Shape use even when the Starry Form failed to go up | Recommendation taken | If the form does not appear, the use is refunded. If the form appeared and only the light failed, the use stays spent | a2142ab1 | test/starry.test.mjs |
| starry-double-end | Starry Form ending twice at once (expiry plus Incapacitated or Long Rest) deleted twice and warned | Recommendation taken | One ending per druid at a time: removed once, one chat message, no warning | 72479386 | test/starry.test.mjs (deferred delete: [true,false]) |

## Goldens changed

- `test/golden/starry-effect-archer.json` — D8-starry (`starry.left: 600`, `dnd5e.isTemporary`, `duration.value: null`, new Ends text).
- `test/golden/console-texts.json` — D8-starry, wildcard-art, light-roundtrip (new debug/warn lines).
- `test/golden/describe.json` — wildcard-art (formImage row), light-roundtrip (hook row, shift sideEffect, flags), starry-double-end (starry.end returns text).
- `test/golden/surface.json` — wildcard-art (formImage).
- `test/golden/hooks.json` — light-roundtrip (preUpdateToken row, 39 → 40).
- `core-exports.json` unchanged (new core exports go through core.test.mjs's ADDED list).

Shipped non-code files: `lang/en.json` (Starry "Ends" text) and `module.json` (description only, no version change) — D8-starry.

## Live check after deploy

Use only ZZ-prefixed scratch actors and scenes (e.g. a scene `ZZ Transform Check`, a druid `ZZ Druid` with Wild Shape and Starry Form, a player-owned copy `ZZ Druid (player)`). Never Caven, Marrith, Talo or campaign scenes. Restart the world first (module.json and lang changed).

- **D8-starry**
  1. Out of combat, put ZZ Druid in Starry Form; advance world time 15 minutes; the effect is still on and `flags.pentaryn-transform.starry.left` is unchanged.
  2. Start a combat on ZZ Transform Check, open the Wild Shape picker, advance a round; `starry.left` drops by 6 and the picker stays open.
- **ws-bonus-action**
  1. In combat on ZZ Druid's turn, use Wild Shape from the HUD; the Bonus Action pip greys out.
  2. With the Bonus Action already spent, use Return; it still works.
- **wildcard-art**
  1. As a player (not GM, no file browse) owning ZZ Druid (player), Wild Shape into the MM Wolf; the token shows the first sorted wolf image, not mystery-man, and no "Invalid Asset" toast.
  2. Repeat with no GM online; the token shows the wolf's portrait.
  3. From the console, `await game.pentaryn.transform.formImage({uuid: <MM Wolf uuid>})` returns one image path.
- **light-roundtrip**
  1. Set a hand light (e.g. dim 10, bright 5) on ZZ Druid's token; Wild Shape and Return; the token has that light again (check linked and an unlinked ZZ token).
  2. Light a torch via pentaryn-senses, Wild Shape, put the torch out, Return; the token has its pre-torch light.
- **EC-1**
  1. With ZZ Druid's Wild Shape max set to the scale formula, Wild Shape, spend one more use in form, Return; the druid's Wild Shape spent count includes that use.
- **R2-refund**
  1. Hard to force live; confirm via console only: note Wild Shape uses, pick a constellation on ZZ Druid's HUD; the use is spent exactly once and the form is on (no refund when it succeeds).
- **starry-double-end**
  1. In combat, put ZZ Druid in Starry Form with `starry.left` set to 6, then on the next tick also apply Incapacitated; the effect is gone, one chat message, no warning in the console.
