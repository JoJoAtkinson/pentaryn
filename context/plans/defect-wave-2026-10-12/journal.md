# Defect wave 2026-10-12: pentaryn-journal

**Read this when** you want the history of the 2026-10-12 defect wave for `pentaryn-journal`:
what got fixed, why, and how to check it live. This is history, not instructions. To use the module,
read its README.

Source of the defects: [final-review-2026-10-12/journal.md](../final-review-2026-10-12/journal.md),
"Recorded for Joe". On 2026-10-12, Joe said "take all of those, and if I don't mention it take
recommendation". All three changes are **[declared]** behaviour changes, each with a line under
`Unreleased` in `foundry/module/pentaryn-journal/CHANGELOG.md`. Branch: `fix/journal-2026-10-12`.

| id | defect | Joe's ruling | what changed (plain words) | commit | test |
|---|---|---|---|---|---|
| bar-stuck (review rob-1, `bar.mjs:205`) | If drawing "Adding…" threw, the bar stayed on "Adding…" for the rest of the session, and errors from the click became unhandled rejections | Take the recommendation | The redraw now happens inside the click's try. If it fails, the player gets the "Couldn't add this to your journal — tell the GM" warning and the button comes back. Every bar click (including "open") also ends in a catch, so an error is logged as a console warning. A failed "open" gets a console warning only, with no toast. | `1c81e1d6` | `test/bar-stuck.test.mjs` (2 tests) |
| double-save (review journal-async-2, `bar.mjs:85`) | Two overlapping saves (a double click, or two windows) both made a copy, giving two pages for one readable | Take the recommendation | Saves on one client now run one at a time. The second save sees the page the first one wrote, so it opens that page instead of copying again. A failed save does not block the next one. Two separate browser tabs for the same user can still both create a copy; that case is out of scope. | `44d7bde8` | `test/double-save.test.mjs` (2 tests) |
| pinned-cache (review EC-2, `bar.mjs:277`) | The pinned-journal cache was not cleared when a Scene update changed its notes, even though the docs said it was. Re-pointing a pin through `scene.update({notes})` left the one-page look stale | Take the recommendation (add the filtered `updateScene` listener) | A Scene update that changes `notes` now clears the cache, so the newly pinned journal opens as a single page right away. Other Scene updates, such as darkness, keep the cache. The listener is registered lazily with the other five, so the load-time hook golden is unchanged. The review asked for a live v14 check of whether per-Note hooks also fire for that diff. That check was not run, because this wave is code-only. If they do fire, the cache is cleared twice, which does no harm. | `21e578d2` | `test/pinned-cache.test.mjs`; header comment updated in `test/pinned.test.mjs` |

Verification: every item holds (holds=true), and nothing was reverted. `make foundry-journal-check` is green:
104 node tests and 81 core tests pass, the vendored kit is identical, and conformance is 98% with the
accepted C56 exception.

## Goldens changed

None. `golden/hooks.json` (load time) does not change, because the new `updateScene` listener is
registered on first use, as the five PIN_HOOKS already were. There are no new lang strings and no
manifest or README changes.

## Live check after deploy

Use only scratch documents with a `ZZ` prefix. Never touch Caven, Marrith or Talo, and never touch
campaign scenes or journals. Delete the scratch documents afterwards.

**bar-stuck**
1. Create journal `ZZ Bar Stuck` with one text page that a test player can observe. As that player,
   open it, and in the player's console make the "Adding…" redraw throw once:
   `const o = game.i18n.localize.bind(game.i18n); let n = 0; game.i18n.localize = k => (k === "PENTARYN_JOURNAL.adding" && !n++) ? (()=>{throw new Error("ZZ test")})() : o(k);`
   Then click "Add to my journal".
2. Expected: a warning toast saying "Couldn't add this to your journal — tell the GM", the bar back on
   "Add to my journal" (not "Adding…"), and no `Uncaught (in promise)` in the console. Click again
   (the patch has already used up its one throw), and the copy is made. Reload the player to restore
   `localize`.

**double-save**
1. As a test player, open `ZZ Double Save` (one observable page) in two windows, or call
   `game.modules.get("pentaryn-journal").api.add(...)` twice without awaiting between the calls.
2. Expected: the player's personal journal has exactly **one** page copied from `ZZ Double Save`, and
   the second action opens that same page.

**pinned-cache**
1. Make two one-page journals, `ZZ Pin A` and `ZZ Pin B`, that a test player can observe. On scene
   `ZZ Pin Scene`, place a Note pointing at `ZZ Pin A`. As the player, open `ZZ Pin B` and confirm it
   renders without the `pj-single` class.
2. As the GM, run
   `game.scenes.getName("ZZ Pin Scene").update({notes: [{_id: <noteId>, entryId: <ZZ Pin B id>}]})`.
3. Expected: reopening `ZZ Pin B` as the player shows it as a single page (`pj-single`). Then change
   only that scene's darkness (`update({"environment.darknessLevel": 0.5})`). `ZZ Pin B` should still
   be `pj-single`, and the console should show no errors.
