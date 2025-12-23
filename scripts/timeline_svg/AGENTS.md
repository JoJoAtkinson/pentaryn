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

## POV model (truth/public/party/etc.)

History TSV rows are keyed by `(event_id, pov)` and must be unique across all source TSVs within a scope.

- `pov=truth` and `pov=public` are **not required**. An event may exist only as a faction POV (example: a hidden event with only `pov=rakthok`).
- Canonical record selection:
  - If `truth` exists, it becomes canonical.
  - Else the generator picks a canonical row deterministically (prefers the most “complete” row; non-`public` wins ties).
- POV rows are intentionally limited: non-canonical POV rows may only override **date fields** and **title/summary** (everything else must match the canonical row or be blank).
- `inherit_truth_date=true` on a non-canonical row means: in non-public views, the event uses the canonical (truth) dates, but keeps the POV’s description. Public views never inherit truth dates.
- Public visibility rule: in `pov=public` views, an event is **hidden** unless the event has a `public` row with a `start_*` date.

## Tag rules (hard)

- Timeline event `tags` are **restricted**: you may only use tags that have an icon file in `scripts/timeline_svg/assets/tags/`.
- The tag string must match the icon filename (without `.svg`) exactly. Example: tag `city-state` → `scripts/timeline_svg/assets/tags/city-state.svg`.
- If you need a new tag, add an icon for it first (or ask the human to choose one), then use it in `_history.tsv`.

## File locations

- History data files: any folder under `world/` may contain `_history.tsv`.
- Per-scope rendering config: `_history.config.toml` in any `world/**` folder controls which SVG views get rendered for that scope (that folder + subfolders).

</INSTRUCTIONS>
