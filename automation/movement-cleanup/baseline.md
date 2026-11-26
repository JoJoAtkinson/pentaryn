# Baseline before the cleanup fleet — pentaryn-movement 0.10.2 (2026-11-25)

HEAD `5c0f62b5130b2a217c6a1367986bd46ed374ea60` on movement-0.9 (0.10.2, live on the world; main untouched). Node v24.22.3. Module tree clean.

## Gates (all green at this HEAD)

| Gate | Result |
|---|---|
| `make foundry-movement-check` | rc 0, 36 s. **node tests 525 / pass 525 / fail 0** (33 test files + test/sim/sim.test.mjs; `grep '^test('` counts 443 calls, loops generate the rest). Parse ✓, imports ✓ (76 files, 219 local edges), i18n 70/71 direct + 1 dynamic, vendor ✓ (10 kit files), conformance **95.9 % (47/49)**, accepted exceptions C30, C56 (stop.mjs:1360 hand-written `CONFIG.queries` stopOwn). |
| `make test` (pytest) | rc 0, 113 s. **2461 passed, 9 skipped, 4 xfailed**. |
| `make foundry-module-index && make check-context` | index already current; context surface OK (32 warnings, none movement's). |
| `make foundry-movement-sim SEEDS=10000` | exit 0, **0 failing runs**, every invariant 0 (full numbers: sim-compare.md, sim-baseline.txt). Per-seed digest: sim-digest-baseline.txt. |

Per-file node test counts (grep of `test(`): drop 128, glue 33, pathfind 28, sim 24, pathfind-core 21, ghost-combat 13,
lead 12, api 12, narrow 11, group-props 11, file-core 9, core-rules 9, fight 8, status 7, glue-ghost-combat 7,
ghost-context 7, plug 6, core 6, adapter 6, telemetry-core 5, h4 5, telemetry 4, sliced 4, patches 4, i18n 4,
animate-registration 4, storage-sync 3, log 3, ghost-back 3, hooks 2, docs 2, settings 1, regressions 1.
Goldens: describe, hooks, pins, settings-register, surface, toolbar.

Flake to expect (F6): timing gates (L1 "median under 100 ms", R9 400 stairs / S05 / S06 warm-route) fail under a parallel
load (they failed under `--experimental-test-coverage` while three simulator runs shared the CPU); re-run alone, do not
loosen. `foundry.utils is Foundry's own common/` fails when the suite runs outside make without FOUNDRY_APP_ROOT.

## Coverage (node --experimental-test-coverage, lib/ and test/ excluded; whole suite)

line 97.8 % · branch 82.4 % · funcs 93.8 %. Thin spots (branch %, uncovered lines):

| File | line | branch | funcs | uncovered |
|---|---|---|---|---|
| drop.mjs | 96.0 | 72.9 | 91.2 | 225-226 (withCheckpoints: cost differs / measure throws → path.slice(1)), 529-532 (failed()), 564-572 (confirmLater: a Large's narrow refusal, partial / core waypoints, noRoute), 662-684 (aroundLater whole), 926-928 (cutNow throw), 1199-1213 (nextSlice browser branches), 1287-1296 (planLater fail → core move), 1345-1366 (launchLater: none/blocker/stayed notices, now0 send), 1411, 1648, 1783-1789 (walkOne await animation, fightMove throw) |
| stop.mjs | 98.1 | 72.7 | 90.7 | 143-145, 302, 346-348, 424 (player query when not GM/no starter), 486-490 (pending waves as circles), 605, 866-869 (settleTogether walkers depth), 882, 1094-1095, 1293-1298 (stop() as a query handler: NOT_OWNER / NOT_INITIATOR / ok) |
| file.mjs | 98.9 | 77.7 | 99.2 | 222-224 (a wave's send throws), 244-247 (hidden tab: a wave due after 3 s re-timed), 262-264 (pendingEnds) |
| group-adapter.mjs | 97.6 | **63.6** | 90.9 | 240-242 (fitPath no whole square), 424-425, 446-452 (clearOfWalls snap fallbacks) |
| telemetry.mjs | 89.0 | 65.2 | 76.0 | 59-64 (breaker on the active GM: assist off, permanent warn), 78-83 (movingHere), 88-95 (stall listener) |
| movement.mjs | 90.9 | 63.6 | 62.5 | 86-89 (uninstall), 99-101 (API drift), 118-121 (late install) |
| pathfind.mjs | 97.8 | 79.4 | 95.4 | 276, 296-298 (narrow walk refused → leg none), 426 (entersTrap), 497-500 (job cancel), 517-519 (async plan throw), 625-629 |
| narrow-core.mjs | 97.8 | 93.9 | 86.8 | 87-93 (openFrom: one-way walls on the band), 148-151, 244-264 (lineCross) |
| pathfind-adapter.mjs | 96.9 | 82.6 | 97.4 | 92-93 (canvas.edges), 458-459, 481-486, 505-511 (the band's okSeg with a standing circle / blocking) |
| ghost.mjs / ghost-combat.mjs | 97.5 / 95.4 | 90 / 80 | | onAssistFlip, onPlayerToggle refusal, onGmFlip; setGhostInCombat resolve error / write failure |
| motion-core.mjs | 98.4 | 93.8 | 97.1 | 104, 119 (static-pair quadratic roots), 241, 289-296 (minSeparation) |
| every other source | 100 line | ≥ 86.8 branch | | |

## Blueprint pattern (the "like my other plugins" check)

Conformance 95.9 % with two accepted exceptions — same shape as combat 96.0 / ties 96.1 / riders 94.0. Layout is already
the blueprint's (entry movement.mjs, pure cores, adapters, features with install/uninstall, settings.mjs, api-manifest +
api.mjs, lib/ vendored, goldens). What sets it apart is C10 size, the largest of any module: drop.mjs 1928/500,
stop.mjs 1385/500, narrow-core 1060/600, file.mjs 898/500, file-core 801/600, pathfind.mjs 770/500, motion-core
681/600, pathfind-core 603/600, ghost 592/500, pathfind-adapter 550/500, README 422/250 (ties splits by concern into
`core/` and `study/` subfolders behind barrels — the blueprint's own remedy, §2 "split by concern … never part 2").
Other warnings: C59 settings.mjs:181 (per-doc await in a loop: the 0.8.0 migration). Manual: C33 private internals
(adjustments rows exist), C55 stop.mjs:418 `starter.query(` (receiver is a User; passes timeout 400).
Known dead / duplicate code for the cleanup (from the use-doc and probes): stop.mjs's `stopOrder`, `makeRoom` and the
brush rule (settle made them redundant, movement.md "Known limits"); MOTION.restGap unused; `segmentsCross` exists in
both motion-core and pathfind-core (both treat a touch and a collinear overlap as crossing).

## How the fleet should pin (cheap for Sonnet, safe for the cleanup)

- Pure cores: the kit's own `characterise(name, fn, inputs, { file: import.meta.url })` (test/kit/harness.mjs) over an
  input table, one golden per file (`test/golden/pin-<area>.json`), generated with
  `GOLDEN_UPDATE=1 node --test test/pin-<area>.test.mjs` against this unchanged HEAD, the diff read, then committed.
  Floats: round to 1e-6 in `normalise`. A throw is pinned as `{ threw }`.
- Pin through exports (core functions, the features' install + hooks, game.pentaryn.movement), never through a
  private helper the cleanup is meant to delete (stop.mjs makeRoom / roomAt / roomAlong, drop.mjs internals): those are
  reached through stopToken / the click wrap / onPreMove, so a merge or delete keeps the pins green.
- Glue-level pins use `test/fixtures/world.mjs` `movementWorld()`; the 100 px board with the y = 400 door lives inside
  drop.test.mjs: copy it into a new `test/fixtures/board.mjs` used only by the pin files (leave drop.test untouched).
  `mock.timers.enable({ apis: ["setTimeout", "Date"] })` and a test-moved `performance.now` as drop.test does.
- Probes of the current outputs quoted in the areas: probe.mjs, probe2.mjs, probe3.mjs, probe-plan.mjs in this folder.
- After the fleet lands: make foundry-movement-check (expect 525 + the new tests), then sim-compare.sh digest; after every
  cleanup commit the same two; sim-compare.sh (both) before the last commit. README "Tests" lists test files: add the
  pin-* line there in the same change.

## After the pin fleet (2026-11-25, HEAD 5debda95 + this commit)

`make foundry-movement-check`: **node tests 773 / pass 773 / fail 0** (was 525), stable over 3 runs. New files: pin-plan 35, pin-motion 47, pin-api 80, pin-stop 86 test calls (248; 5781 lines). `make test` 2461 passed, 9 skipped, 4 xfailed (unchanged). index + check-context OK. sim-compare.sh: summary IDENTICAL, digest IDENTICAL (10000 seeds). No test-side fixes were needed.
