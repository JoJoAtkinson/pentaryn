from __future__ import annotations

from .layout_pack import pack_lane
from .model import Event


def refine_layout(events: list[Event], *, lane_gap_y: float, opt_iters: int) -> None:
    for _ in range(opt_iters):
        for event in events:
            delta = event.y_target - event.y
            step = max(-8.0, min(8.0, delta))
            event.y += step
        for lane in ("left", "right"):
            pack_lane([e for e in events if e.lane == lane], lane_gap_y=lane_gap_y)

