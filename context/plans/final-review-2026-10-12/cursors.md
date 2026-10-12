---
title: "Final review 2026-10-12 — cursors"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of cursors found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — cursors

## Verdict

**NEEDS-JOE**: nine behaviour-preserving refactors were kept with the suite green (57/57) and the goldens byte-identical, but one recorded item is a real defect: `uninstall()` does not stop the board re-applying the glyph, which contradicts the entry's "Remove every hook and feature state" promise. Fixing it changes what a GM sees, so Joe has to decide.

## Scope

- Paths: `foundry/module/pentaryn-cursors/**`, `scripts/foundry/cursors/**`, `scripts/tests/test_cursors_build.py` (module `cursors`, kind module), plus this record.
- Base: `45488047` (origin/main of `/Users/joe/Documents/GitHub/pentaryn`).
- Branch: `review/cursors`, worktree `/Users/joe/Documents/GitHub/pentaryn-review-cursors-wt`.
- Triage: 27 findings deduplicated to 16. 9 were DO-REFACTOR, 0 DO-EDGE, 7 RECORD. 11 were dropped (8 duplicates; EXT-1 and EXT-5 not worth a commit; cursors-async-3 was an informational all-clear). §5.9.4 and §5.5 are otherwise clean.

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| M1 | cursors-core.mjs (header, KEYS doc) | low | DO-REFACTOR → kept | Header named a cursors.css that no longer exists; KEYS doc said "drift > 1 px" but the build compares exactly |
| M6 | README.md (Extending) | low | DO-REFACTOR → kept | Extending recipe did not list every place a new key is pinned |
| M5 | board.mjs (previewActive JSDoc), README.md:81 | low | DO-REFACTOR → kept | `_placementContext` docs named only one of the two adjustments rows |
| M7 | test/glue.test.mjs:7, :45 | low | DO-REFACTOR → kept | Two test comments were out of date with the published API and ready listeners |
| EXT-6 | test/status.test.mjs | low | DO-REFACTOR → kept | Nothing pinned the manifest status row's returns to statusOf()'s keys |
| M2 | test/core.test.mjs (built assets) | low | DO-REFACTOR → kept | Transitional assets/src fallback in the source-exists check |
| M3 | board.mjs (canvasTearDown, uninstall) | low | DO-REFACTOR → kept | canvasTearDown and uninstall() duplicated the clear logic |
| cursors-perf-1 | board.mjs (resync) | low | DO-REFACTOR → kept | resync() hot-path early return was undocumented and unpinned |
| M4 | board.mjs (resync, refresh exports) | low | DO-REFACTOR → kept | resync and refresh were exported but nothing imports them |
| cursors-rob-1 | cursors-core.mjs:41 | low | RECORD | Public keyFor(null) throws a destructuring TypeError; keyFor(undefined) returns null |
| cursors-rob-2 | board.mjs:202, :194 | low | RECORD | ready and canvasReady setTimeout ticks have no try/catch |
| cursors-rob-3 | board.mjs:207 | low | RECORD (**defect**) | uninstall() clears the board only until the next event re-applies it |
| cursors-rob-4 | scripts/foundry/cursors/build.mjs:135 | low | RECORD | Build writes a key's assets after its hotspot check fails |
| cursors-edge-5 | scripts/foundry/cursors/build.mjs:100 | low | RECORD | Centre-hotspot branch floors with no epsilon |
| EXT-4 | scripts/foundry/cursors/build.mjs:106 | low | RECORD | Allowed `extreme` values are validated only by a full resvg build |
| EXT-7 | settings.mjs:30 | low | RECORD | setting onChange is attached by matching one hard-coded key (kit pattern question) |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 957f73c7 | Comment-only: core header and KEYS hotspot contract corrected | n/a (comments); full suite green |
| 32b44c1a | README Extending lists every key pin and player-facing copy | n/a (docs) |
| b92d4d66 | previewActive JSDoc and README:81 name both adjustments rows | n/a (comments/docs) |
| 4e59b7b4 | Two glue.test.mjs comments brought up to date | n/a (comments) |
| 53b92619 | New test pins the manifest status row returns to statusOf() keys | status.test.mjs "manifest status row returns lists exactly statusOf()'s keys, in order" |
| 1b0c28e1 | Source-exists check reads only scripts/foundry/cursors/src | core.test.mjs "built assets: PNG sizes and hotspots" |
| 1a6be1d6 | One private clear() shared by canvasTearDown and uninstall() | glue.test.mjs (h) canvasTearDown clears…; api.test.mjs "uninstall(): clears the board…" |
| ed7d05c9 | `// hot:` comment on resync() and a test for its early return (mutation-checked) | glue.test.mjs "(e2) resync hot path: a non-empty style.cursor returns before reading the setting" |
| 3702b057 | Dropped unused `export` on board.mjs resync and refresh | full suite 57/57; conformance C18 ok |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** `foundry/module/pentaryn-cursors/board.mjs:207` (cursors-rob-3): after uninstall() the wrapped control/tool onChanges, preview childAdded/childRemoved listeners, the MutationObserver and onEnabledChange still call refresh()/resync(), and the pending timers are not cancelled, so current() becomes 'ruler'/'target' again (probe-confirmed) against cursors.mjs:61 "Remove every hook and feature state". Decide: (A) a module-scope `installed` flag checked by refreshLogged, onEnabledChange and the observer, plus clearTimeout on the two ticks; or (B) document uninstall() as half of a hot patch, not a kill switch.
- `foundry/module/pentaryn-cursors/board.mjs:202` and `:194` (cursors-rob-2): wrap the ready and canvasReady tick bodies in try/catch with `refresh failed` / `resync failed` warns so a throwing attach() does not skip resync(); also correct the :176 comment. Adds console lines, so a behaviour change.
- `foundry/module/pentaryn-cursors/cursors-core.mjs:41` (cursors-rob-1): decide whether `optional: true` covers null; if so, `state ?? {}` makes keyFor(null) return null instead of throwing (goldens unchanged), with tests in core.test.mjs and api.test.mjs.
- `scripts/foundry/cursors/build.mjs:135` (cursors-rob-4): compute every key first, catch and name a failing key, and write assets only when all keys pass, so a failed run cannot leave assets/cursors/ mixed or stale.
- `scripts/foundry/cursors/build.mjs:100` (cursors-edge-5): add `+ 0.01` to the centre-hotspot floor for both axes, ideally factoring measureHotspot into a pure exported helper with a unit test. Not urgent; today's glyphs pass.
- `scripts/foundry/cursors/build.mjs:106` (EXT-4): have `--check-sources` reject an unknown `extreme`, with a test_cursors_build.py case using `extreme: "top"`.
- `foundry/module/pentaryn-cursors/settings.mjs:30` (EXT-7): kit/blueprint decision on standardising a per-key onChange handler table in foundry/lib; no change in this module.

## Verification

- 957f73c7: keep
- 32b44c1a: keep
- b92d4d66: keep
- 4e59b7b4: keep
- 53b92619: keep
- 1b0c28e1: keep
- 1a6be1d6: keep
- ed7d05c9: keep
- 3702b057: keep

## Gates

- Gate (module check, `node test/run.mjs`, lib-check, conformance): tests 57, pass 57, fail 0; vendored kit identical to foundry/lib (7 files); pentaryn-cursors conformance 100.0 % (47/47 fail-class rules); diff in scope; untouchables clean.
- `make check-context` with this record in place: pass (exit 0, "context surface OK", 5 pre-existing warnings in other plans).
- Goldens byte-identical: yes.
