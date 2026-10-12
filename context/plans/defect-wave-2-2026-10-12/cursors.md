# Defect wave 2 2026-10-12 — cursors (pentaryn-cursors)

**Read this when:** you want the history of defect wave 2 (2026-10-12) for the tool-cursor module (`pentaryn-cursors`) and its build tool (`scripts/foundry/cursors/build.mjs`): what was fixed, why, and how to check it live. History, not instructions.

Source record: [`final-review-2026-10-12/cursors.md`](../final-review-2026-10-12/cursors.md). Branch `fix2/cursors-2026-10-12`.
Gate: `make foundry-cursors-check`. It passes 67/67 node tests, the vendored kit matches `foundry/lib`, and conformance is 100 % (47/47).

Joe gave no specific ruling on these items, so each one follows the review's recommendation. All are declared behaviour changes, listed under the CHANGELOG `Unreleased` header. The version was not bumped.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| cursors-rob-3 | After `uninstall()` the coloured tool cursor came back on the next tool switch, spell-area preview or setting toggle | Recommendation (A): an `installed` flag and cancelled ticks | After uninstalling the module for a hot patch, the map pointer stays plain until the module is re-imported. Re-importing switches everything back on. | `8af49327` | `test/api.test.mjs` (`uninstall(): … (cursors-rob-3)`), `test/hotpatch.test.mjs` |
| cursors-rob-2 | The `ready` and `canvasReady` timer ticks had no try/catch, so an error escaped uncaught and could skip the cursor repair | Recommendation | If something breaks while the map loads, the console shows a `refresh failed` or `resync failed` warning, and the blanked cursor is still put back. | `16c5f73d` | `test/glue.test.mjs` (two `cursors-rob-2:` tests) |
| cursors-rob-1 | `keyFor(null)` threw a TypeError, while `keyFor()` returned null | Recommendation (`state ?? {}`) | Asking which cursor fits an empty state now answers "the normal arrow" (`null`) instead of throwing. | `06e82cf4` | `test/core.test.mjs`, `test/api.test.mjs` (`keyFor(null) … (cursors-rob-1)`) |
| cursors-rob-4 | The build wrote a key's images even after its hotspot check failed, which could leave `assets/cursors/` half old and half new | Recommendation | The build now checks every cursor first. On a failure it names the cursor (`✗ <key>: <message>`), exits 1 and writes no files. | `30cd8e56` | `scripts/tests/test_cursors_build.py` (`test_a_hotspot_mismatch_writes_nothing`, `test_a_throwing_key_is_named_and_writes_nothing`, `test_all_keys_pass_writes_six_files_per_key`) |
| cursors-edge-5 | The centre-hotspot floor had no epsilon, so a rounding error could move a centred cursor's click point by 1 px | Recommendation (`+ 0.01`) | The centre hotspot now rounds the same way as the other positions. Today's cursors were not affected; the change only guards against a future glyph. It was fixed inside the rob-4 commit, which is why its outcome reads "already fixed". | `30cd8e56` | `test_cursors_build.py::test_centre_hotspot_tolerates_float_error` |
| cursors-EXT-4 | An unknown `extreme` value was caught only by a full resvg image build | Recommendation | `--check-sources` catches a missing icon, a misspelled hotspot direction or an off-canvas hotspot in seconds, without building any images. The hotspot table and the check share one `EXTREMES` list. | `30cd8e56` (unknown-extreme reject), `a2e10451` | `test/build-check.test.mjs` (six `EXT-4:` tests), `test_cursors_build.py::test_check_sources_rejects_an_unknown_extreme` |

No item was reverted, because every fix held.

## Goldens changed

None. Nothing under a `golden/` path changed. A real `@resvg/resvg-js@2.6.2` rebuild leaves `assets/cursors/` byte-identical, so the shipped images are unchanged.

## Live check after deploy

Only cursors-rob-3 can be checked at the table. The other items are code only and are covered by the gate. Use the single GM tab. This check needs no documents. If you want a scene, use only a ZZ-prefixed scratch scene (for example `ZZ Cursor Test`) and delete it afterwards. Never use Caven, Marrith, Talo or a campaign scene.

**cursors-rob-3**
1. Select the token controls' ruler tool. In the console, confirm `game.pentaryn.cursors.current() === 'ruler'`.
2. Run `game.pentaryn.cursors.uninstall()`. Switch to the target tool, switch back to the ruler and hover the map. Expect `current()` to stay `null`, and `#board` to have no `data-pentaryn-cursor` attribute.
3. Run `await import('/modules/pentaryn-cursors/cursors.mjs?v=2')`. Expect `current()` to return `'ruler'` a tick later.

**cursors-rob-2, rob-1, rob-4, edge-5, EXT-4:** code only. An optional console spot check is that `game.pentaryn.cursors.keyFor(null)` returns `null`.
