---
title: "Code audit 2026-10 — pentaryn-lookup"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-lookup

**Read this when:** you are about to refactor, harden or document pentaryn-lookup and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-lookup

**Purpose.**

Read-only full-text and structured lookup over the owned PHB, DMG and MM, plus the 2024 SRD, inside Foundry. It provides search (one hit per page, enricher-free snippets, payload capped), page (by UUID or name, with embedded roll tables), monster (digest or enriched feature text), monsters (by size, type and CR), names (PHB names for a character spec), onList/spellList (dnd5e spell-list registry), packs and selftest. It is published as game.pentaryn.rules.

**Health.**

Clean and small.
- A pure lookup-core.mjs is tested by 43 fixtures that target each silent trap, behind a thin adapter. A live selftest documents the core indexDocument workaround.
- The adapter has grown to 446 lines. The README still says '~60 lines', '41 fixtures' and 'status 0.2.0' while module.json says 0.3.0.
- The monsters() filter, CR-range parsing and sort live untested in the adapter.
- Performance: textCache caches raw HTML (dead weight). Every search re-reads all three book packs with getDocuments() and re-strips every page's HTML.
- Hardening: the registry `.options` reads are unguarded, a page() UUID that is not a page is accepted silently, and the monsters sort can compare undefined CR values.
- No lang file, no flags.pentaryn, compatibility minimum 13 (prompts says 14).

**LLM interface.**

Today: eval-js only (`game.pentaryn.rules.*`).
- The namespace `rules` does not match the module id.
- There is no version and no describe().
- Return shapes differ: search returns `{query, books, total, shown, hits, note?}` or `{error}`, monsters returns `{count, shown, monsters, hint?}`, page/monster/onList return `{notFound…}`.
- None of this is stated where the LLM reads (rules-lookup.md shows calls only), and it caused 6 logged failures from treating results as arrays.

Target state:
- `describe()` and `VERSION` on the API, plus game.modules.get('pentaryn-lookup').api.
- Shapes documented in rules-lookup.md.
- GM-guarded CONFIG.queries['pentaryn-lookup.*'] (prompts' guarded() pattern). That lets a typed fork tool 'rules-lookup' replace the ToolSearch, eval-js and script round trip for the 25+13 most common calls.

**How to extend.**

A new lookup method today takes four steps:
1. A pure renderer or filter in lookup-core.mjs, with fixtures in test/run.mjs.
2. An adapter function in pentaryn-lookup.mjs.
3. An entry in publishAPI's api object (:434).
4. A README Options line, a rules-lookup.md line, and ideally a selftest check (:359).

What is unclear: the adapter now holds real logic (monsters filtering, names grouping, spellList dedupe) that by the module's own rule belongs in the core. Pack-id tables (BOOKSETS, MONSTER_PACKS, the spell pack order in findSpell, the monsters default packs) are spread across the adapter. Finding prompts-lookup-6 moves these into a tested core.

> **Status 2026-10-11 (workflow 2, branch `migrate/wave-2`):** applied in-module, two halves still
> pending outside it —
> -6 `0e5d1f95`; -4 `0e5d1f95` + `91ee5c9d` [declared DL3]; -5 `9c1a1a68` + `10053c27` [declared DL4];
> -1 `9c1a1a68` + `b98745c1` [declared DL5], locked-packs-only review fix `74922db2` [declared];
> -34 `ef578313`; -3 `2afb4d4b` [declared DL2]; -26 `90d294e0` (README; the routing/config half
> landed in wave 1).
> -2: API half `abb4ae75` [declared DL1/DL2]; rules-lookup.md 'What comes back' table pending
> integrator (shared-file item 3); mcp-fork-20 pending module-index regeneration.
> -6 follow-up (its Proposed's "separate follow-up" and the pack-id tables under How to extend):
> oracle `3e2d44c4`, spellList dedupe `a45cc10d`, names() grouping + `NAME_SOURCES` `de4b68ec`,
> `MONSTER_LIST_PACKS` `22052ca3`, README `36a4fdfe`. No pack id is inline in `books.mjs` now.
> The record is the guide's Result row (`../addon-blueprint-2026-10/migrate-pentaryn-lookup.md`).

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| prompts-lookup-1 | Performance gains | high | S | Cache the loaded book packs and their plain text; remove the dead textCache |
| prompts-lookup-6 | Maintainability gains | medium | M | Move monsters() query parsing, filtering and sorting (plus crNum, SIZE_KEYS) into lookup-core with fixtures |
| prompts-lookup-34 | Logging / auditability gains | low | S | Lookup turns five different failures into null or a generic error and leaves no trace |
| prompts-lookup-4 | Hardening | low | S | Guard the dnd5e spell-list registry reads the way listFor already is |
| prompts-lookup-5 | Hardening | low | S | page(uuid): extract the UUID path into a pure seam and flag a non-page document |
| prompts-lookup-2 | LLM interface | high | S | Make game.pentaryn.rules self-describing: VERSION, describe(), module api, documented return shapes |
| prompts-lookup-3 | LLM interface | high | M | Register GM-guarded CONFIG.queries for the read-only lookups so a typed MCP tool can replace eval-js |
| prompts-lookup-26 | Documentation / skills | low | S | Fix lookup README drift (version, fixture count, adapter size) and add an 'Extending' recipe |

## Performance gains

### prompts-lookup-1 — Cache the loaded book packs and their plain text; remove the dead textCache

**Category:** Performance gains · **Impact:** high · **Effort:** S

**Where:** `foundry/module/pentaryn-lookup/pentaryn-lookup.mjs:64–80`

**Anchor:** `    for (const doc of await pack.getDocuments()) {`

**Current.**

Every search() and page(name) call runs loadBooks, which calls getDocuments() on every pack in the bookset (PHB + DMG + SRD content24, roughly 2,100 pages). searchBooks then calls toPlainText(page.html) per page per query (lookup-core.mjs renderPage :221 and the search loop do the same). textCache (:31-34, used in loadBooks) claims to memoize stripped text but stores and returns the raw HTML it just read, so it saves nothing and its comment is wrong. The packs are read-only while Foundry runs.

**Proposed.**

1. Replace textCache with `const bookCache = new Map()` keyed by pack id; each entry is the plain book {id,label,edition,docs:[{id,name,pages:[{id,name,html,text}]}]}.
2. Add pure `toBook(id,label,edition,docs)` to lookup-core.mjs that sets `text: toPlainText(html)` once per page; loadBooks returns cached books and calls getDocuments() only on a miss (missing packs still reported in `missing`, never cached).
3. In searchBooks and renderPage use `page.text ?? toPlainText(page.html)` so fixtures without text behave as before.
4. Export clearBookCache() on the api for the rare mid-session module update.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-lookup/test/run.mjs (43 fixtures pass today; verified). Write before refactor:
(1) Build BOOKS_T = fixtures BOOKS deep-mapped with `text: toPlainText(html)` on every page. For q in ['cover','half cover','Study','attack','nothing-here','a.b'] and o in [{}, {limit:20}, {snippet:600}, {regex:true}] assert deepEqual(searchBooks(BOOKS_T,q,o), searchBooks(BOOKS,q,o)).
(2) renderPage(findPage(BOOKS_T,'Study'),{maxChars:50,offset:10}) deep-equals the BOOKS version.
(3) toBook('p','L',undefined,[{id:'d',name:'D',pages:[{id:'g',name:'G',text:{content:'<p>a</p>'}},{id:'h',name:'H',text:null}]}]) deep-equals {id:'p',label:'L',edition:undefined,docs:[{id:'d',name:'D',pages:[{id:'g',name:'G',html:'<p>a</p>',text:'a'},{id:'h',name:'H',html:'',text:''}]}]}; note the adapter passes `pages` as an iterable collection, so toBook must iterate with for-of, not .length.
(4) Adapter cache test: pentaryn-lookup.mjs calls Hooks.once at top level, so set globalThis.Hooks={once:(n,f)=>{ready=f}} and globalThis.game={packs:{get:id=>({metadata:{label:id},getDocuments:async()=>{calls++;return [{id:'d',name:'D',pages:[{id:'g',name:'Cover',text:{content:'half cover'}}]}]}})}} before dynamic import; call ready(); run game.pentaryn.rules.search('cover') twice; assert identical results and calls equals the number of packs in BOOKSETS.rules (not a hard-coded 3; read it).

**Risk.** Stale cache if pack content changes in-session (packs are locked, module update needs a restart); clearBookCache() covers it. Memory roughly doubles for the text copy. Tests (1)-(3) prove output equality; (4) proves the cache is hit.

**Related:** prompts-lookup-6

## Maintainability gains

### prompts-lookup-6 — Move monsters() query parsing, filtering and sorting (plus crNum, SIZE_KEYS) into lookup-core with fixtures

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-lookup/pentaryn-lookup.mjs:268–301`

**Anchor:** `async function monsters(q = {}) {`

**Current.**

The adapter header says it is 'deliberately thin' but monsters() holds the CR range grammar ('1/2-2', minCr/maxCr), the size-word map (SIZE_KEYS, copy of prompts patch.mjs SIZE_WORDS), crNum (copy of replace.mjs crNumber), filters, dedupe-by-name, limit clamp (default 40, max 200) and the sort `(a.cr - b.cr) || a.name.localeCompare(b.name)`. None is tested. For an entry with undefined CR the first term is NaN (falsy), so ordering falls to name; that quirk must be kept.

**Proposed.**

Move into lookup-core.mjs: SIZE_KEYS, crNum, `monsterQuery(q)` returning {size,type,lo,hi,name,limit,packIds}, `matchMonster(entry,query)` (the type==='npc' check, size, type, lo/hi, name substring), `sortMonsters(rows)` (identical comparator), `pageMonsters(rows,limit)` returning {count,shown,monsters,hint?}. monsters() keeps only the pack/getIndex loop and the dedupe Set. Treat names() grouping and spellList dedupe as a separate follow-up with their own fixtures.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-lookup/test/run.mjs; first paste the current inline code into the test as a reference implementation and assert new==reference over the table:
- monsterQuery({cr:'1/2-2'}) gives lo 0.5, hi 2; {cr:3} gives lo=hi=3; {cr:'1/4',minCr:1} gives lo 1 and hi 0.25.
- {size:'Large'}.size === 'lg'; {size:'weird'}.size === 'weird'.
- {limit:999}.limit === 200; {}.limit === 40; {limit:0}.limit === 40.
- matchMonster with entry {type:'npc',name:'Goblin Boss',system:{details:{cr:1,type:{value:'fey'}},traits:{size:'sm'}}}: query {type:'FEY'} true, {size:'med'} false, {name:'boss'} true; entry type 'character' false.
- sortMonsters([{name:'B',cr:1},{name:'A',cr:1},{name:'C',cr:0.25}]) names in order C,A,B.
- pageMonsters of 45 rows with limit 40: shown 40 and hint includes '5 more'.

**Risk.** Pure moves; the reference-implementation test fails on any comparator or regex difference. Do not 'fix' the NaN ordering.

**Related:** prompts-lookup-9, prompts-lookup-1

## Logging / auditability gains

### prompts-lookup-34 — Lookup turns five different failures into null or a generic error and leaves no trace

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-lookup/pentaryn-lookup.mjs:104, 130, 143, 155, 234`

**Anchor:** `    const doc = await fromUuid(raw).catch(() => null);`

**Current.**

- `page()` (104) and `withTables()` (130) turn a `fromUuid` rejection (a bad pack, a permission failure, an index error) into the same result as "no such document": `{error: "no document at …"}` / `{error: "not found"}`.
- `findSpell` (143) returns `null` in the same way.
- `listFor` (155) catches a dnd5e registry throw and returns `null`, the same value as "this class has no list", so `onList` then reports `onList: null`.
- `monster()` (around line 234) drops `enrichHTML` failures silently.

When `rules.page()` or `onList()` returns the empty answer, an LLM cannot tell a missing book from a broken lookup, and the console shows nothing. prompts-lookup-4 guards the registry reads but does not add a trace.

**Proposed.**

Keep every return value byte-identical. Add one debug-gated line per swallow through the kit's `log.swallow` (`lib/log.mjs`, gated by `CONFIG.debug["pentaryn-lookup"]`), e.g. `.catch(err => (log.debug("fromUuid-failed", { uuid: raw }, err), null))`. Do not add fields to the returned objects.

**Behaviour test recipe (write first, must pass before and after).**

New `test/glue.mjs` imported from `test/run.mjs`: stub `globalThis.Hooks = { once: (h, f) => (H[h] = f) }`, `game = { packs: new Map(), pentaryn: undefined }`, `CONFIG = { debug: {} }`, `fromUuid = async () => { throw new Error("boom"); }`. Dynamic-import `../pentaryn-lookup.mjs`, call `H.ready()` and use `game.pentaryn.rules`:
- `page("Compendium.x.y")` deep-equals `{error: "no document at Compendium.x.y"}` before and after.
- With `CONFIG.debug["pentaryn-lookup"] = true`, a `console.debug` spy is called once with a `pentaryn-lookup |` prefix (after only); with the flag off, zero calls.

**Risk.** Console only, and only when the debug flag is on.

**Related:** prompts-lookup-4, prompts-lookup-17

## Hardening

### prompts-lookup-4 — Guard the dnd5e spell-list registry reads the way listFor already is

**Category:** Hardening · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-lookup/pentaryn-lookup.mjs:166–175`

**Anchor:** `  const known = dnd5e.registry.spellLists.options?.map(o => o.value) ?? [];`

**Current.**

listFor (:153-156) wraps `dnd5e.registry.spellLists.forType` in try/catch. Two sibling reads are unguarded: onList (:166, computed even when the list exists) and spellList's not-found branch (:175). If dnd5e.registry or .spellLists moves in a dnd5e update both throw a TypeError instead of the documented 'no such list' answer.

**Proposed.**

Move both helpers into lookup-core with the registry injected: `knownLists(registry)` (try/catch, returns [] on error) and `listFor(registry,type,id)`; the adapter passes dnd5e.registry. Use knownLists at :166 and :175.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-lookup/test/run.mjs after the move:
- knownLists({spellLists:{options:[{value:'class:wizard'},{value:'class:cleric'}]}}) deep-equals ['class:wizard','class:cleric'].
- knownLists({spellLists:{}}) deep-equals [].
- knownLists(undefined) deep-equals [] (throws today).
- listFor({spellLists:{forType:(t,i)=>t==='class'&&i==='wizard'?'L':null}},'class','Wizard') === 'L' (pins lower-casing).
- listFor({},'class','x') === null.

**Risk.** Only the error path changes (TypeError becomes the documented not-found answer); valid registries return the same lists, pinned by the first and fourth assertions.

**Related:** prompts-lookup-6

### prompts-lookup-5 — page(uuid): extract the UUID path into a pure seam and flag a non-page document

**Category:** Hardening · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-lookup/pentaryn-lookup.mjs:106–113`

**Anchor:** `    const parent = doc.parent ?? doc;`

**Current.**

Any Compendium UUID is accepted. A JournalEntry/Actor/Item UUID gives parent = doc and page.html = doc.text?.content ?? '', so the caller gets text:'' with no error and cannot tell an empty page from a wrong kind of UUID.

**Proposed.**

1. Move the object construction at :106-113 into lookup-core as `foundFromDoc({documentName,id,name,html,pack,parent,packLabel,edition})` returning the same {book,doc,page}.
2. When documentName !== 'JournalEntryPage', add an additive `warning` key to the rendered result: '<uuid> is a <documentName>, not a JournalEntryPage - pass a page UUID from search()'. All other fields unchanged.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-lookup/test/run.mjs, characterisation first:
- f = foundFromDoc({documentName:'JournalEntryPage',id:'g',name:'Cover',html:'<p>Half cover</p>',pack:'p.c',parent:{id:'d',name:'Combat'},packLabel:'PHB'}); renderPage(f) deep-equals {book:'PHB',journal:'Combat',page:'Cover',uuid:'Compendium.p.c.JournalEntry.d.JournalEntryPage.g',text:'Half cover'} (no edition key when edition is undefined).
- documentName 'JournalEntry' with no parent: text === '', journal === page name, and (after change) warning present.
- page document: warning absent.

**Risk.** Additive key only; text, uuid and journal pinned for both kinds.

## LLM interface

### prompts-lookup-2 — Make game.pentaryn.rules self-describing: VERSION, describe(), module api, documented return shapes

**Category:** LLM interface · **Impact:** high · **Effort:** S

**Where:** `foundry/module/pentaryn-lookup/pentaryn-lookup.mjs:434–441`

**Anchor:** `  const api = { search, page, monster, monsters, names, packs, selftest, onList, spellList, toPlainText, LIMITS };`

**Current.**

The namespace `rules` does not match the module id `pentaryn-lookup`; the api has no version and no method manifest (lookup-core.mjs has no VERSION, module.json says 0.3.0). Return shapes differ by method: search returns an object {query,books,total,shown,hits,...} or {error}; monsters {count,shown,monsters,hint?}; page/monster {notFound}|{error}; onList onList:null plus hint. context/foundry/rules-lookup.md shows calls but never shapes, so LLMs treat results as arrays (the audit cites .slice-is-not-a-function failures in eval.jsonl; not re-verified in the snapshot).

**Proposed.**

Additive only. In lookup-core.mjs add `export const VERSION = "0.3.0"` and `export const DESCRIBE = {module:'pentaryn-lookup', namespace:'rules', methods:{search:{args:'query, {books, limit, snippet, regex}', returns:'{query, books, total, shown, hits:[{book,journal,page,uuid,matches,snippet,edition?}], note?, truncated?, warning?} | {error}'}, ...}}`, one entry per callable api key (LIMITS is data, list under `constants`). In publishAPI add `version: VERSION, describe: () => DESCRIBE` and also set `game.modules.get('pentaryn-lookup').api = api` inside the ready hook. Add a 'What comes back' table to context/foundry/rules-lookup.md with the line 'search() returns an object, iterate .hits'.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-lookup/test/run.mjs:
- VERSION equals JSON.parse(readFileSync('../module.json')).version (pattern exists at pentaryn-prompts test/eval2-fixes.mjs).
- Object.keys(DESCRIBE.methods).sort() deep-equals ['monster','monsters','names','onList','packs','page','search','selftest','spellList','toPlainText'].
- DESCRIBE.methods.search.returns includes 'hits:['.
- Existing searchBooks/findPage/monsterDigest fixtures stay green, proving no output changed.

**Risk.** New keys only. DESCRIBE can drift from the code; the key-set test fails when a method is added without an entry.

**Related:** prompts-lookup-3, prompts-lookup-26

### prompts-lookup-3 — Register GM-guarded CONFIG.queries for the read-only lookups so a typed MCP tool can replace eval-js

**Category:** LLM interface · **Impact:** high · **Effort:** M

**Where:** `foundry/module/pentaryn-lookup/pentaryn-lookup.mjs:443–446`

**Anchor:** `Hooks.once("ready", () => {`

**Current.**

The lookup is reachable only through eval-js, costing a ToolSearch plus a hand-written script per rules question. pentaryn-prompts already shows the pattern: guarded() at prompts.mjs:262 plus registerQueries at :271 and a typed fork tool (prompt-markers.ts).

**Proposed.**

Add an `init` hook in pentaryn-lookup.mjs registering CONFIG.queries['pentaryn-lookup.<action>'] for search, page, monster, monsters, names, onList, spellList, packs. Put the pure action-to-arguments table QUERY_ARGS in lookup-core.mjs (search: d=>[d.query,d], page: d=>[d.ref,d], monster: d=>[d.ref,d], monsters: d=>[d], names: d=>[d.kind,d], onList: d=>[d.spell,d.cls,{type:d.type}], spellList: d=>[d.cls,{type:d.type,level:d.level}], packs: d=>[]) - verify each against the real signature when writing. Put a guard(fn,getUser) in lookup-core (user injected) that refuses a non-GM ctx.user and a non-GM client with 'NOT_GM', copying prompts' guarded(). A fork tool modelled on prompt-markers.ts is a later, separate step.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-lookup/test/run.mjs:
- Object.keys(QUERY_ARGS).sort() deep-equals ['monster','monsters','names','onList','packs','page','search','spellList'].
- QUERY_ARGS.search({query:'cover',limit:3}) deep-equals ['cover',{query:'cover',limit:3}].
- QUERY_ARGS.onList({spell:'Fireball',cls:'wizard',type:'class'}) deep-equals ['Fireball','wizard',{type:'class'}].
- guard: with ctx.user {isGM:false,name:'P'} rejects with message starting 'NOT_GM'; GM user resolves to fn's value; client not GM rejects.

**Risk.** Additive; the api and existing calls are unchanged. Handlers run only on a GM client and are read-only. A wrong QUERY_ARGS mapping is caught by the table tests.

**Related:** prompts-lookup-2, prompts-lookup-12

## Documentation / skills

### prompts-lookup-26 — Fix lookup README drift (version, fixture count, adapter size) and add an 'Extending' recipe

**Category:** Documentation / skills · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-lookup/README.md:5–55`

**Anchor:** `status: shipped — 0.2.0`

**Current.**

README frontmatter says 'shipped — 0.2.0' (module.json is 0.3.0). The fixture count '41 fixtures' appears in README:55, context/foundry/rules-lookup.md:78 and scripts/foundry/ops/config.py:154 comments; the suite actually runs 43 (verified). README:53 says the adapter is 'deliberately ~60 lines' (it is 446). module.json compatibility.minimum is 13 while prompts says 14. No section says how to add a method.

**Proposed.**

Update version and adapter description (thin glue, logic in lookup-core). Replace hard-coded counts with 'run node test/run.mjs' in all three places. Add a Returns column to Options (same text as DESCRIBE, prompts-lookup-2). Add 'Extending': pure function in lookup-core with fixtures, thin adapter function, api key, DESCRIBE entry, QUERY_ARGS entry, README line, rules-lookup.md line, selftest check. The compatibility.minimum change is left to Joe.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-lookup/test/run.mjs doc guards: README contains `shipped — ${module.json version}`; README does not contain the regexp /\d+ fixtures/. Test-only, module code untouched.

**Risk.** None; docs and tests only.

**Related:** prompts-lookup-2

## Categories checked with no finding

- **Defragmentation:** checked `pentaryn-lookup.mjs` and `lookup-core.mjs` for repeated helpers. The only duplicates are cross-module and are filed under prompts: `SIZE_KEYS`/`crNum` against prompts' size words and CR parser (prompts-lookup-9), and HTML-to-text (prompts-lookup-28, pin, do not merge). The publish guard at `pentaryn-lookup.mjs:433` is absorbed by the kit (`lib/publish`, §1.1). Nothing lookup-internal.
- **Extendability:** checked how a new book or monster pack is added. `BOOKSETS` (line 20), `EDITIONS` (27) and `MONSTER_PACKS` (28) are data tables, so a new pack is one row; the missing written recipe is prompts-lookup-26 (Docs). Nothing found.
