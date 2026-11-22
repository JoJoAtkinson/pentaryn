# Changelog — pentaryn-movement

## 0.4.8 — 2026-11-22

Hard-case round H-1 (walls, doors, crowds, mixed sizes; a Mac browser through the tunnel, the BOSS harness).

- **[declared] A door cut never leaves a token frozen in the door frame or walking on through the shut door
  (H1-01 blocker, H1-02).** Core registers a CanvasAnimation under its name only after running its first
  frame; a chained movement tween that completes inside that frame (a slow page: one 300-900 ms frame
  covers a segment) starts the next link, which registers itself, and the outer call then overwrites that
  with its own completed animation. Every later stop (terminateAnimation by name) missed the running link:
  it walked on through the shut door (the rest check snapped it back), and ending with links queued it threw
  core's "reading 'chain'" and left the token drawn off its server position. A wrap of
  `CanvasAnimation.animate` (row `movement-canvas-animation-registration`) points the name back at the
  running animation. A cut or a click-stop also puts the drawn point back on the document's derived position
  before stopping the tween (a re-prepared document made the token jump to its destination first).
- **[declared] A member cut in the doorway with no square before the door** walks from where it is drawn to
  the nearest clear spot no other token takes (it was put on the square a member behind it had just taken,
  H1-07 / H1-09); in a fight, one core stops on another token's square steps off at once, costed (H1-07:
  two on one square for 3.4-4.1 s, then a 0-cost jump).
- **[declared] Group planning counts its own work, not the frames between its slices (H1-03).** 1.2 s of
  planning, 2.5 s on the wall clock (was 300 ms of wall clock: a slow tab fell back to core on most funnels,
  the followers stopping at the first wall). A drag's own search the same way (1.5 s of search, 4 s of wall
  clock; H1-10: a maze drag stopped 3.6 squares short).
- **[declared] A click-stop stops only the clicked token (H1-05).** The rest of its group walks on; out of
  combat a member still walking through where it stopped is stopped where drawn and walks on round it, or,
  with no way round, stops short of it; later waves route round it; the rest check never moves it.
- **[declared] A big token never walks where its body does not fit (H1-04).** Core tests walls at the centre
  only: a 2×2 Large walked through a one-square door with its body 55-87 px in the rock. Its path is cut where
  16 rays over 75 % of its radius first meet a wall, a straight drag that squeezes is searched round, and a
  group route that squeezes counts as no route.
- **[declared] Dropped on another token, the grabbed one takes the nearest clear spot it can reach (H1-08:
  it parked in a one-wide connector on top of a Large).** Its core path, when it has no route, never ends on
  a token that stays.
- **[declared] No way there: a notice, and the group does not half-move (H1-12).** Out of combat, when the
  grabbed token's way ends short of the drop; with a group, only the grabbed token goes (as core takes it).
- **[declared] Out of combat a member's route goes round tokens that stay (H1-09:** arrivals drawn through a
  crowd member, -30 / -81 px), when there is such a route.

## 0.4.7 — 2026-11-22

Live play-test round 7 (a Mac browser through the tunnel, the BOSS harness).

- **[declared] A door shut, or a wall raised, mid-walk out of combat stops the drawn token at once (R7-1,
  blocker).** 0.4.6 cut the move with one animated update ("displace to where it is drawn, then walk to the
  square before the wall"). Core chains an animated movement after the one being drawn, so every client
  drew the old walk to its end, through the shut door, then jumped back 1100-1775 px and walked again. The
  cut is now two writes: an unanimated displace to where the token is drawn (this client stops its tween
  before the write, every other client when the update lands, as a click-stop does), then, once the server
  has it, the walk to its square before the wall.
- **[declared] No stop races a segment already on its way to the server (R7-2).** In a fight each square is
  its own update; a stopMovement sent while the next one was in flight let that segment land as the
  continuation of a movement core had settled: the member walked on, was walked back by the cut and
  forward again (cost 95 where 40-50 was due), and core's next stop of it threw "Cannot destructure
  property 'resolve' of '#movementPromisesWithResolvers.get(...)'". Every stop this module makes (the
  cut, a click, the relay, the GM's stopOwn, a turn change) now waits until that segment has landed
  (`_movementContinuation.continued`, at most 1.5 s) and stops the movement it started; a click-stop's
  displace out of combat no longer calls stopMovement first in that window (the displace supersedes it).
- **[declared] A press on a door's icon right beside a moving token stops the token (R7-3).** The door
  precedence check now counts 0.4 square beyond the token's drawn circle (the door shut in 2 of 5 runs with
  the centre 50-80 px short of the icon).
- **[declared] A click-stop never rests with its box across a door's line (R7-4).** The door-line test used
  90 % of the token's circle, so a stop rested 5 px across an open doorway's line; it uses the whole box
  now (touching is fine).

## 0.4.6 — 2026-11-22

Live play-test round 6 (a Mac browser through the tunnel, the BOSS harness).

- **[declared] A door shut, or a wall raised, across a move already under way cuts it before the wall (R6-3,
  R6-1).** Out of combat the whole path is one update, so core never looked at the walls again: a door
  shut after the drop, or a new wall, was walked straight through. In a fight core did cut each member at the
  door, but every one walking toward it on the same last square, and the rest check split them with
  one-square jumps about 4 s later. A `createWall` / `updateWall` (door state, door, move, line or direction)
  on the client that started each move now finds every token of its own whose route ahead crosses that wall
  (it now blocks movement) and gives each, nearest first, its own whole square before the wall, free of every
  other token, of where core will stop one still walking, and of the squares taken before it. Out of combat
  it walks on there from where it is drawn (one update: a displace to the drawn point, then its route); in a
  fight it stops at its next square (`stopMovement`) and walks on from there, costed. No free square on its
  way: it stops where it stands (out of combat on a clear spot). This client's unsent waves plan round those
  squares too. Ghost and unconstrained moves pass. `status().group.cut` `{ at, why: "wall", wall, members }`.
- New pure rules in `motion-core.mjs`: `segmentsCross`, `routeAhead`, `firstLegAcross`.

## 0.4.5 — 2026-11-22

Live play-test round 5 (a Mac browser through the tunnel, the BOSS harness).

- **[declared] A reload mid group move no longer loses the last waves (R5-2).** Between a reload's start and
  the old page's end its timers still fire: 0.4.3/0.4.4 took the due wave off the tab's record, then sent it
  over a socket that was closing, so the update was lost and the reloaded page had nothing to resume (the
  grabbed token, in the last wave, stayed at its start; reproduced on BOSS: `pend` held the anchor's wave
  1.2 s in, `resumed` null after). On `beforeunload` / `pagehide` a due wave is held in the record (sent
  2 s later if the page stays), and a wave leaves the record only once the server answered the update.
- **[declared] No member rests on another when a door shuts mid-walk (R5-1).** The free-square check before
  a shut door now also counts where core will stop a token that is still walking with waypoints to go (its
  own `constrainMovementPath` over its pending waypoints), and once a group this client sent is at rest a
  member left on top of another token steps to the nearest free whole cell it reaches in a straight line
  (a walk; a displace in a fight). `status().group.destacked`.
- **[declared] A click on a moving token over a door's icon stops the token, not the door (R5-3).**
  A capture-phase pointerdown listener on the canvas stage (row `core-door-control-click-precedence`)
  runs before the icon's own handler: a press there with a token this client could stop drawn under it stops
  and selects the token and never reaches the door. (A wrap of `DoorControl#_onMouseDown` was tried first:
  libWrapper keeps it under Monk's Active Tile Triggers' async wrapper, so it decided a frame late and the
  door still shut.) A click-stop whose body would rest across a door's line, open or shut,
  rests on the nearest whole cell beside it.
- **[declared] A straight drag bends round a teleport / change-level region (R5-4).** Core's whole path was
  returned untouched when no wall cut it, so a single drag walked into a scene link (the player's view jumped
  to its destination). When core's line enters such a region the drag neither starts nor ends in, every leg
  is searched round it; with no way round, core's line stays.

## 0.4.4 — 2026-11-22

Live play-test round 4 (a Mac browser through the tunnel, the BOSS harness).

- **[declared] A door shut while a group walks never stacks the waiting members (R4-1, blocker).** 0.4.2's
  wave-time door check sent every member still waiting before the door to the same last whole square, and
  four of six heroes ended on one cell. The cut now takes the nearest whole cell before the wall, walking
  back along the route, that no other token rests on (its source) and no earlier cut of the drop claimed;
  with none, the member stays where it stands.
- **[declared] Next Turn mid group drag stops the whole group (R4-3).** A turn start clears every
  combatant's movement history and core stops a token whose history is cleared; only the members that had
  walked a square stopped, the others and the unsent waves went on. A history clear on a member of a group
  this client sent now stops the group as a click does. New hook `updateToken: a turn change stops the
  whole group`; `status().group.stopped`. The squares walked before the turn change are cleared with the
  turn, as core does for every token.
- **[declared] No client throws core's "reading 'chain'" when it sees a click-stop (R4-4).** Core's own
  `stopAnimation({ reset: false })` for the displace left each tween's queued links; the observing client's
  terminated tween resumed one with no context. `Token#stopAnimation` is wrapped on every client to empty
  the chain first (row `movement-stop-animation-defuse`, marker `__pentarynMovementDefuse`; seven patches).
- **[declared] A click-stop in a doorway never rests the token inside the wall beside it (R4-5).** When the
  drawn spot's body crosses a wall, the displace uses the nearest clear whole cell reachable from it.
- **[declared] `status().group.last` after a throw reads mode / result `core`, reason `throw`; a group
  dropped where it stands plans nothing (reason `still`) (R4-11).**

## 0.4.3 — 2026-11-22

Live play-test round 3 (a Mac browser through the tunnel, the BOSS harness).

- **[declared] A reload mid-move no longer loses a group's later waves (R3-1).** The waves lived only in the
  dropping client's timers; a reload 1 s after a five-wave drop left a waiting member at its start for good.
  Each group's unsent waves are kept in that tab's sessionStorage and taken off as they go out; the next
  `ready` sends what is left, spaced as planned (the first unsent one at once when overdue), only for this
  user and world, within 60 s of the drop, and only for members nobody moved since. A stop clears them.
  New hook `ready: resume a group's waves after a reload`; `status().group.resumed`.
- **[declared] A stopped token is never left drawn away from its server position (R3-2, R3-7).** After an
  unanimated move (a stop's displace) every client watches the token for 3 s: a movement tween that runs on
  with no newer movement is stopped at the source, and a drawn position left off the source is reset. 0.4.2
  checked at 0 and 250 ms only, found the token still animating and never looked again; the drawn token then
  walked on through a door and stayed there while the server had it east of it.
- **[declared] A click-stop puts the token where it is drawn, not at its destination (R3-4).** Any
  re-preparation of a moving token's document puts its derived x / y on the source (the destination) until
  the next frame; a stop that read them in that window put the token at its destination (a member jumped
  1456 px into the group). While a movement tween runs and the derived position equals the source, the
  placeable's last drawn position is used (stop and the board fallback's hit test).
- **[declared] The group width probe casts no ray from off the canvas (R3-6).** Slot candidates beyond the
  scene edge were probed with rays core cannot compute (330 "origin is out of the scene bounds" warnings in
  one planGroup); such a point is narrow, with no ray.
- **planGroup searches the grabbed token's route first, as its drag preview does (R3-5),** and reports it
  as `anchorRoute` (`reached`, `ms`, `waypoints`). The dry run had searched it inside one member's budget,
  so a maze read "anchorNoRoute" / "budget" where a real drop reuses the preview's route.

## 0.4.2 — 2026-11-22

Live play-test round 2 (BOSS harness and a Mac browser through the tunnel).

- **[declared] A route whose only gap lies outside the start/goal box is found (R2-7).** The search was
  bounded by the start/goal box plus max(8, half the distance) cells; in a maze whose opening lay 12 cells
  above that box the drag showed a straight red ruler and stopped at the first wall. `searchWide` retries
  in the whole scene lattice when the box holds no route, within the same node cap. The same bound made
  the grabbed token's route fail in a group drag (`anchorNoRoute`, R2-11).
- **[declared] A group drop left to core never rests a boxed-in member on its neighbour (R2-1).** A member
  with no clear point stayed at its start, which a member placed before it could already hold (a 3×2
  block dragged into a wall ended with two pairs at distance 0). `restOnPaths` now holds such a member at
  its start and places the drop again around it. A planning throw caught by the drop wrap now cuts the
  members' paths the same way (it returned core's paths untouched).
- **[declared] A door closed after a group drop stops a waiting member on a cell before it (R2-5).** A later
  wave is checked against the walls when it is sent; a blocked route ends on the furthest whole cell
  before the wall (`group-adapter` `cutAtWalls`), never on the door line where core's own cut left it.
- **[declared] Every client puts a stopped token where the server has it (R2-9).** The resync after a
  stop's displace ran only on the client that clicked; every client now runs it after an unanimated move.
  New hook `updateToken: resync after an unanimated move (stop)`.

## 0.4.1 — 2026-11-22

Live play-test round 1 (BOSS harness and a Mac browser through the tunnel).

- **[declared] A click-stop never leaves a token off its server position (D-4).** A terminated
  movement tween that still ticked once resumed a queued link with no context: core threw
  `TypeError: Cannot read properties of undefined (reading 'chain')` after writing the old tween values
  onto the document, and the player's client drew the token 60–75 px from where the server had it.
  The displace now empties each animation context's queued links (resolving them) before it stops the
  tween, and once its write is in (and again 250 ms later) resets a drawn position left off the
  source when the token is at rest.
- **[declared] A click core's mouse manager dropped still stops the token (D-2).** A pointerdown on the
  board that the `_onClickLeft` wrap did not see (the token's MouseInteractionManager was not in its
  hover state, or PIXI hit-tested a transform a frame old) is matched against the circles where moving
  tokens are drawn; the nearest one the click table stops is stopped and selected. New hook
  `canvasReady: board pointerdown (click to stop, fallback)`.
- **[declared] A group drop left to core never leaves two members on one spot (D-1).** Past the 300 ms
  budget (or no route for the grabbed token, a planning throw, and the core reasons tooMany, waypoints,
  pathfind:*, ghost or unconstrained in combat), each member's own path is cut at its furthest point
  clear of the members placed before it (`group-core` `restOnPaths`): the grabbed token first, keeping
  its drop point; touching is fine; in combat only on a cell centre or a waypoint.
- **[declared] A started encounter counts as a fight even when it is not the active one (D-9).** Core
  records movement for a combatant of any started combat; the ghost policy, the toolbar and
  `status().combatOnScene` now agree with it.
- **A rounded route never carries the same waypoint twice (D-10).** Two corners one square apart (into
  and out of a door) shared their tangent point.

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
  updates, the same shape is committed later); past 300 ms, a throw, or no route for the grabbed token
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
- Correctness review (against core 14.370), merged with the table review above (the overlapping
  fixes are one implementation: the reused drag route, the capped route call at `memberMs - 30`
  ms via `routeTo`'s `maxMs`, the drop's scene for late commits and waves, followers pathfound on
  a drop core commits, planned moves untouched). In addition:
  - The reused drag route is never one the drag was still searching (`searching`).
  - `MOTION.checkpointEvery` is honoured (every in-combat cell was a checkpoint).
  - A wave leaves out a member a relay stop took out of the group.
  - Click to stop on this client's own pending move calls `stopMovement()` before the displace, so
    core's continuation cannot race the displace and carry the token on.
  - An async plan finishing after `uninstall()` sends nothing.
- Property tests: `group-props.test` (300 seeded random maps: termination, walls, rest slots,
  no overlap in motion; `firstConflict` against brute force; 17 edge cases).
- Before shipping (Fable's verdict, 2026-11-21; still 0.4.0, unreleased):
  - **[declared] Click to stop arms after 400 ms of movement** (`MOTION.armMs`). Earlier, the click is
    core's own: the habit click after a drop and a double click for the sheet no longer stop the token
    short. The start is this client's drop (`noteDrop`) or the move's first `moveToken` (new hook,
    appended to `hooks.json`); a move never seen starting is armed. `stop(ref)` is never held back.
  - **[declared] The silent planning wait is capped at 300 ms** (`GROUP_LIMITS.totalMs`, was 1 s;
    `memberMs` 250 → 150, so a route call is capped at 120 ms), then core's own drop.
  - **No stagger when paths do not conflict**: on open ground every member's delay is 0 and the drop
    is one batch; waves only where routes meet (a door). Pinned by a seeded test (60 formations, in and
    out of combat); the planner already behaved so.
  - **[declared] A GM may stop any move in combat.** A GM's click on a move another user started sends
    the new query `pentaryn-movement.stopOwn` to that user (400 ms); its client stops the token (and
    the group it sent). GM sender only, only a move that client started. The kit's queries reach only
    the active GM, so the handler is registered by hand: `exceptions.json` C30 and C56 for movement.
  - **[declared] Auto-routes keep out of places a drag should not discover**: never through a secret
    door (open or shut); never into a region with a `teleportToken` (a pentaryn-portals scene link) or
    `changeLevel` behaviour unless the leg starts or ends inside it (hidden regions count only for a
    GM); for a player's preview, never over ground that player has neither explored nor can see.
    Closed and locked doors block as before (core's collision). Applies to drag routes, group routes
    (`routeTo` now searches when core's own straight line would cross one) and group rest slots.
    `pathfind-core.mjs` `segmentsCross`, `avoidRegion`, `MOVE_ON_ENTER`; `pathfind-adapter.mjs`
    `placesToAvoid`.

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
