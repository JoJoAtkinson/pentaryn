#!/usr/bin/env python3
"""
Build the custom D&D dice TTF font from source PNG images.

Reads PNG images from fonts/source-images/, maps each to a Wide-classified
pictograph codepoint (U+1F518–U+1F51D, the "navigation buttons" range), and
outputs a TTF font at fonts/dnd-dice.ttf. Family name is "DnD Dice",
PostScript name "DnDDice-Regular". Wide codepoints are required so terminals
(xterm.js / VSCode integrated terminal) allocate a 2-cell-wide rendering box
matching our 1em-square bitmap; an earlier version using Alchemical Symbols
(U+1F700+, EAW=Neutral) rendered shifted/clipped because terminals only
allocated 1 cell for them.

The TTF uses the SBIX table (Apple bitmap-in-TTF format) so PNG images are
embedded directly. This is the simplest path to a color-emoji-style font that
works in modern terminals. Font metrics mirror Apple Color Emoji (ascent=1em,
descent=-31.25%) so dice glyphs render inline with text rather than floating
above the baseline.

Usage:
    python scripts/build_dice_font.py

Or with custom paths:
    python scripts/build_dice_font.py --source <dir> --output <file>

After building, validate macOS / Font Book compatibility:
    python scripts/validate_font_macos.py fonts/dnd-dice.ttf
"""

from __future__ import annotations

import argparse
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.ttLib import newTable
from fontTools.ttLib.tables.sbixGlyph import Glyph as SbixGlyph
from fontTools.ttLib.tables.sbixStrike import Strike

# Map each die name to its Unicode codepoint. We hijack rarely-used Wide
# pictographs (U+1F518–U+1F51D — RADIO BUTTON, BACK, END, ON!, SOON, TOP) for
# three reasons:
#   1. They're East Asian Width = Wide, so terminals (xterm.js / VSCode integrated
#      terminal) allocate a 2-cell-wide box per character — matching our 1em-square
#      bitmap. Earlier we used Alchemical Symbols (U+1F700+), which are EAW=Neutral,
#      so terminals gave them only 1 cell and the bitmap rendered shifted/clipped.
#   2. They're Private-Use-Area-free, so Claude Code's TUI doesn't strip them
#      (issue anthropics/claude-code#49270 strips U+E000–U+F8FF).
#   3. They're sequential and almost never typed in chat (UI navigation icons).
GLYPH_MAP: dict[str, int] = {
    "d4": 0x1F518,   # hijacks RADIO BUTTON
    "d6": 0x1F519,   # hijacks BACK WITH LEFTWARDS ARROW ABOVE
    "d8": 0x1F51A,   # hijacks END WITH LEFTWARDS ARROW ABOVE
    "d10": 0x1F51B,  # hijacks ON WITH EXCLAMATION MARK WITH LEFT RIGHT ARROW ABOVE
    "d12": 0x1F51C,  # hijacks SOON WITH RIGHTWARDS ARROW ABOVE
    "d20": 0x1F51D,  # hijacks TOP WITH UPWARDS ARROW ABOVE
}

# Font metric and bitmap size constants.
_UNITS_PER_EM = 1024

# Strike ppem = bitmap size for the 1em rendering. With bitmap = ppem the
# bitmap is exactly 1em × 1em; with bitmap > ppem (via per-die scale > 1) the
# dice is oversized and overflows the cell horizontally — which can look bad
# in monospace text. Tune carefully.
_STRIKE_PPEM = 128
_TARGET_SIZE = 128  # default PNG canvas size (per-die scale multiplies this)

# Descent in design units (negative = below baseline). Sets how far below the
# baseline the font reserves space for descenders / dipped-down emoji. The
# bitmap can shift down by at most |_DESCENT| units before some renderers clip.
# Apple Color Emoji uses -31.25% of em; we mirror that: -0.3125 × 1024 ≈ -320.
_DESCENT = -320


# ──────────────────────────────────────────────────────────────────────────
# Default per-die settings — applied to every die unless overridden in PER_DIE.
# All values can be overridden per-die. Units (where relevant) are FUnits =
# font design units = 1/1024 em; they scale with rendered font size automatically.
# ──────────────────────────────────────────────────────────────────────────
DEFAULT_ORIGIN_Y = -25      # vertical bitmap shift (FUnits). Negative = bottom drops below baseline.
                            #   0    → bitmap rests on baseline (looks high vs text — Apple Color Emoji default)
                            #   -80  → ~8% drop, slight centering with text
                            #   -160 → ~16% drop, visual center near text cap-middle
                            #   -200+ → too much, dice looks like it's sinking
DEFAULT_ORIGIN_X = 0        # horizontal bitmap shift (FUnits). Positive = right. "Kerning" for the bitmap.
DEFAULT_SCALE = 1.0         # bitmap-size multiplier. 1.0 = 128px = 1em. 1.25 = 160px (overflows cell horizontally).
DEFAULT_ADVANCE_EXTRA = 0   # extra advance width (FUnits) added to the 1em default. Push the NEXT
                            # character right by this many units. Useful when scale > 1 makes the dice
                            # wider than its cell — give it more room so it doesn't overlap the next glyph.
                            # Rough rule: advance_extra ≈ (scale - 1.0) × _UNITS_PER_EM.
                            # e.g. scale=1.10 → advance_extra ≈ 100; scale=1.25 → ≈ 256.
DEFAULT_INVERT_RGB = False  # if True, invert RGB channels of source (preserves alpha). Use for too-dark dice on dark bg.


# Per-die overrides. Each dict can contain ANY of: origin_y, origin_x, scale,
# advance_extra, invert_rgb. Missing keys fall back to DEFAULT_* values above.
#
# Tuning notes:
#   - d4 / d6 have FLAT-BOTTOMED 3D renders, so they look weird if dropped below
#     the baseline (no point to sink into the descender). origin_y closer to 0
#     (or even slightly positive) for these.
#   - d8 / d10 / d12 / d20 have pointed bottoms — they look natural slightly below baseline.
#   - origin_x is horizontal kerning (shift the bitmap left/right within the cell).
#   - scale > 1.0 makes the bitmap larger than 1em — it'll bleed into adjacent
#     cells unless advance_extra is bumped to give it more horizontal room.
#   - advance_extra pushes the NEXT character right (gives this glyph more horizontal space).
#
# All entries below start at the current defaults so you can tune from a known baseline.
PER_DIE: dict[str, dict] = {
    "d4":  {"origin_y": DEFAULT_ORIGIN_Y + 10, "origin_x": DEFAULT_ORIGIN_X,      "scale": DEFAULT_SCALE + .10, "advance_extra": 150, "invert_rgb": DEFAULT_INVERT_RGB},
    "d6":  {"origin_y": DEFAULT_ORIGIN_Y + 10, "origin_x": DEFAULT_ORIGIN_X,      "scale": DEFAULT_SCALE,       "advance_extra": DEFAULT_ADVANCE_EXTRA, "invert_rgb": DEFAULT_INVERT_RGB},
    "d8":  {"origin_y": DEFAULT_ORIGIN_Y - 5,  "origin_x": DEFAULT_ORIGIN_X,      "scale": DEFAULT_SCALE + .10, "advance_extra": 100, "invert_rgb": DEFAULT_INVERT_RGB},
    "d10": {"origin_y": DEFAULT_ORIGIN_Y,      "origin_x": DEFAULT_ORIGIN_X,      "scale": DEFAULT_SCALE,       "advance_extra": DEFAULT_ADVANCE_EXTRA, "invert_rgb": True},  # ← inverted so it's visible on dark bg
    "d12": {"origin_y": DEFAULT_ORIGIN_Y,      "origin_x": DEFAULT_ORIGIN_X,      "scale": DEFAULT_SCALE,       "advance_extra": DEFAULT_ADVANCE_EXTRA, "invert_rgb": DEFAULT_INVERT_RGB},
    "d20": {"origin_y": DEFAULT_ORIGIN_Y - 10, "origin_x": DEFAULT_ORIGIN_X,      "scale": DEFAULT_SCALE + .12, "advance_extra": 125, "invert_rgb": DEFAULT_INVERT_RGB},
}


def _die_setting(die_name: str, key: str):
    """Look up effective per-die setting with fallback to DEFAULT_<KEY>."""
    fallback = globals()[f"DEFAULT_{key.upper()}"]
    return PER_DIE.get(die_name, {}).get(key, fallback)


def _invert_rgb_keep_alpha(img: "Image.Image") -> "Image.Image":
    from PIL import Image, ImageOps

    if img.mode != "RGBA":
        img = img.convert("RGBA")
    r, g, b, a = img.split()
    rgb = Image.merge("RGB", (r, g, b))
    inverted = ImageOps.invert(rgb)
    ir, ig, ib = inverted.split()
    return Image.merge("RGBA", (ir, ig, ib, a))


def _normalize_png(
    path: Path,
    *,
    invert_rgb: bool = False,
    target_size: int | None = None,
) -> bytes:
    """Read a PNG, fit into a `target_size` square canvas, return as PNG bytes.

    Content is centered horizontally and BOTTOM-aligned vertically. The bitmap's
    bottom edge becomes the glyph baseline at render time, so dice with content
    that doesn't fill the canvas vertically (d4, d6 — wider than tall) sit on the
    baseline like text characters do, instead of floating above it from a
    symmetric vertical centering hack.

    Args:
        path: Source PNG path.
        invert_rgb: If True, invert RGB channels (preserves alpha).
        target_size: Canvas size in px. Defaults to module-level _TARGET_SIZE.
            Per-die `scale` multiplies this — e.g. scale=1.25 → target_size=160.
    """
    from PIL import Image
    import io

    if not path.exists():
        raise FileNotFoundError(f"Required PNG not found: {path}")

    size = target_size if target_size is not None else _TARGET_SIZE
    img = Image.open(path).convert("RGBA")
    if invert_rgb:
        img = _invert_rgb_keep_alpha(img)
    img.thumbnail((size, size), Image.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset_x = (size - img.width) // 2
    offset_y = size - img.height  # bottom-align: content bottom == canvas bottom == baseline
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

    cmap_dict = {cp: name for name, cp in GLYPH_MAP.items()}
    fb.setupCharacterMap(cmap_dict)
    # fontTools' setupCharacterMap creates empty format-4 (BMP-only) subtables
    # alongside the format-12 subtable for our supplementary-plane codepoints.
    # The empty format-4 entries can confuse Chromium's font matcher into
    # rejecting the font for non-BMP codepoints. Remove them and keep only
    # format-12, mirroring Apple Color Emoji's layout. Also add a Unicode-
    # platform copy (platformID=0) which Chromium prefers.
    from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
    cmap_table = fb.font["cmap"]
    cmap_table.tables = [t for t in cmap_table.tables if t.format == 12]
    if cmap_table.tables:
        existing = cmap_table.tables[0]
        # Add a Unicode-platform copy (0, 4) — Chromium looks here first.
        unicode_subtable = CmapSubtable.getSubtableClass(12)()
        unicode_subtable.format = 12
        unicode_subtable.reserved = 0
        unicode_subtable.length = 0  # fontTools recomputes on compile
        unicode_subtable.language = 0
        unicode_subtable.platformID = 0
        unicode_subtable.platEncID = 4
        unicode_subtable.cmap = dict(existing.cmap)
        cmap_table.tables.insert(0, unicode_subtable)

    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from PIL import Image

    glyphs = {}
    for name in glyph_order:
        if name == ".notdef":
            pen = TTGlyphPen(None)
            glyphs[name] = pen.glyph()
        else:
            png_path = source_dir / f"{name}.png"
            img = Image.open(png_path).convert("RGBA")
            img_width, img_height = img.size

            pen = TTGlyphPen(None)
            margin = 50
            x0, y0 = margin, margin
            x1 = _UNITS_PER_EM - margin
            y1 = _UNITS_PER_EM - margin
            pen.moveTo((x0, y0))
            pen.lineTo((x1, y0))
            pen.lineTo((x1, y1))
            pen.lineTo((x0, y1))
            pen.closePath()
            glyphs[name] = pen.glyph()
    fb.setupGlyf(glyphs)

    # Per-glyph advance width: default 1em + per-die `advance_extra` if set.
    # advance_extra pushes the NEXT character right by that many FUnits — gives
    # oversized dice room so they don't visually overlap the next glyph.
    hmtx = {}
    for name in glyph_order:
        if name == ".notdef":
            hmtx[name] = (_UNITS_PER_EM, 0)
        else:
            extra = _die_setting(name, "advance_extra")
            hmtx[name] = (_UNITS_PER_EM + int(extra), 0)
    fb.setupHorizontalMetrics(hmtx)
    # Apple Color Emoji-style: ascent at full em, descent at -31% of em.
    # The descent gives the renderer space below the baseline, which makes
    # the bitmap (which fills the ascent region) sit visually inline with
    # text instead of floating above it.
    fb.setupHorizontalHeader(ascent=_UNITS_PER_EM, descent=_DESCENT)

    # Full name records (IDs 1–6) are required for clean Font Book / Core Text
    # validation — omitting fullName/version/uniqueID triggers "name table
    # structure" errors in Font Book.
    # Use the original "DnD Dice" / "DnDDice-Regular" identity to take over
    # macOS's stale font registry entry for /Users/joe/Library/Fonts/dnd-dice.ttf.
    # The macOS user-level font registry can get into a state where new fonts
    # added to ~/Library/Fonts/ are not auto-discovered (CTFontManagerCopy-
    # AvailableFontFamilyNames omits them) but stale entries persist, even when
    # their files are deleted (resolving as ".LastResort"). By rebuilding the
    # font with the original identity AND filename, the stale registration
    # finds a valid file at the expected path with the expected PostScript
    # name and re-activates the entry — making the font visible to Chromium /
    # VSCode without needing user intervention.
    fb.setupNameTable({
        "familyName": "DnD Dice",
        "styleName": "Regular",
        "uniqueFontIdentifier": "DnDDice;1.0;2026",
        "fullName": "DnD Dice Regular",
        "version": "Version 1.0",
        "psName": "DnDDice-Regular",
    })
    fb.setupOS2(
        sTypoAscender=_UNITS_PER_EM,
        sTypoDescender=_DESCENT,
        usWinAscent=_UNITS_PER_EM,
        usWinDescent=abs(_DESCENT),
    )
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
        # Resolve per-die settings (with fallback to DEFAULT_* values)
        origin_y = _die_setting(die_name, "origin_y")
        origin_x = _die_setting(die_name, "origin_x")
        scale = _die_setting(die_name, "scale")
        invert_rgb = _die_setting(die_name, "invert_rgb")

        # Sanity-check: bitmap shift can't extend below the font's descender,
        # or some renderers will clip the bottom of the glyph.
        if abs(origin_y) >= abs(_DESCENT):
            raise ValueError(
                f"{die_name}: |origin_y|={abs(origin_y)} ≥ |_DESCENT|={abs(_DESCENT)} "
                f"— bitmap bottom would extend below descender and may clip. "
                f"Reduce |origin_y| or increase |_DESCENT|."
            )

        target_size = max(1, int(round(_TARGET_SIZE * scale)))
        png_bytes = _normalize_png(
            source_dir / f"{die_name}.png",
            invert_rgb=invert_rgb,
            target_size=target_size,
        )
        sbix_glyph = SbixGlyph(
            graphicType="png ",
            glyphName=die_name,
            originOffsetX=origin_x,
            originOffsetY=origin_y,
            imageData=png_bytes,
        )
        strike.glyphs[die_name] = sbix_glyph

    sbix.strikes = {_STRIKE_PPEM: strike}
    font["sbix"] = sbix

    output_path.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(output_path))


def _render_preview(font_path: Path, preview_path: Path) -> None:
    """Render a baseline-annotated multi-size preview of the just-built font.

    Renders the dice glyphs alongside Monaco text at sizes 16/20/24/32/48pt,
    with red baseline and blue cap-height reference lines drawn for each row.
    Useful for tuning _BITMAP_ORIGIN_Y — you can see exactly where the dice
    sit relative to text after each build.

    Requires PyObjC (pyobjc-framework-CoreText, pyobjc-framework-Cocoa). Skips
    silently with a printed message if unavailable.
    """
    try:
        import CoreText
        import CoreFoundation
        import Quartz
        from Cocoa import NSAttributedString, NSMutableAttributedString
    except ImportError:
        print(f"⊘ preview skipped: PyObjC not installed (pip install pyobjc-framework-CoreText pyobjc-framework-Cocoa)")
        return

    url = CoreFoundation.CFURLCreateWithFileSystemPath(
        None, str(font_path), CoreFoundation.kCFURLPOSIXPathStyle, False
    )
    CoreText.CTFontManagerRegisterFontsForURL(
        url, CoreText.kCTFontManagerScopeProcess, None
    )

    width, height = 1400, 700
    color_space = Quartz.CGColorSpaceCreateDeviceRGB()
    ctx = Quartz.CGBitmapContextCreate(
        None, width, height, 8, width * 4, color_space,
        Quartz.kCGImageAlphaPremultipliedLast,
    )
    Quartz.CGContextSetRGBFillColor(ctx, 0.05, 0.05, 0.05, 1.0)
    Quartz.CGContextFillRect(ctx, ((0, 0), (width, height)))

    sizes = [16, 20, 24, 32, 48]
    y_cursor = height - 60
    family_name = "DnD Dice"

    # Sample text and dice codepoints for the preview line
    dice_str = "".join(chr(cp) for cp in GLYPH_MAP.values())

    for size in sizes:
        mono = CoreText.CTFontCreateWithName("Monaco", size, None)
        dice = CoreText.CTFontCreateWithName(family_name, size, None)
        plain = {"NSFont": mono, "NSColor": Quartz.CGColorCreateGenericRGB(0.9, 0.9, 0.9, 1.0)}
        dice_attrs = {"NSFont": dice, "NSColor": Quartz.CGColorCreateGenericRGB(1.0, 1.0, 1.0, 1.0)}

        full = NSMutableAttributedString.alloc().initWithString_("")
        for s, attrs in [(f"{size}pt: [", plain),
                         (dice_str, dice_attrs),
                         ("] xyz_abc(11)", plain)]:
            full.appendAttributedString_(NSAttributedString.alloc().initWithString_attributes_(s, attrs))

        # Baseline (red) and cap-height (blue) reference lines
        Quartz.CGContextSetLineWidth(ctx, 0.5)
        Quartz.CGContextSetRGBStrokeColor(ctx, 1.0, 0.3, 0.3, 0.7)
        Quartz.CGContextMoveToPoint(ctx, 30, y_cursor)
        Quartz.CGContextAddLineToPoint(ctx, width - 30, y_cursor)
        Quartz.CGContextStrokePath(ctx)

        Quartz.CGContextSetRGBStrokeColor(ctx, 0.3, 0.8, 1.0, 0.5)
        cap_y = y_cursor + size * 0.7
        Quartz.CGContextMoveToPoint(ctx, 30, cap_y)
        Quartz.CGContextAddLineToPoint(ctx, width - 30, cap_y)
        Quartz.CGContextStrokePath(ctx)

        line = CoreText.CTLineCreateWithAttributedString(full)
        Quartz.CGContextSetTextPosition(ctx, 30, y_cursor)
        CoreText.CTLineDraw(line, ctx)

        y_cursor -= max(size + 28, 50)

    # Legend
    helv = CoreText.CTFontCreateWithName("Helvetica", 12, None)
    for label, color, y in [("red = baseline", (1.0, 0.3, 0.3, 0.9), 20),
                            ("blue = approx cap-height", (0.3, 0.8, 1.0, 0.9), 5)]:
        attrs = {"NSFont": helv, "NSColor": Quartz.CGColorCreateGenericRGB(*color)}
        s = NSAttributedString.alloc().initWithString_attributes_(label, attrs)
        sline = CoreText.CTLineCreateWithAttributedString(s)
        Quartz.CGContextSetTextPosition(ctx, 30, y)
        CoreText.CTLineDraw(sline, ctx)

    # Active settings annotation — defaults + per-die overrides that differ
    attrs = {"NSFont": helv, "NSColor": Quartz.CGColorCreateGenericRGB(0.7, 0.7, 0.7, 1.0)}
    header = (
        f"defaults: origin_y={DEFAULT_ORIGIN_Y} origin_x={DEFAULT_ORIGIN_X} "
        f"scale={DEFAULT_SCALE} invert_rgb={DEFAULT_INVERT_RGB}  |  "
        f"_TARGET_SIZE={_TARGET_SIZE} _STRIKE_PPEM={_STRIKE_PPEM} _DESCENT={_DESCENT}"
    )
    s = NSAttributedString.alloc().initWithString_attributes_(header, attrs)
    sline = CoreText.CTLineCreateWithAttributedString(s)
    Quartz.CGContextSetTextPosition(ctx, 30, height - 25)
    CoreText.CTLineDraw(sline, ctx)

    # Per-die details on a second line — only show entries that override defaults
    per_die_parts = []
    for die_name in GLYPH_MAP:
        overrides = PER_DIE.get(die_name, {})
        diffs = []
        for key, default in [("origin_y", DEFAULT_ORIGIN_Y),
                              ("origin_x", DEFAULT_ORIGIN_X),
                              ("scale", DEFAULT_SCALE),
                              ("advance_extra", DEFAULT_ADVANCE_EXTRA),
                              ("invert_rgb", DEFAULT_INVERT_RGB)]:
            val = overrides.get(key, default)
            if val != default:
                diffs.append(f"{key}={val}")
        if diffs:
            per_die_parts.append(f"{die_name}({','.join(diffs)})")
    per_die_line = "overrides: " + (" ".join(per_die_parts) if per_die_parts else "(none — all dice use defaults)")
    s = NSAttributedString.alloc().initWithString_attributes_(per_die_line, attrs)
    sline = CoreText.CTLineCreateWithAttributedString(s)
    Quartz.CGContextSetTextPosition(ctx, 30, height - 42)
    CoreText.CTLineDraw(sline, ctx)

    image = Quartz.CGBitmapContextCreateImage(ctx)
    preview_url = CoreFoundation.CFURLCreateWithFileSystemPath(
        None, str(preview_path), CoreFoundation.kCFURLPOSIXPathStyle, False
    )
    dest = Quartz.CGImageDestinationCreateWithURL(preview_url, "public.png", 1, None)
    Quartz.CGImageDestinationAddImage(dest, image, None)
    Quartz.CGImageDestinationFinalize(dest)


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=repo_root / "fonts" / "source-images")
    parser.add_argument("--output", type=Path, default=repo_root / "fonts" / "dnd-dice.ttf")
    parser.add_argument(
        "--preview",
        action="store_true",
        help="After building, render a baseline-annotated preview PNG alongside the .ttf "
             "(uses Core Text — requires PyObjC, macOS only).",
    )
    parser.add_argument(
        "--install",
        action="store_true",
        help="After building, also copy to ~/Library/Fonts/ so macOS picks it up.",
    )
    args = parser.parse_args()

    build_font(source_dir=args.source, output_path=args.output)
    print(f"Built {args.output} from {args.source}")

    if args.install:
        import shutil
        dest = Path.home() / "Library" / "Fonts" / args.output.name
        shutil.copy(args.output, dest)
        print(f"Installed → {dest}")

    if args.preview:
        preview_path = args.output.with_suffix(".preview.png")
        _render_preview(args.output, preview_path)
        if preview_path.exists():
            print(f"Preview → {preview_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
