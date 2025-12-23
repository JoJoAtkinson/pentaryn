---
created: 2025-12-22
last-modified: 2025-12-22
tags: ["#world", "#history", "#reference"]
status: active
---

# Timeline System Overview

This folder stores the canonical TSV data and configuration for generating timelines and history views.

## Key Pieces

- `*_history.tsv` — data tables (can live anywhere in `world/`; this folder just contains the primary one). (`*_timeline.tsv` is supported as legacy.)
- `world/history/timeline.config.toml` — declares which timeline views to build (markdown + mermaid, plus ranges/perspectives).
- `scripts/generate_timelines.py` — legacy loader/validator/output generator (markdown + mermaid).
- `scripts/build_timeline_svg.py` — SVG renderer; reads `_history.config.toml` files under `world/` and writes SVGs next to them.
- `world/history/generated/` — output files created on demand when you run the script.

## TSV Rules

Every `_history.tsv` (or legacy `_timeline.tsv`) must use the header below (tabs between columns):

```
event_id	pov	series	kind	start_year	start_month	start_day	end_year	end_month	end_day	precision	parent_id	factions	tags	title	summary	inherit_truth_date
```

Guidance:

- `event_id` must be globally unique and kebab-case.
- `pov` is one of: `truth`, `public`, `party`, or any faction/PC slug. There can be at most one row per `(event_id, pov)`.
- Each event **must** have either a `truth` or a `public` row (or both). Truth rows are the canonical source for shared metadata (series, kind, factions, etc.).
- Non-canonical POV rows may only override title, summary, and dates. Leave everything else blank so it inherits from the truth row.
- Set `inherit_truth_date` to `true` when a non-`public` POV should reuse the truth date even if its own date columns are blank (do not use this on `public` rows).
- Use `series` to link chained ranges such as ages/dynasties. When a `series` entry has no `end_date`, it lasts until the next entry with the same series.
- `kind` can be any helpful label: `age`, `war`, `battle`, `event`, `treaty`, `project`, etc.
- For `factions`/`tags`, separate multiple values with `;`.

You can keep extra `_history.tsv` files alongside factions, regions, or quest folders. Both generators automatically load **all** of them (within the configured scope).

## Running the Generator

```
./venv/bin/python scripts/generate_timelines.py
```

Optional arguments:

- `--config PATH` — override the config file (defaults to `world/history/timeline.config.toml`).

The legacy script will:

1. Load every `_history.tsv` / `_timeline.tsv` in the repo.
2. Validate the uniqueness and inheritance rules.
3. Build derived ranges (ages, wars, etc.).
4. Write the configured outputs to `world/history/generated/`.

If a view defines `tsv_output`, the script also writes a TSV export suitable for SVG rendering (recommended output location: `.output/timelines/`).

## Rendering an SVG

Add a `_history.config.toml` in the folder you want to render (e.g., `world/_history.config.toml`), then run:

```
./venv/bin/python scripts/build_timeline_svg.py
```

## Configuring Views

Each `[[views]]` entry in `timeline.config.toml` creates an output. Fields:

- `id` — identifier used for the filename.
- `type` — `"markdown"` or `"mermaid"`.
- `title` — heading written to the output.
- `pov` — which perspective narrates the event (required for markdown views).
- `include_povs` — optional list of extra POV summaries to embed under each event (useful for DM master views).
- `output` — relative path to write.
- `range` — optional filter. Supports `start_year`, `end_year`, or `last_years`.
- `use_event` — filter by the start/end defined by another event (e.g., tie a view to `age-trade`).
- `series` — for mermaid outputs; include entries with the same series slug.

### Example View Snippet

```toml
[[views]]
id = "party"
title = "Party Chronicle"
type = "markdown"
pov = "party"
output = "world/history/generated/party-timeline.md"
range = { last_years = 100 }
```

## Workflow

1. Drop or edit TSV rows (in this folder or near the lore they describe).
2. Run the generator.
3. Review the updated outputs in `world/history/generated/`.
4. Commit both the TSV changes and the regenerated files.

Refer to `AGENTS.md` for the condensed ruleset whenever you add or modify events.
