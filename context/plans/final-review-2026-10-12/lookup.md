---
title: "Final review 2026-10-12 — lookup"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of lookup found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — lookup

## Verdict

**NEEDS-JOE.** The kept changes are behaviour-preserving and the gate is green, but real defects are recorded: v14 RollTable rows lose their labels, failed pack reads escape as throws and abort `selftest()`, `page(<entry uuid>)` returns a uuid that does not resolve, labelled inline rolls leave `{label}` braces, and `monster()` matching contradicts the manifest.

## Scope

- Paths: `foundry/module/pentaryn-lookup/**` (module `pentaryn-lookup`) and this record.
- Base: `9d10880b` (origin/main when the review started).
- Branch: `review/lookup`, worktree `pentaryn-review-lookup-wt`.
- Triage: 40 findings, giving 10 DO (1 DO-EDGE, 9 DO-REFACTOR), 21 RECORD (3 of them deferred by the cap) and 9 DROP (8 duplicates merged: perf-1, EXT-1, R7, R2, lookup-edge-4, perf-4, perf-2, perf-3; plus LKM-9, not worth a commit).

## Findings by lens

Line numbers are approximate at the review HEAD.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| R1 | books.mjs (search/page/monster/monsters/onList/spellList) | low | DO-EDGE, reverted | Null `opts` throws a TypeError instead of answering like omitted opts |
| LKM-6 | lookup-core.mjs (BOOKSETS) | low | DO-REFACTOR, kept | `BOOKSETS.all` was a hand-maintained copy of rules + monsters |
| LKM-1 | lookup-core.mjs (searchBooks) | low | DO-REFACTOR, kept | Per-page `new RegExp` rebuild and dead `lastIndex` resets |
| EXT-2 | lookup-core.mjs, books.mjs (monsters) | low | DO-REFACTOR, kept | monsters() index fields were an inline literal far from matchMonster |
| LKM-4 | packs-adapter.mjs:97 | low | DO-REFACTOR, kept | findSpell comment omitted the 2014 SRD pack |
| LKM-5 | lookup-core.mjs:10 | low | DO-REFACTOR, kept | Core header miscounted the README's silent traps |
| LKM-10 | README.md:81 | low | DO-REFACTOR, kept | README monster payload did not name `ref` as an alias of `name` |
| LKM-8 | lookup-core.mjs (renderPage) | low | DO-REFACTOR, kept | Magic 40000 maxChars ceiling |
| LKM-3 | lookup-core.mjs, packs-adapter.mjs:156 | low | DO-REFACTOR, kept | featureTexts row rules lived in the adapter, untested |
| LKM-2 | lookup-core.mjs, books.mjs, packs-adapter.mjs | low | DO-REFACTOR, kept | Exact-then-substring name matching duplicated |
| lookup-edge-1 | lookup-core.mjs:350 | medium | RECORD (defect) | v14 document-type table results print only their range |
| R4 | packs-adapter.mjs:7,68 | medium | RECORD (defect) | Rejected pack reads escape instead of "nothing there" and abort selftest |
| LKM-11 | lookup-core.mjs:314 | medium | RECORD (defect) | page(<non-page uuid>) returns a fabricated, unresolvable page uuid |
| lookup-edge-2 | lookup-core.mjs:82 | low | RECORD (defect) | Labelled inline rolls leave `{label}` braces in text |
| R6 | books.mjs:120 | low | RECORD (defect) | monster() substring hit in an earlier pack beats an exact hit in a later one |
| lookup-edge-3 | books.mjs:96 | low | RECORD | onList on a uuid of a system-less document throws |
| R3 | packs-adapter.mjs:94 | low | RECORD | readTable throws on a non-table `.RollTable.` uuid despite "or null" |
| R5 | lookup-core.mjs:50 | low | RECORD | String `packs` / pack-id `books` are silently misread |
| LKM-12 | books.mjs:85 | low | RECORD | onList reads known() on every call |
| LKM-13 | pentaryn-lookup.mjs:64 | low | RECORD | Ready console line lists 5 of the 8 lookups |
| EXT-3 | books.mjs:180 | low | RECORD | packs() omits SPELL_PACKS and NAME_SOURCES packs |
| EXT-5 | lookup-core.mjs:39 | low | RECORD | EDITIONS stamps only dnd5e.rules |
| lookup-edge-5 | lookup-core.mjs (monsterQuery cr) | low | RECORD | Unparseable CR filter silently ignored |
| lookup-edge-6 | books.mjs:40 | low | RECORD | `books: []` gives a misleading "not found:  —" error |
| lookup-edge-7 | books.mjs:160 | low | RECORD | monsters() dedupes after filtering |
| lookup-async-1 | packs-adapter.mjs:65 | low | RECORD | Independent reads awaited serially |
| lookup-async-2 | lookup-core.mjs:240 | low | RECORD | Synchronous whole-book scan, caller regex can backtrack |
| perf-5 | books.mjs:157 | low | RECORD (info) | No hot hooks; getIndex served from cache |
| EXT-4 | api-manifest.mjs:18 | low | RECORD (cap) | describe() prose repeats pack tables untested |
| EXT-6 | lookup-core.mjs:512 | low | RECORD (cap) | Preferred spell pack set twice |
| LKM-7 | books.mjs:180 | low | RECORD (cap) | `known` / `listFor` shadow and alias each other |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 7d3294d6 | LKM-6: `BOOKSETS.all` derived as `[...RULES_BOOKS, ...MONSTER_BOOKS]`; rules identity kept | `test/core-seams.test.mjs`: "BOOKSETS.all is rules then monsters, in order (EXT-1)" (passes on old and new source) |
| 13b224de | LKM-1: searchBooks searches with the compiled `gi` regex; dead `lastIndex` resets dropped | Existing suite (core.test search cases, core-seams "precomputed text equals", legacy-api golden "search a.b regex") |
| 170ae062 | EXT-2: `MONSTER_INDEX_FIELDS` beside matchMonster; README Extending names it | `test/books-reads.test.mjs`: "books monsters(): getIndex per present MONSTER_LIST_PACKS pack, with exactly the five index fields in order" |
| b739fcda | LKM-4: findSpell comment names the SPELL_PACKS order (comment only) | n/a (comment only) |
| d25e48f3 | LKM-5: core header counts four silent traps of the README's five (comment only) | n/a (comment only) |
| 8811bc5e | LKM-10: README monster payload `{ name (or ref), text }` (docs only) | n/a (docs only) |
| 12a0aaf1 | LKM-8: module-local `PAGE_CHARS_MAX = 40000`; `rules.LIMITS` unchanged | `test/core.test.mjs`: "renderPage caps maxChars at 40000" |
| e63fdd27 | LKM-3: `featureRow` in core, used by the adapter's featureTexts | `test/core.test.mjs`: "featureRow: activation, recharge and text rules"; legacy-api golden "monster Goblin Boss text" |
| bb2335c6 | LKM-2: `pickByName` in core, used by monster() and findSpell | `test/core.test.mjs`: "pickByName: exact beats an earlier substring, case-insensitive, substring off, miss" |

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| b01c8309 | 42b24e6e | A failure-path change, not a DO-EDGE fix: 15 call shapes that threw a TypeError on null opts now answer. The README's "never a throw" covers a miss, not a malformed argument; the module's own migration record classes "a TypeError becomes the documented answer" as a declared change; and `monsters({packs: 5})` still throws, so the scope of "never a throw" is Joe's call. No caller passes null. |

## Recorded for Joe

- **defect** `lookup-core.mjs:350`: renderTable reads `r.description ?? r.text ?? r.name`, but on v14 a document-type result's description is `''`, so the row prints only its range. Use `r.description || r.name || r.text || ""`, and optionally drop `text: r.text` from readTable (packs-adapter.mjs:94) to stop the v13 deprecation warning. The legacy-api golden "page Artifacts" row moves from `21` to `21 A single row`.
- **defect** `packs-adapter.mjs:7`: the header promises a failed read is "nothing there" plus a trace, but rejected getDocuments/getIndex/getDocument calls escape from loadBooks, readIndex, findSpell, readDocument and packSummary (around :68), rejecting every lookup and aborting `selftest()` before it reports. Choose: catch per pack with a distinct skipped message, wrap each selftest check, or narrow the header to fromUuid reads.
- **defect** `lookup-core.mjs:314`: `page(<JournalEntry/Actor/Item uuid>)` answers a `uuid` built from the entry id as a page id, which does not resolve. Echo the caller's uuid when documentName is not JournalEntryPage; golden/legacy-api.json:248 changes.
- **defect** `lookup-core.mjs:82`: toPlainText turns `[[/r 4d6kh3]]{4d6}` into `r 4d6kh3{4d6}`, contrary to the manifest's "enrichers reduced to their labels". Add a labelled-inline-roll rule before the bare one, and decide whether losing the formula is acceptable.
- **defect** `books.mjs:120`: monster() matches exact-then-substring per pack, so an MM substring hit ("Goblin Boss") beats an exact SRD hit ("Goblin"), contrary to the manifest's "exact, then substring, across …". Either do an exact pass over all packs first, or reword the (golden-pinned) describe prose.
- `books.mjs` (reverted b01c8309): decide whether null `opts` should answer like omitted opts across search/page/monster/monsters/onList/spellList; if yes, land it as a declared change, and decide about `monsters({packs: 5})` at the same time.
- `books.mjs:96`: `onList(<uuid of a document with no system>, cls)` throws reading `doc.system.level`. Preferred: return `{ notFound: true, spell, hint }` when `!doc?.system`.
- `packs-adapter.mjs:94`: readTable throws when an embedded `.RollTable.` uuid resolves to a non-table, rejecting the whole page(). Add `if (!t?.results?.contents) return null;`.
- `lookup-core.mjs:50`: `monsters({packs:'<id>'})` iterates characters and returns 0; `books:'<pack id>'` falls back to the rules set. Wrap a string as `[s]` and/or warn.
- `books.mjs:85`: onList reads `known()` on every call but needs it only for an unknown list; moving it changes the debug trace when options throws.
- `pentaryn-lookup.mjs:64`: the ready console line lists 5 of the 8 lookups; list all or point to describe(), updating glue.test's expected line.
- `books.mjs:180`: packs() omits SPELL_PACKS and NAME_SOURCES packs that onList/spellList/names depend on; derive one KNOWN_PACKS list (golden "packs()" changes).
- `lookup-core.mjs:39`: EDITIONS stamps only `dnd5e.rules`; add `'dnd5e.spells': '2014'` and stamp edition on onList/spellList answers.
- `lookup-core.mjs` (monsterQuery CR parse): `cr:'5–8'` (en-dash), `'5 to 8'`, `'CR 5'` are silently ignored; accept dash variants and/or add a hint.
- `books.mjs:40`: `books: []` answers "compendium pack(s) not found:  — …" and `monsters({packs:[]})` returns 0 silently; treat `[]` as absent or give a distinct error.
- `books.mjs:160`: monsters() dedupes after filtering, so an SRD copy can appear when the MM copy failed the filter; mark names seen regardless of match if MM-wins should hold under filters.
- `packs-adapter.mjs:65`: independent reads (loadBooks, withTables, spellList, names, packs, featureTexts) are awaited serially; start them together and await in order if cold-call latency matters (changes timing and trace order).
- `lookup-core.mjs:240`: toBook/searchBooks scan every page synchronously and a caller regex can backtrack catastrophically; measure a cold `search('cover',{books:'all'})` live before adding yields or a regex guard.
- `books.mjs:157` (info): no hot hooks; repeated getIndex({fields}) calls are cached by Foundry. No action; recorded so later reviews do not re-flag these loops.
- `api-manifest.mjs:18` (cap): describe() prose repeats BOOKSETS/MONSTER_PACKS/MONSTER_LIST_PACKS by hand; add a guard test in api-kit.test.mjs.
- `lookup-core.mjs:512` (cap): the preferred spell pack is set by both OWNED_SPELL_PREFIX and SPELL_PACKS order; add a cross-link comment and a core-seams assert that `SPELL_PACKS[0]` starts with the prefix.
- `books.mjs:180` (cap): rename `known`/`listFor` helpers (knownSpellLists/spellListFor), rename the packs() local to `ids`, drop the listForIn alias.

## Verification

- 7d3294d6: keep
- 13b224de: keep
- 170ae062: keep
- b739fcda: keep
- d25e48f3: keep
- 8811bc5e: keep
- 12a0aaf1: keep
- e63fdd27: keep
- bb2335c6: keep
- b01c8309: revert (42b24e6e)

## Gates

- `node test/run.mjs` in `foundry/module/pentaryn-lookup`: tests 140, pass 140, fail 0.
- Vendored kit identical to `foundry/lib` (9 files); blueprint conformance 100.0 % (45/45 fail-class rules).
- `git diff --quiet origin/main -- '**/golden/**'`: clean. Goldens byte-identical: yes.
- `make check-context`: pass with this record in place.
