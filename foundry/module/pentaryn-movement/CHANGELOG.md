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
