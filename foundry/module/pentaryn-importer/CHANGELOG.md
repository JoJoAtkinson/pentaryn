# Changelog — Pentaryn Importer (`pentaryn-importer`)

## 1.1.1 — 2026-10-11 (live-check fix)

- **[declared] Every `PentarynAbort` carries a kit code** (`err.code`, lib/errors.mjs): `NOT_FOUND`
  when the file is not there (HTTP 404, or Foundry's HTML page instead of JSON), `NOT_GM`, `BAD_ARGS`
  (`unmanagedItems`), `CONFLICT` (an import already running), `TIMEOUT` (the fetch), else `REFUSED`
  (version gate, `@ref` lint, malformed entry, another HTTP error, a network failure). Through
  `pentaryn-write` a dry run on the default path after an import now answers `NOT_FOUND`, not
  `INTERNAL`. Messages, toasts and `name` are unchanged (golden/refusals.json untouched).

## Unreleased — blueprint migration (wave 1, 2026-10-11)

`module.json` stays 1.1.0 until the Wave 7 restart batch adds the blueprint keys.

- **[declared] README: a run with a failed actor ends on a permanent warning, not the counts toast**
  (`importer-M2-followup`, doc only): "What the player sees" now says the info toast with counts appears
  only when no actor failed; otherwise the GM sees the permanent "N actor(s) failed — see the console"
  warning and no delete-the-JSON toast (`deleteJson.required` is `false`). Pinned by
  test/per-actor-outcome.test.mjs.
- **[declared] Each failed slug is logged through the kit logger** (`importer-R8`): the end-of-run
  summary writes one `pentaryn-importer | failed <slug>: <error>` warn line per failure before the
  `console.table` (kept, with the group), and with debug on `trace()` carries an `import.failed`
  row `{ slug, error }`. golden/write-console.json carries the new line; golden/console.json has no
  failing run and is unchanged.
- **[declared] Two GM tabs importing the same new slug no longer both create it** (`importer-AC-2`):
  a new actor is created with a slug-derived `_id` (`idForSlug` in importer-core, 16 chars of
  [A-Za-z0-9]) and `keepId`, so the server refuses the second create; that tab reports
  `{ slug, error: "created concurrently by another GM tab — re-run" }` in `failed[]` and continues.
  Existing actors with random ids are found by slug and updated as before. golden/write-full.json
  carries the `_id` and `keepId`.
- **[declared] A malformed entry anywhere in `actors.json` refuses the whole run before any write**
  (`importer-R1`): every entry is prepared first, so a missing slug or a null entry after a good one
  no longer leaves the earlier actors created and hash-stamped. A thrown `PentarynAbort` again means
  nothing was written.
- **[declared] Every option is shape-checked, not only `unmanagedItems`** (`importer-R3`): `only`
  that is not null or an array of slug strings (e.g. `only: "x"`, which used to select nothing and
  still toast the counts), a `timeout` that is not a positive finite number (`timeout: null` used to
  abort at once) and a `path` that is not a non-empty string now throw an unshouted `PentarynAbort`
  `BAD_ARGS` before any fetch, naming the option and the value received. `import(null)` is
  `import({})` instead of a `TypeError`. New keys in golden/refusals.json.
- **[declared] `selftest()` checks every version-gate key, not only `contract`** (`importer-M3`):
  one check per `GATE_KEYS` key (`contract`, `targetSystem`, `targetSystemVersion`, `generation`),
  labelled `module.json flags.pentaryn.<key> present` with the value as `detail`; `contract` must
  still equal the actors.json contract. A module.json missing a gate key used to pass selftest while
  every import was refused. The old check label `… contract is the contract this code speaks` is gone.
- **[declared] The version-gate refusal names `importer-core.mjs`, not `pentaryn-importer.mjs`**
  (`importer-M4`): when module.json's `flags.pentaryn.contract` disagrees with the code, the line now
  reads `… module.json and importer-core.mjs are out of step.` — the file that holds `CONTRACT_ID`
  since the core split. golden/refusals.json `gateModuleJson` carries the new text.
- **[declared] An `actors` entry that is not an object is refused as `PentarynAbort` `REFUSED`**
  (`importer-R4`): `null`, a string or an array now reads `An actor entry is not an object (got …)`,
  with one permanent error toast, before the `@ref` lint and before any write. It used to escape as
  an uncoded `TypeError` (a string entry from the lint, unshouted). golden/refusals.json `nullEntry`
  carries the new text and `stringEntry` is new; the two non-object rows of golden/prepare.json moved
  to a core.test case that still pins the oracle's `TypeError`.
- **[declared] Activities on an Item type that cannot hold them fail the U7 readback, not a `TypeError`**
  (`importer-R5`): a payload or `expected` entry that asks for activities on a `loot`, `container`,
  `class`, `subclass`, `background` or `race` Item (no `system.activities` in dnd5e) now aborts the
  run with the named `READBACK ASSERTION FAILED` message (`path: system.activities`, `actual: []`)
  and its toast, instead of a `Cannot read properties of undefined` landing in `failed[]` while the
  run went on. No new assertion site; goldens untouched.
- **[declared] Each actor has exactly one outcome in the result and summary** (`importer-R6`): a
  slug goes into `created[]`/`updated[]` only after its content hash is stamped, not as soon as the
  Actor is written. An actor whose Item write (or anything else after the Actor write) fails is now
  reported only in `failed[]`, instead of "1 updated · 1 failed" for the same actor. A later entry
  with the same slug still updates the actor created earlier in the run. Goldens untouched.
- **[declared] A dry run reports a duplicate slug the way the real run does** (`importer-EC5`): a
  slug repeated in the file is "would create" once, then "would update" (or skipped when its
  content hash matches the earlier entry's), instead of "would create" every time. A dry run still
  writes nothing. golden/dryrun.json (an empty manifest) is unchanged.
- **[declared] A body read that fails is a `PentarynAbort` `REFUSED`, not the raw error**
  (`importer-AC-1-half`): when `actors.json`'s body stream errors after the headers (other than the
  timeout), the importer throws `Network error reading <url>: <cause>`, like the fetch-failure
  branch, so `pentaryn-write` reports `REFUSED` instead of `INTERNAL`. New key `fetchBodyError` in
  golden/refusals.json.
- **[declared] Two items on one entry with the same `flags.pentaryn.action` refuse the run**
  (`importer-EC4`): `preparePayload` throws `PentarynAbort` `REFUSED` `Actor "<slug>" has two items
  with flags.pentaryn.action "<action>". …` in the pre-pass, with one permanent error toast, before
  any write. It used to import both rows and pass the readback, because `find()` matched both to one
  live Item. No new assertion site; the adapter comment no longer claims the readback catches it.
  New key `duplicateAction` in golden/refusals.json.
- **[declared] `game.pentaryn` is merged into, never replaced or frozen** (`items-journal-1`). Every
  module's namespace survives whichever order the modules load in; `import`, `moduleId`, `contract`
  and the frozen `_internals` stay on the root.
- **[declared] A second `import()` while one is running rejects `PentarynAbort`** (`items-journal-4`):
  "An import is already running; await it or reload." Sequential calls are unchanged; a failed run
  releases the guard.
- **[declared] Console lines read `pentaryn-importer | …`** (kit logger) instead of
  `[pentaryn-importer] …`. Toast text is unchanged.
- Kit 1.0.2 vendored (wave 2): the kit's frozen-root guard and re-alias tick are retired now that
  this module merges into `game.pentaryn` (J10); the importer's own behaviour is unchanged.
- New: `game.modules.get("pentaryn-importer").api` = `game.pentaryn.importer` with `describe()` and
  `selftest()`; the `pentaryn-importer.ready` and `pentaryn.ready` hooks fire (`items-journal-5`).
- Internals: split into `importer-core.mjs` (pure), `documents-adapter.mjs`, `api-manifest.mjs`,
  `api.mjs`; one `refuse`/`failAssertion` path for every refusal (`items-journal-2`, `-3`); one slug
  index per run instead of a world-actor scan per manifest entry (`items-journal-7`); a node suite
  gates the module (`make foundry-importer-check`).

## 1.1.0 — 2026-10-10

- Retarget to dnd5e 6.0: `module.json` `targetSystemVersion` `"6.0"`, dnd5e compatibility minimum
  6.0.0 / verified 6.0.6. No code change; generator 1.0.1 emits byte-identical actors (same
  `contentHash`), so a re-import after the upgrade changes nothing.

## 1.0.0 — 2026-08-10

- First release, dnd5e 5.3.
