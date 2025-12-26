from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


SortDirection = Literal["asc", "desc"]
Lane = Literal["left", "right"]
TickScale = Literal["millennium", "century", "decade", "year", "month", "day"]
TickScaleMode = Literal["auto", "millennium", "century", "decade", "year", "month", "day"]


@dataclass(frozen=True)
class ParsedDate:
    year: int
    month: int
    day: int


@dataclass(frozen=True)
class EventRow:
    event_id: str
    pov: str
    kind: str
    start_year: str
    start_month: str
    start_day: str
    title: str
    summary: str
    factions: list[str]
    tags: list[str]


@dataclass(frozen=True)
class LabelLayout:
    title_lines: list[str]
    summary_lines: list[str]
    content_w: float
    content_h: float
    title_line_h: float
    summary_line_h: float
    line_gap: float


@dataclass
class Event:
    event_id: str
    pov: str
    kind: str
    title: str
    summary: str
    factions: list[str]
    tags: list[str]
    start: ParsedDate
    axis_day: int
    lane: Lane
    y_target: float
    y: float
    box_w: float
    box_h: float
    label: LabelLayout
    badge_pov: str | None = None


@dataclass(frozen=True)
class Tick:
    axis_day: int
    y: float
    label: str


@dataclass(frozen=True)
class LayoutResult:
    events: list[Event]
    ticks: list[Tick]
    height: int
    spine_x: int


@dataclass(frozen=True)
class RendererConfig:
    width: int
    margin_top: int
    margin_bottom: int
    margin_x: int
    spine_x: int
    spine_to_label_gap: int
    connector_into_box_px: int
    label_max_width: int
    label_padding_x: int
    label_padding_y: int
    lane_gap_y: int
    tag_token_size: int = 25
    tag_token_gap: int = 4
    tag_token_overlap: int = 6


@dataclass(frozen=True)
class FontPaths:
    regular: str
    italic: str
    symbols: str | None = None
    runic: str | None = None


@dataclass(frozen=True)
class MeasureConfig:
    title_size: int
    summary_size: int
    date_size: int
    max_summary_lines: int


@dataclass(frozen=True)
class BuildConfig:
    sort_direction: SortDirection
    render_ticks: bool
    tick_min_spacing_px: int
    tick_scale: TickScaleMode
    tick_spacing_px: int
    embed_fonts: bool
    opt_iters: int
    max_displacement_px: int
    max_grow_passes: int
    slack_fraction: float
    px_per_year: float
    token_size: int
    connectors: bool
    enable_png_sanity: bool
    age_glyph_years: bool = False
    debug_age_glyphs: bool = False
    axis_min_year: int | None = None
    axis_max_year: int | None = None
