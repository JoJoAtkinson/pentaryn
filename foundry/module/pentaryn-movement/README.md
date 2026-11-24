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
  along its own route just clear of it (0.9.0 step 5; never through a wall; with nowhere along its way, the nearest
  clear spot). In a fight it finishes the square it is in,
  so the movement spent stays exact; a GM may stop anyone's move. A click on any member of a moving group stops the
  whole group (Joe, 2026-11-24): the dragger's screen stops the rest, and the members not yet sent stay where they
  stand.
- **In a fight, every square is checked before it is sent** (Joe, 2026-11-23): against the walls as they are now (a
  door shut mid-walk stops the token on the square it holds, charged for the squares it walked); never from a screen
  that no longer shows the token's map; never into a token standing still.
- **A door shut or a wall raised across a walk out of combat** stops it where it is drawn; a group member not yet
  sent whose way it crosses stays where it stands, named.
- **Several tokens out of combat — the file** (`groupDrags`; 0.9.0): at the drop every member gets its own spot, the
  free one nearest its place in the formation that it can reach without going round the far side of a wall (a place
  that lies behind the room's wall, off the scene or in rock: the nearest spot to it that the drop point reaches), and a
  route round the tokens standing outside the drag and round the spots already given out. Then each gets a start
  delay: on open ground all set off at once; through a door they file, each waiting only as long as it needs not to
  meet the ones before it, and the last one is on its way within 4 s of the drop. Nobody rests on anybody, nobody
  walks through a token standing still or onto a mate's spot; two members both moving may brush on the way. One with
  no spot it can reach stays where it stands and is named: "Stayed where they stand, with no free spot they can reach:
  Talo." Nobody able to go is "No route there". A tab sent to the background sends the waiting members at once.
  `planGroup(tokens, point)` dry-runs it (each member's spot and start delay).
- **Several tokens in a fight — one at a time** (`groupDrags`; 0.9.0): nothing moves at the drop; the members walk one
  after the other, each a normal single move routed when its turn comes, round the tokens standing then (the ones
  already moved where they came to rest), a checkpoint at every square, charged exactly what it walks. A stack (a
  mount and its rider) goes as one. About a second per member per 30 ft. A click on the walker, a turn change, a new
  drop or a deleted member ends the queue (the members not sent are named, except after your own click or drop); a
  walk that never ends is moved on after its own time plus 3 s. More than 12: "In a fight, drag one token at a
  time."
- **Tokens that start stacked stay stacked**: a rider on its mount walks its mount's way at its offset; a mount
  dragged alone carries its rider.
- **Notices**: "No route there.", "Stopped short, way blocked.", "In a fight, drag one token at a time.", the
  members of a group drag that stayed, by name, and the members a fight's queue did not send ("Did not move, the
  group's walk was ended: …"). The reason behind each is in the telemetry (`telemetry()`) and in `status().group.told`.
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
| `groupDrags` | world | `true` | group drags: out of combat the file, in a fight one member at a time (0.8.0; was `groupMovement`, migrated once; 0.9.0 folded tier C's `fightGroupDrags` in, its row deleted once) |
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
| `planGroup(refs, point)` | — | — | dry run of a group drop (the first ref is the grabbed one, `point` its top-left drop point): each member's slot, start delay, level (0 delay · 1 re-plan or another spot · 2 go last · `short` no route round the tokens in its way, as far as it is free · `cut` stopped short so nothing meets it · `stay` does not move; 0.5.0: there is no `relaxed` or `core` member any more), `short`, and `anchorRoute` (`reached`, `ms`, `waypoints`: the grabbed token's route, searched first with the pathfinder's full budget, as its drag preview is); needs a browser tab |
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
| `Token#_prepareDragLeftDropUpdates` | `movement-group-drop` | the drop (0.9.0 `drop.mjs`): core's updates, then a single drag's route round standing tokens, a group's one-pass slots and routes (B0, one update); combat cell checkpoints (marker `__pentarynMovementGroup`) |
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
| `ghost.mjs` | the feature: patches, sort, toolbar, refresh, the incorporeal exception on the player's side |
| `ghost-combat.mjs` | the GM's ghost-in-combat flag: Token HUD toggle, `setGhost(creature, { combat })`, `inspect` |
| `pathfind-core.mjs` | pure: A*, cost-preserving string pulling, corner arcs, the skip rules |
| `pathfind-adapter.mjs` | a token and its drag options → wall / creature / cost step tests (reads only) |
| `pathfind.mjs` | the feature: the `findMovementPath` wrap, the step cache, `pathfind.status` / `route` |
| `motion-core.mjs`, `group-core.mjs` | pure: trajectories, conflicts, waves, cell chains, decision tables; candidates, cuts (`freePrefix`), the flood, one undo entry per move (the 0.8 planner still in it goes in §4 step 6) |
| `sequence-core.mjs` | pure: tokens that start stacked, and `sequence` (the file's start order, a fight queue's order) |
| `telemetry-core.mjs`, `telemetry.mjs` | pure: the ring buffer, its summary and report text, the breaker's rule; the feature: telemetry, the circuit breaker, the Alt+W key (0.8.0) |
| `group-adapter.mjs` | tokens and drag contexts → member records, rest and gap tests (reads only) |
| `drop.mjs` | the feature (0.9.0, was `group.mjs`): the drop wrap — single drops, the file's first update and its later waves, the fight queue, a fight's every square, a wall across a walk, riders, undo |
| `file-core.mjs` | pure (0.9.0): B0 — every member's slot and route in one pass, the members that stay, the orders tried; B1 — the capped start delays (`staggerFile`) |
| `file.mjs` | the feature (0.9.0): B0's oracles on the canvas (rest test, walk flood, routes round circles), the dry run, which tokens move together, the waves' timers and the hidden-tab flush, the fight queues and what empties them, the group-wide stop |
| `stop.mjs` | the feature: the click wrap and `stop` |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/movement.css` | the dimmed combat badge (`.pm-blocked`) |
| `lib/` | the vendored kit (`vendor.py`; never edited here) |

## Tests

`node test/run.mjs` from this folder: core rules, the glue driven through its hooks and settings
(frozen characterisation from the migration checkpoint), the hook manifest, patch records, the API
goldens, i18n keys and logging; `pathfind-core.test` (A* on synthetic wall maps: corners, doors,
one-way walls, a 2×2 token, difficult terrain, a hostile in a doorway, cost equality) and
`pathfind.test` (the wrap against a token whose core path stops at the first wall); `group-core.test`
(the 0.8 planner's unit acceptance tests on ASCII floors, until §4 step 6), `file-core.test` (B0's gate: 800 seeded
drops on random floors and the hard-case dungeon, every member sent or named, no route through a standing token or an
earlier slot, no two at rest overlapping; B1's gate on the same 800: every delay a wave step, the last within 4 s,
open ground all 0, two movers meeting in fewer drops than all at once) and `drop.test` (the drop and click wraps, the
file on the synthetic board with its three handlers, the fight queue and what ends it, and the 0.9.0 step 1 gate: 60
seeded fight drags charged exactly 5 ft a square, a door shut mid-walk);
`sequence-core.test` (stacks, and tier C's sequence), `telemetry-core.test` and `telemetry.test` (the ring, the
breaker, Alt+W, the settings migration), `regressions.test` (every round ID a comment cites names a test). `test/sim/` is the
simulator (0.9.0 step 5): the real cores (`file-core` planFile / staggerFile / waveWays / candidatesFor, `motion-core`
clearAlong, `sequence-core`, the pathfind-core A*) on virtual clients over a jittered, lossy network;
`sim.test.mjs` runs 60 seeds as B1 and B0 and one regression seed per defect it found; `make foundry-movement-sim
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
