# Defect wave 2 2026-10-12 — lookup (pentaryn-lookup)

**Read this when:** you want the history of defect wave 2 (2026-10-12) for the rules-lookup module (`pentaryn-lookup`, `game.pentaryn.rules`): what was fixed, why, and how to check it live. History, not instructions.

Source records: [`final-review-2026-10-12/`](../final-review-2026-10-12/) (lookup area, its "For Joe" list and the untriaged findings). Branch `fix2/lookup-2026-10-12`.
Gate: `make foundry-lookup-check` — 194/194 tests, vendored kit identical (9 files), conformance 100 % (45/45).

Joe gave no item-specific ruling for this group, so every item takes the review's recommendation. All are declared behaviour changes, with lines under the CHANGELOG `Unreleased` header. No version bump. Only `.mjs` files changed: a reload, not a restart (blueprint §10). Every item holds; nothing was reverted.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| lookup-edge-1 | On Foundry v14, roll-table rows on a looked-up page showed only the number range | Recommendation | Rows show the range and then the row's text ("21 A single row"); no `text` deprecation warning | `00414db9` | `test/tables.test.mjs` |
| R4 | A compendium pack whose read failed made the whole lookup throw; one throwing self-test check stopped the rest | Recommendation | A failed pack read answers as if that pack were not installed, and says it was skipped. The self-test marks the broken check failed and runs every other check | `20f0777d` | `test/rejected-reads.test.mjs`, `test/cache.test.mjs` |
| LKM-11 | `page()` given a journal, actor or item uuid made up a page uuid that led nowhere | Recommendation | The answer echoes the exact uuid you passed in, with the existing warning | `b12b5077` | `test/api.test.mjs`, `test/core-seams.test.mjs` |
| lookup-edge-2 | Inline rolls in rule text left braces and `/r` debris | Recommendation | A labelled roll shows just its label; an unlabelled roll just its dice | `9b899e95` | `test/core.test.mjs` |
| R6 | `monster("guardian")` took a substring hit from the MM (Shield Guardian) over an exact name in a later pack | Recommendation | An exact name in any pack wins; a partial match is only the fallback. MM still first for exact names | `7f51a8c2` | `test/monster-exact.test.mjs` |
| R1 | `null` or malformed opts threw | Recommendation | `null` opts answer as omitted opts on search/page/monster/monsters/onList/spellList; a bad books/packs value answers the default with a warning | `3dcfbfda`, `0435a80c` (README) | `test/api.test.mjs` |
| lookup-edge-3 | `onList()` given a uuid for a non-spell (journal page, monster) crashed | Recommendation | Answers `notFound` with a hint naming what the uuid actually points to | `514c4182` | `test/onlist-nonspell.test.mjs` |
| R3 | A page embed whose uuid resolved to a non-table document crashed the page lookup | Recommendation | That link is listed as not found; the rest of the page still shows | `ee73ee94` | `test/table-nontable.test.mjs` |
| R5 | A single pack id given as a string searched nothing | Recommendation | A string pack id is read as that pack; an unreadable books/packs setting falls back to the normal set and the answer says it was ignored | `755cef9c` | `test/books-packs-shape.test.mjs` |
| LKM-12 | `onList()` read every known class list on every call (and traced a failure if that read threw) | Recommendation | The list of known lists is read only when the asked-for list does not exist, for the `known:` hint | `deb8798e` | `test/trace.test.mjs` |
| LKM-13 | The ready console line undercounted the lookups | Recommendation | Ready line says all 8 lookups and points to `describe()` | `bfbeaa0d` | `test/glue.test.mjs` |
| EXT-3 | `packs()` did not list the spell packs and PHB name packs other lookups read | Recommendation | `packs()` also lists `dnd-players-handbook.spells`, `dnd5e.spells24`, `dnd5e.spells`, and the PHB classes/origins/feats packs, each with `present` and an edition | `d44cf094` | `test/books-packs-shape.test.mjs` |
| EXT-5 | Answers from the 2014 SRD spell pack could pass for 2024 rules | Recommendation | onList, spellList rows and packs() label 2014-pack answers `edition: "2014"` | `a58fe3e6` | `test/editions.test.mjs`, `test/lists.test.mjs` |
| LKM-7 | Helper names in the code shadowed each other | Recommendation | Code-only rename; no behaviour change | (in `d44cf094`) | existing lists/packs tests |
| lookup-edge-5 | `cr: "CR 1/2 to 2"` or an en-dash range was silently ignored | Recommendation | CR filter reads dash, en-dash, "to" and a "CR" prefix; an unreadable CR lists every monster with a "cr not understood" warning and examples | `ce643c67` | `test/cr-parse.test.mjs`, `test/core-seams.test.mjs` |
| lookup-edge-6 | An empty `books: []` / `packs: []` gave "not found" or zero monsters | Recommendation | An empty list works like leaving it out | `13421483` | `test/books-packs-shape.test.mjs` |
| lookup-edge-7 | `monsters()` could swap in the SRD copy of an MM creature when the MM copy failed the filters | Recommendation | A name the MM has answers from the MM or not at all | `79906cfa` | `test/monsters-dedupe.test.mjs` |
| EXT-6 | The two code constants naming the PHB spell pack could drift apart | Recommendation | They cross-reference each other and a test fails if they disagree; no table-visible change | `15049338` | `test/core-seams.test.mjs` |

## Goldens changed

- `test/golden/describe.json` — opts/returns/doc strings for search, page, monsters (books/packs shapes, cr forms, `warning?`), onList (`edition?`, non-spell `notFound`), packs(). Changed by `b12b5077`, `755cef9c`, `d44cf094`, `a58fe3e6`, `ce643c67`, `13421483`.
- `test/golden/legacy-api.json` — the same contract text for the legacy surface, plus `00414db9` (table rows).

## Live check after deploy

Reload the one GM tab (no restart). All lookups are read-only; no scratch documents are needed, and none of these touch Caven, Marrith, Talo or a campaign scene. `const rules = game.pentaryn.rules;`

**lookup-edge-1** — `await rules.page("Artifacts", {books:["dnd-dungeon-masters-guide.content"]})`: every `tables[*].rows[*]` has text after its range; no `text` deprecation warning in the console.

**R4** — `const p = game.packs.get("dnd5e.actors24"); const orig = p.getIndex; p.getIndex = () => Promise.reject(new Error("ZZ read failure"));` then `await rules.monsters()` answers MM rows without throwing, and `await rules.selftest()` returns all checks with only the affected ones `ok:false`. Restore `p.getIndex = orig` (or reload).

**LKM-11** — `const id = game.packs.get("dnd-players-handbook.content").index.contents[0]._id; const out = await rules.page(\`Compendium.dnd-players-handbook.content.JournalEntry.${id}\`)`: warning present, `await fromUuid(out.uuid)` is that JournalEntry.

**lookup-edge-2** — `rules.toPlainText("roll [[/r 4d6kh3]]{4d6} now")` is `roll 4d6 now`; `(await rules.search("4d6kh3", {regex:false}))` snippets contain no `{` or `}`.

**R6** — `const n = game.packs.get("dnd5e.actors24").index.find(e => !game.packs.get("dnd-monster-manual.actors").index.some(m => m.name === e.name)).name;` then `(await rules.monster(n)).name === n`; `rules.monster("Goblin Boss")` still comes from the MM.

**R1** — `rules.search("half cover", null)`, `rules.page("Study", null)`, `rules.monster("Goblin", null)`, `rules.monsters(null)`, `rules.onList("Fireball","wizard", null)`, `rules.spellList("wizard", null)` all answer as with no opts; `rules.monsters({packs: 5})` answers the default list with a warning.

**lookup-edge-3** — `await rules.onList("Compendium.dnd-players-handbook.content.JournalEntry.<any id>", "wizard")` returns `{notFound: true, …, hint}`; `rules.onList("Fireball","wizard")` still `onList: true`.

**R3** — code only (fixture: an embed uuid resolving to a document without `results`).

**R5** — `(await rules.monsters({packs:"dnd-monster-manual.actors"})).count` > 0 and equals the array form; `(await rules.search("cover", {books:"dnd5e.content24"})).books` lists only the 2024 SRD.

**LKM-12** — code only (trace test).

**LKM-13** — after reload the console shows the ready line naming 8 lookups and `describe()`, once.

**EXT-3** — `(await rules.packs()).packs.map(p => p.id)` includes the six spell/PHB name packs, each with `present` and an edition.

**EXT-5** — `await rules.onList("Compendium.dnd5e.spells.Item.<any 2014 spell id>", "wizard")` has `edition: "2014"`; `rules.onList("Fireball","wizard")` has no `edition` key.

**LKM-7**, **EXT-6** — code only.

**lookup-edge-5** — `(await rules.monsters({size:"large", type:"construct", cr:"5–8"})).monsters.some(m => m.name === "Shield Guardian")` is true; `(await rules.monsters({cr:"hard"})).warning` names `hard`.

**lookup-edge-6** — `(await rules.search("half cover", {books:[]})).total` > 0; `(await rules.monsters({packs:[]})).count === (await rules.monsters()).count`.

**lookup-edge-7** — for every row of `await rules.monsters({limit:200})`, `row.pack === "dnd-monster-manual.actors"` whenever the MM index has that name.
