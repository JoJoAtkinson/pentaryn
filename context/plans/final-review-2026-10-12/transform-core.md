---
title: "Final review 2026-10-12 — transform-core"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of transform-core found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — transform-core

## Verdict

**NEEDS-JOE**: the review recorded one real defect (EC-1: Wild Shape uses spent in form are not carried back on revert when the uses max is a formula). Fixing it changes what a player sees, so it was recorded, not applied.

## Scope

- Paths: `foundry/module/pentaryn-transform/` `transform.mjs`, `transform-core.mjs`, `api.mjs`, `api-manifest.mjs`, `core/**`, `wildshape.mjs`, `starry.mjs`, `bodyswap.mjs`, `sweep.mjs`, `settings.mjs`, `patches.mjs`, `wiring.mjs`, plus `test/**`.
- Base: `bb93da9f` (origin/main). Branch: `review/transform-core`.
- Triage: 30 findings. 10 DO (3 DO-EDGE, 7 DO-REFACTOR), 15 RECORD, 5 DROP (R2 and EC-2 are duplicates of async-1, plus R4, EXT-3 and EXT-6).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| EC-1 | core/wildshape.mjs:190 | high | DO-EDGE, recorded | `useSyncUpdates` skips uses with a formula max (`@scale.druid.wild-shape-uses`), so uses spent in form are not carried back on revert |
| R1 | api.mjs:24 | low | DO-EDGE, kept | `inspect(ref, null)` threw a TypeError when destructuring `null` opts |
| M5 | core/hud.mjs:272 | low | DO-EDGE, recorded | `portraitText` gives `left: "0 minutes"` when `starryLeft` is absent; its JSDoc promises `null` |
| M1 | patches.mjs:19 | low | DO-REFACTOR, recorded | the comment says only the entry imports the file, but `wiring.mjs:16` imports `removePatches` |
| M2 | core/bodyswap.mjs:7 | low | DO-REFACTOR, kept | the doc pointed at transform.mjs for the preUpdateToken guard; the guard is in bodyswap.mjs |
| M3 | core/wildshape.mjs:46 | low | DO-REFACTOR, kept | the doc pointed at starry.mjs for `starryItem`; it is in starry-adapter.mjs |
| M4 | core/hud.mjs:164 | low | DO-REFACTOR, kept | `formTempHP` moved to core/wildshape.mjs beside `shapingPlan` |
| EC-5 | core/bodyswap.mjs:25 | low | DO-REFACTOR, kept | `isBodySwap` unwraps flags once, outside its two-key loop |
| EXT-4 | test/api.test.mjs:125 | low | DO-REFACTOR, kept | test-only: the manifest reason unions are pinned to `RETURN_LINES` and `starryEndKey` |
| EXT-5 | transform-core.mjs:22 | low | DO-REFACTOR, not applied | the barrel's import-then-export could be `export … from` |
| transform-core-async-1 | starry.mjs:49 | low | RECORD | `maybeEnd` has no in-flight guard, so one expiry can delete twice and warn |
| transform-core-async-2 | wildshape.mjs:124 | medium | RECORD | automatic writes are gated per user, not per tab, so two GM tabs both write |
| transform-core-async-3 | wildshape.mjs:196 | low | RECORD | `onLongRest` vetoes the rest; if `revert()` returns null, the Long Rest is silently lost |
| perf-1 | sweep.mjs:19 | medium | RECORD | every token update, even an x/y drag, schedules a world-wide sweep |
| perf-2 | starry.mjs:81 | low | RECORD | `onWorldTime` calls `activeStarry` up to 3 times per actor per tick |
| EXT-1 | api-manifest.mjs:91 | medium | RECORD | `flags.writes` lists `revert`, which nothing writes; `flags.reads` omits `revert` and `keepInForm` |
| M6 | api-manifest.mjs:105 | low | RECORD | the `starry.assume` doc lists fewer false paths than the code does |
| M7 | starry.mjs:37 | low | RECORD | the Wild Shape refund update is duplicated inline from wildshape-adapter's `refund()` |
| EXT-2 | starry.mjs:55 | low | RECORD | the ending listeners and the runner gate are copied almost line for line from wildshape.mjs |
| EXT-7 | core/wildshape.mjs:47 | low | RECORD | the Starry Form identity is hard-coded in two places that match slightly differently |
| EXT-8 | transform-core.mjs:56 | low | RECORD | the barrel exports `MODULE as MODULE_ID`, which C12 bans; C12's regex misses aliases |
| EC-4 | sweep.mjs:22 | low | RECORD | after a hot re-import past ready, the first sweep never runs |
| EC-3 | core/hud.mjs:93 | low | RECORD | `planBonusBar` drops an id-null item slot when `wildShapeId` is null |
| R3 | wiring.mjs:46 | low | RECORD | `ctx.uninstall()` has no per-feature guard; a throw would skip `offAll` and `removePatches` |
| perf-3 | n/a | low | RECORD | process: the apply agents saw an unrelated relayed request (multi-party plan) and some declined DO items |

## Changes kept

| commit | what | pinned by |
|---|---|---|
| ccb30cec | `inspect(asked, opts)` reads `opts?.as`, so `inspect(ref, null)` answers like `inspect(ref)` | `test/api.test.mjs` "inspect(ref, null) answers as inspect(ref)" (failed first with a TypeError) |
| 7b3662df | the `isBodySwap` doc names bodyswap.mjs as the preUpdateToken guard (comment only) | full suite, goldens byte-identical |
| 132ca525 | the `isStarryFormData` doc names starry-adapter.mjs `starryItem` (comment only) | full suite, goldens byte-identical |
| 1941568f | new test: the manifest reason unions match `RETURN_LINES` and `starryEndKey` (test only) | `test/api.test.mjs` "manifest reason unions match the reason tables" (mutation-checked) |
| 1b58f79c | `formTempHP` moved from core/hud.mjs to core/wildshape.mjs; same barrel export name | core-exports golden byte-identical, full suite |
| 7a7a61c9 | `isBodySwap` unwraps `flags` and `flags.dnd5e` once, before the key loop | existing body-swap tests, full suite |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** EC-1 `core/wildshape.mjs:190`: `useSyncUpdates` guards on `Number(f.system?.uses?.max) > 0`, which drops every formula-max item, so Wild Shape uses spent in form are not copied back on revert. This breaks the promise in the docstring and the README. Apply the planned fix with a test: a form item with max `@scale.druid.wild-shape-uses` and spent 0, against an original with spent 1, should give `[{_id, 'system.uses.spent': 0}]`. Players will see the change on revert.
- M5 `core/hud.mjs:272`: default `starryLeft = null` in `portraitText`, so an unknown end gives `left: null` as the JSDoc promises. Test: "portraitText: a Starry Form without starryLeft has an unknown end". The apply agent abandoned it. The fix is still valid.
- M1 `patches.mjs:19`: correct the comment "only the entry imports this file", because `wiring.mjs:16` imports `removePatches`. Comment only. The apply agent abandoned it.
- EXT-5 `transform-core.mjs:22`: the barrel's import-then-export could become `export … from`. It was not applied in this run. Optional refactor, check with the core-exports golden.
- transform-core-async-1 `starry.mjs:49`: add a module-scope `ending` Set of actor uuids around `maybeEnd`, mirroring wildshape-adapter's `reverting`. Today one expiry can send two deletes and a warn. `starry.test.mjs:362-377` pins the two warns today.
- transform-core-async-2 `wildshape.mjs:124`: auto-revert, endOnDruid, the Starry ending and the sweep run on every tab of the runner user. Decide whether to claim the write with a per-document election (`lib/election.mjs` `claimDocument`). Separately, fix the `isRunner` docstring in wildshape-adapter.mjs.
- transform-core-async-3 `wildshape.mjs:196`: `onLongRest` always vetoes, so a null `revert()` (in-flight revert, stale form) loses the Long Rest. Run the rest on the original, wait for the in-flight revert, or at least warn.
- perf-1 `sweep.mjs:19`: schedule the sweep on `updateToken` only when `actorId`, `delta` or `flags.dnd5e` changed. The tests at `lifecycle.test.mjs:285/293/311/319` and `features.test.mjs:34` would change.
- perf-2 `starry.mjs:81`: let `starrySecondsLeft` take the effect, so `onWorldTime` calls `activeStarry` once per actor. This needs a starry-adapter.mjs change.
- EXT-1 `api-manifest.mjs:91`: move `flags.pentaryn-transform.revert` from writes to reads, add `keepInForm` to reads, and regenerate `golden/describe.json`.
- M6 `api-manifest.mjs:105`: extend the `starry.assume` doc with the missing false paths (no feature or consume activity, already assuming, unknown constellation), then regenerate describe.json.
- M7 `starry.mjs:37`: replace the inline refund update with an exported adapter refund helper.
- EXT-2 `starry.mjs:55`: share the ending listeners and the runner gate with wildshape.mjs through an adapter helper. Keep the labels, order and `setTimeout(0)`.
- EXT-7 `core/wildshape.mjs:47`: use a single frozen `STARRY_FORM = { identifier, name }` in core/starry.mjs for both matchers. This changes the core-exports golden.
- EXT-8 `transform-core.mjs:56`: drop the `MODULE as MODULE_ID` alias once the legacy tests use `MODULE`, and widen conformance rule C12 to catch export aliases.
- EC-4 `sweep.mjs:22`: in `install`, call `sweepSoon()` directly when `game.ready` is already true, so a hot re-import still gets its first sweep.
- EC-3 `core/hud.mjs:93`: guard `isWs` with `wildShapeId != null`. That would make an item-less Argon button reappear on the Bonus bar, so it needs a live check first.
- R3 `wiring.mjs:46`: wrap each feature's uninstall in try/catch so `offAll` and `removePatches` always run. The defect is latent, since no uninstall throws today.
- perf-3 (process): several apply agents saw an unrelated relayed request (a multi-party feasibility plan) and declined DO items (EC-1, M5, M1). Confirm that the multi-party planning workflow ran separately.

## Verification

- ccb30cec: keep
- 7b3662df: keep
- 132ca525: keep
- 1941568f: keep
- 1b58f79c: keep
- 7a7a61c9: keep

## Gates

- Gate: module suite `node test/run.mjs`: 252 tests, 252 pass, 0 fail; legacy core: 155 passed. The vendored kit is identical to foundry/lib (13 files). Conformance 100.0 % (49/49 fail-class rules). The diff is within scope, and the untouchables are clean.
- `make check-context` passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
