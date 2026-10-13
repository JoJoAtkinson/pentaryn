# Defect wave 3 (2026-10-13) — pings

**Read this when:** you want the history of how the parked wave-2 pings work got back onto main in
defect wave 3: why `make test` was red, what changed, and how to check it live. History, not
instructions. The use-doc is `foundry/module/pentaryn-pings/README.md`.

Branch `wave3/pings-2026-10-13`. It was cut from `origin/fix2/pings-2026-10-12`, then
`origin/main` (`e392ba56`) was merged in, and the main-line revert `4b1f287c` was itself reverted
(`2e49a13d`), so all seven wave-2 pings items are back as written. Their record,
`context/plans/defect-wave-2-2026-10-12/pings.md`, came back with that revert.

Gate: `make test` (2204 passed, 3 skipped, 4 xfailed) and `make foundry-pings-check` (84 node
tests, vendored kit identical, conformance 100 % 46/46). Both green.

## Why pings was parked

Wave 2 reverted the pings merge on main because `make test` failed
`scripts/tests/test_live_golden_pings.py::test_golden_itself_still_runs[hidden]` with
`golden.ping.scratchRecordsInLog` 0, expected 1.

**The test's expectation was wrong, not the module.** The `hidden` run models a GM tab whose
250 ms flush is held back for the whole golden run. Before wave 2, the module's buffer was the
same array that `game.settings.get` returns while the log was below its cap ("SF3 case A"), so an
unwritten ping showed up in the log at once. Wave 2's pings-edge-1 replaced that buffer with a
pending list that is merged into the store when it is written. It also declared the result: a
ping is not on record until it is written. That declaration is in three places:

- `glue.test.mjs`: "not on record until the write", with "SF3 case A … is gone"
- `glue-trim.test.mjs`
- the README Pitfalls entry "Read lag"

A flush that never runs therefore leaves 0 scratch records, which is correct. The golden harness
test was never updated to match.

## Items

| item | defect | what changed | commits | test |
|---|---|---|---|---|
| pings-w3-1 | `test_golden_itself_still_runs[hidden]` expected the scratch ping in the log while the flush was still held. That relied on the buffer-aliasing behaviour that the declared pings-edge-1 removed, so `make test` went red and pings was parked | **Hidden run:** now expects the ping still pending: `scratchRecordsInLog` 0, and `last()` is the newest seeded ping (50, 60). Its cleanup checks are unchanged and still pass: log restored exactly, no scratch ping left in the module. **New `throttled` run:** the flush fires at 1 s, as a hidden Chrome tab runs it, which is inside the golden's 3 s settle. It proves the golden still sees its own ping (`scratchRecordsInLog` 1, `imageMatchesFoundry` true). **Every run:** pins `lastImmediateIsScratch` false. **Golden script `pings.js`:** comments only, no output change | `8f025877` | `scripts/tests/test_live_golden_pings.py` (red on the parent `2e49a13d`, green after: 9 passed) |

## Goldens changed

- `scripts/tests/test_live_golden_pings.py` and its harness `scripts/tests/fixtures/pings_live_golden.mjs`
  (new `--throttled` mode, plus a corrected header) change as described for pings-w3-1. They are
  declared by pings-edge-1.
- `scripts/foundry/live-goldens/pings.js`: comments only. The `lastImmediateIsScratch` note is
  rewritten, because it is now always false.
- **Live golden output:** `golden.ping.lastImmediateIsScratch` may go from true to false across this
  deploy. It was true while the old buffer aliased the cache below the cap, and since pings-edge-1
  it is always false. Wave 3 declares this key. Wave 2 also changed `patch.patchedOnInstanceProto`,
  which now reads `__pentarynPingsPatched`; it is true on both sides, so it does not diff.

## Deploy

This deploys the wave-2 pings code. Only `.mjs` files change in `pentaryn-pings`, with no change
to `module.json`, `lang`, styles or the kit. Per blueprint §10 a **client reload** is enough and no
server restart is needed. Wave 3 itself changes no shipped file (tests and comments only).

## Live check after deploy

Use one GM tab only, after a reload. Every ping goes on a ZZ-prefixed scratch scene that you
create and delete afterwards. Never ping on a campaign scene, and never touch the real PCs.

1. **Golden.** Run `scripts/foundry/live-goldens/pings.js` through `eval-js` (timeoutMs 60000). It
   creates and deletes its own "ZZ live-goldens pings" scene, and saves and restores the world's
   ping log. Then diff it against the golden taken before the deploy, using a declared file that
   holds both globs `ping.settingArrayReplacedByFlush` (the known noise from `noise/pings.txt`)
   and `ping.lastImmediateIsScratch` (pings-w3-1 / pings-edge-1):
   `node scripts/foundry/live-goldens/diff.mjs --declared <that file> before/pings.json after/pings.json`.
   It passes when it reports 0 undeclared differences and a clean cleanup:
   - `pingLogRestored` is true
   - `pingScratchLeft` is 0
   - `zzScenesLeft` is 0
   - `golden.ping.scratchRecordsInLog` is 1
   - `imageMatchesFoundry` is true
2. **Wave-2 items.** First save the world's ping log:
   `const saved = foundry.utils.deepClone(game.settings.get('pentaryn-pings','log'))`. Then run
   the steps in `context/plans/defect-wave-2-2026-10-12/pings.md` → "Live check after deploy"
   (pings-edge-1, pings-ext-1, pings-maint-7). Put every ping on a ZZ scratch scene you create,
   then delete the scene. Finish with `game.settings.set('pentaryn-pings','log', saved)` rather
   than `clear()`, so the table's real ping history survives the check.
3. **pings-w3-1 itself** is code-only. It is covered by `scripts/tests/test_live_golden_pings.py`
   (the visible, hidden and throttled runs). Step 1 shows the live counterpart.
