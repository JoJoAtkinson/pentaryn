---
title: "Final review 2026-10-12 — pings"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of pings found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — pings

## Verdict

**NEEDS-JOE**: eight docs, test and comment refactors were kept with the suite green and the goldens byte-identical. One review item is a real defect that needs a behaviour change: with two GM tabs open, `clear()` in one tab is undone by the next flush from the other.

## Scope

- Paths: `foundry/module/pentaryn-pings/**` (module `pings`, kind module), plus this record.
- Base: `9d10880b` (origin/main of `/Users/joe/Documents/GitHub/pentaryn`).
- Branch: `review/pings`, worktree `/Users/joe/Documents/GitHub/pentaryn-review-pings-wt`.
- Triage: 21 findings. 9 were DO-REFACTOR (no DO-EDGE), 7 were RECORD, and 5 were DROP (maint-9, ext-4 and ext-5 were duplicates; maint-8 was harmless optional chaining; perf-1 is already O(1)).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| pings-maint-1 | README.md (§Sync) | low | DO-REFACTOR → kept | README said the node suite was not part of `make foundry-pings-check`, but it is (gate `node-test`) |
| pings-maint-2 | README.md (Pitfalls, Read lag) | low | DO-REFACTOR → kept | The Read-lag pitfall did not cover the trim case (all() briefly returns max+1, later pings lag) |
| pings-rob-2 | README.md (Pitfalls, recent) | low | DO-REFACTOR → reverted | README line about recent(null) / non-numeric n, plus a pin |
| pings-maint-4 | test/core.test.mjs, test/fixtures/impls.mjs, test/glue.test.mjs | low | DO-REFACTOR → kept | Test header comments described the migration as unfinished and cited a nonexistent `todo` flag |
| pings-maint-3 | test/glue-*.test.mjs | low | DO-REFACTOR → kept | Test comments cited stale monolith line numbers in pings.mjs |
| pings-ext-3 | test/publish.test.mjs | low | DO-REFACTOR → kept | No guard that the manifest RECORD keys and the log row doc match a real record |
| pings-ext-2 | test/core-meta.test.mjs | low | DO-REFACTOR → kept | No guard that the settings and manifest literals quote the core constants |
| pings-maint-6 | test/glue-nopatch, glue-layers, glue-layers-config | low | DO-REFACTOR → kept | Three tests inlined the log filter that `W.log()` already provides |
| pings-maint-5 | capture.mjs:48 | low | DO-REFACTOR → kept | `record` was exported but had no importer |
| pings-ext-1 | capture.mjs:123 | medium | RECORD | uninstall() calls the kit's unwrapAll() instead of its own handle's unwrap() |
| pings-edge-1 | capture.mjs:77 | medium | RECORD (defect) | With two GM tabs, clear() in one tab is undone by the other tab's next flush |
| pings-rob-1 | capture.mjs:133 | low | RECORD | A second ready without uninstall() drops pings that were not yet flushed |
| pings-async-1 | capture.mjs:33 | low | RECORD | Flushes in one tab are not serialised; two can overlap and both call Setting.create |
| pings-edge-2 | capture.mjs:36 | low | RECORD | A failed flush is never retried, so the readers stay stale until the next ping |
| pings-maint-7 | capture.mjs:93 | low | RECORD | The generic `__pentarynPatched` pre-check duplicates the kit's guard and could collide |
| pings-async-2 | capture.mjs:49 | low | RECORD | §5.9.4 checklist is clean except the known isAnyGM writer (transform-creatures-37) |
| pings-maint-9 | — | low | DROP | Duplicate |
| pings-ext-4 | — | low | DROP | Duplicate of maint-3 (covered by c996ec2e) |
| pings-ext-5 | — | low | DROP | Duplicate of maint-7 |
| pings-maint-8 | — | low | DROP | Optional chaining that does no harm |
| pings-perf-1 | — | low | DROP | Already O(1) |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 57af64e1 | README §Sync: `make foundry-pings-check` runs the node suite (gate `node-test`), and `node foundry/module/pentaryn-pings/test/run.mjs` runs it alone | Docs only; config.py:184 ALL_GATES confirmed |
| 3f46829a | README Pitfalls "Read lag" covers the trim case | glue-trim.test.mjs "KNOWN SF3 case C: a trim detaches the buffer — the trimming ping shows, all() is max+1, later pings lag until the flush" |
| bf29d114 | Test header comments describe the finished migration in present tense (comments only) | Full suite |
| c996ec2e | Test comments cite `capture.mjs patchControlsLayer` and `pings.mjs onReady → publishNamespace` instead of line numbers (comments only) | Full suite |
| 982a224e | Drift guard: the manifest RECORD keys and the log row doc keys match a real stored record | publish.test.mjs "drift guard: manifest RECORD keys = a reader record's keys; the log row doc keys = a stored record's keys" |
| 8cf8241e | Drift guard: the settings rows and the reader docs quote DEFAULT_MAX, MAX_CAP and FLUSH_MS | core-meta.test.mjs "drift guard: the settings rows and reader docs quote the core constants" |
| 417f2195 | Three single-process glue tests use `W.log()` | Same tests, full suite |
| 04175574 | `record` in capture.mjs is no longer exported (no importer anywhere) | Full suite; conformance 100 % |

## Changes reverted by verification

| commit | revert | verifier's reason |
|---|---|---|
| d52e28c6 | 2d4038aa | No behaviour change, but the new README sentence is false: "non-numeric `n` returns everything" fails for `true` (returns 1) and `[2]` (returns 2). The real rule is that `-n` coerces to NaN or ±0. The test only checked null and "x", so it did not pin the general claim. |

## Recorded for Joe

- **defect** pings-edge-1 — `foundry/module/pentaryn-pings/capture.mjs:77`: each GM tab reads its buffer from the store only at ready, and the log row (`settings.mjs:15-18`) has no onChange, so `clear()` in one tab is undone by the other tab's next flush. Options: an onChange on the log row that resyncs the buffer, moving the store to serialStore, or at minimum a README "Two sessions" line. Each fix changes write order and count and needs the two-GM live test (transform-creatures-37).
- pings-ext-1 — `foundry/module/pentaryn-pings/capture.mjs:123`: keep a `handle` from wrapMethod and call `handle?.unwrap(); handle = null` in uninstall() instead of unwrapAll(). This was not done because the two differ when undo() fails (a foreign wrapper on top): unwrapAll splices the record out while handle.unwrap() keeps it, which changes describe().patches and the re-wrap on hot re-import.
- pings-rob-1 — `foundry/module/pentaryn-pings/capture.mjs:133`: start() always sets `buffer = readLog(...)`, so a second ready without uninstall() drops unflushed pings and the pending flush rewrites the old log. Decide on `buffer ??= readLog` or flush/merge before the re-read, and add a README Pitfalls line.
- pings-async-1 — `foundry/module/pentaryn-pings/capture.mjs:33`: flushTimer is cleared before `await writeLog`, so a write slower than 250 ms, or clear(), can overlap the next flush, and with no Setting doc yet both call Setting.create. Chain flushes through a module-scope `writing` promise or move to serialStore (changes write timing and count).
- pings-edge-2 — `foundry/module/pentaryn-pings/capture.mjs:36`: a failed flush only warns ("could not persist the log") and never retries, so readers stay stale past the documented ≤ 250 ms until the next ping. Decide whether to retry; if yes, flip the glue.test.mjs "failure texts" pin (around :442-452) and add a README Pitfalls line.
- pings-maint-7 — `foundry/module/pentaryn-pings/capture.mjs:93`: the generic `__pentarynPatched` pre-check duplicates the kit's guards (lib/patch.mjs:60-61,77). A future Pentaryn module that wraps handlePing with the same marker would silently block capture. Use a pings-specific marker or rely on wrapMethod's guard; this changes describe().patches in the foreign-marker case, so update the adjustments row and README:83/102 with it.
- pings-async-2 — `foundry/module/pentaryn-pings/capture.mjs:49`: the §5.9.4 checklist is clean apart from the isAnyGM writer with a direct settings.set, which is the known transform-creatures-37. No action; do not re-raise it as new.
- pings-rob-2 (reverted d52e28c6) — `foundry/module/pentaryn-pings/README.md` (Pitfalls, recent): reword as "`recent(0)`, `recent(null)` and an `n` that is not a number (for example `\"x\"`) return everything", and re-add the null/"x" pin in core-meta.test.mjs.

## Verification

- 57af64e1 — keep
- 3f46829a — keep
- d52e28c6 — revert (2d4038aa)
- bf29d114 — keep
- c996ec2e — keep
- 982a224e — keep
- 8cf8241e — keep
- 417f2195 — keep
- 04175574 — keep

## Gates

- `make` gate for pings (node test/run.mjs, vendored kit check, conformance, diff scope, golden diff): ok. 70 tests, 70 pass, 0 fail. The vendored kit is identical to foundry/lib (9 files). Conformance is 100.0 % (46/46 fail-class rules). The diff scope is all inside `foundry/module/pentaryn-pings/**`, and the untouchables are clean.
- `make check-context` with this record in place: pass (exit 0, "context surface OK", 5 pre-existing warnings in other plan files).
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
