# Changelog — pentaryn-movement

## 0.10.2 — branch movement-0.9: the door plug, no page freeze

- **[declared] No page freeze on a big drop over a narrow way** (`drop.mjs` `groupDrop` / `planLater`, `file.mjs`
  `planDropSteps`, `file-core` `planLeadSteps`, `pathfind.mjs` `routeToSteps`, `narrow-core` `walkForSteps` /
  `relaxSteps`). A group drop of eight over the spiral stair held the page 0.57-0.89 s while it planned (S05.p). The
  plan is now a generator: it yields before each member, between the pathfinder's search slices and inside a narrow
  way's walk (each band iteration). The drop runs it for 16 ms (`PLAN.syncMs`); a plan done by then goes out with the
  drop exactly as before. A longer one goes on in 8 ms slices (`PLAN.sliceMs`) between frames (a frame is let through
  when the last one is 24 ms old; a hidden tab does not wait for one), on a clock that counts only its own slices, so
  every cap in it reads as before and the plan is the same. The leader sets off in the drop's own update as soon as
  its slot and route are known and no member starts on its slot (only such a member could make it stay); else it goes
  with the others. Every other member then goes as its wave comes, timed from the drop (a wave already due goes at
  once, one wave per task), through the wave's own test: still at its start and not dropped again, its way open past
  the walls, doors and tokens standing as they are then, else it stays, named. A click on the moving leader while the
  rest are planned stops the plan with the group; a new drop of them supersedes it. `status().group.sliced`: the last
  sliced plan (`state`, `early`, `syncMs`, `slices`, `longestMs`, `busyMs`, `wallMs`); `perf.planMs`, `perf.longestMs`.
- **[declared] Plan time down where it was clear** (same results, bit for bit: 800 stair walks in Node against
  0.10.2's first commit, and every page dry run's slots and routes): the band's `okSeg` asks each square's
  creature test once per field with a number key (it built the memo's long key, avoid circles and all, tens of thousands
  of times a route), skips the hazards' line when there is nothing to test, and does avoidHits' box test inline;
  `nearest` measures each wall once (not once per pass); the narrow field's buckets have a number key; a band point
  whose last step moved nothing, none of its neighbours moved since, is skipped.
- Measured (GPU page, real drags, cold; nothing deployed, the page ran the branch by a module override): longest task
  from the drop to the plan's end 950 → under 50 ms for eight over the stair (S05), 162 → under 50 for the S07 vault,
  187 → under 50 for S15's twelve, 57 → under 50 / 182 → under 50 for S01's eight / twenty; the stair's plan 945 ms
  blocked → 556 ms of work over 1.0 s; open ground about 8 % more work, spread over frames. At 4x throttle the drop's own
  task stays under 55 ms (twenty took 0.8 s). The pack still waits for the whole plan (over the stair about a second).
- Tests: `test/sliced.test.mjs` (the plan in slices equals the plan at once on 160 simulator seeds with random slice
  sizes and routes that yield, the narrow walk on 20 C stairs, the door plug's 45 maps and their swarms, a march over
  three C stairs); `drop.test` "0.10.2 no freeze" (the same moves sliced and at once, the leader in the drop's own update;
  a door shut while the plan runs: nobody sent through it, the ones that stay named; a click on the leader ends the
  plan). Playground suite: S05.r (GATED, GPU: no task over 60 ms from the pointerup to the plan's end).

- **[declared] The door plug: dropped just past a door, more of the party comes through** (`file-core` `planLead`;
  Joe 2026-11-24 / 11-25: "would a little more of the party have come through here?"). A march leader dropped within
  about three squares past a one-wide door or mouth brought two or three through and the rest lined up outside though
  the room had space: only squares behind the leader counted, and the first follower took the square just inside the
  door, which shut the rest of the room off. Now, when the leader's route came through a narrow point (a one-wide
  square, a door in a thin wall) and it rests within 4 squares of walk past it, on squares that are not narrow, the
  squares on its side within 2.5 squares of it and never ahead of it go first: those behind it, then those beside it.
  The square that would shut the others off from the way in fills last. Those with no free square left inside wait
  outside, behind, as before. Members inside (Node, the leader 1 / 2 / 3 / 5 squares past a thick door, a thin-wall
  door and a tunnel mouth; 4 / 8 / 12 members): 0.10.1 1 / 2 / 3 / 4-8-12, 0.10.2 1 / 4-8-10 / 4-8-12 / 4-8-12. One past
  is unchanged: the leader stands in the way in and nobody passes it without a diagonal squeeze past the door frame,
  which the route refuses.
- Unchanged: open ground (nobody beside the leader), a one-wide tunnel (the line behind), a narrow way's tight squares
  (`lineBehind`; file.mjs refuses a narrow point there), a deeper drop, a swarm, a fight (its turn plans with the leader
  at rest, its order with no search: no plug). `planGroup` and `status().group.last.plan` carry `plug` (the walk past
  and the squares inside; null when none).
- Tests: `test/plug.test.mjs` (12 of its 16 fail on 0.10.1); the march shape oracle (`test/sim/shape.mjs`, the L1 gate's
  and the simulator's) accepts the plug's squares, judged on their own; the regression seeds SIM-L3-01 954 and SIM-L3-11
  9191 (new slots) re-found as 2412 and 11224. Playground suite: S07.s (HARD, two squares past the open door, eight heroes).

## 0.10.1 — branch movement-0.9: the stair's stragglers (S05.q)

- **[declared] The line behind the leader on a narrow way, the next square after a failed route** (`file.mjs`
  `lineBehind`). Live, eight heroes over the spiral stair: the second member on the line tried the point just behind the
  first's (1.03 square off) and the next 0.1 square back, both in the same tight square, and both routes failed (the
  route reaches a point of a tight square through that square's node, here inside the first member's box; with no
  member boxes the same routes were found, from the next square on too). Its two tries spent, it kept a square in the far
  room or stayed, named. Now a failed route's next try is in another square. Not the time budget: plans took 180 to
  750 ms, each route 60 to 150 ms and none timed out.
- **[declared] R8: never left in the far room unnamed.** A member whose rest is beyond the narrow way after the leader
  went through it (to a plain square past it), with no spot on the line, stays where it stands and is named; it used to
  keep its own square silently, "in place" (S05.q legs 2 and 4: Heroes 4, 6 and 7 in room B). The line's routes also keep
  out of members already where they rest (they never walk).
- Tests: `drop.test` "0.10.1" (both fail on 0.10.0). Live S05.q passes; plan time for eight over the stair 0.57 to
  0.89 s (was 0.97 to 1.0).

## 0.10.0 — branch movement-0.9 (Fable's review 3: the leader rule), for Joe's hands-on on the world

The leader rule (Joe, 2026-11-24, after his hands-on of 0.9.0; Fable's review 3): the token you grab and drag leads a
group drag, and where you drop it picks the shape. Dropped on the floor it is a MARCH: the leader ends on the drop
square by its own route and everyone else rests behind it, never beside or ahead of it ("behind" follows the
leader's last step). Dropped on a token outside the group that you can see it is a SWARM: the leader gets a square
touching that token first, and the rest close in round it from their own sides, ring by ring. Formation offsets
(everyone keeping its place relative to the others) are gone. Live on the world pentaryn from 0.10.0 for Joe's hands-on; main keeps 0.8.5. Plan §18.

### Handoff — live round 4 (no module change after `f3ead5b0`; plan §18.9)

The playground suite's last round on the world with the sign-off fixes: HARD 100 checks, 1 failing (S05.q); GATED 11, 2
failing (S05.i 61 ms against 50, S15.b four at a door); REPORTED 9, 3 not clean (S05.p, S11.a, S15.c). No wall or
shut-door crossing, no rest overlap, every charge core's measure, no module error. Open and shipped as known limits:
eight heroes dragged back and forth over the stair can leave a member named or, B to A, in the far room with no notice
(cause unproven); the door plug (the squares beside a leader dropped just past a one-wide door are not used yet); a
fight walk on an off-grid way is charged core's measure (5 ft per square entered); a Large leader at a mouth moves
nobody. Handoff list for Joe's play-test: `context/plans/movement-0.10-handoff.md`.

### Step L1 — the leader plan

- **[declared] The tunnel bug** (Joe's hands-on): four members dragged 11 squares into a one-wide tunnel were told
  there was no room (on 0.9 the three followers were named after 17 route searches: a slot could not lie on a route
  already given out, and the leader's route ran the whole tunnel). Now they line up behind the leader in 4 searches.
- **[declared] `file-core` `planLead`**, one mechanism for both shapes: squares near the drop get a rank (march: the
  walk from the square the leader steps out of on its last step, only squares nearer that one than the leader's own;
  swarm: rings out from the target's whole footprint, never across a wall); each member in turn (the leader, then
  least walk left; one standing where a slot was just given out goes next) takes the best-ranked free square it can
  reach (a flood of its whole body from its way in, shut by the tokens standing and the squares taken) and gets one
  route search to it. A stack is one entry. The leader with no way moves nobody ("No route there"). `walkFrom`: the
  heap flood with a settle cap, on the pathfinder's shared step memo (`pathfindMemo`).
- **[declared] The shape from the drop** (`file.mjs` `targetOf`): dropped on a token outside the group that this
  client sees (not hidden: also for the GM) is a swarm round it; anywhere else a march.
- **[declared] In a fight**: the leader first, then least walk left; each member's square is picked when its turn
  comes (planLead for that one member: behind where the leader came to rest, or round the target), then routed. A
  leader dropped where it cannot stand takes the nearest clear square; one already on its square is in place
  (`status().group.queue.there`); the leader with no way ends the queue ("No route there", `ended: "noRoute"`).
- **[declared] A later wave sends a member whole or not at all** (R12): a wall or door shut across its way, or a token
  now at rest in it, and it stays where it stands, named (no more cutting short).
- **[declared] `status().group.last`** for a group drag: `shape` (march / swarm), `leader`, `target`, `stayed` (the ids
  named), `waves`, `plan: { timingMs, searches, failed, total, tier, members, crowded, staggerMs }` (`passes` gone;
  L2: `tier` gone, `pack` added).
  `planGroup(refs, point)`: `shape`, `leader`, `target`, `searches`, `failed`, each member's `route` (waypoints).
- **Deleted**: `planFile`, `candidatesFor`, `orderOf`, `FILE` (rings, tries, walkRatio, reorders), the route-clearance
  test, the fixed-point passes, `waveWays` (file-core); `fightSpots` and `routeAtTurn`'s spot list (file.mjs, drop.mjs);
  the candidate lattices `hexCandidates` / `cellCandidates` (group-core). Kept for L2: the motion (`staggerFile`,
  `sequence-core`, `groupStagger` / B0).

### Sign-off — the fixes (Fable F2; plan §18.8)

- **[declared] The leader through a member that stays** (S05.p legs 3 and 5: eight heroes dragged back over the stair
  answered "No route there." every time once members stood in its mouth): a member with no free square it can reach
  stays where it stands, and when that was on the leader's route and no way round it exists the whole group stayed.
  The leader now keeps its way through it (R6: a member of its own group; the group never blocks its own leader); only
  a member that stays on the leader's own rest square still stops the group, and the notice names it ("No route there:
  <name> is in the way."). Nothing else goes through anyone (`file-core` `planLead`).
- **[declared] The line behind the leader on a narrow way tries the next point** (S05.p legs 1 and 2: on the page a
  member's one route to its point on the line failed, and it stayed, named, or kept a square far back in the other
  room): a route that fails, or ends too near another's rest, now tries the next clear point back along the leader's
  way, two routes a member at most, inside the plan's time (`file.mjs` `lineBehind`).

### Live round 2 — the fixes (plan §18.7)

- **[declared] The page's plan time** (S01.d/k, S07.k, S15.c, and the members named for the plan's budget in S06.h/i,
  S15.a, S05.p): with one Difficult Terrain region anywhere on the scene every step of every route search was measured
  through core (`createTerrainMovementPath` and `measureMovementPath`: 144 of S01's 245 ms cold, 890 of S15's 1,220);
  a step whose footprints keep a pixel clear of every terrain region's box is now costed once per direction, as on a
  scene with none. The squares of tokens dnd5e leaves out of its creature difficult terrain (the dragger's own, hidden,
  secret, not a creature; under the 2024 rules the mover's own disposition or Tiny) cost the same (a group's own squares
  were measured step by step). The wall answers and a position's squares are shared by every token of one size (each
  member asked core again), and the avoid test skips a circle far from the move (`pathfind-core` `avoidHits`).
- **[declared] A drop with the pointer on a narrow way** (S05.j3, S05.k3): core snapped the leader to a square whose
  centre lies beyond the stair's wall, in the C's hollow, and no route reached it ("No route there"). Out of combat the
  destination is now the pointer's own rest point on the way (`pathfind.mjs` `cursorRestPoint`), alone or in a group.
- **[declared] A swarm round a Large off a wall** (S02.d): the two touching squares between its corners and the wall
  were sealed off once both corners were given out (10 of 12 touching); a touching square whose taking would wall off
  another free touching square waits.

### Live round 1 — the fixes (plan §18.6)

- **[declared] A quick single drop is no longer a silent no-op** (S05.a/b/d/g/h). While core's drag search runs (and
  for its 500 ms search animation) its path is the start alone and core sends no update at all; the drop's own confirm
  search found the way, but the drop was read as "dropped where it stands" (`last.reason` "still"). Now the confirmed
  route is the token's update (core's entry made when it has none), out of combat and in a fight (there only when the
  drag had found nothing yet: a short path there may be dnd5e's own limit), a checkpoint at every square in a fight.
- **[declared] A group's leader is not refused for a slow page** (S06.a/e/f/g/h/i, S07.d/l, S05.j3/k3, S15.a, S01.f,
  S02.i). Every route search in a group plan was cut at 120 ms; on the page a route over a narrow way took 130-250 ms
  (18-33 ms in Node), so the leader's search ran out and the whole group got "No route there", or members were named.
  The leader's search may now take 1,000 ms and a member's 400 ms (the whole plan stays inside 1,500 ms).
- **[declared] Core's wall test only near a wall** (the page's plan time). `Token#checkCollision` was most of a plan's
  time on the page (2,730 calls for eight marching across S01's open field). A broad phase over the scene's edges
  (the canvas's edges, the scene's walls with doors in any state, the scene's bounds; bucketed per square, one per
  scene, rebuilt when the edges differ) answers "clear" for a move that comes within 2 px of none of them; only the
  others ask core. A superset of what core tests, so every answer is core's: the same routes, 307 core calls for the
  same drop. `pathfind-core` `segmentIndex`, `pathfind-adapter` `wallIndexFor`.
- **module.json**'s description now describes 0.10.0 (it still described 0.9.0's B0/B1, the stagger setting and the
  cap of 12).

### F1 — Fable's design check (review F1: B1, B2, B3)

- **[declared] A rider is in its group for the plan** (B3; R1, R2): `drop.mjs` passes every token dragged (riders
  too) to `groupPlan` / `groupFightPlan`, and `file.mjs` leaves them out of the tokens standing and out of the swarm's
  target. A Large mount with its rider dragged one square up-left swarmed round its own rider and moved the other way;
  down-right it was "No route there". Now each diagonal is a march, the mount on its drop square, the rider on it. At a
  fight member's turn its own riders are not in its way either (`slotAtTurn` `riders`).
- **[declared] A group's floods never cross an off-grid wall** (B1; R3, R4, R9): the leader plan's one step between
  squares joined two squares wherever any part of one met any part of the other, so its per-square floods came into a
  tight square by one part and left by another, across the wall. Now a tight square stands for one part in the plan,
  the first a flood over the narrow field's own nodes from the drop reaches (`file.mjs` `narrowParts`, lazy, at most
  `LEAD.far` nodes; a plain step into it only when its centre lies in that part), and a member rests in it only in that
  part. Ten marching beside a wall at x = 12.4 (a closed room, a diagonal, a stub with an open end): no failed search,
  nobody named, nobody across the wall (were 5 failed and 1 named; the same wall on the grid unchanged). S05, six and
  twelve dropped in room B: no route searched to a square outside the C, none fails (were 2 and 8 named after trying
  squares in the enclosed middle). A map whose walls lie on the grid lines never floods: its steps are the walls'.
- **[declared] The line behind the leader on a narrow way** (B2; R3, R9; Joe's tunnel bug, on the stair): a group
  resting on or just past the stair had its followers named though the way had room. (a) A part of a tight square is
  shut by the avoid circles only when every passable point of it lies inside one (`pathfind-adapter` `narrowMore`: a
  slot on the centre line shut its neighbours' parts by their squares' centres, the goal's too). (b, c) The points back
  along the leader's own way where the way is narrower than the token are spots ranked like squares by their walk from
  the leader (`file.mjs` `lineBehind`): each member takes the first one clear of every slot, standing token and member
  that stays by the route's own measure (judged where the route will rest it), with one route, when it has no square
  (R3's fallback, also when the leader rests past the mouth) or a square farther from the leader; the walk order is
  then front first. In a fight the same at each member's turn (back along the leader's own way), and after a failed
  route one more, to that point; an off-grid slot is no longer sent snapped (its route had the narrow field off), and a
  member's mates at rest are taken squares for the plan, not walls (`planLead` `spec.taken`: one resting in the mouth
  cut the leader's floods). S05, members from room A: four and eight dropped at 11 points along the stair and just
  inside room B, six and twelve in room B, and four in a fight at 13 points: nobody named (were up to 3 of 3, 7 of 7 and
  8 of 11), none at rest within 0.98 square of another, no wall crossed.

### Step N — any passage shape (R9)

Not a feature of its own and no switch (Joe, 2026-11-24): the pathfinder itself handles any passage shape; the spiral C
stair that started the build is a test case. Plan §18.4.
- **[declared] `narrow-core.mjs`** (new, pure): a square is tight when a wall that blocks movement runs through its
  interior (an off-grid wall). Tight squares and their neighbours are cut into eighth-square cells; a cell passes when
  some point in it keeps **0.15 square** from every wall (the token's centre; any token up to 1×1, so a way of 0.3 square
  passes though the token is wider); a square's nodes are the connected groups of its passable cells, so a square
  crossed by two lanes (a hairpin, a thin wall) is two nodes and no link crosses the wall between them. Built lazily
  where a search touches, cached per scene until a wall or door changes (a player's preview: the walls seen, re-read
  when fog is explored).
- **[declared] The A* on squares** (`pathfind-core` `search`, a `more` hook) gets the extra neighbours through the parts
  of tight squares, each step what a square step costs; on ties a plain step wins, so a map whose walls lie on the grid
  lines routes exactly as before, waypoint for waypoint.
- **[declared] The walk** (`walkFor`): through the narrow way the eighth-cell path of least length × a penalty under
  the padding radius (the token's own), then a band settled on it (smoothed; on the centre line, within 0.025, where the
  way is narrower than the token; out to the padding radius where there is room), its chords (every sample every 1/16
  square keeps 0.15), sent as one move. Out of combat the whole leg is the band; in a fight only the narrow stretch, the
  rest on the grid, with its checkpoints where the centre line enters each square (`drop.mjs` `withCheckpoints`,
  `fightSteps` keep a narrow walk's shape points unmarked).
- **[declared] Rest on the centre line**: a drop point in a tight square goes to where the token may rest there (its
  nearest centre-line point; `pathfind.route` reports it as `goal`); a fight leader dropped there too; a march dropped
  on the narrow way puts the members behind the leader on its own way, a token apart (`file.mjs` `lineBehind`, and at a
  fight member's turn); planLead's step oracle joins two squares where a part of one meets a part of the other.
- **[declared] R13**: `pathfind.route` and `pathfind.status().last` report `narrow` and `minClearance` (squares).
- A Large or bigger never uses it (decision 8, unchanged). Nothing costs more for being narrow.

### Step L3, the ruling — a door is not shut on a jam

- **[declared] "Door blocked: <name> is in the doorway"** (R8, the simulator's seed 6142; Fable's ruling for Joe):
  `preUpdateWall`, on the client shutting a door out of combat, dry-runs the door cut's stop for every token walking
  through the door's line (`stop.mjs` `shutBlocked`: each one's spots along its own way with the door shut, settled
  together; `motion-core` `doorShutting`, `shutBlocked`). When one would be left with no spot clear of every token,
  the shut is refused and the door stays open. No setting, no flag, no write; the drag help off or a fight: no veto.
  Seed 6142: a crowd of 17 jammed in a three-wide door, the GM's shut 30 ms after a click left the one walking on in
  the doorway inside another at rest.

### Step L3, fix round — one stop, one update; a stop's tokens settled together

- **[declared] One stop's writes go as one update** (R8, the simulator's seed 9191): a click, a door or wall cut,
  another user's stop seen on the dragger's screen and a group's late stops write every token they stop in one
  `Scene#moveTokens` (`stop.mjs` `stopBatched`; a lone one as before). A file of eight cut by a door was stopped front
  first in eight updates; one was late on the wire and, on a player's screen, the one behind it walked on into it.
  The write names where each one carried on will rest by id (`pentarynMovementStopAt: { [id]: { x, y } | null }`); the
  dragger's screen claims them all and leaves that update's tokens to its sender (`file.mjs` `stopGroupHere`).
- **[declared] A stop's tokens settled together** (R8; the simulator's seeds 345, 6572, 6982, 9631, a walk on carried
  through a token the same stop then rested on its way, and 1569, 2357, a jam at a door): when the one-by-one stop
  leaves two inside each other or one inside a token at rest, or one walk on passes through where another rests, every
  token of that stop takes one of its own spots along its own way (`motion-core` `spotsAlong`: where drawn, ahead at
  most 1.5 squares, back the whole way it came; `settleAlong`: no two at rest inside each other, no walk on through
  one at rest, the front ones keep their best spot first, conflict-directed backjumping within a budget). A walker of
  this screen in a token's way back stops with them and they are settled again. No search, no spot off a token's way.
- **[declared] Room along the way** (seed 5418): one with no clear spot along its way takes the first spot along it
  that the members of its stop it would lie in can make room for along their own ways (`roomAlong`, makeRoom's spot
  search along its way).
- **[declared] A walk on's second look settles again** (seed 9124: a door this screen did not yet know was shut, across
  a walk on back): inside members of its own stop resting where drawn, it is settled with them, and those it moves walk
  on clear along their own ways (`settleAgain`).
- **[declared] A waiting member's slot is a stop's last choice** (seed 8249): with no spot clear of every slot of a
  member still waiting for its wave, the stop takes one clear of the tokens themselves; that member's wave finds its
  slot taken and stays, named.
- Notices: "Stopped on another token" is given after the settle, only for a token still inside another.

### Step L3 — the fight and the simulator

- **[declared] The fight's leader** (R6, R7): in a fight's group drag the leader walks first, straight through its own
  group (never through anyone else), at no extra cost (2024 rules; no house rule, no hook); its moves end only on
  free squares (a square inside a member is no checkpoint), so a click while it is inside one carries it on to the
  next free square. The others follow one at a time, the leader first and then least walk left (planLead `byWalk`;
  `status().group.queue.order`), each slotted and routed at its turn behind where the leader came to rest.
- **[declared] The speed stop** (R7): a group member whose speed runs out in a fight stops on the last free square its
  movement this turn pays for: dnd5e 6.1.1's own reading (its token ruler's speed for the movement action, a walk
  fallback included, less the cost in the token's movement history this turn; `group-adapter` `movementLeft`) against
  core's measure of the walk (`motion-core` `fightWalk`). One with nothing left does not move. Both are named ("Out of
  movement this turn, stopped short: …"). No usable speed on the sheet: the whole way. Single drags unchanged.
  `status().group.queue.walks`.
- **[declared] The order every screen sees** (R8, the simulator's passThrough): a drop's waves reach every client in
  the order they were sent, so a member whose route passes another's slot is sent no later than that one, and one
  whose route passes another's start no earlier (`file-core` `staggerFile`). L2's open passThrough seeds (315, 954,
  1451, 1522) hold with it and fail without it.
- **[declared] One stop settles the front ones first** (R8, the simulator's restOverlap): a click, another user's stop
  or a door cut of several walkers drawn overlapping rests the one in front where it is drawn and carries the ones
  behind back along their own ways (`motion-core` `stopOrder`). A stop never rests a token where another stop on this
  screen is still carrying one on to, and a stop's walk on that a door shut since would cross takes its spot again
  along its way with the walls as they are now (`stop.mjs`). This screen's other walkers whose way comes into a spot
  the stop rests a token on are stopped by the same stop (`stopAlso`; an own walker counts where it is drawn, not
  where it is going); one left inside only members the same stop rested rests where it is drawn when they can be
  carried on along their own ways (`makeRoom`); a stop never carries a token onto the slot of a member still waiting
  for its wave, nor a wave a member onto a spot a stop is carrying one to; a brush (within 0.05 square) is no overlap a
  carry may leave through. A wave's member that stays is in the way of the whole wave.
- **[declared] A tab going to the background keeps its waves** on their own timers (a hidden tab fires them on whole
  seconds, in order); one due past 3 s is timed for 3 s, so the last still goes within 4 s (0.8 to L2 sent them all
  at once, and a whole file set off together). `status().group.flushed.kept / retimed`.
- **[declared] A fight's next square is never sent onto a walker's own square** when that walker rests there (its
  move's last square) or has had no next square for 500 ms (its screen held up, or gone); one about to walk on is
  passed, as before (0.9.0's open simulator seed 3599: a token whose player dropped mid-walk was walked onto).
- **[declared] The simulator, one mode**: the leader rule's own seeds beside 0.9's mix (kept draw for draw as
  `legacy`): swarms on visible targets of three sizes, drops on hidden tokens, a party queued in a one-wide tunnel with
  its leader at the back or the front, crowds of up to 24, fights with limited speed, and Joe's playground stations on
  the square grid (`test/fixtures/stations.json`, thin and one-way walls, doors, scenarios, drop points). New
  invariant `shape` (march: nobody rests beside or ahead of the leader; swarm: the leader touches the target when a
  touching square was free); `wrongCharge` judges a leader's update through its members and the speed stop.

### Step L2 — the motion

- **[declared] The leader goes first, the pack one wave later** (R5): the leader in the drop's own update, everyone
  else one wave (150 ms, about a square) after it as one pack; a leader that starts behind (by walk to the drop)
  walks through its own group to the front first, and the pack sets off once it is a wave past the frontmost member
  (4 s at most). Single file only at a narrow point: a one-wide square (a corridor, the gap in a thick wall) or the
  door in a thin wall, one through at a time (`file-core` `narrowZones`, from the same step oracle planLead uses);
  two members whose ways merge into one lane for long (deeper than half a square for over 400 ms) are held apart too,
  and a member waits while another would walk through it at rest (a brush in the same update, or a pass as it
  arrives, is soft). Crossing paths on open ground go as one pack. The last start is within 4 s of the drop; one that
  finds no clear start goes at the least crowded one, never cut short. `status().group.last.plan.pack`.
- **[declared] The leader drawn on top** (R6): its move carries `pentarynMovementLead` (its id, and its riders' so they
  stay above their mount); every client lifts it a rank above owned-on-top in the mesh sort and the layer's click order
  while it walks, and drops it when
  its move ends (no document write; `status().group.leading`). A stop of the leader inside its own members carries it
  on through them to the first free spot along its way, however far. The simulator reports the leader through its
  own members as allowed, never a failure.
- **[declared] Up to 24 tokens** in a group drag, out of combat and in a fight (R11; was 12). More: core's drop out of
  combat, "In a fight, drag one token at a time." in a fight. (The page gate, under 100 ms for 8 and 250 ms for 20 on
  the GPU page, is a later step's.)
- **[declared] Fix: a stop's straight-line last resort is gone** (Fable's review 3 §4): a token a stop finds inside a
  token at rest with no clear spot along its own way (ahead 1.5 squares, back the whole way it came) is no longer
  walked in a straight line to the nearest clear spot (through whatever stood between). A click leaves it walking on to
  its own square when that is clear, named ("Could not stop clear of another token, so walked on to its own square");
  a wall or door cut, or a square that is not clear, leaves it where it is drawn, named ("Stopped on another token,
  …").
- **[declared] Fix: a mate never rests on the carried one's spot**: another user's stop of a member that carries it on
  past a door names its final spot in its write (`pentarynMovementStopAt`), and the dragger's screen, stopping the rest
  of the group, never rests a mate there.
- **[declared] Fix: no silent leave**: a wave whose members this screen no longer draws (the dragger changed scene)
  names them ("Did not move, the group's walk was ended: …").
- **[declared] Fix: one-way walls**: in a fight's per-square check (and a wave's wall test) a one-way wall met from its
  open side no longer stops the token (Foundry's own side test).
- **[declared] A new drop no longer empties a fight queue** (R12): it left the queue's members unnamed; a member
  dropped again leaves the queue, the rest walk on.
- **Deleted**: `sequence-core.mjs` (`stacksOf` moved to group-core; `sequence`, the ordering search, with it), the
  world setting `groupStagger` and B0 (every member at once; its stored row is removed once by the active GM:
  `RETIRED.world.groupStagger`), `status().group.stagger` and `last.plan.tier`, the simulator's B0 mode.

## 0.9.0 — branch movement-0.9 (Fable's review 2), deployed for Joe's hands-on 2026-11-24

Version set from 0.9.0-dev for Joe's 30 minutes (§4 step 7); `main` still 0.8.5. Rollback: check out main's
`foundry/module/pentaryn-movement`, `make foundry-movement-sync`, restart the world (0.8.5).

The smaller design (Fable's review 2, §2 and §4; Joe's decisions of 2026-11-24): within 4 s of the drop every token is
on its way or named in a notice, and nothing ever waits for another mover. Two tokens that are both moving may brush
(soft); walls, shut doors, standing tokens, a mate at its spot, overlap at rest and fight charges are hard. Built on
the branch `movement-0.9`; `main` keeps 0.8.5 (tag `movement-0.8.5-rollback`) until the GPU round of §4 step 8.
Plan §17.

### Fable's check — the blockers

- **[declared] B0 against B1 at the table** (blocker 1): a world setting `groupStagger` (*Group drags: staggered
  starts*, on). On is B1 (the file's start delays); off is B0 (every member in the drop's own update, no waves).
  Read on every group drop; `status().group.stagger`, `status().group.last.plan.tier` ("B1" / "B0").
- **[declared] A click no longer misses a member whose wave is on its way** (blocker 3; simulator seeds 58, 373, 535,
  588): stopping a group on the dragger's screen (its own click, another user's stop of a member, a GM's stopOwn)
  marks every member it has just sent and that is not moving yet; when that member's move comes back it is stopped
  where it is drawn (one batch per wave, sharing one stop's claims). `status().group.stopped.late` / `lateTotal`.
  The dead `"late"` path of `stop()` and the unread `pentarynMovementStopAt` update option are deleted.
- 10,000 seeds: unchanged hard failures (B1 restOverlap 6, passThrough 2; B0 27 / 6: the open seeds of §17.5);
  B1 "past a mate stopped short" 1,692 → 1,495 (what is left is the clicker's and the dragger's screens a round trip
  apart, and the stop's carry walk).

### Step 6 — the old files out; docs

- **[declared] `group-core.mjs` 1,381 → 198 lines:** the 0.4 to 0.8 group planner is gone (`planGroup`, `assignSlots`,
  `settle`, `restOnPaths`, `runPlan`, `stayPastDeadline`, `walkersMeet`, the delay search, `alongRoute` / `offRoute` /
  `remainingVia`, `composeCut`, `detourTooLong`). What the file, the drop, the stop and the simulator still use stays:
  `hexCandidates`, `cellCandidates`, `onCell`, `prefixOf`, `pathLength`, `firstIntrusion`, `freePrefix`, `flood`,
  `coalesceHistory`. `group-adapter.mjs` 551 → 471: `movingOthers`, `narrowPoints` (the width probe) and `crossesDoor`
  went (nothing called them).
- **Tests:** `ar1`, `ar3`, `hx1`, `s1r1`, `s1r2`, `s2r1`, `s2r2` and `group-core.test` deleted (the old planner's
  acceptance tests); `group-props.test` keeps what tests the surviving cores and gains a `freePrefix` test naming
  S1R1-02 and S1R1-07; the narrow-width probe test left `drop.test`. `regressions.test` PENDING takes five round IDs
  (H2-01, H4-01, H4-03, HX1-01, S1R2-05) whose tests went with the guard and the planner. Guard, reservation,
  lifecycle and cue files, and tier C's setting (its stored row deleted once, `fightGroupDrags: null` in the settings
  migration), were already out in steps 1 and 4; nothing imports any of them (grep clean).
- **Docs:** README, `context/foundry/movement.md` rewritten for the 0.9 behaviour, plan §17.6. No API, setting or hook
  change; the describe golden is unchanged. `telemetry` still counts rows from the guard days (`guard fires`, lost
  races) that now stay at zero; folded out at the handoff.

### Step 5 — the simulator on the real cores

- **The simulator runs the module's own code** (`test/sim/`; `make foundry-movement-sim`): `file-core` planFile,
  staggerFile, waveWays and candidatesFor, `motion-core` clearAlong and waves, `sequence-core`, the pathfind-core A*,
  on the engine's virtual clients (jittered latency, TCP loss, fog stalls, a backgrounded dragger, an observer's
  dropped socket and reload, a second group, a door shut, a click, a turn change). `model.mjs` keeps only the wiring
  drop.mjs / file.mjs / stop.mjs do with Foundry (513 lines, from 1,311). Every seed runs as B1 and as B0.
  Hard invariants: pass-through of a standing token (one the walk's sender knew standing there), wall crossings,
  wrong charges, members neither sent nor named within 4 s, rest overlap (unless two screens' writes each went before
  seeing the other's: a flagged race). Mover overlap is reported (episodes, p95 depth and duration), never gated.
- **[declared] A member whose formation spot the drop point does not reach** (behind the room's wall, off the scene,
  in rock) takes the nearest spot to it that the drop point reaches about straight, instead of staying named
  (`file-core` candidatesFor with the grabbed one, within `FILE.reach`; spots stay on the member's own lattice).
  In a fight (`file.mjs` fightSpots, `drop.mjs` routeAtTurn) the same squares are tried, at most four, and a formation
  square a token cannot rest on (off the scene) is no longer walked to. Members never moved: 46 % → 29 % (10,000 seeds).
- **[declared] A later wave** (`drop.mjs` sendWave, `file-core` waveWays): mates resting off their plan, a mate an
  earlier wave left standing, one this screen just sent short, and in the wave each member that stays or is cut
  short stand in the others' way; a cut way never rests on a mate still waiting for its wave; two in one lane cut
  short go front one first.
- **[declared] A stop never rests a token inside another** (`stop.mjs`, `motion-core` clearAlong): out of combat a
  token drawn inside a token at rest, a member the same stop stopped, or a spot this screen just sent a mate to is
  carried on along its own way just clear of it (ahead at most 1.5 squares, else back the way it came), past a token
  still walking there, never through a wall or another token at rest; with nowhere on its way, the nearest clear spot
  (clearOfWalls). A wall cut and the dragger's screen stopping the rest share one set of claims; a click's mates it
  does not stop count where they stand.

### Step 4 — the fight file

- **[declared] A group drag in a fight walks one member at a time** (Joe, 2026-11-24; `drop.mjs` `fightFile`):
  nothing moves at the drop; the members, in order (`sequence` over their straight walks, least walk left first),
  each get a normal single move when their turn comes, routed then round every token standing then (the members
  already moved where they came to rest), to their formation spot or the nearest clear square, a checkpoint at every
  square, charged by core as any single move; the next one starts when that walk's promise and animation are done. A
  stack (a mount and its rider) goes as one entry. A member with no route stays, named.
- **[declared] What ends the queue:** a click on any member (or a walk stopped or prevented on the way), a turn change
  or the fight's end, a new drop by the dragger, a deleted member. The members not sent are named ("Did not move, the
  group's walk was ended: …") unless the dragger's own click or drop ended it. A watchdog (the walk's time plus 3 s)
  moves a walk that never ends on, so the queue cannot hang. More than 12 members, or pathfinding off on that screen:
  refused ("In a fight, drag one token at a time.").
- **[declared] Tier C deleted:** the world setting `fightGroupDrags` is gone (the GM's client deletes its stored row
  once), `groupMode` has no `fightTier`; `groupDrags` covers group drags in and out of combat. `status().group.fight`
  is `groupDrags`; `status().group.queue` reports the last fight queue (members, sent, stayed, skipped, watchdog,
  ended, running). New hooks: `deleteToken`, `updateCombat`, `deleteCombat` (49 registrations).
- Gate (`test/drop.test.mjs`): one member at a time, each a square a step with a checkpoint at every square, charged
  exactly 5 ft a square, the second routed round where the first rests; 40 seeded fight group drags (2-4 members,
  tokens standing) the same, never through a wall or a token standing at its turn, nobody resting on anybody, every
  member walked or named; a stack goes as one entry; the queue ends on a click, a turn change, a deleted member and a
  new drop; the watchdog moves on after the walk's time plus 3 s and not before.

### Step 3 — B1, the file

- **[declared] Start delays on B0's plan** (`file-core.mjs` `staggerFile`): the members that move, in `sequence`
  order, each take the first 150 ms step at which they meet none of the members timed before them; the last start is
  at most 4 s after the drop (less the plan's time); one with no clear step under that goes at the least crowded one
  (never a cut, never a second pass). On open ground every delay is 0.
- **[declared] Waves by setTimeout:** the members at 0 go in the drop's own update, the rest in later waves
  (`file.mjs` holds the timers on the group; `drop.mjs` `sendWave` sends them, with the group's option for undo and the
  other clients). A wave skips a member no longer at its start, does not send one whose way a wall or a shut door now
  crosses (it stays, named), and walks one only as far as it is free of a token come to rest in its way.
- **[declared] The three handlers, one primitive (stop where drawn):** a click on any member stops the whole group
  (decision 3 as revised 2026-11-24: on the dragger's client every member and its unsent waves; elsewhere the one
  clicked, and the dragger's client stops the rest when it sees that stop); a wall or door change stops this client's
  walkers whose way it crosses (step 1) and every wave after it is tested against the walls then; a hidden tab sends
  its remaining waves at once.
- `planGroup` reports each member's `delay`, the start order (`starts`) and the last start (`total`);
  `status().group` adds `pending` (unsent waves), `wave` (the last later wave) and `flushed` (the last hidden-tab
  flush); `last.plan` adds `waves`, `total`, `crowded`, `timingMs`.
- Gate (`test/file-core.test.mjs`, B0's 800 seeded drops): every delay a wave step, the last at most 4 s (largest
  seen 1,050 ms); 200 open-room formation drags all at 0; B0's properties unchanged. Two movers meeting (soft,
  reported): 103 drops all at once, 10 staggered; none deeper staggered. `test/drop.test.mjs`: the door drop in
  waves, the click, a foreign stop, the hidden-tab flush, a wave skipping a moved member and a door shut since.

### Step 2 — B0, the floor

- **[declared] A group drag out of combat is planned in one pass** (`file-core.mjs`, pure; glue in `file.mjs`): per
  member in order (the grabbed one first, then least walk left first), the free spot nearest its formation spot by
  walking that it can reach (never round the far side of a wall: a walk at most 1.5 × the straight way + 1 square),
  clear of the tokens standing outside the drag, of the spots and of the routes already given out; and an A* route
  round the standing tokens and the spots given out (space, not time). A member that stays, or whose spot is where it
  stands, becomes a standing token for the others and the pass runs again until nothing changes; the members that
  stayed are tried again planned first, then most walk left first, and the order that sends the most wins (on a tie,
  the one that rests the grabbed one nearest its drop point). Zero stagger, one batched update (the drop's own), no
  timers. A member with no reachable spot stays where it stands and is named ("Stayed where they stand, with no free
  spot they can reach: …"); nobody able to go is "No route there". Planning time is bounded (300 ms a member, 1.5 s a
  drop; past it a member stays, named). A group is planned from its drop points, not core's paths (a member whose core
  path stopped at a wall still has a way).
- **[declared] `planGroup(refs, point)`** is B0's dry run: `{ ok, result, ms, passes, order, members: [{ id, name,
  slot, waypoints, stay }] }`.
- Gate (property tests, `test/file-core.test.mjs`): 600 seeded drops on random floors and 200 on the hard-case
  dungeon, every member sent or named, no route through a standing token, a member standing still or a slot given
  out before it, no spot on an earlier member's route, no two at rest overlapping; of the members that could reach
  their spot alone, 98.6 % sent on random floors, 352 of 357 in the dungeon. Eight members through a door on the
  synthetic board plan in 7 ms (p50, 13 ms p95, Node).

### Step 1 — singles

- **[declared] `drop.mjs` replaces `group.mjs`** (4,124 → about 1,100 lines with the B0 glue of step 2). A single drop
  confirms its route clear of the tokens standing outside it and goes: no publish, queue, start delay or step-aside. A
  route search still running at the drop finishes in slices and the token goes when it is done (as before). In a fight
  every move has a checkpoint at every square (decision 1), and before each next square of a move this client drives
  is sent it is tested against the movement walls as they are now (Joe, 2026-11-23: every square, drawn or not; closed
  doors, new walls, a Wall of Stone; never vision); from a page that no longer draws the token no square is sent at all
  (AR1-01 / AR2-01); and never into a token standing still (moving tokens may brush). A wall raised or a door shut
  across a walk out of combat stops it exactly where it is drawn (decision 2; the click-stop's displace). Riders and
  one Ctrl+Z per move are kept.
- **[declared] Deleted: the reservations (`reserve-core.mjs`, `reserve-adapter.mjs`), the runtime yield guard
  (`guard-core.mjs`, `guard.mjs`), the lifecycle and its 10 s deadline (`lifecycle-core.mjs`), the amber waiting cue
  (`cue-ui.mjs`), the reload resumes of a group's waves and a fight's walk** (a reload mid-walk leaves the token on
  the square it holds), with their hooks, their status rows (`status().guard`, `group.runs`, `reservations`, `hold`,
  `flushed`, `resumed`, `fightResumed`, `held`, `silent`) and their tests. `status().group.told` lists the last notices.
- **[declared] A group drag in a fight is refused**, "In a fight, drag one token at a time.", until the fight file
  (§4 step 4; Joe 2026-11-24: "if that misses its gate, refuse group drags in a fight"). Ghost, the unconstrained tool,
  Ctrl waypoints and one stack (a mount and its riders) are core's own moves as before.
- **[declared] A click on one member of a group stops every member of it the clicker owns** (decision 3 as revised
  2026-11-24; the dragger's screen stopping the rest is §4 step 3). `file.mjs` (a feature) holds which tokens move
  together.
- The 0.8 simulator (`test/sim/model.mjs`, `scenario.mjs`, `sim.test.mjs`) modelled the deleted glue and went with it;
  §4 step 5 rebuilds it on the real cores. `make foundry-movement-sim` says so and exits 2 until then.
- Gate: tier A's tests (ported to `test/drop.test.mjs`); a seeded test of 60 single fight drags, each charged exactly
  5 ft per square walked, never through a wall or a standing token, a door shut mid-walk stopping it on the square it
  holds charged for the squares sent; the drop handler's own time for a single drag (the C12 proxy, Node, 400 drags)
  p50 0.037 → 0.018 ms on open ground, 0.27 → 0.25 ms round a standing token, 0.21 → 0.19 ms in a fight.

## 0.8.5 — 2026-11-23

Acceptance round 3 (AR3, frozen 0.8.4) defects for the tiers not yet passed (plan §16.13). Each fix has a test that
fails on 0.8.4 (`test/ar3.test.mjs` for the planner, `test/group.test.mjs` "AR3-…" for the glue). Diagnosed on the
BOSS WSL headless harness (the GPU judge was busy): the plan's dry run (`planGroup`, now with a `why` per member) and
the live drags of M2 / M3.

- **[declared] Out of combat a row of members beside a door left the grabbed one and three others where they stood
  (AR3-01, blocker).** The file order ranked members by the foot of the perpendicular on the grabbed one's route, so
  every hero east of House A's door ranked ahead of the three at its mouth, who were timed 5-9 s later (past the
  deadline); one of them went last on a way that brushed a neighbour still waiting at its start (0.03 square), and
  settle() then kept Heroes 1-4 where they stood. The file order is now the walk left by the route (`remainingVia`:
  to the nearest leg, then along the rest), and a member going last takes its lateral way round the later members'
  starts when its own way brushes one. Live dry run, M2 door: 4 of 9 stayed → only the Large (fits no door) stays,
  the last sets off at 5.7 s.
- **[declared] Tier C: over the one-wide bridge nobody moved; at the T-junction four members, the grabbed one among
  them, never moved (AR3-02, blocker).** Four causes, each fixed: a member cut to where it stands (cutsFor) never
  counted as arrived, so the grabbed Hero 8 waited for seven heroes until the deadline; the grabbed one heading a
  one-wide file was sent last ("anchor in the gap's mouth"), past nobody; a member's vet read the members walking
  ahead of it as standing (between two squares) and cut each follower behind the one ahead; in a fight the 0.2-square
  rest gap of open ground ruled out every second square of a one-wide dead end (three of eight got no spot), and the
  grabbed one at the back of the file was given a spot the members ahead of it had to rest short of. Now a member with
  no walk counts as arrived, the head of a narrow file goes first, a member's own walking group mates are the
  sequence's to answer, fight spots are side by side, and the grabbed one behind more members than spots past its
  drop point stops short behind them (its rule: where dropped, or short of it). Live: the bridge file walks into
  Room E; the T-junction fills the dead end in file order, the grabbed one short with a notice.
- **[declared] Tier C off (the default): a fight's group drag moved each member one square, then stopped (AR3-03).**
  The next-square test read a follower stepping into the square the one ahead leaves as a trade, so every member's
  next square was refused. Only a real trade is refused now. And a step into a token that is still moving is held,
  not refused for good: the rest of the walk is sent from the square it holds once the step is clear and the one
  ahead is a latency buffer away (`status().group.hold`); a follower waits until the one ahead has been let leave its
  square on this page, and a square this page just sent a token to counts as taken before the server's echo. Tier C
  off's members still walk core's own paths (Joe's 2026-11-23 rule), which in a corridor end at the first wall.
  Simulator, 300 fights: tier C off 4.1 → 5.6 squares a member, pass-through 40 → 29; tier C 6.8 → 9.9 squares a
  member, pass-through 23 → 11 (mover-vs-mover 3 → 22, all on a client that had just stalled or lost a packet).
- **[declared] Out of combat movers caught tokens slowed in difficult terrain (AR3-04, blocker: B8, NPC 6 0.33 square
  into NPC 5 for 1.26 s in the Mud).** Core draws a step at its speed divided by the terrain's difficulty
  (`Token#_modifyAnimationMovementSpeed`); the plan timed every member at full speed. On a scene with terrain every
  trajectory the plan times is now core's terrain path, segment by segment (`terrainPath`). Live dry run, B8: the
  members behind the ones in the Mud set off 2.1-2.85 s later instead of 0.45 s.
- **[declared] After a player stopped their tokens in the GM's group, the GM's other members walked on inside each
  other (AR3-05, AR3-06).** Each was cut short behind the stopped one on its own; their walks on are now settled
  together (the cut ones first), so none rests where another still walks.
- **[declared] A pins teleport or gather 1.2 s after a drop was undone by a later wave (AR3-08).** A member displaced
  by anything but the module leaves its group: its unsent waves and any held step go.
- **[declared] A backgrounded initiator's members were told "Stopped short" 10.1 s after the hide (AR3-09).** The
  flush tells at once when it keeps a member where it stands, and the drop's watch reads rest from the server on a
  background page (no frames there).
- **[declared] The planning task blocked the page 227-275 ms at a drop (AR3-10).** A member with no route round the
  tokens (the Large that fits no door) was searched toward its spot in one task of up to 250 ms; it is searched in
  slices now (`towardSliced`).
- **[declared] A fight's single drag past a standing ally in a one-wide corridor said "Stopped short", nameless
  (AR3-12; Fable §3 row 5).** It says "No route there: <name> is in the way. The ghost button under the Ruler lets you
  pass." (the name only when this user can read it).
- A token drawn walking into its last square bars a step passing it there, not only one ending there (the simulator:
  a diagonal step past its corner).
- Not changed: AR3-07 (two players head-on in a 2-wide lane: each plans round the other group standing; both stop
  short, both told: `anchorShort` in both telemetries; the DOM harness read the notices after Foundry dismissed them),
  AR3-11 (the move refused once the GM views another scene is told, `step:unrendered`; same harness reading), AR3-13
  (the "reading 'position'" TypeError has no stack; this module reads `position` only inside a try).

## 0.8.4 — 2026-11-23

Acceptance round 2 (AR2, frozen 0.8.3) defects for the tiers not yet passed (plan §16.12). Each fix has a test that
fails without it (`test/group.test.mjs` "AR2-…", `test/pathfind.test.mjs` / `test/pathfind-core.test.mjs` "AR2-06",
`test/sim/sim.test.mjs` "AR2-02").

- **[declared] A fight move went on through a door shut mid-move, charged 0 ft, once the GM viewed another scene
  (AR2-01, blocker; AR1-01 was not fixed).** Core's fight test (`_shouldRecordMovementHistory`) reads `game.combat`,
  the combat of the scene the page VIEWS: on the GM's page viewing M2 a token on M3 read as out of combat, so the
  0.8.3 handler let its squares through as a free walk (only a wall crossed exactly was refused) and core recorded
  nothing. `inCombat` now also counts the token's own scene's active, started combat; and a drag's first square (or a
  wave, a queued single drop) sent after the page left the scene is refused like a continuation (in a fight always;
  out of one across a wall that blocks movement now, every leg of it).
- **[declared] Tier C off left two members stacked on one square at rest (AR2-02, blocker).** The next-square
  handler read every token between two squares as about to leave. A fight step is now not sent when it comes inside
  a token that will stay (at rest, or this page's token whose own next square is barred by a wall or by a token that
  stays, looked up three deep), when it ends on the square another token is about to step to (two continuations sent
  in one moment), or when two tokens would trade squares. Simulator, 400 tier C off fights: 149 → 61 failing (rest
  overlaps 10 → 1, mover-vs-mover 106 → 7), no more members unmoved; 2,000 seeds of every mode: 383 → 298.
- **[declared] Drawn movers clipped standing tokens by 0.1 square at smoothed corners (AR2-06), and the mounted
  pair's way ran through standing Huge by 0.49 square (AR2-03, blocker; its click-stop then rested inside Huge).**
  Out of combat a route now keeps its square clear of a standing token's square (a box: `pathfind-core avoidDist`,
  Chebyshev), not only its circle; and the tokens to keep out of are passed to every route search of a single drag,
  not only when core's straight line crossed one. The grabbed one's drag route is reused only when it keeps that
  clearance (`throughAny`). In a fight routes stay on circles (5e's diagonal past a standing ally). The guard's
  re-route keeps boxes too.
- **[declared] Nothing stops silently (AR2-04, AR2-05, AR2-09, AR2-11, AR2-12; review C3).** Every drop of this
  client is watched until its tokens are at rest (or its deadline plus 2 s): a member that never left its start
  though its drop point was a square or more away, or the grabbed one sent to end more than a square from where it
  was dropped, with nothing told since the drop, gets "Stopped short, way blocked." (`status().group.silent`). The
  causes (a plan's stay, a wave held to the deadline, a refused square, a queue, a cut, a lost race) are unchanged.
- **[declared] A player's click on its own token in a GM-started group did not stop it (AR2-08).** A click is armed
  400 ms after a drop only on the page that dropped (the click that follows a drop); a move another user started is
  armed at once.
- **[declared] A client error when another scene was activated during a group walk (AR2-14).** A destroyed token's
  PIXI `position` getter throws; `drawnPosition` and the pin helpers read it through `positionOf`.

Not changed: AR2-07 (mover-vs-mover over 0.1 square for 150 ms: the timing pass keeps circles apart and the harness
measures squares; §16.9 class 1 on late-drawn clients); AR2-10 (long frames at 4× CPU: not profiled; no fix without
the frames' stacks); AR2-13 (a rider dragged alone dismounts, as decided in 0.8.3); the root causes of AR2-04's and
AR2-09's unmoved members, which only the live maps reproduce (now told, not silent).

## 0.8.3 — 2026-11-23

Acceptance round 1 (AR1, frozen 0.8.2) defects for the tiers not yet passed (plan §16.11). Each fix has a test that
fails without it (`test/group.test.mjs` "AR1-…", `test/guard.test.mjs` "AR1-03", `test/ar1.test.mjs`,
`test/sim/sim.test.mjs` "AR1-02").

- **[declared] Tier C moved 0-2 of 5-8 members (AR1-02, blocker).** Two causes. The fight plan still ran the timing
  pass and its settle(), which left members standing for conflicts in time that tier C answers by order (live C-1:
  6 of 8 `stayed`); tier C's plan (`planGroup` `sequenced`) now keeps every member's route. And a member set off only
  on the arrival of each member before it whose corridor meets its own, so a file through one corridor walked one at
  a time until the 10 s deadline kept the rest where they stood. A member now also sets off once each such member is
  drawn far enough ahead (`commitFight` `ahead`: its walk from now and the rest of the other's from where it is
  drawn never come inside each other, the latency buffer included; looked at every 100 ms, read again after its own
  start vet). Simulator, 400 undisturbed tier C fights: members moved 69 % → 89 %; 1 fails (seed 208, a reservation
  of a member that set off at 6.5 s on a 70-square way outlives the run, the known §16.9 5 class).
- **[declared] A fight move went through a door shut mid-move, charged 0 ft, once the GM viewed another scene
  (AR1-01, blocker).** Core sends each next square from the initiating client and constrains and measures it only
  while that client draws the token. A `preMoveToken` handler (`onPreMove`) on the moves this client drives (a drag,
  or a move carrying the module's options; their continuations by core's movement chain) does not send the next
  square when the page no longer draws the token in a fight (out of combat: when the step crosses a wall that blocks
  movement now, read from the scene's walls). The token stops on the square it holds, charged for what it walked.
- **[declared] A fight move walked through a token standing in its way (AR1-07).** The same handler does not send a
  fight's next square into a token standing still on this client's view (one that came to rest there since the
  plan, a member stopped by a click, another group's member). Simulator: tier C off (the default) 207 → 140 failing
  fights of 407; tier C's head-on two-group runs clean.
- **[declared] The guard cut moves the module did not plan (AR1-03, C10).** A plain `update({x, y})` (a macro, MCP
  `move-token`) was held mid-path and left off-grid inside a standing token. The guard watches only a drag or a move
  carrying the module's options.
- **[declared] A Large that fits no door parked in its mouth (AR1-04).** A member with no way to its spot stops
  short only where it is in nobody's way; when the end of its short way is on another member's way it stays where it
  stands (the GM is told it does not fit).
- **[declared] Ctrl+Z undid one wave or one square (AR1-05, AR1-06).** The undo entries of one move (a group's
  waves by its id, a fight's squares by core's movement chain, the module's own writes for it) are merged into one
  (`group-core coalesceHistory`); each token goes back where the move found it, its movement history (and charge)
  as it was. `status().group.undo`.
- **[declared] A follower came to rest inside a member another user stopped (AR1-08).** A member of this client's
  group drawn already inside the stopped one goes back along the way it came to the last point clear of it.
- **[declared] A mount dragged alone left its rider (AR1-09).** The tokens that start stacked on the grabbed one (it
  the largest) join its drop as riders; a rider dragged alone leaves its mount, and the guard never holds either
  against the other.
- **[declared] A flying token routed round the crowd below it (AR1-12).** Tokens on different layers (core's
  movement action `fly`, or not) are no obstacle to each other: routes, the group planner and the guard.
- Not changed: AR1-10 (movers 0.11-0.13 square apart on a loaded Mac: the drawn-late class of §16.9 1); AR1-11 (the
  harness measured square footprints; tokens are circles, and the circle clearance holds, as the Mac's frames
  showed); AR1-13 (a player's route never crosses unexplored ground: decision 7 and C8, the scripts' A1/A4/A7
  expectations are to change).

## 0.8.2 — 2026-11-23

Correctness review of 0.8.0 / 0.8.1 (fail-open coverage, the circuit breaker, a reload across a turn change, tier C on a
background tab). Each fix has a test that fails without it.

- **[declared] A single drop whose async way threw moved nowhere, silently.** `singleFlow` (a single drop that
  publishes first, waits or queues), `confirmLater` and `aroundLater` only logged a throw: the token stayed, nobody was
  told, the breaker never heard of it and a waiting cue could stay on. Now `singleFailOpen`: core's move after all, cut
  before the first token standing in it (on a whole square in a fight), when the token is still where the drop found
  it; counted as an error. Test: `group.test` "0.8.2 fail-open: a single drop".
- **[declared] A group drop whose commit threw after its published echo moved nowhere.** The publish chain marked the
  drop committed before `commit`, so its `.catch` returned without failing open. The commit is now guarded and fails
  open, and `failOpen` never re-sends a member this drop already sent (it would walk twice and, in a fight, be charged
  twice: `d.sentIds`). Test: `group.test` "0.8.2 fail-open: a group drop whose commit throws".
- **[declared] The circuit breaker tripped again on the first failure after the GM turned `assist` back on.** The
  session's tallies stayed past the limits; it now counts afresh from each trip. Test: the 0.8.0 breaker test, extended.
- **[declared] A fight walk resumed after a reload in another turn (FR2-09).** The record now carries its turn
  (combat id, round, turn); a walk recorded in one turn stays where it rests in another (`status().group.fightResumed.why`
  "turn changed"), never charging the new turn for the old one's move. Test: `fight-resume.test` "FR2-09".
- **[declared] Tier C on a page in the background waited for arrivals that never came.** A hidden tab draws no frames,
  so a member's movement animation never ends there and the next member stayed where it stood until the deadline.
  An arrival now counts at the server's end of the move when the page is (or goes) hidden, as core's own continuation
  does. Test: `group.test` "0.8.2 tier C on a page in the background".

## 0.8.1 — 2026-11-23

The simulator of Fable's review §5 (`test/sim/`, run by the repo's `scripts/foundry/movement_sim.mjs`: `make foundry-movement-sim SEEDS=10000`; plan §16.9; use-doc
`context/foundry/movement.md`, "The simulator") and the defects its first 2,000 seeds found that are the module's to fix.
Each has a regression in the module's suite (`test/sim/sim.test.mjs`, plus the unit and glue tests named).

- **[declared] SIM-01: a member the plan would set off after the run's deadline stays where it stands.** The timing
  pass's "go last" waits for every walk it meets to be at rest, however long: a reserved walk round the whole map put a
  member's start 24.5 s after the drop. Its wave expired unsent, its reservation told every planner and guard it walked
  then, and the run stayed open until its end timer, 37 s on (seeds 23, 299). `group-core stayPastDeadline`, applied in
  `deliver` (telemetry `wave` reason `pastDeadline`; "Stopped short, way blocked"). Test: `group-core.test` "SIM-01".
- **[declared] SIM-02 / SIM-03: a fight's tier C member is vetted when it sets off, not at the plan.** Tier C starts
  members on another's arrival, seconds after the drop, and does not use the plan's start delays, which were what kept
  them off the walks outside the group: a member set off head-on into another drop's walk in a one-wide corridor
  (seed 14), and later members walked their drop-time way through a token that had come to rest in it since (seed
  156). Now a walk outside the group in its way holds it (the amber cue, re-looked every 250 ms within the deadline),
  and a token standing in its way cuts it before that token on a whole square, or keeps it where it is (telemetry
  `cut` reason `fightStanding`). Tier C still ships off.
- **[declared] SIM-04 / SIM-05: the background tab.** A group whose page was already in the background when the group
  was made (dropped, then alt-tabbed while it planned or published) never had its later waves flushed: they waited on
  the throttled timers and walked into members already at rest (seeds 6, 7, 15). And the flush did not count the first
  wave, which walks from the drop: a flushed member was sent on the heels of a first-wave member (0.36 square apart,
  centres). `flushIfHidden` in `commit`; the first wave is in `group.sent`. In a file through a door the members right
  behind the first wave now stay where they stand rather than walk into it (stopping short beats overlapping). Tests:
  `group.test` "SIM-04 / SIM-05" and the 0.8.0 hidden-tab test, which now also checks the flush is clear of the first
  wave (it was not).
- **Found, not fixed here** (plan §16.9, each with seeds): a stalled or lossy observer draws a fresh move from when it
  handled the update, not when the server applied it; tier C off (the default) walks members through members resting
  in ~half the simulated fights; a player's click-stop of their own member in the GM's group is chosen on the player's
  view; a wave's spacing collapses when the initiator's uplink stalls.

## 0.8.0 — 2026-11-23

The tiered redesign after Fable's xhigh review of 0.7.4 (plan `context/plans/pathfinding-2026-11.md` §16; Joe's
decisions of 2026-11-23). Not yet through its acceptance rounds: tier C ships off.

- **[declared] Tiers, each with its own switch.** A: single-token pathfinding, the ruler, a single click-stop
  (`pathfinding`). B: out-of-combat group drags (`groupDrags`, was `groupMovement`). C: fight group drags
  (`fightGroupDrags`, **off by default**). Tier C off: a fight's group drop is core's move with each member's path cut
  before the first token standing in it, every square a checkpoint, held as one group (a click, a turn change or a door
  cut stops them all; `status().group.last.reason` `fightTier`).
- **[declared] A fight's group move by space (tier C).** Members whose swept corridors never meet set off together;
  every other member sets off on the ARRIVAL of each member before it whose corridor meets its own (core's
  `movement.finished`, then the movement animation), in the order that never walks one through another standing at
  its start or into another resting at its end; with no safe order it stops short. A member still waiting at the
  deadline stays. `sequence-core.mjs`; seeded: 500 fights with random arrival latency, no two members ever meet.
- **[declared] A fight's door cut stops everyone of that group move on the square they hold** (Joe, 2026-11-23): a
  square committed past the door got through. **Deleted:** the undo write (`isUndo`, `undoAcross`, `undoIndex`,
  `undoSquare`), the walk on after a cut (`walkOnAfterStop`), the first-square gate (`guardFirstClear`, S3R3-03/04),
  the re-cut timers (250 / 600 ms, FR1-05), the fight pause guard (`pauseMovement`, `cellHorizon`).
- **[declared] Out of combat a click-stop stops exactly where the token is drawn** (Joe, 2026-11-23: no snap); a token
  across a door's line is carried just past it along its own route (`status().stop.last.pastDoor`). Followers whose
  way passes through it stop short behind it. **Deleted:** `walkOut` and its searches, `walkOnTest`, `following`,
  `nearFirst`, `roomyFor`, the whole-square snap; the rest de-stack (`destack`, `forwardExit`, `gapExit`,
  `settleGroup`, `groupSettle`) and the "too long" remnants (`retryShort`, `restShortOf`, `tooLong` in
  `roundStopped` / `groupStopOne`; the guard's re-route now takes a way only when it fits the move's deadline).
- **[declared] Tokens that start stacked stay stacked:** a rider on its mount, a familiar on a shoulder, a grappled
  pair (circles overlapping by more than a quarter square) walk their leader's way at their offset, in its wave, in a
  plan, in core's move and in tier C; the guard never parts them (`status().group.last.stacked`).
- **[declared] One state machine per move, one 10 s deadline** (`lifecycle-core.mjs`): the queue, a single drag's
  start delay and queue, a wave held for a foreign walker, a fight member waiting for an arrival and the guard's rest
  all end by it (`status().group.runs`). What clocks remain, and why, is in plan §16.4.
- **[declared] Hidden-tab commit:** when the page goes to the background every group this client holds sends what it
  has left at once, each walk cut where it would meet another (`status().group.flushed`).
- **[declared] `racers()` counts only another active user viewing the drop's scene:** the canvas-less headless GM and
  users on another map no longer cost every drop a publish round trip (`status().group.reservations.alone` /
  `racing`; lost races go to telemetry).
- **[declared] Settings consolidated:** world `pathfinding`, client `pathfindMine`, world `groupDrags`,
  `fightGroupDrags`, `assist`. `smoothCorners` and `clickToStop` are folded in (always on); at ready the active GM
  moves a stored `groupMovement` to `groupDrags` and deletes it, and every client drops the folded rows from its
  storage (`status().migrated`).
- **[declared] Two notices only:** "No route there." and "Stopped short, way blocked." (was seven: no route for a
  group, too narrow, yielded, yielded and stays, guard rest, waves dropped). The reason codes go to telemetry; the
  GM still gets a whisper naming a big token stopped before a gap a player dragged it to.
- **[declared] A waiting cue:** a token this client holds back (queued, a start delay, waiting for an arrival, a guard
  yield) wears an amber dashed ring on this client.
- **[declared] Fail-open and a circuit breaker.** A throw while a plan is delivered sends core's move after all
  (`safeDeliver` / `failOpen`; `CONFIG.debug["pentaryn-movement.throwDeliver"]`). After 3 errors or 6 failed plans in
  a session the drag help switches itself off on that client; the active GM's client also turns `assist` off, and the
  GM is told. `assist` back on clears it (`status().assist.tripped`).
- **[declared] Telemetry:** a per-client ring buffer (plans and their time, guard fires, yields, fallbacks, frame
  stalls while moving, lost races, stops, cuts, notices, errors). New API rows `telemetry()`, `reportTelemetry()`
  (a whisper to the GMs) and `fileWrongMove()`, the **Alt+W** key: "that move was wrong" files the last ten seconds as
  a Bug through pentaryn-feedback.
- **Docs:** `context/foundry/movement.md` rewritten for 0.8 (its stale "within a minute" for a reload's waves is 1.5
  s); plan frontmatter, §13 and §14.2 amended, §16 added. `test/regressions.test.mjs`: every round ID a source comment
  cites names a test (16 still PENDING). Corner arcs off for a test: `CONFIG.debug["pentaryn-movement.arcs"] = false`.

## 0.7.5 — 2026-11-23

Final acceptance round 2 (FR2a / FR2b; plan `context/plans/pathfinding-2026-11.md` §15.13). Fixes only.

- **[declared] A fight's door cut puts the member past the shut door back before it (FR2-03, 10 of 10 at 500 ms).**
  Its undo was refused because the squares before the door counted where core would stop the other members being
  cut too (Hero 3's predicted stop on the very square Hero 5 had walked off), so Hero 5 rested past the shut door in
  the corridor. The undo now counts the other cut members where they stand, never where core would stop them; the
  members' claims still keep them apart. `status().group.cut.undoWhy` names what refused an undo.
- **[declared] The wall watch (FR2-04).** The yield guard notes every door shut and wall raised (30 s); a move it
  watches whose way ahead (1.5 squares) crosses one that really stops it runs the door cut again, once per wall per
  move. A held move out of combat resuming after a door shut is cut before the wall (or stays). The cut at the shut
  only sees moves under way at that instant. `status().guard.wallCut` / `resumeCut`.
- **[declared] A mover the guard does not give way to that comes to rest in its way within the look ahead is a
  standing token there from then on (FR2-05).** A later move of the GM's Hero 1 put it after Player8B's Hero 7 in the
  server's order, so neither gave way and Hero 7 walked into Hero 1 at rest (-97 px, 427 ms).
- **[declared] Against a standing token the guard fires at 0.04 square inside touching, not 0.1 (FR2-06 grazes of 5
  to 11 px for 56 ms).** `GUARD.standTol`.
- **[declared] Members a stop left short of their spot go on to it once their group is at rest (FR2-06),** by a
  sliced search round every token, no long detour, never onto a spot another token holds (`status().group.short`).
- **[declared] A fight's walk goes on after a reload (FR2-09 / FR1-06).** Each client records, per tab, the squares
  still to walk of the fight moves it started; after a reload (within a minute, once its scene is drawn) the walk goes
  on from the square it rests on, costed, its first square only when clear (`status().group.fightResumed`). Live on
  BOSS: Hero 4 and Hero 3 walked on from the corridor to room B.
- **[declared] A drop that moves nobody says so (FR2-08):** a plan where every member stays tells the dragger "No
  route there: the group stays where it is"; a drop whose reservation could not be published still goes, without it.
- **A diagnostic for FR2-10** (an uncaught "Cannot assign to read only property '0'" on a player tab, no stack
  captured): `status().guard.errorsSeen` keeps the last five page errors naming this module or a frozen array, with
  where they were thrown. Not reproduced on BOSS.

## 0.7.4 — 2026-11-23

Final acceptance round 1 (FR1a; plan `context/plans/pathfinding-2026-11.md` §15.12). Fixes only.

- **[declared] A fight's door cut never puts a member back on, or walks it through, a square another token holds
  (FR1-02).** The undo of a square past the shut door (S3R1-08) went back to the last recorded square on its side
  whether or not a member had stopped there since, an unanimated jump onto it (-100 px), and the walk off a held
  square was one straight waypoint, committed whole, through whoever stood beside it. The undo now takes the latest
  recorded square on its side nobody holds (claimed at the cut, so no member cut after it takes it), or none
  (`status().group.cut.undoBlocked`); the walk off goes to a square whose straight walk passes no token, a checkpoint
  every square.
- **[declared] A move sent before a door shut but landing after it is cut once it lands (FR1-05).** The cut looked only
  at moves under way at the shut; a later wave sent 30 ms before it was drawn across the shut door. The shut wall is
  looked at again 250 and 600 ms later.
- **[declared] A click-stopped member keeps its place in the server's order (FR1-03, FR1-04).** Its displace and its
  walk out carry `pentarynMovementKeep`, so every client keeps the place its move had: the members of the GM's file
  coming up behind give way to it walking out (they were held to touching and, at 105 ms, caught it, -74 to -77 px).
  A follower later in the order no longer counts against its walk out; the walk out tries squares ahead of it first
  (on a slow tab its 24 ms search ran out on squares back toward the file and it rested in the corridor; now 40 ms).
  `status().stop.last.walkOut` tallies why squares were passed over.
- **[declared] A group drag whose grabbed token's search only ran out is never refused with "No route there" (FR1-07).**
  The way that ignores the tokens is finished in slices too; still not found, the drop is a budget fallback.
- **[declared] A hidden member's move is sent on its own, with none of this module's keys (FR1-11),** and a drop with a
  hidden member publishes its reservation on a member every client may see.
- **[declared] The "page reloaded before the last of your group set off" notice is shown a moment after ready and kept
  until dismissed (FR1-10).** At ready on a player's reload it was never drawn.
- **[declared] Stopping a tween never splices a frozen animation chain (FR1-12, defensive).**

## 0.7.3 — 2026-11-23

Stage 3, round S3R3 (plan `context/plans/pathfinding-2026-11.md` §15.11). Fixes only.

- **[declared] A click-stopped member in a corridor walks out round the room wall's corner (S3R3-02, S3R2-01 not fixed
  in 0.7.2).** The A-B corridor ends in the two rooms' walls, so from inside it the only roomy squares a straight walk
  reaches lie on the corridor's own line, all of them on the walk of the GM's members filing up behind; 0.7.2 asked
  straight walks only and still left Player8A's Hero 2 on (11,5) in 7 of 7 runs. The stop now also asks the squares
  round the corner: a short route from the near square (walls, open doors, round every token), at most 6 squares, its
  whole walk tested against the walkers. A walker coming up behind along the way it walks out by is a file, held to
  touching without the latency buffer; a head-on or crossing way keeps the buffer (S3R1-03). Never a jump.
- **[declared] In a fight no move is sent while its first square is not clear (S3R3-03, S3R3-04).** Core sends a
  fight's first square with the move, so the runtime guard could not withhold it: after a door cut Hero 4's walk on
  to the square before the door went while Hero 3 still stood on it (-65 to -67 px for 264-282 ms, 3 of 3), and in
  combat six a later wave on time walked into a member paused behind the plan (-20 px for 264 ms). A door cut's walk
  on, a later wave and the guard's re-route now ask the guard first (`guardFirstClear`), wait while it is not clear
  (50 ms looks, 4 s at most) and then stay where they are (`status().guard.gated`, `status().group.cut.gaveUp`).

## 0.7.2 — 2026-11-23

Stage 3, round S3R2 (plan `context/plans/pathfinding-2026-11.md` §15.10). Fixes only.

- **[declared] A click-stop in a one-wide corridor walks out the other way when the way back is walked (S3R2-01).**
  0.7.1's fallback for a walk on that would meet a walker was the nearest free square, and in a corridor that is the
  corridor: Player8A's stopped Hero 2 rested on (11,5) in 7 of 7 runs and every member behind it stopped short in
  room A. The stop now first takes another roomy square in reach whose walk on meets nobody (out ahead, the way the
  file walks), and only with none the nearest free square (`status().stop.last.walkOnAround`, `walkOnBlocked`).
  Never a jump: a far square it cannot walk to is not taken.
- **[declared] A whole-group stop never reads its own members as walkers (S3R2-04, regression in 0.7.1).** The
  members the same click stops were still drawn walking until their turn, so the clicked one's walk out of the
  corridor "met" them and it rested at (11,5). The test now leaves every token of the stop out.

## 0.7.1 — 2026-11-23

Stage 3, round S3R1 (plan `context/plans/pathfinding-2026-11.md` §15.9). Fixes only.

- **[declared] A mover is read on the leg it walks (S3R1-01).** `routeAhead` put a token drawn up to half a square
  past a corner, or on an arc's later chord, back on a point it had already passed (the 0.5 "as near" was compared
  with the best so far), so its way ahead began with a leg back across the corner: the guard saw members filing
  round a corner at touching come 0.10-0.13 inside each other and stopped them on 10 of 10 clean funnels, and the
  planner read walkers the same way. The nearest leg now wins, the earlier only when as near within 0.05 square.
- **[declared] Two movers already inside each other must come apart (S3R1-03).** The guard held such a pair only to
  "never closer", so a stopped member walking on beside a GM member stayed 77 px inside it for 1.6 s. The one that
  gives way now stops unless its walk opens the gap within 150 ms (`status().guard.inside`).
- **[declared] A click-stop's walk on never goes through a walker (S3R1-03).** A player's stop of its own member in the
  GM's group walked on to a roomy square out of the corridor, head-on through the GM's members filing up it. When
  that walk meets a token walking now or a reserved walk, it stops on the nearest free square instead
  (`status().stop.last.walkOnBlocked`).
- **[declared] A token another user moves is theirs (S3R1-06).** A move of a guarded token made by another user (a
  player stopping their own member) lets the guard go of it, and a re-route, a resume or a step still in hand is
  not written (`status().guard.overridden`).
- **[declared] Never at rest on a door's line, never through a doorway (S3R1-05, S3R1-02).** A guard stop drawn across
  a door's line steps off it on its own side (`offDoor`), the 8 s rest moves off one too, and a step aside never
  crosses a door's line nor lands on, or passes through, any token where it is now (a mover too; one the guard
  stopped earlier in the same tick counts as standing).
- **[declared] No re-route round the dungeon (S3R1-04).** A 3 s re-route much longer than the way it replaces (the
  planner's `detourTooLong`: more than 4 squares or half the way longer) is not taken; it waits on and rests at 8 s
  (`status().guard.detour`).
- **[declared] A reload late by more than 1.5 s sends no old waves (S3R1-07).** After the GM's 10+ s reload the later
  waves walked a stale plan; past `RESERVE.overdueMs` (when every other client has dropped those reservations) the
  members stay where they are and the dragger is told (`notify.wavesDropped`, `status().group.resumed.dropped`).
- **[declared] A fight's door cut never leaves a member past the shut door (S3R1-08).** A square under way past the
  door, or a next square already sent when it shut, is undone as core's `revertRecordedMovement` writes it (back on
  the last recorded square on the near side, the history cut there, unanimated, its tween stopped where drawn
  first), so dnd5e charges only the squares walked (`status().group.cut.undone`).

## 0.7.0 — 2026-11-23

Overlap redesign, stage 3 of 3: the runtime yield guard (plan `context/plans/pathfinding-2026-11.md` §15.8). A
safety net under the plans, never the plan: every firing is logged, because a firing is a planner miss.

- **[declared] Each client guards the moves it started, a moment ahead.** On the canvas ticker (after the frame's
  tweens; out of combat every 50 ms, in a fight every frame while a square is walked; nothing while the client moves
  nothing), each of its movers' ways is looked at 450 ms ahead (a fight: the rest of its square and the next, two
  when the next is a doorway) against the tokens nearby (a bucket grid: O(tokens nearby) a check). It fires when
  the way would come inside touching by more than 0.1 square of one it gives way to.
- **[declared] Who gives way.** Everyone gives way to a token standing still. Of two movers, the one later in the
  server's order (a reservation's arrival, or an unreserved move's; within a plan, the plan's own order) gives way,
  never the earlier, so two clients never both yield for one meeting. A hidden mover gives way to a player's (that
  player cannot see it); a player's guard never counts a token hidden from it. In a fight a square already under way
  (core cannot stop inside a square) is kept clear by everyone, and a paused move stands where its square ends.
- **[declared] How it gives way.** Out of combat: stopped where it is drawn (an unanimated write, as a click-stop,
  marked `pentarynMovementGuard`), stepping back to the nearest spot off a higher mover's way when it would stand in
  it, then the rest of its way again (re-published) once that way has been clear for 150 ms. In a fight: core's
  `pauseMovement` holds back the next square's continuation (free; never a displace), so it waits on a whole square,
  before a door rather than in it, and the same movement resumes, dnd5e charging the squares walked. A wait that
  goes on again waits for every mover's way (and in a fight for an earlier paused one's: of two held, one goes first).
- **[declared] Nothing waits forever.** 3 s after its first yield it re-routes once round what stands (and the mover
  it gave way to), however long; at 8 s it rests on the nearest free spot (in a fight, the square it is on) with a
  quiet notice ("… waited too long for the way to clear: it stops here"). A click on a token it holds, or any stop it
  did not make, lets go. The guard's own moves keep the move's place in the order.
- **[declared] `status().guard`:** watching, held, ticking, fired (standing / movers / late), resumed, rerouted
  (noRoute), rested, aside, cancelled, errors, perf (ticks, checks, maxMs, over4, over16) and the last firings.
- Each move's place in the server's order is kept by the reservation registry (`reserve-core` `claim` /
  `priorityOf`); a reservation's members are on the wire in the plan's own timing order.

## 0.6.3 — 2026-11-22

Overlap redesign stage 2, round S2R3 (fixes only; plan `context/plans/pathfinding-2026-11.md` §15.7).

- **[declared] S2R3-01: a hidden token that stepped aside goes on round the tokens standing in its way.** Its way
  on from the aside spot was core's (the drag's search with no tokens to keep clear of), so the GM's hidden Hero 7
  walked back through standing Hero 5 (-58 to -60 px, 3 runs of 3). The way on now keeps clear of every token
  standing outside it, however long, searched in slices; with no way round, core's way as far as it meets none of
  them. The step aside itself is never a straight line through a standing token either.
- **[declared] S2R3-02: a movement that starts on a stalling page is never drawn ahead of its walk.** Core adds a
  tween's ticker listener between frames, so its first frame is credited the whole interval since the frame
  before, time from before the tween existed. On the loaded Mac (415-684 ms frames) a member whose move arrived
  just after a stalled frame was drawn up to that much ahead, onto the member before it (-51 px for 2.3 s), while
  the members already walking were credited only their own time. The `CanvasAnimation.animate` wrap now credits a
  fresh movement tween's first frame at most the wall time since it began (chained links and other animations as
  core runs them). `status().stop.firstFrames` counts the cuts.

## 0.6.2 — 2026-11-22

Overlap redesign stage 2, round S2R2 (fixes only; plan `context/plans/pathfinding-2026-11.md` §15.6).

- **[declared] S2R2-01: a member is never left short for another move's walk without queueing for it.** Two causes,
  one outcome (the grabbed Hero 5 of a second group stayed at its start with "Another move is still in the way: it
  stays where it is" while the corridor was clear). The timing pass held a member of the drop's first wave to "one
  batch, no latency buffer" against another move's walk (the drop's wave 0 is its own batch, never theirs), so it set
  off at once where settle keeps the 0.75-square buffer, and settle cut it back or left it standing; now a walk of
  another move keeps the buffer in every wave, and the member waits its start delay instead. And the queue read the
  walks again at delivery and asked only whether a short member's whole way from now meets one: a member cut for a
  walk it meets only at the delay the timing gave it, or for one gone while the plan ran (a loaded tab draws 300 ms
  frames between a plan's slices; a reserved walk counts until 1 s past its end), was committed short. Settle now
  says which walk a member gave way to (`walks`), and the drop queues for it (one delay step when it is gone), then
  plans again; the 8 s budget still bounds it.
- **[declared] S2R2-03: a hidden token the GM drags never waits where a player's walk passes.** The players'
  planners cannot see it, so they plan through it; the design's rule is that the GM-side mover yields. A hidden
  token whose single drop has to wait (a start delay or a queue) at a spot a walk this client reads will pass through
  steps aside first, to the nearest free spot no walk passes (a short straight step clear of walls, on open floor,
  clear of tokens at rest and of reserved ends), finds its way to the drop point again from there and goes on
  waiting or goes; while it queues it looks again every 500 ms. Out of combat only. `status().group.reservations.aside`
  counts the steps. A hidden token that nobody moves still stands where it is (Joe's call: moving it is a gameplay
  decision).

## 0.6.1 — 2026-11-22

Overlap redesign stage 2, round S2R1 (fixes only; plan `context/plans/pathfinding-2026-11.md` §15.5).

- **[declared] S2R1-01 / S2R1-03: a drop queues again while its way is still taken, 8 s in all.** A drop that queued
  behind a reserved walk planned once more when that queue was over and went with whatever that plan gave. A walk
  runs late (a wave held for another, a member that set off late) or another move is reserved meanwhile, so the
  second group in the corridor stood at its start with "No route there", and the GM's single drag behind a group
  stayed with no reason given. Now it queues again while a walk is in its way, RESERVE.queueMs (8 s) in all
  (`queueNext`), then goes as far as it meets nothing. The notice after a queue says what happened: "Another move
  is still in the way: it stops short" or "…: it stays where it is" (new), never "No route there".
- **[declared] S2R1-02: a plan's route searches run in slices.** A route search was the one step of a group plan
  that never yielded: up to 250 ms each (a search with no way round the tokens it keeps clear of explores the whole
  map), two or three in one slice, so every token on the tab froze for 300-870 ms while two groups moved. Every
  search of a plan now yields between its 8 ms slices (`routeSliced`, the same cap and the same answer).
  `status().group.perf` counts the plan's slices, the longest, and those over 50 ms, so a stall can be told from
  this module's work or not.

## 0.6.0 — 2026-11-22

Overlap redesign, stage 2 of 3: server-ordered reservations (plan `context/plans/pathfinding-2026-11.md` §15.4).

- **[declared] Every move reserves its whole plan, in the server's order.** A drop's reservation (every member's walk,
  its later waves and their start delays) rides a token update (`pentarynMovementPlan`); every move names it
  (`pentarynMovementRid`). Every client keeps the reservations it receives in arrival order, which is the server's
  order, and the later one yields. A reserved token's own move sets it off (and fixes its clock on that client), a
  fight's next square keeps it, any other move or a stop drops it; one overdue to set off, or long at rest, expires.
- **[declared] Every planner reads them, single drags included.** A group plans round the reserved walks in time (a
  start delay, a re-route, another spot) and never rests where one ends; a single drag takes the smallest start delay
  that meets none (up to 3 s). Repairs keep off where reserved walks end.
- **[declared] Publish first, decide at the echo.** With another user online a drop publishes its reservation first
  (an empty `diff: false` update of the grabbed token, as core's own stop relay) and moves when it comes back: a
  reservation that came back before it, that it had not read and that it meets, makes it the later one, and it plans
  again round it (twice at most). No echo in 1.5 s: it waits 150 ms and goes (the commit fallback). Alone on the
  table nothing waits: the plan rides the first wave.
- **[declared] Queue rather than stop short.** A drop whose member would be cut short by a reserved walk (a one-wide
  corridor walked the other way) waits at its start until those walks are at rest, at most 8 s, and plans again
  once; then it goes as far as it meets nothing ("Another move is still in the way" for a single token).
- **[declared] Stops and door cuts re-publish.** A stopped token's reservation goes on every client; a walk-on after a
  stop, a group's walk round a stopped member and a door cut's walk to its square carry their own reservation. A
  wave whose walk was changed at send (a door shut since) no longer names the old one.
- **[declared] Hidden tokens are never in a reservation**; a player's planner reads only the tokens it counts (what it
  sees, its own, its party). `status().group.reservations` (live, counts, the last race); `status().group.last` adds
  `reserved`, `queued`, `delay`, `raced`.
- New pure core `reserve-core.mjs` (wire, registry, race, delay, queue, cut) and `reserve-adapter.mjs` (the registry
  each client keeps); hooks `updateToken`, `moveToken`, `stopToken` appended (golden `hooks.json`); tests
  `reserve-core.test.mjs`, `reserve-props.test.mjs` (seeded: a later or racing plan never meets an earlier one, a
  single drag waits or is cut, liveness), glue cases in `group.test.mjs`.

## 0.5.2 — 2026-11-22

Overlap redesign stage 1, round S1R2 (fixes only; plan `context/plans/pathfinding-2026-11.md` §15.3).

- **[declared] S1R2-01: the ruler of a single drag shows the way it will walk.** While one token is dragged alone, its
  route already goes round the tokens standing in its way (the way its drop walks), in a fight and out of one, so the
  ruler shows that way and its cost. Before, the ruler drew core's line through them (40 ft) and the drop then walked
  the way round (90 ft charged in a fight).
- **[declared] S1R2-04: a single drag in a fight whose way is blocked by tokens walks up to the first one** and stops
  there, on whole squares, with "No route there". Before, a slanted line had no whole square on it before the first
  token, so it was cut back to its start and did not move.
- **[declared] S1R2-03: a big token cut where its body stops fitting rests on whole squares** when no whole square lies
  on the line it walked (a Large dragged alone on a slant toward a one-wide door rested at (8.91, 4.36)): the nearest
  whole square its body fits, one short step on from there.
- **[declared] S1R2-05: members that start just touching never brush each other** as one leaves (held to 0.02 square,
  was 0.15: a member walking past the grabbed one waiting beside it grazed it by 11 px). Members that start
  overlapped keep the 0.15.
- Not changed (stage 2 / by design): two players dragging at the same moment (S1R1-08); a player's own click-stop
  snapping to the nearest free square centre, up to about 0.7 square in one frame (S1R2-02, Joe's decision 2).

## 0.5.1 — 2026-11-22

Overlap redesign stage 1, round S1R1 (fixes only; plan `context/plans/pathfinding-2026-11.md` §15.2).

- **[declared] S1R1-04: a single drag in a fight goes round the tokens standing in its way** too, on whole squares, at
  the cost of the squares walked (before, a fight kept dnd5e's own path, which walks through an ally: -98 to -100 px
  through three standing heroes). No way round them: it stops before the first, and the dragger is told.
- **[declared] S1R1-01: nobody walks round the whole dungeon for a spot.** A member whose way passes the start of a
  member timed after it (still standing there) is re-planned round it first; before, the two blocked each other, and
  the one left over took another spot by a 30 s walk through the maze and room C. Another spot is never taken by a way
  round that is a detour nobody wants (the H2-02 rule); with none, it stops short.
- **[declared] S1R1-03: a fight re-plans round the others too.** In a fight there was no re-plan round members
  already at rest, so two members that each needed the other gone first both stayed home and the grabbed one read "No
  route there"; the re-plan is on whole squares, at the squares' cost. A fight's routes are now timed square by square,
  as they are walked (a corner's straight line ran up to half a square off the squares walked).
- **[declared] S1R1-02: a member cut short never rests in a one-wide corridor or a doorway** (back to open floor, or
  where it stands); and the grabbed one's drag route is no longer reused when it grazes a token standing beside a
  corridor's mouth by a hair (the cause: it was then cut back into the corridor).
- **[declared] S1R1-05: in a fight a member a stop leaves in a one-wide corridor walks on along its own way** to the
  first free square out of it, counted; the rest check never displaces in a fight any more (a 200 px jump back, free).
- **[declared] S1R1-07: a Large cut short rests on whole squares** (it rested off the grid, 12 px across a door line).
- **S1R1-09:** `status().stop.last` keeps the click's record; the group's follow-up stops of late waves count on it
  (`late`).
- Not in this round (stage 2, by design): another client's simultaneous drag (S1R1-08) and the door-cut re-settling in
  a fight (S1R1-06).

## 0.5.0 — 2026-11-22

Overlap redesign, stage 1 of 3: hard obstacles (plan `context/plans/pathfinding-2026-11.md` §15).

- **[declared] Tokens standing in the way are hard obstacles everywhere**: every group route keeps round them, in a
  fight too (before, a fight ignored them); rest slots keep clear of them; and the timing pass counts them, so a
  member is never timed through one. A single drag out of combat goes round them however long the way round is.
- **[declared] No way back to walking through.** The "too long" fallback (a way round longer than 4 squares or half
  the direct way was swapped for the way through the crowd) and "relax" (a member that could not be timed clear was
  allowed to brush past others) are gone. A member with no route round them walks the way that ignores them only as
  far as it is free, and stops there; the grabbed one stopped short tells the dragger "No route there". Last,
  every walk is checked against every other walk, every standing token and every token walking now, and anything
  that would still meet one is cut back to where nothing meets it, or does not move (`level` `cut` / `stay`).
  Stopping short beats overlapping.
- **[declared] A Large that fits no door gets its own way** (as far as its body fits, then as far as that is free)
  and never walks core's path; the GM is told it does not fit, as before. No group member is left to core any more.
- **[declared] A group drop left to core** (out of planning time, a throw, Ctrl waypoints) **stops each member
  before the first token standing in its way**, not only before the others' rest spots (not for ghost or the
  unconstrained tool, which pass through on purpose).
- **[declared] The latency buffer is 0.75 square (was 0.25)**, about 125 ms at 6 squares/s, above the tunnel's
  11–105 ms spread. It is now a lag along each walker's own way (either drawn up to 0.75 square ahead of or behind
  itself), not a flat ring: one walking in another's wake keeps it, neighbours abreast do not need it. A pair that
  starts in contact is let go of the "brush as one leaves" allowance once it is in contact no longer (it was held
  until 0.25 square apart, which at 0.75 would have let a follower ride in contact the whole corridor).
- **[declared] Packed rooms:** rest spots keep 0.2 square apart (was 0.1), so a member can walk between two rows
  of others at rest; the grabbed one dropped in a door's mouth onto open floor goes last and everyone else rests past
  it; a member walled in by those already resting round its spot takes the nearest other free spot it can reach;
  a queue through a door may wait up to twice the delay cap past the go-last point.
- `status().group.last`: `cut`, `stayed`, `short` (ids) replace `relaxed`; `planGroup()` members carry `short`, and
  `level` is 0 / 1 / 2 / `short` / `cut` / `stay`.

## 0.4.12 — 2026-11-22

Hard-case round HX-1 (fixes only).

- **[declared] HX1-01: routes, spots and timing count every token standing or walking in the way, not only the
  ones this client can see now.** `Token#visible` is the viewer's vision, and a GM controlling a member sees
  only what that member sees: a token past a wall or round a door's corner was left out, and members were walked
  through it (-29 to -99 px: single then group, two-way traffic, the crowd from the SW corner). A GM counts every
  token; a player every token the GM has not hidden that it sees, owns or that is friendly (never an unseen
  hostile). The grabbed one's drag route (it routes round walls only) is not reused when it passes through a token
  that stays: its route is searched round it, and a member's search round them that only ran out is finished in
  slices still round them, never redone through them. When a player stops its own members of the GM's group, the
  sending client no longer walks that player's other members round the stop (the player stops them: the two writes
  raced and one was left drawn off its square); its own members keep round every stopped one, not only the last,
  also one whose walk round an earlier stop was not sent yet; a stop walked on to its square (HX1-07) names that
  square in its update (`pentarynMovementStopAt`). A held drawn position (H4-06) is let go when its time runs out or
  another user moves the token, and it is then drawn where the server has it (it stayed 25 px off for good).
- **[declared] HX1-02: a later wave waits while a token outside its group walks through its way** (looked at
  every 250 ms, 8 s at most; `status().group.held`): two players dragging opposite groups through a one-wide
  corridor at the same moment each planned before the other moved, and their waves walked into each other.
- **[declared] HX1-06 (seen in the harness): a later wave never goes sooner after the waves before it than
  planned.** A page frozen past several waves' times (core's fog extraction stalls a player tab 150-650 ms; the
  harness froze for seconds) sent them all in one tick, and members meant to file through a door 150-450 ms apart
  set off together, drawn on top of each other; a late wave now shifts those after it (and the group's end).
- **[declared] HX1-05: a member with no route (a Large that fits no door) sets off after those whose way it
  crosses have passed**, standing at its start until then: it walked through Hero 1 still waiting at its start
  and stood in the door's mouth (-113 px for 3-4 s).
- **[declared] HX1-03: a group clicked to a stop in a fight leaves nobody at rest in a one-wide corridor or
  doorway** when a free square in the open is within 3 squares (a displace, free), as out of combat.
- **[declared] HX1-04: in a fight, the member crossing a door's line when the door shuts finishes that square
  and goes no further** (it walked on 8 squares into the far room). Its square's cost is spent, so it rests on
  the far side of the door, not back before it.
- **[declared] HX1-07: a click-stop square more than 0.75 square from where the token is drawn is walked to**
  from the nearest free square, not jumped to (a corridor member sent out to open floor jumped 191-200 px).
- **[declared] HX1-08: a door cut out of combat that puts a member back on the square it is drawn in rests it on
  that whole square**, not off the grid where it was drawn, and a cut member's last leg keeps off the squares the
  members cut before it took (one walked past another already resting by the door, -22 px).

## 0.4.11 — 2026-11-22

Hard-case round H-4 (fixes only).

- **[declared] H4-01: a route search that only ran out of time is never read as "no route there".** The group
  plan searched the grabbed token's route with a 250 ms cap and took "not found yet" for "no way": the first drag
  after a reset was refused (`anchorNoRoute`) where the identical retry planned. It now finishes that search in
  slices on the plan's budget (also for a member, which went to core before). A refusal records `last.dest`.
- **[declared] H4-01: a Large whose drag search had not finished walks as far as its body fits along the found
  way** (the finished drag's own path), not the drag's one-square line ("5 ft").
- **[declared] H4-02: the group plan's budget is 2.5 s of its own work and 5 s on the wall clock** (1.2 / 2.5 s):
  a slow tab fell back to core 3 of 5 times on H7b and core parked members in the one-wide corridor.
- **[declared] H4-03 / H4-04: a group sets off only once a token outside it walking through its way has
  passed** (the rest of that walk from where it is drawn is in the plan's timing): two-way traffic and a group
  dragged after a single token went through each other. A member that has to relax sets off once those it meets
  are at rest, never into one walking (two of a group of 8 went through the door on the same frame). A single
  drop whose way round a standing token is still being searched at the drop goes once the search is done (it
  walked straight through the token, -75 to -85 px).
- **[declared] H4-06: a stopped or cut token stays drawn where it stopped until its displace reaches the
  server** (at most 1.5 s): anything that re-prepared it meanwhile drew it at its old destination for a round
  trip and back (780-1402 px; through the wall at a door cut).
- **[declared] H4-09: a whole group stopped at once keeps out of a one-wide corridor or doorway** when there is
  room within 3 squares, as a player's partial stop already did.
- **[declared] H4-14: the drag-help (and ghost) button's tooltip closes when the controls redraw.**
- **[declared] `status().stop.last`:** the last click-stop on this client and what asked for it (`via`: click,
  board, door, api), for the next round (H4-03: a token stopped with no record of why).

## 0.4.10 — 2026-11-22

Hard-case round H-3 (fixes only).

- **[declared] H3-01: a group clicked to a stop in a fight never rests two on one square.** Each member finishes
  the square it is in (spent movement stays exact); two that walked close finished on the same square. Once at
  rest the later of a pair steps to the nearest free whole square (a displace: free), the rest check looking up
  to 3 squares round it (a file of six in a one-wide corridor). Also after a GM's `stopOwn` of a player's group.
- **[declared] H3-05: a wave still on its way to the server when its group is clicked to a stop stops too**, as
  soon as it moves (over the tunnel, a click 950 ms after the drop let two members walk on into the far room).
  A player's stop of its own members, with members it does not own still walking, puts each on the nearest free
  whole square out of any gap narrower than two of it (a one-wide corridor, a doorway) when one is within 3
  squares, so the others can pass.
- **[declared] H3-03: never the long way round in a group plan.** A member re-planned round the others' rest
  spots, or round the tokens standing in the way, takes that way only when it is at most 4 squares, or half the
  direct way, longer (the H2-02 rule); else it waits its turn for the direct way (83 squares round the dungeon
  for a 9-square walk through the door before).
- **[declared] H3-04: a single drop released before its route search finished is no longer lost.** The search
  finishes in timer slices after the drop (as long as a drag's own search may run), then the token takes the
  route; with no way there it stays and the dragger is told "No route there" (decision 7).
- **[declared] H3-13: a single drop lands where the pointer comes up** (out of combat, pathfinding on), as a
  group drop has since H2-08: core's drag destination can lag the pointer by 1-3 squares. The single drop into
  rock on the Mac (H3-08, core/single, moved to the nearest square) was that lag; it now refuses as on BOSS.
- **[declared] H3-09: a group drop whose Large member has no way its body fits gives the "does not fit" notice**
  (and the GM whisper for a player), as a single drag does.
- **[declared] H3-16: `status().group.stopped` records click and API stops** (`why: "click"`, or `"gm"` for a
  GM's stop of a player's group in a fight; `members`, `whole`), as it already did for a turn change.

## 0.4.9 — 2026-11-22

Hard-case round H-2, and Joe's decisions of 2026-11-22.

- **[declared] A click on one member stops the whole group (decision 3; reverts 0.4.8's H1-05).** When the
  clicker owns every member; otherwise only the clicker's own members of it stop, and the client that sent the
  group walks the others round them. Every client learns a group's members from its moves' update option
  (`pentarynMovementGroup`); the sender walks the rest round a member another user stopped. A GM's stop of a
  player's move in a fight (`stopOwn`) stops that player's whole group too.
- **[declared] Out of combat a click-stop puts the token on the nearest free whole square (decision 2):** never
  across a door's line or a wall, never on another token or on a square another member of the same stop took.
- **[declared] No route there: nothing moves (decision 7).** A single drop with no way there does not move at
  all (it walked to where its way ended), a group stays where it is with the grabbed one too, and the dragger
  alone gets a short warning ("No route there"). The drag's own path is confirmed by one search first: it can
  be short only because its search was still running at the drop (H2-12: a false "no way" on a reachable maze
  drop), and then the drop takes the confirmed route.
- **[declared] A Large (2×2 and up) that fits no way through stops before the gap and the GM is told
  (decision 8)**: a warning to the dragger, and a whisper to the GMs when a player dragged it. A wider way round
  is taken when there is one (its arcs refused where they bend its body into a door frame, H2-01), and where it
  stops its whole body is clear of the frame (H2-11: 21-27 px in it).
- **[declared] The GM's drag-help switch (Token controls, route icon; world setting `assist`).** Off, every
  drag is plain Foundry dragging for the whole table: no path round walls, no group plan, no single-drop
  routing. Pathfinding and Group movement keep their own values for when it is on again.
- **[declared] H2-01: a Large in a group gets a whole-square spot** (a hex spot put its centre 32 px off the
  middle of the 2-wide double door, and its route was refused), and the route lattice is anchored on the grid
  for an off-grid goal, so routes run down the middle of doors and corridors (H2-14: fewer door-frame cuts; a
  smoothed step never takes its body over a wall end out of combat).
- **[declared] H2-03: a drop onto a token in a full room** sends the grabbed one to the nearest open spot it can
  walk to, open floor before any gap (it was parked in the one-wide connector, or on the Large).
- **[declared] H2-04: group planning on a slow tab** shares step costs and conflict answers between passes and
  yields between members (a six-member funnel spent 650 ms in the timing passes and fell back to core).
- **[declared] H2-02: no marathon detours.** A way round a stopped member longer than the way left by 4 squares
  (or half of it) is refused; the member stops short of it on open floor instead, never in a one-wide gap.
- **[declared] H2-07 / H2-09: a single drag out of combat goes round a standing token**, and one dropped on
  another token takes the nearest clear spot (they stacked, −100 px).
- **[declared] H2-07: a press on a door's icon** stops a moving token within 0.9 square of it (was 0.4) and
  leaves the door alone.
- **[declared] H2-08: a fast flick** whose last pointer move core skipped is planned to where the pointer came
  up, not to core's stale destination in the rock.

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
