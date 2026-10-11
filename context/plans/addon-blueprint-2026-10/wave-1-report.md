# Wave 1 report (2026-10-11, branch migrate/wave-1)

**Read this when:** reviewing what wave 1 of the blueprint migration changed before merging
`migrate/wave-1`, or picking up an item that waits on Joe. This is history, not instructions. The
operating rules are in [`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md).

Scores before and after Stage 0: [`wave-1-baseline.md`](wave-1-baseline.md). The guides' `## Result`
sections hold the per-module detail.

## Summary

- **Scope:** Stage 0 (gates, kit wiring W1–W8, decisions D1–D7, scorer C53–C61), Stage 1 (the
  importer keystone plus the python-tooling Wave 1 items) and Stage 2.1–2.3 (names, pings,
  cursors). In those 4 modules the work is migrated, deployed and live-checked. Eight more modules
  (lookup, movement, walls, attunement, journal, dropbin, prompts, ties) have their kit vendored and
  a frozen characterisation **checkpoint** only; their refactor is workflow 2. Ties also has D1 and
  prompts has D6, both deployed.
- **Range:** `wave-1-base` (`c27ad71`) to `migrate/wave-1`, 163 commits before the report commit,
  counting this pass's re-anchor (`b8d8b57`) and guide Result (`05180f4`) commits. 16 commits are tagged `[declared]`. The fork branch `migrate/wave-1` adds 3 commits.
- **Scores:**

  | Module | Before | After |
  |---|---|---|
  | names | 64.1 % | **100 %** |
  | importer | 63.9 % | **97.6 %** |
  | pings | 62.2 % | **95.5 %** |
  | cursors | 53.7 % | **91.3 %** |

  Of the 15 modules not yet migrated, none dropped. Some rose because of the C53–C61 rule set and
  the kit vendoring.
- **Tests:**
  - importer, names and pings had no tests and now have 92, 45 and 59.
  - Every touched suite passes, and no frozen assertion was edited outside a named `[declared]`
    flip.
  - The full verification passed: `pytest` 832 passed, all 18 make checks green, and two flake runs.
- **Live:**
  - Every deploy passed its boot probe, and every live golden differs from "before" only by
    declared changes.
  - No timing regression larger than noise.
- **Rollback:** the names rollback drill (revert, then sync) worked. No real revert was needed.
- **Stop rules:** none fired.
- **World state at the end:** one GM tab, no player tabs, Drow Prison active and paused, no ZZ
  documents. The pings ring holds scratch records (J19).

## Commits (`git log --oneline --reverse wave-1-base..HEAD`, before this report)

**[declared] behaviour changes, each in its own commit (16):**

| Commit | Area | Change |
|---|---|---|
| `1411687` | ties | D1: rename `attributes.describe` → `lookup` and `study.inspect` → `examine`, with aliases (`!`) |
| `868103f` | prompts | D6: one `gatherChars` default of 400, and a cut mark that names the full text |
| `def324f` | ops | imports gate strips `?query` and `#fragment` |
| `bd83c80` | importer | D-I2: kit-logger console prefix (`!`) |
| `c0c3f97` | importer | D-I1: merges into `game.pentaryn` instead of replacing and freezing it (`!`, the keystone) |
| `60bef2a` | importer | D-I3: re-entrancy refusal (items-journal-4) |
| `be332cd` | ops | `install()` restores a crashed swap's `.old` |
| `5202be0` | names | N-D1: a failed relabel is logged (transform-creatures-33) |
| `7983909` | names | N-D2: `module.api` |
| `af129d1` | names | N-D3: `sync` accepts an actor ref (transform-creatures-38) |
| `ccf90c4` | names | `sync` treats a token ref as its base actor |
| `ae51bca` | cursors | C-1: API and `status()` (senses-walls-cursors-32) |
| `738f4c4` | cursors | C-2: warns once when internals are missing (senses-walls-cursors-30) |
| `284dcce` | pings | P-D1/P-D2: `module.api`, `uninstall()` |
| `f9a94bf` | pings | P-D3: `ageMs` (transform-creatures-39) |
| `8435447` | build | names and pings ModuleSpecs run node-test (C39) |

Two behaviour changes landed without the tag; see [Behaviour changes committed without
[declared]](#behaviour-changes-committed-without-declared).

<details><summary>All 163 commits, oldest first</summary>

```
42aa7ff docs(plans): agents commit often, Joe never commits, review at merge; rollback = git revert
c710622 docs(plans): wave-1 baseline - tests, checks, conformance, coverage
8a70e6f test(foundry): live golden + timing eval-js scripts for six modules
209113b docs(plans): wave-1 live goldens, timing baseline and stub-fidelity findings
72cea3a docs(foundry): note the state-dependent read-lag probe in the pings live golden
bf681f1 test(scripts): isolate the dice cache file in test_dnd_roller (python-tooling-52)
88bd90d test(lookup): vendor kit 1.0.1 (full), fixed run.mjs runs the legacy suite
11919da test(update): keep the levels exposure false positive as a strict xfail todo
304f2bd test(update): wall-height exposure via prompts' los.mjs is real, pin it
35d439b test(update): pin make_checks() and checks_for() before python-tooling-2
21c6d0f refactor(update): make_checks() derives from ops config.MODULES (python-tooling-2 step a, W5)
8d18cad test(ties): vendor the kit and add test/run.mjs over the three legacy suites
9e955e0 test(ties): characterise the D1 surface and ties-37 field-drop guards (checkpoint)
2ec084f build(foundry): blueprint tooling outside exposure; its tests in testpaths (W5)
8ad6a23 test(ties): stub Foundry's global logger in the boot fixture
1411687 feat(ties)!: [declared] D1 rename attributes.describe -> lookup, study.inspect -> examine
97809fc test(scripts): conftest fake_admin fixture and a registered repo marker (python-tooling-34)
a532b3e test(lookup): characterise glue, published surface and legacy API (checkpoint)
dda42a8 docs(plans): record D1 in the ties guide (B1b decided, aliases until S8)
034f048 docs(lookup): README drift — version 0.3.0, no fixture count, adapter size (prompts-lookup-26)
beda8e0 test(foundry): pin every module make target's recipe with make -n (python-tooling-1)
7615de6 test(movement): vendor kit 1.0.1 (full), fixed run.mjs runs the legacy suite
013b95d test(prompts): vendor the kit; fixed test/run.mjs with the old suite as LEGACY
8c4d6d9 refactor(foundry): ModuleSpec derives kit from kit.lock.json and after_sync from module.json (W2, python-tooling-3)
667456c feat(foundry): register pentaryn-pings in the ops module registry (python-tooling-3, W2)
6cc5c50 test(prompts): characterise the gather readout, readback, stripHtml, patch keys, typeahead (checkpoint)
3a5192d test(movement): characterise core, glue and hook manifest (checkpoint)
49b8554 docs(movement): README cites methods, not Foundry line numbers; setGhost is player-only (aoe-movement-portals-37)
868103f feat(prompts): [declared] D6 one gather chars default (400) and a cut mark naming the full text
9a83ba1 feat(foundry): gates return GateResult; vendor + conformance gates; check_all (W3, python-tooling-41/-8)
c8fd327 feat(foundry): ops module-new/-vendor/-conformance, module-check --all --json, status/bridge-status --json (W1, python-tooling-8/-41)
d959b66 feat(blueprint): D7 CSS kit files - vendor.py ext:css, C37/C37w exempt lib/*.css, argon-tooltip.css
566273b build(make): module pattern rules, blueprint targets, foundry-modules-check, test (W4, python-tooling-1/-8)
92ea93c test(foundry): pin prompt-marker art render hashes before the rename (python-tooling-38)
bd5b8b0 refactor(foundry): rename prompt-marker-art.py to importable prompt_marker_art.py (python-tooling-38)
61f4a32 test(walls): vendor kit 1.0.1 (full + election)
a8c5c28 test(walls): characterise engine, backends and glue (checkpoint)
30963c4 docs(walls): README drops the 44-fixture count and names the new test layout (senses-walls-cursors-8)
df661e0 refactor(adjustments): D2 non-patch rows take the package prefix; C32 enforces both halves (R1)
cbe8214 test(attunement): vendor kit 1.0.1 (full), fixed run.mjs runs the legacy suite
4a5c13c feat(blueprint): D4 C03 sees movement's dnd5e ignoreTokens (R7 movement half)
2164005 docs(plans): record D3 (names stays small + api kit file) and D5 (importer contract scope)
1ea9f37 feat(foundry): generated Module APIs index in context/foundry/README.md (python-tooling-36, mcp-fork-20, W7)
94d2f94 fix(foundry): node-test gate runs node test/run.mjs from the module folder (python-tooling-7)
f254e0c test(scripts): pin the actions validator vs build_actors grammar drift (python-tooling-45)
88f935e test(attunement): characterise oracles, glue and hook manifest (checkpoint)
885f342 docs(attunement): README drops the 31-fixture count and the ??= claim (items-journal-17)
86bc010 refactor(scripts): ROW_TYPES in build_actors; ACTION_TYPES/SLOT_REFRESH/DICE_RE exported (python-tooling-45)
050f06b test(journal): vendor kit 1.0.1 (full), fixed run.mjs runs the legacy suite
b1f31e9 test(scripts): characterise the actions DB writers (python-tooling-42/-43/-44/-46)
9417fd4 test(scripts): characterise dnd-scripts tool contracts (python-tooling-48/-49/-50)
f830067 test(journal): characterise oracles, relay, ensure, bar gating and hook manifest (checkpoint)
1b122e5 docs(journal): report() is ungated, return shapes, folderName documented (items-journal-37)
1d8a2e3 test(scripts): characterise roll_dice serial order and the concurrent hang (python-tooling-51)
6c33e7a test(dropbin): vendor kit 1.0.1 (full), fixed run.mjs runs the legacy suite
78d1416 test(foundry): characterise pipeline.stage's importer install (python-tooling-53)
58af29d build(foundry): gate pentaryn-ties on its suite, node-test in its ModuleSpec (python-tooling-7, W2)
56e75f1 docs(foundry): regenerate the Module APIs index (dropbin, journal migrated)
4b53345 test(dropbin): characterise ledger oracles, glue, locks, corpses and loot (checkpoint)
85a72fc docs(foundry): mcp-fork.md use-doc, the two query contracts, routing rows (mcp-fork-19, mcp-fork-24 doc half)
c1a80a5 test(walls): the manual corpus CLI signals failure by throwing, not process.exit
0091a00 docs(foundry): tooling README lists the module, blueprint, index and test targets
6211b4e docs(foundry): playbook §5.9 async and concurrency, wired gates (§6, §12), D2 row ids, D7 kit CSS, D1/D6 declared
4f7b5a8 docs(foundry): comment-only source fixes — movement line refs, attunement == null, walls plan path (aoe-movement-portals-37, items-journal-17, senses-walls-cursors-8)
0c01ef1 docs(foundry): handed-off routing and doc fixes — art script path, lookup fixture count, mcp-fork use-doc links, journal route (python-tooling-38, prompts-lookup-26, mcp-fork-19, items-journal-37)
fc54873 docs(plans): decisions D1–D9 status, K2/R1/R7 and W1–W8 landed, D2 row renames marked in guides and the adjustments batch
e523495 docs(plans): wave-1 report with the Open for Joe items from lanes A, B and R
4373c04 feat(blueprint): conformance C53–C61 — async and concurrency rules from playbook §5.9, with tests
6b28884 docs(plans): wave-1 baseline "after Stage 0" scores, C01–C52 and C01–C61; playbook C61 row names the initiator gate
18a2f9b docs(blueprint): drop stale 'waits for D4' sentence from packages.json doc
2c2cb0d docs(ties): README names attributes.lookup, describe as deprecated alias (D1)
4018722 docs(plans): wave-1 report records lookup suite red 35d439b..97809fc and the revert/bisect caveat
4231b30 fix(ops): blueprint wrappers dispatch before argparse so a leading --option passes through
6920ab9 fix(blueprint): C59 no longer counts *EmbeddedDocuments as a per-document await
def324f fix(ops): [declared] imports gate strips ?query/#fragment before resolving a relative specifier
6b0cb89 fix(blueprint): C61 looks for the write in the functions a listener calls
c64a776 test(scripts): python-tooling-51 pin is deterministic and strict xfail
a5ba5a3 docs(plans): wave-1 report declares 94d2f94's node-test cwd change and the commit-by-path rule behind the 35d439b sweep
e9bc5c2 docs(blueprint): §5.9.2 relay pattern creates idempotently instead of claiming
6dfcad7 docs(blueprint): the initiator gate picks one user, not one tab
16f5af2 docs(blueprint): make foundry-conformance exits non-zero while any module fails; scorer covers C01–C61
5ca643e docs(plans): wave-1 baseline records the Stage 0 conformance re-score (no drift)
051737b test(importer): vendor kit 1.0.1 (full), fixed run.mjs
cb81c20 test(importer): characterise oracle, glue, root load orders, write path and hook manifest (checkpoint)
5730eea build(foundry): gate pentaryn-importer on its suite, node-test in its ModuleSpec (items-journal-2, C39)
b757a8a refactor(importer): extract importer-core.mjs — pure constants, lint, payload, versionProblems, getPath (items-journal-2, guide step 2)
f55d256 refactor(importer): refuse/failAssertion at the ten shout-then-throw sites; one STRIPPED_KEYS (items-journal-3, guide step 3)
754aa94 refactor(importer): split documents-adapter.mjs and api.mjs out of the entry; move the dnd5e-importer-gate row's files (guide step 4a)
bd83c80 refactor(importer)!: [declared] console lines through the kit logger — `pentaryn-importer | …` (D-I2, guide step 4b)
e34372a refactor(importer): entry wiring — file map, kit hookRegistry, ctx, onReady (guide step 5)
d3658a6 feat(importer): api-manifest.mjs + buildApiFor; the kit-built API on module.api (items-journal-5, guide step 6)
c0c3f97 feat(importer)!: [declared] merge into game.pentaryn instead of replacing and freezing it (items-journal-1, guide step 7)
28f3726 fix(importer): register onReady with Hooks.once, as the template does (C50)
412d23b docs(foundry): module index — pentaryn-importer publishes game.pentaryn.importer (full tier)
e612a79 docs(importer): README in blueprint order, CHANGELOG, use-doc context/foundry/importer.md, comment fixes (items-journal-6, guide step 8)
60bef2a fix(importer): [declared] refuse a second import() while one is running (items-journal-4, D-I3)
566895f perf(importer): one slug index per run instead of a game.actors scan per entry (items-journal-7)
b296efc docs(plans): importer guide — deploy and rollback steps (§9), Result filled
60bde34 refactor(ops): ops/out.py — one say/fail, and event() for structured output (python-tooling-33)
8c287ad fix(ops): module-sync installs atomically — build beside Data/, swap in by rename (python-tooling-5 step a)
70588b1 fix(ops): pipeline.stage installs the importer through modules.install (python-tooling-53)
71a4414 fix(ops): derive the install staging folder from dst, not cfg.FOUNDRY_DATA
b902e30 feat(ops): every module install leaves a sync stamp and an ops-log line (python-tooling-10)
e7b5b17 fix(update): drift notes name each module's own sync target; same-version content drift is reported (python-tooling-9)
8ccfc9d docs(plans): wave-1 Stage 1 recorded — importer keystone and the python Wave 1 items landed; J10–J12 for Joe
40227aa docs(plans): importer rollback regenerates the module index; record check-context red 051737b..28f3726
be332cd fix(ops): [declared] install() restores a mid-swap crash's <id>.old before clearing leftovers
8c0c461 test(pings): vendor kit 1.0.1 (small + settings, api, patch, election), fixed run.mjs
b0ae88a test(cursors): vendor kit 1.0.1 (small + settings, api)
d49967e test(cursors): characterise core, glue, publish orders, i18n and hook manifest (checkpoint)
b11f809 docs(plans): cursors guide records the step-1 checkpoint d49967e
f1ecd11 test(names): characterise oracle, glue, load orders, live parity and hook manifest (checkpoint)
da76319 docs(plans): names step 1 recorded — checkpoint f1ecd11, 78.6 % as small, coverage 0 → 100
d85e653 test(pings): characterise oracle, glue, both capture paths, flush timing, readers and root load orders (checkpoint)
4fad56d refactor(cursors): pure probeInternals and statusOf helpers in core (step 2; -30, -32 pure halves)
4ad0a4e refactor(names): pure core names-core.mjs with shortName, relabel, planTokenRelabels (step 2)
f7a86f9 refactor(cursors): SETTINGS table in settings.mjs; enabled() reads setting() (step 3)
50659bd docs(plans): pings step 1 recorded — checkpoint d85e653, 75.0 % as small, coverage 0 → 100/98.6/100
5eeaa5f docs(plans): pings step 1 record — correct the mutant count (18)
d1e27bf refactor(names): rename feature (install/uninstall/sync) and entry wiring through the kit registry (step 3)
ddbcca6 refactor(names): nested lang/en.json and _loc for the toast (step 7)
5202be0 fix(names): [declared] a failed relabel after a rename is logged, not an unhandled rejection (step 4, N-D1)
dcf9bb0 refactor(cursors): board.mjs feature with install/uninstall; entry is wiring only (step 5; -31)
7983909 feat(names): [declared] kit-built API from api-manifest.mjs, published on module.api (step 5, N-D2)
ae51bca feat(cursors): [declared] publish the kit API synchronously at ready, with status() (step 6, C-1; -32)
af129d1 feat(names): [declared] api.sync accepts an actor ref — id, uuid or whole name (step 6, N-D3)
738f4c4 feat(cursors): [declared] warn once when Foundry's cursor internals are missing (-30 runtime half, C-2)
1724678 refactor(cursors): nest lang/en.json under PENTARYN_CURSORS (step 9, C34)
005f89a docs(names): README in use-doc order, CHANGELOG, API doc text (step 8)
2cc5d48 test(names): cover trace() and the hot re-import after ready
88e8f11 docs(cursors): README in the blueprint's fixed section order; new CHANGELOG (step 8, partial; C44, C45)
f6dca20 docs(plans): names steps 2-8 recorded — 95.3 %, -32/-33/-38 absorbed, shared-file list
a843e0c test(cursors): hot patch re-wires the board and republishes (coverage gap of the entry's game.ready branch)
4f4df57 docs(plans): cursors guide records the wave-1 refactor (steps 2-9 in-module, C-1, C-2) and what is handed back
0a01ef7 refactor(pings): pure core pings-core.mjs (step 2, transform-creatures-36)
16550cf refactor(pings): SETTINGS table in settings.mjs; readLog/writeLog/maxSetting (step 3)
ac75dd8 refactor(pings): capture.mjs; the handlePing wrap through the kit's wrapMethod (step 4)
1a72a80 docs(cursors): core and build headers name the real importers and the KEYS reader (board.mjs)
284dcce feat(pings): [declared] capture feature + kit entry; API built from api-manifest.mjs, published on module.api (step 5, P-D1, P-D2)
f9a94bf feat(pings): [declared] decorated records gain numeric ageMs after age (step 6, transform-creatures-39, P-D3)
ccf90c4 fix(names): [declared] api.sync resolves a token ref to the base actor (N-D3 review)
2b4061b docs(pings): README (use-doc §7 order) and CHANGELOG (step 8)
f5819eb docs(names): sync after a rename repeats in-flight writes; token refs mean the base actor
03a6eb2 docs(plans): pings refactor recorded — commits per step, 88.4 % as small, departures from the guide
40bca21 docs(pings): README lists the pentaryn.ready hook; sync works now, check awaits node-test
170f003 chore(foundry): flags.pentaryn and compatibility.minimum 14 for names, pings, cursors (Wave 7 batch rows; C07, C02)
8435447 build(foundry): [declared] names and pings ModuleSpecs run node-test (C39)
4825fae chore(adjustments): rows for pings (handlePing wrap, userActivity socket) and cursors (board cursor vars) (C32)
54c1ce0 docs(foundry): regenerate the module index — names, pings, cursors are small tier
67866d2 docs(plans): wave 1 integration of names, pings, cursors — batch rows landed, open items J13-J17, leftovers
827ebce docs(cursors): README names core-board-cursor-vars as landed, not pending (senses-walls-cursors-30 registry half)
720486e docs(foundry): cursors gets its own routing row, split from the table-feedback row (senses-walls-cursors-27, cursors half)
9cec8d7 docs(plans): wave 1 report — J18 cursors -28 sync exclusion stays a deferred Joe decision; cursors routing row landed
b1d0fc8 test(importer): micro-benchmark for the slug index (items-journal-7)
4c13f7e docs(plans): importer Result lists the items-journal-7 micro-benchmark commit
9d4ca38 docs(plans): cursors guide marks the routing row (720486e) and step 10 row (4825fae) as landed
75562a1 docs(importer): describe() lists the already-running refusal among import's PentarynAbort causes (items-journal-4)
bb4c6e2 docs(importer): CHANGELOG names the items-journal-7 slug index
8dbb593 docs(plans): importer Result lists the standalone-review fixes (75562a1, bb4c6e2)
34b826c docs(plans): names rollback drill recorded — revert, sync, boot probe, live golden match, restore
ac426c4 feat(tunnel): vtt.atjoseph.com behind Cloudflare Access (Google login, email whitelist)
b8d8b57 docs(plans): re-anchor config.py, modules.py and api.mjs line citations after wave 1
05180f4 docs(plans): fill the Result section of every guide wave 1 touched
```

</details>

Fork (`/Users/joe/Documents/GitHub/foundry-vtt-mcp`, `pentaryn..migrate/wave-1`):

- `071645f` docs(fork): FORK.md upstream footprint table and `scripts/fork-footprint.sh`
  (mcp-fork-11)
- `6e8c607` fix(fork): the footprint script reads FORK.md rows whatever their padding
- `6a52673` docs(fork): comments say what is there; CHANGELOG npc line (mcp-fork-23, -19)

## Frozen tests (`git diff <checkpoint>..HEAD --stat -- <module>/test/`)

Every change under `test/` since a checkpoint is one of four things:

- a new file
- an import-path or `IMPLS` entry for the new core
- a fixture or harness change that asserts nothing
- a named pin flipped by its own `[declared]` commit

| Module | Checkpoint | Frozen files changed | By | Named flip |
|---|---|---|---|---|
| importer | `cb81c20` | `golden/console.json`, `golden/write-console.json` | `bd83c80` [declared] | D-I2 console prefix |
| | | `glue.test.mjs`, `golden/root.json` | `c0c3f97` [declared] | D-I1: the root merges and is not frozen |
| | | `glue.test.mjs` | `60bef2a` [declared] | KNOWN items-journal-4 → refused |
| | | `fixtures/impls.mjs` | `b757a8a` | adds the core impl (import only) |
| names | `f1ecd11` | `glue.test.mjs` | `5202be0`, `7983909`, `af129d1` (all [declared]) | KNOWN -33, `module.api` undefined, KNOWN -38 |
| | | `fixtures/impls.mjs` | `4ad0a4e` | adds the core impl |
| pings | `d85e653` | `core.test.mjs` | `f9a94bf` [declared] | KNOWN -39 (no numeric age) → `ageMs` |
| | | `fixtures/impls.mjs` | `0a01ef7` | adds the core impl |
| cursors | `d49967e` | none | — | new files only: api, internals, hotpatch and status tests, plus the surface and describe goldens |
| ties | `9e955e0` | `golden/surface-legacy.json` | `1411687` [declared] | the 2 D1 rows (`attributes.lookup`, `study.examine` plus the aliases) |
| | | `fixtures/boot.mjs` | `8ad6a23` | stubs Foundry's `logger` (fixture only, J6) |
| prompts | `6cc5c50` | `gather.test.mjs`, 3 `golden/gather-*.json`, `snapshots/two-scenes.txt`, `legacy-run.mjs` | `868103f` [declared] | D6 cut suffix `[...]` → `… (cut, full text: …)`, and the 160 fallback → 400 |
| walls | `a8c5c28` | `corpus.mjs` | `c1a80a5` | the manual corpus CLI throws instead of calling `process.exit` (harness, not a gate; C43) |
| lookup | `a532b3e` | none | — | `docs.test.mjs` is new (`034f048`) |
| movement | `3a5192d` | none | — | `docs.test.mjs` is new (`49b8554`) |
| attunement | `88f935e` | none | — | `docs.test.mjs` is new (`885f342`) |
| journal | `f830067` | none | — | `docs.test.mjs` is new (`1b122e5`) |
| dropbin | `4b53345` | none | — | — |

The goldens created after a checkpoint are step goldens, not frozen ones: importer's
`describe.json` (re-pinned by `28f3726` and `75562a1`) and the `surface.json` files.

Suites now (`node test/run.mjs`):

| Module | Tests | Result | Before |
|---|---|---|---|
| importer | 92 | pass | none |
| names | 45 | pass | none |
| pings | 59 | pass | none |
| cursors | 55 | pass | 84 legacy checks |
| lookup | 20 | pass, plus legacy 43 | |
| movement | 121 | pass | |
| prompts | 19 | 17 pass, 2 skipped | |
| ties | 16 | pass, plus legacy 3 | |
| walls | 128 | 126 pass, 2 todo | |
| attunement | 30 | pass | |
| journal | 26 | pass | |
| dropbin | 38 | pass, plus legacy 40 | |

- **prompts:** the 2 skipped tests are the fork-contract checks, which run only with
  `FOUNDRY_MCP_FORK` set.
- **walls:** the 2 todos are the KNOWN senses-walls-cursors-2 pins (wasm ignores levels).

## Live goldens (before → after)

Scripts: `scripts/foundry/live-goldens/<m>.js`. Outputs: `.state/live-goldens/{before,after-stage0,after,after-standalone}/`
(git-ignored).

| Module | After-run | Differences from before | Verdict |
|---|---|---|---|
| importer | after-standalone | The root keys add `importer`. `module.api` is now an object. `cursors` publishes before `import`. A concurrent `import()` is refused. | Declared only (D-I1, D-I3). The 404 abort, dry-run counts, `only`/`force` and "wrote nothing" are identical. |
| names | after, after-standalone | The surface adds the kit members, and `module.api` is now an object. | N-D2 only. Rename, no-op, nickname, helpers and toast text are identical. |
| pings | after, after-standalone | Surface and `module.api` (P-D1); `ageMs` (P-D3). `lastImmediateIsScratch` and `settingArrayReplacedByFlush` flipped. | Declared, plus ring-state dependence (SF3), not code. A state-matched rerun at a full ring was inconclusive in a hidden tab (J20). |
| cursors | after, after-standalone | Surface and `module.api` (C-1). | Declared only. All five tool switches and the CSS variable strings are identical. |
| ties | after-stage0 | `attributes.lookup` and `study.examine` exist; the old names are aliases. | D1 only. Registry, link, resolve, ids and flags match. The saved file abridges the `of`/`describe` blocks (compared by eye). |
| prompts | after-stage0 | The description cut ends `… (cut, full text: get-character-entity <actor>)` instead of `[...]`. | D6 only. Status, settings, counts, manifest hash `d90c44f8` and model match. |

The 8 checkpoint-only modules have no live golden yet. Workflow 2 writes one per module before
its refactor.

## Conformance (before → after)

The full before table is in [`wave-1-baseline.md`](wave-1-baseline.md): "Wave start" uses rules
C01–C52, and "Stage 0" uses C01–C61. After = `conformance.py --json` at this report.

| Module | Wave start | Checkpoint (as its tier) | Now | Failing now |
|---|---|---|---|---|
| names | 64.1 % (full) | 78.6 % (small) | **100.0 % (44/44)** | — |
| importer | 63.9 % | — | **97.6 % (41/42)** | C07 |
| pings | 62.2 % (full) | 75.0 % (small) | **95.5 % (42/44)** | C40, C51 (J13) |
| cursors | 53.7 % (full) | 56.4 % (small) | **91.3 % (42/46)** | C05, C13, C24, C25 (steps 7–8, not applied) |
| lookup | 64.9 % | | 75.6 % (31/41) | 10 rules |
| walls | 60.5 % | | 71.4 % (30/42) | 12 |
| attunement | 56.4 % | | 67.4 % (29/43) | 14 |
| movement | 53.7 % | | 66.7 % (30/45) | 15 |
| dropbin | 50.0 % | | 60.9 % (28/46) | 18 |
| journal | 46.3 % | | 57.8 % (26/45) | 19, including C56 |
| prompts | 50.0 % | | 56.5 % (26/46) | 20, including C56 |
| ties | 43.9 % | | 55.3 % (26/47) | 21 |
| creatures, portals, senses, riders, aoe, transform, combat | | | identical to the Stage 0 C01–C61 column | WAIT in wave 1; not touched |

`make foundry-conformance` exits non-zero by design while any module fails. The per-module gate is
still advisory (J3).

## Coverage (gap finder, not a target)

Coverage is line / branch / funcs %. "After" counts module code only: `node --test
--experimental-test-coverage` over `test/**/*.test.mjs` plus the run.mjs LEGACY files, with lcov
restricted to the module folder minus `lib/` and `test/`. The baseline's whole-suite figures used a
different scope, so compare the migrated modules only.

| Module | Before | After |
|---|---|---|
| importer | 0 (no tests) | **98.8 / 93.5 / 90.2** |
| names | 0 | **99.7 / 96.8 / 92.0** |
| pings | 0 | **93.8 / 94.7 / 71.4** |
| cursors | 100 / 96.8 / 100 (core only; `cursors.mjs` unloaded) | **94.5 / 90.2 / 93.2** (all 10 files, including glue) |

- **pings:** the low function figure is the `uninstall`/hot-reload paths and the settings
  `onChange` handlers.
- **Checkpoint-only modules:** these were measured the same way, but most of their suite still
  runs as self-running LEGACY scripts, which this method only partly sees. Treat the figures as a
  map for workflow 2's characterisation, not a before/after:

  | Module | Coverage |
  |---|---|
  | lookup | 73.1 / 84.7 / 77.8 |
  | movement | 99.0 / 86.8 / 100 |
  | walls | 94.7 / 86.0 / 92.9 |
  | attunement | 57.1 / 82.1 / 47.4 |
  | journal | 77.7 / 75.2 / 73.0 |
  | dropbin | 85.2 / 68.1 / 69.6 |
  | prompts | 63.8 / 82.5 / 74.7 |
  | ties | 41.8 / 73.2 / 12.2 |

## Performance (median ms per call, GM tab)

| Module | Call | Before | After (standalone live run) |
|---|---|---|---|
| importer | `import({dryRun:true})`, 404 path | 1.3 | 1.0–1.4 warm (2.9 cold first sample) |
| importer | synthetic 3-actor dry run | 0.3 | 0.4 |
| names | rename round trip | 39.3 | 39.9 (45.9 in the first live run) |
| names | `relabel` / `sync` with nothing to do | 0.0001 / 0.005 | 0.0001 / 0.005 |
| pings | `handlePing` | < 0.004 | 0.002 |
| pings | `last()` / `recent(10)` | 0.001 / 0.002 | 0.004 / 0.004 |
| cursors | `refresh()` | 0.007 | 0.007 warm (0.012–0.027 first runs) |
| cursors | tool switch | 0.1 | 0.1–0.2 |
| ties | `resolve` / `describe` / `of` | 0.040 / 0.055 / 0.058 | not re-timed (D1 changes only names) |
| prompts | `gather` / `model` / `status` | 1.4 / 0.08 / 0.038 | not re-timed (D6 changes only the suffix) |

- **Noise:** everything is within noise at the GM tab's ~0.1 ms timer resolution. The after-runs
  were in a **hidden** tab, so Chrome throttles timers (J20).
- **Harness change:** for the names and cursors reruns, the live agent swapped the scripts'
  `setTimeout` polling for a `MessageChannel` yield. That changed the harness only, was not
  committed, and is why names' round trip is comparable.
- **Importer slug index (items-journal-7):** this only shows at scale. `b1d0fc8` counts slug reads
  without timing them: at 5000 actors × 500 entries, 1,766,750 reads become 5000 (about 312 ms → 1 ms).

## Known bugs found and fixed

Each was fixed after its module's structural refactor, in one `[declared]` commit that flips one
named pin:

| Audit id | Module | Bug | Fix | Pin flipped |
|---|---|---|---|---|
| items-journal-4 | importer | two concurrent `import()` calls race on the same actors | `60bef2a` | glue KNOWN -4 |
| transform-creatures-33 | names | a failed relabel after a rename becomes an unhandled rejection | `5202be0` | glue KNOWN -33 |
| transform-creatures-38 | names | `sync()` needs an Actor document; an id or name throws | `af129d1` (+ `ccf90c4`) | glue KNOWN -38 |
| transform-creatures-39 | pings | records carry only a string age | `f9a94bf` | core KNOWN -39 |

Tooling bugs fixed on the way (not module pins):

- **python-tooling-7**, `94d2f94`: the node-test gate's cwd.
- `def324f`: the imports gate and `?query`.
- `6b0cb89` and `6920ab9`: C61 and C59 false results.
- `71a4414`: the staging folder is now derived from the destination.
- `be332cd`: crash recovery in `install()`.
- `e7b5b17` (python-tooling-9): drift notes.

Known bugs still pinned as-is, for workflow 2 to fix after each refactor:

- walls: senses-walls-cursors-2 (wasm ignores levels; 2 todos) and senses-walls-cursors-1
  (`undo()` throws)
- the KNOWN rows in lookup, movement, attunement, dropbin, journal and prompts (see each guide)

## Audit findings for the wave-1 modules → commits

| Finding | Kind | Commit(s) |
|---|---|---|
| items-journal-1 (merge, don't freeze the root) | absorbed, step 7 | `c0c3f97` [declared] |
| items-journal-2 (core + node-test gate) | absorbed, step 2 | `b757a8a`, `5730eea`; tests `cb81c20` |
| items-journal-3 (shout-then-throw ×10) | absorbed, step 3 | `f55d256` |
| items-journal-4 (re-entrancy) | standalone | `60bef2a` [declared]; `describe()` doc `75562a1` |
| items-journal-5 (`importer` sub-namespace, `describe()`) | absorbed, step 6 | `d3658a6` |
| items-journal-6 (docs drift) | absorbed, step 8 | `e612a79` |
| items-journal-7 (slug index) | standalone, performance | `566895f`; benchmark `b1d0fc8`; CHANGELOG `bb4c6e2` |
| senses-walls-cursors-34 (two frozen-root guard copies) | skipped | retiring the guards is a Stage 5 kit bump (J10) |
| transform-creatures-32 (names core and tests) | absorbed | `f1ecd11`, `4ad0a4e`, `d1e27bf`; gate `8435447` |
| transform-creatures-33 (unhandled rejection) | absorbed, step 4 | `5202be0` [declared] |
| transform-creatures-38 (`sync` ref) | absorbed, step 6 | `af129d1`, `ccf90c4` [declared]; docs `f5819eb` |
| transform-creatures-34 (sibling tokens) | skipped | dropped by the audit ("confirm live, do not change"); live confirms today's behaviour; pinned as N-L1, J14 |
| transform-creatures-36 (pings core) | absorbed, step 2 | `0a01ef7` |
| transform-creatures-35 (pings scaffolding) | absorbed | `16550cf`, `ac75dd8`, `284dcce`, `2b4061b`, `40bca21`, `170f003`, `8435447`, `4825fae`; lang file not done (J13) |
| transform-creatures-39 (GM-only namespace, string age) | absorbed, step 6 | `f9a94bf` [declared]; GM-only publish kept and documented in `284dcce` |
| transform-creatures-37 (two GM sessions, last writer wins) | skipped | dropped by the audit (out of scope; both fixes change results); see Async |
| transform-creatures-24 (`compatibility.minimum` 14) | absorbed, shared file | `170f003` |
| transform-creatures-20 (routing rows for names and pings) | skipped | outside the module agents' scope; listed under "Not applied" |
| senses-walls-cursors-30 (unregistered internals) | absorbed | pure `4fad56d`, runtime `738f4c4` [declared], registry row `4825fae`, README `827ebce` |
| senses-walls-cursors-31 (attach duplicated; hooks not uninstallable) | absorbed, step 5 | `dcf9bb0` |
| senses-walls-cursors-32 (`status()`) | absorbed, steps 2 and 6 | `4fad56d`, `ae51bca` [declared] |
| senses-walls-cursors-35 (`DESIGN.md` in the module) | skipped | steps 7–8 move files out of the module, outside the wave-1 agent's scope; "Not applied" |
| senses-walls-cursors-27, cursors half (routing row) | standalone | `720486e` |
| senses-walls-cursors-28, tooling half (sync exclusion) | skipped | a deferred Joe decision in the master audit, J18 |
| aoe-movement-portals-39 (shared cursor/aoe row) | skipped | aoe is Stage 4 |

Stage 0 / tooling ids this wave fixed or pinned with a characterisation test (kept here for the
merge review):

- python-tooling: -1, -2, -3, -5 step a, -7, -8, -9, -10, -33, -34, -36, -38, -41 to -46, -48 to
  -53
- mcp-fork: -11, -19, -20, -23, -24 (doc half)
- prompts-lookup-26
- items-journal-17 and -37
- senses-walls-cursors-8
- aoe-movement-portals-37

Each id is in its commit subject.

## Async and concurrency findings

- **Scorer (C53–C61):**
  - C56 fails in journal, prompts and riders: hand-written `CONFIG.queries`. The fix goes through
    the manifest at each module's API step.
  - C59 warns in aoe, combat, dropbin, importer, portals, prompts, riders, ties and transform. The
    importer's warning is deliberate: each actor is checked before the next.
  - No other hits. Details are in [`wave-1-baseline.md`](wave-1-baseline.md).
- **Standalone reviews (§5.9 checklist):**
  - names: the fire-and-forget relabel has a `.catch`, and the hooks return nothing.
  - pings: the flush timer catches, both capture paths catch, and `uninstall()` clears the timer.
  - cursors: listeners are synchronous; the only deferred work is `setTimeout(resync)`.
  - importer: the guard covers one tab only.
- **Two tabs on one GM account:** both the MCP bridge tab and a browser tab count as the GM, so
  three reactions run twice:
  - importer: two tabs can overlap an import (documented).
  - pings: both tabs write the log and the last writer wins (transform-creatures-37, dropped).
  - riders' relay and journal `ensure`: J8.
- **Assistant GMs:** `guarded` admits them (J9).
- **Tests:** none uses a real timer; all use `t.mock.timers`, as the reviews checked.

## Rollback drill

Done on names, on the throwaway branch `drill/names-rollback`:

- **Revert:** 10 plain reverts, plus the names part of `170f003` and `8435447` reverted by hand.
- **Rolled-back checks:** the module equalled `f1ecd11`. Tests 28/28 and conformance 78.6 %. The
  boot probe showed the old surface with `module.api` undefined. The live golden matched
  `test/fixtures/live-before.json`.
- **Restore:** branch deleted, re-synced. Tests 45/45, conformance 100 %, boot probe green.
- **Notes for the next rollback:**
  - Shared-file commits (`170f003`, `8435447`) carry other modules' rows, so revert only their
    hunk.
  - The first `eval-js` after a sync may answer "not connected"; retry it.

Recipe: [`migrate-pentaryn-names.md`](migrate-pentaryn-names.md#rollback-drill-2026-10-11), recorded
in `34b826c`. No real rollback happened in wave 1: every module was fixed forward.

## Stop-rule events

None:

- No frozen test went red twice on one step.
- No boot probe went red. All four modules' first probes passed, as did the D1/D6 Stage 0 probe.
- No module was stopped or reverted.

Near misses, recorded for the merge:

- **Lookup suite red, `35d439b`..`97809fc`:** another lane's commit swept in lookup's staged rename.
  `a532b3e` fixed it; see "Known red commits".
- **Wrong world:** the first `make login` in Stage 0 verification opened space-journey. A second
  down/up with `WORLD=pentaryn` fixed it.

## Re-anchored line citations

`context/foundry/addon-blueprint.md` cites no line of `api.mjs`, `modules.py` or `config.py`.

Its other cites still hold, because those files are unchanged in wave 1:

- the kit: `lib/hooks.mjs:27-36`, `lib/settings.mjs:158,161`, `lib/queries.mjs:23-31,38-44,89-98`
- the modules: `riders.mjs:417`, `journal.mjs:146`

The plan guides that workflow 2 reads did cite those three files, and the wave moved their lines.
`b8d8b57` re-anchors them:

| Where | Was | Now | Points at |
|---|---|---|---|
| README K2 | `api.mjs:31-37` | `api.mjs:32-38` | `reservedClash`; the file is unchanged and the old cite was one line early |
| lookup guide :396 | `config.py:154` | `config.py:217` | lookup ModuleSpec comment, already reworded to "`node test/run.mjs`" |
| walls guide :78 | `config.py:129` | `config.py:192` | walls ModuleSpec |
| walls guide :362 | `config.py:133–134` | `config.py:196–197` | walls `after_sync` |
| walls guide :260 | `modules.py:337` | `modules.py:648` | `dest = src / "wall-engine.wasm"` |
| walls guide :403 | `modules.py:306` | `modules.py:561` | `install()`'s `copytree`, where a `ship_ignore` would go |

## What workflow 2 starts with

Stage 2 continues in order: **lookup → movement → walls → attunement → journal → dropbin**.
prompts and ties follow later.

**Already done for each of these modules:**
- the kit is vendored (1.0.1)
- the checkpoint is committed and frozen: lookup `a532b3e`, movement `3a5192d`, walls `a8c5c28`,
  attunement `88f935e`, journal `f830067`, dropbin `4b53345`
- the docs test and README drift fixes have landed

**Each module starts at its guide's step 2, after:**
1. re-reading its Result row in this commit
2. writing and running a live golden "before" script (none exists yet for these six)
3. a timing baseline

**Inputs to carry:**
- **movement:** D4 has landed (`4a5c13c`).
- **walls:** its flag-scope data migration is the only real one (Wave 7). Its KNOWN pins -1 and -2
  are the declared fixes.
- **journal:** C56 and J8 (`ensure` runs on both GM tabs).
- **dropbin:** goes after attunement, because they share Item Piles rows.
- **lookup:** keeps the namespace `rules`; it is the first full-tier module with queries.
- **Kit bump:** J6 plus J16, with J10 in Stage 5. It can go first in workflow 2 if Joe agrees,
  because every vendored module re-syncs anyway.
- **Live sessions:** L2 (lookup and movement) and L3 (walls, attunement, journal, dropbin) are the
  live-test sessions.

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
| J11 | The importer's declared changes (D-I1 merge, D-I2 console prefix, D-I3 re-entrancy refusal) are committed but **not deployed**; deploy and rollback steps are in the importer guide §9 (`make foundry-sync WORLD=pentaryn`, then `make foundry-clean`). | Stage 1 | the live-test run **Done 2026-10-11:** synced, restarted, smoke and live golden passed (D-I3 refusal seen live). |
| J12 | python-tooling-10's stamp carries `synced_at`, so every module sync changes `Data/modules` content and the next `make foundry-backup` takes a snapshot even if no code changed (its digest skip no longer fires after a sync). Harmless; `cloud.snapshot_digest` could ignore `.pentaryn-sync.json` if the extra snapshots matter. | Stage 1 | keep, or ignore the stamp in the snapshot digest |
| J13 | pings step 10 (i18n): `languages`, `lang/en.json`, the `max` row's `PENTARYN_PINGS.Setting.max.Name/Hint` keys and `test/i18n.test.mjs` need **one edit to a frozen pin** (the `settings.register` option pin in `glue.test.mjs`). The freeze rule forbids it, so pings stays at 95.5 % with C40 and C51 failing. The rest of the pings `module.json` row landed in the wave 1 integration. | Integrator (pings) | allow that one golden edit (a [declared] step-10 commit), or leave pings' settings unlocalised |
| J14 | names N-L1: renaming a base actor relabels every unlinked token that uses it. Pinned as today's behaviour. | Integrator (names) | keep, or call it a bug (audit id) |
| J15 | names N-D4: the optional console line for the rename toast (`log.notify`) was not taken. | Integrator (names) | none unless wanted |
| J16 | Kit gap (`foundry/lib/patch.mjs`): a `wrapMethod` handle's `unwrap()` restores the method but keeps the kit's record, so a later `wrapMethod` with the same marker returns the stale handle and does not wrap. Pings' `uninstall()` uses `unwrapAll()` instead. | Integrator (pings) | fold into J6's kit bump |
| J17 | names, pings and cursors are committed but **not deployed**: their `module.json` edits (`flags.pentaryn`, `compatibility`) need the restart batch, and the declared changes need a live smoke (names N-D1..N-D3 and the base-actor sync ref; pings P-D1..P-D3 — ping, then `last().ageMs`, `describe().version === "0.1.0"`, `uninstall()` + re-import; cursors C-1 `describe()`/`status()`, C-2 silent console). | Integrator | the live-test run (with J11) **Mostly done 2026-10-11:** synced and restarted with the `module.json` edits, boot probes and live goldens passed. Not exercised live: names' actor-ref `sync`, pings' `uninstall()` + re-import, cursors C-2's silent console (boot console not captured, J21). |
| J18 | senses-walls-cursors-28, tooling half: a `ship_ignore` / sync exclusion of `tools/`, `test/`, `*.md` in `ModuleSpec` is listed in the master audit's "Deferred decisions for Joe" (python-tooling-5 step b; needs a manifest/`import.meta.url` guard first). Not applied in cursors' standalone pass. Cursors' own half needs no tooling: its guide's step 7 moves `tools/` and `assets/src/` out of the module. Standalone pass result: -32 `ae51bca`, -30 runtime `738f4c4` (registry `4825fae`, README `827ebce`), -27 cursors row `720486e`; the audit lists no performance finding. | cursors standalone findings | schedule the sync-exclusion decision, or leave it deferred |
| J19 | The pings ring (max 50) now holds roughly 25+ `ZZ live-goldens pings` scratch records from the golden runs. The module's private buffer overwrites any restore, and `clear()` would drop the real ping history too. | live runs (pings) | clear it, or let real pings rotate them out |
| J20 | The GM tab is kept hidden (a non-Foundry tab in front), so Chrome throttles its timers. The pings golden's state-matched rerun at a full ring was inconclusive (the scratch ping was not in the log after 400 ms; a 5-ping probe timed out). The names and cursors reruns needed a `MessageChannel` yield in place of `setTimeout` polling, which was not committed. | live runs | allow the GM tab to come forward briefly during live goldens, or commit the yield into `scripts/foundry/live-goldens/*.js` |
| J21 | No boot probe could read the boot-time console: console tracking starts after page load, and the login tab is outside the readable tab group. "No red console errors" rests on the eval bridge, `trace()` and the server log. | every boot probe | accept, or add a reload-with-console-capture step to the live-test session |
| J22 | importer: during a running import, a call with a bad option now gets "already running" in place of the bad-option message. This only happens with overlapping calls; left as is. | importer review | none unless the order matters |
| J23 | Pushing the fork branch `migrate/wave-1` also publishes two local `pentaryn` commits that were never pushed (`36e3fa2` retire place-tokens, `59c781e` dnd5e 6 port and the prompt-markers tool), because the branch is built on them. `origin/pentaryn` itself was not pushed. | report | push `pentaryn` too, or note it for the fork merge |

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
  rename") and pings ("where did I ping / read back a ping") — transform-creatures-20. (Cursors'
  own row, senses-walls-cursors-27, landed in `720486e`.) The generated Module
  APIs table is already regenerated; names and pings show "no describe golden yet" until each pins
  `test/golden/describe.json`.
- `context/foundry/markers.md` ping-log section: link `foundry/module/pentaryn-pings/README.md`;
  records now carry `ageMs` and the namespace has `describe()`.
- names follow-up (its owner): `NS/CSS/FLAG_SCOPE` checks against `flags.pentaryn` in
  `test/core-meta.test.mjs`, now that the manifest carries them.
- `migrate-pentaryn-names.md` lines 424-427: the ModuleSpec edit landed as
  `(*_STATIC, "node-test", *_BLUEPRINT)` (the order every other spec uses), and edit 3 should say the
  Module APIs table is generated, never hand-edited.
