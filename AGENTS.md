# AGENTS.md

This repo is a D&D 5.5e campaign vault. When you create or edit content, follow these rules.

## Golden rules
- Preserve existing lore and tone; do not retcon unless asked.
- Prefer small, focused changes. Keep files readable and linkable.
- Use relative links between docs.

## Where things go (high level)
- Naming Conventions: world/naming_conventions/primary-factions.md
- Characters: /characters/player-characters, /characters/npcs
- World: /world/factions, /world/history, /world/lore
- Sessions: /sessions/notes (new), /sessions/planning (upcoming), /sessions/archive (old)
- Quests: /quests/active, /quests/completed, /quests/side-quests
- Items: /items/magic-items, /items/artifacts, /items/mundane
- Creatures: /creatures/monsters, /creatures/bestiary, /creatures/custom
- Rules: /rules/house-rules, /rules/references, /rules/mechanics
- Templates: /templates

## Factions and locations layout
- Factions live in folders: `world/factions/<faction-slug>/_overview.md`
- Locations live under their region/faction: `world/factions/<region-slug>/locations/<location>.md`
- Avoid creating `world/locations/` (locations are tracked inside the relevant faction folder)

## Naming and formatting
- Filenames: kebab-case (e.g., location-name.md).
- Sessions: session-XX-YYYY-MM-DD.md
- Markdown: use # / ## / ###, bullets for lists, tables for stat blocks, > for read-aloud.

## Metadata
- Include front matter when creating new lore docs:
  - created date, last modified, tags, status

## World naming conventions
- For complex names, include pronunciation on first mention:
  Name (PHONETIC) with CAPS for stressed syllables.

## If Copilot instructions exist
- Also follow .github/copilot-instructions.md for the full style guide.

## Timeline data & generator
- Timeline events live in any file named `_history.tsv` (preferred) or `_timeline.tsv` (legacy). Use the header from `world/history/_history.tsv` (tabs between columns).
- `_history.tsv` minimal schema:
  - `event_id`
  - `tags` (semicolon or whitespace separated; can include faction slugs like `rakthok-horde`)
  - `date` (`YYYY`, `YYYY/MM`, or `YYYY/MM/DD`)
  - `duration` (integer days; `0` for point events)
  - `title`
  - `summary`
- Duplicate `event_id` rows are allowed and will render as separate entries (use tags like `public` / `private` instead of POV variants).
- SVG-first workflow: put a `_history.config.toml` in any `world/**` folder to render one or more SVG views for that folder scope (that folder + its subfolders). Run `./venv/bin/python scripts/build_timeline_svg.py`.
- Legacy workflow: run `./venv/bin/python scripts/generate_timelines.py` (config at `world/history/timeline.config.toml`) to generate Markdown/Mermaid outputs in `world/history/generated/`.
