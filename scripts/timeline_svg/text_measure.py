from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from PIL import ImageFont  # type: ignore


@dataclass(frozen=True)
class FontSpec:
    path: str
    size: int


@lru_cache(maxsize=128)
def _load_font(path: str, size: int, weight: int | None) -> ImageFont.FreeTypeFont:  # type: ignore[name-defined]
    font = ImageFont.truetype(path, size=size, layout_engine=ImageFont.Layout.RAQM)
    if weight is not None and hasattr(font, "set_variation_by_axes"):
        try:
            font.set_variation_by_axes([int(weight)])
        except Exception:
            # If a font doesn't support variations, fall back to default.
            pass
    return font


def text_width(text: str, font_path: str, size: int, *, weight: int | None = None) -> float:
    font = _load_font(font_path, size, weight)
    return float(font.getlength(text))


def text_height(font_path: str, size: int, *, weight: int | None = None) -> float:
    font = _load_font(font_path, size, weight)
    bbox = font.getbbox("Hg")
    return float(bbox[3] - bbox[1])
