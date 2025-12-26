#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.timeline_svg.ages import AgeIndex


@dataclass(frozen=True)
class ParsedAgeLabel:
    glyph: str
    offset: int


_INT_RE = re.compile(r"^[+-]?\d+$")
_AGE_RE = re.compile(r"^(?P<glyph>[^\d\s+\-]{1,2})\s*(?P<offset>[+-]?\d+)$")


def _normalize(value: str) -> str:
    v = (value or "").strip()
    v = re.sub(r"\s+", " ", v).strip()
    v = v.replace(",", "")
    v = v.replace("A.F.", "").replace("AF", "").replace("A F", "")
    return v.strip()


def _parse_int(value: str) -> int | None:
    v = _normalize(value)
    if not _INT_RE.match(v):
        return None
    return int(v)


def _parse_age_label(value: str) -> ParsedAgeLabel | None:
    v = _normalize(value)
    m = _AGE_RE.match(v)
    if not m:
        return None
    return ParsedAgeLabel(glyph=m.group("glyph"), offset=int(m.group("offset")))


def _load_present_year(repo_root: Path) -> int | None:
    cfg_path = (repo_root / "world" / "_history.config.toml").resolve()
    if not cfg_path.exists():
        return None
    raw = tomllib.loads(cfg_path.read_text(encoding="utf-8"))
    present_year = raw.get("present_year")
    if present_year is None:
        return None
    try:
        return int(present_year)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{cfg_path} present_year must be an integer, got: {present_year!r}") from exc


def _resolve_relative_year(offset: int, present_year: int | None) -> int:
    if offset >= 0:
        return offset
    if present_year is None:
        raise ValueError("present_year is not set (set present_year = ... in world/_history.config.toml)")
    return present_year + offset


def _age_by_glyph(label: ParsedAgeLabel, index: AgeIndex) -> tuple[int, "AgeWindow"]:
    for idx, age in enumerate(index.ages):
        if age.glyph == label.glyph:
            return idx, age
    raise ValueError(f"Unknown age glyph: {label.glyph!r}")


def year_to_age(*, year: int, index: AgeIndex) -> str:
    return index.format_year(year)


def age_to_year(*, label: ParsedAgeLabel, index: AgeIndex, present_year: int | None) -> int:
    age_idx, age = _age_by_glyph(label, index)
    if label.offset >= 0:
        return age.start_year + label.offset

    next_age = index.ages[age_idx + 1] if age_idx + 1 < len(index.ages) else None
    if next_age is not None:
        end_boundary_year = next_age.start_year
    else:
        if present_year is None:
            raise ValueError(
                "present_year is not set (set present_year = ... in world/_history.config.toml) "
                "and is required to resolve negative offsets for the current/ongoing age"
            )
        end_boundary_year = present_year
    return end_boundary_year + label.offset


def convert_auto(*, value: str, index: AgeIndex, present_year: int | None) -> str:
    year = _parse_int(value)
    if year is not None:
        if year < 0:
            return str(_resolve_relative_year(year, present_year))
        return year_to_age(year=year, index=index)
    label = _parse_age_label(value)
    if label is not None:
        return str(age_to_year(label=label, index=index, present_year=present_year))
    raise ValueError(
        f"Unrecognized input: {value!r} (expected a year like '4150', a relative year like '-50', or an age label like 'ᛏ200')"
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Convert A.F. years ⇄ age glyph labels (e.g., 4150 ⇄ ᛏ200). "
            "Negative values are supported: '-50' means 50 years before present_year; 'ᛏ-50' means 50 years before the end of the ᛏ age."
        )
    )
    parser.add_argument("value", nargs="?", help="Year (e.g. 4150), relative year (e.g. -50), or age label (e.g. ᛏ200)")
    parser.add_argument(
        "--value",
        dest="value_opt",
        help="Same as the positional value; use this form to pass values starting with '-' (e.g. --value -50).",
    )
    parser.add_argument(
        "--direction",
        choices=["auto", "year_to_age", "age_to_year"],
        default="auto",
        help="Force conversion direction (default: auto-detect).",
    )
    args = parser.parse_args(argv)

    value = args.value_opt if args.value_opt is not None else args.value
    if value is None:
        parser.error("value is required (positional or --value)")

    index = AgeIndex.load_global(REPO_ROOT, debug=False)
    present_year = _load_present_year(REPO_ROOT)

    try:
        if args.direction == "auto":
            out = convert_auto(value=value, index=index, present_year=present_year)
        elif args.direction == "year_to_age":
            year = _parse_int(value)
            if year is None:
                raise ValueError(f"Expected a year like '4150', got: {value!r}")
            out = year_to_age(year=_resolve_relative_year(year, present_year), index=index)
        else:
            label = _parse_age_label(value)
            if label is None:
                raise ValueError(f"Expected an age label like 'ᛏ200', got: {value!r}")
            out = str(age_to_year(label=label, index=index, present_year=present_year))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 2

    sys.stdout.write(out + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
