---
title: "Final review 2026-10-12 — movement"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of movement found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — movement

## Verdict

**NEEDS-JOE**: nine refactors and one edge fix were kept with the suite green and the goldens byte-identical, but the review recorded real defects that need a behaviour change, so Joe has to decide them. They are a wrong "the fight is over" toast on a scene change, a GM double-flip that toasts a mode that never takes effect, and a selftest check that can never fail.

## Scope

- Paths: `foundry/module/pentaryn-movement/**` (module `movement`, kind module), plus this record.
- Base: `9d10880b` (origin/main of `/Users/joe/Documents/GitHub/pentaryn`).
- Branch: `review/movement`, worktree `/Users/joe/Documents/GitHub/pentaryn-review-movement-wt`.
- Triage: 26 findings. 4 were dropped as duplicates. 10 were DO (9 DO-REFACTOR, 1 DO-EDGE) and 12 RECORD (2 of them deferred: cap).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| EXT-7 | test/status.test.mjs | low | DO-REFACTOR → kept | No test tied the status manifest row to the keys status() returns |
| movement-mnt-1 | test/legacy-core.mjs | low | DO-REFACTOR → kept | Legacy core suite duplicated the 89 checks already in core.test.mjs |
| movement-mnt-3 | README.md:70 | low | DO-REFACTOR → kept | README misstated which manifest rows are legacy |
| movement-mnt-6 | movement-core.mjs:36 | low | DO-REFACTOR → kept | Comment named `ghostBack` instead of `ghostBackKey` |
| movement-edge-2 | combat-adapter.mjs (pinInputs) | medium | DO-EDGE → kept | pinInputs sized hex tokens by width × grid.size instead of their real getSize |
| movement-mnt-4 | ghost.mjs (addTools, markBlocked) | low | DO-REFACTOR → kept | addTools and markBlocked re-read state by hand instead of liveState() |
| EXT-1 | settings.mjs | low | DO-REFACTOR → kept | Settings onChange forwarders were written out three times |
| movement-mnt-2 | movement-core.mjs (combatOnScene) | low | DO-REFACTOR → reverted | combatOnScene restated the rule combatSceneIds already implements |
| EXT-2 | ghost.mjs (install/uninstall) | low | DO-REFACTOR → kept | Setting-handler keys were listed separately in install and uninstall |
| movement-mnt-5 | ghost.mjs | low | DO-REFACTOR → kept | Five ghost.mjs exports had no importer |
| rob-1 | api.mjs:26 | medium | RECORD | pinsUnderTokens("sceneId") throws a raw TypeError from the adapter |
| movement-edge-1 | ghost.mjs:317 | medium | RECORD | A scene change during a running fight toasts "The fight is over" and uses up the one-time toast |
| rob-2 | ghost.mjs:62 | low | RECORD | ghostFor(TokenDocument) silently returns false |
| rob-3 | ghost.mjs:80 | low | RECORD | combatActive(Scene) and status("id") give confident wrong answers |
| rob-4 | api.mjs:37 | low | RECORD | selftest's "settings readable" check can never fail |
| movement-edge-3 | ghost.mjs:50 | low | RECORD | Two tabs on one player account leave the other tab's ghost cache stale |
| movement-edge-4 | ghost.mjs:37 | low | RECORD | combatActive(null) and status({sceneId:null}) disagree on the default scene |
| movement-edge-5 | combat-adapter.mjs:30 | low | RECORD | pinsUnderTokens ignores Foundry 14 scene levels |
| movement-async-1 | ghost.mjs:263 | low | RECORD | A quick GM double flip toasts a mode that never takes effect |
| perf-1 | ghost.mjs:188 | low | RECORD | refreshState writes mesh.sort twice per owned token on player clients |
| EXT-4 | movement-core.mjs:229 | low | RECORD (deferred: cap) | flipPolicy lists the non-off modes by hand |
| EXT-3 | ghost.mjs:102 | low | RECORD (deferred: cap) | patchDrag and patchKeyboard are copy-paste |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 9a109e8b | New test: every status() key and every `patched` key appears in the status manifest row's `returns` | status.test.mjs "the status row's returns names every status() key, and every patched key" |
| d236a0c4 | Deleted test/legacy-core.mjs (all 89 checks already in core.test.mjs); `LEGACY = []` in run.mjs | core.test.mjs "all 89 legacy checks are ported"; conformance C43 green |
| d2294597 | README line 70 says every row except `selftest` is legacy | docs.test.mjs "README names selftest as the one non-legacy row" |
| 5441d234 | Comment at movement-core.mjs:36 names `ghostBackKey` (comment only) | Full suite |
| 9c52d13c | pinInputs uses `t.getSize()` when present, else width/height × grid size (same key order) | adapter.test.mjs "pinInputs: a token's own getSize (hex) wins over width × grid.size; tokens without it keep the old size" |
| 1b8a3427 | addTools and markBlocked read state through `liveState()` (same read order) | Full suite; toolbar/hooks/describe goldens byte-identical |
| 787c8487 | `forward(key)` helper for the ghostPolicy, ghost and ownedOnTop onChange rows; README step 4 updated | settings.test.mjs "every key the feature reacts to has a forwarding onChange row" |
| b5600203 | Frozen `ON_SETTING` table used by install() and uninstall() | api.test.mjs "after uninstall() a setting change reaches no feature handler" |
| ce418149 | ghost.mjs exports only install and uninstall | Full suite; conformance C18 green |

## Changes reverted by verification

| commit | revert | verifier's reason |
|---|---|---|
| 201f008d | 0b676b66 | Identical on every plain-data input (300,000-case differential fuzz, 0 differences), but the old loop stopped at the first match while the new one reads every combat. Inputs with throwing getters or lazy iterables now throw where the old code returned an answer, and `api.core.combatOnScene` is reachable from the console, so a failure path changed. The oracle test also does not pin the `!!sceneId &&` short-circuit. |

## Recorded for Joe

- **defect** movement-edge-1 — `foundry/module/pentaryn-movement/ghost.mjs:317`: after a fight clears ghost, viewing another scene while that fight still runs toasts "The fight is over" and uses up the one-time toast, so nothing is said when the fight really ends. Either remember the cleared scene and send `back.combat` only once `combatOnScene(combatSummaries(), clearedScene)` is false, or use a neutral scene-change toast (new lang key).
- **defect** movement-async-1 — `foundry/module/pentaryn-movement/ghost.mjs:263`: a quick double click on the GM flip computes the second flip from the pre-write policy. Its write is a no-op but its toast names a mode that never takes effect. Serialise onGmFlip and setPolicy with a module-scope Semaphore(1) or a chained pending promise.
- **defect** rob-4 — `foundry/module/pentaryn-movement/api.mjs:37`: selftest's "settings readable" check can never fail, because setting() falls back to the row default when get throws. Read raw through `game.settings.get` in a try/catch, or check `game.settings.settings.has(\`${MODULE}.${key}\`)`.
- rob-1 — `foundry/module/pentaryn-movement/api.mjs:26`: `pinsUnderTokens("sceneId")` throws a raw TypeError. Decide between (A) resolving a string through `game.scenes.get` (unknown id gives []) and (B) a coded error from lib/errors; either needs a manifest param update.
- rob-2 — `foundry/module/pentaryn-movement/ghost.mjs:62`: `ghostFor(TokenDocument)` returns false, indistinguishable from "not ghosting". Accept a `documentName === "Token"` doc in the API path, or document in the manifest that a TokenDocument answers false.
- rob-3 — `foundry/module/pentaryn-movement/ghost.mjs:80`: `combatActive(Scene)` and `status("id")` give confident wrong answers. Add a README line that both take a scene id string, or normalise `sceneId?.id ?? sceneId`.
- movement-edge-3 — `foundry/module/pentaryn-movement/ghost.mjs:50`: with two tabs on one player account, a ghost or ownedOnTop toggle leaves the other tab's cached ghost context stale. Add a window `storage` listener for `pentaryn-movement.ghost`/`ownedOnTop` that invalidates and refreshes (removed in uninstall), or document the cache as per tab. Also covers movement-async-2.
- movement-edge-4 — `foundry/module/pentaryn-movement/ghost.mjs:37`: `combatActive(null)` always answers false while `status({sceneId:null})` answers for the viewed scene, though both manifest rows say the default is "the viewed scene". Align on `sceneId ?? canvas.scene.id`, or reword the manifest (describe golden changes).
- movement-edge-5 — `foundry/module/pentaryn-movement/combat-adapter.mjs:30`: pinsUnderTokens ignores Foundry 14 scene levels, so a pin on one level is reported under a token on another. Decide whether to drop pairs where `note.levels` is non-empty and lacks the token's level.
- perf-1 — `foundry/module/pentaryn-movement/ghost.mjs:188`: refreshState on a raised owned token writes mesh.sort twice per frame on player clients. Revisit only if profiling shows primary-group sorting in a frame budget; a fix needs a new Token#_refreshState wrap and adjustments row.
- movement-mnt-2 (reverted 201f008d) — `foundry/module/pentaryn-movement/movement-core.mjs` (combatOnScene): decide whether non-contract inputs (throwing getters, lazy iterables) are out of scope. If so, re-apply 201f008d and add a test pinning the `!!sceneId &&` short-circuit.
- EXT-4 (deferred: cap) — `foundry/module/pentaryn-movement/movement-core.mjs:229`: derive flipPolicy's remembered mode as `const r = normalizePolicy(last); const remembered = r === "off" ? DEFAULT_POLICY : r;`, with an exhaustive check against a frozen copy of the old function.
- EXT-3 (deferred: cap) — `foundry/module/pentaryn-movement/ghost.mjs:102`: a WRAPS table with patchOne(row) and a shared patched(), keeping wrap order, warn texts and the `{drag, keyboard}` key order byte-identical.

## Verification

- 9a109e8b — keep
- d236a0c4 — keep
- d2294597 — keep
- 5441d234 — keep
- 9c52d13c — keep
- 1b8a3427 — keep
- 787c8487 — keep
- b5600203 — keep
- ce418149 — keep
- 201f008d — revert (0b676b66)

## Gates

- `make` gate for movement (node test/run.mjs, vendored kit check, conformance, diff scope, golden diff): ok. 172 tests, 172 pass, 0 fail. The vendored kit is identical to foundry/lib (10 files). Conformance is 100.0 % (49/49 fail-class rules). The diff scope is all inside `foundry/module/pentaryn-movement/**`, and the untouchables are clean.
- `make check-context` with this record in place: pass (exit 0, "context surface OK", 5 pre-existing warnings in other plan files).
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
