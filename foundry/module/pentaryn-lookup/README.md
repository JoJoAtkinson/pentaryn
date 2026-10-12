---
created: 2026-08-22
last_modified: 2026-10-11
tags: ["foundry", "vtt", "module", "rules", "compendium"]
status: shipped — 0.3.0
---

# Pentaryn Rules Lookup (`pentaryn-lookup`)

**Read this when:** you are changing or calling `pentaryn-lookup` (`game.pentaryn.rules`). **Not
this file:** how to look a rule up at the table → [`context/foundry/rules-lookup.md`](../../../context/foundry/rules-lookup.md) ·
the migration record → `context/plans/addon-blueprint-2026-10/migrate-pentaryn-lookup.md` · how every
addon is built → [`context/foundry/addon-blueprint.md`](../../../context/foundry/addon-blueprint.md)

The books you own, searchable from one call. Read-only: it never writes a document, opens a
dialog or touches the canvas.

```js
await game.pentaryn.rules.search("half cover")                 // an object — iterate .hits
await game.pentaryn.rules.page("Study")                        // or a page uuid from search()
await game.pentaryn.rules.monster("Goblin Boss", { text: true })
await game.pentaryn.rules.monsters({ size: "large", type: "construct", cr: "5-8" })
await game.pentaryn.rules.onList("Fireball", "cleric")
await game.pentaryn.rules.selftest()
```

**Why it exists.** `mcp__foundry__search-compendium` matches entity *names* only, and the
eval-js route over `page.text.content` has five traps that all fail **silently**:

| Trap | What it does |
|---|---|
| `getIndex({fields:["pages.name"]})` | right or wrong per call: core `indexDocument` rewrites an entry with `getProperty(source, "pages.name")` (undefined through an array) whenever a document enters the pack cache — 47/47 one call, 0/47 the next (v14.367 and v14.369) |
| `EmbeddedCollection` has no `.length` | `pages.length` → `undefined` → `NaN` → `null`, no error |
| enricher noise | 5,052 `@UUID[…]` across PHB/DMG/MM/SRD survive a naive tag-strip |
| transport truncation | eval-js silently truncates a large return |
| `globalThis.duplicate` | removed in v14 |

**Defaults.** PHB + DMG + 2024 SRD; Monster Manual text is opt-in (`books: "monsters"` or
`"all"`). The 2014 SRD is searched only when asked (`books: "2014"`) and its hits carry
`edition: "2014"`. Five hits, ~240-character snippets, an 8 KB payload ceiling; `total` reports
every matching page. One hit per page, with `matches: n`. World journals are out of scope
(`find_lore`, `search-journals`).

## What the player sees

n/a — a GM / LLM tool with no UI.

## Settings

n/a — no settings.

## API — game.pentaryn.rules

Canonical: `game.modules.get("pentaryn-lookup").api`; `game.pentaryn.rules` is the same frozen
object. Ask it: `game.pentaryn.rules.describe()` (offline: `test/golden/describe.json`). Every
lookup is a **legacy** row: a miss is an answer object (`{error}`, `{notFound, …, hint}`), never a
throw. None is GM-only, none writes. A pack whose read fails answers as if it were not installed
(`search`/`page` name it in `warning: "skipped missing pack(s): …"`), traced at debug with the pack
id; a `selftest()` check that throws is recorded as failed with the error as its `detail`, and the
remaining checks still run (R4).

| Method | Returns |
|---|---|
| `search(query, { books, limit, snippet, regex })` | `{ query, books, total, shown, hits: [{ book, journal, page, uuid, matches, snippet, edition? }], note?, truncated?, warning? }` \| `{ error }` |
| `page(ref, { books, maxChars, offset, raw, tables })` | `{ book, journal, page, uuid, text, edition?, truncated?, totalChars?, nextOffset?, warning?, tables? }` \| `{ journal, page, uuid, raw }` \| `{ notFound, name, closest, hint }` \| `{ error }` |
| `monster(name, { text })` | `{ name, pack, uuid, cr, ac, hp, size, type, features, warning? }` (+ `languages`, `speed`, feature `text` with `text: true`) \| `{ notFound, name, searched, hint }` \| `{ error }` |
| `monsters({ size, type, cr, minCr, maxCr, name, limit, packs })` | `{ count, shown, monsters: [{ name, cr, size, type, uuid, pack }], hint? }` |
| `names(kind)` | `{ classes, subclasses: { <class>: [] }, species, backgrounds, feats: { origin, general, … } }`, or one key |
| `packs()` | `{ world, foundry, system, packs: [{ id, present, label?, type?, entries?, edition? }] }` |
| `onList(spell, cls, { type })` | `{ spell, uuid, level, list, onList: true \| false \| null, hint? }` \| `{ notFound, spell, hint }` |
| `spellList(cls, { type, level })` | `{ list, count, spells: [{ name, level, uuid }] }` \| `{ error, known }` |
| `toPlainText(html)` | string |
| `selftest()` | `{ ok, passed, failed, checks: [{ label, ok, detail }] }` |
| `LIMITS` | the limits table, a frozen copy (data, not a method) |

`page`'s `ref` is a page UUID or a page **name** (exact, then substring) — it is never run
through the kit's actor resolver. A UUID of something that is not a page (a JournalEntry) answers
empty `text` plus a `warning` saying so, and echoes that UUID as its `uuid` (never a made-up page UUID). `page()` appends embedded roll tables as `tables` (`{ tables:
false }` skips them). Kit members: `describe()`, `version`, `contract`, `settings()`, `trace()`,
`uninstall()`.

**Queries (GM only):** `pentaryn-lookup.search`, `.page`, `.monster`, `.monsters`, `.names`,
`.onList`, `.spellList`, `.packs`, registered at `init` on every client. Payloads are named
fields: `{ query, books, limit }`, `{ ref, maxChars }`, `{ name (or ref), text }`, `{ cr, size }`,
`{ kind }`, `{ spell, cls, type }`, `{ cls, type, level }`, `{}`. A player sender or a player
client gets `NOT_GM`; before `ready` publishes, `NOT_READY`.

## Data written

None — no documents, no flags, no settings.

## Flags other modules read

n/a — writes no flags.

## Events

None emitted (beyond the kit's `pentaryn-lookup.ready` and `pentaryn.ready` on publish).
Listens to: `init` (queries) and `ready` (publish), pinned in `test/golden/hooks.json`.

## Patches and adjustments

None — patches nothing and uses no third-party package. One read of core **source text**, not a
patch: `selftest()` tests `CompendiumCollection#indexDocument.toString()` for the
`getProperty(data, field)` projection that breaks journal indexes (the canary for the first
trap above; `packs-adapter.mjs` `indexDocumentProbe`).

## Two sessions / who writes

Read-only, any client. A query runs in every GM tab that receives it (bridge and browser); both
answer the same read, so the first answer is right.

## Extending

1. A pure function in `lookup-core.mjs`, with a case in `test/core.test.mjs`.
2. Any Foundry read it needs → a function in `packs-adapter.mjs` (plain data out). A pack id
   it reads goes in one of core's tables (`BOOKSETS`, `MONSTER_PACKS`, `MONSTER_LIST_PACKS`,
   `SPELL_PACKS`, `NAME_SOURCES`), never inline in `books.mjs`; so do the index fields it reads
   (`NAME_SOURCES`, `MONSTER_INDEX_FIELDS`).
3. A thin method in `books.mjs`, added to `install()`'s `impl`.
4. A row in `api-manifest.mjs`: `returns`, `doc`, `legacy: true` only if the answer is an
   `{error}`/`{notFound}` object, and `query: true` + an `args` mapper if the bridge should call it.
   Then `GOLDEN_UPDATE=1 node --test test/api-kit.test.mjs` and review the `describe.json` diff.
5. A `selftest()` check in `api.mjs` and a line in `context/foundry/rules-lookup.md`.

## Pitfalls

- `getIndex({ fields })` cannot be trusted for journal `pages.*` (first trap): book text comes
  from `getDocuments()` (~150 ms for the whole PHB). Actor index fields are reliable.
- Locked book packs are loaded once per session and cached with their plain text
  (`packs-adapter.mjs` `bookCache`); `uninstall()` clears it. Unlocked packs are never cached:
  a world compendium (unlocked by default) or a pack whose edit lock a GM toggled off is read
  on every call, and unlocking a cached pack drops its entry. LevelDB only guards packs against
  edits from outside Foundry, not in-app edits.
- `doc.pages` and `actor.items` are EmbeddedCollections: iterate, `.size`, never `.length`.
- A param named `ref` is resolved as an actor by the kit unless its row says `resolve: false`;
  `page` is the only one, and no other lookup param may be named `ref`.
- The "Class Spell Lists" pages in the PHB are empty shells; the lists live only in
  `dnd5e.registry.spellLists`.
- `monsters()` sorts a row with no CR by name only (a NaN comparison) — kept as shipped.
- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync lookup`.

## Files

| File | Role |
|---|---|
| `pentaryn-lookup.mjs` | entry (esmodules[0]): wiring, `init` queries, `ready` publish |
| `lookup-core.mjs` | pure: identity, every pack-id table, HTML → text, search, page, monster rules, spell-list dedupe, `names()` grouping |
| `packs-adapter.mjs` | every Foundry read: packs, `fromUuid`, `dnd5e.registry`, `enrichHTML` |
| `books.mjs` | the feature: the eight lookups |
| `api-manifest.mjs` | API rows (pure data) |
| `api.mjs` | `buildApiFor`, `selftest` |
| `lib/` | vendored kit, tier full (`lib/kit.lock.json`) |
| `test/` | node:test suites, goldens, synthetic fixtures (`test/fixtures/`), vendored test kit |

Verified Foundry and dnd5e paths (v14.369, dnd5e 6.0.6, 2026-10-10): `game.packs.get(id)`
(`.metadata.label`, `.documentName`, `getDocuments()`, `getIndex()`), `page.text.content`,
`fromUuid`, `actor.system.details.cr` / `attributes.ac.value` (`.flat` fallback) /
`attributes.hp.max`, `dnd5e.registry.spellLists.forType()` / `.options`, `RollTable#results`,
`TextEditor.implementation.enrichHTML(html, { rollData, relativeTo })`.

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check lookup
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module lookup
```

Fixtures are synthetic HTML and stub packs built to trip each trap, never real book text.

## Sync

`make foundry-lookup-sync`, then reload and run `await game.pentaryn.rules.selftest()`. A
`module.json` change needs a Foundry restart. Run the selftest after every Saturday auto-update
too — that is when a premium module restructures its journals or dnd5e moves a data path.
Check what is live with `game.pentaryn.rules.describe().version`.
