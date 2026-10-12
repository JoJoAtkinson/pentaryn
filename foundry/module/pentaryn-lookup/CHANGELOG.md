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
