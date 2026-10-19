---
created: 2026-08-10
last_modified: 2026-10-19
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
world. Since 1.2.0 it also carries the **DDB corrections**: the table's fixes to D&D Beyond
characters, re-applied after every ddb-importer sync (below). Target: Foundry **v14** · dnd5e **6.0** (verified 6.0.6). The payload shapes are still the
5.3 ones on purpose ([CONTRACT §1.2](../../CONTRACT.md): dnd5e 6 migrates them until 7.0; moving
them is the `@2` contract bump). Tier `full`; no UI, one setting, two hooks at load (`init`, `ready`)
and two features: the create watch (`create-watch.mjs`), which listens only while a create is in
flight, and the DDB corrections (`ddb-corrections.mjs`).

## What the player sees

The NPC import: nothing. It is GM-only and console-first. A GM sees a permanent error toast when the
version gate or the @ref lint refuses a run, when a non-GM calls it, when an entry cannot be
prepared (a missing slug, an entry that is not an object — `null`, a string — or two items on one
entry sharing a `flags.pentaryn.action`), and when a readback fails; an info toast with the counts after a
real run, only when no actor failed — when any actor fails the GM instead sees a permanent warning toast
("N actor(s) failed") pointing at the console for the per-slug report; and a permanent "delete
`Data/<path>`" toast after a fully successful real run (when any actor fails, that delete toast is not
shown: `deleteJson.required` is `false`). Players see a
toast only if they call `import()` themselves: the `NOT_GM` refusal. Some refusals throw a `PentarynAbort` with **no** toast — read `err.code` /
`err.message`: a fetch failure (missing file, HTML body, network error, timeout), a bad option
(`BAD_ARGS`: `only` not null or an array of slug strings, `timeout` not a positive number, `path`
not a non-empty string, `unmanagedItems` not `"keep"`/`"delete"`; `import(null)` is `import({})`), a `module.json` without `flags.pentaryn`, and a call while an import is already
running (`CONFLICT`).

**DDB corrections.** After a player (or the GM) syncs a D&D Beyond character with ddb-importer,
the sheet is corrected at once: robes and notes back under Equipment, feat 1/day spells under Innate
Spellcasting, wands that spend their charges, the Transmuter's Stone as switchable benefits. The GMs
get one whispered chat line listing what changed (nothing when nothing changed).

## Settings

| Key | Scope | Default | Does |
|---|---|---|---|
| `ddbCorrections` | world | on | the automatic DDB corrections (after a sync, and the GM-ready sweep). Read live. `ddbCorrections.apply` runs regardless |

## API — game.pentaryn.importer

Canonical: `game.modules.get("pentaryn-importer").api`; `game.pentaryn.importer` is the same object.
Ask it: `game.pentaryn.importer.describe()` (offline: `test/golden/describe.json`).

| Method / member | GM | Writes | Returns |
|---|---|---|---|
| `import(options)` | yes | Actors, Items, `flags.pentaryn.*` | `ImportResult`; **throws** on a refusal (below) |
| `selftest()` | — | — | `{ ok, checks }` |
| `inspect(ref)` | — | — | `{ actor, ddb, importId, stamp, needsCorrection, frozen }` (nothing GM-only) |
| `ddbCorrections.plan(ref)` | — | — | the dry run: `{ changes, notes, frozen, needsCorrection, enabled }`; throws `BAD_ARGS` for a non-DDB actor |
| `ddbCorrections.apply(ref, { dryRun })` | owner | Items, effects, base data, the stamp | `ok({ applied, errors, stamped, … })` / `fail`; a non-owner relays to the active GM |
| `ddbCorrections.rules()` | — | — | `[{ id, label, doc }]` |
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
Each selected actor appears in exactly one of `created`, `updated`, `skipped` or `failed`: a slug
counts as created or updated only once its content hash is stamped (`importer-R6`), so an actor
whose Item write fails after the Actor write is reported only in `failed`.
`deleteJson.required` is `true` only after a non-dry run with zero failures; a run that left work
undone should be re-run against the same file.

**Two failure channels** (the row is `legacy: true`; kept, not reshaped):

| Signal | Meaning | Scope |
|---|---|---|
| throws `PentarynAbort` | version gate, `@ref` lint, missing or malformed file, non-GM, missing slug, an entry that is not an object, two items on one entry with the same action, bad option, fetch failure, an import already running | whole run; **nothing was written** |
| throws `PentarynAssertionError` | a readback mismatch (CONTRACT §8.3) | whole run; actors earlier in the batch **were** written |
| `{ ok: false, failed: [...] }` | a `ValidationError` or similar from one Actor | that actor only |

Every assertion failure names the actor slug, item action, activity id, path, expected and actual,
as a permanent toast and a `console.error`.
Each per-actor failure is a `console.warn` line `pentaryn-importer | failed <slug>: <error>` (and,
with `CONFIG.debug["pentaryn-importer"] = true`, an `import.failed` row in `trace()`) before the
summary's `console.table` (`importer-R8`).

**For an LLM.** Always run `{ dryRun: true }` first and read `created`/`updated`/`skipped`. The
dry run's split is the real run's, a slug repeated in the file included (`importer-EC5`): the
first entry would create, a later one would update, or skip when its hash matches. A thrown
`PentarynAbort` means nothing was written: fix the cause and re-run; its `code` (1.1.1) is
`NOT_FOUND` for a missing file, `NOT_GM`, `BAD_ARGS`, `CONFLICT` (already running), `TIMEOUT`, else
`REFUSED` (gate, lint, malformed entry, other fetch failures). A thrown
`PentarynAssertionError` means a partial batch: report it, do not retry blindly. A second call
while one is running rejects at once with `PentarynAbort` ("An import is already running"): await
the first, then retry.

## Data written

| What | How |
|---|---|
| world Actors | created (a new one under an `_id` derived from its slug, `importer-AC-2`), or **updated in place** — never deleted and recreated (placed tokens hold the id) |
| embedded Items | the managed ones (those with `flags.pentaryn.action`) are deleted and recreated; hand-added Items are kept unless `unmanagedItems: "delete"` |
| `flags.pentaryn.*` | the generator's **contract scope** (slug, contentHash, action, sources … — CONTRACT §9.2), written as ordinary document data. It is not this module's id and is **never migrated**: moving it would change every slug lookup and contentHash (decision D5) |
| `flags.pentaryn.contentHash` | stamped **last**, after the Items are written and every assertion passed, so an interrupted run is retried |

Never written on an update: `img`, `prototypeToken.texture`, `system.attributes.hp.value` (GM work,
and a wounded token must not heal mid-session). Nothing goes to world settings.

DDB corrections (on a D&D Beyond character only, items frozen with `flags.ddbimporter.ignoreItemUpdate`
/ `ignoreItemImport` untouched): Item type and system (retype, `==system`; recreated under the same id
if Foundry refuses), Item fields (`system.method`, a Cast activity's `spell.uuid/level` and
`consumption.spellSlot`), ActiveEffects on the Transmuter's Stone (deterministic ids,
`flags.pentaryn-riders.stone` / `.choice` — pentaryn-riders reads `choice`), the actor's base
darkvision / CON-save proficiency while they are still the stone's, and the stamp
`flags.pentaryn-importer.ddbCorrections = { importId, at, version, changes }` (written only by a run
with no errors). A whispered ChatMessage to the GMs when something changed.

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

No other module reads `flags.pentaryn.*` (the generator writes them, the importer reads them back) or
`flags.pentaryn-importer.ddbCorrections`. The importer reads `flags.ddbimporter.importId` and the
freeze flags (ddb-importer's), and `flags.pentaryn-riders.stone` (its own effects' key).

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-importer.ready` | `(api)` | the API is published (kit `publishNamespace`) |
| `pentaryn.ready` | `("importer", api, { when })` | the same, on the shared hook |

Emits nothing of its own. Listens to: `init` and `ready` at load, then
`ddb-importer.characterProcessDataComplete` from ready (pinned in `test/golden/hooks.json`), and
`createActor` for one id only during a new actor's create round trip (create-watch.mjs; registered on
the module's hook registry and removed when the create resolves, so `uninstall()` unwinds it).

## Patches and adjustments

Patches nothing. Two `foundry/adjustments.yml` rows: `ddb-importer-sync-corrections` (the
ddb-importer hook, `importId` and freeze flags the DDB corrections lean on) and `dnd5e-importer-gate`
(the dnd5e minor this code and `build_actors.py` target). Its markers are matched across the row's files combined:
`targetSystemVersion` (the `module.json` `flags.pentaryn` gate key the importer reads) appears in
`importer-core.mjs` and `documents-adapter.mjs`; `TARGET_SYSTEM_VERSION` is the generator's
constant in `scripts/foundry/build_actors.py`. The importer has no constant of its own holding the
number.

## Two sessions / who writes

DDB corrections: ddb-importer fires its hook only on the client that ran the sync, so that client
writes when it owns the actor (a player owner or a GM); a non-owner relays `ddbCorrections.apply` to
the active GM. The GM-ready sweep runs on the active GM. Two GM tabs both answer a relay and both sweep:
the writes are idempotent (the second plans from live data) and the stone's effects have deterministic
ids, so a race fails one create instead of duplicating; that run then writes no stamp and the next
sweep re-checks.

The NPC import:

Only the GM tab that calls `import()` writes; nothing runs by itself. A player calling it gets a
`PentarynAbort` (code `NOT_GM`) and a permanent error toast. A second call on the same tab while one is running is refused with
`PentarynAbort` (`items-journal-4`). That guard is per tab, so two GM tabs (the MCP bridge tab and
a browser tab) can still overlap. Exactly one actor per new slug results, and the second tab's write
is an update (`importer-AC-2`, wave-3 importer item 2): a new actor is created with an `_id`
derived from its slug (`idForSlug`, `keepId`). Foundry 14 does not refuse a `keepId` create over an
id a world Actor already holds — it silently replaces that actor — so:

- the importer looks in `game.actors` first and never sends a create for a held id. An id held by an
  actor without this slug fails the slug: `id <id> is already held by Actor "<name>" — not
  overwritten`. One held by the other tab's actor (same slug) is **joined**.
- two creates sent in the same instant both pass that look. The server answers the first tab before
  it handles the second, so the tab whose create lands second has the other tab's `createActor`
  broadcast before its own response (the create watch sees it) and **joins**. The first tab checks
  the live actor after its Item write: when the second create swapped the instance (before or after
  those Items reached the server), it writes the actor and its Items again on the live one, at most
  twice, before its readback.

Joining: wait (polling every 250 ms, up to 10 s of wall clock, which also holds in a hidden tab whose timers Chrome clamps to 1 s) for the other tab's content-hash stamp, then take
the update path. A look-first join (no create sent) is skipped when the stamped hash is this file's,
else updated. A same-instant join is always updated: its own create replaced the other tab's actor
and may have wiped Items written before it, while that tab's stamp can still land afterwards, so the
stamp says nothing about the live Items. With no stamp in 10 s
(the other tab failed or stopped) the joining tab updates the actor itself. Only a joined actor that
is deleted while waiting fails the slug ("deleted by another GM tab while this run waited for it —
re-run"). Actors already in the world keep their random ids and are found by slug as before. Two
tabs updating the same existing actor at once are not guarded — run imports from one place.

An update Foundry refuses (an invalid change, such as a blank `name`) is a per-actor failure
(wave-3 importer item 1): Foundry's client shows its own error toast and `update()` resolves
`undefined` without throwing, so the importer repeats the client's dry run; a throw or a non-empty
diff fails the slug (`update refused by Foundry — <reason>`) with no Item writes and no hash stamp,
so the next run retries it. An empty diff is a real no-op and still counts as updated.

## Extending

1. A contract change goes into `foundry/CONTRACT.md` first, then the generator, then here.
2. A pure rule (a FormulaField glob, a strip key, a gate rule) → `importer-core.mjs`, with a row in
   the tables of `test/core.test.mjs` (which also run against the oracle) or `test/version-gate.test.mjs`.
3. Anything that reads a live Document, toasts or writes → `documents-adapter.mjs`; the run order →
   `api.mjs` `importActors`.
4. A new API member → a row in `api-manifest.mjs`, its implementation in `api.mjs`, then
   `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review the `describe`/`surface` diff.
5. A DDB correction → a rule row in `ddb-core.mjs` `RULES` (`match`/`plan`, generic: item type,
   name, identifier, data shape — never an actor or item id), a fixture in `test/fixtures/ddb.mjs`, a
   table in `test/ddb-core.test.mjs` with its idempotence case. A one-off homebrew item is frozen,
   not ruled (`context/foundry/importer.md`, "Freeze or rule").
6. Moving the dnd5e target minor → `module.json` `flags.pentaryn.targetSystemVersion` (a Foundry
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
| `settings.mjs` | `SETTINGS` (`ddbCorrections`), `setting()` |
| `ddb-core.mjs` | pure: the DDB-correction rules, `planCorrections`, the stamp |
| `ddb-adapter.mjs` | a live Actor → the rules' snapshot, the lookups (spells, PHB index), the writes |
| `ddb-corrections.mjs` | feature: the ddb-importer listener, the relay, the GM-ready sweep, the summary |
| `api.mjs` | `importActors`, `buildApiFor`, `legacyRoot`, `selftest` |
| `lib/` | the vendored kit (tier full) — never edited here |

## Tests

From this folder: `node test/run.mjs` (also `make foundry-importer-check`). `core.test` runs every
table against the verbatim oracle (`test/fixtures/legacy-importer.mjs`) and the core;
`ddb-core.test` (bare) and `ddb.test` cover the DDB corrections; `glue.test` and `write.test` load the entry under the kit's Foundry stub and pin toasts, console
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
