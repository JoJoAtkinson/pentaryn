---
title: "Rules and monster lookup — the owned books, live"
status: active
last_modified: 2026-08-22
tags: [context, foundry, rules, monsters, compendium, srd]
---

# Rules and monster lookup — the owned books, live

**Read this when:** you need a rule, a spell, a feat, an item or a monster — any D&D
reference question at all.
**Not this file:** campaign lore → [`../world/README.md`](../world/README.md) · building
NPC action rows → [`../tools.md`](../tools.md)

> **The default is the licensed books in Foundry, not the Open5e API.** Joe owns the
> 2024 Player's Handbook, Dungeon Master's Guide and Monster Manual as Foundry modules.
> That is the actual book text, not a paraphrase or an SRD subset. Reach for
> `mcp__dnd-scripts__search_*` only for the cases listed at the bottom.

---

## What's installed

| Pack | Holds | Size |
|---|---|---|
| `dnd-players-handbook.content` | PHB rules text | 47 journals, 625 pages, 0.59 MB |
| `dnd-dungeon-masters-guide.content` | DMG rules text | 46 journals, 473 pages |
| `dnd-monster-manual.content` | MM text | 8 journals, 1,236 pages |
| `dnd5e.content24` | 2024 SRD rules | 53 journals, 1,014 pages |
| `dnd5e.rules` | 2014 SRD rules | 20 journals, 407 pages |
| `dnd-monster-manual.actors` | MM stat blocks | **504 actors** |
| `dnd5e.actors24` | 2024 SRD stat blocks | 441 actors |
| `dnd-players-handbook.actors` | PHB actors | 146 |
| `dnd-dungeon-masters-guide.actors` | DMG actors | 72 |

Also `dnd-players-handbook.{classes,origins,feats,spells,equipment,tables}` as Item and
RollTable packs.

## How to query it

**Foundry must be running with a world active.** Use `mcp__foundry__eval-js`.

### Preferred: the `pentaryn-lookup` module

```js
await game.pentaryn.rules.search("half cover")          // 5 hits, clean snippets, UUIDs
await game.pentaryn.rules.page("Study")                 // or a Compendium UUID from search()
await game.pentaryn.rules.monster("Adult Black Dragon") // shallow digest + uuid
await game.pentaryn.rules.packs()                       // what's installed
await game.pentaryn.rules.selftest()                    // assert the assumptions still hold
```

One line instead of twenty, and the five silent traps below are handled in one tested
file (41 fixtures, `node test/run.mjs`). See
[`../../foundry/module/pentaryn-lookup/README.md`](../../foundry/module/pentaryn-lookup/README.md).
Defaults: PHB + DMG + 2024 SRD; Monster Manual text and 2014 SRD are opt-in via
`{books: "monsters" | "all" | "2014"}`, and 2014 hits are stamped `edition: "2014"`.

The raw recipes below still work and are what the module does internally — reach for
them when the module is not installed, or when you need a shape it does not cover.

⚠ **The raw recipes do NOT strip enrichers.** Their snippets will carry
`@UUID[Compendium....]{Label}` noise; the module's do not.

### ⚠ `search-compendium` cannot do this

`mcp__foundry__search-compendium` matches **entity names only** — its own description
says so, and it is easy to mistake for a rules search. Searching it for `"cover"`
across the JournalEntry packs returns **zero results**, because the entries are named
`Combat`, `Appendix C: Rules Glossary` and so on. It is fine for "find the actor called
Goblin"; it is useless for "what do the rules say about X". Use `eval-js`.

### Full-text search across the books

Measured at **411 ms** across PHB + DMG + 2024 SRD. Fast enough to just do.

```js
const QUERY = "half cover";
const BOOKS = ["dnd-players-handbook.content", "dnd-dungeon-masters-guide.content",
               "dnd5e.content24"];
const re = new RegExp(QUERY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const hits = [];
for (const id of BOOKS) {
  const pack = game.packs.get(id);
  if (!pack) continue;
  for (const doc of await pack.getDocuments()) {
    for (const pg of doc.pages) {
      const html = pg.text?.content ?? "";
      if (!re.test(html)) continue;
      const plain = html.replace(/<[^>]+>/g, " ").replace(/&\w+;/g, " ")
                        .replace(/\s+/g, " ").trim();
      const i = plain.search(re);
      hits.push({ book: pack.metadata.label, journal: doc.name, page: pg.name,
        uuid: `Compendium.${id}.JournalEntry.${doc.id}.JournalEntryPage.${pg.id}`,
        snippet: plain.slice(Math.max(0, i - 120), i + 260) });
    }
  }
}
return { hitCount: hits.length, hits: hits.slice(0, 6) };
```

### One known page, by name

⚠ **Do not use `getIndex({fields: ["pages.name"]})` for this.** It does not reliably
populate `pages`: measured on v14.367, **2 of 47** entries came back with an array and
the other 45 with an empty object `{}`, even after `pack.clear()`. Because `{}` is
truthy, `(entry.pages || []).find(...)` throws or silently misses depending on
iteration order — it worked once here and then stopped. `getDocuments()` is the source
of truth, costs ~150 ms for the whole PHB, and is what the search recipe above already
uses.

```js
const pack = game.packs.get("dnd-players-handbook.content");
for (const doc of await pack.getDocuments()) {
  const page = doc.pages.find(p => p.name === "Study");
  if (!page) continue;
  const html = page.text?.content ?? "";
  return { journal: doc.name,
           uuid: `Compendium.${pack.collection}.JournalEntry.${doc.id}.JournalEntryPage.${page.id}`,
           text: html.replace(/<[^>]+>/g, " ").replace(/&\w+;/g, " ").replace(/\s+/g, " ").trim() };
}
```

### A monster stat block

```js
const mm = game.packs.get("dnd-monster-manual.actors");
const idx = await mm.getIndex();
const hit = idx.find(e => /^Adult Black Dragon$/i.test(e.name));
const a = await mm.getDocument(hit._id);
return { name: a.name, cr: a.system.details.cr, ac: a.system.attributes.ac.value,
         hp: a.system.attributes.hp.max,
         features: a.items.map(i => ({ name: i.name, type: i.type })) };
```

For placing one on the canvas, prefer the real tools — `create-actor-from-compendium` —
over `eval-js`. (`place-tokens` was retired from the fork 2026-08-23; the fork surface is
deliberately eval-js only until the September log review — see
[`../plans/mcp-skill-library.md`](../plans/mcp-skill-library.md).)

## Notes that will bite

* **Strip the enrichers, not just the tags.** `page.text.content` is Foundry-flavoured
  HTML *plus* enrichers, and a `replace(/<[^>]+>/g, " ")` leaves every enricher intact.
  Measured 2026-08-22: **5,052 `@UUID[…]`** across the four books (PHB 1,355 · DMG
  1,218 · MM 1,384 · content24 1,095) and 312 inline rolls. One surviving `@UUID` eats
  ~80 characters of a 240-character snippet. The real forms are `@UUID[…]{Label}`
  (keep the label), bare `@UUID[…]` (drop it), `&amp;Reference[…]` — note the ampersand
  arrives HTML-escaped — and `[[/save dex 15]]`. `lookup-core.mjs` handles all of them;
  an unknown enricher degrades to its bracketed text rather than vanishing, because
  losing a rule's words is worse than leaving a stray token in them.
* **Return a UUID with every hit.** `Compendium.<pack>.JournalEntry.<id>.JournalEntryPage.<id>`
  is pasteable into Foundry chat and into journal entries, so a rules answer can be
  handed to the table rather than retyped.
* **2024 vs 2014.** `dnd5e.rules` is the *old* SRD. This world runs D&D 2024, so prefer
  the PHB/DMG packs and `dnd5e.content24`. Quoting 2014 text at a 2024 table is the
  most likely way to be quietly wrong.
* **`eval-js` needs a world active.** With Foundry stopped, or parked at `/setup`,
  there are no `game.packs`. Check with `python -m scripts.foundry.ops status`.
* **The packs are LevelDB and are locked while Foundry runs.** `fvtt package unpack`
  fails with `LEVEL_ITERATOR_NOT_OPEN` unless Foundry is stopped. There is no reason to
  extract for normal use — the live query is faster than the extraction — but that is
  the route if you ever need rules with Foundry closed.

## Verified API notes — v14.367 / dnd5e 5.3.3

Probed live on 2026-08-22, because training-era knowledge of Foundry is mostly v10–v13
and this world is newer. Everything here was checked, not assumed.

| Thing | Reality |
|---|---|
| `game.version` / `game.system` | `14.367` / `dnd5e 5.3.3` |
| `globalThis.duplicate(...)` | **GONE.** Use `foundry.utils.duplicate`. |
| `JournalEntry`, `Actor` globals | still present; `foundry.documents.*` also works |
| `game.packs.get(id)` | `CompendiumCollection` |
| `pack.getIndex()` | a `Collection` — iterable, has `.size` |
| `pack.getIndex({fields})` | **unreliable for nested fields** (see above) |
| index entry keys | `_id, uuid, name, sort, folder, pages, img` |
| `pack.getDocuments()` | authoritative; whole PHB ≈ 150 ms |
| `doc.pages`, `actor.items` | `EmbeddedCollection` — `.size`, `.find`, `.get`. **No `.length`** |
| `actor.system.details.cr` | number (e.g. `3`) |
| `actor.system.attributes.ac.value` | number (e.g. `17`); `.flat` is `null` |
| `fromUuid` | global function |

**The `.length` trap.** `EmbeddedCollection` and the index's `pages` object have no
`.length`, so `x.pages.length` is `undefined`, `sum += undefined` is `NaN`, and `NaN`
serializes to `null` in the tool result. It does not throw — you just get a `null` in
a report and may not notice. Use `.size`, or count from `getDocuments()`.

**Cheapest way to be right:** when unsure of a data path, probe it in the same call
you act in — build a small `{label, value}` list and return it alongside the result,
rather than spending a round-trip on a separate "check" call. That is most of what the
59% read/inspect share of the eval log actually is.

## When the Open5e MCP is still the right call

`mcp__dnd-scripts__search_*` is no longer the default, but it is not dead:

* **Third-party content Foundry doesn't have** — Tome of Beasts (`tob`), Level Up
  Advanced 5e (`a5e-ag`), and other Open5e sources.
* **Foundry is closed** and the question is not worth starting it for.
* **Edition comparison** — `search_spells(source='srd-2014,srd-2024', dedupe=false)`
  answers "what changed" in one call.

For everything else — the rule, the spell, the monster you are actually going to
run — the books above are the source of record.
