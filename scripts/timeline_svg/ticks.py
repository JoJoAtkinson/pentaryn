from __future__ import annotations

from .game_time import format_game_tick
from .model import Tick, TickScale
from .time_map import AxisMap


def step_days(scale: TickScale) -> int:
    if scale == "millennium":
        return 360 * 1000
    if scale == "century":
        return 360 * 100
    if scale == "decade":
        return 360 * 10
    if scale == "year":
        return 360
    if scale == "month":
        return 30
    return 1


def choose_tick_scale(*, height_px: int, axis_span_days: int, tick_min_spacing_px: int, px_per_day: float) -> TickScale:
    _ = px_per_day
    for scale, step in (
        ("millennium", 360 * 1000),
        ("century", 360 * 100),
        ("decade", 360 * 10),
        ("year", 360),
        ("month", 30),
        ("day", 1),
    ):
        tick_count = axis_span_days // step + 1
        if tick_count <= 1:
            continue
        approx_spacing = height_px / tick_count
        if approx_spacing >= tick_min_spacing_px:
            return scale  # type: ignore[return-value]
    return "year"


def build_ticks(axis_map: AxisMap, *, scale: TickScale, tick_min_spacing_px: int, ages: object | None = None) -> list[Tick]:
    step = step_days(scale)

    start = axis_map.min_axis - (axis_map.min_axis % step)
    end = axis_map.max_axis - (axis_map.max_axis % step)
    ticks: list[Tick] = []
    last_y = None
    axis = start
    while axis <= end:
        if axis < axis_map.min_axis or axis > axis_map.max_axis:
            axis += step
            continue
        y = axis_map.axis_to_y(axis)
        if last_y is None or abs(y - last_y) >= tick_min_spacing_px:
            ticks.append(Tick(axis_day=axis, y=y, label=format_game_tick(axis, scale, ages=ages)))  # type: ignore[arg-type]
            last_y = y
        axis += step
    return ticks
