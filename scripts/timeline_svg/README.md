# Timeline SVG Renderer

This is an experimental SVG timeline renderer for the TSV timelines generated elsewhere in this repo.

## Run

- `./venv/bin/python scripts/build_timeline_svg.py`

## Pillow + RAQM (text layout)

To avoid text measurement mismatches (spill/overflow) between Pillow and your SVG viewer, this renderer expects Pillow to be built with RAQM enabled.

- One-time setup: `scripts/setup_pillow_raqm.sh` (also runs `uv lock` by default; pass `--no-lock` to skip)
- Verify: `./venv/bin/python -c "from PIL import features; print('raqm:', features.check('raqm'))"`

## Inputs/outputs

SVG-first workflow:

- Put `_history.tsv` (or legacy `_timeline.tsv`) anywhere under `world/`.
- Put `_history.config.toml` in any `world/**` folder to render SVG views for that folder scope (that folder + subfolders).
- Running `scripts/build_timeline_svg.py` discovers all `_history.config.toml` files under `world/` and writes SVGs next to them.
  - Optional: set `present_year = 4327` (or similar) at the top of `world/_history.config.toml` to extend axis/ticks to “now” for all scopes (sub-scope configs inherit it unless they override).

Debug:

- Preprocessed TSV exports are written under `.output/history/` (gitignored) for inspection/debugging.

Legacy/demo mode:

- Input TSV (created if missing): `.timeline_data/timeline.tsv`
- Output SVG: `output/timeline.svg`

## TSV schema (minimum)

The renderer accepts either of these schemas (extra columns are ignored):

- SVG-native schema:
  - `event_id`, `kind`, `start_year`, `start_month`, `start_day`, `title`, `summary`
- Generator/export schema:
  - `event_id`, `start` (`YYYY` / `YYYY-MM` / `YYYY-MM-DD`), `title`, `summary`, `kind` (optional)

`start_year` also supports `YYYY/MM/DD` when using the SVG-native schema.

- `event_id`
- `kind`
- `start_year` (supports `YYYY` or `YYYY/MM/DD`)
- `start_month`
- `start_day`
- `title`
- `summary`

## Tokens (defs / symbols)

SVG tokens are defined in:

- `scripts/timeline_svg/templates/defs_symbols.svgfrag`

Rendering uses `<use href="#token_default" .../>` for now. Future work can map `kind` → different symbols, but today all kinds resolve to `token_default`.

### Icon source

When adding new token shapes/icons, this project pulls icon inspiration from `https://game-icons.net/`.

## Tag icons (canonical tag vocabulary)

History events can be tagged (TSV `tags` column). This repo treats tags as a controlled vocabulary:

- Canonical tag icons live in `scripts/timeline_svg/assets/tags/`.
- When creating/updating `_history.tsv`, only use tags that have a matching icon filename in that folder (e.g., tag `city-state` → `scripts/timeline_svg/assets/tags/city-state.svg`).

## Tick scale

Tick labels automatically choose a coarse scale based on the final SVG height:

- `millennium` / `century` / `decade` for long spans
- `year` / `month` / `day` for shorter spans

If you want changing the scale to shrink/expand the whole timeline, set a fixed scale in `scripts/build_timeline_svg.py`:

- `tick_scale="decade"` (or `century`, `year`, etc.)
- `tick_spacing_px=72` (controls the vertical pixels between ticks)

With a fixed tick scale, the time axis uses a derived `px_per_year` so each tick step is exactly `tick_spacing_px` apart (before any layout “slack” insertions).

## Age glyph year labels

If `BuildConfig.age_glyph_years=true`, tick labels render as `<age-glyph><years-into-age>` using the global age windows in `world/ages/_history.tsv`.

Example:

- `⋈50` means “50 years into the Age of Trade”

To make sure these glyphs render reliably on any machine (and in GitHub), the build embeds:

- `fonts/noto/NotoSansSymbols2-Regular.ttf` (symbols like `⊚ ⟂ ⋂ ⋈`)
- `fonts/noto/NotoSansRunic-Regular.ttf` (runes like `ᛒ ᛉ ᛏ`)
