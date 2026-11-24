---
title: Drag movement — pathfinding, group drags, click to stop
status: active
last_modified: 2026-11-24
tags: [foundry, module, pentaryn-movement, movement, pathfinding]
---

# Drag movement (pentaryn-movement)

**Read this when:** a dragged token takes a strange route or will not go round a wall; several tokens dragged together overlap, jam in a door, or end up on top of each other; a moving token will not stop when clicked, or stops in the wrong place; the movement spent in a fight looks wrong after a stop; a group drag "did nothing for a moment"; or the drag help switched itself off. **Not this file:** ghost movement and owned-on-top, the module's code, settings table and API → [`../../foundry/module/pentaryn-movement/README.md`](../../foundry/module/pentaryn-movement/README.md) · how it was designed, the acceptance criteria and the live play-test list → [`../plans/pathfinding-2026-11.md`](../plans/pathfinding-2026-11.md) (§9, §12, §16 for 0.8).

## At the table

> **0.9.0 on the branch `movement-0.9`** (main keeps 0.8.5 until the GPU round): no reservations, runtime guard, deadline
> or waiting ring; a single drop goes at once; a group drag out of combat gets every member's spot and route in one
> pass, then a start delay (all 0 on open ground, filing through a door, the last within 4 s; one with no spot it can
> reach stays and is named); a group drag in a fight walks one member at a time, each a single move routed at its turn
> (a click, a turn change, a new drop or a deleted member ends the queue); a click on any member stops the whole group;
> `fightGroupDrags` is gone; in a fight every next square is tested against the walls as they are now. The module
> README's "Drag movement" has the branch's state; this page is rewritten for 0.9 at the handoff.

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
5. **A long detour you did not want.** Click the moving token (a token you dropped yourself: once it has moved 400 ms; one someone else set moving: at once): out of combat it stops **exactly where it is drawn** (Joe, 2026-11-23); one with its body across a door's line, or that would rest inside a token at rest (a member the same stop stopped, a mate this screen just sent), is carried on along its own route just clear of it (0.9.0), else to the nearest clear spot. In a fight it finishes the square it is in, so the spent movement is exactly the squares walked. A click on one member stops the whole group; when the clicker does not own every member, only the clicker's own stop, and the others **stop short behind them** (no re-route). A click over a door's icon stops the token under it and leaves the door alone.
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
- **A fight member paused a beat before a square** (0.8.5): its next square was the square of a token still moving (the one ahead in a file); the step is **held**, not refused, and the rest of its walk goes from the square it holds once the way is clear, a latency buffer behind. `status().group.hold` counts `held` / `resumed` / `gaveUp` (the one in the way came to rest there: "Stopped short") and names the `last`.
- **"No route there: <name> is in the way."** (0.8.5): a single drag whose only way passes a token standing in it (an ally in a one-wide corridor in a fight). Toggle ghost under the Ruler to pass it, or move it first. A name you cannot see reads "a token".
- **Why did that member stay?** `game.pentaryn.movement.planGroup(ids, point)` (a dry run, nothing moves) returns a `why` per member: `noSlot`, `noRouteToSlot`, `shortEndBlocks` (a big one that fits no door, kept out of the others' way), `blocked:<id>`, `settle:<ids>` (cut back so as not to meet them), `behindFile:<n>` (the grabbed one stops short behind the members ahead of it in a dead end).
- **Turn things off:** GM, the drag-help button (all of it, for everyone), or the tier settings. Each player, *Find a path when I drag* (client). `game.pentaryn.movement.stop(token)` stops one from the console.
- **Force the fallbacks** (live checks): `CONFIG.debug["pentaryn-movement.throw"] = true` (a planner throw) or `CONFIG.debug["pentaryn-movement.throwDeliver"] = true` (a delivery throw): drag a group, core's move with one warning; delete the keys after.

## The simulator

`make foundry-movement-sim` (`SEEDS=10000`, `SEED=N` one seed's record, `OPTS='{"combat":true}'`) runs the module's
real cores (`file-core`, `motion-core` clearAlong, `sequence-core`, the pathfind-core A*) on virtual clients over a
jittered, lossy network, every seed as B1 and B0. A failing run prints its seed and first failure; `SEED=N` gives the
events (plans, notices, stops, cuts). Hard: `passThrough`, `wallCross`, `wrongCharge`, `unsent` (not sent or named
within 4 s; nothing held at the end), `restOverlap` (not a flagged two-screen race), `errors`. Reported only: mover
overlap, a walk past a mate waiting for its wave or stopped short, a walk through a token that came to rest after it
was sent. The suite runs 60 seeds and the regression seeds (`test/sim/sim.test.mjs`); `before: true` in OPTS switches
the step-5 glue fixes off in the model (for a before/after on that commit's cores). Results: plan §17.5.
