# Changelog — Pentaryn Rules Lookup (`pentaryn-lookup`)

## Unreleased — blueprint migration (2026-10-11)

- Rebuilt in the addon blueprint layout: pure `lookup-core.mjs`, `packs-adapter.mjs` (every
  Foundry read), the `books.mjs` feature, `api-manifest.mjs` + `api.mjs`, kit 1.0.2 in `lib/`.
- The API is kit-built and frozen; `rules.LIMITS` is a frozen copy. New: `describe()`, `version`,
  `contract`, `settings()`, `trace()`, `uninstall()`, `game.modules.get("pentaryn-lookup").api`,
  and the `pentaryn-lookup.ready` / `pentaryn.ready` hooks.
- GM-guarded queries `pentaryn-lookup.{search,page,monster,monsters,names,onList,spellList,packs}`.
- Book packs are loaded once per session, with each page's plain text; the second search is
  near-instant. `uninstall()` clears the cache.
- `onList` / `spellList` answer "no such list" instead of throwing when dnd5e's registry moves.
- `page(<uuid>)` of a non-page document (a JournalEntry) adds a `warning`.
- `names("constructor")` (any `Object.prototype` word) is an unknown kind and answers everything,
  not a junk one-key object.
- Failed reads are traced at debug level (`CONFIG.debug["pentaryn-lookup"] = true`).
- The node test suite runs on `node:test` (`node test/run.mjs`).
- [declared] An embedded roll table's row whose result is a linked document (v14: `description`
  empty, the label in `name`) prints its label after the range, not the bare range ("21" → "21 A
  single row"); tables no longer read `TableResult#text`, so v13's deprecation warning is gone
  (lookup-edge-1).
- [declared] A pack read that rejects (a book load, an index, a document, a pack summary) answers
  as if the pack were absent instead of throwing: `search`/`page` list it under "skipped missing
  pack(s)", the rest answer null/not found, and a debug trace names the pack. `selftest()` records a
  throwing check as `{label, ok: false, detail: <message>}` and runs the rest (R4).
- [declared] `page(<uuid>)` of a document that is not a page (a JournalEntry, Actor, Item) answers
  the caller's uuid verbatim as `uuid`, not a fabricated `…JournalEntry.<id>.JournalEntryPage.<id>`
  that resolves to nothing; page uuids are unchanged (LKM-11).
- [declared] A labelled inline roll reduces to its label like `@UUID[...]{Label}` does —
  `[[/r 4d6kh3]]{ability scores}` reads "ability scores", not "r 4d6kh3{ability scores}" — and a
  bare roll command loses its `/r ` (`[[/r 4d6kh3]]` reads "4d6kh3"); `[[/save dex 15]]` still
  reads "save dex 15" (lookup-edge-2).
- [declared] `monster(name)` looks for an exact (case-insensitive) name in every monster pack, in
  pack order, before any substring match — `monster("Guardian")` answers the 2024 SRD's Guardian,
  not the Monster Manual's Shield Guardian — as `describe()` already said (R6).
- [declared] `search`, `page`, `monster`, `monsters`, `onList` and `spellList` called with `null`
  options answer exactly as with the options omitted, instead of throwing a TypeError (R1).
- [declared] `onList(<uuid>)` of a document that is not a spell Item (a JournalEntry, an Actor)
  answers `{ notFound, spell, hint: "<uuid> is a <documentName>, not a spell Item" }` instead of
  throwing a TypeError on `system.level` or answering a level-less spell (lookup-edge-3).
- [declared] A page's embedded `@Embed[….RollTable.…]` whose uuid resolves to something that is not
  a roll table lists that table as `{ uuid, error: "not found" }` and the rest of the page still
  answers, instead of `page()` throwing a TypeError on `results.contents` (R3).
- [declared] `monsters({ packs: "<pack id>" })` lists that one pack instead of answering 0 (it
  iterated the id's characters); a `packs` that is neither a string nor an array answers the default
  packs with `warning: "packs ignored: expected a pack id or an array"`. `search`/`page` take a
  single pack id as `books` (any string with a dot) instead of falling back to the rules set; an
  unknown word still answers the rules set, now with a `books ignored: …` warning (R5).
- [declared] `onList` reads the registry's list options only when the list is unknown (they feed
  the `no such list; known: …` hint); a found list no longer reads them, so a throwing `options`
  leaves no debug trace there. An unknown list traces the list read, then the options read (LKM-12).
- [declared] The ready console line counts every lookup and points at `describe()` — "8 lookups
  (describe() lists them), selftest()" — instead of naming 5 of the 8 (LKM-13).
- [declared] `packs()` also lists the spell packs `onList`/`spellList` read and the PHB class,
  origin and feat packs `names()` reads, after the book, 2014 and monster packs (EXT-3).

## 0.3.0 — 2026-10-10

- `monster(name, { text: true })`: each feature's rules text with dnd5e enrichers resolved,
  plus languages and speed.
- `monsters({ size, type, cr, … })`, `names(kind)`, and `page()`'s embedded roll tables.
- `onList` / `spellList` over dnd5e's spell-list registry.

## 0.1.1 — 2026-10-10

- Re-verified on dnd5e 6.0.6 and Foundry v14.369; the selftest canary checks `indexDocument`'s
  mechanism instead of counting a live index.

## 0.1.0 — 2026-08-22

- First release: `search`, `page`, `monster`, `packs`, `selftest` over the owned books.
