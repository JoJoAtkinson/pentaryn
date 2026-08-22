from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import yaml

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
        """Build the age index from `world/ages/history/*.md` frontmatter.

        Returns an empty index when the folder is absent so callers that build
        partial worlds (tests, ad-hoc scopes) keep working. Callers that need a
        real answer must check `.ages` — an empty index silently degrades
        `format_year` to bare years.
        """
        ages_dir = (repo_root / "world" / "ages" / "history").resolve()
        if not ages_dir.is_dir():
            return AgeIndex(ages=tuple(), debug=debug)

        raw_ages: list[AgeWindow] = []
        date_re = re.compile(r"^(?P<year>\d{1,6})(?:[/-].*)?$")
        for path in sorted(ages_dir.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            if not text.startswith("---\n"):
                raise SystemExit(f"{path}: missing YAML frontmatter")
            try:
                front = yaml.safe_load(text.split("---\n", 2)[1]) or {}
            except yaml.YAMLError as exc:
                raise SystemExit(f"{path}: invalid frontmatter: {exc}") from exc

            tags = {str(t) for t in (front.get("tags") or [])}
            if "age" not in tags:
                continue

            event_id = str(front.get("event_id") or path.stem).strip()
            title = str(front.get("title") or event_id).strip()

            # Prefer the integer `year`; fall back to parsing `date`. Never the
            # filename — one event carries a synthetic sort slot that is not its date.
            year = front.get("year")
            if year is None:
                m = date_re.match(str(front.get("date") or "").strip())
                if not m:
                    raise SystemExit(f"{path}: no usable `year` or `date` in frontmatter")
                year = m.group("year")
            try:
                start_year = int(year)
            except (TypeError, ValueError) as exc:
                raise SystemExit(f"{path}: year {year!r} is not an integer") from exc

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
