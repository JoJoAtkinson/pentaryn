---
created: 2026-08-10
last_modified: 2026-10-11
tags: ["foundry", "vtt", "module", "dnd5e"]
status: active
---

# Pentaryn Importer (`pentaryn-importer`)

**Read this when:** you are changing or calling `pentaryn-importer`. **Not this file:** running an
import at the table → [`context/foundry/importer.md`](../../../context/foundry/importer.md) · the data
contract → [`foundry/CONTRACT.md`](../../CONTRACT.md) · why the pipeline looks like this →
[`context/plans/foundry-content-pipeline.md`](../../../context/plans/foundry-content-pipeline.md)
(D3, D8, D10) · how every addon is built → [`context/foundry/addon-blueprint.md`](../../../context/foundry/addon-blueprint.md)

Stage 2 of the Foundry pipeline. Reads the `actors.json` that Stage 1
(`scripts/foundry/build_actors.py`) wrote, and upserts the NPC Actors it describes into the live
world. Target: Foundry **v14** · dnd5e **6.0** (verified 6.0.6). The payload shapes are still the
5.3 ones on purpose ([CONTRACT §1.2](../../CONTRACT.md): dnd5e 6 migrates them until 7.0; moving
them is the `@2` contract bump). Tier `full`; no UI, no settings, one hook (`ready`).

## What the player sees

Nothing. The importer is GM-only and console-first. A GM sees a permanent error toast when the
version gate or the @ref lint refuses a run, when a non-GM calls it, when an entry cannot be
prepared (e.g. a missing slug), and when a readback fails; an info toast with the counts after a
real run; and a permanent "delete `Data/<path>`" toast after a successful one. Players see a
toast only if they call `import()` themselves: the `NOT_GM` refusal. Some refusals throw a `PentarynAbort` with **no** toast — read `err.code` /
`err.message`: a fetch failure (missing file, HTML body, network error, timeout), a bad option
(`BAD_ARGS`: `only` not null or an array of slug strings, `timeout` not a positive number, `path`
not a non-empty string, `unmanagedItems` not `"keep"`/`"delete"`; `import(null)` is `import({})`), a `module.json` without `flags.pentaryn`, and a call while an import is already
running (`CONFLICT`).

## Settings

n/a — registers none.

## API — game.pentaryn.importer

Canonical: `game.modules.get("pentaryn-importer").api`; `game.pentaryn.importer` is the same object.
Ask it: `game.pentaryn.importer.describe()` (offline: `test/golden/describe.json`).

| Method / member | GM | Writes | Returns |
|---|---|---|---|
| `import(options)` | yes | Actors, Items, `flags.pentaryn.*` | `ImportResult`; **throws** on a refusal (below) |
| `selftest()` | — | — | `{ ok, checks }` |
| `moduleId`, `actorsContract`, `_internals` | — | — | the module id, `"pentaryn/actors.json@1"`, the four helpers below |

**The legacy root keys.** At `ready` the importer also *merges* `import`, `moduleId`, `contract`
(the actors.json contract, `pentaryn/actors.json@1`) and `_internals` (frozen:
`fetchJsonWithTimeout`, `lintFormulas`, `valuesMatch`, `normalise`) into `game.pentaryn`. So
`await game.pentaryn.import()` and `make foundry-import`'s instructions keep working. The root is
never replaced or frozen, so every other module's namespace survives in either load order. On the
namespace, `contract` is the API contract `pentaryn-importer/api@1`, so the actors.json one is
`actorsContract` there.

```js
await game.pentaryn.import({
  path: "worlds/<world>/actors.json", // default: worlds/<game.world.id>/actors.json
  dryRun: false,          // true → gate, lint and report; write nothing
  only: null,             // e.g. ["skeleton"] — restrict to these slugs
  force: false,           // true → ignore contentHash and rewrite every selected actor
  timeout: 15000,         // fetch timeout, ms
  unmanagedItems: "keep"  // or "delete" — what to do with Items a GM added by hand
});
```

The result is `{ ok, path, url, dryRun, manifest: { generator, generatorVersion, generatedAt,
sourceRevision, skippedRows }, counts: { total, selected, created, updated, skipped, failed,
assertions }, created, updated, skipped, failed: [{ slug, error }], deleteJson }`.
`deleteJson.required` is `true` only after a non-dry run with zero failures; a run that left work
undone should be re-run against the same file.

**Two failure channels** (the row is `legacy: true`; kept, not reshaped):

| Signal | Meaning | Scope |
|---|---|---|
| throws `PentarynAbort` | version gate, `@ref` lint, missing or malformed file, non-GM, missing slug, bad option, fetch failure, an import already running | whole run; **nothing was written** |
| throws `PentarynAssertionError` | a readback mismatch (CONTRACT §8.3) | whole run; actors earlier in the batch **were** written |
| `{ ok: false, failed: [...] }` | a `ValidationError` or similar from one Actor | that actor only |

Every assertion failure names the actor slug, item action, activity id, path, expected and actual,
as a permanent toast and a `console.error`.

**For an LLM.** Always run `{ dryRun: true }` first and read `created`/`updated`/`skipped`. A thrown
`PentarynAbort` means nothing was written: fix the cause and re-run; its `code` (1.1.1) is
`NOT_FOUND` for a missing file, `NOT_GM`, `BAD_ARGS`, `CONFLICT` (already running), `TIMEOUT`, else
`REFUSED` (gate, lint, malformed entry, other fetch failures). A thrown
`PentarynAssertionError` means a partial batch: report it, do not retry blindly. A second call
while one is running rejects at once with `PentarynAbort` ("An import is already running"): await
the first, then retry.

## Data written

| What | How |
|---|---|
| world Actors | created, or **updated in place** — never deleted and recreated (placed tokens hold the id) |
| embedded Items | the managed ones (those with `flags.pentaryn.action`) are deleted and recreated; hand-added Items are kept unless `unmanagedItems: "delete"` |
| `flags.pentaryn.*` | the generator's **contract scope** (slug, contentHash, action, sources … — CONTRACT §9.2), written as ordinary document data. It is not this module's id and is **never migrated**: moving it would change every slug lookup and contentHash (decision D5) |
| `flags.pentaryn.contentHash` | stamped **last**, after the Items are written and every assertion passed, so an interrupted run is retried |

Never written on an update: `img`, `prototypeToken.texture`, `system.attributes.hp.value` (GM work,
and a wounded token must not heal mid-session). Nothing goes to world settings.

Each guarantee is an active check: `{cache: "no-cache"}` on the fetch (`express.static` would serve
the previous build); the three-way version gate (JSON, `module.json` `flags.pentaryn`, live game),
which lists every mismatch and refuses the whole run; the `@ref` lint over the exact FormulaField
paths (an unknown `@term` rolls as zero with no signal); the prototype-token strip detector against
saved source data; the Item count and identity checks (`createEmbeddedDocuments` drops an invalid
Item without throwing); the activity-id check (contract U7); and the displayed-label readback
(`labels.toHit`, `labels.save`, `labels.damage.N.formula`, `item.labels.recharge`). An unchanged
`contentHash` is skipped; the module compares two strings and never recomputes the hash (canonical
JSON differs between Python and JS).

## Flags other modules read

n/a — no other module reads `flags.pentaryn.*`; the generator writes them and the importer reads
them back.

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-importer.ready` | `(api)` | the API is published (kit `publishNamespace`) |
| `pentaryn.ready` | `("importer", api, { when })` | the same, on the shared hook |

Emits nothing of its own. Listens to: `ready` only (pinned in `test/golden/hooks.json`).

## Patches and adjustments

Patches nothing. One `foundry/adjustments.yml` row: `dnd5e-importer-gate` (the dnd5e minor this
code and `build_actors.py` target). Its markers are matched across the row's files combined:
`targetSystemVersion` (the `module.json` `flags.pentaryn` gate key the importer reads) appears in
`importer-core.mjs` and `documents-adapter.mjs`; `TARGET_SYSTEM_VERSION` is the generator's
constant in `scripts/foundry/build_actors.py`. The importer has no constant of its own holding the
number.

## Two sessions / who writes

Only the GM tab that calls `import()` writes; nothing runs by itself. A player calling it gets a
`PentarynAbort` (code `NOT_GM`) and a permanent error toast. A second call on the same tab while one is running is refused with
`PentarynAbort` (`items-journal-4`); the guard is per tab, so two GM tabs (the MCP bridge tab and a
browser tab) can still overlap — run imports from one place.

## Extending

1. A contract change goes into `foundry/CONTRACT.md` first, then the generator, then here.
2. A pure rule (a FormulaField glob, a strip key, a gate rule) → `importer-core.mjs`, with a row in
   the tables of `test/core.test.mjs` (which also run against the oracle) or `test/version-gate.test.mjs`.
3. Anything that reads a live Document, toasts or writes → `documents-adapter.mjs`; the run order →
   `api.mjs` `importActors`.
4. A new API member → a row in `api-manifest.mjs`, its implementation in `api.mjs`, then
   `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review the `describe`/`surface` diff.
5. Moving the dnd5e target minor → `module.json` `flags.pentaryn.targetSystemVersion` (a Foundry
   restart, playbook §10), `TARGET_SYSTEM_VERSION` in `scripts/foundry/build_actors.py`, and the
   `dnd5e-importer-gate` row in `foundry/adjustments.yml`, together.

## Pitfalls

- **`getFlag("pentaryn", …)` throws.** `Document#getFlag` only accepts `core`, `world`, the system
  id and active module ids; `"pentaryn"` is none of those. Reads go through
  `foundry.utils.getProperty(doc, "flags.pentaryn.…")`; writes are plain document data, never `setFlag`.
- **`FLAG_SCOPE` (`"pentaryn"`) is not the module id** (`pentaryn-importer`). `flagScope` in the
  manifest is the module id; `flags.pentaryn.*` is the generator's contract scope.
- **`cloneJson` is a JSON round-trip on purpose.** Never "optimise" it to `structuredClone` or
  `deepClone`: they keep `undefined` and Dates and would change the payloads.
- **`flags.pentaryn` merges on update** (`ObjectField._updateDiff` → `mergeObject`), which is what
  makes the hash-stamped-last design work; a key dropped by a later contract lingers until rebuilt.
- **A stale copy in `Data/modules/` is a real failure mode** (sync copies, never symlinks); the
  version gate checks `module.json`'s `flags.pentaryn` to catch it, so keep those keys intact.
- **`Data/` is public over the tunnel.** A staged `actors.json` is world-readable until it is
  deleted; the module cannot delete it (Foundry has no client file-delete). `make foundry-import`
  deletes it on every exit; after a hand run, `make foundry-clean`.
- **`getPath` vs `getProperty`.** The core's `getPath` reads the manifest's plain JSON only; every
  read of a live Document keeps `foundry.utils.getProperty`.

## Files

| File | Role |
|---|---|
| `pentaryn-importer.mjs` | entry: the `ready` publish (legacy root merge + `publishNamespace`) |
| `importer-core.mjs` | pure: constants, error classes, lint, payload shaping, `versionProblems`, the design note |
| `documents-adapter.mjs` | Foundry glue: fetch, gate/lint refusals, readback assertions, writes, summary, the logger |
| `api-manifest.mjs` | the API rows (pure data) |
| `api.mjs` | `importActors`, `buildApiFor`, `legacyRoot`, `selftest` |
| `lib/` | the vendored kit (tier full) — never edited here |

## Tests

From this folder: `node test/run.mjs` (also `make foundry-importer-check`). `core.test` runs every
table against the verbatim oracle (`test/fixtures/legacy-importer.mjs`) and the core;
`glue.test` and `write.test` load the entry under the kit's Foundry stub and pin toasts, console
lines, results and Document writes; `hooks`, `api`, `i18n`, `version-gate` and `sites` cover the
rest; `index` pins the slug index. One golden at a time: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`,
then read the diff. `node test/bench.mjs` prints the slug-lookup timing curve (index vs the old per-entry scan).

## Sync

The importer is **not** deployed by `module-sync`; it ships with the actor pipeline:
`make foundry-sync WORLD=<world>` (ops `stage`) rebuilds `actors.json`, copies this folder into
`Data/modules/` and **stages `actors.json` into the world**, so always follow it with
`make foundry-clean WORLD=<world>`, or use `make foundry-import WORLD=<world>`, which deletes and
verifies for you. The pipeline's default world is not necessarily yours: pass `WORLD`. Then reload
Foundry (a `module.json` change needs a restart). Smoke: `game.pentaryn.importer.selftest().ok`.
Deploy and rollback steps for a migration:
[`context/plans/addon-blueprint-2026-10/migrate-pentaryn-importer.md`](../../../context/plans/addon-blueprint-2026-10/migrate-pentaryn-importer.md) §9.
