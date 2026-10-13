---
title: "Final review 2026-10-12 — portals"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of portals found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — portals

## Verdict

**NEEDS-JOE.** The ten kept changes are docs, comments and pure dedupes, and the gate is green with byte-identical goldens. But real defects are recorded: snapshot reports success when the upload failed, teleportParty captures the party before the confirm dialog, and badge drag state survives a redraw or canvas teardown.

## Scope

- Paths: `foundry/module/pentaryn-portals/**` (module `pentaryn-portals`) and this record.
- Base: `e4a9184c` (origin/main when the review started).
- Branch: `review/portals`, worktree `pentaryn-review-portals-wt`.
- Triage: 42 findings, giving 10 DO-REFACTOR, 24 RECORD (8 of them deferred by the cap) and 8 DROP (6 duplicates, 1 confirmation that the code is correct, 1 not worth a commit). There was no DO-EDGE: every edge finding changes a failure path, a write or a pinned answer.

## Findings by lens

Line numbers are at the review HEAD, unless the line is marked "base".

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| M2 | README.md:55 | low | DO-REFACTOR, kept | The Settings line said labels stay plain English until a Wave 7 lang batch |
| M3 | README.md:112 | low | DO-REFACTOR, kept | The Patches section said four of six adjustment rows were still queued |
| M1 | card-app.mjs (header), :96 | low | DO-REFACTOR, kept | Header claimed all writes go through scene-adapter; the landing-spot comment was wrong |
| M4 | portals-core.mjs (header) | low | DO-REFACTOR, kept | The token-record shape comment listed a duplicate `handle` and a never-set `hidden` |
| M5 | api-manifest.mjs:5-7 | low | DO-REFACTOR, kept | The header miscounted own rows and did not list the badge rows |
| M6 | badges.mjs:35 | low | DO-REFACTOR, kept | The badges array comment missed fields that `badges.push` sets |
| M11 | badges.mjs:224 | low | DO-REFACTOR, kept | `!move` was always true in the else branch of `if (move)` |
| M7 | styles/portals.css | low | DO-REFACTOR, kept | `.ppt-app .ppt-edit` rule had no producer |
| M9 | scene-adapter.mjs, card-app.mjs, api.mjs | low | DO-REFACTOR, kept | The one-way/two-way link sequence was copied in two callers; now `linkPair` |
| M10 | scene-adapter.mjs, cards.mjs | low | DO-REFACTOR, kept | Destination resolution was copied in two files; now `behaviorDestinations`, plus a local `rootOf` |
| ROB-1 | scene-adapter.mjs:112 | medium | RECORD (**defect**) | snapshot writes the img flag and returns a path when the upload failed or the blob is null |
| ROB-2 | scene-adapter.mjs:282-286 | medium | RECORD (**defect**) | teleportParty snapshots the party before the confirm dialog |
| portals-edge-1 | badges.mjs:246, :290 | medium | RECORD (**defect**) | Drag state survives a badge redraw or canvas teardown; no pointercancel |
| portals-edge-2 | scene-adapter.mjs:220 | medium | RECORD (**defect**) | Landing squares are tested by centre point, not footprint |
| EXT-1 | card-app.mjs:54 | medium | RECORD | "Revealed" is computed over different behavior sets on the card and on badges/inspect |
| portals-edge-3 | badges.mjs:90 | low | RECORD | The badge strips the `?v=` cache-buster, so it shows the old crop after a re-snapshot |
| portals-edge-4 | scene-adapter.mjs:254-286 | low | RECORD (**defect**) | With the confirm skipped, an empty party still pulls players; the docstring says otherwise |
| portals-edge-5 | scene-adapter.mjs:283 | low | RECORD | teleportParty with `canvas.scene` null throws a raw TypeError |
| ROB-6 | api-manifest.mjs:34 | low | RECORD | Legacy document rows do no ref resolution, so a uuid string gives junk or a TypeError |
| portals-async-1 | party.mjs:67 | low | RECORD | spreadArrival runs in every active-GM tab with no election |
| portals-async-2 | card-app.mjs:136, :162, :167, :179-183 | low | RECORD | `this.render()` not awaited in guarded listeners; the header toggle is unguarded |
| perf-4 | badges.mjs:90 | low | RECORD | drawBadges awaits each texture in turn |
| EXT-9 | card-app.mjs:96-100 | low | RECORD | The card's landing-spot list and `api.link()` accept different target regions |
| EXT-8 | cards.mjs:25 | low | RECORD | The element-or-jQuery unwrap is copied across nine modules; the kit has no helper |
| M12 | badges.mjs:211 | low | RECORD | `#board` bind guard uses prompts' `dataset.ppBound` prefix |
| EXT-2 | scene-adapter.mjs:47 | low | RECORD (cap) | `"teleportToken"` literal in four places; new-behavior defaults only inline |
| EXT-4 | cards.mjs:97 | low | RECORD (cap) | Card flag paths hand-built in seven places; `flagPath` used once |
| M8 | portals-core.mjs:21 | low | RECORD (cap) | `FLAG_SCOPE` unused; `behaviorUuidFromDialogId` has no production caller |
| EXT-6 | card-app.mjs:118 | low | RECORD (cap) | Passage switches are parallel render/handler lists |
| EXT-7 | scene-adapter.mjs:155 | low | RECORD (cap) | Box- and token-centre arithmetic copied in three files |
| perf-1 | badges.mjs:144 | low | RECORD (cap) | refreshBadgeSight rebuilds sample points on every sightRefresh |
| perf-2 | badges.mjs:217 | low | RECORD (cap) | pointermove has no `// hot:` comment; hideTip writes when already hidden |
| portals-async-3 | party.mjs:90 | low | RECORD (cap) | keepId-refusal election is correct for embedded Tokens; needs a comment to stop a wrong "fix" |
| EXT-11 | api-manifest.mjs:30 | low | RECORD (cap) | Manifest rows hand-copy `SNAP_DIR` and the fade duration |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 43786c26 | M2: README Settings line names `PENTARYN_PORTALS.Setting.<key>.Name/Hint` in `lang/en.json` | `node test/run.mjs` full suite; `test/readme.test.mjs` unchanged |
| fa0e3e45 | M3: README Patches section says all six rows are in `foundry/adjustments.yml` | Docs only; full suite green |
| 8a3fe6ca | M1: card-app header and landing-spot comment corrected | Comments only; full suite green |
| c2c3a117 | M4: portals-core header lists the keys `recordOf` builds | Comments only; matches `test/golden/records.json` |
| d8815a22 | M5: api-manifest header counts eight own rows and lists the badge rows | `test/api.test.mjs`: "buildApiFor: the own rows plus the features' rows; ..." |
| 5d0f75c4 | M11: drop the always-true `!move` | `test/badges.test.mjs`: "bindBoard: over an edit-mode badge the cursor is 'move'; leaving restores exactly the prior cursor" |
| 9d6647f4 | M7: drop the dead `.ppt-edit` CSS rule | grep shows no producer; full suite green |
| e5fb5995 | M6: badges array comment lists every field | Comments only; full suite green |
| e56ff1e5 | M9: `linkPair(from, to, twoWay = false)` in scene-adapter, used by card-app and `api.link()` | `test/card-app.test.mjs`: "add a destination: one-way links from here; two-way (default) also links back; empty choice → nothing"; link-create golden byte-identical |
| 0558ca76 | M10: `behaviorDestinations(behavior)` in scene-adapter; `rootOf` in cards.mjs | glue.test decorate/preferTeleport/injectConfig (incl. jQuery-array element); card-app.test "destinationsOf / teleportBehaviors / toAbsolute"; `make foundry-adjustments-check` 120/120 (relative-uuid marker still present) |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** ROB-1, `scene-adapter.mjs:112`: snapshot falls back to `${SNAP_DIR}/${name}` when `FilePicker.upload` returns false/undefined/{} or the blob is null; on `!res?.path || !blob`, warn, skip `region.update` and return null (re-pin glue.test.mjs:352).
- **defect** ROB-2, `scene-adapter.mjs:282-286`: the party is captured before `confirmParty`; after the confirm, drop records whose token is gone from `from.tokens` before `landingPlaces`/`carryTo`, so a token deleted during the dialog is not recreated and the source batch delete does not fail.
- **defect** portals-edge-1, `badges.mjs:246` and `:290`: `onCanvasTearDown` never clears `drag`, and there is no pointercancel/lostpointercapture; clear `drag` there and skip when `drag.badge.sprite.destroyed`, so a redraw mid-drag does not throw and a pointerup after a scene change does not write to the old region.
- **defect** portals-edge-2, `scene-adapter.mjs:220`: occupied/crowded tests use the centre point only; make them footprint-aware and step multi-square tokens by their size (landing positions change).
  - Fixed in defect wave 2 (branch `fix2/portals-2026-10-12`) [declared]: `occupiedBy` tests a box by overlap, `ringSpots` takes a `footprint` and hands `occupied` each token's snapped box (and skips overlap with earlier picks), `assignSpots` takes `fits`; `landingPlaces` passes each token's size. Goldens re-pinned: `test/golden/landing.json` (the 2×2 lands at (-100, 300), not over m3; more snap calls), `landing-party.json` and `teleport-same-scene.json` (the Steed lands beside Caven, not over him; the Arcane Eye moves beside Marrith). The off-grid "stays put" gap test now steps off to (700, 900).
- **defect** portals-edge-4, `scene-adapter.mjs:254-286`: with `confirmPartyTeleport` off or `confirm:false`, an empty party still pulls players, moves the GM view and toasts "0 moved", contrary to the docstring at :277; decide whether an empty party returns `{ moved: 0, cancelled: true }` (changes party.test:175, api-additions.test:122).
- EXT-1, `card-app.mjs:54` vs `badges.mjs:77` and `api.mjs:46-47`: choose one behavior set for "revealed" (all enabled teleports, or only those with a resolvable destination) and share a `passageRevealed` helper.
- portals-edge-3, `badges.mjs:90`: pass `first.img` with its `?v=` to `loadTexture` so the badge refreshes after a re-snapshot; read commit 35133ec1 first for why the strip was added.
- portals-edge-5, `scene-adapter.mjs:283`: return undefined or warn "no scene" when `!canvas?.scene` instead of throwing a TypeError.
- ROB-6, `api-manifest.mjs:34`: document "documents only" for the legacy rows (cardFor, lookAt, teleportParty, open, spreadArrival) in the README API table, or resolve uuid strings (behaviour change).
- portals-async-1, `party.mjs:67`: spreadArrival runs in every active-GM tab; elect the carryTo winner, or check the PC is still on its arrival square before writing.
- portals-async-2, `card-app.mjs:136, :162, :167, :179-183`: `await this.render()` in the guarded listeners and wrap the header toggle in `deps.guard('card edit toggle', ...)`.
- perf-4, `badges.mjs:90`: start all texture loads up front with `Promise.allSettled`, then add badges in region order with one stale check.
- EXT-9, `card-app.mjs:96-100`: decide whether `api.link()` applies the card's landing-candidate rule or the card widens to any region.
- EXT-8, `cards.mjs:25`: kit owner to add a `foundry/lib` DOM helper (e.g. `htmlRoot`) for the element-or-jQuery unwrap; cards.mjs has a local `rootOf` meanwhile.
- M12, `badges.mjs:211`: S7 follow-up rename of `dataset.ppBound` to `pptBound` (re-pin badges.test.mjs:259).
- EXT-2 (cap), `scene-adapter.mjs:43, :47, :320` and `card-app.mjs:100`: add `TELEPORT_TYPE` and a frozen `NEW_TELEPORT_BEHAVIOR` to portals-core; link-create.json must stay byte-identical.
- EXT-4 (cap), `cards.mjs:97`: route card flag paths through `flagPath`; re-run the conformance report and confirm C29 is unchanged.
- M8 (cap), `portals-core.mjs:21`: use `FLAG_SCOPE` (with EXT-4); comment `behaviorUuidFromDialogId` as kept for the legacy suite.
- EXT-6 (cap), `card-app.mjs:118`: one SWITCHES table driving `sw()` and the handler; card-edit.json byte-identical.
- EXT-7 (cap), `scene-adapter.mjs:155`: `boxCentre` / `tokenCentre` helpers in portals-core; landing goldens byte-identical.
- perf-1 (cap), `badges.mjs:144`: cache sample points on the badge record (check badges-gm.json does not serialise it).
- perf-2 (cap), `badges.mjs:217`: add a `// hot:` comment and an early-out in `hideTip`.
- portals-async-3 (cap), `party.mjs:88-89`: comment that the keepId-refusal election is right for embedded Tokens and the blueprint's world-document "replaces" note does not apply.
- EXT-11 (cap), `api-manifest.mjs:30`: add api.test guards that manifest rows match `SNAP_DIR` and the link fade duration (after EXT-2).

## Verification

- 43786c26: keep
- fa0e3e45: keep
- 8a3fe6ca: keep
- c2c3a117: keep
- d8815a22: keep
- 5d0f75c4: keep
- 9d6647f4: keep
- e5fb5995: keep
- e56ff1e5: keep
- 0558ca76: keep

## Gates

- Gate (module suite, kit check, conformance): `node test/run.mjs` 193 pass, 0 fail; portals-core 52 passed; vendored kit identical to `foundry/lib` (9 files); conformance 100.0 % (50/50 fail-class rules); make exit 0.
- `make foundry-adjustments-check`: 120/120 pass.
- Untouchables clean; the diff touches only scope paths.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'`).
