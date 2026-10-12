---
title: "Final review 2026-10-12 — live-goldens"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of live-goldens found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — live-goldens

## Verdict

**NEEDS-JOE.** The kept changes are one edge fix and behaviour-preserving tests and docs, and the gate is green with byte-identical goldens. But the review recorded real defects: a skipped golden diffs as identical, a non-object golden crashes `diff.mjs` instead of exiting 2, three goldens can reject instead of returning JSON, the walls golden deletes other users' chat messages, and two cleanups report in a shape `diff.mjs` cannot judge.

## Scope

- Paths: `scripts/foundry/live-goldens/**`, `scripts/tests/test_live_golden*.py`, `scripts/tests/test_live_goldens_*.py`, and this record.
- Base: `3d1462fb` (origin/main when the review started).
- Branch: `review/live-goldens`, worktree `pentaryn-review-live-goldens-wt`.
- Triage: 36 findings gave 8 DO (1 DO-EDGE, 7 DO-REFACTOR), 15 RECORD and 13 DROP (12 duplicates merged into the items below, plus dead template helpers).

## Findings by lens

Line numbers are the ones the triage gave, at the base commit.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| LG-R1 | diff.mjs:149 | medium | DO-EDGE, kept | The entry-point check compared against a raw `file://` string, so from a path with a space or through a symlink `main()` never ran and the CLI exited 0 with no output |
| EXT-5 | live-goldens/*.js | low | DO-REFACTOR, kept | Nothing compiled the 19 golden bodies offline or checked their return shape |
| EXT-1 | live-goldens/*.js | low | DO-REFACTOR, kept | The helper preamble is copied into every golden with nothing guarding against drift |
| LG-M3 | diff.mjs:132 | low | DO-REFACTOR, kept | The `## declared` loop re-implemented the shared `row` printer |
| EXT-2 | diff.mjs:78 | low | DO-REFACTOR, kept | The cleanup-key rule `leftovers()` judges by was not written down |
| LG-M7 | README.md, diff.mjs, walls.js headers | low | DO-REFACTOR, kept | README output shape, diff.mjs header and walls skip text disagreed with the code |
| EXT-6 | README.md | low | DO-REFACTOR, kept | The two `settle()` forms were not named |
| LG-AC-4 | README.md | low | DO-REFACTOR, kept | Nothing told the operator to run one golden at a time per tab, though goldens swap shared globals |
| LG-R3 | diff.mjs:102 | medium | RECORD | A skipped golden diffs as identical, exits 0, and never prints the skip reason |
| LG-R2 | diff.mjs:110 | low | RECORD | A truthy non-object golden crashes with a TypeError (exit 1) where the README promises exit 2 |
| LG-R4 | cursors.js:55 | low | RECORD | A missing `game.pentaryn.cursors` throws from `finally`, so the body rejects instead of returning JSON (also pings.js:75, prompts.js:48) |
| LG-AC-1 | walls.js:101 | medium | RECORD | The createChatMessage hook captures every user's messages; cleanup deletes them and `lastCard()` can pick a foreign one |
| EXT-3 | cursors.js:91 | medium | RECORD | cursors and journal report cleanup in shapes `diff.mjs` cannot judge, so a failed restore diffs clean |
| LG-E5 | journal.js:197 | low | RECORD | Cleanup closes any document-less app opened during the run when src/owned/gmJournal is null |
| LG-E6 | ties.js:77 | low | RECORD | An empty attribute registry stores a TypeError instead of a clean skip (also prompts.js:72-73) |
| LG-R7 | portals.js:175 | low | RECORD | `?.map?.(card) ?? "threw"` discards the probe's caught error (also :181, :185, :106, :156) |
| LG-R8 | combat.js:178 | low | RECORD | Unguarded awaited cleanup steps: one failure skips the rest and leaves ZZ documents |
| EXT-4 | portals.js:70 | low | RECORD | portals and creatures spell their setting keys out twice by hand |
| EXT-7 | transform.js:71 | low | RECORD | The toast spy is copied five times with different localisation |
| EXT-8 | README.md:27 | low | RECORD | Known pings noise is only prose, so every pings diff needs a hand-written --declared file |
| LG-E7 | diff.mjs:40 | low | RECORD | Keys containing `.` print as nested segments, so globs cannot cover them |
| LG-AC-3 | senses.js:222 | low | RECORD | Cleanups delete one document per awaited call where a batch call exists (§5.9.4) |
| perf-1 | senses.js:63 | low | RECORD | `tick()` allocates a new MessageChannel per macrotask in 17 goldens |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| a95455fd | LG-R1: diff.mjs compares `import.meta.url` with `pathToFileURL(realpathSync(argv[1])).href` in a try/catch | `test_live_goldens_diff_declared.py`: test_diff_runs_from_a_path_with_a_space, test_diff_runs_through_a_symlink, test_usage_from_a_path_with_a_space_is_bad_input (all three failed first) |
| 00e1ac0f | EXT-5: compile every golden body offline and pin its last line and module name | `test_live_goldens_bodies.py`: test_golden_body_compiles[\<stem\>], test_golden_returns_its_json_string[\<stem\>] (38 cases) |
| 6f70fbcd | EXT-1: pin the helper preamble every golden copies; one README sentence | `test_live_goldens_preamble.py`: test_helper_is_identical_everywhere[…], test_drop_keeps_the_base_keys, test_settle_is_a_known_variant |
| 4355389f | LG-M3 pinning test: the `## declared` block byte for byte | `test_live_goldens_diff_declared.py`: test_a_declared_block_difference_is_listed |
| ce1e69d8 | LG-M3: `declared.forEach(row)` | test_a_declared_block_difference_is_listed (passed before and after) |
| 0f200341 | EXT-2: README "Cleanup keys" paragraph and two diff.mjs header comment lines | test_cleanup_key_rule_is_what_the_readme_says (5 cases, passed before the docs) |
| f80cbc05 | LG-M7: README shape, diff.mjs header and walls.js header match the code (comments and Markdown only) | Comment only; goldens byte-identical |
| 16c6500f | EXT-6: README names the two `settle()` forms | test_settle_is_a_known_variant |
| 30264aa4 | LG-AC-4: README tells the operator to run one golden at a time per tab | README only |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** LG-R3 — `scripts/foundry/live-goldens/diff.mjs:102`: a skipped golden (walls, senses, creatures, aoe, combat keep `golden:{shared:{},declared:{}}`) diffs as identical with exit 0 and the `(skipped: …)` suffix at :103 is unreachable. Fix: after load, if either side has `skipped`, print `skipped: <reason>` and return 2; drop the dead suffix.
- **defect** LG-R2 — `scripts/foundry/live-goldens/diff.mjs:110`: `{"golden":"oops"}` hits a TypeError on `in` and exits 1 with a stack trace; README promises exit 2. Fix: widen the :102 check with `typeof … !== "object"` and name the offending file.
- **defect** LG-R4 — `scripts/foundry/live-goldens/cursors.js:55`: with `game.pentaryn.cursors` missing, `API.current()` in `finally` throws and the eval rejects, losing `golden.error`. Fix: `API?.current?.()`; same at pings.js:75 and prompts.js:48.
- **defect** LG-AC-1 — `scripts/foundry/live-goldens/walls.js:101`: the createChatMessage hook records every user's messages; cleanup deletes them and `lastCard()` can return a foreign card. Fix: gate on `userId === game.user.id` (walls is inactive, so verify when it is re-enabled).
- **defect** EXT-3 — `scripts/foundry/live-goldens/cursors.js:91`: cleanup reports `restored`/`wanted` objects and journal reports raw page counts, so a failed restore or leftover pages diff clean. Fix: add `toolRestored` in cursors and `gmJournalPagesLeft: Math.max(0, now - before)` in journal (re-baseline).
- LG-E5 — `scripts/foundry/live-goldens/journal.js:197`: cleanup closes any document-less app opened during the run when src/owned/gmJournal is null. Guard on `app.document?.id`; note gmJournal can be null on a normal run.
- LG-E6 — `scripts/foundry/live-goldens/ties.js:77`: an empty attribute registry stores a TypeError instead of a clean skip; same at prompts.js:72-73 with no 'mid' marker. Set `out.skipped` and skip the dependent steps.
- LG-R7 — `scripts/foundry/live-goldens/portals.js:175`: `?.map?.(card) ?? "threw"` discards the caught error (also :181, :185, :106, :156). Change at the next re-baseline.
- LG-R8 — `scripts/foundry/live-goldens/combat.js:178`: wrap each cleanup step and record a `*CleanupError` string so one refused delete does not skip the rest (also attunement.js:165, ties.js:77).
- EXT-4 — `scripts/foundry/live-goldens/portals.js:70`: portals and creatures list their setting keys twice; a local `SETTINGS` array would keep bytes, `SETTING_KEYS` would change env.settings.
- EXT-7 — `scripts/foundry/live-goldens/transform.js:71`: five toast-spy copies localise differently; prefer transform's form for new goldens and add it to the preamble test if wanted.
- EXT-8 — `scripts/foundry/live-goldens/README.md:27`: commit `noise/pings.txt` for the known pings noise and point the README at it (Joe's call: it declares a difference).
- LG-E7 — `scripts/foundry/live-goldens/diff.mjs:40`: bracket-quote keys containing `.`, `[` or `]` so `surface.d1.*` covers ties' `attributes.lookup` key; document it in the glob paragraph.
- LG-AC-3 — `scripts/foundry/live-goldens/senses.js:222`: use one `deleteDocuments(ids)` per type in the senses, attunement, transform, creatures and journal cleanups (§5.9.4).
- perf-1 — `scripts/foundry/live-goldens/senses.js:63`: share one MessageChannel per golden with a resolver FIFO in all 17 goldens in one commit, then re-baseline timings (and update the EXT-1 preamble pin).

## Verification

- a95455fd — keep
- 00e1ac0f — keep
- 6f70fbcd — keep
- 4355389f — keep
- ce1e69d8 — keep
- 0f200341 — keep
- f80cbc05 — keep
- 16c6500f — keep
- 30264aa4 — keep

## Gates

- `make test`: 1686 passed, 2 skipped, 5 xfailed. All changed paths are in scope; untouchables clean; `git status --short` empty.
- `git diff --quiet origin/main -- '**/golden/**'`: exit 0.
- `make check-context`: passes with this record in place (5 pre-existing warnings elsewhere).
- Goldens byte-identical: yes.
