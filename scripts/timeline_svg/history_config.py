from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import tomllib


@dataclass(frozen=True)
class HistoryView:
    id: str
    title: str
    pov: Optional[str]
    include_povs: Optional[list[str]]
    range: Optional[dict[str, object]]
    use_event: Optional[str]
    series: Optional[str]
    tick_scale: Optional[str]
    tick_spacing_px: Optional[int]
    sort_direction: Optional[str]
    svg: Optional[str]


@dataclass(frozen=True)
class HistoryConfig:
    views: list[HistoryView]


def load_history_config(path: Path) -> HistoryConfig:
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
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
        pov = (str(item.get("pov")).strip() if item.get("pov") is not None else None) or None
        include_povs = item.get("include_povs")
        if include_povs is not None and not isinstance(include_povs, list):
            raise SystemExit(f"{path}: view '{view_id}' include_povs must be a list")
        include_povs = [str(v).strip() for v in include_povs] if isinstance(include_povs, list) else None

        range_cfg = item.get("range")
        if range_cfg is not None and not isinstance(range_cfg, dict):
            raise SystemExit(f"{path}: view '{view_id}' range must be a table")

        use_event = (str(item.get("use_event")).strip() if item.get("use_event") is not None else None) or None
        series = (str(item.get("series")).strip() if item.get("series") is not None else None) or None
        tick_scale = (str(item.get("tick_scale")).strip() if item.get("tick_scale") is not None else None) or None
        tick_spacing_px = item.get("tick_spacing_px")
        if tick_spacing_px is not None:
            tick_spacing_px = int(tick_spacing_px)
        sort_direction = (str(item.get("sort_direction")).strip() if item.get("sort_direction") is not None else None) or None
        svg = (str(item.get("svg")).strip() if item.get("svg") is not None else None) or None

        if not pov and not series:
            raise SystemExit(f"{path}: view '{view_id}' must define either pov=... or series=...")

        views.append(
            HistoryView(
                id=view_id,
                title=title,
                pov=pov,
                include_povs=include_povs,
                range=range_cfg,  # type: ignore[arg-type]
                use_event=use_event,
                series=series,
                tick_scale=tick_scale,
                tick_spacing_px=tick_spacing_px,  # type: ignore[arg-type]
                sort_direction=sort_direction,
                svg=svg,
            )
        )

    return HistoryConfig(views=views)

