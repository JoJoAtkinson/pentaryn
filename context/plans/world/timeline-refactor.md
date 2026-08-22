---
title: "Timeline refactor — history TSV to per-event markdown"
status: complete
last_modified: 2026-08-22
tags: [context, plans, world, timeline, migration]
---

# Timeline refactor — history TSV to per-event markdown

**Read this when:** you need to know why history events are one-file-per-event, where the
filename scheme came from, or how to change the dating without breaking the sort order.
**Not this file:** authoring events day to day → [`../../world/timelines.md`](../../world/timelines.md)

**Status:** executed 2026-08-22. 156 events migrated, 11 TSVs deleted, 4 configs moved,
16 published SVG/HTML artifacts deleted.

---

## Why

`_history.tsv` was built for a renderer, not for a person. One row per event, six
tab-separated columns, the whole summary crammed into the last one. It reads fine to a
script and badly to a human, and it can't hold anything a column doesn't already exist for
— no prose, no links, no images, no per-event notes.

Flipping it: one markdown file per event, in a `history/` folder where the TSV used to sit.
Structured fields go in YAML frontmatter, the summary becomes the body, and the body is
free to grow into real prose. The folder itself is the timeline, ordered by filename.

This also makes the vault Obsidian-native — YAML frontmatter is exactly what Obsidian reads
as Properties, with no conversion layer.

## What changes

| Before | After |
|---|---|
| `world/factions/araethilion/_history.tsv` | `world/factions/araethilion/history/*.md` |
| One row, 6 columns | One file, frontmatter + markdown body |
| `summary` column | The file body — full markdown |
| Sorted by the renderer | Sorted by filename |
| `world/factions/ardenhaven/_history.config.toml` | `world/factions/ardenhaven/history/config.toml` |

11 TSV files, **156 events**, 4 configs. (166 is `wc -l` — it counts the 11 header rows.) The TSVs are **deleted** — one source of truth. They remain
recoverable from git history if the migration turns out wrong.

## The config moves too

`_history.config.toml` → `history/config.toml`, in the same `history/` folder as the events.
`history/` becomes the timeline module for a scope: its events, plus the settings that
govern them.

```
world/history/config.toml                          root scope — views only, no events
world/ages/history/config.toml + *.md
world/factions/ardenhaven/history/config.toml + *.md
world/factions/rakthok-horde/history/config.toml + *.md
```

Only 4 configs exist, against 11 event folders. A scope can have events without a config
(it inherits from an ancestor), and — at the root — a config without events.

### Two things the new renderer must handle

Recorded here because they are load-bearing and easy to miss:

1. **Discovery and scope.** Today `history_render.py:23` globs `world_root.rglob("_history.config.toml")`
   and treats the config's parent folder as the scope. After the move the parent is
   `history/`, and the real scope is its *grandparent*. The rule becomes: a
   `history/config.toml` governs its grandparent folder and every `history/` folder beneath it.
2. **`pov_style` sibling lookups.** `pov_icons.py:241` loads the config as a sibling of the
   folder it is styling, and `[pov_style]` colours *that folder's* `icon.svg`, falling back to
   deriving a palette from `_overview.md`. Both `ardenhaven/` and `rakthok-horde/` have those
   siblings. After the move those become `../icon.svg` and `../_overview.md`.

Neither is fixed in this pass — the renderer is being replaced, and this plan does not touch
renderer code. They are requirements on whatever replaces it.

### Why not something Obsidian-native

Checked whether Obsidian's Bases could host the config instead. It covers half:

| Config | Bases equivalent |
|---|---|
| `tags_all` | `filters.and: [file.hasTag("public")]` |
| `tags_any` / `tags_none` | `filters.or:` / `filters.not:` |
| folder scope | `file.inFolder("world/factions/ardenhaven")` |
| `[views.range] start_year` | `year >= 4327` — the integer `year` property makes this work |
| `id` / `title` | `views[].name` |
| `tick_scale`, `tick_spacing_px`, `max_summary_lines` | none |
| `svg_output_dir`, `svg_*_template` | none |
| `[pov_style]` palette / foreground / background / border | **none — Bases has no per-row colour or styling at all** |

So Bases can express *which events and in what order*, but nothing about *how they render*.
The styling half has no Obsidian home, which settles it: TOML keeps the config.

A `.base` file is a **view, not a config** — additive, not a replacement. Worth adding later
as an Obsidian-native way to browse events:

```yaml
filters:
  and:
    - file.inFolder("world/factions/ardenhaven/history")
views:
  - type: table
    name: Ardenhaven history
    order: [file.name, title, date, duration]
```

Out of scope here; it depends on nothing this migration decides.

## Rulings made before execution

Four things the review surfaced that the migration must not decide silently. All four were
ruled on; recorded here so the reasoning survives.

**1. Two day-31 dates are author slips, corrected to day 30.** Every month in this calendar
has 30 days (`game_time.py: DAYS_PER_MONTH = 30`), but `merrowgate:13` "The New Year
Bargain" was dated `4216/12/31` and `merrowgate:26` "The All-Guild Festival" `4276/10/31`.
Both are Gregorian habits — New Year's Eve and 31 October. Corrected to `4216/12/30` and
`4276/10/30`. The old renderer never validated day range (`time_parse.py` has no check) and
silently aliased `4216/12/31` to `4217/01/01` in axis math, so this was already wrong.

**2. The year-0 tie gets a synthetic slot.** `fall-of-the-ancients` and
`age-ash-and-silence` are both dated `0`, and alphabetical order would put the Age *before*
the event it is counted from. The Fall keeps `00000-00-00`; the Age takes `00000-00-01`.

> This is the **one place the filename deliberately diverges from `date`**. Frontmatter keeps
> `date: "0"` verbatim. Verification must special-case it rather than asserting every
> sortkey round-trips.

**3. Per-folder segment uniformity for the hour.** Every file in a single `history/` folder
carries the same number of segments — party folders 4 (`-HH` always, `-00` when unspecified),
everything else 3. Required because an optional trailing segment breaks the scheme's central
invariant: `04327-10-15_council-meets.md` sorts *after* `04327-10-15-22_night-watch.md`,
since `_` is 0x5F and `-` is 0x2D. The divergence can only occur within one folder-day, so
per-folder uniformity closes it without putting a meaningless `-00` on all 135 non-party files.

**4. The published site is taken down entirely.** The 16 tracked
`docs/history.*.{svg,html}` files, `docs/index.html`, `docs/.nojekyll`, and
`.github/workflows/pages.yml` are all deleted, and GitHub Pages is disabled on the repo
(`gh api -X DELETE repos/{owner}/{repo}/pages`). `https://jojoatkinson.github.io/pentaryn/`
now returns 404. The end goal is rendering timelines inside Foundry VTT, not GitHub Pages,
so there was nothing to preserve continuity with. Re-enabling Pages later is a settings
change plus restoring the workflow from git history.

## Filename scheme

```
world/<scope>/history/{sortkey}_{slug}.md
```

`sortkey` is a fixed-width zero-padded date. Fixed width is the whole point: it sorts
identically under byte order (git, `ls`, Python) and under natural sort (Obsidian's file
explorer, macOS Finder, VS Code), which disagree with each other on almost everything else.

| Field | Width | Range | Unspecified |
|---|---|---|---|
| Year | 5 | `00000`–`04337` | — |
| Month | 2 | `01`–`12` | `00` |
| Day | 2 | `01`–`30` | `00` |
| Hour | 2 | `00`–`23` | `00` — present or absent per folder, never mixed |

```
00000-00-00_fall-of-the-ancients.md        year 0, year precision
02127-00-00_sabriel-birth.md               year 2127
04167-06-00_border-skirmish.md             month precision
04185-07-12_the-ashfall-accord.md          day precision
04327-10-15-09_arrival-at-the-docks.md     hour precision (party logs)
99999-00-00_some-unknown-event.md          date unknown — sorts to the end
```

Four precisions exist in the data today: year, `YYYY/MM`, `YYYY/MM/DD`, and
`YYYY/MM/DD-HH`. The hour form is used by 21 events in `world/party/the-compass-edge/`.
`00` in a slot means *unspecified*, not *January* or *midnight* — the real precision is
recorded in frontmatter, and the padding exists only to make the sort total.

### Why 5 digits for a 4-digit year

The 5th digit is reserved, deliberately unused, and currently always `0`.

The world counts from the Fall (year 0 A.F., now 4337). Nothing is dated before it. If
pre-Fall history is ever wanted, negative years break lexical sorting outright — `-0300`
sorts after `4337`. The fix is an **epoch offset**: pick the Fall as `10000`, and pre-Fall
years count *up* toward it rather than down away from it.

| Real date | Encoded |
|---|---|
| 10000 years before the Fall | `00000` |
| 300 before the Fall | `09700` |
| 1 before the Fall | `09999` |
| The Fall (year 0 A.F.) | `10000` |
| 4337 A.F. | `14337` |

Monotonic, no gaps, no collision at the boundary. This is the same trick Obsidian's
worldbuilding tooling uses — Charted Roots calls it `canonical_year = epoch + (year × direction)`.

**We are not applying the offset now.** `12127` is not a year any human recognises, and the
readability cost is real for a feature nobody has asked for yet. Carrying the extra digit
costs one character per filename and makes applying the offset later a pure arithmetic
rename — `year += 10000` across every file, no width change, no scheme change. If that day
comes, write the migration script; don't hand-edit.

Rejected alternative: a prefix character (`_`, `-`, `!`) marking pre-Fall entries. `_` sorts
*after* digits (ASCII 95 vs 48–57), so it fails outright; `-` and `!` work under byte order
but are exactly where locale-aware and natural-sort collations disagree. The offset needs no
prefix — smaller numbers already sort first.

## Frontmatter

```yaml
---
title: Birth of Sabriel
event_id: sabriel_birth
date: "2127"          # original string, original precision
year: 2127            # integer, for range filtering
precision: year       # year | month | day | hour | unknown
duration: 0           # days; 0 for a point event
tags: [araethilion]
aliases: [Birth of Sabriel]
---

Sabriel was born beneath Elaerith's watchful grace…
```

| Field | From | Notes |
|---|---|---|
| `title` | `title` column | |
| `event_id` | `event_id` column | Kept for traceability; duplicates were legal in TSV and stay legal |
| `date` | `date` column | Verbatim, quoted — preserves true precision |
| `year` | parsed | Integer, so Bases/Dataview can filter ranges |
| `precision` | derived | Records what `00` padding is hiding |
| `duration` | `duration` column | Integer days |
| `tags` | `tags` column | Semicolon- or space-separated → YAML list. Obsidian reads these as real tags |
| `aliases` | `title` | So Obsidian autocomplete finds the event by name, not by sortkey |

Body is the `summary` column, and is free to grow past it.

There is deliberately **no** `sort` property duplicating the filename. Both Bases and
Dataview sort on `file.name`, and the filename is already the sort key — a second copy would
only drift.

## Obsidian notes

Obsidian's native `date` property type is **permanently unavailable** here, for a reason
that has nothing to do with the offset: this world's months all have 30 days, so `4327/02/30`
is a real in-world date and an invalid Gregorian one. Roughly one date in twelve can never
be a valid ISO date. Bases is strict about this — a date stored as text does not answer
`dateOnOrAfter()`.

So: `year` as an integer is the filter field, `file.name` is the sort field, and any
date *arithmetic* has to be written by hand — which was true anyway, given a 360-day year.

Plugin-specific properties (Calendarium's `fc-calendar` / `fc-date`, or whatever TTRPG
Tools – Time wants) are mechanically derivable from `date` + `precision` and can be added in
a one-pass script whenever a plugin is actually chosen. Plugin choice does not block this
migration and should not influence its design.

## What this breaks

Most of this breaks **silently** — wrong output, not an error. That is the dangerous part,
and it is why each entry below says which.

Accepted, and deliberately not fixed here:

- **The SVG renderer.** `scripts/timeline_svg/` reads `_history.tsv` via `_read_history_rows`
  and will find no input. Timeline rendering is being redesigned separately; that redesign
  is out of scope for this plan.
- **Config discovery.** `history_render.py:23` globs `_history.config.toml`; that name and
  location both change. `pov_icons.py:241` loses its sibling lookup and falls back silently
  to `_overview.md` palette derivation rather than erroring. See *The config moves too*.
- **`build_timeline_svg` / `build_timeline_key`** MCP tools are left untouched and will fail
  until the renderer is replaced.
- **The age MCP tools — `age_convert`, `year_to_age`, `age_to_year` — go SILENTLY WRONG.**
  `ages.py:55` returns an empty `AgeIndex` when `world/ages/_history.tsv` is missing, and
  `format_year` (`ages.py:130-133`) then falls back to `return str(year)`. So `age_convert("4150")`
  returns `"4150"` instead of `"ᛏ200"` with no warning. These tools are in the CLAUDE.md
  route table and recommended by `context/tools.md:58`. Worst failure mode in this migration.
- **`ages_converter.py:116` hardcodes `world/_history.config.toml`** for `present_year` and
  returns `None` silently when absent (`:118`). Broken by the config **move**, not the TSV
  deletion. Downstream, `age_convert("-50")` raises an error telling you to edit a file that
  no longer exists (`:133`).
- **`scripts/lore_inconsistencies.py` degrades SILENTLY.** `_discover_history_event_ids`
  (`:227-229`) filters on the filename `_history.tsv` and returns `[]` — the
  `lore_inconsistency_report` MCP tool then reports "History entities: True" while checking
  zero. It will also begin chunking the new `history/*.md` as generic markdown (`:315`),
  which is arguably an upgrade but was nobody's decision.
- **`docs/` serves stale timelines forever.** 16 tracked `docs/history.*.{svg,html}` files are
  published by `.github/workflows/pages.yml`, which has no build step — it uploads `docs/`
  as-is. The Pages site keeps serving pre-migration renders, drifting indefinitely.
- **Tests** under `scripts/tests/` that construct `_history.tsv` fixtures still pass — they
  build their own temp files — but they now test a format nothing writes.

Stale references to repair (documentation only, no behaviour):

| File | Line |
|---|---|
| `context/world/README.md` | 32 — party folder contents |
| `templates/party-template.md` | 21, 79 — links to `./_history.tsv` |
| `campaigns/ardenford-underdogs/_overview.md` | 21 — links to `world/ages/_history.tsv` |
| `sessions/0{1,2,3,4}/config.toml` | comment naming the TSV path |
| `sessions/08/notes/*.md` | 3 source links into `elderholt/_history.tsv` |
| `scripts/timeline_svg/AGENTS.md` | 7 refs — **auto-loaded agent instructions**, will actively misdirect |
| `scripts/timeline_svg/README.md` | 9 refs |
| `context/tools.md` | 58 — recommends `age_convert`; 66 — `build_timeline_svg` row needs a broken-until-replaced note |

## Execution

0. **Emit frontmatter with a real YAML emitter** (`yaml.safe_dump`), never string
   templates. One title contains a comma — `Cinder Appeased, Crow Dispatched`
   (`the-compass-edge:14`) — which flow-style `aliases: [Title]` would silently split into
   two aliases. 24 titles contain apostrophes; one contains `&` and a leading runic glyph
   (`⟂ Age of Ash & Silence`). A proper emitter makes this entire class of hazard vanish.
1. Write a one-shot migration script (throwaway — it does not belong in `scripts/`).
   Parse with `splitlines()` — `rakthok-horde/_history.tsv` has no trailing newline and a
   reader requiring `\n` terminators drops its last row. Strip every cell: 145 of 156 rows
   are space-padded for alignment, matching what `history_render.py:244` already does.
   Slug = `event_id.replace("_", "-")`; event_ids are already `[a-z0-9_-]`, so nothing
   fancier is needed. Process rows in TSV order so collision suffixes are deterministic
   across re-runs.
2. For each of the 11 `_history.tsv` files: parse rows, derive sortkey and slug, emit
   `history/*.md` beside it.
3. Verify: event count in equals file count out, per folder; every filename unique; every
   sortkey parses back to its `date` field.
4. Delete the 11 TSVs and the 16 `docs/history.*.{svg,html}` artifacts.
5. `git mv` the 4 configs into their `history/` folders as `config.toml`, creating
   `world/history/` for the root config (views only, no events).
6. Repair the stale doc references above.
7. Rewrite [`../../world/timelines.md`](../../world/timelines.md) as the use-doc.

Collision risk: TSV allowed duplicate `event_id`s, and two events could share a date and a
slug. Filenames cannot collide — on collision, suffix `-2`, `-3`. The migration must fail
loudly rather than silently overwrite.

## Out of scope

How timelines get *rendered* from the new folders. That is a separate decision, deliberately
deferred — the point of this refactor is to make the event data good enough that the
renderer becomes a free choice rather than a constraint.

The likely direction is **not** another SVG-into-`docs/` pipeline. The target under
consideration is rendering a timeline as a character artifact or a tab inside Foundry VTT,
letting the existing repo → Foundry porting tooling do the heavy lifting of getting it
there. Design is being driven by how it should *look at the table* first, with the transport
treated as solved. Nothing in this migration assumes an output format, which is the point.
