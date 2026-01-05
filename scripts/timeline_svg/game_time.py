from __future__ import annotations

import datetime as dt

from .model import ParsedDate, TickScale

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .ages import AgeIndex

DAYS_PER_MONTH = 30
MONTHS_PER_YEAR = 12
MONTH_NAMES = [
    None,
    "Arumel",
    "Veleara",
    "Lumaeos",
    "Thaeorum",
    "Aoruvan",
    "Voraela",
    "Ulemar",
    "Saraenos",
    "Ithraeum",
    "Arethum",
    "Morvalos",
    "Aneumos",
]


def month_name(month: int) -> str:
    if 1 <= month < len(MONTH_NAMES) and MONTH_NAMES[month]:
        return str(MONTH_NAMES[month])
    return str(month)

def month_abbrev(month: int) -> str:
    name = month_name(month)
    if len(name) >= 3 and name.isalpha():
        return name[:3]
    return name


def time_of_day_label(hour: int) -> str:
    """Coarse time-of-day label suitable for timeline cards."""
    h = int(hour)
    if h < 0:
        h = 0
    if h > 23:
        h = 23
    if 5 <= h <= 10:
        return "Morning"
    if 11 <= h <= 13:
        return "Midday"
    if 14 <= h <= 17:
        return "Afternoon"
    if 18 <= h <= 21:
        return "Evening"
    return "Night"


def format_game_date_label(date: ParsedDate, *, has_month: bool, has_day: bool) -> str:
    """Format a label using the world's month names when available."""
    year = date.year
    if has_month and has_day:
        return f"{date.day} {month_name(date.month)} {year}"
    if has_month:
        return f"{month_name(date.month)} {year}"
    return str(year)


def date_to_axis_days(date: ParsedDate) -> float:
    return (
        date.year * (MONTHS_PER_YEAR * DAYS_PER_MONTH)
        + (date.month - 1) * DAYS_PER_MONTH
        + (date.day - 1)
        + (float(date.hour) / 24.0)
    )


def axis_days_to_datetime(axis_day: float) -> dt.datetime:
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
        millennium = (year // 1000) * 1000
        return ages.format_year(millennium) if ages else str(millennium)
    if scale == "century":
        century = (year // 100) * 100
        return ages.format_year(century) if ages else str(century)
    if scale == "decade":
        decade = (year // 10) * 10
        return ages.format_year(decade) if ages else str(decade)
    if scale == "year":
        return ages.format_year(year) if ages else str(year)
    if scale == "month":
        return f"{year}-{month:02d}"
    return f"{month_abbrev(month)} {day}"
