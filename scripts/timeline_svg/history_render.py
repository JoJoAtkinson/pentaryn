from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Sequence

from .history_config import HistoryView, load_history_config
from .model import BuildConfig, FontPaths, MeasureConfig, RendererConfig
from .pipeline import build_timeline_svg
from .timeline_generate import (
    build_series_windows,
    collect_events_for_view,
    derive_range_limits,
    format_mermaid_date,
    group_events,
    load_tsv_rows,
    validate_variants,
    write_tsv_export,
)


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


def _export_rows_for_series(*, series: str, series_windows: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    windows: list[object] = list((series_windows.get(series) or {}).values())
    windows.sort(key=lambda w: w.start.ordinal())  # type: ignore[attr-defined]
    rows: list[dict[str, object]] = []
    for win in windows:
        start = win.start  # type: ignore[attr-defined]
        end = win.end  # type: ignore[attr-defined]
        rows.append(
            {
                "event_id": win.event_id,  # type: ignore[attr-defined]
                "start": format_mermaid_date(start),
                "end": format_mermaid_date(end) if end else "",
                "title": win.title,  # type: ignore[attr-defined]
                "summary": "",
                "kind": series,
                "age": "",
                "factions": [],
                "tags": [],
            }
        )
    return rows


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

    for config_path in configs:
        scope_root = config_path.parent
        cfg = load_history_config(config_path)
        sources = _scope_sources(scope_root)
        if not sources:
            continue

        variants = load_tsv_rows(repo_root, sources=sources)
        events = group_events(variants)
        validate_variants(events)
        series_windows = build_series_windows(events)
        age_windows = series_windows.get("age", {})

        for view in cfg.views:
            view_build = build
            if view.sort_direction:
                view_build = replace(view_build, sort_direction=view.sort_direction)  # type: ignore[arg-type]
            if view.tick_scale:
                view_build = replace(view_build, tick_scale=view.tick_scale)  # type: ignore[arg-type]
            if view.tick_spacing_px is not None:
                view_build = replace(view_build, tick_spacing_px=int(view.tick_spacing_px))

            if view.series:
                export_rows = _export_rows_for_series(series=view.series, series_windows=series_windows)  # type: ignore[arg-type]
            else:
                view_cfg: dict[str, object] = {"pov": view.pov}
                if view.include_povs:
                    view_cfg["include_povs"] = view.include_povs
                if view.range:
                    view_cfg["range"] = view.range
                if view.use_event:
                    view_cfg["use_event"] = view.use_event
                start_cutoff, end_cutoff = derive_range_limits(view_cfg, events, series_windows)
                entries = collect_events_for_view(
                    events,
                    view_pov=view.pov or "public",
                    include_povs=view.include_povs,
                    age_windows=age_windows,  # type: ignore[arg-type]
                    start_cutoff=start_cutoff,
                    end_cutoff=end_cutoff,
                )
                export_rows = entries

            svg_path = scope_root / _default_svg_name(view)
            tsv_path = _debug_tsv_path(repo_root, scope_root, view.id)
            if debug_write_tsv:
                write_tsv_export(tsv_path, export_rows)

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
            )
