# Defect wave 2 2026-10-12 — live-goldens (scripts/foundry/live-goldens)

**Read this when:** you want the history of defect wave 2 (2026-10-12) for the live-golden scripts and `diff.mjs`: what was fixed, why, and how to check it live. This is a history record, not instructions. To run or diff a golden, read [`scripts/foundry/live-goldens/README.md`](../../../scripts/foundry/live-goldens/README.md).

Source record: [`final-review-2026-10-12/live-goldens.md`](../final-review-2026-10-12/live-goldens.md). Branch `fix2/live-goldens-2026-10-12`.
Gate: `./.venv/bin/python -m pytest -q scripts/tests/test_live_goldens_*.py scripts/tests/test_live_golden_*.py` passes after `git merge origin/main`: 171 passed, 1 skipped.

These are test tools, not a Foundry module. Nothing here ships to the server. Run FIX-2 used this branch at `91682452`, frozen in `.state/live-goldens/FIX-2/src`. Only perf-1 came after that.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| LG-R3, LG-R2 | A skipped golden diffed as identical (exit 0). A golden that was not an object crashed `diff.mjs` with exit 1 | Take the recommendation | A skip on either side prints `skipped: <reason>` and exits 2. So does a non-object `golden`, and the message names the bad file. | `bfade230` (already on main before this wave) | `test_live_goldens_diff_skipped.py` |
| LG-AC-1 | The walls golden captured every user's chat messages and deleted them in cleanup | Take the recommendation (only this GM's) | The walls golden captures and deletes only messages whose `userId` is this GM's. Walls is never synced live, so this is checked offline only. | `42fc5590` | `test_live_goldens_walls_chat.py` |
| EXT-3 | cursors and journal reported cleanup in shapes `diff.mjs` cannot judge, so a failed restore diffed clean | Take the recommendation (re-baseline) | cursors adds `toolRestored` and journal adds `gmJournalPagesLeft`. `diff.mjs` fails on `false` or a count above 0. | `e7b18ca2` | `test_live_goldens_cleanup_shape.py` |
| LG-R4 | With the module API missing, cursors, pings and prompts threw from `finally`, so the eval rejected instead of returning JSON | Take the recommendation | All three return JSON with `skipped` and a reason. | `0268dbc9` | `test_live_goldens_missing_api.py` |
| LG-E5 | journal cleanup could close any document-less app opened during the run | Take the recommendation | Cleanup closes only the sheets of its own ZZ journals. | `00b6a3e2` | `test_live_goldens_journal_close.py` |
| LG-E6 | An empty attribute registry (ties) or a missing `mid` marker (prompts) stored a TypeError | Take the recommendation (clean skip) | ties and prompts set `skipped` with a reason and skip the steps that depend on it. | `6e16d584` | `test_live_goldens_empty_world.py` |
| LG-R7 | portals replaced a probe's caught error with the string `"threw"` | Take the recommendation (change at re-baseline) | portals keeps the caught error object (`{threw, name, ctor, message}`). | `27f00e9e` | `test_live_goldens_portals_errors.py` |
| LG-R8 | One failed cleanup step skipped the rest and left ZZ documents | Take the recommendation | Every awaited cleanup step runs through `safely()`. A refused step is recorded as a `NOT done: …` string and the rest still run. | `835b4917` | `test_live_goldens_cleanup_safely.py` |
| LG-AC-3 | Cleanups deleted one document per awaited call (§5.9.4) | Take the recommendation | senses, attunement, transform, creatures and journal delete each document type in one batch call. | `3c3a642b` | `test_live_goldens_cleanup_batch.py` |
| EXT-4 | portals and creatures spelled their setting keys out twice | Take the recommendation (local list, same bytes) | Each names its keys once in a local `SETTINGS` array. | `b49e2c48` | `test_live_goldens_settings_keys.py` |
| EXT-7 | Five copies of the toast spy localised differently | Take the recommendation | The preamble test pins each spy to transform's localised form or the plain form. The README says new goldens copy transform's. | `5aa0b054` | `test_live_goldens_preamble.py` |
| EXT-8 | Known pings noise lived only in prose, so every pings diff needed a hand-written `--declared` file | Take the recommendation (it declares a difference) | `noise/pings.txt` holds the known noise as globs. The README says to always diff pings with `--declared noise/pings.txt`. | `8aaf0538` | `test_live_goldens_noise_pings.py` |
| LG-E7 | Keys containing `.` printed as nested segments, so no glob could cover them | Take the recommendation | `diff.mjs` prints a key holding `.`, `[` or `]` JSON-quoted in brackets, and `.**` covers bracketed segments. The README glob paragraph says so. | `91682452` | `test_live_goldens_diff_declared.py` |
| perf-1 | `tick()` made a new `MessageChannel` for every macrotask in 17 goldens | Take the recommendation | Each golden makes one channel and wakes waiting ticks oldest first. In Node (the offline tests) the port holds the event loop only while a tick is waiting. A listening port left ref'd kept every offline run open until its 30 s timeout. `ref`/`unref` do not exist in a browser, so they are called through `?.()`. | `17cbd6f4` | `test_live_goldens_preamble.py` (`test_tick_shares_one_channel`, `test_shared_tick_lets_node_exit`, `test_readme_names_the_shared_tick_channel`; the first two failed before the fix) |

All items are declared changes to the test tools, and their commit subjects carry `[declared]`. No Foundry module changed.

## Goldens changed

No golden JSON is committed. The goldens are captured live into `.state/live-goldens/<run>/`. The next run must re-baseline the keys these fixes add or rename: EXT-3 `toolRestored` and `gmJournalPagesLeft`, LG-R7 portals' error objects, LG-R4 and LG-E6 `skipped`, LG-R8 `*CleanupError` strings, and perf-1's timings (one shared channel, so `timings` may shift).

## Live check after deploy

These checks are code only. They need the one GM tab and the foundry `eval-js` MCP tool, and they run one golden at a time. Each golden creates its own ZZ-prefixed scratch documents and deletes them in cleanup. Never point a golden at Caven, Marrith, Talo or a campaign scene. Never run walls live.

1. **perf-1 / all.** Run `pings.js` through `eval-js` and save the result as `after/pings.json`. Diff it against the FIX-2 capture in `.state/live-goldens/FIX-2/`: `node scripts/foundry/live-goldens/diff.mjs --declared scripts/foundry/live-goldens/noise/pings.txt before/pings.json after/pings.json`. Expect exit 0 (EXT-8).
2. **EXT-3.** Run `cursors.js` and `journal.js`. Expect `cleanup.toolRestored: true` and `cleanup.gmJournalPagesLeft: 0`. In the world, expect no `ZZ` journal left (`game.journal.filter(j => j.name.startsWith("ZZ")).length === 0`).
3. **LG-E5.** Before running journal, open one non-ZZ app that has no document, such as the settings window. After the run, expect it still open.
4. **LG-AC-3 / LG-R8.** Run `senses.js`, then `attunement.js`. Expect no `*Left` above 0 and no `NOT done` string in `cleanup`. Expect no `ZZ` actors, items or scenes left in the world.
5. **LG-R7 / EXT-4.** Run `portals.js`. Expect every refused probe to read as an object with `threw: true` and a `message`, never the string `"threw"`. Expect `env.settings` unchanged from the FIX-2 capture.
6. **LG-E7.** Run `ties.js` and diff it against the FIX-2 capture. Expect any difference on the setting key to print as `surface.d1["attributes.lookup"]`. FIX-2 already ran with LG-E7, so expect no difference on that key.
7. **perf-1 timings.** Compare each run's `timings` with the FIX-2 capture. A shift is expected and declared. A run that hangs or never returns is a defect.
8. Afterwards, confirm that no `ZZ` document of any type is left in the world.
