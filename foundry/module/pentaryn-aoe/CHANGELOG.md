# Changelog — Pentaryn AoE (`pentaryn-aoe`)

## Unreleased

- **A handle is found however its attachment is stored** (declared, aoe-mnt-7): `handleFor` read
  the region's attached token by hand and missed a bare token id on the live region, falling back
  to the region flag. It now reads it through `core.attachedTokenId`, which handles the live
  document and the source string alike; the flag fallback stays. Pinned by
  `test/areas.test.mjs`.
- **No-stacking looks up fewer spells** (declared, aoe-perf-2): with `noSpellStacking` on, every
  new effect looked up the source spell of every effect already on the actor before discarding
  the ones with another name or switched off. It now drops those first and looks up only enabled
  effects of the same name; what gets replaced is unchanged. Pinned by
  `test/stacking-filter.test.mjs`.
- **The settings migration logs through the kit log** (declared, R8): its one line was a raw
  `console.info`, the only console call in `settings.mjs`. It now goes through
  `makeLog(MODULE).info`; the console line is byte-identical (`pentaryn-aoe | npcSaveRollMode
  gmroll → gm`, still pinned by `test/glue.test.mjs`). Pinned by `test/settings-log.test.mjs`.
- **The tray's multiplier labels live beside the multipliers** (declared, EXT-3): the ×0 ×¼ ×½ ×1
  ×2 labels were a separate table in `tray.mjs`, so a multiplier added to `core.MULTIPLIERS` would
  have rendered an "undefined" option. They are now `core.MULTIPLIER_LABELS` (frozen, keyed by
  `MULTIPLIERS`) and the tray imports them. The tray's HTML is unchanged. Pinned by
  `test/multiplier-labels.test.mjs`, which checks every multiplier has a label.
- **The sweep makes a scene's missing handles in one go** (declared, AC-7): it created each
  missing area handle with its own Token create and its own Region update — two round trips per
  template region. It now creates every missing handle in one Token create (keepId) and attaches
  them all in one Region update. If another GM tab made one of them first, the rest are created one
  by one (that "already exists" refusal swallowed per id) and every handle is still attached.
  `golden/ready-calls.json`'s attachment write is now one `updateEmbedded`. Pinned by
  `test/sweep-batch.test.mjs`.
- **Changing the area is no longer undone by a save landing at the same moment** (declared,
  AC-6): `resolve()` wrote the new area's resolution straight to the damage message, outside the
  per-message write queue, so a write already running on the old area (an NPC save, a row change)
  could land after it and bring the old area's rows back. The fresh write now waits its turn in the
  same queue. Pinned by `test/resolve-queue.test.mjs`.
- **The area picker says why it does nothing on a second GM tab** (declared, aoe-edge-8): on a GM
  tab that is not the active GM, picking another area on the tray did nothing, yet the select kept
  showing the new choice. That tab now gets a warning toast (new string
  `PENTARYN_AOE.Tray.NotActiveGm`, "Only the active GM can change the area.") and the select goes
  back to the area the tray still uses. The tray keeps rendering on every GM tab. README API row
  says so.
- **A bad multiplier no longer lands on a tray row** (declared, aoe-edge-7): `setRow` turned a
  null or blank multiplier into ×0 and `'abc'` into NaN. A multiplier that is not one of the
  tray's (0, 0.25, 0.5, 1, 2) now leaves the row unchanged (tick included), logs
  `pentaryn-aoe | setRow multiplier` at warn and returns null. The tray's select only sends valid
  values, so nothing changes at the table. README API row and the manifest's `nullWhen` say so.
- **Two GM tabs no longer log or abort on each other's deletes** (declared, aoe-edge-4): with the
  MCP bridge tab and a GM browser tab both open, the losing tab's delete of a handle, of a
  concentration spell's areas or of a sweep's orphan handles was refused "does not exist", logged
  at error level, and stopped the job (the next scene's areas, the rest of the sweep). That
  refusal now counts as done: nothing is logged and the job carries on. The sweep's
  `orphansDeleted` counts only what this tab deleted. README "Two sessions" says so.
- **Careful Spell is always a declaration; the picker names only creatures the player can see**
  (declared, MM-1; Joe's metamagic ruling 2026-10-12): skipping the pick (Skip, or closing the
  picker) or having nobody to pick used to store and post nothing, so the use left no card and an
  older choice stayed armed. Now the public card posts with nobody chosen (new string
  `PENTARYN_AOE.Careful.CardNobody`), the empty choice replaces the earlier one, and the next save
  tray uses it up with nobody protected (the GM shields rows by hand). A player's picker leaves out
  tokens out of their sight on their canvas, as well as hidden ones. `Careful.PickCancel` became
  `Careful.PickSkip`; `Careful.Nobody` is gone.
- **A publish throw at ready no longer skips the rest of ready** (declared, R7): on the normal
  ready path a `publishNamespace` throw (e.g. a frozen `game.pentaryn`) is caught and logged
  `pentaryn-aoe | publish`; the Argon guard, the settings migration and the startup sweep still
  run. The hot-patch `install()` still rejects with it (glue.test W2-K1).
- **A save with no DC is neither a pass nor a fail** (declared, R5): with a null DC a monster save
  came out a success (`total >= null`) and a player save a failure (`!!null`). One
  `Number.isFinite(res.dc)` guard (`saveSuccess`) now serves `rollOne` and `onSaveMessage`; the
  save is recorded with `success: null`, `fillSave` keeps that null and the multiplier '?', so
  Apply skips the row until the GM sets it. The tray shows the total with a '?' (new string
  `PENTARYN_AOE.Tray.NoDcTip`); `summary()` reports `success: null`. README Part B says so.
- **One monster save that fails to roll no longer throws away the rest** (declared, R4): a
  rejecting `rollSavingThrow` threw out of `rollNpcSaves`, discarding every save already rolled in
  that pass, and `resolve()` then skipped the player request card and `autoApplyNpc`. Each row is
  now caught on its own (`log.warn("npcSave", row name, err)`), the saves that landed are written,
  the request card and auto-apply still run, and the failed row stays '—' for a re-roll. README
  API row says so.
- **`selfApply` accepts a message id** (declared, R2-selfApply): the manifest and describe already
  said `ChatMessage|id`, but an id string was used as the card itself and nothing was applied.
  It now looks the id up first, as `cardEffects` and `pendingFor` do; an unknown id returns null.
  README API row says so.
- **`latestResolution({ sceneId: "current" })` answers null when this client views no scene**
  (declared, R3): it dropped the scene filter and returned the newest tray from any scene.
  "current" means the viewing client's scene; with none there is none. A caller that wants any
  scene passes no `sceneId`. Manifest `nullWhen` and README say so.
- **Two GM tabs no longer fight over player saves or double-apply a tray** (declared, AC-1): with
  the MCP bridge tab and a GM browser tab both active, each matched a player's save into the tray
  from its own copy (a stale tab could undo an Apply or a GM edit), and Apply in both tabs damaged
  the same rows twice. A save that answers a waiting row is now claimed
  (`claimMessage(save, "matchSave")`) and only the winning tab fills the row (the row fills about
  0.75 s after the roll); `applyRows` re-reads the live resolution before each row's damage, skips
  a row another tab already applied, and marks each landed row applied at once. README "Two
  sessions" says so. Live check: two GM tabs, a player answers the Fireball request, the row fills
  once; press Apply in both tabs, each goblin takes damage once.
- **A newly viewed scene is swept even after a failed startup or a GM handover** (declared,
  aoe-edge-3): the `canvasReady` sweep (orphan handles deleted, missing handles made, ownership
  fixed) was registered only after `readyAreas`' awaits succeeded, and only on the GM active at
  ready. `areas.install()` now registers it at setup on every client, gated inside on
  `activeGM.isSelf`; `readyAreas` keeps the handle actor and the first sweep. A hot
  `install({ sweepOnReady: false })` now wires the scene sweep too (it still skips the startup
  sweep). Live check: with a second GM tab active first, close it, switch scenes in the remaining
  GM tab, and a stray handle token on the new scene is removed.
- **A superseded or partly applied tray keeps its area** (declared, aoe-edge-2): the tray's area
  picker re-resolved any tray, so picking another area on a superseded tray revived it, and on a
  tray with applied rows reset them — the same damage could then be applied twice. The picker is
  now disabled (tooltip `PENTARYN_AOE.Tray.AreaLocked`) once the tray is superseded or any row is
  applied, and `resolve(message, { regionId })` on such a tray returns null with that warning toast
  and leaves it untouched. A fresh tray still switches areas freely. Live check: Fireball with two
  areas on the scene, Apply one goblin, the picker is greyed out; a newer Fireball roll greys out
  the older tray's picker too.
- **The API's flags contract names everything aoe touches outside its own scope** (declared,
  EXT-1): `describe().flags.writes` adds `flags.dnd5e.lockSize` (handle tokens) and
  `flags.dnd5e.requestResult` (save rolls threaded under the request card); `flags.reads` adds
  `flags.core.MeasuredTemplate` (5.3.3 template regions). README "Data written" has the two rows.
  Metadata only — no in-game behaviour changes.
- **A cancelled cast that spent nothing but began concentration is cleaned up** (declared,
  aoe-mnt-1): the refund's veto and the refund itself disagreed — the veto stopped dnd5e's
  follow-ups, then the refund did nothing, leaving the concentration and the card. Both now share
  one predicate (spent something OR began concentration); dnd5e's `Activity#refund` runs only when
  something was spent, and the concentration this cast began and its usage card always go (toast
  `PENTARYN_AOE.Refund.Ended`). A no-spend cast with only a non-concentration effect is no longer
  vetoed. Live check: an at-will concentration area spell (no slot or charge), Escape while placing —
  concentration ends and the card disappears.
- **Careful Spell: the player picks who it protects** (declared, aoe-careful-select; Joe's
  metamagic ruling 2026-10-12, supersedes metamagic-disarm): using Careful Spell opens a picker of
  the creatures on the caster's scene (token names, current targets ticked, up to CHA mod, min 1)
  and posts a public card `<caster token> uses Careful Spell: <token names>`. The caster's next save tray
  protects exactly those rows and the declaration ends; a non-save spell leaves it armed, no time
  window, a second use replaces it. Gone: the "caster's side" inference (`carefulTargets`), the bind
  to the next cast, and the `deleteCombat` clean-up. New: a per-row shield toggle on the GM tray
  (`setRow(…, { protected })`; unprotected, a row gets its own save back, or a monster rolls one).
  Live check: a sorcerer uses Careful Spell, picks one goblin and one ally, casts Shield, then
  Fireball — the card names both, the tray shows both protected, the next Fireball protects nobody.
- **The tray's buttons fit the chat sidebar** (declared, play test AO-1 / tray-overflow,
  2026-10-12): Re-roll NPC saves, Ping and Apply were squeezed into one row at a fixed 24 px, so at
  the default sidebar width a label broke onto a second line and spilled out of its button. The
  row now wraps a whole button onto the next line and a button grows with its label (`aoe.css`,
  own `.pentaryn-aoe-tray` rules only). Live check: GM tab, default sidebar width, a Fireball
  tray — every label sits inside its button, on one line; widen the sidebar and the three share
  one row again.
- **Careful Spell ends after the next spell** (declared, play test AO-1 / metamagic-disarm,
  2026-10-12; Joe's ruling: metamagic ends after use): out of combat a used Careful Spell stayed
  armed for 10 minutes and protected whichever save spell came next. The caster's next spell cast
  now takes it (bound to that usage card, `postUseActivity`), in or out of combat, with no time
  window; a non-save spell spends it, a placement cancelled before it lands does not.

- **A handle drag keeps the area's direction** (declared, play test AO-3, 2026-10-12): handle moves
  are made with `autoRotate: false` (`preMoveToken`). Core's `tokenAutoRotate` turned the dragged
  handle to face its path, and the attached region turned with it (a cone aimed south-east swung
  north). Row `core-token-auto-rotate-handle`.
- **Two quick Apply clicks damage each row once** (declared, review aoe-edge-1, 2026-10-12):
  `applyRows` calls for one tray are serialised in the tab, so the second skips the rows the first
  applied (each row used to take the damage twice). A rejection still reaches its caller; an Apply
  stuck for 10 s (`APPLY_WAIT_MS`) no longer holds later ones back.
- **A failed row no longer re-damages the others on retry** (declared, review R1, 2026-10-12): when
  one row's `applyDamage` rejected, the rows already damaged in that Apply were never marked applied,
  so the next Apply damaged them again. Each row is now caught on its own: the rest still land and
  are marked applied, a warning toast names the rows that failed, and the first error still rejects.

## 0.4.0 — 2026-10-12 (migrated to the addon blueprint, wave 4; released by the Wave 7 restart batch)

The Wave 7 batch bumped `module.json` and `core.VERSION` to 0.4.0 together and added the
`flags.pentaryn` blueprint keys (`flagScope` `aoe` → `pentaryn-aoe`, a declaration fix),
`recommends` enhancedcombathud and item-piles, `styles/aoe.css` (moved) and `verified: "14.369"`.

Code, tests and the API changed; the table behaviour did not, except the declared
items below (each its own commit; live checks in the migration guide §5).

- **Blueprint layout.** Kit 1.0.2 vendored (full tier + election, patch). Features export
  `install(reg, ctx)` / `uninstall()` and are wired from `FEATURES` in the entry; hooks go through
  the kit registry (aoe's guard kept verbatim as `guardSwallowAsync`); `claimMessage` is the kit's.
  Adapters `scene-adapter.mjs`, `messages-adapter.mjs`, `argon.mjs`; Careful Spell is its own
  feature, `careful.mjs`. Settings are one `SETTINGS` table; `lang/en.json` is nested and every key
  is a full `_loc` literal. One kit log for every console line (same text).
- **API** (declared D-A3, W2-K1): built from `api-manifest.mjs`, frozen, published synchronously at
  `ready` through `publishNamespace` (module.api canonical, `game.pentaryn.aoe` the alias, the
  `pentaryn-aoe.ready` / `pentaryn.ready` events). Every 0.3.1 method keeps its name, parameters
  and return shape; new reads `resolution`, `latestResolution`, `summary`, `isHandle`, `inspect`;
  kit members `describe`, `settings`, `trace`, `version`, `contract`. `pendingFor` takes an optional
  `{ effects }`.
- **Hot patch** (declared D-A2, D-A4, D-A7): `uninstall()` now restores `ui.ARGON.bind` and
  `RegionLayer#placeRegions` and removes the late-Argon `canvasReady` fallback, so a hot-patched
  copy aims Self cones again.
- **Two GM sessions** (declared D-A6, -7): the "Area handle" actor is created with the fixed id
  `pentarynAoeHndl0` and `keepId`. v14 does not refuse a world actor whose id exists: the later
  create replaces it with the same data (a second `createActor`), so one actor results.
- **Performance**: one `game.actors` scan per resolve instead of one per token (-2); one effects
  fetch per fresh card render (-14); the sweep shares template regions in one batched write and the
  Careful clean-up batches its actor writes (declared, C59); mutate's queue map drops settled
  entries (declared, -6).
- **Logging**: `CONFIG.debug["pentaryn-aoe"]` traces why the save pipeline stopped (-8); the tray
  and eraser listeners, the delete backstop, the Careful bind and refund's clean-up log instead of
  swallowing (-9; the refund one declared).
- **Failure path** (declared D-A1): a resolution without damages applies nothing instead of
  throwing.

## 0.3.1 — 2026-10-11 (usability re-run)

Part F refund, Part G aim, Careful Spell, same-usage superseding, the players' status line,
untargeted touch spells on the caster, no same-spell stacking, Careful clean-up on `deleteCombat`.

## 0.3.0 — dnd5e 6

Typed chat messages, region templates, the PRIORITY Escape binding, two-session claims.
