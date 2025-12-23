from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .game_time import DAYS_PER_MONTH, MONTHS_PER_YEAR
from .timeline_generate import build_series_windows, group_events, load_tsv_rows, validate_variants

import logging

logger = logging.getLogger(__name__)


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
    # Heuristic: glyphs are short tokens and are not plain ASCII alphanumerics.
    # (Runes are letters in Unicode, so `isalnum()` is not a good discriminator.)
    if 1 <= len(first) <= 2 and any(ord(ch) > 0x7F for ch in first):
        return first
    return ""


@dataclass(frozen=True)
class AgeIndex:
    ages: tuple[AgeWindow, ...]
    debug: bool = False

    @staticmethod
    def load_global(repo_root: Path, *, debug: bool = False) -> "AgeIndex":
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
        index = AgeIndex(ages=tuple(ages), debug=debug)
        if debug:
            missing = [a.event_id for a in index.ages if not a.glyph]
            if missing:
                logger.warning(
                    "Age glyphs missing for %d age entries (they will fall back to absolute years): %s",
                    len(missing),
                    ", ".join(missing),
                    stack_info=True,
                )
        return index

    def age_for_year(self, year: int) -> Optional[AgeWindow]:
        for age in self.ages:
            if age.contains_year(year):
                return age
        return None

    def format_year(self, year: int, *, round_to: int = 1) -> str:
        age = self.age_for_year(year)
        if not age or not age.glyph:
            if self.debug:
                logger.warning("Age glyph fallback: no matching age/glyph for year=%s", year, stack_info=True)
            return str(year)
        offset = age.year_offset(year)
        return f"{age.glyph}{offset}"

    def format_axis_day(self, axis_day: int) -> str:
        year = axis_day // (MONTHS_PER_YEAR * DAYS_PER_MONTH)
        return self.format_year(year)
