---
created: 2026-08-24
last_modified: 2026-08-24
status: active
tags: [world, threads, moc, conventions]
aliases: [Threads]
---

# Threads

A **thread** is a subject that runs through the world without living anywhere in it — a
theme, a rumour, a war, a continent no map shows, a campaign arc. It touches half a dozen
factions and belongs to none of them, so there is no faction folder to file it in and no
honest way to pick one.

The vault's rule is that every document has exactly one physical home, in the least-bad
folder for it. A thread is what happens when there is no least-bad folder. It gets a
**note**, not a folder — one note per thread, here — and the documents it touches stay
exactly where they are.

## What a thread note is

One markdown file, `world/threads/<topic-slug>.md`, holding three things:

1. **Prose.** What the thread is, what is known, what is unresolved. This is the part no
   query can generate, and the reason the note exists at all rather than just a saved
   search.
2. **Curated wikilinks.** The handful of documents that matter most, in the order a reader
   should meet them, with `|display text` so the prose still reads as prose.
3. **A query, optionally**, as a companion `world/threads/<topic-slug>.base` — the long
   tail that nobody wants to hand-maintain. See the worked example below.

The curated list and the query do different jobs. The list is an argument about what
matters; the query is a guarantee that nothing tagged is lost. Keep both.

## How a document joins a thread

By tag, in its own frontmatter. Nothing is copied, moved, or duplicated:

```yaml
tags: [story, elderholt, calderon-imperium, southern-continent]
```

That document is now an Elderholt story, a Calderon story, and a southern-continent
document at once. It still physically lives in exactly one folder. The thread note picks
it up; so does any faction view filtering on the other tags. This is the whole point of
the tag layer — see
[`../../context/world/README.md`](../../context/world/README.md) for the taxonomy and
which tags are machine-reserved.

## When to start one

Start a thread note when a topic has **crossed its third document and its second folder**
and you have caught yourself wondering where it lives. Before that, a tag on its own is
enough; the tag pane is already an index.

Do not start one for:

- **A place.** Places go in the faction folder that holds them — there is no
  `world/locations/`, and `world/threads/` is not a way around that rule.
- **A faction, party, or age.** Those have folders already.
- **A tag you have used twice.** That is a tag, not a thread.

## Naming

Kebab-case filename, matching the tag exactly: tag `southern-continent` →
`world/threads/southern-continent.md`. The slug is the join between the note and every
document on the thread, so a mismatch quietly empties the query.

## Worked example

[`conflict.base`](conflict.base) is a live Bases query over the existing `conflict` tag,
which spans five `history/` folders across four factions and the world ages. It ships
without a companion note on purpose: it is the demonstration of the mechanism, and the
tag it queries is real vault data rather than invented lore. Open it in Obsidian to see
the table it renders. Base syntax and the history-folder variant are documented in
[`../../context/world/timelines.md`](../../context/world/timelines.md).
