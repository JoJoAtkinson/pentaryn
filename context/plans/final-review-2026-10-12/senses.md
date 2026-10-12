---
title: "Final review 2026-10-12 — senses"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of senses found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — senses

## Verdict

**NEEDS-JOE.** The kept changes are behaviour-preserving and the gate is green. Real defects are still recorded, though: the carried-light debounce collides on shared actor ids (the fix was reverted), two GM tabs each run the Light reconcile, hand-authored shard lights never converge, and the tooltip and aria text escape names inconsistently.

## Scope

- Paths: `foundry/module/pentaryn-senses/**` (module `pentaryn-senses`) and this record.
- Base: `4b75feeb` (origin/main when the review started).
- Branch: `review/senses`, worktree `pentaryn-review-senses-wt`.
- Triage: 43 findings, giving 10 DO (4 DO-EDGE, 6 DO-REFACTOR), 20 RECORD and 13 DROP (8 duplicates or merged, 5 not worth a commit).

## Findings by lens

Line numbers are at the review HEAD.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| R3 | chain.mjs:81 | low | DO-EDGE, kept | `link()` chained two Actors or two Items and reported success; it now refuses non-Token documents |
| R1 | carried.mjs:139 | low | DO-EDGE, reverted | The carried-light debounce is keyed by `actor.id`, so a synthetic or pack actor's schedule cancels the world actor's sync |
| R2 | carried.mjs:63 | low | DO-EDGE, kept | `syncLight(synthetic)` also wrote the base actor's linked tokens |
| R4 | api.mjs:38, migrate.mjs:14 | low | DO-EDGE, reverted | `inspect(ref, null)` / `resetSight(null)` throw a TypeError |
| M4 | chain.mjs:82, core/light.mjs:277 | low | DO-REFACTOR, kept | Hand-built flag paths are replaced by `FLAGS.chain` / `FLAGS.spellLight` |
| M5 | migrate.mjs:15 | low | DO-REFACTOR, kept | resetSight gates on the kit's `isActiveGM()` (covers EXT-10) |
| M1 (+R7) | carried.mjs:41-70 | low | DO-REFACTOR, kept | planLight and syncLight share `protoUpdate` / `tokenUpdates`, and a stale comment is reworded |
| M3 | chain.mjs:341 | low | DO-REFACTOR, kept | The local `chainChanged` is renamed `ourFlagsChanged` and commented (it tests the whole flag scope) |
| M7 | core/light.mjs header | low | DO-REFACTOR, kept | Comments name carried.mjs, not senses.mjs |
| M8 (+EXT-14) | senses.mjs, api.mjs, chain.mjs headers | low | DO-REFACTOR, kept | Header inventories brought up to date |
| M2 | light.mjs:197 | low | RECORD | reconcile() is a 95-line body doing five jobs |
| M6 | core/light.mjs:19 | low | RECORD | Dead `export { MODULE }` re-exports in core/light, core/chain, core/migrate |
| M9 | light.mjs:415 | low | RECORD | `cast` is bound into light-ui but never used there |
| M10 (=EXT-3) | light-ui.mjs:267 | low | RECORD | Token HUD button builder duplicated between chain.mjs and light-ui.mjs |
| M11 | api-manifest.mjs:168 | low | RECORD | syncAll row doc says "one after another", but syncAll batches |
| R5 | senses.mjs:104 | low | RECORD | One bad write in the ready syncAll skips the whole Light sweep |
| R6 | chain.mjs:36 | low | RECORD | Five files log through hand-prefixed `console.*` instead of the kit log |
| EXT-2 | light-ui.mjs:204 | medium | RECORD | Light actions are spelled out twice (prompt dialog and chat card) |
| EXT-4 | light.mjs:162 | medium | RECORD | Which profiles get an item Light activity is a hard-coded "torch" |
| EXT-6 | api-manifest.mjs:219 | low | RECORD | `MANIFEST.flags.writes` leaves out `lightToggle` |
| EXT-7 | api-manifest.mjs:97 | low | RECORD | profileFor row doc hard-codes the five profile keys with no drift check |
| EXT-9 | light.mjs:43 | low | RECORD | The owner check is pasted three times; hood refuses a non-owner silently |
| EXT-11 | light-ui.mjs:42 | low | RECORD | `light.prompt` can resolve to onMe's notification, not boolean or undefined |
| senses-edge-3 | light-ui.mjs:250 | low | RECORD | Names are escaped in the Outshone tip but raw in the LinkTo tip, and one string feeds both data-tooltip and aria-label |
| senses-edge-4 | core/light.mjs:326 | low | RECORD | A shard light that Foundry normalises never converges, so syncs overcount |
| senses-ac-1 | light.mjs:267 | medium | RECORD | The Light reconcile is elected per GM user, not per tab |
| senses-ac-2 | light-ui.mjs:288 | low | RECORD | The orphan "End light" HUD click does nothing silently for a non-active GM |
| senses-ac-3 (=perf-4) | light.mjs:154 | low | RECORD | setupLight awaits one item.update per torch |
| perf-1 | chain.mjs:205 | low | RECORD | paint() recomputes chainPairs although pairsCache holds them |
| perf-2 | carried.mjs:38 | low | RECORD | Each carried sync scans every token on every scene |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 10f37cb6 | R3: `link()` returns false unless both resolved documents are Tokens | `test/chain-refs.test.mjs`: "link(): non-Token documents are refused and write nothing" (failed before the fix) |
| 1e1e153f | R2: syncLight skips linked tokens when the actor is a synthetic | `test/carried-edges.test.mjs`: "syncLight(synthetic) leaves the base actor's linked tokens alone" (failed before the fix) |
| e20b7881 | M4: chain.link and spellLightUpdate use `FLAGS.chain` / `FLAGS.spellLight` (same strings) | chain-link, light-*.json and light-two-casters goldens; light-core spellLightUpdate rows; "FLAGS are the module's paths" |
| 5114b234 | M5: resetSight gates on `isActiveGM()` from lib/election.mjs | `test/glue.test.mjs`: "resetSight: once per world; force runs it again; it refuses off the active GM's terms" |
| 0d5a045f | M1 + R7: `protoUpdate` / `tokenUpdates` shared by planLight and syncLight; write order unchanged | carried.test seeded oracle; carried-index, carried-batch, carried-errors, carried-edges tests |
| 7d5f9c91 | M3: rename `chainChanged` to `ourFlagsChanged`, plus a comment | chain.test, chain-perf.test, hooks.test; hooks and describe goldens byte-identical |
| 1cb18f99 | M7: core/light.mjs comments name the real users (comment only) | n/a (comment only) |
| 8bdbaa09 | M8: header inventories in senses.mjs, api.mjs and chain.mjs (comment only) | n/a (comment only) |

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| 489d30a8 | 84e10c29 | A behaviour change. Mapping a synthetic actor to `game.actors.get(actor.id)` makes updateItem on an unlinked token's torch, or createToken of an unlinked token, write the world actor's `prototypeToken.light` (0 writes before, 1 after). The pack-actor early return on its own was probably fine; a behaviour-preserving fix would key the debounce by `actor.uuid`. |
| 868db71c | cb937f30 | A behaviour change, not a DO-EDGE. No promise covers null opts (README, describe and golden say only `optional: true`), and the MCP bridge and kit root always pass an object. With the reset pending, `resetSight(null)` used to reject with no writes and now writes settings and documents. |

## Recorded for Joe

- **defect** `carried.mjs:139` (R1, reverted 489d30a8): the debounce timer is keyed by `actor.id`. A token's synthetic actor shares its base actor's id, so a synthetic schedule cancels a pending base-actor (prototype) sync, and a pack actor with a world actor's id cancels the world sync. Re-do it as a debounce keyed by `actor.uuid` plus the pack-actor early return, with the two schedule tests from 489d30a8 and a pin that a synthetic-only schedule writes no prototype.
- **defect** `light.mjs:267` (senses-ac-1): the Light reconcile is elected per GM user, not per tab. Two GM tabs (MCP bridge plus a browser) each create the square and whisper "Gone". The twin square survives a hand delete, and tidyOldSummons sends its deletes from both tabs. Options: a deterministic AmbientLight `_id` with keepId (probe on v14 first), a `queue(source)` after create, or a one-tab claim for the whisper.
- **defect** `core/light.mjs:326` (senses-edge-4): the "already applied" check compares raw flag values strictly, so a hand-authored shard light that Foundry normalises (`#FF0000`, unknown keys) never converges, and syncLight/syncAll rewrite it and overcount every time. Normalise before comparing, or document that shard flags must use lowercase `#rrggbb` and LightData keys only.
- **defect** `light-ui.mjs:250` / `chain.mjs:287` (senses-edge-3): names are HTML-escaped in the Outshone tip but raw in the LinkTo tip, and one string feeds both `data-tooltip` and `aria-label`, so a name with `& < > " '` is shown or read wrong in one place. Check how v14's TooltipManager renders data-tooltip, fix one side, and set aria-label from the plain text.
- `api.mjs:38` / `migrate.mjs:14` (R4, reverted 868db71c): `inspect(ref, null)` and `resetSight(null)` throw. If Joe wants null treated as omitted, make it a declared change across every module's opts rows together (riders made the same call).
- `api-manifest.mjs:219` (EXT-6): add `flags.pentaryn-senses.lightToggle` to `MANIFEST.flags.writes` and regenerate describe.json; add an api.test check that every written flag key is listed.
- `api-manifest.mjs:168` (M11): reword the syncAll row to "one Actor batch for the prototypes, then one Token batch per scene" and regenerate describe.json (`GOLDEN_UPDATE=1 node --test test/api.test.mjs`).
- `light-ui.mjs:42` (EXT-11): the `light.prompt` row says boolean | undefined, but `prompt('me')` with no scene or token resolves to onMe's notification. Widen the row (describe golden change) or coerce in prompt (behaviour change).
- `senses.mjs:104` (R5): give the ready syncAll its own `.catch(e => log.warn("carried sync", e))` so one bad Actor batch no longer skips the Light sweep; flip the glue-ready-errors characterisation.
- `light-ui.mjs:288` (senses-ac-2): only the active GM's click on the orphan "End light" HUD button does anything, and other GMs get no message. Show it only to `isActiveGM()`, or warn, or forward the click.
- `light.mjs:154` (senses-ac-3 / perf-4): setupLight awaits one `item.update` per torch. Plan first, then one `updateDocuments` per parent, keeping n; re-pin setup-light.json. Separately, C59 could follow same-file helpers (outside scope).
- `light.mjs:43` (EXT-9): extract `ownerOrWarn(item)` for cast, end and toggle. Whether hood should also warn a non-owner is Joe's call.
- `chain.mjs:205` (perf-1): no change now. If paint ever shows in the frame budget, paint from cached pairs and have repaint() call forgetPairs() first.
- `carried.mjs:38` (perf-2): if world size grows, share one tokens-by-actor index per debounce tick. Not needed at current sizes.
- `light.mjs:197` (M2, deferred by cap): split reconcile into resolveDesired / restoreTokens / removeSquares / applyWanted / resyncCarried / remember, keeping the await order.
- `core/light.mjs:19` (M6, deferred by cap): import MODULE from `./core/ids.mjs` in senses-core.mjs and drop the three dead re-exports.
- `light.mjs:415` (M9, deferred by cap): drop `cast` from bindActions and from the light-ui.mjs:17 comment.
- `light-ui.mjs:267` (M10 / EXT-3, deferred by cap): a shared hud-dom.mjs (rootOf, hudColumn, hudButton) for chain.mjs and light-ui.mjs.
- `chain.mjs:36` (R6, deferred by cap): route chain, light, migrate, light-ui and argon logging through the kit log with identical text.
- `light-ui.mjs:204` (EXT-2, deferred by cap): one frozen LIGHT_ACTIONS table for the card row and the dialog buttons.
- `light.mjs:162` (EXT-4, deferred by cap): export `ACTIVITY_PROFILES` from core/light.mjs and mention it in the README "add a light source" recipe.
- `api-manifest.mjs:97` (EXT-7, deferred by cap): a test-only drift check that the profileFor row and README name every LIGHT_PROFILES key.

## Verification

- 10f37cb6: keep
- 489d30a8: revert (84e10c29)
- 1e1e153f: keep
- 868db71c: revert (cb937f30)
- e20b7881: keep
- 5114b234: keep
- 0d5a045f: keep
- 7d5f9c91: keep
- 1cb18f99: keep
- 8bdbaa09: keep

## Gates

- Module gate (`node test/run.mjs`, kit identity, conformance): ok. 156 tests, 156 pass, 0 fail. The vendored kit is identical to foundry/lib (10 files). pentaryn-senses conformance is 100.0% (49/49 fail-class rules), with no new exception rows. The diff stays inside scope.
- `make check-context` passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
