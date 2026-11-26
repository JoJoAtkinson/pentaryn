# pentaryn-movement cleanup pass: the plan (2026-11-25)

Base: branch movement-0.9 at 5debda95 (0.10.2 plus the pin fleet: 773 node tests). Behaviour must stay identical. Judges:
`make foundry-movement-check` (every pin green), `sim-compare.sh` (summary and per-seed digest identical to
`sim-baseline.txt` / `sim-digest-baseline.txt`), and at the end `make test` and `make foundry-module-index && make check-context`.

## What was measured before planning (read before any slice)

1. **The three "redundant" stop rules are not redundant.** The simulator's model (`test/sim/model.mjs`) mirrors stop.mjs and
   has a switch for each rule. 10,000 seeds per probe (`plan-probe/`, digests against `sim-digest-baseline.txt`):

   | switched off | seeds whose record changes | seeds that fail a HARD class |
   |---|---|---|
   | stopOrder (`noOrder`) | 517 | 3 (3847 passThrough + restOverlap, 7696, 8249 restOverlap) |
   | makeRoom (`noMakeRoom`) | 8 | 1 (5418 restOverlap) |
   | the brush (`noDeeper`, takenAround `deep`) | 5 | 0 |
   | all three | 523 | 5 (2660, 3847, 5418, 7696, 8249) |

   So **no slice deletes stopOrder, makeRoom, roomAlong or the brush**. Deleting the brush alone changes 5 seeds with no
   failure: a behaviour change, out of scope for an identical pass (a later [declared] item, if ever). movement.md's
   "three stop rules the settle made redundant" line and plan §18.9 backlog item 4 get corrected in S6.
2. **The simulator does not run the glue.** It imports only the cores (`file-core`, `motion-core`, `group-core`,
   `pathfind-core` via `test/fixtures/grid.mjs`, `narrow-core`'s `drain`) and models stop.mjs / drop.mjs / file.mjs itself.
   A digest is the judge for a core change. For stop.mjs, drop.mjs, file.mjs, pathfind.mjs and the adapters, the only
   judges are the node tests (pin-stop 86, pin-api 80, pin-motion 47, pin-plan 35, drop.test 128 …). Narrow ways (the
   narrow-core field and walk) are outside the simulator: narrow.test, pathfind.test, pin-motion and drop.test cover them.
3. **Dead code is small.** Used by no source file (only by tests, or by nothing): motion-core `firstConflict`,
   `minSeparation` and the helpers only firstConflict uses (`earliestBelow`, `earliestAtLeast`, `TOUCH_SLACK`); pathfind-core `edgeKey`; ctx.expose keys no file reads: drop.mjs `groupCutAcross`,
   `groupCheckpoints`, `groupStackmates`, pathfind.mjs `pathfindRouteSteps`. Keep: `MOTION.restGap` (status() prints
   `group.limits.motion = { ...MOTION }`: a public read), `remainingFrom` (4 lines, the S3R1-01 regression test's
   vehicle), every export a test or the simulator imports, `STOP_OWN`.
4. **Line targets are out of reach in an identical pass.** Drag assist is 9,362 lines today (pathfind-core / -adapter,
   pathfind, narrow-core, motion-core, group-core / -adapter, file-core, file, drop, stop), about 25 % comments.
   The 4,200 / 280 targets (R12) would need behaviour changes. This pass aims at about 300 to 400 lines out. It does not
   chase the targets (auto-decision P2).
5. **Not identical, so not merged:** motion-core `segmentsCross` (EPS 1e-6) and pathfind-core `segmentsCross` (EPS 1e-9).
   drop.mjs `segPt` guards `L2 > 1e-12`, stop.mjs `segDist` and group-adapter `pointSegment` guard `L2 ?`. One shared
   function needs an `eps` parameter (S3).
6. **Hot spot (Node CPU profile, 300 simulator seeds):** `walkFrom` (file-core) has the most self time of any module
   function (4.6 % of the whole run, about half of planLead). For every neighbour it builds a string key, and for every pop
   it parses one back. The heap orders by distance only, so the payload can change without changing the pop order.
   The in-page plan time over narrow ways is the band (`relax`, okSeg). 0.10.2 F already took the exact wins there.
7. **Blueprint position.** 95.9 % (47/49). Fail C30 / C56 are accepted (stop.mjs stopOwn, a GM's query to the starter,
   kept). Warnings: C10 (11 files plus README) and C59 (settings.mjs:181, the one-time 0.8.0 migration). The peers carry
   the same warnings: pins C10 (api.mjs), portals C10 + C59, aoe C10 (core.mjs 986, README 474) + C59, ties C10
   (attributes.mjs 1,584) + C59. The pattern's remedy for a big **core** is `core/<topic>.mjs` behind the core barrel (ties
   `known-core.mjs`, aoe `core.mjs`). Big features stay big there too, so drop/stop/file are not split into new features
   (auto-decision P5). README ≲ 250 lines is the one doc rule movement misses (421).

## How every slice works (the cheap way)

- Read only the line ranges the slice names (`sed -n a,bp`, `grep -n`). Never read whole 1,000-line files twice. Move
  blocks with `sed -n 'a,bp' src >> dst` / `sed -i 'a,bd'`, never by retyping them.
- Quick loop: from `foundry/module/pentaryn-movement`, `node --test test/<the slice's tests>.test.mjs` (set
  `FOUNDRY_APP_ROOT` as the make target does, or let the one glue test that needs it fail and rely on the full gate).
- Slice gate: `make foundry-movement-check` (all pass; count = 773 minus the tests the slice deletes, named in the commit).
  If a core file or anything under `test/sim/` changed: `sim-compare.sh digest` (IDENTICAL). A timing flake (F6: L1 median,
  R9 warm route) is re-run alone, never loosened.
- Never touch a golden: describe.json, surface.json, hooks.json, settings-register.json, toolbar.json, pins.json stay
  byte-identical in every slice (no slice changes the API, a hook, a setting or the toolbar). A pin test changes only
  when it pins something the slice deletes (the deleted function's own pins). Say which in the commit.
- `test/regressions.test.mjs`: a round ID cited in a source comment needs a test titled with it, or a PENDING entry. A
  PENDING entry nobody cites any more must leave PENDING. Deleting or moving comments can trip this test: run it.
- One commit per slice, files by path, subject `refactor(movement): [declared] cleanup Sn — …` (perf: `perf(movement)`),
  body: what went, what stayed identical, the gate numbers; the two attribution lines exactly as the run rules say.
- On a red gate the slice reverts the offending change (it does not adapt a pin to it) and notes it in auto-decisions.md.

## The slices, in order

### S1: dead code out (low risk)
Files: `motion-core.mjs`, `pathfind-core.mjs`, `drop.mjs`, `pathfind.mjs`, `test/group-props.test.mjs`,
`test/pin-motion.test.mjs`, `test/regressions.test.mjs` (only if a PENDING id loses its last citation).
- motion-core: delete `firstConflict`, `minSeparation`, `earliestBelow`, `earliestAtLeast` and `TOUCH_SLACK` (each used
  only by firstConflict). Keep `breakpoints`, `moving`, `quad` and `measureBelow`: `closeTime` uses them, and file-core's
  staggerFile uses closeTime.
  firstConflict's comment cites S1R2-05 (PENDING). If no other source cites it, take it off PENDING.
- pathfind-core: delete `edgeKey`.
- drop.mjs `install`: drop the expose keys `groupCutAcross`, `groupCheckpoints`, `groupStackmates` (the functions stay
  where the module itself calls them). groupDrop's `typeof stepsOf !== "function"` fallback to `groupPlan`: delete it
  only if no test reaches it (file.mjs always exposes groupPlanSteps). Keep it if any test stubs groupPlan alone.
- pathfind.mjs `install`: drop `pathfindRouteSteps` from ctx.expose.
- Tests: the firstConflict / minSeparation tests in group-props (the brute-force property test and the line-86 asserts)
  and pin-motion's "firstConflict / closeTime / minSeparation" test. Keep its closeTime asserts in a test of their own,
  and drop the `"firstConflict 1.2 behind, buffered"` PIN entry.
- Stays identical: every other export, `MOTION` (restGap included), `remainingFrom`, status(), the goldens.
  Gate: movement-check + digest. Expect motion-core about 681 to 560 lines.

### S2: stop.mjs tightened (medium risk: the simulator does not run this file)
Files: `stop.mjs` only.
- KEEP the rules: stopOrder (orderForStop), makeRoom / roomAt / roomAlong / commitRoom, takenAround's `deep` (the
  brush), settleTogether, stopAlso, settleAgain, shutBlocked. Only their shared plumbing changes.
- One `routeOf(token)` → `{ all, k }` (the route's corners: origin, passed, pending, not intermediate, finite) for the
  three copies in `wayOf`, `orderForStop`, `wayLeft`.
- `centreOf(t, p)` replaces the inline `centre` lambdas that compute the same thing (alongWay, takenAround's `inside` /
  `within` / `deep`, settleAgain, displace's walkOn). One `sizeOf(t)` → `{ s, w, h, r }` replaces the about 14
  `_source.width ?? 1` / `radiusOf(...) * s` copies.
- One module-level `snapPx` replaces the six `p => ({ x: Math.round(p.x), y: Math.round(p.y) })`.
- One `spotsFor(t, from, way, { free, enters, wallBetween })` carries the common `spotsAlong` options (step s/20,
  aheadMax PAST_DOOR_SQUARES·s, behindMax Infinity, snap) for settleTogether, shutBlocked and settleAgain.
- One `nameStayed(doc, key)` replaces the four `try { feature.exposed.groupTellStayed?.([doc], k, k) } catch …` copies.
- In takenAround, build `inside(circles)` and `inside(walkers)` once (today `taken(p)` makes two closures on every call,
  and clearAlong calls it every s/20 along a route). This is exact.
- Stays identical: every exposed name (`stopDisplace`, `stopOrderOf`, `stopAlso`, `stopBatched`, `stopShutBlocked`,
  `stopWalkingOn`, `noteDrop`, `stop`, `stopSafely`, `moveStartedAt` …), the query STOP_OWN, the order of every
  write, the batch's single update, every log key (warnOnce ids). Gate: movement-check (pin-stop, drop.test, h4,
  glue). The digest only as a check: no core changed. Ask Opus to read the diff before the commit (no simulator cover).
  Expect about 1,384 to 1,300.

### S3: drop.mjs / file.mjs / ghost.mjs dedupe and the shared bits (medium risk)
Files: `drop.mjs`, `file.mjs`, `ghost.mjs`, `group-adapter.mjs`, `movement-core.mjs`, `motion-core.mjs`, `stop.mjs`
(one import line).
- Move the update-option names into movement-core (pure constants): `GROUP_OPT` (drop.mjs:44 and file.mjs:45),
  `LEAD_OPT` (drop.mjs:46 and ghost.mjs:107). Same strings.
- motion-core gets `segDist(p, a, b, eps = 0)` (zero-length when `L2 <= eps`, written so `eps = 0` is today's `L2 ?`).
  It replaces stop.mjs `segDist`, group-adapter `pointSegment` (eps 0) and drop.mjs `segPt` (eps 1e-12: its guard
  exactly). Do NOT merge the two `segmentsCross` (EPS 1e-6 against 1e-9).
- drop.mjs `launch` and `launchLater` share three helpers. `splitPlan(members, plan, delays, skip)` gives the `now0`
  members and the `later` map in members order. `tellOutcome(grabbed, plan, stayedDocs)` holds the none / blocker /
  noRoute / stayed notices, the same branch order. `waveOpts(result, tag)` copies result[1] without `movement` and adds
  GROUP_OPT. planLater's `ridersOf` and launch's inline riders filter become one `ridersOfFn(riders)`. The gid / tag
  computation (`groupHold` and the hidden-member test) becomes one helper. Keep every call in its current order (record
  before tell, tell before send, noteInFlight last).
- Stays identical: status().group (every field), the telemetry events and their fields, notices and their order, the
  update options sent (keys and values), planGroup's dry run. Gate: movement-check + digest (motion-core changed).

### S4: perf where it is clear (low-medium risk; perf)
Files: `file-core.mjs`, `group-core.mjs` (flood, only if it has the same pattern).
- `walkFrom`: carry `{ i, j }` (or i, j) in the heap entry next to the key. The `best` map and the neighbour test use a
  numeric key (`stepMemo`'s scheme, `(i + 4096) * 8192 + (j + 4096)`). No `parseKey` per pop, no string per neighbour that is
  turned away. The returned Map keeps today's string keys in today's insertion order. Pops come out in the same order
  (the heap compares `[0]` only). `reachOf` gets the same change. `flood` gets it only if it builds a key for every
  neighbour in the same way.
- Measure first and after (scratch only, nothing committed): `node --cpu-prof` on 300 simulator seeds
  (`plan-probe/prof-sim.mjs`) for walkFrom's self time, and a timing of planLead over lead.test's 800 seeded drops. Keep
  the change only when walkFrom's self time drops 30 % or more, or the simulator's wall time drops 3 % or more, and the
  digest is identical. Otherwise revert and note it.
- Stays identical: walkFrom's / planLead's outputs (every pin-plan, lead, plug, file-core test), the simulator digest.
  Gate: movement-check + `sim-compare.sh` both (summary + digest).

### S5: blueprint layout, the cores behind barrels (low risk)
Files: `narrow-core.mjs`, new `core/narrow-geom.mjs`, `core/narrow-field.mjs`, `core/narrow-walk.mjs`; `file-core.mjs`,
new `core/stagger.mjs`, `core/lead.mjs`; `pathfind-core.mjs` (comment trim only); `test/regressions.test.mjs`.
- As ties `known-core.mjs` and aoe `core.mjs` do it: `narrow-core.mjs` becomes a barrel (header plus `export *`).
  `core/narrow-geom.mjs` holds the private helpers both halves use (EPS, sqKey, segNear, segThroughBox, openFrom; NOT
  re-exported). `core/narrow-field.mjs` holds NARROW, resample and narrowField (today 31-561). `core/narrow-walk.mjs` holds
  finePath to pointsBack (562-1059), drain among them. `file-core.mjs` becomes a barrel over `core/stagger.mjs` (clearOf,
  routeEnters, STAGGER, narrowZones, staggerFile and its box helpers: 17-238) and `core/lead.mjs` (LEAD to the end:
  heap, walkFrom, planLead …). Every file stays under 600 lines.
- Move with sed (block extraction). Then fix only the relative imports (`../motion-core.mjs` …). No other file's imports
  change: they keep importing the barrels, and so do the simulator and the tests.
- Identical export lists, checked: `node -e` prints `Object.keys(await import(...))` sorted for narrow-core.mjs and
  file-core.mjs before and after (save them in scratch), and the two must match.
- `test/regressions.test.mjs` `sources()`: also read `core/*.mjs` (otherwise the moved comments' round IDs read as
  cited nowhere, and PENDING goes stale). pathfind-core: trim two or three comment lines so it is 600 or less (602 today).
- Confirm that conformance sees `core/` as core (C10 cap 600, C16 core imports core only) and that `make foundry-movement-sync`
  copies the folder (modules.py copytree: it does).
- Stays identical: every behaviour (a pure move), the digest, the goldens. Gate: movement-check + digest + `make
  foundry-conformance M=movement MD=1` (the four core C10 warnings gone).

### S6: docs to the pattern, version, records (low risk)
Files: `README.md`, `CHANGELOG.md`, `module.json` (version only), `movement-core.mjs` (VERSION only),
`context/foundry/movement.md`, `context/foundry/README.md` (by `make foundry-module-index`),
`context/plans/pathfinding-2026-11.md` (a short §18.13).
- README to 250 lines or fewer (C10; pins 244 / portals 247 / ties 213), the C44 sections in order, the "Read this
  when" line, no fixture counts. "What the player sees" (today 180 lines) becomes a summary. The drag-help detail
  (pathfinding, groups, march and swarm, the stop, narrow ways) moves into `context/foundry/movement.md` "At the table" /
  "Out of combat vs in a fight", where the use-doc already holds the rules. Keep docs.test's sentence ("Every row except
  `inspect`, …, is `legacy`") and cite no `.mjs:NNN` line numbers. Files table: the `core/` files. Tests: the pin-* line
  (pin-plan, pin-motion, pin-api, pin-stop: the cleanup's characterisation net).
- Version 0.10.3 (auto-decision P3): module.json `version` and movement-core `VERSION` (core.test pins them equal), a
  CHANGELOG entry ("cleanup, no behaviour change: dead code out, stop/drop helpers shared, walkFrom keys, cores behind
  barrels; simulator 10,000 seeds identical"). Then `make foundry-module-index` and commit context/foundry/README.md.
- movement.md "Known limits": replace "three stop rules the settle made redundant … consolidation is backlog" with the
  measurement (each is still load-bearing: 517 / 8 / 5 seeds, 3 / 1 / 0 HARD failures without it) and the new line counts.
  Plan §18.13: what went, what stayed, the probe table, gate numbers.
- Stays identical: all code behaviour (the version string is the only code change). Gate: movement-check, `make test`,
  `make foundry-module-index && make check-context`.

### S7: final proof, deploy, backup push (no code)
- All gates on the final tree: `make foundry-movement-check`, `make test`, `make foundry-module-index && make
  check-context`, `sim-compare.sh` (all: summary and digest, IDENTICAL), and `make foundry-movement-sim SEEDS=10000`
  (no failing class).
- Deploy per the run rules: no real user online (check, wait or retry up to 30 min), then `make foundry-movement-sync`.
  module.json changed, so relaunch the world through the admin API (`FoundryAdmin.ensure_world`) and run
  `systemctl --user restart foundry-headless-gm`. Live smoke: `status().version` 0.10.3, `selftest().ok`, describe paths
  are functions.
- Append the after-numbers to baseline.md (test count, line counts per file, conformance). Push movement-0.9 (backup).
  main untouched.

## Expected end state

Behaviour byte-identical in the simulator (summary and per-seed digest), every pin green, goldens untouched, conformance
95.9 % (C30 / C56 accepted as before), C10 cleared for every core (motion-core, pathfind-core, narrow-core, file-core) and
the README, and left on the features: drop, stop, file, pathfind, ghost and pathfind-adapter, as ties and aoe carry theirs.
C59 is left on the one-time migration, as on portals, aoe and ties.
