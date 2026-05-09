# Custom Emoji Dice Font + Rich JSON Roller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom TTF dice font from emoji.gg PNGs, update `dnd_roller.py` to return rich JSON with quantum source markers and per-die bonus support, and configure terminal to render the font.

**Architecture:** PNGs (sourced from emoji.gg) → fonttools script generates TTF mapping each die to private-use Unicode (U+E000–U+E004) → existing `roll_dice` in `scripts/dnd_roller.py` is **extended** (not replaced) to embed those codes in a new `narrative` field, add an optional `bonuses` parameter, and tag output with source-of-randomness. Terminal renders custom dice glyphs when font is loaded. Quantum-vs-fallback transparency via ⚛️ prefix.

**Important:** This plan EXTENDS the existing `roll_dice` function and its supporting helpers in `scripts/dnd_roller.py`. No new function is created — the existing signature gains an optional `bonuses` parameter, the existing return value gains additional JSON fields. Existing callers that only pass `num_dice`/`dice_size`/`modifier` keep working.

**Tech Stack:** Python 3.14, fonttools (TTF generation), Pillow (PNG processing), pytest (testing), httpx + requests (existing roller HTTP), asyncio (existing roller concurrency).

---

## File Structure

**Create:**
- `fonts/source-images/` — directory holding PNGs sourced from emoji.gg
- `fonts/source-images/README.md` — instructions for sourcing/replacing dice PNGs
- `fonts/dnd-dice.ttf` — generated TTF font (committed to repo)
- `scripts/build_dice_font.py` — script that builds TTF from PNGs
- `scripts/tests/test_dnd_roller.py` — unit tests for roller logic

**Modify:**
- `scripts/dnd_roller.py` — add bonuses, quantum marker, rich JSON output
- `pyproject.toml` — add fonttools dependency
- `.claude/settings.json` — add font configuration (if Claude Code supports it)
- `AGENTS.md` or similar — document font install process for terminal

---

## Task 1: Add fonttools dependency and create font source directory

**Files:**
- Modify: `pyproject.toml`
- Create: `fonts/source-images/README.md`

- [ ] **Step 1: Add fonttools to dependencies**

Edit `pyproject.toml`, find the `dependencies` list, add `"fonttools>=4.50.0"`:

```toml
dependencies = [
  "ipykernel",
  "pandas",
  "pillow>=12.2.0",
  "pytest",
  "cairosvg",
  "chromadb",
  "python-dotenv",
  "tomlkit",
  "requests-cache>=1.3.1",
  "fonttools>=4.50.0"
]
```

- [ ] **Step 2: Install the new dependency**

Run: `.venv/bin/pip install "fonttools>=4.50.0"`
Expected: Package installs successfully

- [ ] **Step 3: Create source-images directory and README**

Create `fonts/source-images/README.md`:

```markdown
# Dice Source Images

This directory holds the PNG source images for the custom `dnd-dice.ttf` font.

## Required files

Download from [emoji.gg](https://emoji.gg) (Cruxoflux artist set):

| File | Source | Maps To |
|------|--------|---------|
| `d4.png` | https://emoji.gg/emoji/d4 | U+E000 |
| `d6.png` | https://emoji.gg/emoji/d6 | U+E001 |
| `d8.png` | https://emoji.gg/emoji/d8 | U+E002 |
| `d10.png` | https://emoji.gg/emoji/d10 | U+E003 |
| `d20.png` | https://emoji.gg/emoji/d20 | U+E004 |

## Rebuilding the font

After replacing/updating PNGs, regenerate the TTF:

```bash
.venv/bin/python scripts/build_dice_font.py
```

The script outputs `fonts/dnd-dice.ttf`.
```

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml fonts/source-images/README.md
git commit -m "feat(fonts): add fonttools dep + source image directory for dice font"
```

---

## Task 2: Build TTF generator script

**Files:**
- Create: `scripts/build_dice_font.py`
- Test: `scripts/tests/test_build_dice_font.py`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/test_build_dice_font.py`:

```python
"""Tests for the dice font builder."""
from pathlib import Path

import pytest

from scripts.build_dice_font import GLYPH_MAP, build_font


def test_glyph_map_has_required_dice():
    """Verify all required dice are in the glyph map."""
    required_dice = {"d4", "d6", "d8", "d10", "d20"}
    assert required_dice.issubset(GLYPH_MAP.keys())


def test_glyph_map_uses_private_use_area():
    """Verify all glyphs map to Unicode Private Use Area (U+E000–U+F8FF)."""
    for die_name, codepoint in GLYPH_MAP.items():
        assert 0xE000 <= codepoint <= 0xF8FF, f"{die_name} codepoint {hex(codepoint)} not in PUA"


def test_build_font_creates_ttf(tmp_path: Path):
    """Verify build_font produces a valid TTF file when given valid PNGs."""
    # Create dummy 64x64 white PNG files for each die
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest scripts/tests/test_build_dice_font.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'scripts.build_dice_font'"

- [ ] **Step 3: Implement build_dice_font.py**

Create `scripts/build_dice_font.py`:

```python
#!/usr/bin/env python3
"""
Build the custom D&D dice TTF font from source PNG images.

Reads PNG images from fonts/source-images/, maps each to a private-use Unicode
codepoint (U+E000–U+E004), and outputs a TTF font at fonts/dnd-dice.ttf.

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
import struct
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.S_B_I_X_ import table_S_B_I_X_
from fontTools.ttLib.tables.sbixGlyph import Glyph as SbixGlyph
from fontTools.ttLib.tables.sbixStrike import Strike

# Map each die name to its private-use Unicode codepoint
GLYPH_MAP: dict[str, int] = {
    "d4": 0xE000,
    "d6": 0xE001,
    "d8": 0xE002,
    "d10": 0xE003,
    "d20": 0xE004,
}

# Bitmap strike size (pixels per em)
_STRIKE_PPEM = 128
_UNITS_PER_EM = 1024


def _load_png(path: Path) -> bytes:
    """Read a PNG file and return its raw bytes."""
    if not path.exists():
        raise FileNotFoundError(f"Required PNG not found: {path}")
    return path.read_bytes()


def build_font(source_dir: Path, output_path: Path) -> None:
    """
    Build a TTF font from PNG source images.
    
    Args:
        source_dir: Directory containing d4.png, d6.png, etc.
        output_path: Where to write the resulting .ttf file
    
    Raises:
        FileNotFoundError: If any required PNG is missing.
    """
    # Build glyph order: .notdef first (required), then one glyph per die
    glyph_order = [".notdef"] + list(GLYPH_MAP.keys())
    
    fb = FontBuilder(_UNITS_PER_EM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    
    # Map Unicode codepoints to glyph names
    cmap = {cp: name for name, cp in GLYPH_MAP.items()}
    fb.setupCharacterMap(cmap)
    
    # Empty TrueType outlines (we use SBIX for bitmaps)
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    glyphs = {}
    for name in glyph_order:
        pen = TTGlyphPen(None)
        glyphs[name] = pen.glyph()
    fb.setupGlyf(glyphs)
    
    # Horizontal metrics: square advance width per glyph
    advance = _UNITS_PER_EM
    fb.setupHorizontalMetrics({name: (advance, 0) for name in glyph_order})
    fb.setupHorizontalHeader(ascent=_UNITS_PER_EM, descent=0)
    
    # Required tables for valid TTF
    fb.setupNameTable({
        "familyName": "DnD Dice",
        "styleName": "Regular",
        "psName": "DnDDice-Regular",
    })
    fb.setupOS2(sTypoAscender=_UNITS_PER_EM, usWinAscent=_UNITS_PER_EM, usWinDescent=0)
    fb.setupPost()
    
    # Add SBIX (bitmap) table with PNG embeds
    font = fb.font
    sbix = table_S_B_I_X_()
    sbix.version = 1
    sbix.flags = 1  # has bitmap data
    sbix.numStrikes = 1
    
    strike = Strike()
    strike.ppem = _STRIKE_PPEM
    strike.resolution = 72
    strike.glyphs = {}
    
    for die_name in GLYPH_MAP:
        png_bytes = _load_png(source_dir / f"{die_name}.png")
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
    parser.add_argument(
        "--source",
        type=Path,
        default=repo_root / "fonts" / "source-images",
        help="Directory containing PNG source images",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=repo_root / "fonts" / "dnd-dice.ttf",
        help="Output TTF file path",
    )
    args = parser.parse_args()
    
    build_font(source_dir=args.source, output_path=args.output)
    print(f"Built {args.output} from {args.source}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest scripts/tests/test_build_dice_font.py -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/build_dice_font.py scripts/tests/test_build_dice_font.py
git commit -m "feat(fonts): add TTF builder script for dice font from PNGs"
```

---

## Task 3: Generate the actual font from user-supplied PNGs

**Files:**
- Read: `fonts/source-images/d4.png, d6.png, d8.png, d10.png, d20.png` (user-provided)
- Create: `fonts/dnd-dice.ttf`

**Note:** This task requires the user to have placed the 5 PNG files in `fonts/source-images/`. If files are missing, ask user to download from emoji.gg before continuing.

- [ ] **Step 1: Verify all required PNGs are present**

Run: `ls fonts/source-images/*.png`
Expected: `d4.png`, `d6.png`, `d8.png`, `d10.png`, `d20.png`

If any are missing, STOP and ask the user to download from emoji.gg.

- [ ] **Step 2: Build the TTF**

Run: `.venv/bin/python scripts/build_dice_font.py`
Expected: Prints "Built /path/to/fonts/dnd-dice.ttf from /path/to/fonts/source-images"

- [ ] **Step 3: Verify TTF is valid**

Run: `.venv/bin/python -c "from fontTools.ttLib import TTFont; f = TTFont('fonts/dnd-dice.ttf'); print('Glyphs:', f.getGlyphOrder())"`
Expected: Output includes `.notdef`, `d4`, `d6`, `d8`, `d10`, `d20`

- [ ] **Step 4: Commit the font**

```bash
git add fonts/dnd-dice.ttf fonts/source-images/*.png
git commit -m "feat(fonts): generate dnd-dice.ttf from emoji.gg dice PNGs"
```

---

## Task 4: Add Unicode glyph constants and source tracking to roller

**Files:**
- Modify: `scripts/dnd_roller.py`

- [ ] **Step 1: Add glyph map constant near top of file**

In `scripts/dnd_roller.py`, after the imports block (around line 25), add:

```python
# Private-use Unicode codepoints mapped to dice glyphs.
# These render as custom dice when terminal has dnd-dice.ttf loaded.
_DICE_GLYPHS: dict[int, str] = {
    4: "",
    6: "",
    8: "",
    10: "",
    20: "",
    100: "",  # d100 = two d10s side-by-side
}
# Note: d12 has no glyph yet — falls through to "d12" text label
_DICE_FALLBACK_LABELS: dict[int, str] = {12: "d12"}

# Quantum marker: prefixed to narrative when source is quantumnumbers API
_QUANTUM_MARKER = "⚛️"  # ⚛️
```

- [ ] **Step 2: Add source tracking to cache state**

Find the cache state declarations (around lines 38-41):

```python
# In-memory cache of uint16 numbers
_number_cache: list[int] = []
_fetch_lock = asyncio.Lock()
_last_fetch_time: float = 0.0
```

Replace with:

```python
# In-memory cache of uint16 numbers, paired with source tag per number.
# When we pop a number, we know whether it came from quantum or random.org.
_number_cache: list[int] = []
_source_cache: list[str] = []  # parallel list: "quantumnumbers" or "random_org"
_fetch_lock = asyncio.Lock()
_last_fetch_time: float = 0.0
```

- [ ] **Step 3: Update _load_cache and _write_cache for source tracking**

Find `_load_cache` and `_write_cache` (around lines 64-83). Replace with:

```python
def _load_cache() -> None:
    """Load cached numbers from disk into memory.
    
    The on-disk format is: 2 bytes uint16 number, 1 byte source tag (0=quantum, 1=random_org).
    Total 3 bytes per entry.
    """
    global _number_cache, _source_cache
    if _CACHE_FILE.exists():
        with open(_CACHE_FILE, "rb") as f:
            data = f.read()
        if data and len(data) % 3 == 0:
            entries = len(data) // 3
            for i in range(entries):
                num = struct.unpack_from("H", data, i * 3)[0]
                tag = data[i * 3 + 2]
                _number_cache.append(num)
                _source_cache.append("quantumnumbers" if tag == 0 else "random_org")


def _write_cache() -> None:
    """Persist remaining numbers + source tags to disk."""
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if _number_cache:
        buf = bytearray()
        for num, src in zip(_number_cache, _source_cache):
            buf.extend(struct.pack("H", num))
            buf.append(0 if src == "quantumnumbers" else 1)
        with open(_CACHE_FILE, "wb") as f:
            f.write(bytes(buf))
    else:
        _CACHE_FILE.unlink(missing_ok=True)
```

- [ ] **Step 4: Update _ensure_numbers to track source**

Find `_ensure_numbers` (around lines 137-172). Replace with:

```python
async def _ensure_numbers(needed: int) -> bool:
    """Ensure cache has at least `needed` numbers. Fetch if necessary."""
    global _number_cache, _source_cache, _last_fetch_time

    if len(_number_cache) >= needed:
        return True

    async with _fetch_lock:
        # Double-check after acquiring lock
        if len(_number_cache) >= needed:
            return True

        # Rate limit: 1 request per second
        now = time.time()
        wait_time = 1.0 - (now - _last_fetch_time)
        if wait_time > 0:
            await asyncio.sleep(wait_time)

        # Try quantumnumbers first (batch fetch to maximize quota)
        new_numbers = await _fetch_from_quantumnumbers(1024)
        if new_numbers:
            _number_cache.extend(new_numbers)
            _source_cache.extend(["quantumnumbers"] * len(new_numbers))
            _write_cache()
            return True

        # Fallback: fetch enough from random.org for this request + buffer
        fallback_count = max(needed, 100)
        new_numbers = await asyncio.to_thread(
            _fetch_from_random_org_sync, fallback_count
        )
        if new_numbers:
            _number_cache.extend(new_numbers)
            _source_cache.extend(["random_org"] * len(new_numbers))
            _write_cache()
            return True

        return False
```

- [ ] **Step 5: Update _pop_numbers to return numbers + dominant source**

Find `_pop_numbers` (around lines 175-189). Replace with:

```python
async def _pop_numbers(count: int) -> tuple[list[int], str]:
    """Get `count` random numbers and the dominant source tag.
    
    Returns:
        (numbers, source) where source is "quantumnumbers" if ALL popped numbers
        came from quantum, otherwise "random_org". This conservative behavior means
        the ⚛️ marker only shows when every die in this roll was quantum-sourced.
    """
    if not await _ensure_numbers(count):
        raise RuntimeError(
            "Failed to fetch random numbers from both quantumnumbers and random.org"
        )

    numbers = _number_cache[:count]
    sources = _source_cache[:count]
    _number_cache[:count] = []
    _source_cache[:count] = []

    _write_cache()

    # Conservative: only mark as quantum if ALL numbers in this batch are quantum
    source = "quantumnumbers" if all(s == "quantumnumbers" for s in sources) else "random_org"
    return numbers, source
```

- [ ] **Step 6: Delete any existing cache file (schema changed)**

Run: `rm -f ~/.cache/dnd_roller/quant_numbers.bin`
Expected: silent success (file removed if existed)

- [ ] **Step 7: Run existing tests to verify nothing broke**

Run: `.venv/bin/python -m pytest scripts/tests/ -v -x --ignore=scripts/tests/test_dnd_roller.py 2>&1 | tail -10`
Expected: All existing tests still pass

- [ ] **Step 8: Commit**

```bash
git add scripts/dnd_roller.py
git commit -m "feat(roller): track source (quantum vs random.org) per cached number"
```

---

## Task 5: Add bonuses parameter and rich JSON output

**Files:**
- Modify: `scripts/dnd_roller.py`
- Test: `scripts/tests/test_dnd_roller.py`

- [ ] **Step 1: Write the failing tests**

Create `scripts/tests/test_dnd_roller.py`:

```python
"""Tests for the D&D roller's pure logic (narrative, bonuses, validation)."""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from scripts import dnd_roller


@pytest.fixture(autouse=True)
def reset_cache():
    """Reset module-level cache state before each test."""
    dnd_roller._number_cache.clear()
    dnd_roller._source_cache.clear()
    yield
    dnd_roller._number_cache.clear()
    dnd_roller._source_cache.clear()


def _seed_cache(numbers: list[int], source: str = "quantumnumbers") -> None:
    """Helper: pre-populate the cache with deterministic numbers."""
    dnd_roller._number_cache.extend(numbers)
    dnd_roller._source_cache.extend([source] * len(numbers))


def test_roll_dice_returns_required_json_fields():
    """Result JSON must include narrative, rolls, source, total fields."""
    _seed_cache([14, 11, 17])  # uint16 -> mod 20: 15, 12, 18
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    
    assert "narrative" in result
    assert "rolls" in result
    assert "source" in result
    assert "total_raw" in result
    assert "total_with_bonuses" in result
    assert "dice_notation" in result


def test_roll_dice_rolls_match_modulo():
    """Each roll = (uint16 % dice_size) + 1."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert result["rolls"] == [15, 12, 18]  # 14%20+1, 11%20+1, 17%20+1


def test_bonuses_applied_per_die():
    """When bonuses=[2,3,4], each roll gets its own bonus."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(
        num_dice=3, dice_size=20, bonuses=[2, 3, 4]
    ))
    assert result["rolls"] == [15, 12, 18]
    assert result["bonuses"] == [2, 3, 4]
    assert result["rolls_with_bonuses"] == [17, 15, 22]
    assert result["total_raw"] == 45  # 15+12+18
    assert result["total_with_bonuses"] == 54  # 17+15+22


def test_modifier_applied_to_total_only():
    """`modifier` adds to the final total but not per-die."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(
        num_dice=3, dice_size=20, modifier=5
    ))
    assert result["rolls"] == [15, 12, 18]
    assert result["total_raw"] == 45
    assert result["total_with_bonuses"] == 50  # 45 + modifier 5


def test_bonuses_and_modifier_combined():
    """Bonuses (per-die) + modifier (total) both apply to total_with_bonuses."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(
        num_dice=3, dice_size=20, bonuses=[2, 2, 2], modifier=5
    ))
    assert result["total_raw"] == 45
    # 17+14+20 = 51 (with bonuses) + 5 (modifier) = 56
    assert result["total_with_bonuses"] == 56


def test_bonuses_length_mismatch_raises():
    """If bonuses length != num_dice, raise ValueError."""
    _seed_cache([14, 11, 17])
    with pytest.raises(ValueError, match="bonuses"):
        dnd_roller.roll_dice(num_dice=3, dice_size=20, bonuses=[2, 3])


def test_quantum_marker_present_when_source_quantum():
    """Narrative starts with ⚛️ when source is quantumnumbers."""
    _seed_cache([14, 11, 17], source="quantumnumbers")
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert result["narrative"].startswith("⚛️")
    assert result["source"] == "quantumnumbers"


def test_no_quantum_marker_when_random_org_fallback():
    """Narrative has no ⚛️ prefix when source is random_org."""
    _seed_cache([14, 11, 17], source="random_org")
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert not result["narrative"].startswith("⚛️")
    assert result["source"] == "random_org"


def test_narrative_includes_dice_glyph():
    """Narrative includes the private-use codepoint for the die size."""
    _seed_cache([14, 11, 17], source="random_org")
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert "" in result["narrative"]  # d20 glyph


def test_dice_notation_field():
    """dice_notation summarizes the roll (e.g., '3d20+2')."""
    _seed_cache([14, 11, 17])
    
    r1 = json.loads(dnd_roller.roll_dice(3, 20))
    assert r1["dice_notation"] == "3d20"
    
    _seed_cache([14, 11, 17])
    r2 = json.loads(dnd_roller.roll_dice(3, 20, modifier=5))
    assert r2["dice_notation"] == "3d20+5"
    
    _seed_cache([14, 11, 17])
    r3 = json.loads(dnd_roller.roll_dice(3, 20, modifier=-2))
    assert r3["dice_notation"] == "3d20-2"


def test_bonuses_none_means_zero_bonuses():
    """When bonuses=None, rolls_with_bonuses equals rolls."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert result["rolls_with_bonuses"] == result["rolls"]
    assert result["bonuses"] == [0, 0, 0]


def test_invalid_dice_size_raises():
    """dice_size must be in valid set."""
    _seed_cache([14])
    with pytest.raises(ValueError, match="dice_size"):
        dnd_roller.roll_dice(num_dice=1, dice_size=7)


def test_modifier_out_of_range_raises():
    """modifier outside -1000..1000 raises."""
    _seed_cache([14])
    with pytest.raises(ValueError, match="modifier"):
        dnd_roller.roll_dice(num_dice=1, dice_size=20, modifier=5000)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest scripts/tests/test_dnd_roller.py -v`
Expected: Tests FAIL — most because `bonuses` parameter doesn't exist yet, narrative format hasn't changed, etc.

- [ ] **Step 3: Update `_roll_dice_async` to support bonuses and rich return**

In `scripts/dnd_roller.py`, replace the existing `_roll_dice_async` function (around lines 192-216):

```python
async def _roll_dice_async(
    num_dice: int,
    dice_size: int,
    bonuses: list[int] | None = None,
    modifier: int = 0,
) -> dict[str, Any]:
    """Roll D&D dice asynchronously with per-die bonuses and total modifier."""
    if not isinstance(num_dice, int) or not (1 <= num_dice <= 100):
        raise ValueError("num_dice must be an integer between 1 and 100")
    if dice_size not in (4, 6, 8, 10, 12, 20, 100):
        raise ValueError(
            f"dice_size must be one of: 4, 6, 8, 10, 12, 20, 100. Got {dice_size}"
        )
    if not isinstance(modifier, int) or not (-1000 <= modifier <= 1000):
        raise ValueError("modifier must be an integer between -1000 and 1000")
    
    # Validate bonuses
    if bonuses is None:
        bonuses_list: list[int] = [0] * num_dice
    else:
        if not isinstance(bonuses, list) or not all(isinstance(b, int) for b in bonuses):
            raise ValueError("bonuses must be a list of integers or None")
        if len(bonuses) != num_dice:
            raise ValueError(
                f"bonuses length ({len(bonuses)}) must match num_dice ({num_dice})"
            )
        bonuses_list = bonuses
    
    # Fetch random numbers + source
    raw_numbers, source = await _pop_numbers(num_dice)
    
    # Apply modulo to get dice values (1 to dice_size)
    rolls = [num % dice_size + 1 for num in raw_numbers]
    rolls_with_bonuses = [r + b for r, b in zip(rolls, bonuses_list)]
    total_raw = sum(rolls)
    total_with_bonuses = sum(rolls_with_bonuses) + modifier
    
    return {
        "narrative": _build_narrative(
            dice_size=dice_size,
            rolls=rolls,
            bonuses=bonuses_list,
            modifier=modifier,
            total=total_with_bonuses,
            source=source,
        ),
        "source": source,
        "rolls": rolls,
        "bonuses": bonuses_list,
        "rolls_with_bonuses": rolls_with_bonuses,
        "modifier": modifier,
        "total_raw": total_raw,
        "total_with_bonuses": total_with_bonuses,
        "dice_code": f"U+{ord(_DICE_GLYPHS.get(dice_size, _DICE_FALLBACK_LABELS.get(dice_size, '?'))[0]):04X}"
            if dice_size in _DICE_GLYPHS else None,
        "dice_notation": _build_dice_notation(num_dice, dice_size, modifier),
    }
```

- [ ] **Step 4: Add narrative + dice_notation builders**

In `scripts/dnd_roller.py`, add these functions just above `_roll_dice_async`:

```python
def _glyph_for_die(dice_size: int) -> str:
    """Return the private-use glyph for a die size, falling back to text label."""
    if dice_size in _DICE_GLYPHS:
        return _DICE_GLYPHS[dice_size]
    return _DICE_FALLBACK_LABELS.get(dice_size, f"d{dice_size}")


def _build_narrative(
    dice_size: int,
    rolls: list[int],
    bonuses: list[int],
    modifier: int,
    total: int,
    source: str,
) -> str:
    """Build the human-readable narrative string with optional quantum marker.
    
    Examples:
      "⚛️ d20(15+2) d20(12+2) d20(18+2) = 51"  (quantum, with bonuses)
      "d6(3) d6(5) d6(2) = 10"                  (random.org fallback, no bonuses)
      "⚛️ d20(15) +5 = 20"                      (single die with modifier)
    """
    glyph = _glyph_for_die(dice_size)
    
    parts: list[str] = []
    for roll, bonus in zip(rolls, bonuses):
        if bonus:
            sign = "+" if bonus >= 0 else ""
            parts.append(f"{glyph}({roll}{sign}{bonus})")
        else:
            parts.append(f"{glyph}({roll})")
    
    body = " ".join(parts)
    
    if modifier:
        sign = "+" if modifier >= 0 else ""
        body += f" {sign}{modifier}"
    
    body += f" = {total}"
    
    if source == "quantumnumbers":
        return f"{_QUANTUM_MARKER} {body}"
    return body


def _build_dice_notation(num_dice: int, dice_size: int, modifier: int) -> str:
    """Build standard D&D dice notation: '3d20+5', '1d8', '2d6-1'."""
    base = f"{num_dice}d{dice_size}"
    if modifier > 0:
        return f"{base}+{modifier}"
    if modifier < 0:
        return f"{base}{modifier}"  # negative already has sign
    return base
```

- [ ] **Step 5: Update top-level `roll_dice` to accept bonuses**

Find `roll_dice` (around lines 219-236). Replace with:

```python
def roll_dice(
    num_dice: int,
    dice_size: int,
    bonuses: list[int] | None = None,
    modifier: int = 0,
) -> str:
    """
    Roll D&D dice with per-die bonuses and total modifier.

    Fetches batches of 1024 uint16 values from ANU quantumnumbers API,
    caches them locally, and serves rolls from cache. Falls back to
    random.org on API failure. Respects 1 request/second rate limit.

    Args:
        num_dice: Number of dice to roll (1-100).
        dice_size: Sides per die: 4, 6, 8, 10, 12, 20, or 100.
        bonuses: Per-die bonuses [2, 2, 2] or None. Length must match num_dice.
        modifier: Bonus or penalty added to the final total only (default 0).

    Returns:
        JSON string with: narrative, source, rolls, bonuses, rolls_with_bonuses,
        total_raw, total_with_bonuses, dice_code, dice_notation.
    """
    result = asyncio.run(_roll_dice_async(num_dice, dice_size, bonuses, modifier))
    return json.dumps(result, indent=2, ensure_ascii=False)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest scripts/tests/test_dnd_roller.py -v`
Expected: All 12+ tests PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/dnd_roller.py scripts/tests/test_dnd_roller.py
git commit -m "feat(roller): add bonuses param + rich JSON narrative with quantum marker"
```

---

## Task 6: Update MCP_TOOLS schema and description

**Files:**
- Modify: `scripts/dnd_roller.py`

- [ ] **Step 1: Update MCP_TOOLS description and schema**

In `scripts/dnd_roller.py`, find `MCP_TOOLS` (around line 243). Replace the entire `MCP_TOOLS` list with:

```python
MCP_TOOLS = [
    {
        "name": "roll_dice",
        "description": (
            "Roll D&D dice using cached quantum random numbers from ANU quantumnumbers API. "
            "Returns a JSON object with a ready-to-paste 'narrative' field plus full structured "
            "breakdown for verification.\n\n"
            "QUANTUM MARKER: When the narrative starts with the ⚛️ atom emoji, the rolls came from "
            "the quantumnumbers API (true quantum random). No marker means the request fell back to "
            "random.org — same dice, but pseudo-true rather than quantum. The 'source' JSON field "
            "always confirms which one was used.\n\n"
            "DICE GLYPHS: Each die appears in the narrative as a private-use Unicode codepoint "
            "(U+E000 d4, U+E001 d6, U+E002 d8, U+E003 d10, U+E004 d20). When the user has the "
            "dnd-dice.ttf font loaded, these render as custom dice images. The codes prove rolls "
            "are real, not hallucinated.\n\n"
            "BONUSES vs MODIFIER:\n"
            "  - bonuses=[2,3,4]: per-die bonuses, one per roll. e.g., two attacks with +3 and +5: "
            "bonuses=[3, 5].\n"
            "  - modifier=5: flat bonus added to the final total only.\n"
            "  - Both can combine: roll_dice(3, 6, bonuses=[2,2,2], modifier=1) for a sneak-attack "
            "damage style roll.\n\n"
            "Supports d4, d6, d8, d10, d12, d20, d100. "
            "For Haiku-grade speed: just paste the 'narrative' field — no further reasoning needed."
        ),
        "annotations": {"title": "Roll D&D Dice (Quantum + Custom Font)", **_RO_LOCAL},
        "input_schema": {
            "type": "object",
            "properties": {
                "num_dice": {
                    "type": "integer",
                    "description": "Number of dice to roll (1-100).",
                    "minimum": 1,
                    "maximum": 100,
                },
                "dice_size": {
                    "type": "integer",
                    "enum": [4, 6, 8, 10, 12, 20, 100],
                    "description": "Number of sides on each die (d4, d6, d8, d10, d12, d20, d100).",
                },
                "bonuses": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": (
                        "Optional per-die bonuses, one integer per die. Length must equal num_dice. "
                        "Example: bonuses=[3, 5] for two attacks at +3 and +5. Omit for no per-die bonuses."
                    ),
                },
                "modifier": {
                    "type": "integer",
                    "description": "Flat bonus or penalty added to the final total only (default 0, range: -1000 to +1000).",
                    "default": 0,
                    "minimum": -1000,
                    "maximum": 1000,
                },
            },
            "required": ["num_dice", "dice_size"],
            "additionalProperties": False,
        },
    },
]
```

- [ ] **Step 2: Verify MCP server discovers updated tool**

Run: `.venv/bin/python scripts/mcp/server.py --list-tools 2>&1 | grep -A1 "roll_dice"`
Expected: Output includes the updated description with "QUANTUM MARKER" and "DICE GLYPHS" sections.

- [ ] **Step 3: Smoke-test the tool end-to-end**

Run:
```bash
.venv/bin/python -c "
import sys
sys.path.insert(0, 'scripts')
from dnd_roller import roll_dice
print(roll_dice(num_dice=3, dice_size=20, bonuses=[2, 2, 2], modifier=1))
"
```
Expected: JSON with narrative containing private-use codepoints, total_with_bonuses computed correctly.

- [ ] **Step 4: Commit**

```bash
git add scripts/dnd_roller.py
git commit -m "feat(roller): update MCP description with quantum marker + glyph docs"
```

---

## Task 7: Install font system-wide and document terminal setup

**Files:**
- Create: `fonts/INSTALL.md`
- Possibly modify: `.claude/settings.json`

- [ ] **Step 1: Install font on macOS**

Run: `cp fonts/dnd-dice.ttf ~/Library/Fonts/`
Expected: silent success

- [ ] **Step 2: Verify font installed**

Run: `fc-list 2>/dev/null | grep -i "dnd" || ls ~/Library/Fonts/dnd-dice.ttf`
Expected: Either fc-list shows the font, or the file exists at the destination.

- [ ] **Step 3: Create INSTALL.md with platform-specific instructions**

Create `fonts/INSTALL.md`:

```markdown
# Installing the dnd-dice font

The `dnd-dice.ttf` font lets your terminal render custom dice glyphs returned by
the `roll_dice` MCP tool (private-use Unicode U+E000–U+E004).

## macOS

```bash
cp fonts/dnd-dice.ttf ~/Library/Fonts/
```

Then restart your terminal application (Terminal.app, iTerm2, VS Code's integrated
terminal) so it picks up the new font.

## Linux

```bash
mkdir -p ~/.fonts
cp fonts/dnd-dice.ttf ~/.fonts/
fc-cache -fv
```

## Windows

Right-click `fonts/dnd-dice.ttf` and choose "Install for all users".

## Configure your terminal

Most terminals fall back through a font stack. Add `dnd-dice` to your terminal's
font family list — it only contains glyphs for the dice codepoints, so your
regular monospace font will still be used for everything else.

**iTerm2 / Terminal.app:** Settings → Profiles → Text → Font. Some apps support a
"non-ASCII font" or fallback list — set `dnd-dice` there.

**VS Code:** Add to settings.json:
```json
{
  "terminal.integrated.fontFamily": "Menlo, 'dnd-dice', monospace"
}
```

## Rebuilding the font

If you replace any PNG in `fonts/source-images/`, regenerate the TTF:

```bash
.venv/bin/python scripts/build_dice_font.py
cp fonts/dnd-dice.ttf ~/Library/Fonts/  # macOS — re-install
```
```

- [ ] **Step 4: Commit**

```bash
git add fonts/INSTALL.md
git commit -m "docs(fonts): add font install instructions for macOS/Linux/Windows"
```

---

## Task 8: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Roll dice and confirm narrative is well-formed**

Run:
```bash
.venv/bin/python -c "
import json, sys
sys.path.insert(0, 'scripts')
from dnd_roller import roll_dice
r = json.loads(roll_dice(3, 20, bonuses=[2, 2, 2]))
print('Narrative:', r['narrative'])
print('Source:', r['source'])
print('Total:', r['total_with_bonuses'])
assert r['source'] in ('quantumnumbers', 'random_org')
assert r['total_with_bonuses'] == sum(r['rolls_with_bonuses'])
print('OK')
"
```
Expected: Prints narrative with dice glyphs, source name, total. Ends with "OK".

- [ ] **Step 2: Verify MCP server can dispatch the tool**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"roll_dice","arguments":{"num_dice":2,"dice_size":6,"bonuses":[1,1]}}}' | .venv/bin/python scripts/mcp/server.py 2>/dev/null | head -1
```
Expected: A JSON-RPC response containing a `narrative` field.

- [ ] **Step 3: Run the full test suite**

Run: `.venv/bin/python -m pytest scripts/tests/test_dnd_roller.py scripts/tests/test_build_dice_font.py -v`
Expected: All tests pass.

- [ ] **Step 4: Open a new terminal window and visually verify**

Open a fresh terminal (so the newly installed font is loaded). Run:
```bash
.venv/bin/python -c "
import sys; sys.path.insert(0, 'scripts')
from dnd_roller import roll_dice
import json
print(json.loads(roll_dice(1, 20))['narrative'])
"
```
Expected: A line where the dice glyph renders as the actual d20 image (not a tofu box). If you see a tofu box, the terminal hasn't picked up the font — restart the terminal app or check the font fallback configuration in `fonts/INSTALL.md`.

- [ ] **Step 5: Final commit (if any cleanup needed)**

If the verification turned up issues that required changes, commit them. Otherwise, no commit is needed for this task.
