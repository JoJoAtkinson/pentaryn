from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import tomllib


@dataclass(frozen=True)
class HistoryView:
    id: str
    title: str
    range: Optional[dict[str, object]]
    tags_any: Optional[list[str]]
    tags_all: Optional[list[str]]
    tags_none: Optional[list[str]]
    tick_scale: Optional[str]
    tick_spacing_px: Optional[int]
    sort_direction: Optional[str]
    max_summary_lines: Optional[int]
    svg: Optional[str]
    svg_access: Optional[str] = None
    hide_time_measurements: bool = False


@dataclass(frozen=True)
class HistoryConfig:
    views: list[HistoryView]
    present_year: int | None = None
    present_month: int | None = None
    present_day: int | None = None
    hide_time_measurements: bool = False
    svg_output_dir: str | None = None
    svg_public_template: str | None = None
    svg_private_template: str | None = None
    svg_access_default: str | None = None


def load_history_config(path: Path) -> HistoryConfig:
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    present_year = raw.get("present_year")
    if present_year is not None:
        present_year = int(present_year)
    present_month = raw.get("present_month")
    if present_month is not None:
        present_month = int(present_month)
    present_day = raw.get("present_day")
    if present_day is not None:
        present_day = int(present_day)
    hide_time_measurements = raw.get("hide_time_measurements")
    if hide_time_measurements is None:
        hide_time_measurements = raw.get("hide_time_measurments")
    if hide_time_measurements is None:
        hide_time_measurements = False
    if not isinstance(hide_time_measurements, bool):
        raise SystemExit(f"{path}: hide_time_measurements must be a boolean")

    svg_output_dir = raw.get("svg_output_dir")
    if svg_output_dir is not None and not isinstance(svg_output_dir, str):
        raise SystemExit(f"{path}: svg_output_dir must be a string")
    svg_output_dir = (svg_output_dir or "").strip() or None

    svg_public_template = raw.get("svg_public_template")
    if svg_public_template is not None and not isinstance(svg_public_template, str):
        raise SystemExit(f"{path}: svg_public_template must be a string")
    svg_public_template = (svg_public_template or "").strip() or None

    svg_private_template = raw.get("svg_private_template")
    if svg_private_template is not None and not isinstance(svg_private_template, str):
        raise SystemExit(f"{path}: svg_private_template must be a string")
    svg_private_template = (svg_private_template or "").strip() or None

    svg_access_default = raw.get("svg_access_default")
    if svg_access_default is not None and not isinstance(svg_access_default, str):
        raise SystemExit(f"{path}: svg_access_default must be a string")
    svg_access_default = (svg_access_default or "").strip().lower() or None
    if svg_access_default is not None and svg_access_default not in {"legacy", "public", "private"}:
        raise SystemExit(f"{path}: svg_access_default must be one of: legacy, public, private")

    views_raw = raw.get("views") or []
    if not isinstance(views_raw, list) or not views_raw:
        raise SystemExit(f"{path}: no [[views]] entries found")

    views: list[HistoryView] = []
    for item in views_raw:
        if not isinstance(item, dict):
            raise SystemExit(f"{path}: each [[views]] entry must be a table")
        view_id = str(item.get("id") or "").strip()
        if not view_id:
            raise SystemExit(f"{path}: view is missing required field 'id'")
        title = str(item.get("title") or view_id).strip()

        range_cfg = item.get("range")
        if range_cfg is not None and not isinstance(range_cfg, dict):
            raise SystemExit(f"{path}: view '{view_id}' range must be a table")

        tags_any = item.get("tags_any")
        if tags_any is not None and not isinstance(tags_any, list):
            raise SystemExit(f"{path}: view '{view_id}' tags_any must be a list")
        tags_any = [str(v).strip() for v in tags_any] if isinstance(tags_any, list) else None
        if tags_any is not None:
            tags_any = [t for t in tags_any if t]
            if not tags_any:
                tags_any = None

        tags_all = item.get("tags_all")
        if tags_all is not None and not isinstance(tags_all, list):
            raise SystemExit(f"{path}: view '{view_id}' tags_all must be a list")
        tags_all = [str(v).strip() for v in tags_all] if isinstance(tags_all, list) else None
        if tags_all is not None:
            tags_all = [t for t in tags_all if t]
            if not tags_all:
                tags_all = None

        tags_none = item.get("tags_none")
        if tags_none is not None and not isinstance(tags_none, list):
            raise SystemExit(f"{path}: view '{view_id}' tags_none must be a list")
        tags_none = [str(v).strip() for v in tags_none] if isinstance(tags_none, list) else None
        if tags_none is not None:
            tags_none = [t for t in tags_none if t]
            if not tags_none:
                tags_none = None

        tick_scale = (str(item.get("tick_scale")).strip() if item.get("tick_scale") is not None else None) or None
        tick_spacing_px = item.get("tick_spacing_px")
        if tick_spacing_px is not None:
            tick_spacing_px = int(tick_spacing_px)
        sort_direction = (str(item.get("sort_direction")).strip() if item.get("sort_direction") is not None else None) or None
        max_summary_lines = item.get("max_summary_lines")
        if max_summary_lines is not None:
            max_summary_lines = int(max_summary_lines)
            if max_summary_lines < -1:
                raise SystemExit(f"{path}: view '{view_id}' max_summary_lines must be -1 (unlimited) or >= 0")
        svg = (str(item.get("svg")).strip() if item.get("svg") is not None else None) or None
        svg_access = (str(item.get("svg_access")).strip().lower() if item.get("svg_access") is not None else None) or None
        if svg_access is not None and svg_access not in {"legacy", "public", "private"}:
            raise SystemExit(f"{path}: view '{view_id}' svg_access must be one of: legacy, public, private")
        view_hide_time = item.get("hide_time_measurements")
        if view_hide_time is None:
            view_hide_time = item.get("hide_time_measurments")
        if view_hide_time is None:
            view_hide_time = hide_time_measurements
        if not isinstance(view_hide_time, bool):
            raise SystemExit(f"{path}: view '{view_id}' hide_time_measurements must be a boolean")

        views.append(
            HistoryView(
                id=view_id,
                title=title,
                range=range_cfg,  # type: ignore[arg-type]
                tags_any=tags_any,
                tags_all=tags_all,
                tags_none=tags_none,
                tick_scale=tick_scale,
                tick_spacing_px=tick_spacing_px,  # type: ignore[arg-type]
                sort_direction=sort_direction,
                max_summary_lines=max_summary_lines,  # type: ignore[arg-type]
                svg=svg,
                svg_access=svg_access,
                hide_time_measurements=view_hide_time,
            )
        )

    return HistoryConfig(
        views=views,
        present_year=present_year,
        present_month=present_month,
        present_day=present_day,
        hide_time_measurements=hide_time_measurements,
        svg_output_dir=svg_output_dir,
        svg_public_template=svg_public_template,
        svg_private_template=svg_private_template,
        svg_access_default=svg_access_default,
    )
