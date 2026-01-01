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


def _axis_order(events: list[Event], *, direction: SortDirection) -> list[Event]:
    # Deterministic ordering for slack planning.
    reverse = direction == "desc"
    return sorted(events, key=lambda e: (e.axis_day, e.event_id), reverse=reverse)


def _plan_slack_steps(
    events: list[Event],
    *,
    direction: SortDirection,
    max_displacement_px: float,
    slack_fraction: float,
) -> list[tuple[int, float]]:
    """
    Plan a set of (axis_threshold, slack_px) steps to reduce *downward* displacement without
    introducing unnecessary extra space.

    Key idea: plan in chronological order so any inserted slack benefits all downstream (older/newer)
    events, avoiding the "fix the oldest box first" trap that compounds slack in dense eras.
    """
    ordered = _axis_order(events, direction=direction)

    # Tiny headroom helps avoid borderline re-violations after re-packing due to float rounding.
    # Keep it small so we don't add visible extra space.
    headroom_px = max(0.0, float(slack_fraction)) * 2.0

    pending = 0.0
    steps_by_threshold: dict[int, float] = {}
    steps_order: list[int] = []

    for event in ordered:
        center_y = event.y + (event.box_h / 2.0)
        effective_target = event.y_target + pending
        push = center_y - effective_target
        if push <= max_displacement_px:
            continue

        needed = push - max_displacement_px
        slack = needed + headroom_px
        if slack <= 0:
            continue

        pending += slack
        if event.axis_day not in steps_by_threshold:
            steps_order.append(event.axis_day)
            steps_by_threshold[event.axis_day] = slack
        else:
            steps_by_threshold[event.axis_day] += slack

    return [(axis_day, steps_by_threshold[axis_day]) for axis_day in steps_order]


def _apply_slack_steps(events: list[Event], *, direction: SortDirection, steps: list[tuple[int, float]]) -> None:
    if not steps:
        return

    ordered = _axis_order(events, direction=direction)
    by_threshold: dict[int, float] = {}
    for axis_day, slack in steps:
        by_threshold[axis_day] = by_threshold.get(axis_day, 0.0) + float(slack)

    pending = 0.0
    for event in ordered:
        if event.axis_day in by_threshold:
            pending += by_threshold[event.axis_day]
        if pending:
            event.y_target += pending


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
        worst_push, _worst_event = max_displacement(events)
        if worst_push <= max_displacement_px:
            return

        steps = _plan_slack_steps(
            events,
            direction=direction,
            max_displacement_px=max_displacement_px,
            slack_fraction=slack_fraction,
        )
        if not steps:
            return

        slack_steps.extend(steps)
        _apply_slack_steps(events, direction=direction, steps=steps)

        for lane in ("left", "right"):
            pack_lane([e for e in events if e.lane == lane], lane_gap_y=lane_gap_y, min_y=min_y)
        refine_layout(events, lane_gap_y=lane_gap_y, opt_iters=opt_iters, min_y=min_y)
