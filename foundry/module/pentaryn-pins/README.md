# Pentaryn Pins (`pentaryn-pins`)

**Read this when:** you are changing or calling `pentaryn-pins`. **Not this file:** use-doc → `context/foundry/pins.md` · design → `context/plans/pin-2026-10.md` · how every addon is built → `context/foundry/addon-blueprint.md`

Pins a **character to a player** — not `foundry/lib/pins.mjs`, which is about journal Note pins
(grep `pentaryn-pins` or `game.pentaryn.pins`, never bare `pins`). With the world switch on, a
pinned player's client shows whatever scene their pinned token is on and ignores GM scene
activation; the sheet says "Pinned to {player}"; the GM gets a right-click canvas menu with Prompt
note and Teleport pinned character (the character's summons and pets come along, through
pentaryn-portals). Exposes `game.pentaryn.pins`.

## What the player sees

With **Pinning** on and a pin on their user: they log in on their token's scene and level, an
activation or a pull of another scene does nothing for them, a nav click on another scene shows
"Your view follows {character}" (at most once per 10 s), and moving the token (a portal hop, a
Teleport Token region, a GM cut-and-paste, the GM menu's Teleport) moves them with one draw and no
"cannot switch Scenes" warning. A token moved by someone else off-screen pans their camera to it.
The sheet of the pinned actor (and of its wild-shape form) shows "Pinned to {player}" in the title
bar. Unpinned players and GMs: stock. Switch off: everything is inert.

The GM: right-click on **empty** canvas, token layer → **Prompt note** (pentaryn-prompts `place`
at that point, hidden without prompts) and **Teleport pinned character ▸ {logged-in player}**.
Right-drag still pans; token right-click opens the HUD; a portal badge keeps its own menu.

## Settings

| Key | Scope | Default | What it does |
|---|---|---|---|
| `pinning` | world, config | `false` | The switch. Read live everywhere (no reload). Turning it on audits the pins on the GM client that did it. |

## API — game.pentaryn.pins

Canonical: `game.modules.get("pentaryn-pins").api`; `game.pentaryn.pins` is the same object.
Ask it what it offers: `game.pentaryn.pins.describe()` (offline: `test/golden/describe.json`).

| Method | GM | Writes | Returns |
|---|---|---|---|
| `pin(user, { actor, replace, dryRun })` | yes | `flags.pentaryn-pins.actor` on the User | `{ ok, user, actor, previous, cleared, audit, warning? }` · `warning: "NOT_OWNER"` (pinned, but the player cannot observe the actor) · `BAD_ARGS` (a GM, no actor) · `CONFLICT` (pinned to another user unless `replace`) · `REFUSED` (a write was vetoed by a `preUpdateUser` hook) / `INTERNAL` (a write threw), each with `restored: [userIds]` — the pins `replace` cleared are put back |
| `unpin(user, { dryRun })` | yes | that flag deleted | `{ ok, user, previous }` |
| `pins()` | — | — | `[{ user, actor, tokens: [{ id, scene, level, form }] }]` |
| `pinnedToken(user)` | — | — | `{ token, actor, scene, level, x, y }` (uuids; **scene and level are id strings**) or null (off, a GM even with a pin flag, unpinned, none or several) |
| `audit()` | — | — | `{ enabled, ok, pins, violations: [{ code, level, user, actor, tokens, detail }] }` — problems `GM_USER` `NO_ACTOR` `SHARED_ACTOR` `NO_TOKEN` `MANY_TOKENS`, warnings `UNLINKED` `NOT_OWNER` |
| `teleport(user, { x, y, scene?, level?, dryRun })` | yes | through portals | portals' `teleportToken` result + `{ user, viewFollows, online, warning? }` · `BAD_ARGS` unpinned · `NOT_FOUND` no token · `AMBIGUOUS` several · `UNSUPPORTED` no portals |
| `inspect(userOrActor)` | — | — | `{ user, actor, root, enabled, token, ok }` (a uuid goes to its kind — `User.*` a user, anything else an actor; an id or a name, dots included, is tried as a user first, then as an actor; options are ignored, so the root `game.pentaryn.inspect(ref, { kind })` works) |
| `selftest()` | — | — | `{ ok, checks }`: patches, setting, portals `teleportToken` |

`user` refs: a User, uuid, 16-character id or exact name — never a substring. Every write takes
`dryRun` and logs one audit line `{ uuid, ids, by }`. No queries, no socket. A form actor (wild
shape, polymorph) given to `pin` is stored as its root. `teleport` works with the switch off, but
then the view does not follow (`viewFollows: false`, cross-scene adds `warning: "VIEW_UNCHANGED"`).
With the switch on, `viewFollows` is true while the player is online (`online`); an offline player
lands on the token's scene at their next login, so there is no warning.

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
| `api:pentaryn-portals.teleportToken` | pentaryn-portals ≥ 0.6.0 | Teleport pinned character (company follows) |
| `api:pentaryn-prompts.place` (`{ at }`) | pentaryn-prompts ≥ 0.4.6 | Prompt note at the clicked point |

pins' own flag is read by no other module: pentaryn-resume calls `pinnedToken` (its `scene` is an
id string; both sides pin that shape in their tests).

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-pins.followed` | `({ scene, level, reason })` | a pinned player's client starts a view of the token's scene (`login`, `pull`, `move`, `reconcile`, `switch`) |
| `pentaryn-pins.audited` | `(result)` | the switch went on; on the GM client whose user changed it |
| `pentaryn-pins.ready` | `(api)` | the API is published |

Listens to: `createToken`, `deleteToken`, `updateToken`, `updateUser`, `deleteUser`, `deleteLevel`, `canvasReady`,
`ready`, `renderBaseActorSheet`, `canvasTearDown`, `canvasPan` (pinned in `test/golden/hooks.json`).

## Patches and adjustments

| Row | Wraps | Does |
|---|---|---|
| `pins-scene-view` | `Scene#view` (MIXED, libWrapper else direct, marker `__pentarynPinsView`) | a pinned player's view of another scene → the token's scene; never a second view of the scene being drawn (dropped) and nothing else while loading (queued) |
| `pins-scene-activate` | `Scene#_onActivate` (marker `__pentarynPinsActivate`) | activating another scene, or deactivating the viewed token scene, does nothing for a pinned player |
| `dnd5e-pins-transform-root` | — | the dnd5e transform flags above |

Both patches are installed at `setup`, before the first canvas draw, and are pass-throughs (same
`this`, same arguments) whenever the switch is off, the user is a GM or unpinned, or the pin has no
single token. `describe().patches` lists both.

## Two sessions / who writes

The follow logic runs on each pinned **player's** own client and writes nothing. `pin`/`unpin`
write from the calling GM client. `teleport` runs on the GM client that called it (Joe's tab for the
menu, the bot for `pentaryn-write`); portals' `teleportToken` does the writes and two simultaneous
calls give one `CONFLICT`. The switch-on audit toasts only where `userId === game.user.id`.

## Extending

1. A pure rule → `pins-core.mjs` with a fixture table in `test/core.test.mjs`.
2. A feature → a new `<feature>.mjs` with `install(reg, ctx)` / `uninstall()`, added to `FEATURES` in `pins.mjs`.
3. An API method → a row in `api-manifest.mjs` + an impl in `api.mjs`, then
   `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review.

## Pitfalls

- `canvasReady` runs while `canvas.loading` is still true: never call `Scene#view` from it (core
  refuses). follow.mjs only schedules `settle()`, which views once loading clears.
- A token **id** is not stable across scenes (keepId, core's region teleport): key on the root
  actor id, and on the token **uuid** for "the latest".
- A move is followed when it **completes** (the delete): a create alone is followed only when it is
  the character's one token, so a copy is never a move. After any delete the target is recomputed:
  the player is sent to the token that is left.
- Core sets `canvas.loading` only inside its queued `#draw`, after an await: a view pins let
  through is `inflight` before `loading` is true, and the queue counts it (no second draw).
- The canvas menu's right-press snapshot must be taken on **window** capture: PIXI's own capture
  listener on `#board` claims the stage's mouse manager first, so a `#board` listener added at
  canvasReady always sees `canvas.currentMouseManager` set.
- A direct `canvas.draw(scene)` (a macro, another module, a bare `canvas.draw()` before the canvas
  is ready) bypasses `Scene#view`: one visible bounce, then `canvasReady: reconcile` fixes it.
- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.
- `module.json` is read at Foundry startup: any change to it needs a restart, not a reload.

## Files

| File | Role |
|---|---|
| `pins.mjs` | entry (esmodules[0]): wiring, load order |
| `pins-core.mjs` | pure: `pinOf`, `pickToken`, `viewDecision`, `queueDecision`, `followNeeded`, `activateDecision`, `auditPins`, `menuTrigger`, `menuAllowed`, `menuPlacement`, `teleportChoices`, `pinnedName` |
| `settings.mjs` | `pinning` and its onChange fan-out |
| `world-adapter.mjs` | Foundry → plain data: pins, root actors (kit `lib/root-actor.mjs`, the rule portals uses), tokens across scenes, the audit, `listOf` (no canvas) |
| `api-manifest.mjs` / `api.mjs` | API rows / implementations |
| `follow.mjs` | the two patches, the view queue, the follow hooks (player client) |
| `sheet.mjs` | the "Pinned to" badge |
| `canvas-menu.mjs` / `menu-ui.mjs` | the GM right-click menu: event gating / DOM |
| `switch.mjs` | the switch-on audit toast |
| `lib/` | vendored kit (`lib/kit.lock.json`; `patch-libwrapper` names lib-wrapper; `root-actor` is the shared original-actor rule) |
| `test/` | node:test suites, goldens, fixtures (a small fake DOM), vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
make foundry-pins-check
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module pins
```

`glue.test.mjs` replays core's view, activation and token hooks on a stub whose `Scene#view`
toasts core's loading warning when called while loading; `menu.test.mjs` drives the right-click
sequence in Windows and macOS order.

## Sync

First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Pins', reload.
After that `.mjs`, `.css` and `lang/` changes need a reload only. Check what is live with
`game.pentaryn.pins.describe().version` and `game.pentaryn.pins.selftest()`.
