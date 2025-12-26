from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import tomllib

from .tags import _extract_svg_inner, _extract_viewbox, _normalize_icon_markup, darken


@dataclass(frozen=True)
class PovStyle:
    foreground: str
    background: str
    border: str  # "" means no stroke
    palette: list[str]


def _rel_luminance(hex_color: str) -> float:
    raw = hex_color.strip().lstrip("#")
    if len(raw) != 6:
        return 0.0
    r = int(raw[0:2], 16) / 255.0
    g = int(raw[2:4], 16) / 255.0
    b = int(raw[4:6], 16) / 255.0
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _color_phrase_to_hex(phrase: str) -> str:
    p = (phrase or "").strip().lower()
    # Order matters: match more specific phrases first.
    if "obsidian" in p:
        return "#0b0b0c"
    if "industrial black" in p:
        return "#111316"
    if "ash-black" in p or ("ash" in p and "black" in p):
        return "#1a1a1a"
    if "iron black" in p:
        return "#202124"
    if "deep blue" in p:
        return "#1f3a5a"
    if "twilight purple" in p or ("twilight" in p and "purple" in p):
        return "#4b3a6b"
    if "forest green" in p or ("forest" in p and "green" in p):
        return "#2f6b3a"
    if "spirit turquoise" in p or "turquoise" in p:
        return "#2aa7a1"
    if "dawn copper" in p or "copper" in p:
        return "#b87333"
    if "bronze" in p:
        return "#b08d57"
    if "crimson" in p:
        return "#8b1e3f"
    if "blood" in p and "red" in p:
        return "#7a2f2f"
    if "blood-red" in p:
        return "#7a2f2f"
    if "red" in p:
        return "#7a2f2f"
    if "iron-gray" in p or "iron gray" in p:
        return "#6b6f78"
    if "granite gray" in p or "granite" in p:
        return "#5a5a5a"
    if "ash gray" in p or "ash-grey" in p or ("ash" in p and ("gray" in p or "grey" in p)):
        return "#8a8a8a"
    if "bone white" in p or ("bone" in p and "white" in p):
        return "#e8dfcf"
    if "silver" in p:
        return "#c9ced6"
    if "gold" in p:
        return "#d4af37"
    if "blue" in p:
        return "#3b5b7a"
    if "green" in p:
        return "#2f6b3a"
    if "gray" in p or "grey" in p:
        return "#6b6b6b"
    if "black" in p:
        return "#1a1a1a"
    if "white" in p:
        return "#fbf7ef"
    return "#7a5b3a"


def _extract_overview_colors(overview_path: Path) -> list[str]:
    if not overview_path.exists():
        return []
    text = overview_path.read_text(encoding="utf-8")
    match = re.search(r"\\*\\*Colors:\\*\\*\\s*([^\\n]+)", text, flags=re.IGNORECASE)
    if not match:
        return []
    raw = match.group(1).strip()
    # Strip trailing markdown hard-break spaces.
    raw = raw.rstrip()
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return parts[:3]


def _style_from_palette(phrases: list[str]) -> PovStyle:
    palette = [_color_phrase_to_hex(p) for p in phrases if p]
    if not palette:
        palette = ["#7a5b3a"]

    # Pick a dark background for legibility; use the next-darkest as border when available.
    ordered = sorted(palette, key=_rel_luminance)
    background = ordered[0]
    border = ordered[1] if len(ordered) >= 2 else darken(background, 0.12)
    if border.strip().lower() in {"none", "transparent"}:
        border = ""
    foreground = "#fbf7ef" if _rel_luminance(background) < 0.62 else "#2b1f14"
    return PovStyle(foreground=foreground, background=background, border=border, palette=palette)


def _load_config_style(config_path: Path) -> PovStyle | None:
    if not config_path.exists():
        return None
    raw = tomllib.loads(config_path.read_text(encoding="utf-8"))
    style_raw = raw.get("pov_style")
    if not isinstance(style_raw, dict):
        return None
    palette_raw = style_raw.get("palette")
    palette: list[str] = []
    if isinstance(palette_raw, list):
        palette = [str(v).strip() for v in palette_raw if str(v).strip()]
    foreground = str(style_raw.get("foreground") or "").strip()
    background = str(style_raw.get("background") or "").strip()
    border_raw = style_raw.get("border")
    border = str(border_raw).strip() if border_raw is not None else ""
    if border.strip().lower() in {"none", "transparent"}:
        border = ""

    # Require at least a background to consider the override valid.
    if not background:
        return None
    if not foreground:
        foreground = "#fbf7ef" if _rel_luminance(background) < 0.62 else "#2b1f14"
    if not border:
        border = darken(background, 0.12)
    if not palette:
        palette = [background]
    return PovStyle(foreground=foreground, background=background, border=border, palette=palette)


@dataclass(frozen=True)
class PovCatalog:
    icons: dict[str, Path]
    styles: dict[str, PovStyle]

    @staticmethod
    def discover(*, repo_root: Path) -> "PovCatalog":
        factions_dir = repo_root / "world" / "factions"
        icons: dict[str, Path] = {}
        styles: dict[str, PovStyle] = {}
        if not factions_dir.exists():
            return PovCatalog(icons=icons, styles=styles)

        for folder in sorted([p for p in factions_dir.iterdir() if p.is_dir()], key=lambda p: p.name):
            pov = folder.name
            icon_path = folder / "icon.svg"
            if not icon_path.exists():
                continue
            icons[pov] = icon_path

            # Optional override for exact colors.
            cfg_style = _load_config_style(folder / "_history.config.toml")
            if cfg_style is not None:
                styles[pov] = cfg_style
                continue

            # Otherwise derive from the faction overview's declared palette.
            overview_colors = _extract_overview_colors(folder / "_overview.md")
            styles[pov] = _style_from_palette(overview_colors)

        return PovCatalog(icons=icons, styles=styles)

    def has_icon(self, pov: str) -> bool:
        return pov in self.icons

    def symbol_id(self, pov: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", (pov or "").strip()).strip("-")
        return f"pov_{safe}" if safe else "pov_unknown"

    def build_defs(self, povs: Iterable[str]) -> str:
        used = [p for p in povs if p]
        unique: list[str] = []
        seen: set[str] = set()
        for p in used:
            if p in seen:
                continue
            seen.add(p)
            unique.append(p)

        parts: list[str] = []
        parts.append("<defs>")
        for pov in unique:
            icon_path = self.icons.get(pov)
            if not icon_path:
                continue
            parts.append(self._pov_symbol(pov, icon_path))
        parts.append("</defs>")
        return "\n".join(parts)

    def _pov_symbol(self, pov: str, icon_path: Path) -> str:
        svg_text = icon_path.read_text(encoding="utf-8")
        vb_x, vb_y, vb_w, vb_h = _extract_viewbox(svg_text)
        style = self.styles.get(pov) or PovStyle(foreground="#fbf7ef", background="#7a5b3a", border="", palette=["#7a5b3a"])
        inner = _normalize_icon_markup(_extract_svg_inner(svg_text), foreground=style.foreground)

        cx = vb_x + vb_w / 2.0
        cy = vb_y + vb_h / 2.0
        shrink = 0.70
        icon_transform = f"translate({cx:.3f} {cy:.3f}) scale({shrink:.4f}) translate({-cx:.3f} {-cy:.3f})"

        stroke_w = max(1.0, min(vb_w, vb_h) * 0.035)
        x = vb_x + stroke_w / 2.0
        y = vb_y + stroke_w / 2.0
        w = vb_w - stroke_w
        h = vb_h - stroke_w
        radius = min(vb_w, vb_h) * 0.18

        symbol_id = self.symbol_id(pov)
        stroke = style.border if style.border else "none"
        stroke_width = stroke_w if style.border else 0.0

        return (
            f'<symbol id="{symbol_id}" viewBox="{vb_x:g} {vb_y:g} {vb_w:g} {vb_h:g}">\n'
            f'  <rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{radius:g}" ry="{radius:g}" '
            f'fill="{style.background}" stroke="{stroke}" stroke-width="{stroke_width:g}" />\n'
            f'  <g transform="{icon_transform}">\n'
            f"{inner}\n"
            "  </g>\n"
            "</symbol>"
        )

