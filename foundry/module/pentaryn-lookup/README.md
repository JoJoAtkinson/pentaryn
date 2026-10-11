---
created: 2026-08-22
last_modified: 2026-10-10
tags: ["foundry", "vtt", "module", "rules", "compendium"]
status: shipped — 0.3.0
---

# `pentaryn-lookup`

The books you own, searchable from one call.

```js
await game.pentaryn.rules.search("half cover")
await game.pentaryn.rules.page("Study")
await game.pentaryn.rules.monster("Adult Black Dragon")
await game.pentaryn.rules.packs()
await game.pentaryn.rules.selftest()
await game.pentaryn.rules.onList("Fireball", "cleric")     // class spell lists (dnd5e's registry)
await game.pentaryn.rules.spellList("wizard", {level: 3})
await game.pentaryn.rules.monster("Goblin Boss", {text: true})              // + feature text, enrichers resolved
await game.pentaryn.rules.monsters({size: "large", type: "construct", cr: "5-8"})
await game.pentaryn.rules.names()                                          // PHB names for a character spec
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
| `getIndex({fields:["pages.name"]})` | populated 2 of 47 PHB entries on v14.367; the rest came back `{}`. Still broken on v14.369, but intermittently: core `indexDocument` rewrites an entry with `getProperty(source, "pages.name")` (undefined through an array) every time a document enters the pack cache, so the same call returns 47/47 or 0/47 depending on who ran `getDocuments()` first. |
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
| `pentaryn-lookup.mjs` | **The adapter** — thin glue (the API wrappers, spell lists, monsters, selftest and publish; the logic stays in core). `game.packs.get()` → `getDocuments()` → plain data → core. If a Foundry bump breaks this module, this is the only file to re-verify. |

`node test/run.mjs` — no dependencies; it prints its own pass count. Fixtures are synthetic HTML built
to trip each trap, not real book text: the licensed content does not belong in this
repo, and prose that happens to be authentic proves less than prose designed to break
things.

## Foundry APIs this depends on

Verified live on **v14.367 / dnd5e 5.3.3**, 2026-08-22, and re-verified on **v14.369**, 2026-10-10. Checked against the
**dnd5e 6.0.6** source 2026-10-10 (0.1.1): the `dnd5e.rules`, `dnd5e.content24` and `dnd5e.actors24` pack ids and the
prepared `details.cr` / `attributes.ac.value` / `attributes.hp.max` paths are unchanged. Treat as a dated snapshot.

- `game.packs.get(id)` → `CompendiumCollection`; `.metadata.label`, `.documentName`
- `pack.getDocuments()` — **authoritative**; ~150 ms for the whole PHB
- `pack.getIndex()` → `Collection` (`.size`, `.find`)
- `doc.pages`, `actor.items` → `EmbeddedCollection` — iterate, `.size`, never `.length`
- `page.text.content` → HTML string
- `fromUuid(uuid)` → document
- `actor.system.details.cr`, `.attributes.ac.value` (`.flat` fallback), `.attributes.hp.max`
- `dnd5e.registry.spellLists.forType(type, identifier)` → `{uuids, has(spellOrUuid)}`; `.options` lists the known lists (dnd5e 6.0.6)
- `RollTable#results` → `{range, description, name}` (v14)
- `pack.getIndex({fields: ["system.details.cr", "system.traits.size", "system.details.type.value"]})` — actor index
  fields are reliable (504/504 MM entries filled, 2026-10-10; the unreliable case is journal `pages`)
- `foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {rollData, relativeTo})` resolves dnd5e's
  `[[lookup]]`, `[[/attack]]`, `[[/damage]]` (0.3.0)

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
monster(name, {text})                           // exact-then-substring across 4 actor packs; text: true adds
                                                //   features [{name, type, activation, recharge, text}] (TextEditor.enrichHTML
                                                //   with the item's roll data, then plain text), languages, speed
monsters({size, type, cr, minCr, maxCr, name, limit, packs}) // MM then 2024 SRD index, one per name, lowest CR first
names(kind)                                     // {classes, subclasses: {cls: […]}, species, backgrounds, feats: {origin, general, …}}
onList(spell, cls, {type})                      // spell name or uuid; type "class" (default) | "subclass"
spellList(cls, {type, level})                   // one entry per spell name, PHB first
```

`page()` appends the page's embedded roll tables as `tables: [{name, formula, uuid, rows}]`
(`@Embed[…RollTable…]` is otherwise dropped with the other enrichers); `{tables: false}` skips it.
The "Class Spell Lists" pages in the PHB are empty shells — the lists are only in
`dnd5e.registry.spellLists`, which `onList`/`spellList` read.

## Install

```
make foundry-lookup-sync
```

Then enable **Pentaryn Rules Lookup** in Manage Modules and reload. Confirm with
`await game.pentaryn.rules.selftest()`.

## selftest

Asserts the assumptions above against the live world: the packs exist, `"half cover"`
finds a Cover page, hits carry pasteable UUIDs, snippets are enricher-free,
`page("Study")` resolves, `monster("Goblin")` returns numeric cr/ac/hp, `onList` is true for
Fireball on the wizard list and false on the cleric's, `page("Artifacts")` carries its four roll
tables — and that
core's `CompendiumCollection#indexDocument` still projects index fields with
`getProperty`, which drops nested page fields, so if Foundry ever fixes it you find out
deliberately rather than by someone "optimizing" the adapter back into the bug.

The canary checks the mechanism, not a live index. Until 2026-10-10 it counted filled
entries from `getIndex({fields})`; on v14.369 that count flipped between 47/47 and 0/47
with the bug intact, depending on whether a `getDocuments()` had run first, so the
selftest read 9/10 on a healthy module.

Run it after every sync, and after every Saturday auto-update — an update is exactly
when a premium module restructures its journals or dnd5e moves a data path, and both
are otherwise silent until someone asks a rules question mid-session.
