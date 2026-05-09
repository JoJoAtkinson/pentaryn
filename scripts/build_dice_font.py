#!/usr/bin/env python3
"""
Build the custom D&D dice TTF font from source PNG images.

Reads PNG images from fonts/source-images/, maps each to a private-use Unicode
codepoint (U+E000-U+E005), and outputs a TTF font at fonts/dnd-dice.ttf.

The TTF uses the SBIX table (Apple bitmap-in-TTF format) so PNG images are
embedded directly. This is the simplest path to a color-emoji-style font that
works in modern terminals.

Usage:
    python scripts/build_dice_font.py

Or with custom paths:
    python scripts/build_dice_font.py --source <dir> --output <file>
"""

from __future__ import annotations

import argparse
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.ttLib import newTable
from fontTools.ttLib.tables.sbixGlyph import Glyph as SbixGlyph
from fontTools.ttLib.tables.sbixStrike import Strike

# Map each die name to its private-use Unicode codepoint
GLYPH_MAP: dict[str, int] = {
    "d4": 0xE000,
    "d6": 0xE001,
    "d8": 0xE002,
    "d10": 0xE003,
    "d12": 0xE004,
    "d20": 0xE005,
}

# Bitmap strike size (pixels per em). The TTF embeds PNGs at this size; the
# terminal scales down to whatever font size the user has configured.
_STRIKE_PPEM = 128
_UNITS_PER_EM = 1024
_TARGET_SIZE = 128  # Each PNG is normalized to this square


def _normalize_png(path: Path) -> bytes:
    """Read a PNG, resize to a centered _TARGET_SIZE square with transparent padding,
    return as PNG bytes. Source PNGs from emoji.gg vary in aspect ratio; this ensures
    every glyph occupies the same square box in the font."""
    from PIL import Image
    import io

    if not path.exists():
        raise FileNotFoundError(f"Required PNG not found: {path}")

    img = Image.open(path).convert("RGBA")
    img.thumbnail((_TARGET_SIZE, _TARGET_SIZE), Image.LANCZOS)

    canvas = Image.new("RGBA", (_TARGET_SIZE, _TARGET_SIZE), (0, 0, 0, 0))
    offset_x = (_TARGET_SIZE - img.width) // 2
    offset_y = (_TARGET_SIZE - img.height) // 2
    canvas.paste(img, (offset_x, offset_y), img)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def build_font(source_dir: Path, output_path: Path) -> None:
    """
    Build a TTF font from PNG source images.

    Args:
        source_dir: Directory containing d4.png, d6.png, etc.
        output_path: Where to write the resulting .ttf file

    Raises:
        FileNotFoundError: If any required PNG is missing.
    """
    glyph_order = [".notdef"] + list(GLYPH_MAP.keys())

    fb = FontBuilder(_UNITS_PER_EM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)

    cmap = {cp: name for name, cp in GLYPH_MAP.items()}
    fb.setupCharacterMap(cmap)

    from fontTools.pens.ttGlyphPen import TTGlyphPen
    glyphs = {}
    for name in glyph_order:
        pen = TTGlyphPen(None)
        glyphs[name] = pen.glyph()
    fb.setupGlyf(glyphs)

    advance = _UNITS_PER_EM
    fb.setupHorizontalMetrics({name: (advance, 0) for name in glyph_order})
    fb.setupHorizontalHeader(ascent=_UNITS_PER_EM, descent=0)

    fb.setupNameTable({
        "familyName": "DnD Dice",
        "styleName": "Regular",
        "psName": "DnDDice-Regular",
    })
    fb.setupOS2(sTypoAscender=_UNITS_PER_EM, usWinAscent=_UNITS_PER_EM, usWinDescent=0)
    fb.setupPost()

    font = fb.font
    sbix = newTable("sbix")
    sbix.version = 1
    sbix.flags = 1
    sbix.numStrikes = 1

    strike = Strike()
    strike.ppem = _STRIKE_PPEM
    strike.resolution = 72
    strike.glyphs = {}

    for die_name in GLYPH_MAP:
        png_bytes = _normalize_png(source_dir / f"{die_name}.png")
        sbix_glyph = SbixGlyph(
            graphicType="png ",
            glyphName=die_name,
            originOffsetX=0,
            originOffsetY=0,
            imageData=png_bytes,
        )
        strike.glyphs[die_name] = sbix_glyph

    sbix.strikes = {_STRIKE_PPEM: strike}
    font["sbix"] = sbix

    output_path.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(output_path))


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=repo_root / "fonts" / "source-images")
    parser.add_argument("--output", type=Path, default=repo_root / "fonts" / "dnd-dice.ttf")
    args = parser.parse_args()

    build_font(source_dir=args.source, output_path=args.output)
    print(f"Built {args.output} from {args.source}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
