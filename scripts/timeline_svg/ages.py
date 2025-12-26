from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .game_time import DAYS_PER_MONTH, MONTHS_PER_YEAR

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
        if not ages_tsv.exists():
            return AgeIndex(ages=tuple(), debug=debug)

        with ages_tsv.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            if not reader.fieldnames:
                raise SystemExit(f"{ages_tsv}: missing header row")
            fieldnames = set(reader.fieldnames)
            required = {"event_id", "tags", "date", "title"}
            if not required.issubset(fieldnames):
                raise SystemExit(f"{ages_tsv}: missing required columns: {', '.join(sorted(required - fieldnames))}")

            raw_ages: list[AgeWindow] = []
            date_re = re.compile(r"^(?P<year>\d{1,6})(?:/.*)?$")
            for idx, row in enumerate(reader, start=2):
                if None in row:
                    raise SystemExit(
                        f"{ages_tsv}:{idx} has too many columns (tabbing misaligned). Remove extra tab(s) so each row matches the header."
                    )
                tags = {t for t in re.split(r"[;\s]+", (row.get("tags") or "").strip()) if t}
                if "age" not in tags:
                    continue
                event_id = (row.get("event_id") or "").strip()
                title = (row.get("title") or "").strip() or event_id
                date_raw = (row.get("date") or "").strip()
                m = date_re.match(date_raw)
                if not m:
                    raise SystemExit(f"{ages_tsv}:{idx} invalid date {date_raw!r} (expected YYYY or YYYY/MM/DD)")
                start_year = int(m.group("year"))
                raw_ages.append(
                    AgeWindow(
                        event_id=event_id,
                        title=title,
                        glyph=_extract_glyph(title),
                        start_year=start_year,
                        end_year=None,
                    )
                )

        raw_ages.sort(key=lambda a: a.start_year)
        ages: list[AgeWindow] = []
        for i, age in enumerate(raw_ages):
            next_age = raw_ages[i + 1] if i + 1 < len(raw_ages) else None
            end_year = (next_age.start_year - 1) if next_age else None
            ages.append(
                AgeWindow(
                    event_id=age.event_id,
                    title=age.title,
                    glyph=age.glyph,
                    start_year=age.start_year,
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
