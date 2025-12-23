from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .game_time import DAYS_PER_MONTH, MONTHS_PER_YEAR
from .timeline_generate import build_series_windows, group_events, load_tsv_rows, validate_variants


@dataclass(frozen=True)
class AgeWindow:
    event_id: str
    title: str
    glyph: str
    start_year: int
    end_year: Optional[int]

    def contains_year(self, year: int) -> bool:
        if year < self.start_year:
            return False
        if self.end_year is None:
            return True
        return year <= self.end_year

    def year_offset(self, year: int) -> int:
        return year - self.start_year


def _extract_glyph(title: str) -> str:
    raw = (title or "").strip()
    if not raw:
        return ""
    first = raw.split(" ", 1)[0]
    # Heuristic: glyphs are short and start with a non-alnum character (runes/symbols).
    if len(first) <= 2 and first and not first[0].isalnum():
        return first
    return ""


@dataclass(frozen=True)
class AgeIndex:
    ages: tuple[AgeWindow, ...]

    @staticmethod
    def load_global(repo_root: Path) -> "AgeIndex":
        ages_tsv = (repo_root / "world" / "ages" / "_history.tsv").resolve()
        variants = load_tsv_rows(repo_root, sources=[ages_tsv])
        events = group_events(variants)
        validate_variants(events)
        series_windows = build_series_windows(events)
        windows = list((series_windows.get("age") or {}).values())
        windows.sort(key=lambda w: w.start.ordinal())  # type: ignore[attr-defined]

        ages: list[AgeWindow] = []
        for w in windows:
            start_year = int(w.start.year)  # type: ignore[attr-defined]
            end_year = int(w.end.year) if w.end else None  # type: ignore[attr-defined]
            title = str(w.title)  # type: ignore[attr-defined]
            ages.append(
                AgeWindow(
                    event_id=str(w.event_id),  # type: ignore[attr-defined]
                    title=title,
                    glyph=_extract_glyph(title),
                    start_year=start_year,
                    end_year=end_year,
                )
            )
        return AgeIndex(ages=tuple(ages))

    def age_for_year(self, year: int) -> Optional[AgeWindow]:
        for age in self.ages:
            if age.contains_year(year):
                return age
        return None

    def format_year(self, year: int, *, round_to: int = 1) -> str:
        age = self.age_for_year(year)
        if not age or not age.glyph:
            return str(year)
        offset = age.year_offset(year)
        if round_to > 1:
            offset = (offset // round_to) * round_to
        return f"{age.glyph}{offset}"

    def format_axis_day(self, axis_day: int) -> str:
        year = axis_day // (MONTHS_PER_YEAR * DAYS_PER_MONTH)
        return self.format_year(year)
