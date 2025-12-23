from __future__ import annotations

from pathlib import Path

import pytest

from scripts.timeline_svg.game_time import date_to_axis_days
from scripts.timeline_svg.lane_assign import assign_lanes, sort_events
from scripts.timeline_svg.layout_grow import grow_downward, max_displacement
from scripts.timeline_svg.layout_pack import pack_lane
from scripts.timeline_svg.model import BuildConfig, Event, FontPaths, LabelLayout, RendererConfig
from scripts.timeline_svg.text_measure import text_height, text_width
from scripts.timeline_svg.time_map import make_axis_map
from scripts.timeline_svg.time_parse import parse_game_date
from scripts.timeline_svg.ticks import choose_tick_scale, step_days
from scripts.timeline_svg.tsv_io import read_tsv
from scripts.timeline_svg.wrap import wrap_lines


def _dummy_label() -> LabelLayout:
    return LabelLayout(
        title_lines=["x"],
        summary_lines=[],
        content_w=0.0,
        content_h=0.0,
        title_line_h=16.0,
        summary_line_h=12.0,
        line_gap=6.0,
    )


def _event(event_id: str, axis_day: int) -> Event:
    return Event(
        event_id=event_id,
        kind="event",
        title=event_id,
        summary="",
        start=parse_game_date("0", "", ""),
        axis_day=axis_day,
        lane="left",
        y_target=0.0,
        y=0.0,
        box_w=200.0,
        box_h=40.0,
        label=_dummy_label(),
    )


def test_parse_game_date_year_only() -> None:
    d = parse_game_date("4150", "", "")
    assert (d.year, d.month, d.day) == (4150, 1, 1)


def test_parse_game_date_composite() -> None:
    d = parse_game_date("4150/02/13", "", "")
    assert (d.year, d.month, d.day) == (4150, 2, 13)


def test_sort_direction() -> None:
    a = _event("a", 10)
    b = _event("b", 20)
    assert [e.event_id for e in sort_events([a, b], "asc")] == ["a", "b"]
    assert [e.event_id for e in sort_events([a, b], "desc")] == ["b", "a"]


def test_lane_alternation_stable() -> None:
    events = [_event(str(i), i) for i in range(6)]
    events_sorted = sort_events(events, "asc")
    assign_lanes(events_sorted)
    assert [e.lane for e in events_sorted] == ["left", "right", "left", "right", "left", "right"]


def test_wrap_obeys_max_width() -> None:
    font_path = Path("fonts/alegreya/Alegreya[wght].ttf")
    if not font_path.exists():
        pytest.skip("Alegreya fonts missing")
    max_w = 180
    lines = wrap_lines(
        "This is a long line that should wrap into multiple lines for testing purposes",
        max_width=max_w,
        font_path=str(font_path),
        font_size=12,
    )
    assert len(lines) >= 2
    for line in lines:
        assert text_width(line, str(font_path), 12) <= max_w + 0.5


def test_bold_title_measurement_is_wider() -> None:
    font_path = Path("fonts/alegreya/Alegreya[wght].ttf")
    if not font_path.exists():
        pytest.skip("Alegreya fonts missing")
    s = "Border Signal Mission"
    regular = text_width(s, str(font_path), 16, weight=400)
    boldish = text_width(s, str(font_path), 16, weight=700)
    assert boldish >= regular


def test_read_tsv_accepts_generator_export_schema(tmp_path: Path) -> None:
    p = tmp_path / "export.tsv"
    p.write_text(
        "\t".join(["event_id", "start", "end", "title", "summary", "kind", "age", "factions", "tags"])
        + "\n"
        + "\t".join(
            [
                "e1",
                "4327-07-18",
                "",
                "Border Signal Mission",
                "A tower is sabotaged.",
                "event",
                "Age of Trade",
                "ardenhaven",
                "party",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    rows = read_tsv(p)
    assert rows[0].event_id == "e1"
    assert rows[0].start_year == "4327"
    assert rows[0].start_month == "07"
    assert rows[0].start_day == "18"


def test_grow_reduces_max_displacement_desc() -> None:
    # Small px/year => y_targets are very close; packing forces a large push-down displacement.
    events = [_event(f"e{i}", 10_000 - i) for i in range(24)]
    events_sorted = sort_events(events, "desc")
    assign_lanes(events_sorted)

    axis_map = make_axis_map("desc", min_axis=min(e.axis_day for e in events_sorted), max_axis=max(e.axis_day for e in events_sorted), top_y=0.0, px_per_year=2.0)
    for e in events_sorted:
        e.y_target = axis_map.axis_to_y(e.axis_day)
        e.y = e.y_target

    for lane in ("left", "right"):
        pack_lane([e for e in events_sorted if e.lane == lane], lane_gap_y=10)

    before, _ = max_displacement(events_sorted)
    assert before > 80

    grow_downward(
        events_sorted,
        direction="desc",
        lane_gap_y=10,
        opt_iters=8,
        max_displacement_px=80,
        max_grow_passes=16,
        slack_fraction=0.6,
        slack_steps=axis_map.slack_steps,
    )

    after, _ = max_displacement(events_sorted)
    assert after <= 80


def test_choose_tick_scale_century_or_millennium_for_long_spans() -> None:
    # Over ~5000 years, yearly ticks would be unreadable; expect a coarser scale.
    axis_span_days = 360 * 5000
    scale = choose_tick_scale(height_px=900, axis_span_days=axis_span_days, tick_min_spacing_px=60, px_per_day=0.1)
    assert scale in {"century", "millennium"}


def test_choose_tick_scale_decade_for_medium_spans() -> None:
    # Over ~60 years, decade ticks should be a good default when spacing allows.
    axis_span_days = 360 * 60
    scale = choose_tick_scale(height_px=500, axis_span_days=axis_span_days, tick_min_spacing_px=60, px_per_day=0.1)
    assert scale == "decade"


def test_fixed_tick_spacing_math_desc() -> None:
    # With slack disabled, a fixed tick spacing should produce a consistent delta between step boundaries.
    tick_spacing_px = 70
    scale = "decade"
    px_per_year = tick_spacing_px / (step_days(scale) / 360.0)
    axis_map = make_axis_map("desc", min_axis=0, max_axis=step_days(scale) * 2, top_y=0.0, px_per_year=px_per_year)
    y0 = axis_map.axis_to_y(step_days(scale))
    y1 = axis_map.axis_to_y(0)
    assert abs((y1 - y0) - tick_spacing_px) < 1e-6
