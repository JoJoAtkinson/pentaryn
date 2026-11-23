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

**Drag movement (everyone; 0.3.0 pathfinding, 0.4.0 groups and click to stop, 0.8.0 tiers).** Nothing new to
learn: you drag, it works out the rest. The table-side detail is `context/foundry/movement.md`. It ships in three
tiers, each with its own switch, and a tier that has not passed its acceptance rounds ships switched off:

- **Tier A — one token** (`pathfinding`): past a wall the ruler goes around it — the shortest way, through open
  doors only, round tokens standing in the way and costlier terrain, a big token only where it fits; corners rounded
  where an arc costs nothing extra (always, 0.8.0). Players route only round walls they have seen, over ground they
  have explored or can see; never a secret door, never through a teleport / change-level region unless it ends there.
  What the ruler shows is what the drop walks and charges. No way there: nothing moves, "No route there".
- **Click a moving token to stop it** (always on, 0.8.0) once it has moved 400 ms: out of combat it stops **exactly
  where it is drawn** (Joe, 2026-11-23); one whose body is across a door's line is carried just past the line along
  its own route. In a fight it finishes the square it is in, so the movement spent stays exact; a GM may stop anyone's
  move. A click on one member of a group stops the whole group, or only the clicker's own members when it does not own
  them all; the others stop short behind them.
- **Tier B — several tokens out of combat** (`groupDrags`): each walks its own way to its own spot by the drop point,
  setting off together on open ground and in turn at a door, filing through, never resting on another, never through
  a token standing in the way (it stops short: "Stopped short, way blocked"). Two people dragging at once read each
  other's reserved moves in the server's order and the later one yields; a publish-first round trip runs only when
  another user is viewing the same scene (0.8.0: never for the canvas-less headless GM). A runtime guard watches each
  move a moment ahead and has the later mover give way. A tab sent to the background sends its group's later waves
  at once, each cut where it would meet another or the first wave (0.8.0; 0.8.1: also a group made while the tab was
  already in the background), so nobody waits for an alt-tabbed player.
- **Tier C — several tokens in a fight** (`fightGroupDrags`, **off by default** until it passes): by space, not time.
  Members whose swept corridors never meet set off together; every other member sets off on the **arrival** of the one
  before it whose corridor meets its own. A door shutting on a fight's group move stops everyone on the square they
  hold (a square already committed past the door got through). Off, a fight's group drag is core's move with each
  member's path cut before the first token standing in it, every square a checkpoint, still one group for a click.
- **Tokens that start stacked stay stacked** (0.8.0): a rider on its mount, a familiar on a shoulder, a grappled pair
  walk their leader's way at their offset, in its wave; nothing at rest is ever moved off anything afterwards.
- **One clock per move** (0.8.0): every wait (queue, start delay, a guard's yield, a fight member waiting for an
  arrival) ends by the move's one 10 s deadline; then it stays where it is, "Stopped short, way blocked". A queued or
  yielding token wears an amber dashed ring on the screen of whoever moved it, so nobody drags it again.
- **Two notices only**: "No route there." and "Stopped short, way blocked." The reason behind each is in the
  telemetry (`telemetry()`), not on screen.
- **Fail-open and the circuit breaker** (0.8.0): an exception inside a move sends core's own move (cut before standing
  tokens) and is logged. After 3 errors or 6 failed plans in a session the drag help switches itself off on that
  screen; on the GM's screen it also turns `assist` off for the table, and the GM is told either way.
- **"That move was wrong"** (Alt+W, rebindable): files the last ten seconds of this screen's drag telemetry as a Bug
  through pentaryn-feedback.
- **The GM's drag-help button** (Token controls, the route icon, next to the ghost button): one click turns
  pathfinding and group drags off for the whole table, so every drag is plain Foundry dragging; click again to turn
  them back on (world setting `assist`, 0.4.9; turning it back on also clears a tripped breaker). Click to stop keeps
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
| `groupDrags` | world | `true` | tier B, group drags out of combat (0.8.0; was `groupMovement`, migrated once) |
| `fightGroupDrags` | world | `false` | tier C, group drags in a fight by space (0.8.0); off = core's move with hard-obstacle cuts |
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
| `telemetry(opts?)` | — | — | this client's drag telemetry (0.8.0): `summary` (counts per kind; plan time median / p95 / max; fallbacks and notices by reason code; fires per plan; the breaker's tallies), `tripped`, `cued` (tokens wearing the waiting ring), `events` (the ring buffer, or the last `opts.seconds`), `filed` |
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
the scene's fog "explored", which drops it too), group's and stop's `setup` (once each), stop's `moveToken`
(when a move started, for the 400 ms arming), stop's `updateToken` (0.4.2: after an unanimated move, every
client puts the token where the server has it), stop's `canvasReady` (the board pointerdown fallback), and
`ready` (once). Group's `updateToken` rows (0.4.4 a turn change stops the group; 0.4.9 the group tag every
client keeps, and a member another user stopped) come between group's `ready` and its `createWall`, then (0.6.0)
the reservation rows: `updateToken` (a reservation arrives), `moveToken` (a reserved token sets off, walks on or its
reservation goes; since 0.7.0 also each move's place in the server's order, which the guard reads as priority) and
`stopToken` (a stopped token's reservation goes). Last, before `ready`, the guard's (0.7.0): `moveToken` (it watches
the moves this client started; its own pause, walk-on and re-route keep their yield), `stopToken` (a stop it did
not make lets go) and `canvasTearDown` (it forgets the scene's moves). The guard runs on the canvas ticker (after
the frame's tweens) only while this client has a move to watch, and has no timers.

## Patches and adjustments

| Patch (`describe().patches`) | Adjustments row | What |
|---|---|---|
| `Token#_getDragConstrainOptions` | `movement-drag-constrain-ghost` | adds the three flags to a ghosting player's drag |
| `TokenLayer#_prepareKeyboardMovementUpdates` | `movement-keyboard-constrain-ghost` | the same for arrow keys (reads the private result shape `result[1].movement[id].constrainOptions`) |
| `TokenLayer.objects#sortChildren` | `movement-layer-sort-owned` | core's interaction sort plus the owned rank (reads `_lastSortedIndex`) |
| `Token#findMovementPath` | `movement-pathfind-find-path` | drag pathfinding: splices the found corners in and runs the original again (marker `__pentarynMovementPath`) |
| `Token#_prepareDragLeftDropUpdates` | `movement-group-drop` | group movement: core's updates, then the plan's routes and waves; combat cell checkpoints (marker `__pentarynMovementGroup`) |
| `Token#_onClickLeft` | `movement-click-stop` | click to stop, before core's click (marker `__pentarynMovementStop`) |
| `Token#stopAnimation` | `movement-stop-animation-defuse` | every client: empties the tweens' queued links before core terminates them, so no stop throws core's "reading 'chain'" (marker `__pentarynMovementDefuse`) |
| `CanvasAnimation.animate` | `movement-canvas-animation-registration` | every client: a fresh movement tween's first frame counts only the time since it began, so a move that starts on a stalling page is not drawn ahead of its walk (0.6.3, `status().stop.firstFrames`); a chained tween that completes inside its own first frame (a slow page) leaves its running next link registered under the name, so a stop terminates it (marker `__pentarynMovementAnimReg`, 0.4.8) |

Not patches: `dnd5e-movement-pathfind-blocking` (the search asks dnd5e's
`TokenLayer5e#isOccupiedGridSpaceBlocking` which squares a creature blocks) and
`core-movement-group-drag-internals` (the drag contexts, `_draggedToken`, `_movementPlanningContext`, the
movement animation and `_shouldRecordMovementHistory`, read by the group and click code).

The first three carry the `__pentarynMovement` marker and go through the kit (`wrapMethod`, and
`defineAccessor` for the sort, an instance property on each canvas draw's container).

## Two sessions / who writes

Client-only: nothing is elected and nothing runs on one client for everyone. Each client decides
ghost and the sort for its own user; a group's later waves are timers on the client that dropped it
(never the headless GM, which has no canvas). Every client keeps the reservations it receives (update options
`pentarynMovementPlan` / `pentarynMovementRid`), in the server's order; the client that dropped publishes and
decides at its echo, nobody else acts on it (0.6.0). The runtime guard (0.7.0) acts only on the moves its own client
started (`doc.movement.user.isSelf`): it reads what every client sees (positions, the reservations, core's relayed
"paused" state) and never writes another client's token or relays anything. The `stop` relay is answered by the active GM only for a
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
- Group waves run on the dropping client; a tab in the background sends them at once (0.8.0; 0.8.1 SIM-04/05), closing it
  mid-move strands unsent members; Ctrl+Z undoes the whole move, every wave and a fight's every square (0.8.3). A reloaded page sends what it had left only when it is
  back within 1.5 s of the first unsent wave; later than that those members stay where they are ("Stopped short").
- In a fight a door shutting on a group move stops everyone of it on the square they hold (0.8.0): nothing is undone
  and nothing walks on, so a token whose next square was already committed past the door got through. A fight's
  group drag with tier C off is core's move (members walk at once, each cut before the first standing token): two
  members may brush while moving; tier C's order is what keeps them apart (a member follows one before it once that one
  is far enough ahead, 0.8.3). Each next square of a fight move this client drives is not sent into a token standing
  still on its screen, nor at all once its page no longer draws the token (the dragger viewing another scene: core
  would send it unmeasured, at 0 ft, and through shut doors); the token stops on the square it holds (0.8.3).
- The runtime guard and the next-square check touch only moves the module drove (a drag, or a move carrying its
  options): a macro's or MCP's `update({x, y})`, Argon's Dash and forced movement go as core moves them (C10).
- A drop that waits for, or queues behind, another reserved move wears the amber ring until it sets off, at most until
  its move's 10 s deadline: that is the yield, not a hang. `status().group.last.queued` / `.delay` / `.raced`.
- The guard firing (`status().guard.fired`, a console line `yield guard: … gives way to …`) is a planner miss, not
  the design working: note the case. It runs out of combat only (0.8.0): its pause is a stop where the token is
  drawn (an unanimated write, like a click-stop) and its walk on a new move.
- Priority is honour-system: any client can set `pentarynMovementKeep` or `pentarynMovementGuard` on its own moves
  and keep its place in the server's order. Fine at a home table; a hostile client could jump the queue.
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
| `motion-core.mjs`, `group-core.mjs` | pure: trajectories, conflicts, waves, cell chains, decision tables; slots, routes, delays |
| `reserve-core.mjs`, `reserve-adapter.mjs` | pure: the reservation wire, registry, race, delay, queue and cut; the registry each client keeps and its reads (0.6.0) |
| `guard-core.mjs`, `guard.mjs` | pure: who yields to whom, the look ahead, a resume's whole-way check, backing out, the yield's clock (3 s re-route, rest at 8 s or the move's deadline), the bucket grid; the feature: the runtime yield guard on the canvas ticker, out of combat (0.7.0; 0.8.0) |
| `lifecycle-core.mjs` | pure: one state machine per move, one 10 s deadline (0.8.0) |
| `sequence-core.mjs` | pure: a fight's group move by space (corridors, arrival order, cuts) and tokens that start stacked (0.8.0) |
| `telemetry-core.mjs`, `telemetry.mjs` | pure: the ring buffer, its summary and report text, the breaker's rule; the feature: telemetry, the circuit breaker, the Alt+W key (0.8.0) |
| `cue-ui.mjs` | the amber waiting ring on a held token (0.8.0) |
| `group-adapter.mjs` | tokens and drag contexts → member records, rest and gap tests (reads only) |
| `group.mjs`, `stop.mjs` | the features: the drop wrap and its waves; the click wrap and `stop` |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/movement.css` | the dimmed combat badge (`.pm-blocked`) |
| `lib/` | the vendored kit (`vendor.py`; never edited here) |

## Tests

`node test/run.mjs` from this folder: core rules, the glue driven through its hooks and settings
(frozen characterisation from the migration checkpoint), the hook manifest, patch records, the API
goldens, i18n keys and logging; `pathfind-core.test` (A* on synthetic wall maps: corners, doors,
one-way walls, a 2×2 token, difficult terrain, a hostile in a doorway, cost equality) and
`pathfind.test` (the wrap against a token whose core path stops at the first wall); `group-core.test`
(the plan's unit acceptance tests on ASCII floors) and `group.test` (the drop and click wraps); `reserve-core.test`
and `reserve-props.test` (the reservations: the registry, and seeded scenarios where a later or racing plan never
meets an earlier one, a single drag waits or is cut, and everything rests in bounded time); `guard-core.test`,
`guard-props.test` and `guard.test` (the runtime guard: its rules; seeded scenarios out of combat and in a fight where
movers cross each other and walk through standing tokens, sampled every 5 ms: nobody comes inside touching by more
than 0.1 square, nobody gives way to a later mover, everything rests in bounded time, a fight rests on whole squares
and pays the squares walked; and the glue against a synthetic board); `lifecycle-core.test` (the state machine and
the composed clocks bounded by 10 s), `sequence-core.test` (tier C: corridors, arrival order, cuts, stacks, and 500
seeded fights where sequenced walks with random arrival latency never meet), `telemetry-core.test` and `telemetry.test`
(the ring, the breaker, Alt+W, racers, the settings migration), `regressions.test` (every round ID a comment cites
names a test), `sim/sim.test` (0.8.1: the simulator's smoke seeds and one regression per defect it found). The
simulator itself (`test/sim/`: virtual clients, a fake clock, jittered latency, loss, fog stalls, a backgrounded
initiator, generated maps, every invariant on every client's drawn view; its runner is the repo's
`scripts/foundry/movement_sim.mjs`) runs from the repo root:
`make foundry-movement-sim SEEDS=10000` (`SEED=N` for one seed's record); use-doc `context/foundry/movement.md`,
"The simulator". Fixtures are
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
