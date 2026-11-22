# Changelog — pentaryn-movement

## 0.4.0 — 2026-11-21

Group movement and click to stop (plan `context/plans/pathfinding-2026-11.md` §12, deviations §13;
use-doc `context/foundry/movement.md`).

- **[declared] Several tokens dragged together each walk their own route to their own spot.**
  `Token#_prepareDragLeftDropUpdates` is wrapped (row `movement-group-drop`, marker
  `__pentarynMovementGroup`). Core's `[updates, options]` come back first; for two to twelve
  contexts the pure planner (`group-core.mjs`) keeps the formation where it fits, otherwise packs
  rest slots round the grabbed token (hex lattice out of combat, whole cells in combat; through a
  narrow gap in file order, so nobody passes anybody), routes each member with the pathfinder's new
  `routeTo` (through dnd5e's constrain), and staggers starts (150 ms steps up to 3 s, then a lateral
  re-route round resting members, then "go last", then relaxed) so no two circles come within
  r1 + r2 (+ 0.25 square across waves) while moving or r1 + r2 at rest. Wave 0 is the drop's own
  update; later waves are timers on this client, one batched update per 150 ms, each dropped for a
  member that moved meanwhile. A plan past 30 ms finishes in timer slices (the drop returns no
  updates, the same shape is committed later); past 1 s, a throw, or no route for the grabbed token
  means core's own drop. Ghost and the GM's unconstrained tool keep core's straight lines (a rest
  overlap is nudged).
- **[declared] Click a moving token to stop it.** `Token#_onClickLeft` is wrapped (row
  `movement-click-stop`, marker `__pentarynMovementStop`): select tool, no modifier, a token you
  control that is pending, paused or animating. Out of combat it is displaced to where it is drawn
  (`animate: false`); in a started combat the initiating client calls `stopMovement()` and another
  client asks the active GM through the new relay query `pentaryn-movement.stop` (400 ms). Stopping
  a member of a group this client sent stops the group and cancels its unsent waves.
- **[declared] In combat drops get a checkpoint at every cell** (kept only at the same measured cost)
  and found paths no arcs, so a stop lands on a cell and dnd5e records exactly what was walked.
- **[declared] Followers are not pathfound while a group is dragged** (only the grabbed token); the
  drop plan replaces their previews.
- Pathfinding: fillets are tessellated to chords within 0.05 square (at most 8 points a corner, 64 a
  route); `fieldFor` takes `avoid` circles; `pathfind.route` runs on the new `routeTo`.
- Settings: `groupMovement` (world, on) and `clickToStop` (client, on). API: `planGroup(refs, point)`
  (dry run), `stop(ref)` (relay row), `status().group` (appended key: the regime, the last drop, the
  recent fallback reasons); selftest checks both wraps. Listens to two more `setup` (once) hooks.
  Adjustments rows `movement-group-drop`, `movement-click-stop`, `core-movement-group-drag-internals`.
- Table review (UX and robustness), before release:
  - The grabbed token walks the route its drag preview showed (its pathfound drag path is reused
    as its group route), instead of a fresh search at the drop that could differ or stall.
  - One route call during group planning is capped below the per-member budget (`routeTo` takes
    `maxMs`), so a very long or impossible route excludes that member instead of freezing the drop
    for up to 1.5 s and then dropping the whole group to core.
  - A group stays one group until its last member should be at rest (not only until its last wave
    is sent), and a one-wave group (ghost, unconstrained, all at once) is a group too: a click on
    any member stops them all, as the plan says.
  - A newer drop of a token by this client wins over its older pending wave or slow plan; waves and
    slow-plan commits go to the drop's own scene, also after the GM switches the view mid-move.
  - Followers keep their own pathfinding during a group drag core will commit anyway (Ctrl-click
    waypoints, a direct or planned move), as in 0.3.0; before, they stopped at the first wall.
  - In combat a planned (API) move keeps its own waypoints (no cell checkpoints inserted).
  - A refused or failed stop-in-place puts the token back where the server has it, instead of
    leaving it frozen at the click point on this client.
- Files: `motion-core.mjs`, `group-core.mjs` (pure), `group-adapter.mjs`, `group.mjs`, `stop.mjs`.
  Tests: `group-core.test` (the plan's twelve unit acceptance tests and the decision tables),
  `group.test` (the two wraps). Not yet play-tested live (the plan's live list).

## 0.3.0 — 2026-11-21

Drag pathfinding (plan `context/plans/pathfinding-2026-11.md`).

- **[declared] A drag past a wall goes around it.** `Token#findMovementPath` is wrapped (Token5e,
  so the chain is pentaryn → dnd5e → core; adjustments row `movement-pathfind-find-path`, marker
  `__pentarynMovementPath`). A drag whose plain path already reaches every waypoint is returned as
  core made it. Otherwise each blocked leg is searched with 8-connected A* (5 ft a step, Chebyshev
  heuristic, Euclidean tie-break), string-pulled without raising the cost, and the corners are
  spliced in as non-explicit waypoints; the expanded list runs through dnd5e and core again, and is
  kept only when it reaches more waypoints than the plain drag.
- Walls through `Token#checkCollision` on every square a token covers (a 2×2 token must fit); doors
  and one-way walls as core sees them; in a player's preview only walls they have seen count. No
  diagonal squeezes between two walls meeting at a corner. Creatures through dnd5e's
  `isOccupiedGridSpaceBlocking` (row `dnd5e-movement-pathfind-blocking`); cost through
  `Token#measureMovementPath` (plus `createTerrainMovementPath` when a region has terrain effects).
- **Rounded corners:** each corner becomes a circular arc tangent to both legs (≤ 2 squares, halved
  until it is clear and costs no more than the sharp corner), as unsnapped non-explicit waypoints.
- Skipped for ghost and the GM's unconstrained tool (`ignoreWalls`), on gridless and hex scenes, and
  for keyboard movement. A search past one 8 ms slice continues in timer slices (core's searching
  animation shows); capped at 6000 nodes / 1.5 s.
- Three settings: `pathfinding` (world: everyone / gm / off, default everyone), `pathfindMine` and
  `smoothCorners` (client, default on). `status().settings` lists them (appended keys).
- API: `pathfind.status()` and `pathfind.route(ref, { to, preview?, smooth? })` (read-only); selftest
  checks the wrap. Listens to 15 more hooks (wall, region, behaviour and token changes,
  `controlToken`, `canvasReady`, a second `setup`): each drops the step cache, and `canvasReady`
  also watches the scene's fog "explored" event, which drops it too. The cache is keyed per moving
  token, since creature blocking and creature difficult terrain depend on who moves, and expires
  2 s after it was built (its age, not idle time, so a long drag still sees visibility change).

## 0.2.0 — 2026-11-07

Ghost movement for incorporeal creatures during a fight (player feedback `nwhjz2`, triage
`context/plans/feedback-triage-2026-11.md` I1; review 2026-11-07: feats only).

- **Incorporeal creatures keep ghosting through a fight.** Under *Exploration only*, a token whose
  actor has a **feat** named *Incorporeal Passage*, *Incorporeal Movement* or *Ethereal…* (the Summon
  Undead spirit, a ghost) still passes through walls and creatures while a combat runs on the scene.
  Feats only: a PC with the *Etherealness* **spell** is not incorporeal. Only movement passes; walls
  still block light and sight.
- **GM override per creature.** Token HUD (right column, GM only) → the ghost toggle sets
  `flags.pentaryn-movement.ghostInCombat` on the token's actor (an unlinked summon keeps it on that
  token); pressed when the creature may ghost, and a feat-granted one is shown pressed with the feat
  named. Same from the console or the bridge: `setGhost(creature, { combat: true|false })` (an Actor,
  Token, uuid, id or exact name; a refusal object for NOT_GM / NOT_FOUND / AMBIGUOUS / BAD_ARGS).
  `inspect(ref)` reads it back: `{ uuid, name, flag, feat, ghostInCombat }`.
- **The button follows.** With one of your incorporeal tokens in the fight, the ghost button stays
  usable (no swords badge, no "fight started" clear — the toolclip says only incorporeal creatures
  pass), and pressing it mid-fight is not refused. When the fight has switched ghost off and such a
  token of yours then arrives (a summon), one toast says it may ghost; when it leaves, the usual
  fight clear applies. `status().combatExempt` lists those token ids (appended key).
- Listens to three more hooks: `createToken`, `deleteToken` (a refresh when a token of the viewed
  scene comes or goes) and `renderTokenHUD` (the toggle). `setGhost(true|false)` is unchanged.

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
- **[declared]** with two tabs open on one player account, switching the ghost button or "Show my
  own tokens on top" in one tab now takes effect in the other tab as well, instead of that tab
  carrying on with the old value until something else redrew it (movement-edge-3, movement-async-2).
- **[declared]** `combatActive(null)` now answers for the viewed scene, as `status({ sceneId: null })`
  already did, instead of always answering `false`. `status()` given an argument that names no
  scene (`""`, or `{ sceneId: 42 }` / `{}`) still answers no combat with `sceneId: null` (movement-edge-4).
- **[declared]** `pinsUnderTokens` respects Foundry 14 scene levels: a pin shown only on other
  levels than a token's is no longer reported under it; a pin shown on every level, or a token with
  no level, pairs as before (movement-edge-5).
- **[declared]** the GM ghost switch remembers its last mode from the policy list itself rather than
  a hand-kept copy of it; every off/on flip lands where it did before (EXT-4).
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
