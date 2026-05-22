#!/usr/bin/env python3
"""
Validate a font using Apple's Core Text framework — the same API Font Book uses.

Tests:
  1. CTFontManagerRegisterFontsForURL — does macOS accept the font file?
  2. CTFontCreateWithName — can macOS create a font instance from the family?
  3. CTFontCopyAvailableTables — does macOS see all required tables?
  4. CTFontGetGlyphsForCharacters — can macOS map our codepoints to glyphs?
  5. CTFontDrawGlyphs — can macOS actually rasterize the bitmaps to a CGImage?

If 1–5 all pass, Font Book will display the font and its glyphs.

Usage:
    python scripts/validate_font_macos.py <path-to-ttf>
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import CoreFoundation
import CoreText
import objc
import Quartz


# Codepoints we expect to render (set by the dice font)
_EXPECTED_CODEPOINTS = [0x1F518, 0x1F519, 0x1F51A, 0x1F51B, 0x1F51C, 0x1F51D]


def _cf_url(path: Path):
    return CoreFoundation.CFURLCreateWithFileSystemPath(
        None, str(path), CoreFoundation.kCFURLPOSIXPathStyle, False
    )


def _cf_string(s: str):
    return CoreFoundation.CFStringCreateWithCString(
        None, s.encode("utf-8"), CoreFoundation.kCFStringEncodingUTF8
    )


def _ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def _fail(msg: str) -> None:
    print(f"  ✗ {msg}")


def validate(ttf_path: Path) -> bool:
    print(f"\n=== Core Text validation: {ttf_path.name} ===\n")

    if not ttf_path.exists():
        _fail(f"file not found: {ttf_path}")
        return False

    url = _cf_url(ttf_path)

    # 1. Register the font (this is exactly what Font Book does on Install)
    print("[1] CTFontManagerRegisterFontsForURL")
    success, error = CoreText.CTFontManagerRegisterFontsForURL(
        url, CoreText.kCTFontManagerScopeProcess, None
    )
    if not success:
        # error may be an NSError; surface its description
        err_desc = error.localizedDescription() if error else "(no error info)"
        err_code = error.code() if error else "?"
        _fail(f"registration failed: code={err_code} desc={err_desc}")
        # Try to extract underlying errors (validation errors come back as a
        # CFArray under kCTFontManagerErrorFontURLsKey or similar)
        if error:
            user_info = error.userInfo()
            if user_info:
                print("    Error userInfo keys:")
                for k in user_info:
                    print(f"      {k!r}: {user_info[k]!r}")
        return False
    _ok("font registered with Core Text (Font Book would accept it)")

    # 2. Read the family name from the font directly (via fontTools — already
    # validated to be loadable) so we use the same name macOS sees.
    from fontTools.ttLib import TTFont
    ft_font = TTFont(str(ttf_path))
    family_name = next(
        r.toUnicode()
        for r in ft_font["name"].names
        if r.nameID == 1 and r.platformID == 3
    )
    print(f"[2] CTFontCreateWithName(family={family_name!r})")

    cf_family = _cf_string(family_name)
    ct_font = CoreText.CTFontCreateWithName(cf_family, 64.0, None)
    actual_family = CoreText.CTFontCopyFamilyName(ct_font)
    if str(actual_family) != family_name:
        _fail(
            f"Core Text resolved a DIFFERENT family: got {actual_family!r}, "
            f"expected {family_name!r}. Macos may be falling back."
        )
        return False
    _ok(f"Core Text instantiated the font as {actual_family!r}")

    # 3. Required tables present?
    print("[3] CTFontCopyAvailableTables")
    tables_arr = CoreText.CTFontCopyAvailableTables(
        ct_font, CoreText.kCTFontTableOptionNoOptions
    )
    table_tags = []
    for i in range(CoreFoundation.CFArrayGetCount(tables_arr)):
        tag = CoreFoundation.CFArrayGetValueAtIndex(tables_arr, i)
        # tag is an unsigned integer FourCC code
        table_tags.append(_fourcc_to_str(int(tag)))
    print(f"    Tables: {sorted(table_tags)}")
    required = {"cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post"}
    missing = required - set(table_tags)
    if missing:
        _fail(f"missing required tables: {missing}")
        return False
    if "sbix" not in table_tags and "CBDT" not in table_tags and "COLR" not in table_tags:
        _fail("no color bitmap table (sbix / CBDT / COLR) — glyphs will be empty")
        return False
    _ok("all required tables present + at least one color bitmap table")

    # 4. Codepoint -> Glyph mapping. PyObjC bridges CTFontGetGlyphsForCharacters
    # by accepting a Python str (encoded as UTF-16 internally). Each supplementary
    # codepoint produces two UniChars (a surrogate pair); glyph ID comes back at
    # the leading-surrogate position, trailing surrogate maps to 0.
    print("[4] CTFontGetGlyphsForCharacters")
    chars_str = "".join(chr(cp) for cp in _EXPECTED_CODEPOINTS)
    utf16 = chars_str.encode("utf-16-le")
    char_count = len(utf16) // 2
    # PyObjC bridges the output buffer as a return tuple (success, glyphs_array).
    result = CoreText.CTFontGetGlyphsForCharacters(
        ct_font, chars_str, None, char_count
    )
    if isinstance(result, tuple):
        success_bool, glyphs_out = result
    else:
        # Some PyObjC versions just return the buffer
        success_bool, glyphs_out = True, result
    # Walk the output: take every leading surrogate's glyph (skip trailing 0s).
    mapped_glyph_ids = []
    j = 0
    for cp in _EXPECTED_CODEPOINTS:
        mapped_glyph_ids.append(glyphs_out[j])
        j += 2 if cp >= 0x10000 else 1
    unmapped = [
        f"U+{cp:04X}"
        for cp, gid in zip(_EXPECTED_CODEPOINTS, mapped_glyph_ids)
        if gid == 0
    ]
    if unmapped:
        _fail(f"codepoints unmapped: {unmapped}")
        return False
    _ok(
        f"all {len(_EXPECTED_CODEPOINTS)} codepoints map to non-zero glyph IDs: "
        f"{mapped_glyph_ids}"
    )

    # 5. Actually rasterize one glyph — this is the killer test for SBIX
    #    rendering. If the SBIX bitmap can't be drawn, we get a blank pixmap.
    print("[5] CTFontDrawGlyphs (rasterization test)")
    test_glyph_id = mapped_glyph_ids[0]  # first die's glyph (d4)
    rasterized = _rasterize_glyph(ct_font, test_glyph_id)
    if rasterized is None:
        _fail("rasterization returned no image (Core Text drew nothing)")
        return False
    nonzero = rasterized
    if nonzero == 0:
        _fail("rasterized image is entirely empty — bitmap NOT being rendered")
        return False
    _ok(f"glyph rasterized to bitmap with {nonzero} non-transparent pixels")

    print("\n✓✓✓ ALL CHECKS PASSED — font will work in Font Book\n")
    return True


def _fourcc_to_str(tag_int: int) -> str:
    """Convert a 4-byte FourCC integer (e.g. 'cmap') to its string form."""
    return bytes([
        (tag_int >> 24) & 0xFF,
        (tag_int >> 16) & 0xFF,
        (tag_int >> 8) & 0xFF,
        tag_int & 0xFF,
    ]).decode("ascii", errors="replace").rstrip()


def _rasterize_glyph(ct_font, glyph_id: int) -> int | None:
    """Rasterize a single glyph to a 256x256 RGBA bitmap context, return
    count of non-zero-alpha pixels. None if context creation fails."""
    import ctypes

    width = height = 256
    color_space = Quartz.CGColorSpaceCreateDeviceRGB()
    bitmap = Quartz.CGBitmapContextCreate(
        None,
        width,
        height,
        8,
        width * 4,
        color_space,
        Quartz.kCGImageAlphaPremultipliedLast,
    )
    if bitmap is None:
        return None

    # Fill with transparent black
    Quartz.CGContextClearRect(bitmap, ((0, 0), (width, height)))

    # Draw glyph centered. Glyph IDs are uint16, points are pairs of doubles.
    glyphs_arr = (ctypes.c_uint16 * 1)(glyph_id)
    PointStruct = ctypes.c_double * 2
    positions_arr = (PointStruct * 1)((64.0, 80.0))
    CoreText.CTFontDrawGlyphs(ct_font, glyphs_arr, positions_arr, 1, bitmap)

    # Read back pixel data
    image = Quartz.CGBitmapContextCreateImage(bitmap)
    if image is None:
        return 0

    data_provider = Quartz.CGImageGetDataProvider(image)
    cf_data = Quartz.CGDataProviderCopyData(data_provider)
    if cf_data is None:
        return 0
    raw = bytes(cf_data)
    # Count non-zero alpha pixels (alpha is the 4th byte in RGBA)
    nonzero = sum(1 for i in range(3, len(raw), 4) if raw[i] > 0)
    return nonzero


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path-to-ttf>")
        sys.exit(2)
    path = Path(sys.argv[1]).expanduser().resolve()
    ok = validate(path)
    sys.exit(0 if ok else 1)
