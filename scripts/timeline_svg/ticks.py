from __future__ import annotations

from .game_time import format_game_tick
from .model import Tick, TickScale
from .time_map import AxisMap
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .ages import AgeIndex, AgeWindow


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


def _build_ticks_age_aligned(axis_map: AxisMap, *, scale: TickScale, tick_min_spacing_px: int, ages: "AgeIndex") -> list[Tick]:
    if scale == "decade":
        step_years = 10
    elif scale == "century":
        step_years = 100
    elif scale == "millennium":
        step_years = 1000
    else:
        raise ValueError(f"Age-aligned ticks not supported for scale={scale}")

    min_year = axis_map.min_axis // 360
    max_year = axis_map.max_axis // 360
    years: list[int] = []

    for age in ages.ages:
        age_start = age.start_year
        age_end = age.end_year if age.end_year is not None else max_year
        if age_end < min_year or age_start > max_year:
            continue
        start_in_range = max(min_year, age_start)
        # First tick at age_start + k*step_years, where tick >= start_in_range.
        offset = start_in_range - age_start
        if offset <= 0:
            tick_year = age_start
        else:
            tick_year = age_start + ((offset + step_years - 1) // step_years) * step_years
        while tick_year <= min(age_end, max_year):
            years.append(tick_year)
            tick_year += step_years

    # Deduplicate while preserving order.
    seen: set[int] = set()
    unique_years: list[int] = []
    for y in years:
        if y in seen:
            continue
        seen.add(y)
        unique_years.append(y)

    ticks: list[Tick] = []
    last_y: float | None = None
    for y in unique_years:
        axis = y * 360
        if axis < axis_map.min_axis or axis > axis_map.max_axis:
            continue
        pos_y = axis_map.axis_to_y(axis)
        if last_y is None or abs(pos_y - last_y) >= tick_min_spacing_px:
            ticks.append(Tick(axis_day=axis, y=pos_y, label=ages.format_year(y)))
            last_y = pos_y
    return ticks


def build_ticks(axis_map: AxisMap, *, scale: TickScale, tick_min_spacing_px: int, ages: Optional["AgeIndex"] = None) -> list[Tick]:
    step = step_days(scale)

    if ages and scale in {"millennium", "century", "decade"}:
        return _build_ticks_age_aligned(axis_map, scale=scale, tick_min_spacing_px=tick_min_spacing_px, ages=ages)

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
