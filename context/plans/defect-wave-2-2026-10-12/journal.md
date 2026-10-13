# Defect wave 2 2026-10-12: pentaryn-journal

**Read this when** you want the history of defect wave 2 (2026-10-12) for `pentaryn-journal`:
what got fixed, why, and how to check it live. This is history, not instructions. To use the module,
read its README.

Source: the final review's journal record ([final-review-2026-10-12/journal.md](../final-review-2026-10-12/journal.md))
"For Joe" list plus the untriaged findings. On 2026-10-12 Joe approved wave 2 ("Let's create a dynamic
workflow to solve all of these things"). Where he gave no ruling the recommendation was taken. Every
change is **[declared]**, with a line under `Unreleased` in `foundry/module/pentaryn-journal/CHANGELOG.md`.
Branch: `fix2/journal-2026-10-12`.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| journal-async-1 | With two GM tabs open, both could make the "Player Journals" folder and a player's journal on world load or when a player was added | Recommendation | Only one GM tab makes the folder and each journal, on load and for a new player. The other tab waits for it instead of making a second copy. | `2cc4fc0f` | `test/two-tabs-ensure.test.mjs` |
| journal-EC-4 | The two-tab claim used each computer's own clock, so a tab with a wrong clock could treat a fresh claim as stale | Recommendation | The claim is stamped and judged on the Foundry server's clock. | `dcd72761` | `test/claim-clock.test.mjs` (fixture `test/fixtures/world.mjs` gains a fake server time) |
| journal-rob-2 | After the GM answered a player's first save, a journal that never arrived left the player with nothing happening | Recommendation | The player waits up to 3 s for the journal. If it never shows up they get the "failed" warning so they know to tell the GM. | `7a57686f` | `test/player-relay.test.mjs` |
| journal-rob-3 | `personal`, `shouldShowBar` and `ensure` only worked with a User object | Recommendation | They also take a player's id or exact name. A name that matches nobody is rejected as NOT_FOUND, and a name that matches two people as AMBIGUOUS. | `cf843393` | `test/user-ref.test.mjs` |
| journal-rob-4 | One open journal window that threw stopped the one-page setting change reaching the other windows | Recommendation | The other windows still update. The error is only a console warning. | `c90a8e5d` | `test/single-page-change.test.mjs` |
| journal-rob-5 | Another module vetoing the folder or journal create caused a bare TypeError | Recommendation | A vetoed folder leaves loose journals where they are, without an error. A vetoed journal makes the player's request fail with "NOT_CREATED: the journal could not be created". | `c19e7d06` | `test/create-veto.test.mjs` |
| journal-rob-6 | If the journal window failed to open after a save, the whole add reported failure | Recommendation | The copy is still saved and the "added"/"updated" message still shows. The open failure only goes to the console. | `ad2c2ebd` | `test/open-after-save.test.mjs` |
| journal-EC-3 | The bar showed on a journal where the player could see no page at all | Recommendation | No bar until at least one page is visible to the player. It comes back on re-render once a page is revealed. | `dfd356cc` | `test/no-visible-pages.test.mjs` |
| journal-EC-5 | A saved embed with no link target had its label escaped twice ("Tom &amp;amp; Jerry") | Recommendation | The label matches the page. A copy saved before the fix may offer "Update my copy" once. | `6ea86b10` | `test/embed-label.test.mjs` |
| journal-perf-3 | An open item bar re-sanitized the item description on every redraw | Recommendation | The cleaned description is reused until the item changes, is identified, or the language changes. | `93b1ea38` | `test/perf.test.mjs` |
| journal-perf-4 | A bar refresh looked up the player's journal once per open window | Recommendation | Looked up once per refresh pass. | `07577733` | `test/perf.test.mjs` |
| journal-M7 | `ctx.exposed` handed out three helpers only a test used | Recommendation | Removed. No change at the table. | `44c1a107` | `test/features.test.mjs`, `test/perf.test.mjs` |
| journal-M9 | The docs said the bar was only on eye/pin readables | Recommendation (docs follow the code) | README, module.json description and afterSync now say: any journal the player can observe but doesn't own, and items in eye piles they can inspect. No change at the table. | `ea3619c9` | `test/docs.test.mjs` |
| journal-EXT-6 | The four skip reasons were listed separately in code, API description and README | Recommendation | One `SKIP_REASONS` list in core drives all three, and a test fails if they drift. Same four reasons as before. | `7fae1a46` | `test/docs.test.mjs` |

**Goldens changed:** `test/golden/describe.json` (the API description) in `cf843393` (user id/name
arguments), `c19e7d06` (NOT_CREATED error) and `7fae1a46` (the lastReason row from `SKIP_REASONS`).
No other golden changed.

**Verification:** every item holds; nothing was reverted. `make foundry-journal-check` is green:
126 node tests and 81 core tests pass, the vendored kit is identical, and conformance is 98% with the
accepted C56 exception.

**Deploy:** module `pentaryn-journal`. `module.json` changed (description and afterSync text), so per
blueprint §10 it needs a Foundry restart, then a reload.

## Live check after deploy

Use ZZ-prefixed scratch journals created on the GM tab and delete them afterwards. No second GM tab,
no scratch users, no real PCs or campaign scenes.

- **journal-async-1, EC-4, rob-2, rob-4, rob-5, perf-3, perf-4, M7, EC-5:** code only (they need a
  second GM tab, a scratch user, a vetoed create, or a timing). Covered by the tests in the table.
- **journal-rob-3:** on the GM tab create `ZZ Ref Journal`, then check
  `api.shouldShowBar(<ZZ Ref Journal>, 'Gamemaster') === api.shouldShowBar(<ZZ Ref Journal>, game.user)`,
  and that `api.personal('ZZ nobody')` throws NOT_FOUND.
- **journal-rob-6:** with "Show the Add button to the GM" on, open `ZZ Open Fail` (one text page),
  patch its personal sheet's render to throw once, click Add. Expect the page in the GM's personal
  journal, an "added" toast, no "failed" toast, and one console warning.
- **journal-EC-3:** with the GM button on, open `ZZ Empty` (no pages): no `pj-bar` footer. Add one text
  page and re-render: the bar appears.
- **journal-M9 / EXT-6:** after restart, the module's description in Manage Modules reads "any journal
  ... the player can observe but does not own"; `api.describe()` lists the four skip reasons.
