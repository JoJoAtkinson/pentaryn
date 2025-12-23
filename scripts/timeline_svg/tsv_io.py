from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterable

from .model import EventRow


SVG_COLUMNS = [
    "event_id",
    "kind",
    "start_year",
    "start_month",
    "start_day",
    "title",
    "summary",
]

GEN_COLUMNS_MIN = [
    "event_id",
    "start",
    "title",
]


def _parse_start(value: str) -> tuple[str, str, str]:
    raw = (value or "").strip()
    if not raw:
        return "", "", ""
    parts = [p for p in raw.split("-") if p]
    year = parts[0]
    month = parts[1] if len(parts) >= 2 else ""
    day = parts[2] if len(parts) >= 3 else ""
    return year, month, day


def read_tsv(path: Path) -> list[EventRow]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        if not reader.fieldnames:
            raise ValueError(f"{path} has no header row.")
        fieldnames = set(reader.fieldnames)
        uses_svg_schema = set(SVG_COLUMNS).issubset(fieldnames)
        uses_gen_schema = set(GEN_COLUMNS_MIN).issubset(fieldnames)
        if not uses_svg_schema and not uses_gen_schema:
            raise ValueError(
                f"{path} has unsupported columns. Expected either {', '.join(SVG_COLUMNS)} or at least {', '.join(GEN_COLUMNS_MIN)}."
            )

        rows: list[EventRow] = []
        for idx, raw in enumerate(reader, start=2):
            event_id = (raw.get("event_id") or "").strip()
            if not event_id:
                raise ValueError(f"{path}:{idx} event_id is required")
            title = (raw.get("title") or "").strip()
            if not title:
                raise ValueError(f"{path}:{idx} title is required")
            kind = (raw.get("kind") or "event").strip()
            if uses_svg_schema:
                start_year = (raw.get("start_year") or "").strip()
                start_month = (raw.get("start_month") or "").strip()
                start_day = (raw.get("start_day") or "").strip()
            else:
                start_year, start_month, start_day = _parse_start(raw.get("start") or "")
            if not start_year:
                raise ValueError(f"{path}:{idx} start_year/start is required")
            rows.append(
                EventRow(
                    event_id=event_id,
                    kind=kind,
                    start_year=start_year,
                    start_month=start_month,
                    start_day=start_day,
                    title=title,
                    summary=(raw.get("summary") or "").strip(),
                )
            )
        return rows


def write_sample_tsv(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=SVG_COLUMNS, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(
            [
                {
                    "event_id": "sample-accords",
                    "kind": "treaty",
                    "start_year": "4200",
                    "start_month": "",
                    "start_day": "",
                    "title": "Pentarch Accords",
                    "summary": "A web of treaties that ends the worst of the Imperial Wars and redraws borders.",
                },
                {
                    "event_id": "sample-war",
                    "kind": "war",
                    "start_year": "4150",
                    "start_month": "",
                    "start_day": "",
                    "title": "Imperial Wars",
                    "summary": "Decades of conflict between Calderon’s legions and the Haven coalition.",
                },
                {
                    "event_id": "sample-auction",
                    "kind": "event",
                    "start_year": "4312",
                    "start_month": "",
                    "start_day": "",
                    "title": "Night Auction of Names",
                    "summary": "A masked auction sells identities and debt-forgiveness; rivalries shift before dawn.",
                },
                {
                    "event_id": "sample-job",
                    "kind": "event",
                    "start_year": "4326/11/12",
                    "start_month": "",
                    "start_day": "",
                    "title": "The Silent Ledger Job",
                    "summary": "A first major Merrowgate contract that binds the party into city politics.",
                },
                {
                    "event_id": "sample-arrival",
                    "kind": "event",
                    "start_year": "4327",
                    "start_month": "7",
                    "start_day": "12",
                    "title": "Arrival in Ardenford",
                    "summary": "The party reaches Ardenford and meets the Council’s careful optimism.",
                },
                {
                    "event_id": "sample-sabotage",
                    "kind": "event",
                    "start_year": "4327",
                    "start_month": "7",
                    "start_day": "18",
                    "title": "Border Signal Mission",
                    "summary": "A tower is sabotaged; the convoy must not be caught in the dark.",
                },
            ]
        )
