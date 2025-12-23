from __future__ import annotations

import datetime as dt

from .model import ParsedDate, TickScale

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .ages import AgeIndex

DAYS_PER_MONTH = 30
MONTHS_PER_YEAR = 12


def date_to_axis_days(date: ParsedDate) -> int:
    return date.year * (MONTHS_PER_YEAR * DAYS_PER_MONTH) + (date.month - 1) * DAYS_PER_MONTH + (date.day - 1)


def axis_days_to_datetime(axis_day: int) -> dt.datetime:
    epoch = dt.datetime(2000, 1, 1)
    return epoch + dt.timedelta(days=axis_day)


def datetime_to_game_axis(value: dt.datetime) -> float:
    epoch = dt.datetime(2000, 1, 1)
    return float((value - epoch).days)


def format_game_tick(axis_day: int, scale: TickScale, *, ages: Optional["AgeIndex"] = None) -> str:
    year = axis_day // (MONTHS_PER_YEAR * DAYS_PER_MONTH)
    remainder = axis_day % (MONTHS_PER_YEAR * DAYS_PER_MONTH)
    month = remainder // DAYS_PER_MONTH + 1
    day = remainder % DAYS_PER_MONTH + 1
    if scale == "millennium":
        return str((year // 1000) * 1000)
    if scale == "century":
        return str((year // 100) * 100)
    if scale == "decade":
        decade = (year // 10) * 10
        return ages.format_year(decade) if ages else str(decade)
    if scale == "year":
        return ages.format_year(year) if ages else str(year)
    if scale == "month":
        return f"{year}-{month:02d}"
    return f"{year}-{month:02d}-{day:02d}"
