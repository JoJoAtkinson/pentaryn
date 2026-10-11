# Wave 1 baseline (2026-10-11, branch migrate/wave-1)

Live: Foundry v14.369, world pentaryn, dnd5e 6.0.6. World backup taken before the wave:
`world-2026-10-11-093631-fvtt14.369.tar.gz` (3234.6 MB, reason migrate-wave-1). After `make foundry-up` and
`make login WORLD=pentaryn`, one GM tab connected: `game.pentaryn` exists, 19 pentaryn-* modules active.
Browser console was not readable from the login tab; only a live-eval check was done (no red errors observed in the
bridge, none reported).

All existing tests pass on today's code. No baseline failures, nothing fixed.

`node test/run.mjs` = `node foundry/module/<m>/test/run.mjs`. Make check = `make foundry-<m>-check`
(walls: `foundry-walls-test`; importer and pings have no make target). Coverage = line / branch / funcs %
from `node --test --experimental-test-coverage test/run.mjs` (ties: the three test files). Suites are
self-running scripts, so node:test reports no pass/fail counts; coverage is a gap finder only.

| Module | run.mjs | make check | Conformance | Coverage (line/branch/funcs) |
|---|---|---|---|---|
| aoe | 160 pass | pass | 45.2 % (19/42) | - |
| attunement | 35 pass | pass | 56.4 % (22/39) | 49.19 / 100 / 26.47 |
| combat | 320 pass | pass | 45.2 % (19/42) | - |
| creatures | 73 pass | pass | 53.7 % (22/41) | - |
| cursors | 84 pass | pass | 53.7 % (22/41) | 100 / 96.77 / 100 |
| dropbin | 40 pass | pass | 50.0 % (21/42) | 96.38 / 97.87 / 83.33 |
| importer | none (no test dir) | none | 63.9 % (23/36) | 0 (no tests) |
| journal | 81 pass | pass | 46.3 % (19/41) | 98.16 / 79.63 / 97.06 |
| lookup | 43 pass | pass | 64.9 % (24/37) | 98.97 / 81.95 / 92.86 |
| movement | 89 pass | pass | 53.7 % (22/41) | 100 / 94.06 / 100 |
| names | none (no test dir) | pass (parse/imports/i18n only) | 64.1 % (25/39) | 0 (no tests) |
| pings | none (no test dir) | none | 62.2 % (23/37) | 0 (no tests) |
| portals | 52 pass | pass | 51.3 % (20/39) | - |
| prompts | 415 pass | pass | 50.0 % (21/42) | 98.92 / 79.59 / 97.33 |
| riders | 103 + 22 + 39 pass | pass | 45.2 % (19/42) | - |
| senses | 31 + 100 + 25 pass | pass | 43.9 % (18/41) | - |
| ties | known 183, look 9, reach all passed (test/*.mjs, not run by make; ties check = parse/imports/i18n pass) | pass | 43.9 % (18/41) | 61.44 / 84.58 / 53.65 |
| transform | 147 pass | pass | 48.8 % (20/41) | - |
| walls | 49 pass | pass (foundry-walls-test) | 60.5 % (23/38) | 86.02 / 88.25 / 86.46 |

Coverage was only requested for wave-1 and wave-2 modules; "-" = not measured.

Conformance: all 19 modules score as tier "full" today. Most common failing rules: C07, C14, C20, C27, C28, C40,
C44, C45 (19 modules each). Full per-module failing lists: `python3 scripts/foundry/blueprint/conformance.py --markdown`.

Notes
- importer, names and pings have no tests at all; characterisation per their guides will create the first ones.
- attunement has low function coverage (26 %) and ties 54 %: the gaps to fill when characterising.
