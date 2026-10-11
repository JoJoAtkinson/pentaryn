# Wave 1 report (2026-10-11, branch migrate/wave-1)

**Read this when:** reviewing what wave 1 of the blueprint migration changed, or picking up an item
that waits on Joe. History, not instructions — operating rules are in
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md).

Scores before and after Stage 0: [`wave-1-baseline.md`](wave-1-baseline.md).

## Open for Joe

| # | Item | From | What is needed |
|---|---|---|---|
| J1 | The updater's exposure scanner reads the template literal `` `levels ${…}` `` in prompts' `geometry-core.mjs` as the Levels package. Pinned as a strict expected failure (`11919da`); there is no audit id for it. | Lane A baseline | an audit id, or accept it as a known scanner false positive |
| J2 | python-tooling-45: two more inputs the validator accepts but the build refuses — area `"20ft cone"` and a save without `on_save`. Pinned as known bugs under -45. | Lane A | part of the -45 narrowing decision already deferred |
| J3 | Confirm the conformance gate stays **advisory until Stage 5** (`CONFORMANCE_FAILS = False` in `scripts/foundry/ops/modules.py`): `make foundry-<m>-check` reports failing rules but stays green. | Lane A | yes/no |
| J4 | D6 tool name: the cut suffix says `get-character-entity <id>`, which needs a character **and** an entity and returns an item, not a biography. `get-character <id>` may be what was meant; for note documents neither applies. Implemented exactly as decided. | Lane B | keep or change the suffix (a [declared] change either way) |
| J5 | `creatures-strip-over-argon` is a module-prefixed row that is not a patch, so it fails C32 under D2. The creatures guide suggests `argon-creatures-strip-float`. | Lane B | apply the rename when creatures migrates (no new decision unless the name differs) |
| J6 | Kit gap: the kit's Foundry test stub has no `globalThis.logger`, which `logCompatibilityWarning` writes through. Ties stubs it locally (`8ad6a23`). Fixing `foundry/lib` changes the test kit's bytes, so every migrated module needs `vendor.py sync --all` in the same step. | Lane B | when to bump the kit (a merge-time step) |
| J7 | The source comment beside `study.examine` quotes Joe's rule "no examine, no auto detection"; the new name now sits next to that quote. Harmless. | Lane B | reword the comment or leave it |
| J8 | Queries reach every tab of the recipient user, so a writing `relayed`/`guarded` handler runs twice with the MCP bridge tab and a GM browser tab open (playbook §5.9.5). Affected: riders' Battle Medic relay (`riders.mjs:417`), journal `ensure` (`journal.mjs:146`); idempotency unverified. | Lane R | a new audit id, or a decision to make them claim first ([declared]) |
| J9 | `guarded`'s NOT_GM check admits Assistant GMs (`isGM`). Documented in §5.9, not changed. | Lane R | none unless Assistants should be refused |

| J10 | The keystone landed (`c0c3f97`): the importer no longer freezes `game.pentaryn`. The kit's frozen-root guard and `realiasTick` in `foundry/lib/publish.mjs` (COMPAT `until: items-journal-1`) and the other modules' guard copies are now dead weight, but removing them is a kit bump (`vendor.py sync --all`, every migrated module) and one commit per module. Not done here. | Stage 1 | when to retire the COMPAT block (with J6's kit bump?) |
| J11 | The importer's declared changes (D-I1 merge, D-I2 console prefix, D-I3 re-entrancy refusal) are committed but **not deployed**; deploy and rollback steps are in the importer guide §9 (`make foundry-sync WORLD=pentaryn`, then `make foundry-clean`). | Stage 1 | the live-test run |
| J12 | python-tooling-10's stamp carries `synced_at`, so every module sync changes `Data/modules` content and the next `make foundry-backup` takes a snapshot even if no code changed (its digest skip no longer fires after a sync). Harmless; `cloud.snapshot_digest` could ignore `.pentaryn-sync.json` if the extra snapshots matter. | Stage 1 | keep, or ignore the stamp in the snapshot digest |
| J13 | pings step 10 (i18n): `languages`, `lang/en.json`, the `max` row's `PENTARYN_PINGS.Setting.max.Name/Hint` keys and `test/i18n.test.mjs` need **one edit to a frozen pin** (the `settings.register` option pin in `glue.test.mjs`). The freeze rule forbids it, so pings stays at 95.5 % with C40 and C51 failing. The rest of the pings `module.json` row landed in the wave 1 integration. | Integrator (pings) | allow that one golden edit (a [declared] step-10 commit), or leave pings' settings unlocalised |
| J14 | names N-L1: renaming a base actor relabels every unlinked token that uses it. Pinned as today's behaviour. | Integrator (names) | keep, or call it a bug (audit id) |
| J15 | names N-D4: the optional console line for the rename toast (`log.notify`) was not taken. | Integrator (names) | none unless wanted |
| J16 | Kit gap (`foundry/lib/patch.mjs`): a `wrapMethod` handle's `unwrap()` restores the method but keeps the kit's record, so a later `wrapMethod` with the same marker returns the stale handle and does not wrap. Pings' `uninstall()` uses `unwrapAll()` instead. | Integrator (pings) | fold into J6's kit bump |
| J17 | names, pings and cursors are committed but **not deployed**: their `module.json` edits (`flags.pentaryn`, `compatibility`) need the restart batch, and the declared changes need a live smoke (names N-D1..N-D3 and the base-actor sync ref; pings P-D1..P-D3 — ping, then `last().ageMs`, `describe().version === "0.1.0"`, `uninstall()` + re-import; cursors C-1 `describe()`/`status()`, C-2 silent console). | Integrator | the live-test run (with J11) |

## Known red commits (bisect and revert notes)

- **pentaryn-lookup suite red from `35d439b` to `97809fc`** (8 commits: `35d439b`, `21c6d0f`,
  `8d18cad`, `9e955e0`, `2ec084f`, `8ad6a23`, `1411687`, `97809fc`). Lane C's staged rename
  `test/fixtures.mjs` → `test/fixtures/books.mjs` was swept into another lane's commit `35d439b`
  ("test(update): pin make_checks()…"); `test/legacy-core.mjs` kept importing `./fixtures.mjs` until
  the lookup checkpoint `a532b3e` fixed it, so `node test/run.mjs` fails with module-not-found in that
  range. History is not rewritten. Reverting `35d439b` alone breaks lookup unless `a532b3e`'s import
  line is reverted with it. Skip that range when bisecting pentaryn-lookup. HEAD is green.
  How it happened: the rename sat in the shared index and `git commit` took everything staged.
  Lanes commit with `git commit -- <paths>` (or read `git diff --cached --stat` first) so another
  lane's staged entries are never swept in.

- **`make check-context` red from `051737b` to `28f3726`** (module index stale until `412d23b`).
  The importer checkpoint `051737b` vendored the kit (`lib/kit.lock.json`), so the index generator
  calls the module "full tier" while `context/foundry/README.md` still said "not migrated";
  `check_context.py` fails with "the Module APIs table is stale" in that range. Module tests are
  unaffected. `412d23b` regenerated the row; HEAD is green. The importer guide's §9 rollback now
  regenerates the index after the reverts for the same reason.

- **`make check-context` red from `f1ecd11` until the wave 1 integration's index regeneration.**
  The names, pings and cursors checkpoints vendored the kit, so the index generator calls them
  "small tier" while `context/foundry/README.md` still said "not migrated". Module tests are
  unaffected. The integration commit `docs(foundry): regenerate the module index …` fixed it.

## Behaviour changes committed without [declared]

History is not rewritten; these are declared here instead. Later gate-behaviour commits carry
[declared] in the subject (the imports-gate query fix `def324f` does).

- **`94d2f94`** "fix(foundry): node-test gate runs node test/run.mjs from the module folder
  (python-tooling-7)": the node-test gate's cwd moved from the repo root to the module folder.
  Pass/fail is unchanged for every suite at the time, but a suite that resolves files against
  the cwd now sees the module folder.

- **pentaryn-names (rebuild)**: in either actor hook, an error thrown directly in the handler is
  now logged as `pentaryn-names | <label>` and no longer reaches Foundry's own hook error
  reporting. Async failures are the declared N-D1 change.

## Not applied (left for their owners)

- `scripts/foundry/live-goldens/ties.js` still calls `attributes.describe` (works, logs the D1
  deprecation warning). Switch to `lookup` for the "after" run, or keep one call to exercise the alias.
- `scripts/foundry/prompt-marker-art.py`, the forwarding shim for the renamed
  `prompt_marker_art.py`: only history docs (`context/plans/prompt-markers.md`, the audit) still name
  the old path. Delete it when that is acceptable.
- `foundry/module/pentaryn-walls/README.md:169` says `make foundry-walls-test`; the alias still
  works (`foundry-walls-check` is the main name). The walls hint text "44 fixtures" is pinned by the
  frozen glue test and changes in the walls guide's step 10; the `module.json` half is in
  [`wave7-restart-batch.md`](wave7-restart-batch.md).
- **cursors steps 7 and 8** (file moves, outside the integrator's shared-file scope):
  `tools/build.mjs` → `scripts/foundry/cursors/build.mjs` and `assets/src/` → `scripts/foundry/cursors/src/`
  (C05, C13, C24, C25), `DESIGN.md` → `context/plans/cursors-design.md` (C13), and the comment and
  README path updates that go with them. The full list is the "Not done here" section of
  [`migrate-pentaryn-cursors.md`](migrate-pentaryn-cursors.md) plus the review hand-back (README
  link is on line 5; `cursors-core.mjs` lines 1 and 4; the moved `build.mjs` header line 3 and
  its run path).
- `context/foundry/README.md` Route-by-task rows for names ("Token labels didn't follow an actor
  rename"), pings ("where did I ping / read back a ping") and cursors (its own row, split from the
  table-feedback row) — transform-creatures-20 and senses-walls-cursors-27. The generated Module
  APIs table is already regenerated; names and pings show "no describe golden yet" until each pins
  `test/golden/describe.json`.
- `context/foundry/markers.md` ping-log section: link `foundry/module/pentaryn-pings/README.md`;
  records now carry `ageMs` and the namespace has `describe()`.
- names follow-up (its owner): `NS/CSS/FLAG_SCOPE` checks against `flags.pentaryn` in
  `test/core-meta.test.mjs`, now that the manifest carries them.
- `migrate-pentaryn-names.md` lines 424-427: the ModuleSpec edit landed as
  `(*_STATIC, "node-test", *_BLUEPRINT)` (the order every other spec uses), and edit 3 should say the
  Module APIs table is generated, never hand-edited.
