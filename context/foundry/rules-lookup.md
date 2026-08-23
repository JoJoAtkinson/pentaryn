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

### One known page, by name (cheaper — index only)

```js
const pack = game.packs.get("dnd-players-handbook.content");
const index = await pack.getIndex({ fields: ["pages.name"] });
for (const entry of index) {
  const p = (entry.pages || []).find(pg => pg.name === "Study");
  if (!p) continue;
  const doc = await pack.getDocument(entry._id);
  const html = doc.pages.get(p._id).text?.content ?? "";
  return html.replace(/<[^>]+>/g, " ").replace(/&\w+;/g, " ").replace(/\s+/g, " ").trim();
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

For placing one on the canvas, prefer the real tools —
`create-actor-from-compendium`, `place-tokens` — over `eval-js`.

## Notes that will bite

* **Strip the HTML.** `page.text.content` is Foundry-flavoured HTML. It also carries
  enrichers like `&Reference[Half Cover]` and `[[/save dex 15]]`; the regex above
  flattens them to plain words, which is usually what you want for reading but loses
  the link targets.
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

## When the Open5e MCP is still the right call

`mcp__dnd-scripts__search_*` is no longer the default, but it is not dead:

* **Third-party content Foundry doesn't have** — Tome of Beasts (`tob`), Level Up
  Advanced 5e (`a5e-ag`), and other Open5e sources.
* **Foundry is closed** and the question is not worth starting it for.
* **Edition comparison** — `search_spells(source='srd-2014,srd-2024', dedupe=false)`
  answers "what changed" in one call.

For everything else — the rule, the spell, the monster you are actually going to
run — the books above are the source of record.
