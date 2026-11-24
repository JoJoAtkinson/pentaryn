# Pentaryn Movement (`pentaryn-movement`)

**Read this when:** a player's token is stuck under someone else's, a player wants to walk through
a wall while exploring, ghost movement needs switching off for a scene, a dragged token should
find its way around a wall (or takes a strange route), a group drag overlaps or jams in a door, a
moving token will not stop, or you are changing or calling `pentaryn-movement`. **Not this file:**
using drag movement at the table (pathfinding, group drags, click to stop) → `context/foundry/movement.md`
· how every addon is built → `context/foundry/addon-blueprint.md` · how pathfinding and group movement
were designed → `context/plans/pathfinding-2026-11.md` · its origin → `context/plans/table-feedback-2026-10-08.md` (C2)

## What the player sees

**Owned tokens on top (players only).**

- On a player's screen, **their own tokens are drawn above everyone else's** and take the click
  when tokens overlap, so you can always see and grab your own token.
- **Client-side only.** Nothing is written to the scene; the GM (who owns everything) is never
  affected. **Elevation still wins:** a flying creature above you is still drawn above you.
- Per-player switch: *Settings → Pentaryn Movement → Show my own tokens on top* (default on).

**Ghost movement (players).**

- **The ghost button** (a ghost icon) in the token tools, just under the Ruler. Click it to move
  your own tokens **through walls, doors and other creatures**, by drag or arrow keys. Click again
  to walk normally. Each player switches it for themselves.
- **You can see it's on:** the button is pressed, its tooltip says *Ghost movement: ON*, and your
  own tokens look see-through.
- **Watch-out (accepted by Joe):** walking through a wall puts your token's vision on the other side.
- When ghost stops being allowed (a fight starts, or the GM turns it off), the button is
  **switched off** with a toast. It does not come back by itself; when it is allowed again, a
  second toast says so once. During a fight the button stays visible, dimmed, with a small swords
  badge, and clicking it explains why it's off.
- **Incorporeal creatures keep ghosting through a fight.** If one of your tokens has a **feat** named
  *Incorporeal Passage*, *Incorporeal Movement* or *Ethereal…* (the Summon Undead spirit, a ghost), or
  the GM marked it (below), the button stays usable while the fight runs and that creature passes
  through walls and creatures; your other tokens walk normally. Feats only (the *Etherealness*
  **spell** does not count). Only movement passes; walls still block light and sight. A creature like
  that arriving mid-fight (you summon it) gets one toast.

**GM control.**

- *Settings → Pentaryn Movement → Player ghost movement*: **Off** (no button), **Exploration only**
  (default: off while a combat runs on the scene), **Always allowed**.
- **GM toolbar button** (token tools, next to core's own ghost): pressed = players may ghost; click
  to turn it off for everyone, again to restore the previous mode (repeat clicks apply in order).
- **"A combat is running on the scene"** = an **active** encounter linked to the scene that has a
  combatant or has started, or an unlinked one with a combatant standing there. An empty encounter
  does not count, and **hidden combatants don't count** (a hidden ambush tips no one off).
- **Ghost in combat for one creature** (GM only): Token HUD → the ghost button in the right column.
  Pressed = the creature's owner may ghost it during a fight (the actor flag
  `flags.pentaryn-movement.ghostInCombat`; on an unlinked token it stays with that token). A creature
  whose feat already grants it is shown pressed with the feat named, and the click changes nothing.
  Same from the console: `game.pentaryn.movement.setGhost(creature, { combat: true })`.

**Drag movement (everyone; 0.3.0 pathfinding, 0.4.0 groups and click to stop, 0.9.0 the smaller design).** Nothing
new to learn: you drag, it works out the rest. The table-side detail is `context/foundry/movement.md`. One rule since
0.9.0 (Fable's review 2): **within 4 s of the drop every token is on its way, or named in a notice; nothing ever waits
for another mover.** Walls, shut doors, tokens standing still, a mate at its spot, overlap at rest and fight charges
are hard; two tokens that are both moving may brush (Joe, 2026-11-24).

- **Tier A — one token** (`pathfinding`): past a wall the ruler goes around it — the shortest way, through open
  doors only, round tokens standing in the way and costlier terrain, a big token only where it fits; corners rounded
  where an arc costs nothing extra. Players route only round walls they have seen, over ground they have explored or
  can see; never a secret door, never through a teleport / change-level region unless it ends there. What the ruler
  shows is what the drop walks and charges, and the drop goes at once: no queue, no start delay. No way there:
  nothing moves, "No route there" (naming the token standing in the only way when you can read its name).
- **Click a moving token to stop it** (always on) once it has moved 400 ms (a move you dropped; one another user
  started stops at once): out of combat it stops **exactly where it is drawn** (Joe, 2026-11-23); one whose body is
  across a door's line, or that would rest inside a token at rest or a member the same stop stopped, is carried on
  along its own route just clear of it (0.9.0 step 5; never through a wall or a token at rest; the leader of a group
  carries on through its own members to the first free spot). Several stopped at once settle front first (0.10 L3):
  the one in front where it is drawn, the ones behind it carried back along their own ways (or the one in front carried
  on along its own, to make room), never onto a spot another stop on this screen is still carrying a token to or a
  waiting member's square (unless that is the only clear spot left: then that member stays, named); this screen's other
  walkers heading into a spot the stop rests one on stop too. One stop's writes go to the server as **one update**
  (0.10 L3 fix round), so no screen ever sees one of them stopped while the next still walks on into it; and when, one
  by one, two would be left inside each other or one walk on would pass through a token the stop rests on its way, the
  stop's tokens are **settled together**, each along its own way (the front ones keep their spot first; a walker of
  this screen in the way stops too). A walk on that a door shut meanwhile blocks is settled again with the tokens of
  its stop it lies in. With no clear spot anywhere along its own way (0.10:
  no straight line off it any more), a click leaves it walking on to its own square ("Could not stop clear of another
  token, so walked on to its own square: …"), and a door or wall that cut it leaves it where it is drawn, named
  ("Stopped on another token, …: drag it clear"). In a fight it finishes the square it is in,
  so the movement spent stays exact; a GM may stop anyone's move. A click on any member of a moving group stops the
  whole group (Joe, 2026-11-24): the dragger's screen stops the rest, and the members not yet sent stay where they
  stand.
- **In a fight, every square is checked before it is sent** (Joe, 2026-11-23): against the walls as they are now (a
  door shut mid-walk stops the token on the square it holds, charged for the squares it walked); never from a screen
  that no longer shows the token's map; never into a token standing still, nor (0.10 L3) onto the square of a walker
  that rests there or whose screen has held it up for half a second.
- **A door shut or a wall raised across a walk out of combat** stops it where it is drawn; a group member not yet
  sent whose way it crosses stays where it stands, named. **A door is not shut on a jam** (0.10 L3 ruling): on the
  screen shutting it, a dry run of that stop for every token walking through the door's line (each one's spots along
  its own way with the door shut, settled together, as a stop settles them); when one of them would be left with no
  spot clear of every token, the door stays open: "Door blocked: <name> is in the doorway." Known limit: a door cannot
  be shut on a jammed group token that has nowhere free to rest; shut it once they are through. No setting: with the
  drag help off, or in a fight, a door always shuts.
- **Several tokens out of combat — the leader rule** (`groupDrags`; 0.10, Joe 2026-11-24): the token you grab and
  drag **leads** (grab a rider and its mount leads). Where you drop it picks the shape. **March** — dropped on the
  floor: the leader ends on the drop square by its own way (it walks through its own group, never through anyone
  else), and everyone else rests **behind** it, as close as they fit, never beside or ahead of it ("behind" follows
  the leader's last step, not the straight drag line); in a one-wide tunnel that is a line behind the leader.
  **Swarm** — dropped on a token outside the group that you can see (friend, foe or prop): the leader gets a square
  touching it first, and the rest close in round it from their own sides, ring by ring (8 squares touch a Medium, 12 a
  Large, 16 a Huge). A hidden token never makes a swarm, for the GM either: it is just a token in the way. Each member
  takes the best square it can reach and gets one route to it, round the tokens standing outside the drag and the
  squares already given out. **The motion** (0.10 L2): the leader sets off at once and the rest one wave (150 ms,
  about a square) later as one pack; a leader that starts behind walks through its own group to the front first,
  drawn on top of it on every screen, and the pack sets off once it is a square past the frontmost member. Single file
  only where the way is narrow: through a door one at a time, in a one-wide tunnel a line, spreading out again past
  it; a member also waits while another would walk through it at rest. The last one is on its way within 4 s of the
  drop. Nobody rests on anybody, nobody walks through a token standing still outside the group; two members both
  moving may brush on the way. One with no square it can reach stays where it stands and is
  named: "Stayed where they stand, with no free spot they can reach: Talo." The leader with no way there moves
  nobody: "No route there". A tab sent to the background keeps the waiting members in order (0.10 L3: its timers
  fire on whole seconds; the last still goes within 4 s of the drop). `planGroup(tokens,
  point)` dry-runs it (the shape, the leader, the target, each member's square, route, start delay and why it stays).
- **Several tokens in a fight — one at a time** (`groupDrags`; 0.9.0, the leader rule 0.10): nothing moves at the drop;
  the leader walks first, then the others one after the other (least walk left first), each a normal single move whose
  square is picked when its turn comes (behind where the leader came to rest in a march, round the target in a swarm)
  and routed round the tokens standing then (the ones already moved where they came to rest), a checkpoint at every
  square, charged exactly what it walks. The leader walks straight through its own group (0.10 L3; never through
  anyone else) and costs nothing extra for it (2024 rules: an ally's space is no Difficult Terrain); its moves end
  only on free squares, so a click while it is inside a member carries it on to the next free one. **A member whose
  speed runs out stops** on the last free square its movement this turn pays for (dnd5e's walking speed less what its
  movement history already cost this turn, as the system's own ruler colours it); one with nothing left does not
  move; both are named ("Out of movement this turn, stopped short: …"). A token with no speed on its sheet walks the
  whole way, as a single drag does; a single drag is unchanged. The leader with no way moves nobody ("No route there"). A stack (a
  mount and its rider) goes as one. About a second per member per 30 ft. A click on the walker, a turn change or a
  deleted member ends the queue (the members not sent are named, except after your own click); a new drop of other
  tokens leaves it running (0.10), one of its members dropped again leaves the queue. A walk that never ends is moved
  on after its own time plus 3 s. More than 24 (0.10; was 12): "In a fight, drag one token at a time."
- **Tokens that start stacked stay stacked**: a rider on its mount walks its mount's way at its offset; a mount
  dragged alone carries its rider.
- **Notices**: "No route there.", "Stopped short, way blocked.", "In a fight, drag one token at a time.", the
  members of a group drag that stayed, by name, the members a fight's queue (or a wave this screen no longer draws:
  you changed scene) did not send ("Did not move, the group's walk was ended: …"), the members of a fight's group drag
  whose movement ran out ("Out of movement this turn, stopped short: …"), and a stop that found no clear spot along
  its way (above). The reason behind each is in the telemetry (`telemetry()`) and in
  `status().group.told`.
- **Up to 24 tokens** in one group drag (0.10; was 12), out of combat and in a fight; more: core's own drop out of
  combat, refused in a fight.
- **Fail-open and the circuit breaker**: an exception inside a drop sends core's own move and is logged. After 3
  errors or 6 failed plans in a session the drag help switches itself off on that screen; on the GM's screen it also
  turns `assist` off for the table, and the GM is told either way.
- **"That move was wrong"** (Alt+W, rebindable): files the last ten seconds of this screen's drag telemetry as a Bug
  through pentaryn-feedback.
- **The GM's drag-help button** (Token controls, the route icon, next to the ghost button): one click turns
  pathfinding and group drags off for the whole table, so every drag is plain Foundry dragging; click again to turn
  them back on (world setting `assist`; turning it back on also clears a tripped breaker). Click to stop keeps
  working.
- **Out of combat** movement is free-form and smooth; **in combat** it stays on the grid (no arcs, a
  checkpoint at every square) so the cost is exact. Ghost and the GM's *Unconstrained Movement* tool
  go in straight lines, the group keeping its shape. Not for arrow keys, gridless or hex scenes.

**How ghost works.** It reuses the constrain options core's *Unconstrained Movement* tool passes
into a move (`ignoreWalls`, `ignoreCost`, and dnd5e's `ignoreTokens`), which core offers only to the
GM in `Token#_getDragConstrainOptions`: this module wraps that and
`TokenLayer#_prepareKeyboardMovementUpdates` and adds them while ghost is in effect for a player's
token. No collision code is reimplemented and no GM relay is needed: the constraint runs on the
mover's own client. Verified on core 14.370 / dnd5e 6.1.1.

## Settings

| Key | Scope | Default | |
|---|---|---|---|
| `ghostPolicy` | world | `exploration` | Off / Exploration only / Always allowed — `game.settings.get("pentaryn-movement", "ghostPolicy")` |
| `ghostPolicyLast` | world, hidden | `exploration` | the mode the GM button restores |
| `ghost` | client, hidden | `false` | this player's button |
| `ownedOnTop` | client | `true` | owned tokens on top — `game.settings.get("pentaryn-movement", "ownedOnTop")` |
| `pathfinding` | world | `everyone` | tier A, drag pathfinding: Everyone / GM only / Off (read live on every drag) |
| `pathfindMine` | client | `true` | this client's drags find a path (corners always rounded where free, 0.8.0) |
| `groupDrags` | world | `true` | group drags: out of combat the file, in a fight one member at a time (0.8.0; was `groupMovement`, migrated once; 0.9.0 folded tier C's `fightGroupDrags` in, its row deleted once; 0.10 deleted 0.9.0's `groupStagger`, B1 against B0, its stored row removed once) |
| `assist` | world | `true` | the table's drag help; off = plain Foundry dragging for everyone (pathfinding reads off, both tiers false); the GM's toolbar button flips it (0.4.9); the circuit breaker turns it off (0.8.0) |

Keybinding: `wrongMove` (Alt+W) files "that move was wrong" (0.8.0). Retired in 0.8.0: `smoothCorners` and
`clickToStop` (folded in, always on; dropped from each browser's storage at ready) and `groupMovement` (its value moved
to `groupDrags` by the active GM, then deleted); `status().migrated` says what was carried over.

`status().settings` lists the same keys with their scopes. Client settings live in the browser's
storage, shared by its tabs: flipping ghost or owned-on-top in one tab redraws the others.

## API — game.pentaryn.movement

Canonical: `game.modules.get("pentaryn-movement").api`; `game.pentaryn.movement` is the same
frozen object. Ask it what it offers: `game.pentaryn.movement.describe()` (offline:
`test/golden/describe.json`). Every row except `inspect`, `pathfind.status`, `pathfind.route`, `planGroup`, `stop`, `telemetry`, `reportTelemetry`, `fileWrongMove` and `selftest` is `legacy` (today's signatures).

| Method | GM | Writes | Returns |
|---|---|---|---|
| `status(opts?)` | — | — | policy, `combatOnScene`, allowed and why not, the player's switch, `patched.{drag,keyboard}`, then `sceneId`, `version`, `settings` (key → scope), `combatExempt` (ids of your tokens there that may ghost through the fight; `[]` when no fight blocks), `group` (0.4.0: the two settings, the drop/click wraps, the regime, the last drop and recent fallback reasons). `opts.sceneId` (or a bare scene id or Scene) asks about another scene (default: the viewed one); `sceneId` comes back as the id |
| `ghostFor(token)` | — | — | is ghost in effect for that token (a placeable or a TokenDocument) on this client; during a fight under *Exploration only*, true only for an incorporeal or GM-flagged token |
| `combatActive(sceneId?)` | — | — | does a combat stop ghosting there; takes a scene id or a Scene (default: the viewed one) |
| `setGhost(on)` | — | client setting `ghost` | the player's button. **Player clients only:** on a GM client (and so from the MCP bridge) it changes nothing for players |
| `setGhost(creature, { combat })` | yes | actor flag `ghostInCombat` | the GM's ghost-in-combat override for one creature (Actor, Token, TokenDocument, uuid, id or exact name; `combat` true sets, false clears); `{ ok, uuid, name, ghostInCombat, feat }` or a refusal object (`NOT_GM`, `NOT_FOUND`, `AMBIGUOUS`, `BAD_ARGS`) |
| `inspect(ref)` | — | — | `{ uuid, name, flag, feat, ghostInCombat }` for one creature (a token gives its own actor): the GM flag, the incorporeal feat's name or null, and whether either grants ghost in combat; throws coded `NOT_FOUND` / `AMBIGUOUS` / `BAD_ARGS` |
| `setPolicy(value)` | yes | world settings `ghostPolicy`, `ghostPolicyLast` | `"off" \| "exploration" \| "always"`; rejects with `Error("GM only")` on a player client |
| `pinsUnderTokens(scene?)` | — | — | map pins whose centre sits under a visible token on the same scene level (a pin shown on every level, or a token with no level, always counts), player-owned first; `scene` is a Scene or a scene id (an unknown id answers `[]`) (pins belong **beside** tokens: owned-on-top makes a pin under your token unclickable) |
| `pathfind.status()` | — | — | the mode, this client's two settings, `patched` (the `findMovementPath` wrap), the step-cache size, the limits, and `last`: what the last search did (`nodes`, `ms`, `reached` of `of` explicit waypoints, `arcs`, `improved`, `async`) |
| `pathfind.route(ref, { to, preview?, smooth? })` | — | — | dry run: the path a drag of that token to `to` (top-left pixels) would get, with its cost in feet; needs a browser tab showing the scene (the headless GM has no canvas) |
| `planGroup(refs, point)` | — | — | dry run of a group drop by the leader rule (0.10; the first ref is the grabbed one, the leader, `point` its top-left drop point): `shape` (`march` / `swarm`), `leader`, `target` (the token dropped on, or null), the plan's `ms`, `searches` and `failed`, the planning `order`, the start order (`starts`) and the last start (`total`), and per member its `slot` (top-left), `route` (its waypoints, top-left pixels), `waypoints` (their count), `delay` (ms after the drop; null when it does not move) and `stay` (why it stays: `noSpot`, `noRoute`, `blocked`, `budget`; null when it goes or is in place); `result` `none` when the leader has no way; needs a browser tab |
| `stop(ref)` | — | token position / its pending move | stop a moving token as a click would (no 400 ms arming); in combat a player's stop of a move the GM started goes to the active GM through the relay query `pentaryn-movement.stop`, a GM's goes to whoever started it (`pentaryn-movement.stopOwn`) |
| `telemetry(opts?)` | — | — | this client's drag telemetry (0.8.0): `summary` (counts per kind; plan time median / p95 / max; fallbacks and notices by reason code; fires per plan; the breaker's tallies), `tripped`, `events` (the ring buffer, or the last `opts.seconds`), `filed` |
| `reportTelemetry()` | — | a whisper | whispers this client's summary to the logged-in GMs (after a session); `NO_GM` with none |
| `fileWrongMove()` | — | a feedback report | what Alt+W does: the last ten seconds, filed as a Bug through pentaryn-feedback; `NO_FEEDBACK` without it |
| `selftest()` | — | — | `{ ok, checks }` |

Kit members: `describe()`, `version`, `contract`, `settings()`, `trace()`, `uninstall()`.
`core` is the pure module (`movement-core.mjs`), published as a frozen copy. Two queries: the `stop` relay
row (any sender, run on the active GM, which stops only a move it started) and the hand-registered `stopOwn`
(a GM sender only, run on the user who started the move; exceptions.json C30/C56: the kit cannot target a user).

## Data written

| Where | Path | Who | What |
|---|---|---|---|
| Actor (a token's synthetic actor for an unlinked token) | `flags.pentaryn-movement.ghostInCombat` | GM | `true` = its owner may ghost it during a fight (Token HUD toggle, `setGhost(creature, { combat })`); cleared with `unsetFlag` |

Settings: the world ones (GM) and the client ones (each player, for themselves). Moves: group waves
and stops write token positions through core's own movement updates.

## Flags other modules read

n/a — no other module reads `ghostInCombat` (ask `inspect(ref)` rather than the flag), and movement
reads no foreign flag.

## Events

Emits none of its own. The kit fires two hooks at publish: `pentaryn-movement.ready` `(api)` and `pentaryn.ready` `("movement", api, { when: "ready" })`.

Listens to (pinned in `test/golden/hooks.json`, in this order): `init` (once), `setup` (once),
`getSceneControlButtons`, `renderSceneControls`, `drawTokenLayer`, `canvasReady`, `refreshToken`,
`updateActor`, `updateToken`, `createCombat`, `updateCombat`, `deleteCombat`, `createCombatant`,
`updateCombatant`, `deleteCombatant`, `createToken`, `deleteToken`, `renderTokenHUD`, then pathfind's
`setup` (once), `createWall`, `updateWall`, `deleteWall`, `createRegion`, `updateRegion`, `deleteRegion`,
`createRegionBehavior`, `updateRegionBehavior`, `deleteRegionBehavior`, `createToken`, `updateToken`,
`deleteToken`, `controlToken`, `canvasReady` (each drops the step cache; `canvasReady` also listens to
the scene's fog "explored", which drops it too), then the drop's (0.9.0, was group's) `setup` (once), `preMoveToken` (each
next square of a move this client drives: the walls now, an undrawn token, standing tokens), `updateToken` (one undo
entry per move), `createWall` and `updateWall` (a wall across a walk out of combat stops it where drawn); the file's
`updateToken` (which group a move belongs to; another user's stop of a member stops the group this client sent),
`deleteToken` (a deleted member ends its fight queue), `updateCombat` and `deleteCombat` (a turn change or the
fight's end empties the fight queues; a hidden tab's `visibilitychange` is a DOM listener, not a hook); stop's `setup` (once), `moveToken` (when a move started, for the 400 ms
arming), `updateToken` (after an unanimated move, every client puts the token where the server has it),
`canvasReady` (the board pointerdown fallback) and `refreshToken` (a stopped token stays drawn where it stopped);
telemetry's `canvasReady`; and `ready` (once). 0.9.0 took out the reload resumes, the reservations, the runtime guard,
tier C's arrivals and the waiting cue, with their rows.

## Patches and adjustments

| Patch (`describe().patches`) | Adjustments row | What |
|---|---|---|
| `Token#_getDragConstrainOptions` | `movement-drag-constrain-ghost` | adds the three flags to a ghosting player's drag |
| `TokenLayer#_prepareKeyboardMovementUpdates` | `movement-keyboard-constrain-ghost` | the same for arrow keys (reads the private result shape `result[1].movement[id].constrainOptions`) |
| `TokenLayer.objects#sortChildren` | `movement-layer-sort-owned` | core's interaction sort plus the owned rank (reads `_lastSortedIndex`) |
| `Token#findMovementPath` | `movement-pathfind-find-path` | drag pathfinding: splices the found corners in and runs the original again (marker `__pentarynMovementPath`) |
| `Token#_prepareDragLeftDropUpdates` | `movement-group-drop` | the drop (0.9.0 `drop.mjs`): core's updates, then a single drag's route round standing tokens, a group's leader plan (0.10: march or swarm, each member's square and route; the first wave in the drop's own update); combat cell checkpoints (marker `__pentarynMovementGroup`) |
| `Token#_onClickLeft` | `movement-click-stop` | click to stop, before core's click (marker `__pentarynMovementStop`) |
| `Token#stopAnimation` | `movement-stop-animation-defuse` | every client: empties the tweens' queued links before core terminates them, so no stop throws core's "reading 'chain'" (marker `__pentarynMovementDefuse`) |
| `CanvasAnimation.animate` | `movement-canvas-animation-registration` | every client: a fresh movement tween's first frame counts only the time since it began, so a move that starts on a stalling page is not drawn ahead of its walk (0.6.3, `status().stop.firstFrames`); a chained tween that completes inside its own first frame (a slow page) leaves its running next link registered under the name, so a stop terminates it (marker `__pentarynMovementAnimReg`, 0.4.8) |

Not patches: `dnd5e-movement-pathfind-blocking` (the search asks dnd5e's
`TokenLayer5e#isOccupiedGridSpaceBlocking` which squares a creature blocks) and
`core-movement-group-drag-internals` (the drag contexts, `_draggedToken`, `_movementPlanningContext`, the
movement animation and `_shouldRecordMovementHistory`, read by the drop and click code).

The first three carry the `__pentarynMovement` marker and go through the kit (`wrapMethod`, and
`defineAccessor` for the sort, an instance property on each canvas draw's container).

## Two sessions / who writes

Client-only: nothing is elected and nothing runs on one client for everyone. Each client decides
ghost and the sort for its own user; a drop is planned and sent by the client that dropped it (never the headless GM,
which has no canvas), in the drop's own update and its later waves (or, in a fight, one single move a member). Every
client learns which tokens move together, and who sent them, from those updates' option `pentarynMovementGroup`: a
click on one member on any client stops it there, and the sender's client, seeing that stop, stops the rest. Since 0.9.0 nothing coordinates two users' drags: two
movers may brush, and each client's next-square test acts only on the moves it drives (`doc.movement.user.isSelf`).
The `stop` relay is answered by the active GM only for a
move that client started; `stopOwn` by the client that started it, for a GM. A player's client clears its
own `ghost` setting when ghost stops being allowed; only a GM writes the world settings and the
`ghostInCombat` flag (from the GM client that clicked or called; the headless GM bot is a GM client too).

## Extending

1. A pure rule → `movement-core.mjs`, with a case in `test/core-rules.test.mjs`.
2. A label → a literal key in one of core's key maps (`TOOL_KEYS`, `NOTIFY_*`, …) and `lang/en.json`.
3. A hook → `reg.on(...)` inside `install()` in `ghost.mjs` (order matters: re-pin `hooks.json`
   only as a declared change).
4. A setting → a row in `settings.mjs` with literal `name`/`hint` and `onChange: forward(key)`;
   react to it through `ctx.onSettingChange(key, fn)`.
5. An API method → a row in `api-manifest.mjs` + its implementation in `api.mjs`, then
   `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review the diff.

## Pitfalls

- It wraps **private** core members (`_getDragConstrainOptions`, `_prepareKeyboardMovementUpdates`,
  `_lastSortedIndex`). After a core or dnd5e update, check `status().patched` is
  `{ drag: true, keyboard: true }` and run the three adjustments rows' check.
- Missing methods are warned once at `setup` (`no Token#_getDragConstrainOptions; ghost drag disabled`).
- The GM never ghosts through this module (core's own tool is the GM's).
- Ctrl+Z undoes the whole move, a fight's every square too (0.8.3). A reload mid-walk does not resume it (0.9.0): the
  token stays on the square it holds.
- In a fight each next square of a move this client drives is tested before it is sent (0.9.0, Joe's rule of
  2026-11-23): against the movement walls as they are now (closed doors, new walls, a Wall of Stone; never vision, so
  dark squares and blinded creatures still move), never from a page that no longer draws the token (core would send it
  unmeasured, at 0 ft, and through shut doors), never into a token standing still. A token stopped there stays on the
  square it holds, charged for the squares it walked.
- The next-square test touches only moves the module drove (a drag, or a move carrying its options): a macro's or
  MCP's `update({x, y})`, Argon's Dash and forced movement go as core moves them (C10).
- Two tokens that are both moving may brush (Joe, 2026-11-24); a token standing still, a wall and a rest overlap are
  never crossed.
- The circuit breaker trips per session: a reload, or the GM turning `assist` back on, clears it.
- The incorporeal test is by **feat name** (`INCORPOREAL_FEATS`); a differently named trait needs the GM toggle.
- Errors in the per-frame hooks (`refreshToken`, `renderSceneControls`) warn once per session.

## Files

| File | Role |
|---|---|
| `movement.mjs` | entry: wiring only (lifecycle, publish) |
| `movement-core.mjs` | pure rules, constants, label key maps |
| `settings.mjs` | the `SETTINGS` and `KEYBINDINGS` tables, the assist switch and the breaker's trip, the 0.8.0 migration |
| `combat-adapter.mjs` | combats and scenes → plain core inputs |
| `ghost.mjs` | the feature: patches, sort (0.10: the leader of a moving group drawn on top on every screen), toolbar, refresh, the incorporeal exception on the player's side |
| `ghost-combat.mjs` | the GM's ghost-in-combat flag: Token HUD toggle, `setGhost(creature, { combat })`, `inspect` |
| `pathfind-core.mjs` | pure: A*, cost-preserving string pulling, corner arcs, the skip rules |
| `pathfind-adapter.mjs` | a token and its drag options → wall / creature / cost step tests (reads only) |
| `pathfind.mjs` | the feature: the `findMovementPath` wrap, the step cache, `pathfind.status` / `route` |
| `motion-core.mjs`, `group-core.mjs` | pure: trajectories, conflicts, how long two movers are close (`closeTime`), waves, cell chains, clearAlong, one-way walls (`wallOpenFrom`), decision tables; cuts (`freePrefix`), the flood, one undo entry per move, tokens that start stacked (`stacksOf`; 0.10 L2, from the deleted `sequence-core.mjs`) (0.9.0: the 0.8 planner, settle and the rest passes are gone; 0.10: the candidate lattices too) |
| `telemetry-core.mjs`, `telemetry.mjs` | pure: the ring buffer, its summary and report text, the breaker's rule; the feature: telemetry, the circuit breaker, the Alt+W key (0.8.0) |
| `group-adapter.mjs` | tokens and drag contexts → member records, rest and wall tests (reads only) |
| `drop.mjs` | the feature (0.9.0, was `group.mjs`): the drop wrap — single drops, the file's first update and its later waves, the fight queue, a fight's every square, a wall across a walk, riders, undo |
| `file-core.mjs` | pure (0.10): `planLead` — the leader rule (march and swarm ranks, each member's best reachable square and one route, the members that stay), `walkFrom` (the floods); `staggerFile` — the motion (0.10 L2, R5): the leader at once, the pack a wave later, single file only at a narrow point (`narrowZones`), a member held while another would walk through it at rest, the last within 4 s |
| `file.mjs` | the feature (0.10): the shape from the drop (`targetOf`), planLead's oracles on the canvas (rest test, one step on the pathfinder's shared memo, routes round circles), a fight's order and each member's square at its turn, the dry run, which tokens move together, the waves' timers and a hidden tab's (whole seconds, the last by 4 s), the fight queues and what empties them, the group-wide stop |
| `stop.mjs` | the feature: the click wrap and `stop` |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/movement.css` | the dimmed combat badge (`.pm-blocked`) |
| `lib/` | the vendored kit (`vendor.py`; never edited here) |

## Tests

`node test/run.mjs` from this folder: core rules, the glue driven through its hooks and settings
(frozen characterisation from the migration checkpoint), the hook manifest, patch records, the API
goldens, i18n keys and logging; `pathfind-core.test` (A* on synthetic wall maps: corners, doors,
one-way walls, a 2×2 token, difficult terrain, a hostile in a doorway, cost equality) and
`pathfind.test` (the wrap against a token whose core path stops at the first wall); `group-props.test` (the flood, `freePrefix`, trajectories, waves, click rows), `lead.test` (the leader plan, 0.10 L1: the tunnel repro, march, swarm rings round Medium / Large / Huge, and the gate: 800 seeded
floors and tunnels with 2-20 members, every member in place or named, no rest overlap, no route into a standing token,
an earlier slot or a member that stays, march nobody beside or ahead, swarm the leader touching whenever it could, at
most 1.2 searches a member and under 3 % failed; planning time), `file-core.test` (the motion on the leader plan's
routes, 0.10 L2: open ground is the leader plus one wave, a file of 20 one wave, a door single file and spread out
past it, a leader anywhere in a one-wide tunnel of 2 to 20 reaches the front in 400 seeds, the last within 4 s, and on
800 seeded drops nobody walking into a member at rest and no two in one narrow point; L3: a drop's waves in the order
every screen sees them), `fight.test` (0.10 L3, the fight's pure side: the order, where a walk may rest, where its speed
runs out, the order one stop settles walkers in) and `drop.test` (the drop and click wraps, the
file on the synthetic board with its three handlers, the fight queue and what ends it, the 0.9.0 step 1 gate: 60
seeded fight drags charged exactly 5 ft a square, a door shut mid-walk, and L3's: 60 seeded fight queues, the leader
first and through its members, the same charge with or without them in its way, and 200 seeded speed stops);
`telemetry-core.test` and `telemetry.test` (the ring, the
breaker, Alt+W, the settings migration), `regressions.test` (every round ID a comment cites names a test). `test/sim/` is the
simulator (0.9.0 step 5; 0.10 L1 the leader plan, L2 its motion, L3 the fight and its own kinds of seed, Joe's
playground stations among them): the real cores (`file-core` planLead / staggerFile, `motion-core` clearAlong /
fightWalk / stopOrder, the pathfind-core A*) on virtual clients over a jittered, lossy network;
`sim.test.mjs` runs 60 seeds and one regression seed per defect it found; `make foundry-movement-sim
SEEDS=10000` is the full run. Fixtures are
synthetic (`test/` is published). One golden: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, review the diff.

**Verify live (as a player):**

1. Policy *Exploration only*, no combat: the ghost button shows; turning it on makes your tokens
   translucent, and a drag goes straight through a wall and through a hostile creature.
2. Start a combat with a combatant on the scene: the button switches off with a toast, is dimmed,
   and a drag stops at walls. An encounter holding only a **hidden** combatant changes nothing;
   revealing it switches ghost off.
2b. Summon an Undead Spirit (Incorporeal Passage) into that fight: one toast, the spirit drags
   through a wall, your character still stops at it. The GM's Token HUD toggle does the same.
3. GM clicks the GM button: the players' buttons disappear; click again and they come back.
4. Two tokens overlapping: the player's own is drawn on top and takes the click; the GM's view is unchanged.
5. `game.pentaryn.movement.selftest().ok` is true.
6. Drag movement: the play-test list in `context/plans/pathfinding-2026-11.md` §9 (pathfinding)
   and §12 "Acceptance tests" → Live (groups, click to stop); `status().group.last` shows the last drop.

## Sync

`.mjs`, `.css` and `lang/` changes need a reload; `module.json` changes need a Foundry restart.
