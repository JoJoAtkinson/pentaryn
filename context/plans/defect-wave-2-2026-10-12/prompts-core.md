# Defect wave 2 2026-10-12 — prompts-core (pentaryn-prompts)

**Read this when:** you want the history of defect wave 2 (2026-10-12) for the prompts-core group of `pentaryn-prompts`: what was fixed, why, and how to check it live. History, not instructions.

Source records: [`final-review-2026-10-12/`](../final-review-2026-10-12/) (prompts areas). Branch `fix2/prompts-core-2026-10-12`.
Gate: `make foundry-prompts-check` — node tests 281 pass / 6 skipped / 0 fail, core 415 passed, vendored kit identical (13 files), conformance 100 % (50/50).

Every item is a declared behaviour change with a line under the CHANGELOG `Unreleased` header. No version bump. Joe gave no item-specific ruling, so each takes the review's recommendation.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| prompts-core-AC-1 | Two replace runs on the same marker at once could build it twice | Recommendation | Overlapping replace runs queue per scene and each marker is claimed (`flags.pentaryn-prompts.claims.replace`). A second run in the same tab waits, then reports the marker as already replaced (MARKER_GONE, "replaced by"); a run from another GM tab skips only that marker as "being replaced by another GM tab". Every other marker still gets built. Uses the vendored kit `lib/election.mjs`. | `c31dbaec` | `test/replace-overlap.test.mjs` |
| prompts-core-AC-2 | One marker vanishing mid-replace left the scene's other replaced markers undeleted | Recommendation | The other markers are still deleted (`markerDeleted: true`); the vanished marker's row keeps its replacement with a "marker was already gone" warning. | `ee453bae` | `test/replace-vanished.test.mjs` |
| prompts-core-R4 | A keydown with no `key` while typing into a prompt box threw | Recommendation | The press is ignored, the text is kept, no error. | `09307487` | `test/typeahead-core.test.mjs` |
| prompts-core-EXT-2 | Setting defaults were written in two places | Recommendation | Defaults (60 ft unseen range, 6 crops, 768 px, crops "auto", 400 gather chars) live once in `core/defaults.mjs`; values unchanged. | `95f53720` | `test/ext2-defaults.test.mjs` |
| prompts-core-EXT-1 | Deleting an actor did not clear the hover-tip scene-model cache | Recommendation | `deleteActor` now drops every scene's cached model, like `updateActor`; scopes live in one INVALIDATION table. | `d44c15c4` | `test/ext1-invalidation.test.mjs`, `test/cache.test.mjs` |
| prompts-core-EXT-3 | Placed document types listed in several places | Recommendation | One PLACED table drives create order and the MARKER_GONE lookup; order unchanged. | `458367be` | `test/ext3-placed.test.mjs` |
| prompts-core-M3 | `buildView` too long | Recommendation | Split into `encounterRelations` / `aloneNotes` / `doorGroups`; gather readout byte-identical. | `141e1413` | `test/m3-buildview-split.test.mjs` |
| prompts-core-M4 | `replaceMany` too long | Recommendation | Write/readback steps are private helpers; per-scene create order (one kind at a time, then marker deletes) pinned by test. | `f2f92de1` | `test/m4-replace-steps.test.mjs` |
| prompts-core-EC-6 | A P key / place that could not build its marker left keystrokes swallowed | Recommendation | It logs the error, cancels the type-ahead ticket and returns null; the keyboard is freed. | `72b5fef8` | `test/ec6-place-failure.test.mjs` |
| prompts-core-EC-1 | A lone Scene passed to gather was stored whole in lastCalls | Recommendation | Only the scene id is stored. | `15452f65` | `test/review-prompts-core.test.mjs` |
| prompts-core-M1 | `encounterXp` docblock described the wrong rule | Recommendation | Comment now says `actorXp` decides who counts. Comment only. | `53aac16d` | `test/m1-encounterxp-doc.test.mjs` |
| prompts-core-EC-3 | An unreadable / blank call party gave a confusing party line | Recommendation | Falls back to the world party setting, labelled as from the setting; if neither reads, the `<party>` line says none is set and that the call's party could not be read. | `7bcfac4f` | `test/review-prompts-core.test.mjs` |
| prompts-core-EC-7 | Paging scenes "all" stopped with "scene unknown" when the next scene lost its prompts | Recommendation | The next page resumes at the next scene that still has prompts, or comes back empty. | `1dd22610` | `test/ec7-paging.test.mjs` |
| prompts-core-EXT-4 | Readback and MARKER_GONE named the placed thing differently | Recommendation | One `nameOf`: name, then text, then journal entry name, or "Light". | `5f338a08` | `test/ext4-name.test.mjs` |
| prompts-core-M6 | Three copies of the wall segment-ready test | Recommendation | One core-only `asSegment`. Behaviour unchanged. | `580ba5a0` | `test/m6-as-segment.test.mjs` |
| prompts-core-M7 | Gather and crops cropped images via two paths | Recommendation | One private `cropImages` helper; crops identical. | `b3dd4a23` | `test/m7-crop-images.test.mjs` |
| prompts-core-M9 | `renderGather` too long | Recommendation | Private `renderOverview` and `homesOf` helpers; text identical. | `e551a258` | `test/m9-gather-text-helpers.test.mjs` |
| prompts-core-M11 | Stale source-file headers | Recommendation | Five headers say what each file holds and where its names are re-exported from. | `62fabe0b` | `test/m11-file-headers.test.mjs` |
| prompts-core-M12 | Copied tables could drift | Recommendation | `ABILITY_KEYS`, `DND_SIZE_WIDTH`, `PC_SIZE_WORDS` derived from their source tables; values unchanged. | `d0539559` | `test/m12-derived-tables.test.mjs` |
| prompts-core-M13 | Legend bands line hand-written | Recommendation | Built from `BANDS`; text unchanged. | `c90712dd` | `test/m13-legend-bands.test.mjs` |
| prompts-core-M14 | Core imported `sameName` from `build-core` above it | Recommendation | `sameName` moved to `core/text.mjs`. | `7c66ea58` | `test/m14-core-imports-down.test.mjs` |
| prompts-core-EXT-5 | Prompt-id test (p1, p2, …) copied in doors and replace | Recommendation | `isPromptId` exported once from `core/group.mjs`. | `81890128` | `test/ext5-prompt-id.test.mjs` |
| prompts-core-EXT-8 | sourceRules enum (2014/2024) repeated | Recommendation | One local `RULES` const for all three sites; default 2014 unchanged. | `58bd4541` | `test/ext8-source-rules.test.mjs` |

## Goldens changed

- `test/golden/describe.json` — replace writes list gains the cross-tab claim flag, replace doc mentions queueing / MARKER_GONE (AC-1); a `deleteActor: scene-model cache` hook row (EXT-1).
- `test/golden/replace-real-actor.json`, `replace-real-hotspot.json`, `replace-real-kinds.json`, `replace-real-light.json` — each marker's claim `update` (`flags.pentaryn-prompts.claims.replace`) now precedes the creates (AC-1).

## Deploy

Module `pentaryn-prompts` only: `.mjs` files and a kit `lib/` file (`election.mjs`, lock updated). `module.json` unchanged, so a reload suffices (blueprint §10). No `scripts/**`, no fork change.

## Live check after deploy

Use only ZZ-prefixed scratch scenes and actors you create; never Caven, Marrith, Talo or a campaign scene; one GM tab. Delete the scratch documents afterwards. Items marked code-only above (EXT-1..5, EXT-8, M1, M3, M4, M6, M7, M9, M11..M14, EC-1, EC-3, EC-7) need no live check beyond the gate.

**prompts-core-AC-1**
1. Make scene `ZZ Prompts Overlap` with two prompt markers.
2. In one eval-js, call `replaceMany` for both markers twice without awaiting the first.
3. Expect exactly one replacement per marker, both markers deleted, and the second call's rows `MARKER_GONE` with "replaced by".

**prompts-core-AC-2**
1. Make scene `ZZ Prompts Vanish` with three markers; stub `planOne` with a short delay.
2. Start `replaceMany` for all three; in a second eval delete one marker by hand before step 2 runs.
3. Expect the other two markers gone with `markerDeleted: true`; the third row carries the "already gone" warning and its replacement still exists.

**prompts-core-R4**
1. On a ZZ scratch scene press P to open a box and type some text.
2. Dispatch a synthetic `keydown` with no `key` on `window`.
3. Expect no console error, the text kept, and the next printable key landing in the box.

**prompts-core-EC-6**
1. Stub `tokenDataFrom` to throw (or temporarily rename the ZZ default-size marker actor).
2. Press P on a ZZ scratch scene.
3. Expect a warning / logged error, no unhandled rejection, and typing immediately afterwards reaches Foundry. Restore the stub/name.
