# Pentaryn Ping Log (`pentaryn-pings`)

**Read this when:** you are changing `pentaryn-pings`, or calling `game.pentaryn.pings` from
eval-js / a macro ("where did I just ping?"). **Not this file:** pinging at the table vs drop
markers → [`context/foundry/markers.md`](../../../context/foundry/markers.md) (ping-log section) ·
migration record → [`context/plans/addon-blueprint-2026-10/migrate-pentaryn-pings.md`](../../../context/plans/addon-blueprint-2026-10/migrate-pentaryn-pings.md) ·
how every addon is built → [`context/foundry/addon-blueprint.md`](../../../context/foundry/addon-blueprint.md)

Foundry keeps no ping history: a ping is a transient socket message that draws an animation and is
gone. This module writes the last N pings (yours and your players') into a hidden world setting, so
"put a monster where I pinged" works from a tool that only sees the world through short scripted
calls. Tier small, kit `settings, api, patch, election`.

## What the player sees

Nothing. Pings draw exactly as before; the module only records them, on GM clients.

## Settings

| Key | Scope | Shown | Default | What |
|---|---|---|---|---|
| `max` | world | yes — "Pings to keep" (`PENTARYN_PINGS.Setting.max.Name`, `lang/en.json`) | 50 | how many pings the store keeps; not a finite positive number → 50; at most 500. Read on every ping, so a change applies at once |
| `log` | world | no (store) | `[]` | the records, oldest first (below) |

## API — game.pentaryn.pings

**GM clients only.** Canonical: `game.modules.get("pentaryn-pings").api`; `game.pentaryn.pings` is
the same object. On a player client neither exists (players never write the store). Ask it what it
offers: `game.pentaryn.pings.describe()`; offline: `test/golden/surface.json` and `api-manifest.mjs`.

| Call | Returns |
|---|---|
| `last()` | the newest record, decorated, or `null` when the log is empty or unreadable |
| `recent(n = 10)` | the last `n`, newest first |
| `all()` | the whole log, oldest first |
| `clear()` | drops this tab's unwritten pings and writes `[]`; another GM tab drops its own when it sees the change; resolves `true` (a failed write rejects) |

Kit members: `describe()`, `version`, `contract`, `settings()` (`{ log: { store, size }, max }`),
`trace()`, `uninstall()`.

A decorated record, keys in this order:

| Key | What |
|---|---|
| `t` | ms timestamp of the capture (GM clock) |
| `userId`, `userName` | who pinged (`userName` falls back to the id) |
| `sceneId`, `sceneName` | where (`sceneName` null for an unknown scene) |
| `x`, `y` | **canvas** coordinates, rounded — token `x`/`y` space, padding included |
| `canvas` | `{x, y}`, the same point |
| `image` | `{x, y}` pixel offset into the background image: canvas minus the padding offset |
| `gridSquare` | `{i, j}` column/row on the image, `Math.floor` |
| `snapped` | `{x, y}` top-left of the grid square in canvas space — a snapped token's `x`/`y` |
| `age` | `"12s ago"` (whole seconds, rounded) |
| `ageMs` | the same age as a number of ms, for "pings in the last minute" |

## Data written

| Where | What | Who |
|---|---|---|
| world setting `pentaryn-pings.log` | the stored records `{ t, userId, userName, sceneId, sceneName, x, y }`, newest `max` | every GM client, merged: one read-modify-write per burst (kit `serialStore`), 250 ms after its first ping, appending that tab's pings to the log as stored then; `clear()` |

No document flags.

## Flags other modules read

n/a — the module writes no flags.

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-pings.ready` | `(api)` | the API is published (GM clients) |
| `pentaryn.ready` | `("pings", api, { when: "ready:gm" })` | the kit's shared publish hook (GM clients) |

Emits no events of its own (`HOOKS` is empty). Registers only `init` and `ready` (pinned in
`test/golden/hooks.json`). Listens on core's socket event `userActivity` and wraps
`ControlsLayer#handlePing` (below).

## Patches and adjustments

| Adjustments row | What | Why |
|---|---|---|
| `pings-core-ping-handle` | wraps `ControlsLayer.prototype.handlePing` through `wrapMethod`, marker `__pentarynPatched` | the only place a ping drawn on this client is visible. On the prototype: layers are rebuilt on every scene change |
| `core-pings-user-activity-socket` | `game.socket.on("userActivity", …)` — core's private socket event; core v14 sends `{cursor: {x, y}, ping: {scene, …}}`, recorded as `cursor` on `ping.scene` | pings from clients on scenes the GM is not viewing never reach `handlePing` |

The two paths overlap, so a record that repeats the last one (same user, scene and rounded point,
less than 400 ms later) is dropped.

`uninstall()` undoes the `handlePing` wrap through its own `wrapMethod` handle, never the kit's
`unwrapAll()` (pings-ext-1, [declared]). If another module has wrapped `handlePing` on top of ours,
the undo cannot restore the original without dropping that wrapper, so it leaves the patch live and
the kit keeps its record: `describe().patches` still lists `pings-core-ping-handle`, and a hot
re-import gets the existing handle back instead of wrapping a second time.

## Two sessions / who writes

Every GM client captures and writes; players never write (world settings are not player-writable).
With two GM tabs (the MCP bridge plus a browser tab) the writes are **merged** (pings-edge-1,
[declared]): each tab keeps only its own pings since its last write, and a flush re-reads the stored
log and appends them (kit `serialStore`, read-modify-write), so neither tab overwrites the other.
Both tabs hear every ping, so a pending ping that matches a stored one (same user, scene and point,
stamped less than 400 ms apart) is the other tab's copy and is not written again. The `log` row's
onChange tells each tab about every change: an empty log is a clear, from either tab, and drops
what that tab had not yet written — a `clear()` in one tab stays cleared.

## Extending

1. A pure rule → `pings-core.mjs`, with a table row in `test/core.test.mjs` (it runs on the oracle
   and on core) or a test in `test/core-meta.test.mjs` when the oracle has no counterpart.
2. A new reader → a row in `api-manifest.mjs` and its implementation in `impl` in `pings.mjs`.
3. Capture changes → `capture.mjs`; keep the `__pentarynPatched` literal there (the adjustments row
   greps for it).

## Pitfalls

- **Read lag:** the readers read the stored setting, not this tab's pending pings, so a new ping
  shows only once it is written (≤ 250 ms). Wait a second after pinging before `last()`.
- The other tab's copy of a ping is matched on user, scene and point within 400 ms of a *stored*
  record, so the same user pinging the same point again within 400 ms, across one of this tab's
  writes, is kept once. Two GM tabs on machines whose clocks differ by more than 400 ms store
  each ping twice.
- `recent(0)` returns **everything**, and a negative `n` drops records from the oldest end.
- `snapped` is square-grid maths even on a hex scene.
- A fractional `max` below 1 never trims the log.
- Canvas ≠ image space: subtract the padding offset (`image`) for a pixel in the background image.
- A ping is recorded even where core draws nothing (a scene nobody is viewing).
- A failed write is retried once, 250 ms later; if the retry fails too, the pings wait for the next
  ping's write (the readers stay stale until then).
- `uninstall()` drops pings not yet written (≤ 250 ms).
- A hot re-import keeps pings not yet written: a second `ready` without `uninstall()` flushes what
  the first load captured, merged into the stored log.
- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.

## Files

| File | Role |
|---|---|
| `pings.mjs` | entry (esmodules[0]): wiring, the API implementations, publish |
| `pings-core.mjs` | pure constants and rules: dedupe, cap, merge, image offset, decorate, recent |
| `settings.mjs` | `SETTINGS`, registration, `readLog`/`logStore`/`onLogChange`/`maxSetting` |
| `api-manifest.mjs` | the four API rows (pure data) |
| `capture.mjs` | the feature: `handlePing` wrap, `userActivity` listener, pending list and merged flush |
| `lib/` | vendored kit (`lib/kit.lock.json`) |
| `test/` | node:test suites, goldens, fixtures (the verbatim pre-blueprint oracle), vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check pings
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module pings
```

## Sync

`make foundry-pings-sync` (the `pings` ModuleSpec is registered); then reload (`.mjs` changes).
`make foundry-pings-check` runs the node suite (gate `node-test`) together with the static and
blueprint gates; `node foundry/module/pentaryn-pings/test/run.mjs` runs the suite alone. A
`module.json` change needs a Foundry restart. Live check on the GM client: ping the canvas, wait a second, then
`game.pentaryn.pings.last()` has the point and `game.pentaryn.pings.describe().version` matches
`module.json`.
