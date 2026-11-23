---
title: "Drag pathfinding and group movement — pentaryn-movement 0.3.0 / 0.4.0"
status: built
last_modified: 2026-11-21
tags: [foundry, plans, movement, pathfinding]
---

# Drag pathfinding (pentaryn-movement 0.3.0)

**Read this when:** you are changing how a dragged token finds its way around walls, or wondering why it was built this way. **Not this file:** using it → [`../../foundry/module/pentaryn-movement/README.md`](../../foundry/module/pentaryn-movement/README.md) ("Drag pathfinding").

**Status:** built on branch `feat/movement-pathfinding`, unit-tested; not yet synced or play-tested live (section 9).

## 1. What Joe asked for

When a player drags a token to a spot behind a wall, the ruler should take the shortest route around the wall instead of stopping at it (A*-style). Where a turn is natural, the path should feel like an arc, if a known technique does that well. Build it, not just plan it.

## 2. Verdict: build it, inside pentaryn-movement

- **No module to adopt.** routinglib stops at v11 (a fork reaches v13). Drag Ruler stops at v12, and core now has its own drag ruler. Elevation Ruler has no v14 release, and v14 rewrote movement. Pathfinding Ruler and lib-find-the-path are dead. Nothing installed touches `findMovementPath`.
- **Core v14 is built for this.** `Token#findMovementPath` is documented as a job that "may not necessarily be one with the least cost". The drag code already handles an async job, shows a searching animation, cancels on every recalculation and reuses partial paths. The core version does no search at all.
- **Where:** pentaryn-movement already wraps the drag (ghost), owns `ignoreWalls`, and is the movement module. The new code is one feature file, one adapter and one pure core file. It does not need a module of its own.

## 3. Algorithm

| Step | Choice | Why |
|---|---|---|
| Search | 8-connected grid **A\*** with a binary heap, on the token's top-left lattice anchored at the drag destination | Pentaryn scenes are square grids of about 1,400 cells. A* is exact and small. |
| Step cost | `Token#measureMovementPath` of the two-waypoint step (adds `createTerrainMovementPath` when a visible region has terrain effects) | Each step costs exactly what the ruler charges: the scene's diagonal rule (2024 rules, every diagonal 5 ft), dnd5e's creature difficult terrain, and region terrain |
| Heuristic | Chebyshev × 5 ft | Never overestimates under any diagonal rule |
| Tie-break | shorter Euclidean length among equal costs | With 5-ft diagonals many routes tie, and without a tie-break the path zig-zags |
| Corner rule | a diagonal step needs at least one of its two orthogonal two-step routes open to walls | Core's centre ray can slip through the point where two walls meet. A diagonal past a single wall end is still allowed. |
| Simplify | **cost-preserving string pulling** | From each kept node, extend the straight line while (a) every square on its direct path passes the same step and corner tests and (b) its cost is no more than the A* stretch it replaces. The result is a few corners, never dearer than A*. |
| Rejected | Theta*/Lazy Theta* | They give the same shape as A* plus string pulling, but optimise Euclidean length, so the cost would need re-checking anyway |
| Rejected | funnel / navmesh | Only for gridless scenes, and Pentaryn has none (a possible later mode) |

## 4. Arcs: circular fillets, cost stays in squares

- **Technique: a circular-arc fillet at each string-pulled corner.**
  - The arc is tangent to both legs and sampled every 40° or less, so a 90° turn gets 3 or 4 points.
  - The tangent length starts at the smallest of 2 squares, what is left of the incoming leg, and half of the outgoing leg.
  - It is halved up to 4 times until every sub-segment is clear (walls on the footprint, creatures on the squares crossed) and the measured cost of the arc is **no more than the sharp corner**. If no size passes, the corner stays sharp.
- **Why fillets.** An arc cuts *inside* the turn, toward the wall corner it hugs, so a clearance check bounds it.
  - Catmull-Rom passes through the corner points and bulges outward, so it can clip walls.
  - A quadratic Bézier on the corner works about as well, but its clearance is harder to bound.
- **Movement cost is unchanged by design.**
  - Arc points are real, non-explicit, unsnapped waypoints. Core measures every move square by square, and an arc is accepted only when its measured cost does not exceed the corner it replaces.
  - dnd5e already hides the dots and labels of non-explicit waypoints, so the ruler shows one rounded line, and the token animates along the points.
- **Fallback.** If core cuts the arced path shorter than the plain one, the plain string-pulled path is tried before the straight drag.
- **Default: on.** Joe asked for arcs. Any player can turn them off with *Round path corners*.

## 5. Hook point and contract

- **Wrap `CONFIG.Token.objectClass.prototype.findMovementPath`** (Token5e) through the kit's `wrapMethod`, with marker `__pentarynMovementPath`.
  - A new marker is needed because the kit dedupes on module + marker + target, and the ghost drag wrap already uses `__pentarynMovement` on the same prototype.
  - Order: pentaryn → dnd5e → core.
- **What the wrap does:**
  1. Run the original. If its path reaches every explicit waypoint (matched with `TokenDocument.arePositionsEqual`, as the drag code does), return it untouched. A straight drag costs one extra comparison.
  2. Skip, returning the original, when: the world mode is off; the mode is GM-only and the user is a player; this client's setting is off; the grid is not square; `constrainOptions.ignoreWalls` is set (ghost, or the GM's unconstrained tool); or another wrapper is still searching.
  3. Otherwise, search every leg from the last explicit waypoint the plain path reached. Splice the corners in as `explicit: false, checkpoint: false` waypoints, and run the **original** again on the expanded list, so dnd5e and core still apply walls, surfaces, levels, creatures, terrain and `maxCost` exactly as before.
  4. Keep the result only when it reaches more explicit waypoints than the plain path. A leg with no route keeps core's stop at the wall.
- **The job contract.**
  - `result` is the path when found in the first 8 ms slice. Otherwise it is `undefined` while timer slices continue, and `null` after `cancel()`.
  - A search is capped at 6,000 expanded nodes or 1.5 s. Past either cap, it returns the plain path.
- **Preview.** Every test passes core's `preview` flag. A player's search counts only walls they have explored or can see, so nothing on the map leaks, and the drop still stops at an unseen wall. GMs and scenes without token vision drop preview, as core does.
- **Not touched:** keyboard movement (it never calls `findMovementPath`), and `_movementPlanningContext.direct` (core skips the call).

## 6. Settings

| Key | Scope | Default | Why this shape |
|---|---|---|---|
| `pathfinding` | world | `everyone` | Joe's on/off, with a *GM only* middle step for trying it before the players get it |
| `pathfindMine` | client | on | A player who dislikes it can opt out without asking the GM |
| `smoothCorners` | client | on | Arcs are taste: per player |

The corner rule has no setting. A diagonal squeeze through a wall joint is a ray artifact, not a table rule.

## 7. Interactions

| Case | Behaviour |
|---|---|
| Closed, locked or secret door | blocks, through core's own collision. Open doors pass. A door opening mid-drag drops the cache, and core re-plans. |
| One-way wall | directional, through core's collision. Steps are cached per direction. |
| Ghost / GM unconstrained | skipped (`ignoreWalls`); the drag goes straight, as before |
| Token larger than 1×1 | one wall ray per covered square, so a 2×2 token is never routed through a 1-square gap. A straight drag core allows is never made stricter, since core itself checks only the centre ray. |
| Difficult terrain | exact per step. A* detours when the detour is cheaper. |
| Hostile creature | dnd5e's blocking squares are impassable, so the route goes around and does not end at the creature. Friendly and Tiny (modern rules) creatures do not block. |
| Combat, remaining movement | the cheapest path; dnd5e's ruler colours show any overspend. Core has no drag cap, and none was added. `maxCost`, when a caller sets it, is still applied by core on the re-run. |
| Diagonal rule | exact for EQUIDISTANT, Pentaryn's setting. Alternating 5/10/5 is measured per step without history, so a route there can be a few feet off; core's ruler still shows the true cost. |
| Elevation, size or action change within a leg | that leg is not searched |

## 8. Performance and caching

- **Search size.** About 1,400 cells on the biggest scenes (46×30 at 150 px). A* is bounded to the start/goal box plus max(8 squares, half the distance).
- **Step cache.**
  - Step results (walls, creatures, cost, lines) are memoised in one `Map`, keyed by absolute position, the moving token, size, action, level, elevation and preview, so later searches in the same drag reuse nearly everything.
  - Dropped on wall, region, behaviour and token create/update/delete, on `controlToken` (dnd5e never blocks on a token moved with the mover), when this client's fog is explored (`canvas.fog` "explored", which core's token layer also re-plans on), on `canvasReady`, once the cache is 2 s old (its age, not idle time: a drag keeps it busy, and visibility changes which creatures count in preview), and above 200,000 entries.
- **Budget:** an 8 ms synchronous slice, then timer slices.
- **Benchmark (still owed).** No per-step timings yet, because the headless GM tab has no canvas. Play-test step 6 measures them on Drow Prison (838 walls). If typical drags go async (`pathfind.status().last.async`), raise the slice or add a `checkCollision` pre-filter.

## 9. Test plan

**Unit (done, `make foundry-movement-check`):**
- `test/pathfind-core.test.mjs` runs A*, string pulling and fillets on ASCII wall maps:
  - open floor; an L-corridor;
  - closed vs open door; a grid-line wall; a one-way wall;
  - the corner squeeze, and a diagonal past a single wall end;
  - a 2×2 token at a 1-wide vs a 2-wide gap;
  - difficult terrain, both detour and cross; a hostile in a doorway;
  - zig-zag straightening with cost equality; the node cap and time slices;
  - `directPath`, fillet geometry and fallbacks, the skip rules.
- `test/pathfind.test.mjs` runs the wrap against a token whose core path stops at the first wall:
  - a straight drag is untouched; a routed drag keeps its explicit ends and adds non-explicit corners, and its cost equals the grid optimum;
  - arcs are placed;
  - skipped for `ignoreWalls` and for each of the three settings;
  - a sealed goal; the 2×2 vs 1×1 gap; no stricter than core on straight drags.

**Live play-test (orchestrator, in a browser, as a player on a test token; nothing on real PCs):**
1. Sync, reload, `game.pentaryn.movement.selftest().ok`, and `pathfind.status().patched === true`.
2. **Corner:** drag past an L-shaped wall. The ruler bends around it with a rounded corner. Drop: the token walks the arc, and the cost label matches a square count.
3. **Doors:** drag through an open door (straight through). Close it and drag again: the route goes round another way, or stops at the door when there is none.
4. **Size:** a 2×2 token to a spot past a 1-square gap. No route through the gap: it goes round or stops.
5. **Combat:** start a combat, drag with little movement left. The path is the shortest, and the ruler turns the dash colour past speed.
6. **Timing:** on Drow Prison, drag across the map, then read `pathfind.status().last` (`ms`, `nodes`, `async`). Repeat with *Round path corners* off.
7. **Leak check, as a player:** drag toward an unexplored area behind a wall the player has not seen. The ruler does not bend around the unseen wall, and the drop stops at it.
8. **Ghost:** turn ghost on and drag through a wall. The drag is straight, with no detour.

## 10. Rollout and rollback

- **Rollout:**
  1. `make foundry-movement-sync`, then restart Foundry (`module.json` changed: version and description), then reload. The new code needs only the reload; the restart makes the version shown match.
  2. Run the play-test above.
  3. Set the world mode to *GM only* first if the timing in step 6 looks heavy.
- **Rollback, in increasing order:**
  1. A player turns off *Round path corners* or *Find a path when I drag*.
  2. The GM sets *Drag pathfinding* to **Off**: a live read, no reload, and the wrap then returns core's own job.
  3. Revert the branch: 0.2.0 has no pathfinding settings, so the three world/client values are simply ignored.

## 11. Judgement calls

- Arcs are on by default, not deferred to a v2. Joe asked for them, and the cost check makes them safe.
- The corner rule allows a diagonal past a single wall end; it refuses only a squeeze between two walls.
- A straight drag core allows is never changed, even for a large token. That keeps "no worse than today".
- There is no budget-aware routing in combat. The cheapest route is shown, and dnd5e's colours do the rest.
- ALTERNATING diagonal rules are approximate: no history parity, since Pentaryn uses EQUIDISTANT.

## 12. pentaryn-movement 0.4.0 design (group movement, click to stop)

Joe's requirements (DM, 2026-11-22):

1. Seamless: a user just drags their character; it finds a smooth path if anything blocks. No new UI to learn.
2. If the drop needs a wild detour (a path exists, so it starts the long way), the user can CLICK THEIR CHARACTER to stop it where it is.
3. GM multi-select drag: each character follows its own ideal path — unless ghost is on, then straight to the point.
4. Group members must not overlap while moving or at rest, so they look like they move together. Not 5-ft-square movement ("that's a combat box, not how people move"): each walks its A* path like a human; tokens are circles, collision = distance < r1+r2.

Working interpretation: OUT of combat free-form smooth movement; IN combat keep exact grid costs for dnd5e movement tracking (click-to-stop and group pathing still apply). GM unconstrainedMovement and ghost stay straight-line. If planning fails, behave exactly like core.

The design below is as approved, verbatim (headings one level down). The builder's notes on where the source forced a deviation follow it in §13.

### pentaryn-movement 0.4.0 design

`[V]` marks something the builder must verify in source before relying on it.

#### 1. Principles

1. **Nothing reacts at runtime.** Every trajectory is fixed at drop time, so deadlock is impossible by construction; the only planning failure is "no feasible slot or delay", and that degrades in a fixed order (§4).
2. **Rest non-overlap is a hard guarantee; in-motion non-overlap is best effort** and is the first thing relaxed.
3. **Two regimes, one pipeline.** Out of combat: free-form geometry, one committed path, stop by displace. In started combat: grid cell centres, exact cost, stop by `stopMovement()`.
4. **Any throw, timeout or unverifiable state means core's own updates, untouched**, with one `console.warn`.

#### 2. Behaviour per scenario

| Scenario | Out of combat | In started combat |
|---|---|---|
| Single drag, clear line | Core straight line | Same |
| Single drag, blocked | 0.3.0 route, string-pulled and filleted, unsnapped interior points; destination snaps as core (Shift = unsnapped) | Grid route; arcs only where cost ≤ grid optimum (0.3.0 rule) |
| Click the moving token | Stops where drawn, then selects | Finishes to the next cell centre (≤ ~170 ms); exact cost recorded |
| GM group drag | Each member walks its own route; circles kept apart by slot choice, start delays, lateral re-plan | Same, but delays and slots only (no lateral offsets, cost rule holds) |
| Ghost, `ignoreWalls`, unconstrained, `direct` | Core straight lines, one batch, no avoidance. Only if two members' rest circles overlap is the lower-priority one nudged | Pure core |
| Doorway or corridor | Members file through in order of distance to goal, nose to tail | Same on cells |
| Destination crowding | Anchor lands where dropped; others take packed slots around it | Others take the nearest free cells |
| Mixed sizes | Radius = width × grid size / 2; largest placed first | Same, footprint cells |
| No path for a member | That member behaves exactly as core; the rest plan around its constrained end point | Same |

Skip `direct` contexts explicitly: core's own check never fires.

#### 3. Click-to-stop

Wrap `Token#_onClickLeft`. Conditions: select tool, no modifier keys, user can control the token, and the movement is pending, paused or animating. Stop first, then call the original. A double-click's second press finds a stopped token and opens the sheet.

- **Out of combat:** displace the token to its drawn position (`animate: false`, action `displace`, unsnapped). Any owner may do this, so a player can stop a move the GM started. `[V]` the exact call shape, where the drawn position is read, and that a displace back from the document's end point does not fire unwanted region enter or exit behaviours.
- **In combat:** paths commit with `checkpoint: true` at each cell centre they pass through (arc points stay non-checkpoints). The initiator calls `stopMovement()`. A non-initiator sends a kit query to the initiating client, 400 ms timeout; on failure nothing happens. Never displace in combat.
  - `[V]` Waypoints accept `checkpoint`.
  - `[V]` Per-cell continuation is smooth over the tunnel. If it stutters, use checkpoints every 2 cells.
- **Group:** when the initiator stops any member, the whole group stops and unsent waves are cancelled. A player stopping their own token stops only theirs; others may then pass through it (accepted).

#### 4. Group planning algorithm

Trigger: the `_prepareDragLeftDropUpdates` wrap, with 2 or more contexts and no skip reason. During the drag only the grabbed token runs our planner; the others get core's preview, which avoids N × 8 ms per pointer step.

If the solve cannot finish synchronously, the wrap returns no updates and we commit through the same `updateEmbeddedDocuments` shape (`method: "dragging"`). `[V]` that an empty return ends the drag cleanly, and that undo still works.

Budget: 250 ms per member, 1 s total, 12 members. Over budget means core.

**Step A, slots (rest positions).** The anchor is the grabbed token; its destination is final.
- If every member's same-delta destination is walkable, reachable and free of other tokens' circles, keep the formation.
- Otherwise generate candidates around the anchor: a hex lattice with pitch 2 × the largest radius plus gap out of combat; grid cells in combat. Keep a candidate only if:
  - its footprint is walkable (`fieldFor`);
  - its walk distance from the anchor is ≤ 2 × its straight distance (no slots through a wall);
  - it is clear of non-group tokens.
- Assign greedily, largest radius first, with pairwise distance ≥ r1 + r2 + 0.1 square.
  - Open ground: minimise distance from the member's formation offset.
  - Constricted (the anchor's route passes a gap narrower than 2 group diameters): assign by depth, so the member nearest the goal gets the slot deepest along the route and nobody has to pass anybody.

**Step B, routes.** Call `pathfindRoute` for each member to its slot.

**Step C, timing.** Position over time is a pure function: one common speed, terrain ÷ difficulty, dnd5e half speed `[V]`. Process members in order of remaining route length, shortest first. For member k against all fixed earlier trajectories, a conflict is distance < r_i + r_j + 0.25 square (sampled at 50 ms, plus segment-pair closest approach). Pairs that start overlapping are ignored until they first separate. Resolve in this order:
1. **Start delay:** the smallest delay in 150 ms steps, up to 3 s. This alone produces the corridor file.
2. **Lateral re-plan** (out of combat only): re-run the route with earlier members' rest circles as inflated static obstacles and a soft cost near their tracks, then retry the delay.
3. **Go last:** delay until every conflicting member is at rest, then route around the rest circles.
4. **Relax:** commit k's route with motion overlap allowed. Its rest slot is still unique.

**Step D, commit.** Members with delay 0 go in one batch. Later waves are timers on the initiating client, one batched update per 150 ms bucket. Before each wave, check that the group was not stopped and that each member's document is still at its planned start; otherwise drop that member. Region checkpoints may hold a member; that is tolerated as a soft overlap, with no runtime repair.

#### 5. Path representation

`Route = { points: [{x, y, elevation}], length, cost, delay, slot }`, using top-left coordinates as core waypoints do.

- **Out of combat:** fillets tessellated to chords with error ≤ 0.05 square, at most 8 points per corner and 64 per route. All interior points are `snapped: false, explicit: false, checkpoint: false`.
- **In combat:** cell-centre points are `snapped: true, checkpoint: true`.
- Every route is re-run through dnd5e constrain and measure before commit, as in 0.3.0. A mismatch falls back to core for that member.

#### 6. Settings and API

Defaults are seamless; there is no new UI.

| Setting | Scope | Default |
|---|---|---|
| `pathfinding` (existing) | client | on |
| `groupMovement` | world | on |
| `clickToStop` | client | on |

API additions, all in the describe golden:
- `planGroup(refs, point)`: dry run; returns slots, routes, delays and the relaxation level per member.
- `stop(ref)`.
- `status()` also reports the regime, the last plan's timings and fallback reasons.

#### 7. Acceptance tests

**Unit (pure, no canvas)**
1. Two circles, same route, same start time: the second gets a delay such that minimum separation ≥ r1 + r2 + 0.25 square.
2. Corridor 1 wide, 4 members in a column: depth-ordered slots, strictly increasing delays, no lateral re-plans, no relaxations.
3. Door 1 wide, 6 members in a 3×2 block: all pass, minimum separation holds, total added delay ≤ 3 s.
4. Formation destination inside a wall: that member is re-slotted; the anchor is unchanged; pairwise rest distance ≥ r1 + r2.
5. Mixed Large and Medium: the Large is placed first; no rest overlap.
6. Members that start overlapped: no conflict reported before first separation.
7. A member with no route: excluded, the others are planned, its constrained end point is treated as an obstacle.
8. Budget exceeded: the result is "core", with no partial plan.
9. Tessellation: chord error ≤ 0.05 square, ≤ 64 points.
10. Combat route: every checkpoint is a cell centre; measured cost equals the grid optimum.
11. `direct`, ghost, `ignoreWalls` and non-square grid each return their skip reason.
12. 13 members: core.

**Live (real browser; the bot has no canvas)**
1. Player drags around a pillar: smooth curve, no prompt, destination snapped.
2. Long detour, click mid-way: the token halts within one frame where drawn, is selected, and a second client shows it within 0.5 square of the same spot.
3. Same in combat: stops at the next cell centre; the dnd5e spent movement equals the cells walked.
4. A player clicks their own token during a GM-started move: stops out of combat; in combat it stops through the query.
5. Double-click a moving token: it stops and the sheet opens.
6. GM drags 5 tokens through a door: single file, no visible overlap on two clients, non-overlapping at rest.
7. Same with ghost on: straight lines through the wall, formation kept.
8. Drop a group into a 2×2 room: the anchor lands exactly, the others pack around it, none in walls.
9. Drow Prison benchmark: 6-token drag with pointer-step cost ≤ 16 ms and drop solve ≤ 1 s.
10. Click-stop during a staggered group: no later wave is sent.
11. A planner throw (forced by a debug flag): the move completes as core, with one warning.
12. Undo after a group move: record the behaviour and document it.

## 13. Builder's notes: what the source verified, and where the build deviates

Built on branch `feat/movement-0.4` (0.4.0), unit-tested (`test/group-core.test.mjs`: the twelve unit acceptance tests above plus the decision tables; `test/group.test.mjs`: the two wraps). Not yet synced or play-tested live (the twelve live tests above). Use-doc: [`../foundry/movement.md`](../foundry/movement.md).

**The `[V]` items** (core 14.370, dnd5e 6.1.1):

- **An empty return ends the drag cleanly.** `PlaceableObject#_onDragLeftDrop` returns at once on a falsy result (before it sets `clearPreviewContainer = false`), and `Token#_finalizeDragLeft` still runs and clears the previews. **Undo:** each `updateEmbeddedDocuments` is its own history entry, so Ctrl+Z undoes one wave at a time (live test 12 confirms).
- **Waypoints accept `checkpoint`** (`TokenDocument#move`'s documented example).
- **Displace shape:** `doc.move([{ x, y, elevation, action: "displace", snapped: false, explicit: true, checkpoint: true }], { animate: false, method: "api" })`, after a local `token.stopAnimation({ reset: false })` so it halts within the frame. **The drawn position** is the document's derived `x` / `y`: during the tween core merges its animation data onto the document (`Token#_onAnimationUpdate`), while `_source` holds the checkpoint ahead. **Regions:** core's Teleport Token and Change Level behaviours return early on a `displace`; a script behaviour on token enter / exit still sees the move (not verified live; accepted).
- **dnd5e half speed:** `registerMovementActions` sets `getAnimationOptions` → `movementSpeed: defaultSpeed / 2` for a movement type the actor has 0 of; `group-adapter speedOf` reads it. Terrain difficulty: the model takes a per-segment difficulty, but the glue passes none (it is not known before commit), so each member's speed is constant.
- **Per-cell continuation over the tunnel:** cannot be verified offline. `MOTION.checkpointEvery` is 1; set it to 2 if live test 3 stutters.
- **`direct`:** `groupMode` skips it explicitly (`reason: "direct"`).

**Deviations the source (or the tests) forced:**

1. **Settings.** The design's "`pathfinding` (existing) | client | on" is in fact the world mode (Everyone / GM only / Off) plus the client `pathfindMine` and `smoothCorners`; all three are kept. Group planning runs only where this user's drag pathfinding is allowed (`pathfind:<reason>` otherwise).
2. **The stop query goes to the active GM, not the initiating client.** The kit has no query addressed to a named user, and a hand-written `CONFIG.queries` handler fails conformance (C56). `stop` is a kit relay row: the active GM stops the move only when it started it and the sender owns the token. The active GM is the highest role, so with Joe (4) online it is Joe, not the bot (3): the main case — a player stops their own token during Joe's move — works. A GM stopping a player-started move in combat gets `NOT_INITIATOR` (nothing happens).
3. **Conflicts are exact, and the buffer is only where latency is.** Motion is piecewise linear, so the closest approach is solved per stretch instead of sampled at 50 ms. r1 + r2 + 0.25 applies only when both move and they are in different waves (or in combat, where each token's next stretch is its own update); a pair in one out-of-combat batch starts on every client from the same update and needs only r1 + r2, as does a pair with one waiting or at rest (so packed slots can be reached). "Start overlapping" includes touching (d < r1 + r2 + 0.05, a grid formation): until the pair first reaches r1 + r2 + 0.25, it is held only to "no closer than it started, less 0.15 square", so neighbours may brush as one leaves.
4. **A kept formation only needs no overlap** (≥ r1 + r2): a grid formation is circles touching. The + 0.1 square applies to assigned slots.
5. **Through a narrow gap the formation is not kept** (a formation spot just past the gap plugs it for the rest), and slots are assigned from a pool: the spots nearest the anchor that are past the gap, not in it and not beside its mouth (tier 1); spots in the gap on the route only when tier 1 runs out (a corridor), then in depth order either side of the anchor. Members take them in file order (front first: furthest along the anchor's route, then nearest the goal), each the deepest left (distance from the gap). Timing in a constricted drop follows the same file order, not route length.
6. **Relax is retried.** A member that relaxes because an earlier member rests in its way is moved ahead of it and the timing pass runs again (up to 2 × members passes); the pass with the fewest relaxations is kept.
7. **Lateral re-plan:** the earlier members' rest circles are hard obstacles (`fieldFor`'s new `avoid`); there is no soft cost near their tracks, since a penalty would leak into string pulling's cost-preserving test. "Go last" is a delay only.
8. **In combat there are no arcs at all.** A checkpoint at every cell and an arc between cells cannot both hold at the same cost, so combat routes are cell chains (Foundry's direct path between corners, which string pulling already costed square by square). On a line that is not straight or 45° the token steps cell to cell.
9. **The narrow test** fans rays from 45° to 135° off the direction of travel on each side: a door in a thin wall is crossed only by the slanted rays (the square one runs along the wall line).
10. **Smaller rules:** a group with Ctrl-click waypoints, or a planned-movement API context, is core's; more than 12 members is core's; no route for the grabbed token is core's for the whole group. The walk-distance flood uses walls and blocking creatures only (no cost). A rest spot is walkable when no wall lies between its centre and eight points at 0.9 × its radius. The sync attempt is 30 ms, then 8 ms timer slices to 1 s. Followers skip pathfinding during the drag only when the group would be planned (setting on, 2–12 contexts, square grid). The design's `status()` report is `status().group`.

## 14. Before shipping: Fable's verdict (2026-11-21)

A senior designer's review of the merged 0.4.0 (conditional go) asked for four changes before shipping and three places an auto-route must never go. All went into 0.4.0 (unreleased):

1. **Click-to-stop arms after 400 ms** (`MOTION.armMs`). The start is this client's drop or the move's first `moveToken`; a move never seen starting is armed; `stop(ref)` is never held back. Habit clicks and double-click-to-sheet no longer stop tokens short.
2. **Planning wait 300 ms** (`GROUP_LIMITS.totalMs`, was 1 s; `memberMs` 150), then core's drop.
3. **No stagger without a conflict.** The planner already gave every member delay 0 on open ground; a seeded test now pins it. Waves only where routes meet.
4. **A GM may stop any move in combat.** Design-rule exception taken: the hand-registered query `pentaryn-movement.stopOwn`, sent by a GM to the user who started the move (GM sender only, that client must have started it). `exceptions.json` movement C30/C56, retired when the kit can target a user.
5. **Places an auto-route never goes** (`placesToAvoid`): a secret door in any state; a region with a `teleportToken` or `changeLevel` behaviour unless the leg starts or ends inside it (hidden ones only for a GM, so a player's route does not give a hidden trap away); and in a player's preview, ground neither explored nor visible. Closed and locked doors were already walls (core's collision). It shapes the drag pathfinder, group routes (`routeTo` searches when core's own straight line crosses one) and group rest slots. A straight drag core allows stays core's.

Ship-blockers left to the live play-test: rest overlap in relaxed plans, combat feel over the tunnel (`checkpointEvery` 2 if it stutters).

## 15. The overlap redesign (0.5.0 →): hard obstacles, server-ordered reservations, a runtime yield guard

**Why.** After 0.4.12 the hard-case rounds (HX2a/HX2b) still had group members passing through tokens outside the group: standing crowd members (-77/-99 px), a Large walking core's path through standing heroes (-100), a player's own stopped members during the GM's drag (-83…-100), another player's simultaneous drag (-55…-99), a single drag against an oncoming group (-81), a second group to the same spot (-44) and door-cut re-settling (-91). The common cause: each plan's space-time reservation lived in one client's memory for one instant and ignored most tokens outside the plan, with two explicit escape hatches into overlap ("too long" → the way through; "relax" → brush past). Joe's requirements: just drag; members are circles that never overlap anything (members, standing tokens, other players' moving tokens) in motion or at rest; stopping short beats overlapping; a brief yield is fine, passing through is not.

**Decision (Fable, 2026-11-22): architecture (d) in three shippable stages; (c) "the GM plans everything" rejected** (the headless bot cannot plan geometry, every drop gains a round-trip, player stops need a relay).

1. **Hard obstacles (0.5.0, shipped).** Standing tokens are hard obstacles everywhere (routes, rest slots, the timing pass, combat). The "too long" fallback and "relax" are deleted. The Large gets its own route and never walks core's path. No route → walk to the last free reachable spot and stop, with the existing notice. Latency buffer 0.25 → 0.75 square.
2. **Server-ordered reservations (next).** The reservation rides the move update itself (update options, not flags): the first update carries the whole plan. Every planner, single drags included, reads them; stops and door cuts re-publish. *Verified against core 14.370 (2026-11-22):* there is no hook before a remote client's animation starts (`preUpdateToken` / `preMoveToken` run only on the sender; the receive path calls `Token#_onUpdate` → the animation before `updateToken` / `moveToken` fire), so "inspect the echo before animating" is false as stated. But every client sees the same total order (the server applies token updates one at a time under `db.semaphore`, acknowledges, then broadcasts; Socket.IO keeps per-connection order), custom update options are broadcast (as `pentarynMovementStopAt` already is), and core has two-phase moves: send the group as one `moveTokens(..., { planned: true, showRuler: false })` with the reservation in an option, decide at the echo (`movement.state === "planned"`; the earlier reservation in server order wins), then `doc.startMovement(id)` (any owner may) or re-plan with a new planned move. Cost: one round-trip standing still on every move, winner included; certain ordering, no timers. It holds only if every planner goes through plan-then-start. The 150 ms commit delay stays a fallback if dnd5e / Argon / the drag preview react badly to the `"planned"` state. Hidden tokens' reservations cannot be kept from players (options go to every client), so the planner filters: a player's planner uses only tokens that player sees, and a player's token never yields to something unseen (the GM-side mover yields).
3. **Runtime yield guard (last).** A safety net only (every firing logged, a firing is a planner bug): the lower priority yields (later reservation in server order; within a plan, plan order); standing tokens never yield; only the client that started a move touches it; in a 1-wide corridor a reservation claims the corridor in one direction; a yield waits 3 s, re-routes once, at 8 s rests on the nearest free spot with a quiet toast; in combat it pauses by withholding the next cell's continuation (free), rests on whole cells, costs the cells walked, and a doorway member stops before the door.

**Acceptance (all three stages):** HX2a/HX2b re-run (crowd, Large, 3v1, same-moment drags, player-stops-own, second group to the same spot, door cuts at 500 ms) with three real clients plus the bot at 105 ms injected latency, 20 runs each: zero overlap at rest in server positions, drawn = server on every client; in motion at most 0.1 square for at most 100 ms on any client and none against standing tokens; everything at rest within 10 s of its plan's end, no console errors, no orphaned timers after a mid-move reload; head-on corridor groups and five through one door resolve single file; combat spent movement = cells walked, no displace updates; bot-only identical; no frame over 16 ms from this module; guard fires in under 5 % of clean runs; no hidden-token trajectories in a player's payloads.

### 15.1 Stage 1 as built (0.5.0)

- **Pure core.** `group-core.mjs` decides the avoid circles (`crowdFor`: each standing token grown by the member's radius, those it starts or ends on left out) and passes them to the route oracle, in a fight too; the glue's own crowd logic, its "plain" second search and its too-long swap are deleted (`route`, `routeLong`). A new oracle `toward(member, from, to)` gives the way that ignores the tokens (the grabbed one's drag route, else a walls-only search, for a big token its `partial` as far as the body fits); `freePrefix` walks it only as far as it is free of standing tokens (`firstIntrusion`, then back off a hair, or to the last whole cell in a fight). Members get `short: true`; the grabbed one stopped short sets `anchorShort`, and the glue tells the dragger "No route there" (or "does not fit" for a big one, with the GM whisper, decision 8).
- **Timing pass.** Standing tokens are fixed static entries (`still`), and so are members that cannot move. "Relax" is gone: a member that no delay, lateral re-plan or go-last clears is *blocked*; the reorder loop moves it before its blocker as before; one last pass lets each still-blocked member take another free lattice spot (`reslot`, up to 3 routes, clear of every rest and of the spots the members after it take, past the gap first; never the grabbed one).
- **Settle (the guarantee).** `settle()` checks every member's full trajectory (wait, walk, rest) against every standing token, every token walking now and every other member with `firstConflict`. While a conflict is left, the lower-priority one (later in timing order; the one that walks when the other stands; never the grabbed one while the other walks) is cut back along its own way to the furthest point from which nothing meets it (its delay kept), or stays. Each round shortens one walk, so it ends; past `4n + 8` rounds every member still in a conflict stays. A member standing still is never charged with a walker's path (that walker's own planner answers for it). Cuts compose (`composeCut`), and the glue cuts the pixel path the same way (`cutPath`, a whole square in a fight).
- **Core fallbacks.** `unstack` (budget, throw, Ctrl waypoints, too many) passes the standing tokens to `restOnPaths({ hard })`: no member's path goes past the first one it would enter. Not for ghost or the unconstrained tool. Single drags out of combat (`aroundOthers` / `aroundLater`): round them however long, else core's way only as far as it is free, with the notice; a token that cannot move at all does not move.
- **Tests.** `test/group-props.test.mjs`: 300 seeded scenarios with standing tokens and a walker, in and out of combat, sampled every 10 ms — nothing comes closer than touching (or than it started, less `contact`) to a standing token, a walker or another member; no walk enters a standing token's circle or crosses a wall; in a fight every walk ends on a whole square; liveness: every plan finishes inside `GROUP_LIMITS.totalMs`, every member has an entry, and every member is at rest within 4 × the delay cap + 20 s. Unit tests for `settle`, `freePrefix` / `prefixOf` / `composeCut`, the token-in-the-corridor and token-in-the-door cases, and the glue (single drag, group, core fallback, combat).

**Deviations the source forced (stage 1):**

1. **The 0.75 buffer is a lag along the way, not a flat ring.** Applied as before (r1 + r2 + 0.75 whenever both move in different waves or in a fight), it staggered every pair of neighbours walking abreast in a fight (diagonal neighbours are 1.41 apart) although no lag brings them together, and broke the "no stagger without a conflict" rule (§14.3). `firstConflict` now requires r1 + r2 with either walker shifted by ±0.375 and ±0.75 square along its own direction (capped by the way it has walked and has left; extra breakpoints where those caps change), symmetric in A and B. One walking in another's wake keeps the full 0.75; abreast needs nothing. One out-of-combat batch still gets no shift.
2. **The "held" pair is let go at contact, not at r1 + r2 + gap.** A pair that starts touching was held to "no closer than it started, less 0.15" until 0.25 apart; at 0.75 a follower starting adjacent would have ridden in contact the whole corridor. It is now released at r1 + r2 + 0.05 (the same threshold that holds it), and the lag shift applies while it is held.
3. **Rest spots 0.2 square apart (`restGap`, was 0.1).** With nothing allowed to brush, a hex pack at pitch 1.1 puts rows 0.95 apart, so a member could not walk along a row between two rows already at rest: in the ten-through-a-door case six members were cut short. At 0.2 the rows are 1.04 apart and all ten pass.
4. **The grabbed one dropped in a gap's mouth onto open floor goes last** (`anchorLast`; every other member rests past it): at rest in the mouth it plugs the door for everyone behind it, which "relax" used to paper over. Not inside a corridor (there the file keeps its order).
5. **Go-last may wait up to twice the delay cap past its point**, and a lateral re-plan also keeps off the starts of the members timed after it: a door queue at the 0.75 buffer is about one member per 300 ms, so ten members need more than the 3 s cap.
6. **The "too long" rule is kept where it is safe.** A lateral re-plan round members at rest, and the stop repairs (`roundStopped`, `groupStopOne`), still refuse the long way round, but their alternative is to wait or stop short, never to walk through; only the swap to the way *through* tokens is deleted. Joe's decision 8 ("take the longer route") is what the route round standing tokens now does.
7. **Decision 7 kept for "no way at all".** "No route → walk to the last free reachable spot" applies when the way is blocked by tokens (or by a gap a big token does not fit); with no way at all (walls, a shut door) nobody moves, as Joe decided. Single drags in a fight stay core's / dnd5e's own (a player's exact path, at exact cost; moving through an ally is legal there); stage 2 brings them under the reservations.
8. **Group members still do not see another client's moves before they arrive**, a player's own stops during the GM's drag, or door-cut re-settling timing: stage 2 and 3. The rest check (`destack`) stays until stage 1 is proven live.


### 15.2 Stage 1, round S1R1 (0.5.1): what the live round found, and why

S1R1 (Mac, real Chrome, about 40 group runs) held stage 1's promise for group routes: no frame of a member over a standing token. The deviations, each traced to its cause on the BOSS harness (live dry runs on ZZ H Dungeon Lab, the pathfinder's own routes replayed in the pure planner) before it was changed:

- **S1R1-01, a 30 s walk round the dungeon.** Not the route search: two members blocked each other in the timing. Hero 3 cut past Hero 4 still standing at its start; Hero 4 could not go after it (Hero 3 passes its start) nor before it (Hero 4 at rest then plugs Hero 3's way past the crowd), so every reorder left one blocked, and `reslot` gave that one another spot reached through the maze and room C, with no length rule. Fix: a member whose timed walk passes the start of a member timed after it is re-planned round those starts first (the lateral re-plan's own avoid set, which already held them), taken when it no longer passes them; `reslot` refuses a detour nobody wants (`detourTooLong`), and a member with nothing left stops short (settle).
- **S1R1-03, two members home in a fight.** The same kind of cycle (the grabbed one's way out passes Hero 4's start; Hero 4 at rest south of Hero 7 plugs the grabbed one's way to its spot), with no way out because a fight had no lateral re-plan at all (a 0.4.0 rule from before standing tokens were obstacles in a fight). The re-plan now runs in a fight too, on the grid lattice, at the cost of the squares walked. And a fight's routes are timed square by square: the glue expands a corner's straight line into the squares `withCheckpoints` walks (`cellChain`), so the plan times what is drawn.
- **S1R1-02, the grabbed one in the corridor's mouth.** The grabbed one's drag route is reused unless it passes through a token that stays (`throughAny`), with a 0.02 square slack; the drag line slanted into the mouth and grazed the token beside it by 0.01, passed, and settle (exact) cut it back into the corridor. The slack is now 1e-4. And the guarantee: a member cut short (settle, `freePrefix`) never rests where it is `cramped` (an oracle: walls within 0.6 square on both sides at its centre or 0.9 r out), further back or where it stands.
- **S1R1-04, a single drag in a fight through three heroes.** Deviation 7 of §15.1 kept a fight's single drags as dnd5e's (passing an ally is legal there); Joe's rule is that nothing is walked through. `aroundOthers` now runs in a fight too: the drop's way goes round the standing tokens on the grid (the ruler still shows dnd5e's way while dragging), with a checkpoint at every square, and spends the squares walked.
- **S1R1-05, a 200 px jump after a click in a fight.** The rest check moved a member out of the corridor with a displace (free, instant). It never displaces any more; in a fight a member the stop left in a one-wide corridor walks on along its own remaining way (captured before the stop clears it) to the first free square out of the gap, counted; with none, a walk to the nearest one, counted.
- **S1R1-07, a Large off the grid.** Its way ends where its body stops fitting (`fitPath`), off the grid. `fitPath` now backs to the last whole square its body fits, and the planner treats a big member like a fight's (`allowedFor`: whole squares) for every cut, also a way that ends where it may not rest.
- **S1R1-09:** the group's own follow-up stops (`lateStop`, a wave that landed after the click) passed `via: "api"` and replaced the click's record; they now count on it (`late`).

Not changed, by design (stage 2): S1R1-08 (two players dragging at the same moment: neither plan sees the other, the server-ordered reservations) and S1R1-06 (a door shut on a member in the doorway in a fight: it finishes the square past the door, the door-cut re-settling).

### 15.3 Stage 1, round S1R2 (0.5.2): what the live round found, and why

S1R2 (Mac, real Chrome) held stage 1 again: no frame of anything over a standing token, in every stage-1 and regression run. The deviations, each traced on the BOSS harness (real pointer drags on ZZ H Dungeon Lab, the old and new code side by side) before it was changed:

- **S1R2-01, a single drag in a fight: 40 ft on the ruler, 90 ft charged.** Real. The route itself is right for circles that never overlap: Hero 1's room is boxed in by Heroes 4, 2, 5 and 8 (a diagonal squeeze between two tokens on diagonal squares leaves 0.41 square, so the circle does not pass) and the only way out is round row 8, 18 squares. The defect was the ruler: the drag's preview (`findMovementPath`, which core's ruler draws and measures) was core's / dnd5e's line through them, while the drop (`aroundOthers`) walked the way round. Fix: while one token is dragged alone, the preview takes the same avoid circles (`singleAvoid`, the drop's own set: the standing tokens, less those it starts in or is dropped on) and searches round them when core's line crosses one (`crossesCircles`), in a fight and out of one; the drop then finds nothing in its way and walks the previewed path. Live: ruler 90 ft, charged 90 ft; onto Hero 7, ruler 80 ft, charged 80 ft. Not refused or capped by speed: the ruler now shows the cost (red past the token's speed) before the release, and Joe's rule is "take the longer route".
- **S1R2-04, a walled-in drop in a fight did not move.** Real (§15.1 deviation 7 says a way blocked by tokens walks to the last free spot). `freeOfOthers` cut core's line back to its last whole square, and a knight's-move line (8,3) → (1,1) has none before its end: cut to the start, nothing moved. It now cuts the squares the fight walks (`onSquares`, the same expansion the planner times, §15.2 S1R1-03). Live: walks 5 squares to (3,1), stops before Hero 2, "No route there".
- **S1R2-03, the Large alone off the grid.** Real (the rest of S1R1-07). `fitPath` backs to the last whole square on the line walked; a slanted line had none. It now takes the whole square nearest a point near the end where the body fits, one short straight step on (the body fitting all the way, the centre crossing no wall); with none, the old last-fit point. Live H7c: (9, 4).
- **S1R2-05, members grazing by 11 px.** Real, and by an explicit allowance: a pair that starts in contact was held to "no closer than it started, less `contact` (0.15)", so a member walking past the grabbed one waiting beside it could come 0.15 inside touching. The 0.15 is kept for a pair that starts overlapped (its first move may close in); a pair that starts just touching is held to 0.02 (`TOUCH_SLACK`). The pure planner reproduced it (crowd NE: -13 px) and no longer does; the 300 property scenarios still plan.
- **S1R2-02, a 70 px frame step at a player's own click-stop.** Not a defect: decision 2 snaps a click-stop out of combat to the nearest free square centre, up to about 0.71 square (diagonal) from where it is drawn, in one unanimated update. Larger distances are walked (0.4.12, HX1-07). Left as is.
- **S1R1-08, two players dragging at the same moment.** Real, stage 2 (the server-ordered reservations): neither plan can see the other before its updates arrive. Not changed in this round.

Seen on the harness, not in the Mac report: in a fight a six-member group whose members walk square by square, each continuation posted from a slow (swiftshader) page, drifts off its timing and members overlap (-20 to -100 px), on the old code and the new alike. It is the drift class stage 3's guard is for; the Mac round should watch movers < -15 in 7a.


### 15.4 Stage 2 as built (0.6.0): server-ordered reservations

**What it is.** A reservation is a plan's every walk: each member's centre path (squares), its start delay from wave 0 and its speed (`reserve-core.mjs` `encode`, a compact wire capped at 12 members × 160 points). It rides a token update's options (`pentarynMovementPlan`), and every move of a reserved token names its reservation (`pentarynMovementRid: { tokenId: rid }`). Every client keeps a registry (`reserve-adapter.mjs`) fed by `updateToken` (a reservation arrives: the next arrival number, `seq`, is its place in the server's order; idempotent by rid; it supersedes those tokens' older reservations and the one it `replaces`), `moveToken` (its own move sets the member off and fixes the reservation's clock on this client; a fight's next-square continuation, which core sends without custom options, keeps it by movement chain; any other move drops it) and `stopToken` (a stopped token stands where it is). A member overdue to set off by 1.5 s, or 1 s past the end of its walk, expires. Dropping a member is always safe: a token whose reservation is gone counts where it stands or walks, as in stage 1. A reservation only adds what is about to happen.

**Who reads it.** Every planner: a group (`prepare`: the reserved walks join the tokens walking now as timed walkers, with `delay` ms from now, negative for one part way along; their ends are `reserved` circles no rest slot may take; the anchor dropped on one takes the nearest clear spot), a single drag (`singleOut` / `singleFlow`: the smallest start delay, a multiple of 150 ms up to 3 s, with which it meets none of the reserved walks or the tokens walking now; with none it queues), and the repairs' "taken" spots (`takenFor`). A player reads only the tokens `countsForRoutes` keeps; a GM every token.

**Who writes it, and the race.** A planned group drop and a single drag reserve. Alone on the table (no other active user: `racers()`) the plan rides the first wave itself and nothing waits. With another user online the drop publishes first: an empty `doc.update({}, { diff: false, pentarynMovementPlan })` of the grabbed token. The server applies token updates one at a time and broadcasts each before the next, so when the publish's own promise resolves (its echo: core runs the update hooks before it resolves) this client has received every reservation the server ordered before it. Those that arrived after the plan read the registry (`snap`) are the race window: if this plan's walks meet one of them (`lostRace`, the timing pass's own `firstConflict`), this plan is the later one and is made again with them read (`replaces` the published one), at most twice; then the move goes, naming its reservation. The earlier one never waits for the later.

**Queue.** A planned drop with a member cut short, left standing or stopped short whose full way meets a reserved (or walking) walk does not stop short: it waits at its start until those walks are at rest (`queueUntil`, at most 8 s), then plans once more and goes with whatever that plan gives (cut, never through). A single drag that no delay up to 3 s clears queues the same way, once; after that it walks as far as it meets nothing (`singleCut`, settle's rule, on a whole square in a fight) and says "Another move is still in the way", or stays.

**Re-publish.** A stop needs no message: every client sees it (`stopToken`, or the stop's unreserved displace) and drops that member. The moves a stop or a cut makes afterwards carry their own one-token reservation riding the move (`republish`): a stop's walk on to its square (stop.mjs, through `groupRepublish`), the group's walk round a member another user stopped (`groupStopOne`), a door cut's walk to its square, in a fight too (`walkOnAfterStop`). A later wave whose walk is changed at send (cut at a door shut since, re-routed round a stopped member) does not name the old reservation, so every client drops it there and counts the token as it walks.

**Tests.** `test/reserve-core.test.mjs` (the wire, the registry's order / supersede / start / continue / drop / expire, the reads' filters, the race, a single drag's delay, the queue, the cut). `test/reserve-props.test.mjs`, 200 seeded scenarios each (stress-run at 1500): a later plan that reads an earlier reservation part way through it (0-1.5 s in, later waves still to go, in and out of a fight) never comes closer than touching to it, to a standing token or to its own members, sampled every 10 ms; a same-instant race: when `lostRace` says no, the two plans as made never meet (no false negative), and when it says yes the re-plan never meets the earlier one; a single drag that waits or is cut never meets a reserved walk; liveness: every plan reading reservations finishes inside its budget, every member rests within the stage-1 bound, a queue never waits past 8 s. Glue (`group.test.mjs`): the inline plan on a group's first wave and its rid on every wave; the registry through its hooks; a single drag that waits for another client's reserved walk; publish first with a race lost at the echo (re-published with `replaces`, then it waits and moves naming the second reservation); publish first with nothing before it; a hidden member left out; a group dropped where another move's walk ends rests clear of it.

**Deviations the source forced (stage 2):**

1. **The publish is an empty `diff: false` update, not a `planned: true` move.** Core 14.370 has two-phase moves, but a planned move puts every member in the `"planned"` movement state that dnd5e, Argon, the ruler and this module's own walker reads see (and `startMovement` costs one more update per member). The empty update core already uses for its stop / resume relays goes through the same server order, reaches every client (the `updateToken` hook fires) and resolves on the sender after its hooks ran, so the echo can be read exactly; the move itself is the same update as in stage 1, one round trip later. The 150 ms commit fallback is kept for a publish that fails or does not come back within 1.5 s.
2. **Publish first only when another user is online.** A race needs another client that can drop at the same moment; alone, the plan rides the first wave (the design's "the first update carries the whole plan" literally) and the drop is as quick as before. With the headless bot online this is every GM drop; acceptable (one round trip).
3. **Hidden tokens' reservations go nowhere, not "to GM users only".** Update options reach every client, and the kit has no GM-only channel without a new hand-written query (a C56 exception Joe has not decided). The only other GM client is the headless bot, which cannot plan, so nothing is lost today; a second human GM tab would not see the first one's hidden movers ahead. A player's planner never yields to a token it cannot count; the GM-side mover yielding live to a player's plan through a hidden token is the stage-3 guard's.
4. **The one-wide corridor claim is the space-time check plus the queue, and the queue is at the start, not at the mouth.** A reserved walk down a corridor meets anything walking it the other way at any time inside its window, so a later member is delayed past it or the drop queues until it is through; same-direction followers pass (single file). Walking to the mouth and waiting there is a pause in the middle of a walk, which out of combat needs a stop and a second move: the runtime guard's machinery (stage 3).
5. **A reserved member not yet set off still stands where it is.** Planners count it twice: as the standing token the server has (stage 1) and as its reserved walk. Conservative (nobody plans through its start before it leaves), and safe when its wave never comes (a group stopped by a click: its later waves are not sent, and nothing un-reserves them on other clients except the 1.5 s overdue expiry).
6. **Clocks.** Until a reserved member's own move arrives, a client takes wave 0 to start 100 ms after the reservation arrived (the publish-to-move gap is one round trip on the sender); the first member seen to set off fixes it. The 0.75-square lag of the timing pass covers the rest. A fight's continuations are posted square by square by the sender, so a slow page drifts off its reservation: stage 3's class.
7. **Ghost, the unconstrained tool, Ctrl waypoints, planned (API) moves and core fallbacks reserve nothing** (as in stage 1 they walk core's way); tokens drawn walking count as before.
8. **Version 0.6.0**, not 0.5.x: stage 2 adds wire options, hooks and a publish (0.5.2 was already live).

### 15.5 Stage 2, round S2R1 (0.6.1): what the live round found, and why

The Mac round (three real Chrome tabs, ZZ GM8 / Player8A / Player8B, latency emulated in page JS; no CDP) measured 0.6.0 clean on the round's main targets: same-moment drags (open room, the corridor head-on, 3 v 1) had 0 frames under −15 px between movers, nobody stayed in the corridor, the later publisher raced and re-planned every time; five through one door, the regression pass and the combat costs held. Three real defects:

- **S2R1-01 — a second group gave up with "No route there".** Root cause: a drop queued once. `deliver` queued while `d.queued` was false; the plan made when that queue was over went with whatever it gave. The queue's length is the end of the reserved walks its cut members meet, read when it was made; live walks run past their reservation (a wave held for a token in its way shifts the later ones, a member's move arrives late, a page frozen by fog) and other moves are reserved meanwhile, so 1 run in 3 found the corridor still busy, both members stayed, and the anchor's "short" said "No route there". Fix: the queue repeats while a walk is in the way, `RESERVE.queueMs` (8 s) in all (`queueNext`, shared by the group and the single drag); after that the plan goes as far as it meets nothing, and the notice says another move is in the way. Test: `group.test.mjs` "S2R1-01 … queues again" (F walks out of the door, G is reserved to step out of the door's mouth while the group queues: it queues twice and goes through; before, it went short at the first queue's end).
- **S2R1-03 — a GM single drag behind a group resolved to "stay" silently.** Same root cause in `singleFlow` (one queue, then `singleCut`), plus a notice that said "it stops short" for a token that did not move. The 1.7c case itself (Hero 7 hidden in the corridor, a player's group walking through it) is stage 3's: the player cannot plan round a token it cannot see, and the GM-side mover yielding is the runtime guard's. Fix: the same queue budget; a token left standing says "it stays where it is" (`notify.yieldedStay`). Test: "S2R1-03 … then goes the whole way" (fails before: cut to 400 px).
- **S2R1-02 — frame stalls, all tokens at once, 300-870 ms.** Not reproducible in node (a plan's steps there are under 9 ms), so the cause was found by reading what a slice can hold: `runPlan` checks its 8 ms budget between generator steps, and a route search was one step: `routeTo` runs its slices synchronously up to `ROUTE_MS` (250 ms). With reservations, more searches have no way (the reserved rest spots and the members still standing are circles it keeps round; a corridor plugged by them sends the A* over the whole map to its cap), and a slot try plus a lateral re-plan in one step is 500 ms. Fix: the oracle `routeSliced` (the drag route reuse first, then `pathfindRouteSteps` with a yield between 8 ms slices, the same 250 ms cap and `unfinished` flag), used by every route search of `planGroup` (anchor, members, reslot, lateral). `status().group.perf` measures the slices so the next round can tell this module's stalls from core's fog extraction (HX1-06) or another module's. Test: `s2r1.test.mjs` (every search goes through `routeSliced`, the plan yields between its slices, and the plan is the same as with one-go searches).
- **Not defects.** S2R1-04 (one drawn frame across a corner after a background tab came to the front: the route and rest are right; a long frame interpolates a straight jump), S2R1-05 (the H4 ruler read 185 ft 1 s after the pointer stopped, 195 ft before; the arrival is exact; the preview's search finishes on its own clock), the reverse single's 3.4 s start (its 3 s delay plus the publish's round trip), core broadcasting a hidden token's `_movement` to every client (core's, not a module payload; noted for Joe), and the v1 latency emulation's −100 px pass-through (acks not delayed: two clients each saw their own echo before the other's broadcast, which one ordered websocket cannot do; with v2 the race is detected every run).
- **Test harness note.** The glue tests froze `performance.now` (the planner's clock), which also froze the reservations' clock: a reserved walk never ended. The S2R1 tests and "a group dropped where another move's reserved walk ends" now run it on the mocked timers.


### 15.6 Stage 2, round S2R2 (0.6.2): what the live round found, and why

The Mac round (three real tabs, latency emulation v2) measured 0.6.1 clean on the same-moment drags (0 frames under −15 px between movers in the open room, the corridor head-on and 3 v 1, the GM's back-to-back drags too), five through one door (H1 exact, all at rest in 7.0-8.4 s), visibility (no hidden token's walk in any player payload), S2R1-02/-03/-05 and the regression pass. Two real defects, one not a defect, one environment note:

- **S2R2-01 — the grabbed member of a second group left at its start with the way clear (1 run of 5).** Two causes, one outcome, both a mismatch between what the plan checks and what settle or the queue checks:
  1. *The timing pass gave another move's walk no latency buffer in wave 0.* `conflictsAt` asked `sameWave = f.wave === wave`, and every walker the plan reads is given wave 0, so a member of the drop's own first wave was held to "one batch from one update, no buffer" against a walk of another move, which is never in that batch. It set off at once; settle, which already treats a foreign walk as never in the same wave, then found the 0.75-square buffer broken and cut the member back, or left it standing at its start (any cut point on its way was walked through by its own members behind it, the grabbed one first in a file). Fix: a foreign walk is never in the same wave (`!f.foreign && f.wave === wave`), so the member takes the start delay that clears it. Test: `s2r2.test.mjs` "keeps the latency buffer in wave 0 too" (a walk the buffer alone tells apart; before: cut at 5.25 of 14 squares, delay 0; after: a start delay, the whole way).
  2. *The queue asked a different question from the plan.* `queueFor` read the walks again at delivery and asked whether a short member's whole way from now meets one, at delay 0. A member cut for a walk it met only at the delay the timing gave it, or for one gone between the plan's read and its delivery (on the loaded Mac a plan's slices were 300 ms frames apart; a reserved walk counts until 1 s past its end; the queue's own timer fires at the end of the walks it waits for, so the plan after a queue reads walks in their last second, drawn ones lagging on a slow tab), was committed short: "Another move is still in the way: it stays where it is" with the corridor clear, which is the run's evidence (`stayed 1`, `queued 5`, the last plan ~1 s after Player8A's group came to rest, well inside the 8 s budget). Fix: settle records which walk each member gave way to (`walks`, on the plan's member entries), and the drop queues for those walks too (until they are at rest; one delay step when they are gone), then plans again; the 8 s budget still bounds it, and a member short for a standing token never queues. Test: `s2r2.test.mjs` (settle names the walk; `queueUntil` with `blamed`: before, nothing to wait for).
- **S2R2-03 — a player's group walked through a hidden token the GM was moving (−89 to −99 px).** The players cannot plan round what they cannot see, and the design's visibility rule says the GM-side mover yields. The GM's single drag of hidden Hero 7 queued, as it should, but at its start, which was on the players' reserved way. Fix (stage 2's share of it, the planner's): a hidden token whose single drop has to wait (a start delay or a queue) where a walk this client reads will come through it (`throughStanding`, reserve-core) first steps aside (`stepAside`, group.mjs): the nearest free spot no walk passes through, a short straight step clear of walls, on open floor, clear of every token at rest and of the reserved ends; its way to the drop point is found again from there and the flow goes on (queue, delay, publish). While it queues it looks again every 500 ms, so a walk reserved meanwhile through it is seen. Out of combat only (a step in a fight costs movement). `status().group.reservations.aside` counts the steps. Test: `group.test.mjs` "S2R2-03" (before: it queued 8 s at its start in the walk's way and stayed; after: one step off the walk, then it goes to its drop point). **Not covered, Joe's call:** a hidden token nobody is moving (an ambusher standing in a corridor) is still walked through by a player's group; moving it out of the way is a gameplay decision, not a planner's. A GM's *group* with a hidden member that queues does not step aside yet (the group case was not in the round).
- **Not a defect: S2R2-02 (the reverse single's start 3.4 s against 3 s).** The 3 s is the largest start delay tried (`RESERVE.singleMs`), counted on the reservation's clock, which every other client starts at the publish's arrival (`estimateMs`) and fixes at the move's; the publish's round trip on top is the design's "one round trip standing". Counting the delay from the read instead would start the token up to one round trip plus 100 ms before every other client expects it, more than the 0.75-square buffer covers. Left as is.
- **Environment: S2R2-04 (frame timing on the loaded Mac).** 150-3402 ms frame gaps with 0 script time in the long-animation-frame entries (a 13 GB python process at 83 % CPU), while `group.perf` never saw this module over 54.5 ms. No overlap was measured either side of the gaps; the frame-feel figures need an unloaded machine.
- **Test-suite note.** `pathfind.test.mjs` "teleport / change-level regions" failed once in four full runs under parallel load (a drag's synchronous search budget); it passes alone and was untouched by this round.

### 15.7 Stage 2, round S2R3 (0.6.3): what the live round found, and why

The Mac round measured 0.6.2 clean on the same-moment drags (S1R1-08: 0 frames under −15 px between movers, 0 against standing tokens, raced 1 / replans 1 on the later client), on S2R2-01 (5 of 5 second groups moved everyone) and on five through one door (H1 exact, all at rest in 7.1-8.2 s). S2R2-02 is within its 3 s. Two deviations were found:

- **S2R3-01 — after stepping aside, the GM's hidden Hero 7 walked back through standing Hero 5 (−58 to −60 px for about 0.6 s, 3 of 3).** Real. Root cause: `stepAside`'s way on from the aside spot was a plain `pathfindRouteTo` with no `avoid`, so it got core's way (walls only), and the straight line back to the route crossed Hero 5's square. Everything else a single drop walks goes round the tokens standing outside it (`aroundOthers`, stage 1). Fix: the way on keeps clear of every token standing outside it (`othersOf`, not one it starts or ends in) however long, searched in slices (`pathfindRouteToAsync`). With no way round, it takes core's way only as far as it meets none of them (`freeOfOthers`), never through. The step aside itself also refuses a straight step through a standing token. Test: `group.test.mjs` "S2R3-01". Before the fix the way on was one straight leg through the standing token; after it, every leg keeps a whole token clear.
- **S2R3-02 — two members of one GM group overlapped by −51 px for 2.3 s while the GM tab stalled for 415-684 ms per frame (1 of 7 funnels).** Real, and a drift in the drawing, not in the plan: the module ran 3 slices, 38 ms at most. Root cause (read in core 14.370): `CanvasAnimation.animate` runs a tween's first frame synchronously and adds its ticker listener afterwards, between frames. The first tick it then gets carries the whole interval since the tick before (PIXI's `elapsedMS`, uncapped since `minFPS` is 0), which includes time from before the tween existed. A chained link is fine, because core carries the exact overshoot (`time = context.time - context.duration`). A *fresh* move whose update arrives just after a 684 ms frame, though, is credited up to 684 ms it never walked. Members already walking get only their own time, so on that client the later starter is drawn up to a stall's worth ahead along its way, onto the member before it in the file. Wave timers and the 0.75-square buffer cannot cover a 0.7 s jump. Fix: the existing `CanvasAnimation.animate` wrap (stop.mjs) wraps a fresh token movement tween's listener before core adds it, and the first frame is credited at most the wall time since the call (frames under 50 ms over are left alone). Chained links and other animations run as core runs them. `status().stop.firstFrames` counts the cuts. Test: `animate-registration.test.mjs` "S2R3-02". Before the fix, a tween that began 20 ms before a 700 ms frame was credited 700 ms; after it, 20 ms. This is a removed cause, not the stage-3 guard. Any drift left under stalls (a wave timer and its echo landing on different sides of a stall) is still stage 3's, and it now shows only as the timers' own lateness, which `fire` already shifts the later waves by.
- **Not a module defect: H9 #1's click-stop never fired.** The test kit's trigger is a pixel window that Hero 4 jumped across between two stalled frames, so the click was never sent. The click path was not exercised. H9 #2 and #3 passed.
