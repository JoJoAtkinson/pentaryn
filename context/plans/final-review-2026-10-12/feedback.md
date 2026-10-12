---
title: "Final review 2026-10-12 — feedback"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of feedback found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — feedback

## Verdict

**NEEDS-JOE.** The kept changes are behaviour-preserving and the gate is green. Real defects are still recorded, though. The worst is that one queue entry with an out-of-range timestamp blocks that player's queue for good (rob-1). Others are a failed mkdir cached for the whole tab, `readAll` not skipping unreadable files as its doc promises, raw TypeErrors from APIs documented as "never throws", the dialog close race, and the README's redaction claim, which is wrong for some error messages.

## Scope

- Paths: `foundry/module/pentaryn-feedback/**` (module `pentaryn-feedback`) and this record.
- Base: `6a06664c` (origin/main when the review started).
- Branch: `review/feedback`, worktree `pentaryn-review-feedback-wt`.
- Triage: 36 findings, giving 10 DO (2 DO-EDGE, 8 DO-REFACTOR), 16 RECORD and 10 DROP (8 duplicates, 2 not worth a commit).

## Findings by lens

Line numbers are at the review HEAD.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| perf-1 | api.mjs:81 | low | DO-EDGE, kept | inspect(Actor) with no player read every report file; it now reads none and gives `reports: []` |
| EC-2 (+async-1 half) | dialog.mjs:108 | low | DO-EDGE, kept | Two open() calls racing the first render built two dialogs; they now share one and keep both drafts |
| M2 | README.md:63 | low | DO-REFACTOR, reverted | README redaction wording; the new sentence was still wrong about error messages |
| M1 | feedback-core.mjs (userFieldsOf) | low | DO-REFACTOR, kept | One `userFieldsOf(user)` in core replaces two `plainUser` copies (reporter, snapshot-adapter) |
| M4 | feedback-core.mjs (isReportId) | low | DO-REFACTOR, kept | One `isReportId` replaces the inline id regex in reporter ingest |
| EXT-1 | test/api.test.mjs | low | DO-REFACTOR, kept | Test-only drift guard ties manifest strings to core tables |
| M3 | api.mjs:109 | low | DO-REFACTOR, kept | readAll returns reports directly, not `{path, report}` wrappers |
| M6 | README.md (Pitfalls) | low | DO-REFACTOR, kept | Pitfall names kit 1.1.0 and says the inner query handler drops ctx |
| M5 | feedback-core.mjs (changedKeys) | low | DO-REFACTOR, kept | changedKeys docstring matches the code (`_id`/`_stats` skipped, one level for system/flags) |
| EXT-5 | feedback-core.mjs (LIST_KEYS) | low | DO-REFACTOR, kept | validateReport loops over a frozen `LIST_KEYS`, not an inline list |
| rob-1 (+EC-1) | feedback-core.mjs:488 | medium | RECORD | A finite `t` outside the Date range passes validation, then throws in normaliseReport outside ingestNow's try, blocking the queue |
| rob-2 | reporter.mjs:100 | low | RECORD | `submit(null)`, `submit({text}, null)`, `resolve(null)`, `ingest(null)` reject with a raw TypeError |
| rob-3 (+EC-4) | files-adapter.mjs:47 | low | RECORD | ensureDir caches a folder as made even after a non-EEXIST failure |
| EC-3 (+rob-4, perf-5) | api.mjs:108 | low | RECORD | "unreadable files skipped" is false: one corrupt or 403/500 file makes list() reject |
| EXT-2 | api.mjs:100 | medium | RECORD | selftest hard-codes recorder's `feedback-console-error` and checks one of two console wraps |
| M7 | recorder.mjs:51 | low | RECORD | History default 200 is a bare literal in three places |
| M8 | recorder.mjs:74 | low | RECORD | The sessionStorage state is named `store`, like the report store() |
| M9 | recorder.mjs:327 | low | RECORD | README:96 says every wrap passes the same arguments; notify passes omitted type as "info" |
| M10 | files-adapter.mjs:31 | low | RECORD | fileStore's `log` option is never set, so its debug lines never fire |
| EXT-6 | recorder.mjs:190 | low | RECORD | The action `kind` vocabulary is scattered literals; the Python test's list is already stale |
| EXT-7 | dialog.mjs:27 | low | RECORD | "What gets attached" leaves out world, tokens, combat and client |
| EC-5 (+perf-4) | recorder.mjs:227 | low | RECORD | `row.id ?? row.cls` never falls back, because clip() turns null into "" |
| feedback-async-1 | dialog.mjs:108 | low | RECORD | Opening while the previous dialog is closing lets the old close delete the new one's instances entry |
| feedback-async-2 | reporter.mjs:261 | low | RECORD | Relay ingest cannot check ctx.user because the kit's registerQueries drops ctx |
| feedback-async-3 (+perf-2) | api.mjs:109 | low | RECORD | readAll makes one serial GET per report file |
| feedback-async-4 | reporter.mjs:311 | low | RECORD | uninstall() clears `chains` mid-ingest; a hot re-install can double-file one entry |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 32356c07 | perf-1: inspect skips reportsBy when the actor has no player | `test/api.test.mjs`: "inspect(Actor) with no player reads no report file and gives reports: [] even when the store is broken" (failed before the fix) |
| 83a1996e | M1: `userFieldsOf` in core, used by reporter and snapshot-adapter (same field order) | `test/core.test.mjs`: "userFieldsOf: a User document's plain fields; null → the empty user"; golden/report.json byte-identical |
| a3ffb2eb | M4: `isReportId` in core, used by validateReport and reporter ingest | `test/core.test.mjs`: "isReportId: 16 letters or digits only" |
| f4603f2a | EXT-1: drift guard for manifest categories, statuses, report file path and queue flag (test only) | `test/api.test.mjs`: "manifest strings match core tables (categories, statuses, report file, queue flag)" |
| d1ff31e6 | M3: readAll returns reports directly; the two callers drop `.map(x => x.report)` | "list: oldest first, status filter, limit, count", inspect tests, queries.json and describe.json goldens |
| 494d68fc | M6: README pitfall names kit 1.1.0 (doc only) | n/a (doc only) |
| be903f26 | M5: changedKeys docstring, plus `_stats: {}` in the existing test input | `test/core.test.mjs`: "changedKeys: top-level and system.* / flags.* one level, never values, at most 8" |
| ba310d7c | EXT-5: frozen `LIST_KEYS` export, same order; README "Extending" step 3 mentions it | `test/core.test.mjs`: "LIST_KEYS covers every list section plus the two rings" |
| d8f2a251 | EC-2: ReportDialog `#opening` lets a second open() during the first render reuse that dialog | `test/glue.test.mjs`: "two open() calls racing the first render share one dialog and keep both drafts" (failed before the fix) |

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| 9259eb5e | a043182a | The new README sentence still says error messages and stacks pass through `redact()`. Two paths only clip them: recorder.mjs `pushOwnError` (:68, called at :314 and :331), and snapshot-adapter section errors (:23, :32), which reach `sectionErrors`. It replaced a big overstatement in a privacy statement with a smaller one. |

## Recorded for Joe

- **defect** `feedback-core.mjs:488` (rob-1 + EC-1, top priority): a finite `t` outside the Date range passes validateReport, then normaliseReport throws a RangeError in ingestNow outside its try. That player's queue is then blocked for good: the entries in front of it are re-filed and re-toasted, and their keys are never deleted. Fix: `if (!Number.isFinite(report.t) || Number.isNaN(new Date(report.t).getTime())) return { ok: false, reason: "t must be a timestamp" };`. ingestNow's existing refuse-and-delete branch then drops the entry. Do not move normaliseReport into the try. Tests: core `validateReport` with t = 1e16 is refused, and a glue test next to "a malformed queue entry is refused and dropped" uses t = 1e20. Only a hand-written User flag can reach this.
- **defect** `README.md:63` / `feedback-core.mjs:8` / `feedback-core.mjs:121` (M2, reverted 9259eb5e): the README says every string passes through `redact()`. The player's report text and document/user names are only clipped. So are the recorder's own errors (recorder.mjs:68 pushOwnError) and snapshot section errors (snapshot-adapter.mjs:23, :32 → sectionErrors). Only page-originated error-ring entries (via errorEntry), chat flavor, window titles, click labels and notification text are redacted. Either correct the README, header and redact() doc to say exactly this, or redact those paths too (a behaviour change). Pin it with the `buildReport` text test from 9259eb5e plus a sectionErrors case.
- **defect** `files-adapter.mjs:47` (rob-3 + EC-4): ensureDir adds a folder to `made` even after a createDirectory failure that is not EEXIST, so after one transient failure every later upload in that tab fails until a reload. Option A: in put() (:52), drop `dirChain(dir)` from `made` when the upload is refused. Option B: add to `made` only on success or EEXIST. Re-pin the adapters test "put creates each folder once per tab (EEXIST tolerated)" and add one for a mkdir that fails once and then succeeds.
- **defect** `api.mjs:108` (EC-3 + rob-4, perf-5): readAll's doc says "unreadable files skipped", but a corrupt file, or a GET that returns 403/500, makes list() reject and sets inspect's `reports` to null. An array-valued .json lists as a row of nulls. Fix: try/catch per file, require a non-array object, and add a debug line in reportsBy's empty catch. Or keep the behaviour and change the comment to "missing files skipped".
- **defect** `reporter.mjs:100` / `reporter.mjs:261` / `api.mjs:184` (rob-2): `api.submit(null)`, `api.submit({text:'x'}, null)`, `api.resolve(null)` and `ingest(null)` reject with a raw TypeError, despite "never throws" and the fail() contract. Normalise with `?? {}` at each entry so they take the existing BAD_ARGS / NOT_GM / NOT_FOUND fail. Only direct JS callers can reach this, because the kit's queries already use `data ?? {}`.
- **defect** `dialog.mjs:108` (feedback-async-1, close half): opening while the previous dialog is CLOSING builds a new dialog, and the old close then deletes the new one's `foundry.applications.instances` entry, so Escape no longer closes it. Override close() to keep the close promise, and have open() await it. This needs a live Foundry check, because the node stub closes synchronously.
- **defect** `reporter.mjs:311` (feedback-async-4): uninstall() clears `chains` while an ingest may be in flight, so a hot re-install can run two ingestNow calls for one user. The result is a duplicate upload, toast, audit line and bucket token. Leave `chains` alone in uninstall, or have install await pending chains before ingestAll(). Test: hold put on a deferred across uninstall/re-install and assert one put per id.
- `api.mjs:100` (EXT-2): selftest hard-codes `feedback-console-error`, which recorder.mjs owns, and checks only one of the two console wraps. foundry/adjustments.yml pins those markers to recorder.mjs, so either change both together or expose the table through `ctx.exposed`. Widening selftest changes its output.
- `api-manifest.mjs` (EXT-1 follow-up): build the manifest's category/status unions, report file path and queue flag from CATEGORY_KEYS, STATUSES, STORE_DIR, FLAG_SCOPE and QUEUE_KEY. describe.json stays byte-identical, and the f4603f2a guard then stays green by construction.
- `files-adapter.mjs:31` (M10): fileStore's `log` option is never wired, so its debug lines for createDirectory and browse failures never fire. Wiring it in at install is preferred, because it makes rob-3 and EC-3 diagnosable, but it adds messages. The alternative is to drop the parameter.
- `reporter.mjs:261` (feedback-async-2): once the canonical foundry/lib/queries.mjs forwards ctx (`async (data = {}, ctx) => fn(d, ctx)`), ingest can check that the sender is a GM or that `userId === ctx.user.id` (§5.9.4).
- `api.mjs:109` (feedback-async-3 + perf-2): readAll makes one serial GET per file. Bounded concurrency (6-8 in flight) with results written by index keeps the order and the skip rules; optionally add a per-tab memo invalidated on put().
- `dialog.mjs:27` (EXT-7): the "What gets attached" list leaves out world, tokens, combat and client. Drive it from a core table keyed by section, with one i18n key per row and a test against OBJECT_SECTIONS ∪ LIST_SECTIONS ∪ {actions, errors}. This needs new lang keys, and it is a disclosure decision.
- `recorder.mjs:227` / `:235` (EC-5 + perf-4): use `row.id || row.cls`, because clip() turns null into "". This cannot be reached today, since every app has an id.
- `recorder.mjs:190` (EXT-6): export ACTION_KINDS from core with a source-scan test, and make scripts/tests/test_feedback_reports.py:174 read it through node. That list is missing tool, use, combat and notify today.
- `recorder.mjs:51` (M7, deferred by cap): add `LIMITS.actionsDefault = 200`, use it in historyMax and recorder.mjs:51, and test the settings row default against it.
- `recorder.mjs:74` (M8, deferred by cap): rename the file-local `store` to `persisted`.
- `README.md:96` (M9, deferred by cap): say that notify's omitted type is passed as "info". foundry/adjustments.yml's "what" text may need the same note.

## Verification

- 32356c07: keep
- 9259eb5e: revert (a043182a)
- 83a1996e: keep
- a3ffb2eb: keep
- f4603f2a: keep
- d1ff31e6: keep
- 494d68fc: keep
- be903f26: keep
- ba310d7c: keep
- d8f2a251: keep

## Gates

- Module gate (`node test/run.mjs`, kit identity, conformance): ok. 125 tests, 125 pass, 0 fail. The vendored kit is identical to foundry/lib (11 files). pentaryn-feedback conformance is 100.0% (50/50 fail-class rules), with no new exception rows. The one C10 warning (feedback-core.mjs over 600 lines) was there before the review. The diff stays inside scope.
- `make check-context` passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
