# Changelog — Pentaryn Senses (`pentaryn-senses`)

## Unreleased

- **[declared senses-edge-4, FIX-3 forward fix] normalise() works on a copy** (2026-10-13):
  Foundry's LightData cleans the object it is handed in place, so senses-edge-4's convergence
  check filled the shard item's own light flag with every LightData default; syncLight then wrote
  15 keys instead of the profile's 3, and their `animation: {type: null}` nulled the animation a
  doused torch left on the token (the live golden diff that reverted senses from main). The check
  now hands LightData a deep copy: the flag keeps its stored shape, the write is exactly the keys
  the profile sets, and edge-4's convergence is unchanged. Goldens unchanged. New
  `test/carried-normalise-shape.test.mjs`.

- **[declared senses-EXT-7] profileFor drift check** (final review 2026-10-12): `test/api.test.mjs`
  now fails if the `light.profileFor` row doc or the README light table stops naming every
  `LIGHT_PROFILES` key in `core/light.mjs`. Test-only; no runtime change, goldens unchanged.

- **[declared senses-R6] Five files log through the kit log** (final review 2026-10-12):
  chain, light and migrate use the entry's `ctx.log` once installed; light-ui and argon use
  `makeLog(MODULE)`. No hand-prefixed `console.*` call is left. Console text byte-identical
  ('pentaryn-senses | light <label>' and the rest); goldens unchanged. New `test/kit-log.test.mjs`.

- **[declared senses-M10] One Token HUD button builder** (final review 2026-10-12): chain.mjs
  and light-ui.mjs no longer each build their own HUD button. `core/hud-dom.mjs` now holds
  `rootOf`, `hudColumn` and `hudButton` beside `setTip` (the senses-edge-3 tip rule), and both
  files use them. Same buttons, same clicks, same warnings; hooks and describe goldens
  byte-identical. New `test/hud-dom.test.mjs`.

- **[declared senses-M9] light-ui is handed only the actions it calls** (final review
  2026-10-12): `install()` no longer binds `cast` into light-ui (the UI reaches a cast through
  onMe and pickAndCast), and light-ui.mjs's comment listing the bound actions matches. No
  behaviour change. New `test/light-ui-bind.test.mjs`.

- **[declared senses-M6] MODULE comes from one place** (final review 2026-10-12): the barrel
  imports `MODULE` from `core/ids.mjs`; the dead `export { MODULE }` re-exports in `core/light`,
  `core/chain` and `core/migrate` are gone (and `core/migrate`'s now-unused import). Same id, no
  behaviour change. New `test/core-module-reexport.test.mjs`.

- **[declared senses-M2] The Light reconcile is split into named steps** (final review
  2026-10-12): `reconcile()` is now resolveDesired → plan → restoreTokens → removeSquares →
  applyWanted → resyncCarried → remember, awaited in the same order as before. Same writes, same
  summary, goldens byte-identical (senses-ac-1 had already landed in de58b860, so this is its own
  change). New `test/light-reconcile-split.test.mjs`.

- **[declared senses-EXT-9] Hood tells a non-owner why nothing happened** (final review
  2026-10-12): one `ownerOrWarn(item)` guards cast, end, toggle and hood. Lowering the hood on
  someone else's hooded lantern now warns "Only {name}'s owner can do that." (was: silent), as the
  other three already did; same text, same `false`, nothing written. Hood on an item with no hood
  stays silent. New `test/light-owner-warn.test.mjs`.

- **[declared senses-ac-3] `setupLight` writes one batch per parent, not one update per torch**
  (final review 2026-10-12, = perf-4): it plans first (which torches lack the Light activity, and
  each one's sort), then world items go in one `Item.updateDocuments` and each actor's or unlinked
  token actor's torches in one `updateEmbeddedDocuments("Item")`. Same count returned; a failed
  batch warns `light setup <parent>` and its torches are not counted. The torch-on-create hook keeps
  its single-item write. `setup-light.json` and `second-gm.json` re-pinned; new
  `test/light-setup-batch.test.mjs`.

- **[declared senses-ac-2] End light on the Token HUD shows only to someone who can use it**
  (final review 2026-10-12): the button shows to the source item's owner or the active GM (was:
  any GM). A second GM looking at an orphan spell light (its item gone) now sees no button instead
  of one whose click did nothing; the active GM's click is unchanged. New
  `test/hud-orphan-gm.test.mjs`.

- **[declared senses-R5] A failed carried-light sync no longer skips the ready Light sweep**
  (final review 2026-10-12): on the active GM's ready, the carried sync now has its own catch and
  warns `carried sync`, then the Light sweep runs anyway (was: one bad Actor batch warned
  `ready sweep` and skipped the sweep). `test/glue-ready-errors.test.mjs` flipped to expect the
  `carried sync` warning and the sweep's Token writes.

- **[declared senses-EXT-11] `light.onMe` and `light.prompt` return false when On me can't cast**
  (final review 2026-10-12): with no scene viewed, or no token of the caster on the viewed scene,
  onMe still warns ("Open a scene first." / "Your token isn't on this scene. Use Pick a target.")
  and now returns false instead of the notification object, so `prompt` resolves boolean |
  undefined as its describe row says. Goldens: describe.json (onMe returns `Promise<boolean>`),
  light-onme.json (noScene, ilsaOnRoad values). New `test/light-prompt-return.test.mjs`.

- **[declared senses-M11] The `syncAll` describe row says it batches** (final review 2026-10-12):
  the row said "one after another", but since W3-SE3 syncAll writes one Actor batch for the
  prototypes, then one Token batch per scene. The row now says so. Goldens: describe.json (the
  syncAll doc). No runtime behaviour change.

- **[declared senses-EXT-6] `describe().flags.writes` lists `lightToggle`** (final review
  2026-10-12): setupLight writes `flags.pentaryn-senses.lightToggle` into the Light activity it adds
  to a torch, so the manifest now declares it as a write (it stays in `reads`). A new api.test check
  collects every pentaryn-senses flag key in the goldens' recorded write calls and fails on one the
  manifest leaves out. Goldens: describe.json (flags.writes). No runtime behaviour change.

- **[declared senses-R4] `inspect(ref, null)` and `resetSight(null)` act as if opts were omitted**
  (final review 2026-10-12): an explicit null (what the MCP bridge sends for JSON `opts: null`) no
  longer throws a TypeError; both functions read `opts` as `{}` when it is null or not an object,
  in step with the kit's KIT-R2 coercion. The describe()/README opts rows say `null = omitted`.
  Goldens: describe.json (the two opts docs). New `test/null-opts.test.mjs`.

- **[declared senses-edge-3] Button tips are plain text, set one way** (final review 2026-10-12):
  every senses button (Token HUD Break chain / Chain to <target> / End light, the spell card's
  Light row, the inventory flame and hood) sets its tip through `setTip()` in the new pure `core/hud-dom.mjs` (through the core barrel):
  the plain string goes to `data-tooltip-text` (Foundry 14 shows it as text) and to `aria-label`,
  and `data-tooltip` is no longer set. The Outshone tip no longer HTML-escapes the winning item's
  name (`&amp;` showed on screen and in the screen reader), and the Chain to <target> tip no longer
  puts the token's raw name where Foundry parses HTML. Goldens: `tooltip` becomes `tooltipText` in
  chain-hud, light-card, light-hostile, light-hud, light-sheet and player-sheet-card (values
  unchanged). New `test/hud-tips.test.mjs`.

- **[declared senses-edge-4] A hand-authored shard light is applied once, not on every sync** (final
  review 2026-10-12): the carried-light "already applied" check now compares the item's
  `flags.pentaryn-senses.light` as Foundry stores it (`new foundry.data.LightData(light).toObject()`:
  unknown keys dropped, colours lower-cased), on the profile's own keys only, so `#8844FF` or an
  unknown key no longer makes syncLight/syncAll rewrite and recount the token every time. The write
  still sends the raw profile; a profile LightData refuses is compared raw as before. Goldens
  unchanged. New `test/carried-normalise.test.mjs`.

- **[declared senses-R1] A token's own actor no longer cancels its base actor's carried-light sync**
  (final review 2026-10-12): the 250 ms carried-light debounce is keyed by `actor.uuid`, not
  `actor.id`, so an unlinked token's synthetic actor and its world actor each keep their own timer,
  and a pack actor is never scheduled. Each sync still targets exactly the actor scheduled (a
  synthetic never syncs, or writes, its base actor's prototype). Goldens unchanged. Re-lands the two
  schedule tests from 489d30a8 in `test/carried-edges.test.mjs` plus a pin that a synthetic-only
  schedule writes no `prototypeToken`.

- **[declared senses-EXT-4] Which light sources get a Light activity is one list** (final review
  2026-10-12): `setupLight()` and the torch-on-create hook now test membership in the frozen
  `ACTIVITY_PROFILES` list in `core/light.mjs` (today `["torch"]`, exported through the core barrel)
  instead of a hard-coded `"torch"`. Torches still get the activity; lamps, lanterns and candles
  still keep their own. README's "A light source" recipe says when to add a key. Goldens unchanged.
  New `test/activity-profiles.test.mjs`.

- **[declared senses-EXT-2] One table for the Light actions** (final review 2026-10-12): the prompt's
  buttons and the spell card's action row are now both built from the frozen `LIGHT_ACTIONS` table
  in `light-ui.mjs` (action, icon, label key, handler), so they keep the same labels, icons and order.
  The prompt keeps "Not now", the card keeps "End light". Nothing on screen changes; goldens unchanged.
  New `test/light-actions.test.mjs`.

- **[declared senses-ac-1] Two GM tabs, one Light square, one whisper** (final review 2026-10-12): the
  Light reconcile runs in every tab of the active GM (the MCP bridge and a browser). A square is now
  created with an `_id` fixed by its Light item and spot and `keepId`, and the other tab's refused
  create ("already exists") counts as created, so there is no twin square and a hand delete ends the
  light. The "Gone" whisper waits on a per-cast `claimDocument` (`claims.gone.<at>`), so the owners
  get it once. Square and old-summon deletes re-read what is still there and take "does not exist"
  as done. Goldens: the square create carries `_id` and `keepId`; the Gone path adds the claim write;
  `describe()` lists `flags.pentaryn-senses.claims` and the reconcile row's two-tab note.

- **[declared PT TF-2] A token that changes actor is re-synced** (play test 2026-10-12): carried's new
  `updateToken` hook schedules the token's new actor when `actorId` changes. Before, dnd5e's Wild
  Shape swap moved the token to the form actor, the druid's sync no longer found it, and the beast
  form kept Starry Form's starlight (or a lit torch) for the whole form. Hook manifest goldens,
  listener counts (updateToken 1 → 2, 34 → 35 registrations) and `describe()` hooks (32 → 33) follow.

## 0.5.0 — 2026-10-12 (blueprint migration, wave 3; released by the Wave 7 restart batch, wave 5)

Releases the wave-3 blueprint migration and overnight FX batch 2 (W3-SE4) together with the batch.
`module.json`: the blueprint keys (`tier`, `namespace`, `flagScope: "pentaryn-senses"`,
`cssPrefix: "ps-"`), `minimum: "14"` and `recommends: enhancedcombathud`; `version` 0.4.1 → 0.5.0
with `senses-core.mjs` `VERSION` (the `api.test` version pin follows).

- **[declared] A chain on a hidden anchor is GM-only** (W3-SE4, Joe 2026-10-12): `paint()` now
  hides a chain from non-GM viewers when either end is hidden, not just the chained token, so a
  player's screen never shows the hidden anchor's square. Pin flipped in `chain.test.mjs`.

- **[declared] `syncAll` batches its writes** (W3-SE3, 2026-10-12, performance): every prototype in
  one `Actor.updateDocuments`, then every token in one `updateEmbeddedDocuments` per scene (was one
  `actor.update` and one token batch per actor per scene). The same documents get the same values
  (test/carried-batch.test.mjs, 60 seeded worlds against the legacy plan); the ready goldens are
  unchanged. A failing prototype write now stops the whole sync before any token write (console:
  the `ready sweep` warning names that error).
- **[declared] `inspect` reaches the MCP bridge** (W3L, 2026-10-12): the manifest's `ref` gains
  `type: "Token|Actor|uuid|id|exact name"`, so `pentaryn-read {ns:"senses", path:"inspect", ref:<uuid>}`
  passes the string through (inspect resolves it itself) instead of refusing "eval-js only".
  describe() golden updated for that one key.
- **[declared] The API is kit-built** (S-1, S-2): frozen, with `describe()`/`version`/`contract`/
  `settings()`/`trace()`/`uninstall()`, also `game.modules.get("pentaryn-senses").api`;
  `game.pentaryn.senses.chain` is the same object as `game.pentaryn.chain`. `chain.uninstall` and
  `light.uninstall` are gone (reserved names); `game.pentaryn.senses.uninstall()` removes every hook.
- **[declared] The chain alias is published by the entry's ready, after senses** (S-3); chain no
  longer has its own ready listener.
- **[declared] Hot re-import goes through the entry** (S-4, dev only): no per-file sentinels; a
  re-import of `senses.mjs` into a ready world runs init and ready at once.
- **[declared] A frozen `game.pentaryn` now throws in ready** (J10, -34): nothing freezes it since
  the importer's keystone, so the rebuild guards are gone.
- **[declared] `inspect(ref)` and `light.status(item)`** (S-12, -25): read-only light state.
- **[declared] `light.reconcile()` resolves to a summary; `light.recent()`** (S-6, -14).
- **[declared] Break chain deletes the flag with `_del`** (S-5, -10).
- **[declared] A failed debounced carried-light sync warns with the module and actor** (S-7, -15).
- **[declared] `chain.link`/`break` accept Token uuids on any scene; `links(sceneId)`** (S-8, -26).
- **[declared] A torch created inside a compendium no longer gets the Light activity** (S-11, -38).
- **[declared] No prototype write on an unlinked token's synthetic actor** (S-13).
- **[declared] The broken glow's bright radius follows the wave back up** (S-14): it only ever shrank
  between token refreshes.
- **[declared] The broken glow's CONFIG label is an i18n key** (console only; the sheets show the
  same English).
- Faster: one scene walk for `syncAll` (-11); deletion hooks walk the spell lights once per burst
  (-13); `refreshToken` reads a cached pair list (-19); chain sprites are updated in place (-20);
  the glow keeps one epoch per light, LRU 64 (-22).
- Structure: entry + `carried`/`light`/`chain`/`glow`/`migrate` features, `light-ui.mjs`,
  `light-adapter.mjs`, `argon.mjs`; pure code under `core/` behind `senses-core.mjs`;
  `settings.mjs`; nested `lang/en.json` (`PENTARYN_SENSES.{Light,Chain,Glow}`); the Light design
  moved to `context/plans/senses-light-cantrip.md`.

## 0.4.1 — 2026-10-11

Usability re-run: the hood posts a chat line; an outshone flame is drawn dimmer and says why; Pick
a target closes Argon's open panels first; a torch created after `setupLight()` gets its Light
activity at once.

## 0.4.0 — dnd5e 6

Token vision is dnd5e's `senseVisionSync`; the one-shot darkvision sight reset replaces our sync.

## 0.3.0 — 2026-10-09

The Light cantrip (On me / Pick a target / End light) and lit torches, lamps, lanterns and candles.
