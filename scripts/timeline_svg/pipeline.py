from __future__ import annotations

import base64
import math
from pathlib import Path

from .game_time import date_to_axis_days, format_game_date_label, month_name, time_of_day_label
from .lane_assign import assign_lanes, sort_events
from .layout_energy import refine_layout
from .layout_grow import grow_downward
from .layout_pack import pack_lane, snap_to_targets_when_clear, tighten_upward_gaps
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
from .tags import TagCatalog
from .ages import AgeIndex
from .pov_icons import PovCatalog


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


def _axis_base_y(axis_map: "AxisMap", axis_day: float) -> float:
    """
    Compute the y position for an axis_day *without* any slack steps applied.

    Slack steps represent non-linear "growth" inserted to reduce label displacement; when we need
    the linear component only (to re-derive px/day), we subtract them out via this helper.
    """

    if axis_map.direction == "desc":
        return axis_map.top_y + (axis_map.max_axis - axis_day) * axis_map.px_per_day
    return axis_map.top_y + (axis_day - axis_map.min_axis) * axis_map.px_per_day


def _maybe_expand_axis_to_fill_spine(
    axis_map: "AxisMap",
    *,
    events: list[Event],
    spine_bottom_y: float,
    min_gap_px: float,
) -> "AxisMap":
    """
    If the label layout forces the SVG taller than the axis span, the spine can extend below the
    last tick/token, leaving a visually "dead" segment of timeline at the bottom.

    We keep the existing label layout (95% of the work) and *only* expand the time→y mapping so
    the bottom-most axis boundary lands at the spine bottom. This makes ticks reach the end and
    updates connector start points (tokens) to match the new spacing, without re-packing labels.
    """

    axis_span_days = axis_map.max_axis - axis_map.min_axis
    if axis_span_days <= 0:
        return axis_map

    axis_end_day = axis_map.min_axis if axis_map.direction == "desc" else axis_map.max_axis
    axis_end_y = axis_map.axis_to_y(axis_end_day)
    gap_px = float(spine_bottom_y) - float(axis_end_y)
    if gap_px <= float(min_gap_px):
        return axis_map

    # Compute the slack contribution at the end boundary so we can solve for the linear px/day
    # needed to land the end exactly at `spine_bottom_y`.
    base_end_y = _axis_base_y(axis_map, axis_end_day)
    extra_end_y = axis_end_y - base_end_y

    px_per_day_new = (float(spine_bottom_y) - float(axis_map.top_y) - float(extra_end_y)) / float(axis_span_days)
    if px_per_day_new <= axis_map.px_per_day:
        return axis_map

    axis_map_new = make_axis_map(
        axis_map.direction,
        min_axis=axis_map.min_axis,
        max_axis=axis_map.max_axis,
        top_y=axis_map.top_y,
        px_per_year=px_per_day_new * 360.0,
    )
    axis_map_new.slack_steps.extend(axis_map.slack_steps)

    for event in events:
        event.y_target = axis_map_new.axis_to_y(event.axis_day)

    return axis_map_new


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
    pov_catalog: PovCatalog | None = None,
    scope_pov: str | None = None,
) -> None:
    if not input_tsv.exists():
        if input_tsv.parent.name == ".timeline_data" and input_tsv.name == "timeline.tsv":
            write_sample_tsv(input_tsv)
        else:
            raise FileNotFoundError(f"Input TSV not found: {input_tsv}")

    rows = read_tsv(input_tsv)

    events: list[Event] = []
    for row in rows:
        has_month = False
        has_day = False
        has_hour = False
        if "/" in row.start_year:
            parts = [p.strip() for p in row.start_year.split("/") if p.strip()]
            has_month = len(parts) >= 2
            has_day = len(parts) >= 3
            if has_day and "-" in parts[2]:
                has_hour = True
        else:
            has_month = bool(row.start_month)
            has_day = bool(row.start_day)
            has_hour = "-" in (row.start_day or "")

        start = parse_game_date(row.start_year, row.start_month, row.start_day)
        axis_day = date_to_axis_days(start)
        events.append(
            Event(
                event_id=row.event_id,
                pov=row.pov,
                kind=row.kind,
                title=row.title,
                summary=row.summary,
                factions=row.factions,
                tags=row.tags,
                start=start,
                has_month=has_month,
                has_day=has_day,
                has_hour=has_hour,
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

    # Load ages for formatting if enabled
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
        
        if event.has_month:
            year_label = ages.format_year(event.start.year) if ages is not None else str(event.start.year)
            tod = time_of_day_label(event.start.hour) if event.has_hour else ""
            if event.has_day:
                if tod:
                    date_label = f"{event.start.day} {month_name(event.start.month)}, {tod} — {year_label}"
                else:
                    date_label = f"{event.start.day} {month_name(event.start.month)} — {year_label}"
            else:
                date_label = f"{month_name(event.start.month)} — {year_label}"
        elif ages is not None:
            date_label = ages.format_year(event.start.year)
        else:
            date_label = str(event.start.year)
        
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
            date_label=date_label,
        )

    days_per_year = 12 * 30
    if events_sorted:
        min_axis_float = min(e.axis_day for e in events_sorted)
        max_axis_float = max(e.axis_day for e in events_sorted)
        min_axis = int(math.floor(min_axis_float))
        max_axis = int(math.ceil(max_axis_float))
    else:
        # Allow rendering views that match zero events (e.g. tag-filtered views).
        # Default to a 1-year span unless axis bounds are provided.
        min_axis = 0
        max_axis = days_per_year - 1
    if build.axis_min_year is not None:
        min_axis_override = int(build.axis_min_year) * days_per_year
        min_axis = min(min_axis, min_axis_override)
    if build.axis_max_year is not None:
        # Treat an axis bound as an inclusive year bound.
        max_axis_override = int(build.axis_max_year) * days_per_year + (days_per_year - 1)
        max_axis = max(max_axis, max_axis_override)
    if build.axis_min_day is not None:
        min_axis = min(min_axis, int(build.axis_min_day))
    if build.axis_max_day is not None:
        max_axis = max(max_axis, int(build.axis_max_day))
    if max_axis < min_axis:
        max_axis = min_axis
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
        # Extend the axis down to the previous tick boundary so the first/last decade marker
        # doesn't disappear when the earliest event is a year or two after the boundary.
        if build.axis_min_year is None:
            min_axis = min_axis - (min_axis % step)

    axis_map = make_axis_map(build.sort_direction, min_axis=min_axis, max_axis=max_axis, top_y=renderer.margin_top, px_per_year=px_per_year)

    if events_sorted:
        for event in events_sorted:
            event.y_target = axis_map.axis_to_y(event.axis_day)
            event.y = max(float(renderer.margin_top), event.y_target - (event.box_h / 2.0))

        for lane in ("left", "right"):
            pack_lane([e for e in events_sorted if e.lane == lane], lane_gap_y=renderer.lane_gap_y, min_y=float(renderer.margin_top))
        refine_layout(
            events_sorted,
            lane_gap_y=renderer.lane_gap_y,
            opt_iters=build.opt_iters,
            min_y=float(renderer.margin_top),
        )

        grow_downward(
            events_sorted,
            direction=build.sort_direction,
            lane_gap_y=renderer.lane_gap_y,
            opt_iters=build.opt_iters,
            min_y=float(renderer.margin_top),
            max_displacement_px=build.max_displacement_px,
            max_grow_passes=build.max_grow_passes,
            slack_fraction=build.slack_fraction,
            slack_steps=axis_map.slack_steps,
        )
        snap_to_targets_when_clear(events_sorted, lane_gap_y=renderer.lane_gap_y, min_y=float(renderer.margin_top))
        tighten_upward_gaps(events_sorted, lane_gap_y=renderer.lane_gap_y, min_y=float(renderer.margin_top))

    content_bottom = max((e.y + e.box_h) for e in events_sorted) if events_sorted else float(renderer.margin_top)
    height = int(math.ceil(content_bottom + renderer.margin_bottom))
    spine_bottom_y = float(height - renderer.margin_bottom)

    # If labels pushed the required height beyond the axis span, expand the tick spacing so the
    # axis/ticks reach the bottom of the spine instead of ending early and leaving unused timeline.
    if events_sorted:
        axis_map = _maybe_expand_axis_to_fill_spine(
            axis_map,
            events=events_sorted,
            spine_bottom_y=spine_bottom_y,
            min_gap_px=max(30.0, float(renderer.lane_gap_y) * 2.0),
        )
    
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

    # Faction icons (used when faction slugs are included in the tags list).
    pov_defs = ""
    faction_tags: set[str] = set()
    if pov_catalog is not None:
        for event in events_sorted:
            event.badge_pov = None
            for tag in event.tags:
                if pov_catalog.has_icon(tag):
                    faction_tags.add(tag)
        pov_defs = pov_catalog.build_defs(sorted(faction_tags))

    tag_defs = ""
    tag_icons: set[str] | None = None
    try:
        catalog = TagCatalog.load((repo_root / "scripts" / "timeline_svg" / "assets" / "tags").resolve())
        tag_icons = catalog.known_tags()
        used_tags: list[str] = []
        for event in events_sorted:
            for tag in event.tags:
                if tag not in faction_tags:
                    used_tags.append(tag)
        tag_defs = catalog.build_defs(used_tags)
    except Exception:
        tag_defs = ""
        tag_icons = None

    render_svg(
        layout=layout,
        renderer=renderer,
        defs_fragment=defs_fragment,
        output_path=output_svg,
        build=build,
        extra_css=extra_css,
        tags_fragment=tag_defs,
        povs_fragment=pov_defs,
        faction_tags=faction_tags,
        tag_icons=tag_icons,
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
