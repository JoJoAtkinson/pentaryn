---
title: Drag movement — pathfinding, group drags, click to stop
status: active
last_modified: 2026-11-24
tags: [foundry, module, pentaryn-movement, movement, pathfinding]
---

# Drag movement (pentaryn-movement)

**Read this when:** a dragged token takes a strange route or will not go round a wall; several tokens dragged together overlap, jam in a door, or end up on top of each other; a moving token will not stop when clicked, or stops in the wrong place; the movement spent in a fight looks wrong after a stop; a group drag leaves someone behind; or the drag help switched itself off. **Not this file:** ghost movement and owned-on-top, the module's code, settings table and API → [`../../foundry/module/pentaryn-movement/README.md`](../../foundry/module/pentaryn-movement/README.md) · how it was designed, the acceptance criteria and the live play-test list → [`../plans/pathfinding-2026-11.md`](../plans/pathfinding-2026-11.md) (§16 for 0.8, §17 for 0.9).

> **0.9.0 is built on the branch `movement-0.9`** (the smaller design, Fable's review 2); `main` keeps 0.8.5 (tag `movement-0.8.5-rollback`) until the GPU round and the handoff. This page describes 0.9.

## The one rule

**Within 4 seconds of the drop every token is on its way, or named in a notice; nothing ever waits for another mover.** Hard (never broken): walls, shut doors, tokens standing still, a mate at its spot, two tokens overlapping at rest, and a fight's movement charges. Soft (allowed, Joe 2026-11-24): two tokens that are *both moving* may brush or overlap briefly on the way (the simulator measures it: about a square deep at worst, under 2 s at p95).

## At the table

There is nothing to learn: drag, and it works out the rest. Two world settings: `pathfinding` (Everyone / GM only / Off; each player also has *Find a path when I drag*) and `groupDrags` (on). The GM's drag-help button (Token controls, the route icon; `assist`) turns both off for the whole table in one click.

1. **One token past a wall.** The ruler goes around it the shortest way (open doors only, round tokens standing in the way and costlier terrain, a big token only where it fits), corners rounded where that costs nothing. A player's drag only routes round walls that player has seen, and only over ground that player has explored or can see. A route never uses a secret door and never crosses a region with a Teleport Token (a pentaryn-portals scene link) or Change Level behaviour unless the drag ends or starts inside it. No way there at all: nothing moves, "No route there." What the ruler shows is what the drop walks and charges, and it goes at once: no queue, no start delay, no waiting for another mover.
2. **Several tokens out of combat — the file** (box-select or Shift-click, then drag one). The one you grab lands where you drop it (on another token: the nearest clear spot it can reach). Every other member gets the free spot nearest its place in the formation *that it can reach* (never the far side of a wall; a place behind the room's wall or in rock becomes the nearest spot the drop point reaches), and a route round the tokens standing outside the drag and the spots already given out. Then each gets a start delay: on open ground all 0 and they set off together; through a door they file, each waiting only as long as it needs not to meet those before it, the last within 4 s. One with no spot it can reach stays where it stands and is named ("Stayed where they stand, with no free spot they can reach: …"); nobody able to go is "No route there." A tab sent to the background sends the waiting members at once.
3. **Several tokens in a fight — one at a time.** Nothing moves at the drop. The members walk one after the other (least walk left first; a mount and its rider as one), each a normal single move routed when its turn comes round every token standing *then* (those already moved where they came to rest), to its formation spot or the nearest clear square, a checkpoint at every square, charged exactly what it walks (5 ft a square). Expect about a second per member per 30 ft. A click on the walker, a turn change, a new drop or a deleted member ends the queue; the members not yet sent are named ("Did not move, the group's walk was ended: …") unless your own click or drop ended it. A walk that never ends is moved on after its own time plus 3 s. More than 12 members: "In a fight, drag one token at a time."
4. **Click a moving token to stop it** (always on; a move you dropped: once it has moved 400 ms; one someone else set moving: at once). **A click on any member of a moving group stops the whole group**: on the dragger's screen every member and every wave not yet sent; from another screen the one clicked, and the dragger's screen then stops the rest. Out of combat each stops **exactly where it is drawn** (Joe, 2026-11-23); one with its body across a door's line, or that would rest inside a token at rest (a mate the same stop stopped, a spot this screen just sent a mate to), is carried on along its own route just clear of it, never through a wall, else to the nearest clear spot. In a fight it finishes the square it is in, so the movement spent stays exact. A GM may stop anyone's move; a player the moves of tokens they own.
5. **A door shuts or a wall rises while tokens walk.** Out of combat each token whose way it crosses stops where it is drawn, and a member not yet sent whose way it crosses stays where it stands, named. In a fight every next square is tested against the walls *as they are now* before it is sent (a door shut mid-walk stops the token on the square it holds, charged for the squares it walked); no square is sent from a page that no longer shows the token's map, and none into a token standing still.
6. **Stacked tokens stay stacked**: a rider on its mount, a familiar on a shoulder, a grappled pair (circles that start overlapping) walk their leader's way at their offset. A mount dragged alone carries its rider; a rider dragged alone leaves its mount.
7. **Ghost on, or the GM's Unconstrained Movement tool:** straight lines through walls, the group keeping its shape (core's own move). Ctrl waypoints and one stack are core's own moves too.

**Two notices only for a move:** "No route there." (nothing moves) and "Stopped short, way blocked." (it moved as far as it could). Why, exactly, is a reason code in `game.pentaryn.movement.telemetry()`.

**Fail-open and the circuit breaker.** An exception inside a move sends core's own move (cut before standing tokens) and is logged. After 3 errors or 6 failed plans in one session the drag help switches itself off on that screen; on the GM's screen it also turns `assist` off for the table, and the GM gets a notice (a whisper when it was a player's screen). A reload, or the GM turning the button back on, clears it.

**What a reload does:** nothing resumes. A token mid-walk when its page reloads stays on the square it holds; the group members not yet sent stay where they stand. Drag again.

**"That move was wrong."** Press **Alt+W** (rebindable in Configure Controls) right after a bad move: the last ten seconds of that screen's drag telemetry are filed as a Bug through pentaryn-feedback, for `feedback_next`.

## Out of combat vs in a fight

| | Out of combat | In a started combat (the token's combatant) |
|---|---|---|
| Path | free-form and smooth, arcs at corners | on the grid: no arcs, a checkpoint at every square |
| Group drag | the file: every member's spot and route at the drop, start delays within 4 s, packed round the drop point (a hex pattern) | one member at a time, whole squares round the drop point, each a single move at its turn |
| Tokens standing in the way | routes go round them; none rests on one; no way round: stops short | the same, on whole squares; the ruler already shows that way and its cost |
| Two movers meeting | may brush (soft) | one walks at a time, so never |
| Click to stop | the whole group, each exactly where drawn (a displace: free, recorded nowhere); across a door's line, carried just past it | the whole group's queue ends; the walker stops at the next square (`stopMovement`); never a displace |
| Door shut mid-walk | each whose way it crosses stops where drawn | the walker stops on the square it holds |
| The dragger views another scene mid-walk | core sends the rest unconstrained from a page that no longer draws the token: not across a wall that blocks movement now (read from the scene's walls) | the next square is not sent, the token stops on the square it holds |
| A player stopping a move the GM started | works (any owner may) | asked of the active GM, which stops it only when it started the move; no answer in 400 ms: nothing happens |
| The GM stopping a move a player started | works | asked of that player's client (`pentaryn-movement.stopOwn`, GM sender only); no answer in 400 ms: nothing happens |

## When something looks wrong

- **Start with the telemetry** on the screen that moved the token: `game.pentaryn.movement.telemetry({ seconds: 30 })` — `summary.counts`, `summary.fallbacks` and `summary.notices` by reason code, `tripped` (the breaker), and the events themselves (counters named for 0.8's guard and reservations stay at zero). `game.pentaryn.movement.reportTelemetry()` whispers the summary to the GMs.
- **Read what the last drop did:** `status().group.last` — `mode`, `reason` (why it went to core: `single`, `off`, `tooMany` (more than 12), `grid`, `direct`, `waypoints`, `pathfind:<why>`, `throw`, …), `waves`, `stayed`, `plan` (`waves`, `total`, `crowded`, `timingMs`). `status().group` also has `pending` (waves not yet sent), `wave` (the last later wave), `flushed` (the last hidden-tab flush) and `queue` (the last fight queue: members, sent, stayed, skipped, watchdog, ended, running). `status().group.told` lists the last notices.
- **Dry run a group** from a browser console: `game.pentaryn.movement.planGroup(["Talo", "Caven"], { x: 1200, y: 800 })` — the first is the grabbed one, `{ x, y }` its top-left drop point. It returns each member's spot, route, start `delay` and whether it stays; nothing moves.
- **Why did that member stay?** No free spot it can reach (behind a wall, off the scene, a one-wide corridor full of mates), or no route to it round the standing tokens: it is named in the notice, and `planGroup` shows `stay`.
- **"Every token froze for a moment":** the telemetry's `stall` events (frames over 150 ms while this screen moved tokens). Core's fog of war reading the explored texture back from the GPU stalls player tabs 150–650 ms (traced 2026-11-22); with the scene's fog mode off the walk is smooth. Not fixed here (core).
- **A Large (or bigger) token stopped before a narrow door:** its drag goes round by a way it fits through when there is one, however long; else it stops before the gap with its whole body clear of the frame, "Stopped short, way blocked", and the GMs get a whisper naming it when a player dragged it. Use ghost to pass it through by hand.
- **"The route went the long way round":** the short way crossed a secret door, a scene-link region, or (for a player) unexplored ground. On purpose.
- **A token stopped and nobody knows why:** `status().stop.last` is this client's last click-stop (`how`, `via`: `click`, `board`, `door`, `api`; `pastDoor` when it was carried past a door's line).
- **Next Turn while a fight group walks:** the queue ends; the walker stops at its next square and the members still waiting stay put. They are named as not moved.
- **A fight's next square was not sent** ("Stopped short" mid-walk): `status().group.step` — `why` `standing` (a token standing still in its next square on this screen), `unrendered` (the dragger's page no longer draws the token: another scene), `wallUnrendered` (a wall shut across it).
- **"No route there: <name> is in the way."** A single drag whose only way passes a token standing in it (an ally in a one-wide corridor in a fight). Toggle ghost under the Ruler to pass it, or move it first. A name you cannot see reads "a token".
- **Undo (Ctrl+Z) after a move the module drove** undoes the whole move in one press: a group's waves, a fight's every square and the module's own writes for it are one undo entry; each token goes back where the move found it, with its movement history (and its charge) as it was. A macro's moves keep core's one entry per update.
- **A flying token** (movement action `fly`) passes over the tokens on the ground and they under it: no route goes round, nobody gives way.
- **Turn things off:** GM, the drag-help button (all of it, for everyone), or the `pathfinding` / `groupDrags` settings. Each player, *Find a path when I drag* (client). `game.pentaryn.movement.stop(token)` stops one from the console.
- **Force the fallbacks** (live checks): `CONFIG.debug["pentaryn-movement.throw"] = true` (a planner throw) or `CONFIG.debug["pentaryn-movement.throwDeliver"] = true` (a delivery throw): drag a group, core's move with one warning; delete the keys after.

## The simulator

`make foundry-movement-sim` (`SEEDS=10000`, `SEED=N` one seed's record, `OPTS='{"combat":true}'`) runs the module's real cores (`file-core`, `motion-core` clearAlong, `sequence-core`, the pathfind-core A*) on virtual clients over a jittered, lossy network, every seed as B1 (the file) and B0 (no stagger). A failing run prints its seed and first failure; `SEED=N` gives the events (plans, notices, stops, cuts). Hard: `passThrough`, `wallCross`, `wrongCharge`, `unsent` (not sent or named within 4 s; nothing held at the end), `restOverlap` (not a flagged two-screen race), `errors`. Reported only: mover overlap, a walk past a mate waiting for its wave or stopped short, a walk through a token that came to rest after it was sent. The suite runs 60 seeds and the regression seeds (`test/sim/sim.test.mjs`). Results and the open seeds: plan §17.5.
