#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import re
import sys
from dataclasses import dataclass
from pathlib import Path


DAYS_PER_YEAR = 365
DAYS_PER_MONTH = 30
MONTHS_PER_YEAR = 12


def _split_tokens(value: str) -> list[str]:
    return [t for t in re.split(r"[;\s]+", (value or "").strip()) if t]


def _dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for v in values:
        if not v or v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out


@dataclass(frozen=True)
class DateParts:
    year: int
    month: int
    day: int
    precision: str  # "y" | "ym" | "ymd"


def _parse_start_date(*, start_year: str, start_month: str, start_day: str) -> tuple[str, DateParts] | None:
    y = (start_year or "").strip()
    m = (start_month or "").strip()
    d = (start_day or "").strip()
    if not y:
        return None

    # Support composite "YYYY/MM[/DD]" in the year cell.
    if "/" in y:
        parts = [p for p in y.split("/") if p]
        y = parts[0] if len(parts) >= 1 else y
        m = parts[1] if len(parts) >= 2 else m
        d = parts[2] if len(parts) >= 3 else d

    year = int(y)
    if not m:
        return str(year), DateParts(year=year, month=1, day=1, precision="y")
    month = int(m)
    if not d:
        return f"{year}/{month:02d}", DateParts(year=year, month=month, day=1, precision="ym")
    day = int(d)
    return f"{year}/{month:02d}/{day:02d}", DateParts(year=year, month=month, day=day, precision="ymd")


def _parse_end_date(*, end_year: str, end_month: str, end_day: str) -> DateParts | None:
    y = (end_year or "").strip()
    m = (end_month or "").strip()
    d = (end_day or "").strip()
    if not y:
        return None

    if "/" in y:
        parts = [p for p in y.split("/") if p]
        y = parts[0] if len(parts) >= 1 else y
        m = parts[1] if len(parts) >= 2 else m
        d = parts[2] if len(parts) >= 3 else d

    year = int(y)
    if not m:
        return DateParts(year=year, month=MONTHS_PER_YEAR, day=DAYS_PER_MONTH, precision="y")
    month = int(m)
    if not d:
        return DateParts(year=year, month=month, day=DAYS_PER_MONTH, precision="ym")
    day = int(d)
    return DateParts(year=year, month=month, day=day, precision="ymd")


def _ordinal(date: DateParts) -> int:
    return date.year * DAYS_PER_YEAR + (date.month - 1) * DAYS_PER_MONTH + (date.day - 1)


def _compute_duration_days(start: DateParts | None, end: DateParts | None) -> int:
    if not start or not end:
        return 0
    return max(0, _ordinal(end) - _ordinal(start) + 1)


def _read_present_year(repo_root: Path) -> int | None:
    cfg = repo_root / "world" / "_history.config.toml"
    if not cfg.exists():
        return None
    for line in cfg.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("present_year"):
            _, rhs = line.split("=", 1)
            return int(rhs.strip())
    return None


def convert_history_tsv(*, path: Path, present_year: int | None) -> bool:
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        return False
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        if not reader.fieldnames:
            raise SystemExit(f"{path}: missing header row")
        fieldnames = set(reader.fieldnames)
        if {"event_id", "tags", "date", "duration", "title", "summary"}.issubset(fieldnames):
            return False
        if not {"event_id", "pov", "start_year", "title"}.issubset(fieldnames):
            raise SystemExit(f"{path}: unsupported schema; got columns: {', '.join(reader.fieldnames)}")

        rows: list[dict[str, str]] = []
        for idx, row in enumerate(reader, start=2):
            if None in row:
                raise SystemExit(
                    f"{path}:{idx} has too many columns (tabbing misaligned). Remove extra tab(s) so each row matches the header."
                )
            if not any((v or "").strip() for v in row.values()):
                continue
            rows.append({k: (v or "") for k, v in row.items()})

    base_tags: dict[str, list[str]] = {}
    best_dates: dict[str, tuple[str, DateParts, DateParts | None]] = {}

    for row in rows:
        event_id = row["event_id"].strip()
        base_tags.setdefault(event_id, [])
        base_tags[event_id].extend(_split_tokens(row.get("tags", "")))
        base_tags[event_id].extend(_split_tokens(row.get("factions", "")))

        parsed = _parse_start_date(
            start_year=row.get("start_year", ""),
            start_month=row.get("start_month", ""),
            start_day=row.get("start_day", ""),
        )
        if parsed and event_id not in best_dates:
            date_str, start = parsed
            end = _parse_end_date(end_year=row.get("end_year", ""), end_month=row.get("end_month", ""), end_day=row.get("end_day", ""))
            best_dates[event_id] = (date_str, start, end)

    for event_id, tags in list(base_tags.items()):
        base_tags[event_id] = _dedupe_keep_order(tags)

    out_rows: list[list[str]] = []
    out_rows.append(["event_id", "tags", "date", "duration", "title", "summary"])

    # Special-case ages: compute duration from next age start year when possible.
    is_ages_file = path.parts[-2:] == ("ages", "_history.tsv")
    age_years: list[tuple[int, str]] = []
    if is_ages_file:
        for row in rows:
            series = row.get("series", "").strip()
            tags = set(_split_tokens(row.get("tags", "")))
            if series != "age" and "age" not in tags:
                continue
            parsed = _parse_start_date(
                start_year=row.get("start_year", ""),
                start_month=row.get("start_month", ""),
                start_day=row.get("start_day", ""),
            )
            if not parsed:
                continue
            _, start = parsed
            age_years.append((start.year, row["event_id"].strip()))
        age_years.sort()
        age_duration: dict[str, int] = {}
        for i, (start_year, event_id) in enumerate(age_years):
            next_year = age_years[i + 1][0] if i + 1 < len(age_years) else None
            if next_year is None:
                age_duration[event_id] = 0
            else:
                age_duration[event_id] = max(0, (next_year - start_year) * DAYS_PER_YEAR)
    else:
        age_duration = {}

    for row in rows:
        event_id = row["event_id"].strip()
        title = row.get("title", "").strip()
        summary = row.get("summary", "").strip()

        parsed = _parse_start_date(
            start_year=row.get("start_year", ""),
            start_month=row.get("start_month", ""),
            start_day=row.get("start_day", ""),
        )
        if parsed:
            date_str, start = parsed
            end = _parse_end_date(end_year=row.get("end_year", ""), end_month=row.get("end_month", ""), end_day=row.get("end_day", ""))
        else:
            fallback = best_dates.get(event_id)
            if not fallback:
                raise SystemExit(f"{path}: event '{event_id}' is missing a date and no other row provides one")
            date_str, start, end = fallback

        duration = age_duration.get(event_id)
        if duration is None:
            duration = _compute_duration_days(start, end)

        tags_out: list[str] = []
        pov = row.get("pov", "").strip()
        if pov == "public":
            tags_out.append("public")
        elif pov and pov != "truth":
            tags_out.append("private")
            tags_out.append(pov)
        tags_out.extend(base_tags.get(event_id, []))
        tags_final = _dedupe_keep_order(tags_out)

        out_rows.append([event_id, ";".join(tags_final), date_str, str(duration), title, summary])

    path.write_text("\n".join(["\t".join(r) for r in out_rows]) + "\n", encoding="utf-8")
    return True


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Convert legacy _history.tsv schema to the simplified schema.")
    parser.add_argument("--repo-root", default=".", help="Repo root (default: .)")
    parser.add_argument("--paths", nargs="*", default=[], help="Specific _history.tsv paths to convert (default: discover under world/)")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    present_year = _read_present_year(repo_root)

    paths = [Path(p).resolve() for p in args.paths] if args.paths else sorted((repo_root / "world").rglob("_history.tsv"))
    changed = 0
    for path in paths:
        if convert_history_tsv(path=path, present_year=present_year):
            changed += 1
            print(f"[ok] converted {path.relative_to(repo_root)}")
    if changed == 0:
        print("[ok] no changes (already converted)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

