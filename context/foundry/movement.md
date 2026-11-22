---
title: Drag movement — pathfinding, group drags, click to stop
status: active
last_modified: 2026-11-21
tags: [foundry, module, pentaryn-movement, movement, pathfinding]
---

# Drag movement (pentaryn-movement)

**Read this when:** a dragged token takes a strange route or will not go round a wall; several tokens dragged together overlap, jam in a door, or end up on top of each other; a moving token will not stop when clicked, or stops in the wrong place; the movement spent in a fight looks wrong after a stop; or a group drag "did nothing for a moment". **Not this file:** ghost movement and owned-on-top, the module's code, settings table and API → [`../../foundry/module/pentaryn-movement/README.md`](../../foundry/module/pentaryn-movement/README.md) · how it was designed and the live play-test list → [`../plans/pathfinding-2026-11.md`](../plans/pathfinding-2026-11.md) (§9, §12, §13).

## At the table

There is nothing to learn: drag, and it works out the rest.

1. **One token past a wall.** The ruler goes around it the shortest way (open doors only, round hostile creatures and costlier terrain, a big token only where it fits), corners rounded where that costs nothing. A player's drag only routes round walls that player has seen. A straight drag is core's own.
2. **Several tokens at once** (box-select or Shift-click, then drag one). The one you grab lands exactly where you drop it. The others each walk their own way to their own spot around it, setting off in turn: through a door they file one behind the other, and on open ground they keep their shape. At rest no two overlap (tokens are circles: touching is fine). While dragging, only the grabbed token's ruler bends; the others' routes are worked out on the drop.
3. **A long detour you did not want.** Click the moving token: it stops where it is and is selected. In a fight it stops at the next square instead, so dnd5e's spent movement is exactly the squares walked. A double click stops it and opens the sheet.
4. **Ghost on, or the GM's Unconstrained Movement tool:** straight lines through walls, the group keeping its shape (only a token that would rest on top of another is moved aside).

## Out of combat vs in a fight

| | Out of combat | In a started combat (the token's combatant) |
|---|---|---|
| Path | free-form and smooth, arcs at corners | on the grid: no arcs, a checkpoint at every square |
| Group spots | packed round the drop point (a hex pattern) | whole squares round the drop point |
| Group timing | start delays, then a re-route round resting members if needed | start delays only |
| Click to stop | put where it is drawn (a displace: free, recorded nowhere) | stops at the next square (`stopMovement`); never a displace |
| A player stopping a move the GM started | works (any owner may) | asked of the active GM, which stops it only when it started the move; on no answer in 400 ms nothing happens |

## When something looks wrong

- **Read what the last drop did:** `game.pentaryn.movement.status().group.last` — `mode` (`plan` / `straight` / `core`), `reason` (why it went to core: `single`, `off`, `tooMany` (more than 12), `grid`, `direct`, `planned`, `waypoints` (Ctrl-click waypoints in a group drag), `pathfind:<why>`, `budget`, `anchorNoRoute`, `throw`), `waves`, `relaxed` (members allowed to brush while moving), `async`. `status().group.fallbacks` keeps the last few core fallbacks.
- **Dry run a group** from a browser console (the headless GM has no canvas): `game.pentaryn.movement.planGroup(["Talo", "Caven"], { x: 1200, y: 800 })` — the first is the grabbed one, `{ x, y }` its top-left drop point. Each member's `slot`, `delay` (ms) and `level` (0 a delay, 1 a re-route, 2 waited until the others stopped, 3 relaxed, `core` no route: it moves as core would).
- **"It paused, then they all moved":** a big group's plan did not finish in 30 ms, so the drop returned nothing and the moves went out when the plan was ready (≤ 1 s; past that, core's own drop).
- **A member walked straight into a wall and stopped:** it had no route to any spot; it is left to core, and the others plan around where core leaves it.
- **Overlap while moving on another screen:** each client starts a tween when the update arrives, so a late wave can drift by the network delay. Members are kept 0.25 square further apart across waves for that; a region that holds a member at a checkpoint can still bring two together (accepted).
- **Undo (Ctrl+Z) after a group move** undoes one wave at a time (each wave is its own update).
- **Turn things off:** GM, *Settings → Pentaryn Movement → Group movement* (world). Each player, *Click a moving token to stop it*, *Find a path when I drag*, *Round path corners* (client). `game.pentaryn.movement.stop(token)` stops one from the console.
- **Force the fallback** (live test 11): `CONFIG.debug["pentaryn-movement.throw"] = true`, drag a group (one warning, core's move), then delete the key.
