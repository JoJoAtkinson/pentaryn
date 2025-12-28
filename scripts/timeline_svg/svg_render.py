from __future__ import annotations

from html import escape
import re
from pathlib import Path

from .model import BuildConfig, LayoutResult, RendererConfig


def _split_md_bold(text: str, *, bold: bool = False) -> tuple[list[tuple[str, bool]], bool]:
    """
    Split a line of text into (segment, is_bold) tuples using only the `**bold**` marker.

    This intentionally supports only bold, keeps parsing minimal, and treats any `**` as a toggle.
    """

    segments: list[tuple[str, bool]] = []
    buf: list[str] = []
    i = 0
    while i < len(text):
        if text.startswith("**", i):
            if buf:
                segments.append(("".join(buf), bold))
                buf.clear()
            bold = not bold
            i += 2
            continue
        buf.append(text[i])
        i += 1
    if buf:
        segments.append(("".join(buf), bold))
    return segments, bold


def _render_multiline_text(*, parts: list[str], klass: str, x: float, y0: float, lines: list[str], line_h: float) -> float:
    if not lines:
        return y0
    parts.append(f'<text class="{klass}" x="{x:.1f}" y="{y0:.1f}">')
    bold = False
    for idx, line in enumerate(lines):
        dy = 0.0 if idx == 0 else float(line_h)
        segments, bold = _split_md_bold(line, bold=bold)

        started = False
        for segment, is_bold in segments:
            if not segment:
                continue
            attrs = []
            if not started:
                attrs.append(f'x="{x:.1f}"')
                attrs.append(f'dy="{dy:.1f}"')
                started = True
            if is_bold:
                attrs.append('class="md-bold"')
            attr_text = " " + " ".join(attrs) if attrs else ""
            parts.append(f"<tspan{attr_text}>{escape(segment)}</tspan>")
        if not started:
            parts.append(f'<tspan x="{x:.1f}" dy="{dy:.1f}"></tspan>')
    parts.append("</text>")
    if len(lines) == 1:
        return y0
    return y0 + (len(lines) - 1) * line_h


def _tag_symbol_id(tag: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", (tag or "").strip()).strip("-")
    return f"tag_{safe}" if safe else "tag_unknown"

def _pov_symbol_id(pov: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", (pov or "").strip()).strip("-")
    return f"pov_{safe}" if safe else "pov_unknown"


def render_svg(
    *,
    layout: LayoutResult,
    renderer: RendererConfig,
    defs_fragment: str,
    tags_fragment: str,
    povs_fragment: str,
    output_path: Path,
    build: BuildConfig,
    extra_css: str,
    faction_tags: set[str] | None = None,
) -> None:
    width = renderer.width
    height = layout.height
    spine_x = layout.spine_x
    faction_tags = faction_tags or set()

    parts: list[str] = []
    parts.append('<?xml version="1.0" encoding="UTF-8"?>')
    parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">')
    parts.append("<style><![CDATA[")
    if extra_css:
        parts.append(extra_css)
    parts.append(
        """
        :root { --label-border: #cbb08a; --public-indicator: #ac9575; }
        .bg { fill: #fbf7ef; }
        .spine { stroke: #a58b6a; stroke-width: 2; }
        .tick { stroke: #a58b6a; stroke-width: 1.8; opacity: 0.95; stroke-linecap: round; }
        .tick-label { font-family: 'Alegreya', 'Noto Sans Symbols 2', 'Noto Sans Runic', 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', serif; font-size: 14px; font-weight: 700; fill: #5a4634; }
        .tick-label-outline { fill: none; stroke: #fbf7ef; stroke-width: 4; stroke-linejoin: round; opacity: 0.9; }
        .tick-glyph { font-family: 'Noto Sans Runic', 'Noto Sans Symbols 2', 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', serif; }
        .tick-number { font-family: 'Alegreya', serif; }
        .token { }
        .connector { stroke: #7a5b3a; stroke-width: 1.5; stroke-linecap: round; opacity: 0.7; }
        .label { fill: #fffaf0; stroke: var(--label-border); stroke-width: 1; }
        .label.changed-id { stroke: #d97900; stroke-width: 3; }
        .title { font-family: 'Alegreya', 'Noto Sans Symbols 2', 'Noto Sans Runic', 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', serif; font-size: 16px; font-weight: 700; fill: #2b1f14; }
        .summary { font-family: 'Alegreya', 'Noto Sans Symbols 2', 'Noto Sans Runic', 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', serif; font-size: 12px; fill: #3a2b1f; }
        .md-bold { font-weight: 700; }
        .public-indicator { color: var(--public-indicator); opacity: 0.9; }
        """
    )
    parts.append("]]></style>")
    parts.append('<rect class="bg" x="0" y="0" width="100%" height="100%"/>')
    parts.append(defs_fragment.strip())
    if tags_fragment:
        parts.append(tags_fragment.strip())
    if povs_fragment:
        parts.append(povs_fragment.strip())

    parts.append(f'<g id="spine"><line class="spine" x1="{spine_x}" y1="{renderer.margin_top}" x2="{spine_x}" y2="{height - renderer.margin_bottom}"/></g>')

    parts.append('<g id="connectors">')
    if build.connectors:
        overlap = float(renderer.connector_into_box_px)
        for event in layout.events:
            token_y = float(event.y_target)
            label_y = event.y + event.box_h / 2
            if event.lane == "left":
                box_x = spine_x - renderer.spine_to_label_gap - event.box_w
                x2 = box_x + event.box_w + overlap
            else:
                box_x = spine_x + renderer.spine_to_label_gap
                x2 = box_x - overlap
            parts.append(f'<line class="connector" x1="{spine_x}" y1="{token_y:.1f}" x2="{x2:.1f}" y2="{label_y:.1f}"/>')
    parts.append("</g>")

    parts.append('<g id="tokens">')
    for event in layout.events:
        token_y = float(event.y_target)
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
        label_class = "label"
        if "changed-id" in (event.tags or []):
            label_class += " changed-id"
        parts.append(
            f'<rect class="{label_class}" x="{box_x:.1f}" y="{box_y:.1f}" width="{event.box_w:.1f}" height="{event.box_h:.1f}" rx="8" ry="8"/>'
        )

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

    # tag tokens
    parts.append('<g id="tags">')
    tag_size = float(renderer.tag_token_size)
    tag_gap = float(renderer.tag_token_gap)
    faction_scale = 1.35
    for event in layout.events:
        if not event.tags:
            continue
        if event.lane == "left":
            box_x = spine_x - renderer.spine_to_label_gap - event.box_w
        else:
            box_x = spine_x + renderer.spine_to_label_gap
        box_y = event.y
        # Always render token cluster at the top-right corner of the label box.
        # Tags render as small circular icons; faction slugs (when present in tags) render as larger rounded-rect icons.
        x_right = box_x + event.box_w - 12.0
        y_row_top = box_y + 4.0
        gap = max(2.0, tag_gap)

        has_public = "public" in event.tags
        if has_public:
            public_size = tag_size * 0.5
            px = box_x + 6.0
            py = box_y + 4.0
            parts.append(f'<g class="public-indicator" transform="translate({px:.1f} {py:.1f})">')
            parts.append('<use href="#tag_public" width="{:.1f}" height="{:.1f}"/>'.format(public_size, public_size))
            parts.append("</g>")

        visible_tags = [t for t in event.tags if t and t not in {"public", "changed-id"}]
        if not visible_tags:
            continue

        max_size = tag_size * faction_scale if any(t in faction_tags for t in visible_tags) else tag_size
        for token in reversed(visible_tags):
            is_faction = token in faction_tags
            size = tag_size * faction_scale if is_faction else tag_size
            x_left = x_right - size
            y_top = y_row_top + (max_size - size) / 2.0
            icon_id = _pov_symbol_id(token) if is_faction else _tag_symbol_id(token)
            title_prefix = "faction" if is_faction else "tag"
            parts.append(f'<g transform="translate({x_left:.1f} {y_top:.1f})">')
            safe_token = escape(token or "")
            if token:
                parts.append(f"<title>{title_prefix}: {safe_token}</title>")
            parts.append(f'<use href="#{icon_id}" width="{size:.1f}" height="{size:.1f}"/>')
            parts.append("</g>")
            x_right = x_left - gap
    parts.append("</g>")

    # ticks (rendered last so they are never covered by events/labels)
    parts.append('<g id="ticks">')
    tick_age_glyphs = {"⊚", "⟂", "ᛒ", "ᛉ", "⋂", "ᛏ", "⋈"}
    tick_half = 10.0
    tick_label_x = spine_x + tick_half + 6.0
    for tick in layout.ticks:
        y = tick.y
        parts.append(f'<line class="tick" x1="{spine_x - tick_half:.1f}" y1="{y:.1f}" x2="{spine_x + tick_half:.1f}" y2="{y:.1f}"/>')
        label = tick.label
        if label and label[0] in tick_age_glyphs and label[1:].isdigit():
            glyph, num = label[0], label[1:]
            for klass in ("tick-label tick-label-outline", "tick-label"):
                parts.append(f'<text class="{klass}" x="{tick_label_x:.1f}" y="{y + 5:.1f}">')
                parts.append(f'<tspan class="tick-glyph">{escape(glyph)}</tspan><tspan class="tick-number">{escape(num)}</tspan>')
                parts.append("</text>")
        else:
            safe_label = escape(tick.label or "")
            parts.append(f'<text class="tick-label tick-label-outline" x="{tick_label_x:.1f}" y="{y + 5:.1f}">{safe_label}</text>')
            parts.append(f'<text class="tick-label" x="{tick_label_x:.1f}" y="{y + 5:.1f}">{safe_label}</text>')
    parts.append("</g>")

    parts.append("</svg>")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(parts) + "\n", encoding="utf-8")
