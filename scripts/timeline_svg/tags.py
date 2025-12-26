from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

import tomllib


@dataclass(frozen=True)
class TagStyle:
    foreground: str
    background: str
    border: str  # "" means no stroke
    shape: str = "circle"  # "circle" (default) or "none"


def _parse_hex(color: str) -> tuple[int, int, int]:
    raw = (color or "").strip()
    if not raw.startswith("#"):
        raise ValueError(f"Expected hex color like '#rrggbb', got: {color!r}")
    raw = raw[1:]
    if len(raw) != 6:
        raise ValueError(f"Expected 6-digit hex color like '#rrggbb', got: #{raw}")
    return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)


def _to_hex(rgb: tuple[int, int, int]) -> str:
    r, g, b = rgb
    return f"#{r:02x}{g:02x}{b:02x}"


def darken(color: str, amount: float) -> str:
    r, g, b = _parse_hex(color)
    factor = max(0.0, min(1.0, 1.0 - amount))
    return _to_hex((int(r * factor), int(g * factor), int(b * factor)))


def _extract_viewbox(svg_text: str) -> tuple[float, float, float, float]:
    match = re.search(r"<svg[^>]*\sviewBox\s*=\s*\"([^\"]+)\"", svg_text, flags=re.IGNORECASE)
    if not match:
        return (0.0, 0.0, 512.0, 512.0)
    parts = [p for p in match.group(1).replace(",", " ").split() if p]
    if len(parts) != 4:
        return (0.0, 0.0, 512.0, 512.0)
    return (float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]))


def _extract_svg_inner(svg_text: str) -> str:
    # Best-effort: take everything between <svg ...> and </svg>.
    open_match = re.search(r"<svg[^>]*>", svg_text, flags=re.IGNORECASE)
    close_match = re.search(r"</svg\s*>", svg_text, flags=re.IGNORECASE)
    if not open_match or not close_match:
        return svg_text
    return svg_text[open_match.end() : close_match.start()].strip()


def _normalize_icon_markup(inner: str, *, foreground: str) -> str:
    # Recolor black-only icons by rewriting any common black fill/stroke to the desired foreground.
    # We avoid `currentColor` here because some renderers (e.g. SVG->PNG) can be inconsistent.
    text = inner

    # Drop any embedded stylesheets that could override our fill/stroke rewrites.
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.IGNORECASE | re.DOTALL)

    def _repl_attr(name: str) -> None:
        nonlocal text
        # Attributes with double quotes, single quotes, or no quotes.
        text = re.sub(rf'{name}\s*=\s*\"#000000\"', rf'{name}="{foreground}"', text, flags=re.IGNORECASE)
        text = re.sub(rf"{name}\s*=\s*'#000000'", rf'{name}="{foreground}"', text, flags=re.IGNORECASE)
        text = re.sub(rf"{name}\s*=\s*#000000\b", rf'{name}="{foreground}"', text, flags=re.IGNORECASE)

        text = re.sub(rf'{name}\s*=\s*\"#000\"', rf'{name}="{foreground}"', text, flags=re.IGNORECASE)
        text = re.sub(rf"{name}\s*=\s*'#000'", rf'{name}="{foreground}"', text, flags=re.IGNORECASE)
        text = re.sub(rf"{name}\s*=\s*#000\b", rf'{name}="{foreground}"', text, flags=re.IGNORECASE)

        text = re.sub(rf'{name}\s*=\s*\"black\"', rf'{name}="{foreground}"', text, flags=re.IGNORECASE)
        text = re.sub(rf"{name}\s*=\s*'black'", rf'{name}="{foreground}"', text, flags=re.IGNORECASE)
        text = re.sub(rf"{name}\s*=\s*black\b", rf'{name}="{foreground}"', text, flags=re.IGNORECASE)

        text = re.sub(rf'{name}\s*=\s*\"rgb\(0\s*,\s*0\s*,\s*0\)\"', rf'{name}="{foreground}"', text, flags=re.IGNORECASE)
        text = re.sub(rf"{name}\s*=\s*'rgb\(0\s*,\s*0\s*,\s*0\)'", rf'{name}="{foreground}"', text, flags=re.IGNORECASE)

    _repl_attr("fill")
    _repl_attr("stroke")

    # Inline style replacements.
    text = re.sub(r"fill\\s*:\\s*#000000", f"fill:{foreground}", text, flags=re.IGNORECASE)
    text = re.sub(r"fill\\s*:\\s*#000\\b", f"fill:{foreground}", text, flags=re.IGNORECASE)
    text = re.sub(r"fill\\s*:\\s*black\\b", f"fill:{foreground}", text, flags=re.IGNORECASE)
    text = re.sub(r"stroke\\s*:\\s*#000000", f"stroke:{foreground}", text, flags=re.IGNORECASE)
    text = re.sub(r"stroke\\s*:\\s*#000\\b", f"stroke:{foreground}", text, flags=re.IGNORECASE)
    text = re.sub(r"stroke\\s*:\\s*black\\b", f"stroke:{foreground}", text, flags=re.IGNORECASE)

    return text.strip()


@dataclass(frozen=True)
class TagCatalog:
    tags_dir: Path
    styles: dict[str, TagStyle]
    default_style: TagStyle

    @staticmethod
    def load(tags_dir: Path) -> "TagCatalog":
        config_path = tags_dir / "tags.toml"
        raw = tomllib.loads(config_path.read_text(encoding="utf-8"))
        defaults_raw = raw.get("defaults") or {}
        default_fg = str(defaults_raw.get("foreground") or "#fbf7ef")
        default_bg = str(defaults_raw.get("background") or "#7a5b3a")
        default_border_raw = defaults_raw.get("border")
        default_border = str(default_border_raw) if default_border_raw is not None else darken(default_bg, 0.12)
        if default_border.strip().lower() in {"none", "transparent"}:
            default_border = ""
        default_style = TagStyle(foreground=default_fg, background=default_bg, border=default_border)

        styles: dict[str, TagStyle] = {}
        tags_raw = raw.get("tags") or {}
        if isinstance(tags_raw, dict):
            for key, item in tags_raw.items():
                if not isinstance(item, dict):
                    continue
                fg = str(item.get("foreground") or default_style.foreground)
                bg = str(item.get("background") or default_style.background)
                border_raw = item.get("border")
                border = str(border_raw) if border_raw is not None else darken(bg, 0.12)
                if border.strip().lower() in {"none", "transparent"}:
                    border = ""
                shape = str(item.get("shape") or "circle").strip().lower()
                if shape not in {"circle", "none"}:
                    shape = "circle"
                styles[str(key)] = TagStyle(foreground=fg, background=bg, border=border, shape=shape)

        return TagCatalog(tags_dir=tags_dir, styles=styles, default_style=default_style)

    def known_tags(self) -> set[str]:
        return {p.stem for p in self.tags_dir.glob("*.svg")}

    def style_for(self, tag: str) -> TagStyle:
        return self.styles.get(tag) or self.default_style

    def symbol_id(self, tag: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", tag).strip("-")
        return f"tag_{safe}" if safe else "tag_unknown"

    def build_defs(self, tags: Iterable[str]) -> str:
        used = [t for t in tags if t]
        unique: list[str] = []
        seen: set[str] = set()
        for t in used:
            if t in seen:
                continue
            seen.add(t)
            unique.append(t)

        parts: list[str] = []
        parts.append("<defs>")
        parts.append(self._unknown_symbol())
        for tag in unique:
            icon_path = self.tags_dir / f"{tag}.svg"
            if icon_path.exists():
                parts.append(self._tag_symbol(tag, icon_path))
            else:
                # Emit an alias symbol that renders as the unknown marker, but keeps the per-tag id
                # so the SVG can still reference `#tag_<tag>` deterministically.
                symbol_id = self.symbol_id(tag)
                parts.append(
                    f'<symbol id="{symbol_id}" viewBox="0 0 512 512">'
                    '<use href="#tag_unknown" x="0" y="0" width="512" height="512" />'
                    "</symbol>"
                )
        parts.append("</defs>")
        return "\n".join(parts)

    def _tag_symbol(self, tag: str, icon_path: Path) -> str:
        svg_text = icon_path.read_text(encoding="utf-8")
        vb_x, vb_y, vb_w, vb_h = _extract_viewbox(svg_text)
        style = self.style_for(tag)
        inner = _normalize_icon_markup(_extract_svg_inner(svg_text), foreground=style.foreground)

        cx = vb_x + vb_w / 2.0
        cy = vb_y + vb_h / 2.0
        shrink = 0.88 if style.shape == "none" else 0.72
        icon_transform = f"translate({cx:.3f} {cy:.3f}) scale({shrink:.4f}) translate({-cx:.3f} {-cy:.3f})"

        symbol_id = self.symbol_id(tag)
        if style.shape == "none":
            return (
                f'<symbol id="{symbol_id}" viewBox="{vb_x:g} {vb_y:g} {vb_w:g} {vb_h:g}">\n'
                f'  <g transform="{icon_transform}">\n'
                f"{inner}\n"
                "  </g>\n"
                "</symbol>"
            )

        stroke_w = max(1.0, min(vb_w, vb_h) * 0.035)
        # Prevent stroke clipping by keeping the entire stroke inside the symbol viewBox.
        radius = min(vb_w, vb_h) * 0.5 - (stroke_w / 2.0)
        stroke = style.border if style.border else "none"
        stroke_width = stroke_w if style.border else 0.0
        return (
            f'<symbol id="{symbol_id}" viewBox="{vb_x:g} {vb_y:g} {vb_w:g} {vb_h:g}">\n'
            f'  <circle cx="{cx:g}" cy="{cy:g}" r="{radius:g}" fill="{style.background}" stroke="{stroke}" stroke-width="{stroke_width:g}" />\n'
            f'  <g transform="{icon_transform}">\n'
            f"{inner}\n"
            "  </g>\n"
            "</symbol>"
        )

    def _unknown_symbol(self) -> str:
        vb_x, vb_y, vb_w, vb_h = 0.0, 0.0, 512.0, 512.0
        cx = vb_w / 2.0
        cy = vb_h / 2.0
        stroke_w = vb_w * 0.035
        radius = vb_w * 0.5 - (stroke_w / 2.0)
        return (
            '<symbol id="tag_unknown" viewBox="0 0 512 512">\n'
            f'  <circle cx="{cx:g}" cy="{cy:g}" r="{radius:g}" fill="#cfcfcf" stroke="#9a9a9a" stroke-width="{stroke_w:g}" />\n'
            f'  <text x="{cx:g}" y="{cy + 90:g}" text-anchor="middle" font-size="300" font-family="Alegreya, serif" fill="#2b1f14">?!</text>\n'
            "</symbol>"
        )
