# Changelog — pentaryn-movement

## Unreleased (addon-blueprint migration, wave 2)

Code layout follows the blueprint (entry, core, settings, combat adapter, the `ghost` feature, API
manifest); the kit is vendored. What a player or GM can notice:

- **[declared] D-M2** — `game.pentaryn.movement` is a frozen, kit-built API published at `ready`
  (not one tick later), also as `game.modules.get("pentaryn-movement").api`, with `describe()`,
  `version`, `contract`, `settings()`, `trace()`, `uninstall()` and `selftest()`; it fires
  `pentaryn-movement.ready` and `pentaryn.ready`. Existing methods are unchanged.
- **[declared]** `status({ sceneId })` answers for any scene and appends `sceneId`, `version` and the
  settings key map after the historic keys.
- **[declared] D-M3** — the two hidden settings (`ghostPolicyLast`, `ghost`) have name/hint labels
  (never shown).
- **[declared]** errors in the `refreshToken` and `renderSceneControls` hooks are warned once per
  session instead of swallowed silently (console only).
- **[declared] D-M4** — the "ghost movement is available again" toast after the GM allows ghost
  during a fight reads "The GM allows ghost movement again" instead of "The fight is over" (F-M2).
- **[declared]** after a fight switched a player's ghost off, moving to another map while that fight
  still runs no longer toasts "The fight is over" (which used up the one-time toast); the toast now
  comes once, when the fight on the map it was cleared on really ends (movement-edge-1).
- **[declared]** a quick double click on the GM ghost button no longer toasts a mode that never takes
  effect: the clicks (and `setPolicy`) are applied one after another on that client, each flipping
  from the previous result, and the toast names the mode actually in effect (movement-async-1).
- **[declared]** `selftest()`'s "settings readable" check can fail now: it passes only when every
  setting is registered and reads back a value of its default's type, and its `detail` lists the
  keys that did not (rob-4).
- **[declared]** `pinsUnderTokens(scene)` also takes a scene id: it is looked up in the world's
  scenes, and an unknown id answers `[]` like no scene, instead of a raw TypeError (rob-1).
- **[declared]** `ghostFor(token)` also takes a TokenDocument (e.g. `canvas.scene.tokens.get(id)`) and
  answers like its placeable, instead of a silent `false`; the manifest param type reads
  "Token placeable | TokenDocument" (rob-2).
- **[declared]** `combatActive(scene)` and `status(opts)` take a scene id or a Scene document, and
  `status("sceneId")` takes a bare id, instead of answering for the wrong scene; `status().sceneId`
  is always the id string (rob-3).
- Performance: the per-token paths (drag, arrow keys, token refresh, the layer sort) read the
  settings and the combats once per change instead of once per token (F-M1).

## 0.1.2 — 2026-10-11

- After a fight (or the GM) switched a player's ghost off, a toast says once when it is allowed
  again (usability re-run, Area 8 L7).

## 0.1.1 — 2026-10-10

- dnd5e 6: verified that `Token5e#constrainMovementPath` still honours `ignoreTokens`
  (`findMovementPath` only adds waypoints); no code change to ghost.

## 0.1.0 — 2026-10-10

- Owned tokens drawn on top for their owner (client-side), ghost movement for players under a GM
  policy (Off / Exploration only / Always allowed) with a GM toolbar flip, and
  `pinsUnderTokens()` for the pin placement rule (table feedback 2026-10-08, plan C2).
