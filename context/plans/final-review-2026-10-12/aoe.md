---
title: "Final review 2026-10-12 — aoe"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of aoe found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — aoe

## Verdict

**NEEDS-JOE**: eight refactors and one edge fix were kept with the suite green and the goldens byte-identical, but the review recorded real defects that need a behaviour change, so Joe has to decide them. They include double damage on overlapping or partly failed Apply, the refund veto disagreeing with refund(), and lost updates between GM tabs.

## Scope

- Paths: `foundry/module/pentaryn-aoe/**` (module `aoe`, kind module), plus this record.
- Base: `bb93da9f` (origin/main of `/Users/joe/Documents/GitHub/pentaryn`).
- Branch: `review/aoe`, worktree `/Users/joe/Documents/GitHub/pentaryn-review-aoe-wt`.
- Triage: 48 findings. 10 were DO (3 DO-EDGE, 7 DO-REFACTOR), 21 RECORD (7 of them deferred: cap), and 17 DROP (13 duplicates, 4 not worth a commit).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| aoe-edge-1 | resolve.mjs:376 | medium | DO-EDGE → reverted | Two overlapping applyRows calls on one tray apply each row twice |
| R3 | api.mjs:28 | low | DO-EDGE → reverted | latestResolution `{sceneId:"current"}` with no viewed scene returns a tray from any scene |
| R2 | effects.mjs (cardEffects, pendingFor) | low | DO-EDGE → kept | cardEffects and pendingFor ignored a message id despite `ChatMessage\|id` |
| aoe-mnt-9 | test/legacy-core.mjs | low | DO-REFACTOR → kept | Legacy core suite duplicated core.test.mjs |
| aoe-mnt-3 | core.mjs / api.mjs / resolve.mjs | low | DO-REFACTOR → kept | The 60-message window was written in two places |
| EXT-7 | core.mjs / areas.mjs / refund.mjs | low | DO-REFACTOR → kept | Race-refusal regexes were inlined in several places |
| aoe-mnt-5 | careful.mjs | low | DO-REFACTOR → kept | Careful Spell creature count was computed twice |
| aoe-mnt-6 | core.mjs:246 | low | DO-REFACTOR → kept | regionFromSpell re-implemented regionOfActivity inline |
| aoe-mnt-8 | areas.mjs:212 | low | DO-REFACTOR → kept | deleteHandlesOf had a dead `scene.tokens.has` filter |
| aoe-mnt-2 | aoe.mjs (header) | low | DO-REFACTOR → kept | Hot-patch header comment contradicted itself |
| aoe-mnt-1 | refund.mjs:68 | medium | RECORD | Refund veto accepts a no-spend concentration cast that refund() then ignores |
| R1 | resolve.mjs:385 | medium | RECORD | One rejecting applyDamage leaves the rows already damaged unmarked, so they are damaged again |
| R4 | resolve.mjs:256 | low | RECORD | One rejecting NPC save discards the whole pass |
| R5 | resolve.mjs:246 | low | RECORD | A null DC makes an NPC save a success and a player save a failure |
| R7 | aoe.mjs:111 | low | RECORD | A publishNamespace throw at ready skips the rest of ready |
| EXT-1 | api-manifest.mjs:74 | medium | RECORD | MANIFEST.flags is missing two dnd5e writes and one core read |
| aoe-edge-2 | tray.mjs:70 | medium | RECORD | The unlocked area picker revives superseded trays and resets applied rows |
| aoe-edge-3 | areas.mjs:408 | medium | RECORD | The canvasReady sweep is lost after a startup error or a GM handover |
| aoe-edge-4 | areas.mjs:351 | low | RECORD | Two-session deletes log errors and abort the job, though the README says "idempotent" |
| aoe-edge-7 | resolve.mjs:416 | low | RECORD | setRow coerces a null multiplier to ×0 and 'abc' to NaN |
| aoe-edge-8 | tray.mjs:132 | low | RECORD | On a non-active GM the area picker silently does nothing |
| AC-1 | resolve.mjs:437 | medium | RECORD | Save matching runs unclaimed in every GM tab, so whole-resolution writes are lost |
| AC-6 | resolve.mjs:207 | low | RECORD | resolve() writes outside the per-message mutate queue |
| AC-7 | areas.mjs:244 | low | RECORD | The sweep creates handles one region at a time |
| EXT-2 | aoe.mjs:90 | low | RECORD (deferred: cap) | Feature init/ready work is called by name outside FEATURES |
| EXT-3 | tray.mjs:21 | low | RECORD (deferred: cap) | MULT_LABEL lives apart from core.MULTIPLIERS |
| R8 | settings.mjs:102 | low | RECORD (deferred: cap) | Settings migration uses console.info instead of the kit log |
| aoe-perf-1 | tray.mjs:27 | low | RECORD (deferred: cap) | Damages are re-hydrated once per row on each render |
| aoe-perf-2 | effects.mjs:122 | low | RECORD (deferred: cap) | spellOf runs before the cheap name/disabled filter |
| aoe-mnt-7 | scene-adapter.mjs:23 | low | RECORD (deferred: cap) | handleFor reads the attached token by hand instead of attachedTokenId |
| aoe-mnt-10 | areas.mjs:66 | low | RECORD (deferred: cap) | Handle actor invariants are written in two or three places |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 9d1cdb4d | `messageFrom` in messages-adapter.mjs; cardEffects and pendingFor accept a message id | effects.test.mjs "cardEffects and pendingFor accept a message id (ChatMessage\|id)" |
| a214992e | Deleted test/legacy-core.mjs (all 160 checks already in core.test / glue.test); `LEGACY = []` | core.test.mjs (ported checks), conformance C43 still green |
| 7027024d | One exported `RECENT_MESSAGES = 60` in core.mjs, used by api.mjs and resolve.mjs | core-moves.test.mjs "RECENT_MESSAGES is the 60-message window the manifest documents" |
| fb2df17a | `alreadyExists` / `doesNotExist` predicates in core.mjs, used by areas.mjs and refund.mjs | core-moves.test.mjs "alreadyExists / doesNotExist: the two-session race refusals" |
| 4446fcb4 | Private `carefulMax(actor)` helper in careful.mjs | Existing careful tests; full suite |
| 6af1f731 | regionFromSpell calls regionOfActivity | Existing regionFromSpell / regionOfActivity checks in core.test.mjs; areas.test golden |
| 7aaba97f | Dropped the dead filter in deleteHandlesOf (areas.mjs:212) | Existing areas.test delete-cascade and handle-race cases |
| 9e9f6eb5 | aoe.mjs header describes both hot-patch variants (comment only) | Full suite (jsdoc.test, docs-drift.test) |

## Changes reverted by verification

| commit | revert | verifier's reason |
|---|---|---|
| 860d445d | 5ed2de8f | The test does pin the double apply, but `next.then(done, done)` marks the returned promise handled, so a fire-and-forget caller's unhandled rejection is silently swallowed. A stuck applyDamage now blocks every later Apply on that message until a reload, and disjoint-row calls are serialised (the write order changes). |
| 68d40143 | fac59782 | Changes a query answer that the bridge can reach: `{sceneId:"current"}` with no viewed scene used to return the newest live tray from any scene and would now return null. The promise it cited is inferred, not stated. |

## Recorded for Joe

- **defect** aoe-edge-1 — `foundry/module/pentaryn-aoe/resolve.mjs:376`: two overlapping applyRows calls on one tray damage each row twice, which breaks the manifest's "safe to repeat". The reverted 860d445d is salvageable. Return `next.then(v => v)` so rejections stay visible, and decide what a stuck Apply should do (settle timeout or not). Cross-tab overlap is still AC-1.
- R3 — `foundry/module/pentaryn-aoe/api.mjs:28`: decide whether `latestResolution({sceneId:"current"})` with no viewed scene should return null (reverted 68d40143) or keep returning the newest tray from any scene. Then document the choice in the manifest.
- R2 follow-up — `foundry/module/pentaryn-aoe/effects.mjs:173`: selfApply is documented as `ChatMessage|id` but only takes a document. Decide whether to route it through `messageFrom` like cardEffects and pendingFor. Not changed here because it writes.
- **defect** aoe-mnt-1 — `foundry/module/pentaryn-aoe/refund.mjs:68`: the synchronous veto accepts a cast that spent nothing but began concentration, while refund() requires `consumed`. The follow-ups are vetoed but nothing is refunded or cleaned up. Pick (a) a veto built from placementCancelled's inputs, or (b) refund() ending concentration and removing the card. Rewrite refund.test.mjs:72 to match.
- **defect** R1 — `foundry/module/pentaryn-aoe/resolve.mjs:385`: if one row's applyDamage rejects, the rows already damaged are never marked applied, and the next Apply damages them again. Write `done` through mutate in a finally block, or catch per row.
- R4 — `foundry/module/pentaryn-aoe/resolve.mjs:256`: one rejecting NPC save discards every save already rolled, and inside resolve() it also skips the request card and autoApplyNpc. Catch per row, or keep partial results with try/finally.
- R5 — `foundry/module/pentaryn-aoe/resolve.mjs:246`: with a null DC, an NPC save succeeds (`n >= null`) while a player save fails. Make a rules call and use one `Number.isFinite(res.dc)` guard in rollOne and onSaveMessage.
- R7 — `foundry/module/pentaryn-aoe/aoe.mjs:111`: a publishNamespace throw at ready skips the Argon guard, the settings migration and readyAreas. Wrap it in try/catch with `log.error('publish', err)` on the non-hot path only (glue.test W2-K1 pins the throw).
- EXT-1 — `foundry/module/pentaryn-aoe/api-manifest.mjs:74`: add `flags.dnd5e.lockSize`, `flags.dnd5e.requestResult` (writes) and `flags.core.MeasuredTemplate` (read) to MANIFEST.flags, regenerate golden/describe.json, and add the README "Data written" rows.
- **defect** aoe-edge-2 — `foundry/module/pentaryn-aoe/tray.mjs:70`: the area picker is never locked. Re-resolving a superseded or applied tray revives it and resets the applied rows, so the same damage can be applied again. Either disable the picker (golden/tray-html.json changes), or make resolve() keep applied rows and refuse to un-supersede.
- **defect** aoe-edge-3 — `foundry/module/pentaryn-aoe/areas.mjs:408`: canvasReady is registered only after the startup awaits succeed, and only on the GM that is active at ready. Register it before the awaits (or in a finally), and optionally for every GM.
- **defect** aoe-edge-4 — `foundry/module/pentaryn-aoe/areas.mjs:351`: with two GM sessions, deleteHandlesOf, the concentration cleanup (:385) and the sweep's orphan delete (:225) log the losing tab's "does not exist" at error level and abort the rest of the job. Treat `doesNotExist` as success at those three sites and correct README "Two sessions".
- aoe-edge-7 — `foundry/module/pentaryn-aoe/resolve.mjs:416`: setRow turns a null multiplier into ×0 and 'abc' into NaN. Optionally reject a non-finite multiplier or one outside MULTIPLIERS.
- aoe-edge-8 — `foundry/module/pentaryn-aoe/tray.mjs:132`: on a non-active GM the area picker does nothing and the select shows a choice that never applied. Render it only where activeGM.isSelf, or show a toast.
- **defect** AC-1 — `foundry/module/pentaryn-aoe/resolve.mjs:437`: player save matching runs unclaimed in every active-GM tab, and each tab writes the whole resolution from its own copy, so a stale tab can undo applied, setRow or re-resolve writes. Cross-tab Apply can double-apply. Gate it on `claimMessage(saveMessage,'matchSave')` or make the writes row-scoped, and correct README "Two sessions".
- AC-6 — `foundry/module/pentaryn-aoe/resolve.mjs:207`: resolve() writes outside the per-message mutate queue, so a concurrent mutate can restore the old area's rows. Chain the first write on `queues.get(message.id)`.
- AC-7 — `foundry/module/pentaryn-aoe/areas.mjs:244`: batch the sweep's handle creation into one Token create (keepId) plus one Region update (golden/ready-calls.json changes).
- EXT-2 (deferred: cap) — `foundry/module/pentaryn-aoe/aoe.mjs:90`: add optional init()/ready(opts) feature exports looped over FEATURES, and document this in README "Extending".
- EXT-3 (deferred: cap) — `foundry/module/pentaryn-aoe/tray.mjs:21`: move MULT_LABEL into core as a frozen MULTIPLIER_LABELS, with a coverage test.
- R8 (deferred: cap) — `foundry/module/pentaryn-aoe/settings.mjs:102`: use `makeLog(MODULE).info` for the migration line (the output stays byte-identical).
- aoe-perf-1 (deferred: cap) — `foundry/module/pentaryn-aoe/tray.mjs:27`: hoist hydrateDamages into trayHTML. Caveat: hydration becomes eager and one array is shared between calls.
- aoe-perf-2 (deferred: cap) — `foundry/module/pentaryn-aoe/effects.mjs:122`: pre-filter by id, disabled and name before calling spellOf under noSpellStacking.
- aoe-mnt-7 (deferred: cap) — `foundry/module/pentaryn-aoe/scene-adapter.mjs:23`: use `attachedTokenId(region)` only after checking the fixtures for live string attachments.
- aoe-mnt-10 (deferred: cap) — `foundry/module/pentaryn-aoe/areas.mjs:66`: one HANDLE_NAME and one HANDLE_SYSTEM source for the handle actor invariants, keeping the golden key order.

## Verification

- 9d1cdb4d — keep
- a214992e — keep
- 7027024d — keep
- fb2df17a — keep
- 4446fcb4 — keep
- 6af1f731 — keep
- 7aaba97f — keep
- 9e9f6eb5 — keep
- 860d445d — revert (5ed2de8f)
- 68d40143 — revert (fac59782)

## Gates

- `make` gate for aoe (node test/run.mjs, vendored kit check, conformance, diff scope, golden diff): ok. 415 tests, 415 pass, 0 fail. The vendored kit is identical to foundry/lib (11 files). Conformance is 100.0 % (50/50 fail-class rules). The diff scope is all inside `foundry/module/pentaryn-aoe/**`, and the untouchables are clean.
- `make check-context` with this record in place: pass (exit 0, "context surface OK", 5 pre-existing warnings in other plan files).
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
