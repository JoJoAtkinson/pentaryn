from __future__ import annotations

from dataclasses import dataclass

from .model import SortDirection


@dataclass(frozen=True)
class AxisMap:
    direction: SortDirection
    min_axis: int
    max_axis: int
    top_y: float
    px_per_day: float
    slack_steps: list[tuple[int, float]]  # (axis_threshold, slack_px)

    def axis_to_y(self, axis_day: int) -> float:
        if self.direction == "desc":
            base = self.top_y + (self.max_axis - axis_day) * self.px_per_day
            extra = sum(slack for threshold, slack in self.slack_steps if axis_day <= threshold)
            return base + extra
        base = self.top_y + (axis_day - self.min_axis) * self.px_per_day
        extra = sum(slack for threshold, slack in self.slack_steps if axis_day >= threshold)
        return base + extra


def make_axis_map(direction: SortDirection, *, min_axis: int, max_axis: int, top_y: float, px_per_year: float) -> AxisMap:
    return AxisMap(
        direction=direction,
        min_axis=min_axis,
        max_axis=max_axis,
        top_y=top_y,
        px_per_day=px_per_year / 360.0,
        slack_steps=[],
    )

