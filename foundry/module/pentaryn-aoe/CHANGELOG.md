# Changelog — Pentaryn AoE (`pentaryn-aoe`)

## Unreleased

- **A handle drag keeps the area's direction** (declared, play test AO-3, 2026-10-12): handle moves
  are made with `autoRotate: false` (`preMoveToken`). Core's `tokenAutoRotate` turned the dragged
  handle to face its path, and the attached region turned with it (a cone aimed south-east swung
  north). Row `core-token-auto-rotate-handle`.

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
