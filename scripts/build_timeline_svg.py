#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.timeline_svg.model import BuildConfig, FontPaths, MeasureConfig, RendererConfig

# Knobs
USE_HISTORY_SYSTEM = True
WORLD_ROOT = Path("world")

# Legacy (kept for experimentation / fallback)
INPUT_TSV = Path(".timeline_data/timeline.tsv")
TIMELINE_CONFIG = Path("world/history/timeline.config.toml")
TIMELINE_VIEW_ID = "master_graph"
USE_CONFIG_TSV = True
DEFS_FRAGMENT = Path("scripts/timeline_svg/templates/defs_symbols.svgfrag")
OUTPUT_SVG = Path(".output/timeline.svg")
OUTPUT_PNG = Path(".output/timeline.png")

FONT_PATHS = FontPaths(
    regular="fonts/alegreya/Alegreya[wght].ttf",
    italic="fonts/alegreya/Alegreya-Italic[wght].ttf",
)

MEASURE = MeasureConfig(title_size=16, summary_size=12, date_size=12, max_summary_lines=3)

RENDERER = RendererConfig(
    width=1200,
    margin_top=40,
    margin_bottom=40,
    margin_x=40,
    spine_x=600,
    spine_to_label_gap=54,
    connector_into_box_px=6,
    label_max_width=420,
    label_padding_x=16,
    label_padding_y=14,
    lane_gap_y=14,
)

BUILD = BuildConfig(
    sort_direction="desc",
    render_ticks=True,
    tick_min_spacing_px=64,
    tick_scale="decade",
    tick_spacing_px=72,
    embed_fonts=True,
    opt_iters=40,
    max_displacement_px=80,
    max_grow_passes=12,
    slack_fraction=0.45,
    px_per_year=72,
    token_size=22,
    connectors=True,
    enable_png_sanity=False,
    age_glyph_years=True,
)


def main() -> None:
    from scripts.timeline_svg import preflight_pillow_raqm

    preflight = preflight_pillow_raqm()
    if not preflight.ok:
        print(preflight.message)
        raise SystemExit(2)

    if USE_HISTORY_SYSTEM:
        from scripts.timeline_svg.history_render import render_history_scopes

        render_history_scopes(
            repo_root=REPO_ROOT,
            world_root=(REPO_ROOT / WORLD_ROOT).resolve(),
            fonts=FONT_PATHS,
            measure=MEASURE,
            renderer=RENDERER,
            build=BUILD,
            defs_fragment_path=DEFS_FRAGMENT,
            debug_write_tsv=True,
        )
        return

    input_tsv = INPUT_TSV
    if USE_CONFIG_TSV:
        from scripts.timeline_svg.timeline_generate import generate_from_config

        config_path = (REPO_ROOT / TIMELINE_CONFIG).resolve()
        if not config_path.exists():
            raise SystemExit(f"Config file not found: {config_path}")
        result = generate_from_config(
            root=REPO_ROOT,
            config_path=config_path,
            only_view_ids={TIMELINE_VIEW_ID},
            only_types={"tsv"},
            quiet=True,
        )
        if TIMELINE_VIEW_ID not in result.tsv_exports:
            raise SystemExit(
                f"View '{TIMELINE_VIEW_ID}' did not produce a TSV export. Add `tsv_output = ...` to the view in {config_path}."
            )
        input_tsv = result.tsv_exports[TIMELINE_VIEW_ID]

    from scripts.timeline_svg.pipeline import build_timeline_svg

    build_timeline_svg(
        repo_root=REPO_ROOT,
        input_tsv=input_tsv,
        defs_fragment_path=DEFS_FRAGMENT,
        output_svg=OUTPUT_SVG,
        output_png=OUTPUT_PNG,
        fonts=FONT_PATHS,
        measure=MEASURE,
        renderer=RENDERER,
        build=BUILD,
    )


if __name__ == "__main__":
    main()
