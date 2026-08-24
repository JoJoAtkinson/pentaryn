---
title: "World & lore authoring"
status: active
last_modified: 2026-08-22
tags: [context, world, lore, conventions]
---

# World & lore authoring

**Read this when:** creating or editing campaign lore — factions, locations, NPCs, sessions,
items, house rules. Anything that lands under `world/`.
**Not this file:** timeline TSV + SVG rendering → [`timelines.md`](timelines.md) ·
Foundry-side content → [`../foundry/README.md`](../foundry/README.md)

---

## Golden rules

- Preserve existing lore and tone. Do not retcon unless asked.
- Prefer small, focused changes. Keep files readable and linkable.
- Link by the rule for the zone you are in — see [Linking](#linking).

## Where things go

Everything canonical lives under `world/`. There is no parallel top-level content tree.

| Kind | Path |
|---|---|
| Factions | `world/factions/<faction-slug>/_overview.md` |
| Locations | `world/factions/<region-slug>/locations/<location>.md` |
| NPCs | `world/factions/<faction>/locations/<place>/npcs/<slug>.md` |
| Parties | `world/party/<party-slug>/` — `_overview.md`, `members/`, `history/` |
| Homebrew creatures | `world/creatures/` |
| House rules | `world/house-rules/` |
| Ages / calendar | `world/ages/` |
| Naming conventions & character registry | `world/naming_conventions/` |
| Sessions | `sessions/NN/` — audio, transcripts, `notes/` |
| One-shots | `oneshots/` |
| Cross-cutting topics | `world/threads/<topic-slug>.md` — a note per subject that spans folders and belongs to none. [`../../world/threads/README.md`](../../world/threads/README.md) |
| Drafts | `staging/` — move it out once polished; never link to it from canonical lore |

Do **not** create `world/locations/`. Locations are tracked inside the relevant faction
folder.

## Naming and formatting

- Filenames: kebab-case (`location-name.md`).
- Session notes: `session-XX-YYYY-MM-DD.md`.
- Markdown: `#` / `##` / `###`, bullets for lists, tables for stat blocks, `>` for read-aloud.
- For complex names, give the pronunciation on first mention: Name (PHONETIC) with CAPS on
  the stressed syllable.

## Frontmatter

Every lore doc opens with YAML. `created`, `last_modified`, `status` and `tags` always;
`aliases` when the in-world name differs from the filename.

```yaml
---
created: 2026-08-24
last_modified: 2026-08-24
status: draft
tags: [elderholt, npc, witch]
aliases: [The Ashen Measure]
---
```

- `created` / `last_modified` — ISO dates, **underscore in both**. The old `last-modified`
  spelling was normalized away across 188 files; don't reintroduce it.
- `status` — short free text. `draft` and `active` are what's in use.
- `tags` — a YAML array, **no leading `#`**, kebab-case. A `#` inside a YAML tags array is
  not a valid Obsidian property tag: it makes the file invisible to the tag pane, to `tag:`
  search, and to Bases. Strip it.
- `aliases` — feeds Obsidian autocomplete, so `[[The Ashen Measure]]` finds a file named
  `marrith-the-ashen-measure.md`.

History events carry a larger, required schema on top of this — see
[`timelines.md`](timelines.md). Their frontmatter and filenames are frozen; a future
renderer reads them.

## Tags

Tags are how one document lives in several places at once. A document has exactly one
physical home — the least-bad folder — and as many tags as it has subjects. Nothing is ever
duplicated to give it a second home; it is tagged. Faction views, `.base` queries and the
thread notes in [`../../world/threads/README.md`](../../world/threads/README.md) all read
that tag layer.

Three kinds of tag, and they are not equal.

### 1. Reserved — machine-read, never rename

Renaming one of these breaks a program silently: the query still runs, it just returns
nothing. Add freely, rename never — and check both readers first if you must.

| Tag | Read by | Contract |
|---|---|---|
| `combat-runner` | [`../../scripts/foundry/build_actors.py`](../../scripts/foundry/build_actors.py) | Marks an NPC sheet as combat-ready. This tag *is* the discovery mechanism — the whole actor build is the set of files carrying it. |
| `cr-*` | same | Exactly one per combat-runner sheet. `cr-3`; fractions as `cr-1-2` / `cr-1-8` (the dash reads as a slash). Two, or none, is a build error. |
| Creature types — `aberration` `beast` `celestial` `construct` `dragon` `elemental` `fey` `fiend` `giant` `humanoid` `monstrosity` `ooze` `plant` `undead` | same | Exactly one per combat-runner sheet. These fourteen words are a closed set; on any other doc they are ordinary tags. |
| Scope slugs — `age` `araethilion` `ardenhaven` `calderon-imperium` `elderholt` `merrowgate` `party` `rakthok-horde` `sabriel` `the-compass-edge` | the four history `config.toml` view filters | Named in `tags_all` / `tags_any` / `tags_none`. Configs live at [`../../world/history/config.toml`](../../world/history/config.toml), [`../../world/ages/history/config.toml`](../../world/ages/history/config.toml), [`../../world/factions/ardenhaven/history/config.toml`](../../world/factions/ardenhaven/history/config.toml), [`../../world/factions/rakthok-horde/history/config.toml`](../../world/factions/rakthok-horde/history/config.toml). |
| `public` / `private` | same | The POV gate. `public` opts an event into the world-facing timeline; `private` excludes it from a faction view. Never decorative. |

`sabriel` is named by a view filter and currently tags no file — reserved anyway. `cr1`,
`cr2` and `cr-low` on quest and encounter docs are difficulty labels, not stat-block CRs;
they are safe only because no combat-runner sheet carries them. Don't mix the two systems.

### 2. Entity tags — what the document *is* and *whose* it is

Flat, kebab-case, already the bulk of the vocabulary:

- **Faction slugs** — `ardenhaven`, `elderholt`, `calderon-imperium`, `merrowgate`,
  `rakthok-horde`, `araethilion`, `garhammar-trade-league`, `dulgarum-oathholds`.
  (Also reserved above where a `config.toml` names them.)
- **Place slugs** — `deep-fall-ruins`, `ardenford`, `gar-vally`, `thrulm`, `gray-district`,
  `harrowick-keep`. The slug matches the folder or file it names.
- **Kind tags** — `npc`, `location`, `faction`, `story`, `lore`, `quest`, `handout`,
  `encounter`, `monster`, `battle`, `member`, `age`, `world`.

Use the slug that already exists rather than a synonym. `grep -rh '^tags:' world/` before
inventing one.

### 3. Topic tags — the cross-cutting layer, and the new capability

The subjects a document is *about*, which cut across every folder boundary: `conflict`,
`trade`, `law`, `government`, `economy`, `diplomacy`, `crime`, `magic`, `witch`, `derro`.
Add new ones freely — kebab-case, flat (Obsidian supports `topic/nested`, but nothing here
uses it and consistency beats hierarchy at this size).

A topic tag is what lets one story be an Elderholt story, a Calderon prison and a chapter
of a larger theme simultaneously, with one file on disk. When a topic outgrows the tag pane
— roughly three documents across two folders — give it a thread note as well:
[`../../world/threads/README.md`](../../world/threads/README.md). Worked example:
[`../../world/threads/conflict.base`](../../world/threads/conflict.base), a Bases query
collecting the 21 `conflict`-tagged events scattered across five `history/` folders.

**Not tags:** `status`, `created`, `last_modified`, `year`, `date`. Those are properties,
and they already are.

## Linking

Link format follows the zone, and the line is drawn where the tooling already draws it —
[`../../scripts/check_context.py`](../../scripts/check_context.py) resolves relative links
in one surface and nowhere else.

| Zone | Format |
|---|---|
| `world/`, `oneshots/`, `characters/`, `sessions/`, `campaigns/`, `items/`, `staging/` | **Wikilinks**, always with display text: `[[marrith-the-ashen-measure\|Elder Marrith]]`. Path-qualify when the basename is shared — `[[world/factions/elderholt/_overview\|Elderholt]]` — because 32 files are named `_overview.md`. |
| `context/`, `CLAUDE.md`, root `README.md`, `templates/README.md` | **Relative paths**, unchanged. `make check-context` fails the build on a broken one. |
| `scripts/`, `foundry/`, `automation/` | **Unchanged.** Code docs, read on GitHub; some contain Foundry `[[enricher]]` syntax that is not a wikilink at all. |
| History event **frontmatter** | **Untouched, ever.** Future-renderer contract. |

Always keep the `|display text` half in lore. It preserves the sentence, and it survives
the file being renamed or the link being path-qualified later.

One exception, both ways: a link that **crosses** into `context/`, `scripts/` or the repo
root stays a relative path even when written from a lore file. Those targets are read
outside Obsidian, and their basenames (`README.md` ×22) make a wikilink meaningless.

## Spell-checker

Character, place and faction names are intentional. Check `.vscode/cspell.json` before
proposing a rename on a spell-checker hit.

## Combat-ready NPCs

An NPC that needs Foundry stat mechanics is one markdown stat sheet under `world/…/npcs/`
plus one or more rows in `foundry/actions.jsonl`. The markdown carries the `combat-runner`
tag, which is what `scripts/foundry/build_actors.py` discovers. Author the rows with the
`combat_action_upsert` MCP tool — it validates the spec on write — never by hand. Template:
[`../../templates/npc-combat-runner-template.md`](../../templates/npc-combat-runner-template.md).
Pre-compute every roll; PC saves and skill checks become `[ASK PLAYER]`.
