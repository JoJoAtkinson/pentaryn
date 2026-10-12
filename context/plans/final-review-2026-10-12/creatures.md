---
title: "Final review 2026-10-12 — creatures"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of creatures found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — creatures

## Verdict

**NEEDS-JOE.** The kept changes are behaviour-preserving and the gate is green, but real defects are still recorded: setting handlers survive `uninstall()`, `api.list` mishandles a user-id string (the only form the bridge can send) and `null`, `syncAll` stops at the first failing scene, and flag traffic can starve the strip redraw.

## Scope

- Paths: `foundry/module/pentaryn-creatures/**` (module `pentaryn-creatures`) and this record.
- Base: `6a06664c` (origin/main when the review started).
- Branch: `review/creatures`, worktree `pentaryn-review-creatures-wt`.
- Triage: 31 findings, giving 10 DO-REFACTOR, 0 DO-EDGE, 12 RECORD and 9 DROP (5 of them duplicates).

## Findings by lens

Line numbers are at the review HEAD.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| M1 | api-manifest.mjs:5 | low | DO-REFACTOR, kept | Header says only `inspect` names its first param `ref`, which the kit resolves; legacy rows take raw args |
| creatures-async-2 | light.mjs:6 | low | DO-REFACTOR, kept | Header says every tab of the active GM user writes (harmless: lightUpdate is deterministic) |
| M7 | owner-sees.mjs:3 | low | DO-REFACTOR, kept | Header says which gates ownerOverride checks itself and which core's ownerShouldSee decides |
| ext-8 | README.md (Extending) | low | DO-REFACTOR, kept | Every creatures-core export is public `api.core`, pinned in surface.json |
| M9 | README.md (strip) | low | DO-REFACTOR, kept | Strip redraw triggers list actor id, link and delta, matching STRIP_KEYS |
| M3 | strip.mjs | low | DO-REFACTOR, kept | `STRIP_ID = MODULE` from core instead of a repeated literal |
| ext-1 | creatures.mjs | low | DO-REFACTOR, reverted | FEATURES split into BODY / AFTER_INIT lists for the boot branch; the new test did not pin its claim |
| ext-4 | creature-strip.mjs:14 | low | DO-REFACTOR, kept | Strip redraw debounce uses core's `makeCoalescer(60, …, {mode: "debounce"})` |
| ext-6 | settings.mjs:23 | low | DO-REFACTOR, kept | Settings rows route onChange through one `routed(key)` helper, plus a guard test |
| M2 | test/glue.test.mjs:3 | low | DO-REFACTOR, kept | Test comments describe the code as it is now (fixed window, KNOWN rows all fixed, strip.mjs) |
| creatures-edge-1 (+ext-2) | settings.mjs:15 | medium | RECORD | `uninstall()` leaves the setting onChange handlers in place |
| creatures-rob-1 | strip.mjs:20 | medium | RECORD | `api.list(userIdString, scene)` answers at default ownership |
| creatures-rob-2 | strip.mjs:20 | low | RECORD | `api.list(null, scene)` throws though `user` is declared optional |
| creatures-rob-3 (+edge-2) | light.mjs:67 | low | RECORD | syncAll stops at the first scene whose write rejects |
| creatures-rob-4 | light.mjs:52 | low | RECORD | `api.syncScene` with a bad scene throws a raw TypeError on the GM, resolves 0 elsewhere |
| creatures-rob-5 | api.mjs:72 | low | RECORD | `api.isCreature` trusts a TokenDocument; null throws, a placeable loses token-level flags |
| creatures-edge-3 (+perf-1) | creature-strip.mjs:14 | low | RECORD | Pure 60 ms debounce can be starved by steady token flag traffic |
| creatures-async-1 | light.mjs:67 | low | RECORD | One updateEmbeddedDocuments per scene; modifyBatch could batch them |
| M5 | creatures-core.mjs:267 | low | RECORD | readOurLight and countLit repeat the same "is our light value" predicate |
| M8 | creatures.mjs:8 | low | RECORD | Header says "in load order" but the import order differs |
| ext-3 | light.mjs:89 | low | RECORD | Actor/user change filters are inline `in` ladders, not named tables |
| ext-9 | api.mjs:30 | low | RECORD | status() hard-codes the four setting keys; a fifth SETTINGS row would be missed silently |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 90f735cb | M1: api-manifest header comment corrected (no row data changed) | n/a (comment only); describe/surface goldens byte-identical |
| ed088327 | async-2: light.mjs header on who writes (comment only) | n/a (comment only) |
| 76746ce1 | M7: owner-sees.mjs header on the gates (comment only) | n/a (comment only) |
| d9a7abe6 | ext-8: README Extending says core exports are pinned API | n/a (docs only) |
| 552d3c32 | M9: README strip redraw triggers | `test/seams.test.mjs` STRIP_KEYS pin (unchanged) |
| 381298e2 | M3: `STRIP_ID = MODULE` (same string) | `test/css.test.mjs` strip id is MODULE; strip golden; glue DOM assertions |
| 82383368 | ext-4: strip render on `makeCoalescer` debounce | transform-creatures-25 / -26 tests, uninstall and hot-patch tests, "ready (player) … strip after 60 ms" |
| 5ba78313 | ext-6: `routed(key)` onChange helper | `test/settings.test.mjs`: "every SETTINGS row's onChange reaches the handler registered for its own key"; glue onChange tests |
| e42a9136 | M2: test comments only | n/a (comments only; same test counts) |

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| ecf673d4 | 79a98e7a | The code half is behaviour-preserving, but the new test overclaims: it passes on origin/main's source and still passes with owner-sees removed from boot, because owner-sees registers only `once("setup")` on boot and nothing on hot re-import, and the test compares only `on` rows. It also hard-codes 13, duplicating the hot-patch row list. |

## Recorded for Joe

- **defect** `settings.mjs:15` / `creatures.mjs:61` (creatures-edge-1, merged ext-2): `uninstall()` leaves the module-level setting `handlers`, so after `api.uninstall()` toggling showStrip re-mounts the strip and its dock poll, and a lightRadius change on the active GM runs syncAll and writes token lights, contradicting "Remove every hook, the wrap, the strip and the light queue". Export a `clearSettingHandlers()` from settings.mjs and call it from uninstall before `reg.offAll()`; pin with a player test (strip stays null after toggling) and a GM test (no writes after lightRadius 0). Same pattern in pentaryn-movement; arguably belongs in the kit's lib/settings.mjs.
- **defect** `api.mjs:67` / `strip.mjs:20` (creatures-rob-1): `api.list("<userId>", scene)`, the only form the bridge can send, answers at the actor's default ownership (dropping the player's summons, counting default-OWNER tokens). Resolve a string user (and scene) with `resolveRef` as inspect does; pin `list(id)` equals `list(userDoc)`.
- **defect** `api.mjs:67` / `strip.mjs:20` (creatures-rob-2): `api.list(null, scene)` throws a TypeError although api-manifest.mjs:22 declares `user` optional with "default: this client's user". Use `x.list(user ?? undefined, scene)`; pin it deep-equals `list(undefined, scene)`.
- **defect** `light.mjs:67` (creatures-rob-3, merged edge-2): syncAll has no per-scene catch, so one rejected write skips every later scene on ready and on a lightRadius change, while the queued flush (light.mjs:47) isolates each scene. Catch per scene with the flush's warning; this moves the pinned failure text at glue.test.mjs:331.
- **defect** `creature-strip.mjs:14` (creatures-edge-3, merged perf-1): the strip render is a pure 60 ms debounce and STRIP_KEYS includes `flags`, so steady flag traffic from other modules can postpone a due redraw indefinitely (the starvation light.mjs fixed with window mode in transform-creatures-26). Switch to `{mode: "window"}` (one word now that ext-4 landed) and optionally narrow the flags trigger to item-piles / pentaryn-aoe via a core seam (surface.json change); moves the glue-player.test.mjs:238 pin and the README trigger line.
- `light.mjs:52` / `api.mjs` syncScene row (creatures-rob-4): `api.syncScene` with a missing or string scene rejects with a raw TypeError on the active GM but resolves 0 elsewhere. Resolve with `resolveRef(scene, "scene")` or return `fail("BAD_ARGS")` as a declared change.
- `api.mjs:72` (creatures-rob-5): `api.isCreature` trusts a TokenDocument (null throws; a placeable loses token-level flag reads). No action unless the API is widened; then normalise with `tokenDoc?.document ?? tokenDoc` as a declared change.
- `light.mjs:67` (creatures-async-1): syncAll and flush write one `updateEmbeddedDocuments` per scene; `foundry.documents.modifyBatch` could send one round trip but loses per-scene isolation. Low value at current sizes.
- `creatures.mjs` (ext-1, reverted ecf673d4): if wanted, re-land the BODY_FEATURES / AFTER_INIT_FEATURES split with no new test (the golden and manifest tests already guard it), or with a test that scans the entry source.
- `creatures-core.mjs:267` (M5, deferred by cap): a non-exported `isLightValue` used by readOurLight (line 64) and countLit; do not export it (surface.json) and leave api.mjs `num` alone.
- `creatures.mjs:8` (M8, deferred by cap): change "Files, in load order:" to "Files (core first, then the features, then the API):".
- `light.mjs:89`, `creature-strip.mjs:41`, `creature-strip.mjs:44` (ext-3, deferred by cap): replace inline `in` ladders with module-private frozen key tables; moving them into core as tested seams needs a surface.json update.
- `api.mjs:30` (ext-9, deferred by cap): a test-only guard in api.test.mjs that every SETTINGS key is in `api.status()` and named in the status row's `returns` string.

## Verification

- 90f735cb: keep
- ed088327: keep
- 76746ce1: keep
- d9a7abe6: keep
- 552d3c32: keep
- 381298e2: keep
- ecf673d4: revert (79a98e7a)
- 82383368: keep
- 5ba78313: keep
- e42a9136: keep

## Gates

- Module gate (`make foundry-creatures-check`): exit 0. 106 tests pass, 0 fail; core 73 passed, 0 failed. The vendored kit is identical to foundry/lib (12 files). pentaryn-creatures conformance is 100.0% (50/50), with no new exception rows. The diff stays inside scope.
- `make check-context` passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
