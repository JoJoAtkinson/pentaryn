from __future__ import annotations

import base64
from pathlib import Path

from .game_time import date_to_axis_days
from .lane_assign import assign_lanes, sort_events
from .layout_energy import refine_layout
from .layout_grow import grow_downward
from .layout_pack import pack_lane
from .model import (
    BuildConfig,
    Event,
    FontPaths,
    LabelLayout,
    LayoutResult,
    MeasureConfig,
    RendererConfig,
)
from .text_measure import text_height
from .ticks import build_ticks, choose_tick_scale, step_days
from .time_map import make_axis_map
from .time_parse import parse_game_date
from .tsv_io import read_tsv, write_sample_tsv
from .validate import assert_valid, validate_layout
from .wrap import wrap_title_and_summary
from .svg_render import render_svg
from .ages import AgeIndex


def _font_face_css(fonts: FontPaths) -> str:
    regular_bytes = Path(fonts.regular).read_bytes()
    italic_bytes = Path(fonts.italic).read_bytes()
    regular_b64 = base64.b64encode(regular_bytes).decode("ascii")
    italic_b64 = base64.b64encode(italic_bytes).decode("ascii")
    css = (
        "@font-face {\n"
        "  font-family: 'Alegreya';\n"
        "  src: url('data:font/ttf;base64,"
        + regular_b64
        + "') format('truetype');\n"
        "  font-style: normal;\n"
        "  font-weight: 100 900;\n"
        "}\n"
        "@font-face {\n"
        "  font-family: 'Alegreya';\n"
        "  src: url('data:font/ttf;base64,"
        + italic_b64
        + "') format('truetype');\n"
        "  font-style: italic;\n"
        "  font-weight: 100 900;\n"
        "}\n"
    )

    if fonts.symbols:
        sym_bytes = Path(fonts.symbols).read_bytes()
        sym_b64 = base64.b64encode(sym_bytes).decode("ascii")
        css += (
            "@font-face {\n"
            "  font-family: 'Noto Sans Symbols 2';\n"
            "  src: url('data:font/ttf;base64,"
            + sym_b64
            + "') format('truetype');\n"
            "  font-style: normal;\n"
            "  font-weight: 400;\n"
            "}\n"
        )

    if fonts.runic:
        runic_bytes = Path(fonts.runic).read_bytes()
        runic_b64 = base64.b64encode(runic_bytes).decode("ascii")
        css += (
            "@font-face {\n"
            "  font-family: 'Noto Sans Runic';\n"
            "  src: url('data:font/ttf;base64,"
            + runic_b64
            + "') format('truetype');\n"
            "  font-style: normal;\n"
            "  font-weight: 400;\n"
            "}\n"
        )

    return css


def build_timeline_svg(
    *,
    repo_root: Path,
    input_tsv: Path,
    defs_fragment_path: Path,
    output_svg: Path,
    output_png: Path,
    fonts: FontPaths,
    measure: MeasureConfig,
    renderer: RendererConfig,
    build: BuildConfig,
) -> None:
    if not input_tsv.exists():
        if input_tsv.parent.name == ".timeline_data" and input_tsv.name == "timeline.tsv":
            write_sample_tsv(input_tsv)
        else:
            raise FileNotFoundError(f"Input TSV not found: {input_tsv}")

    rows = read_tsv(input_tsv)

    events: list[Event] = []
    for row in rows:
        start = parse_game_date(row.start_year, row.start_month, row.start_day)
        axis_day = date_to_axis_days(start)
        events.append(
            Event(
                event_id=row.event_id,
                kind=row.kind,
                title=row.title,
                summary=row.summary,
                start=start,
                axis_day=axis_day,
                lane="left",
                y_target=0.0,
                y=0.0,
                box_w=0.0,
                box_h=0.0,
                label=LabelLayout(
                    title_lines=[],
                    summary_lines=[],
                    content_w=0.0,
                    content_h=0.0,
                    title_line_h=0.0,
                    summary_line_h=0.0,
                    line_gap=0.0,
                ),
            )
        )

    events_sorted = sort_events(events, build.sort_direction)
    assign_lanes(events_sorted)

    # Measure + wrap text, compute box sizes.
    title_weight = 700
    summary_weight = 400
    title_line_h = text_height(fonts.regular, measure.title_size, weight=title_weight)
    summary_line_h = text_height(fonts.regular, measure.summary_size, weight=summary_weight)
    text_max_w = max(20, renderer.label_max_width - 2 * renderer.label_padding_x)
    line_gap = 6

    for event in events_sorted:
        wrapped = wrap_title_and_summary(
            title=event.title,
            summary=event.summary,
            max_width=text_max_w,
            title_font_path=fonts.regular,
            title_font_size=measure.title_size,
            title_font_weight=title_weight,
            summary_font_path=fonts.regular,
            summary_font_size=measure.summary_size,
            summary_font_weight=summary_weight,
            max_summary_lines=measure.max_summary_lines,
            line_gap=line_gap,
            title_line_h=title_line_h,
            summary_line_h=summary_line_h,
        )
        content_w = min(float(text_max_w), wrapped.width)
        content_h = wrapped.height
        # Safety margin helps prevent sub-pixel rounding / renderer differences.
        box_w = min(float(renderer.label_max_width), content_w + 2 * renderer.label_padding_x + 2)
        box_h = content_h + 2 * renderer.label_padding_y
        event.box_w = box_w
        event.box_h = box_h
        event.label = LabelLayout(
            title_lines=wrapped.title_lines,
            summary_lines=wrapped.summary_lines,
            content_w=content_w,
            content_h=content_h,
            title_line_h=title_line_h,
            summary_line_h=summary_line_h,
            line_gap=float(line_gap),
        )

    min_axis = min(e.axis_day for e in events_sorted)
    max_axis = max(e.axis_day for e in events_sorted)
    days_per_year = 12 * 30
    if build.axis_min_year is not None:
        min_axis_override = int(build.axis_min_year) * days_per_year
        if min_axis_override < min_axis:
            min_axis = min_axis_override
    if build.axis_max_year is not None:
        # Treat an axis bound as an inclusive year bound.
        max_axis_override = int(build.axis_max_year) * days_per_year + (days_per_year - 1)
        if max_axis_override > max_axis:
            max_axis = max_axis_override
    axis_span = max_axis - min_axis

    # If tick_scale is explicit, keep spacing between ticks constant by deriving the px/year scale
    # from (tick spacing px) / (step size).
    px_per_year = build.px_per_year
    fixed_tick_scale = None
    if build.tick_scale != "auto":
        fixed_tick_scale = build.tick_scale  # type: ignore[assignment]
        step = step_days(fixed_tick_scale)  # days
        years_per_tick = step / 360.0
        px_per_year = build.tick_spacing_px / years_per_tick

    axis_map = make_axis_map(build.sort_direction, min_axis=min_axis, max_axis=max_axis, top_y=renderer.margin_top, px_per_year=px_per_year)

    for event in events_sorted:
        event.y_target = axis_map.axis_to_y(event.axis_day)
        event.y = event.y_target

    for lane in ("left", "right"):
        pack_lane([e for e in events_sorted if e.lane == lane], lane_gap_y=renderer.lane_gap_y)
    refine_layout(events_sorted, lane_gap_y=renderer.lane_gap_y, opt_iters=build.opt_iters)

    grow_downward(
        events_sorted,
        direction=build.sort_direction,
        lane_gap_y=renderer.lane_gap_y,
        opt_iters=build.opt_iters,
        max_displacement_px=build.max_displacement_px,
        max_grow_passes=build.max_grow_passes,
        slack_fraction=build.slack_fraction,
        slack_steps=axis_map.slack_steps,
    )

    content_bottom = max(e.y + e.box_h for e in events_sorted) if events_sorted else float(renderer.margin_top)
    height = int(content_bottom + renderer.margin_bottom)
    ages = None
    if build.age_glyph_years:
        try:
            ages = AgeIndex.load_global(repo_root, debug=build.debug_age_glyphs)
        except Exception as exc:
            import logging
            import traceback

            logging.getLogger(__name__).error(
                "Failed to load ages for glyph formatting; falling back to absolute years.\n%s",
                "".join(traceback.format_exception(exc)),
            )
            ages = None
    tick_scale = None
    ticks = []
    if build.render_ticks:
        if fixed_tick_scale is not None:
            tick_scale = fixed_tick_scale
            ticks = build_ticks(axis_map, scale=tick_scale, tick_min_spacing_px=0, ages=ages)
        else:
            tick_scale = choose_tick_scale(
                height_px=max(1, height - renderer.margin_top - renderer.margin_bottom),
                axis_span_days=max(1, axis_span),
                tick_min_spacing_px=build.tick_min_spacing_px,
                px_per_day=axis_map.px_per_day,
            )
            ticks = build_ticks(axis_map, scale=tick_scale, tick_min_spacing_px=build.tick_min_spacing_px, ages=ages)

    layout = LayoutResult(events=events_sorted, ticks=ticks, height=height, spine_x=renderer.spine_x)

    defs_fragment = defs_fragment_path.read_text(encoding="utf-8")
    extra_css = _font_face_css(fonts) if build.embed_fonts else ""
    render_svg(
        layout=layout,
        renderer=renderer,
        defs_fragment=defs_fragment,
        output_path=output_svg,
        build=build,
        extra_css=extra_css,
    )

    validation = validate_layout(layout, renderer=renderer)
    assert_valid(validation)

    if build.enable_png_sanity:
        try:
            import cairosvg  # type: ignore
        except Exception:
            return
        output_png.parent.mkdir(parents=True, exist_ok=True)
        cairosvg.svg2png(url=str(output_svg), write_to=str(output_png))
        if not output_png.exists() or output_png.stat().st_size == 0:
            raise RuntimeError(f"PNG sanity render failed: {output_png}")
