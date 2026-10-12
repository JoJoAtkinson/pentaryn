---
title: "Final review 2026-10-12 — journal"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of journal found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — journal

## Verdict

**NEEDS-JOE.** The kept changes are behaviour-preserving and the gate is green, but real defects are recorded: two GM tabs both create a new player's journal, two overlapping saves duplicate a copy, a throw in `onBarClick` leaves a bar stuck on "Adding…", and the pinned-journal cache is never cleared on `updateScene` even though the docs say it is.

## Scope

- Paths: `foundry/module/pentaryn-journal/**` (module `pentaryn-journal`) and this record.
- Base: `6a06664c` (origin/main when the review started).
- Branch: `review/journal`, worktree `pentaryn-review-journal-wt`.
- Triage: 40 findings, giving 9 DO-REFACTOR, 0 DO-EDGE, 22 RECORD and 9 DROP (7 duplicates, 2 not actionable).

## Findings by lens

Line numbers are at the review HEAD unless noted.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| M1 | sources-adapter.mjs | low | DO-REFACTOR, kept | `targetOf` re-implemented `rawTargetOf`; it is now `rawTargetOf` plus the bar's gate |
| M2 | api.mjs | low | DO-REFACTOR, kept | `status()` and `statusFor()` each had their own copy of the saved-itself fallback, and neither was tested |
| M5 | api.mjs | low | DO-REFACTOR, kept | `coreMembers` special-cased `MOD`, which journal-core already aliases to `MODULE` |
| M3 | personal.mjs | low | DO-REFACTOR, kept | `personalsOf` re-spelled `core.isMine` |
| perf-1 | bar.mjs | low | DO-REFACTOR, kept | `savedStatus` searched every source when the first saved one is enough |
| M4 | personal.mjs | low | DO-REFACTOR, kept | `ensureAll` and `report` each spelled out the at-root query |
| M6 | personal.mjs | low | DO-REFACTOR, kept | The player's 8 s query timeout was a bare literal, and `LOSER_WAIT_MS` depends on it |
| EXT-4 | api.mjs:94 | low | DO-REFACTOR, kept | selftest's settings-readable check hard-coded the Boolean keys instead of reading `SETTINGS` |
| M8 | journal.mjs:7 | low | DO-REFACTOR, kept | The header said "load order" for a list that is grouped by layer |
| journal-async-1 | personal.mjs:217 | medium | RECORD | `createUser` and ready's `ensureAll` are gated per user, not per tab, so two GM tabs both create (reproduced 2/2/2) |
| rob-1 | bar.mjs:205 | medium | RECORD | `decorate(app)` runs before the try in `onBarClick`, so a throw leaves `busy` set for the session |
| EC-2 | bar.mjs:277 | low | RECORD | The pinned cache's docs say `updateScene` clears it, but `PIN_HOOKS` doesn't watch `updateScene` |
| journal-async-2 | bar.mjs:85 | low | RECORD | Two overlapping `save()` calls both create a copy (reproduced: 2 pages) |
| journal-async-3 | personal.mjs:87 | low | RECORD | `ensureAll` does one awaited create per player |
| rob-2 | personal.mjs:135 | low | RECORD | After a relay the player polls for 1 s and ignores the `{entryId}` reply, so a late broadcast skips silently |
| rob-3 | sources-adapter.mjs:41 | low | RECORD | Legacy User-taking rows have `resolve:false`, so an id or name string gives a wrong answer |
| rob-4 | bar.mjs:321 | low | RECORD | The singlePageReadables listener has no per-window try/catch |
| rob-5 | personal.mjs:93 | low | RECORD | When a create is vetoed, an unguarded `folder.id` / `j.uuid` throws a bare TypeError |
| rob-6 | bar.mjs:102 | low | RECORD | A failed `openSaved` render rejects `add` after the copy has already been saved |
| EC-3 | bar.mjs:90 | low | RECORD | The bar still shows on a readable with no pages the player can see, and clicking it does nothing visible |
| EC-4 | journal-core.mjs:514 | low | RECORD | `claimWinner` compares `Date.now()` from different machines |
| EC-5 | journal-core.mjs:166 | low | RECORD | An `@Embed` with no uuid gets its label escaped twice |
| EC-6 | journal-core.mjs:116 | low | RECORD | stripSecrets parses `<section/>` differently, but no stored data can reach that case. Knowledge only |
| perf-2 | sources-adapter.mjs:95 | low | RECORD | The hash is not memoised alongside sanitize |
| perf-3 | sources-adapter.mjs:106 | low | RECORD | The item bar re-scans and re-sanitizes on every decorate, and refreshes on any item update |
| perf-4 | bar.mjs:258 | low | RECORD | `refreshBarsNow` runs `personal()` once per open bar |
| M7 | bar.mjs:358 | low | RECORD | Three `ctx.exposed` members are used only by features.test |
| M9 | bar.mjs:2 | low | RECORD | Headers describe the bar as eye/pin-only, but the real rule is broader |
| EXT-6 | api-manifest.mjs:130 | low | RECORD | The skip-reason list is written by hand in four places |
| EXT-8 | journal-core.mjs:34 | low | RECORD | The `I18N` and `CSS` constants are never used |
| EXT-9 | journal-core.mjs:482 | low | RECORD | `pinnedEntryIds` is a copy of dropbin's version, and the two have drifted apart |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| d887a2f2 | M1: `targetOf` is `rawTargetOf` followed by the bar's gate (`shouldShowItemBar` for items, `shouldShowBar(t.entry)` otherwise). `targetFor`'s Item branch delegates to it, and the README "Extending" section says so | `test/adapter.test.mjs`: "targetOf equals rawTargetOf gated by the bar's rule" (10 docs × P1 / GM with three gmButton states; written first and passes on old and new code) |
| ae1e1285 + 863f123c | M2: a characterisation test, then a local `statusOrSaved` helper shared by `status()` and `statusFor()` | `test/llm-reads.test.mjs`: "status/statusFor answer saved when nothing is visible but the document itself is saved" (passes before and after; deleting the fallback by hand fails it) |
| e37f1834 | M5: `coreMembers` reads `core.MOD` directly | `test/api.test.mjs`: "journal.core is exactly the 18 legacy names, a frozen copy; core.MOD is the module id" |
| 68853b4f | M3: `personalsOf` filters with `core.isMine` | `test/glue.test.mjs`: "personal(): the user's own journal (oldest first)…" |
| af961581 | perf-1: `savedStatus` stops at the first saved source | `test/perf.test.mjs`: "savedStatus stops at the first saved source" (failed only on the find count before the change) |
| 65e573c3 | M4: one `atRootJournals()` query, used by `ensureAll` and `report` | `test/glue.test.mjs`: "a personal journal at the root: report() lists it, ensureAll moves it in one batched update" (pins the exact write list) |
| 5a7cac52 | M6: `QUERY_TIMEOUT_MS = 8_000` names the player's query timeout | Existing player-relay, two-tabs and claim tests (they pin the 7 s loser bound) |
| 61d7299f | EXT-4: selftest's settings-readable check reads the Boolean rows from `SETTINGS` | `test/api.test.mjs`: "selftest: settings readable is false when a Boolean setting reads non-boolean" |
| a8f777a7 | M8: journal.mjs header says "by layer" (comment only) | n/a (comment only) |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** `personal.mjs:217`: `createUser` and ready's `ensureAll` are gated by `activeGM.isSelf`, which picks a user, not a tab. With the bridge tab and a GM browser tab both open, each one creates the new player's journal, and the folder too if it is missing (reproduced 2/2/2). Route each player through `relayEnsure(user)` so the existing `claims.ensure.<socketId>` stamp picks one tab (costs 2 User updates per player), or add a README Pitfalls line.
- **defect** `bar.mjs:205`: `onBarClick` calls `decorate(app)` before the try. If that throws, `busy` is never cleared and the window's bar stays on "Adding…" for the rest of the session. The open branch and the click listener's promise also have no catch, so the errors become unhandled rejections. Move `decorate` inside the try, catch the open branch with `ctx.log.warn('open failed')`, and optionally add `.catch` on the listener.
- **defect** `bar.mjs:85`: two overlapping `save()` calls plan from the same pages and both create a copy (reproduced: 2 pages for one readable). `busy` is per window and `api.add` has no guard. Chain `save()` calls per module.
- **defect** `bar.mjs:277`: the pinned-journal cache is not cleared on `updateScene`, even though bar.mjs:271-273, journal-core.mjs:489-490 and the pinned.test header say it is. `PIN_HOOKS` has five hooks, and a `scene.update({notes})` can leave `pj-single` stale. Either add `updateScene` (filtered to changes that include notes) after a live check that v14 fires no per-Note hooks for that diff, or reword the three comments to name the five hooks that are actually watched.
- `personal.mjs:135`: after a successful relay, the player polls for only 1 s and ignores the `{entryId}` reply. A late broadcast gives a silent no-journal skip with no toast. Fall back to `game.journal.get(entryId)` and/or show `notify.failed`.
- `sources-adapter.mjs:41`: the legacy rows that take a User (`personal`, `shouldShowBar`, `ensure`) have `resolve:false`. A user id or name string from the bridge gives a silently wrong answer. Switch to `resolve:'self'` / `resolveRef`, which changes manifest rows and describe.json.
- `bar.mjs:321`: the singlePageReadables change listener calls `applySinglePage` for each window with no try/catch, so one throw skips the remaining windows and escapes into `settings.mjs` `changed()`. Wrap each call the way the render hook does.
- `personal.mjs:93`: `ensureAll` reads `folder.id` with no guard, and the relay reads `j.uuid`/`j.id` with no guard. When a create is vetoed, the result is a bare TypeError. Use `folder?.id ?? null`, and a codedError when `relayEnsure` resolves nothing.
- `bar.mjs:102`: `save()` awaits `openSaved` after the write. A failed render rejects `add`, and the player sees the "failed" toast even though the copy was saved. Catch the failure, warn, and return the result.
- `bar.mjs:90`: a readable the player can observe, but with no pages they can see, still shows "Add to my journal", and clicking it does nothing visible (skip.test pins that no toast is shown). Hide the bar when `descriptorsFor` is empty, or add a "nothing here you can keep" toast.
- `journal-core.mjs:514`: `claimWinner` compares `Date.now()` stamps from tabs that may be on different machines. More than 60 s of clock skew lets two tabs both win. Stamp with `game.time.serverTime` instead.
- `journal-core.mjs:166`: an `@Embed` with no uuid escapes its label a second time (`&amp;` becomes `&amp;amp;`), while the uuid branch does not. Fixing it changes sanitize output and hashes, so saved copies that contain such an embed would show as "changed".
- `journal-core.mjs:116`: stripSecrets handles `<section/>` and a raw-text `</section>` differently from an HTML parser. Foundry's cleanHTML normalises both on write, so stored data cannot reach them. No action needed; don't "fix" this as a privacy bug.
- `personal.mjs:87`: `ensureAll` makes one awaited `JournalEntry.create` per player, against the spirit of C59 (the scanner misses it because the call is inside `ensureFor`). Batch them with `createDocuments` if the player count grows.
- `sources-adapter.mjs:95`: sanitize is memoised but the fnv1a hash is not, so every bar refresh re-hashes every body. A hash memo keyed by the sanitize key changes the descriptor shape, so it was deferred.
- `sources-adapter.mjs:106`: an open item bar re-runs `itemSource` and an unmemoised sanitize on every decorate, and `updateItem` refreshes on any item update in the world. Gating to the open bar's item id changes the re-render count (perf.test pins it).
- `bar.mjs:258`: `refreshBarsNow` runs `personal()` once per open bar instead of once per pass. Revisit if journals grow large.
- `bar.mjs:358`: `refreshBars`, `applySinglePage` and `personal.mjs` `findFolder` are on `ctx.exposed`, but only features.test uses them. Trim them (and the features.test key list) or keep them with a comment.
- `bar.mjs:2`: the headers (bar.mjs:2-3, journal.mjs:4, README:8-9) say the bar is eye/pin-only. The code shows it on any observed, non-owned entry and on any item in an enabled pile, which is what README:17-18 says. Reword the headers, or add a pin gate (that would be a behaviour change).
- `api-manifest.mjs:130`: the skip-reason vocabulary is written by hand in core, api, the manifest `lastReason` row and the README, and nothing checks they agree. Add a test-only cross-check, or a shared `SKIP_REASONS` table.
- `journal-core.mjs:34`: the `I18N` and `CSS` constants are never used, and about 40 literal `PENTARYN_JOURNAL.*` / `pj-*` strings are spread across the files. This is a blueprint-level note, not a module edit.
- `journal-core.mjs:482`: `pinnedEntryIds` copies pentaryn-dropbin's rule, and the copies have drifted (dropbin's is not null-safe). Candidate for the kit, together with its list of invalidation hooks.

## Verification

- d887a2f2: keep
- ae1e1285: keep
- 863f123c: keep
- e37f1834: keep
- 68853b4f: keep
- af961581: keep
- 65e573c3: keep
- 5a7cac52: keep
- 61d7299f: keep
- a8f777a7: keep

## Gates

- Module gate (`node test/run.mjs`, kit identity, conformance): ok. 99 tests, 99 pass, 0 fail. pentaryn-journal core: 81 passed. The vendored kit is identical to foundry/lib (9 files). Conformance is 98.0% (49/50 fail-class rules), with only the accepted exception C56 and no new rows. The diff stays inside scope.
- `make check-context` passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
