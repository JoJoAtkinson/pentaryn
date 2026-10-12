---
title: "Final review 2026-10-12 — prompts-core"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of prompts-core found, changed, and left for Joe. History, not instructions.

## Verdict

**NEEDS-JOE.** Five behaviour-preserving fixes and refactors were kept, but several real defects (replaceMany concurrency and partial-delete, the P-key rejection path, the keyless keydown crash) need behaviour changes that only Joe can approve.

## Scope

- Module `pentaryn-prompts`, area prompts-core: `prompts.mjs`, `prompts-core.mjs`, `api.mjs`, `api-manifest.mjs`, `core/**`, `build-core.mjs`, `npc-core.mjs`, `readback-core.mjs`, `geometry-core.mjs`, `typeahead-core.mjs`, `cache.mjs`, `gather.mjs`, `replace.mjs`, `placement.mjs`, `settings.mjs`, `patches.mjs`, `marker-guard.mjs`, plus `test/**`.
- Base `bb93da9f` (origin/main), branch `review/prompts-core`, worktree `pentaryn-review-prompts-core-wt`.
- Triage: 47 findings (45 visible to triage, the list was cut at AC-5), 10 duplicates dropped, 10 DO items (5 DO-EDGE, 5 DO-REFACTOR), the rest RECORD.

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| R1 | core/xp.mjs (parseParty) | medium | DO-EDGE, kept | An unreadable party size threw RangeError; now null |
| EC-4 | core/text.mjs (stripHtml) | low | DO-EDGE, kept | A numeric entity above 0x10FFFF threw; now left as written |
| EC-1 | gather.mjs:108 | low | DO-EDGE, reverted | A lone Scene document was stored whole in lastCalls |
| EC-5 | npc-core.mjs / build-core.mjs | low | DO-EDGE, kept | Object.prototype names passed the unknown-key / unknown-ability checks |
| R4 | typeahead-core.mjs:96 | medium | DO-EDGE, reverted | keyDown with no `key` throws "k is not iterable" |
| M1 | replace.mjs:532 | low | DO-REFACTOR, abandoned | encounterXp docblock says "Hostile-or-neutral npcs only." inaccurately |
| M2 | replace.mjs | low | DO-REFACTOR, kept | Two console.warn calls go through the module logger |
| M15 | api.mjs | low | DO-REFACTOR, kept | describe().events reads HOOKS instead of a literal {} |
| M-doc | gather.mjs, core/view.mjs, core/gather-text.mjs | low | DO-REFACTOR, kept | gather/buildView/renderGather docblocks match what they read and return |
| AC-1 | replace.mjs:602 | high | RECORD | Overlapping replaceMany runs build duplicates |
| AC-2 | replace.mjs:79 | high | RECORD | One vanished marker leaves every other replaced marker on that scene undeleted |
| EC-6 | placement.mjs:34 | low | RECORD | place / P key rejects instead of null; type-ahead ticket stays armed |
| EC-3 | gather.mjs:81 | low | RECORD | An unreadable call party overrides the world party and gets the wrong `<party>` line |
| EC-7 | gather.mjs:57 | low | RECORD | Paging `scenes: "all"` dead-ends with SCENE_UNKNOWN when `next` lost its prompts |
| EXT-4 | replace.mjs:99 | low | RECORD | whyGone and readDoc name the same document differently |
| EXT-2 | gather.mjs:77 | medium | RECORD | Setting defaults repeated as literals across settings/gather/core |
| EXT-1 | cache.mjs:12 | medium | RECORD | Hook invalidation scope kept apart from INVALIDATING_HOOKS; deleteActor absent |
| EXT-3 | replace.mjs:46 | medium | RECORD | Placed document types listed in about five places |
| M3 | core/view.mjs:30 | medium | RECORD | buildView is ~180 lines doing six jobs |
| M4 | replace.mjs:602 | medium | RECORD | replaceMany is ~112 lines with four write/readback steps inline |
| M6 | core/doors.mjs:39 | low | RECORD | Segment-or-wallSegment test copied four times |
| M7 | gather.mjs:114 | low | RECORD | Crop rendering written twice |
| M9 | core/gather-text.mjs:82 | low | RECORD | renderGather ~97 lines; homes query written three times |
| M11 | core/text.mjs:1 | low | RECORD | File headers under-describe or name the wrong import source |
| M12 | npc-core.mjs:16 | low | RECORD | ABILITY_KEYS / DND_SIZE_WIDTH / PC_SIZE_WORDS restate other tables |
| M13 | core/gather-text.mjs:19 | low | RECORD | LEGEND Bands line is a hand copy of BANDS |
| M14 | core/pool.mjs:5 | low | RECORD | core imports from ../build-core.mjs (reversed direction) |
| EXT-5 | core/doors.mjs:83 | low | RECORD | `/^p\d+$/` prompt-id test repeated three times |
| EXT-8 | npc-core.mjs:112 | low | RECORD | sourceRules enum written three times |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 94a8634b | parseParty returns null for an unreadable party size | review-prompts-core.test.mjs — "parseParty: an unreadable size is null, not a RangeError" |
| 12000da4 | stripHtml leaves an out-of-range numeric entity as written | review-prompts-core.test.mjs — "stripHtml: an out-of-range numeric entity is left as written" |
| 9b044d16 | Object.prototype names are unknown npc keys / unknown abilities | review-prompts-core.test.mjs — "normaliseNpc: an Object.prototype name is an unknown key; normaliseAbilities: …" |
| b0d46c52 | replace's two failure warnings go through the module logger | existing replace tests (byte-identical through the same console) |
| 313c467d | describe().events reads HOOKS | api-kit.test.mjs |
| 059c6732 | gather() docblock lists every param and return field | comment only |
| 5256fe87 | buildView / renderGather docblocks | comment only |

## Changes reverted by verification

| commit | verifier's reason |
|---|---|
| 20b30324 (reverted by ba5da33f) | `typeof scenes === "object"` changes stored output for more than a lone Scene document (boxed strings, toString objects, JSON-able fake scenes); the promise cited is only a code comment; the test was added to a frozen test file |
| a38d8c55 (reverted by 5196b626) | Not behaviour-preserving: a keyless event with `isComposing: true` used to be swallowed (true/true) and now passes through to Foundry hotkeys (false/false); the new test does not cover it |

## Recorded for Joe

- **defect** replace.mjs:602 (AC-1) — overlapping replaceMany runs build duplicates; needs a per-scene run lock (behaviour change: a second run waits or is refused).
- **defect** replace.mjs:79 (AC-2) — one vanished marker throws MARKER_GONE and leaves every other already-replaced marker on that scene undeleted; decide to skip-and-report or roll back.
- **defect** typeahead-core.mjs:96 (R4, reverted) — keyDown with an event whose `key` is not a string throws "k is not iterable"; fix with `typeof ev.key !== "string"` checked *after* the `isComposing` line so composing events stay swallowed, test both inputs.
- **defect** placement.mjs:34 (EC-6) — move tokenDataFrom/settingStrict inside the existing try so failure logs and returns giveUp(); add `.catch` with cancelTyping(ticket) on onPlaceKey's call.
- gather.mjs:108 (EC-1, reverted) — narrow to `scenes?.documentName === "Scene" ? [scenes.id]`, test in review-prompts-core.test.mjs, not the frozen gather-glue.test.mjs.
- replace.mjs:532 (M1, abandoned) — comment-only docblock fix was declined by its agent over a request mismatch; re-run if wanted.
- gather.mjs:81 (EC-3) — unreadable call party: fall back to the world party or give it its own `<party>` wording; `partySource` is "call" only for a truthy partyArg while `party: ""` still wins via `??`.
- gather.mjs:57 (EC-7) — paging `scenes: "all"` when `from` dropped out of the filtered list: continue from the next listed scene instead of SCENE_UNKNOWN.
- replace.mjs:99 (EXT-4) — pick one nameOf(doc); an empty-label Note reads `Note ""` in the readback but `Note "<entry>"` in MARKER_GONE.
- gather.mjs:77 (EXT-2) — shared default constants for settings/gather/core; touches settings default expressions (same values), needs Joe's OK.
- cache.mjs:12 (EXT-1) — one INVALIDATION table with a scope per row; also decide whether deleteActor belongs in INVALIDATING_HOOKS (behaviour change).
- replace.mjs:46 (EXT-3) — a private PLACED table deriving TYPES and whyGone collections in the same order.
- core/view.mjs:30 (M3) — split buildView into encounterRelations / aloneNotes / doorGroups, same order.
- replace.mjs:602 (M4) — add a create/delete call-order test, then extract replaceMany's four steps.
- core/doors.mjs:39 (M6) — non-barrel asSegment for the three strict sites; leave doors.mjs:39 loose.
- gather.mjs:114 (M7) — private cropImages helper shared by gather() and crops().
- core/gather-text.mjs:82 (M9) — private homesOf / renderOverview helpers.
- core/text.mjs:1 (M11) — fix file header comments (also core/placement.mjs, core/size.mjs, prompts-core.mjs:4-5, build-core.mjs:9).
- npc-core.mjs:16 (M12) — derive ABILITY_KEYS, DND_SIZE_WIDTH, PC_SIZE_WORDS from their sources with oracle tests.
- core/gather-text.mjs:19 (M13) — build the LEGEND Bands line from BANDS.
- core/pool.mjs:5 (M14) — move sameName into core, re-export from build-core.
- core/doors.mjs:83 (EXT-5) — export isPromptId from core/group.mjs.
- npc-core.mjs:112 (EXT-8) — a local RULES const for the sourceRules enum.
- Triage input was truncated after AC-5; any findings past that point were not triaged and should be re-listed.

## Verification

- 94a8634b — keep
- 12000da4 — keep
- 20b30324 — revert (ba5da33f)
- 9b044d16 — keep
- a38d8c55 — revert (5196b626)
- b0d46c52 — keep
- 313c467d — keep
- 059c6732 — keep
- 5256fe87 — keep

## Gates

- `make check-all`-style module gate in the worktree: pentaryn-prompts core 415 passed, 0 failed; vendored kit identical (12 files); conformance 100.0 % (50/50); node tests 230 total, 224 pass, 0 fail, 6 skipped. Changed paths all in scope; untouchables clean.
- `make check-context` with this record in place: passed (context surface OK, 5 pre-existing warnings in other plans).
- Goldens byte-identical: yes.
