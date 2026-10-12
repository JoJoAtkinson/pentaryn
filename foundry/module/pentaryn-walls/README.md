---
created: 2026-08-11
last_modified: 2026-10-11
tags: ["foundry", "vtt", "module", "maps", "walls"]
status: active
---

# Wall Autocomplete (`pentaryn-walls`)

**Read this when:** you are changing or calling `pentaryn-walls`. **Not this file:** how to draw
and run it at the table → [`context/foundry/walls.md`](../../../context/foundry/walls.md) · the
engine design, rule table and traces →
[`context/plans/foundry-wall-autocomplete.md`](../../../context/plans/foundry-wall-autocomplete.md) ·
how every addon is built → [`context/foundry/addon-blueprint.md`](../../../context/foundry/addon-blueprint.md)

Deterministic completion of hand-drawn walls. Rough in the walls that carry information —
windows, doors, one hint stub per bare wall line — and the engine infers the rest. Where it would
have to guess, it refuses and names the endpoint and the reason. System-agnostic: it touches only
`Wall` documents. Full tier; disabled in the pentaryn world today.

## What the player sees

Nothing. Every effect is GM-side: walls appear or move on the scene, a GM-whispered chat card
reports the run, and refused endpoints get a transient pulse drawn on the GM's own canvas only
(`canvas.controls.drawPing`, never the broadcast `canvas.ping`) — only when the reported scene is
the one the GM is viewing; another scene's refusals are listed on the card and in the console only.

## Settings

| Key | Scope | Default | What it does |
|---|---|---|---|
| `backend` | world | `auto` | Engine: `auto` (compiled when its `.wasm` loaded, else JavaScript), `wasm`, `js`. Same geometry either way; speed only. Read on every run. |

Keybindings (GM only, rebind in *Configure Controls*): **Alt+W** run · **Alt+Z** undo the last
run · **Alt+Shift+W** preview. Labels and toasts are keys in `lang/en.json` (`PENTARYN_WALLS.*`),
and every toast goes through the kit's `log.notify` (one console line each).

## API — game.pentaryn.walls

Canonical: `game.modules.get("pentaryn-walls").api`; `game.pentaryn.walls` is the same frozen
object, published on GM clients only, after the `.wasm` load settles (`when: "ready:gm:wasm"`).
Ask it what it offers: `game.pentaryn.walls.describe()` (offline: `test/golden/describe.json`).

| Method | Writes | Returns |
|---|---|---|
| `preview({sceneId, backend, …tolerances})` | chat card, pings, console tables | the engine result, or `null` while another action runs |
| `run({sceneId, …})` | Wall update batch, then create batch, then the card | the engine result, or `null` while busy |
| `undo({sceneId, all})` | Wall update (restores) and delete batches, the card | `{deleted, restored, run}`, or `null` while busy |
| `analyze({sceneId, …})` | nothing at all | `{sceneId, sceneName, backend, ms, …result}` |
| `makeMacro(action, slot)` | a `Walls: <action>` macro (once), the hotbar | the Macro |
| `runEngine(walls, opts)` | nothing (pure) | the engine result over plain wall data |
| `backends()` | nothing | the available backends |

The engine result is `{creates, updates, refusals, lints, log, report}`. `preview`, `run` and
`undo` are one-at-a-time across keybindings, macros and the API. They throw `Error` with no scene
(`"pentaryn-walls: no scene — open one, or pass a sceneId."`), or naming a `sceneId` that matches
no scene (`'pentaryn-walls: no scene with id "<sceneId>".'`). `preview`, `run`, `undo` and
`analyze` take `null` as no argument at all: the viewed scene and the defaults. `undo`, `makeMacro`, `runEngine`
and `backends` keep their legacy shapes (`legacy: true`).
`makeMacro` gives each action's macro a fixed id, so two overlapping calls or two GM tabs still
make one `Walls: <action>` macro. A macro made before the fixed id is reused by name only if it is a
script macro; a same-named chat macro is left alone.

## Data written

Every wall a run touches is stamped under `flags.wall-autocomplete`, the pre-blueprint scope.
The flag-scope migration to `flags.pentaryn-walls` (`migrations.mjs`) is written but **parked**:
walls stays off in Joe's world, so the Wave 7 batch (2026-10-12) did not wire it and `module.json`
keeps `flagScope: "wall-autocomplete"`. Reads already accept both scopes (`stampOf`, the module id
winning):

| Key | On | Meaning |
|---|---|---|
| `run` | created walls | the run that created it (an ISO timestamp, `.` written `,`); later runs never rewrite it |
| `generated` | created walls | `true`: undoing its creating run deletes it |
| `rule`, `kind`, `sources` | created walls (js engine) | which rule built it and from what |
| `moves.<run>` | updated walls | per run that trimmed, welded or moved it: the coordinates that run first found it at |
| `rule` | updated walls | the rule of the latest move |

Undo takes the latest run id across every `run` and `moves` key — ISO-timestamped ids by time, and
any of them before a non-ISO id (those rank below every ISO run, by string order; walls-edge-5) — and
it deletes the walls that run
created and gives every wall with a `moves.<run>` entry those coordinates back — so undoing run 2
restores a run-1 wall that run 2 moved instead of deleting it (walls-edge-2). It then deletes
`flags.<scope>.moves.<run>`, or the whole stamp (`{"flags.<scope>": _del}` for each scope the wall
carries one in; needs Foundry 14) once no run is left on the wall. Older stamps — a flat `run` +
`priorC` on an updated wall — still undo. Nothing in world settings besides `backend`.

## Flags other modules read

n/a — no other module reads them. Authors may set `keepOpen: true` under either scope
(`flags.pentaryn-walls` or `flags.wall-autocomplete`) on a wall to keep its ends from being
closed (read by the engine and the wasm marshaller).

## Events

n/a — emits none of its own (`HOOKS` is empty). The kit fires `pentaryn-walls.ready` `(api)` and
`pentaryn.ready` when the API is published. Listens to: `init`, `ready` (pinned in
`test/golden/hooks.json`).

## Patches and adjustments

n/a — patches nothing and names no third-party package.

## Two sessions / who writes

Writes happen only on the GM client that calls an action; nothing reacts to document hooks. Two
GM tabs each publish their own API; a run in one does not lock the other.

## Extending

- **A rule:** add it in `core/engine.mjs` `enumerate()` with its `PRIORITY`, add a fixture to
  `test/fixtures/corpus.mjs`, then either mirror it in `wasm/src/lib.rs` (rebuild with
  `make foundry-walls-wasm`) or make the wasm `accepts(walls, opts)` refuse the case so it runs on js, as it does for Levels.
  The JS engine is the reference: change it first, then port. Give it a refusal reason in
  `diagnose()` (it re-checks F1/F2 by hand), and a new act kind also needs `applyInstance()` and
  the batch box (`boxOf`) in `runEngine`.
- **A backend:** `register({name, run(walls, opts), available(), accepts?(walls, opts)})` from its own adapter file,
  returning the `runEngine` shape. `compare()` then diffs it against js, the bench gains a column,
  and `node test/corpus.mjs --backend=<name>` runs the corpus on it.
- **An API method:** a row in `api-manifest.mjs`, the action in `actions.mjs` (exposed through
  `ctx.expose`), the binding in `api.mjs`, then `GOLDEN_UPDATE=1 node --test test/api.test.mjs`.

## Pitfalls

- `getFlag("wall-autocomplete", …)` throws on Foundry 14 (not a package id). Read the flags from
  `toObject()` (`planUndo` does).
- The wasm engine knows nothing of Levels, the `rule` stamp (always `X1`), the create flags or
  the log; `canonical(r, {extended: true})` shows the first two. Geometry is identical.
- `weldEps` and `pinEps` are fixed inside `lib.rs`, not passed over the ABI: a run that overrides
  either goes to js (the wasm row's `accepts(walls, opts)`), like a Levels scene.
- Keybindings register at `init` only; a new row needs a reload.
- Do not add a top-level `await` to `backend-wasm.mjs`: it delayed the entry past `ready` once,
  and the API never attached. The load is fire-and-forget; `ready` awaits its promise.
- `wall-engine.wasm` must sit next to `backend-wasm.mjs` (it loads by relative URL).

## Files

| File | Role |
|---|---|
| `pentaryn-walls.mjs` | entry: wiring only |
| `walls-core.mjs` | pure barrel: constants, report/undo text, `planUndo`, `exclusive`; re-exports `core/` |
| `core/engine.mjs` | the engine: pure geometry, no Foundry APIs, no I/O (over the core cap, by design) |
| `core/backends.mjs` | backend registry (`js`), `canonical()`, `compare()` |
| `core/migrate.mjs` | pure planner of the Wave 7 flag-scope migration |
| `backend-wasm.mjs` | adapter: loads `wall-engine.wasm`, registers `wasm` |
| `settings.mjs` | `SETTINGS`, `KEYBINDINGS` |
| `actions.mjs` | feature: preview/run/undo/analyze/makeMacro, the run lock, the keybinding guard |
| `migrations.mjs` | feature, dormant: the flag-scope migration runner (wired by the Wave 7 batch) |
| `api-manifest.mjs`, `api.mjs` | API rows and their bindings |
| `wasm/` | Rust source of the compiled engine (`make foundry-walls-wasm`) |
| `lib/` | vendored kit — never edited here |

## Tests

```bash
node foundry/module/pentaryn-walls/test/run.mjs           # the gate (make foundry-walls-check)
node foundry/module/pentaryn-walls/test/corpus.mjs -v D1  # one fixture, with its mutation log
make foundry-walls-bench [N=20]                           # scaling curve, every backend
```

- `test/corpus.test.mjs` — every fixture of the corpus (`test/fixtures/corpus.mjs`) on every
  available backend; `test/engine-golden.test.mjs` — js output hashes, `canonical()` per backend,
  backend drift.
- `test/core.test.mjs`, `test/core-render.test.mjs`, `test/undo.test.mjs`,
  `test/engine-shape.test.mjs`, `test/backends.test.mjs`, `test/scopes.test.mjs`,
  `test/migrate.test.mjs` — the pure core and the migration.
- `test/glue.test.mjs` (and `glue-*.test.mjs`, `undo-history.test.mjs`), `test/hooks.test.mjs`, `test/api.test.mjs`,
  `test/features.test.mjs`, `test/settings.test.mjs`, `test/i18n.test.mjs` — the Foundry side
  against the kit stub.

## Sync

`make foundry-walls-sync` (copy, not symlink — re-copy after every change), then reload. A
`module.json` change needs a Foundry restart. After sync the GM console shows
`pentaryn-walls | ready — backends: js, wasm. …` (its keys and API list come from `KEYBINDINGS`
and the manifest's GM rows); a failed `.wasm` load adds
`(wasm unavailable: …)`.
