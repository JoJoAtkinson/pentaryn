# Defect wave 2 (2026-10-12) — feedback

**Read this when** you need the history of defect wave 2 for the `pentaryn-feedback` module
(the player bug-report button, recorder and report store). History only — to operate the
module read [`context/foundry/feedback.md`](../../foundry/feedback.md).

Branch `fix2/feedback-2026-10-12`. Approved by Joe 2026-10-12 ("Let's create a dynamic
workflow to solve all of these things"). Every change is a declared behaviour change; where Joe
gave no ruling the review recommendation was taken. Gate: `make foundry-feedback-check`
(150/150 node tests, Python report tests, vendored kit identical, conformance 100 %).

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| feedback-EXT-2 | Self-check only verified the console.error recorder | recommendation | The self-check confirms both the console.error and console.warn recorders are on exactly when "capture console" is on, and names each one. | 01abb986 | test/console.test.mjs, test/api.test.mjs |
| feedback-M2 | Only the error ring was redacted; other error text in a report could carry secrets | recommendation | Every error message in a report (a broken snapshot section, the recorder's own failure) has passwords, tokens and URL query strings blanked. The player's text and character/user names are only shortened, never altered. | 30fac23f | test/core.test.mjs, test/glue.test.mjs, test/adapters.test.mjs |
| feedback-rob-3 | One failed folder create (not "already exists") broke every upload until reload | recommendation | The next report tries to create the folder again. | ecb94e79 | test/adapters.test.mjs |
| feedback-EC-3 | One corrupt or unfetchable report file failed the whole list/inspect | recommendation | That file is skipped with a console warning; every other report still shows. | 6421ea68 | test/api.test.mjs |
| feedback-rob-2 | A null argument to submit / ingest / resolve threw | recommendation | A macro passing null gets a plain "refused" answer; nothing crashes. | 89443fa2 | test/api.test.mjs, test/glue.test.mjs |
| feedback-async-1 | Opening the dialog while the last one was closing left Escape dead | recommendation | The new window waits for the close to finish, so Escape still closes it. | cf584af4 | test/glue.test.mjs |
| feedback-async-4 | A hot-patch mid-save could file a player's report twice | recommendation | The re-install waits for the in-flight save; the report is saved once. | de153f34 | test/hotpatch.test.mjs |
| feedback-EXT-1-followup | Self-description hard-coded the report folder, queue flag and category/status lists | recommendation | Nothing on screen: the self-description builds them from the module's own settings, so they cannot drift. | 2babc588 | test/api.test.mjs |
| feedback-M10 | Store folder create/list failures never reached the debug log | recommendation | With debug logging on, the console shows a line when the store fails to create or list a folder. Nothing on screen. | 53a6ee34 | test/store-log.test.mjs |
| feedback-async-3 | GM report list read files one at a time | recommendation | Up to 6 report files are read at once; same order, same skip warnings. | ccdf54eb | test/api.test.mjs |
| feedback-EXT-7 | "What gets attached" under-listed what a report sends | recommendation | The list now names world and Foundry versions, selected/targeted tokens, combat round/turn and browser details too. | 36353391 | test/glue.test.mjs |
| feedback-EC-5 | Windows without an id shared one throttle key | recommendation | Id-less windows are throttled by window type, so one no longer hides another's open/close records. | 17de737a | test/glue.test.mjs |
| feedback-EXT-6 | Recorded action kinds were not listed in one place | recommendation | One frozen list of action kinds; tests fail if the recorder logs a kind the renderer was never tested on. | 0ec50fee | test/core.test.mjs, scripts/tests/test_feedback_reports.py |
| feedback-M7 | Default history size 200 was written in three places | recommendation | Still 200; settings menu, pre-world recorder and bad-value fallback all read one shared constant. | 6b084ab8 | test/core.test.mjs |
| feedback-M8 | Recorder's session-storage state had a misleading internal name | recommendation | Nothing at the table; history still survives a reload. Internal name only. | 8b63634d | test/core.test.mjs |
| feedback-M9 | Notify wrap added its own `type` argument to untyped toasts | recommendation (prefer native) | A toast with no type now gets Foundry's own default style; the report log still records it as "info". | 1321a3d7 | test/glue.test.mjs |

All 16 items held at final check; nothing was reverted.

**Goldens changed:** none. **Vendored kit (`lib/**`):** untouched. Shipped files changed:
`foundry/module/pentaryn-feedback/**` including `lang/en.json` (restart needed per blueprint
§10). `scripts/tests/test_feedback_reports.py` gained the action-kinds check (test only).

## Live check after deploy

GM tab only; ZZ scratch files only; no actors, scenes or PCs touched.

- **EXT-2** — `game.pentaryn.feedback.selftest()` → `ok: true`; the console-wrap check's detail
  names both `console.error` and `console.warn` (captureConsole on).
- **EC-3** — through eval-js, `FilePicker.upload` a `ZZ-corrupt.json` containing `{` and a
  `ZZ-array.json` containing `[1]` into `Data/pentaryn-feedback/<game.world.id>/`;
  `game.pentaryn.feedback.list({ status: "all" })` resolves with the real reports and count,
  and two warn lines name the ZZ files. Delete both ZZ files from the local Data folder.
- **async-3** — `game.pentaryn.feedback.list({ status: "all" })` returns the same count and
  order as before the deploy.
- **async-1** — `const api = game.pentaryn.feedback; await api.open(); const p =
  foundry.applications.instances.get("pentaryn-feedback-report").close(); await api.open();
  await p;` → `foundry.applications.instances.has("pentaryn-feedback-report")` is true and
  Escape closes the dialog.
- **EXT-7** — `game.pentaryn.feedback.open()`, expand "What gets attached": rows for scene,
  world, tokens, combat, windows, modules, chat, actions, errors and browser details; Cancel.
- **M2, rob-3, rob-2, async-4, EXT-1-followup, M10, EC-5, EXT-6, M7, M8, M9** — code only;
  covered by the gate. Spot-check: the selftest above stays `ok: true` after the restart.
