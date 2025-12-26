<INSTRUCTIONS>
# Timeline SVG + History System (Agent Notes)

This repo uses TSV-driven history that renders to SVG timelines.

## Scope + configs

- Any folder under `world/` may contain `_history.tsv` data files.
- Any folder under `world/` may contain `_history.config.toml` which defines one or more `[[views]]`.
- Rendering is **scoped**: a config file at `world/X/_history.config.toml` only reads `_history.tsv` (and legacy `_timeline.tsv`) within `world/X/` and its subfolders.
- `scripts/build_timeline_svg.py` discovers configs recursively under `world/` and renders SVGs next to each config file (one SVG per `[[views]]` entry).

## When Writing New Historical Events

- Use faction adjacency/influence to pick plausible interactions:
  - `../../world/faction-proximity-and-influence.md`
- Use faction real-world inspiration notes to keep behavior/culture consistent:
  - `../../world/faction-insperation-sorces.md`

## History TSV schema (simplified)

History entries are **row-based**: each TSV row renders independently (duplicate `event_id` is allowed).

- `_history.tsv` columns:
  - `event_id`
  - `tags` (semicolon or whitespace separated)
  - `date` (`YYYY`, `YYYY/MM`, or `YYYY/MM/DD`)
  - `duration` (integer days; use `0` for point events)
  - `title`
  - `summary`
- Public/private visibility is handled via tags:
  - tag an entry `public` to include it in public views
  - tag an entry `private` to exclude it (by default) via `tags_none = ["private"]` in `_history.config.toml`

## Tags + icons

- Tags may include **faction slugs** (e.g. `rakthok-horde`) to render the faction icon.
- Other tags may have icons under `scripts/timeline_svg/assets/tags/`; missing icons render as the “unknown” marker.

## File locations

- History data files: any folder under `world/` may contain `_history.tsv`.
- Per-scope rendering config: `_history.config.toml` in any `world/**` folder controls which SVG views get rendered for that scope (that folder + subfolders).

</INSTRUCTIONS>
