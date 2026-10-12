# Changelog — Pentaryn AoE (`pentaryn-aoe`)

## Unreleased

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
