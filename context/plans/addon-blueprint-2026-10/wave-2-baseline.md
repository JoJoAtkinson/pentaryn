# Wave 2 baseline (2026-10-11, branch migrate/wave-2, tag wave-2-base = 7067ef24)

Code phase only: nothing live was touched. Worktrees: `pentaryn-wave2-wt` (from origin/main 7067ef24) and
`foundry-vtt-mcp-wave2-wt` (fork; branch migrate/wave-2 based on **migrate/wave-1 6a52673**, because wave-1's
3 doc commits are not merged into the fork's `pentaryn` branch 59c781e).

## Modules (node `test/run.mjs`, pytest, conformance.py --json)

| Module | run.mjs | Conformance (tier / score / passed) | Failing fail-class rules | Warnings |
|---|---|---|---|---|
| lookup | 43 passed, 0 failed | full / 75.6 / 31 | C07 C12 C24 C27 C28 C40 C41 C44 C45 C48 | C02 C10 |
| movement | 89 passed, 0 failed | full / 66.7 / 30 | C07 C12 C18 C21 C22 C24 C26 C27 C28 C35 C37 C40 C41 C44 C45 | C06w C10 |
| walls | exit 0, fail 0, todo 2 (KNOWN-marked corpus pins, e.g. "wasm ignores levels" senses-walls-cursors-2) | full / 71.4 / 30 | C07 C11 C12 C21 C22 C24 C27 C28 C40 C41 C44 C45 | C02 C10 C36 |
| attunement | 35 fixtures passed | full / 67.4 / 29 | C04 C07 C09 C11 C18 C26 C27 C28 C29 C37 C40 C41 C44 C45 | C02 C06w C10 |
| journal | 81 passed | full / 57.8 / 26 | C03 C07 C09 C12 C18 C21 C22 C24 C26 C27 C28 C30 C37 C40 C41 C44 C45 C47 C56 | C06w C10 |
| dropbin | 40 checks ok | full / 60.9 / 28 | C07 C09 C12 C17 C18 C21 C22 C24 C26 C27 C28 C29 C35 C40 C41 C44 C45 C47 | C02 C10 C36 C59 |

`./.venv/bin/pytest -q`: 866 passed, 2 skipped, 4 xfailed.

## Fork (foundry-vtt-mcp-wave2-wt, `npm ci` done, no build)

- `npm test`: 11 files, 161 tests passed.
- `npm run typecheck`: **red at baseline, environmental, not a code fault.** `packages/mcp-server` fails with
  TS2307 `Cannot find module '@foundry-mcp/shared'` (2 errors, campaign-management.ts:13,14): the workspace
  `shared/` has no `dist/` until `npm run build:shared` runs. No other errors. Not built here per the
  no-build rule; a lane that needs typecheck can run `npm run build:shared -w shared` inside the worktree
  (writes only untracked `shared/dist`, touches no deployed path) with orchestrator approval.
