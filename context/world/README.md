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
- Use relative links between docs.

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

New lore docs carry: `created`, `last-modified`, `tags`, `status`.

## Spell-checker

Character, place and faction names are intentional. Check `.vscode/cspell.json` before
proposing a rename on a spell-checker hit.

## Combat-ready NPCs

An NPC that needs Foundry stat mechanics is one markdown stat sheet under `world/…/npcs/`
plus one or more rows in `foundry/actions.jsonl`. The markdown carries the `#combat-runner`
tag, which is what `scripts/foundry/build_actors.py` discovers. Author the rows with the
`combat_action_upsert` MCP tool — it validates the spec on write — never by hand. Template:
[`../../templates/npc-combat-runner-template.md`](../../templates/npc-combat-runner-template.md).
Pre-compute every roll; PC saves and skill checks become `[ASK PLAYER]`.
