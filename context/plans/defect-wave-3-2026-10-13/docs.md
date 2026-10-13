# Defect wave 3 (2026-10-13): docs

**Read this when:** you want the history of the defect wave 3 `docs` group: which wave-2 live-check
steps had the wrong expected result, what they say now, and which test holds them. History, not
instructions. The records it corrects are in
[`../defect-wave-2-2026-10-12/`](../defect-wave-2-2026-10-12/README.md).

Branch `wave3/docs-2026-10-13`, cut from `origin/main` at `e392ba56`. The fixes are docs only.
Every item is a declared wording change, approved under Joe's wave-3 go-ahead of 2026-10-13
("fix all small bugs found live"). No module, `module.json`, `lang/` or golden file changed.
Deploy: nothing. The fix needs no restart and no reload (blueprint §10).

Gate: `make check-context` is green (28 warnings, all for older files without a "Read this when:"
line, none new). `make test` is green: 2208 passed, 3 skipped, 4 xfailed. That includes the new
`scripts/tests/test_wave2_record_wording.py`.

## Items

Each test was added first and failed on the parent commit. The fix and its test landed in one commit.

| Item | Defect | What changed | Commits | Test (`scripts/tests/test_wave2_record_wording.py`) |
|---|---|---|---|---|
| names-ext-3 | `kit.md` expected a toast count of 2. `sync` counts the prototype token plus each placed token, so two tokens give 3. | The step expects a toast count of 3 and says that `sync` returns 3. | `b04f8b9e` | `test_kit_names_ext_3_expects_three_toasted_labels` |
| ties-ui-E4 | Step 1 in `ties-ui.md` expected "exactly one card is open" after two quick presses. The declared toggle closes the card on the second press, and FIX-3 saw at most 1 card open and 0 afterwards. | Step 1: never more than one card is open, and none is open afterwards. Step 2: one press opens one card, and the next press closes it. | `6c8ce597` | `test_ties_ui_e4_steps_match_the_declared_toggle` |
| riders-async-5 | `riders.md` ran `retireManual` before `setType`. `retireManual` skips an Elemental Affinity that has no type, so that order retired nothing. | The step runs `setType("ZZ Sorcerer", "cold")` first, then `retireManual("ZZ Sorcerer")`, and says why. | `3ab63f60` | `test_riders_async_5_sets_the_type_before_retiring` |
| attunement-EXT-8 | `attunement.md` expected the hooks detail to name all four hooks. `api.mjs` lists only the missing hooks and gives `null` when none are missing. | The step expects the detail to be `null` and says that it lists only the missing hooks. | `99448ae3` | `test_attunement_ext_8_detail_lists_only_missing_hooks` |
| py-cloud-PERF-1, py-cloud-M4 | `py-cloud.md` placed the PERF-1 test in `test_bundles.py` and the M4 test in `test_cloud_background_upload.py`. Both tests are in `test_review_fixes.py`. | Both rows cite `test_review_fixes.py::…`. PERF-1's other three tests are named as `test_bundles.py::test_perf1_local_one_*`. | `0c14813b` | `test_py_cloud_every_cited_test_is_in_the_file_it_names` (checks that every `file::name` in the record exists) |
| py-update-ROB-4 | `py-update.md` said fork drift was measured against "upstream main". Upstream `adambdooley/foundry-vtt-mcp` uses `master` as its default branch, which `gh api` confirmed on 2026-10-13. | The step says drift is measured against upstream's default branch, `master`. | `1845dea5` | `test_py_update_rob_4_measures_drift_against_master` |
| riders-revendor | The "Still open" section of the wave-2 README said the riders re-vendor needed Joe's call. | The line reads "riders re-vendor 300acf1f kept (Joe, 2026-10-13)". The strict rule is not applied. | `35877c67` | `test_readme_still_open_records_joes_riders_ruling` |

The wave-2 README's "Record wording to correct" list stays as history. This record closes six of
its entries: kit, ties-ui, riders, attunement, py-cloud and py-update ROB-4. The other two entries
belong to other groups. The py-ops `--check` and EXT-6 entry is code. The ties-study M5 entry is a
question for Joe.

## Live check after deploy

Code only. The tests in `scripts/tests/test_wave2_record_wording.py` and `make check-context`
cover every item. Nothing deploys, so there is nothing to check in Foundry. The corrected steps
take effect the next time someone runs the wave-2 live checks they describe, on ZZ scratch docs as
those records say.
