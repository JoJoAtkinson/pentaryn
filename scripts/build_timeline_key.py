#!/usr/bin/env python3

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

MCP_TOOL = {
    "name": "build_timeline_key",
    "description": (
        "Generate a timeline legend SVG containing all timeline tag icons and faction POV symbols. "
        "Writes `timeline-key.svg` to the repo root by default."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "output": {
                "type": "string",
                "description": "Optional output SVG path (default: <repo>/timeline-key.svg).",
            },
        },
        "additionalProperties": False,
    },
    "argv": [],
}

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.timeline_svg.tags import TagCatalog
from scripts.timeline_svg.pov_icons import PovCatalog


@dataclass(frozen=True)
class KeyLayout:
    width: int = 1200
    margin: int = 40
    header_h: int = 86
    section_title_h: int = 28
    row_h: int = 44
    icon_size: int = 34
    col_gap: int = 40
    label_gap: int = 14
    tag_cols: int = 2
    faction_col_width: int = 420


def _humanize_slug(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return raw
    return raw.replace("-", " ")


def _titlecase_name_from_slug(value: str) -> str:
    words = [w for w in _humanize_slug(value).split() if w]
    return " ".join(w[:1].upper() + w[1:] for w in words)


def _discover_faction_icons(*, repo_root: Path) -> PovCatalog:
    return PovCatalog.discover(repo_root=repo_root)


def build_timeline_key(*, repo_root: Path, output: Path) -> Path:
    tags_dir = (repo_root / "scripts" / "timeline_svg" / "assets" / "tags").resolve()
    tag_catalog = TagCatalog.load(tags_dir)
    tags = sorted(tag_catalog.known_tags())

    pov_catalog = _discover_faction_icons(repo_root=repo_root)
    factions = sorted(pov_catalog.icons.keys())

    layout = KeyLayout()
    left_x = layout.margin
    right_x = left_x + layout.faction_col_width + layout.col_gap
    content_top = layout.margin + layout.header_h

    faction_rows = len(factions)
    tag_rows = (len(tags) + layout.tag_cols - 1) // layout.tag_cols
    rows = max(faction_rows, tag_rows)
    height = content_top + layout.section_title_h + rows * layout.row_h + layout.margin

    parts: list[str] = []
    parts.append('<?xml version="1.0" encoding="UTF-8"?>')
    parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{layout.width}" height="{height}" viewBox="0 0 {layout.width} {height}">')
    parts.append(
        "<style><![CDATA[\n"
        "  .bg { fill: #fbf7ef; }\n"
        "  .title { font-family: 'Alegreya', serif; font-weight: 800; font-size: 28px; fill: #2b1f14; }\n"
        "  .subtitle { font-family: 'Alegreya', serif; font-weight: 600; font-size: 16px; fill: #5a4634; }\n"
        "  .section { font-family: 'Alegreya', serif; font-weight: 800; font-size: 18px; fill: #2b1f14; }\n"
        "  .label { font-family: 'Alegreya', serif; font-weight: 600; font-size: 15px; fill: #2b1f14; }\n"
        "]]></style>"
    )

    parts.append(f'<rect class="bg" x="0" y="0" width="{layout.width}" height="{height}" />')

    # defs (tag icons + faction symbols)
    parts.append(tag_catalog.build_defs(tags))
    parts.append(pov_catalog.build_defs(factions))

    # header
    parts.append(f'<text class="title" x="{layout.margin}" y="{layout.margin + 32}">Timeline Key</text>')
    parts.append(
        f'<text class="subtitle" x="{layout.margin}" y="{layout.margin + 58}">'
        "Faction symbols and tag icons used in timelines."
        "</text>"
    )

    # section titles
    parts.append(f'<text class="section" x="{left_x}" y="{content_top + 18}">Factions</text>')
    parts.append(f'<text class="section" x="{right_x}" y="{content_top + 18}">Tags</text>')

    row_start_y = content_top + layout.section_title_h

    # factions (1 column)
    for i, pov in enumerate(factions):
        row_y = row_start_y + i * layout.row_h
        icon_y = row_y + (layout.row_h - layout.icon_size) / 2
        symbol_id = pov_catalog.symbol_id(pov)
        parts.append(
            f'<use href="#{symbol_id}" x="{left_x}" y="{icon_y:.1f}" '
            f'width="{layout.icon_size}" height="{layout.icon_size}"/>'
        )
        label_x = left_x + layout.icon_size + layout.label_gap
        label_y = row_y + layout.row_h / 2 + 5
        parts.append(f'<text class="label" x="{label_x}" y="{label_y:.1f}">{_titlecase_name_from_slug(pov)}</text>')

    # tags (2 columns)
    right_area_w = max(1, (layout.width - layout.margin) - right_x)
    col_w = max(1, right_area_w // layout.tag_cols)
    for idx, tag in enumerate(tags):
        col = idx % layout.tag_cols
        row = idx // layout.tag_cols
        x0 = right_x + col * col_w
        row_y = row_start_y + row * layout.row_h
        icon_y = row_y + (layout.row_h - layout.icon_size) / 2
        symbol_id = tag_catalog.symbol_id(tag)
        parts.append(f'<use href="#{symbol_id}" x="{x0}" y="{icon_y:.1f}" width="{layout.icon_size}" height="{layout.icon_size}"/>')
        label_x = x0 + layout.icon_size + layout.label_gap
        label_y = row_y + layout.row_h / 2 + 5
        parts.append(f'<text class="label" x="{label_x}" y="{label_y:.1f}">{tag}</text>')

    parts.append("</svg>")
    output.write_text("\n".join(parts) + "\n", encoding="utf-8")
    return output


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate timeline icon key (SVG).")
    parser.add_argument(
        "--output",
        default=str(REPO_ROOT / "timeline-key.svg"),
        help="Output SVG path (default: repo root timeline-key.svg)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(list(argv) if argv is not None else sys.argv[1:])
    out = Path(args.output).expanduser()
    if not out.is_absolute():
        out = (REPO_ROOT / out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    result = build_timeline_key(repo_root=REPO_ROOT, output=out)
    print(result)


if __name__ == "__main__":
    main()
