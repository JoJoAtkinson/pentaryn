from __future__ import annotations

from dataclasses import dataclass

from .model import Event, LayoutResult, RendererConfig


@dataclass(frozen=True)
class ValidationResult:
    overlaps_left: int
    overlaps_right: int
    connector_errors: int
    text_fit_errors: int


def _overlaps(a: Event, b: Event) -> bool:
    ay1, ay2 = a.y, a.y + a.box_h
    by1, by2 = b.y, b.y + b.box_h
    return not (ay2 <= by1 or by2 <= ay1)


def _count_overlaps(layout: LayoutResult) -> tuple[int, int]:
    left = [e for e in layout.events if e.lane == "left"]
    right = [e for e in layout.events if e.lane == "right"]
    left.sort(key=lambda e: e.y)
    right.sort(key=lambda e: e.y)

    def count_overlaps(events: list[Event]) -> int:
        count = 0
        for i in range(len(events) - 1):
            if _overlaps(events[i], events[i + 1]):
                count += 1
        return count

    return count_overlaps(left), count_overlaps(right)


def validate_layout(layout: LayoutResult, *, renderer: RendererConfig) -> ValidationResult:
    overlaps_left, overlaps_right = _count_overlaps(layout)

    spine_x = layout.spine_x
    connector_errors = 0
    text_fit_errors = 0

    overlap = float(renderer.connector_into_box_px)
    for event in layout.events:
        if event.lane == "left":
            box_x = spine_x - renderer.spine_to_label_gap - event.box_w
            connector_x2 = box_x + event.box_w + overlap
            min_x2 = box_x + event.box_w
            max_x2 = box_x + event.box_w + overlap + 0.5
        else:
            box_x = spine_x + renderer.spine_to_label_gap
            connector_x2 = box_x - overlap
            min_x2 = box_x - overlap - 0.5
            max_x2 = box_x

        if not (min_x2 <= connector_x2 <= max_x2):
            connector_errors += 1

        max_content_w = event.box_w - 2 * renderer.label_padding_x
        max_content_h = event.box_h - 2 * renderer.label_padding_y
        if event.label.content_w > max_content_w + 0.5 or event.label.content_h > max_content_h + 0.5:
            text_fit_errors += 1

    return ValidationResult(
        overlaps_left=overlaps_left,
        overlaps_right=overlaps_right,
        connector_errors=connector_errors,
        text_fit_errors=text_fit_errors,
    )


def assert_valid(result: ValidationResult) -> None:
    if result.overlaps_left or result.overlaps_right or result.connector_errors or result.text_fit_errors:
        raise ValueError(
            "Timeline SVG validation failed: "
            f"overlaps_left={result.overlaps_left}, "
            f"overlaps_right={result.overlaps_right}, "
            f"connector_errors={result.connector_errors}, "
            f"text_fit_errors={result.text_fit_errors}"
        )
