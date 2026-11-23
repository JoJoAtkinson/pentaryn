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

**Drag movement (everyone; 0.3.0 pathfinding, 0.4.0 groups and click to stop).** Nothing new to
learn: you drag, it works out the rest. The table-side detail is `context/foundry/movement.md`.

- **Past a wall the ruler goes around it** — the shortest way, through open doors only, round hostile
  creatures and costlier terrain, a big token only where it fits; corners rounded where an arc costs
  nothing extra. Players route only round walls they have seen, and only over ground they have explored
  or can see. A route never uses a secret door (open or shut) or crosses a teleport / change-level region
  (a scene link) unless it ends there. A straight drag is core's own, but it too bends round such a region
  rather than walk into it (0.4.5).
- **Drag several tokens together** and each walks its own way to its own spot by the drop point,
  all setting off together on open ground and in turn only at a door, so they file through it one behind
  the other, never resting on top of each other (circles: touching is fine), and round tokens that stay
  where they are (0.4.8). The grabbed token lands exactly where dropped, unless that is on another token:
  then the nearest clear spot it can reach (0.4.8). A plan whose own work takes over 2.5 s, or that has
  not finished 5 s after the drop, is core's own drop (1.2 / 2.5 s until 0.4.11). A route search that only ran
  out of time is finished, never read as "no route" (0.4.11). Members set off only once a token outside the
  group walking through their way has passed (0.4.11). Dropped where the grabbed token has no way to go,
  nobody moves and the dragger gets a short "No route there" warning (0.4.9; a single token too). A single
  drop lands where the pointer comes up, and one released before its route search has finished goes once
  the search is done (0.4.10). **Tokens standing in the way are walls (0.5.0)**, for a single drag and a
  group, in a fight too: every route goes round them however long that is, nobody rests on one, and a token
  whose only way runs through one walks only as far as it is free and stops there ("No route there"); nothing
  ever walks through another token to get somewhere. A single drag in a fight goes round them square by square
  too, and the squares it walks are what it spends (0.5.1). While you drag a single token, the ruler already shows
  the way round them and what it costs, so the feet you see are the feet you spend (0.5.2). A single drag in a fight
  whose way is blocked by tokens walks square by square up to the first one and stops there (0.5.2). A member cut
  short never rests in a one-wide corridor or a doorway (0.5.1); a big token cut short rests on whole squares, a
  single drag too (0.5.2). Members that start side by side never brush each other as one leaves (0.5.2). Members of a group, and one walking in another's wake in a
  different wave, keep 0.75 square of slack for the network (0.25 before). A re-plan round members already
  at rest is never more than 4 squares, or half the direct way, longer: past that a member waits its turn
  (0.4.10). A big
  token never walks where its body does not fit (core tests walls at the centre only): it takes a wider way
  round when there is one, else it stops before the gap, clear of the frame, and the GM is told (0.4.9).
- **Two people dragging at the same moment never walk through each other (0.6.0).** Every drop, a single token's
  too, reads the moves already reserved (every other client's whole plan, its later members too) and walks round
  them in time: it waits a moment, or takes another spot, rather than meet one. When the way is shut by a move
  still walking it (a one-wide corridor someone is coming down), it waits at its start until that one is through,
  up to 8 s in all (it waits again when that one runs late or another comes), then goes; still in the way, it walks
  as far as it can and says "Another move is still in the way" (or that it stays where it is).
  With another player online a drop sets off one network round trip after you let go (it checks nobody reserved
  the same space first); if two drops cross at the same instant, the second the server saw plans again round the
  first. Hidden tokens are never announced to players. `status().group.reservations`.
- **A hidden token the GM drags steps out of the players' way (0.6.2).** The players' drops cannot see it, so they
  plan through where it stands; when the GM's drop has to wait (a start delay, or a queue) where one of their walks
  will pass, it first steps to the nearest free spot off every walk, then goes on to where it was dropped. Out of
  combat only; its way on goes round the tokens standing in it (0.6.3); a hidden token nobody is moving stays where it is. `status().group.reservations.aside`.
- **Nothing walks into anything while it moves (0.7.0, the runtime yield guard).** A safety net under the plans: each
  client watches the moves it started, a moment ahead, and when one is about to come inside another token it gives
  way. Everyone gives way to a token standing still; of two moving, the one whose move the server saw later gives
  way (within a group, its plan's order), so two clients never both give way for one meeting, and a hidden token
  gives way to a player's. Out of combat it stops where it is (stepping back off the other's way when it would stand
  in it) and walks on once its way is clear; in a fight it waits on the whole square it is walking to (its next
  square is held back, nothing is displaced), before a door rather than in it, and pays only for the squares it walks. 3 s after it
  first waited it looks for a way round once; at 8 s it stays where it is (the nearest free spot) and says so
  quietly. Each time it fires is logged in the console and in `status().guard`: it means a plan missed something.
- **Click a moving token to stop it** once it has moved 400 ms (a click right after the drop, or a double
  click for the sheet, is a plain click): out of combat it steps onto the nearest free whole square (never
  across a door's line or a wall, never on another token; 0.4.9). In a fight it stops at the next square, so
  dnd5e's spent movement stays exact; a GM may stop anyone's move. A click on one member of a group stops the
  whole group (0.4.9); when you do not own every member (a player's token in the GM's group), only your own
  members stop, out of any one-wide corridor or doorway when there is room within 3 squares (0.4.10), and the
  GM's client walks the rest round them. In a fight, two that finish their squares on one square are set apart
  once at rest (0.4.10), and one a stop leaves in a one-wide corridor walks on along its way to the first free
  square out of it: a walk, counted, never a jump back (0.5.1). A whole group stopped at once keeps out of a one-wide corridor too, and a stopped token is
  never drawn anywhere but where it stopped while its stop reaches the server (0.4.11). `status().stop.last` says
  what the last stop was and what asked for it (`via`: click, board, door, api).
- **The GM's drag-help button** (Token controls, the route icon, next to the ghost button): one click turns
  pathfinding and group movement off for the whole table, so every drag is plain Foundry dragging; click again
  to turn them back on (world setting `assist`, 0.4.9). Players: if the GM has it off, a drag goes straight
  and stops at the first wall, as Foundry's own does.
- **A door shut or a wall raised across a move** (0.4.6) stops each token walking toward it on its own free
  whole square before it, the nearest one first; out of combat it stops at once where it is drawn (0.4.7) and walks on to that square from where it is
  drawn, in a fight it finishes its square and walks on, costed. `status().group.cut`.
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
| `pathfinding` | world | `everyone` | drag pathfinding: Everyone / GM only / Off (read live on every drag) |
| `pathfindMine` | client | `true` | this client's drags find a path |
| `smoothCorners` | client | `true` | round a found path's corners into arcs |
| `groupMovement` | world | `true` | a group drag plans each member's route, spot and start (0.4.0) |
| `assist` | world | `true` | the table's drag help; off = plain Foundry dragging for everyone (pathfinding reads off, group movement false); the GM's toolbar button flips it (0.4.9) |
| `clickToStop` | client | `true` | a click on a moving token stops it (0.4.0) |

`status().settings` lists the same keys with their scopes. Client settings live in the browser's
storage, shared by its tabs: flipping ghost or owned-on-top in one tab redraws the others.

## API — game.pentaryn.movement

Canonical: `game.modules.get("pentaryn-movement").api`; `game.pentaryn.movement` is the same
frozen object. Ask it what it offers: `game.pentaryn.movement.describe()` (offline:
`test/golden/describe.json`). Every row except `inspect`, `pathfind.status`, `pathfind.route`, `planGroup`, `stop` and `selftest` is `legacy` (today's signatures).

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
- Group waves run on the dropping client (closing it mid-move strands unsent members); Ctrl+Z undoes one wave.
- A drop that waits for, or queues behind, another reserved move shows nothing until it sets off (up to 8 s): that
  is the yield, not a hang. `status().group.last.queued` / `.delay` / `.raced` say which.
- The guard firing (`status().guard.fired`, a console line `yield guard: … gives way to …`) is a planner miss, not
  the design working: note the case. Out of combat its pause is a stop where the token is drawn (an unanimated
  write, like a click-stop) and its walk on a new move; in a fight it pauses core's movement (`pauseMovement`, which
  core relays to every client as the `"paused"` state) and resumes the same movement, so nothing is displaced and
  dnd5e charges the squares walked. A fight's first square is the drop's own, sent with the move: the guard can hold
  only the squares after it.
- The incorporeal test is by **feat name** (`INCORPOREAL_FEATS`); a differently named trait needs the GM toggle.
- Errors in the per-frame hooks (`refreshToken`, `renderSceneControls`) warn once per session.

## Files

| File | Role |
|---|---|
| `movement.mjs` | entry: wiring only (lifecycle, publish) |
| `movement-core.mjs` | pure rules, constants, label key maps |
| `settings.mjs` | the `SETTINGS` table |
| `combat-adapter.mjs` | combats and scenes → plain core inputs |
| `ghost.mjs` | the feature: patches, sort, toolbar, refresh, the incorporeal exception on the player's side |
| `ghost-combat.mjs` | the GM's ghost-in-combat flag: Token HUD toggle, `setGhost(creature, { combat })`, `inspect` |
| `pathfind-core.mjs` | pure: A*, cost-preserving string pulling, corner arcs, the skip rules |
| `pathfind-adapter.mjs` | a token and its drag options → wall / creature / cost step tests (reads only) |
| `pathfind.mjs` | the feature: the `findMovementPath` wrap, the step cache, `pathfind.status` / `route` |
| `motion-core.mjs`, `group-core.mjs` | pure: trajectories, conflicts, waves, cell chains, decision tables; slots, routes, delays |
| `reserve-core.mjs`, `reserve-adapter.mjs` | pure: the reservation wire, registry, race, delay, queue and cut; the registry each client keeps and its reads (0.6.0) |
| `guard-core.mjs`, `guard.mjs` | pure: who yields to whom, the look ahead, a resume's whole-way check, backing out, a fight's horizon, the yield's 3 s / 8 s clock, the bucket grid; the feature: the runtime yield guard on the canvas ticker (0.7.0) |
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
and pays the squares walked; and the glue against a synthetic board). Fixtures are
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
