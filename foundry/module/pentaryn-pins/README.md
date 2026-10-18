# Pentaryn Pins (`pentaryn-pins`)

**Read this when:** you are changing or calling `pentaryn-pins`. **Not this file:** use-doc → `context/foundry/pins.md` · design → `context/plans/pin-2026-10.md`, rebuilt in 0.2.0 → `context/plans/pin-2026-10-rebuild.md`, Gather (0.3.0) → `context/plans/pin-2026-10-gather.md` · how every addon is built → `context/foundry/addon-blueprint.md`

Pins a **character to a player** — not `foundry/lib/pins.mjs`, which is about journal Note pins
(grep `pentaryn-pins` or `game.pentaryn.pins`, never bare `pins`). With the world switch on, a
pinned player's client shows whatever scene their pinned token is on and ignores GM scene
activation; the sheet says "Pinned to {player}"; the GM gets a right-click canvas menu with Prompt
note, Gather logged-in players here and Teleport pinned character (the character's summons and pets
come along, through pentaryn-portals). Exposes `game.pentaryn.pins`.

## What the player sees

With **Pinning** on and a pin on their user: they log in on their token's scene and level
(pentaryn-resume does that draw), an activation of another scene does nothing for them, and moving
the token moves them. A move reaches them the way core moves anyone: whoever moves the token
**pulls** them (`Scene#pullUsers`) — portals' Teleport party and `teleportToken` (the GM menu's
Teleport), core's Teleport Token region, a portal hop. Pins only fills the gaps: a GM cut-and-paste
across scenes (nobody pulls) is caught by a safety net after 1.5 s, a level change core's own level
switch will not follow is followed, and a pull that lands while their map is still loading (core
drops it with "cannot switch Scenes") is carried out when the load ends. Activating the token's own
scene while they look elsewhere lands them on the token's floor, controlling it. They may click the
scene nav to look at another map (nothing redirects them); a GM "Pull to Scene" moves them too. The
sheet of the pinned actor (and of its wild-shape form) shows "Pinned to {player}" in the title bar.
Unpinned players and GMs: stock. Switch off: everything is inert.

The GM: right-click on **empty** canvas, token layer → **Prompt note** (pentaryn-prompts `place`
at that point, hidden without prompts), **Gather logged-in players here** (`gather` at that point:
every logged-in player whose pin has one token, each with its company; note = how many; a confirm
only when a cross-scene member is in a started combat) and **Teleport pinned character ▸
{logged-in player}**. Right-drag still pans; token right-click opens the HUD; a portal badge keeps
its own menu.

## Settings

| Key | Scope | Default | What it does |
|---|---|---|---|
| `pinning` | world, config | `false` | The switch. Read live everywhere (no reload). Turning it on audits the pins on the GM client that did it. |

## API — game.pentaryn.pins

Canonical: `game.modules.get("pentaryn-pins").api`; `game.pentaryn.pins` is the same object.
Ask it what it offers: `game.pentaryn.pins.describe()` (offline: `test/golden/describe.json`).

| Method | GM | Writes | Returns |
|---|---|---|---|
| `pin(user, { actor, replace, dryRun })` | yes | `flags.pentaryn-pins.actor` on the User; switch on and the player online: pulls them to their token | `{ ok, user, actor, previous, cleared, audit, warning? }` · `warning: "NOT_OWNER"` (pinned, but the player cannot observe the actor) · `BAD_ARGS` (a GM, no actor) · `CONFLICT` (pinned to another user unless `replace`) · `REFUSED` (a write was vetoed by a `preUpdateUser` hook) / `INTERNAL` (a write threw), each with `restored: [userIds]` — the pins `replace` cleared are put back |
| `unpin(user, { dryRun })` | yes | that flag deleted | `{ ok, user, previous }` |
| `pins()` | — | — | `[{ user, actor, tokens: [{ id, scene, level, form }] }]` |
| `pinnedToken(user)` | — | — | `{ token, actor, scene, level, x, y }` (uuids; **scene and level are id strings**) or null (off, a GM even with a pin flag, unpinned, none or several) |
| `pinnedTokens()` | — | — | `{ [userId]: pinnedToken }` for every pinned player in ONE token walk; `{}` while off; GMs and unresolved pins absent |
| `audit()` | — | — | `{ enabled, ok, pins, violations: [{ code, level, user, actor, tokens, detail }] }` — problems `GM_USER` `NO_ACTOR` `SHARED_ACTOR` `NO_TOKEN` `MANY_TOKENS`, warnings `UNLINKED` `NOT_OWNER` |
| `teleport(user, { x, y, scene?, level?, dryRun })` | yes | through portals (`pull: [user]` when on and online) | portals' `teleportToken` result (with `pulled`) + `{ user, viewFollows, online, warning? }` · `BAD_ARGS` unpinned · `NOT_FOUND` no token · `AMBIGUOUS` several · `UNSUPPORTED` no portals |
| `gather({ x, y, scene?, level?, dryRun })` (0.3.0) | yes | per member, in order, `teleport` (→ portals `teleportToken` with `gather: { later }`) | `{ ok, to: { scene, x, y, level }, moved: [{ user, actor, token, form, from, followers, pulled, viewFollows, warnings }], skipped: [{ user, actor, code, detail }], offline: [{ user, actor }], failed: [{ user, actor, code, reason }], warning?: PARTIAL\|NOBODY, dryRun? }`. Members: every active non-GM user whose pin has exactly one token; destination-scene members first (nearest the point), then the rest by name; one level for all (`level`, else the caller's canvas level on that scene, else its initial level). `skipped` codes `NO_PIN` `NO_ACTOR` `SHARED_ACTOR` `NO_TOKEN` `MANY_TOKENS`, each with the audit violation's own `detail` (SHARED_ACTOR: every co-pinned player, offline too; MANY_TOKENS: the scenes); `warnings` `UNLINKED` `NOT_OWNER` (moved anyway), `COMBAT` (a cross-scene member in a started combat: drops off the tracker; from one snapshot taken before any move), `VIEW_UNCHANGED`. `scene` defaults to `game.scenes.current` (bridge callers pass it). `NOT_GM` · `REFUSED` switch off · `BAD_ARGS` x/y, scene, level, or no scene · `UNSUPPORTED` no portals · `CONFLICT` a gather already running |
| `inspect(userOrActor)` | — | — | `{ user, actor, root, enabled, token, ok }` (a uuid goes to its kind — `User.*` a user, anything else an actor; an id or a name, dots included, is tried as a user first, then as an actor; options are ignored, so the root `game.pentaryn.inspect(ref, { kind })` works) |
| `selftest()` | — | — | `{ ok, checks }`: the `_onActivate` patch, setting, portals `teleportToken`, the `prePull` listener registered (gather depends on it) |

`user` refs: a User, uuid, 16-character id or exact name — never a substring. Every write takes
`dryRun` and logs one audit line `{ uuid, ids, by }`. No queries, no module socket. A form actor
(wild shape, polymorph) given to `pin` is stored as its root. `teleport` passes `pull: [user]` to
portals when the switch is on and the player online; `viewFollows` is then "portals' `pulled` names
the player" on a cross-scene move (a dryRun predicts it: "on and online"). On the same scene a
player who is on and online follows: `teleport` pulls them to the token (portals never pulls on the
same scene), always: never skipped on the GM's copy of their view, which lags their draw (code
review G1). Onto another floor core's own level switch may also run on their client; the second of
the two views is then a no-op or dropped and, once loading clears, replayed only when it still
changes the view (follow.mjs). `pin` and the switch-on pull
an online pinned player every time, even when the GM sees them there already (that view lags a draw
in progress; a pull to what is drawn draws nothing).
`warning: "VIEW_UNCHANGED"`: a cross-scene move that did not pull the player while they are online,
or with the switch off. An offline player with the switch on lands on the token's scene at their
next login (resume), so there is no warning.

`gather` makes ONE token walk (`gatherInputs`) and moves each member from that plan, one after
another, through `teleport`'s own move (`moveTo`; the plan's record is re-read by id, `liveToken`,
so a token an earlier member's company carried is found where it went). Each member's company lands
beside it on the nearest free squares around the point (portals counts the earlier members as
standers), one member failing never stops the others (`failed[]`, `warning: "PARTIAL"`), and each
player is pulled only by their own move. It passes portals `gather: { later }` (the members still to
move, as `{ user, token }`), so a companion several gathered players co-own comes with the last of
them on its scene, at any distance (portals 0.8.0). Portals reports what such a call left for a
later member (`held`); when that later member's move then fails, the gather carries the companion
alone beside the last owner that moved (listed in that member's `followers`; a failure of that carry
is a `failed[]` row under that owner). Portals also hands each member call's `gather` to its
`prePull`, the per-call mark of the gather clause (Events). A module-scope `busy` flag refuses a
second gather (`CONFLICT`), cleared in `finally`. The result goes through `toPlain(…, { maxDepth:
Infinity })`: `moved[i].followers[j]` sits at depth 4, where the default cap writes `"[max depth]"`.

## Data written

`flags.pentaryn-pins.actor` on a **User**: the pinned **root** actor id (string). Written only by
`pin`/`unpin` (a GM writing another user's document: an Assistant GM may, `common/documents/user.mjs`).
One actor per user by structure; one user per actor is enforced by `pin` (`CONFLICT`). Nothing in
world settings beyond the switch.

## Flags other modules read

| Flag / API | Owner | Read by pins for |
|---|---|---|
| `flags.dnd5e.originalActor` (token, then actor) | dnd5e 6.0.6 `transformInto` (`dnd5e.mjs` ~45653-45665) | the root actor of a wild-shaped or polymorphed token |
| `flags.dnd5e.previousActorIds` (actor; `[0]` is the first original) | dnd5e 6.0.6 `transformInto` (~45572) | the same, when `originalActor` is missing |
| `api:pentaryn-portals.teleportToken` | pentaryn-portals ≥ 0.7.0 (`pull`, `pulled`; 0.6.0 works, without the pull); ≥ 0.8.0 for `gather` (an older portals rejects or ignores it, and a co-owned steed then follows the old rule) | Teleport pinned character and Gather (company follows, the player is pulled) |
| `hook:pentaryn-portals.prePull` | pentaryn-portals ≥ 0.7.0 (≥ 0.8.0 for `data.gather`) | leave a pinned-elsewhere player out of portals' pull; a gather member's carry (`data.gather` set): every non-GM user |
| `api:pentaryn-prompts.place` (`{ at }`) | pentaryn-prompts ≥ 0.4.6 | Prompt note at the clicked point |

pins' own flag is read by no other module. Who reads my API: pentaryn-resume calls `pinnedToken`
at login (`scene`, `level`, `token`; `scene` is an id string, both sides pin that shape in their
tests). pentaryn-portals reads no pins API (code review CR7): it fires `pentaryn-portals.prePull`
before each pull it sends, and pins' `prepull.mjs` answers it.

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-pins.followed` | `({ scene, level, reason })` | a pinned player's client starts a view itself: `cut` (the safety net), `level` (the level gap-filler), `retry` (a dropped pull replayed) |
| `pentaryn-pins.audited` | `(result)` | the switch went on; on the GM client whose user changed it |
| `pentaryn-pins.ready` | `(api)` | the API is published |

Listens to: `deleteToken`, `moveToken`, `createToken`, `renderBaseActorSheet`, `updateUser`, `deleteUser`,
`canvasReady`, `canvasTearDown`, `canvasPan`, `ready` and `pentaryn-portals.prePull` (pinned in
`test/golden/hooks.json`), and core's own `pullToScene` socket event (`game.socket.on`, attached at
`ready`, after core's `Game#activateSocketListeners`; never emitted by pins).

`pentaryn-portals.prePull` (`prepull.mjs`): with the switch on it drops from portals' pull a player
whose pinned token is on another scene. **A gather member's carry** (0.3.0: portals passes that
call's `opts.gather` on as `data.gather`) drops every non-GM user instead: that member's own pull is
added by portals after the listeners. The mark is per call (code review G6), so any other pull while
a gather runs — a portal hop, even of a member's token, a party pull, a single teleport — keeps the
first rule, unchanged. It never returns false (that would veto the whole pull).

## Patches and adjustments

| Row | Wraps | Does |
|---|---|---|
| `pins-scene-activate` | `Scene#_onActivate` (MIXED, libWrapper else direct, marker `__pentarynPinsActivate`) | activating another scene, or deactivating the viewed token scene, does nothing for a pinned player; activating the token's scene while they view another passes core `viewOptions.level` = the token's level and `controlledTokens` = the token |
| `core-pins-level-switch-rule` | — (a copy of core's rule) | the level gap-filler views a new level only when core's own switch (`TokenDocument.#handleMovementOperation`, `token.mjs:2927-2946`) will not |
| `core-pins-pull-replay` | — (a socket listener) | a `pullToScene` that lands while `canvas.loading` (core drops it) is viewed as sent once loading clears, unless the canvas then shows that scene and level already; one sequence orders pulls and pins' own views (a newer one wins) |
| `dnd5e-pins-transform-root` | — | the dnd5e transform flags above |

The patch is installed at `setup`, before the first canvas draw, and is a pass-through (same
`this`, same arguments) whenever the switch is off, the user is a GM or unpinned, or the pin has no
single token. `describe().patches` lists it. `Scene#view` is core's own since 0.2.0.

## Two sessions / who writes

The **GM** moves a pinned player: `pin` (switch on, player online) and the switch-on pull
`Scene#pullUsers` them from the calling GM client (no canvas needed, so the bot can), and portals
pulls them on a move. The player's own client writes nothing; it runs only the activation patch,
the safety net, the level gap-filler and the pull replay. `pin`/`unpin` write from the calling GM
client. `teleport` runs on the GM client that called it (Joe's tab for the menu, the bot for
`pentaryn-write`); portals' `teleportToken` does the writes and two simultaneous calls give one
`CONFLICT`. `gather` runs the same way, on the calling GM client only (not a query: the bot and a
browser GM never share one gather), and a second `gather` on that client while one runs is refused
with `CONFLICT`. The switch-on audit and pull run only where `userId === game.user.id`. The watch toasts
(no token left / a second token) show on every GM client; nothing is written, so no election. The
one pull `watch.mjs` sends (a pinned character placed again, 0 → 1 token) is the **active GM's**
only (`game.users.activeGM.isSelf`, normally the bot). Every GM-side pull goes through one helper,
`world-adapter.mjs` `pullToPin`. Portals' pulls reach pins only through its
`pentaryn-portals.prePull` hook (`prepull.mjs`); portals reads no pins API.

## Extending

1. A pure rule → `pins-core.mjs` with a fixture table in `test/core.test.mjs`.
2. A feature → a new `<feature>.mjs` with `install(reg, ctx)` / `uninstall()`, added to `FEATURES` in `pins.mjs`.
3. An API method → a row in `api-manifest.mjs` + an impl in `api.mjs`, then
   `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review.

## Pitfalls

- A pull is the move primitive: a token's move reaches the player only as a pull (or the safety
  net). Core's `Scene#view` drops a pull that lands while `canvas.loading` with its "cannot switch
  Scenes" toast; pins replays it once loading clears (pinned players only), so the toast can still
  show once on a slow load.
- The safety net waits `NET_GRACE_MS` (1.5 s) after a delete so the mover's pull lands first. A
  mover's pull that reaches the player later than that, while the net's own draw is loading, shows
  core's toast once and is replayed (same scene and level: no second draw).
- The net never yanks a peek: it only arms when the deleted token was on the scene the player views.
- **The GM's copy of `User#viewedScene` lags** a player's draw: it changes only when the draw ends
  (`board.mjs` `#initializeUserActivity`). During a gather, an earlier member may still be "on" the
  source scene in the GM's eyes, so core's rule would pull them again for a later member's carry;
  the gather clause in `prepull.mjs` is what stops it. Never skip a pull on that copy either (CR2).
- **A same-scene level change also triggers core's own level switch** on the player's client
  (`TokenDocument#handleMovementOperation`), beside the pull a same-scene `teleport` or gather always
  sends. They coexist: whichever lands second is a no-op (that scene and level are drawn) or is
  dropped by core while the first draws, so **the player may see one "cannot switch Scenes" toast**;
  the dropped pull is then replayed only if the canvas does not already show its scene and level.
  Never predict core's switch on the GM side: the GM's copy of the player's view lags (code review G1).
- **Order on the player's client** (code review G4): every pull and every view pins queues itself
  (the safety net's delete, the level gap-filler's move) takes a number from one counter. A pins
  view drops an OLDER held pull; a pull that arrived after the view was queued wins, and the view is
  dropped.
- A token **id** is not stable across scenes (keepId, core's region teleport): key on the root
  actor id.
- The canvas menu's right-press snapshot must be taken on **window** capture: PIXI's own capture
  listener on `#board` claims the stage's mouse manager first, so a `#board` listener added at
  canvasReady always sees `canvas.currentMouseManager` set.
- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.
- `module.json` is read at Foundry startup: any change to it needs a restart, not a reload.

## Files

| File | Role |
|---|---|
| `pins.mjs` | entry (esmodules[0]): wiring, load order |
| `pins-core.mjs` | pure: `pinOf`, `pickToken`, `activateDecision`, `netDecision`, `coreSwitchesLevel`, `levelFollow`, `replayDecision`, `tokenNotice`, `auditPins`, `gatherPlan` (who a gather moves, skips, leaves offline; the order), `menuTrigger`, `menuAllowed`, `menuPlacement`, `teleportChoices`, `pinnedName` |
| `settings.mjs` | `pinning` and its onChange fan-out |
| `world-adapter.mjs` | Foundry → plain data: pins, root actors (kit `lib/root-actor.mjs`, the rule portals uses), tokens across scenes, the audit, `pinInputs` (the one builder of the plain pin world: `auditWorld` with the GMs' pins, `gatherInputs` without; one token walk), `liveToken` (a walked record as it stands now, by id), `startedCombatTokens` (the COMBAT snapshot), `pullTargetOf` / `pullToPin` (where and how the GM pulls a player; a resolved token is reused), `listOf` (no canvas) |
| `api-manifest.mjs` / `api.mjs` | API rows / implementations |
| `follow.mjs` | the `_onActivate` patch, the deleteToken safety net, the moveToken level gap-filler (core's clause: kit `lib/pull-rule.mjs` `ownsOtherSighted`), the `pullToScene` replay attached at `ready` (player client) |
| `sheet.mjs` | the "Pinned to" badge |
| `canvas-menu.mjs` / `menu-ui.mjs` | the GM right-click menu (Prompt note, Gather with its count, combat confirm and toasts, Teleport ▸; one `gatherInputs` read per open feeds the count and the rows): event gating / DOM |
| `switch.mjs` | the switch-on audit toast and pull |
| `watch.mjs` | GM toasts: a pinned character with no token left (Stranded) or a second one (Paused); the active GM pulls the online player when it is placed again (0 → 1) |
| `prepull.mjs` | the `pentaryn-portals.prePull` listener: drops a player pinned to a token on another scene from portals' pull (one token walk, `pinTargets`); from a gather member's carry (`data.gather`), every non-GM user |
| `lib/` | vendored kit (`lib/kit.lock.json`; `patch-libwrapper` names lib-wrapper; `root-actor` is the shared original-actor rule; `pull-rule` is core's "who is pulled" rule shared with portals) |
| `test/` | node:test suites, goldens, fixtures (a small fake DOM), vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
make foundry-pins-check
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module pins
```

`glue.test.mjs` replays core's activation, token hooks (`moveToken` fired directly) and
`pullToScene` socket event on a stub whose `Scene#view` toasts core's loading warning when called
while loading, with mock timers for the grace window and the polls; `menu.test.mjs` drives the
right-click sequence in Windows and macOS order.

## Sync

First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Pins', reload.
After that `.mjs`, `.css` and `lang/` changes need a reload only. Check what is live with
`game.pentaryn.pins.describe().version` and `game.pentaryn.pins.selftest()`.
