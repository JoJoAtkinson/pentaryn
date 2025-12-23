from __future__ import annotations

from .model import Event


def pack_lane(events: list[Event], *, lane_gap_y: float) -> None:
    lane_events = [e for e in events if e.box_h > 0]
    lane_events.sort(key=lambda e: e.y_target)
    prev_bottom = None
    for event in lane_events:
        if prev_bottom is None:
            event.y = max(event.y_target, event.y)
        else:
            event.y = max(event.y_target, prev_bottom + lane_gap_y)
        prev_bottom = event.y + event.box_h

