#!/usr/bin/env python3
"""
D&D dice roller with cached quantum random numbers from ANU quantumnumbers API.

Fetches batches of 1024 uint16 random numbers and caches them locally.
Respects 1 request/second rate limit. Falls back to random.org on failure.
Numbers are persisted to disk to survive restarts—never reuses a number.

Tools exposed:
  - roll_dice — roll one or more D&D dice with an optional modifier
"""

from __future__ import annotations

import asyncio
import json
import os
import struct
import time
from pathlib import Path
from typing import Any

import httpx
import requests

try:
    from dotenv import load_dotenv
    _REPO_ROOT = Path(__file__).resolve().parents[1]
    load_dotenv(dotenv_path=_REPO_ROOT / ".env", override=False)
except ImportError:
    pass


_RO_LOCAL = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": False,
}

# Private-use Unicode codepoints mapped to dice glyphs.
# These render as custom dice when terminal has dnd-dice.ttf loaded.
# Using chr(0xE0xx) keeps the source readable instead of embedding raw PUA bytes.
_DICE_GLYPHS: dict[int, str] = {
    4: chr(0xE000),    # d4
    6: chr(0xE001),    # d6
    8: chr(0xE002),    # d8
    10: chr(0xE003),   # d10
    12: chr(0xE004),   # d12
    20: chr(0xE005),   # d20
    100: chr(0xE003) + chr(0xE003),  # d100 = two d10 glyphs side-by-side
}
# Plain-text fallback labels (used by dice_code field for non-glyphed dice).
_DICE_FALLBACK_LABELS: dict[int, str] = {}

# Quantum marker: prefixed to narrative when source is quantumnumbers API
_QUANTUM_MARKER = "⚛️"  # ⚛️

# Cache configuration
_CACHE_DIR = Path.home() / ".cache" / "dnd_roller"
_CACHE_FILE = _CACHE_DIR / "quant_numbers.bin"

# In-memory cache of uint16 numbers, paired with source tag per number.
# When we pop a number, we know whether it came from quantum or random.org.
_number_cache: list[int] = []
_source_cache: list[str] = []  # parallel list: "quantumnumbers" or "random_org"
_fetch_lock = asyncio.Lock()
_last_fetch_time: float = 0.0

# HTTP clients
_sync_session: requests.Session | None = None
_async_client: httpx.AsyncClient | None = None


def _get_sync_session() -> requests.Session:
    """Get or create a shared sync HTTP session."""
    global _sync_session
    if _sync_session is None:
        _sync_session = requests.Session()
    return _sync_session


async def _get_async_client() -> httpx.AsyncClient:
    """Get or create a shared async HTTP client."""
    global _async_client
    if _async_client is None:
        _async_client = httpx.AsyncClient(timeout=10.0)
    return _async_client


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


async def _fetch_from_quantumnumbers(count: int = 1024) -> list[int] | None:
    """Fetch random uint16 numbers from ANU quantumnumbers API."""
    global _last_fetch_time

    api_url = os.environ.get("QUANT_API_URL")
    api_key = os.environ.get("QUANT_API_KEY")

    if not api_url or not api_key:
        return None

    try:
        client = await _get_async_client()
        response = await client.get(
            api_url,
            params={
                "apiKey": api_key,
                "type": "uint16",
                "length": count,
            },
        )
        response.raise_for_status()
        data = response.json()
        _last_fetch_time = time.time()
        return data.get("data", [])
    except Exception:
        return None


def _fetch_from_random_org_sync(count: int) -> list[int]:
    """Fallback: fetch from RANDOM.ORG (sync version)."""
    session = _get_sync_session()
    try:
        response = session.get(
            "https://www.random.org/integers/",
            params={
                "num": count,
                "min": 1,
                "max": 65535,
                "col": 1,
                "base": 10,
                "format": "plain",
            },
            timeout=10,
        )
        response.raise_for_status()
        rolls = [int(line.strip()) for line in response.text.strip().split("\n")]
        return rolls
    except Exception:
        return []


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


def _glyph_for_die(dice_size: int) -> str:
    """Return the private-use glyph for a die size, falling back to text label."""
    if dice_size in _DICE_GLYPHS:
        return _DICE_GLYPHS[dice_size]
    return _DICE_FALLBACK_LABELS.get(dice_size, f"d{dice_size}")


def _dice_code_for_size(dice_size: int) -> str | None:
    """Return a human-readable Unicode code reference for the die's primary glyph,
    or None if the die has no PUA glyph (e.g., a future die added before its image).
    For d100 (two d10 glyphs), returns the d10 codepoint with a 'x2' suffix."""
    if dice_size not in _DICE_GLYPHS:
        return None
    glyph = _DICE_GLYPHS[dice_size]
    if len(glyph) == 1:
        return f"U+{ord(glyph):04X}"
    return f"U+{ord(glyph[0]):04X} x{len(glyph)}"


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
      "⚛️ <d20>(15+2) <d20>(12+2) <d20>(18+2) = 51"  (quantum, with bonuses)
      "<d6>(3) <d6>(5) <d6>(2) = 10"                   (random.org fallback, no bonuses)
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

    raw_numbers, source = await _pop_numbers(num_dice)

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
        "dice_code": _dice_code_for_size(dice_size),
        "dice_notation": _build_dice_notation(num_dice, dice_size, modifier),
    }


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


# Initialize cache on module load
_load_cache()


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
            "(U+E000 d4, U+E001 d6, U+E002 d8, U+E003 d10, U+E004 d12, U+E005 d20). When the user "
            "has the dnd-dice.ttf font loaded, these render as custom dice images. The codes prove "
            "rolls are real, not hallucinated.\n\n"
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


MCP_HANDLERS = {
    "roll_dice": roll_dice,
}
