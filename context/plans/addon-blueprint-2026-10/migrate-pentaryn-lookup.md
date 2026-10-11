---
title: Migration guide — pentaryn-lookup to the addon blueprint
status: plan
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, migration, pentaryn-lookup]
---

# Migrating `pentaryn-lookup` to the blueprint

**Read this when:** you are about to bring `pentaryn-lookup` (`game.pentaryn.rules`) up to the
addon blueprint during the fix phase that follows the 2026-10 code audit. **Not this file:** the
general procedure → [`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 ·
the order across modules → [`migration-order.md`](migration-order.md) · the audit findings in full →
[`../code-audit-2026-10/lookup.md`](../code-audit-2026-10/lookup.md).

Line numbers are from the frozen snapshot
(`…/scratchpad/audit-snapshot/pentaryn/module/pentaryn-lookup/`, taken 2026-10-10 20:15 at
`ee505c2` + uncommitted). On 2026-10-10 the live `foundry/module/pentaryn-lookup/` was
byte-identical to the snapshot (`diff -rq` empty). Before starting, run
`git diff ee505c2 -- foundry/module/pentaryn-lookup` and
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --module lookup --markdown`. If
either shows a change, re-anchor every line number below against its quoted anchor.

**WAIT: no.** Lookup touches nothing in `pentaryn-combat`, `-transform` or `-aoe`, and it is not
in `scripts/foundry/blueprint/wait.json`. No other module imports it or reads its flags. The
only outside consumers are eval-js scripts and, later, a fork tool: `rules.search` ×30,
`page` ×14, `selftest` ×7, `monsters` ×6, `monster` ×5, `spellList` ×3, `names` ×1 and
`toPlainText` ×1 in `foundry/logs/eval.jsonl`.

**Tier: full.** Lookup has no persistent state and no writes. It is still 738 lines, publishes
ten methods and gains GM-guarded queries (prompts-lookup-3), and that needs a manifest. So it is
not small (D16). It has no settings, no lang file and no CSS: `settings.mjs`, `lang/` and
`styles/` are not created. `flags.pentaryn.namespace` is `rules` (`rules` is a reserved short
name precisely because lookup owns the namespace).

---

| Gap-fill (2026-10-10) | |
|---|---|
| Prerequisites | none beyond kit 1.0.1 (landed) — re-vendor with `vendor.py sync <short>` if the lock says 1.0.0 |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module lookup --markdown`. On the snapshot it moved 63.2 % → 64.9 % (R9: C18 is n/a) |
| Note-only findings | prompts-lookup-34 is a gap-fill stub: `audit-findings.json` holds only id and title (no file or line); the full text is in [`../code-audit-2026-10/lookup.md`](../code-audit-2026-10/lookup.md) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today — 63.2 % (24 / 38 fail-class rules)

From `conformance.py --snapshot <snapshot> --module pentaryn-lookup --json`.

| Rule | Status | Detail today | Cleared by |
|---|---|---|---|
| C01 id == folder | pass | | |
| C02 minimum 14 | **warn** | `compatibility.minimum` is `"13"` | Wave 7 restart batch |
| C03 dnd5e relationship | pass | | |
| C04 languages iff i18n | pass | no i18n, no `languages` | |
| C05 reachable from esmodules | pass | | keep: new files are imported from the entry |
| C06 / C06w styles | pass | no styles | |
| C07 `flags.pentaryn` | **fail** | missing tier, namespace, flagScope, cssPrefix, generation | Wave 7 batch (§5, W1) |
| C08 socket | pass | | |
| C09 relationships | pass | | |
| C10 size caps | **warn** | `pentaryn-lookup.mjs` 447/150 | step 7 (entry ≈ 90 lines) |
| C11 pure core | pass | `lookup-core.mjs` | keep pure while adding (step 3, 4) |
| C12 MODULE once | **fail** | `MODULE` defined 0× | step 3 |
| C13 no stray .md | pass | | |
| C14 kit vendored | **fail** | no `lib/kit.lock.json` | step 1 |
| C15 `import * as` | pass | | entry's `import * as books` is a feature (step 6) |
| C16 import direction | pass | | keep (table in §2) |
| C17 module-scope hooks in entry | pass | | |
| C18 features install/uninstall | **fail** | no feature files | step 6 (`books.mjs`) |
| C19 emitted hook names | pass | emits none | |
| C20 golden/hooks.json | **fail** | missing | step 2 |
| C21 settings calls | pass | none | |
| C22 SETTINGS exported | n/a | no settings | |
| C23 foreign settings | pass | | |
| C24 empty catch | **fail** | `pentaryn-lookup.mjs:234` | step 5 |
| C25 console prefix | pass | `:445` carries `pentaryn-lookup \|` | keep the line byte-identical |
| C26 publish timers | pass | | |
| C27 api-manifest + buildApi | **fail** | missing | step 7 |
| C28 describe/surface goldens | **fail** | missing | step 7 (additive goldens) |
| C29 inspect when writing flags | n/a | writes no flags | |
| C30 queries guarded | pass | none yet | step 9 keeps it (kit `registerQueries`) |
| C31 writes ok/fail, reads throw | manual | | §4: every row is a read with a legacy `{error}` / `{notFound}` shape, documented `legacy: true` |
| C32 patches | pass | | |
| C33 private internals | n/a | | the `CompendiumCollection#indexDocument` source read in selftest (`:390-399`) is a read of core source text, not a patch. Note it in README "Patches and adjustments" |
| C34 / C35 lang | n/a | no lang file | |
| C36 hard-coded UI English | pass | no UI | |
| C37 CSS scoped | pass | | |
| C38 cssPrefix unique | n/a | no cssPrefix (C07) | W1 declares `plk-` (reserved, unused) |
| C39 run.mjs + ModuleSpec node-test | pass | | |
| C40 tier test files | **fail** | missing core, glue, hooks, api, i18n tests | steps 2, 7, 8 |
| C41 VERSION test | **fail** | no test compares VERSION with module.json | step 3 |
| C42 synthetic fixtures | n/a | `test/fixtures.mjs` is not under `test/fixtures/` | step 2 moves it |
| C43 fixed run.mjs | **fail** | self-running suite | step 1 |
| C44 README order | **fail** | 15 sections missing/out of order | step 11 |
| C45 CHANGELOG | **fail** | missing | step 11 |
| C46 routing | pass | `context/foundry/rules-lookup.md` | |
| C47 adjustments per package | pass | names no third-party package | |
| C48 reserved names | **fail** | `pentaryn-lookup.mjs:434` `selftest` | step 7: becomes the kit's own optional `selftest` row (not legacy) |
| C49 hot hooks | pass | | |
| C50 publish `when` | n/a | | step 7 (`when: "ready"`, called synchronously) |
| C51 literal setting labels | n/a | | |
| C52 legacyName has until | pass | | |

**Target after steps 1–11:** every fail-class rule passes except C07 (Wave 7). Expect
37 / 38 ≈ 97 % until the Wave 7 batch, then 100 %. C02 stays a warning until Wave 7. C10
leaves only `lookup-core.mjs` if it grows past 600 lines (expected ≈ 520).

---

## 2. Target layout vs today

```
foundry/module/pentaryn-lookup/
  module.json               unchanged until Wave 7 (W1)
  pentaryn-lookup.mjs       ENTRY (esmodules[0], name kept — D11). Wiring only, ≈ 90 lines
  lookup-core.mjs           PURE. + MODULE, SHORT, NS, VERSION, CONTRACT, HOOKS = {}, BOOKSETS…, monster query rules
  packs-adapter.mjs         ADAPTER. game.packs / fromUuid / dnd5e.registry / enrichHTML → plain data
  books.mjs                 FEATURE. install(reg, ctx) → { rows: [], impl: { search, page, … } }; uninstall() clears the book cache
  api-manifest.mjs          PURE data: 10 rows + LIMITS (unlisted)
  api.mjs                   GLUE. buildApiFor(ctx), selftest(ctx)
  lib/                      vendored kit, tier full; kit.lock.json
  test/run.mjs              fixed body (use-doc §6), LEGACY = ["test/legacy-core.mjs"] until step 10
  test/{core,glue,hooks,api,i18n}.test.mjs
  test/fixtures/books.mjs   moved from test/fixtures.mjs
  test/golden/{hooks,legacy-api,describe,surface,queries}.json
  test/kit/                 vendored test kit
  test/graph-allow.json     {"allow": []}
  README.md                 use-doc §7 order
  CHANGELOG.md
```

Allowed imports, checked by C16: entry → books, api, api-manifest, core, lib. books (feature)
→ packs-adapter, core, lib. packs-adapter → core, lib. api → packs-adapter, api-manifest, core,
lib. api never imports `books.mjs`: `selftest` calls the **built** API through `ctx.api`.
Nothing goes in `graph-allow.json`.

### Old → new map

| Snapshot lines (`pentaryn-lookup.mjs`) | Anchor | Goes to | Step |
|---|---|---|---|
| 1-14 | file header, `import { LIMITS, searchBooks, …` | entry header (file map, feature list) | 7 |
| 16-29 | `const BOOKSETS = {` / `EDITIONS` / `MONSTER_PACKS` | `lookup-core.mjs` exports (frozen) | 3 |
| 31-34 | `const textCache = new Map();` | deleted. Dead today: it stores the raw HTML (prompts-lookup-1) | 12 (with the cache) |
| 36-40 | `function resolveBookIds(books)` | `lookup-core.mjs` `resolveBookIds` (pure) | 3 |
| 42-78 | `async function loadBooks(ids)` | `packs-adapter.mjs` `loadBooks(ids)`; the plain-book shape → core `toBook` (prompts-lookup-1 step 2, a pure move) | 4 |
| 80-83 | `function missingPackError(missing)` | `lookup-core.mjs` | 3 |
| 87-95 | `async function search(query, opts = {})` | `books.mjs` | 6 |
| 98-121 | `async function page(ref, opts = {})` | `books.mjs`. The UUID read at 104-113 → `packs-adapter.readPageDoc(uuid)` + core `foundFromDoc(…)` (prompts-lookup-5, move only) | 4, 6 |
| 124-136 | `async function withTables(out, found, opts)` | `books.mjs`; `fromUuid(u)` at 130 → `packs-adapter.readTable(uuid)` | 4, 6 |
| 141-151 | `async function findSpell(ref)` | `packs-adapter.mjs` | 4 |
| 153-156 | `function listFor(type, identifier)` | core `listFor(registry, type, id)` (registry injected); adapter passes `dnd5e.registry` | 3, 4 |
| 162-170 | `async function onList(spell, cls, …)` | `books.mjs`; 166 `dnd5e.registry.spellLists.options` → core `knownLists(registry)` **kept unguarded** (see §4) | 3, 6 |
| 173-201 | `async function spellList(cls, …)` | `books.mjs` (index reads through the adapter) | 6 |
| 209-247 | `async function monster(name, opts = {})` | `books.mjs`; the enrich loop 226-242 → `packs-adapter.featureTexts(actor)` | 4, 6 |
| 250 | `const tidy = t =>` | `lookup-core.mjs` | 3 |
| 252-260 | `const SIZE_KEYS` / `function crNum(v)` | `lookup-core.mjs`, with a twin comment naming prompts' `geometry-core` (prompts-lookup-9) | 3 |
| 268-303 | `async function monsters(q = {})` | `books.mjs` keeps the pack/index loop + dedupe Set; `monsterQuery`, `matchMonster`, `sortMonsters`, `pageMonsters` → core (prompts-lookup-6) | 3, 6 |
| 310-334 | `async function names(kind = null)` | `books.mjs` | 6 |
| 337-350 | `async function packs()` | `books.mjs` | 6 |
| 359-423 | `async function selftest()` | `api.mjs` `selftest(ctx)` calling `ctx.api.search(…)` etc.; check labels byte-identical | 7 |
| 433-441 | `function publishAPI()` | deleted. `publishNamespace("rules", api, { moduleId: MODULE })` in the entry | 7 |
| 443-446 | `Hooks.once("ready", () => {` | entry `onReady`. The `console.log("pentaryn-lookup \| game.pentaryn.rules ready — …")` line stays byte-identical | 7 |
| `test/run.mjs` 1-329 | `Fixture runner for lookup-core` | `test/legacy-core.mjs` (unchanged body) in `LEGACY`; converted to `core.test.mjs` in step 10 | 1, 10 |
| `test/fixtures.mjs` 1-92 | `BOOKS, PAGES, MONSTER_OK, MONSTER_MOVED` | `test/fixtures/books.mjs` | 2 |
| `README.md` 1-142 | `status: shipped — 0.2.0` | rewritten in use-doc §7 order | 11 |

---

## 3. Ordered steps

Each step is one commit-sized change, behaviour-neutral unless marked **[declared]**. "Char.
test" means the characterisation test you write and pass against the **unchanged** code
**before** the step. Goldens are written with `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`,
one file at a time. Agents commit each characterisation checkpoint (review happens at merge).

### Step 1 — vendor the kit, fixed `run.mjs`
- `vendor.py sync lookup --tier full`. `vendor.py check lookup` must exit 0.
- `git mv test/run.mjs test/legacy-core.mjs`. Write the fixed `test/run.mjs` (use-doc §6) with
  `const LEGACY = ["test/legacy-core.mjs"];`. Its relative imports (`../lookup-core.mjs`,
  `./fixtures.mjs`) still resolve from `test/`.
- Absorbs: none (C14, C43).
- Char. test: none. `node test/run.mjs` must print `43 passed, 0 failed` from the legacy suite,
  the same as before the step.

### Step 2 — characterise the published surface and the glue (checkpoint)
- `git mv test/fixtures.mjs test/fixtures/books.mjs`. Update the one import in
  `test/legacy-core.mjs`.
- New `test/fixtures/packs.mjs`: synthetic packs built with the kit stub's `StubCollection`.
  `dnd-players-handbook.content` holds the `BOOKS` pages, with `pages` as an **iterable**
  collection (`.size`, no `.length`). `dnd5e.content24` holds one page. `dnd-monster-manual.actors`
  holds a Goblin (`cr 0.25`, `sm`, humanoid), a Goblin Boss (`cr 1`, `sm`, with one feature whose
  description has `[[/attack]]`) and a Shield Guardian (`lg`, construct, `cr 7`).
  `dnd-players-handbook.spells` holds Fireball. Use a stub `dnd5e.registry.spellLists` with
  `forType`, `options` (`class:wizard`, `class:cleric`) and a wizard list whose `has(doc)` is true
  for Fireball. `dnd-dungeon-masters-guide.content` is absent (so the `missing` path runs).
- `test/glue.test.mjs` (characterisation part): `installFoundry({ packs, … })`, define
  `globalThis.fromUuid`, `globalThis.dnd5e`, import `../pentaryn-lookup.mjs`, `F.fire("ready")`. Pin:
  - `F.hooks` → `test/golden/hooks.json`. Today: `[{ kind: "once", name: "ready" }]`.
  - console: exactly one `console.log` line,
    `pentaryn-lookup | game.pentaryn.rules ready — search(), page(), monster(), packs(), selftest()`.
  - `Object.keys(game.pentaryn.rules).sort()` and each member's `typeof` →
    `test/golden/legacy-surface.json`. Today: `LIMITS` object, `monster`, `monsters`, `names`,
    `onList`, `packs`, `page`, `search`, `selftest`, `spellList`, `toPlainText` functions.
  - `game.pentaryn.rules.LIMITS` deep-equals `{ hits: 5, hitsMax: 20, snippet: 240, snippetMax: 600, pageChars: 6000, payloadBytes: 8192 }`.
  - Publish under both load orders: (a) `game.pentaryn` undefined; (b) `game.pentaryn` a frozen
    `{ importer: {} }`. In both, `rules` is present after `ready`.
- `test/api.test.mjs` (characterisation part), `characterise("legacy-api", …)` →
  `test/golden/legacy-api.json` over this input table:
  `search("cover")`, `search("cover", { limit: 20 })`, `search("a.b", { regex: true })`,
  `search("nothing-here")`, `search("cover", { books: "monsters" })` (all packs missing →
  `{error}`), `page("")`, `page("Study")`, `page("Study", { maxChars: 50, offset: 10 })`,
  `page("Compendium.dnd-players-handbook.content.JournalEntry.d.JournalEntryPage.g")`,
  `page("Compendium.x.y")` (fromUuid → null → `{error: "no document at Compendium.x.y"}`),
  a `fromUuid` that **rejects** (same `{error}`), `monster("")`, `monster("goblin")`,
  `monster("gob")` (substring fallback), `monster("Goblin Boss", { text: true })` with a stub
  `enrichHTML` returning `"+4"` text, the same with `enrichHTML` throwing (raw text kept),
  `monster("zzz")` (`{notFound, searched, hint}`),
  `monsters({})`, `monsters({ cr: "1/2-2" })`, `monsters({ size: "Large", type: "CONSTRUCT" })`,
  `monsters({ limit: 1 })` (hint `1 more`/`2 more`), `monsters({ cr: "1/4", minCr: 1 })`,
  `names()`, `names("subclass")`, `names("bogus")`, `onList("Fireball", "wizard")`,
  `onList("Fireball", "nope")` (`onList: null` + `hint` with `known:`), `onList("Nope", "wizard")`,
  `spellList("wizard")`, `spellList("wizard", { level: 3 })`, `spellList("nope")`, `packs()`.
  `selftest()` runs against the stub and is pinned as `{ ok, passed, failed, labels: checks.map(c => c.label) }`.
  **KNOWN** row: `onList` with `dnd5e.registry = undefined` throws `TypeError` today (pin
  `assert.rejects(…, TypeError)`). prompts-lookup-4 flips it later.
- `test/core.test.mjs`: imports `../lookup-core.mjs` first, bare (purity proof: no globals set).
  Re-asserts the ten exports the legacy suite imports exist. Also add the HTML-converter table
  from prompts-lookup-28 (seven inputs, the measured `toPlainText` outputs given in the finding).
- Absorbs: prompts-lookup-28 (lookup half). Lays the pins for -1, -2, -3, -4, -5, -6.
- **Checkpoint:** `git diff --stat -- test/` is committed by the agent as the checkpoint.

### Step 3 — pure moves into `lookup-core.mjs`
- Add `MODULE = "pentaryn-lookup"`, `SHORT = "lookup"`, `NS = "rules"`, `VERSION = "0.3.0"`,
  `CONTRACT = "pentaryn-lookup/api@1"`, `HOOKS = Object.freeze({})`.
- Move `BOOKSETS`, `EDITIONS`, `MONSTER_PACKS` (:20-29), `resolveBookIds` (:36-40),
  `missingPackError` (:80-83), `tidy` (:250), `SIZE_KEYS`, `crNum` (:252-260).
- Extract `monsterQuery(q)` → `{ size, type, lo, hi, name, limit, packIds }` (:269-280),
  `matchMonster(entry, query)` (:287-293), `sortMonsters(rows)` (:300, the **same** comparator:
  a NaN CR falls through to the name order; do not "fix" it), `pageMonsters(rows, limit)`
  (:301-302).
- Add `listFor(registry, type, identifier)` (body of :154, try/catch kept) and
  `knownLists(registry)` = `registry.spellLists.options?.map(o => o.value) ?? []`, **without** a
  try/catch (the guard is the declared step 13).
- Absorbs: prompts-lookup-6 (whole), prompts-lookup-4 (move half), prompts-lookup-9 (lookup
  half: comment naming the twin), C12, C41.
- Char. test (core.test, before the move): paste today's inline code from :269-302 into
  `test/fixtures/legacy-monsters.mjs` as the oracle. Assert new == oracle over this table:
  `monsterQuery({ cr: "1/2-2" })` gives lo 0.5 and hi 2. `{ cr: 3 }` gives lo = hi = 3.
  `{ cr: "1/4", minCr: 1 }` gives lo 1 and hi 0.25. `{ size: "Large" }.size === "lg"` and
  `{ size: "weird" }.size === "weird"`. Limits: `{ limit: 999 }` → 200, `{}` → 40, `{ limit: 0 }` → 40.
  `matchMonster` with the Goblin Boss entry is true for `{type: "FEY"}` once its type is fey,
  false for `{size: "med"}`, true for `{name: "boss"}`, and false for a `character` entry.
  `sortMonsters([{name:"B",cr:1},{name:"A",cr:1},{name:"C",cr:0.25},{name:"D"}])` gives the
  oracle's order, including the CR-less row. `pageMonsters` of 45 rows at limit 40 gives
  `shown: 40` and a hint containing `5 more`. `crNum` over `["1/4", 0.25, "3", 3, "", null, undefined, "x", " 1 / 2 ", "1/8"]`
  gives `[0.25, 0.25, 3, 3, null, null, null, null, 0.5, 0.125]`. `VERSION` equals
  `JSON.parse(readFileSync(new URL("../module.json", import.meta.url))).version`. `listFor` with
  `{ spellLists: { forType: (t, i) => t === "class" && i === "wizard" ? "L" : null } }` and
  `"Wizard"` returns `"L"` (lower-casing). `listFor({}, "class", "x")` returns null.
  `knownLists` with two options returns both values.
- After: `node test/run.mjs` green; `legacy-api.json` unchanged.

### Step 4 — `packs-adapter.mjs`
- Move `loadBooks` (:57-78) **including** the dead `textCache` (it goes in step 12, not here),
  `findSpell` (:141-151), the UUID read in `page` (:104-108 → `readPageDoc(raw)` returning
  `{ doc, parent, packId, label }` or null, with the `.catch(() => null)` kept), the table read
  (:130 → `readTable(uuid)`), the enrich loop (:226-242 → `featureTexts(actor)`), the index reads
  (`readIndex(id, fields)`), and `spellRegistry()` returning `dnd5e.registry`.
- Add core `foundFromDoc({ documentName, id, name, html, pack, parent, packLabel, edition })` →
  `{ book, doc, page }`, exactly the object at :109-113 (prompts-lookup-5, move half).
- Add core `toBook(id, label, edition, docs)`, the plain-book builder at :63-75, **without**
  `text` yet (prompts-lookup-1, move half). It iterates `pages` with `for…of`.
- Absorbs: prompts-lookup-5 (seam), prompts-lookup-1 (seam), C16 stays green.
- Char. test (before the move): `foundFromDoc` for a JournalEntryPage
  `{documentName:"JournalEntryPage", id:"g", name:"Cover", html:"<p>Half cover</p>", pack:"p.c", parent:{id:"d",name:"Combat"}, packLabel:"PHB"}`:
  `renderPage(f)` deep-equals `{ book: "PHB", journal: "Combat", page: "Cover", uuid: "Compendium.p.c.JournalEntry.d.JournalEntryPage.g", text: "Half cover" }`,
  with no `edition` key. A `JournalEntry` with no parent gives `text: ""` and journal === page
  name. `toBook("p","L",undefined,[{id:"d",name:"D",pages:new Set([{id:"g",name:"G",text:{content:"<p>a</p>"}},{id:"h",name:"H",text:null}])}])`
  deep-equals the today-shape `{id:"p",label:"L",edition:undefined,docs:[{id:"d",name:"D",pages:[{id:"g",name:"G",html:"<p>a</p>"},{id:"h",name:"H",html:""}]}]}`.
  `legacy-api.json` and `hooks.json` unchanged.

### Step 5 — no comment-only catch (C24)
- `:234` `} catch { /* fall back to the raw text … */ }` (now in `featureTexts`) becomes
  `} catch (err) { log.debug("enrichHTML failed", { item: i.uuid }, err); }`. The adapter receives `log`
  as an argument from the feature (`ctx.log`). Do the same for the `.catch(() => null)` reads in
  `readPageDoc`, `readTable` and `findSpell`, and the `catch { return null; }` in core
  `listFor`. Core stays pure: it returns `null` and the adapter logs at the call site, when the
  registry read is the adapter's. Return values stay identical.
- Absorbs: prompts-lookup-34 (whole), C24.
- Char. test (glue.test): with `CONFIG.debug["pentaryn-lookup"]` unset,
  `page("Compendium.x.y")` against a rejecting `fromUuid` deep-equals
  `{ error: "no document at Compendium.x.y" }` and **zero** console lines. With the debug flag
  `true`, after the step: the same return and one `console.debug` whose first argument starts
  with `pentaryn-lookup | `. The second assertion is new (the before-run asserts zero lines), and it
  goes into the step's own commit as an additive pin.

### Step 6 — `books.mjs` feature
- `export function install(reg, ctx)` stores `ctx.log` and returns
  `{ rows: [], impl: { search, page, monster, monsters, names, packs, onList, spellList } }`.
  The rows stay in `api-manifest.mjs` (one table, so `registerQueries` sees them; a contribution
  with `rows: []` and impl only is valid in `buildApi`). It registers no hook.
- `export function uninstall()` is a no-op until step 12, then clears the book cache.
- The method bodies are moved verbatim from :87-350, calling the adapter and core.
- Absorbs: C18.
- Char. test: `legacy-api.json` is the char. test (unchanged). Add to `hooks.test.mjs`: `books`
  exports `install` and `uninstall`, and `install()` registers no hook (`reg.ids()` is empty).

### Step 7 — API manifest, `api.mjs`, publish, entry ≤ 150 lines
- `api-manifest.mjs`: `MANIFEST = { module, namespace: "rules", version, contract, flagScope: MODULE, rows, unlisted: ["LIMITS"] }`.
  Rows (all `gm: false, writes: false`):
  - `search`, `page`, `monster`, `monsters`, `names`, `packs`, `onList`, `spellList`:
    `legacy: true` (their shapes are `{error}` / `{notFound}` objects, not coded throws). `returns`
    is filled from prompts-lookup-2's DESCRIBE text. For example, `search` returns
    `{query, books, total, shown, hits:[{book,journal,page,uuid,matches,snippet,edition?}], note?, truncated?, warning?} | {error}`.
    Add a `doc` line: "an object — iterate `.hits`".
  - `page`: param 0 is `{ name: "ref", resolve: false, type: "page UUID | page name" }`. **`resolve:
    false` is required**: without it `buildApi` would run `resolveRef(ref, "actor")` on a page name.
    No other lookup param may be named `ref`.
  - `toPlainText`: a normal row (`params: [{name:"html"}]`, `returns: "string"`).
  - `selftest`: an **own, non-legacy** row. The kit lets a module define `inspect`/`selftest` only
    as its own top-level non-legacy row, and `legacy: true` would make `buildApi` throw
    `"selftest" is reserved`. `returns: "{ ok, passed, failed, checks: [{ label, ok, detail }] }"`
    (a superset of the kit's `{ok, checks}`). This is what clears C48.
  - `LIMITS` is data, not a method: it goes in `unlisted` and in the impl map as
    `LIMITS: Object.freeze({ ...LIMITS })` (see **[declared] DL1**).
- `api.mjs`: `buildApiFor(ctx)` = `buildApi(MANIFEST, { selftest: () => selftest(ctx), toPlainText, LIMITS: … }, { contributions: ctx.contributions, members: { trace: () => ctx.log.traces(), uninstall: ctx.uninstall } })`.
  `selftest(ctx)` is the body of :359-423 with `search(…)` → `ctx.api.search(…)` etc. Labels
  and detail strings stay byte-identical.
- Entry `pentaryn-lookup.mjs`: imports, `FEATURES = [books]`, `ctx` as in the template, `install()`
  called **synchronously in the body** (migrating module, use-doc §6), then
  `Hooks.once("ready", onReady)`. `onReady`: `try { ctx.api = buildApiFor(ctx) } catch (err) { log.error("API manifest drift — not published", err); return; }`,
  then `publishNamespace(NS, ctx.api, { moduleId: MODULE })`, then the same `console.log` line as
  today. No `init` hook yet (it arrives with queries in step 9), so `golden/hooks.json` is unchanged.
- Absorbs: prompts-lookup-2 (VERSION, describe, module api, documented shapes), C10 (entry),
  C27, C28, C48, C50.
- Char. test: `legacy-surface.json` must still hold. Every legacy key is present with the same
  `typeof`. **New** keys are allowed, and the test asserts the legacy set ⊆ the new surface.
  `legacy-api.json` is unchanged.
  `selftest` is pinned the same way. Then, as **additive** goldens in this step's own commit
  (new files, not edits): `golden/surface.json` (`surfaceOf(api)`) and `golden/describe.json`
  (`normaliseDescribe(api.describe())`), plus `api.test.mjs` cases. Rows ↔ impl. `describe().methods`
  paths sorted equal `["monster","monsters","names","onList","packs","page","search","selftest","spellList","toPlainText"]`
  (prompts-lookup-2's key-set test). `game.modules.get("pentaryn-lookup").api === game.pentaryn.rules`.
  `Hooks.callAll` was called with `pentaryn-lookup.ready` and `pentaryn.ready`.
  `api.describe().namespace === "rules"`.

### Step 8 — remaining tier tests
- `hooks.test.mjs`: `F.hooks` equals `golden/hooks.json`. `uninstall()` leaves no hook
  registered by `reg`.
- `i18n.test.mjs`: lookup has no lang file. Assert that no source file outside `lib/` and `test/`
  contains a `PENTARYN_` literal or an `i18n.` call (`sourceScan`), so C04 stays honest.
- `glue.test.mjs`: `utilsSource === "foundry"` unless `PENTARYN_TEST_SHIMS=1`.
- Absorbs: C40.

### Step 9 — GM-guarded queries **[additive]**
- Set `query: true` on `search`, `page`, `monster`, `monsters`, `names`, `onList`, `spellList`
  and `packs`. Each one gets an `args` mapper, taken from prompts-lookup-3's QUERY_ARGS and
  checked against the real signature:
  `search: d => [d.query, d]`, `page: d => [d.ref, d]`, `monster: d => [d.name ?? d.ref, d]`
  (the signature is `monster(name, opts)`), `monsters: d => [d]`,
  `names: d => [d.kind ?? null]`, `onList: d => [d.spell, d.cls, { type: d.type ?? "class" }]`,
  `spellList: d => [d.cls, { type: d.type ?? "class", level: d.level ?? null }]`,
  `packs: () => []`. They are `legacy` rows, so `registerQueries` calls `fn(...row.args(d))`.
- Entry gains `Hooks.once("init", () => registerQueries(MANIFEST, () => ctx.api, { log }))`.
  Registering at init gives `NOT_READY` until `ready` publishes, which is fine: nothing calls
  before then.
- Absorbs: prompts-lookup-3, mcp-fork-24 (lookup uses the kit `guarded`).
- Char. test (before): `CONFIG.queries` has no `pentaryn-lookup.*` key. After, as the step's own
  golden commit: `golden/hooks.json` gains `{kind:"once",name:"init"}` first. This is a declared,
  additive golden edit, with the reason in the commit message. `golden/queries.json` pins the
  payloads for `search({query:"cover"})`, `page({ref:"Study"})`, `monsters({cr:"5-8"})` and
  `onList({spell:"Fireball",cls:"wizard"})`. Assert `toPlain` is a no-op on all four. A non-GM sender
  `{ user: { isGM: false, name: "P" } }` rejects with the message `NOT_GM: P is not a GM`. A non-GM
  client rejects with `NOT_GM: this client is not a GM`.

### Step 10 — convert the legacy suite
- `test/legacy-core.mjs` becomes `test/core.test.mjs` cases: each `t(name, fn)` becomes
  `test(name, fn)`, and `eq` becomes `assert.deepStrictEqual`. Then `LEGACY = []` and the old file
  is deleted.
- Char. test: the count of converted cases equals the legacy pass count (43 on the snapshot).
  The conversion diff touches only `test/`.

### Step 11 — docs
- README rewritten in use-doc §7 order. **Read this when** line. What the player sees: "n/a — GM/LLM
  tool, no UI". Settings: n/a. API: the table from `describe()`, with "Returns" column. Data written: none.
  Flags other modules read: none. Events: none. Hooks: `ready` (+ `init`). Patches and adjustments:
  none, with the `indexDocument` source read noted. Two sessions: read-only, any client.
  **Extending**: a pure function in `lookup-core` with a fixture, a thin `books.mjs` function,
  a manifest row (`returns`, `doc`, `legacy` only if the shape is legacy, `query` + `args`), a
  selftest check, a `rules-lookup.md` line. **Pitfalls**: `getIndex({fields})` and nested
  pages (:44-56 text); `doc.pages` is an EmbeddedCollection; no param named `ref` without
  `resolve: false`. Files, Tests (`node test/run.mjs`, `vendor.py check lookup`,
  `conformance.py --module lookup`; no fixture count), Sync (reload; restart only for the Wave 7
  module.json batch).
- `CHANGELOG.md`: 0.2.0 and 0.3.0 from git history, plus an "Unreleased — blueprint migration" entry.
- Outside the module (fix-phase scope): replace "41 fixtures" in
  `context/foundry/rules-lookup.md:78` and the `scripts/foundry/ops/config.py:154` comment with
  "run `node test/run.mjs`". Add a "What comes back" table there.
- Absorbs: prompts-lookup-26, C44, C45.
- Char. test: none (docs). `conformance.py --module lookup` passes C44 and C45.

### Step 12 — book cache **[declared] DL5** (standalone perf fix, after the structure)
- See §4. Done last because it changes runtime behaviour (memory, staleness).

### Step 13 — registry guard **[declared] DL3** (standalone hardening)
- See §4.

---

## 4. Findings that stay standalone (not structural)

| Finding | Why standalone | When | Char. test first |
|---|---|---|---|
| prompts-lookup-1 (cache half) | A runtime change: books are loaded once per session; memory roughly doubles for the text copy; stale if a pack changes mid-session (packs are locked while Foundry runs). The seam (`toBook`) moved in step 4 | Step 12, **[declared] DL5** | Build `BOOKS_T` (the fixture with `text: toPlainText(html)` added). For q in `["cover","half cover","Study","attack","nothing-here","a.b"]` × o in `[{}, {limit:20}, {snippet:600}, {regex:true}]`, `searchBooks(BOOKS_T,q,o)` deep-equals `searchBooks(BOOKS,q,o)`. `renderPage(findPage(BOOKS_T,"Study"),{maxChars:50,offset:10})` equals the BOOKS version. Glue: count `getDocuments()` calls; after the change two `search("cover")` calls give identical results and calls === `BOOKSETS.rules.length` present packs (read the constant, never a hard 3). `books.uninstall()` empties the cache. Missing packs are never cached |
| prompts-lookup-4 (guard half) | Changes a failure path: a `TypeError` becomes the documented not-found answer when `dnd5e.registry` moves | Step 13, **[declared] DL3** | The step 2 KNOWN row (`onList` with `dnd5e.registry` undefined rejects `TypeError`) is flipped in the same commit: it now resolves `{ …, onList: null, hint: "no such list; known: " }`. `knownLists(undefined)` gives `[]`. `knownLists({ spellLists: {} })` gives `[]`. Valid registries are unchanged (the step 3 cases) |
| prompts-lookup-5 (warning half) | Additive output key: `warning: "<uuid> is a <documentName>, not a JournalEntryPage — pass a page UUID from search()"` | Any time after step 4, **[declared] DL4** | The step 4 pins for both kinds hold. The page kind has no `warning`. The JournalEntry kind gains exactly that key, and `text`, `uuid` and `journal` are unchanged |
| prompts-lookup-28 (lookup half) | Tests only: pins `toPlainText`'s contract against prompts' `stripHtml` | Step 2 (already listed) | — |
| prompts-lookup-9 (lookup half) | Modules cannot import each other; lookup keeps its own `SIZE_KEYS`/`crNum` with a twin comment | Step 3 (comment only) | — |
| mcp-fork-20 | Routing index in `context/foundry/README.md` (namespace `rules` ≠ module id) | Fix phase docs pass; generated later from `golden/describe.json` | — |

---

## 5. Declared behaviour changes (each needs the live-test workflow)

| # | Change | How to see it at the table / console | Live test |
|---|---|---|---|
| DL1 | The API object is frozen (`buildApi`), and `rules.LIMITS` is a frozen **copy**. Assigning `game.pentaryn.rules.x = …` throws in strict mode. Mutating `rules.LIMITS.hits` no longer changes searches (it did today, the same object as core's). No eval log entry does either | `Object.isFrozen(game.pentaryn.rules)`; `rules.LIMITS === …` | After sync and a reload: `game.pentaryn.rules.search("half cover").then(r => r.total)` > 0; `game.pentaryn.rules.describe().namespace === "rules"` |
| DL2 | New: `game.modules.get("pentaryn-lookup").api`, hooks `pentaryn-lookup.ready` and `pentaryn.ready`, the kit members (`describe`, `version`, `contract`, `settings`, `trace`, `uninstall`), and `game.pentaryn.describe()` lists `rules`. Plus eight GM-only `pentaryn-lookup.*` queries registered at `init` | console: `CONFIG.queries["pentaryn-lookup.search"]` is a function | From the bridge (GM client), `CONFIG.queries["pentaryn-lookup.search"]({query:"cover"})` gives the same object as `rules.search("cover")`. From a player client, `game.users.activeGM.query("pentaryn-lookup.search",{query:"x"})` rejects `NOT_GM` |
| DL3 | `onList`/`spellList` answer "no such list" instead of throwing when the dnd5e registry path is missing | only on a dnd5e that moved `registry.spellLists` | `rules.onList("Fireball","wizard")` → `onList: true`; `rules.selftest()` → `ok: true` |
| DL4 | `page(<non-page UUID>)` gains a `warning` key | `rules.page("Compendium.dnd-players-handbook.content.JournalEntry.<id>")` | the warning text is present, and a page UUID from `search()` has none |
| DL5 | Book packs are cached per session. The second search is faster; `uninstall()` clears the cache | time two `search()` calls | the first `search("cover")` takes ≈ 150 ms+ per pack, the second near-instant; results are identical; `selftest().ok` |
| W1 | Wave 7 restart batch (not this migration's commits): `compatibility.minimum` `"13"` → `"14"`, plus `flags.pentaryn = { tier: "full", namespace: "rules", flagScope: "pentaryn-lookup", cssPrefix: "plk-", generation: 14, afterSync: ["Reload, then game.pentaryn.rules.selftest()"] }` | needs a Foundry **restart** | `conformance.py --module lookup` → C07 pass, C02 pass |

Console-only additions (no live test needed, Joe's rule): the debug-gated lines from step 5.

---

## 6. Effort

| Steps | Effort |
|---|---|
| 1-2 vendor + characterisation (fixture packs are the bulk) | M — ½ day |
| 3-4 pure moves + adapter | S — 2-3 h |
| 5-8 C24, feature, manifest/api/publish, tier tests | M — ½ day |
| 9 queries | S — 1-2 h |
| 10-11 test conversion + docs | S — 2 h |
| 12-13 declared fixes | S — 1-2 h + one live-test pass |
| **Total** | **≈ 1½-2 agent-days**, one live-test session (DL1-DL5 together) |

Run after every step, from `foundry/module/pentaryn-lookup/`: `node test/run.mjs`. From the repo root:
`./.venv/bin/python scripts/foundry/blueprint/vendor.py check lookup`,
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --module lookup --markdown`,
`make foundry-lookup-check`. `git diff --stat -- foundry/module/pentaryn-lookup/test/golden`
must be empty on every refactor commit (steps 3-6, 8, 10). Steps 7 and 9 add goldens in their own commits.

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | ___ % (___ / ___ fail-class rules) — `conformance.py --module lookup --markdown` |
| Date | ____-__-__ |
| Commits (Joe-approved) | characterisation: ______ · refactor: ______ · standalone: ______ |
| Declared changes handed to the live-test workflow | ______ (session L__) |
| `module.json` edits appended to `wave7-restart-batch.md` | yes / no |
| Adjustments rows appended to `adjustments-batch.md` | yes / no |
| Still failing, and why | ______ |
