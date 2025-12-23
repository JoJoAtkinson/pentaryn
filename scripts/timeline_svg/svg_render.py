from __future__ import annotations

from html import escape
import re
from pathlib import Path

from .model import BuildConfig, LayoutResult, RendererConfig


def _render_multiline_text(*, parts: list[str], klass: str, x: float, y0: float, lines: list[str], line_h: float) -> float:
    if not lines:
        return y0
    parts.append(f'<text class="{klass}" x="{x:.1f}" y="{y0:.1f}">')
    for idx, line in enumerate(lines):
        dy = 0.0 if idx == 0 else float(line_h)
        parts.append(f'<tspan x="{x:.1f}" dy="{dy:.1f}">{escape(line)}</tspan>')
    parts.append("</text>")
    if len(lines) == 1:
        return y0
    return y0 + (len(lines) - 1) * line_h


def render_svg(
    *,
    layout: LayoutResult,
    renderer: RendererConfig,
    defs_fragment: str,
    output_path: Path,
    build: BuildConfig,
    extra_css: str,
) -> None:
    width = renderer.width
    height = layout.height
    spine_x = layout.spine_x

    parts: list[str] = []
    parts.append('<?xml version="1.0" encoding="UTF-8"?>')
    parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">')
    parts.append("<style><![CDATA[")
    if extra_css:
        parts.append(extra_css)
    parts.append(
        """
        .bg { fill: #fbf7ef; }
        .spine { stroke: #a58b6a; stroke-width: 2; }
        .tick { stroke: #a58b6a; stroke-width: 1; opacity: 0.8; }
        .tick-label { font-family: 'Alegreya', 'Noto Sans Symbols 2', 'Noto Sans Runic', 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', serif; font-size: 12px; fill: #5a4634; }
        .tick-glyph { font-family: 'Noto Sans Runic', 'Noto Sans Symbols 2', 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', serif; }
        .tick-number { font-family: 'Alegreya', serif; }
        .token { }
        .connector { stroke: #7a5b3a; stroke-width: 1.5; stroke-linecap: round; opacity: 0.7; }
        .label { fill: #fffaf0; stroke: #cbb08a; stroke-width: 1; }
        .title { font-family: 'Alegreya', 'Noto Sans Symbols 2', 'Noto Sans Runic', 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', serif; font-size: 16px; font-weight: 700; fill: #2b1f14; }
        .summary { font-family: 'Alegreya', 'Noto Sans Symbols 2', 'Noto Sans Runic', 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', serif; font-size: 12px; fill: #3a2b1f; }
        """
    )
    parts.append("]]></style>")
    parts.append('<rect class="bg" x="0" y="0" width="100%" height="100%"/>')
    parts.append(defs_fragment.strip())

    parts.append(f'<g id="spine"><line class="spine" x1="{spine_x}" y1="{renderer.margin_top}" x2="{spine_x}" y2="{height - renderer.margin_bottom}"/></g>')

    # ticks
    parts.append('<g id="ticks">')
    tick_age_glyphs = {"⊚", "⟂", "ᛒ", "ᛉ", "⋂", "ᛏ", "⋈"}
    for tick in layout.ticks:
        y = tick.y
        parts.append(f'<line class="tick" x1="{spine_x - 6}" y1="{y:.1f}" x2="{spine_x + 6}" y2="{y:.1f}"/>')
        label = tick.label
        if label and label[0] in tick_age_glyphs and label[1:].isdigit():
            glyph, num = label[0], label[1:]
            parts.append(f'<text class="tick-label" x="{spine_x + 10}" y="{y + 4:.1f}">')
            parts.append(f'<tspan class="tick-glyph">{escape(glyph)}</tspan><tspan class="tick-number">{escape(num)}</tspan>')
            parts.append("</text>")
        else:
            parts.append(f'<text class="tick-label" x="{spine_x + 10}" y="{y + 4:.1f}">{tick.label}</text>')
    parts.append("</g>")

    parts.append('<g id="connectors">')
    if build.connectors:
        overlap = float(renderer.connector_into_box_px)
        for event in layout.events:
            token_y = event.y + event.box_h / 2
            if event.lane == "left":
                box_x = spine_x - renderer.spine_to_label_gap - event.box_w
                x2 = box_x + event.box_w + overlap
            else:
                box_x = spine_x + renderer.spine_to_label_gap
                x2 = box_x - overlap
            parts.append(f'<line class="connector" x1="{spine_x}" y1="{token_y:.1f}" x2="{x2:.1f}" y2="{token_y:.1f}"/>')
    parts.append("</g>")

    parts.append('<g id="tokens">')
    for event in layout.events:
        token_y = event.y + event.box_h / 2
        x = spine_x - build.token_size / 2
        y = token_y - build.token_size / 2
        parts.append(f'<use class="token" href="#token_default" x="{x:.1f}" y="{y:.1f}" width="{build.token_size}" height="{build.token_size}"/>')
    parts.append("</g>")

    parts.append('<g id="labels">')
    for event in layout.events:
        if event.lane == "left":
            box_x = spine_x - renderer.spine_to_label_gap - event.box_w
        else:
            box_x = spine_x + renderer.spine_to_label_gap
        box_y = event.y
        parts.append(f'<rect class="label" x="{box_x:.1f}" y="{box_y:.1f}" width="{event.box_w:.1f}" height="{event.box_h:.1f}" rx="8" ry="8"/>')
        text_x = box_x + renderer.label_padding_x
        cursor_top = box_y + renderer.label_padding_y
        if event.label.title_lines:
            title_y0 = cursor_top + event.label.title_line_h
            last_title_y = _render_multiline_text(
                parts=parts,
                klass="title",
                x=text_x,
                y0=title_y0,
                lines=event.label.title_lines,
                line_h=event.label.title_line_h,
            )
            cursor_top += len(event.label.title_lines) * event.label.title_line_h
            if event.label.summary_lines:
                cursor_top += event.label.line_gap
                summary_y0 = cursor_top + event.label.summary_line_h
                _render_multiline_text(
                    parts=parts,
                    klass="summary",
                    x=text_x,
                    y0=summary_y0,
                    lines=event.label.summary_lines,
                    line_h=event.label.summary_line_h,
                )
    parts.append("</g>")

    parts.append("</svg>")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(parts) + "\n", encoding="utf-8")
