#!/usr/bin/env python3
"""
Shared timeline generator used by:
- scripts/generate_timelines.py (Markdown + Mermaid + TSV exports)
- scripts/build_timeline_svg.py (ensures a config-driven TSV export exists before rendering SVG)
"""

from __future__ import annotations

import csv
import re
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set

import tomllib

DAYS_PER_MONTH = 30
MONTHS_PER_YEAR = 12
DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR
MONTH_NAMES = [
    None,
    "Arumel",
    "Veleara",
    "Lumaeos",
    "Thaeorum",
    "Aoruvan",
    "Voraela",
    "Ulemar",
    "Saraenos",
    "Ithraeum",
    "Arethum",
    "Morvalos",
    "Aneumos",
]

EXPECTED_FIELDS = [
    "event_id",
    "pov",
    "series",
    "kind",
    "start_year",
    "start_month",
    "start_day",
    "end_year",
    "end_month",
    "end_day",
    "precision",
    "parent_id",
    "factions",
    "tags",
    "title",
    "summary",
    "inherit_truth_date",
]
ALLOWED_OVERRIDE_FIELDS = {
    "title",
    "summary",
    "start_year",
    "start_month",
    "start_day",
    "end_year",
    "end_month",
    "end_day",
    "precision",
    "inherit_truth_date",
}


def parse_bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def normalize_field(value: Optional[str]) -> str:
    return (value or "").strip()


def split_tokens(value: str) -> list[str]:
    # Accept either `a;b;c` (canonical) or whitespace-separated `a b c`.
    return [t for t in re.split(r"[;\s]+", (value or "").strip()) if t]


@dataclass
class DateSpec:
    year: int
    month: Optional[int] = None
    day: Optional[int] = None

    def ordinal(self, is_end: bool = False) -> int:
        month = self.month if self.month else (MONTHS_PER_YEAR if is_end else 1)
        day = self.day if self.day else (DAYS_PER_MONTH if is_end else 1)
        return self.year * DAYS_PER_YEAR + (month - 1) * DAYS_PER_MONTH + (day - 1)

    def label(self) -> str:
        if self.month and self.day:
            return f"{self.day} {MONTH_NAMES[self.month]} {self.year} A.F."
        if self.month and not self.day:
            return f"{MONTH_NAMES[self.month]} {self.year} A.F."
        return f"{self.year} A.F."


def ordinal_to_date(value: int) -> DateSpec:
    year = value // DAYS_PER_YEAR
    remainder = value % DAYS_PER_YEAR
    month = remainder // DAYS_PER_MONTH + 1
    day = remainder % DAYS_PER_MONTH + 1
    return DateSpec(year=year, month=month, day=day)


def previous_day(date: DateSpec) -> DateSpec:
    ordinal = date.ordinal(is_end=False) - 1
    if ordinal < 0:
        return DateSpec(year=0, month=1, day=1)
    return ordinal_to_date(ordinal)


@dataclass
class Variant:
    data: Dict[str, str]
    file: Path
    line: int
    start: Optional[DateSpec]
    end: Optional[DateSpec]
    pov: str
    inherit_truth_date: bool

    @property
    def title(self) -> str:
        return self.data["title"]

    @property
    def summary(self) -> str:
        return self.data["summary"]


@dataclass
class TimelineEvent:
    event_id: str
    canonical_pov: str
    canonical: Variant
    variants: Dict[str, Variant]

    def get_variant(self, pov: str) -> Optional[Variant]:
        return self.variants.get(pov)


@dataclass
class SeriesWindow:
    event_id: str
    title: str
    series: str
    start: DateSpec
    end: Optional[DateSpec]


def parse_date(row: Dict[str, str], prefix: str) -> Optional[DateSpec]:
    year_raw = normalize_field(row.get(f"{prefix}_year"))
    if not year_raw:
        return None
    try:
        year = int(year_raw)
    except ValueError as exc:
        raise ValueError(f"Invalid {prefix}_year '{year_raw}'") from exc
    month_raw = normalize_field(row.get(f"{prefix}_month"))
    day_raw = normalize_field(row.get(f"{prefix}_day"))
    month = int(month_raw) if month_raw else None
    day = int(day_raw) if day_raw else None
    return DateSpec(year=year, month=month, day=day)


def load_tsv_rows(root: Path, *, sources: Optional[Sequence[Path]] = None) -> List[Variant]:
    variants: List[Variant] = []
    if sources is None:
        sources = sorted(list(root.rglob("_history.tsv")) + list(root.rglob("_timeline.tsv")))
    else:
        sources = sorted(list(sources))
    if not sources:
        raise SystemExit("No _history.tsv or _timeline.tsv files were found.")

    for path in sources:
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            missing = [field for field in EXPECTED_FIELDS if field not in (reader.fieldnames or [])]
            if missing:
                raise SystemExit(f"{path}: missing expected columns: {', '.join(missing)}")
            for idx, row in enumerate(reader, start=2):
                # When a row has more columns than the header (usually from an extra tab),
                # DictReader stores extras under the `None` key.
                if None in row:
                    raise SystemExit(
                        f"{path}:{idx} has too many columns (tabbing misaligned). Remove extra tab(s) so each row matches the header."
                    )
                normalized = {field: normalize_field(row.get(field)) for field in EXPECTED_FIELDS}
                event_id = normalized["event_id"]
                pov = normalized["pov"] or ""
                if not event_id:
                    raise SystemExit(f"{path}:{idx} event_id is required.")
                if not pov:
                    raise SystemExit(f"{path}:{idx} pov is required.")
                variant = Variant(
                    data=normalized,
                    file=path,
                    line=idx,
                    start=parse_date(normalized, "start"),
                    end=parse_date(normalized, "end"),
                    pov=pov,
                    inherit_truth_date=parse_bool(normalized.get("inherit_truth_date") or ""),
                )
                variants.append(variant)
    return variants


def group_events(variants: List[Variant]) -> Dict[str, TimelineEvent]:
    events: Dict[str, TimelineEvent] = {}
    for variant in variants:
        event_id = variant.data["event_id"]
        pov = variant.pov
        if event_id not in events:
            events[event_id] = TimelineEvent(
                event_id=event_id,
                canonical_pov=pov,
                canonical=variant,
                variants={pov: variant},
            )
            continue
        if pov in events[event_id].variants:
            other = events[event_id].variants[pov]
            raise SystemExit(
                f"Duplicate (event_id, pov)=({event_id}, {pov}) found in {variant.file}:{variant.line} (already defined in {other.file}:{other.line})"
            )
        events[event_id].variants[pov] = variant
    return events


def validate_variants(events: Dict[str, TimelineEvent]) -> None:
    for event in events.values():
        if "truth" in event.variants:
            event.canonical_pov = "truth"
            event.canonical = event.variants["truth"]
        else:
            # If there's no explicit truth row, choose a canonical row deterministically.
            # This lets factions keep events purely in their own POV (e.g. `pov=rakthok` only).
            #
            # Preference order:
            # 1) the most "complete" row (most filled columns)
            # 2) non-public beats public on ties (public is often a redacted/misinformed view)
            # 3) stable lexicographic tiebreaker by pov
            def _score(pov: str, variant: Variant) -> tuple[int, int, str]:
                filled = 0
                for field in EXPECTED_FIELDS:
                    if field in {"event_id", "pov"}:
                        continue
                    if normalize_field(variant.data.get(field)):
                        filled += 1
                non_public = 1 if pov != "public" else 0
                return (filled, non_public, pov)

            canonical_pov, canonical_variant = max(
                event.variants.items(),
                key=lambda item: _score(item[0], item[1]),
            )
            event.canonical_pov = canonical_pov
            event.canonical = canonical_variant

        for pov, variant in event.variants.items():
            for field in variant.data:
                if field not in EXPECTED_FIELDS:
                    continue
                if field in {"event_id", "pov"}:
                    continue
                if pov == event.canonical_pov:
                    continue
                if field in ALLOWED_OVERRIDE_FIELDS:
                    continue
                if normalize_field(variant.data[field]) and normalize_field(variant.data[field]) != normalize_field(
                    event.canonical.data[field]
                ):
                    raise SystemExit(
                        f"{variant.file}:{variant.line} overrides disallowed field '{field}' for event '{event.event_id}'."
                    )


def build_series_windows(events: Dict[str, TimelineEvent]) -> Dict[str, Dict[str, SeriesWindow]]:
    series_windows: Dict[str, Dict[str, SeriesWindow]] = {}
    for event in events.values():
        series_name = normalize_field(event.canonical.data.get("series"))
        if not series_name:
            continue
        if not event.canonical.start:
            continue
        series_windows.setdefault(series_name, {})[event.event_id] = SeriesWindow(
            event_id=event.event_id,
            title=event.canonical.title or event.event_id,
            series=series_name,
            start=event.canonical.start,
            end=event.canonical.end,
        )

    for series_name, windows in series_windows.items():
        ordered = sorted(windows.values(), key=lambda w: w.start.ordinal())
        for idx, window in enumerate(ordered):
            if window.end:
                continue
            next_window = ordered[idx + 1] if idx + 1 < len(ordered) else None
            if next_window:
                windows[window.event_id] = SeriesWindow(
                    event_id=window.event_id,
                    title=window.title,
                    series=series_name,
                    start=window.start,
                    end=previous_day(next_window.start),
                )
    return series_windows


def compute_age_label(canonical_start: DateSpec, age_windows: Dict[str, SeriesWindow]) -> Optional[str]:
    for window in age_windows.values():
        start_ord = window.start.ordinal()
        end_ord = window.end.ordinal(is_end=True) if window.end else None
        point = canonical_start.ordinal()
        if point < start_ord:
            continue
        if end_ord is None or point <= end_ord:
            return window.title
    return None


def resolve_variant_for_view(event: TimelineEvent, pov: str) -> Optional[Variant]:
    return event.get_variant(pov) or event.canonical


def effective_dates(event: TimelineEvent, variant: Variant, view_pov: str) -> Optional[tuple[DateSpec, Optional[DateSpec]]]:
    start = variant.start or event.canonical.start
    end = variant.end or event.canonical.end
    if view_pov == "public":
        public_variant = event.variants.get("public")
        if not public_variant or not public_variant.start:
            return None
    if variant.pov != event.canonical_pov and variant.inherit_truth_date:
        # Never allow public to inherit truth dates.
        if view_pov == "public":
            return None
        start = event.canonical.start or start
        end = event.canonical.end or end
    if not start:
        return None
    return start, end


def date_in_range(
    start: DateSpec,
    end: Optional[DateSpec],
    start_cutoff: Optional[int],
    end_cutoff: Optional[int],
) -> bool:
    start_ord = start.ordinal()
    end_ord = end.ordinal(is_end=True) if end else start_ord
    if start_cutoff is not None and end_ord < start_cutoff:
        return False
    if end_cutoff is not None and start_ord > end_cutoff:
        return False
    return True


def format_mermaid_date(date: DateSpec) -> str:
    if date.month and date.day:
        return f"{date.year}-{date.month:02d}-{date.day:02d}"
    if date.month and not date.day:
        return f"{date.year}-{date.month:02d}"
    return str(date.year)


def format_range(start: DateSpec, end: Optional[DateSpec]) -> str:
    if not end:
        return start.label()
    if start.ordinal() == end.ordinal(is_end=True):
        return start.label()
    return f"{start.label()} → {end.label()}"


def build_markdown_view(
    *,
    title: str,
    events: List[Dict[str, object]],
    target_file: Path,
    include_povs: Optional[List[str]],
) -> None:
    lines = [f"# {title}", ""]
    for event in events:
        lines.append(f"## {event['title']}")
        lines.append("")
        lines.append(f"- **When**: {event['range']}")
        if event.get("age"):
            lines.append(f"- **Age**: {event['age']}")
        if event.get("factions"):
            lines.append(f"- **Factions**: {'; '.join(event['factions'])}")
        if event.get("tags"):
            lines.append(f"- **Tags**: {'; '.join(event['tags'])}")
        lines.append("")
        summary = str(event.get("summary") or "").strip()
        if summary:
            lines.append(textwrap.fill(summary, width=88))
            lines.append("")
        perceptions = event.get("perceptions") or {}
        if include_povs and isinstance(perceptions, dict):
            for pov in include_povs:
                if pov not in perceptions:
                    continue
                lines.append(f"### {pov.title()} View")
                lines.append("")
                lines.append(textwrap.fill(str(perceptions[pov]), width=88))
                lines.append("")
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def build_mermaid_view(
    *,
    title: str,
    windows: List[SeriesWindow],
    target_file: Path,
    present_year: int,
) -> None:
    lines = [f"# {title}", "", "```mermaid", "timeline", f"    title {title}"]
    for window in windows:
        start = format_mermaid_date(window.start)
        if window.end:
            end = format_mermaid_date(window.end)
            label = window.title
        else:
            end = str(present_year)
            label = f"{window.title} (ongoing)"
        lines.append(f"    {start} --> {end} : {label}")
    lines.append("```")
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def build_mermaid_events_view(
    *,
    title: str,
    entries: List[Dict[str, object]],
    target_file: Path,
    present_year: int,
) -> None:
    lines = [f"# {title}", "", "```mermaid", "timeline", f"    title {title}"]
    for entry in entries:
        start = entry["start"]  # type: ignore[assignment]
        end = entry["end"]  # type: ignore[assignment]
        label = entry["title"]  # type: ignore[assignment]
        if start is None:
            continue
        if end is None:
            lines.append(f"    {format_mermaid_date(start)} : {label}")
            continue
        if start.ordinal() == end.ordinal(is_end=True):
            lines.append(f"    {format_mermaid_date(start)} : {label}")
            continue
        end_effective = end if end else DateSpec(present_year, 12, 30)
        lines.append(f"    {format_mermaid_date(start)} --> {format_mermaid_date(end_effective)} : {label}")
    lines.append("```")
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def write_tsv_export(target_file: Path, rows: List[Dict[str, object]]) -> None:
    fieldnames = [
        "event_id",
        "start",
        "end",
        "title",
        "summary",
        "kind",
        "age",
        "factions",
        "tags",
    ]
    target_file.parent.mkdir(parents=True, exist_ok=True)
    with target_file.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "event_id": row.get("event_id", ""),
                    "start": row.get("start", ""),
                    "end": row.get("end", ""),
                    "title": row.get("title", ""),
                    "summary": row.get("summary", ""),
                    "kind": row.get("kind", ""),
                    "age": row.get("age", "") or "",
                    "factions": ";".join(row.get("factions", []) or []),
                    "tags": ";".join(row.get("tags", []) or []),
                }
            )


def derive_range_limits(
    view_cfg: Dict[str, object],
    events: Dict[str, TimelineEvent],
    series_windows: Dict[str, Dict[str, SeriesWindow]],
    *,
    present_year: int | None = None,
) -> tuple[Optional[int], Optional[int]]:
    start_cutoff = end_cutoff = None
    range_cfg = view_cfg.get("range") or {}
    if "use_event" in view_cfg:
        event_id = view_cfg["use_event"]
        if event_id not in events:
            raise SystemExit(f"View references unknown event_id '{event_id}'.")
        canonical = events[event_id].canonical
        start_cutoff = canonical.start.ordinal() if canonical.start else None
        end_date = canonical.end
        if not end_date:
            series_name = normalize_field(events[event_id].canonical.data.get("series"))
            if series_name and event_id in series_windows.get(series_name, {}):
                end_date = series_windows[series_name][event_id].end
        end_cutoff = end_date.ordinal(is_end=True) if end_date else None
    if isinstance(range_cfg, dict):
        if "start_year" in range_cfg:
            start_cutoff = DateSpec(int(range_cfg["start_year"]), 1, 1).ordinal()
        if "end_year" in range_cfg:
            end_cutoff = DateSpec(int(range_cfg["end_year"]), MONTHS_PER_YEAR, DAYS_PER_MONTH).ordinal()
    if isinstance(range_cfg, dict) and "last_years" in range_cfg:
        max_year = present_year if present_year is not None else max(event.canonical.start.year for event in events.values() if event.canonical.start)
        span = int(range_cfg["last_years"])
        start_year = max_year - span + 1
        start_cutoff = DateSpec(start_year, 1, 1).ordinal()
        end_cutoff = DateSpec(max_year, MONTHS_PER_YEAR, DAYS_PER_MONTH).ordinal()
    return start_cutoff, end_cutoff


def collect_events_for_view(
    events: Dict[str, TimelineEvent],
    *,
    view_pov: str,
    include_povs: Optional[List[str]],
    age_windows: Dict[str, SeriesWindow],
    start_cutoff: Optional[int],
    end_cutoff: Optional[int],
    tags_any: Optional[List[str]] = None,
) -> List[Dict[str, object]]:
    entries: List[Dict[str, object]] = []
    tags_any = [t for t in (tags_any or []) if str(t).strip()]
    for event in events.values():
        variant = resolve_variant_for_view(event, view_pov)
        if variant is None:
            continue
        dates = effective_dates(event, variant, view_pov)
        if not dates:
            continue
        start, end = dates
        if not date_in_range(start, end, start_cutoff, end_cutoff):
            continue
        if tags_any:
            tags = split_tokens(event.canonical.data.get("tags") or "")
            if not any(t in tags for t in tags_any):
                continue
        summary = variant.summary or event.canonical.summary
        tags = split_tokens(event.canonical.data.get("tags") or "")
        entry: Dict[str, object] = {
            "event_id": event.event_id,
            "pov": variant.pov,
            "title": variant.title or event.canonical.title or event.event_id,
            "summary": summary,
            "kind": event.canonical.data.get("kind") or "event",
            "range": format_range(start, end),
            "start": format_mermaid_date(start) if start else "",
            "end": format_mermaid_date(end) if end else "",
            "factions": [
                faction.strip()
                for faction in split_tokens(event.canonical.data.get("factions") or "")
                if faction
            ],
            "tags": tags,
            "series_label": event.canonical.data.get("series") or "",
            "perceptions": {},
            "age": compute_age_label(event.canonical.start, age_windows) if event.canonical.start else None,
            "sort_key": event.canonical.start.ordinal() if event.canonical.start else 0,
        }
        if include_povs:
            perceptions: Dict[str, str] = {}
            for pov in include_povs:
                alt = event.variants.get(pov)
                if alt:
                    perceptions[pov] = alt.summary
            entry["perceptions"] = perceptions
        entries.append(entry)
    entries.sort(key=lambda item: item["sort_key"])  # type: ignore[index]
    return entries


def load_views_config(config_path: Path) -> List[Dict[str, object]]:
    config = tomllib.loads(config_path.read_text(encoding="utf-8"))
    views = config.get("views") or []
    if not views:
        raise SystemExit("No views defined in config.")
    if not isinstance(views, list):
        raise SystemExit("Config 'views' must be a list.")
    return views  # type: ignore[return-value]


@dataclass(frozen=True)
class GenerateResult:
    tsv_exports: Dict[str, Path]


def generate_from_config(
    *,
    root: Path,
    config_path: Path,
    only_view_ids: Optional[Set[str]] = None,
    only_types: Optional[Set[str]] = None,
    quiet: bool = False,
) -> GenerateResult:
    views = load_views_config(config_path)
    if only_view_ids:
        views = [v for v in views if (v.get("id") in only_view_ids)]
        missing = only_view_ids - {v.get("id") for v in views}
        if missing:
            raise SystemExit(f"Unknown view ids in config: {', '.join(sorted(missing))}")

    variants = load_tsv_rows(root)
    events = group_events(variants)
    validate_variants(events)
    series_windows = build_series_windows(events)
    age_windows = series_windows.get("age", {})
    present_year = max(event.canonical.start.year for event in events.values() if event.canonical.start)

    types = only_types or {"markdown", "mermaid", "tsv"}
    tsv_exports: Dict[str, Path] = {}

    for view_cfg in views:
        view_id = view_cfg.get("id") or "view"
        title = view_cfg.get("title") or f"Timeline: {view_id}"
        view_type = view_cfg.get("type", "markdown")
        output_path = view_cfg.get("output") or f"world/history/generated/{view_id}.md"
        target_file = (root / output_path).resolve()

        if view_type == "mermaid":
            if "mermaid" not in types and "tsv" not in types:
                continue
            target_series = view_cfg.get("series")
            if target_series:
                windows = list(series_windows.get(target_series, {}).values())
                windows.sort(key=lambda win: win.start.ordinal())
                if "mermaid" in types:
                    build_mermaid_view(
                        title=title,
                        windows=windows,
                        target_file=target_file,
                        present_year=present_year,
                    )
                    if not quiet:
                        print(f"[mermaid] wrote {target_file}")
                continue

            pov = view_cfg.get("pov")
            if not pov:
                raise SystemExit(
                    f"View '{view_id}' requires either a series (for ranges) or a pov (for event timeline) for mermaid output."
                )
            tags_any = view_cfg.get("tags_any") or []
            if not isinstance(tags_any, list):
                raise SystemExit(f"View '{view_id}' tags_any must be a list when provided.")
            tags_any = [str(t).strip() for t in tags_any if str(t).strip()]
            start_cutoff, end_cutoff = derive_range_limits(view_cfg, events, series_windows, present_year=present_year)
            entries: List[Dict[str, object]] = []
            for event in events.values():
                variant = resolve_variant_for_view(event, pov)
                if variant is None:
                    continue
                dates = effective_dates(event, variant, pov)
                if not dates:
                    continue
                start, end = dates
                if not date_in_range(start, end, start_cutoff, end_cutoff):
                    continue
                if tags_any:
                    tags = split_tokens(event.canonical.data.get("tags") or "")
                    if not any(t in tags for t in tags_any):
                        continue
                entries.append(
                    {
                        "event_id": event.event_id,
                        "title": variant.title or event.canonical.title or event.event_id,
                        "start": start,
                        "end": end,
                        "summary": variant.summary or event.canonical.summary,
                        "kind": event.canonical.data.get("kind") or "event",
                        "age": compute_age_label(event.canonical.start, age_windows) if event.canonical.start else "",
                        "factions": [
                            faction.strip()
                            for faction in split_tokens(event.canonical.data.get("factions") or "")
                            if faction
                        ],
                        "tags": split_tokens(event.canonical.data.get("tags") or ""),
                        "sort_key": start.ordinal() if start else 0,
                    }
                )
            entries.sort(key=lambda item: item["sort_key"])  # type: ignore[index]
            if "tsv" in types and view_cfg.get("tsv_output"):
                export_path = (root / str(view_cfg["tsv_output"])).resolve()
                export_rows: List[Dict[str, object]] = []
                for item in entries:
                    start = item["start"]
                    end = item["end"]
                    export_rows.append(
                        {
                            "event_id": item.get("event_id", ""),
                            "start": format_mermaid_date(start) if start else "",
                            "end": format_mermaid_date(end) if end else "",
                            "title": item.get("title", ""),
                            "summary": item.get("summary", ""),
                            "kind": item.get("kind", ""),
                            "age": item.get("age", "") or "",
                            "factions": item.get("factions", []) or [],
                            "tags": item.get("tags", []) or [],
                        }
                    )
                write_tsv_export(export_path, export_rows)
                tsv_exports[str(view_id)] = export_path
                if not quiet:
                    print(f"[tsv] wrote {export_path}")
            if "mermaid" in types:
                build_mermaid_events_view(
                    title=title,
                    entries=entries,
                    target_file=target_file,
                    present_year=present_year,
                )
                if not quiet:
                    print(f"[mermaid] wrote {target_file}")
            continue

        if "markdown" not in types and "tsv" not in types:
            continue

        pov = view_cfg.get("pov")
        if not pov:
            raise SystemExit(f"View '{view_id}' must define a pov.")
        include_povs = view_cfg.get("include_povs")
        start_cutoff, end_cutoff = derive_range_limits(view_cfg, events, series_windows, present_year=present_year)
        entries = collect_events_for_view(
            events,
            view_pov=pov,
            include_povs=include_povs,
            age_windows=age_windows,
            start_cutoff=start_cutoff,
            end_cutoff=end_cutoff,
            tags_any=view_cfg.get("tags_any"),  # type: ignore[arg-type]
        )
        if "markdown" in types:
            build_markdown_view(
                title=title,
                events=entries,
                target_file=target_file,
                include_povs=include_povs,
            )
            if not quiet:
                print(f"[markdown] wrote {target_file}")
        if "tsv" in types and view_cfg.get("tsv_output"):
            export_path = (root / str(view_cfg["tsv_output"])).resolve()
            write_tsv_export(export_path, entries)
            tsv_exports[str(view_id)] = export_path
            if not quiet:
                print(f"[tsv] wrote {export_path}")

    return GenerateResult(tsv_exports=tsv_exports)
