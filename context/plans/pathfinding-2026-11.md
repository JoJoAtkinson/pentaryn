---
title: "Drag pathfinding and group movement — pentaryn-movement 0.3.0 → 0.10.0"
status: built
last_modified: 2026-11-24
tags: [foundry, plans, movement, pathfinding]
---

# Drag pathfinding (pentaryn-movement 0.3.0)

**Read this when:** you are changing how a dragged token finds its way around walls, or wondering why it was built this way. **Not this file:** using it → [`../../foundry/module/pentaryn-movement/README.md`](../../foundry/module/pentaryn-movement/README.md) ("Drag pathfinding").

**Status (2026-11-24):** 0.10.0 (§18) is built, live on the world pentaryn and handed over for Joe's play-test (§18.9, [`movement-0.10-handoff.md`](movement-0.10-handoff.md)); `main` keeps 0.8.5 until he has judged it. Earlier status (2026-11-23): built and live since 0.3.0 (main); 0.4 → 0.7.5 hardened through the hard-case and acceptance rounds of §15; 0.8.0 (§16) is the tiered redesign after Fable's review; 0.8.1 (§16.9) adds the simulator and its first fixes. Tier A and B are on, tier C (fight group drags) ships off until it passes its rounds. Use-doc: [`../foundry/movement.md`](../foundry/movement.md).

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

Built on branch `feat/movement-0.4` (0.4.0), unit-tested (`test/group-core.test.mjs`: the twelve unit acceptance tests above plus the decision tables; `test/group.test.mjs`: the two wraps). Synced and play-tested live from 0.4.1 on (the rounds of §15; no round came back clean twice, which is what led to §16). Use-doc: [`../foundry/movement.md`](../foundry/movement.md).

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
2. **Planning wait 300 ms** (`GROUP_LIMITS.totalMs`, was 1 s; `memberMs` 150), then core's drop. *Amended 0.4.11 (live H4-02, a slow tab fell back 3 of 5 times): the plan's own work is capped at 2.5 s (`totalMs`), one member's at 400 ms (`memberMs`), and the silent wait at 5 s on the wall clock (`waitMs`). 0.8.0: all of it inside the move's one 10 s deadline (§16.4).*
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

### 15.8 Stage 3 as built (0.7.0): the runtime yield guard

**What it is.** A safety net under stages 1-2, never a planner: `guard-core.mjs` (pure) and `guard.mjs` (the feature). Each client watches only the moves it started (`doc.movement.user.isSelf`) on the canvas ticker, after the frame's tweens (PIXI `UTILITY` priority), and only while it has one to watch: every 50 ms out of combat, every frame in a fight while a square is walked. There are no timers, so a reload mid-move leaves none behind. A check reads a snapshot of every token as drawn on this client (a player's: only what `countsForRoutes` keeps), bucketed on a 2-square grid, so one mover's check costs O(tokens nearby). It also reads the reserved walks not yet set off (stage 2's registry). It looks along the mover's way 450 ms ahead (a fight: the rest of its square and the next, two squares when the next is a doorway, plus 150 ms), sampled every 15 ms. It fires when that way would come inside touching by more than 0.1 square (the acceptance bound) of a token it gives way to. A pair already further in than that may never get closer (by more than a hair, or by `MOTION.contact` for two members of one plan, as their planner allows). Every firing is logged: a console info line naming both tokens, and `status().guard` (counts, perf, the last five).

**Who gives way (`yieldsTo`).** Every mover gives way to a token standing still. Of two movers, the later in the server's order gives way; a mover never gives way to a later one's way, so two clients never both yield for one meeting. A hidden mover gives way to a mover a player started (that player's planner and guard cannot see it), and a player's guard never counts a token hidden from it. The order is each move's place, counted on one counter by the reservation registry (`reserve-core` `claim` / `priorityOf`, fed by the `moveToken` hook every client already runs): a reserved move takes its reservation's arrival and its place in the plan (`k`, its index on the wire, which `walksOf` now writes in the plan's timing order); an unreserved move takes its own arrival; a fight's next square keeps its move's place, and so does a guard move.

**How it gives way.** Out of combat it stops where it is drawn: stop.mjs's displace, unanimated, at the drawn spot, marked `pentarynMovementGuard`. When standing there would leave it in a higher mover's way, it steps back to the nearest spot within 1.5 squares that keeps 0.1 square off that way (`asideSpot`: open floor, no wall between, not in a doorway, clear of standing tokens). It then walks the rest of its way again, re-published, once that way has been clear for 150 ms (and it waited at least 250 ms). Clear means two things: nothing it gives way to within the horizon, and no token standing anywhere along the rest of the way (`standingOnRoute`). In a fight core's `pauseMovement()` holds back the next square's continuation. The token finishes its square and waits on it, and the callback resumes the same movement, so nothing is displaced and dnd5e charges exactly the squares walked. Since a pause is decided while a square is walked, and the next square is looked at two squares deep when it is a doorway, a member waits before the door rather than in it. 3 s after its first yield (`stepYield`'s clock) it re-routes once, round what stands and the mover it gave way to, however long (a fight: stopped, then the new way with a checkpoint every square). At 8 s it rests on the nearest free spot (a fight: the square it is on) with a quiet notice. A click on a token it holds, or any stop it did not make, lets go.

**Tests.** `guard-core.test.mjs` covers the rules, the look ahead, the resume check, backing out, a fight's horizon, the clock, the bucket grid and the claims. `guard-props.test.mjs` runs 200 seeded scenarios per property, out of combat and in a fight, and was stress-run once at 4000 seeds (not committed). Each scenario has 2-6 movers (a Large among them) with random places in the order and start delays, walking ways that cross each other and run through up to six standing tokens and each other's ends; the guard runs as the glue runs it, and positions are sampled every 5 ms. The properties: no mover comes inside touching by more than 0.1 square (plus 0.03 of sampling slack) of anything; nobody gives way to a later mover's way; every mover is at rest within its bound (two walks plus 8 s); and in a fight every mover rests on a whole square and pays for exactly the squares it walked. `guard.test.mjs` drives the glue on a synthetic board. It covers: only this client's moves; a standing token ahead (stop where drawn, logged, walk on once clear); the order between two movers and the hidden rule; a player never counting a hidden token; in a fight pause and resume with no displace, before a door; a 3 s re-route and an 8 s rest with the notice, in a fight a stop; a click letting go; and 6 movers among 60 tokens costing well under a frame.

**Deviations the source and the tests forced (stage 3):**

1. **Version 0.7.0, not 0.5.2.** 0.6.3 was live; stage 3 adds a feature, hooks and a status key.
2. **The order is one counter for reservations and plain moves (`claim`), not the registry's `seq`.** `seq` counts reservations only and race windows read it, so it is left alone. Within a plan, "plan order" is the wire order, which `walksOf` now writes in the plan's timing order (it was the drag's order).
3. **"A mover never yields to a lower-priority mover" has two exceptions, both found by the property test.**
   - In a fight, a square already under way is committed: core cannot stop a token inside a square. Everyone keeps clear of another's square under way whatever the order, and a paused move counts as standing where its square ends (core relays the `"paused"` state to every client). Without that, a lower mover that paused on the square it was walking into stood in the higher one's way, and the higher one was already committed past it (0.29-1.0 square inside, about 1 seed in 20).
   - A yield that goes on again starts afresh, like a new drop: it waits for every mover's way, and in a fight for an earlier paused one's, so of two held only one sets off at a time. Without that, a higher token's resume and a lower one's next square were committed on the same frame.
4. **Out of combat a pause is a write.** It is an unanimated stop where the token is drawn (two writes per yield: the stop, then the walk on), because core has no pause for a move whose whole way is already on the server. The design's "no out-of-combat displacing" is read as never moving another token. The guard only ever writes the token it is guarding, at the spot where that token is drawn.
5. **Backing out is out of combat only.** In a fight a step aside costs movement and has no continuation to withhold. The lower mover waits on its square, the higher one gives way to it standing, and the 3 s re-route or the 8 s rest settles it.
6. **A fight's first square is the drop's.** Core sends it with the move, so the guard can withhold only the squares after it. Keeping the first square clear stays with stages 1-2, and the property test treats a pair met inside a first square as the planner's until the two are apart again.
7. **Visibility.** Stage 2 deviation 3 stands: hidden tokens' reservations go nowhere. The GM-side guard is what makes a hidden mover give way to a player's mover, at runtime rather than in the plan.
8. **The snapshot is O(tokens on the canvas) a tick; each mover's check is O(tokens nearby).** Reading every drawn position once is cheaper than a hook-kept index. The glue test bounds a tick, and `status().guard.perf` (`maxMs`, `over4`, `over16`) measures it live.
9. **A resume walks the rest of the old way.** When it had stepped aside and the straight leg back meets a wall, it goes through the spot it left first. Only the 3 s re-route searches anew.

**Not done here:** the live acceptance runs (HX2a/HX2b with three real clients and 105 ms injected latency), and the "guard fires in under 5 % of clean-plan runs" count. Both need the Mac round. The guard's console line and `status().guard.fired` are what that round reads.

### 15.9 Stage 3, round S3R1 (0.7.1): what the live round found, and why

The Mac round (three real tabs, the GM and both players; one run with latency emulation v2; an unrelated process at 77 % CPU, 300-1100 ms frame gaps) measured 0.7.0 clean on zero console errors, a cheap guard (at most 1.6 ms a check), S2R3-01 and S2R3-02, out-of-combat door cuts, the regression pass and combat costs. It found a guard that fired on 45 % of clean runs and, where it mattered (players stopping members, door cuts, reloads), let overlaps through or made new trouble. Each traced in the source and pinned by a test that fails on 0.7.0:

- **S3R1-01 — the guard fired on 14 of 31 clean runs (GM funnel 10 of 10), at d 0.87-0.90 against 0.9.** Real, and not drift: a misreading of where a mover is. `routeAhead` (motion-core) took a later leg only when it was 0.5 nearer than the best so far, so a token drawn up to half a square past a corner, or on a fillet's later chord (every chord of an arc lies within half a square of the next), was put back on a point it had already passed. Its way ahead then began with a leg back to that point: about one square (170 ms) behind where it is going. A follower in the file "caught" the leader it read late, and a member walking round another at touching cut back across the arc; most firings and the aside steps after them cascaded from that. The planner read walkers through the same function (`remainingFrom`). Fix: the nearest leg wins; the earlier only when as near within 0.05 square (a route that doubles back), in the route's own units (the door cut's pixel route passes 0.05 square in pixels). Tests: `h4.test.mjs` "S3R1-01" (a corner, an arc's chords, a doubling route), `guard.test.mjs` "S3R1-01" (a file round a corner: no firing; it fired before). The rest of the firing rate needs the Mac round's count; the combat firings there are drift as well (each square's continuation adds a round trip).
- **S3R1-03 — a player's stopped member and the GM's members passed through each other (-45 to -77 px, up to 1.6 s).** Real, two causes. (1) The stop's walk on (HX1-07: a roomy square out of the corridor, reached by a displace to the near square, then a walk) was never checked against anyone walking: in (b) the roomy square was back in room A and the walk went head-on down the corridor through the GM's file. `walkOnMeets` (stop.mjs) now tests that walk against the tokens drawn walking and the reserved walks still to set off (`walkersMeet`, the planner's own test); when it meets one, the member stops on the nearest free square (decision 2), and a walker behind gives way to it standing. (2) Once two movers of different moves were inside each other, the guard held them only to "never closer", so walking on side by side at -77 never fired. `conflictAhead` now fires for such a pair unless the walk opens the gap within 150 ms (`GUARD.apartMs`); the higher one, not yielding to a lower mover, then walks off a token standing still. Members of one plan that start stacked keep their planner's allowance; a token standing still keeps "never closer" (a walk off it must stay possible). Tests: `group.test.mjs` "S3R1-03" (the walk on through a walker is not made; before: two writes), `guard-core.test.mjs` "S3R1-03".
- **S3R1-06 — the GM's guard re-route undid a player's stop.** Real. The guard's `moveToken` hook returned at once for a move another user made, so the yield survived the player's displace; the GM's re-route, searching in slices, then wrote its way and Hero 3 walked on to its old slot. A move of a guarded token by another user now lets go of it (`overridden`), and every write the guard has in hand (a step aside, a resume, a re-route, the rest) checks first that the yield is still its and the move still this client's. Test: `guard.test.mjs` "S3R1-06" (before: the re-route's walk was written).
- **S3R1-05 — a stopped member rested on the A-B door's line.** Real. The guard's out-of-combat pause stopped where the token was drawn, a door's line included, and its 8 s rest moved only off another token. A pause drawn across a door's line now steps to the nearest spot off it, on its own side (`offDoor`), and the rest treats a doorway as taken (`clearOfWalls` never leaves a body across a door's line). Test: `guard.test.mjs` "S3R1-05".
- **S3R1-02 — aside steps through the doorway and back, once into a paused member (-28 px).** Real. `spotOk` refused a wall and a doorway spot but not a step through a doorway, and the aside's tokens to avoid were the standing ones only, so a member the guard had stopped in the same tick (still a mover in that tick's snapshot), or any token walking there, was not in the list. A step now never crosses a door's line (`crossesDoor`, group-adapter), it avoids every token where it is now (`circlesOf`), and a token the guard stops is marked standing in the tick's snapshot at once. Test: `guard.test.mjs` "S3R1-02" (both halves fail on 0.7.0).
- **S3R1-04 — a re-route round the whole dungeon (42 squares, at rest about 60 s after the drop).** Real: the re-route took any way "however long". It now refuses a detour nobody wants (the planner's `detourTooLong`: longer than the way it replaces by more than 4 squares or half that way) and waits on to the 8 s rest, short of its spot. Joe's "take the longer route" is decision 8, for a Large facing a narrow door; it is the planner's, not the guard's. Test: `guard.test.mjs` "S3R1-04".
- **S3R1-07 — after the GM's reload the later waves moved 10+ s late, and the re-joined GM tab drew them at their starts.** The late moves are real: `resumePending` sent a group's unsent waves whenever the page came back within 60 s, keeping only their spacing, so a page that took 10+ s walked a stale plan into members long at rest; every other client had dropped those reservations 1.5 s after they were due. Past `RESERVE.overdueMs` the waves are now dropped: the members stay where they are, the dragger is told (`notify.wavesDropped`), `status().group.resumed.dropped` counts them; a page back within 1.5 s still resumes. The re-joined GM tab drawing them at their starts with no animation was not found in the source (the moves were ordinary animated moves; the tab's drawn position follows its own tweens); a tab in the background runs no animation frames at all (the round's harness note), which is the likeliest reading. With no late moves it no longer arises. Test: `reload.test.mjs` "S3R1-07".
- **S3R1-08 — a fight's door cut drew a member across the shut door and left it in the corridor.** Real, and S1R1-06's mechanism: core can stop a fight's move only at the end of a square, and the square was committed while the door was open (the square under way crossed the line, or its continuation was already on its way to the server when the door shut, so `stopSafely` waited for it to land). The guard had only shifted the timing onto the door. Now, once stopped, a member whose square lies across that wall from where it was drawn when the wall shut has that square undone as core's `revertRecordedMovement` writes an undo (back on the last recorded square on the near side, `_movementHistory` cut there, `isUndo`, unanimated), its tween first stopped where it is drawn, so no client draws it across and dnd5e charges exactly the squares walked. Test: `group.test.mjs` "S3R1-08" (both cases).
- **S3R1-09 — the owner's reload in a fight ends the group move after the first square (minor).** Real, not changed: core holds a fight's continuation in the initiating page's memory, and a reloaded page has no way to continue that movement; the members' later waves are now dropped like any other late wave. Clean and at rest; the player drags again.
- **S3R1-10 — two wall crossings drawn in one frame at H6b's U-turn after an 885 ms frame gap.** Not a module defect (S2R1-04): one long frame jumps the drawn token along its route, and the kit's line between two frames cuts the corner. The route avoids the secret door.

### 15.10 Stage 3, round S3R2 (0.7.2): what the live round found, and why

The Mac round (three real tabs; an unrelated process at 112-134 % CPU, so every frame number is LOADED; door shuts measured within +32 ms of 500/800/1500 ms after the drop) gave 0.7.1 a clean bill on S3R1-01 (clean firing 1 of 31 runs, 3.2 %; GM funnel 0 of 10, was 10 of 10; contested 0 of 10), S3R1-03's overlaps (0 frames below -15 between movers, none below 0 against the stopped token), S3R1-06, the door lines (S3R1-05/-02), liveness (S3R1-04: no re-route over 26 squares, all at rest within 10 s), the GM's reload (S3R1-07: two members stay, the notice shown, drawn = doc on all tabs at +0/+10/+20 s) and the fight door cut's crossings and costs (S3R1-08). Zero console errors. It found:

- **S3R2-01 — a click-stopped member parks on the corridor square (11,5) and strands everyone behind it (7 of 7 runs).** Real, made by 0.7.1's S3R1-03 fix: when the walk on to the roomy square met a walker, the fallback was the nearest free square, and inside a one-wide corridor that is the corridor. The roomy square chosen first was back in room A (nearest), through the GM's file; room B ahead, the way the file walks, was never asked. The stop now asks every roomy square in reach for one whose walk on meets no walker (`walkOnTest`, stop.mjs; the planner's `walkersMeet`, read once per stop) before it falls back; a far square it could not walk to is never taken (no jump, HX1-07). Stopping short in the corridor stays the answer when no roomy square is free of every walk (a dead-end corridor): stopping short beats overlapping. Tests: `group.test.mjs` "S3R2-01" (before: one write, the corridor square), "S3R1-03" now on a dead-end corridor (the fallback kept).
- **S3R2-04 — the GM's H9 whole-group stop left the clicked Hero 4 in the corridor (2 of 2; S3R1 had it at (9,5)).** Real, a regression of the same fix: the stop loop handles the clicked token first, while the rest of its group, stopped by the same click, are still drawn walking (and their reservations still live), so `walkOnMeets` read them as walkers and the walk out of the corridor was refused. Every token of the stop is now left out of the walkers and the reserved walks. Test: `group.test.mjs` "S3R2-04" (fails on 0.7.1).
- **S3R2-02 — a fight door cut at about 1.5 s: Hero 3 and Hero 4, both moving, -66 px for 264 ms (one run).** Real, not fixed in 0.7.2. The guard's log shows Hero 4 giving way late (its square under way already reached Hero 3, read standing between two squares) and Hero 3 then going on. The likeliest hole: in a fight a mover between two squares is never looked at (`look` returns while `state === "pending"`), and core sends the next square at the end of the last one, so a next square is vetted only during the square before it; a pause the guard made meanwhile (Hero 3 for Hero 5 at 1886 and 2320 ms) is seen by the follower only once its own next square is already committed. Closing it means vetting the continuation at the moment core sends it (a wrap of the continuation, or withholding every next square until a look has passed it), which changes the fight's timing on every square: it needs a live repro first, not a guess. One run of eleven fight runs.
- **S3R2-03 — the owner's reload in a fight leaves a member at rest inside the corridor ((12,5), 15 ft).** Real, the S3R1-09 mechanism (core holds a fight's continuation in the initiating page's memory, and a reloaded page cannot continue it), now visible because the group gets further before the reload. Not fixed: the re-joined page no longer has the member's way on (which the corridor settle, S1R1-05, walks along), so moving it would be a guess at a route. The GM or the player drags it on. Open.
- **Combat six still fires the guard 11 times on a clean run** (costs exact, worst -15 against a paused member): drift between the plan's timing and each square's round trip, as noted in 15.9. Not a defect by the design's measure (a brief yield is fine), but the only clean firing left.

### 15.11 Stage 3, round S3R3 (0.7.3): what the live round found, and why

The Mac round (re-run as S3R3b after the Monday update had taken the tunnel down; three real tabs; an unrelated process at 94-137 % CPU, so every frame number is LOADED; door shuts within +36 ms of 500/800/1500 ms after the drop) confirmed S3R2-04 fixed (2 of 2), S3R2-03 fixed-looking (1 run), the clean firing rate at 1 of 33 (3.0 %; contested 0 of 10), zero console errors, liveness, reloads (drawn = doc on all tabs) and every S3R1 fix. It found:

- **S3R3-02 — S3R2-01 not fixed: a click-stopped member still rests on the corridor square (11,5) and strands the GM's members behind it (7 of 7, also with 105 ms emulated latency and with Player8B's Hero 6).** Real. 0.7.2's search for another roomy square went through `clearOfWalls`, whose candidates must be a straight line of sight from where the token is drawn. The A-B corridor ends in the two rooms' walls, so from inside it the only roomy squares a straight walk reaches lie on the corridor's own line ((13,5)…(15,5), and (14,4)/(14,6) at a grazing angle), and every one of them is on the walk of the GM's members filing up behind to their slots just past it; with none left the fallback is the near square, the corridor (the record `{walkOnBlocked: 1, walkOnAround: 1}` most likely counts two different members of the four stopped). 0.7.2's test passed because its corridor walls ran on into open floor, where a diagonal from the corridor reaches squares off the line. Fix (`walkOut`, stop.mjs): when the straight search finds nothing, or the stop would rest in a gap, every free roomy whole square within 3 squares of the near square is asked, nearest first, reached by the pathfinder's short route from the near square (walls, open doors, round every token's circle), at most 6 squares, every point clear of every token, and the whole walk tested against the walkers; 24 ms in all. The displace still goes to the near square and the walk on follows the route (never a jump, HX1-07). One refinement the test forced: a walker coming up behind along the way the member walks out by (heading within 45° of its first leg, behind its start) is a file, not a meeting, so it is held to touching without the 0.75-square latency buffer; it keeps its distance or gives way to the member standing (the guard). A head-on or crossing way keeps the buffer, so S3R1-03 (the walk back down the file) stays refused. Stopping short in the corridor stays the answer when nothing is free (a dead end). Test: `group.test.mjs` "S3R3-02" (the live geometry: a two-square corridor between two rooms' walls, three walkers behind to slots past its mouth, a stopped member beside it; fails on 0.7.2 with the corridor rest).
- **S3R3-03 — S3R2-02 not fixed: a fight door cut at 1.5 s, Hero 3 and Hero 4 both moving, -65 to -67 px for 264-282 ms (3 of 3, deterministic).** Real, and not the between-squares hole 15.10 guessed. The final squares and costs (Hero 3 three squares to (10,4), Hero 4 one square to (10,5)) and the guard's "Hero 4 gives way to Hero 3 (standing, 165 ms ahead, late)" fit one mechanism: after the cut, the square before the door went to Hero 4 while Hero 3 still stood on it, and Hero 3's step off it and Hero 4's step in were sent independently, each its move's first square. Core sends a fight's first square with the move (deviation 6 of 15.8), so the guard can withhold only the squares after it: it fired "late" and could do nothing. The cut's re-settling was the last fight move sent with no look at what is drawn. Fix: `guardFirstClear` (guard.mjs) vets a fight move's first square at send time: the walk from where it is drawn to its first waypoint, plus `GUARD.cellSlackMs`, must come inside touching (less 0.1) of nothing — a token standing (a paused one where its square ends), a square under way, a way a token walks now. A move about to be sent is the latest in the server's order, so it gives way to every move under way; to a reserved walk still to set off it gives way by the order (two held waves never wait on each other). A door cut's walk on (`walkOnAfterStop`), and the guard's 3 s re-route, wait for it in 50 ms looks, 4 s at most, then stay where they are (stopping short beats walking into anyone; `status().group.cut.gaveUp`, `status().guard.gated`). In S3R2-02's order Hero 3 steps off first (Hero 4 stands, so its way is clear), and Hero 4's diagonal step into (10,5) would pass 0.71 square from Hero 3 on (10,4), so it stays on (9,4): no overlap, one member a square short. Test: `group.test.mjs` "S3R3-03" (a cut member's walk on into the square another is drawn leaving: not sent until it has left; sent on 0.7.2 at once).
- **S3R3-04 — combat six: Hero 6 and Hero 1, both moving, -20 px for 264 ms, after -20 against Hero 1 paused (minor, clean run, 11 firings as in S3R2).** Real, the same class: Hero 6's later wave went on the plan's time, and its first square ran into Hero 1, which each square's round trip had put behind the plan and the guard had paused there; the first square was committed with the move. A fight's later wave now asks `guardFirstClear` for each member, its own group's members included, and waits in 50 ms looks (4 s at most; then only the members whose first square is clear go). Test: `group.test.mjs` "S3R3-04" (a wave due with a member of its group paused on its first square: held, then sent once clear; sent on 0.7.2 on time). The 11 firings themselves are drift (each square's round trip), a brief yield by the design's measure; whether the gate lowers them is for the next round.
- **S3R3-01 — the Monday unattended update took the tunnel down and left space-journey active (environment).** Not a movement defect. The updater's world restore, `/setup` parking and failed-rollback reporting were fixed separately (merge `fix/updater-world-restore`, 2026-11-23); the failed enhancedcombathud rollback and the held ddb-importer are Joe's to review (`.state/logs/vtt-update-2026-11-23.log`).

### 15.12 Final acceptance round 1, FR1a (0.7.4): what the live round found, and why

The Mac round (three real tabs plus the bot, 105 ms emulated latency on both player tabs, an unrelated process at 140 % CPU, so every frame number is LOADED; two player drags only from background tabs, which Chrome neither renders nor times) passed C1 at rest (0 overlaps in 210+ runs), C4 corridor (GM-driven), C6 bot-only, C7 performance (no long frame with this module's code; guard fire rate 2.5 %) and failed C2 in motion. Each finding was traced on the BOSS harness (ZZ GM8 and Player8A pages on ZZ H Dungeon Lab, real pointer drags, the player's socket delayed 52 ms each way in page JS) before it was changed:

- **FR1-02 — a fight door cut at 1.5 s: Hero 4 into the standing Hero 3, -100 px (2 of 3; BOSS 1 of 36).** Two holes found in the cut's own writes, both fixed; the BOSS run that reproduced it (both drawn on (10,5) for 6 s, then set apart) had no undo in it, so a third path may remain and the next round should watch it. (1) The undo of a square past the shut door (S3R1-08) went back to the last recorded square on its side whether or not another token had stopped there since: an unanimated jump onto it, -100 px. It now takes the latest recorded square on its side that no token holds or a cut member claimed (`undoIndex`), claims it at the cut so no member cut after it takes it, and with none is not undone (`status().group.cut.undoBlocked`; stopping short beats overlapping). (2) A cut member left on a held square walked off to the nearest free square in one straight waypoint, committed whole with the move, so the guard could not hold it and the line ran through the token beside it. The square is now one whose straight walk passes no token (`walkThroughAny`), and in a fight the walk has a checkpoint every square. Test: `group.test.mjs` "FR1-02" (fails on 0.7.3).
- **FR1-05 — a fight door cut at 500 ms: Hero 5, setting off after the shut, drawn across the door and back (1 of 10).** Real: the cut looks only at moves under way when the wall shuts, and a later wave sent just before the shut landed after it, its first square (committed with the move) past the door. The shut wall is looked at again 250 and 600 ms later (`RECUT_MS`); cutting is idempotent. It still costs a frame or two of drawing across on a remote client (the square is committed before anyone knows); undone at the exact cost. Test: "FR1-05".
- **FR1-03 / FR1-04 — a player's click-stop during the GM's drag: the GM's Hero 6 caught the walking-out Hero 2 (-74 to -77 px, 10 of 10) and ran into it at rest; in room A, Hero 5 and Hero 6 overlapped (2 of 10).** Real, and the priority rule was the cause: the stop's displace and walk out were new moves, last in the server's order, so of the GM's members following up the corridor behind it none gave way to it, and its walk out held them only to touching (S3R3-02's file rule, no latency buffer). A click-stop's own moves now keep the token's place (`pentarynMovementKeep`, `claim(..., { keep })`, every client), the place it had in the GM's file; a follower later in that order does not count against its walk out (it gives way, the guard), one earlier keeps S3R3-02's rule, and unknown places keep it too. On BOSS with the player's latency the walk out also ran out of its 24 ms search on a swiftshader page (`status().stop.last.walkOut`: `time` 1) on squares back toward the file and left Hero 2 on (11,5) in 2 of 3 runs: the search now asks squares ahead of the way it walked first, 40 ms in all. After both: 9 of 9 corridor clicks walked out to (14,4)/(14,5), the GM's Hero 5/6 reached their slots, no frame of either page below -10 px. FR1-04 did not reproduce on BOSS (0 of 3). Tests: "S3R3-02" (the keep option on both writes), "FR1-03" (the registry keeps the place).
- **FR1-07 — H4g refused with "No route there" (plan/anchorNoRoute).** Not reproduced on BOSS (every registered drag of it planned and arrived, 3 of 3; on a page at 6x CPU throttle it fell back on `budget`). The one path to `anchorNoRoute` with a way there: the anchor's search round the tokens finished with nothing, and the way that ignores them (`toward`, a synchronous 250 ms search) only ran out. That search is now finished in slices (`routeLong`, avoid nothing); still unfinished, the drop is a budget fallback, never "No route there". Test: `group-core.test.mjs` "FR1-07".
- **FR1-08 — the ruler read "25 ft / 65 ft" for the 195 ft route.** Not changed: the drag's search has a wall-clock cap (4 s, frames between slices included) and on a loaded or background tab its slices are far apart, so the ruler keeps core's line until the search is done; the drop searches anew (it arrived).
- **FR1-10 — a player's reload 1.2 s after its drop: the unsent members stayed, no notice.** The members staying is S3R1-07 (past 1.5 s every client has dropped their reservations). The notice was called at `ready`, where a player's page never drew it: now 1.5 s after ready, and permanent. Test: `reload.test.mjs` "S3R1-07" (the notice permanent).
- **FR1-11 — a hidden token's id with the module's group / reservation keys in a player's frames.** The module never put a hidden member in a reservation; the keys rode the same batch update as the hidden member's move. A batch with a hidden member is now sent by the module (never core's one drop batch), the hidden member's update on its own with none of this module's options, and the reservation is published on a member every client may see. Core's own update of a hidden token still reaches every client (its waypoints are core's). Test: "0.6.0: a hidden member is never in a reservation" (now: sent apart, no keys).
- **FR1-12 — an uncaught "Cannot assign to read only property '0'" on a player tab.** Not traced (no package in the stack). The one in-place change this module makes to an array core owns (emptying a tween's link chain at a stop) now leaves a frozen chain alone and cannot throw. The Argon errors are third-party.
- **Not changed, by design or not reproduced:** FR1-01 (two players at the same moment, both from background tabs: on BOSS the harness's two simultaneous drags registered only one at a time; needs the two-window re-test the round asked for), FR1-06 (the owner's reload in a fight charged 20 ft for a member back on its start square: on BOSS the same reload left every member on the square it had walked to, costs exact; the reloaded page cannot continue core's fight movement, S3R1-09), FR1-09 (a group drag 400 ms after a synthetic single drag: synthetic timing only).


### 15.13 Final acceptance round 2, FR2a / FR2b (0.7.5): what the live round found, and why

The Mac round (FR2a: real Chrome tabs plus a BOSS headless page, 105 ms emulated latency, a loaded Mac) passed C1 at rest (0 overlaps in about 260 runs), C7 performance and C8 visibility, and FR2b passed C6 bot-only; C2 in motion, C4 corridor and C5 combat failed, almost all on door cuts. Each finding was traced on the BOSS harness (ZZ GM8 and Player8A pages on ZZ H Dungeon Lab, real pointer drags, the player's socket delayed 52 ms each way) before it was changed. The design (§15, Fable's three stages) is unchanged: these are holes in its repairs and its safety net.

- **FR2-03 — a fight door cut at 500 ms: Hero 5 rests past the shut door in the corridor (10 of 10).** Reproduced on BOSS (500 and 700 ms, every run): Hero 5's continuation into (11,5) left 45 ms before the shut, so its square past the door was core's; the undo (S3R1-08, FR1-02) then found no free recorded square on its side. A probe of the refusal (`status().group.cut.undoWhy`, kept) named it: (10,5), the square Hero 5 had walked off, counted as taken by `stop:Hero 3`, core's predicted stop for Hero 3, itself being cut (its pending squares ran through the door, so core would stop it on (10,5)). The undo now counts the other cut members where they stand (`moversAt`), never where core would stop them; the cut's claims already keep the members apart. After it: 18 of 18 BOSS fight cuts from 400 to 1500 ms left nobody past the door who had not crossed it before the shut, with costs exact. The FR2a timings ("starts at 1163 ms, after the shut") were on two clocks a second apart; the sequence was the same. Test: `group.test.mjs` "FR2-03" (fails on 0.7.4).
- **FR2-04 — door cut at 1000 ms, out of combat and in a fight: Hero 3 crosses the shut door.** Not reproduced on BOSS: 35 cuts from 400 to 1500 ms after the FR2-03 change (18 in a fight, 17 out of combat; 14 more before it), latency on the player only; every member drawn across the door crossed it before the shut. The one path a planned way can still cross a door shut after it is a move the cut at the shut does not see (not under way at that instant, and not landing within the 250 / 600 ms looks) or a held way resumed: out of combat the guard's held member resumed its old way with no wall check. Two changes: the **wall watch** (guard.mjs) notes every door shut and wall raised (30 s), and a move the guard watches whose way ahead (1.5 squares) crosses one that stops it (its own collision test) runs the door cut again, once per wall per move (`status().guard.wallCut`); a held way resumes cut before the wall (`resumeCut`). Tests: `guard.test.mjs` "FR2-04".
- **FR2-01 — Multiattack carry.** Real: 0.3.4 applied and remembered the per-swing picks only on `api.fullAttack` / `api.plan`; the Argon HUD's Full Attack button runs `fullAttackState`'s plan with `runSwings` directly, with no picks and no `slotOffset`, so nothing was written. Both now go through `withSwingPicks` (pentaryn-combat 0.3.5). Test: `hud.test.mjs` "FR2-01".
- **FR2-02 — Wall of Stone's line named "Mage".** The line took the item's actor name (an unlinked token's base actor). It now names the caster's token, as the handle label does, and speaks as it (pentaryn-aoe 0.8.10). Test: `areas.test.mjs` "decision 5".
- **FR2-05 — Player8B's Hero 7 into the GM's Hero 1 coming to rest (-97 px, 427 ms, 1 of 10).** Not reproduced; from the BOSS log the guard on Player8B never fired (0 firings). A mover never yields to a lower one, and a later move (a re-route, a rest check) puts a token after the other in the server's order, so a mover that is about to come to rest was a lower mover until it stopped, and neither gave way. Now a mover the guard does not give way to whose way ends within the look ahead is also a standing token at its end (standing tokens never yield). Test: `guard.test.mjs` "FR2-05".
- **FR2-06 — a player's click-stop in room A during the GM's drag: grazes of 5 to 11 px for 56 ms against a standing token (3 of 10), the GM's Hero 6 left in room A (2 of 10).** On BOSS 6 of 6 runs had no graze over a frame and every GM member arrived (Player8A owns Heroes 1 to 4 there, so its stop rightly stops them all, decision 3). Two changes: the guard fires against a standing token at 0.04 square inside touching (`GUARD.standTol`; the 0.1 bound is for two movers), and a member a stop left short of its spot (`restShortOf`) goes on to it once the group is at rest, by a sliced search round every token, no long detour, never onto a held spot (`retryShort`, `status().group.short`).
- **FR2-08 — drags that did not take, with no notice.** H5b (the maze, single drag) took 5 of 6 on BOSS; the sixth drop never reached the module (the harness's drag did not register), and FR2-07 did not reproduce in FR2b either. Two silent ends were closed: a plan in which every member stays now tells the dragger "No route there: the group stays where it is" (`result: none`, `reason: nobodyMoves`), and a group drop whose reservation publish throws still goes, without its reservation (`result: unreserved`); a drop superseded meanwhile records `superseded`.
- **FR2-09 / FR1-06 — a player's reload mid-move in a fight leaves a member in the corridor (2 of 2).** Reproduced on BOSS (Hero 4 at (11,5)). Core continues a fight move square by square from the client that started it; a reloaded page has none of that state. Each client now records the squares still to walk of the fight moves it started (sessionStorage, per tab; dropped when the move stops, but not by the stops of a page unloading), and after a reload, once its scene is drawn (a player's page comes back on another map first; pentaryn-resume then views its own, and a swiftshader page took 27 s), the walk goes on from the square it rests on, its first square only when clear, costed as squares walked (`status().group.fightResumed`, with a reason per token). On BOSS: Hero 4 and Hero 3 walked on from the corridor to room B. Unsent waves past `RESERVE.overdueMs` still stay, with the notice (S3R1-07).
- **FR2-10 — the uncaught "Cannot assign to read only property '0'" is back (19 times on one player tab, FR2b).** Not traced: no stack, and a static search found no in-place change of a core-owned array left in this module. `status().guard.errorsSeen` now keeps the last five page errors that name this module or a frozen array, with where they were thrown, so the next round can name the source.
- **Seen on BOSS, not changed:** a single-frame drawn overlap of up to -40 px between two members when a fight undo or a click-stop displace jumps a token (one sample, under 17 ms; core draws the frame before the jump lands); the flaky `pathfind.test.mjs` region tests when the harness's swiftshader pages load the machine (they pass alone and on a second run).

## 16. pentaryn-movement 0.8.0: tiers, space in a fight, one clock (2026-11-23)

Fable's xhigh review of 0.7.4 (scratchpad `review-fable.md`): right out of combat, wrong in a fight. Every open failure sat in the layers that fought core's combat model (each fight square is a round trip from the initiating tab, plus 150–650 ms fog stalls), and the fix-on-fix chains (the corridor click-stop, four rounds; the fight door cut, five rounds, the last worse) were not converging. Joe's decisions of 2026-11-23 (scratchpad `decisions.md`): space-based separation in a fight; a fight's door cut stops everyone where they are; a click-stop out of combat stops exactly where drawn (a doorway: just past the line); ship by tiers. 0.8.0 builds §1, §4 and §6 days 3–6 of the review. Its acceptance rounds (review §2–§3: C1–C14 on one frozen build across three maps, twice) are still to run; until tier C passes them it ships off.

### 16.1 Tiers

| Tier | What | Switch | Default |
|---|---|---|---|
| A | single-token pathfinding, the ruler, a single token's click-stop | `pathfinding` (+ client `pathfindMine`) | everyone |
| B | out-of-combat group drags | `groupDrags` (was `groupMovement`) | on |
| C | fight group drags, by space | `fightGroupDrags` | **off** |

`assist` (the GM's toolbar button) and the circuit breaker turn A, B and C off together. Tier C off: a fight's group drop is `groupMode` reason `fightTier`, core's move with `unstack`'s hard-obstacle cuts and a checkpoint at every square, still held as one group (`holdCore`: tagged, so a click, a turn change or a door cut stops them all).

### 16.2 A fight's group move by space (tier C, `sequence-core.mjs`)

The plan is made as before (slots, routes round standing tokens on whole squares). Then, instead of timed waves: two members whose swept corridors (their way, as wide as the token) never meet set off together; for each meeting pair the safe order is preferred (never one walking through the other standing at its start, never one walking into the other resting at its end), a total start order honours the preferences (a cycle broken at its earliest member), and every member sets off on the **arrival** of each member before it whose corridor meets its own: core's `movement.finished`, then the token's `movementAnimationPromise` (`arrivalOf`; an event, never a clock). Where an order is still unsafe, `cutsFor` stops the walk short of the other's start or end, on a whole square. A member still waiting at the move's deadline stays ("Stopped short"). Pinned by a seeded test: 500 random fights, arrival events with 0–400 ms random latency, sampled every 10 ms: no two members ever come inside each other.

**Deleted** with it: the fight pause guard (`pauseMovement` holds, `cellHorizon`), `guardFirstClear` and the first-square gate (S3R3-03/04), the timed wave gate for fights.

### 16.3 Door cuts and click-stops

- **A fight's door cut** (`fightCut`): every member of the cut moves' groups this client moves stops (`stopSafely` → `stopMovement`) on the square it holds. No undo write (`isUndo`, `undoAcross`, `undoIndex` deleted), no walk on (`walkOnAfterStop` deleted; a reload's fight walk now goes on through `walkOnFight`, cut before standing tokens), no second look (the 250 / 600 ms re-cut timers deleted). A square committed past the door got through.
- **Out of combat, a click-stop** stops exactly where the token is drawn; across a door's line it is carried just past the line along its own route (else back the way it came), within 1.5 squares, never onto another token (`pastDoor`). Followers whose way passes through a stopped member stop short behind it (`shortBehind`; no re-route, no "too long" test). **Deleted:** `walkOut` and its searches, `walkOnTest`, `following`, `nearFirst`, `roomyFor`, the stop's whole-square snap.
- **The rest de-stack is gone** (`destack`, `forwardExit`, `gapExit`, `settleGroup`, `groupSettle`, `retryShort`): nothing at rest is moved off anything afterwards. **Tokens that start stacked stay stacked:** `stacksOf` finds members whose circles start overlapping by more than a quarter square (a rider, a familiar, a grappled pair); the largest leads, and each rider walks its leader's waypoints at its offset in its leader's wave, in the plan, in `unstack` and in tier C; the guard never parts stack mates.
- **The "too long" remnants are gone:** `roundStopped`, `groupStopOne` and `retryShort` used `detourTooLong`; they now stop short. The guard's re-route takes a way only when it can walk it before the move's deadline (that is the only length test left).

### 16.4 One state machine, one deadline (`lifecycle-core.mjs`)

Each drop gets a run: `planning → queued ⇄ planning → walking ⇄ yielding → rested | stopped | fallback | cancelled`, with one deadline, `LIFE.deadlineMs` = 10 s after the drop. An end state takes no further step (a late timer is a no-op). Every wait asks the run how long it has left (`capped`): the plan's queue (was `RESERVE.queueMs` 8 s on top), a single drag's start delay and queue (was 3 s + 8 s), a wave held for a foreign walker (was 8 s), a fight member waiting for an arrival, and the guard's rest (`y.restAt`: 8 s after the first yield or the move's deadline, whichever first; it was 8 s after the first yield, whenever that was). `lifecycle-core.test` bounds the composed clocks.

Clocks that remain, none of them a wait between a drop and rest: the click's arming delay (`MOTION.armMs` 400 ms, UX), the plan's own budget (`GROUP_LIMITS` 30 ms sync / 2.5 s work / 5 s wall, inside the deadline), the publish echo (`RESERVE.echoMs` 1.5 s / `commitMs` 150 ms, inside it), the wave spacing (150 ms steps), the reload's overdue cut (`RESERVE.overdueMs` 1.5 s) and the reservation expiry (`restMs`), the guard's 50 ms look and 3 s re-route, `stopSafely`'s wait for an in-flight segment (1.5 s at most), and the stop's drawn-position housekeeping (`RESYNC_MS`, `WATCH_MS`). Not done: replacing the per-group `setTimeout`s with one scheduler (the timers now all read the run; their count is still per group).

### 16.5 The initiating tab and the handshake

- **Hidden-tab commit:** on `visibilitychange` → hidden, every group this client holds sends what it has left at once, each walk cut back (`group-core settle`) where it would meet another member's walk or the walks already sent, as they are timed now (`flush`; `status().group.flushed`). Out of combat only: a fight's member waits on an arrival, which the deadline bounds.
- **`racers()`** counts only another active user whose `viewedScene` is the drop's scene: the canvas-less headless GM (no `viewedScene`) and users on another map never trigger the publish-first round trip. `status().group.reservations.alone` / `racing` / `raced` count it in play; if lost races stay under one a session the handshake can go (review §1).

### 16.6 Settings, notices, the cue

Five drag rows: world `pathfinding`, client `pathfindMine`, world `groupDrags` and `fightGroupDrags`, world `assist`. `smoothCorners` and `clickToStop` are folded in (always on; `CONFIG.debug["pentaryn-movement.arcs"] = false` turns the arcs off for a test), `groupMovement` renamed. `migrateSettings()` at ready: the active GM moves a stored `groupMovement` to `groupDrags` and deletes the old Setting document; every client removes the folded rows from its localStorage; `status().migrated` records it. Players see two notices: "No route there." and "Stopped short, way blocked." (was seven); the reason codes go to telemetry (`notice` events). A token this client holds back (queued, a start delay, a fight member waiting for an arrival, a guard yield) wears an amber dashed ring on this client (`cue-ui.mjs`).

### 16.7 Robustness and telemetry

- **Fail open:** a throw in the drop wrap returns core's result (cut by `unstack`); a throw while a plan is delivered (`safeDeliver`) sends core's move for the members still where they were (`failOpen`). `CONFIG.debug["pentaryn-movement.throwDeliver"]` forces the second.
- **Circuit breaker** (`telemetry-core breakerTrips`): 3 errors or 6 failed plans (`budget`, `throw`, `noPlan`, `noAnchor`, `deliver`; never the by-design core paths) in one session trip it: this client's drag help reads off (`settings tripAssist`), the active GM's client also sets `assist` false, the GM is told (a permanent notice, or a whisper from a player's client). `assist` back on clears it.
- **Telemetry** (`telemetry.mjs`): a per-client ring of 400 events — `plan` (ms, members, waves, cut), `fire`, `yield`, `fallback` (reason), `stall` (a frame over 150 ms while this client moves tokens), `lostRace`, `stop`, `cut`, `notice` (reason), `error`, `queue`, `wave`, `breaker`. API `telemetry()`, `reportTelemetry()` (a whisper to the GMs), `fileWrongMove()` = the **Alt+W** key: the last ten seconds filed as a Bug through `game.pentaryn.feedback.submit`.
- **Round IDs:** `regressions.test` requires every round ID a source comment cites to name a test, with a PENDING list that may only shrink (16 left at 0.8.0).

### 16.8 Not done in 0.8.0

~~The Node simulator of the review's §5~~ (built in 0.8.1, §16.9); the two extra maps in the live world (the simulator has five generated ones); the acceptance rounds (C1–C14) and the hands-on session; splitting `group.mjs`; elevation; groups of 8–12 in a fight; one scheduler for the per-group timers.

### 16.9 pentaryn-movement 0.8.1: the simulator (review §5) and what its first 2,000 seeds found

**Built** (`foundry/module/pentaryn-movement/test/sim/`, its runner `scripts/foundry/movement_sim.mjs` outside the module's `test/` (blueprint C43: only suites there), `make foundry-movement-sim SEEDS=10000`; use-doc `context/foundry/movement.md`, "The simulator"). `engine.mjs`: one fake clock; a server applying token updates one at a time and broadcasting them in its order; virtual clients (the GM, one to three players, the canvas-less bot) on FIFO links whose latency is a random function of time over 11–105 ms (knots every 250 ms, ±3 ms per packet) with TCP loss as a 200–600 ms retransmit that holds everything behind it; main-thread stalls of 150–1,400 ms on player tabs (and sometimes 150–650 ms on the GM's); a background tab (timers at whole seconds, no frames, core's continuation at once); a dropped socket that reloads on reconnect. Core 14.370's movement as read from its source: the movement chain of tweens (a fresh one starts when its update is handled; elapsed time uncapped, so a stall jumps a running tween to where it should be), a fight's square-by-square continuation from the initiating client at `duration − 2 × latency − 50 ms`, or the animation's end, or the tab going to the background, constrained by the walls that client knows. `maps.mjs`: T-junction (one or two wide), two-wide corridor, diagonal door, dead end, the hard dungeon. `model.mjs`: the module's own cores and a port of the glue's protocol (deliver, commit, schedule/fire, flush, commitFight, fightCut, freeCut with cutAtWalls, stopToken/stopSpot/displace, lateStop, groupStopOne, the out-of-combat guard). Not modelled: fog and vision, hidden tokens, riders, levels, ghost, the reload resume (`resumePending`, `resumeFights`), the guard's re-route, the publish window's exact echo seq. `scenario.mjs`: the seeded scenario and the invariants (the use-doc's table).

**Fixed** (each with a regression that fails without the fix; CHANGELOG 0.8.1):

| ID | Seeds | What | Fix |
|---|---|---|---|
| SIM-01 | 23, 299 | the timing pass's "go last" put a member's start past the run's deadline (24.5 s): its wave expired unsent, its reservation advertised a walk at 25 s, the run stayed open 37 s | `group-core stayPastDeadline` in `deliver`: such a member stays where it stands |
| SIM-02 | 14 | tier C ignores the plan's start delays, so a member set off head-on into another drop's walk in a one-wide corridor | tier C vets each member when it sets off: a walk outside the group in its way holds it (250 ms looks, within the deadline) |
| SIM-03 | 156 | tier C members starting on an arrival walked their drop-time way through a token that had come to rest in it | the same vet cuts the walk before any token standing in it, on a whole square, or keeps it where it is |
| SIM-04 | 6, 7, 15 (`OPTS` background only, `sim.test`) | a group made on a tab already in the background never flushed; its waves waited on throttled timers and walked into members at rest | `flushIfHidden` when the group is scheduled |
| SIM-05 | (the 0.8.0 hidden-tab test) | the flush ignored the first wave, which walks from the drop: a flushed member 0.36 square (centres) from a first-wave member | the first wave is in `group.sent`; a member on its heels stays where it stands |

Seeds 1–2,000 (each the same scenario before and after): **533 failing before the fixes, 424 after** — out of combat 259 → 202 of 1,196, tier C 67 → 15 of 397, tier C off 207 → 207 of 407.

**Found, not fixed** (design questions, for the next review; seeds from 1–2,000 of 0.8.1, default options unless an `OPTS` is given: `make foundry-movement-sim SEED=N OPTS='…'`):

1. **A fresh move is drawn from when a client handles it, not from when the server applied it** (out of combat 165 seeds, e.g. 7, 46, 56; in fights 163): on a client that just stalled (a fog extraction) or lost a packet, a member whose update arrived during the stall starts after it while the members already walking jump to where they should be, so a later wave is drawn on top of an earlier one, for up to a stall's length. The 0.75-square lag buffer covers latency spread, not a 1.4 s stall or a 600 ms retransmit. A fix needs the server's time on the update (a module option stamped at send, `game.time.serverTime`) and the tween's first frame credited with the lateness, bounded; the first-frame cap of S2R3-02 is the other half of the same idea.
2. **Tier C off — the fallback the review prescribed — walks members through members resting** (114 seeds with no stall or loss behind the overlap, e.g. 5, 34, 37; 207 of 407 fights fail): every member sets off at once on its own path and `restOnPaths` keeps only the rest spots apart, so a member cut short in a corridor is walked through by the ones behind it. Making each member's path stop before the others' rest spots halves it (234 → 171 of 1,000 undisturbed) and leaves 45 % of members unmoved; tier C, vetted, fails 0 of 1,000 undisturbed fights and 59 of 1,000 with every disturbance. Whether tier C should become the default is Joe's call after its live rounds.
3. **A player's click-stop of their own member in the GM's group** (decision 3's refinement; 25 seeds, e.g. 32, 174, 345) is chosen where the player draws it; on the GM's view the follower is already further along, so the GM's `groupStopOne` and guard act a round trip late, and in seed 480 with `OPTS='{"combat":false,"loss":false,"fog":false,"background":false,"door":false,"click":true,"two":false}'` the guard's pause lands inside the stopped member and stays there (an overlap at rest). A relay to the initiator, which draws the whole group, would choose the spot on one consistent view.
4. **A wave's spacing collapses when the initiator's uplink stalls** (seed 245 with `OPTS='{"combat":false}'`): waves are timed on the sender's clock; a retransmit holds the first, and the second, sent 300 ms later, reaches the server with it. Timing each wave from the previous wave's acknowledgement would keep the spacing.
5. Smaller: a door cut's displace-then-walk stands a cut member for a round trip in front of members the cut did not touch (8 seeds); `holdCore`'s end timer can end a long fight walk's run up to 1 s past its deadline (4); a tier C member still waiting at the deadline keeps its reservation until it expires (1945); the group's end timer follows the plan's predicted end, which a flush or a cut can put past the deadline (189, 1361).



### 16.10 pentaryn-movement 0.8.2: correctness review of 0.8.0 / 0.8.1 (2026-11-23)

Read against core 14.370's source (`client/documents/token.mjs` `#continueMovement` and `_preUpdateMovement`, `client/canvas/placeables/token.mjs` `constrainMovementPath`). Fixed, each with a test that fails without it (CHANGELOG 0.8.2):
1. A single drop's async ways (`singleFlow`, `confirmLater`, `aroundLater`) only logged a throw: nothing moved, nobody was told, the breaker never counted it. Now `singleFailOpen`: core's move cut before the first standing token.
2. The group publish chain set `d.committed` before `commit`, so a throw in `commit` failed open nowhere. Guarded; `failOpen` skips members the drop already sent (`d.sentIds`; a double send is a double charge in a fight).
3. The breaker kept the session's tallies across a re-enable and tripped on the next failure; it counts afresh from each trip.
4. A fight walk resumed after a reload in a later turn charged the new turn (FR2-09 record now carries combat id, round and turn).
5. Tier C on a hidden page waited for movement animations that never end there (no frames); an arrival counts at the server's end of the move while hidden, as core's continuation does.

Verified, no change: Joe's combat door rule (each next square tested against the current movement walls before it is sent) is core's own: every continuation runs `_preUpdateMovement` on the initiating client, which calls `constrainMovementPath` (`preview: false`, so walls only, never vision); a snapped step through a shut door has no snapped collision square and is constrained to nothing, and core stops the move on the square it holds. Only when the token is `rendered` on that client: an initiator that switched to another scene mid-walk sends continuations unconstrained (open, §16.10 note for the live script). Racers use `User#viewedScene` (exists in 14.370). Settings migration writes only on the active GM. No deleted function is referenced. Player telemetry never holds a hidden token (guard and cut ids come through `countsForRoutes`); the GM's buffer can, and a GM's Alt+W files it into pentaryn-feedback's report on the server's Data folder (GM-only by convention, not by permission).

Open, decided by the live rounds: the breaker counts `budget` fallbacks as failures, so a GM who drags 10–12 NPCs through fog six times in a session (Fable's §3 "within budget or the clean fallback") turns `assist` off for the table; `assist` flipped off mid-move lets the move's unsent waves go as planned (the runtime guard stops at once).

### 16.11 pentaryn-movement 0.8.3: acceptance round 1 (AR1, frozen 0.8.2) (2026-11-23)

AR1 ran on frozen 0.8.2 (BOSS three headless clients plus the Mac relay; LOADED, so every timing is void). No tier passed. Fixed in 0.8.3, each with a test that fails on 0.8.2 (CHANGELOG 0.8.3):

| ID | Tier | What | Fix |
|---|---|---|---|
| AR1-01 | A | a fight move went on through a door shut mid-move, charged 0 ft, once the GM viewed another scene | core constrains and measures a next square only while the initiating page draws the token: a `preMoveToken` handler on the moves this client drives does not send it then (in a fight; out of one, only across a wall that blocks movement now, read from the scene's walls) |
| AR1-02 | C | tier C moved 0-2 of 5-8 members | tier C's plan skips the timing pass's settle (`sequenced`); a member follows one before it once that one is drawn far enough ahead, not only on its arrival |
| AR1-03 | A/B | the guard cut a plain `update({x, y})` (C10) | the guard watches only a drag or a move carrying the module's options |
| AR1-04 | B | a Large that fits no door parked in its mouth, the grabbed one and others behind it unmoved | a member with no way stops short only where it is in nobody's way, else stays where it stands |
| AR1-05 / 06 | B / A | Ctrl+Z undid one wave, one square | one move's undo entries merged into one (`coalesceHistory`) |
| AR1-07 | C | fight moves walked through standing tokens | the same `preMoveToken` handler: a fight's next square is never sent into a token standing still on this client's view |
| AR1-08 | B | a follower rested inside a member another user stopped | it goes back along its own way to the last point clear of it |
| AR1-09 | B | a mount dragged alone left its rider | the tokens stacked on the grabbed one join its drop as riders |
| AR1-12 | A | a flying token routed round the crowd below | tokens on different layers (`fly` or not) are no obstacle to each other |

Not changed: AR1-10 (movers 0.11-0.13 square apart on the loaded Mac: §16.9 class 1, drawn late after a stall or loss); AR1-11 (the harness measures square footprints; tokens are circles, whose clearance the routes keep; the Mac saw no frame inside); AR1-13 (a player's route never crosses unexplored ground, by decision 7 and C8: the test script's A1, A4 and A7 expectations change, not the module). AR1-04's notices did fire (`tooNarrow`, `anchorShort` in the telemetry) but Foundry dismisses a notice after a few seconds, before the harness read the DOM: the next round's harness hooks `ui.notifications.warn` instead.

The next-square handler is Joe's combat door rule (each next square tested against the current walls before it is sent) carried to the case core skips (an undrawn token) and to tokens standing still. It touches only the moves the module drove: a drag (`method: "dragging"`) or a move carrying `pentarynMovement*` options, and their continuations by core's movement chain; a macro, MCP `move-token`, Argon's Dash and forced movement are core's (C10). Simulator, seeds 1-2,000 (same scenarios as 0.8.2): 424 → 383 failing; out of combat 202 → 201 of 1,196; tier C off 207 → 140 of 407; tier C 15 → 42 of 397, but 0.8.2's tier C left about a third of its members unmoved, which no invariant counted (`sim.test` "AR1-02" counts it now); the new tier C failures are on a client that had just stalled or lost a packet (members now walk closer behind one another: the drawn-late class 1), and one undisturbed seed (208) keeps a long walk's reservation past its run (class 5).

### 16.12 pentaryn-movement 0.8.4: acceptance round 2 (AR2, frozen 0.8.3) (2026-11-23)

AR2 ran on frozen 0.8.3 on the BOSS GPU Chrome (three foreground clients over CDP) and the BOSS headless clients. No tier passed. Fixed in 0.8.4, each with a test that fails on 0.8.3 (CHANGELOG 0.8.4):

| ID | Tier | What | Fix |
|---|---|---|---|
| AR2-01 | A | AR1-01 again: through a door shut mid-move, 0 ft, the GM viewing another scene | core's `_shouldRecordMovementHistory` reads `game.combat` (the VIEWED scene's): `inCombat` also counts the token's own scene's active started combat; a drag's first square sent after the page left the scene is refused too |
| AR2-02 | C (off) | two members rested on one square | a fight step is not sent into a token that will stay (its own next square barred, three deep), onto the square another is about to step to, or into a trade of squares |
| AR2-03 / 06 | B / A | the mounted pair's way through standing Huge (0.49 sq), corners 0.1 sq into standing tokens | out of combat routes keep a square's clearance (Chebyshev box), and the standing tokens are passed to every single-drop search |
| AR2-04 / 05 / 09 / 11 / 12 | A-C | members unmoved or short with no notice | every drop watched to rest: unmoved or the grabbed one short, nothing told → "Stopped short, way blocked." |
| AR2-08 | B | a player's click on its own token in the GM's group ignored | only the dropping page arms a click 400 ms; another user's move is armed at once |
| AR2-14 | B | "reading 'position'" when the GM activated another scene | destroyed placeables read through `positionOf` |

Simulator, seeds 1-2,000: 383 → 298 failing; tier C off 140 → 57 of 382. Not changed, for the next review: AR2-07 (mover-vs-mover by the harness's squares: the timing pass separates circles, and a square-metric timing pass is a redesign of `firstConflict`); AR2-10 (long frames at 4× CPU, unprofiled); AR2-13 (a rider dragged alone dismounts, 0.8.3's decision; "stacked stay stacked" is about the module never parting them); why the live C-1 / B3 members stay (the simulator's unmoved members are legitimate: a Large that fits no door, a corridor blocked by a standing token; now each is told).

The harness measures square footprints. Out of combat 0.8.4 keeps standing tokens' squares clear; in a fight routes stay on circles (a diagonal step past an ally's corner is 5e-legal and the ruler charges it), so a fight's diagonal past a standing token still overlaps square footprints at the corner.


### 16.13 pentaryn-movement 0.8.5: acceptance round 3 (AR3, frozen 0.8.4) (2026-11-23)

AR3 ran on frozen 0.8.4 (the BOSS GPU Chrome, three foreground clients, and the BOSS WSL headless clients). No tier passed. The GPU judge was in use afterwards, so 0.8.5 was diagnosed on the WSL harness: the plan's dry run (`planGroup`, whose result now carries a `why` per member: `noSlot`, `noRouteToSlot`, `shortEndBlocks`, `blocked:<id>`, `settle:<ids>`, `behindFile:<n>`) and live drags of M2 / M3 with the telemetry ring. Fixed, each with a test that fails on 0.8.4 (CHANGELOG 0.8.5; `test/ar3.test.mjs`, `test/group.test.mjs` "AR3-…"):

| ID | Tier | Root cause found | Fix |
|---|---|---|---|
| AR3-01 | B | file order by the foot of the perpendicular on the grabbed one's route: the row east of the door ranked ahead of the three at its mouth (timed 5-9 s, past the deadline); one going last brushed a neighbour still at its start by 0.03 sq, and settle() then kept Heroes 1-4 where they stood | file order = walk left by the route (`remainingVia`); going last takes the lateral way round later members' starts when its own brushes one |
| AR3-02 | C | a member cut to where it stands never counted as arrived (the grabbed Hero 8 waited for it until the deadline); the head of a narrow file was sent last; the vet read walking group mates as standing; fight rest spots kept the 0.2-sq open-ground gap (every second square of a dead end); the grabbed one at the back got a spot the members ahead had to rest short of | no walk = arrived; `anchorHeads` (the head of a narrow file goes first); walking mates are the sequence's; fight spots side by side; the grabbed one stops short behind the members ahead when there are more of them than spots past its drop point (`behindFile`) |
| AR3-03 | C off | the next-square test read a follower stepping into the square the one ahead leaves as a trade: every member's next square was refused | only a real trade is refused; a step into a token still moving is **held** and the rest of the walk sent once clear and a latency buffer behind (`holds`, `status().group.hold`); a follower waits until the one ahead has been let leave its square on this page (`leaving`), and a square this page just sent a token to counts as taken before its echo |
| AR3-04 | B | core draws a step at its speed over the terrain's difficulty; the plan timed every member at full speed (B8: the Mud) | the plan's trajectories follow core's terrain path (`terrainPath`, `Token#createTerrainMovementPath`) on a scene with terrain |
| AR3-05 / 06 | B | after another user's stop each member was cut short behind it on its own | their walks on are settled together |
| AR3-08 | B | a later wave walked a teleported member back | a member displaced by anything but the module leaves its group |
| AR3-09 | B | the flush's stays were told by the drop's watch, which on a background page waits for animations that never end there | the flush tells at once; the watch reads rest from the server on a hidden page |
| AR3-10 | B | the way-ignoring-tokens search (`toward`) ran in one task up to 250 ms | `towardSliced` |
| AR3-12 | A | the fight pass-an-ally refusal was a nameless "Stopped short" | "No route there: <name> is in the way. The ghost button under the Ruler lets you pass." (`notify.named`) |

Also: a token drawn walking into its last square bars a step passing it there, not only one ending there.

**Tier C off** still walks core's own paths (Joe's rule of 2026-11-23: until tier C passes, a fight's group drag is core's move with hard-obstacle cuts); in a corridor core's path for a member whose offset spot is in the rock ends at the first wall, so C-11's "one square each" is now core's path, not the module's refusal. Whether tier C becomes the default stays Joe's call after its rounds.

Simulator, seeds 1-2,000: 298 → 299 failing, with the invariant Joe ranks first improved and more motion: pass-through 205 → 179, rest overlaps 9 → 10, orphans 1 → 0, mover-vs-mover 118 → 153 (on a client that had just stalled or lost a packet, §16.9 class 1). Squares walked per member over 300 fights: tier C off 4.1 → 5.6, tier C 6.8 → 9.9 (pass-through 23 → 11); out of combat unchanged (3.4). The model ports the holds, `leaving`, the claims and the tier C fixes (`noHold`, `noLeaving`, `noClaims`, `noArrivingFix`, `noTradeFix` switch each off).

Not changed, for the next review: AR3-07 (two players head-on in a two-wide lane: each plans round the other group standing; both stop short and both are told, per telemetry; passing needs lane discipline across two plans); AR3-11 (the move refused after the GM views another scene is told, `step:unrendered`); AR3-13 (no stack; this module reads `position` only inside a try). The AR3 harness read notices from the DOM after Foundry dismissed them; several "no notice" findings (AR3-01, AR3-07, AR3-11, AR3-12's A5) had the notice in the telemetry. The next round should hook `ui.notifications.warn`.

## 17. pentaryn-movement 0.9: the smaller design (Fable's review 2, 2026-11-24)

Fable's review 2 (2026-11-23) read rounds 1-3 as patching, not converging: defects 13 / 14 / 13 a round, no tier
passed, the simulator flat out of combat (202 → 198 of 1,196 from 0.8.1 to 0.8.5), `group.mjs` grown 3,224 → 4,124
lines in three "fixes only" rounds. Its structural cause: an invariant core cannot enforce (no shared animation
clock: "no overlap, drawn, on every client" made the planner's safe answers "stay" and "wait"), a plan held on one
client for up to 10 s (each event in that window needed its own reconciler) and reservations so other clients know
moves not yet on the server. Joe's answers (2026-11-24, scratch `decisions.md`): two moving tokens may brush; in a
fight a group drag walks one member at a time (tier C deleted; refused if that misses its gate); a click on any member
stops the whole group. The rule: **within 4 s of the drop a token's move is on the server, or the token is named in a
notice; nothing ever waits for another mover.** Built on the branch `movement-0.9` (main keeps 0.8.5, tag
`movement-0.8.5-rollback`), in the review's §4 steps.

### 17.1 Step 1: singles

`drop.mjs` replaces `group.mjs` as the drop feature: a single drop's route is confirmed clear of the standing tokens
and sent at once (round them, else as far as it is free of them, else not at all with "No route there" naming the one
in the way); the checkpoints at every square in a fight; Joe's per-square movement-wall check before each next square
of a move this client drives (rendered or not; movement walls, not vision); the undrawn-token rule (no square of a
fight move from a page that no longer draws the token; out of combat not across a wall that blocks now); a standing
token in the next square refuses it (a moving one does not: soft); a wall or door across a walk out of combat stops it
where drawn (the click-stop's displace, decision 2); riders; one undo entry per move. Deleted: the guard, the
reservations, the lifecycle, the cue, the reload resumes, tier C, the fight door-cut machinery, every hook and status
row of theirs, their tests, and the 0.8 simulator model (a port of the deleted glue). Interim until the later steps:
a group drag out of combat is core's own drop (step 2 replaced it the same day), a group drag in a fight is refused
with a notice (step 4), a click stops the members the clicker owns (step 3 adds the dragger stopping the rest).

Gate results: tier A's tests pass (`test/drop.test.mjs`: 58 tests ported from `group.test.mjs`, the tier B / C and
reservation ones deleted with their code); 60 seeded fight drags charged exactly 5 ft per square walked, every step one
square, none through a wall or a standing token, and a door shut before a random square stopping it there, charged for
the squares sent (60 moved, 35 cut by the door); C12 (single-drag latency) has no live run on the branch, its Node
proxy (the drop handler's own time, 400 drags) is unchanged or better: p50 0.037 → 0.018 ms on open ground, 0.27 → 0.25
ms round a standing token, 0.21 → 0.19 ms in a fight.

### 17.2 Step 2: B0, the floor

`file-core.mjs` (pure) plans a group drag out of combat in one pass, `file.mjs` (a feature) gives it its oracles on
the canvas (`restWalkable` and the places to avoid for a spot, a walk flood from each formation spot, routes through
the pathfinder's `routeTo` round circles with a square's box clearance) and `drop.mjs` sends the result as the drop's
own batched update. Per member, the grabbed one first and then least walk left first: the free spot nearest its
formation spot **by walking** (a spot whose walk is more than 1.5 × the straight way + 1 square is round the far side
of a wall and never tried), free meaning clear of the tokens standing outside the drag, of the spots already given out
and of the routes already given out (a mate that arrives first never rests in an earlier one's way: the hard "mate at
its slot" with zero stagger); then an A* route round the standing tokens and the spots given out, checked against
them by the core itself. A member with no spot it can reach stays and is named; one whose spot is where it stands
(only within a square of its formation spot) stands still; either becomes a standing token and the pass runs again
until nothing changes (each pass fixes one more, so it ends). Because a spot at a door's mouth closes the door to the
members planned after it, the members that stayed in the first pass are tried again planned first, then most walk
left first, and the order that sends the most members wins (on a tie, the one that rests the grabbed one nearest its
drop point). Planning time: 300 ms a member, 1.5 s a drop, reorders only in the first half; past it a member stays,
named ("budget"). No stagger, no timers, no second plan.

Gate: `test/file-core.test.mjs`, 600 seeded drops on random floors (2-8 members, some 2×2, 0-4 tokens standing) and
200 on the hard-case dungeon, real pathfind-core A*: every member sent, at its spot, or named; no route enters a token
standing outside the drop, a member standing still or a slot given out before it (leaving one it starts inside is
allowed: that one is moving); no spot on an earlier route; no two at rest overlapping. Liveness: of the members that
could reach their own spot alone, 1,303 of 1,322 sent on random floors (98.6 %), 352 of 357 in the dungeon; the rest
named. On the module's synthetic board (`test/drop.test.mjs`) a group through a door goes in the drop's one update
with nothing sent later, a sealed-off member is named, a fight's group drag is refused; eight members through a door
plan in 7 ms p50 / 13 ms p95 (Node). Not yet measured: the plan's time on a GPU page for 8 members (step 8's
"under 100 ms"); a maze can reach the 1.5 s budget, synchronously, which is the next thing to watch.


### 17.3 Step 3: B1, the file

`file-core.mjs` `staggerFile` times B0's plan; nothing in B0 changes. The members that move are put in start order by
`sequence-core`'s `sequence` over their B0 routes (plan order, the grabbed one first then least walk left first, as the
tie-break; never one walking through another standing at its start, nor into another resting at its end, when such an
order exists). Each in turn takes the first start delay, a multiple of 150 ms (one wave), at which it meets none of the
members timed before it (`motion-core` `firstConflict`: the same wave drawn from one update, no latency buffer; one
wave apart, 0.75 square either way along its way). The cap is 4 s after the drop less the plan's own time: a member
that finds no clear delay under it goes at the step where it meets the fewest (soft, never a cut, never a second pass;
its slot and route are B0's, so nothing hard depends on the timing). On open ground every delay is 0.

`drop.mjs` sends the members at 0 in the drop's own update; `file.mjs` holds the later waves on the group's record and
fires each by `setTimeout`; `drop.mjs` `sendWave` sends it: a member no longer at its start (moved, or dropped again)
is skipped; a member whose way a wall raised or a door shut since crosses stays where it stands and is named (stop
where drawn, for a member not yet sent); one whose way a token has come to rest in is walked only as far as it is free
(the hard obstacle, `freePrefix`); riders go with their leader's wave; every wave carries the group's option, so undo
merges it and other clients learn the group. No settle, no reservations, nothing republished.

The three runtime handlers are one primitive, stop where drawn:
- a click on any member stops the whole group (decision 3 as revised 2026-11-24). On the client that sent it,
  `stop.mjs` stops every member and `groupCancel` drops the unsent waves. On another client the clicker stops the one
  clicked (every member it owns too when the sender is no longer active), and the sender's client, seeing another
  user's stop write (`pentarynMovementStop`) on a member of a group it holds, drops the waves and stops every other
  member still walking where it is drawn (a displace out of combat; `stopSafely` in a fight). The sender's own stop
  writes are not foreign: a wall cut stops only the walkers it crosses;
- a wall or door change stops this client's walkers whose way it crosses (step 1's `cutAcross`), and a wave sent after
  it is tested against the walls as they are then;
- a hidden tab (`visibilitychange` to hidden) sends every remaining wave at once, as one update.

Gate: `test/file-core.test.mjs` on B0's 800 seeded drops (600 random floors, 200 dungeon): every mover timed, every
delay a wave step, the last at most 4 s (largest seen: 1,050 ms; 100 of 800 drops staggered at all); 200 formation
drags across an open room all at 0; B0's properties checked on the same plans. Mover-vs-mover overlap, soft and
reported: drops with two movers meeting by more than 0.05 square fall from 103 (all at once) to 10 (B1), and no drop
overlaps deeper staggered than all at once. Through a door, eight members time in 4 ms (Node). `test/drop.test.mjs`:
the door drop sends the grabbed one with the drop and the rest in waves within 4 s, each a whole route past the door;
a click stops the group and its waves; another user's stop makes the sender drop its waves and stop the walking mate
(its own stop write does not); a hidden tab sends the waves at once, once; a wave skips a member moved since and
does not send one through a door shut since (named).

### 17.4 Step 4: the fight file

A group drag in a fight with `groupDrags` on is the fight file (`drop.mjs` `fightFile`): nothing moves at the drop
(the wrap returns null). The members (leaders; a rider goes with its mount as one entry) are ordered by `sequence`
over their straight walks from start to formation spot, least walk left first. An async loop takes each in turn: a
member deleted ends the queue; one no longer at its start (or dropped again) is skipped; otherwise its way is routed
**when its turn comes** (`routeAtTurn`): round every token standing then outside its stack (the members already moved
where they came to rest, the others where they stand; circles on whole squares), to its formation spot or, with a
token standing there, the nearest clear square it can reach (`clearOfWalls`). No route: it stays, named. The route
gets a checkpoint at every square (`withCheckpoints`, kept only at the same measured cost) and goes as a normal single
move (`TokenDocument#move`, the module's option and the group's), so step 1's per-square test (walls now, an undrawn
token, a token standing still) applies to every square and core charges it as any single move. The loop awaits core's
promise (true when the whole walk ended, false when stopped or prevented) and then the token's movement animation.
A watchdog of the walk's own time (its squares at the token's speed) plus 3 s moves the queue on. A walk that ends
false (a click, a door shut across it, a square refused) ends the queue: the group stops there.

What empties the queue: a click on any member (`stop.mjs` `groupCancel` on the sender's client; a GM's click on a
player's walker reaches the sender through `stopOwn`, a player's click on the GM's walker through the relay `stop`,
and both now cancel the whole group); a turn change or the fight's end (`updateCombat` with a turn, round, started or active change;
`deleteCombat`); a new drop by this client; a deleted member (`deleteToken`). The members not sent are named ("Did not
move, the group's walk was ended: …") after a turn change, a deleted member or a stop on the way, not after the
dragger's own click or drop. More than the cap (12), or pathfinding off on this client: refused, "In a fight, drag one
token at a time." Tier C's setting `fightGroupDrags` is deleted (the GM's client removes its stored row once:
`RETIRED.world`), `groupMode` loses `fightTier`, and `groupDrags` covers both.

Gate (`test/drop.test.mjs`): two members through the door walk one at a time, the second only once the first's walk
resolved, each a square a step with a checkpoint at every square, never through a wall, charged exactly 5 ft a square;
the second is routed round where the first came to rest; 40 seeded fight group drags (2-4 members, 0-2 tokens
standing) hold the same per square, never through a token standing at that member's turn, nobody resting on anybody,
every member walked or named, no watchdog needed; a mount and its rider go as one entry; the queue ends on a click (the walker stopped by
`stopMovement`, nobody else sent, no notice), a turn change and a deleted member (both named), and a new drop; the
watchdog moves a walk that never resolves on after its time plus 3 s and not before; more than 12 is refused.

### 17.5 Step 5: the simulator on the real cores

`test/sim/` now runs the module's own decisions: `file-core` planFile / staggerFile / candidatesFor and the new pure
`waveWays` (a later wave's who-walks-how-far, lifted out of `drop.mjs` sendWave), `motion-core` waves and the new
`clearAlong` (a stop's spot along its own way, lifted out of `stop.mjs` pastDoor), `sequence-core`, the pathfind-core
A* (`test/fixtures/grid.mjs`; on a fight's lattice it no longer splices the start, so every fight step is one square).
`model.mjs` (513 lines, from 1,311) keeps only the Foundry wiring: wave timers, the three handlers, the fight queue's
wait and watchdog, onPreMove (also for a fight's first square). Engine fix: a timer cleared while a stall held it
still fired. Every seed runs as B1 and as B0. Hard invariants: `passThrough` (a mover inside a token its walk's sender
knew standing there, a mate at its slot or a named stayer; a token that came to rest after the walk was sent, a mate
still waiting for its wave, one a stop left short of its slot and a walk leaving a token it starts inside are reported,
not failed), `wallCross`, `wrongCharge`, `unsent` (sent or named within 4 s of a drop out of combat, a stall's time
off; a fight's every member walked, named or ended by the dragger; nothing held, pending or drawn off at the end),
`restOverlap` (over 150 ms or at the end; two screens whose last writes each went before seeing the other's: a flagged
race), `errors`.

Defects found and fixed (test first; `drop.test` / `file-core.test` "simulator (step 5)", `sim.test` SIM5-01..03):

- **Members whose formation spot lies behind a wall stayed** (the commonest outcome: 276 members in 500 seeds out of
  combat, 209 in fights): `candidatesFor` with the grabbed one takes spots the drop point reaches; the fight file tries
  them too (`fightSpots`), and no longer walks a member to a square off the scene.
- **A wave's cuts rested members inside each other** (seeds 382, 409, 764, 1958, 5361): `waveWays`' fixed point, mates
  off their plan / left standing / just sent short as obstacles, cut ends clear of mates still waiting.
- **A stop rested two tokens inside each other** (a click or a door cut of two brushing members, seeds 2, 60, 277 …):
  carried clear along its way of tokens at rest, of the same stop's claims and of this screen's in-flight sends
  (`groupInFlight`), past walkers, never through a wall or a token at rest (seed 6156); nearest clear spot otherwise;
  a click's mates at rest count.

10,000 seeds, failing runs per invariant (before = 0802bc85's cores with the step-5 glue switched off, `before: true`):

| | B1 before | B1 after | B0 before | B0 after |
|---|---|---|---|---|
| passThrough | 4 | 2 | 0 | 6 |
| wallCross | 0 | 0 | 0 | 0 |
| wrongCharge | 0 | 0 | 0 | 0 |
| unsent | 0 | 0 | 0 | 0 |
| restOverlap | 160 | 6 | 504 | 27 |
| errors | 0 | 0 | 0 | 0 |
| members never moved | 19,558 of 42,447 | 12,271 | 19,403 | 11,993 |

Mover overlap (both moving; after): B1 18,045 episodes in 2,536 seeds, depth p50 0.74 / p95 0.985 / max 1.49 sq,
duration p95 1,883 ms, 4,543 square-seconds; B0 31,732 in 3,686, depth p50 0.62 / p95 0.982, duration p95 2,350 ms,
13,051 square-seconds. Paired per seed, B1's overlap area is worse in 221 seeds and better in 2,524; its deepest
overlap worse in 480, better in 1,957. B1 is no worse in count, duration and area; its p95 depth is 0.003 deeper (the
shallow brushes it removes leave the lane overlaps).

Open (after): B1 passThrough 5002, 5386 (a walk through a token standing outside the drop, both with a second group);
B1 restOverlap 3599 (a fight with an observer's reload), 3773, 5188, 7391, 8004, 8958 (mostly two groups from two
screens, unflagged); B0 restOverlap mostly a click followed within a few hundred ms by a door cut in a one-wide
corridor. Unjudged: a wave sent before its screen knew of a door shut since walks through it (no recheck at the echo).

### 17.6 Step 6: the old files out

Deleted: the 0.4 to 0.8 group planner (`group-core.mjs` 1,381 → 198 lines: only the candidate lattices, `prefixOf`,
`firstIntrusion`, `freePrefix`, the flood and `coalesceHistory` stay, all still called), three unused adapter reads
(`group-adapter.mjs` 551 → 471), and the planner's acceptance tests (eight files; `group-props.test` pruned to what the
surviving cores need, plus a `freePrefix` test). The guard, reservations, lifecycle, cue and tier C files and rows
were deleted in steps 1 and 4; a grep finds no import of any of them. Module code 9,256 → 7,993 lines (test code
11,601 → 9,755). Five round IDs lost their tests with the mechanism
and sit in `regressions.test` PENDING. The use-doc `context/foundry/movement.md` is rewritten for the behaviour as
built. Still open before the handoff (§4 steps 7 and 8): the GPU round, and the two B0/B1 rest-overlap and
pass-through seeds listed in §17.5.

### 17.7 Fable's check of 0.9.0-dev (2026-11-24) and the handoff

Fable's verdict: the smaller design holds; three blockers before Joe's 30 minutes. (1) No B0/B1 switch: `planDrop`
took `stagger` but the drop never passed it. Now the world setting `groupStagger` (on = B1). (2) Never loaded in a
browser: the branch build was deployed to the live world for Joe's hands-on (0.9.0) and smoked on the WSL harness.
(3) A click missed a member whose wave was in flight (sent, its write not back): the stop skipped it as not moving, and
it then walked its whole route through its stopped mates. Now the group's stop marks such members (file.mjs
`lateStops`) and stops each where it is drawn when its move comes back; the simulator models the same. The dead
`"late"` stop branch and the unread `pentarynMovementStopAt` option are deleted. Still open, for the GPU round (step 8
needs zero): the stop's last resort walks a straight line (stop.mjs `stopSpot` → `clearOfWalls`), the B1 passThrough
seeds 5002 / 5386 and rest overlaps 3599, 3773, 5188, 7391, 8004, 8958; silent leaves (a wave after the dragger changed
scene; a new drop empties a fight queue unnamed); `stepThroughWall` ignores wall direction (171 one-way movement walls
live); planning budget 1.5 s against a 100 ms gate, unmeasured on a page; Fable's cuts (`waveWays`' lane swap, the new
drop's queue cancel).


## 18. pentaryn-movement 0.10: the leader rule, march and swarm, any passage shape

Joe's hands-on of 0.9.0 (2026-11-24): "very happy with the overall", but the formation offsets were wrong (dragons
sliding in parallel lines) and a party dragged into a one-wide tunnel was told there was no room though the tunnel had
room lengthwise. His rule, refined the same day (scratch `decisions.md`, its last lines binding; Fable's review 3 where
it agrees): the token grabbed and dragged leads; dropped on the floor is a march (the leader on the drop square, the
rest behind it), dropped on a visible token outside the group is a swarm (the leader touching it first, the rest round
it ring by ring); the leader goes first and walks through its own group, drawn on top; one pack on open ground, single
file only at a narrow point; in a fight the leader first, then one at a time; pathfinding handles any passage shape
(the spiral C stair is a test case, not a feature, and has no switch). Built on the branch `movement-0.9` in steps
(L1, L2, …), each recorded below; the world keeps 0.9.0 until the build is done.

### 18.1 Step L1: the leader plan (version, the tunnel repro, planLead, the shape from the drop)

Version 0.10.0-dev (module.json, CHANGELOG, `VERSION`). Then, tests first:

**The tunnel repro** (review 3 §2), as a test before the code: four members (a 2×2 block in a room) dropped 11 squares
into a one-wide tunnel. On 0.9's `planFile` the three followers were named after 17 route searches: a slot could not
lie on a route already given out (the route-clearance test), the leader is planned first and its route runs the whole
tunnel, and what was left lay past the leader, whose slot was an obstacle, until the four tries were used up. Now
(`test/lead.test.mjs`, and on the module's synthetic board in `drop.test.mjs`): a line behind the leader, 4 searches,
none failed, nobody named.

**`file-core` `planLead`** (pure): squares near the drop get a rank; each member in turn (the leader, then least walk
left; a member standing where a slot was just given out goes next, so it makes room while there is room) takes the
best-ranked free square it can reach and gets one route search to it (a second only when the first fails). March: the
leader to the drop square by its own route (round the tokens standing, through its own members; the drop square not
free: the nearest free square by walking); ranks are the walk from B, the square the leader steps out of on its last
step (one leader radius back along that step), the leader's squares shut, only squares nearer B than the leader's own
(a tie only when it lies behind the last step). Swarm: rings (hops) out from the target's whole footprint, never across
a wall; the leader has first pick. "Can reach": a flood of the member's whole body (its top-left square; every square
it covers steps, in the area and free; never a diagonal squeeze past a token, which the route search would refuse)
from its way in: its own squares when they are in the area, else the square where its shortest walk to the drop enters
the area, found by walking down one shared walk-distance map (from the leader's or target's squares out until every
member's start is settled), no search. A tie on rank goes to the least walk. The area: the nearest 6 × members + 40
squares of that walk, ranks within it. A stay that falls on a slot given out takes that member with it; one across a
route given out makes it go round (one new search) or stay. The leader with no way: nobody moves. `walkFrom` is a heap
flood with a settle cap and an `until` set.

**`file.mjs`**: the shape from the drop (`targetOf`: the leader's drop centre inside a token outside the group that
this client sees and that is not hidden, same level); the oracles: `restWalkable` and the places to avoid, one step
between neighbouring squares from a 1×1 field of the leader on the pathfinder's shared step memo (`pathfindMemo`, new
on pathfind.mjs's expose), routes through `pathfindRouteTo` round circles as before; then 0.9's `staggerFile`
(unchanged until L2). In a fight: `fightPlan` (the shape, the target and the order: planLead with no search) and
`slotAtTurn` (planLead for one member at its turn, every other token standing where it is then; march: behind where
the leader came to rest, `leaderAt` from its last waypoints). `drop.mjs` runs them: the leader first; a march leader on
a token or where it cannot stand takes the nearest clear square (`clearOfWalls`); one already on its square is in place
(`status().group.queue.there`); the leader with no way ends the queue ("No route there", `ended: "noRoute"`).
`planGroup` and `status().group.last` carry R13's fields (`shape`, `leader`, `target`, `stayed` ids, `waves`,
`plan.timingMs / searches / failed / total`).

**Deleted**: `planFile`, `pass`, `settleOrder`, `candidatesFor`, `spotsRound`, `orderOf`, `wayToPoint`, `FILE` (rings,
tries, walkRatio, reorders, reach), the route-clearance test, the fixed-point passes, the three reorders and `waveWays`
(file-core); `fightSpots`, the walk flood per member and `routeAtTurn`'s spot list (file.mjs, drop.mjs); sendWave's
cut-short book-keeping (`sentTo`, the waiting mates; a wave's member goes its whole way or stays, named); the candidate
lattices (`hexCandidates`, `cellCandidates`, `GROUP_LIMITS`, group-core) and their test; the 0.9 B0 tests.

**Gates.**
- Tunnel repro: passes (line behind the leader, 4 searches, 0 failed, nobody named), pure and on the board.
- 800 seeded floors and tunnels (`lead.test.mjs`; a third tunnel maps with bends, rooms and dead ends; 2-20 members,
  some 2×2; half swarms on Medium / Large / Huge targets; 0-4 tokens standing; walls with one or two doors): 8,776
  members, every one in place or named (251 named; 50 drops with no way for the leader: the two looked at were a token
  standing in the one-wide way and a 2×2 leader behind one-wide doors), no rest overlap, no route into a standing token, an earlier slot
  or a member that stays, march nobody beside or ahead (walk-based, an independent flood), swarm the leader touching in
  367 of 373 drops and in the other 6 no free touching square it could reach; **0.895 searches a member, 1.88 %
  failed** (gate ≤ 1.2, < 3 %).
- Planning in Node, warm, median (two rooms and a door, 40×24): **8 members 12.9 ms, 20 members 49.4 ms** (gate 100 /
  250). The page gate is later (R11).
- `make foundry-movement-sim SEEDS=2000` beside 0.9.0's (`ee93442b`): no errors, no wallCross, wrongCharge or unsent,
  no new failure class.

  | | 0.9.0 B1 | L1 B1 | 0.9.0 B0 | L1 B0 |
  |---|---|---|---|---|
  | passThrough | 0 | 9 | 2 | 1 |
  | restOverlap | 0 | 3 | 5 | 7 |
  | wallCross / wrongCharge / unsent / errors | 0 | 0 | 0 | 0 |
  | mover overlap episodes (p95 depth, duration) | 3,465 (0.986, 2,050 ms) | 3,016 (0.985, 1,983 ms) | 6,362 | 6,679 |
  | members dropped / never moved / named | 8,480 / 2,454 / 1,842 | 8,480 / 2,809 / 2,138 | 8,480 / 2,409 / 1,822 | 8,480 / 2,583 / 1,981 |

  B1's passThrough (367, 599, 944, 1172, 1451, 1522, 1600, 1715, 1771) are one shape: a follower's slot on an earlier
  follower's route (a line behind the leader), the later one at rest first under fog stalls, so the earlier one walks
  through it. Review 3 §1 names it: with the route-clearance test gone, "never through a mate at rest" rests on the
  start order, which is L2's motion. B1's restOverlap (779, 1412, 1542) are stops (a door or a click) of two groups.
  More named: the leader with no way now moves nobody (R10), and a wave's member that would have been cut short now
  stays. The simulator's regression seeds were found again on the new plan (SIM5-01: 492, 800, 1014, 2409; SIM5-02:
  41, 75, 145, 230: each holds with its fix and breaks without it).

**Deviations from BINDING and why.**
- Kept for L2, though on R12's list: `sequence-core.mjs` (0.9's `staggerFile` orders by `sequence`; `stacksOf`),
  `groupStagger` and B0. The motion stays 0.9's in L1 by the step's own rule.
- Net lines: file-core 382 → 489, file.mjs 528 → 583, drop.mjs 1,495 → 1,490, group-core 198 → 167 (+126 in all). Why:
  planLead carries its own floods (`walkFrom`, a heap Dijkstra with settle caps, ~75 lines) and the fight's square at
  its turn moved from drop.mjs's formation spots into file.mjs (`fightPlan`, `slotAtTurn`, `targetOf`). L2 deletes
  0.9's motion (staggerFile, sequence-core, B0) against it.
- One 0.9 test became an L2 todo: "on open ground every delay is 0" was for formation routes side by side; R5 wants
  the leader at once and the pack one wave later (`file-core.test`, `todo: L2`).
- The board's stub collision (`drop.test.mjs`) now counts a touch of a wall's end, as Foundry 14.370's
  `lineSegmentIntersection` does (t within 1e-8): the leader rule's lines behind a leader run square centre to centre
  through door-frame corners, which the stub let the pathfinder take and the wave's wall test then refused.
- Defaults taken without a human (scratch `b10/auto-decisions.md`): a march leader whose drop square is not free takes
  the nearest free square; a member already on its best square is in place, neither sent nor named.

Open after L1: the motion (R5, R6: pass-through drawn on top, the pack one wave behind the leader, single file only at
a narrow point) is L2; the fight's leader-only rules (R7: checkpoints on free squares, speed running out) and the cap
24 with its page gate (R11) are later steps; a fight's checkpoint expansion can still put a diagonal step through a
wall's end on real Foundry (found while fixing the stub; pre-existing, not judged here).

### 18.2 Step L2: the motion (the leader first, the pack a wave later, single file at a narrow point; the leader on top)

Tests first throughout (`file-core.test` R5 gates, `glue.test` R6, `drop.test` the four fixes and the board's R5 / R6,
`group-props.test` the cap, `telemetry.test` the stored row); each failed on L1's code before it passed.

**The motion** (R5; `file-core` `staggerFile`, rewritten). The leader goes in the drop's own update (delay 0). The pack
starts one wave (150 ms) later; when the leader starts behind (by walk to the drop: planLead now returns each member's
`left`), once it is a wave past the frontmost member, `150 + (left(leader) − min left(others)) / speed`, rounded up to
a wave, capped at 4 s less the plan's time. Every other member then takes the first wave at or after the pack at which
it meets none of the members timed before it (plan order: the leader, then least walk left):
- *a narrow point*: `narrowZones(step)` (from planLead's own step oracle) marks a one-wide square (walled on both sides
  along one axis: a corridor, the gap in a thick wall) and the door in a thin wall (an open step whose two steps
  alongside are walled), each a 1×1 box; two members (the leader included) inside one box at once is a conflict, with
  the latency buffer (0.75 square of walk) when they are in different waves. One through a door at a time; a line in a
  one-wide way moves up as one (each enters a square as the one ahead leaves it);
- *a deep, long overlap*: two movers more than half a square inside each other for over 400 ms (two ways merging into
  one lane; a crossing on open ground is brief) (`motion-core` `closeTime`);
- *one walking through the other at rest*: still at its start, or already at its slot (`nearestWhile`); in the same
  update a brush of 0.15 square, or a pass within a wave of the other's arrival (a crossing), is soft; across waves
  the simulator's 0.05 and the latency buffer. Never against the leader (R6).
A member with no clear wave under the cap goes at the least crowded one (soft, `crowded`), never cut. The ordering
search (`sequence-core` `sequence`) is gone with the file; `stacksOf` moved to group-core. The board (`drop.test`):
three dragged through the thin door down a one-wide way: only the leader in the drop's own update, its move naming it
the leader, `plan.pack` 150, the two followers in two different later waves.

**The leader on top** (R6). Its move carries `pentarynMovementLead` (its id, then its riders', so a rider stays above
its mount: a batch's options are shared, so the ids say who leads); every client's ghost.mjs (the existing
`updateToken` handler) marks it and ranks it `LEAD_RANK` 2, above owned-on-top, in
the mesh sort and the layer's click order, until its move ends (a 100 ms poll: no movement animation and no pending
move, kept at least 300 ms, at most 60 s). No document write. `status().group.leading`. A stop of the leader inside its
own members carries it on along its way to the first free spot however far, walking through its members only
(`takenAround` knows the leader and its group). The leader is left out of the rest checks of the stagger; the
simulator reports the leader through its own members ("leader", allowed) and never fails it.

**The cap** (R11): `GROUP_MAX` 24 (motion-core; file.mjs's `FILE_MAX` gone), out of combat and in a fight; more is
core's drop out of combat and "In a fight, drag one token at a time." in a fight. The page gate (under 100 / 250 ms on
the GPU page) is not run here (no deploy in this step); Node, warm: 8 members 12.9 ms, 20 members 49.4 ms (L1).

**The four fixes**, each from a failing test:
- (a) the stop's straight-line last resort (`stopSpot` → `clearOfWalls`) is deleted. A token a stop finds inside a token
  at rest is carried along its own way (1.5 squares ahead, else back the whole way it came, never through a wall or a
  token at rest); with nowhere along its way, a click leaves it **walking on to its own square** (named: "Could not stop
  clear of another token, so walked on to its own square: …"), and a wall or door cut, or an own square that is not
  clear, leaves it where it is drawn (named: "Stopped on another token, with no free spot along its own way: … Drag it
  clear."). See the deviations.
- (b) `stopGroupHere` rested a mate on the carried one: the stop's first write names where the stop will rest
  (`pentarynMovementStopAt`, top-left), and the dragger's screen claims that spot before it stops the rest. L1's open
  rest overlap seed 1412 holds with it and fails without (`SIM-L2-01`).
- (c) a wave whose members this screen no longer draws (the dragger changed scene) left them silently: they are named
  ("Did not move, the group's walk was ended: …", reason `wave:scene`; `status().group.wave.undrawn`).
- (d) `stepThroughWall` ignored a one-way wall's direction: `motion-core` `wallOpenFrom` reads it as Foundry does
  (`Edge#orientPoint`; a wall drawn top to bottom with dir 1 opens from the west, auto-decision 12 of the playground)
  in a fight's per-square check and a wave's wall test.

**Deleted** (R12): `sequence-core.mjs` and its test (176 + 150 lines), the world setting `groupStagger` and B0 (its row,
lang keys, README row, `status().group.stagger`, `last.plan.tier`, the blocker-1 test; the stored row removed once by
the active GM, `RETIRED.world.groupStagger`), the simulator's B0 mode, a new drop emptying a fight queue (it left the
queue's members unnamed: a new drop of other tokens leaves it running, a member dropped again leaves it).

**Gates.**
- Seeded, on the cores (`file-core.test`): open ground, the leader in front (200 drops): the leader at 0, the pack at
  150 in every drop; 194 of 200 are the leader plus one wave, 6 hold one member longer, each one whose slot an earlier
  member's route crosses (see the deviations). A file of 20 in a one-wide way (three spacings): one wave after the
  leader, nobody walking into a member at rest, never two in one square. Through a door (150 seeded drops, 2-8
  members): never two centres in the door's square together, the last within 4 s, nobody crowded; 102 drops of four
  or more spread over two rows and two columns past it. The leader behind (200): the pack at the first wave at which
  the leader is a wave past the frontmost member, not a wave later. 800 seeded drops (600 floors, 200 dungeon): 753
  planned, every delay a wave step, the leader at 0, nobody before the pack, the last at most 3,900 ms; 29 crowded
  (3.9 %: a leader more than 4 s behind, or a member whose start and slot both lie on earlier routes); the other 724:
  nobody walks into a member at rest, no two share a narrow point (an independent 10 ms sampling).
- A leader anywhere in a one-wide tunnel of 2 to 20 (400 seeds): **0 blocked** (the leader on the drop square, nobody
  named); no follower ever ahead of it once it moves; 1 drop waited the whole 4 s for the leader.
- The z-order (`glue.test`): an `updateToken` with the option from another user lifts the token above an owned one on
  this client (`meshSort(sort, 2)`), another token's move naming someone else is not lifted, it stays lifted while it
  walks and drops back when its move ends; no document write.
- The four fixes' tests (`drop.test` "0.10 L2 fix (a) … (d)", the leader's stop carried through its members).
- `make foundry-movement-sim SEEDS=2000` (one mode):

  | | L1 B1 | L2 |
  |---|---|---|
  | passThrough | 9 | 4 (315, 954, 1451, 1522) |
  | restOverlap | 3 | 3 (230, 1097, 1399) |
  | wallCross / wrongCharge / unsent / errors | 0 | 0 |
  | mover overlap episodes (p95 depth, duration) | 3,016 (0.985, 1,983 ms) | 3,636 (0.98, 2,183 ms) |
  | the leader through its own members (allowed) | — | 456 |
  | members dropped / never moved / named | 8,480 / 2,809 / 2,138 | 8,480 / 2,784 / 2,270 |

  The passThrough seeds are all a member walking through one at rest in a different wave, three with a door shut on
  the way (1451, 1522, 315) and one with a second group (954); the restOverlap seeds are all a door shut across two
  walkers, the later one left inside the first with no clear spot along its way (fix (a)'s "stays, named"). Mover
  overlap rises (the pack goes together; soft, measured). The regression seeds were found again (seeds 1-8000):
  SIM5-01 19, 138, 492, 721; SIM5-02 2, 41, 60, 69; SIM-L2-01 1412.
- Mechanical: `make foundry-movement-check` 406 pass, 0 fail, 0 todo (conformance 95.9 %, C30 / C56);
  `make foundry-module-index && make check-context` OK (32 warnings already there).

**Deviations from BINDING and why.**
- *Open ground is the leader plus one wave* holds except where a later member's slot lies on an earlier member's route
  (6 of 200 open-ground drops): R5's own rule ("hold apart … when one would pass through the other at rest") then holds
  that member until the other has passed. planLead (R3) gives slots in order and only later routes avoid earlier slots;
  the deleted route-clearance test (R12) was the other remedy. Recorded, not fixed.
- *Fix (a)'s "else stay, named"*: staying where drawn inside a token at rest is an overlap at rest (R8, zero
  tolerance), and in the simulator it raised restOverlap from 2 to 9 (the click cases). So a click leaves such a token
  walking on to its own square (clear when given out), named; only a wall cut (it cannot walk on), or an own square no
  longer clear, leaves it where drawn, named. No search (decision 2).
- The leader's pass-through and z-order are built out of combat and for the fight's leader's walk (the option); in a
  fight the leader still routes round its members and the per-square check still refuses a member standing still in
  its next square: R7's leader-only rules (checkpoints on free squares, a click inside a member) are the fight step's.
- Net lines: file-core 489 → 614 (+125: `narrowZones`, `zoneSpans`, the three hold rules; 0.9's `sequence` it replaces
  was in the deleted sequence-core), file.mjs 583 → 592 (+9: the stop's spot claim), drop.mjs 1,490 → 1,502 (+12: the
  lead option, the undrawn wave, the one-way wall); with sequence-core (−176) the module is 8,190 → 8,373 lines (ghost
  +71 for the leader on top, motion-core +64 for `closeTime`, `nearestWhile`, `wallOpenFrom`).
- One commit for the step's code (the pieces share drop.mjs, file.mjs, motion-core and the simulator's model), one for
  this record.
- A drop dropped just past a door's mouth can plug the door (R3's tie to the least walk takes the square in the
  passage first, then the door square itself): seen while writing the door gate, which drops clear of the mouth. Open.

Open after L2: zero passThrough / restOverlap (L3's gate); the fight's leader rules (R7: through its members, checkpoints
on free squares, speed running out); the page gate (R11); the narrow passages (R9); the door plug above.

### 18.3 Step L3: the fight and the simulator (review 3 §4 steps 6 and 7)

Tests first throughout (`fight.test` the pure side, `drop.test` "0.10 L3", `file-core.test` the FIFO order, `sim.test`
SIM-L3-01..10); each failed on L2's code before it passed (the regression seeds: each holds with its fix and breaks
with that fix alone switched off in the simulator's model).

**The fight** (R6, R7; `drop.mjs` runFight / routeAtTurn / walkOne, new `fightSteps`; `motion-core` `fightWalk`). The
order is planLead's new `byWalk`: the leader, then least walk left (ties by id), whatever slots the plan gives out
(`file.mjs` fightPlan; `status().group.queue.order`). Each member is slotted and routed at its turn as in L1 (march:
behind where the leader came to rest). The leader routes through its own group (never through anyone else; it rests
on none): `routeAtTurn` leaves the queue's members out of its avoid circles, `walkOne` lets its next squares through
them (`leadThrough`, read by the per-square test `stepMeetsStanding`), and a square inside a member is no checkpoint
(`fightWalk`'s `free`), so its updates end only on free squares and a click while it is inside a member carries it on
to the next free one. No ally cost anywhere (R6): the leader's charge is core's measure of the squares it walks.

**The speed stop** (R7). dnd5e 6.1.1's own reading (`TokenRuler5e #getSpeedBasedStyle`, dnd5e.mjs:84843):
`actor.system.attributes.movement.speeds[action]` (a type with `walkFallback`, or one dnd5e does not know: at least the
walking speed), creatures only, less the sum of `TokenDocument#movementHistory[*].cost` (core clears the history when
the combatant's turn starts, combat.mjs `_clearMovementHistoryOnStartTurn`; a non-finite cost is left out)
(`group-adapter` `movementLeft`). `fightSteps` measures the walk's prefixes with core's `measureMovementPath` and cuts
it at the last free square whose cost the movement left pays for (`fightWalk`'s `end`; `paid`: the last square paid
for, `inside` the paid squares past the end that lie inside a member). Nothing left: it does not move. Both are named
once at the queue's end ("Out of movement this turn, stopped short: …", lang `named.speed`). No usable speed (no actor,
not a creature, 0, a teleport action): the whole way, as a single drag (unchanged; its own regression test).
`status().group.queue.walks`: `{ id, planned, sent, left, why, inside }` a member.

**The simulator, one mode, its own kinds** (`test/sim/scenario.mjs` KINDS). 0.9's generator is kept draw for draw as
`legacy` (40 %: the regression seeds and the overlap comparison run on it); then `swarm` (a visible target 1×1, 2×2 or
3×3 in the target room, the drop on it), `hidden` (the GM's drag onto a hidden token: a march), `tunnel` (map `tunnel`:
a one-wide tunnel of 10-16, sometimes bent, a party of 3-12 queued in it, the leader at the back 60 % or the front),
`crowd` (map `hall`: 10-24 across two big rooms and a 2-3 wide door), `station` (Joe's playground, below). Every kind
but legacy gives most members in a fight a walking speed (10-40 ft) and some movement already spent; the invariants
gain `wrongCharge` `overSpeed` and the leader's multi-square update (every square but the last inside a member) and the
new **`shape`** (test/sim/shape.mjs, shared with the L1 gate: march, nobody rests beside or ahead of the leader by an
independent flood from B; swarm, the leader touches the target whenever a touching square was free and reachable),
judged on every plan as its screen made it, and in a fight on every member's square at its turn. The engine splits a
fight's update at checkpoints (a `checkpoint: false` waypoint joins the next), carries the cost on broadcasts, records
the squares inside other tokens of a multi-square update. **Joe's stations** (`test/fixtures/stations.json`, written
from b10/pg/stations.json by a scratch tool): the 14 on the square grid (S05 and S06 are off-grid curves, R9's step),
station-local squares; thin walls and one-way walls (`test/fixtures/grid.mjs` `walls`: a crossing or a touch blocks, a
one-way wall from its open side does not, `motion-core` `wallOpenFrom`), doors with their states (closed, locked and
secret ones stay shut; an open one may be shut), each scenario's tokens and drop points; the dragged group by station
(heroes; S01/S02 sometimes the monsters, S04 the monsters, S15 the villagers, S14 both four-hero groups head to head);
S11's mud left out (no terrain cost in the simulator), a rider on its mount left out (no stacks).

**What the simulator found, and the fixes** (each in the module and its model; seeds are the regressions):
- *The order every screen sees* (`file-core` `staggerFile`): a drop's waves reach every client in send order (a lost
  packet or a stall holds the later ones back with it, never ahead), so a member whose route passes another's slot is
  sent no later than it, and one whose route passes another's start no earlier. L2's four passThrough seeds (315, 954,
  1451, 1522) were all a member sent before one that then walked through it at its slot on a lagging screen
  (SIM-L3-01). `file-core.test`: 953 drops, 8,353 ordered pairs, none out of order.
- *One stop settles the front ones first* (`motion-core` `stopOrder`; stop.mjs, file.mjs, drop.mjs cutAcross): of two
  near each other (touching plus 1.5 squares) the one walking toward the other is behind; the front one rests where it
  is drawn, the ones behind are carried back along their ways into room nobody took (SIM-L3-02; 0.9's 4157, 4881).
- *A walk on looked at again* (stop.mjs displace): a carry whose way a door shut since crosses (a click just after a
  door shut, before this screen knew) takes its spot again along its way (SIM-L3-03, L2's 1097).
- *The same stop for this screen's walkers heading into it* (stop.mjs `stopAlso`): one of this screen's own walkers
  counts where it is drawn, not where it is going, and if its way comes into a spot the stop rests a token on it is
  stopped by the same stop (SIM-L3-04; L2's 230).
- *A hidden tab keeps its waves* (file.mjs onVisibility): 0.8 to L2 sent every remaining wave at once, so a whole file
  set off together and jammed in the doorway; now they stay on their timers (whole seconds there), one due past 3 s
  timed for 3 s, the last by 4 s (SIM-L3-05).
- *Make room* (stop.mjs `makeRoom`): one with no spot along its own way, inside only members the same stop rested,
  rests where drawn when those can be carried on along their own ways (SIM-L3-06).
- *A waiting member's slot* (file.mjs `groupPendingEnds`, stop.mjs takenAround; drop.mjs sendWave): no stop carries a
  token onto where a member still waiting for its wave will rest, and no wave sends a member onto a spot a stop is
  carrying a token to (SIM-L3-07, L2's 6166, 7154).
- *A fight's next square never onto a walker's own square* (drop.mjs stepMeetsStanding) when that walker rests there
  (its move's last square) or has had no next square for 500 ms (its screen held up, or gone); one about to walk on is
  passed as before, so two crossing still brush (SIM-L3-08: 0.9.0's open 3599, a player's tab dropped mid-walk and its
  token was walked onto).
- *A brush is no overlap* (stop.mjs takenAround `enters`): a carry that sets off within 0.05 square of a token at rest
  is not "leaving" it and may not go on through it (SIM-L3-09).
- *A wave's stayer blocks the whole wave* (drop.mjs sendWave): a member that stays is in the way of every other member
  of the same wave, also of one looked at before it (SIM-L3-10).

**Gates.**
- 60 seeded fight queues (`drop.test` "0.10 L3 gate"): **green**. 215 walks; the leader first, then least walk left
  (`queue.order`); every member charged exactly core's measure, 5 ft a square; the leader's charge the same with its
  members in its lane and with them moved off it; nobody through or onto a standing non-member; the leader through its
  own members on 192 steps, no checkpoint inside one. The 0.9.0 40-seed fight gate holds with the leader's exception.
- 200 seeded speed stops (`drop.test` "0.10 L3 gate (R7)"): **green**. 255 members stopped where their movement ran
  out (53 with nothing left did not move, named), 75 with no usable speed walked the whole way; never one past the last
  paid square, a non-leader never short of it, the leader short only by squares inside its members. A single drag in a
  fight with 10 ft left still walks the whole way (as 0.9.0).
- `make foundry-movement-sim SEEDS=10000`, the full mix: passThrough **0**, wallCross 0, wrongCharge 0, unsent 0,
  errors 0, shape **0**; restOverlap **4** (5418, 6142, 8249, 9191; below). 12 seeds flagged as same-instant races (not
  failed). Members dropped 62,381, never moved 25,618, named 22,061.
- The legacy mix (0.9's generator draw for draw), 10,000 seeds: passThrough **0**, wallCross, wrongCharge, unsent,
  errors, shape 0; restOverlap **2** (2357, 9124; below). **0.9.0's open seeds** (§17.5, §17.7: passThrough 5002, 5386;
  restOverlap 3599, 3773, 5188, 7391, 8004, 8958) all hold (3599 with SIM-L3-08); **L2's open seeds** (passThrough
  315, 954, 1451, 1522; restOverlap 230, 1097, 1399) all hold.
- Mover overlap against 0.9.0's B1, re-run here on 0.9.0's own simulator (`ee93442b`, B1, the same sums: 18,015
  episodes, p95 1,900 ms, 4,539 square-seconds; the plan's §17.5 had 18,045 / 1,883 / 4,543): on the legacy mix
  **14,417 episodes, p95 1,767 ms, 2,952 square-seconds**, better on all three, with the leader's walk through its own
  members while both move counted apart as R6's (1,940 episodes, p95 2,733 ms, 1,096 square-seconds); all of them
  together 16,357 / 2,033 ms / 4,048 (see the deviations). The full mix: 25,830 episodes, p95 2,033 ms, 6,409
  square-seconds (crowds of 24 and tunnels overlap by nature), the leader's apart 2,082.
- The suite's quick run (`sim.test`): 60 seeds of every kind (maps, both modes, kinds ≥ 5) and the regression seeds,
  36 tests. Earlier regression seeds that L3's fixes now cover too were found again on the legacy mix (SIM5-01 721 →
  424, SIM5-02 41 → 86, SIM-L2-01 1412 → 9736; SIM-L3-02 and -05 likewise).
- Mechanical: `make foundry-movement-check` 446 pass, 0 fail, 0 todo (conformance 95.9 %, C30 / C56); `make test`
  2,461 passed, 9 skipped, 4 xfailed; `make foundry-module-index && make check-context` OK (the same 32 warnings).
- **Red**: six seeds in 20,000 runs leave two tokens on each other, all a stop of a packed file or crowd:
  - 2357 (legacy, a two-wide corridor): a door cut of one member; the same stop stops the two beside it; the middle one
    lies 0.12 inside the one cut, with the shut door ahead and the other behind, and the one cut cannot make room (its
    own way ahead crosses the door): named "Stopped on another token".
  - 9124 (legacy, a two-wide corridor): a click stops two brushing; the one behind is carried back along its way; a
    door shuts before that walk on goes; its second look finds the door behind and the other ahead: 0.28 inside, named.
  - 5418, 6142, 8249 (crowds of 17 to 24 in a two- or three-wide door): a click, or a door cut (6142: a click and a cut
    30 ms apart), of members jammed shoulder to shoulder; nowhere along any member's way is clear and nobody it lies in
    can move along its own: 0.10 to 0.69 inside, named.
  - 9191 (a tunnel, a second group): a door cut stops a file of eight in a one-wide tunnel (front first, each clear of
    the next), but the stop's writes are separate updates and one of them reached the server 440 ms after its
    neighbour's (a lost packet): on a player's screen the later one walked on to its square, onto the one already
    stopped, until its own stop came.
  Each is a stop's resolution along the tokens' own ways running out (decision 2, R12: no search, no off-way spot);
  the last is a stop's writes not going as one update.

**Deviations from BINDING and why.**
- *Net lines* (R12): file-core 614 → 631 (+17: the FIFO bounds, `byWalk`), file.mjs 592 → 630 (+38: the hidden-tab
  rule, the waiting members' slots, the stop order), drop.mjs 1,503 → 1,592 (+89: `fightSteps`, `leadThrough`, the own
  square rule, the wave's second round, the cut's `stopAlso`); stop.mjs 871 → 1,075 (+204: the stop order, the walk-on
  claims and second look, `stopAlso`, `makeRoom`), motion-core 513 → 570 (`fightWalk`, `stopOrder`), group-adapter
  471 → 496 (`movementLeft`). Module 8,358 → 8,788 lines. Why: the fight's leader rules and the speed stop are new
  behaviour; the rest is what the simulator's zero rest overlap needed of a stop of several tokens.
- *Decision 2 and R12 on stops*: a stop now carries tokens along their own ways in more cases (the ones behind back
  first; one already rested carried on to make room; this screen's walkers heading into a stop's spot stopped too). No
  search and no spot off a token's own way (R12's straight-line last resort stays deleted). Why: R8's zero rest
  overlap, and Joe 2026-11-24 "at rest nobody overlaps".
- *A hidden tab* (0.8's "sends its waves at once", not BINDING): replaced by the waves on their own timers; R5's 4 s
  holds. Why: the flush set a whole file off together, the simulator's commonest jam.
- *A fight's next square* (Joe 2026-11-24: two movers may brush): a walker that rests on the square, or whose screen
  has held it up for 500 ms, now counts as standing there. Why: 0.9.0's 3599 and two-screen fights rested two tokens
  on one square; crossing walkers still brush.
- *The overlap comparison* is made on the legacy mix with the leader's walk through its own moving members counted
  apart (R6 allows it; 0.9.0 had no leader). Counted in, the p95 duration is 2,033 ms against 0.9.0's 1,900 (episodes
  and square-seconds still better).
- *One code commit, one record* (as L2): the pieces share drop.mjs, stop.mjs, file.mjs and the simulator's model.
- The pending-slot rule and the wave's second round have their failing tests in the simulator (SIM-L3-07, SIM-L3-10)
  and are mirrored line for line in the model; no board test of their own.
- Defaults taken without a human: scratch `b10/auto-decisions.md` "L3".

**Fix round** (the L3 gate was red on six rest-overlap seeds; tests first: `drop.test` "0.10 L3 fix round" x4,
`fight.test` settleAlong, `sim.test` SIM-L3-11..16, each failing before its fix and, in the simulator, again with that
fix alone switched off):
- *One stop, one update* (`stop.mjs` `stopBatched`, `flushBatch`; `file.mjs` stopGroupHere and the late stops,
  `drop.mjs` cutAcross): every token a click, a cut, another user's stop on the dragger's screen or a group's late
  stops stops goes in one `Scene#moveTokens` (a lone one by `TokenDocument#move`), the write naming by id where each
  carried one will rest (`pentarynMovementStopAt: { [id]: { x, y } | null }`; the old `{ x, y }` still read); the
  dragger's screen claims them all and leaves that update's tokens to its sender. Seed 9191 (SIM-L3-11): the file of
  eight was stopped front first in eight updates and one was late on the wire.
- *Settled together* (`stop.mjs` `settleTogether`; `motion-core` `spotsAlong`, `settleAlong`): before the update goes,
  when the one-by-one stop left two inside each other, one inside a token at rest, or a walk on through where another
  rests, every token of the stop takes one of its own spots along its own way (where drawn, ahead at most 1.5 squares,
  back the whole way it came; no two at rest inside each other, no walk on through one at rest, the front ones keep
  their best spot first; conflict-directed backjumping, 40,000 tries). One of this screen's walkers in a token's way
  back stops with them and they are settled again. Batching exposed the walk-on-through class the simulator had
  counted soft ("unforeseen": the sender's documents did not yet show the stop it had itself just decided): seeds 345,
  6572, 6982, 9631 (SIM-L3-13), and with the walker 2357 (SIM-L3-14). "Stopped on another token" is named after it.
- *Room along the way* (`roomAlong`, makeRoom's check at each spot along the token's own way): seed 5418 (SIM-L3-15).
- *A walk on's second look settles again* (`settleAgain`): a door this screen did not yet know was shut, across a walk
  on back; inside members of its own stop resting where drawn, it is settled with them and they walk on clear along
  their own ways. Seed 9124 (SIM-L3-16).
- *A waiting member's slot is a stop's last choice* (`stopSpot`, `takenAround` `relax`): with no spot clear of every
  slot, one clear of the tokens themselves; that member's wave then stays, named. Seed 8249 (SIM-L3-12).
- Tried and dropped (no seed in 20,000 needed them): an own walker as a wall for every carry (the settle covers it),
  a walk on in flight counted at its end, the first stop's way for a token stopped again on its walk on, and a token
  the stop lets walk on taking part in the settle (6142's crowd has no solution along the ways even at 4,000,000 tries).
- The older regression seeds the settle now also covers were found again (SIM5-02 2, 60, 69, 86 → 258, 380, 437, 575;
  SIM-L3-03 1097 → 9124; SIM-L3-04 230 dropped; SIM-L3-05 933 → 1209); where no seed in 10,000 breaks with only the
  old fix off (stopOrder, makeRoom, the brush), the test switches the settle off with it (SIM-L3-02, -06, -09).

**Gates after the fix round.**
- `make foundry-movement-sim SEEDS=10000`, the full mix: passThrough **0**, wallCross 0, wrongCharge 0, unsent 0,
  errors 0, shape 0; restOverlap **1** (6142, below). 11 seeds flagged as same-instant races. Members dropped 62,381,
  never moved 25,622, named 22,059. Mover overlap 25,644 episodes, p95 2,033 ms, 6,367 square-seconds; the leader's
  through its own moving members apart: 2,079.
- The legacy mix, 10,000 seeds: **all zero** (restOverlap 0, passThrough 0). Mover overlap **14,381 episodes, p95
  1,767 ms, 2,947 square-seconds** against 0.9.0's B1 on its own simulator (18,015 / 1,900 / 4,539): better on all
  three; the leader's walk through its own moving members apart (R6): 1,948 episodes, p95 2,733 ms, 1,096.
  0.9.0's open seeds (5002, 5386, 3599, 3773, 5188, 7391, 8004, 8958) and L2's (315, 954, 1451, 1522, 230, 1097,
  1399) all hold, and so do L3's six (2357, 9124, 5418, 6142 apart, 8249, 9191).
- The 60 fight queues and 200 speed stops: green, unchanged (drop.test "0.10 L3 gate").
- Mechanical: `make foundry-movement-check` 458 pass, 0 fail, 0 todo (conformance 95.9 %, C30 / C56); `make test`
  2,461 passed, 9 skipped, 4 xfailed; `make foundry-module-index && make check-context` OK (the same 32 warnings).
- **Still red: seed 6142** (crowd, hall3): the GM's click stops a crowd of 17 jammed shoulder to shoulder in a
  three-wide door; there is no solution along their ways (settleAlong finds none even at 4,000,000 tries), so two of
  them walk on to their own squares, named (0.10 L2 fix (a)); 30 ms later the GM shuts the door across them: the one
  in the doorway can neither cross the shut door nor back off (the room behind is held by the click's walks on, still
  in flight), and rests 0.36 square inside another, named. Zero needs a spot off its way (review 3 deleted the
  straight-line last resort; R12) or Joe's word that such a jam may be left named.

**Deviations (fix round).** Net lines (R12): file.mjs 630 → 639 (+9: one stop's update read by id), drop.mjs
1,604 → 1,608 (+4: the cut as one update), stop.mjs 1,075 → 1,341 (+266: the batch, the settle, room along the way,
the second look's settle), motion-core 570 → 657 (+87: spotsAlong, settleAlong). Why: zero rest overlap (R8) along
the tokens' own ways only (decision 2, R12: no search, no spot off the way). The settle's backjumping search is over
spots along each token's own way, not a route search. Slot-last and room-along-the-way have their failing tests in
the simulator only (SIM-L3-12, -15), mirrored line for line in the model.

Open after L3 and its fix round: seed 6142 above (a jam with no solution along the ways, then a door shut on it: a
spot off its way, or Joe's word); the page gate (R11, needs a deploy); the narrow passages and the stair (R9, review 3
§4 step 9); L2's door plug (a drop just past a door's mouth), not looked at again.

**The ruling's retry: a door is not shut on a jam** (Fable for Joe, on seed 6142: "refuse that shut"; R12 kept: no
straight-line last resort, no search on a stop). Started from failing tests: `fight.test` "L3 ruling (seed 6142)"
(motion-core), `drop.test` "L3 ruling (simulator seed 6142)" (the hook), `sim.test` SIM-L3-17 (the seed).
- `drop.mjs` `onPreWall` on `preUpdateWall`, on the client making the change: a door going to shut (`motion-core`
  `doorShutting`: a movement-blocking door, ds open → anything else) is dry-run through the door cut's stop
  (`stop.mjs` `shutBlocked`): every token this screen sees walking through the door's line out of combat (any user's;
  ghost and the unconstrained tool pass) takes its spots along its own way with the door shut (`spotsAlong`, as
  settleTogether builds them), and they are settled together (`motion-core` `shutBlocked` → `settleAlong`); a waiting
  member's slot is the last choice, as for the stop. One left with no spot clear of every token: `return false`,
  "Door blocked: <name> is in the doorway" (the nearest the door first). No setting, no flag, no document write; the
  drag help off (the GM's switch or the breaker), a fight, or an error: no veto. The GM-click stop's walk on (named)
  is untouched.
- The simulator's GM asks the same of its own screen before it shuts (`model.mjs` `shutBlocked`); a refused shut stays
  open (event `doorBlocked`). Two regression seeds whose "without the fix" run no longer breaks because the veto now
  refuses that run's shut (SIM-L3-04 seed 2680 with stopAlso off, SIM-L3-05 seed 1209 with the flush back) switch the
  veto off with their own fix (`noShutVeto`), as the fix round did with the settle.
- How often: 1 shut refused in 10,000 full-mix seeds (2,720 shuts; seed 6142, and without the veto it fails), 0 of
  3,074 in the legacy mix. Without the slot-last relaxation seed 8249's shut was refused although the stop handles it;
  with it, no refusal in 20,000 seeds is one the stop would have handled.

**Gates after the retry.**
- `make foundry-movement-sim SEEDS=10000`, the full mix: **every class 0** (passThrough, wallCross, wrongCharge,
  unsent, restOverlap, shape, errors); 11 seeds flagged as same-instant races. Mover overlap 25,651 episodes, p95
  2,033 ms, 6,368 square-seconds; the leader through its own moving members apart: 2,079 (p95 2,950 ms).
- The legacy mix, 10,000 seeds: **every class 0**; mover overlap 14,381 episodes, p95 1,767 ms, 2,947 square-seconds
  against 0.9.0's B1 (18,015 / 1,900 / 4,539): better on all three.
- Mechanical: `make foundry-movement-check` 461 pass, 0 fail, 0 todo (conformance 95.9 %, C30 / C56); `make test`
  2,461 passed, 9 skipped, 4 xfailed; `make foundry-module-index && make check-context` OK (the same 32 warnings).
- Known limit (README): a door cannot be shut on a jammed group token that has nowhere free to rest ("Door blocked").
  Measured only, not a gate: mover-overlap p95 with the leader's own pass-through (R6) counted in is 2,033 ms in the
  full mix against 0.9.0's 1,900 on its own mix.
- Net lines: motion-core +23, stop.mjs +43, drop.mjs +22 (the veto, its notice and its dry run; nothing deleted is
  back).

Open after the retry: the page gate (R11, needs a deploy); the narrow passages and the stair (R9, review 3 §4 step 9);
L2's door plug, not looked at again.

### 18.4 Step N: any passage shape (R9; review 3 §3, without its switch)

Not a feature of its own and no switch, setting, marker or region (Joe, 2026-11-24: "pathfinding itself must handle
any passage shape"; the drag-help button stays the only off switch). Tests first: `narrow.test` (pure), `pathfind.test`
"R9" (the wrap, on Joe's S05 walls), `drop.test` "0.10 R9" (a fight and a group out of combat on the stair); each
failed before the code it describes.

**What was built.**
- **`narrow-core.mjs`** (new, pure). A square is *tight* when a wall that blocks movement runs through its interior (an
  off-grid wall: a curved stair, a slit, a pillar); a map whose walls lie on the grid lines has none. A tight square and
  each square beside one is cut into eighth-square cells; a cell is passable when some point in it keeps **0.15 square**
  (the token's centre, for any token up to 1×1) from every wall: a border cell's point is the best of 25 samples moved
  onto the centre line inside the cell (a Newton step equalising the distances to the nearest wall and the nearest one
  facing it), so a throat of exactly 0.3 passes. Cells link when the straight link keeps 0.15 at every 1/16 sample (the
  walk's own check; the clearance is 1-Lipschitz, so a link whose ends keep enough needs no samples, and one whose ends
  keep more than its length crosses no wall), cached. A square's nodes are its connected groups of cells: a square
  crossed by two lanes (a hairpin, a thin wall) is two nodes. Lazily built where a search touches; one field per scene,
  wall type, size and preview, dropped on any wall or door change (pathfind.mjs `narrowCache`); a player's preview
  counts a wall only where seen (half a square at a time, at its middle) and is re-read when fog is explored.
- **The A* stays on squares** (`pathfind-core` `search`, a `more` hook; node key `i,j#c` for a part of a tight square).
  `narrowMore`: a plain square beside a tight one steps into the parts its cells touch, a part into the parts (or plain
  squares) beside it, a tight square's plain node and the part its centre lies in join at no cost; every step costs what
  the square step costs (core's measure, Difficult Terrain included). On ties a plain step wins (`FINE_TIE` in the
  straightness tie-break only). Without `more`, or with no tight square, the search is the same job, node for node.
- **The walk** (`walkFor`). Through the parts of tight squares the eighth-cell path of least length × (1 + 3 × the
  padding missing / the padding radius: the token's own); then a band settled on it every 1/8 square: smoothed, onto the
  centre line where the way is narrower than the token (within a tube of 0.025 so it can smooth a kink, never under the
  pass radius), out to the padding radius where there is room; each move checked (no wall, 0.15 kept along both
  segments, the tokens standing, traps, unseen ground, dnd5e's creature blocking: the adapter's `okSeg`). Then chords
  (within 0.012 of the band, every sample keeping 0.15), a corner over 15° cut once or twice (at most 0.05 along a leg,
  re-checked), points under 0.03 apart merged. Out of combat the whole leg is the band (its corners are the band's: no
  string pull, no arcs) and goes as one move. In a fight only the stretch from the last whole square before the first
  tight square to the first after it: the rest stays on the grid, and a point where the centre line enters a new square
  is a checkpoint, the others not (`drop.mjs` `withCheckpoints` keeps an off-lattice waypoint the pathfinder left no
  checkpoint inside the square the walk is in; `fightSteps` keeps them). Its fallback is the cell path itself.
- **Constraint 1, read literally**: a leg that passes tight squares on whole squares only keeps today's route when that
  route keeps 0.15 from every wall; only otherwise is it the band. A leg through a part of a tight square is the narrow
  walk; if no walk keeps 0.15 there, the leg is no route (never a shorter line through rock).
- **Rest on the centre line** (Joe). A destination in a tight square is moved to where the token may rest there
  (`restPoint`: the nearest passable point, settled onto the centre line where the way is narrower than the token):
  the drag's explicit points before planning (pathfind.mjs `narrowGoals`; the ruler then shows the snapped square as
  not reached), a route's goal (`pathfind.route` reports it as `goal`), a fight leader's square (drop.mjs routeAtTurn),
  a march leader's drop (file.mjs planDrop). A click or a shut door out of combat stops where it is drawn, on the walked
  centre line; in a fight at the next checkpoint, a centre-line point; a speed stop on the last paid one.
- **Groups** (constraint 6). planLead's step oracle joins two squares where a part of one meets a part of the other.
  A march whose leader rests on a narrow way: the members after it (least walk left first) take points back along the
  leader's own way, a token apart (their radii and the 0.2 rest gap), while those lie on the narrow way and clear of the
  tokens standing, one route each (`lineBehind`); the rest keep planLead's squares. In a fight, at a member's turn: the
  first point clear of every token standing back along its own way to where the leader rests (slotAtTurn).
- **R13**: `pathfind.route` → `narrow`, `minClearance` (squares), `goal`; `pathfind.status().last` → `narrow`,
  `minClearance`; manifest rows, describe golden, README, CHANGELOG, `context/foundry/movement.md` (1b).

**Gates.**
- **400 seeded room-to-room routes over generated C stairs** (`narrow.test`: two curved off-grid walls in segments of
  8°–15°, radius 3–8, the narrowest true clear width 0.3–1.0 mid-way and 1.0–1.25 at the mouths, sweep 120°–270°, a room
  at each end, random start and goal points, both ways): **400/400 found** (384 through a way narrower than the token),
  **0 through a wall**, least clearance **0.1510**, centre line within **0.0265** over 90,171 samples where narrower than
  the token (gate 0.05), largest heading change between two 1/16 samples **19.1°**, **no zigzag** (opposite turns over
  15° within 0.35 square); **warm p50 18 ms, p95 30 ms, max 37 ms** (gate 50; Node, the median of three runs per route);
  cold (the first route, building the field) p50 33 ms, max 61–66 ms over a median 123 squares; points p50 28, max 46.
- **Other shapes**: a funnel of 0.3, 0.32 and 0.5 passes (least clearance 0.150), 0.29 and 0.2 are refused; a hairpin
  whose two lanes share a row of squares goes round the U and never across the dividing wall (its squares are two nodes
  each); 20 off-grid pillar fields, every route 0.15 clear (5 through the narrow walk, smooth; the rest today's route,
  which kept 0.15).
- **Joe's stations** (`test/fixtures/narrow-stations.json`, from `b10/pg/stations.json`): **S05** 40 routes room to room
  both ways, every check above, centre line within 0.0176, largest turn 16.0°, warm max 33 ms; `dropMid` is a
  centre-line point. **S06**: the S-curve (clearance 0.487, turn 14.2°), the diagonal slit 0.4 (0.196, 21.4°), the
  funnel 0.3 (0.150, 13.9°), the hairpin (0.488, 14.1°, round the U) and the pillar field (0.314, 14.4°) found from both
  heroes, warm under 32 ms, no zigzag; the 0.2 slit refused.
- **The Large and the long way round** (S05 "long"): the Medium takes the stair, the Large the north door's long way;
  with that door shut the Large has no way and its drag stops in room A, its body 98 px or more from every wall.
- **Fight** (`drop.test` "0.10 R9 fight"): a group of four over S05 to room B, the leader first, then one at a time,
  every walk over the stair, never through a wall, 0.15 clear and within 5 px of the centre line where narrower than the
  token, a checkpoint exactly where it enters a new square; each charged core's measure (5 ft a square entered, nothing
  for the narrowness), and with Joe's mud region over the stair exactly 5 ft more for each square entered inside it;
  nobody on another at rest. A leader with 40 ft stops part-way off the grid on the centre line (`why: "speed"`),
  never past what it pays for; the others queue behind it, no overlap.
- **Out of combat** (`drop.test` "0.10 R9"): the same four dropped in room B: the leader in the drop's update, the rest
  in later waves over the stair; dropped mid-stair: the leader on the centre line at the narrowest, the next members on
  the stair behind it on its centre line, a token apart.
- **Regression**: walls on the grid lines, 60 random mazes: no tight square, every route the same waypoint for waypoint
  with and without the narrow field; every existing pathfind, drop, lead and file test unchanged.
  `make foundry-movement-sim SEEDS=10000`, full mix: **every class 0**, mover overlap 25,651 episodes, p95 2,033 ms,
  6,368 square-seconds, 11 same-instant races (L3's numbers, identical); legacy mix: **every class 0**, 14,381 / 1,767 ms
  / 2,947 (identical).
- Mechanical: `make foundry-movement-check` 478 pass, 0 fail, 0 todo (conformance 95.9 %, C30 / C56); `make test` 2,461
  passed, 9 skipped, 4 xfailed; `make foundry-module-index && make check-context` OK (the same 32 warnings).

**Deviations from BINDING / the designer's constraints, and why.**
- *Size* (constraint 3: about 280 lines): `narrow-core.mjs` is **1,031** lines (about 170 of them comments). What a
  throat of exactly 0.3 and a smooth walk needed beyond the lattice: the border cells moved onto the centre line, links
  checked as strictly as the walk (sampled, cached, the Lipschitz bounds that keep it fast), the band with its tube and
  its checked moves, the chords, the corner cuts, a fight's square entries, the rest point, `pointsBack`, the walk's
  composition. Elsewhere: pathfind-core +27, pathfind-adapter +89 (the scene's field, `okSeg`), pathfind.mjs +146 (the
  leg's narrow walk, the plain check, the goals, the cache), file.mjs +69 (the narrow step, the line behind, the fight
  member's line slot), drop.mjs +8 (checkpoints, the fight leader's rest point).
- *A fillet at a mouth* (constraint 4): on a leg through the narrow way the band is the whole leg out of combat, so it
  rounds the mouth itself (keeping the padding where it can); today's fillet stays on every other leg. Why: a plain
  stretch ending on a square centre at the mouth left one sharp heading change there.
- *0.15* is held to 0.001 square (0.1 px on a 100 px grid): a throat of exactly 0.3 has its centre at exactly 0.15.
- *The centre line* is held within a tube of 0.025 (and corner cuts of at most 0.05 along a leg where it kinks at a sharp
  wall corner: S06's slit jogs), inside the gate's 0.05; measured 0.0265 on the C stairs.
- *The zigzag gate's bound*: heading change between two 1/16 samples at most 30° on the C stairs and S05 (measured
  19.1°), 40° on S06 and the pillar fields (sharp wall corners; measured 21.4°), and no zigzag anywhere.
- *The C generator's narrowest width* is the true clear width (the outer wall's vertices stand out by 1 / cos of half a
  segment): a polygon of 0.301 at its vertices was 0.292 between them, rightly refused.
- *One-way walls* are crossed only from their open side and cost no clearance; one through the middle of a tight square
  splits its parts (no link crosses it within the square, either way): a known limit, not seen on Joe's maps.
- *A drop snapped to a square* whose centre lies in the rock beside a narrow way, or off its line, rests on the nearest
  centre-line point and the ruler shows the snapped square as not reached (Shift-drop for an exact spot). S05's
  `dropMid` square's own centre lies outside the C's outer wall, on open floor: dropped snapped it stays there.
- *A swarm* on a narrow way keeps planLead's rings (not looked at).
- Defaults taken without a human: scratch `b10/auto-decisions.md` "Step N".

Open after step N: the page gate (R11) and the browser play-test of the stair, the slit and the line behind (a deploy,
the next step); L2's door plug, not looked at again.

### 18.5 F1: Fable's design check, the three fixes (B1, B2, B3)

Fable's mid-build check of HEAD `e334ae5c` (scratch `b10/review-f1.md`): "fix", three blockers, all in how the group
plan uses the narrow field and the group's own riders. Each started as a failing test (`drop.test` "0.10 F1 B1 / B2 /
B3"), the smallest change that made it pass; the pathfinder, the motion and the stop are untouched.

**B3, a rider is in its group for the plan** (R1, R2). `othersOf` and `targetOf` left out only the stacks' leaders, so
a rider on its mount stood in the plan's way and could be the swarm's target: a Large mount with its rider dragged one
square up-left swarmed round its own rider and moved the other way; down-right "No route there". Now `groupDrop` and
`fightFile` pass every dragged id to `groupPlan` / `groupFightPlan`, and `file.mjs` leaves them out of the tokens
standing and out of the target's candidates; at a fight member's turn its own riders leave the standing too
(`slotAtTurn` `riders`). Test: a rider grabbed (+4, 0: the mount leads, the stack one entry, a march) and a Large
mount with its rider top-left or bottom-right moved one square on each diagonal: 8 of 8 a march, the mount on its drop
square, the rider on it, nobody named; in a fight, up-left: a march, target none.

**B1, the plan's floods never cross an off-grid wall** (R3, R4, R9). planLead's step joined two squares wherever any
part of one met any part of the other; its floods are per square, so they came into a tight square by one part and
left by another. Now a tight square stands for **one** part in the plan: the first a flood over the narrow field's own
nodes from the drop settles (`file.mjs` `narrowParts`: square and part, plain steps by `field.wall`, the others by the
field's `more`, a Dijkstra at most `LEAD.far` nodes, lazy: it runs only as far as a question needs and never on a map
with no tight square). A step through a tight square goes only through that part, a plain step into it only when its
centre lies in that part, and a member rests in it only in that part (`onPart`). The drop's start: the leader's drop
(march, the rest point on a narrow way), the target's squares (swarm), the leader's rest at a fight member's turn.

| Ten marching beside a wall in a closed room 16 × 10 | failed searches | named | rests across the wall |
|---|---|---|---|
| x = 12.4, before (review's probe, drops 11,6 and 11,5) | 5 and 5 | 1 and 1 | 0 |
| diagonal 12.2 → 13.1, before | 5 and 5 | 1 and 1 | not measured |
| stub x = 12.4, y 4 to 10 (an open end), before | 0 | 0 | 1 and 1 |
| all three, three drops each, now | 0 | 0 | 0 |
| the same wall on the grid (x = 12), before and now | 0 | 0 | 0 |

S05, six and twelve from room A dropped in room B at 7,45, 6,44 and 8,46: no route searched to a square outside the C
(the enclosed middle or the rock beyond the outer wall), 0 failed searches (before: six at 7,45 2 named after 4 failed
searches, twelve 8 named after 16).

**B2, the line behind the leader on a narrow way** (R3, R9). Three causes, all fixed.
(a) `pathfind-adapter` `narrowMore`'s `blocked` shut a part of a tight square when its square's centre lay inside an
avoid circle: one slot on the centre line shut the neighbouring squares' parts, the goal's too. Now a part is shut by
the avoid circles only when every passable point of it (its cells' points) lies inside one of them; the walk itself is
`okSeg`'s, as before. (b, c) `lineBehind` rewritten: the points back along the leader's own way where the way is
narrower than the token (a tight square, `widthAt` under the token's diameter: the walk's own `narrow`) are the narrow
way's spots, ranked like squares by their walk from the leader. Each member in turn (least walk left first) looks for
the first such point clear of every slot given out, every token standing and every member that stays, by the route's
own measure (its box, less its pixel) plus 0.02 square, judged where the route will rest it (`restOn`: the pathfinder's
rest point, on whole pixels), stepping back 0.1 square at a time; it takes it, with one route there, when planLead gave
it no square (R3's fallback, also when the leader rests past the mouth) or one farther from the leader (a square's walk:
its rank + 1). Its route keeps out of the tokens standing, the members that stay and the slots of those resting nearer
the leader; the route's real end is checked again. The walk order is then front first (a member resting nearer the
leader goes before one behind it, so `staggerFile`'s order bounds hold). A kept slot never lies inside a line slot by
construction. In a fight (`slotAtTurn`, `drop.mjs` `routeAtTurn`): the line point when it is nearer the leader than
planLead's square, back along the leader's own way (`q.leaderAt.way`; this member's own way to it when the leader did
not walk), clear by the fight route's circles plus 0.02; and after a failed route to planLead's square, one more route,
to the line point (R3's fallback). Two more causes found in the fight and fixed: a line slot off the grid was sent
`snapped: true`, so the route's lattice was anchored off the grid and the narrow field switched off (every fight line
slot's route failed); and a member's mates at rest were walls for planLead, so one resting in a narrow mouth cut the
leader's floods and those behind had no square though there was room (planLead `spec.taken`: they are taken squares,
shutting no flood).

| S05, out of combat (members from room A) | at `e334ae5c` | after B1 only | now |
|---|---|---|---|
| 4 at 11 points along the stair (6° to 150° from room A's mouth) | 2 or 3 of 3 named at 6 points (32° to 150°) | 0 named; the rest back in room A but one | 0 named; the line on the stair behind the leader from 45° on (all 4 on the stair) |
| 8 at the same 11 points | 6 or 7 of 7 named at 6 points | 0 named; at 90° one member on the stair behind the leader, six in room A | 0 named; from 90° on all 8 on the stair |
| 4 and 8 just inside room B (9,44 and 8,44) | 2 / 1 of 3, 6 / 5 of 7 named | 0 / 1, 0 / 5 named | 0 named, the rest on the stair behind |
| 6 and 12 in room B (7,45, 6,44, 8,46) | 2, 0, 0 and 8, 3, 5 named | 2, 0, 0 and 1, 0, 0 named (12 at 7,45: 7 back at room A's mouth) | 0 named; 12 at 7,45: 3 in room B, 9 on the stair |

Every case: no wall crossed, no two at rest closer than 99 px (gate 98), every rest 20 px or more from a wall (0.15
square is 15), the last start within 4 s (largest 3,900 ms, twelve). Planning in Node: 8 to 500 ms for four and eight on
the stair, up to 800 ms for twelve in room B (narrow ways are measured, not gated: review F1 §5). In a fight (four at
the 11 points and just inside room B, eight at three points): at `e334ae5c` 1 to 3 of 3 named at 13 of 14 points (all
but room B's 7,45), now 0 named, none at rest within 0.98 square, no wall crossed.

**Gates.** `drop.test` "0.10 F1": B3 (8 drops and a fight), B1 (12 off-grid drops, 6 on S05), B2 (32 drops out of
combat, 16 fight queues); every earlier test unchanged and passing (step N's "dropped mid-stair, they rest on the centre
line behind it" among them). `make foundry-movement-sim SEEDS=10000`: full mix **every class 0**, mover overlap 25,651
episodes, p95 2,033 ms, 6,368 square-seconds, named 22,059; legacy mix every class 0, mover overlap 14,381 episodes, p95
1,767 ms, 2,947 square-seconds, named 11,412 (identical: the simulator runs planLead and staggerFile, which B1 to B3 do
not change for a map with no tight square). L1 gate: 0.895 searches a member, 1.88 % failed (identical). Mechanical:
`make foundry-movement-check` 484 pass, 0 fail (conformance 95.9 %, C30 / C56); `make test` 2,461 passed, 9 skipped, 4
xfailed; `make foundry-module-index && make check-context` OK (the same 32 warnings).

**Deviations from the review's fix, and why.**
- *B1, one part per tight square* (the review: "open only through parts in that set"): with a partition that has an open
  end both sides' parts are in the flood's set and the per-square floods still crossed it (the stub, one member across
  the wall); the first part settled holds for every wall shape. Plus `onPart`: a ranked tight square offered its centre
  as a slot even where that centre lies across the wall (S05's outer wall: square 15,42 was ranked by its stair part,
  its centre lies outside the C).
- *B2, the line also when it is nearer the leader* (the review: "the line becomes R3's fallback"): the fallback alone
  rested twelve dropped in room B with seven back at room A's mouth, twenty squares behind, while the stair between had
  room, and members dropped just inside room B stayed in room A; it would also have dropped step N's line behind a
  leader resting mid-stair (its test). Ranking the narrow way's points like squares is R3's own rule on them.
- *B2 (a), any avoid circle*: a part is shut when every passable point of it lies inside one of the circles (the union),
  not one circle: a part every point of which is inside some circle cannot be walked.
- *B2, 0.02 square more than the route's measure*: the route moves a goal in a tight square onto the centre line by a
  pixel; a point clear by exactly the measure ended inside the last slot by 1 px and the walk was refused.
- *B2 in a fight, two searches at most* (the review: "one route each"): the fallback needs the failed one first.
- *B2 in a fight, the mates as taken squares* (planLead `spec.taken`, two lines in file-core): not in the review; without
  it 1 or 2 of 3 were named at the five stair points nearest room A's mouth (6° to 24°).
- *Net lines* (against `e334ae5c`): file.mjs 708 → 813 (+105: the part flood 40, the line and its rest point 45, the
  fight's line 15, dropPoints 5), drop.mjs +14 (the fight's fallback route, the leader's way), pathfind-adapter +15 (the
  covered part), file-core +1. R12's target is not met by this step; nothing could be deleted for it.
- Defaults taken without a human: scratch `b10/auto-decisions.md` "F1 fixes".

**Open after F1.** planLead moves B (the square the leader steps out of) to the neighbour nearest `from` when a token
not in the group stands on it; on a narrow way `from` is the walk's last short chord, so that neighbour can be beside or
ahead of the leader (not changed: pre-existing, the simulator judges the shape against the plan's own B). The R11 page
gate and the browser play-test (the stair, the slit, the line behind, a fight on the stair); the door plug; a Large
leader at a narrow mouth moves nobody (R10, shipped reduced as review F1 §5 rules).

### 18.6 Live round 1: the triage and the fixes

Live round 1 ran 0.10.0 on the world pentaryn (ZZ playground, 119 checks: HARD 100, GATED 12, REPORTED 7; standing
over rounds live1 to live1f): HARD 23 failing, GATED 8 failing. Each failure was sorted as a module defect, a suite or
playground defect, or an expected result (a known limit or core's own rule); every module fix started as a failing
test that reproduced the live record (`drop.test` "0.10 live R1", "0.10 live round 1"; `pathfind.test` and
`pathfind-core.test` "0.10 live round 1"). Probes: scratch `b10/r1x/`.

**Module defects, fixed.**
- *A quick single drop was a silent no-op* (S05.a, S05.b, S05.d, S05.g, S05.h). Core's drag context holds the start
  alone while its search runs (and for its 500 ms search animation), so core sends no update at all; the drop's
  confirm search (`noteNoRoute`) found the way, but `droppedInPlace` then read the drop as "dropped where it stands"
  (`last.reason` "still"), out of combat and, with no confirm there at all, in a fight. Now the confirmed route becomes
  the token's update (its entry made when core has none), in a fight too when the drag had found nothing yet (a short
  path there may be dnd5e's own limit), with a checkpoint at every square. The test reproduces live's `"still"` exactly.
- *The leader's search was cut at a member's cap* (S06.a, S06.e, S06.f, S06.g, S06.h, S06.i, S07.d, S07.l, S05.j3,
  S05.k3, S15.a; the named members of S01.f and S02.i). Every route search of a group plan had 120 ms; on the page a
  route over a narrow way takes 130 to 250 ms (S05.i: 134 ms warm; Node 18 to 33 ms), so the leader's search ran out
  and the group got "No route there" (live: `searches 1, failed 1, timingMs 132`; the test with a page six times slower
  than Node: `searches 1, failed 1, timingMs 144`). Now the leader's search may take 1,000 ms, a member's 400 ms; the
  whole plan stays inside `LEAD.totalMs` (1,500 ms).
- *Core's wall test was most of a plan's time on the page* (S01.d, S01.k, S07.k, S15.c, S05.i). `Token#checkCollision`
  runs a polygon test per ray; eight marching over S01's open field cast 2,730. A broad phase (`pathfind-core`
  `segmentIndex`, `pathfind-adapter` `wallIndexFor`): the canvas's edges, the scene's walls (doors in any state) and
  the scene's bounds, bucketed per square, one per scene (rebuilt when the edges differ); a move that comes within
  2 px of none of them is clear without asking core. A superset of what core tests, so every answer is core's: the
  pinned routes are waypoint for waypoint the same (112 and 192 core rays before, 9 and 18 now), S01's drop 307 rays.
  A random test pins the broad phase conservative (2,000 moves over 60 walls).
- *module.json's description* described 0.9.0 (B0/B1, groupStagger, a cap of 12); it now describes 0.10.0.

**Suite defects, fixed in the scripts** (scratch `b10/suite/checks`, the old ones kept as `*.live1`).
- S01.e expected the pack 100 to 400 ms after the leader, but in S01's layout the leader starts behind three members on
  its way east; R5 then starts the pack once the leader is that far past the frontmost member. The bound is now that
  walk plus 400 ms, 4 s at most (100 to 400 ms when the leader starts in front).
- S01.f asserted `plan.total == 8`; `plan.total` is the last start in ms (README). Now `plan.members == 8`. Its other
  failure (Hero 2 named) was the member cap above.
- S09.c expected Hero 4 to stay, named; in S09's layout it walks back along the corridor to the square behind the
  leader's last step without passing the leader, which R3 gives it. Now: it stays named, or it ends behind the leader.

**Expected, left as they are.**
- S13.c (a Large leader stopped at a narrow mouth, the pack not behind it): the known limit (a Large leader that does
  not fit moves nobody, "No route there"; review F1 §5).
- S07.q (in a fight a member resting in the door frame), with the reported S07.m and S07.n: the door plug Joe accepted
  as an in-between state.
- S05.g and S05.h's charge (130 ft for 118 ft walked along the curve, 240 for 212 with the mud): core charges 5 ft a
  square entered on a square grid; R7 "exactly core's measure" and no house rule (R6). A question for the sign-off.
- S11.a (a march straight across the mud out of combat): pre-existing (it fails on 0.9.0 too): a straight path core
  allows is core's own and is not re-routed for cost. A question for the sign-off.

**Module defects left open** (next round).
- S02.d: a swarm round the Large target against the arena's top wall fills 10 or 11 of its 12 touching squares. The two
  squares of the top row lie between the corner squares and the wall; once the corners are given out no flood reaches
  them and the last members take ring 2. R4 "the next ring when a ring is full": the ring is full only as far as can be
  reached. A fix needs a seal check in planLead's swarm (a claim that would wall off free touching squares waits).
- S05.o: a fight walk from an off-grid rest records 30 ft in its history entries where core's measure of the same
  history is 25 ft (25.1 ft walked): a possible extra 5 ft charged inside one square. Needs the waypoints logged.

**R11, the page gate.** Not applied in this round: the misses were inflated by the two defects above (four failed
searches at the 120 ms cap are 480 of S01's 680 ms), and a cap of 12 would neither bring eight under 100 ms nor keep
S04's twenty in a tunnel (47 ms, passing). Rerun on the GPU page; if eight on open floor still miss 100 ms, the next
round plans only the leader inside the drop.

**Gates.** `make foundry-movement-sim SEEDS=10000` (full mix): **every class 0**, mover overlap 25,651 episodes, p95
2,033 ms, 6,368 square-seconds, named 22,059 (identical to F1: the simulator runs planLead and staggerFile, which this
round does not change). Node, the probes: S01's eight 12 to 15 ms (307 core rays, was 2,730), S06's two over the S-curve,
hairpin and pillar field 85 to 110 ms with the narrow field warm. Mechanical: `make foundry-movement-check` 489 pass, 0
fail (conformance 95.9 %, C30 / C56); `make test` 2,461 passed, 9 skipped, 4 xfailed; `make foundry-module-index && make
check-context` OK (the same 32 warnings). Net lines: drop.mjs +7, file.mjs +8 (the two caps), pathfind-core +47 and
pathfind-adapter +37 (the broad phase). Defaults taken without a human: scratch `b10/auto-decisions.md` "Live round 1
triage". Rerun: S01, S02, S05, S06, S07, S09, S15 (the GPU page's plan times are the R11 judgement).

### 18.7 Live round 2: the triage and the fixes

Live round 2 ran 0.10.0 on the world pentaryn again (rounds live2 and live2b, standing over live1 to live2b): HARD 100
checks, 13 failing; GATED 12, 6 failing; REPORTED 7, 3 not clean. Each failure sorted as before; every module fix
started as a failing test (`pathfind.test` and `pathfind-core.test` "0.10 live round 2", `drop.test` "S05.j3, S05.k3",
`lead.test` "S02.d"). Probes: scratch `b10/r2x/` (page profiles over the GPU harness's `/profile`, dry runs with
`planGroup`, read-only).

**The page's plan time, found.** A CPU profile of the dry run on the GPU page put 180 of S01's 300 ms (eight, cold) and
1,083 of S15's 1,493 ms (twelve) in the adapter's `stepCost`: core's `createTerrainMovementPath` and
`measureMovementPath` for every step. Two causes. The playground has one Difficult Terrain region (S11's mud), and with
any terrain region on a scene every step was measured (the per-direction memo was off for the whole scene); and the
squares of every other token went the measured way, the group's own included, though dnd5e leaves a token moving with
the dragger (controlled), a hidden one and, under the 2024 rules, one of the mover's disposition out of its creature
difficult terrain. Fixed (pathfind-adapter): a step whose footprints keep a pixel clear of every terrain region's box
(`terrainBoxes`, the regions `sceneHasTerrain` counts; a region with no box keeps every step measured) is costed once
per direction; `ignoredForCost` mirrors dnd5e's own filter before its hook (hidden, secret, controlled, not a creature;
modern rules: same disposition, Tiny). Also: the wall answers (`w`, and the pixel test `r` that string pulling and the
fillets ask directly) are keyed by the body (size, shape, action, level, elevation, preview), so every member of one
size shares them (each asked core again); a position's squares (`g`) and its creature test (`s`) once; `avoidHits`
(pathfind-core) skips an avoid circle the move's box keeps clear of (avoidDist was 553 of S06's 2,004 ms) and the box
distance no longer allocates. Measured on the GPU page with core's two calls answered once per direction away from
terrain (an in-memory emulation on the ZZ GM's harness page, restored after; nothing written): S01 eight cold 66-109 ms
(was 211), twenty cold 186-255 (609), S15 twelve 268-354 (1,171), S07's vault eight 255-349 (709), before the other
three savings. The named members of S06.h/i, S15.a and S05.p were all the plan's budget (1,500 ms) running out on the
page (stay `budget`, reproduced by the dry run there); the budget is unchanged.

**Module defects, fixed.**
- *A drop with the pointer on the stair's narrowest point* (S05.j3, S05.k3: "No route there" with four and eight).
  dropMid (16, 38.5) lies on a grid line; core snaps the leader to square (15, 38) or (16, 38), whose centres lie beyond
  the stair's walls (the C's hollow; the area outside the outer wall), so the rest point was there and no route reached
  it (Node: the route to the snapped square's rest point is not found, the pointer's is). Out of combat a drop whose
  pointer lies on a way narrower than the token, in another part than the snapped square's centre, now rests at the
  pointer's own rest point (`pathfind.mjs` `cursorRestPoint`, `drop.mjs` `narrowDrop`; every member shifted alike), alone
  or in a group. Not in a fight (R7: single drags unchanged; no failing fight check).
- *A swarm round a Large off a wall* (S02.d, 10 of 12): a touching square whose taking would wall off another free
  touching square from the rest of the area (a flood from the free outer ranks) waits; the first that seals nothing
  goes first (planLead). The test: fourteen round a Large one square off ARENA's wall, six seeds, 12 touching.

**Suite defects, fixed in the scripts** (scratch `b10/suite/checks`, the old ones as `*.live2`; the repo's copy follows).
- S05.o: `core_measure` passed the history's centres to TokenDocument#measureMovementPath, which takes top-left
  positions (a path shifted half a square: 25 ft). Core's own measure of the history is 30 ft, equal to the charge; the
  walk crosses a square corner and enters two squares 5 px apart. Now top-left waypoints through Token#measureMovementPath.
  What is left is the sign-off question of S05.g/h (core charges squares entered, not the distance walked).
- S07.q (and the reported S07.m, S07.n): the door frame was a centre within 55 px of the door's line; the squares just
  before and just past the door have centres 50 px off it (S07.q's Hero 2 rests in the room's first square). Now 45 px.
- S07.d: every member within 2.2 sq of the vault drop; the leader rests at the vault's corner and seven fill the 3 × 3
  behind it (the far corner 2.83 sq). Now 3.2 sq, as S01.c for eight.

**Expected, left as they are.** S13.c (a Large leader at a narrow mouth moves nobody: the known limit); S05.g, S05.h
and now S05.o (core's charge per square entered against the distance walked: a sign-off question); S11.a (a march
straight over the mud: pre-existing, a sign-off question). S15.b (two centres within 30 px of the door at once, GATED):
judged again on the faster plan.

**R11, the page gate.** Not applied in this round either (scratch `b10/auto-decisions.md`, "Live round 2 triage"): the
misses are mostly the defect above (59 % of S01's cold plan, 73 % of S15's), and the emulated fix already brings eight
on open ground to 66-109 ms and twenty to 186-255 ms. Rerun S01.d/k on the GPU page: a miss there applies cap 12 for
twenty, and planning only the leader inside the drop if eight still miss.

**Gates.** `make foundry-movement-sim SEEDS=10000`: every class 0; mover overlap 25,677 episodes (25,651), p95 2,033
ms, 6,377 square-seconds; named 22,055 (22,059). Mechanical: `make foundry-movement-check` 495 pass, 0 fail
(conformance 95.9 %, C30 / C56). Net lines: drop.mjs +25 (narrowDrop: the pointer's rest, a drop that got no answer),
file-core +17 (the seal check: R4's ring full only as far as it can be filled), pathfind-adapter +55, pathfind +29,
pathfind-core +10. Rerun: S01, S02, S05, S06, S07, S15.

### 18.8 Sign-off F2: the fixes (X1 to X4)

Live round 3 left one module defect open, S05.p (eight heroes dragged back and forth over the stair; brief F2), and a
standing whose five HARD failures were none of them a 0.10 regression. Fable's sign-off asked for four fixes; each
started as a failing test (`lead.test` and `drop.test` "0.10 sign-off X1", `drop.test` "0.10 sign-off X2"). Node
reproduction: the eight heroes at live round 3's positions (scratch `b10/suite/out/live3/diag_s05p.json`), the
playground's S05 Large standing in room A (without it Node's leg 1 plans differently from the page: with it, leg 1's
squares match the page's exactly). Nothing was deployed or written to the world in this step.

**X1, fixed: the leader through a member that stays** (S05.p legs 3 and 5, "No route there." for all eight: searches
5, failed 1). Reproduced in Node from leg 3's positions: Heroes 2 to 5 stand in room A's east side and the stair's mouth
on the leader's only way; one of them has no free square it can reach and stays; `stayHere` searched the leader's way
round it (none, on the narrow way), dropped the leader and made it stay, and the line `if (out.members[L.id]?.stay)
return everyoneStays("noRoute")` followed. Now (`file-core` `planLead`): the leader's way round a member that stays is
still searched first; when there is none it keeps the route it has, through that member (R6, decisions.md "the group
can never deadlock by blocking its own leader"); every other member still goes round it or stays. Unchanged: a member
that stays on the leader's rest square (the "blocked" branch) still stops the group, and planLead now returns that
member as `blocker`, which drop.mjs names ("No route there: <name> is in the way.", `named.noRoute`); standing
non-members, walls and shut doors as before. The swarm leader's search avoids only the tokens standing (`stays` is
always empty at its turn: it is first in the queue). Checked: drop.mjs sends the leader in the drop's own update
(no `freeOfOthers` for a group's leader out of combat) with the on-top option, so nothing there treats a staying member
as standing; the simulator classes the leader inside any member of its own drop, named ones included, as "leader"
(`scenario.mjs` `leaderOf`: `dropOf` lists every member of the drop). The L1 gate's route rule now lets the leader
through a member that stays only when no way round it exists (`o.route` round the stays returns null): 4 of 800 drops;
"none" 50 → 46, named 254 → 287 (the members of those four drops that stay), searches a member 0.897, failed
1.88 → 1.97 %. Node, S05.p's five legs chained from leg 1's start, and live leg 3's own positions: every leg plans,
nobody named, every member in the drop's room or on the stair's centre line, no rest within 0.98 square, no wall
crossed (before the fix: leg 3 `result none`, all eight stayed). The README had no limit line for it to remove (brief
F2's table carried it); its group-drag paragraph now says it.

**X2, fixed as asked, its live cause not proven.** Legs 1 and 2 do not reproduce in Node: at the live positions with
the Large, Node's planLead gives exactly the page's squares in leg 1 (Hero 7 8.5/45.5 ... Hero 5's line point
10.6/44.47) and then lines Hero 3 up behind Hero 5 (11.68, 44.25; route found); in leg 2 its squares for Heroes 6 to 8
are the page's final positions (9.5/45.5, 8.5/44.5, 9.5/44.5) and lineBehind moves them to points 5.2 to 7.9 squares
behind the leader. So on the page `lineBehind`'s one route a member failed (without the Large, at a test clock of 0.5 to 4 ms
a clock read, Node still lines all, so not the 400 ms cap alone; the page's lineBehind time, 180 to 290 ms for three or four routes,
rules out three 400 ms timeouts), or ended too near the next rest (Hero 8's first point is 1.03 squares, Chebyshev, from
Hero 4's: 0.02 over the bound, the LINE_SLACK the page's goal move may eat). Either way the member then kept its square
or stayed. The change (`file.mjs` `lineBehind`, local to it): a route that fails, or ends too near another's rest, goes
on to the next clear point back along the leader's way, LEAD.tries (2) routes a member at most, all inside the plan's
time (LEAD.totalMs less planLead's part); no cap raised. slotAtTurn's line (a fight) searches no route, so the cause is
not shared and it is unchanged. The test: live leg 2's positions with Hero 8's own token refusing its first point's
route (its `findMovementPath` returns no path there, as a page route that failed): it takes the next point and all
three rest on the stair behind the leader (before: Hero 8 stayed in room B at 9.5/44.5). Whether that was the page's
cause is for the next live round's S05.q to show; if S05.q still names a member or leaves one in the far room, the
limit is the page's route to a line point, not lineBehind's book-keeping.

**X3, done: S05.q, the five legs gated** (suite `checks/s17_l1.py`, GPU page, HARD): eight heroes A to B, B to A, A to
B, B to A, A to B, each leg from where the last left them, 4.5 s after each drop before reading (the last wave goes
within 4 s); per leg: no "No route there.", nobody named, each member in the drop's room or on the stair between its
walls and, where it is narrower than a token, within 0.06 square of its centre line, and the guards (no rest overlap,
no wall or standing token crossed, every member moving or named within 4 s, a member already in place excepted, no
notice). S05.p keeps the plan time, REPORTED. Not yet run (no write to the world in this step).

**X4, done: the standing relabelled** (suite scripts only; `tools/standing.py` names each one in a "Relabelled" list;
a changed criterion's stored result is void until rerun, a changed kind counts under the new kind):
- S05.g, S05.h, S05.o: HARD on the charge equalling core's own `measureMovementPath` of the token's history (R7,
  review F1 check 6; `core_measure` moved to `lib/ck.py`); the difference to the distance walked (S05.h: 5 ft ×
  (walked + inside the mud)) REPORTED, Joe's question. S05.o measured its first walk's core cost after the next turn had
  cleared the history (now before it).
- S13.c: HARD on the shipped rule, nobody moves and "No route there." (R10's "the pack forms behind where it stops" was
  not built, F1's ruling); the pack's distance REPORTED.
- S11.a: REPORTED (0.9.0 marches straight over the mud too; R9: nothing costs more automatically).
- S15.c: REPORTED against 150 ms, R11's bounds (8: 100 ms, 20: 250 ms) scaled to twelve (was GATED at 100 ms; F1 §5
  gates ordinary ground only).
- S05.i: judged on the GPU page (was timed on the software-GL page at load 11 to 14).
The standing over live1 to live3b with these: HARD 99, 0 failing (5 void until rerun: S05.g, h, i, o, S13.c); GATED 11,
1 failing (S15.b, the known limit); REPORTED 9, 3 not clean (S05.p, S11.a, S15.c). Suite copy in the repo:
`automation/browser-test/movement-playground/suite/standing-f2.md`.

**Deviations from BINDING.** None in the module: R6 already said the leader passes through members of its own group;
X1 applies it to a member that stays (Fable's ruling, scratch `b10/auto-decisions.md`, "Sign-off F2"). R3's ranks are
untouched (the door plug's "beside the leader just inside" stays the first backlog item).

**Gates.** `make foundry-movement-check` 498 pass, 0 fail (conformance 95.9 %, C30 / C56); `make test` 2,461 passed;
`make foundry-module-index && make check-context` OK. `make foundry-movement-sim SEEDS=10000`: every class 0; mover
overlap 25,679 episodes (25,677), p95 2,033 ms, 6,377 square-seconds; the leader through its own members at rest 7,828;
named 21,989 (22,055). Net lines: file-core +4 (the leader keeps its way; `blocker`), file.mjs +8 (the second point
and the plan's time), drop.mjs +2 (the blocker named). Rerun at the next live round: S05 (S05.q new; S05.g, h, i, o
void until then), S13.c, S11.a, S15.c.

### 18.9 Handoff: live round 4, the two Fable verdicts, the rulings and what is left open

**What the world runs.** pentaryn-movement 0.10.0 on the branch `movement-0.9` (last module commit `f3ead5b0`, the sign-off
fixes X1 and X2; nothing in the module changed after it), deployed with `make foundry-movement-sync`; the page reports
`status().version` 0.10.0 and `selftest()` passes (9 checks). `main` is 0.8.5, untouched. The playground (scene ZZ
Playground, 16 stations, two reset macros, the journal ZZ Playground) is in the world and in the repo
(`automation/browser-test/movement-playground/`); Joe's hands-on list is [`movement-0.10-handoff.md`](movement-0.10-handoff.md).

**Live round 4 (r4, r4b; the sign-off fixes on the page; the suite's last round).** The standing over every round
(`suite/standing-r4.md`): HARD 100 checks, 1 failing (S05.q); GATED 11, 2 failing (S05.i, S15.b); REPORTED 9, 3 not clean
(S05.p, S11.a, S15.c). No zero-tolerance class fails: no wall or shut door crossed, no rest overlap, every charge is core's
measure, no module error, the breaker never tripped. X1 holds (no "No route there." on any of the five stair legs). Open:
- **S05.p / S05.q, eight heroes dragged back and forth over the stair.** Members are named ("Stayed where they stand, with no
  free spot they can reach"): A to B leg 1 Hero 3; legs 3 and 5 Heroes 3 and 5 (they stay on their start squares in room A);
  B to A legs 2 and 4: nobody is named but Heroes 4, 6 and 7 are left in room B with no notice (the one R8 miss: a member
  neither sent nor named; confined to big groups on the stair). X2's change did not remove it live and Node does not
  reproduce it, so the cause is unproven. Plan time over the stair 0.97 to 1.0 s for eight (`perf.lastMs`).
- **S05.i (GATED), the warm narrow route 61 ms** on the GPU page against the 50 ms gate (three runs 60.7 to 62.0; Node max 37.5 ms).
- **S15.b (GATED), twelve villagers at one door:** up to four centres within 0.6 square of the door at once (movers only).
- **S11.a (reported):** a march crosses painted mud in a straight line (0.9.0 does the same; R9 charges nothing automatically).
- **S15.c (reported):** twelve at a door plan in 152 to 156 ms (reference 150).
- **Instrument fix, script only:** S05.h's oracle is the square rule (5 ft per square entered, 10 ft inside the mud); core's
  one-shot re-measure of the finished history ignores the region (130 ft against 240 charged), now printed beside it.
- **R11, judged on the GPU page, ordinary ground, `status().group.perf.lastMs`:** 8 cold 45 ms (gate 100), 20 cold 150 to
  165 ms (gate 250); warm 31 and 120 ms; at 4x CPU throttle 8 cold 252 to 281 ms, 20 cold 825 to 914 ms. The cap stays 24.
- **Gates at the end:** `make foundry-movement-check` 498 pass / 0 fail (conformance 95.9 %, exceptions C30 and C56);
  `make test` 2,461 passed; `make foundry-module-index && make check-context` OK; the simulator, 10,000 seeds: 0 failing
  runs, every hard class 0 (mover overlap 25,679 episodes, p95 2,033 ms, 6,377 square-seconds; the leader through its own
  members 7,828 at rest; members named 21,989 of 62,381 dropped, 25,583 never moved).

**Fable's two verdicts.**
- *F1, the mid-build design check (§18.5): fix.* The pathfinder (no switch, any shape), the motion and the fight were
  faithful to Joe's rules and the simulator converged (every "past a waiting mate" episode was the leader through its own
  members). Three blockers where the group plan met the new narrow field: B1 the plan's step leaked through off-grid walls,
  B2 the line behind on a narrow way mostly failed, B3 a rider counted as a standing token (a mount could swarm its rider).
  Shipped reduced: a Large leader at a mouth moves nobody; cap 12 if the page gate missed (it did not).
- *F2, the sign-off (§18.8): fix, one last round, then ship; no rollback.* No zero-tolerance rule failed live (gates
  495/0 and 2,461 passed, simulator classes 0, R11 met) but on the stair a second group drag answered "No route there." every
  time: a member that stays took the leader's route, and the whole group with it (X1). X2 mended the line behind, X3 and X4
  were suite only. Ruled: the fight charge stays core's measure (Joe's call), several in a door under the 4 s rule accepted,
  the door plug's squares beside the leader go to the backlog.

**Rulings taken for Joe and automatic decisions** (the full list: scratch `b10/auto-decisions.md`, copied into the report in
[`movement-0.10-handoff.md`](movement-0.10-handoff.md)): L3's fight and simulator gates missed twice, so retry (Joe never
relaxes rest overlap and narrows the feature instead: refusing the one door shut that causes the breach is smaller than a
settle off the way, and one seed in an adversarial GM sequence does not justify reverting the fight); the hard failures that
remained live after the sign-off fixes were accepted (no wall, rest-overlap, charge or error breach and no data risk; the one
R8 miss is confined to big groups on the stair, which 0.9.0 cannot cross at all, so reverting loses far more than it
protects).

**Known limits of 0.10.0** (also in `context/foundry/movement.md`, "Known limits"):
- A member can be named, or left in the far room without a notice, on the stair when eight are dragged back and forth
  (S05.p, S05.q); cause unproven.
- Door plug (accepted by Joe): a leader dropped within about three squares past a one-wide door or mouth, two or three come
  through and the rest wait outside though the room has space; the free squares beside the leader just inside are not
  used yet. First backlog item. Drag deeper into the room to bring them in.
- A fight walk on an off-grid way is charged core's measure, 5 ft per square entered, not the distance walked (130 ft for
  118 ft; 240 for 212 through mud; 30 for 25). Joe's call, R7 against R9.
- A Large leader that does not fit the way: nobody moves, "No route there." (R10's "the pack forms behind where it stops" is
  not built); a Large follower that cannot follow stays where it stands, named. A leader whose rest square is held by a
  member that stays: nobody moves, the notice names the member.
- Door veto: a door cannot be shut on a jammed group token that has nowhere free to rest ("Door blocked: <name> is in the
  doorway"); a player who cannot see it is told "a token".
- Any gap of 1.5 ft or more between walls is a way for Medium and smaller tokens, with no switch: real maps may hold gaps
  that were meant to be shut.
- Timing: a group drop over a narrow way blocks the page longer (eight over the stair 0.7 to 1.0 s); twelve at a door 156 ms;
  20 at 4x CPU throttle 816 ms. Search caps: leader 1,000 ms, member 400 ms, plan 1,500 ms. 3.9 % of dungeon drops have a
  member with no clear wave under 4 s (sent at the least crowded one: twelve at one door, up to four in the frame at once, movers
  only); 6 of 200 open-ground drops hold one member a wave or more longer. In a fight `status().group.last.plan` carries
  members and order only.
- A march crosses painted mud as 0.9.0 does. A square crossed by two lanes of one area (a hairpin) is one square to the
  group plan. A swarm dropped on a narrow way keeps whole-square rings. A drop on a narrow way rests at the pointer out of
  combat only.
- Narrow ways (S05, S06) are outside the simulator: unit tests and the live rounds cover them. The timing gates are judged
  on the GPU page; the software-GL page misses them under load (S05.i 119 ms, S01.d 104 ms): the host, not the module.
- Code size: drag assist 5,736 lines against the 4,200 target, narrow ways 1,294 against 280 (accepted for the deploy);
  `stop.mjs` (842 to 1,384) holds three stop rules the settle made redundant (`stopOrder`, `makeRoom`, the brush):
  consolidation is backlog, after the hands-on.

**Backlog, in order:** (1) the door plug's squares beside the leader just inside; (2) S05.p, the stair's stragglers (find the
live cause: the page's route to a line point); (3) a Large leader's pack forming behind where it stops (R10); (4) fold the
three redundant stop rules into the settle; (5) trim the line counts toward R12's target. Joe's hands-on decides the order.

### 18.10 0.10.1: the stair's stragglers (S05.q), the live cause and the fix

**The trace** (GPU page, an instrumented build of `file.mjs` deployed for the trace only, then reverted: every route
`lineBehind` asked for with its time, `reached` and `unfinished`, and every point it tried). Five legs from reset, both
directions; the dry runs (`planGroup`) gave the drags' own slots.

- *Not the budget.* planLead 180 to 750 ms, each route 60 to 150 ms, none `unfinished`; `lineBehind` had 520 to 1,300 ms
  of LEAD.totalMs left when it gave up. No member was ever `budget`.
- *The cause, one for both symptoms.* The first member on the line behind the leader always got its point (4.6 to 4.7
  squares back, e.g. Hero 4 at 11.59, 32.72). The second tried the first clear point behind it (Chebyshev 1.03 off, at
  12.62, 33.11) and then the next 0.1 square back; both lie in tight square (33, 12) and both routes failed (`reached`
  false, no timeout), so X2's two tries were spent. Probing the same member: with only Hero 4's box to avoid, every point
  in square (33, 12) fails (5.8 and 6.1 squares back) and the first in square (33, 13) is found (6.4); with no member
  boxes all are found. The route reaches a point of a tight square through that square's node, and that node lies in the
  box of the member resting ahead, though the point itself is clear of it. Node's fixture puts the node elsewhere, which
  is why Node never reproduced it.
- *A to B (legs 1, 3, 5):* Hero 3 (and Hero 5) had no square from planLead (`noRoute`/`noSpot`), the line failed them as
  above, so they stayed and were named. *B to A (legs 2, 4):* planLead's flood cannot pass the slots on the one-wide
  stair, so Heroes 4, 6 to 8 got squares in room B (rank flood reaches it), some their own start; the line failed them
  and they kept those squares: moved a square in room B, or "in place", with no notice (the R8 miss).

**The fix** (`file.mjs` `lineBehind`, +40 lines): (1) a failed route's next try is in another tight square, not 0.1
square on in the same one (LEAD.tries unchanged, no cap raised); (2) R8: when the leader rests past the narrow way on a
plain square, a member with no point on the line whose rest is beyond the narrow way stays where it stands and is named
(on its own square; or where no other member's rest or way goes through it, else it keeps its square); (3) the line's
routes keep out of members already where they rest. A leader dropped on the narrow way itself leaves the members behind
it as before (F1 B2's 6° drop: they wait in the room they came from). No beside-the-leader squares: with (1) all eight
line up on the stair, and the door plug's squares stay the first backlog item (F2's ruling).

**Tests:** `drop.test` "0.10.1 (S05.q legs 2 and 4 …)" (every member refuses a goal in square (33, 12): 0.10.0 leaves
Hero 6 in room B) and "0.10.1 (S05.q leg 4 …, R8)" (Heroes 6 and 7 reach no point on the stair: 0.10.0 leaves them
unnamed); both fail on 0.10.0 and pass.

**Live (GPU page, 0.10.1):** the traced five legs: nobody named, every member in the drop's room or on the stair's centre
line, plan time (`perf.lastMs`) 569 to 891 ms (was 0.97 to 1.0 s). S05.q passed three consecutive runs (r5q1 to r5q3).
The whole suite once (round r5, both paths, 0.10.1): no HARD check failing (113 pass, 0 fail); the misses are the known
ones, unchanged against `standing-r4.md`: S05.i 58.5 ms (GATED, was 61), S15.b four at the door (GATED), S15.c 154 to
157 ms (REPORTED), S11.a (REPORTED), and the software-GL page's timing (S01.d, S07.k, S15.c on the state path,
indicative). S03, S04, S06, S07, S13, S15.a, S16 all pass. S05.p (cold A to B, then back, the heaviest leg) 957 ms.

**Gates.** `make foundry-movement-check` 500 pass, 0 fail (conformance 95.9 %, C30 / C56; the R9 gate's warm route max
under full parallel load brushed its 50 ms several times, 54 to 56 ms, a pathfinder timing it does not share with this
change; passes alone at 43 to 50); `make test` 2,461 passed; `make foundry-module-index && make check-context` OK;
`make foundry-movement-sim SEEDS=10000` identical to 0.10.0's (every class 0, mover overlap 25,679 episodes, named
21,989: narrow ways are outside the simulator). Real data checked after: 29 scenes, 8 users, 333 actors, 26 journals.

**Left open:** the door plug's squares beside the leader (backlog 1, unchanged). Backlog 2 (the stair's stragglers) is
done. The pathfinder's tight-square node inside a box, though the point is clear, stays as it is: `lineBehind` steps
round it; a single drag never has a member's box to avoid.

### 18.11 0.10.2-dev: the door plug (backlog 1)

**The rule** (Joe 2026-11-24, refined 2026-11-25; scratch `decisions.md`): judge each in-between state as people coming in.
A leader dropped just past a door or a mouth: more of the party comes through and takes the free squares just inside,
beside the leader, never ahead of it; dropped deeper, everyone comes in; only those with no free square inside wait in
line outside. Rule of thumb: "would a little more of the party have come through here?"

**The cause** (Node, `test/plug.test.mjs`'s three ways in: a gap in a thick wall, a door in a thin wall, the mouth of a
one-wide tunnel). R3 ranks only squares nearer B (the square the leader steps out of) than the leader's own, so beside
the leader is never ranked; and of the squares that are, the first follower took B itself or the square just inside the
door (rank 0 or 1, the nearest to walk to), after which the rest of the room was shut off from the way in and every
later member's flood found only squares outside. So a leader N squares past brought exactly N in (a line), to 4 past.

**The fix** (`file-core` `planLead`, +~70 lines with two helpers; `file.mjs` one oracle).
- *The trigger:* the leader's own route (out of combat: a route search and no `leaderAt`) came through a narrow point
  (`narrowZones`: a one-wide square, the door in a thin wall), the nearest one back along the route within
  `LEAD.plug` = 4 squares of walk of its rest; none of the leader's own squares is narrow (in a tunnel or on the
  doorway: the line behind, as before); B exists. `file.mjs` refuses a narrow point on a narrow way's tight squares
  (`chokeOk`): past the stair `lineBehind` keeps its line (0.10.1, S05.q). Open ground, a swarm and a fight (a turn plans
  with `leaderAt`, `fightPlan` without a route) never open it.
- *The squares:* on the leader's side of that point (a flood from its squares that never steps into or across it),
  within `LEAD.beside` = 2.5 of walk, not ahead along its last step: `out.choke.inside`. They go first: those R3
  already ranked (behind, by their rank), then the new ones beside it (by that walk), then the rest in R3's order.
- *The doorway last:* a square of them whose taking cuts another off from the narrow point's way in (the member flood's
  own diagonal rule: never past a square taken) waits while one that does not is left: the swarm's ring-1 seal check
  (S02.d), generalised; the swarm's own path is unchanged.
- `planGroup` and `status().group.last.plan` carry `plug` (`past`, `inside`; null when none). The march shape oracle
  (`test/sim/shape.mjs`, the L1 gate's and the simulator's) accepts the plug's squares, judged on their own (a real
  narrow point within `LEAD.plug` of the leader, the leader's squares not narrow, the square within `LEAD.beside` on
  its side, never ahead).

**Numbers** (members inside, the leader too; Node; the same for all three ways in; 4 / 8 / 12 members):

| leader past the way in | 0.10.1 | 0.10.2-dev |
|---|---|---|
| 1 square | 1 / 1 / 1 | 1 / 1 / 1 (the leader stands in the way in; no diagonal squeeze past the frame) |
| 2 squares | 2 / 2 / 2 | 4 / 8 / 10 (nine free squares within 2.5; two of twelve wait outside) |
| 3 squares | 3 / 3 / 3 | 4 / 8 / 12 |
| 4 squares | 4 / 8 / 8 | 4 / 8 / 12 |
| 5 squares | 4 / 8 / 12 | 4 / 8 / 12 (no plug) |

The board (`drop.test`, the door in the wall at y = 400): six dropped two past, 0.10.1 two inside, now six. Planning
in Node for twelve two past a door 15 ms (was 3.6: more members walk in, so more route their whole way).

**Tests first** (`test/plug.test.mjs` 16 cases, 12 fail on 0.10.1; `drop.test` "0.10.2 the door plug on the board", fails on
0.10.1): the counts above with every invariant (in place or named, no rest overlap, no route into a member at rest,
nobody ahead, the shape oracle); the doorway square left free while the room has space; the trigger (open ground, a
tunnel's line behind, the doorway itself, deeper than `LEAD.plug`, switched off, refused); a fight unchanged (each
member's square at its turn and `fightPlan`'s order equal to those with the plug switched off, none opened). Regression
seeds with new slots re-found: SIM-L3-01 954 → 2412, SIM-L3-11 9191 → 11224. Playground suite: S07.s (HARD), two squares past
the open door with eight heroes, the five free squares of columns 56-57 each hold a hero, nobody ahead of the leader.
Not run live: this step does not deploy.

**Gates.** `make foundry-movement-check` 517 pass, 0 fail (conformance 95.9 %, C30 / C56); `make test` 2,461 passed;
`make foundry-module-index && make check-context` OK; `make foundry-movement-sim SEEDS=10000`: 0 failing runs, every hard
class 0 (the shape class with the plug's squares judged on their own); against 0.10.1 mover overlap 25,679 → 26,773
episodes (p95 2,033 → 2,017 ms, 6,377 → 6,471 square-seconds: more members walk through the doors), never moved 25,583 →
25,589, named 21,989 → 21,983 of 62,381 dropped. The square grid's version of S07 (the simulator's station map, Node):
eight two squares past the open door 2 → 6 inside (every free square of columns 56-57), three past 3 → 8, four past
(dropR1) 8 → 8.

**Left open:** one square past a door the leader plugs it (the grid allows no diagonal past the frame); a room's wall
squares beyond `LEAD.beside` are not used before the doorway (the rest wait outside); past the stair the line behind
stays (0.10.1). Not live: the page's plan time with more members routing in is unmeasured (Node 3.6 → 15 ms for twelve).

### 18.12 0.10.2-dev: no page freeze (backlog 2)

**The problem.** A group drop planned inside the drop handler: eight over the S05 stair held the GPU page 0.95 s cold
(perf.lastMs 943-957; S05.p), twenty on open ground 0.18 s, twenty at 4x throttle 0.82 s. Profile (page, eight over the
stair): 89 % of it the narrow walk's band (`relax`): the adapter's `okSeg` 45 % (most of it building the memo's long
string key, avoid circles and all, per square tested), `settle` / `nearest` / `medial` most of the rest.

**What went in.** (a) The plan is a generator end to end (`planDropSteps` → `planLeadSteps` / `lineBehind` → the route
oracle → `routeToSteps` → the planner's slices, which now also slice a found leg's walk → `walkForSteps` →
`relaxSteps`, one yield per band iteration); drained it is the old synchronous plan (`drain`), the same code. The drop
runs it 16 ms; done, it goes out as before. Else `planLater` runs 8 ms slices, letting a frame through when the last is
24 ms old, on a busy clock (only the slices' own time), so every cap reads the same and the plan is the same. planLead
yields `{ lead, free }` once the leader's slot and route are known; `free` (no member starts on its slot, the only way
a later step can make the leader stay) lets it set off in the drop's own update. The rest go when the plan ends, each
wave timed from the drop through `sendWave`'s test (still at its start, not dropped again, its way open past walls,
doors and resting tokens as they are then, else named): that is the guard against the world changing mid-plan (a
door shut, a token come to rest in the way, a second drop, a click on the leader: the group's hold ends, the plan
stops). One known difference from the synchronous drop: when a member that stays makes the plan re-route the leader
round it, the leader sent early keeps its first route (through its own member, which R6 allows). (b) Exact
optimisations, bit-identical walks (800 C-stair walks in Node; every page dry run's slots and routes): okSeg's
creature test once per square per field with a number key, the hazards' line skipped when empty, avoidHits' box test
inline; `nearest` one segNear per wall; number keys for the field's buckets; idle band points skipped. No Web Worker.

**Numbers (GPU page, real drags, cold after a door toggle; before = HEAD 263c9df8 on the same page by a module
override, nothing deployed).** Longest main-thread task from the drop to the plan's end, before → after: S05 eight 950 →
none over 50 (longest script 28 ms); S07 vault eight 162 → none (25); S15 twelve 187 → none (27); S01 eight 57 → none
(26); S01 twenty 182 → none (47). Total plan: S05 945 ms blocked → 556 ms work over 1,002 ms wall; S07 159 → 177 / 346;
S15 184 → 198 / 308; S01 eight 54 → 60 / 101; S01 twenty 180 → 194 / 313 (the generators cost about 8 % on open
ground). Suite (round f1, module override): S05.r (new, GATED) 3/3, S05.q (HARD, the five legs) pass, S05.p the drop's
own 21-23 ms, S01.k 3/3 (lastMs 17-28), S01.l at 4x: the drop's own 25-54 ms (was 0.8 s for twenty).

**Left open:** the pack waits for the whole plan, so over the stair it sets off about a second after the leader (R5's
one wave holds when the plan is under it); frames may still be 50-150 ms apart while it runs (Foundry's own handling
of the moves' writes, not the plan). Not deployed.

