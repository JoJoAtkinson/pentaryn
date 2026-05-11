"""Tests for the dice font builder."""
from pathlib import Path

import pytest

from scripts.build_dice_font import GLYPH_MAP, build_font


def test_glyph_map_has_required_dice():
    """Verify all required dice are in the glyph map."""
    required_dice = {"d4", "d6", "d8", "d10", "d20"}
    assert required_dice.issubset(GLYPH_MAP.keys())


def test_glyph_map_uses_private_use_area():
    """Verify all glyphs map to Unicode Private Use Area (U+E000-U+F8FF)."""
    for die_name, codepoint in GLYPH_MAP.items():
        assert 0xE000 <= codepoint <= 0xF8FF, f"{die_name} codepoint {hex(codepoint)} not in PUA"


def test_build_font_creates_ttf(tmp_path: Path):
    """Verify build_font produces a valid TTF file when given valid PNGs."""
    from PIL import Image
    src_dir = tmp_path / "images"
    src_dir.mkdir()
    for die_name in GLYPH_MAP:
        img = Image.new("RGBA", (64, 64), (255, 255, 255, 255))
        img.save(src_dir / f"{die_name}.png")

    output = tmp_path / "test.ttf"
    build_font(source_dir=src_dir, output_path=output)

    assert output.exists()
    assert output.stat().st_size > 0


def test_build_font_raises_on_missing_png(tmp_path: Path):
    """Verify build_font raises FileNotFoundError if a required PNG is missing."""
    src_dir = tmp_path / "images"
    src_dir.mkdir()
    output = tmp_path / "test.ttf"

    with pytest.raises(FileNotFoundError):
        build_font(source_dir=src_dir, output_path=output)
