from __future__ import annotations

import csv
import re
from dataclasses import replace
from pathlib import Path
from typing import Sequence

from .history_config import HistoryView, load_history_config
from .model import ParsedDate
from .model import BuildConfig, FontPaths, MeasureConfig, RendererConfig
from .pipeline import build_timeline_svg
from .pov_icons import PovCatalog
from .time_parse import parse_game_date
from .game_time import date_to_axis_days


def discover_history_configs(world_root: Path) -> list[Path]:
    return sorted(world_root.rglob("_history.config.toml"))


def _scope_sources(scope_root: Path) -> list[Path]:
    # Transitional: accept both names. `_history.tsv` is the new standard.
    return sorted(list(scope_root.rglob("_history.tsv")) + list(scope_root.rglob("_timeline.tsv")))


def _default_svg_name(view: HistoryView) -> str:
    return view.svg or f"_history.{view.id}.svg"


def _debug_tsv_path(repo_root: Path, scope_root: Path, view_id: str) -> Path:
    rel = scope_root.relative_to(repo_root)
    return repo_root / ".output" / "history" / rel / f"{view_id}.tsv"


_DATE_RE = re.compile(r"^(?P<year>\d{1,6})(?:/(?P<month>\d{1,2})(?:/(?P<day>\d{1,2}))?)?$")


def _split_tokens(value: str) -> list[str]:
    return [t for t in re.split(r"[;\s]+", (value or "").strip()) if t]


def _normalize_date(date_raw: str) -> tuple[str, ParsedDate]:
    raw = (date_raw or "").strip()
    if not raw:
        raise ValueError("date is required")
    m = _DATE_RE.match(raw)
    if not m:
        raise ValueError(f"Invalid date {date_raw!r} (expected YYYY, YYYY/MM, or YYYY/MM/DD)")
    year = int(m.group("year"))
    month_raw = m.group("month")
    day_raw = m.group("day")
    if not month_raw:
        norm = str(year)
    else:
        month = int(month_raw)
        if not day_raw:
            norm = f"{year}/{month:02d}"
        else:
            day = int(day_raw)
            norm = f"{year}/{month:02d}/{day:02d}"
    parsed = parse_game_date(norm, "", "")
    return norm, parsed


def _row_axis_day(date: ParsedDate) -> int:
    return date_to_axis_days(date)


def _read_history_rows(path: Path) -> list[dict[str, object]]:
    """
    New minimal schema:
      event_id, tags, date, duration, title, summary
    """
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        if not reader.fieldnames:
            raise SystemExit(f"{path}: missing header row")
        fieldnames = set(reader.fieldnames)
        required = {"event_id", "date", "title"}
        if not required.issubset(fieldnames):
            raise SystemExit(f"{path}: missing required columns: {', '.join(sorted(required - fieldnames))}")
        if "tags" not in fieldnames:
            raise SystemExit(f"{path}: missing required column: tags")
        if "duration" not in fieldnames:
            raise SystemExit(f"{path}: missing required column: duration")

        rows: list[dict[str, object]] = []
        for idx, row in enumerate(reader, start=2):
            if None in row:
                raise SystemExit(
                    f"{path}:{idx} has too many columns (tabbing misaligned). Remove extra tab(s) so each row matches the header."
                )
            event_id = (row.get("event_id") or "").strip()
            if not event_id:
                raise SystemExit(f"{path}:{idx} event_id is required")
            title = (row.get("title") or "").strip()
            if not title:
                raise SystemExit(f"{path}:{idx} title is required")
            date_norm, parsed_date = _normalize_date(row.get("date") or "")
            duration_raw = (row.get("duration") or "").strip()
            if duration_raw == "":
                duration = 0
            else:
                try:
                    duration = int(duration_raw)
                except ValueError as exc:
                    raise SystemExit(f"{path}:{idx} duration must be an integer number of days, got: {duration_raw!r}") from exc
                if duration < 0:
                    raise SystemExit(f"{path}:{idx} duration must be >= 0, got: {duration_raw!r}")
            tags = _split_tokens(row.get("tags") or "")
            summary = (row.get("summary") or "").strip()
            rows.append(
                {
                    "event_id": event_id,
                    "title": title,
                    "summary": summary,
                    "tags": tags,
                    "date": parsed_date,
                    "date_str": date_norm,
                    "duration": duration,
                    "file": path,
                    "line": idx,
                    "axis_day": _row_axis_day(parsed_date),
                }
            )
        return rows


def _write_svg_export(target: Path, rows: list[dict[str, object]]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["event_id", "start", "title", "summary", "kind", "tags", "duration"]
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "event_id": row.get("event_id", ""),
                    "start": row.get("date_str", ""),
                    "title": row.get("title", ""),
                    "summary": row.get("summary", ""),
                    "kind": "event",
                    "tags": ";".join(row.get("tags", []) or []),
                    "duration": str(row.get("duration", 0) or 0),
                }
            )


def _tags_match(tags: set[str], *, any_of: list[str] | None, all_of: list[str] | None, none_of: list[str] | None) -> bool:
    if none_of and any(t in tags for t in none_of):
        return False
    if all_of and not all(t in tags for t in all_of):
        return False
    if any_of and not any(t in tags for t in any_of):
        return False
    return True


def _in_range(row: dict[str, object], *, range_cfg: dict[str, object] | None, present_year: int) -> bool:
    if not range_cfg:
        return True
    date: ParsedDate = row["date"]  # type: ignore[assignment]
    year = int(date.year)
    start_year = int(range_cfg["start_year"]) if "start_year" in range_cfg else None  # type: ignore[arg-type]
    end_year = int(range_cfg["end_year"]) if "end_year" in range_cfg else None  # type: ignore[arg-type]
    if "last_years" in range_cfg:
        span = int(range_cfg["last_years"])  # type: ignore[arg-type]
        start_year = max(start_year or -10**9, present_year - span + 1)
        end_year = min(end_year or 10**9, present_year)
    if start_year is not None and year < start_year:
        return False
    if end_year is not None and year > end_year:
        return False
    return True


def render_history_scopes(
    *,
    repo_root: Path,
    world_root: Path,
    fonts: FontPaths,
    measure: MeasureConfig,
    renderer: RendererConfig,
    build: BuildConfig,
    defs_fragment_path: Path,
    debug_write_tsv: bool = True,
) -> None:
    configs = discover_history_configs(world_root)
    if not configs:
        raise SystemExit(f"No _history.config.toml files found under {world_root}")

    # Allow a single "canonical present year" at the world root that all sub-scopes inherit.
    # Sub-scopes can still override by setting `present_year = ...` in their own config.
    default_present_year = None
    world_root_cfg = world_root / "_history.config.toml"
    if world_root_cfg.exists():
        try:
            default_present_year = load_history_config(world_root_cfg).present_year
        except Exception:
            default_present_year = None

    pov_catalog = PovCatalog.discover(repo_root=repo_root)

    for config_path in configs:
        scope_root = config_path.parent
        cfg = load_history_config(config_path)
        sources = _scope_sources(scope_root)
        if not sources:
            continue

        scope_pov = scope_root.name

        rows: list[dict[str, object]] = []
        for src in sources:
            rows.extend(_read_history_rows(src))

        present_year = cfg.present_year if cfg.present_year is not None else default_present_year
        if present_year is None:
            # Best-effort "now" for ranges: max year present in rows.
            present_year = max(int((r["date"].year)) for r in rows) if rows else 0

        for view in cfg.views:
            view_build = build
            if view.sort_direction:
                view_build = replace(view_build, sort_direction=view.sort_direction)  # type: ignore[arg-type]
            if view.tick_scale:
                view_build = replace(view_build, tick_scale=view.tick_scale)  # type: ignore[arg-type]
            if view.tick_spacing_px is not None:
                view_build = replace(view_build, tick_spacing_px=int(view.tick_spacing_px))

            filtered = [
                r
                for r in rows
                if _tags_match(set(r["tags"]), any_of=view.tags_any, all_of=view.tags_all, none_of=view.tags_none)  # type: ignore[arg-type]
                and _in_range(r, range_cfg=view.range, present_year=int(present_year))
            ]
            filtered.sort(key=lambda r: int(r["axis_day"]))  # type: ignore[arg-type]
            if (view_build.sort_direction or "desc") == "desc":
                filtered.reverse()

            # Optionally extend the axis to a declared "present" year so ticks can show e.g. ⋈50 at 4327 even if the latest
            # dated event in this scope is earlier.
            if present_year is not None:
                view_build = replace(view_build, axis_max_year=max(view_build.axis_max_year or -10**9, present_year))

            svg_path = scope_root / _default_svg_name(view)
            tsv_path = _debug_tsv_path(repo_root, scope_root, view.id)
            if debug_write_tsv:
                _write_svg_export(tsv_path, filtered)

            build_timeline_svg(
                repo_root=repo_root,
                input_tsv=tsv_path,
                defs_fragment_path=defs_fragment_path,
                output_svg=svg_path,
                output_png=repo_root / "output" / "timeline.png",
                fonts=fonts,
                measure=measure,
                renderer=renderer,
                build=view_build,
                pov_catalog=pov_catalog,
                scope_pov=scope_pov,
            )
