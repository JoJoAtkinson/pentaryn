from __future__ import annotations

from .model import ParsedDate


def parse_game_date(start_year: str, start_month: str, start_day: str) -> ParsedDate:
    """
    Accept either:
    - year-only in start_year (e.g., "4150")
    - composite in start_year (e.g., "4150/02/13")
    - separate columns for month/day
    """
    start_year = start_year.strip()
    start_month = start_month.strip()
    start_day = start_day.strip()

    if "/" in start_year:
        parts = [p.strip() for p in start_year.split("/") if p.strip()]
        if len(parts) not in {2, 3}:
            raise ValueError(f"Invalid composite start_year '{start_year}'")
        year = int(parts[0])
        month = int(parts[1]) if len(parts) >= 2 else 1
        day = int(parts[2]) if len(parts) == 3 else 1
        return ParsedDate(year=year, month=month, day=day)

    year = int(start_year)
    month = int(start_month) if start_month else 1
    day = int(start_day) if start_day else 1
    return ParsedDate(year=year, month=month, day=day)

