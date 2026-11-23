---
title: Drag movement — pathfinding, group drags, click to stop
status: active
last_modified: 2026-11-23
tags: [foundry, module, pentaryn-movement, movement, pathfinding]
---

# Drag movement (pentaryn-movement)

**Read this when:** a dragged token takes a strange route or will not go round a wall; several tokens dragged together overlap, jam in a door, or end up on top of each other; a moving token will not stop when clicked, or stops in the wrong place; the movement spent in a fight looks wrong after a stop; a group drag "did nothing for a moment"; or the drag help switched itself off. **Not this file:** ghost movement and owned-on-top, the module's code, settings table and API → [`../../foundry/module/pentaryn-movement/README.md`](../../foundry/module/pentaryn-movement/README.md) · how it was designed, the acceptance criteria and the live play-test list → [`../plans/pathfinding-2026-11.md`](../plans/pathfinding-2026-11.md) (§9, §12, §16 for 0.8).

## At the table

There is nothing to learn: drag, and it works out the rest. Since 0.8.0 it ships in three tiers, each with its own GM switch (*Settings → Pentaryn Movement*); a tier that has not passed its acceptance rounds ships switched off.

| Tier | Setting | Default | What it does |
|---|---|---|---|
| A | `pathfinding` (+ each player's `pathfindMine`) | Everyone | one token: the ruler goes round walls and standing tokens, the drop walks and charges what the ruler showed; click to stop |
| B | `groupDrags` | on | several tokens out of combat: each its own way to its own spot, filing through doors |
| C | `fightGroupDrags` | **off** | several tokens in a fight, kept apart by space (below). Off: core's move, each member cut before the first token standing in its way |

1. **One token past a wall.** The ruler goes around it the shortest way (open doors only, round tokens standing in the way and costlier terrain, a big token only where it fits), corners rounded where that costs nothing. A player's drag only routes round walls that player has seen, and only over ground that player has explored or can see. A route never uses a secret door and never crosses a region with a Teleport Token (a pentaryn-portals scene link) or Change Level behaviour unless the drag ends or starts inside it. No way there at all: nothing moves, "No route there."
2. **Several tokens at once, out of combat** (box-select or Shift-click, then drag one). The one you grab lands where you drop it (on another token: the nearest clear spot it can reach). The others each walk their own way to their own spot around it. On open ground they set off together and keep their shape; where routes meet (a door) they set off in turn and file through. At rest no two overlap (tokens are circles: touching is fine). **Nothing walks through a token to get somewhere:** a token standing in the only way is a wall; the members walk as far as the way is free and stop there, "Stopped short, way blocked."
3. **Two people dragging at once.** Every drop, a single token's too, reads the moves already reserved and the later one yields: it waits a moment at its start, takes another spot, or queues until the way is clear. A drop publishes its plan before it moves only when another user is **viewing the same scene** (0.8.0; the headless GM, which has no canvas, never counts), so most drops on BOSS set off at once. A runtime guard on the dragger's client watches each move a moment ahead, out of combat, and has the later mover give way.
4. **A fight, tier C on.** Members whose swept corridors never meet set off together; any other member sets off on the **arrival** of each member before it whose corridor meets its own (an event, never a clock). The order is the one that never walks a member through another standing at its start or into another resting at its end; where no order is safe, it stops short. Tier C off (the default): core's move, each member cut before the first token standing in it, every square a checkpoint, still one group for a click.
5. **A long detour you did not want.** Click the moving token (a token you dropped yourself: once it has moved 400 ms; one someone else set moving: at once): out of combat it stops **exactly where it is drawn** (Joe, 2026-11-23); one with its body across a door's line is carried just past the line along its own route. In a fight it finishes the square it is in, so the spent movement is exactly the squares walked. A click on one member stops the whole group; when the clicker does not own every member, only the clicker's own stop, and the others **stop short behind them** (no re-route). A click over a door's icon stops the token under it and leaves the door alone.
6. **A door shuts while tokens walk to it.** Out of combat each stops on its own free whole square before it, the nearest to it choosing first. **In a fight everyone of that group move stops on the square they hold** (0.8.0, Joe): a square already committed past the door means that token got through. Nothing is undone and nothing walks on afterwards.
7. **Stacked tokens stay stacked** (0.8.0): a rider on its mount, a familiar on a shoulder, a grappled pair (tokens whose circles start overlapping) walk their leader's way at their offset, in its wave. Nothing at rest is moved off anything afterwards.
8. **The GM's drag-help button** (Token controls, the route icon; world setting `assist`): one click turns pathfinding and group drags off for the whole table; click again to bring them back. Click to stop keeps working.
9. **Ghost on, or the GM's Unconstrained Movement tool:** straight lines through walls, the group keeping its shape.

**One clock per move (0.8.0).** Every wait a move can have (the plan's budget, a queue, a start delay, the guard's yield, a fight member waiting for the one before it) ends by that move's one deadline, 10 s after the drop; a token still waiting then stays where it is, "Stopped short, way blocked." A token held back wears an **amber dashed ring** on the dragger's screen, so nobody drags it again.

**Two notices only.** "No route there." (nothing moves) and "Stopped short, way blocked." (it moved as far as it could, or a wait ran out). Why, exactly, is a reason code in `game.pentaryn.movement.telemetry()`.

**Fail-open and the circuit breaker.** An exception inside a move sends core's own move (cut before standing tokens) and is logged. After 3 errors or 6 failed plans in one session the drag help switches itself off on that screen; on the GM's screen it also turns `assist` off for the table, and the GM gets a notice (a whisper when it was a player's screen). A reload, or the GM turning the button back on, clears it.

**"That move was wrong."** Press **Alt+W** (rebindable in Configure Controls) right after a bad move: the last ten seconds of that screen's drag telemetry are filed as a Bug through pentaryn-feedback, for `feedback_next`.

## Out of combat vs in a fight

| | Out of combat | In a started combat (the token's combatant) |
|---|---|---|
| Path | free-form and smooth, arcs at corners | on the grid: no arcs, a checkpoint at every square |
| Group spots | packed round the drop point (a hex pattern) | whole squares round the drop point |
| Group timing | start delays, waves, the reservations, the runtime guard | tier C: by space (together, or once the one before is drawn far enough ahead, or on its arrival); tier C off: core's move, cut before standing tokens |
| Tokens standing in the way | routes go round them; none rests on one; no way round: stops short | the same, on whole squares; the ruler already shows that way and its cost |
| Runtime guard | stops where drawn, walks on once clear; 3 s: one re-route; rests by the move's deadline; only moves the module drove (a drag, or a move with its options): a macro's or MCP's `update({x, y})` goes as core moves it | each next square of a move this client drives (a drag or the module's) is not sent into a token standing still here (0.8.3, `preMoveToken`): the token stops on the square it holds, "Stopped short" |
| Click to stop | exactly where drawn (a displace: free, recorded nowhere); across a door's line, just past it | stops at the next square (`stopMovement`); never a displace |
| Door shut mid-walk | each stops on its own square before the door | everyone of the group stops on the square they hold |
| The dragger views another scene mid-walk | core sends the rest unconstrained from a page that no longer draws the token: not across a wall that blocks movement now (read from the scene's walls, 0.8.3) | core would send every next square unmeasured (0 ft) and through shut doors: the next square is not sent, the token stops on the square it holds (0.8.3) |
| A player stopping a move the GM started | works (any owner may) | asked of the active GM, which stops it only when it started the move; no answer in 400 ms: nothing happens |
| The GM stopping a move a player started | works | asked of that player's client (`pentaryn-movement.stopOwn`, GM sender only); no answer in 400 ms: nothing happens |

## When something looks wrong

- **Start with the telemetry** on the screen that moved the token: `game.pentaryn.movement.telemetry({ seconds: 30 })` — `summary.counts` (plans, guard fires, yields, fallbacks, stalls, lost races, stops, cuts, notices, errors), `summary.fallbacks` and `summary.notices` by reason code, `tripped` (the breaker), `cued` (tokens wearing the ring), and the events themselves. `game.pentaryn.movement.reportTelemetry()` whispers the summary to the GMs (ask each player to run it after a session). Alt+W files the last ten seconds.
- **Read what the last drop did:** `status().group.last` — `mode` (`plan` / `straight` / `core`), `reason` (why it went to core: `single`, `off` (tier B off), `fightTier` (a fight with tier C off), `tooMany` (more than 12), `grid`, `direct`, `planned`, `waypoints`, `pathfind:<why>`, `budget`, `anchorNoRoute`, `throw`, `deliver` (failed open), `still`), `waves`, `cut` / `stayed`, `short`, `stacked` (riders carried), `queued` / `delay` / `raced`. `status().group.runs` lists the groups still walking with their run's state and time left; `status().group.fallbacks` the last few core fallbacks.
- **The guard fired** (a console info line `yield guard: Hero 3 gives way to Hero 5 …: a planner miss`): `status().guard` on the client that started the move. Out of combat only. Each firing is a case for the planners: note the scene and what was dragged.
- **"I let go and nothing happened for a moment":** it queued behind a reserved move (`last.queued`, and the amber ring), or it lost a same-instant race and planned again (`last.raced`; `status().group.reservations.race`). `status().group.reservations.alone` / `racing` count how often a drop could skip the publish round trip.
- **"Every token froze for a moment":** `status().group.perf` (a plan's slices; `long` above 0 points at this module) and the telemetry's `stall` events (frames over 150 ms while this screen moved tokens). Core's fog of war reading the explored texture back from the GPU stalls player tabs 150–650 ms (traced 2026-11-22); with the scene's fog mode off the walk is smooth. Not fixed here (core).
- **Dry run a group** from a browser console: `game.pentaryn.movement.planGroup(["Talo", "Caven"], { x: 1200, y: 800 })` — the first is the grabbed one, `{ x, y }` its top-left drop point.
- **A Large (or bigger) token stopped before a narrow door:** its drag goes round by a way it fits through when there is one, however long (decision 8); else it stops before the gap with its whole body clear of the frame, "Stopped short, way blocked", and the GMs get a whisper naming it when a player dragged it. Use ghost to pass it through by hand.
- **"The route went the long way round":** the short way crossed a secret door, a scene-link region, or (for a player) unexplored ground. On purpose.
- **A token stopped and nobody knows why:** `status().stop.last` is this client's last click-stop (`how`, `via`: `click`, `board`, `door`, `api`; `pastDoor` when it was carried past a door's line).
- **Next Turn while a group walks (in a fight):** the whole group stops at its next squares and the members still waiting stay put; what they walked belonged to the turn that ended. `status().group.stopped.why` is `turnChange`.
- **A player alt-tabbed right after dropping a group:** the moment the tab goes to the background (or, 0.8.1, when the group is made on a tab already in the background) its later waves go at once, each cut back where it would meet another member's walk or the first wave's (`status().group.flushed`). In a file through a door the members right behind the first wave then stay where they stand ("Stopped short") rather than walk on its heels. A fight's member waiting for an arrival waits at most until the deadline.
- **Reloading the page while a group walks:** the members still waiting set off once the page is back **only when it is back within 1.5 s of the first unsent wave** (S3R1-07: every other client stops expecting them then); later than that they stay where they are, "Stopped short" (kept until dismissed). In a fight, a member part way along its walk goes on from the square it rests on once the reloaded page shows its scene again, within a minute, as far as it is free of every standing token (`status().group.fightResumed`).
- **Undo (Ctrl+Z) after a move the module drove** undoes the whole move in one press (0.8.3): a group's waves, a fight's every square and the module's own writes for it are one undo entry; each token goes back where the move found it, with its movement history (and its charge) as it was (`status().group.undo`). A macro's moves keep core's one entry per update.
- **A mount dragged alone** carries what starts stacked on it (a rider, a familiar; 0.8.3); a rider dragged alone leaves its mount.
- **"Stopped short, way blocked." after a drop that looked fine** (0.8.4): a member never left its start, or the grabbed one ended more than a square from its drop point, and nothing else told you. `status().group.silent` names the tokens; `status().group.last` and the telemetry say why.
- **A flying token** (movement action `fly`) passes over the tokens on the ground and they under it (0.8.3): no route goes round, nobody gives way.
- **A fight's next square was not sent** ("Stopped short" mid-walk): `status().group.step` — `why` `standing` (a token standing still in its next square on this screen), `unrendered` (the dragger's page no longer draws the token: another scene), `wallUnrendered` (out of combat, a wall shut across it).
- **Turn things off:** GM, the drag-help button (all of it, for everyone), or the tier settings. Each player, *Find a path when I drag* (client). `game.pentaryn.movement.stop(token)` stops one from the console.
- **Force the fallbacks** (live checks): `CONFIG.debug["pentaryn-movement.throw"] = true` (a planner throw) or `CONFIG.debug["pentaryn-movement.throwDeliver"] = true` (a delivery throw): drag a group, core's move with one warning; delete the keys after.

## The simulator

`make foundry-movement-sim SEEDS=10000` (default 2000 seeds from 1; `FROM=`, `MAP=hard`, `JSON=1`) runs the module's distributed logic in Node: the GM, one to three players and the headless bot as virtual clients on one fake clock; jittered latency (11–105 ms, wandering over seconds, packets sent together arriving together), TCP loss as a 200–600 ms retransmit holding the link, fog stalls of 150–1,400 ms on player tabs, a backgrounded initiator, a dropped socket that reloads; five generated maps (T-junction, two-wide corridor, diagonal door, dead end, the hard dungeon). Each seed drops a group (sometimes a second client drops at nearly the same moment), maybe clicks a member to a stop and shuts a door, and judges every invariant on the server's record and on every client's drawn view, frame by frame:

| Invariant | Holds when |
|---|---|
| `passThrough` | a mover never comes inside a token standing still (0.05 square of numeric slack) |
| `moverBound` | two movers never come more than 0.1 square inside touching for more than 150 ms |
| `restOverlap` | nothing overlaps at rest |
| `liveness` | every drop's run ends by its 10 s deadline (or when its last walk does, a long way round being a walk, not a wait); nothing is left walking; drawn = server at the end |
| `combatCost` | in a fight each committed update is one square on the token's own way, never a position write |
| `orphans` | no reservation, group or held yield is left once everything has ended |
| `doorCut` | nothing sent after its sender knew a door was shut crosses its line; in a fight no member of a cut group move sends another square |

A failing seed prints one line (`seed N  map/mode  [disturbances]  invariants  first failure`); `make foundry-movement-sim SEED=N` prints that seed's whole record (the scenario, every failure with the client, ids, time, depth, duration and whether that client had just stalled or lost a packet, the runs' state histories, the events). The runner is `scripts/foundry/movement_sim.mjs` (`--opts` takes the same JSON); the simulator is the module's `test/sim/`: the engine `engine.mjs`, the maps `maps.mjs`, the scenario and invariants `scenario.mjs`, and the module's logic as it runs there, `model.mjs`: the real pure cores, and a port of the glue's protocol that names the `group.mjs` / `stop.mjs` / `guard.mjs` function each part stands for. A failure is read back against the module's source before it is called a defect: a port that drifted from the glue is a simulator bug. `test/sim/sim.test.mjs` (in `node test/run.mjs`) keeps a smoke run and one regression seed per defect found, each checked with the fix and without it.

What a run shows today, and why (plan §16.9 and §16.11 have the seeds): out of combat most failures are on a client that had just stalled or lost a packet (a fresh move is drawn from when that client handled it, not from when the server applied it); in a fight the default, tier C off, walked members through members resting in about half the fights (a third since 0.8.3's next-square check); tier C fails 1 of 400 undisturbed fights (a long walk's reservation outliving its run), its other failures are on a client that stalled or lost a packet, and it moves about 89 % of its members (0.8.2: 69 %). A new failure class is a finding for the plan, not a reason to loosen an invariant.

