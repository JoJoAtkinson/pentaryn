---
title: "Final review 2026-10-12 — transform-ui"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of transform-ui found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — transform-ui

## Verdict

**NEEDS-JOE.** The ten kept commits preserve behaviour, but four of the recorded items are real defects: R1, R2, R3 and AC-1. Fixing any of them changes a failure path or a document write, so Joe has to decide each one.

## Scope

- Area: transform-ui (module `pentaryn-transform`, the UI half).
- Paths: `foundry/module/pentaryn-transform/hud.mjs`, `hud-panels.mjs`, `form-picker.mjs`, `starry-dialog.mjs`, `*-adapter.mjs`, `argon.mjs`, `styles/transform.css`, plus `test/**` for this module's tests.
- Base: `bb93da9f`. Branch: `review/transform-ui`, in the worktree `pentaryn-review-transform-ui-wt`.
- Triage: 39 of the 41 findings were triaged. The list arrived cut off, so 2 findings were never seen and need a re-run of the lens pass if Joe wants them. Result: 10 DO, 22 RECORD, 7 DROP (all 7 were duplicates or not worth a commit).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| perf-1 | sweep-adapter.mjs:25 | low | DO | sweepSpentForms walked every scene token even when the world has no transformed copy |
| perf-2 | hud-panels.mjs:41 | low | DO | onTokenBody queried the DOM for the target picker before checking whether the token change mattered |
| EXT-1 | hud-panels.mjs (9 sites) | low | DO | Argon's private HUD state (`_actor`, `_token`, `components`) was read directly outside argon.mjs |
| EXT-4 | api-manifest.mjs / test | low | DO (test only) | Nothing checked that the describe() enums match the implementation tables |
| EXT-5 | hud-panels.mjs:187 | low | RECORD (cap) | Ladders on Argon label strings and plan-entry tags repeat the label literals |
| EXT-7 | starry-adapter.mjs:154 | low | RECORD (cap) | Starry BLOCKS repeats two lang keys from BLOCK_MESSAGES |
| EXT-8 | wildshape-adapter.mjs:499 | low | RECORD | The file sits one line under the C10 500-line cap |
| EXT-9 | hud-panels.mjs:279 | low | RECORD (cap) | Wild Shape endsAt is read inline from the raw flag in two places |
| EXT-10 | form-picker.mjs:123 | low | RECORD (cap) | ReturnButton's host lookup deliberately differs from original(), and nothing says so |
| EC-1 | wildshape-adapter.mjs (markBonusUsed) | low | DO | A druid with two tokens never had the bonus marked on the token whose turn it is |
| EC-2 | hud-panels.mjs:346 | low | RECORD | A Chalice offer survives a constellation change, which contradicts the comment |
| EC-3 | hud-panels.mjs:334 | low | RECORD | The Chalice offer is painted only on the client that cast the heal |
| EC-4 | hud-panels.mjs:117 | low | RECORD | The Bonus pip re-mark settles reliably only while pentaryn-combat's pip-settle wrap is installed |
| EC-5 | form-picker.mjs:123 | low | RECORD | For an unlinked form, Return shows the shared base actor's name and portrait |
| EC-6 | sweep-adapter.mjs:26 | low | RECORD | The 10 s age guard compares the GM's Date.now() with the server's createdTime |
| M2 | form-picker.mjs:104 | low | RECORD (cap) | Five Argon classes duplicate their click, render and contextmenu blocks |
| M3, M4 | hud-panels.mjs, form-picker.mjs, wildshape-adapter.mjs | low | DO (comments) | Stale comments credited hud.mjs and argon.mjs, and a copied tooltip note was in the wrong place |
| M5 | form-picker.mjs:107 | low | RECORD | FormTile and ConstellationTile call `collapseAllPanels()` with no method guard |
| M6 | form-picker.mjs:52 | low | RECORD | formSource swallows a fromUuid failure without logging it |
| M7 | form-picker.mjs:33 | low | RECORD (cap) | paintBadge is exported, but nothing imports it |
| M8 | hud-panels.mjs (refreshLive) | low | DO | refreshLive had its own copy of the core pruneDisconnected rule |
| R1 | form-picker.mjs:104 | medium | RECORD | Tile left-click rejections become unhandled promise rejections |
| R2 | starry-adapter.mjs:197 | medium | RECORD | assumeStarry spends the Wild Shape use before applyStarry and never refunds it |
| R3 | wildshape-adapter.mjs:238 | low | RECORD | Reverting from an unloaded compendium beast copies the beast's status effects onto the druid |
| R5 | hud-panels.mjs:264 | low | RECORD | onWorldTime repaints the portrait without the 'portrait line failed' guard |
| AC-1 | starry-adapter.mjs:213 | medium | RECORD | endStarry has no in-flight guard, so overlapping endings double-delete |
| AC-2, AC-5, AC-6 | (see note) | low | RECORD | Async/concurrency notes. Their details were cut from the hand-off to this step |
| AC-3, AC-4 | wildshape-adapter.mjs, hud-panels.mjs | low | DO (comments) | The isRunner docstring was wrong, and the hot hook had no `hot:` comment |
| 7 others | — | — | DROP | Duplicates (EXT-2 of M2, EXT-3 of M5, R4 of M6, and others) or not worth a commit |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 3ec7af20 | sweepSpentForms returns before the scene-token walk when no transformed copy exists (perf-1) | lifecycle.test.mjs "sweepSpentForms: a world with no transformed copy never walks scene tokens" |
| 5606de12 | hud-panels reads Argon private HUD state through argon.mjs accessors (EXT-1) | seams.test.mjs "Argon private HUD state is read only in argon.mjs" |
| c6ff3789 | markBonusUsed marks whichever of the actor's tokens has the turn (EC-1) | glue.test.mjs "markBonusUsed: a druid with two tokens marks the one whose turn it is" |
| 34458258 | onTokenBody checks the token change before querying the DOM for the picker (perf-2) | glue.test.mjs "updateToken moving the HUD token never queries the DOM for the target picker" |
| 633b8caa | Test only: describe() enums match RETURN_LINES, CONSTELLATIONS and starryEndKey (EXT-4) | api.test.mjs "describe() enums match the implementation tables (revert reasons, constellations, starry.end reasons)" |
| 31c52ec0 | refreshLive prunes through core pruneDisconnected (M8) | findings.test.mjs "refreshLive: a disconnected button without a panel stays and is not refreshed; with a panel it is removed" |
| 986cd889 | Comment only: the target-picker block gets its own heading (M3) | suite unchanged |
| 8896c0ee | Comment only: comments credit hud-panels.mjs and lib/argon-kit.mjs (M4) | suite unchanged |
| 39f435df | Comment only: the isRunner docstring says one user in every tab (AC-3) | suite unchanged |
| 80039f56 | Comment only: onActionPanelRender carries its `hot:` comment (AC-4) | suite unchanged |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** R1 `form-picker.mjs:104`: Argon does not await the FormTile and ConstellationTile left-click handlers, so a rejection there is unhandled and dropStaleTooltip is skipped. Fix: wrap each in try/catch with log.warn, and call dropStaleTooltip in a finally. Do it together with M5.
- **defect** R2 `starry-adapter.mjs:197`: assumeStarry spends the Wild Shape use before applyStarry. If applyStarry fails, the use is lost. Fix: refund via refundUpdate on a failure after the use, as doShift does, and decide whether the bonus mark should be cleared too.
- **defect** R3 `wildshape-adapter.mjs:238`: when revert runs on a client where the compendium beast is not loaded, fromUuidSync returns an index entry. sourceEffectIds is then [], and the beast's status effects are copied onto the druid (the same index-entry problem as PT TF-1). Fix: when the effects are not iterable, await fromUuid behind a debug-logged catch. The file is at its line cap (EXT-8).
- **defect** AC-1 `starry-adapter.mjs:213`: endStarry has no in-flight guard. Two endings in one tab (effect expiry plus the world-time check, or the End tile racing expiry) both delete, and the second one is rejected and logged. Fix: add a module `ending` Set keyed by actor.uuid and clear the key in finally, mirroring assumeStarry's busy guard.
- M5 `form-picker.mjs:107`: change `ui.ARGON?.collapseAllPanels()` to `?.()` in FormTile and ConstellationTile so they match ReturnButton. This changes a failure path.
- M6 `form-picker.mjs:52`: formSource's `catch { doc = null; }` breaks the T-D3 "every catch logs at debug" promise. Fix: add `log.debug("form source failed", …)`. This needs a new row in golden/console-texts.json. Optionally widen the glue.test silent-catch scan to bodies that only assign.
- R5 `hud-panels.mjs:264`: onWorldTime calls paintPortrait without the 'portrait line failed' try/warn. The kit's reg guard already catches the throw and logs it at error under the hook label. A shared repaintPortrait helper would change that message and its level.
- EC-2 `hud-panels.mjs:346`: a Chalice offer survives a change of constellation. Either clear it in onStarryChange or narrow the comment to say "ended".
- EC-3 `hud-panels.mjs:334`: the Chalice offer pulses only on the client that cast the heal. Either add a README line saying so or relay the offer to the other clients.
- EC-4 `hud-panels.mjs:117`: the Bonus pip re-mark depends on pentaryn-combat's pip-settle wrap. If transform should stand alone, use the kit's settlePips(panel).
- EC-5 `form-picker.mjs:123`: for an unlinked token form, the Return button shows the base actor's name and portrait. Decide whether it should use the token's name and image from before the shift.
- EC-6 `sweep-adapter.mjs:26`: the age guard mixes the GM client's clock with the server's clock. If the GM clock runs more than 10 s fast, the sweep could delete a form that is still mid-swap. Unlikely in practice.
- EXT-8 `wildshape-adapter.mjs:499`: the file is at 498 lines after this review, under the C10 cap. Split out the revert block (:157-282) or the bonus bookkeeping before adding anything.
- AC-2, AC-5, AC-6 (transform-ui async lens): recorded by triage, but their file:line and claims were cut from the hand-off to sign-off. No triage journal survived.
- Two of the 41 findings were never triaged because the list was cut off after perf-2.
- **Closed in defect wave 2 (transform-ui/lens-rerun, branch `fix2/transform-2026-10-12`).** The async lens was re-run over form-picker.mjs, hud-panels.mjs, starry-adapter.mjs, wildshape-adapter.mjs and sweep-adapter.mjs in place of the lost AC-2/5/6 and the two untriaged findings. Fixed: the Chalice offer's 60 s wall-clock timer (now ends when game time moves on), the Starry Bonus-bar rebuild overlapping a render of the same panel (and its unhandled rejection), and a Starry tick lost when two clock advances land before the first write returns. The rest is recorded in the wave-2 transform record.
- Deferred by the cap, pure refactors that can be picked up later: M7 `form-picker.mjs:33` (drop the export of paintBadge), M2 `form-picker.mjs:104` (shared click, render and contextmenu helpers for the five Argon classes), EXT-9 `hud-panels.mjs:279` (a wsEndsAt accessor), EXT-5 `hud-panels.mjs:187` (BAR, COMPOSE and OWN tables), EXT-7 `starry-adapter.mjs:154` (derive the BLOCKS keys from BLOCK_MESSAGES), EXT-10 `form-picker.mjs:123` (a comment on why this is not original(); settle EC-5 first).

## Verification

- 3ec7af20: keep
- 5606de12: keep
- c6ff3789: keep
- 34458258: keep
- 633b8caa: keep
- 31c52ec0: keep
- 986cd889: keep
- 8896c0ee: keep
- 39f435df: keep
- 80039f56: keep

## Gates

- Module gate (`node test/run.mjs` plus the blueprint checks): 256 tests, 256 pass, 0 fail. The pentaryn-transform core run: 155 passed. The vendored kit is identical to foundry/lib (13 files). Conformance is 100.0 % (49/49 fail-class rules). The diff paths are all in scope, and the untouchables are clean.
- `make check-context`: passes with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
