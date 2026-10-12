# Wave 3 baseline (2026-10-11, branch migrate/wave-3, tag wave-3-base = a5a1a906)

Code phase only: nothing live was touched. Worktrees: `pentaryn-wave3-wt` (from origin/main a5a1a906) and
`foundry-vtt-mcp-wave3-wt` (fork; branch migrate/wave-3 from origin/pentaryn 59ffcf2, `npm ci` done, no build).

## Modules (node `test/run.mjs`, conformance.py --json, coverage line / branch / funcs)

| Module | run.mjs | Conformance (tier / score / passed of) | Coverage | Checkpoint |
|---|---|---|---|---|
| prompts | exit 0; core 415 passed, 0 failed; node:test 27 pass, 2 skipped | full / 56.5 / 26 of 46 | 98.61 / 79.11 / 96.48 | 6cc5c50 |
| ties | exit 0; known-core 183, look+known tab 9, reach all passed | full / 55.3 / 26 of 47 | 61.44 / 84.58 / 53.65 | 9e955e0 |
| portals | exit 0; portals-core 52 passed | full / 58.1 / 25 of 43 | 100 / 92.19 / 100 | none |
| creatures | exit 0; core 73 passed | full / 57.8 / 26 of 45 | 100 / 97.00 / 100 | none |
| senses | exit 0; chain-core 31, light-core 100, migrate 25 passed | full / 51.1 / 23 of 45 | 91.40 / 90.79 / 95.83 | none |

Failing fail-class rules:
- prompts: C07 C15 C16 C18 C20 C21 C22 C24 C26 C27 C28 C29 C32 C35 C40 C44 C45 C47 C48 C56 (warn C10 C59)
- ties: C07 C09 C12 C15 C16 C18 C20 C21 C22 C24 C27 C28 C34 C35 C37 C40 C41 C44 C45 C47 C48 (warn C02 C10 C36 C59)
- portals: C07 C09 C14 C18 C20 C21 C22 C24 C26 C27 C28 C37 C40 C41 C43 C44 C45 C47 (warn C06w C10 C36 C59)
- creatures: C07 C09 C14 C18 C20 C21 C22 C26 C27 C28 C32 C35 C37 C40 C41 C43 C44 C45 C47 (warn C06w C10)
- senses: C07 C09 C12 C13 C14 C17 C18 C20 C21 C22 C24 C27 C28 C34 C35 C37 C40 C41 C43 C44 C45 C48 (warn C02 C10 C36 C37w)

Checkpoints: prompts and ties were characterised in wave 1 (both are ancestors of this base). Portals, creatures
and senses were WAIT in wave 1 and have no frozen characterisation commit; their existing `test/run.mjs` suites
are the baseline and their guides' S1 step writes the checkpoint.

## Python

`./.venv/bin/pytest -q`: 1199 passed, 2 skipped, 3 xfailed.

## Fork (foundry-vtt-mcp-wave3-wt)

- `npm test`: shared 5 files / 43 tests passed; mcp-server 19 files / 275 tests passed.
- `npm run typecheck`: red at baseline, environmental: `packages/mcp-server` TS2307 `Cannot find module
  '@foundry-mcp/shared'` (campaign-management.ts:13,14) because `shared/dist` is not built. Same as wave 2.
