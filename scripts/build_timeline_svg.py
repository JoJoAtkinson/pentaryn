#!/usr/bin/env python3

from __future__ import annotations

import sys
import logging
import os
from pathlib import Path

MCP_TOOL = {
    "name": "build_timeline_svg",
    "description": (
        "Build/regenerate timeline SVGs from the repo's history TSV files and `world/**/_history.config.toml` views "
        "using the SVG-first workflow (writes outputs to the configured output paths, e.g. `.output/` and view SVG files)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
    "argv": [],
}

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

FONT_ROOT = Path(".fonts") if Path(".fonts").exists() else Path("fonts")

FONT_PATHS = FontPaths(
    regular=str(FONT_ROOT / "alegreya" / "Alegreya[wght].ttf"),
    italic=str(FONT_ROOT / "alegreya" / "Alegreya-Italic[wght].ttf"),
    symbols=str(FONT_ROOT / "noto" / "NotoSansSymbols2-Regular.ttf"),
    runic=str(FONT_ROOT / "noto" / "NotoSansRunic-Regular.ttf"),
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
    # Dense decades can otherwise cause extreme axis stretching (large whitespace between ticks/events).
    # Allow more displacement so events can stack without blowing out the time scale.
    max_displacement_px=1200,
    max_grow_passes=12,
    slack_fraction=0.45,
    px_per_year=72,
    token_size=22,
    connectors=True,
    enable_png_sanity=False,
    age_glyph_years=True,
    debug_age_glyphs=True,
    highlight_git_id_changes=os.environ.get("TIMELINE_HIGHLIGHT_GIT_ID_CHANGES", "1").strip().lower() not in {"0", "false", "no"},
    git_base_ref=os.environ.get("TIMELINE_GIT_BASE_REF", "HEAD~1").strip() or "HEAD~1",
)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
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

        # Also write a static legend for icons/symbols so the SVG views are self-explanatory.
        try:
            from scripts.build_timeline_key import build_timeline_key

            build_timeline_key(repo_root=REPO_ROOT, output=(REPO_ROOT / "timeline-key.svg"))
        except Exception as exc:
            logging.getLogger(__name__).warning("Failed to build timeline key: %s", exc)
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

    # Also write a static legend for icons/symbols so the SVG views are self-explanatory.
    try:
        from scripts.build_timeline_key import build_timeline_key

        build_timeline_key(repo_root=REPO_ROOT, output=(REPO_ROOT / "timeline-key.svg"))
    except Exception as exc:
        logging.getLogger(__name__).warning("Failed to build timeline key: %s", exc)


if __name__ == "__main__":
    main()
