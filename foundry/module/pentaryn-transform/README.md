# pentaryn-transform

**Read this when:** a druid's Wild Shape or Starry Form misbehaves on the Argon HUD, a form is left
behind in the Actors sidebar, or you are changing or calling `pentaryn-transform`. **Not this file:**
the build record → [`context/plans/druid-wild-shape.md`](../../../context/plans/druid-wild-shape.md) ·
the 0.2 design (history) → [`context/plans/wildshape-hud-design.md`](../../../context/plans/wildshape-hud-design.md)
· how every addon is built → [`context/foundry/addon-blueprint.md`](../../../context/foundry/addon-blueprint.md)
· version notes → [`CHANGELOG.md`](CHANGELOG.md).

Wild Shape and Starry Form as one-click Argon HUD actions, and leaving any transformation as an
ordinary ability. Requires dnd5e 6 (verified 6.0.6) on Foundry v14.

## What the player sees

| State | Bonus bar | Action bar |
|---|---|---|
| Normal form | **Wild Shape** with a uses badge (greyed at 0) → a picker of the known forms; hover a tile for CR, AC, speeds, senses, attacks, traits; a click shifts at once. **Starry Form** beside it (Circle of the Stars). | unchanged |
| In a form | **Return to Talo** (his portrait, highlighted; the HUD's own button when the form has no revert item) and **Change Form** (same picker, one use) | every beast weapon and action monster feature (Bite, Claw, Multiattack) as front-row buttons; the weapon-set slot is hidden; the Reaction slot reads **Opportunity Attack** |

- A shift spends the use only when it happens (a failed shift refunds it). Each shift and revert
  posts one chat line instead of a dnd5e card — including a revert from the sheet, the sidebar or a
  macro. The sheet still works: Wild Shape → Use opens dnd5e's form dialog, then shifts at once.
- The form's token image is the same every time, never random and never the placeholder
  (wildcard-art, Joe's ruling): the beast's own token image; for wildcard token art (the Monster
  Manual Wolf, Cat), the first matching file in sorted order — for a world beast and a beast taken
  straight from the compendium alike; if none resolves, the beast's portrait. A player who may not
  browse files gets the image from the active GM (the `formImage` relay); with no GM online, the
  portrait.
- The portrait line reads `Wild Shape: Dire Wolf · 5 hours 59 minutes left`; the form's effect
  (`Wild Shape: Dire Wolf`) is larger, with a gold ring, and its tooltip has the time left.
  HP with temp HP reads `99+12 / 99`.
- The form ends by itself at 0 HP, when Incapacitated, when its time runs out, when its effect is
  deleted, and before a Long Rest (the druid then rests — after a revert already under way, or as
  they stand if the form was already gone). Short Rest in a form also gives the druid their one use
  back.
- Features that would spend Wild Shape uses or spell slots never come along into the form; item
  uses, Hit Dice, exhaustion, inspiration and conditions gained there come back on revert, and a
  Concentration broken in beast form ends on the druid too.
- A light set by hand on the druid's token comes back on revert (light-roundtrip, Joe's ruling):
  dnd5e rebuilds the token from the prototype, so the prototype's light used to return. A light
  pentaryn-senses put there (a torch, Starry Form, the Light cantrip) is not the token's own; the
  light senses replaced comes back instead, and senses relights the token if its source is still lit.
- **Starry Form:** one click on Archer, Chalice or Dragon spends the Wild Shape use, puts one effect
  on the druid (`Starry Form: Archer`, 10 minutes; the Dragon's carries the roll floors and, with
  Twinkling Constellations, Fly 20) and the starlight (Bright 10, Dim 10 more, through
  pentaryn-senses). With Twinkling Constellations a change is free. It ends after 10 minutes of
  combat time (out of combat it stays on and world time does not count, D8), when Incapacitated, at a
  Long Rest, or on a beast shift. While the Chalice glimmers, a slot-spending
  heal makes the Chalice button pulse for a minute, until it is used, the form ends or another
  constellation takes over. The pulse is a reminder on the casting player's own HUD (the client that
  cast the heal); it is not relayed to the GM or other players. From the sheet, Consume Wild Shape opens a
  three-button dialog; closing it refunds the use. A use spent from the HUD comes back if the form
  then fails to go up.
- **Escape** cancels Argon's target picker ("0/1 Targets"), else closes an open Wild Shape / Starry
  Form picker; with nothing open it still reaches core. The target picker is also cancelled when the
  HUD's token changes body.

## Settings

n/a for world or client settings. One keybinding: **Cancel the HUD's target picker** (`Escape`,
PRIORITY; Configure Controls). Reads dnd5e's Allow Polymorphing (a player shift needs it, and
`ACTOR_CREATE`); pentaryn-combat's Full Attack choice comes through its API (below).

## API — game.pentaryn.transform

Canonical: `game.modules.get("pentaryn-transform").api`; `game.pentaryn.transform` is the same
frozen object. Ask it: `game.pentaryn.transform.describe()` (offline: `test/golden/describe.json`).
The legacy methods take an Actor document (not a ref) and keep their old shapes.

| Method | Returns | null / false when | GM | Writes |
|---|---|---|---|---|
| `shift(actor, profileId)` | the new form | double-click; no Wild Shape; unknown profile; blocked (busy, no permission, incapacitated, 0 HP, no token on the viewed scene, no uses — each warns); the old form's revert failed; the transform did not happen (refunded) | — | yes |
| `revert(actor, { quiet, reason })` | the original | not transformed; a stale form; not the owner; already reverting; dnd5e returned nothing | — | yes |
| `forms(actor)` | `[{ id, name, uuid, actor }]` | `[]` without Wild Shape | — | — |
| `wildShapeActivity(actor)` | the activity | no Wild Shape | — | — |
| `original(actor)` | the actor a form was made from | a linked form whose original is gone | — | — |
| `isRevertItem(item)` | boolean | — | — | — |
| `sweepSpentForms()` | — | not the active GM | yes | yes |
| `formImage({ uuid })` | the token image a form of that beast gets | not an Actor; no image at all | — | — |
| `starry.assume(actor, "archer"\|"chalice"\|"dragon")` | boolean | shifted, incapacitated, no uses, no feature | — | yes |
| `starry.end(actor, { quiet, reason })` | boolean | no Starry Form up; already ending on this client | — | yes |
| `starry.active(actor)` / `starry.constellation(actor)` | the effect / the constellation | none up | — | — |
| `inspect(ref, opts)` | shape state, plain JSON | throws `NOT_FOUND` / `AMBIGUOUS` / `BAD_ARGS` | — | — |
| `selftest()` | `{ ok, checks }` | — | — | — |

`inspect(ref, { sceneId, base, as })` — `ref` is an Actor, Token, UUID, 16-character id or exact
name, never a substring. Shape: `{ actor, original, shifted, wildShapeForm, form: { name, profileId,
sourceUuid, endsAt, secondsLeft } | null, wildShape: { itemId, usesLeft, max } | null, starry: {
constellation, secondsLeft } | null, forms: [{ id, name }] }`. `opts.as` a user without OBSERVER on
the actor gets `{ actor }` only. A linked druid that is in a form answers for the form (the body that
is out): `inspect("Talo")` and `inspect(<the form>)` give the same read. Kit members: `describe()`, `version`, `contract`, `settings()`,
`trace()`, `uninstall()`.

`formImage` is also the module's one query, `pentaryn-transform.formImage` (a relay row: any sender,
the active GM answers; read-only). A player's shift asks it when the beast's token art is a wildcard
the player may not list (the wildcard is listed with a FilePicker browse, which needs `FILES_BROWSE`).

## Data written

| Where | Key | What |
|---|---|---|
| a form actor | `flags.pentaryn-transform.wildshape` | `{ original, source, profile, endsAt, carried }` — the sweep, the auto-revert, the HUD and `inspect` read it |
| the form's duration effect | `_id pentarynWildShp0`, `flags.pentaryn-transform.wildshape` | the timed effect Argon's portrait strip shows |
| an item | `flags.pentaryn-transform.revert`, `.keepInForm` | set by hand, never written by the module (`describe()` lists both under `flags.reads`): using a `revert` item reverts its actor; `keepInForm` keeps a feat in the form |
| the druid's Starry effect | `_id pentarynStarry00`, `flags.pentaryn-transform.starry.constellation`, `.left` | the constellation glimmering; seconds of combat time left (D8) |
| the Starry Form item | `flags.pentaryn-senses.light` | `STARRY_LIGHT` while the form lasts (pentaryn-senses lights the tokens) |
| form actors | created / deleted | dnd5e creates them; the active GM sweeps spent ones |
| the druid's token, on a shift | `flags.dnd5e.previousTokenData.light` | the token's own light (`handLight`), added to dnd5e's snapshot in the same swap write; dnd5e's revert merges it back (light-roundtrip) |

## Flags other modules read

- **pentaryn-senses** reads `flags.pentaryn-senses.light` on the Starry Form item through its
  carried-light path (`light-core.mjs` `lightEntries` / `carriedLightOf`): `{ bright, dim, color,
  alpha, luminosity, coloration, animation }`. Transform writes it (`starry-adapter.mjs` `setLight`)
  only while pentaryn-senses is active. A cross-module contract test is drafted for
  `scripts/tests/` (transform-creatures-21).
- **pentaryn-combat** → transform: the Action bar drops the text-only Multiattack when combat's Full
  Attack runs it (U-4-1), asking combat's published `coversMultiattack(actor)` (an item id or null);
  no combat setting is read. Without that method (combat off, not yet published, older) the button
  stays; a throw warns once.
- **pentaryn-combat's tooltips** use the `pentaryn-tt` classes too; both modules load the same kit
  `lib/argon-tooltip.css` (D7), so neither depends on the other for them.
- Transform reads dnd5e's `flags.dnd5e.originalActor`, `isPolymorphed`, `transformOptions`,
  `previousTokenData`, `previousActorData`, and adds `light` to `previousTokenData` on a shift.
- Transform reads pentaryn-senses' token flags `itemLight`, `itemLightPrior` and `spellLight.prior`
  on a shift, to tell the token's own light from a senses light (`core/wildshape.mjs` `handLight`).

## Events

n/a — transform emits no hooks (`HOOKS` is empty). It listens on dnd5e's use, transform, revert and
rest hooks, core document hooks and Argon's render hooks (`test/golden/hooks.json` pins the order).

## Patches and adjustments

| Row (`foundry/adjustments.yml`) | Where | What |
|---|---|---|
| `transform-preupdate-unwrap` | `patches.mjs` | wraps `TokenDocument._preUpdateOperation` (marker `pentarynUnwrapped`): a non-recursive token swap's scalar `ForcedReplacement` operators are unwrapped, so a form standing in a Region can revert |
| `core-token-swap-no-animation` | `bodyswap.mjs`, `wildshape-adapter.mjs` | a body swap never animates; tokens are settled before dnd5e reads them |
| `argon-panel-injection` | `hud-panels.mjs`, `form-picker.mjs` | the Bonus / Action / Special bars recomposed in `render*ArgonComponent` |
| `argon-target-picker-cancel` | `argon.mjs` | a right-button `mouseup` cancels Argon's private target picker |
| `argon-bonus-used-tracking` | `wildshape-adapter.mjs`, `hud-panels.mjs` | the bonus pip re-marked after the HUD rebinds |
| `argon-portrait-hp` | `hud-panels.mjs` | `99+12 / 99` instead of `111/99` |
| `argon-tooltip-clear` | `argon.mjs` | stale tooltips dropped |

## Two sessions / who writes

- A shift, Change Form, Return and the Starry buttons run on the clicking user's client, with that
  user's permissions (dnd5e refuses a non-owner's revert).
- The automatic endings (0 HP, Incapacitated, expiry, a carried effect ending) run on **one user**:
  the active GM, else the first active owner by id (`isRunner`, `claim-adapter.mjs`). Wild Shape and
  Starry Form share one Incapacitated / expiry listener pair and runner gate (`endingListeners`).
- Two sessions: every tab of that user (the MCP bridge tab plus a GM browser tab) passes `isRunner`,
  so each automatic write is then claimed per tab with the kit's `claimDocument`
  (`flags.pentaryn-transform.claims.<key>`, `claim-adapter.mjs`): the form (`revert`), the druid's
  copy of a carried effect (`end`), the Starry effect (`end`) and each spent form (`sweep`). Only the
  winning tab writes, ~750 ms after the trigger; a loser, or a claim refused because the document is
  already gone, stands down with a debug line; the winner clears its claim after the write. The
  Starry combat-time tick is not claimed (both tabs write the same value). [declared]
- The sweep of spent forms runs on the active GM's client (`activeGM.isSelf`), 3 s after a token
  is deleted or changes its actor, link, delta or `flags.dnd5e` (one timer, never pushed back; a drag,
  light, hidden or elevation change schedules nothing), 1.5 s after a form loses `isPolymorphed` (a player's
  revert), and 3 s after ready (or after a hot re-import past ready); it deletes transformed copies
  with no token on any scene that this GM tab first saw over 10 s ago (its own clock, not the
  server's `createdTime`, so a fast GM clock cannot sweep a form mid-swap). [declared] EC-6

## Extending

- A druid or form rule: the pure decision in `core/wildshape.mjs` (or `core/starry.mjs`) with a row
  in `test/core-legacy.mjs` or a node:test; the hook in `wildshape.mjs` / `starry.mjs`; the work on
  documents in `wildshape-adapter.mjs` / `starry-adapter.mjs`.
- A HUD element: a planner in `core/hud.mjs` (like `planBonusBar`), the component in
  `form-picker.mjs`, the composition in `hud-panels.mjs`. Argon's private state only through
  `argon.mjs`.
- An API method: a row in `api-manifest.mjs`, the implementation in `api.mjs` (or a feature's
  contribution, as Starry's rows are), then `GOLDEN_UPDATE=1 node --test test/api.test.mjs`.

## Pitfalls

- Call the API, not the files: `game.pentaryn.transform.starry.assume(actor, "archer")`, never
  `import("/modules/pentaryn-transform/starry.mjs")` (a feature file since the blueprint
  migration; it exports `install` only).
- Transform updates tokens on the **viewed** scene only (dnd5e), so a shift needs the druid's token
  there (refused otherwise). Revert also fixes tokens on other scenes.
- An unlinked token druid's form is its own original and keeps its own Wild Shape item.
  Its HUD Return button names and pictures the token as it was before the shift (dnd5e's
  `previousTokenData`), not the base actor every unlinked copy shares.
- The revert item is optional (without it the HUD adds its own Return button); if used, keep it a
  `feat` with one bonus-action utility activity, so the Wild Shape preset carries it onto the form.
- Two GM tabs (bridge + browser) both run the automatic endings and the sweep, but only the tab that
  wins the claim writes (Two sessions); a doubled ending chat line in the live phase is a bug.
- Starry Form counts combat time only (D8, Joe's ruling): the time left is
  `flags.pentaryn-transform.starry.left`, counted down by the runner for every druid in a started
  combat (linked or an unlinked token); the effect has no duration value and dnd5e's `isTemporary`
  flag, so Foundry's world clock never expires it. A form put on before D8 keeps the world-time timing.
- A Chrome tab that isn't visible runs no animation frames and drops synthetic clicks; size
  animations and clicks "that did nothing" there are the harness, not the module.
- Debug lines: `CONFIG.debug["pentaryn-transform"] = true` (the stripped-items list, swallowed
  failures).
- Open from the play test: Talo's Revivify is a `damage` activity (should be `heal`); Cosmic Omen
  has no HUD display; the rest chat line names the form.

## Files

| File | Role |
|---|---|
| `transform.mjs` | entry 0: the patch, then `bodyswap`, `wildshape`, `sweep`; publishes at ready |
| `hud.mjs` | entry 1: `starry`, then `hud-panels` |
| `wiring.mjs` | the one log / hook registry / ctx both entries share |
| `transform-core.mjs`, `core/*.mjs` | pure rules (wildshape, hud, starry, bodyswap) behind the barrel |
| `settings.mjs`, `patches.mjs` | the keybinding and outside settings reads; the core patch |
| `wildshape-adapter.mjs`, `form-image-adapter.mjs`, `sweep-adapter.mjs`, `starry-adapter.mjs`, `claim-adapter.mjs`, `argon.mjs` | adapters (documents, the form's token image and trait text, the runner and the one-tab claim, Argon) |
| `form-picker.mjs`, `starry-dialog.mjs` | UI: the Argon components; the constellation dialog |
| `bodyswap.mjs`, `wildshape.mjs`, `sweep.mjs`, `starry.mjs`, `hud-panels.mjs` | features: `install(reg, ctx)` / `uninstall()` |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `lib/` | vendored kit (`vendor.py`), never edited here |
| `styles/transform.css`, `lang/en.json` | `ptf-*` classes; strings |

## Tests

`node test/run.mjs` from this folder: every `test/*.test.mjs` (node:test, one process per file, the
kit's Foundry stub plus `test/fixtures/world.mjs`) and the legacy core suite `test/core-legacy.mjs`.
One file: `node --test test/api.test.mjs`; its goldens: `GOLDEN_UPDATE=1 node --test test/api.test.mjs`
(never the whole suite). `test/fixtures/legacy-*.mjs` are the checkpoint's verbatim oracles.

## Sync

`make foundry-transform-check`, then `make foundry-transform-sync` and reload the clients. A
`module.json` change needs a Foundry restart. Live smoke: `game.pentaryn.transform.describe().version`
equals `module.json`, `selftest().ok`, `inspect("Talo")` while shifted.
