# Changelog — Pentaryn Importer (`pentaryn-importer`)

## 1.2.1 — 2026-10-19 — DDB corrections review fixes

- **[declared] Freeze is `flags.ddbimporter.ignoreItemImport` only.** ddb-importer 7.5.8's import
  (mergeExistingItems, clearItemsByUserSelection) honours that flag alone; `ignoreItemUpdate` only
  stops the push back to D&D Beyond. An item carrying just `ignoreItemUpdate` (Chris's Premades items)
  is no longer listed as frozen, and the rules correct it. The freeze script
  (`scripts/foundry/fixes/2026-10-19-ddb-freeze-items.js`) now sets `ignoreItemImport`. At the table:
  `game.pentaryn.importer.inspect("<pc>").frozen` lists only `ignoreItemImport` items.
- **[declared] `apparel-as-equipment` is narrower and keeps more.** The apparel / notes word must end
  the name ("Cloak Clasp", "Dress Sword" no longer match); properties (incl. `mgc`), attunement,
  identifier and magical bonus are kept across the retype; an item that is magical, needs attunement,
  or has uses / activities beyond the DDB consumable default (1 use, one "use" utility) is reported in
  `notes` and left a consumable.
- **[declared] New rule `stale-cast-cache`.** The cached copy of the old DDB spell that a repointed Cast
  activity leaves behind (`flags.dnd5e.cachedFor`; Marwen's duplicate *Detect Magic* from the
  Prism-Silt Lens) is deleted. New op `deleteItem` (one batched `deleteEmbeddedDocuments`). At the
  table: Marwen's spellbook shows one Detect Magic after the first GM login. **Second review:** a
  repoint planned in the same run is left to dnd5e, whose `preUpdateActivities`/`onUpdateActivities`
  deletes the old cached copy itself (ours raced it); only a copy whose source is not the activity's
  current spell (nor the new one) is deleted. Uuids compare normalised (the adapter keys them through
  `foundry.utils.parseUuid`: `sourceKey`, `castKeys`), so a legacy compendium uuid is not "stale". The
  adapter re-checks each delete target just before the call and counts "does not exist" as done.
- **[declared] The relay checks ownership.** The active GM applies a relayed `ddbCorrections.apply`
  only when the sender owns the actor (`testUserPermission(user, "OWNER")`), else `REFUSED`.
- **`transmuters-stone` heuristics.** A Resilient feat counts as a CON-save source only when it chose
  Constitution (its Trait `saves:con`, else its ASI assignment) — `/con/` matched "configuration" in
  every Resilient. A CON save from the starting class (a `primary` Trait) keeps the base proficiency.
  Baked darkvision is the species' range + 60 and resets to the species' range (no 180 ft doubling
  for a 120 ft species). **Second review:** the reset is skipped, and noted, when another feature,
  subclass, class or equipment evidently grants darkvision (its name or description says so, its own
  senses, or an effect changing it: core `otherDarkvision`). A multiclass with no
  `system.details.originalClass` keeps the safe behaviour (every class's primary saves count) and
  gets a note.
- **[declared] A stamp from another module version is due.** `needsCorrection` is also true when the
  stamp's `version` differs from the running one, so a release that adds or changes a rule reaches
  characters already stamped for their current import. **The first GM login on 1.2.1 re-runs the
  corrections on every DDB character once** (that is what removes Marwen's stale Detect Magic).
- A sync hook and the sweep meeting on one actor: the skipped one logs a console warning instead of
  dropping silently.
- A type change replaces `system` with core's `foundry.data.operators.ForcedReplacement`
  (`ForcedReplacement.create`), not the deprecated `==system` key (kept only for a core without it).
- Goldens: `describe` re-pinned (inspect doc, apply side effects and doc, `flags.reads`).

## 1.2.0 — 2026-10-19 — DDB corrections

- **[declared] DDB corrections: the table's fixes to D&D Beyond characters survive a re-sync.** A
  ddb-importer sync puts its own shapes back; the importer now re-applies four rules
  (`ddb-core.mjs` `RULES`) right after it, on any character with `flags.ddbimporter`:
  `apparel-as-equipment` (robes, clothes, notes typed consumable → equipment),
  `freecast-innate` (feat 1/day casts filed At-Will → Innate), `cast-self-uses` (an item's Cast
  activity on a DDB spell that spends its own uses → the PHB spell, slot on, so the item's charges are
  spent; no PHB match → reported only) and `transmuters-stone` (pick-one passive effects with
  `flags.pentaryn-riders.choice`, base darkvision / CON save reset while they are still the stone's).
  Ported from the 2026-10-19 fix scripts (feedback tiDvFa, ixcdvA, tNdOEx), which stay as a fallback.
  Items frozen with `flags.ddbimporter.ignoreItemUpdate` / `ignoreItemImport` are skipped.
  - When: ddb-importer's `ddb-importer.characterProcessDataComplete` on the syncing client (an owner
    applies, a non-owner relays to the active GM), and a GM-ready sweep of every DDB character whose
    `flags.ddbimporter.importId` differs from its `flags.pentaryn-importer.ddbCorrections` stamp
    (ddb-importer stores no sync timestamp; it gives each import a fresh importId). **The first GM
    login after this ships corrects every DDB character in the world once.**
  - One world setting, `ddbCorrections` (default on), switches the automatic runs off.
  - One console line and one chat message whispered to the GMs per run that changed something;
    nothing when nothing changed.
  - API: `ddbCorrections.plan(ref)` (dry run), `.apply(ref, { dryRun })` (write; relay query
    `pentaryn-importer.ddbCorrections.apply`), `.rules()`, and `inspect(ref)` (the stamp, frozen items).
  - To see it at the table: sync a character from D&D Beyond; the robes sit under Equipment, the
    1/day spells under Innate Spellcasting, the wand casts and spends a charge, and the GM gets a
    "DDB corrections — <name>" whisper.
- New files `ddb-core.mjs`, `ddb-adapter.mjs`, `ddb-corrections.mjs`, `settings.mjs`, `lang/en.json`
  (`module.json` gains `languages`: a Foundry restart); kit `election` vendored. Tests
  `ddb-core.test`, `ddb.test`; goldens `describe`, `surface`, `hooks` re-pinned for the new rows, the
  setting, the query and the `init` + ddb-importer hooks.

## Unreleased — defect wave 3 (2026-10-13)

- **[declared] An update Foundry refuses is a failure, not "updated"** (wave-3 importer item 1):
  Foundry 14's client drops an invalid update (a blank `name`) with its own error toast and resolves
  `undefined`; the importer carried on, stamped the new hash and reported the slug as updated, so it
  was never retried. `updateActor` (documents-adapter) repeats the client's dry run on `undefined`:
  a throw or non-empty diff → `failed[]` `update refused by Foundry — <reason>`, no Item writes, no
  stamp. An empty diff (a real no-op) still counts as updated. test/update-refused.test.mjs.
- **[declared] Two creates in the same instant: one creates, the other joins as an update** (wave-3
  importer item 2): the tab whose create lands second sees the other tab's `createActor` broadcast
  before its own response (new feature `create-watch.mjs`, a listener held only for the create's
  round trip), stands down, waits up to 10 s for the winner's content-hash stamp and takes the update
  path. Its own create replaced the winner's actor and may have wiped Items the winner wrote before
  it, so this join never skips on the stamp: it rewrites the actor and its Items. The tab that landed
  first checks the live instance after its Item write; if the other tab's replace swapped it, the
  actor and its Items are written again on the live one (at most twice) before the readback, so a
  replace handled after its Items no longer aborts the run with a readback assertion. The look-first
  case (the id already held by the other tab's actor, no create sent) joins the same way, skipping on
  the same hash, instead of failing "created concurrently by another GM tab — re-run".
  test/concurrent-create.test.mjs.
- **The join wait is 10 s of wall clock** (FIX-W3 live check): it was counted in 250 ms polls, and
  Chrome clamps a hidden tab's timers to about 1 s, so in the MCP bridge tab the wait took 40 s. It
  now also ends when 10 s have passed on the clock, and the "no content hash" line gives the real
  wait. test/concurrent-create.test.mjs (a clamped-timer run).

## Unreleased — FIX-3 live-check fix (2026-10-13)

- **[declared] A new actor's slug id is looked up before the create, never overwritten**
  (`importer-AC-2` live): Foundry 14.369's server does not refuse a `keepId` create over an `_id` a
  world Actor already holds — it silently replaces that actor — so the "server refuses the second
  create" guard below never fired live and a second tab overwrote the first. `importActors` now checks
  `game.actors.get(idForSlug(slug))` first: held by an actor with that slug → `failed[]`
  "created concurrently by another GM tab — re-run"; held by any other actor → `failed[]`
  `id <id> is already held by Actor "<name>" — not overwritten`; no create is sent either way. The
  write-test stub now replaces on a held id, as Foundry 14 does.

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
