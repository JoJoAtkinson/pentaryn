---
title: Drag movement — pathfinding, group drags, click to stop
status: active
last_modified: 2026-11-22
tags: [foundry, module, pentaryn-movement, movement, pathfinding]
---

# Drag movement (pentaryn-movement)

**Read this when:** a dragged token takes a strange route or will not go round a wall; several tokens dragged together overlap, jam in a door, or end up on top of each other; a moving token will not stop when clicked, or stops in the wrong place; the movement spent in a fight looks wrong after a stop; or a group drag "did nothing for a moment". **Not this file:** ghost movement and owned-on-top, the module's code, settings table and API → [`../../foundry/module/pentaryn-movement/README.md`](../../foundry/module/pentaryn-movement/README.md) · how it was designed and the live play-test list → [`../plans/pathfinding-2026-11.md`](../plans/pathfinding-2026-11.md) (§9, §12, §13).

## At the table

There is nothing to learn: drag, and it works out the rest.

1. **One token past a wall.** The ruler goes around it the shortest way (open doors only, round hostile creatures and costlier terrain, a big token only where it fits), corners rounded where that costs nothing. A player's drag only routes round walls that player has seen, and only over ground that player has explored or can see. A route never uses a secret door, open or shut, and never crosses a region with a Teleport Token (a pentaryn-portals scene link) or Change Level behaviour unless the drag ends (or starts) inside it; a hidden region counts only for the GM. A straight drag is core's own.
2. **Several tokens at once** (box-select or Shift-click, then drag one). The one you grab lands exactly where you drop it. The others each walk their own way to their own spot around it. On open ground they all set off together and keep their shape; only where routes meet (a door) do they set off in turn and file through one behind the other. No group spot is ever inside a scene-link region unless the group is dropped into it. At rest no two overlap (tokens are circles: touching is fine). While dragging, only the grabbed token's ruler bends; the others' routes are worked out on the drop.
3. **A long detour you did not want.** Click the moving token: it stops where it is and is selected. In a fight it stops at the next square instead, so dnd5e's spent movement is exactly the squares walked. The click only stops a move that has run 400 ms: a click right after the drop, or a double click to open the sheet, is an ordinary click.
4. **Ghost on, or the GM's Unconstrained Movement tool:** straight lines through walls, the group keeping its shape (only a token that would rest on top of another is moved aside).

## Out of combat vs in a fight

| | Out of combat | In a started combat (the token's combatant) |
|---|---|---|
| Path | free-form and smooth, arcs at corners | on the grid: no arcs, a checkpoint at every square |
| Group spots | packed round the drop point (a hex pattern) | whole squares round the drop point |
| Group timing | start delays, then a re-route round resting members if needed | start delays only |
| Click to stop | put where it is drawn (a displace: free, recorded nowhere) | stops at the next square (`stopMovement`); never a displace |
| A player stopping a move the GM started | works (any owner may) | asked of the active GM, which stops it only when it started the move; on no answer in 400 ms nothing happens |
| The GM stopping a move a player started | works | asked of that player's client (`pentaryn-movement.stopOwn`, GM sender only), which stops it at the next square; on no answer in 400 ms, or the player offline, nothing happens |

## When something looks wrong

- **Read what the last drop did:** `game.pentaryn.movement.status().group.last` — `mode` (`plan` / `straight` / `core`), `reason` (why it went to core: `single`, `off`, `tooMany` (more than 12), `grid`, `direct`, `planned`, `waypoints` (Ctrl-click waypoints in a group drag), `pathfind:<why>`, `budget`, `anchorNoRoute`, `throw` (then `mode` and `result` are `core` too), `still` (dropped where it stands: nothing planned)), `waves`, `relaxed` (members allowed to brush while moving), `async`. `status().group.fallbacks` keeps the last few core fallbacks; `status().group.resumed` says when a reload last picked up unsent waves.
- **Dry run a group** from a browser console (the headless GM has no canvas): `game.pentaryn.movement.planGroup(["Talo", "Caven"], { x: 1200, y: 800 })` — the first is the grabbed one, `{ x, y }` its top-left drop point. Each member's `slot`, `delay` (ms) and `level` (0 a delay, 1 a re-route, 2 waited until the others stopped, 3 relaxed, `core` no route: it moves as core would). `anchorRoute` is the grabbed token's own route (searched first, as the drag preview does): `reached: false` there means no way to that point at all, not a planning budget.
- **"It paused, then they all moved":** a big group's plan did not finish in 30 ms, so the drop returned nothing and the moves went out when the plan was ready (≤ 300 ms; past that, core's own drop: followers then stop at the first wall, as core does, but each stops short of any member already resting there, so none ends on top of another).
- **"The ruler went straight through a wall and the token stopped at it"** (0.4.1 and before, in a maze whose opening was far off the straight line): the search looked only near the start and the drop. From 0.4.2 it searches the whole scene when that finds nothing.
- **"The route went the long way round":** the short way crossed a secret door, a scene-link region, or (for a player) unexplored ground. That is on purpose. Drag in a straight line through it if you mean to go there.
- **"I clicked it and it kept going":** the move had run under 400 ms (the arming delay); click again. A click lands on where the token is drawn now, even when core's own click handling misses a token that moved under the pointer.
- **A door was shut while the group walked through it:** members already through carry on; the ones still waiting each stop on their own whole square before the door, the nearest one free of every other token and of the squares the members before them took (0.4.4; 0.4.2 and 0.4.3 sent them all to the same square, live R4-1). A member with no free square on its way stays where it stands. A member already in the doorway walks through, as a single token does.
- **A member walked straight into a wall and stopped:** it had no route to any spot; it is left to core, and the others plan around where core leaves it.
- **Overlap while moving on another screen:** each client starts a tween when the update arrives, so a late wave can drift by the network delay. Members are kept 0.25 square further apart across waves for that; a region that holds a member at a checkpoint can still bring two together (accepted).
- **Next Turn while a group walks (in a fight):** the whole group stops at its next squares and the members still waiting stay put (0.4.4; before, only the members that had walked a square stopped, live R4-3). Core stops any token whose movement history is cleared, and a turn start clears every combatant's history, so what they walked belonged to the turn that ended, as for a single token. `status().group.stopped` says when a turn change last stopped a group. Drag again for the new turn.
- **Reloading the page while a group walks:** the members still waiting for their turn set off once the page is back (0.4.3), as long as nobody moved them meanwhile and it is within a minute of the drop. Only the tab that dropped them sends them (its own sessionStorage); closing that tab for good leaves them where they stand.
- **Clicked it, it stopped, and the drawn token walked on anyway** (0.4.2 and before, through a door): the server had it where it was clicked. From 0.4.3 every client watches a stopped token for 3 s and puts a token that walks on, or rests anywhere else, back where the server has it.
- **Undo (Ctrl+Z) after a group move** undoes one wave at a time (each wave is its own update).
- **Turn things off:** GM, *Settings → Pentaryn Movement → Group movement* (world). Each player, *Click a moving token to stop it*, *Find a path when I drag*, *Round path corners* (client). `game.pentaryn.movement.stop(token)` stops one from the console.
- **Force the fallback** (live test 11): `CONFIG.debug["pentaryn-movement.throw"] = true`, drag a group (one warning, core's move), then delete the key.
