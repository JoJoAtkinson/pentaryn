---
title: "Timelines — history TSV and SVG rendering"
status: active
last_modified: 2026-08-22
tags: [context, world, timeline, svg]
---

# Timelines — history TSV and SVG rendering

**Read this when:** adding historical events, or rebuilding the timeline SVGs that publish
to GitHub Pages.
**Not this file:** general lore authoring → [`README.md`](README.md)

---

## Where events live

Any file named `_history.tsv` (preferred) or `_timeline.tsv` (legacy), anywhere under
`world/`. Tabs between columns; use the header from `world/history/_history.tsv`.

Minimal schema:

| Column | Meaning |
|---|---|
| `event_id` | Identifier. Duplicates are allowed and render as separate entries. |
| `tags` | Semicolon- or whitespace-separated; may include faction slugs like `rakthok-horde`. |
| `date` | `YYYY`, `YYYY/MM`, or `YYYY/MM/DD` |
| `duration` | Integer days; `0` for a point event |
| `title` | |
| `summary` | |

Use tags like `public` / `private` for point-of-view variants rather than duplicating the
`event_id` per POV.

## Rendering

SVG-first. Put a `_history.config.toml` in any `world/**` folder to render one or more views
scoped to that folder and its subfolders. Then use the **`build_timeline_svg`** MCP tool —
not the script directly. **`build_timeline_key`** regenerates the legend (`timeline-key.svg`).

Output publishes into `docs/`, which GitHub Pages serves via `.github/workflows/pages.yml`.
Generated SVGs under `world/` are gitignored on purpose — `docs/` is the published home.

## Build dependency worth knowing

The renderer needs Pillow built **from source** with RAQM linked, which is why
`pyproject.toml` pins `no-binary-package = ["pillow"]`. A plain wheel silently drops RAQM
and the text layout goes wrong. Setup is scripted: `scripts/setup_pillow_raqm.sh`. Fonts
live in `.fonts/` (Noto Runic for age glyphs, Alegreya for labels).

## Campaign-time math

`age_convert` auto-detects the direction (year ⇄ age label) and is the default for free-form
input. `year_to_age` / `age_to_year` are for when the direction is already known.
