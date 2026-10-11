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

## Behaviour changes committed without [declared]

History is not rewritten; these are declared here instead. Later gate-behaviour commits carry
[declared] in the subject (the imports-gate query fix `def324f` does).

- **`94d2f94`** "fix(foundry): node-test gate runs node test/run.mjs from the module folder
  (python-tooling-7)": the node-test gate's cwd moved from the repo root to the module folder.
  Pass/fail is unchanged for every suite at the time, but a suite that resolves files against
  the cwd now sees the module folder.

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
