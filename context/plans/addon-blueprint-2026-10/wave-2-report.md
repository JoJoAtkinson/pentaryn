# Wave 2 report (addon blueprint migration, workflow 2)

**Read this when:** you are bisecting or reviewing wave 2 (branch `migrate/wave-2`), or picking up
something left open for Joe. Not instructions for operating any module.

## Summary (code phase closed, 2026-10-11)

Wave 2 migrated six modules to the blueprint — **lookup, movement, walls, attunement, journal,
dropbin** — and, per Joe's rule of 2026-10-11, applied each module's performance,
maintainability, hardening and LLM-read findings in the same wave. It also bumped the kit to
**1.0.2** (J6, J10, J16) and ran the **bridge lane**: the fork's 24 planned steps plus D14
(`pentaryn-read` / `pentaryn-write`), and the python-tooling findings. **Code phase only:**
nothing was synced, built into a deployed path, restarted or run live, and nothing was merged into
`main`. The live phase is written down and has not run: [`wave-2-live-plan.md`](wave-2-live-plan.md).

- **Branches.** pentaryn `migrate/wave-2` = `wave-2-base` (`7067ef24`) + 253 commits before
  this report's own. Fork `migrate/wave-2` = `pentaryn` + 43 commits; 3 of those are
  wave 1's (two docs, one footprint-script fix `6e8c607`), because the branch starts from
  `migrate/wave-1` `6a52673`.
- **No module stopped.** No frozen test went red twice on one step. Every frozen-test or golden
  change is in a `[declared]` commit that names its pin, or only moves import paths or files (the
  integration review re-checked each one), with one exception the review missed: walls
  `c1a80a53` changed the manual CLI `test/corpus.mjs` (not run by `run.mjs`, not a gate):
  `process.exit` → `throw` for C43, so an unknown backend now exits 1, not 2. Undeclared.
- **Conformance** (advisory) rose for all six: lookup 75.6 → 97.7 %, movement 66.7 → 95.7 %,
  walls 71.4 → 95.6 %, attunement 67.4 → 93.2 %, journal 57.8 → 87.5 %, dropbin 60.9 → 93.8 %. What
  still fails is almost all the Wave 7 `module.json` restart batch (C03/C04/C07/C09/C37), plus
  three decisions for Joe (C51 walls/journal, C56 journal) and one scorer gap (C50 dropbin).
- **Gates at the close** (`f8fb7377`, re-run for this report): every module's `node test/run.mjs`
  exits 0 (lookup 135, movement 167 + 89 legacy, walls 200 + 1 todo, attunement 119, journal 94 +
  81 legacy, dropbin 118 + 40 legacy, names 50, pings 67, cursors 55, importer 92, prompts 24,
  ties 16; the seven unmigrated modules exit 0). Kit 82/82. `pytest -q`: 913 passed, 2 skipped,
  3 xfailed (baseline: 866 / 2 / 4). `check_context.py` OK (4 old warnings). Fork (integration
  review, unchanged since): server vitest 275 (baseline 161), bridge module vitest 43 (it had no
  runner before), both typechecks, `fork-footprint.sh`.
- **19 rows are open for Joe** (end of this file). None of them blocks the live phase. Two of them
  are needed *for* the live session: W2-L1 (walls) and W2-L2 (modules outside the six); Joe
  decided both on 2026-10-11 (walls stays off and is not synced; every other changed module
  deploys in the same restart).
- **Critic pass** (at `368393bf`, code phase): every hash in this file resolves on its branch; the
  commit lists equal `git log`; the frozen-test diffs, both conformance columns (each scored by its
  own tree's `conformance.py --json`), checkpoint/HEAD test counts, gates (kit, pytest, module-check
  19/19, adjustments 96 rows, check-context, fork vitest 275/43 and typechecks) and the
  finding → commit map re-run and match. Corrected: the fork's wave-1 commits, walls' frozen-file
  list (`c1a80a53`, above), lookup's DL4 touch of `api.test.mjs`, journal's red range. Coverage
  was not re-run.

### Known red commits and ranges (bisecting)

| Where | Range | What |
|---|---|---|
| `vendor.py check` (advisory) | `c69104f3` → each module's re-vendor commit | the kit's bytes changed before each module's copy; module tests stayed green |
| walls | `9b37264b` only | its own new `test/backends.test.mjs` matched its own source; fixed forward `28dd5667` |
| journal (behaviour, suites green) | `7dc5fce8` → `526d1aa8` (journal commits `7dc5fce8`, `f2df3db3`) | `shouldShowBar(null)`/`shouldShowItemBar(null)` threw on non-pile item sheets ("bar skipped" warn); GMs ran the every-scene Note scan |
| `check-context` | walls `d06f77ab` → `e4978110` | the generated Module APIs table was stale |
| `foundry-adjustments-check`, `test_update_escalation` registry test | attunement `5f3bf2d5` → `cd414590` | `adjustments.yml` still pointed at moved markers |
| pings | `466a3a4f`, `a18872c9` | the PT3-2 repro-first commits from `fix/playtest-2026-10-11`, green from `7a8701df` |

## Per module

Frozen-test diff = `git diff --stat <checkpoint>..HEAD -- foundry/module/pentaryn-<m>/test/`.
Conformance = `conformance.py --module <m>` (wave-2 baseline → HEAD). Coverage = lines / branches /
functions over the module's own files (kit `lib/` and `test/` excluded), `node --test
--experimental-test-coverage` over every `*.test.mjs` plus the `LEGACY` suites, run on a `git
archive` of the checkpoint and of HEAD. It is a gap finder, not a target.

| Module | Frozen-test diff | Conformance | Coverage (L / B / F) | node:test cases (checkpoint → HEAD) |
|---|---|---|---|---|
| lookup `a532b3e` | 26 files, +1753 −355 | 75.6 → **97.7 %**; fails C07 | 73.1 / 84.7 / 77.8 → **98.3 / 91.0 / 96.1** | 18 + 43 legacy → 135 (legacy converted) |
| movement `3a5192d` | 16 files, +961 −13 | 66.7 → **95.7 %**; fails C07, C37 | 99.0 / 86.8 / 100 → **98.1 / 91.3 / 99.1** | 120 + 89 legacy → 167 + 89 legacy |
| walls `a8c5c28` | 26 files, +1311 −87 | 71.4 → **95.6 %**; fails C07, C51 | 94.7 / 86.1 / 92.9 → **97.5 / 92.4 / 96.8** | 124 + 2 KNOWN todo → 200 + 1 todo (the Wave 7 cite) |
| attunement `88f935e` | 19 files, +1427 −32 | 67.4 → **93.2 %**; fails C04, C07, C09 | 57.1 / 82.1 / 47.4 → **98.9 / 87.5 / 97.1** | 28 + 35 fixtures → 119 (fixtures converted) |
| journal `f830067` | 24 files, +1572 −13 | 57.8 → **87.5 %**; fails C03, C07, C09, C37, C51, C56 | 77.7 / 75.2 / 73.0 → **95.3 / 82.2 / 88.5** | 24 + 81 legacy → 94 + 81 legacy |
| dropbin `4b53345` | 25 files, +1687 −41 | 60.9 → **93.8 %**; fails C07, C09, C50 | 85.2 / 68.1 / 69.6 → **97.1 / 79.8 / 87.6** | 38 + 40 legacy → 118 + 40 legacy |

Movement's line coverage dips (99.0 → 98.1) only because the new wiring-only entry's
catch branches (`movement.mjs` 65–68, 78–80, 91–94) have no test; every moved function stays at
100 %. Lowest files at HEAD: lookup's entry (the drift-refusal branch, 85.5 %), attunement's entry
(83.1 %), journal `bar.mjs` (86.2 %), dropbin `loot.mjs` (88.5 %).

Each module's full record (commit by step, deviations, live checks) is in its guide's **Result**
and its audit's **Status**; the lane sections below keep the detail for walls, journal and dropbin.

### lookup — `prompts-lookup-*`, mcp-fork-20/-24

- **Frozen files touched:** `glue.test.mjs` + `golden/hooks.json` (DL2 `2afb4d4b`; J10 load orders
  (b)/(c) `e6b66580`); `api.test.mjs` KNOWN-1 (DL5 `b98745c1`) and KNOWN-4 (DL3 `91ee5c9d`);
  `golden/legacy-api.json` JournalEntry-UUID row and that case's label in `api.test.mjs` (DL4
  `10053c27`); `fixtures/packs.mjs` gains
  `locked: true` (`74922db2`, no assertion changed); `legacy-core.mjs` → `core.test.mjs`
  (`f0f70ea8`, the guide's step 10, 43 cases byte-identical); `run.mjs` `LEGACY` emptied; kit copies.
- **Findings → commits:** -6 `0e5d1f95` + follow-up `3e2d44c4` `a45cc10d` `de4b68ec` `22052ca3`
  `36a4fdfe` `e0e2dd40` · -9 (twin comment) `0e5d1f95` · -4 `0e5d1f95`, `91ee5c9d` · -5 `9c1a1a68`,
  `10053c27` · -1 `9c1a1a68`, `b98745c1`, `74922db2` · -34 `ef578313` · -2 `abb4ae75` + doc half
  `01fa7cda` (and `e4978110`) · -3 and mcp-fork-24 `2afb4d4b` · -26 `90d294e0` · -28 pinned at the
  checkpoint · mcp-fork-20 `e4978110`. **Skipped:** none.
- **Known bugs fixed (one [declared] commit each):** -4 registry guard (DL3), -1 uncached books
  (DL5, then cached only for locked packs `74922db2`), -5 non-page warning (DL4); new:
  `names("constructor")` returned junk (`055586bb`).
- **Async (§5.9):** nothing applies (read-only; the eight queries are GM-guarded and read-only, so
  both GM tabs answering is harmless). No Open-for-Joe row.

### movement — `aoe-movement-portals-*`

- **Frozen files touched:** `golden/settings-register.json` (two rows, D-M3 `561d0749`),
  `glue.test.mjs` KNOWN -42 row (`0b1910cc`); kit copies. Nothing else.
- **Findings → commits:** -17 `5482317b` · -18 `5482317b`, `c4b77032` · -19 `34a4ca5a` (structure),
  `a9f32f7e` (ghost-context cache), `8f2ede50` (refresh reads once) · -20 `d65ddd62` · -21
  `c4b77032` · -22 `34a4ca5a` · -23 `c4b77032`, `b3d69dbb`, `1b5ec2a5` · -37 `1b5ec2a5` · -42
  `0b1910cc`. Adjustments rows (C32) `cd414590`. **Skipped:** -20's optional `status().errors`
  (a feature; W2-MOV-1).
- **Known bugs fixed:** -42 ghost-back toast (D-M4, `0b1910cc`).
- **Async (§5.9):** clean on review; no vetoable hooks, the world-setting `onChange` writes only the
  client-scoped `ghost`.

### walls — `senses-walls-cursors-*`

- **Frozen files touched:** `glue.test.mjs` (g) KNOWN -1 → works (`01de2ae2`), (b)+(d) extensible
  root (J10 `3d044626`); `golden/canonical.json` + `golden/backend-drift.json` re-pinned for the
  levels fixtures and the two `knownWasm` markers dropped from `fixtures/corpus.mjs` (`ab859b4c`);
  import paths only in `fixtures/engine.mjs` (`de35515f`); `fixtures/corpus.mjs` `kindOf`
  re-export (`3d0daef9`) and plan-path comment (`e2520d57`); `bench.mjs`'s wasm-missing line
  ([declared] `9b37264b`); the manual CLI `corpus.mjs` (`c1a80a53`, undeclared, see the
  Summary); kit copies.
- **Findings → commits:** -1 `01de2ae2` · -2 `ab859b4c` (+ `3ea5249b`) · -3 `1d2d196b` · -4
  `3d0daef9` · -5 `cb3ce91f` · -6 `c77d1e21` · -7 `9b37264b`, `28dd5667` · -8 `e2520d57`, `49f1f2eb`,
  `d19cb73d`, repo-wide net `edc7489a` · -9 `0ae5b96d` · -33 `08c498bb` · -36 prepared `d3a07b62`
  (switch waits for Wave 7, W2-WALLS-1) · -37 `f06a6b90`. **Skipped:** -28 (python `ship_ignore`,
  deferred J18).
- **Known bugs fixed:** -1 `undo()` threw (W-1), -2 wasm ignored levels (W-3), -9 overlapping runs
  (W-2). Both baseline KNOWN todos flipped.
- **Async (§5.9):** -9's lock is per tab; the two-tab overlap is W2-WALLS-2.
- **Live:** walls is off in Joe's world on purpose (W2-L1, Joe 2026-10-11): migrated and
  unit-tested, never live-tested; it is not synced or live-checked.

### attunement — `items-journal-8…17, -39`

- **Frozen files touched:** `glue.test.mjs` (entry import → core for `computeSlots`; D-A1 pin; `_del`
  pin), `legacy-slots.mjs` → `slots.test.mjs` (step 2b `676a98de`), `fixtures/impls.mjs` (core
  appended, as its comment planned), `run.mjs` (`LEGACY` emptied); kit copies.
- **Findings → commits:** -8 `b1ff1cde`, `676a98de` · -9 `b1ff1cde`, `5f3bf2d5` · -10 `b1ff1cde`,
  KNOWN `a7963405`, fix `7e18a834`, audit line `7cf1a4f1`, shortfall naming `73180dfd`, copy ids
  `3ab081ca` · -11 `07920a8f`, `0d0c2199` (+ `7db966e4`) · -12 `b1ff1cde`, `d7a8ae2f` · -13
  `03f417f0` · -14 step 1 `b1ff1cde` · -16 `d7a8ae2f` · -17 `885f3423`, `10459870`, `6402b3fb` · -39
  a `b1ff1cde`, b `e1adc21c`, c `5f3bf2d5` + `5e4866d4`. Other [declared]: D-A3 `a3941fb6`, `_del`
  `b54556d1`, selftest `9b1dc46e`. **Skipped:** -14 step 2 (rides on Wave 7); -12's `countMismatch`
  on `report()` (frozen `golden/report.json`; lives in `inspect().counts`); the `stash()` rollback
  (W2-A2).
- **Known bugs fixed:** -10 `stash()` deleted originals without checking the copies (D-A4), -39 b a
  failing tooltip-guard install blocked the publish.
- **Async (§5.9):** new, the coin-purse double pay from two tabs of one user (W2-A1).

### journal — `items-journal-32…40`

- **Frozen files touched:** `glue.test.mjs` only, at two pins: publish timing (D-J1 `dbd56638`) and
  the relay refusal text (D-J4 `5b79802c`); `fixtures/impls.mjs` gains the core (step 2); kit
  copies. No golden changed.
- **Findings → commits:** -32 `8bce2b4a` · -33 `d595451e` · -34 `7dc5fce8`, `526d1aa8` · -35
  `0fe84b85` · -36 `93dc1a56`, `26e9df02` · -37 `b615d9d8` ((d) waits for Wave 7) · -38 `cac07643`
  · -40 KNOWN `d8bfe157`, fix `f97e9f74`, `792f57fb`, `79155a74`. Review: D-J6 `5df878a6`.
  Adjustments row (C47) `cd414590`. **Skipped:** none; the -40 scope note stays open (W2-J4).
- **Known bugs fixed:** -40 two GM tabs both created the player's journal (D-J5).
- **Async (§5.9):** -40 fixed claim-first (W2-J3 records why not `claimDocument`); the
  `createUser`/ready duplicates and the sequential `ensureAll` are W2-J4. Kit gap: `registerQueries`
  drops the query context (C56, W2-J2).

### dropbin — `items-journal-18…30`

- **Frozen files touched:** `glue.test.mjs` only, at named pins in [declared] commits (D-D1
  `500f33a0`, -18 `a3b44685`, -25 `bae36010`, -30 `c62da821`, -19 `314f49c3`), goldens
  `ready-console.json` and `backfills.json` re-pinned there; fixtures `impls.mjs` (core) and
  `world.mjs` (`Actor.implementation.updateDocuments`); `corpses.test.mjs` arrived unchanged with
  the PT3-1 merge; kit copies.
- **Findings → commits:** -18 `a3b44685`, `b2320f94`, `db529317` · -19 `314f49c3` · -20 `1e4214c2`
  · -21 `9f43f573` · -22 `1e4214c2`…`4ef64cd7`, `146aefce`, `276c1040` · -23 `4d96d3a8`, `6273d1e7`
  · -24 `eff44a40` · -25 `bae36010` · -26 `1e4214c2`, `a1b0ff01` · -27 kept, documented
  `4fa0b17a` · -28 `500f33a0`, `0ac333a2`, `85f4353f`, `759694f7`, `dcc2a293` · -29 README
  `85f4353f`, rows `cd414590` · -30 `c62da821`. **Skipped:** -27's deletion (two frozen pins for no
  observable change; the audit's listed alternative).
- **Known bugs fixed:** -18 reused ledger numbers (D-D2), -21 unhandled rejection with no GM, -23
  `getFlag` throw with Item Piles off; `clear()` racing an append (`b2320f94`, `db529317`).
- **Async (§5.9):** W2-D1 (corpse conversion in every tab of the active GM) and W2-D2 (ledger
  relay recorded by both tabs); both default to accept-and-watch in L3.

## Kit bump 1.0.1 → 1.0.2

J6 test-stub `logger` (`c69104f3`), J16 `unwrap()` drops the record [declared] (`6d8f0f22`), J10
frozen-root guard retired [declared] (`8f9ee627`), bump `822a97c1`; re-vendored into all twelve kit
modules, one commit each, and the guard copies retired in the eight migrated-or-touched modules.
transform's test stub came in at 1.0.1 with the play-test merge and was re-vendored by the
integration review (`3df15e0f`). Detail: "Step 1 — kit bump" below. Not done: the seven unmigrated
modules' guard copies (W2-K1), and kit 1.0.3 (`registerQueries` context, W2-J2; a `dryRun` row
field, W2-B3; a "resolves strings itself" param signal, W2-B4).

## Bridge lane

Plan: [`wave-2-bridge-plan.md`](wave-2-bridge-plan.md) (`578cada0`). Fork guide Result:
[`migrate-mcp-fork.md`](migrate-mcp-fork.md); python Result: [`tooling-lane.md`](tooling-lane.md).

**Tools (the only new features, approved as D3/D14).** `pentaryn-read` and `pentaryn-write` call
the existing `foundry-mcp-bridge.fork.eval` query with one fixed template that routes on the
module's `describe()`: no new GM-side handler, zero upstream lines (`09537bd`, `20841db`,
`01222a9`). After review they fail closed: read runs only `writes === false` rows, write refuses
`dryRun` on a row without one, a param that needs a live Document is `BAD_ARGS` (eval-js only),
and a coded error such as `NOT_GM` keeps its code. Use-doc: `context/foundry/mcp-fork.md`
(`7c2aef7b`).

**Fork findings → commits** (`migrate/wave-2`, `6a52673..213c6c3`; version 0.8.3-pentaryn.2):

| Step | Finding | Commit(s) |
|---|---|---|
| F0 | bridge-module vitest harness | `a97be99` |
| F1 | mcp-fork-22 typed tool contract | `f9492e4` |
| F2 | -5 one ActionLog | `5b9e3bd` (pins), `74d9de8` |
| F3 | -6 month at write time [declared] | `b6afb9e` |
| F4 | python-tooling-30 `eval-YYYY-MM.jsonl` [declared] | `c2fd036` |
| F5 | -4 failed evals `ok:false` [declared] | `745c0fd` |
| F6 | -17 `phase:"args"` line [declared] | `b628500` |
| F7 | -16 specFile logged expanded | `c1e9103` |
| F8 | -7 `client` on every line | `4e9b031` |
| F9 | -1 upstream writes logged | `6500710` |
| F10 | -13 filter blocks calls [declared] | `2457e18` |
| F11 | -11 step 2, poll moved | `a666102` |
| F12 | -12 tool-list key hashes the schema [declared] | `0909494` |
| F13 | -21 eval-js description | `4b52c80` |
| F14 | -9 `serialize.ts` | `ad25af5` (pins), `552d222` |
| F15 | -8 timer cleared, `timedOut` [declared] | `16a33d1` |
| F16a | -2 non-GM sender refused [declared] | `506415b` |
| F16b | -24 code half, coded `NOT_GM` [declared] | `4727fcf` |
| F17 | -18 legacy keys one Set | `e5fc5b6` (pins), `6f2c6e0` |
| F18 | -14 schema split | `6723685` (snapshot), `0a7441a` |
| F19 | -10 recharge through a fork query [declared] | `c200fad` (pins), `3875d2c` |
| F20–F22 | D14 template, `pentaryn-read`, `pentaryn-write` | `09537bd`, `20841db`, `01222a9` |
| F23 | 0.8.3-pentaryn.2 | `442e74b` |
| review | 10 defects (dryRun on any row, substring actor ref in recharge, read fails open, Document params, coded errors, recharge log, FORK.md row, markers, tests on real timers) | `d5ba3c4`, `6f598fb`, `a79f5f3`, `a6fb891`, `b8f540f`, `81f8bb4`, `9c845d1`, `7f6680a`, `d77c496` (all but the docs/test ones [declared]) |
| integration review | `pentaryn-read` description no longer calls `rules` eval-js only | `213c6c3` |

Waiting, not this wave: mcp-fork-15 and prompts-lookup-11/-12 (the prompts migration). Noted, not
changed: 3 eslint style errors in new fork files (lint is not a gate).

**Python findings → commits** (pentaryn `migrate/wave-2`):

| Finding | Commit(s) |
|---|---|
| python-tooling-37 `bridge.scan` ppid guard, one `ps` [declared] | `6931c7c7` (pins), `586eeb1b` |
| -51 `roll_dice` thread lock, client per call [declared; strict xfail flipped] | `09412de5` |
| -44 actions DB file lock [declared; xfail flipped] | `df3a47ac` |
| -48 annotations, error channels, owned-books pointer [declared] | `e1062a2b` |
| -27 discovery parses only `MCP_` scripts, once (112 → 24 ms) | `6ecdaf43` (golden), `ea0d3d2c` |
| -29 `dnd-scripts-YYYY-MM.jsonl` (when `PENTARYN_MCP_LOG_DIR` is set) | `cc2a9570` (pins), `f1aeff07` |
| mcp-fork-25 `evallog.py`, `ops eval-report`, `make foundry-eval-report` | `85727ca8` |
| **new: dnd-roller-flock** (cross-process cache race; from the bridge review) [declared] | `3fff41d0` |
| -41 | closed by pointer to wave 1's `c8fd327`, `9a83ba1` |
| -28 two new dnd-scripts tools | **not built**: a feature; W2-B1 |
| docs (P9) | `b4b62e29`, `7c344299`, `60acbd2a`, `7c2aef7b` |

## Merge notes (for Joe; nothing merged)

Order: **`fix/playtest-2026-10-11` → `feature/pentaryn-feedback` → `migrate/wave-2`**, each into
`main`.

1. **`fix/playtest-2026-10-11`** (tip `fa449fd3`) is already inside `migrate/wave-2` (merged as
   `931203a5`; one conflict, names' CHANGELOG, both entries kept). Merging it first changes nothing
   for step 3.
2. **`feature/pentaryn-feedback`** (19 commits, a new module, does not contain the play-test branch)
   overlaps wave 2 in three files:
   - `context/foundry/README.md`: the generated Module APIs table. After the merge, run
     `make foundry-module-index` and take its output; don't hand-merge the table.
   - `foundry/adjustments.yml`: both sides append rows. Keep both, then
     `make foundry-adjustments-check`.
   - `scripts/foundry/ops/config.py`: feedback's ModuleSpec and wave 2's movement comment. Keep both.

   After wave 2 lands, **`pentaryn-feedback` vendors kit 1.0.1**: run
   `scripts/foundry/blueprint/vendor.py sync pentaryn-feedback` (lib and test kit), then its
   `node test/run.mjs` and `module-check`. J10 does not affect it: its only `isFrozen` assertion
   is about its own API, not the root.
3. **`migrate/wave-2`**: merge as is. **Dropbin's play-test change (PT3-1) was merged, not re-done:**
   the refactor carries `corpses.mjs`'s PT3-1 code and `test/corpses.test.mjs` unchanged, green
   throughout. Nothing needs dropping at the merge. Note that dropbin is 0.2.2 on the branch.
4. **Fork:** `migrate/wave-2` is based on `migrate/wave-1` `6a52673`, whose 3 commits (two docs, one footprint-script fix) are not on
   `pentaryn` (`59c781e`). Merging `migrate/wave-2` into `pentaryn` brings them along. The live fork
   checkout is on `migrate/wave-1`, which is why the live plan uses a detached checkout of
   `migrate/wave-2` rather than a merge.
5. The Wave 7 `module.json` batch ([`wave7-restart-batch.md`](wave7-restart-batch.md)) is **not** in
   this branch. No `module.json` was edited, except versions that the play-test fixes carried.

## Live phase

Plan: [`wave-2-live-plan.md`](wave-2-live-plan.md) (`41cc7c7a`), with the goldens
`scripts/foundry/live-goldens/` (`f9a5ec91`, `9a7534c4`). It will verify:

- **Before/after on the deployed build.** Each "before" golden runs twice on the deployed code
  after a backup, and the two runs must agree. After the sync, each "after" golden runs twice
  and `diff.mjs` compares. Every `golden.shared` value must match, and only the declared ids may
  differ (DL1–DL5, D-M2–D-M4, D-A1/D-A3/D-A4, D-J1/D-J3–D-J6, D-D1/D-D2 and the dropbin
  `[declared]` fixes, walls W-1–W-4/W-6). A timing counts as slower if it is more than 1.5× (with
  a before of at least 0.05 ms) or 5 ms or more slower. Nothing may be left behind.
- **Boot probes, per module:** active, version, namespace, `module.api === game.pentaryn.<ns>`,
  frozen, every described path is a function, `selftest().ok`; the server log is checked too.
- **Bridge:** fork server build, bridge module build copied into Data, one restart. Then a
  nine-call `pentaryn-read`/`-write` smoke, each checked against its log line: root describe,
  read rows, importer dry run, `BAD_ARGS` for a dry run on a row without one, wrong tool,
  `NOT_FOUND`, the live-Document refusal, `NOT_GM` from a player tab. Plus the declared checks:
  a player's bridge query is refused, recharge on a token id, `timedOut`.
- **Read-only scans and rollback:** the dropbin ownership-leak scan (results go to Joe, nothing
  written). Per-module rollback that must reproduce the "before" golden, a bridge rollback, and
  the fix loop (a new failing node test first; frozen tests are never edited).
- **Joe's calls before it runs:** W2-L1 and W2-L2, both decided 2026-10-11: walls is left out of
  the sync and the live check; the other changed modules deploy in the same restart.

## Lane records

### Step 1 — kit bump 1.0.2 (J6, J10, J16; decided 2026-10-11)

Code phase only; nothing live was touched. Kit 1.0.1 → **1.0.2**.

| Item | What changed | Commit |
|---|---|---|
| J6 | `test-kit/foundry-stub.mjs` defines `globalThis.logger` (Foundry's `logger = console`), saved and restored like the other globals; every call lands on `F.logged` as `{ level, args }`. The shim's `logCompatibilityWarning` goes through it too. New kit test. | `c69104f3` |
| J16 | `patch.mjs`: a handle's `unwrap()` undoes the patch once and drops the record (a second call is a no-op; a route unregisters once), so the same marker can wrap again. When another wrapper sits on top and the direct route cannot restore, the record stays (the patch is still live). `unwrapAll` unchanged. Two new kit tests. [declared] | `6d8f0f22` |
| J10 | `publish.mjs`: the COMPAT frozen-root guard and `realiasTick` are gone; a frozen `game.pentaryn` now throws a `TypeError`. The kit test that pinned the COMPAT block is replaced. Playbook §5.1 and the kit README drop the option. [declared] | `8f9ee627` |
| bump | `kit.json`, `KIT_VERSION`, every header; README changelog | `822a97c1` |

**Re-vendored** (`vendor.py sync --all`, one commit per module): names `993677e3`, pings `f805bb63`,
cursors `2a55cef3` (each [declared]: the one test that pinned the kit's frozen-root rebuild is flipped
in the same commit), importer `9fd2b39d`, ties `ac307386`, lookup `51695e7d`, movement `1241a405`,
walls `bf640386`, attunement `79977983`, journal `1fcbb7cb`, dropbin `a2274877`, prompts `873dab7b`.
Ties' local logger stub (`8ad6a23`) duplicated the kit's and is removed: `d0948f91`.

**Module guard copies retired** (one [declared] commit each; only the spread-rebuild branch, the
one-tick deferrals stay for each guide's own declared publish-timing step): ties `de2dad7a`,
movement `494b713d`, attunement `fd564cc5`, journal `6e94901e`, dropbin `7cacec51`, prompts
`47120a6d`, lookup `e6b66580` (flips glue load order (b) to an extensible root; new load order (c)
pins the frozen refusal), walls `3d044626` (flips glue (b)+(d) to an extensible root).

**Frozen tests touched** (all in [declared] commits, all pinned the frozen-root COMPAT behaviour):
names `test/glue.test.mjs` + `test/golden/root.json` (three frozen load orders: root left as it was,
the refusal reported by Hooks), pings `test/glue-root.test.mjs` ("before" uses the extensible root),
cursors `test/publish.test.mjs` (frozen case → refused), lookup and walls `test/glue.test.mjs` as above.
No other test or golden changed. Correction: `993677e3`'s message says "no other golden changed";
its `golden/root.json` is the flipped pin itself.

**Results at `3d044626`:** `node foundry/lib/test/run.mjs` 82/82. Module `node test/run.mjs`, all exit 0:
importer 92, names 45, pings 64, cursors 55, lookup 21 + 43 legacy, movement 121 + 89, walls 126
(2 KNOWN todo, as baseline), attunement 30 + 35 fixtures, journal 26 + 81, dropbin 38, ties 16 + 183
+ 9, prompts 17 + 415. `vendor.py check --all` green (12 modules, 7 skipped without a lock).
Conformance unchanged from the wave-2 baseline / wave-1 report for all twelve. `pytest -q` 866
passed, 2 skipped, 4 xfailed. `check_context.py` OK (warnings only, pre-existing).

**Known red range:** `vendor.py check` (advisory) is red for a module from `c69104f3` (the kit's
bytes change) until that module's re-vendor commit; module tests stay green throughout.

**Notes for later steps**
- `feature/pentaryn-feedback` (new module, not merged) vendors kit 1.0.1; it needs
  `vendor.py sync <module>` (and its tests re-run) when it merges.
- Guard removal shifted a few lines in movement, attunement, journal, dropbin, prompts, lookup,
  walls and ties; guides re-locate anchors by text.
- walls has no module-level test of the frozen refusal: its ready hook is async, so the throw is an
  unhandled rejection that `node:test` would fail on; the kit test, lookup (c), names and cursors pin it.

### walls — guide steps 2–10, code phase (2026-10-11)

walls is off in Joe's world: unit tests and static gates only; nothing synced. Guide Result row:
[`migrate-pentaryn-walls.md`](migrate-pentaryn-walls.md) §Result; audit status:
[`../code-audit-2026-10/walls.md`](../code-audit-2026-10/walls.md) §Status.

| Step / finding | Commit |
|---|---|
| 2 core barrel, MODULE | `de35515f` |
| 3 `core/` move + -4 · -7 [declared] · -8 code half · barrel by name (C05) | `3d0daef9` · `9b37264b` (+ `28dd5667`) · `e2520d57` · `36e3abbd` |
| 4 settings/keybinding tables | `eeeeaf6a` |
| 5 actions feature, manifest, entry, kit publish [declared] W-6 | `d06f77ab` |
| 6 empty catch · 7 i18n test + prepared lang | `5224038e` · `d3a07b62` |
| -6 maintainability · -5 performance | `c77d1e21` · `cb3ce91f` |
| 8a -1 [declared] W-1 · 8c -2 [declared] W-3 · 8b -9 [declared] W-2 · 8d -37 [declared] W-4 | `01de2ae2` · `ab859b4c` · `0ae5b96d` · `f06a6b90` |
| 8e -33 `analyze()` · 8f -3 `canonical(r, {extended})` | `08c498bb` · `1d2d196b` |
| 9 README, use-doc `context/foundry/walls.md`, CHANGELOG | `49f1f2eb`, `e6ffa3c7` |
| 10 (pre-batch half) dual-scope read · dormant migration | `90efd463` · `048eca8d` |

**Results at `e6ffa3c7`:** `node test/run.mjs` 197 pass, 0 fail, 0 todo (wave start 126 + 2 KNOWN
todo; both pins flipped). All six check gates green (parse, imports, i18n, node-test, vendor,
conformance — run through `modules.check("walls")`, no make). Kit suite 82/82. Conformance
**71.4 % → 95.6 % (43/45)**; failing C07 and C51 (both Wave 7). Performance (-5, js engine,
`runEngine(rooms(10))`): 3967 → 407 `Array#filter` calls, 4721 → 3121 Sets, median 141 → 121 ms.

**Frozen tests touched** (checkpoint `a8c5c28`): `glue.test.mjs` case (g) flipped KNOWN -1 → works
(`01de2ae2`); `golden/canonical.json` and `golden/backend-drift.json` re-pinned for the levels
fixtures only, and the two `knownWasm` markers removed from `test/fixtures/corpus.mjs` (`ab859b4c`).
Otherwise only import paths (`test/fixtures/engine.mjs` → the barrel) and the guide-prescribed
fixture edits (`kindOf` re-export, a comment). Correction (critic): also `test/bench.mjs`'s
wasm-missing line in [declared] `9b37264b`, and `test/corpus.mjs` (the manual CLI) in
`c1a80a53`, undeclared: `process.exit` → `throw` (C43), so an unknown backend exits 1, not 2. No
frozen test went red twice.

**Known red commit:** `9b37264b` — its own new `test/backends.test.mjs` matched its own source
(fixed forward by `28dd5667`); every other test is green there.

**Not mine, seen in passing:** `pytest scripts/tests` has one failure,
`test_update_escalation.py::test_the_real_registry_matches_the_code` (`itempiles-attunement-*`
markers), from the attunement lane's uncommitted work in this worktree. `check_context.py` is red
on the stale Module APIs table (walls, attunement, journal, lookup, movement rows): the integrator's
`make foundry-module-index`.

**Integrator handoff — walls, shared files** (exact edits; the walls lane does not touch these files):

- `wave7-restart-batch.md` Batch 1, walls row, "Code in the same batch" column — replace with:
  `lang/en.json` (-36), rows/toasts to full-key literals; **flag-scope data migration**
  `wall-autocomplete` → `pentaryn-walls` (`migrations.mjs`, GM-only, idempotent; declared B6):
  `core/engine.mjs` `FLAG_SCOPE = "pentaryn-walls"`, the manifest `flagScope` and `flags.writes`,
  and **flip the frozen `test/core.test.mjs:14` FLAG_SCOPE pin to `"pentaryn-walls"`
  ([declared], same commit)**, re-pinning `golden/engine.json`, `golden/backend-drift.json` and
  `golden/describe.json` and the `api.test.mjs` flags case in that commit
  (guide §Result step 10 item 3).
- `wave7-restart-batch.md` "Appended by Record steps", the existing walls row (2026-10-11,
  senses-walls-cursors-8, wave 1 integration; line 64 at `a63d043d`) — **replace it**, do not add
  a second row, so the batch has one instruction for the `description` edit (the Batch 1 walls
  row's "`description` fix (-8)" means this row). New row, verbatim:

  ```
  | 2026-10-11 | walls | `description`: `See playbooks/foundry-wall-autocomplete.md` → `See context/foundry/walls.md` (the use-doc, guide step 9; supersedes the wave-1 target `context/plans/foundry-wall-autocomplete.md`); `verified byte-identical against the same 44 fixtures` → `produces identical geometry, verified against the same fixture corpus` (the setting hint's wording, `test/fixtures/lang-en.wave7.json`) | senses-walls-cursors-8 (wave 1 integration; amended by walls wave 2) |
  ```

### journal — guide steps 2–8, code phase (2026-10-11)

Code phase only; nothing live was touched. Conformance **57.8 % → 85.4 % (41/48)**. Tests: `node test/run.mjs`
→ 88 node:test cases + the legacy core suite (81 checks), all green; `vendor.py check journal` green;
`module-check journal` static gates (parse, imports, i18n, node-test, vendor, conformance) green.

| Step / finding | Commit |
|---|---|
| step 2 core MODULE, constants, visibility rules (-34) | `7dc5fce8`, follow-up `526d1aa8` (see red range below) |
| step 3 settings.mjs · step 4 sources-adapter.mjs · step 5 features + entry (-36 part) | `f2df3db3` · `9bb8d560` · `93dc1a56` |
| step 6 manifest API, publish at ready [declared] D-J1 · api.test + goldens | `dbd56638` · `946a6dd4` |
| -32 · -36 · -35 (+ `inspect`) | `8bce2b4a` · `26e9df02` · `0fe84b85` |
| -33 [declared] · -38 [declared] (D-J3) | `d595451e` · `cac07643` |
| C30 relay via `relayed` [declared] D-J4 | `5b79802c` |
| -40: KNOWN pin · claim-first fix [declared] D-J5 · manifest flag · stamp-failure fallback | `d8bfe157` · `f97e9f74` · `792f57fb` · `79155a74` |
| hardening tests (player side of the relay) · step 8 docs · plans | `a3731712` · `b615d9d8` · `7d17df5d` |
| review fixes: `inspect` takes an Actor/Token [declared] D-J6 · claim leftover wording + pin · step-9 README handoff · §5.9.4 record (W2-J4) | `5df878a6` · `d2181a79` · `2b908397` · `8b8c905f` |

**Frozen tests:** only `glue.test.mjs` changed, at two named pins: publish timing (`dbd56638`, D-J1) and the
relay refusal message (`5b79802c`, D-J4). No golden changed. New step goldens: `describe.json`, `surface.json`.

**Known red range:** `7dc5fce8` → `526d1aa8` (journal, behaviour only, every suite green): the core rules
destructured the facts the glue passes as getters, so `shouldShowItemBar(null)` threw on any non-pile item
sheet render ("bar skipped" warn). Skip `7dc5fce8` and `f2df3db3` (journal's step 3, still before the fix)
when bisecting journal behaviour.

**Still failing:** C03 C07 C09 C37 (+ C06w): Wave 7 `module.json` batch. C47: the adjustments row.
C51: W2-J1. C56: kit gap below.

**Kit gap (for the integrator; not changed here):** `registerQueries` (kit 1.0.2, `queries.mjs`) builds
`handler = async (data = {}) => …` and drops the query context, so a `relay: true` row's implementation
never sees `ctx.user`, the sender. Journal's relay must know the sender, so it stays a hand-written
`CONFIG.queries[…] = relayed(…)` (C30 passes, C56 fails). A kit 1.0.3 fix: take `(data = {}, ctx = {})`
and pass `ctx` on (e.g. `row.args(d, ctx)` for legacy rows, `fn(d, ctx)` otherwise), plus a kit test that a
relay row's impl receives `ctx.user`. Then journal needs a published row for the relay (W2-J2).

**Integrator handoff — journal, shared files** (exact edits; the journal lane does not touch these files):

1. `adjustments-batch.md` journal row / `foundry/adjustments.yml` (guide step 7): the row id is
   `itempiles-journal-preview-copy` (D2 prefix rule), not `journal-itempiles-preview-copy`; the other fields
   as guide step 7 (modules `[pentaryn-journal]`, packages `[item-piles]`, files
   `[foundry/module/pentaryn-journal/sources-adapter.mjs]`, markers `["pileData", "canInspectItems"]`). Clears C47.
2. `wave7-restart-batch.md` Batch 1, journal row (guide step 9): `flags.pentaryn` (full · `journal` · `pj-`),
   `relationships` (systems dnd5e min 6.0 verified 6.0.6; recommends item-piles + reason),
   `styles: ["styles/journal.css"]` + `git mv foundry/module/pentaryn-journal/journal.css foundry/module/pentaryn-journal/styles/journal.css`
   — **and, in the same commit as the move, the module README's Files table**: the row
   `` | `journal.css`, `lang/en.json`, `lib/` (vendored kit) | | `` (README.md:134 at this commit; :132 before
   D-J6) → `` | `styles/journal.css`, `lang/en.json`, `lib/` (vendored kit) | | ``. Replace the journal row's
   "Code in the same batch" cell (`—`) with:
   `` README.md Files table: `journal.css` → `styles/journal.css` (same commit as the move) ``.
3. `context/foundry/README.md` Module APIs table: regenerate (`make foundry-module-index`); the journal row
   still says "no describe golden yet", and D-J6 changed `describe()` (the `inspect` row).
4. Kit 1.0.3: the `registerQueries` gap above (then W2-J2).

### bridge lane — review fixes (2026-10-11)

Ten review defects, fixed in the fork worktree (`migrate/wave-2`) and here, one commit each, code
phase only (nothing built or deployed; the fork changes ship with the next bridge build):

- `d5ba3c4` the D14 template tests run fork.eval on fake timers and assert no timer is left.
- `6f598fb` [declared] pentaryn-write refuses `dryRun` on a row without one (BAD_ARGS
  `<ns>.<path> has no dry run`): `walls.run` with `dryRun:true` used to run for real. A row
  declares a dry run by `row.dryRun === true` (not in kit 1.0.2, W2-B3) or a param whose type or
  doc names `dryRun` (importer.import).
- `a79f5f3` [declared] pentaryn-read runs only rows with `writes === false` (fail closed).
- `a6fb891` [declared] a call that would fill a param needing a live Document is BAD_ARGS
  ('eval-js only') before it runs: attunement.stash/releaseAway, journal.add/status/statusFor/
  shouldShowBar/ensure, movement.ghostFor, names.sync (W2-B4). Checked against all nine real
  manifests.
- `b8f540f` [declared] a coded query error (NOT_GM from a non-GM bridge tab) keeps its code.
- `81f8bb4` [declared] recharge resolves its actor exactly (id, exact name, token id, then the
  created actor's id) and an `itemId` never falls back to a same-named feature. add-feature sends
  `actorId` beside `actorIdentifier`, not instead of it: a synthetic token actor shares its base
  actor's id, so the id alone would move a token-id recharge onto the world actor.
- `9c845d1` [declared] the recharge outcome rides on the add-feature call's own action-log line
  (`recharge`, with `client` and sanitised args); no second ActionLog.
- `7f6680a` FORK.md's settings.ts row is one row again; `d77c496` `fork:` markers on the new
  upstream hunks, index.ts/add-feature.ts/data-access.ts in the marker table.
- `3fff41d0` [declared] **new finding dnd-roller-flock** (outside python-tooling-51's in-process
  scope): each dnd-scripts server process loaded `quant_numbers.bin` at import and rewrote it from
  its own copy, so two sessions drew the same numbers. Draws now hold an flock on
  `quant_numbers.bin.lock` and re-read the file when another process changed it; a two-process
  test pins it (red before the fix).

### dropbin — guide steps 2–9 and the standalone findings, code phase (2026-10-11)

Code phase only; nothing synced, no live tool used. Guide Result row:
[`migrate-pentaryn-dropbin.md`](migrate-pentaryn-dropbin.md) §Result; audit status:
[`../code-audit-2026-10/dropbin.md`](../code-audit-2026-10/dropbin.md) §Status.

**PT3-1:** `fix/playtest-2026-10-11` was finished (`fa449fd3`), so it is merged (`931203a5`; one
conflict, names' CHANGELOG, both entries kept) and dropbin's refactor carries `corpses.mjs`'s
PT3-1 code and its `test/corpses.test.mjs` unchanged (green throughout). Nothing to drop at merge.

| Step / finding | Commit |
|---|---|
| 2 cores (-20, MODULE half of -26) · 3 settings · 4 adapters · 5 features + entry (-22) | `1e4214c2` · `27829537` · `8eb60589` · `4ef64cd7` |
| kit guard on every handler [declared] | `146aefce` |
| 6 manifest API, publish at ready [declared] D-D1 · -28 additive (brief, restoreResult, inspect, selftest) | `500f33a0` · `0ac333a2` |
| 7 i18n (-26 strings) | `a1b0ff01` |
| 8 -18 [declared] D-D2 · -21 [declared] · -23 [declared] · -24 · -25 [declared] · -30 [declared] · -19 [declared] · -27 kept | `a3b44685` · `9f43f573` · `4d96d3a8` (+`6273d1e7`) · `eff44a40` · `bae36010` · `c62da821` · `314f49c3` · `4fa0b17a` |
| 9 README, CHANGELOG · §5.9 review: clear through the queue [declared], hot-path guard · coverage gaps · plans | `85f4353f` · `b2320f94`, `34e74e6c` · `f7bebf9e` · `cda968d9` |

**Results at `f7bebf9e`:** `node test/run.mjs` 114 pass, 0 fail + legacy 40 checks (checkpoint: 38 +
40). `vendor.py check dropbin` green; static gates (parse, imports, i18n 17/17, node-test, vendor,
conformance) green. Conformance **60.9 % → 91.7 % (44/48)**; failing C07, C09 (Wave 7 `module.json`),
C47 (adjustments rows, integrator), C50 (scorer gap: it reads only `Hooks.once("ready", …)`, not a
publish from a `reg.once` ready handler). Performance counters: 5 drops in one tick 2 counter + 2 log
writes (was 5 + 5), one mirror upload per burst; Journal sidebar 40 rows × 5 scenes 5 note walks
(was 160); corpse eye disc cleared once per size (was every refreshToken).

**Frozen tests touched** (checkpoint `4b53345`): `glue.test.mjs` only, at named pins, each in its
[declared] commit — publish timing (D-D1), -18 KNOWN, -25 backfill shape, -30 KNOWN, -19 upload
timing and ready line; goldens `ready-console.json` and `backfills.json` re-pinned there. The
`impls.mjs` fixture gained the core (step 2, as its comment said) and `world.mjs` gained
`Actor.implementation.updateDocuments` (-25). No frozen test went red twice.

**Live checks for the gated live phase (L3)** — after a reload (no `module.json` change yet):
`game.pentaryn.dropbin.describe().version === "0.2.2"`, `selftest().ok`; `list(5, {brief: true})`;
console at ready: `ready — N entries on the ledger (~K KB)` (GM). D-D2/-19: as a player drop three
items in one Item Piles drop → three consecutive numbers, `assets/drop-bin/drop-log.json` updates
~2 s later; `restoreResult(n)` on a test item, then `restore(n)` toasts as before. -21: as a player
with no GM online, drop an item → one `ledger entry not recorded (no GM?)` warning, no
"Uncaught (in promise)". -25: with the bridge tab and a GM browser tab on the active GM account, each tab logs
`lock sound set …` once (when there is work; `isSelf` is per user, so both tabs run the idempotent
backfill); a second GM user's tab logs nothing. -30: a corpse's eye still shows/hides while looting and
while the token moves. Locks: a player opens a locked chest from canvas, sidebar and Ctrl-click →
toast + floating *Locked*. PT3-1: kill and revive an unlinked NPC from the HUD → players lose its
sheet. Hot patch: `game.pentaryn.dropbin.uninstall()` then
`await import("/modules/pentaryn-dropbin/dropbin.mjs?v=2")` → `selftest().ok` (socketlib relay
re-registered). No live golden "before" script exists for dropbin (the wave-1 report asked for one
per module): `scripts/foundry/live-goldens/` is shared, so it is listed for the integrator.

**Integrator handoff — dropbin, shared files** (exact edits; the dropbin lane does not touch them):

1. `foundry/adjustments.yml`: `itempiles-corpses` `files` →
   `[foundry/module/pentaryn-dropbin/corpses.mjs, foundry/module/pentaryn-dropbin/dropbin.mjs, foundry/module/pentaryn-dropbin/loot.mjs, foundry/module/pentaryn-dropbin/piles.mjs]`
   (marker `itempiles` stays); `itempiles-rarity-i18n` `files` →
   `[foundry/module/pentaryn-dropbin/i18n-shim.mjs, foundry/module/pentaryn-dropbin/dropbin.mjs]` unchanged
   (the entry installs the shim as a feature now; the marker `ItemRarity` is in both). New rows (guide step 10 with the D2 package prefixes from
   `adjustments-batch.md`; `modules: [pentaryn-dropbin]`, `check: make foundry-dropbin-check`):
   `socketlib-dropbin-relay` (packages `[socketlib]`, files `[…/socketlib-adapter.mjs]`, markers
   `["registerModule", "executeAsGM"]`); `itempiles-dropbin-nan-attunement` (packages `[item-piles, dnd5e]`,
   files `[…/itempiles.mjs]`, markers `["ATTUNEMENT_PACKS", "repairAttunement"]`, `native_when: "Item
   Piles addItems preserves system.attunement"`, `retire_class: guarded`);
   `itempiles-dropbin-container-locks` (files `[…/itempiles.mjs]`, markers
   `["item-piles-preRenderInterface", "item-piles-preRenderActorSheet"]`);
   `itempiles-dropbin-directory-hiding` (files `[…/itempiles.mjs]`, marker `renderActorDirectory`);
   `itempiles-dropbin-svelte-store` (files `[…/piles.mjs]`, marker `appShell`, `retire_class: never`,
   manual check "open a pile, Change recipient, Loot all goes to the new recipient"). Clears C47.
2. `wave7-restart-batch.md` Batch 1 dropbin row (unchanged): `flags.pentaryn` =
   `{flagScope: "pentaryn-dropbin", generation: 14, tier: "full", namespace: "dropbin", cssPrefix: "pd-"}`;
   `relationships.recommends` item-piles (drop capture, corpse piles, Loot all, container locks) and
   itempilesdnd5e (the rarity i18n shim); `requires: socketlib` stays; `compatibility.minimum: "14"`.
   Clears C07, C09, C02. If the batch also bumps `version`, change `VERSION` in
   `foundry/module/pentaryn-dropbin/dropbin-core.mjs` in the same commit (`test/core-barrel.test.mjs`
   pins them equal).
3. `context/foundry/README.md` Module APIs table: regenerate (`python -m scripts.foundry.ops module-index`);
   the dropbin row gains its API cell from the new `describe.json` (check-context is red until then,
   as for walls, attunement, journal, lookup and movement).
4. `scripts/foundry/live-goldens/dropbin.js` (new, optional): the "before"/"after" live golden the
   wave-1 report asks for — `describe()` normalised, `list(3, {brief: true})`, `selftest()`.
5. Blueprint scorer (tooling lane): C50 should also follow `reg.once("ready", …)` handlers and a
   publish reached from one (guide §8).

### Integration — shared files (2026-10-11)

One writer in the worktree; code phase only (no sync, no restart, no live tool, no merge). Each
lane's shared-file list applied, one commit per logical step:

| Commit | What |
|---|---|
| `cd414590` | `foundry/adjustments.yml`: movement's three patch rows (C32); attunement's two file moves and `dnd5e-item-tooltip-anchor` → **`attunement-item-tooltip-anchor`** (the id its `wrapMethod` names); `itempiles-journal-preview-copy`; dropbin's `itempiles-corpses` + `piles.mjs` and five new rows (`socketlib-dropbin-relay`, `itempiles-dropbin-{nan-attunement,container-locks,directory-hiding,svelte-store}`). `adjustments-batch.md` Batch A rows marked landed |
| `e4978110` | `make foundry-module-index` (six rows gain their API cells; mcp-fork-20); README `search()` shape line (`hits`, not `results`); walls routing row → `walls.md` |
| `01fa7cda` | `rules-lookup.md` "What comes back" table (prompts-lookup-2 doc half) |
| `fa9cc7a2` | lookup audit status and guide Result: the two halves landed; 133 tests with `e0e2dd40` |
| `b6f6bcdb` | `wave7-restart-batch.md`: common rule (the afterSync commit deletes the config.py tuple; a `version` bump moves the core `VERSION`); movement `minimum: "14"` + three-line afterSync; walls code column (migration wiring, the frozen `core.test.mjs:14` FLAG_SCOPE flip and its re-pins) and the wave-1 `description` row **replaced**, not duplicated; journal `git mv` + README Files table; dropbin reasons and VERSION pin. **No `module.json` was edited** — every row waits for the one restart |
| `4335d01b` | `walls.md`: a Levels scene's card says `js` (`3ea5249b`) |
| `852b9047` | `config.py` movement ModuleSpec comment (the `after_sync` tuple is untouched until Wave 7) |
| `edc7489a` | new `test_module_checks.py` net: every `context/`/`playbooks/` path a module cites exists (senses-walls-cursors-8 recipe, repo-wide); walls' `module.json` is a strict xfail until Wave 7. Fails on a planted bad cite |
| `5e4866d4` | `packages.json` `privateInternalPatterns` gains `_positionItemTooltip` (items-journal-39 c): attunement's C33 is now listed for manual review |

**Known red ranges closed here:** `check-context` red from walls `d06f77ab` (first wave-2 describe
golden) to `e4978110`; `foundry-adjustments-check` (and `test_update_escalation.py::
test_the_real_registry_matches_the_code`) red from attunement `5f3bf2d5` to `cd414590`.

**Gates at the integration head:** every `foundry/module/pentaryn-*/test/run.mjs` exits 0 — lookup
133, movement 167 (+ 89 legacy), walls 200 + 1 todo (the Wave 7 `module.json` cite), attunement 119
(+ 35 fixtures), journal 94 (+ legacy core), dropbin 118 (+ legacy), names 50, pings 67, cursors 55,
importer 92, prompts 24, ties 16; the unmigrated seven exit 0. `pytest -q` 913 passed, 2 skipped, 3
xfailed. `make foundry-modules-check` all 19 green. `foundry-lib-check` 82/82. `check-context` OK (4
pre-existing warnings). `foundry-adjustments-check` 96 rows OK.

**Conformance (advisory)** — wave-2 baseline → lane end → after integration:

| Module | Baseline | Lane end | Integrated | Still failing (why) |
|---|---|---|---|---|
| lookup | 75.6 % | 97.7 % | **97.7 %** | C07 (Wave 7) |
| movement | 66.7 % | 93.6 % | **95.7 %** | C07, C37 (Wave 7 `cssPrefix`) |
| walls | 71.4 % | 95.6 % | **95.6 %** | C07 (Wave 7 data migration), C51 (W2-WALLS-1) |
| attunement | 67.4 % | 90.9 % | **93.2 %** | C04, C07, C09 (Wave 7 + step 8) |
| journal | 57.8 % | 85.4 % | **87.5 %** | C03, C07, C09, C37 (Wave 7), C51 (W2-J1), C56 (kit gap, W2-J2) |
| dropbin | 60.9 % | 91.7 % | **93.8 %** | C07, C09 (Wave 7), C50 (scorer gap) |

**Not applied (follow-ups, no Joe decision needed):**
- Scorer gaps (`conformance.py`, tooling): C05/C16 do not follow `export … from` barrels (walls
  item 5: `Module.imports` should add `jsscan.exports_of(...)[1]`); C50 does not follow a publish
  reached from a `reg.once("ready", …)` handler (dropbin). Both move other modules' scores, so they
  want their own tooling step with a before/after table.
- Kit 1.0.3: `registerQueries` drops the query context (journal handoff item 4); a kit bump and a
  re-vendor of every kit module, then W2-J2.
- Live goldens (`scripts/foundry/live-goldens/`) for lookup, movement, walls, attunement, journal and
  dropbin do not exist; each "before" run must be taken on the deployed build before the L-session
  syncs. Not written here: an untested live script is worse than none.
- lookup, noticed by its lanes: `names("constructor")` returned a junk one-key object (landed:
  `055586bb`, below); `NAME_SOURCES` is frozen one level deep (harmless today).

### Integration review (2026-10-11)

A second pass over `wave-2-base..HEAD` (and the fork's `pentaryn..HEAD`), code phase only. Checked:
no commit carries `foundry/logs/**` or a secret; no commit touches two modules' trees or another
lane's plan/audit files except the integration commit `bbcdd721`; every commit ends with the
session trailers; each frozen test or golden changed after its module's checkpoint changed in a
`[declared]` commit or as an import/path-only move (lookup's legacy suite became `core.test.mjs`
cases in `f0f70ea8`, 43 → 43); no `.only`, and every new test that schedules a timer runs on
`mock.timers`.

| Commit | Fix |
|---|---|
| `3df15e0f` | transform's `test/kit/foundry-stub.mjs` came in at kit 1.0.1 with the `fix/playtest-2026-10-11` merge (`931203a5`); re-vendored byte-identical to 1.0.2. module-check never compared it: transform has no `kit.lock.json` |
| `055586bb` | lookup [declared]: `names("constructor")` (any `Object.prototype` word) is an unknown kind and answers everything, via `Object.hasOwn` (the follow-up listed above); new `test/names-kind.test.mjs`, 135 tests |
| `7c2aef7b` | `context/foundry/mcp-fork.md`: the bridge plan's P9 second half — the `pentaryn-read`/`-write` table, `fork.applyRecharge`, `timedOut`, the fork's coded `NOT_GM` and `guardBridgeQueries`, kit 1.0.2 in the contracts table. Marked "wave-2 build" |
| fork `213c6c3` | `pentaryn-read`'s description named `rules` as eval-js only; lookup gains `describe()` in this wave, so it now names ties, combat, prompts |

**Per-commit module sweep** (each commit's tree via `git archive`, `node test/run.mjs` for every
module it touches, every module on a `foundry/lib` change; 271 runs): red only at walls `9b37264b`
(`test/backends.test.mjs` matched its own source; fixed forward in `28dd5667`) and pings
`466a3a4f`, `a18872c9` (the PT3-2 repro-first commits on `fix/playtest-2026-10-11`, green from
`7a8701df`). Add these to the known red commits beside the two ranges above.

**Gates after the review:** every module's `test/run.mjs` exits 0 (lookup 135); `pytest -q` 913
passed, 2 skipped, 3 xfailed; `foundry-modules-check` 19/19; `foundry-lib-check` 82/82;
`check-context` OK; `foundry-adjustments-check` OK. Fork: server vitest 275, module vitest 43,
both typechecks, `fork-footprint.sh` green.

**Noted, not changed:** `eslint` on the fork's new `src/fork` files reports 3 errors
(`prefer-template` in `action-log.ts:68` and `pentaryn-write.ts:71`; `no-misused-promises` on the
`setInterval(async …)` moved from `index.ts` into `tool-list-watch.ts:39`, whose body is already
inside try/catch). Style only; lint is not a gate here and upstream files carry dozens.

### Live-phase prep (2026-10-11, code phase — nothing run)

The gated live phase is written down in [`wave-2-live-plan.md`](wave-2-live-plan.md): preconditions,
backup and "before" goldens on the deployed code, the deploy (module syncs, fork build, bridge
module, `kill -9` the broker, one restart), boot probes, "after" goldens with a diff, the
`pentaryn-read`/`-write` smoke, the dropbin ownership-leak scan, per-module rollback and the fix
loop. The live goldens the integration listed as missing now exist (`f9a5ec91`):
`scripts/foundry/live-goldens/{lookup,movement,attunement,journal,dropbin,walls}.js`, each split into
`golden.shared` (must match before/after) and `golden.declared` (the wave's declared changes), plus
`diff.mjs` (`9a7534c4` lets it read the wave-1 goldens). Checked statically only (`node --check`,
eslint `no-undef`); their first real run is the plan's step a. Two decisions for the session:
W2-L1 (walls) and W2-L2 (the modules outside the six), below.

## Commit lists

`git log --oneline wave-2-base..f8fb7377` (pentaryn, 253 commits, newest first; this report's commits follow) and the fork's `git log --oneline pentaryn..213c6c3` (43 commits; the last three are wave 1's commits on `migrate/wave-1`: two docs, one footprint-script fix). A subject carrying `[declared]` changes behaviour; those are listed first.

**[declared], pentaryn (68):**

```
055586bb fix(lookup): [declared] names() reads NAME_PARTS by own key; a prototype word is an unknown kind
db529317 fix(dropbin): [declared] clearLog seals the waiting append batch, so a later append lands after the clear
dcc2a293 fix(dropbin): [declared] restoreResult reports a vetoed create as not-created
276c1040 fix(dropbin): [declared] the ready eye migration returns its promise to the kit guard
b2320f94 fix(dropbin): [declared] clear() goes through the ledger queue (§5.9 review)
314f49c3 perf(dropbin): [declared] coalesced ledger writes, a debounced JSON mirror, the ledger size at ready (items-journal-19)
c62da821 perf(dropbin): [declared] the corpse eye redraws its disc only on a size change; no sync timers off the active GM (items-journal-30)
bae36010 perf(dropbin): [declared] ready backfills on the active GM only, actors in one batch (items-journal-25)
4d96d3a8 fix(dropbin): [declared] Item Piles' pile data is read as plain flags, never getFlag (items-journal-23)
9f43f573 fix(dropbin): [declared] an unrecorded ledger entry is one warning, never an unhandled rejection (items-journal-21)
a3b44685 fix(dropbin): [declared] ledger appends are serialised (items-journal-18, step 8, D-D2)
3fff41d0 fix(dnd_roller): one draw at a time across server processes — flock + re-read under it [declared]
500f33a0 feat(dropbin): [declared] API through the manifest, published via the kit at ready (D2, D-D1)
146aefce refactor(dropbin): [declared] every hook handler reports through the kit guard
5df878a6 fix(journal): [declared] inspect maps an Actor or Token to the player whose character it is, so the root inspect carries no BAD_ARGS (review, D-J6)
3ab081ca fix(attunement): stash()'s audit line carries the copy ids and by, per the playbook's audit-line shape (items-journal-10 remainder) [declared]
3ea5249b fix(walls): a Levels scene reports js, the backend that ran, not wasm (senses-walls-cursors-2 follow-up) [declared]
7cf1a4f1 fix(attunement): a successful stash() logs one audit line with the count, container and names (items-journal-10 remainder) [declared]
73180dfd fix(attunement): stash()'s shortfall rejection names the copies left in the container (items-journal-10 follow-up) [declared]
9b1dc46e fix(attunement): selftest() reports a throwing tooltips read as a failed check instead of throwing [declared]
f97e9f74 fix(journal): [declared] one GM tab answers the ensure relay — claim first (items-journal-40, J8, D-J5)
5b79802c fix(journal): [declared] the player relay goes through the kit's relayed (C30, D-J4)
74922db2 fix(lookup): cache only locked book packs; an unlocked pack is read every call (DL5 review) [declared]
cac07643 perf(journal): [declared] cache which journals a scene pin opens (items-journal-38, D-J3)
d595451e perf(journal): [declared] memoised sanitize per page; item updates refresh only item bars (items-journal-33, D-J3)
e1062a2b docs(scripts): dnd-scripts tool contracts — annotations, error channels, the owned books [declared]
df3a47ac fix(scripts): actions DB writers take a file lock [declared]
b54556d1 fix(attunement): the bond is cleared with _del, not the deprecated -= key (v14 hygiene) [declared]
7e18a834 fix(attunement): stash() refuses to delete the originals when the container dropped a copy (items-journal-10) [declared]
dbd56638 feat(journal): [declared] API from the manifest, published at ready via the kit (D2, D-J1, guide step 6)
a3941fb6 style(attunement): the counter and away-tooltip classes move under the module prefix (C37) [declared]
09412de5 fix(scripts): roll_dice draws under a threading.Lock; httpx client per call [declared]
f06a6b90 feat(walls): the ready line says why wasm is unavailable (senses-walls-cursors-37) [declared]
0b1910cc fix(movement): the ghost-back toast names why ghost is allowed now (F-M2, D-M4, aoe-movement-portals-42) [declared]
10053c27 fix(lookup): page(<non-page uuid>) says so with a warning (prompts-lookup-5) [declared] DL4
0ae5b96d fix(walls): one run at a time for every caller; chat cards awaited and their failures logged (senses-walls-cursors-9) [declared]
91ee5c9d fix(lookup): guard the spell-list registry options read (step 13, prompts-lookup-4) [declared] DL3
d7a8ae2f feat(attunement): API through the manifest, published at ready via the kit (items-journal-16) [declared] publish via kit (D2)
b98745c1 perf(lookup): cache the book packs per session with their plain text (step 12, prompts-lookup-1) [declared] DL5
ab859b4c fix(walls): the wasm backend hands Levels scenes to the js engine (senses-walls-cursors-2) [declared]
586eeb1b fix(ops): bridge.scan guards ppid and reads ps once [declared]
01de2ae2 fix(walls): undo() reads run stamps as plain data and works (senses-walls-cursors-1) [declared]
e1adc21c fix(attunement): a failing tooltip-guard install no longer blocks the API publish (items-journal-39 b) [declared]
b3d69dbb feat(movement): status({ sceneId }) and the settings key map (aoe-movement-portals-23) [declared]
25c81ef9 feat(movement): API through the manifest, published synchronously at ready (guide S6, D-M2) [declared]
0d0c2199 fix(attunement): strip listener failures are logged with a label (items-journal-11, listener half) [declared]
2afb4d4b feat(lookup): GM-guarded queries for the eight read-only lookups, registered at init (step 9) [declared] DL2
07920a8f refactor(attunement): hook handlers run through the kit guard (items-journal-11, hook half) [declared]
d65ddd62 refactor(movement): kit log; the two empty catches warn once (guide S5; aoe-movement-portals-20) [declared]
abb4ae75 feat(lookup): kit-built API — manifest, api.mjs, publishNamespace; entry 60 lines (step 7) [declared] DL1 DL2
d06f77ab refactor(walls): actions feature, API manifest and a wiring-only entry; publish through the kit (C10, C18, C27, C28, C50) [declared]
561d0749 feat(movement): the two hidden settings get name/hint labels; re-pin settings-register.json (D-M3) [declared]
9b37264b refactor(walls): drop the stale WASM_STATUS placeholder; bench says why wasm is missing (senses-walls-cursors-7) [declared]
3d044626 refactor(walls): retire the frozen-root guard copy in publishAPI (J10) [declared]
e6b66580 refactor(lookup): retire the frozen-root guard copy in publishAPI (J10) [declared]
47120a6d refactor(prompts): retire the frozen-root guard copy in the deferred publish (J10) [declared]
7cacec51 refactor(dropbin): retire the frozen-root guard copy in the deferred publish (J10) [declared]
6e94901e refactor(journal): retire the frozen-root guard copy at ready (J10) [declared]
fd564cc5 refactor(attunement): retire the frozen-root guard copy at ready (J10) [declared]
494b713d refactor(movement): retire the frozen-root guard copy at ready (J10) [declared]
de2dad7a refactor(ties): retire the frozen-root guard copy in publishAPI (J10) [declared]
2a55cef3 chore(cursors): re-vendor kit 1.0.2; frozen-root pin flipped (J10) [declared]
f805bb63 chore(pings): re-vendor kit 1.0.2; frozen-root pin flipped (J10) [declared]
993677e3 chore(names): re-vendor kit 1.0.2; frozen-root pin flipped (J10) [declared]
8f9ee627 refactor(kit): retire publish.mjs's frozen-root guard and realiasTick (J10) [declared]
6d8f0f22 fix(kit): wrapMethod/defineAccessor unwrap() drops the kit's record (J16) [declared]
f57cd997 fix(names): [declared] PT3-9 — a rename also relabels the actor's combatants (GM only)
a18872c9 test(pings): [declared] PT3-2 — socket pins use core v14's userActivity payload
```

**[declared], fork (16):**

```
9c845d1 fix(fork): the recharge outcome rides on the add-feature line — one ActionLog, with client [declared]
81f8bb4 fix(fork): recharge resolves its actor exactly; an itemId never falls back to a name [declared]
b8f540f fix(fork): a coded query error keeps its code through pentaryn-read/-write [declared]
a6fb891 fix(fork): pentaryn-read/-write refuse a call that needs a live Document [declared]
a79f5f3 fix(fork): pentaryn-read runs only rows that declare writes:false [declared]
6f598fb fix(fork): pentaryn-write refuses dryRun on a row without a dry run [declared]
3875d2c fix(fork): recharge applies through a typed fork query; token ids resolve [declared]
4727fcf fix(module): fork GM guard throws coded NOT_GM errors [declared]
506415b fix(module): upstream bridge queries refuse a non-GM sender [declared]
16a33d1 fix(module): eval timeout timer is cleared; a timeout says timedOut [declared]
0909494 fix(fork): tool-list key hashes name, description and inputSchema [declared]
2457e18 fix(fork): FOUNDRY_MCP_TOOL_FILTER blocks calls, not only listings [declared when the filter is set]
b628500 fix(fork): an eval-js call rejected for bad args leaves a phase:"args" eval line [declared]
745c0fd fix(fork): failed evals log ok:false; logArgs hook keeps scripts out of the action log [declared]
c2fd036 fix(fork): eval log rotates monthly — eval-YYYY-MM.jsonl [declared]
b6afb9e fix(fork): action-log month computed at write time [declared]
```

<details><summary>All pentaryn commits</summary>

```
f8fb7377 docs(plans): wave-2 report — live-phase prep, W2-L1 (walls) and W2-L2 (modules outside the six)
41cc7c7a docs(plans): wave-2 live plan — gated sequence for goldens, deploy, probes, bridge smoke, rollback
9a7534c4 test(foundry): live-golden diff compares a wave-1 golden whole as shared
f9a5ec91 test(foundry): wave-2 live goldens for lookup, movement, walls, attunement, journal, dropbin
9a062e1f docs(plans): wave 2 integration review — four fixes, per-commit sweep reds, gates, fork lint note
7c2aef7b docs(foundry): mcp-fork.md — pentaryn-read/-write, the fork queries, coded NOT_GM, timedOut (P9 second half)
055586bb fix(lookup): [declared] names() reads NAME_PARTS by own key; a prototype word is an unknown kind
3df15e0f test(transform): re-vendor test/kit/foundry-stub.mjs at kit 1.0.2
bbcdd721 docs(plans): wave 2 integration — shared-file commits, gates, conformance before/after, follow-ups
5e4866d4 chore(blueprint): C33 lists dnd5e's Tooltips5e#_positionItemTooltip for manual review (items-journal-39 c)
edc7489a test(modules): every doc path a module cites exists, repo-wide (senses-walls-cursors-8 recipe)
852b9047 chore(ops): movement ModuleSpec's node-test comment names what run.mjs runs now
4335d01b docs(walls): a Levels scene's card names the js engine that ran (3ea5249b)
b6f6bcdb docs(plans): wave 7 restart batch — wave-2 module.json edits (lookup, movement, walls, journal, dropbin)
fa9cc7a2 docs(plans): lookup status — prompts-lookup-2 doc half and mcp-fork-20 landed (integrator); 133 tests with e0e2dd40
01fa7cda docs(rules-lookup): 'What comes back' — every rules read's return shape, iterate .hits (prompts-lookup-2 doc half)
e4978110 docs(foundry): regenerate the Module APIs index for the wave-2 modules; rules.search shape; walls route to its use-doc
cd414590 chore(adjustments): wave 2 rows — movement patches, attunement/dropbin file moves, journal and dropbin Item Piles/socketlib rows
b0210693 docs(dropbin): CHANGELOG lists clear()'s queueing (b2320f94, db529317)
db529317 fix(dropbin): [declared] clearLog seals the waiting append batch, so a later append lands after the clear
a964d902 docs(audit): dropbin status lists the review follow-ups to -22 and -28
dcc2a293 fix(dropbin): [declared] restoreResult reports a vetoed create as not-created
276c1040 fix(dropbin): [declared] the ready eye migration returns its promise to the kit guard
1dc37ad1 docs(dropbin): the ready backfills run on every tab of the active GM user, not one tab
759694f7 fix(dropbin): inspect(uuid) picks the actor or token branch by documentName
8beb0929 docs(plans): dropbin Result — only itempiles-corpses' files change
1a61c253 docs(plans): wave 2 report — dropbin lane (steps 2–9, findings, live checks, integrator handoff, W2-D1/W2-D2)
cda968d9 docs(plans): dropbin guide Result and audit status — wave 2 code phase (steps 2–9, standalone findings)
f7bebf9e test(dropbin): attunement repair end to end and clear() (coverage gaps)
34e74e6c refactor(dropbin): a hot re-import runs the ready handlers through the kit guard too
b2320f94 fix(dropbin): [declared] clear() goes through the ledger queue (§5.9 review)
85f4353f docs(dropbin): README in use-doc order, Item Piles touch points, CHANGELOG (step 9)
6273d1e7 refactor(dropbin): planLockSounds reads pile flags itself (the getFlag override is gone since -23)
4fa0b17a docs(dropbin): the restoring option is a tag with no consumer (items-journal-27, kept)
314f49c3 perf(dropbin): [declared] coalesced ledger writes, a debounced JSON mirror, the ledger size at ready (items-journal-19)
c62da821 perf(dropbin): [declared] the corpse eye redraws its disc only on a size change; no sync timers off the active GM (items-journal-30)
bae36010 perf(dropbin): [declared] ready backfills on the active GM only, actors in one batch (items-journal-25)
eff44a40 perf(dropbin): the Journal sidebar filter walks the scenes' notes once per render (items-journal-24)
4d96d3a8 fix(dropbin): [declared] Item Piles' pile data is read as plain flags, never getFlag (items-journal-23)
9f43f573 fix(dropbin): [declared] an unrecorded ledger entry is one warning, never an unhandled rejection (items-journal-21)
a3b44685 fix(dropbin): [declared] ledger appends are serialised (items-journal-18, step 8, D-D2)
a1b0ff01 refactor(dropbin): user-facing strings in lang/en.json, full-key literals through _loc (step 7)
dfb48eb1 docs(plans): wave 2 report — bridge review fixes, dnd-roller-flock, and W2-B3/W2-B4 for Joe
3fff41d0 fix(dnd_roller): one draw at a time across server processes — flock + re-read under it [declared]
0ac333a2 feat(dropbin): list(n, {brief}), restoreResult, inspect(ref), selftest (items-journal-28, additive)
500f33a0 feat(dropbin): [declared] API through the manifest, published via the kit at ready (D2, D-D1)
146aefce refactor(dropbin): [declared] every hook handler reports through the kit guard
4ef64cd7 refactor(dropbin): ledger and itempiles features, install(reg, ctx) everywhere; the entry wires only (step 5)
8eb60589 refactor(dropbin): piles.mjs and socketlib-adapter.mjs — every game.itempiles / socketlib touch (step 4)
27829537 refactor(dropbin): settings.mjs — SETTINGS store rows, readLog, writeLedger, clearLog (step 3)
1e4214c2 refactor(dropbin): ledger-core and the dropbin-core barrel; MODULE defined once (step 2)
931203a5 Merge branch 'fix/playtest-2026-10-11' into migrate/wave-2
160a65d9 fix(journal): lastReason() is cleared when add() starts, so a thrown add leaves no stale reason (items-journal-35, review)
6921b931 test(journal): the bar's open click looks up the journal once — a counter for items-journal-33 (3) (review)
0de8e537 docs(plans): journal Result and wave-2 report list the review fixes and D-J6
8b8c905f docs(plans): record journal's §5.9.4 hits outside -40 — createUser/ready two-tab duplicate, sequential ensureAll (review, W2-J4)
bfca9429 docs(plans): MCP fork guide Result — wave 2 fork lane (F0–F23, declared changes, deviations, deploy steps)
2b908397 docs(plans): journal's step-9 handoff moves the README Files table row with journal.css (review)
d2181a79 docs(journal): the D-J5 live check and Data-written row expect an empty claims.ensure, not an absent flag (review)
5df878a6 fix(journal): [declared] inspect maps an Actor or Token to the player whose character it is, so the root inspect carries no BAD_ARGS (review, D-J6)
1a541b5a test(walls): the busy-lock tests settle every action they start and always restore ChatMessage.create
5bba28f2 test(walls): the doc-path guard walks every module source instead of a hand list (senses-walls-cursors-8 recipe)
6f963277 docs(plans): walls standalone pass — -8 recipe test d19cb73d; every other standalone finding already applied
d19cb73d test(walls): every doc path the module cites resolves; module.json's playbooks/ ref is a Wave 7 todo (senses-walls-cursors-8 recipe)
37e72e16 docs(plans): walls handoff replaces the wave-1 description ledger row instead of adding a second target
a63d043d docs(plans): walls Wave 7 steps flip the frozen core.test FLAG_SCOPE pin in the same declared commit
fb6df148 docs(plans): walls Result names the two review follow-ups (3ea5249b, b24f6db5)
b24f6db5 fix(walls): describe() names the stamp reads under both scopes and undo's deletion of each
3ab081ca fix(attunement): stash()'s audit line carries the copy ids and by, per the playbook's audit-line shape (items-journal-10 remainder) [declared]
3ea5249b fix(walls): a Levels scene reports js, the backend that ran, not wasm (senses-walls-cursors-2 follow-up) [declared]
2d9e2bf6 docs(plans): attunement Result hands the stash audit line (7cf1a4f1) to the live test as console-only
3aa19635 docs(plans): attunement standalone pass — -10 audit line, -17 parity check, -12 report() half not added (frozen golden)
7cf1a4f1 fix(attunement): a successful stash() logs one audit line with the count, container and names (items-journal-10 remainder) [declared]
6402b3fb test(attunement): the README API table names every manifest row (items-journal-17 optional check)
9fcb678a docs(plans): movement Result Tests row counts 167 node:test cases after the 8f2ede50 refresh read counter
e0e2dd40 test(lookup): books names() and spellList() make the oracle's getIndex reads, not just the test's replica (prompts-lookup-6 follow-up review)
b7ac843f docs(plans): wave 2 report — journal section, kit gap, Open for Joe W2-J1..J3
7d17df5d docs(plans): journal wave 2 — guide Result, declared D-J4/D-J5, audit status
0d55bb39 docs(plans): wave 2 Open for Joe W2-A2 — attunement stash() shortfall: name the left copies or roll them back
e4a7e22c docs(plans): attunement Frozen-tests line also names run.mjs (LEGACY emptied) and the kit 1.0.2 test/kit re-vendor
b026eff4 docs(plans): movement standalone pass — -19 refresh follow-up recorded, -20's optional status().errors to Open for Joe (W2-MOV-1)
73180dfd fix(attunement): stash()'s shortfall rejection names the copies left in the container (items-journal-10 follow-up) [declared]
a3731712 test(journal): the player's side of the relay — refused, timed out, no GM (hardening)
8f2ede50 perf(movement): refresh() reads policy, wish and combats once for all its rules (aoe-movement-portals-19 follow-up)
9b1dc46e fix(attunement): selftest() reports a throwing tooltips read as a failed check instead of throwing [declared]
c6afb4e3 docs(plans): lookup audit status and Result row record the prompts-lookup-6 follow-up commits
79155a74 fix(journal): a claim stamp that cannot be written falls back to the direct path (items-journal-40 hardening)
60acbd2a docs(plans): bridge plan Result — name the commit behind the branch's pre-existing adjustments-registry red
36a4fdfe docs(lookup): every pack id lives in a core table; the core header names the real adapter (prompts-lookup-6 follow-up)
b615d9d8 docs(journal): README in blueprint order, CHANGELOG (items-journal-37, mcp-fork-24, guide step 8)
22052ca3 refactor(lookup): monsters()' default packs become the MONSTER_LIST_PACKS table (prompts-lookup-6 follow-up)
97527b53 docs(plans): movement Result records the module-index red range from walls d06f77ab, not 25c81ef9
7b4fdc24 docs(plans): movement Wave 7 afterSync is the config.py tuple verbatim, and the tuple goes in the same commit
7c344299 docs(plans): wave 2 bridge lane python half — Result rows in tooling-lane.md and the bridge plan
de4b68ec refactor(lookup): names() grouping and its pack table move to core (prompts-lookup-6 follow-up)
44aaf277 docs(movement): README Events lists both publish hooks, pentaryn-movement.ready and pentaryn.ready
a45cc10d refactor(lookup): spellList's per-pack grouping and dedupe move to core (prompts-lookup-6 follow-up)
b4b62e29 docs(foundry): action-log paragraph and mcp-fork.md logs for wave 2 — eval-<month>, upstream writes, client, phase args, filter refusal, dnd-scripts log, eval-report
3e2d44c4 test(lookup): oracle for the spellList dedupe and names() grouping before they move to core (prompts-lookup-6 follow-up)
792f57fb docs(journal): the manifest lists the relay's claim stamp among the flags written (items-journal-40)
f97e9f74 fix(journal): [declared] one GM tab answers the ensure relay — claim first (items-journal-40, J8, D-J5)
85727ca8 feat(ops): evallog.summarise + ops eval-report + make foundry-eval-report
d8bfe157 test(journal): two GM tabs answering one ensure make two journals — KNOWN items-journal-40
a5f9e57b docs(plans): walls wave 2 — guide Result, audit status, wave-2 report section and three Open-for-Joe rows
5b79802c fix(journal): [declared] the player relay goes through the kit's relayed (C30, D-J4)
f4553b7b docs(plans): lookup audit status and Result row stop overclaiming prompts-lookup-2 and mcp-fork-20
74922db2 fix(lookup): cache only locked book packs; an unlocked pack is read every call (DL5 review) [declared]
cac07643 perf(journal): [declared] cache which journals a scene pin opens (items-journal-38, D-J3)
f1aeff07 feat(mcp): dnd-scripts per-call action log under PENTARYN_MCP_LOG_DIR
e6ffa3c7 docs(walls): README and CHANGELOG name the dual-scope read and the dormant migration
048eca8d feat(walls): the Wave 7 flag-scope migration, designed and tested, dormant (guide step 10, B6)
d595451e perf(journal): [declared] memoised sanitize per page; item updates refresh only item bars (items-journal-33, D-J3)
cc2a9570 test(mcp): pin the tools/call worker's JSON-RPC payloads before the action log (python-tooling-29)
ea0d3d2c perf(mcp): discovery parses only scripts that mention MCP_; skips are counted, not listed
90efd463 refactor(walls): read stamps under the module scope and the legacy one (guide step 10, read half)
a2dcc79e docs(plans): attunement migration Result and audit status (wave 2)
0fe84b85 feat(journal): per-user reads for an LLM caller — inspect, entriesOf, statusFor, lastReason (items-journal-35)
6ecdaf43 test(mcp): characterise discovery on the repo; pin the parse-everything cost and the full skip list (python-tooling-27)
7b31644a docs(plans): wave 2 report — Open for Joe W2-A1, attunement's coin-purse double pay with two GM tabs
49f1f2eb docs(walls): README in the blueprint order, a use-doc for drawing and running, a CHANGELOG (C44, C45; senses-walls-cursors-8)
e1062a2b docs(scripts): dnd-scripts tool contracts — annotations, error channels, the owned books [declared]
26e9df02 feat(journal): a console breadcrumb for every add that writes nothing (items-journal-36)
10459870 docs(attunement): README in the blueprint order, CHANGELOG, entry header is a file map (items-journal-17, C44, C45)
8b4cfb56 docs(plans): movement guide Result and audit status — wave 2 migration, finding → commit
8bce2b4a refactor(journal): the bar's strings use core.escapeHTML (items-journal-32)
df3a47ac fix(scripts): actions DB writers take a file lock [declared]
946a6dd4 test(journal): api.test — describe/surface goldens, core names, refusals, selftest, uninstall (guide step 6, C28, C40)
b54556d1 fix(attunement): the bond is cleared with _del, not the deprecated -= key (v14 hygiene) [declared]
1d2d196b feat(walls): canonical(r, {extended}) shows what compare() is blind to (senses-walls-cursors-3)
7e18a834 fix(attunement): stash() refuses to delete the originals when the container dropped a copy (items-journal-10) [declared]
dbd56638 feat(journal): [declared] API from the manifest, published at ready via the kit (D2, D-J1, guide step 6)
a7963405 test(attunement): pin stash()'s delete-without-copy failure (KNOWN items-journal-10)
989d4d25 docs(plans): lookup migration Result row and audit status — 97.7 %, ids → commits
08c498bb feat(walls): analyze(), a side-effect-free read of a scene (senses-walls-cursors-33)
b1046cad test(movement): ghost-back table reads NOTIFY_BACK, so the i18n gate sees no partial key
a3941fb6 style(attunement): the counter and away-tooltip classes move under the module prefix (C37) [declared]
09412de5 fix(scripts): roll_dice draws under a threading.Lock; httpx client per call [declared]
a230bf69 test(attunement): api.test with the describe and surface goldens (C28, C40)
f06a6b90 feat(walls): the ready line says why wasm is unavailable (senses-walls-cursors-37) [declared]
0b1910cc fix(movement): the ghost-back toast names why ghost is allowed now (F-M2, D-M4, aoe-movement-portals-42) [declared]
10053c27 fix(lookup): page(<non-page uuid>) says so with a warning (prompts-lookup-5) [declared] DL4
0ae5b96d fix(walls): one run at a time for every caller; chat cards awaited and their failures logged (senses-walls-cursors-9) [declared]
93dc1a56 refactor(journal): personal and bar features, a wiring-only entry (items-journal-36 part, guide step 5)
7db966e4 fix(attunement): safe()'s default logger writes a prefixed literal line (C25)
a9f32f7e perf(movement): ghost context cache for the per-token paths (F-M1, aoe-movement-portals-19)
91ee5c9d fix(lookup): guard the spell-list registry options read (step 13, prompts-lookup-4) [declared] DL3
d7a8ae2f feat(attunement): API through the manifest, published at ready via the kit (items-journal-16) [declared] publish via kit (D2)
b98745c1 perf(lookup): cache the book packs per session with their plain text (step 12, prompts-lookup-1) [declared] DL5
ab859b4c fix(walls): the wasm backend hands Levels scenes to the js engine (senses-walls-cursors-2) [declared]
586eeb1b fix(ops): bridge.scan guards ppid and reads ps once [declared]
01de2ae2 fix(walls): undo() reads run stamps as plain data and works (senses-walls-cursors-1) [declared]
1b5ec2a5 docs(movement): README in blueprint order, CHANGELOG (guide S7; aoe-movement-portals-37, -23)
6931c7c7 test(ops): characterise bridge.scan on a canned process table; pin the malformed-ppid raise and the per-parent ps (python-tooling-37)
90d294e0 docs(lookup): README in use-doc §7 order with the API returns table; CHANGELOG (step 11, prompts-lookup-26, C44, C45)
e1adc21c fix(attunement): a failing tooltip-guard install no longer blocks the API publish (items-journal-39 b) [declared]
b3d69dbb feat(movement): status({ sceneId }) and the settings key map (aoe-movement-portals-23) [declared]
03f417f0 perf(attunement): one computeSlots per sheet render; away entries indexed once per strip (items-journal-13)
cb3ce91f perf(walls): hot obstacle scans walk segs in place; coll2 hoisted out of F1 (senses-walls-cursors-5)
25c81ef9 feat(movement): API through the manifest, published synchronously at ready (guide S6, D-M2) [declared]
9bb8d560 refactor(journal): sources-adapter.mjs — targets, descriptors, Item Piles lookup (guide step 4)
526d1aa8 fix(journal): core visibility rules read their facts lazily (step 2 follow-up)
0d0c2199 fix(attunement): strip listener failures are logged with a label (items-journal-11, listener half) [declared]
c77d1e21 refactor(walls): one segment-construction path in the engine (senses-walls-cursors-6)
f0f70ea8 test(lookup): convert the legacy fixture suite into core.test.mjs cases; LEGACY = [] (step 10)
578cada0 docs(plans): wave 2 bridge lane build plan — D14 pentaryn-read/-write, the fork's parallel findings, the MCP tooling lane
2afb4d4b feat(lookup): GM-guarded queries for the eight read-only lookups, registered at init (step 9) [declared] DL2
07920a8f refactor(attunement): hook handlers run through the kit guard (items-journal-11, hook half) [declared]
d3a07b62 test(walls): i18n test and the prepared lang file for the Wave 7 switch (C40; senses-walls-cursors-36 test first)
963acfac refactor(attunement): strip.mjs, sheet.mjs and bonds.mjs; the entry wires features through reg (step 4)
d65ddd62 refactor(movement): kit log; the two empty catches warn once (guide S5; aoe-movement-portals-20) [declared]
830f2fa2 test(lookup): remaining tier tests — hook manifest, uninstall, i18n absence (step 8, C40)
f2df3db3 refactor(journal): settings.mjs — SETTINGS rows, setting(), whenChanged() (guide step 3)
5224038e fix(walls): a failing canvas.ping is logged at debug, not swallowed (C24)
abb4ae75 feat(lookup): kit-built API — manifest, api.mjs, publishNamespace; entry 60 lines (step 7) [declared] DL1 DL2
34a4ca5a refactor(movement): split the entry into the ghost feature and a combat adapter (guide S4; aoe-movement-portals-19 structure, -22)
d06f77ab refactor(walls): actions feature, API manifest and a wiring-only entry; publish through the kit (C10, C18, C27, C28, C50) [declared]
36e3abbd refactor(walls): the core barrel imports, then exports by name (C05)
59185ac9 test(attunement): characterise the sheet strip and its listeners through the render hook
7dc5fce8 refactor(journal): core MODULE, constants and the visibility rules (items-journal-34, guide step 2)
39419daa refactor(lookup): books.mjs feature — the eight lookups move out of the entry (step 6, C18)
ef578313 refactor(lookup): trace every swallowed read at debug level, no comment-only catch (step 5, prompts-lookup-34, C24)
5f3bf2d5 refactor(attunement): actor-adapter.mjs; the tooltip guard goes through wrapMethod (items-journal-39 c)
561d0749 feat(movement): the two hidden settings get name/hint labels; re-pin settings-register.json (D-M3) [declared]
eeeeaf6a refactor(walls): the backend setting and three keybindings become SETTINGS/KEYBINDINGS rows (C21, C22)
c4b77032 refactor(movement): SETTINGS table, core constants and literal i18n key maps (guide S3; aoe-movement-portals-21, -18, -23)
9c1a1a68 refactor(lookup): packs-adapter.mjs — every Foundry read behind one file; toBook and foundFromDoc seams (step 4)
676a98de test(attunement): the legacy slot suite runs on the core under node:test (step 2b)
e2520d57 docs(walls): the fixture corpus cites the plan at its real path (senses-walls-cursors-8, code half)
28dd5667 test(walls): the placeholder guard no longer matches its own source
9b37264b refactor(walls): drop the stale WASM_STATUS placeholder; bench says why wasm is missing (senses-walls-cursors-7) [declared]
b1ff1cde refactor(attunement): attunement-core.mjs, the pure half (items-journal-8, -9, -10, -12, -14)
3d0daef9 refactor(walls): engine and registry move to core/ behind the barrel; one wall-category rule (senses-walls-cursors-4)
5482317b refactor(movement): patches through the kit's wrapMethod/defineAccessor with adjustments ids (guide S2; aoe-movement-portals-17, -18)
de35515f refactor(walls): constants and pure report helpers into the walls-core barrel (C11, C12)
0e5d1f95 refactor(lookup): pure moves into lookup-core — identity, pack tables, monster query, spell-list helpers (step 3)
3ac7efba chore(movement): vendor kit patch.mjs for the wrapMethod step (guide S2)
0412589a test(lookup): pin today's inline monsters() logic as the step-3 oracle (prompts-lookup-6)
b541e412 docs(plans): wave 2 report — step 1, kit 1.0.2 (J6, J10, J16)
3d044626 refactor(walls): retire the frozen-root guard copy in publishAPI (J10) [declared]
e6b66580 refactor(lookup): retire the frozen-root guard copy in publishAPI (J10) [declared]
47120a6d refactor(prompts): retire the frozen-root guard copy in the deferred publish (J10) [declared]
7cacec51 refactor(dropbin): retire the frozen-root guard copy in the deferred publish (J10) [declared]
6e94901e refactor(journal): retire the frozen-root guard copy at ready (J10) [declared]
fd564cc5 refactor(attunement): retire the frozen-root guard copy at ready (J10) [declared]
494b713d refactor(movement): retire the frozen-root guard copy at ready (J10) [declared]
de2dad7a refactor(ties): retire the frozen-root guard copy in publishAPI (J10) [declared]
873dab7b chore(prompts): re-vendor kit 1.0.2
a2274877 chore(dropbin): re-vendor kit 1.0.2
1fcbb7cb chore(journal): re-vendor kit 1.0.2
79977983 chore(attunement): re-vendor kit 1.0.2
bf640386 chore(walls): re-vendor kit 1.0.2
1241a405 chore(movement): re-vendor kit 1.0.2
51695e7d chore(lookup): re-vendor kit 1.0.2
d0948f91 test(ties): drop the local logger stub, now in the kit (J6)
ac307386 chore(ties): re-vendor kit 1.0.2
9fd2b39d chore(importer): re-vendor kit 1.0.2
2a55cef3 chore(cursors): re-vendor kit 1.0.2; frozen-root pin flipped (J10) [declared]
f805bb63 chore(pings): re-vendor kit 1.0.2; frozen-root pin flipped (J10) [declared]
993677e3 chore(names): re-vendor kit 1.0.2; frozen-root pin flipped (J10) [declared]
822a97c1 chore(kit): bump the kit to 1.0.2 (J6, J10, J16)
8f9ee627 refactor(kit): retire publish.mjs's frozen-root guard and realiasTick (J10) [declared]
fa449fd3 docs(plans): wave 1 play-test fixes record, live checks and deploy list
6d8f0f22 fix(kit): wrapMethod/defineAccessor unwrap() drops the kit's record (J16) [declared]
70edea2e docs(context): regenerate module index for fix/playtest versions
c69104f3 test(kit): Foundry test stub defines globalThis.logger (J6)
f3cca84d fix(transform): PT3-3 review — synthesized Return only in a Wild Shape form, not a Polymorph spell's
8b7f1bd7 docs(plans): wave 2 baseline
0b3bd4f5 chore(transform): 0.3.3 — play-test fixes PT3-3/4/6/7 documented
42365fed fix(transform): PT3-7 — a sheet or sidebar revert posts the 'returns to normal form' line
eafeb4bc docs(prompts): playbook names the PT2-2 slots clause and PT2-5 'same as' description
bc4e1f4b fix(transform): PT3-6 — Escape closes an open Change Form / Starry Form picker
89d8fbb4 fix(transform): PT3-4 — Starry Form stays out of beast forms and off the shifted Bonus bar
a6bd2f97 docs(plans): dropbin guide records the PT3-1 re-pile guard
a9084088 fix(transform): PT3-3 — synthesized 'Return to <druid>' on the Bonus bar when the form has no revert item
938c43ed fix(dropbin): PT3-1 review — a re-piled corpse keeps its saved pre-death ownership
f05a289b test(transform): node:test glue file on the shared stub; run.mjs runs test/*.test.mjs
82a0524a docs(plans): names guide notes PT3-9 fixed on fix/playtest-2026-10-11 (0.1.1, live smoke version)
3043e077 chore(prompts): 0.4.4 — play-test fixes PT2-2 and PT2-5
db9e94fe docs(plans): combat guide line refs follow PT1-6's 15-line shift in combat.css (:187 -> :202)
99102603 test(combat): PT1-6 fixture 383 pins the subtitle's max-content width and centring translate
047890a4 docs(pings): PT3-2 changelog — the remote-ping bug predates wave 1, not a regression
447697de fix(prompts): PT2-5 — gather prints one description per actor
7eb14f09 fix(prompts): PT2-2 — a new character starts with full spell slots
6ce6ad65 docs(names): PT3-9 — README and CHANGELOG for the combatant relabel (0.1.1)
8a8a2d5e docs(plans): dropbin guide notes PT3-1 fixed on fix/playtest-2026-10-11
f57cd997 fix(names): [declared] PT3-9 — a rename also relabels the actor's combatants (GM only)
5277d616 test(names): fixture game.combats (empty by default) for combatant cases
ed025704 fix(dropbin): PT3-1 — a revived corpse gives back its delta ownership
7a8701df fix(pings): PT3-2 — record remote pings from core v14's userActivity payload
7e675f30 docs(plans): combat guide notes PT1-6 fixed on fix/playtest-2026-10-11
d7a7c7b6 fix(combat): PT1-6 Full Attack tooltip subtitle wraps instead of being cut at both edges
a18872c9 test(pings): [declared] PT3-2 — socket pins use core v14's userActivity payload
466a3a4f test(pings): PT3-2 repro — a remote ping in core v14's userActivity shape
```

</details>

<details><summary>All fork commits</summary>

```
213c6c3 docs(fork): pentaryn-read's description names ties, combat, prompts as eval-js only, not rules
d77c496 chore(fork): fork: markers on every new upstream hunk; index.ts, add-feature.ts, data-access.ts in the marker table
7f6680a docs(fork): FORK.md settings.ts row is one row again
9c845d1 fix(fork): the recharge outcome rides on the add-feature line — one ActionLog, with client [declared]
81f8bb4 fix(fork): recharge resolves its actor exactly; an itemId never falls back to a name [declared]
b8f540f fix(fork): a coded query error keeps its code through pentaryn-read/-write [declared]
a6fb891 fix(fork): pentaryn-read/-write refuse a call that needs a live Document [declared]
a79f5f3 fix(fork): pentaryn-read runs only rows that declare writes:false [declared]
6f598fb fix(fork): pentaryn-write refuses dryRun on a row without a dry run [declared]
d5ba3c4 test(fork): D14 template tests run the eval on fake timers; no timer left after a call
442e74b chore(fork): 0.8.3-pentaryn.2 — CHANGELOG, version strings
01222a9 feat(fork): pentaryn-write
20841db feat(fork): pentaryn-read
09537bd feat(fork): pentaryn-call — one eval template that routes on describe()
3875d2c fix(fork): recharge applies through a typed fork query; token ids resolve [declared]
c200fad test(fork): characterise dnd5e-add-feature's recharge before it moves
0a7441a refactor(fork): prompt-markers schemas in prompt-markers.schema.ts; one SIZES, InlineItem, Disposition
6723685 test(fork): characterise the prompt-markers schemas before the split
6f2c6e0 perf(module): legacy dnd5e movement keys are one module-scope Set
e5fc5b6 test(module): characterise removeSensitiveFields' dnd5e legacy-key filter
4727fcf fix(module): fork GM guard throws coded NOT_GM errors [declared]
506415b fix(module): upstream bridge queries refuse a non-GM sender [declared]
16a33d1 fix(module): eval timeout timer is cleared; a timeout says timedOut [declared]
552d222 refactor(module): serialize() to src/fork/serialize.ts with SERIALIZE_LIMITS
ad25af5 test(module): characterise serialize() before it moves
4b52c80 docs(fork): eval-js description states the serializer rules and game.pentaryn
0909494 fix(fork): tool-list key hashes name, description and inputSchema [declared]
a666102 refactor(fork): wrapper tool-list poll moves to src/fork/tool-list-watch.ts
2457e18 fix(fork): FOUNDRY_MCP_TOOL_FILTER blocks calls, not only listings [declared when the filter is set]
6500710 feat(fork): upstream write tools reach the action log
4e9b031 feat(fork): client {pid, ppid} on every action and eval line
c1e9103 fix(fork): prompt-markers logs the expanded specFile spec, not the path
b628500 fix(fork): an eval-js call rejected for bad args leaves a phase:"args" eval line [declared]
745c0fd fix(fork): failed evals log ok:false; logArgs hook keeps scripts out of the action log [declared]
c2fd036 fix(fork): eval log rotates monthly — eval-YYYY-MM.jsonl [declared]
b6afb9e fix(fork): action-log month computed at write time [declared]
74d9de8 refactor(fork): one ActionLog for the action and eval streams
5b9e3bd test(fork): characterise the action log and the eval log before the ActionLog refactor
f9492e4 refactor(fork): type the tool contract — WriteFlag, ForkToolResult, handler meta
a97be99 test(module): vitest for packages/foundry-module
6a52673 docs(fork): comments say what is there; CHANGELOG npc line corrected (mcp-fork-23, mcp-fork-19)
6e8c607 fix(fork): footprint script reads FORK.md rows whatever their padding
071645f docs(fork): FORK.md upstream footprint table and scripts/fork-footprint.sh (mcp-fork-11)
```

</details>

## Open for Joe

Decided rows say so in the last column; every row marked `open` is still waiting for Joe.

| # | Item | From | What is needed | Decided |
|---|---|---|---|---|
| W2-K1 | J10's "other modules' guard copies": retired in every module that carries the kit (above). The seven unmigrated modules still carry theirs: creatures, transform, riders, senses (two: `senses.mjs`, `chain.mjs`), aoe, combat, portals. Live it is dead code (nothing freezes the root). Each guide already replaces the block with `publishNamespace` at migration, and riders/aoe/transform/combat are WAIT (in flux), so editing them now risks conflicts with that work. | kit bump | confirm "retire at each module's migration" (default), or ask for one [declared] commit per module now | open |
| W2-B1 | python-tooling-28 adds two **new** dnd-scripts tools (`foundry_modules`, `foundry_action_log`). The wave rule is "no new features except the approved bridge tools", and the audit itself calls -28 a possible deferred feature. The bridge plan's P7 (`evallog.py` + `make foundry-eval-report`) answers the same questions from the shell. Plan: [`wave-2-bridge-plan.md`](wave-2-bridge-plan.md) §4 P8. | bridge lane plan | yes → P8 lands (read-only, additive); no → close -28 by pointer to P7 | open |
| W2-B2 | D14 compact read lines (`{ts, tool:"pentaryn-read", ns, path, ref, ok, ms}`) go into `mcp-<YYYY-MM>.jsonl` beside the write lines, told apart by `tool` and the absence of `args`, rather than a third log file; the monthly review and `evallog.py` already read that file. Plan §3.5. | bridge lane plan | confirm, or ask for a separate `reads-<YYYY-MM>.jsonl` (one-line change in F21 and P7) | **Confirmed** (Joe, 2026-10-11): keep reads in `mcp-<YYYY-MM>.jsonl`; no reason to separate them now |
| W2-A1 | New concurrency finding in pentaryn-attunement (not in the audit): the `createItem` bond return is gated on the initiator (`userId === game.user.id`), which passes in **every tab** of that user (playbook §5.9.4). With the MCP bridge tab and a GM browser tab open, a GM-made Take of a bonded **coin purse** runs `actor.update(currency + purse)` in both tabs and can pay twice (and `item.delete()` twice); the slot hand-back writes the same values from either tab, so only its toast can double. Recorded in the attunement README (Two sessions); no pin. | attunement lane | fix now as a [declared] commit (vendor kit `election`, `claimMessage`-style claim on the purse item before paying; the purse deletes itself, so a single-use claim key fits), or accept and leave it documented | Decided (Joe 2026-10-12): fixed `fa7212a8` on `fix/overnight-2-2026-10-12` (tests and pin flip `3aa746e2`, kit `election` vendored `502554ea`; claim key `coinBack`). attunement stays 0.2.1; the bump rides the wave 5 restart batch |
| W2-WALLS-1 | walls i18n switch (-36) and the setting-hint fix (-8): the `SETTINGS`/`KEYBINDINGS` labels become `PENTARYN_WALLS.*` keys only together with `module.json` `languages`, and that edits one **frozen pin** (glue (a), the `settings.register`/keybinding label values), as pings needed in J13. The keys and text are ready and tested (`test/fixtures/lang-en.wave7.json`). | walls lane | allow that one pin edit in the Wave 7 batch (a [declared] commit), or leave walls' labels in literal English (C51 stays failing) | open |
| W2-WALLS-2 | walls cross-tab overlap (§5.9, new, not in the audit): the run lock (-9) is per tab. With the MCP bridge tab and a GM browser tab both open, a `run()` from the bridge while Alt+W runs in the browser could complete the same scene twice (duplicate walls; each run is still undoable on its own). Excluding across tabs needs a new mechanism (a scene-flag lease or claim). | walls lane | accept and document (default; walls is off), or ask for a lease as a [declared] fix | open |
| W2-WALLS-3 | walls toasts stay raw `ui.notifications.*`, not `log.notify`: the frozen glue pins match the exact options (`{permanent: true}`), and `log.notify` adds `{console: false}` and a console line. | walls lane | accept, or allow the pin edits with W2-WALLS-1 | open |
| W2-MOV-1 | movement finding -20's **optional** extra: `status().errors`, the labels a hot hook's `warnOnce` has swallowed (`refreshToken`, `renderSceneControls`), appended after `settings`. The finding's required half (warn once, no empty catch) is `d65ddd62`. It adds an API output key (`status.test.mjs` pins the exact key list) and the kit `log` exposes no seen-labels accessor, so it needs either a kit change or module-local tracking; the console line already says it. Skipped as a feature. | movement lane (standalone pass) | yes → one [declared] commit (module-local Set, one pin flip in `status.test.mjs`), or close: the console line is enough | open |
| W2-A2 | attunement `stash()` shortfall (D-A4, items-journal-10 review follow-up, 73180dfd): the originals are kept and the call rejects, but the copies the container did accept stay there, bonded to the owner, so the item exists twice. The Error now names them (`err.created` and the message); nothing is rolled back. A rollback (`container.deleteEmbeddedDocuments(created)` before throwing) would restore all-or-nothing, but it deletes from a container (an Item Piles pile may react to emptying) and can itself fail. | attunement lane | keep naming only (default), or ask for the rollback as a [declared] commit | Decided (Joe 2026-10-12): fixed `f3fa49bd` (+ `279dbd86`, the log line's prefix) on `fix/overnight-2-2026-10-12`, pins flipped in `ca82811f`; the Error keeps `err.created` and adds `err.rolledBack`. attunement stays 0.2.1; the bump rides the wave 5 restart batch |
| W2-J1 | journal `folderName` has no settings label, so C51 fails. Adding `PENTARYN_JOURNAL.settings.folderName.{name,hint}` (the guide's step 3) moves one **frozen pin**: `golden/settings-register.json` (`name`/`hint` null → the keys), as pings needed in J13. The row is `config: false`, so nothing visible changes. | journal lane | allow that one pin edit (a [declared] commit), or leave `folderName` unlabelled (C51 stays failing) | open |
| W2-J2 | journal C56 after the kit gap is fixed: `registerQueries` resolves a query row against the published API, so the relay needs a **published method** returning `{entryId}` (the frozen relay pin) — e.g. a row `ensureOwn` (`queryName: "ensure"`, `relay: true`, `query: true`; the query name the player sends is unchanged). That is a new API member. | journal lane | accept the new member once the kit forwards the sender, or keep the hand-wired `relayed` (C56 stays failing) | open |
| W2-J3 | journal -40 is fixed claim first, but not with `lib/election.mjs`: `claimDocument`'s 750 ms settle timer would hang the frozen single-tab relay pin under mocked timers, and its claim key is single-use per document while the sender's User is long-lived. The fix stamps `flags.pentaryn-journal.claims.ensure.<socketId>` on the sender's User; the first stamp in server order wins (a tab gets every earlier stamp before its own reply), the loser waits up to 7 s for the winner's journal and answers with it, each tab removes its stamp (its own key only: `claims.ensure` stays as an empty object, so the D-J5 live check looks for no socket-id keys, not for an absent flag). One extra User update per player's first relayed ensure. | journal lane | accept (default), or ask for the deterministic-`_id` alternative (§5.9.2; it needs a folder `_id` too and moves the frozen relay create-data pin) | open |
| W2-J4 | journal §5.9.4 hits outside items-journal-40 (review; the audit scoped them out, `code-audit-2026-10/journal.md` -40 last paragraph): (a) the `createUser` listener and the ready `ensureAll` (`personal.mjs` `install`) create a JournalEntry, and maybe the `Player Journals` Folder, behind only `game.user.isGM && game.users.activeGM?.isSelf` — true in **every tab** of the GM account — while `gmInflight`/`folderInflight` are per tab. With the MCP bridge tab and a GM browser tab open, a new User gets **two** personal journals (and two folders when the folder is missing); the same when both tabs reach `ready` together after a restart while a player has no journal. Duplicates stay visible in `report().users[].duplicates`; `personal()` uses the oldest, so nothing breaks, but the player owns a stray journal. (b) `ensureAll` awaits one `ensureFor` create per player in a loop (the C59 pattern; C59's scan misses it because the `await` is on `ensureFor`). Not fixed in this wave: every remedy moves a **frozen glue pin** — `glue.test.mjs` pins `createUser` creating at once and `ensureAll` as one `JournalEntry.create` per player. Remedies: createUser → `claimDocument(user, "journal")` (fits: a new User is a one-time event, so the single-use key is right; the 750 ms settle delays the create); ready → deterministic `_id`s (journal `_id` = the user's id, a fixed folder `_id`, `keepId`, look first; §5.9.2) — this also covers createUser; (b) → one `JournalEntry.createDocuments` for every missing player (folder first), keeping `gmInflight` for the per-user path. | journal lane (review) | fix as [declared] commits (one per remedy, each flipping its named glue pin), or keep the audit's out-of-scope decision (default: accept and document; duplicates are reported, not lost) | open |
| W2-B3 | Kit row field `dryRun: true` (in the `ApiRow` typedef and `describe()`), so a row says it takes a dry run. pentaryn-write already honours `row.dryRun === true`; until the kit emits it, the template accepts a dry run only on a row whose param type or doc names `dryRun` (importer.import today), and refuses it elsewhere (`6f598fb`). | kit lane (bridge review) | yes → kit bump adds the field and importer's row sets it; no → keep the param-text rule | open |
| W2-B4 | `names.sync(ref, oldName, newName)` resolves a string ref itself (its row doc says so), but its `ref` param is `resolve: false` with no `type`, so pentaryn-write now refuses it as "needs a live Document — eval-js only" (`a6fb891`). A row needs a manifest signal that it resolves strings itself: either a kit field (e.g. a param `resolve: "self"`), or now, with no kit change, a `type` naming the string forms on that param (`"Actor\|Token\|uuid\|id\|exact name"`, as attunement's ACTOR param has), which the template already honours. The second edits names' `describe` golden. | kit lane / names (bridge review) | pick one; until then names.sync goes through eval-js | open |
| W2-D1 | dropbin corpses, §5.9.4 (not in the audit): corpse conversion (`sync` → `toCorpse`/`fromCorpse`), the hp hook's Dead toggle on revival, the ready `migrateLegacyEyes`, and the ready backfills (`ensureLockSounds`, `ensureEyesNeedView` — items-journal-25; idempotent, so both tabs send the same batches and both log) run where `game.users.activeGM.isSelf` — **every tab** of the active GM account. With the MCP bridge tab and a GM browser tab open, a kill runs `turnTokensIntoItemPiles` and the corpse update in both tabs (each debounced 150 ms per tab); Item Piles' second conversion and the second `revertTokensFromItemPiles` race the first. Expected outcome is the same corpse (both write the same flags; the PT3-1 re-pile guard keeps the saved pre-death map), but it is unverified live. A fix needs a per-tab election (a `claimDocument`-style claim on the token per death, or the kit `election` with a socket-id tie-break). | dropbin lane | accept and watch in L3 (default: look for doubled "corpse sync failed" warnings or two chat cards), or ask for a claim as a [declared] fix | open |
| W2-D2 | dropbin ledger, §5.9.4: socketlib's `executeAsGM` reaches every tab of the responsible GM user, so a player's relayed entry is recorded by both tabs. Both compute the same row (same `t` from the sender, same `n` from the same synced counter) and the tail dedupe catches the sequential case, so the ledger ends the same; the mirror is uploaded twice. Only a different entry recorded in one tab at the same instant could interleave and lose a row (each tab writes its whole log). Request-keying (a sender `req` id in each entry, dedupe on it) would close it but adds a field to every stored entry (a stored-shape change). | dropbin lane | accept (default), or ask for request-keyed entries as a [declared] change | open |
| W2-L1 | walls is switched off in Joe's world, so its "before" live golden (`scripts/foundry/live-goldens/walls.js`) cannot run on the deployed 0.2.0 code. Syncing walls now would leave no before/after comparison for its four declared fixes (undo, the run lock, Levels to js, the ready line). [`wave-2-live-plan.md`](wave-2-live-plan.md) §9. | live-phase prep | hold walls' sync until Joe re-enables walls, then before → sync → after (default), or sync it with the others now on the unit goldens alone | **Joe (2026-10-11): walls stays switched off on purpose.** It was migrated and unit-tested but never live-tested; do not sync or live-check it. Noted in the walls guide Result and in [`context/pentaryn.md`](../../pentaryn.md) Left out. No code. |
| W2-L2 | The wave-2 branch also changes modules outside the six: names, pings, cursors, importer, ties, prompts (kit 1.0.2 re-vendor, J10 guard retired; names/pings/prompts also carry the merged play-test fixes) and transform, combat (play-test fixes only, `931203a5`). They need the same restart. [`wave-2-live-plan.md`](wave-2-live-plan.md) §1. | live-phase prep | deploy them in the same live session, with the wave-1 goldens before/after and the play-test LIVE CHECKs for transform/combat (default), or deploy only the six wave-2 modules and leave the rest to the play-test deploy | **Joe (2026-10-11): the default.** Deploy every changed module in the same restart, with before/after goldens and the play-test LIVE CHECKs for transform/combat. No code. |
