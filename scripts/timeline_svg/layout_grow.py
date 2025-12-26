from __future__ import annotations

from .layout_energy import refine_layout
from .layout_pack import pack_lane
from .model import Event, SortDirection


def max_displacement(events: list[Event]) -> tuple[float, Event]:
    worst = events[0]
    worst_push = (worst.y + (worst.box_h / 2.0)) - worst.y_target
    for event in events:
        push = (event.y + (event.box_h / 2.0)) - event.y_target
        if push > worst_push:
            worst_push = push
            worst = event
    return worst_push, worst


def grow_downward(
    events: list[Event],
    *,
    direction: SortDirection,
    lane_gap_y: float,
    opt_iters: int,
    min_y: float = 0.0,
    max_displacement_px: float,
    max_grow_passes: int,
    slack_fraction: float,
    slack_steps: list[tuple[int, float]],
) -> None:
    for _ in range(max_grow_passes):
        worst_push, worst_event = max_displacement(events)
        if worst_push <= max_displacement_px:
            return

        # Only add as much axis slack as needed to bring the worst event back within the
        # allowed displacement. Using a fraction of the *total* push tends to overshoot
        # and produces large, unintuitive gaps between ticks/events in dense eras.
        excess = worst_push - max_displacement_px
        # Add a small headroom factor (slack_fraction) to reduce the number of grow passes.
        slack = max(8.0, excess * (1.0 + slack_fraction))
        threshold = worst_event.axis_day
        slack_steps.append((threshold, slack))
        for event in events:
            if (direction == "desc" and event.axis_day <= threshold) or (direction == "asc" and event.axis_day >= threshold):
                event.y_target += slack

        for lane in ("left", "right"):
            pack_lane([e for e in events if e.lane == lane], lane_gap_y=lane_gap_y, min_y=min_y)
        refine_layout(events, lane_gap_y=lane_gap_y, opt_iters=opt_iters, min_y=min_y)
