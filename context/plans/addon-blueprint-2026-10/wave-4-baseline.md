# Wave 4 baseline (2026-10-11, branch migrate/wave-4, tag wave-4-base = a5a1a906)

**Read this when:** you need the starting numbers for wave 4 (riders, aoe, transform, combat).

Code phase only: nothing live was touched. Worktrees: `pentaryn-wave4-wt` (from origin/main a5a1a906) and
`foundry-vtt-mcp-wave4-wt` (fork, branch migrate/wave-4 from origin/pentaryn 59ffcf2; `npm ci` done, no build).
Base never merges migrate/wave-3.

## Modules

| Module | Test runner result | Conformance (tier / score / passed / fail-class) | Failing fail-class rules | Warnings | Checkpoint |
|---|---|---|---|---|---|
| riders | run.mjs: riders-core 103, rituals-core 22, table-core 39 passed | full / 47.8 / 22 / 24 | C07 C09 C12 C14 C17 C18 C20 C21 C22 C24 C26 C27 C28 C29 C30 C32 C35 C37 C40 C41 C43 C44 C45 C56 | C06w C10 C36 C59 | none |
| aoe | run.mjs: core 160 passed, 0 failed | full / 50.0 / 23 / 23 | C07 C09 C14 C16 C18 C20 C22 C24 C26 C27 C28 C29 C32 C34 C35 C37 C40 C41 C43 C44 C45 C47 C48 | C06w C59 | none |
| transform | run.mjs: core 155 passed + node:test 1 file passed | full / 55.6 / 25 / 20 | C07 C12 C13 C14 C16 C17 C18 C20 C21 C23 C24 C27 C28 C29 C35 C37 C40 C41 C44 C45 | C02 C10 C37w C49 C59 | none |
| combat | run.mjs: 326 fixtures pass | full / 50.0 / 23 / 23 | C07 C12 C14 C15 C17 C18 C19 C20 C21 C22 C23 C24 C26 C27 C28 C29 C32 C35 C40 C41 C43 C44 C45 | C10 C36 C37w C59 | none |

(The conformance "fail-class" count is the number of failing fail-class rules listed.) Each module's guide
(S1 / Step 1) defines the checkpoint, but all four were WAIT in waves 1 to 3 and none has been written;
wave 4's S1 writes them. Wave-3 report confirms riders and aoe are unchanged since 28ccc87; transform
(0.3.3) and combat (0.2.5) carry play-test fixes that must be kept.

## Coverage

`node --experimental-test-coverage` reports only for `node:test` suites. riders, aoe and combat run on the
legacy hand-rolled `test/run.mjs` (no `node:test`), so there is no coverage figure at baseline (0 node:test
files); the checkpoint step must convert the runners first. transform's single node:test file
(`test/playtest.test.mjs`): line 65.98 / branch 54.14 / func 13.27 over all files (transform-core.mjs
64.92 / 48.33 / 26.00; transform.mjs 48.65 / 37.50 / 30.00; the all-files figure includes the vendored kit stub).

## Repo-wide

- `./.venv/bin/pytest -q`: 1199 passed, 2 skipped, 3 xfailed.

## Fork (foundry-vtt-mcp-wave4-wt)

- `npm test`: 19 files, 275 tests passed.
- `npm run typecheck`: red at baseline, environmental: `packages/mcp-server` TS2307
  `Cannot find module '@foundry-mcp/shared'` (campaign-management.ts:13,14) because `shared/dist` is not built
  (same as wave 2). Not built here.
