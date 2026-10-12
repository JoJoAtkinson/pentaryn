---
title: "Final review 2026-10-12 — walls"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of walls found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — walls

## Verdict

**NEEDS-JOE.** The kept changes are behaviour-preserving and the gate is green, but real defects are recorded: refusal pings broadcast to every player (and pan their view under Alt+Shift+W), the wasm backend ignores weldEps/pinEps and iterCap, and per-run undo lineage is lost when a later run moves a generated wall.

## Scope

- Paths: `foundry/module/pentaryn-walls/**` (module `pentaryn-walls`) and this record.
- Base: `45488047` (origin/main when the review started).
- Branch: `review/walls`, worktree `pentaryn-review-walls-wt`.
- Triage: 50 findings, giving 10 DO (2 DO-EDGE, 8 DO-REFACTOR), 29 RECORD (7 deferred by cap) and 11 DROP (10 duplicates, 1 already documented).

## Findings by lens

Line numbers are at the review HEAD.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| walls-edge-3 | actions.mjs:95 | low | DO-EDGE, kept | An async `canvas.ping` rejection escaped the sync catch as an unhandled rejection, against glue-ping's debug-line promise |
| walls-async-1 | walls-core.mjs (exclusive) | low | DO-EDGE, kept | A stale `exclusive()` call settling after a force-release freed the next holder's lock |
| perf-2 | core/engine.mjs (diagnose) | low | DO-REFACTOR, kept | diagnose reuses enumerate's ray via a WeakMap instead of casting it again |
| perf-1 | core/engine.mjs (diagnose) | low | DO-REFACTOR, kept | diagnose takes the caller's dangling list instead of rebuilding and sorting it per refusal |
| M1 | backend-wasm.mjs:4 | low | DO-REFACTOR, kept | Header comment now describes runWasm's real refusal path |
| M2 | wasm/src/lib.rs (run) | low | DO-REFACTOR, reverted | ABI layout comment corrected, but the +1 line broke wasm reproducibility |
| M4 | core/backends.mjs:1 | low | DO-REFACTOR, kept | Header names the real corpus runner (`test/corpus.mjs --backend=`) |
| M5 | core/engine.mjs:198, 843 | low | DO-REFACTOR, kept | Unread seg fields `donor` / `generated` dropped |
| EXT-10 | README.md (Extending) | low | DO-REFACTOR, kept | README names every place a new rule or act kind touches |
| EXT-7 | actions.mjs:173 | low | DO-REFACTOR, reverted | makeMacro guard via `Object.hasOwn` widened the accepted set |
| walls-edge-1 | actions.mjs:95 | high | RECORD | Refusal pings broadcast to all clients and become view-panning PULL pings under Alt+Shift+W |
| walls-edge-2 | core/engine.mjs:993 | medium | RECORD | A later run re-touching a generated wall overwrites priorC and run id; undo lineage lost |
| EXT-1 | backend-wasm.mjs:85 | medium | RECORD | weldEps/pinEps overrides do not cross the wasm ABI |
| walls-rob-1 | backend-wasm.mjs:90 | medium | RECORD | wasm ignores iterCap and commits a partial result where js throws |
| walls-rob-3 | actions.mjs:94 | medium | RECORD | Refusals for a non-viewed sceneId are pinged on the viewed canvas |
| EXT-3 | actions.mjs:31 | medium | RECORD | readWalls never passes `threshold`, so engine threshold support is dead |
| walls-rob-2 | core/backends.mjs:87 | low | RECORD | compare() throws a TypeError when js throws and another backend does not |
| M11 | api-manifest.mjs:102 | low | RECORD | Manifest omits the `kind`/`sources` writes; undo sideEffects order is wrong |
| walls-async-2 | actions.mjs:176 | low | RECORD | Overlapping makeMacro calls create two macros |
| walls-edge-7 | walls-core.mjs:59 | low | RECORD | reportHtml interpolates scene.name unescaped |
| walls-rob-5 | actions.mjs:104 | low | RECORD | `preview/run/analyze/undo(null)` reject with a destructuring TypeError |
| walls-rob-7 | actions.mjs:23 | low | RECORD | Unknown sceneId gets the "open one, or pass a sceneId" message |
| walls-rob-8 | actions.mjs:74 | low | RECORD | Chat-card failures go to console.error, not the kit log |
| walls-rob-9 | actions.mjs:176 | low | RECORD | makeMacro reuses any same-named macro regardless of type |
| walls-rob-10 | backend-wasm.mjs:31 | low | RECORD | Browser wasm load never checks `response.ok` |
| walls-edge-5 | walls-core.mjs:116 | low | RECORD | planUndo picks the latest run by string sort; non-ISO runIds stay latest |
| walls-edge-6 | backend-wasm.mjs:90 | low | RECORD | Empty scene: wasm reports 1 iteration, js 0 |
| EXT-6 | api-manifest.mjs:27 | low | RECORD | Manifest hard-codes the flag scope instead of FLAG_SCOPE |
| EXT-9 | actions.mjs:47 | low | RECORD | Backend names hard-coded in pickBackend and the setting choices |
| EXT-11 | walls-core.mjs:44 | low | RECORD | readyLine hard-codes keybindings and the API list (analyze missing) |
| walls-async-4 | actions.mjs:60 | low | RECORD | Engine runs synchronously on the main thread with no yields |
| perf-3 | backend-wasm.mjs:120 | low | RECORD | wasm runs with refusals fall back to a full JS analyze() |
| M12 | pentaryn-walls.mjs:47 | low | RECORD (cap) | ctx.contributions unused; file-map comment misplaces the busy lock |
| M7 | core/engine.mjs:950 | medium | RECORD (cap) | runEngine and enumerate are long multi-job bodies |
| M6 | core/engine.mjs:1115 | low | RECORD (cap) | report.config built by hand in both backends; component rows built twice |
| M8 | core/engine.mjs:597 | low | RECORD (cap) | Carrier-on-line test copied three times, overlap span twice |
| M9 | core/engine.mjs:792 | low | RECORD (cap) | `byRule` map is keyed by tier |
| M13 | test/glue-analyze.test.mjs:15 | low | RECORD (cap) | Three tests hand-copy readWalls; stale core.test comment |
| EXT-8 | core/engine.mjs:902 | low | RECORD (cap) | diagnose dedupes by regex-parsing the wall id out of English text |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 19a02048 | walls-edge-3: ping wrapped in `Promise.resolve(...).catch(err => log?.debug("ping", err))`, still not awaited | `test/glue-ping.test.mjs`: "ping rejects (async, as Foundry 14), debug on: one debug line per refusal, no unhandled rejection" plus its debug-off twin (both failed before the fix) |
| c717eda8 | walls-async-1: `exclusive()` records a lock generation and clears busy only if it still owns it | `test/core-render.test.mjs`: "exclusive: a stale call settling after the lock was force-released does not free the next holder" (failed before the fix) |
| 8f896393 | Pinning test for the refusal-heavy path (sha256 of refusals from runEngine and analyze) | `test/engine-refusals.test.mjs`: "refusal-heavy stub grid: runEngine and analyze output pinned" |
| 719d67f6 | perf-2: module-level `WeakMap` ray cache; diagnose uses `rayOf.get(v) ?? castRay(...)` | `test/engine-refusals.test.mjs` hash pins; engine, canonical, backend-drift goldens byte-identical |
| 05e439b3 | perf-1: diagnose takes the caller's `danglingOf(verts)` list | `test/engine-refusals.test.mjs`: "refusal sweep with iterCap 0 still diagnoses every end (no enumerate ran)"; engine goldens |
| 73c683b2 | M1: backend-wasm.mjs header comment (comment only) | n/a (comment only) |
| 6e996b83 | M5: drop unread seg fields `donor` / `generated` | full suite; engine-golden, canonical, backend-drift goldens; engine-shape greps |
| 08e2d348 | M4: core/backends.mjs header names `test/corpus.mjs --backend=` (comment only) | n/a (comment only) |
| ffbd378a | EXT-10: README "Extending → A rule" names diagnose, applyInstance and boxOf | `test/docs.test.mjs` |

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| 7e7ef4b8 | f9f11daa | Comment-only and accurate, but the net +1 line in lib.rs shifts panic Location line numbers in the wasm data section, so the checked-in `wall-engine.wasm` no longer rebuilds byte-identically from its source (sha df378076 vs 2eddeb78). Re-landing the same text in 3 doc lines keeps the binary identical. |
| b09bdfbf | 09de0300 | A behaviour change. `Object.hasOwn` coerces its key, so `makeMacro(["run"])` (or `new String("run")`) now passes the guard and creates a Macro where it used to reject with `unknown action "run"`. |

## Recorded for Joe

- **defect** `actions.mjs:95` (walls-edge-1): refusal pings go through `canvas.ping`, which broadcasts to every client, and under Alt+Shift+W the held modifiers turn them into PULL pings that pan every player's view; README says players see "Nothing". Pin `{pull: false, style: PULSE}` or draw locally with `canvas.controls.drawPing`.
- **defect** `core/engine.mjs:993` (walls-edge-2): a later run that moves a run-1 generated wall overwrites priorC and stamps run 2's id, so undoing run 2 deletes the wall. Needs a per-run history design (created-run key, first priorC per run, planUndo restores moved generated walls).
- **defect** `backend-wasm.mjs:85` (EXT-1): weldEps/pinEps overrides are hard-coded in lib.rs:703-706, so wasm gives different geometry from js while the card echoes the override. Route such opts to js (like Levels), or extend the ABI and rebuild.
- **defect** `backend-wasm.mjs:90` (walls-rob-1): wasm ignores iterCap and returns a partial result that run() commits, where js throws "nothing was committed". Throw the js message in runWasm when `iterations > cfg.iterCap`.
- **defect** `actions.mjs:94` (walls-rob-3): preview/run with another scene's sceneId pings that scene's coordinates on the viewed canvas. Ping only when `canvas.scene?.id === scene.id` (glue-ping expectation changes).
- **defect** `actions.mjs:31` (EXT-3): readWalls never passes `threshold`, so engine threshold propagation is dead from scenes, wasm does not marshal it, and the runEngine manifest type omits it. Decide carry vs drop; fix the misleading `test/corpus.mjs:18` comment either way.
- **defect** `core/backends.mjs:87` (walls-rob-2): compare() crashes with a TypeError on `ref.canon` when js throws and another backend does not (reachable via walls-rob-1). Add `if (ref?.error)` returning `identical: false`.
- **defect** `api-manifest.mjs:102` (M11): `flags.writes` and run's sideEffects omit `kind` and `sources`; undo's sideEffects say delete-then-update but the code updates first. Fix rows and regenerate describe.json.
- **defect** `actions.mjs:176` (walls-async-2): two overlapping `makeMacro` calls each create "Walls: <action>". Per-action in-flight map, or a deterministic keepId `_id` for cross-tab.
- `wasm/src/lib.rs` run() doc (M2, reverted 7e7ef4b8): re-land the corrected ABI layout comment within the original 3 doc lines so `wall-engine.wasm` stays reproducible (verified sha df378076 in the scratchpad).
- `actions.mjs:173` (EXT-7, reverted b09bdfbf): leave the `includes` guard; if a table-driven guard is wanted, use `typeof action === "string" && Object.hasOwn(exclusiveActions, action)` and add the `makeMacro(["run"])` rejection pin.
- `walls-core.mjs:59` (walls-edge-7): reportHtml interpolates scene.name unescaped into the GM card; escape with `foundry.utils.escapeHTML` if wanted (card bytes change).
- `actions.mjs:104` (walls-rob-5): `preview/run/analyze/undo(null)` reject with a TypeError; normalise `arg ?? {}` if null should mean defaults.
- `actions.mjs:23` (walls-rob-7): an unknown sceneId gets "no scene — open one, or pass a sceneId."; use a distinct "no scene with id" message (glue-busy pin changes).
- `actions.mjs:74` (walls-rob-8): chat-card failures use raw console.error; route through `log.error("chat card failed", err)` so api.trace() sees them.
- `actions.mjs:176` (walls-rob-9): makeMacro reuses a same-named macro of any type; match on name and `type: "script"`.
- `backend-wasm.mjs:31` (walls-rob-10): browser load skips `response.ok`, so a 404 surfaces as a CompileError; throw `fetch <url> → HTTP <status>`.
- `walls-core.mjs:116` (walls-edge-5): planUndo sorts runIds as strings, so a non-ISO runId (`"test"`, or an explicit `runId: undefined`) stays latest forever; document ISO-only or reject non-ISO runIds.
- `backend-wasm.mjs:90` (walls-edge-6): an empty scene reports 1 iteration on wasm and 0 on js; special-case 0 walls in runWasm or fix lib.rs.
- `api-manifest.mjs:27` (EXT-6): derive flagScope/flags.writes from `FLAG_SCOPE` and add an api.test assertion.
- `actions.mjs:47` (EXT-9): backend names are hard-coded in pickBackend and the setting choices; add an AUTO_ORDER/registry preference if a third backend arrives.
- `walls-core.mjs:44` (EXT-11): readyLine hard-codes keybindings and the API list (analyze missing); derive it (pinned console bytes change).
- `actions.mjs:60` (walls-async-4): the engine runs synchronously with no yields; large scenes freeze canvas and socket. wasm is the mitigation; a Worker is the future option.
- `backend-wasm.mjs:120` (perf-3): any wasm run with refusals falls back to a full JS analyze(); a refusals-only engine entry would fix it (widens the core surface).
- `pentaryn-walls.mjs:47` (M12, deferred by cap): `ctx.contributions` is never consumed and the :8 file map says walls-core holds the busy lock; check kit conformance before touching contributions.
- `core/engine.mjs:950` (M7, deferred by cap): split runEngine/enumerate (applyTrims, pickBatch, collectMutations, enumW1..E1) behind engine-golden and engine-shape.
- `core/engine.mjs:1115` (M6, deferred by cap): a shared `reportConfig(cfg)` and local componentRows helper.
- `core/engine.mjs:597` (M8, deferred by cap): extract `carrierOff2` only; `overlapSpan` is not exact (NaN handling differs between blocksOpen and lint).
- `core/engine.mjs:792` (M9, deferred by cap): rename `byRule` to `byTier` in ambiguousAnchors.
- `test/glue-analyze.test.mjs:15` (M13, deferred by cap): a `plainWalls` helper in test/fixtures/world.mjs and reword the core.test.mjs:30 comment.
- `core/engine.mjs:902` (EXT-8, deferred by cap): return the wall id from castRay alongside the refusal instead of regex-parsing it back out of the text.

## Verification

- 19a02048: keep
- c717eda8: keep
- 8f896393: keep (test only)
- 719d67f6: keep
- 05e439b3: keep
- 7e7ef4b8: revert (f9f11daa)
- 73c683b2: keep
- 6e996b83: keep
- 08e2d348: keep
- ffbd378a: keep
- b09bdfbf: revert (09de0300)

## Gates

- Module gate (`node test/run.mjs`, kit identity, conformance): ok. 210 tests, 210 pass, 0 fail. The vendored kit is identical to foundry/lib (10 files). pentaryn-walls conformance is 98.0% (48/49 fail-class rules), with the existing C07 exception row and no new rows. Untouchables clean; the diff stays inside scope.
- `make check-context` passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
