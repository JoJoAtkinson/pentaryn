from __future__ import annotations

from .model import Event, SortDirection


def sort_events(events: list[Event], direction: SortDirection) -> list[Event]:
    reverse = direction == "desc"
    return sorted(events, key=lambda e: (e.axis_day, e.event_id), reverse=reverse)


def assign_lanes(sorted_events: list[Event]) -> None:
    for idx, event in enumerate(sorted_events):
        event.lane = "left" if idx % 2 == 0 else "right"

