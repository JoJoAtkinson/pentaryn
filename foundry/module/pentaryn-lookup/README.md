---
created: 2026-08-22
last_modified: 2026-08-22
tags: ["foundry", "vtt", "module", "rules", "compendium"]
status: shipped — 0.1.0
---

# `pentaryn-lookup`

The books you own, searchable from one call.

```js
await game.pentaryn.rules.search("half cover")
await game.pentaryn.rules.page("Study")
await game.pentaryn.rules.monster("Adult Black Dragon")
await game.pentaryn.rules.packs()
await game.pentaryn.rules.selftest()
```

Read-only. It never writes a document, opens a dialog, or touches the canvas.

## Why it exists

`mcp__foundry__search-compendium` matches entity **names** only — searching it for
"cover" across the rules journals returns zero results, because the pages live inside
journals named `Combat` and `Appendix C: Rules Glossary`. The working route is
`eval-js` against `page.text.content`, and that route has five traps that all fail
**silently**:

| Trap | What it does |
|---|---|
| `getIndex({fields:["pages.name"]})` | populated 2 of 47 PHB entries on v14.367; the rest came back `{}`. `pack.clear()` did not help. |
| `EmbeddedCollection` has no `.length` | `pages.length` → `undefined` → `NaN` when summed → `null` in the result, no error |
| enricher noise | 5,052 `@UUID[…]` across PHB/DMG/MM/SRD survive a naive tag-strip and eat ~80 chars of snippet each |
| transport truncation | `eval-js` silently truncates a large return |
| `globalThis.duplicate` | removed in v14 |

Every one of those was hit for real while writing the recipes this module replaces.
Retyping the script from memory each call reproduces them; a tested file does not.

## Architecture

Two files, and the split is the whole point.

| File | Role |
|---|---|
| `lookup-core.mjs` | **Pure.** No Foundry, no `game`, no DOM. HTML stripping, enricher normalization, snippet centring, per-page dedupe, UUID assembly, payload capping, the monster digest. Everything that can be wrong. |
| `pentaryn-lookup.mjs` | **The adapter**, deliberately ~60 lines. `game.packs.get()` → `getDocuments()` → plain data → core. If a Foundry bump breaks this module, this is the only file to re-verify. |

`node test/run.mjs` — 41 fixtures, no dependencies. Fixtures are synthetic HTML built
to trip each trap, not real book text: the licensed content does not belong in this
repo, and prose that happens to be authentic proves less than prose designed to break
things.

## Foundry APIs this depends on

Verified live on **v14.367 / dnd5e 5.3.3**, 2026-08-22. Treat as a dated snapshot.

- `game.packs.get(id)` → `CompendiumCollection`; `.metadata.label`, `.documentName`
- `pack.getDocuments()` — **authoritative**; ~150 ms for the whole PHB
- `pack.getIndex()` → `Collection` (`.size`, `.find`)
- `doc.pages`, `actor.items` → `EmbeddedCollection` — iterate, `.size`, never `.length`
- `page.text.content` → HTML string
- `fromUuid(uuid)` → document
- `actor.system.details.cr`, `.attributes.ac.value` (`.flat` fallback), `.attributes.hp.max`

## Defaults worth knowing

- **Books:** PHB + DMG + 2024 SRD. Monster Manual *text* is opt-in (`books: "monsters"`
  or `"all"`) — 1,236 pages of monster lore would swamp a rules query.
- **2014 SRD is never searched unless asked for** (`books: "2014"`), and its hits carry
  `edition: "2014"`. This table runs D&D 2024; quoting 2014 text at it is the quietest
  way to be wrong.
- **5 hits, ~240-char snippets, 8 KB payload ceiling.** `total` always reports every
  matching page, so a capped answer is visibly capped. Raise with `limit` (max 20) and
  `snippet` (max 600).
- **One hit per page**, with `matches: n` — a page saying "cover" nine times must not
  consume nine of five slots.
- **World journals are out of scope.** Campaign notes are the repo's job (`find_lore`)
  or `search-journals`. Mixing them into a *rules* search muddies the one thing this is
  for.

## Options

```js
search(query, {books, limit, snippet, regex})   // books: "rules"|"monsters"|"all"|"2014"|[ids]
page(refOrName, {raw, maxChars, offset, books}) // ref may be a Compendium UUID from search()
monster(name)                                   // exact-then-substring across 4 actor packs
```

## Install

```
make foundry-lookup-sync
```

Then enable **Pentaryn Rules Lookup** in Manage Modules and reload. Confirm with
`await game.pentaryn.rules.selftest()`.

## selftest

Asserts the assumptions above against the live world: the packs exist, `"half cover"`
finds a Cover page, hits carry pasteable UUIDs, snippets are enricher-free,
`page("Study")` resolves, `monster("Goblin")` returns numeric cr/ac/hp — and that
`getIndex({fields})` is *still* broken, so if Foundry ever fixes it you find out
deliberately rather than by someone "optimizing" the adapter back into the bug.

Run it after every sync, and after every Saturday auto-update — an update is exactly
when a premium module restructures its journals or dnd5e moves a data path, and both
are otherwise silent until someone asks a rules question mid-session.
