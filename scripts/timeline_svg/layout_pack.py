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
        for event in lane_events:
            desired_top = max(float(min_y), float(event.y_target) - (event.box_h / 2.0))
            desired_bottom = desired_top + event.box_h

            # Check clearance against current positions of other labels in this lane.
            clear = True
            for other in lane_events:
                if other is event:
                    continue
                other_top = other.y
                other_bottom = other.y + other.box_h
                # Overlap (with required gap) if intervals intersect.
                if desired_bottom + lane_gap_y > other_top and other_bottom + lane_gap_y > desired_top:
                    clear = False
                    break
            if clear:
                event.y = desired_top
