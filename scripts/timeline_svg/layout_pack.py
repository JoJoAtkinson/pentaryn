from __future__ import annotations

from .model import Event


def pack_lane(events: list[Event], *, lane_gap_y: float, min_y: float = 0.0) -> None:
    lane_events = [e for e in events if e.box_h > 0]
    lane_events.sort(key=lambda e: e.y_target)
    if not lane_events:
        return

    # Treat `y_target` as the desired *center* for each label box, then solve a 1D constrained
    # least-squares problem:
    #   minimize sum((center_i - target_i)^2)
    #   subject to center_i - center_{i-1} >= sep_{i-1,i}
    #
    # This produces a balanced layout where some connectors can be straight, others tilt up/down.
    n = len(lane_events)
    offsets: list[float] = [0.0] * n
    for idx in range(1, n):
        prev = lane_events[idx - 1]
        event = lane_events[idx]
        sep = (prev.box_h / 2.0) + (event.box_h / 2.0) + lane_gap_y
        offsets[idx] = offsets[idx - 1] + sep

    # Convert variable separations into a monotone constraint by shifting:
    #   a_i = center_i - offsets[i]  =>  a_i is nondecreasing.
    targets = [event.y_target - offsets[idx] for idx, event in enumerate(lane_events)]

    # Pool Adjacent Violators Algorithm (isotonic regression) for nondecreasing sequence.
    # Each block is (start, end, weight_sum, weighted_target_sum).
    blocks: list[tuple[int, int, float, float]] = []
    for idx, target in enumerate(targets):
        blocks.append((idx, idx, 1.0, float(target)))
        while len(blocks) >= 2:
            start1, end1, w1, s1 = blocks[-2]
            start2, end2, w2, s2 = blocks[-1]
            avg1 = s1 / w1
            avg2 = s2 / w2
            if avg1 <= avg2:
                break
            blocks = blocks[:-2] + [(start1, end2, w1 + w2, s1 + s2)]

    adjusted: list[float] = [0.0] * n
    for start, end, weight_sum, weighted_sum in blocks:
        avg = weighted_sum / weight_sum
        for idx in range(start, end + 1):
            adjusted[idx] = avg

    for idx, event in enumerate(lane_events):
        center = adjusted[idx] + offsets[idx]
        event.y = center - (event.box_h / 2.0)

    # Enforce the top bound by applying a uniform downward shift (keeps ordering + spacing).
    shift_down = min_y - lane_events[0].y
    if shift_down > 0:
        for event in lane_events:
            event.y += shift_down


def snap_to_targets_when_clear(events: list[Event], *, lane_gap_y: float, min_y: float = 0.0) -> None:
    """
    After global optimization, try to straighten connectors for events that can safely sit at their
    target position without colliding in their lane.

    This keeps dense timelines packed (where snapping would collide) while allowing isolated events
    to have perfectly straight connectors.
    """
    by_lane: dict[str, list[Event]] = {"left": [], "right": []}
    for event in events:
        if event.box_h <= 0:
            continue
        if event.lane in by_lane:
            by_lane[event.lane].append(event)

    for lane_events in by_lane.values():
        # Stable ordering so results are deterministic.
        lane_events.sort(key=lambda e: e.y_target)
        for idx, event in enumerate(lane_events):
            desired_top = max(float(min_y), float(event.y_target) - (event.box_h / 2.0))
            desired_bottom = desired_top + event.box_h

            # Only snap if the target position fits between the *current* neighbors in y_target
            # order. This keeps lane ordering stable and prevents connector crossings (inversions).
            if idx > 0:
                prev = lane_events[idx - 1]
                prev_bottom = prev.y + prev.box_h
                if desired_top < prev_bottom + lane_gap_y:
                    continue
            if idx + 1 < len(lane_events):
                nxt = lane_events[idx + 1]
                if desired_bottom + lane_gap_y > nxt.y:
                    continue

            event.y = desired_top


def tighten_upward_gaps(events: list[Event], *, lane_gap_y: float, min_y: float = 0.0) -> None:
    """
    Finalization pass to reclaim "wasted" vertical space without breaking the layout.

    Why this exists:
    - `pack_lane()` + `refine_layout()` produce a good non-overlapping layout, but in very dense
      eras they can leave visible slack gaps above some labels after repeated packing / axis growth.
    - `snap_to_targets_when_clear()` only straightens *exactly* to `y_target` when safe; it's
      intentionally conservative to avoid connector crossings, but that means it doesn't reclaim
      partial slack when an event can't fully snap.

    This pass keeps the existing logic (including snapping), then does a greedy sweep within each
    lane to move every label *up* as far as it can go:
    - Stop when the label is "on point" (its center sits on `y_target`), or
    - Stop when it becomes directly adjacent to the label above (respecting `lane_gap_y`).

    It never moves a label above its target (no overshoot) and never violates the minimum spacing
    to the label above, so it can't create overlaps or reintroduce connector crossings.
    """

    by_lane: dict[str, list[Event]] = {"left": [], "right": []}
    for event in events:
        if event.box_h <= 0:
            continue
        if event.lane in by_lane:
            by_lane[event.lane].append(event)

    for lane_events in by_lane.values():
        # Work in y_target order so "above/below" matches chronology within the lane.
        lane_events.sort(key=lambda e: e.y_target)

        prev_bottom = float(min_y) - float(lane_gap_y)
        for event in lane_events:
            min_top = prev_bottom + float(lane_gap_y)
            desired_top = max(float(min_y), float(event.y_target) - (event.box_h / 2.0))

            # Move up only: bring the box as high as possible while staying on/under its point
            # and respecting the minimum gap to the previous label in this lane.
            target_top = max(min_top, desired_top)
            if target_top < event.y:
                event.y = target_top

            prev_bottom = event.y + event.box_h
