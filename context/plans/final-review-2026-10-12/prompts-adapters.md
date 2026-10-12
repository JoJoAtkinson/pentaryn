---
title: "Final review 2026-10-12 — prompts-adapters"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of prompts-adapters found, changed, and left for Joe. History, not instructions.

## Verdict

**NEEDS-JOE.** Eight refactors were kept and the gate is green with byte-identical goldens. Several recorded items are real defects, though: a failed autosave can delete a marker that had words, a double size-chip click leaves an orphan marker, and the dry run accepts a disposition word that the real run refuses. Each one changes a failure path or the count of writes, so Joe has to decide on them.

## Scope

- Paths: `foundry/module/pentaryn-prompts/*-adapter.mjs`, `dialog.mjs`, `panels.mjs`, `hud-button.mjs`, `tip-ui.mjs`, `tooltip.mjs`, `typeahead.mjs`, `styles/prompts.css`, `templates/**`, plus the module's `test/**` for new tests.
- Base: `bb93da9f` (origin/main when the review started).
- Branch: `review/prompts-adapters`, worktree `pentaryn-review-prompts-adapters-wt`.
- Triage received 43 of the 56 findings. The list was cut off after EC-7, so 13 findings were never triaged. They should be re-run, or Joe can accept the gap.

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| R2 | actor-patch-adapter.mjs:256 | medium | DO-EDGE, reverted | The checkPatch dry run accepts `disposition:"angry"` and the real run refuses it |
| R5 | scene-adapter.mjs, character-adapter.mjs (catches) | low | DO-EDGE, reverted | DP9 promises a debug line from swallowed catches, and these catches print nothing |
| M2 | scene-adapter.mjs | low | DO-REFACTOR, kept | panelFor and the hover tip had duplicate `{builtWithoutProvenance:true}` cache-key literals |
| M4 | dialog.mjs:463,485 | low | DO-REFACTOR, kept | The panel hand-built the `Prompt · <size>` label instead of calling actorName |
| M5 | dialog.mjs | low | DO-REFACTOR, kept | dialog.mjs wrote hand-made console lines instead of using the kit log |
| M7 | sight-adapter.mjs (header) | low | DO-REFACTOR, kept | The header comment was wrong about how Levels are tested |
| M3/M8/M13/EXT-5 | scene-adapter.mjs, actor-patch-adapter.mjs, crops-adapter.mjs, character-adapter.mjs | low | DO-REFACTOR, kept | mapFt was computed twice, Recharge-shape code was duplicated, crops comments were stale, and the ASI/choice read was duplicated (commits below) |
| M1 | panels.mjs:12 | medium | RECORD | The panel hook list misses updateNote and the Light/Tile hooks, which breaks README:39-40 |
| EC-1 | panels.mjs:11 | medium | RECORD | The updateToken filter misses flags-only prompt edits and ring image changes |
| R1 | dialog.mjs:316 | medium | RECORD | #save swallows a failed update and leaves #saved stale, so #finish can delete a marker that has words |
| R3 | actor-patch-adapter.mjs:256 | low | RECORD | checkPatch does not shape-check removeItems, itemUpdates or set |
| R4 | dialog.mjs:365 | low | RECORD | #onSize does not re-check that the marker still exists after its awaits |
| EC-2 | dialog.mjs:365 | medium | RECORD | #onSize has no re-entry guard, so a double click leaves an orphan marker |
| EC-4 | dialog.mjs:389 | low | RECORD | Keys typed during a size swap are lost |
| EC-6 | dialog.mjs:129 | low | RECORD | open() does not re-check PromptDialog.current after its await |
| EC-7 | character-adapter.mjs:564 | low | RECORD | A spell listed twice in one call is added twice |
| M10 | character-adapter.mjs:82 | low | RECORD | poolName (dry run) and namesFor (real run) handle a rejecting fromUuid differently |
| M12 | typeahead-adapter.mjs:26 | low | RECORD | The orphan toast fallback hard-codes English text |
| M16 | markers-adapter.mjs:26 | low | RECORD | markerActorIds is exported but no production code calls it |
| M17 | dialog.mjs:28 | low | RECORD | The private esc does not escape `'`, while tip-ui uses escapeHTML, which does |
| EXT-3 | api-manifest.mjs:51 | low | RECORD | The manifest `returns` strings have drifted: mimeType, the error row's scene, and the model's nav are missing |
| EXT-12 | crops-adapter.mjs:126 | low | RECORD | crops re-derives footprint rects and the token image, and disagrees with scene on hex grids |
| M6 + duplicates | — | — | DROP | 11 dropped, mostly as duplicates. M6's keys are pinned by the dialog-context golden |

The triage counted 22 RECORD items (7 of them deferred by the cap) and 11 DROPs. This review received the RECORD rows up to EXT-12 and part of M9. The rest did not arrive, and they are counted under the 13-finding gap in Scope.

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| d4f4ea24 | M7: the sight-adapter header now matches the per-Level test | comment only; the whole suite |
| d27efa10 | M5: dialog.mjs logs through `makeLog(MODULE)` with the same bytes and levels | dialog.test.mjs console-text pins (:91, :210, :322), unedited |
| cf23ed86 | M4: panel labels come from `actorName(size)` | dialog-panel.json golden, glue panel tests |
| fa8a6ac3 | M2: one frozen `PANEL_OPTS` cache key | cache.test.mjs, whole suite |
| 22fadef8 | panelFor takes mapFt from the scene model it just built | dialog-panel golden, whole suite |
| c20218a5 | one private rechargeUses/useOne/isRechargeDie for the Recharge n-6 shape | recharge-parity tests, patch.test.mjs |
| 88b68d10 | crops-adapter comments now match the scale bar and the returned keys | comment only; crop goldens |
| 2c6418c6 | one private asiLimits/choiceKind for the character dry run and the real run | character tests, whole suite |

## Changes reverted by verification

| commit | revert | verifier's reason |
|---|---|---|
| 0df30e55 (R2) | f6677526 | Behaviour change. On a bad word, the real run now refuses at plan time: 3 writes become 0, the cleanup line and `discarded` entry go away, and the ensureFolder side effect is lost. The check also sits before the other checks, so a patch with a second bad field now gets a different refusal message. |
| 582c0b6d (R5) | a010ab3d | The verifier found no behaviour change with debug off. It reverted on process grounds: the 6 character-adapter debug lines have no direct test. This is a re-land, not a defect. |

## Recorded for Joe

- **defect** R2 — `actor-patch-adapter.mjs:256`: the dry run passes `patch.disposition:"angry"` and the real run throws BAD_SPEC. Re-do 0df30e55 with the check placed *last* in checkPatch, and decide whether the real run may skip the import, copy and stamp writes it does today before throwing.
- R5 — `scene-adapter.mjs` (toHexCubes getOffset, embedHtml) and `character-adapter.mjs` (docAt, onClassList, itemDataFor, canEnchant find, two findItem catches): re-land 582c0b6d with a direct test for each character-adapter debug line.
- R5 note — `scene-adapter.mjs` embedCache keeps a failed @Embed as `""` for the life of the page. A failure that lasts a moment, such as a compendium that has not loaded yet, leaves that embed blank until reload.
- **defect** R1 — `dialog.mjs:316`: when #save fails, #saved stays stale. #finish then deletes a fresh marker as "empty" even though its words did not save, and #onSize re-renders from the stale text. Have #save report failure, and make #finish and #onSize honour it.
- **defect** EC-2 — `dialog.mjs:365`: #onSize has no re-entry guard. A double chip click leaves an orphan duplicate marker and an unhandled delete rejection. Add a `#swapping` promise and have close() await it.
- R4 — `dialog.mjs:365`: after each await, #onSize should bail out on `#closing`, `#deleted` or a missing token. Fold this into the EC-2 guard.
- EC-4 — `dialog.mjs:389`: text typed during a swap is wiped by the re-render. Keep #currentText() across the render and #schedule(), which breaks README:36's "text carried" today.
- EC-6 — `dialog.mjs:129`: open() should re-check PromptDialog.current after it awaits the prior save, so two boxes can never edit one marker.
- **defect** M1 — `panels.mjs:12`: the panel does not redraw on updateNote or on AmbientLight/Tile hooks, though README:39-40 promises it does. Either derive the hooks from core/cache.mjs INVALIDATING_HOOKS and re-pin hooks.json and describe.json, or narrow the README.
- EC-1 — `panels.mjs:11`: the updateToken filter should also count `ring` and `flags["pentaryn-prompts"]` prompt/marker keys. Weigh this against the cost of rebuilding on every autosave. PR-3 (bb93da9f) changed this filter recently.
- R3 — `actor-patch-adapter.mjs:256`: add BAD_SPEC shape checks in checkPatch for removeItems, itemUpdates and set.
- EC-7 — `character-adapter.mjs:564`: skip a spell that is already queued in the same call, and warn.
- M10 — `character-adapter.mjs:82`: make namesFor and poolName agree on a rejecting fromUuid, or reword poolName's comment.
- M12 — `typeahead-adapter.mjs:26`: change the orphan fallback to `_loc('PENTARYN_PROMPTS.typeahead.orphan')`.
- M16 — `markers-adapter.mjs:26`: retire `markerActorIds` in the next export-surface change, or reword its doc.
- M17 — `dialog.mjs:28`: decide whether to unify on `foundry.utils.escapeHTML`. That changes `'` bytes in the panel golden.
- EXT-3 — `api-manifest.mjs:51`: update the crops and model `returns` strings (mimeType, the error row's scene, nav), and consider a conformance check that compares returned keys with `returns`.
- EXT-12 — `crops-adapter.mjs:126`: write a shared core helper for footprintRect, tokenImg and EYE. Adopting getSize changes hex crop boxes.
- Process: 13 of the 56 findings (everything after EC-7 in the triage input, from M9 on) were not received or triaged. The cap also deferred 7 RECORD items whose details did not reach this step. Run the triage again on the missing tail.

## Verification

- 0df30e55 — revert (f6677526)
- 582c0b6d — revert (a010ab3d)
- d4f4ea24 — keep
- d27efa10 — keep
- cf23ed86 — keep
- fa8a6ac3 — keep
- 22fadef8 — keep
- c20218a5 — keep
- 88b68d10 — keep
- 2c6418c6 — keep

## Gates

- `make foundry-prompts-check` at the branch head: tests 226, 220 pass, 0 fail, 6 skipped. Core: 415 passed, 0 failed. The vendored kit is identical (12 files). Conformance is 100.0 % (50/50). Exit 0.
- Goldens byte-identical: yes (`git diff --quiet origin/main...HEAD -- '**/golden/**'`).
