from __future__ import annotations

import collections
import csv
import hashlib
import os
import re
import subprocess
from dataclasses import replace
from pathlib import Path
from typing import Sequence

from .history_config import HistoryConfig, HistoryView, load_history_config
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


_DATE_RE = re.compile(r"^(?P<year>\d{1,6})(?:/(?P<month>\d{1,2})(?:/(?P<day>\d{1,2})(?:-(?P<hour>\d{1,2}))?)?)?$")
_UNKNOWN_DATE_SENTINELS = {"???", "TBD", "UNKNOWN"}


def _split_tokens(value: str) -> list[str]:
    return [t for t in re.split(r"[;\s]+", (value or "").strip()) if t]


def _slugify_filename_part(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return "timeline"
    raw = raw.replace("&", " and ")
    raw = re.sub(r"[^a-zA-Z0-9]+", "-", raw)
    raw = re.sub(r"-{2,}", "-", raw).strip("-")
    return raw.lower() or "timeline"


def _write_svg_viewer_html(*, target: Path, title: str, svg_filename: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    safe_title = (title or "").strip() or "Timeline"
    safe_svg = (svg_filename or "").strip()
    if not safe_svg:
        raise ValueError("svg_filename is required")

    target.write_text(
        f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{safe_title}</title>
    <style>
      body {{
        margin: 0;
        height: 100vh;
        overflow: hidden;
        background: #fbf7ef;
      }}
      #controls {{
        position: fixed;
        top: 12px;
        right: 12px;
        display: flex;
        gap: 8px;
        z-index: 10;
      }}
      #controls button {{
        padding: 6px 10px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        border-radius: 6px;
        background: white;
        cursor: pointer;
      }}
      #viewport {{
        height: 100%;
        width: 100%;
        overflow: auto;
        padding: 24px;
        box-sizing: border-box;
      }}
      #content {{
        display: inline-block;
        transform: scale(var(--scale, 1));
        transform-origin: 0 0;
      }}
      #timeline {{
        display: block;
        height: auto;
        max-width: none;
      }}
    </style>
  </head>
  <body>
    <div id="controls">
      <button id="zoomOut" type="button">−</button>
      <button id="zoomIn" type="button">+</button>
      <button id="zoomReset" type="button">Reset</button>
      <button id="zoomFit" type="button">Fit</button>
    </div>
    <div id="viewport">
      <div id="content">
        <img id="timeline" src="./{safe_svg}" alt="{safe_title}" />
      </div>
    </div>
    <script>
      const viewport = document.getElementById("viewport");
      const content = document.getElementById("content");
      const img = document.getElementById("timeline");

      const MIN_SCALE = 0.2;
      const MAX_SCALE = 6;
      const SCALE_STEP = 1.15;

      let scale = 1;
      function setScale(nextScale, anchor) {{
        const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
        if (clamped === scale) return;

        const rect = viewport.getBoundingClientRect();
        const anchorX = (anchor?.x ?? rect.width / 2) - rect.left;
        const anchorY = (anchor?.y ?? rect.height / 2) - rect.top;

        const contentX = (viewport.scrollLeft + anchorX) / scale;
        const contentY = (viewport.scrollTop + anchorY) / scale;

        scale = clamped;
        content.style.setProperty("--scale", String(scale));

        viewport.scrollLeft = contentX * scale - anchorX;
        viewport.scrollTop = contentY * scale - anchorY;
      }}

      function zoomIn(anchor) {{
        setScale(scale * SCALE_STEP, anchor);
      }}
      function zoomOut(anchor) {{
        setScale(scale / SCALE_STEP, anchor);
      }}
      function reset() {{
        setScale(1);
      }}
      function fitToWidth() {{
        const availableWidth = Math.max(1, viewport.clientWidth - 48);
        const naturalWidth = img.naturalWidth || img.width || 1;
        setScale(availableWidth / naturalWidth);
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
      }}

      document.getElementById("zoomIn").addEventListener("click", () => zoomIn());
      document.getElementById("zoomOut").addEventListener("click", () => zoomOut());
      document.getElementById("zoomReset").addEventListener("click", reset);
      document.getElementById("zoomFit").addEventListener("click", fitToWidth);

      viewport.addEventListener(
        "wheel",
        (e) => {{
          if (!e.ctrlKey) return;
          e.preventDefault();
          const anchor = {{ x: e.clientX, y: e.clientY }};
          if (e.deltaY < 0) zoomIn(anchor);
          else zoomOut(anchor);
        }},
        {{ passive: false }}
      );

      img.addEventListener("load", () => {{
        fitToWidth();
      }});
    </script>
  </body>
</html>
""",
        encoding="utf-8",
    )


def _normalize_date(date_raw: str) -> tuple[str, ParsedDate | None, bool]:
    raw = (date_raw or "").strip()
    if not raw:
        raise ValueError("date is required")
    if raw.upper() in _UNKNOWN_DATE_SENTINELS:
        return raw, None, True
    m = _DATE_RE.match(raw)
    if not m:
        raise ValueError(f"Invalid date {date_raw!r} (expected YYYY, YYYY/MM, or YYYY/MM/DD)")
    year = int(m.group("year"))
    month_raw = m.group("month")
    day_raw = m.group("day")
    hour_raw = m.group("hour")
    if not month_raw:
        norm = str(year)
    else:
        month = int(month_raw)
        if not day_raw:
            norm = f"{year}/{month:02d}"
        else:
            day = int(day_raw)
            if hour_raw is not None:
                hour = int(hour_raw)
                if hour < 0 or hour > 23:
                    raise ValueError(f"Invalid hour {hour_raw!r} (expected 0-23)")
                norm = f"{year}/{month:02d}/{day:02d}-{hour:02d}"
            else:
                norm = f"{year}/{month:02d}/{day:02d}"
    parsed = parse_game_date(norm, "", "")
    return norm, parsed, False


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
        # Allow "pretty" TSV headers that are visually column-aligned with spaces.
        reader.fieldnames = [name.strip() for name in reader.fieldnames]
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
            date_raw = row.get("date") or ""
            date_norm, parsed_date, is_unknown_date = _normalize_date(date_raw)
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
            # Placeholder date values for unknown dates; they get resolved after present_year is known.
            if parsed_date is None:
                parsed_date = ParsedDate(year=0, month=1, day=1)
            rows.append(
                {
                    "event_id": event_id,
                    "title": title,
                    "summary": summary,
                    "tags": tags,
                    "date": parsed_date,
                    "date_str": date_norm,
                    "date_unknown": is_unknown_date,
                    "duration": duration,
                    "file": path,
                    "line": idx,
                    "axis_day": _row_axis_day(parsed_date),
                }
            )
        return rows


def _parse_tsv_line(line: str, *, header: list[str]) -> dict[str, str] | None:
    parts = line.rstrip("\n").split("\t")
    if len(parts) != len(header):
        return None
    return {header[i]: parts[i] for i in range(len(header))}


def _row_signature(row: dict[str, str]) -> tuple[str, ...]:
    # Stable signature for matching "same event, id renamed": all columns except event_id.
    return tuple(v for k, v in row.items() if k != "event_id")


def _git_change_sets_from_diff(*, diff_text: str, header_line: str) -> tuple[set[str], set[str]]:
    header = [h.strip() for h in header_line.split("\t")]
    if not header or "event_id" not in header:
        return set(), set()

    removed: list[dict[str, str]] = []
    added: list[dict[str, str]] = []
    for raw in (diff_text or "").splitlines():
        if not raw:
            continue
        if raw.startswith(("diff ", "index ", "--- ", "+++ ", "@@")):
            continue
        if raw[0] not in "+-":
            continue
        if raw.startswith("+++ ") or raw.startswith("--- "):
            continue

        line = raw[1:]
        # Ignore header row edits; we only care about event rows.
        if line.strip() == header_line.strip():
            continue
        parsed = _parse_tsv_line(line, header=header)
        if parsed is None:
            continue
        if raw[0] == "-":
            removed.append(parsed)
        else:
            added.append(parsed)

    removed_counts = collections.Counter(_row_signature(r) for r in removed)
    renamed_ids: set[str] = set()
    for row in added:
        sig = _row_signature(row)
        if removed_counts.get(sig, 0) <= 0:
            continue
        removed_counts[sig] -= 1
        event_id = (row.get("event_id") or "").strip()
        if event_id:
            renamed_ids.add(event_id)

    removed_by_id: dict[str, list[dict[str, str]]] = {}
    added_by_id: dict[str, list[dict[str, str]]] = {}
    for r in removed:
        eid = (r.get("event_id") or "").strip()
        if eid:
            removed_by_id.setdefault(eid, []).append(r)
    for r in added:
        eid = (r.get("event_id") or "").strip()
        if eid:
            added_by_id.setdefault(eid, []).append(r)

    # A "changed row" is modeled as a remove + add for the same event_id.
    changed_rows = set(removed_by_id.keys()) & set(added_by_id.keys())
    return renamed_ids, changed_rows


def _git_changed_event_ids_for_file(*, repo_root: Path, path: Path, base_ref: str) -> set[str]:
    """
    Detect event_id renames by comparing the working tree TSV to `base_ref`.

    Heuristic: if a row is removed and a row is added with identical non-event_id columns, then
    event_id was renamed; returns the *new* (added) event_id(s).
    """
    try:
        rel = path.resolve().relative_to(repo_root.resolve())
    except ValueError:
        rel = path

    try:
        header_line = path.read_text(encoding="utf-8", errors="replace").splitlines()[0]
    except Exception:
        return set()

    try:
        proc = subprocess.run(
            ["git", "diff", "--unified=0", base_ref, "--", str(rel)],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONUTF8": "1"},
        )
    except Exception:
        return set()

    # If base_ref doesn't exist (e.g., first commit), skip.
    if proc.returncode not in (0, 1):  # 1 means "diffs found"
        return set()
    diff = proc.stdout or ""
    if not diff.strip():
        return set()

    renamed_ids, _changed_rows = _git_change_sets_from_diff(diff_text=diff, header_line=header_line)
    return renamed_ids


def _git_changed_rows_for_file(*, repo_root: Path, path: Path, base_ref: str) -> set[str]:
    try:
        rel = path.resolve().relative_to(repo_root.resolve())
    except ValueError:
        rel = path

    try:
        header_line = path.read_text(encoding="utf-8", errors="replace").splitlines()[0]
    except Exception:
        return set()

    try:
        proc = subprocess.run(
            ["git", "diff", "--unified=0", base_ref, "--", str(rel)],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONUTF8": "1"},
        )
    except Exception:
        return set()

    if proc.returncode not in (0, 1):
        return set()
    diff = proc.stdout or ""
    if not diff.strip():
        return set()

    _renamed_ids, changed_rows = _git_change_sets_from_diff(diff_text=diff, header_line=header_line)
    return changed_rows


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
    default_present_month = None
    default_present_day = None
    default_svg_output_dir = None
    default_svg_public_template = None
    default_svg_private_template = None
    default_svg_access_default = None
    world_root_cfg = world_root / "_history.config.toml"
    if world_root_cfg.exists():
        try:
            root_cfg = load_history_config(world_root_cfg)
            default_present_year = root_cfg.present_year
            default_present_month = root_cfg.present_month
            default_present_day = root_cfg.present_day
            default_svg_output_dir = root_cfg.svg_output_dir
            default_svg_public_template = root_cfg.svg_public_template
            default_svg_private_template = root_cfg.svg_private_template
            default_svg_access_default = root_cfg.svg_access_default
        except Exception:
            default_present_year = None

    pov_catalog = PovCatalog.discover(repo_root=repo_root)

    def resolve_svg_path(*, scope_root: Path, cfg_path: Path, cfg: "HistoryConfig", view: HistoryView) -> Path:
        output_dir = cfg.svg_output_dir or default_svg_output_dir
        base_dir = (repo_root / output_dir) if output_dir else scope_root

        if view.svg:
            return base_dir / view.svg

        access = (view.svg_access or cfg.svg_access_default or default_svg_access_default or "legacy").strip().lower()
        if access == "legacy":
            return base_dir / _default_svg_name(view)

        try:
            scope_rel = scope_root.resolve().relative_to(repo_root.resolve()).as_posix()
        except ValueError:
            scope_rel = scope_root.as_posix()
        scope_slug = scope_rel.strip("/").replace("/", ".") or "root"
        digest_input = f"{scope_rel}:{view.id}".encode("utf-8", errors="replace")
        stable_hash = hashlib.sha1(digest_input).hexdigest()[:12]
        title_slug = _slugify_filename_part(view.title or view.id)

        if access == "public":
            template = cfg.svg_public_template or default_svg_public_template or f"history.{{id}}.svg"
        elif access == "private":
            template = cfg.svg_private_template or default_svg_private_template or f"history.{{hash}}.svg"
        else:
            raise SystemExit(f"{cfg_path}: view '{view.id}' svg_access must be one of: legacy, public, private")

        try:
            rendered = template.format(
                id=view.id,
                hash=stable_hash,
                scope=scope_slug,
                title=title_slug,
                title_slug=title_slug,
            )
        except Exception as exc:
            raise SystemExit(
                f"{cfg_path}: view '{view.id}' invalid svg_*_template: {exc} (supported placeholders: {{id}}, {{hash}}, {{scope}}, {{title_slug}})"
            ) from exc
        rendered = str(rendered).strip()
        if not rendered:
            raise SystemExit(f"{cfg_path}: view '{view.id}' svg_*_template produced an empty path")

        return base_dir / rendered

    for config_path in configs:
        scope_root = config_path.parent
        cfg = load_history_config(config_path)
        sources = _scope_sources(scope_root)
        if not sources:
            continue

        scope_pov = scope_root.name

        renamed_ids_by_file: dict[Path, set[str]] = {}
        changed_rows_by_file: dict[Path, set[str]] = {}
        if build.highlight_git_id_changes:
            base_ref = (build.git_base_ref or "HEAD~1").strip() or "HEAD~1"
            for src in sources:
                if src.name not in {"_history.tsv", "_timeline.tsv"}:
                    continue
                renamed_ids_by_file[src] = _git_changed_event_ids_for_file(repo_root=repo_root, path=src, base_ref=base_ref)
                changed_rows_by_file[src] = _git_changed_rows_for_file(repo_root=repo_root, path=src, base_ref=base_ref)

        rows: list[dict[str, object]] = []
        for src in sources:
            file_rows = _read_history_rows(src)
            file_renamed_ids = renamed_ids_by_file.get(src)
            file_changed_rows = changed_rows_by_file.get(src)
            if file_renamed_ids or file_changed_rows:
                for r in file_rows:
                    event_id = str(r.get("event_id") or "")
                    tags = list(r.get("tags") or [])
                    if file_changed_rows and event_id in file_changed_rows:
                        if "changed" not in tags:
                            tags.append("changed")
                    if file_renamed_ids and event_id in file_renamed_ids:
                        if "changed-id" not in tags:
                            tags.append("changed-id")
                    r["tags"] = tags
            rows.extend(file_rows)

        present_year = cfg.present_year if cfg.present_year is not None else default_present_year
        present_month = cfg.present_month if cfg.present_month is not None else default_present_month
        present_day = cfg.present_day if cfg.present_day is not None else default_present_day
        if present_year is None:
            # Best-effort "now" for ranges: max year present in rows.
            present_year = max(int((r["date"].year)) for r in rows) if rows else 0

        # Resolve unknown dates ("???") to a synthetic "end-of-timeline" date.
        # This is a display hack: it places unknown-date events at the end without claiming a real timestamp.
        # The `unknown-date` tag provides an explicit visual cue that the timestamp is not authoritative.
        unknown_date_norm = f"{int(present_year)}/12/30"
        unknown_parsed = parse_game_date(unknown_date_norm, "", "")
        unknown_axis = _row_axis_day(unknown_parsed)
        for r in rows:
            if not r.get("date_unknown"):
                continue
            r["date"] = unknown_parsed
            r["date_str"] = unknown_date_norm
            r["axis_day"] = unknown_axis
            tags = list(r.get("tags") or [])
            if "unknown-date" not in tags:
                tags.append("unknown-date")
            r["tags"] = tags

        for view in cfg.views:
            view_build = build
            view_measure = measure
            if view.sort_direction:
                view_build = replace(view_build, sort_direction=view.sort_direction)  # type: ignore[arg-type]
            if view.tick_scale:
                view_build = replace(view_build, tick_scale=view.tick_scale)  # type: ignore[arg-type]
            if view.tick_spacing_px is not None:
                view_build = replace(view_build, tick_spacing_px=int(view.tick_spacing_px))
            if view.max_summary_lines is not None:
                view_measure = replace(view_measure, max_summary_lines=int(view.max_summary_lines))
            if view.hide_time_measurements:
                view_build = replace(view_build, render_ticks=False)

            filtered = [
                r
                for r in rows
                if _tags_match(set(r["tags"]), any_of=view.tags_any, all_of=view.tags_all, none_of=view.tags_none)  # type: ignore[arg-type]
                and _in_range(r, range_cfg=view.range, present_year=int(present_year))
            ]
            filtered.sort(key=lambda r: float(r["axis_day"]))  # type: ignore[arg-type]
            if (view_build.sort_direction or "desc") == "desc":
                filtered.reverse()

            # Optionally extend the axis to a declared "present" year so ticks can show e.g. ⋈50 at 4327 even if the latest
            # dated event in this scope is earlier.
            if present_year is not None:
                if view_build.tick_scale in {"day", "month"} and present_month is not None and present_day is not None:
                    present_axis = int(date_to_axis_days(ParsedDate(year=int(present_year), month=int(present_month), day=int(present_day))))
                    view_build = replace(view_build, axis_max_day=max(view_build.axis_max_day or -10**9, present_axis))
                else:
                    view_build = replace(view_build, axis_max_year=max(view_build.axis_max_year or -10**9, present_year))

            svg_path = resolve_svg_path(scope_root=scope_root, cfg_path=config_path, cfg=cfg, view=view)
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
                measure=view_measure,
                renderer=renderer,
                build=view_build,
                pov_catalog=pov_catalog,
                scope_pov=scope_pov,
            )

            # Convenience for sharing: if the SVG output is "published" (public/private),
            # also write a sibling HTML viewer with zoom controls.
            resolved_access = (view.svg_access or cfg.svg_access_default or default_svg_access_default or "legacy").strip().lower()
            if resolved_access in {"public", "private"}:
                try:
                    html_path = svg_path.with_suffix(".html")
                    _write_svg_viewer_html(target=html_path, title=view.title, svg_filename=svg_path.name)
                except Exception as exc:
                    raise SystemExit(f"{config_path}: failed to write HTML viewer for view '{view.id}': {exc}") from exc
