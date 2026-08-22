---
title: "Timelines — history events as per-event markdown"
status: active
last_modified: 2026-08-22
tags: [context, world, timeline, history]
---

# Timelines — history events as per-event markdown

**Read this when:** adding, editing, or reading historical events anywhere under `world/`.
**Not this file:** general lore authoring → [`README.md`](README.md) · why the format
changed → [`../plans/world/timeline-refactor.md`](../plans/world/timeline-refactor.md)

---

## Where events live

One markdown file per event, in a `history/` folder inside the scope it belongs to:

```
world/factions/araethilion/history/02127-00-00_sabriel-birth.md
world/party/the-compass-edge/history/04327-10-15-09_arrival-at-the-docks.md
world/ages/history/00000-00-00_fall-of-the-ancients.md
```

The folder **is** the timeline. Files sort oldest → newest by filename, in git, in `ls`, in
Obsidian, and in Finder.

Four of those folders also hold a `config.toml` — view definitions (tag filters, tick
scales, POV scoping, palettes) scoped to the folder above and everything beneath it. They
live at `world/history/`, `world/ages/history/`, `world/factions/ardenhaven/history/`, and
`world/factions/rakthok-horde/history/`. A scope can have events without a config, and the
root has a config without events. Don't delete them — they are the expensive part to
recreate.

## Filename — the sort key

```
{YYYYY}-{MM}-{DD}[-{HH}]_{slug}.md
```

Zero-padded, fixed width. `00` means *unspecified*, not January or midnight.

| Precision | Example filename | Frontmatter `date` |
|---|---|---|
| Year | `04177-00-00_council-recess.md` | `"4177"` |
| Month | `04179-03-00_the-long-thaw.md` | `"4179/03"` |
| Day | `04185-07-12_the-ashfall-accord.md` | `"4185/07/12"` |
| Hour | `04327-10-15-09_arrival-at-the-docks.md` | `"4327/10/15-09"` |
| Unknown | `99999-00-00_the-nameless-year.md` | `"???"` |

**The year field is 5 digits on purpose.** It is always `0` in front today. The spare digit
reserves room for an epoch offset if pre-Fall history is ever dated — see the plan doc. Do
not drop it, and do not hand-edit years into it.

Filenames must be unique. Two events on the same date with the same slug get `-2`, `-3`.

## Frontmatter

```yaml
---
title: Birth of Sabriel
event_id: sabriel_birth
date: "2127"
year: 2127
precision: year
duration: 0
tags: [araethilion]
aliases: [Birth of Sabriel]
---

Sabriel was born beneath Elaerith's watchful grace, a child set apart from her first breath…
```

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Display name |
| `event_id` | yes | Stable identifier. Duplicates are legal — two POV accounts of one event share an id |
| `date` | yes | Quoted string, native precision: `YYYY`, `YYYY/MM`, `YYYY/MM/DD`, `YYYY/MM/DD-HH`, or `???` |
| `year` | yes | Integer. This is the field to filter ranges on |
| `precision` | yes | `year` \| `month` \| `day` \| `hour` \| `unknown` |
| `duration` | yes | Days. `0` for a point event |
| `tags` | yes | YAML list. Faction slugs, `public` / `private`, themes |
| `aliases` | no | So Obsidian autocomplete finds the event by title, not by sort key |

Everything below the frontmatter is the event body — prose, links, images, whatever the
event needs. The old `summary` column lives here now and is no longer length-constrained.

## Adding an event

1. Pick the scope folder — the faction, party, or `world/ages/` the event belongs to.
2. Work out the sort key from the date. Pad every field; use `00` for what you don't know.
3. Create `history/{sortkey}_{slug}.md` with the frontmatter above.
4. Write the body.

Use tags for point-of-view variants rather than duplicating the event. One event, two files
sharing an `event_id`, differing tags (`public` vs `merrowgate`) — that is the intended
shape, and it is why duplicate `event_id`s are allowed.

## Dates and this world's calendar

360-day year, 12 months of 30 days each, counted from the Fall (year 0). Full reference:
[`../../world/calendar-reckoning-of-the-fall.md`](../../world/calendar-reckoning-of-the-fall.md).

Two consequences worth knowing:

- **Obsidian's `date` property type does not work here.** Every month has 30 days, so
  `4327/02/30` is a valid in-world date and an invalid Gregorian one. About one date in
  twelve can never be ISO. Use `year` (integer) for filtering and `file.name` for sorting;
  Bases and Dataview handle both. Date *arithmetic* has to be written by hand.
- **`age_convert`** auto-detects the direction (year ⇄ age label) and is the default for
  free-form input. `year_to_age` / `age_to_year` are for when the direction is already known.

## Browsing events in Obsidian

Optional, additive, and not required by anything: a `.base` file gives an Obsidian-native
table over a `history/` folder. Sort on `file.name` (which *is* the chronological key) and
filter ranges on `year`.

```yaml
filters:
  and:
    - file.inFolder("world/factions/ardenhaven/history")
views:
  - type: table
    name: Ardenhaven history
    order: [file.name, title, date, duration]
```

Bases can express which events and in what order, but nothing about how they render — it has
no per-row colour or styling. That is why the render settings stay in `config.toml` rather
than moving into a `.base`.

## Rendering

**Being redesigned — there is currently no supported path from `history/` folders to a
rendered timeline.** The direction under consideration is a timeline as a character artifact
or a tab inside Foundry VTT, with the existing repo → Foundry porting tooling carrying it
across. Design is being driven by how it should look at the table first.

`config.toml` files and the `build_timeline_svg` / `build_timeline_key` MCP tools are left in
place, but the tools will fail until a renderer exists again.

### From the previous system

The old SVG renderer under `scripts/timeline_svg/` read `_history.tsv` and has no input after
the migration. Two notes kept because they were expensive to learn, **not** because the
replacement must work this way:

- Output published into `docs/`, served by GitHub Pages via `.github/workflows/pages.yml`.
  Generated SVGs under `world/` were gitignored on purpose — `docs/` was the published home.
  **All of this is gone**: `docs/` and the workflow are deleted and Pages is disabled on the
  repo. The replacement targets Foundry VTT, not a published site.
- It needed Pillow built **from source** with RAQM linked, which is why `pyproject.toml`
  pins `no-binary-package = ["pillow"]`. A plain wheel silently drops RAQM and text layout
  goes wrong. Setup is scripted: `scripts/setup_pillow_raqm.sh`. Fonts live in `.fonts/`
  (Noto Runic for age glyphs, Alegreya for labels). Relevant only if the replacement also
  rasterises text.
