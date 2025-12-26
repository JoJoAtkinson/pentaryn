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
    svg: Optional[str]


@dataclass(frozen=True)
class HistoryConfig:
    views: list[HistoryView]
    present_year: int | None = None


def load_history_config(path: Path) -> HistoryConfig:
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    present_year = raw.get("present_year")
    if present_year is not None:
        present_year = int(present_year)
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
        svg = (str(item.get("svg")).strip() if item.get("svg") is not None else None) or None

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
                svg=svg,
            )
        )

    return HistoryConfig(views=views, present_year=present_year)
