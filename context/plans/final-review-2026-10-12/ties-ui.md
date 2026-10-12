---
title: "Final review 2026-10-12 — ties-ui"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of ties-ui found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — ties-ui

## Verdict

**NEEDS-JOE.** The eight kept commits preserve behaviour, but several recorded items are real defects (M1 notes data loss first among them), and every fix for them changes a write, a message or what a player sees.

## Scope

- Area: ties-ui (module `pentaryn-ties`, the UI half).
- Paths: `foundry/module/pentaryn-ties/` `attributes-ui.mjs`, `authoring-ui.mjs`, `known-ui.mjs`, `lore-ui.mjs`, `review-ui.mjs`, `look-app.mjs`, `look-menu.mjs`, `preview-app.mjs`, `describe-dialog.mjs`, `tie-dialog.mjs`, `editor.mjs`, `overlay.mjs`, `popups.mjs`, `sheet.mjs`, `token-hud.mjs`, `worn.mjs`, `styles/ties.css`, plus this module's `test/**`.
- Base: `4eba771c`. Branch: `review/ties-ui`, in the worktree `pentaryn-review-ties-ui-wt`.
- Triage: 66 findings, 12 dropped as duplicates, 10 DO (4 DO-EDGE, 6 DO-REFACTOR), 44 RECORD (19 of them deferred by the cap).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| ties-ui-rob-1 | look-menu.mjs:105 | medium | DO-EDGE (kept) | Double-click crashed with an invalid-flag-scope error in a world without item-piles |
| ties-ui-E1 | popups.mjs (restorePinned) | medium | DO-EDGE (kept) | A player's pinned cards came back at ready while playerAccess was off |
| ties-ui-E2 | known-ui.mjs (openKnownEntry) | medium | DO-EDGE (reverted) | Opening a hidden Known entry's page shows nothing |
| ties-ui-E5 | popups.mjs (restorePinned) | low | DO-EDGE (reverted) | A card pinned at x=0 / y=0 comes back at 20px |
| perf-1 | review-ui.mjs (_renderHTML) | low | DO-REFACTOR (kept) | Attribute Review re-indexed the registry once per row |
| perf-3 | attributes-ui.mjs (chainTags) | low | DO-REFACTOR (kept) | Attributes tab read the registry once per row for chain tags |
| perf-8 | preview-app.mjs (simulate) | low | DO-REFACTOR (kept) | Preview simulate re-indexed the registry once per rung |
| M3 | tie-dialog.mjs (header) | low | DO-REFACTOR (kept) | Header described a "seeding rule" the code no longer follows |
| M4 | preview-app.mjs:3 | low | DO-REFACTOR (kept) | Header claimed the preview writes nothing; only Simulate does |
| M10 (+M6 comment) | 7 files | low | DO-REFACTOR (kept) | Stale and orphaned cross-file comments |
| M1 | known-ui.mjs:718 | high | RECORD | Notes autosave: blur cancels the 700 ms debounce, last keystrokes are lost |
| M11 | attributes-ui.mjs:690 | low | RECORD | Build and bind disagree on the viewer; dead 'Mark as learned' buttons on NPC tabs |
| M9 | preview-app.mjs:126 | low | RECORD | study.preview(null) returns the notification object, not the promised null |
| M2 | styles/ties.css:1616 | medium | RECORD | `.pt-chip` declared twice; filter-button rule restyles stance chips |
| M5 | worn.mjs:36 | low | RECORD | Four re-exports have no importer; popups imports ties-adapter twice |
| M6 | overlay.mjs:463 | low | RECORD | `toggle = showAll` export has no importer |
| M7 | editor.mjs:442 | low | RECORD (cap) | Tie change handler also binds lore-editor rows |
| M8 | worn.mjs:336 | low | RECORD | uninstall() leaves PIXI layers, rAF frames and pinned cards behind |
| M12 | tie-dialog.mjs:256 | low | RECORD (cap) | TieDialog._renderHTML is ~215 lines of mixed state and markup |
| M14 | editor.mjs:541 | low | RECORD (cap) | Helpers copied across files (key labels, bindSummary, FALLBACK_ART x7) |
| ties-ui-rob-4 | authoring-ui.mjs:181 | low | RECORD | A belief row for a deleted character cannot be cleared |
| ties-ui-rob-5 | popups.mjs:346 | low | RECORD | try/catch around un-awaited promises; failures surface unprefixed |
| ties-ui-rob-6 | review-ui.mjs:260 | low | RECORD (cap) | Five silent catch fallbacks, against §5.4 |
| ties-ui-rob-7 | token-hud.mjs:93 | low | RECORD | Async listeners await writes with no catch; buttons can stay disabled |
| EXT-2 | sheet.mjs:233 | medium | RECORD (cap) | deleteActor cleanup is a hand list, not a SHEET_TABS field |
| EXT-3 | known-ui.mjs:692 | medium | RECORD | Ties and Known tabs copy the row shell (and caused M1) |
| EXT-4 | look-app.mjs:164 | medium | RECORD (cap) | Fact groups handled by string ladders |
| EXT-5 | attributes-ui.mjs:459 | low | RECORD (cap) | Hard-coded key lists repeat their label tables |
| EXT-6 | review-ui.mjs:383 | low | RECORD | 'Personal category' rule copied in two UI files, absent from core |
| EXT-7 | attributes-ui.mjs:283 | low | RECORD (cap) | DC inputs hard-code 1/40/15 |
| EXT-8 | attributes-ui.mjs:277 | low | RECORD | Four skill dropdown implementations disagree |
| EXT-9 | overlay.mjs:174 | low | RECORD | Wires and badges copy the rAF coalescer and layer helpers |
| EXT-10 | token-hud.mjs:87 | low | RECORD (cap) | Inspect gesture re-implemented at every door |
| EXT-11 | overlay.mjs:89 | low | RECORD | 'GM, or access on and owner' written twice via setting() |
| EXT-13 | preview-app.mjs:313 | low | RECORD (cap) | Preview hard-codes the study ladder |
| EXT-15 | authoring-ui.mjs:37 | low | RECORD (cap) | 'GM only' badge markup pasted four times |
| EXT-16 | editor.mjs:578 | low | RECORD | Five find-or-create idioms; InspectPreview not a singleton |
| ties-ui-E3 | editor.mjs:509 | medium | RECORD | Player tie removal confirms 'both directions' but removes one |
| ties-ui-E4 | describe-dialog.mjs:60 | low | RECORD | toggle() not re-entrant across enrichHTML; two cards open |
| ties-ui-E7 | look-menu.mjs:38 | low | RECORD | Player without a character gets no double-click menu |
| ties-ui-E9 | sheet.mjs:178 | low | RECORD (cap) | Body-only re-render may stack nav-link listeners (premise unverified) |
| ACC-2 | preview-app.mjs:439 | medium | RECORD | renderPlayerView clears specs/pcKey before an await |
| ACC-3 | editor.mjs:445 | medium | RECORD | Unserialised read-modify-write of ties/known arrays loses edits |
| ACC-4 | attributes-ui.mjs:825 | low | RECORD | Ancestry Repair does one update per id, button not disabled |
| ACC-5 | review-ui.mjs:224 | low | RECORD (cap) | AttributeReview hand-rolls Hooks.on/off instead of LiveHooks |
| ACC-6 | review-ui.mjs:633 | low | RECORD | 'Refused rather than saved over' holds only for broadcast changes |
| perf-2 | attributes-ui.mjs:358 | medium | RECORD (cap) | Each personal attribute walks every world actor per GM paint |
| perf-4 | overlay.mjs:236 | low | RECORD (cap) | Wire painter scans placeables once per card per frame |
| perf-5 | review-ui.mjs:227 | medium | RECORD | Attribute Review re-renders uncoalesced on every registry write |
| perf-6 | attributes-ui.mjs:1026 | low | RECORD | GM autocomplete walks the world on every keystroke |
| perf-7 | known-ui.mjs:514 | low | RECORD | visibleAttributesFor re-clamps the registry per Known entry |
| perf-9 | look-app.mjs:244 | low | RECORD (cap) | Look flattens every updateActor's changes before the id check |
| perf-10 | worn.mjs:184 | low | RECORD | Worn painter reads every placeable's flags each GM frame |
| perf-11 | review-ui.mjs:738 | low | RECORD | Expanding one review row re-runs the full render and carriers walk |
| 12 others | — | — | DROP | Duplicates folded into the items above (e.g. rob-2/ACC-1 into M1, rob-3/EXT-1/E6 into M11, EXT-12/E8 into M9, M13 into EXT-8, ACC-7 into M8, ACC-8 into E4, ACC-9 into rob-5, EXT-14 into M14) |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 58ec6bd5 | look-menu reads the item-piles flag through readFlag, so double-click works without item-piles (rob-1) | glue-player.test.mjs "double-click: the look menu opens in a world without item-piles" |
| 6d815e0d | restorePinned returns early when mayWrite() is false (E1) | pinned-access.test.mjs "restorePinned: a player's pinned cards stay down while playerAccess is off" |
| 0c90ab94 | Attribute Review indexes the registry once per paint (perf-1) | existing goldens app-review-html, app-review-open-html (byte-identical) |
| a892f740 | Attributes sheet memoises the registry read per paint for chain tags (perf-3) | existing golden ui-attrs-html (pt-chain-kids x3, byte-identical) |
| 71402eed | Preview simulate indexes the registry once per run (perf-8) | existing app-preview-sim-controls golden; planner.test.mjs:92 list/index equivalence |
| 6b743101 | Comment only: tie-dialog header and #save doc describe the mirror rule (M3) | suite unchanged |
| 4784c7c2 | Comment only: stale cross-file comments in 7 files (M10, M6 comment half) | suite unchanged |
| f5b962d4 | Comment only: preview-app header scopes 'writes nothing' to Simulate (M4) | suite unchanged |

## Changes reverted by verification

| commit | revert | verifier's reason |
|---|---|---|
| 8acff0b5 (E2) | da193794 | Flipping the per-actor show-hidden Set before render(true) desyncs state when the sheet is already open on Known and does not repaint: the player's first click on "Show N tucked away" then does nothing. It also reveals every tucked entry, not just the requested one, which is a design choice for Joe. |
| 10a88a41 (E5) | 5a43c803 | The new `at()` helper narrows input: numeric strings ("40", "1e2"), arrays and booleans in pinnedCards used to place the card and now fall back to 20px. Not behaviour-preserving. |

## Recorded for Joe

- **defect** M1 `known-ui.mjs:718`: Known notes autosave cancels its 700 ms debounce on blur, so the last keystrokes before focus leaves (including closing the sheet) are never saved. Fix: flush on blur (run setKnownField with notes.value if a timer is pending) or add a `change` listener like editor.mjs:471-477.
- **defect** ties-ui-E2 `known-ui.mjs` (openKnownEntry): key 5 / known.open on a tucked-away Known entry shows nothing. Decide: reveal only that row, reveal all tucked entries, or leave it hidden; a fix must also handle the already-open-on-Known no-repaint case (reverted 8acff0b5).
- **defect** ties-ui-E5 `popups.mjs` (restorePinned): a card saved at x=0 or y=0 comes back at 20px because of `Number(v) || 20`. Fix with a null/NaN check that still accepts numeric strings, e.g. `const n = Number(v); v == null || v === "" || !Number.isFinite(n) ? 20 : n` (reverted 10a88a41).
- **defect** M11 `attributes-ui.mjs:690`: build (:634) and bind (:690) resolve the Attributes viewer differently; a GM with an assigned character gets dead 'Mark as learned' buttons on NPC tabs. Rule whether an NPC tab borrows game.user.character, then fix and re-pin ui-attrs-npc-controls.
- **defect** M2 `styles/ties.css:1616`: `.pentaryn-ties .pt-chip` is declared for both the stance chip (:198) and the filter buttons; the later rule restyles stance chips and kills the @container narrow-sheet override. Rename the filter class (e.g. `.pt-filter-chip`) in attributes-ui.mjs, review-ui.mjs and ties.css:1616-1633.
- **defect** ties-ui-E3 `editor.mjs:509`: a player removing a tie to an NPC confirms removal 'in both directions' but only their side is removed. Either a one-direction confirm string (new lang key) or a relay remove action.
- **defect** ACC-3 `editor.mjs:445`: read-modify-write of the whole ties/known array is not serialised per actor; two quick edits within one round trip revert the first. Add a per-actor queue like attributes.mjs serial().
- **defect** ties-ui-rob-4 `authoring-ui.mjs:181`: a belief row whose character was deleted cannot be cleared (Reset confirms then does nothing; Deliver warns '?'). Reset by ledger id, or render orphans with a remove control.
- **defect** ties-ui-E4 `describe-dialog.mjs:60`: two quick presses of 9 open two cards and the first close clears `current` while the second is open. Serialise toggles, or at least compare `current.app === app` in the close callback.
- M9 `preview-app.mjs:126`: InspectPreview.open(null) returns the warn() result, not the null study.preview promises; app-open-refusals pins the object. Change the code or loosen the manifest text.
- M5 `worn.mjs:36`: four unused re-exports (worn WORN_FLAG/readWorn, popups PIN_SETTING, tie-dialog baseActorOf, review-ui SELECTION_FLAG) and a doubled ties-adapter import in popups.mjs:26-27; remove if no outside macro imports them.
- M6 `overlay.mjs:463`: `export const toggle = showAll` has no importer; drop it if no console import relies on it (comment fixed in 4784c7c2).
- M7 `editor.mjs:442`: narrow the tie change selector to `.pt-row:not([data-inbound]):not(.pt-lore-row)` so lore rows do not get a no-op tie handler.
- M8 `worn.mjs:336`: uninstall() should cancel the queued rAF, drop badges and wires, and detach the pinned-card layer without savePinned, so a hot re-import does not duplicate them.
- M12 `tie-dialog.mjs:256`: split TieDialog._renderHTML (and preview simulate) into private builders, output byte-identical.
- M14 `editor.mjs:541`: extract the copied helpers (keyLabel, bindSummary, openTieDialog, one FALLBACK_ART) into a graph-allowed UI module.
- ties-ui-rob-5 `popups.mjs:346`: add `.catch(err => log.warn(...))` to savePinned's settings.set and `.catch(err => log.error('look window', err))` to LookWindow.open's renders.
- ties-ui-rob-6 `review-ui.mjs:260`: rewrite the five silent catches (review-ui:258, attributes-ui:311/324, overlay:226, popups:91) as log.swallow with the same return values.
- ties-ui-rob-7 `token-hud.mjs:93`: wrap async click handlers in a guardClick(op, fn) that logs via log.error and re-enables the button.
- EXT-2 `sheet.mjs:233`: add forget(actorId) to each SHEET_TABS row and loop over them in deleteActor; update the README Extending line.
- EXT-3 `known-ui.mjs:692`: after the M1 ruling, share bindNotesAutosave and replaceSummary between the Ties and Known tabs (home in core/html.mjs).
- EXT-4 `look-app.mjs:164`: replace the fact-group string ladders with a GROUP_LABEL table so a new group is labelled and previewed.
- EXT-5 `attributes-ui.mjs:459`: derive filter/tab/field lists from their label tables and add a STATE_LABEL table.
- EXT-6 `review-ui.mjs:383`: add isPersonalEntry to core/rules.mjs and use it in review-ui and attributes-ui.
- EXT-7 `attributes-ui.mjs:283`: use LORE_DC_MIN/MAX/DEFAULT instead of 1/40/15.
- EXT-8 `attributes-ui.mjs:277`: rule on skill presentation, then one skillOptionsHTML/skillLabelOf helper; identifyBlock must keep an unknown skill selected.
- EXT-9 `overlay.mjs:174`: adopt the kit's perFrame and an interfaceLayer helper for wires and badges, checking the canvas goldens for timing drift.
- EXT-10 `token-hud.mjs:87`: export subjectOfToken and examine(who, subject) and use them from the HUD and the look menu.
- EXT-11 `overlay.mjs:89`: add mayActOn to settings.mjs and use it in overlay.permitted and sheet.mayView.
- EXT-13 `preview-app.mjs:313`: derive the preview ladder from STUDY_RUNGS/STUDY_BASE_DC.
- EXT-15 `authoring-ui.mjs:37`: export one gmBadge and use it in editor.mjs and attributes-ui.mjs.
- EXT-16 `editor.mjs:578`: decide whether InspectPreview should be a singleton; consider an openSingleton kit helper.
- ties-ui-E7 `look-menu.mjs:38`: a player with no assigned character gets no double-click menu; build it when mayWrite() and a subject exist, adding Look items only when `who` is set.
- ties-ui-E9 `sheet.mjs:178`: verify whether dnd5e re-renders the body without the nav; if so bind the nav link once and resolve the section at click time.
- ACC-2 `preview-app.mjs:439`: build specs and pcKey locally in renderPlayerView and assign them after the last await.
- ACC-4 `attributes-ui.mjs:825`: one-update repairAllAncestry in attributes.mjs, and disable the Repair button while it runs.
- ACC-5 `review-ui.mjs:224`: move AttributeReview to LiveHooks (debounce half tracked under perf-5).
- ACC-6 `review-ui.mjs:633`: the 'refused rather than saved over' guarantee misses in-flight bridge-tab writes; needs a GM relay or version stamp in attributes.mjs.
- perf-2 `attributes-ui.mjs:358`: pin a personal-attribute golden first, then a lazy per-paint carriers map.
- perf-4 `overlay.mjs:236`: memoise the first token per sourceId per paint.
- perf-5 `review-ui.mjs:227`: debounce Attribute Review renders through LiveHooks (150 ms).
- perf-6 `attributes-ui.mjs:1026`: debounce GM autocomplete or cache candidates per focus.
- perf-7 `known-ui.mjs:514`: let visibleAttributesFor in core/known.mjs accept an index.
- perf-9 `look-app.mjs:244`: check actor ids before flattenObject in the Look window's updateActor handler.
- perf-10 `worn.mjs:184`: a marked-id cache for the worn painter (needs a createToken hook and a hooks golden change).
- perf-11 `review-ui.mjs:738`: cache carriers with invalidation, or patch the expanded row in place.

## Verification

- 58ec6bd5: keep
- 6d815e0d: keep
- 8acff0b5: revert (da193794)
- 0c90ab94: keep
- a892f740: keep
- 71402eed: keep
- 6b743101: keep
- 4784c7c2: keep
- f5b962d4: keep
- 10a88a41: revert (5a43c803)

## Gates

- `make foundry-ties-check`: node tests 257 pass / 0 fail; known-core 184 passed; look + known tab 9 passed; vendored kit identical to foundry/lib (11 files); conformance 96.1% (49/51), accepted exceptions C05 and C37 only, no new rows.
- `make check-context`: passed with this record in place.
- Untouchables clean; `git status` clean before this record.
- Goldens byte-identical: yes.
