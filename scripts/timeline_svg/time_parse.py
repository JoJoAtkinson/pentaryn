from __future__ import annotations

from .model import ParsedDate


def parse_game_date(start_year: str, start_month: str, start_day: str) -> ParsedDate:
    """
    Accept either:
    - year-only in start_year (e.g., "4150")
    - composite in start_year (e.g., "4150/02/13" or "4150/02/13-05")
    - separate columns for month/day
    """
    start_year = start_year.strip()
    start_month = start_month.strip()
    start_day = start_day.strip()

    def _split_day_hour(value: str) -> tuple[int, int]:
        raw = (value or "").strip()
        if not raw:
            return (1, 0)
        if "-" in raw:
            day_part, hour_part = raw.split("-", 1)
            day = int(day_part)
            hour = int(hour_part)
            if hour < 0 or hour > 23:
                raise ValueError(f"Invalid hour '{hour_part}' (expected 0-23)")
            return (day, hour)
        return (int(raw), 0)

    if "/" in start_year:
        parts = [p.strip() for p in start_year.split("/") if p.strip()]
        if len(parts) not in {2, 3}:
            raise ValueError(f"Invalid composite start_year '{start_year}'")
        year = int(parts[0])
        month = int(parts[1]) if len(parts) >= 2 else 1
        if len(parts) == 3:
            day, hour = _split_day_hour(parts[2])
        else:
            day, hour = (1, 0)
        return ParsedDate(year=year, month=month, day=day, hour=hour)

    year = int(start_year)
    month = int(start_month) if start_month else 1
    day, hour = _split_day_hour(start_day) if start_day else (1, 0)
    return ParsedDate(year=year, month=month, day=day, hour=hour)
