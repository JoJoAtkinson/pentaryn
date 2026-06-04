#!/usr/bin/env python3
"""
D&D dice roller with cached quantum random numbers from ANU quantumnumbers API.

Fetches batches of 1024 uint16 random numbers and caches them locally.
Respects 1 request/second rate limit. Falls back to random.org on failure.
Numbers are persisted to disk to survive restarts—never reuses a number.

Tools exposed:
  - roll_dice            — roll one or more D&D dice with an optional modifier
  - log_combat_event     — append a non-roll event to a Markdown log file
  - roll_combat_action   — run a pre-defined combat action (multi-roll, one MCP call)
  - combat_action_upsert — author/edit a combat action (validates spec)
  - combat_actions_list  — inspect actions in the DB
"""

from __future__ import annotations

# Tags this module for the MCP server's optional group filter (DND_MCP_TOOLS_GROUP).
# When the combat-runner launcher sets the env var to "combat", only modules
# carrying "combat" in MCP_GROUPS are loaded — massive cold-start speed-up
# because heavy unrelated modules (lore, etc.) are skipped entirely.
MCP_GROUPS = ["combat", "all"]

import asyncio
import json
import os
import re
import struct
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import requests

# (Combat-action specs are now stored in `combat-runner/actions.jsonl` and
# accessed via the `combat_actions_db` module — see `_execute_combat_action_async`
# below. No registry env var needed; the launcher writes the DB and the MCP
# server reads it directly.)

_REPO_ROOT = Path(__file__).resolve().parents[1]

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=_REPO_ROOT / ".env", override=False)
except ImportError:
    pass


def _confined_log_path(log_path: str) -> Path:
    """Resolve a caller-supplied log path and assert it stays inside the repo.

    Combat logs legitimately only ever live under the repo (world/,
    combat-runner/, etc.). Rejecting absolute escapes and ../ traversal stops
    an LLM-typo'd or injected path from writing junk anywhere on disk. The
    path must also end in `.md`. Raises ValueError on a bad path."""
    raw = Path(log_path)
    p = (raw if raw.is_absolute() else _REPO_ROOT / raw).resolve()
    if p != _REPO_ROOT and _REPO_ROOT not in p.parents:
        raise ValueError(f"log_path must stay inside the repo: {log_path!r}")
    if p.suffix.lower() != ".md":
        raise ValueError(f"log_path must be a .md file: {log_path!r}")
    return p


_RO_LOCAL = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": False,
}

# Read-write annotation: tools that append to a file on disk. roll_dice uses
# this (not _RO_LOCAL) because with description+log_path set it writes a log
# line — not read-only, not idempotent (each call appends).
_RW_LOCAL = {
    "readOnlyHint": False,
    "destructiveHint": False,
    "idempotentHint": False,
    "openWorldHint": False,
}

# Unicode codepoints mapped to dice glyphs. We hijack rarely-used Wide
# pictographs (U+1F518–U+1F51D — RADIO BUTTON / BACK / END / ON / SOON / TOP)
# because they're East Asian Width=Wide so terminals give them a 2-cell box,
# which matches our 1em-square bitmap. (Previously used Alchemical Symbols
# U+1F700+ which are EAW=Neutral and rendered incorrectly in xterm.js.)
# Claude Code's TUI strips PUA codepoints (issue #49270) but renders these
# via normal font fallback when 'DnD Dice' is first in the terminal's fontFamily.
_DICE_GLYPHS: dict[int, str] = {
    4: chr(0x1F518),    # d4
    6: chr(0x1F519),    # d6
    8: chr(0x1F51A),    # d8
    10: chr(0x1F51B),   # d10
    12: chr(0x1F51C),   # d12
    20: chr(0x1F51D),   # d20
    100: chr(0x1F51B) + chr(0x1F51B),  # d100 = two d10 glyphs side-by-side
}

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
                "type": "uint16",
                "length": count,
            },
            headers={
                "x-api-key": api_key,
            },
        )
        response.raise_for_status()
        data = response.json()
        _last_fetch_time = time.time()
        return data.get("data", [])
    except (httpx.HTTPError, httpx.TimeoutException, ValueError, KeyError) as exc:
        # Narrow to network/parse faults — a bare `except Exception` would mask
        # real bugs (typos, changed API shape) as "network down".
        sys.stderr.write(
            f"[dnd_roller] quantum fetch failed, falling back: {exc!r}\n"
        )
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
    except (requests.RequestException, ValueError) as exc:
        # ValueError covers int() on a non-numeric body (random.org error/quota
        # HTML page) — an expected upstream-degradation case. Narrowed from a
        # bare `except Exception` so real bugs surface instead of being masked.
        sys.stderr.write(f"[dnd_roller] random.org fetch failed: {exc!r}\n")
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
    """Return the dice glyph for a die size, falling back to a plain 'dN' label."""
    if dice_size in _DICE_GLYPHS:
        return _DICE_GLYPHS[dice_size]
    return f"d{dice_size}"


def _dice_code_for_size(dice_size: int) -> str | None:
    """Return a human-readable Unicode code reference for the die's primary glyph,
    or None if the die has no glyph mapping (e.g., a future die added before its image).
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


def _append_log_entry(log_path: str, description: str, narrative: str) -> None:
    r"""Append a structured roll entry to a Markdown log file. Best-effort.

    Format: ``- `YYYY-MM-DD HH:MM:SS` — **<description>** — <narrative>``
    The narrative already includes the total (e.g. ` = 44`), so we don't
    re-append it. Creates parent directory and a header line if the file is fresh.
    Never raises — logging failures must not break a roll.
    """
    from datetime import datetime as _dt
    try:
        p = _confined_log_path(log_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        fresh = not p.exists() or p.stat().st_size == 0
        ts = _dt.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(p, "a", encoding="utf-8") as f:
            if fresh:
                f.write("# Combat log\n\n")
            f.write(f"- `{ts}` — **{description}** — {narrative}\n")
    except (OSError, ValueError):
        pass


async def _roll_dice_async(
    num_dice: int,
    dice_size: int,
    bonuses: list[int] | None = None,
    modifier: int = 0,
    description: str | None = None,
    log_path: str | None = None,
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

    narrative = _build_narrative(
        dice_size=dice_size,
        rolls=rolls,
        bonuses=bonuses_list,
        modifier=modifier,
        total=total_with_bonuses,
        source=source,
    )

    # Auto-log if both description and log_path are provided.
    logged = False
    if description and log_path:
        _append_log_entry(log_path, description, narrative)
        logged = True

    return {
        "narrative": narrative,
        "source": source,
        "rolls": rolls,
        "bonuses": bonuses_list,
        "rolls_with_bonuses": rolls_with_bonuses,
        "modifier": modifier,
        "total_raw": total_raw,
        "total_with_bonuses": total_with_bonuses,
        "dice_code": _dice_code_for_size(dice_size),
        "dice_notation": _build_dice_notation(num_dice, dice_size, modifier),
        "logged": logged,
    }


def roll_dice(
    num_dice: int,
    dice_size: int,
    bonuses: list[int] | None = None,
    modifier: int = 0,
    description: str | None = None,
    log_path: str | None = None,
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
        description: Optional context for this roll (e.g., "Multiattack on Brann").
            When passed with log_path, the roll auto-appends to the log file.
        log_path: Optional path to a Markdown log file. When passed with
            description, the roll is logged as a timestamped entry. Logging is
            best-effort and never breaks the roll.

    Returns:
        JSON string with: narrative, source, rolls, bonuses, rolls_with_bonuses,
        total_raw, total_with_bonuses, dice_code, dice_notation, logged.
    """
    result = asyncio.run(
        _roll_dice_async(num_dice, dice_size, bonuses, modifier, description, log_path)
    )
    return json.dumps(result, indent=2, ensure_ascii=False)


def log_combat_event(
    log_path: str,
    description: str,
    kind: str | None = None,
    details: str | None = None,
) -> str:
    r"""Append a non-roll combat event (monster death, phase change, DM note, etc.)
    to a Markdown log file. Best-effort — never raises.

    Format: ``- `YYYY-MM-DD HH:MM:SS` — [<kind>] **<description>** — <details>``
    Creates the parent directory and a `# Combat log` header on first write.

    Args:
        log_path: Absolute path to the encounter's log file.
        description: Short event summary (e.g. "Glacier Stalker bloodied").
        kind: Optional event tag for structured filtering ("death", "note",
            "phase", "turn-start", "event", etc.).
        details: Optional longer detail appended after the description.

    Returns: JSON object with `logged` (bool) and either `path` or `error`.
    """
    from datetime import datetime as _dt
    try:
        p = _confined_log_path(log_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        fresh = not p.exists() or p.stat().st_size == 0
        ts = _dt.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix = f"[{kind}] " if kind else ""
        suffix = f" — {details}" if details else ""
        with open(p, "a", encoding="utf-8") as f:
            if fresh:
                f.write("# Combat log\n\n")
            f.write(f"- `{ts}` — {prefix}**{description}**{suffix}\n")
        return json.dumps({"logged": True, "path": str(p)})
    except (OSError, ValueError) as e:
        return json.dumps({"logged": False, "error": str(e)})


# ───────────────────────── combat-action runner ─────────────────────────
# A "combat action" is a structured spec stored in `combat-runner/actions.jsonl`
# (a flat JSONL DB; see scripts/combat_actions_db.py). The launcher prepares a
# "Ready actions" reference at boot from the DB and injects it into Haiku's
# system prompt. At the table, Haiku calls roll_combat_action and the dispatcher
# below executes every roll in-process (one MCP call), returning a formatted reply.
# Authoring is via combat_action_upsert / combat_actions_list (Opus path).

# Import the DB module by path (sibling file in scripts/).
from importlib import import_module as _import_module
import sys as _sys
from pathlib import Path as _Path
_SCRIPTS_DIR = _Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in _sys.path:
    _sys.path.insert(0, str(_SCRIPTS_DIR))
combat_actions_db = _import_module("combat_actions_db")

# 'NdM' with no leading zeros — the regex itself rejects '0d6', '03d06', etc.
_DICE_RE = re.compile(r"^\s*([1-9]\d*)\s*[dD]\s*([1-9]\d*)\s*$")


def _parse_dice_spec(spec: str) -> tuple[int, int]:
    """Parse 'NdM' notation into (num, size), enforcing the runner's bounds.

    Count must be 1-100; die size must be a standard die (4/6/8/10/12/20/100).
    Rejects '0d6', '2d0', '1000d6', '2d5', leading zeros, and non-NdM garbage
    at parse time rather than crashing one layer deeper in _roll_dice_async."""
    m = _DICE_RE.match(spec)
    if not m:
        raise ValueError(f"Invalid dice spec: {spec!r} (expected 'NdM', e.g. '2d6')")
    num, size = int(m.group(1)), int(m.group(2))
    if not (1 <= num <= 100):
        raise ValueError(f"Invalid dice spec {spec!r}: count must be 1-100, got {num}")
    if size not in (4, 6, 8, 10, 12, 20, 100):
        raise ValueError(
            f"Invalid dice spec {spec!r}: die size must be one of "
            f"4/6/8/10/12/20/100, got d{size}"
        )
    return num, size


async def _execute_combat_action_async(
    npc: str,
    action_name: str,
    spec: dict,
    log_path: str | None,
) -> dict:
    """Execute a structured action spec; return formatted reply + metadata."""
    action_type = spec.get("type", "single_attack")
    narration = spec.get("narration", "")
    prereq = spec.get("prerequisite")
    pre_save = spec.get("pre_save")

    lines: list[str] = []
    title = action_name.replace("_", " ").title()

    # Structured roll metadata for non-MCP callers (e.g. the combat-runner GUI's
    # didn't-land lifecycle). The Markdown `output` is unchanged — this is an
    # additive sidecar. Populated per-branch below; an empty dict means the
    # action carried no rolled damage / save (auto-hit utility, etc.).
    rolls: dict = {}

    # Header line
    if "range" in spec:
        lines.append(f"**{title}** — range {spec['range']}")
    elif "area" in spec:
        lines.append(f"**{title}** ({spec['area']})")
    else:
        lines.append(f"**{title}**")
    lines.append("")

    if prereq:
        lines.append(f"_Prereq:_ {prereq}")
        lines.append("")

    # Surface `slots` charge tracking. The MCP runner has no persistent
    # per-encounter state to decrement, so it cannot auto-track charges — but
    # it must not silently drop the field either. Print a visible reminder so
    # the DM tracks the count by hand.
    slots = spec.get("slots")
    if isinstance(slots, dict) and "count" in slots:
        lines.append(
            f"_(Limited use — {slots['count']} charge(s), refresh "
            f"{slots.get('refresh', '?')}. Track by hand: mark one used.)_"
        )
        lines.append("")

    if pre_save:
        lines.append(f"[ASKING PLAYER: {pre_save}]")
        lines.append("")

    # ── attack-style (multiattack or single) ──
    if action_type in ("multiattack", "single_attack"):
        attacks = spec.get("attacks", [])
        if not attacks:
            return {"error": "no attacks defined for this action"}

        # ONE batched to-hit roll for all attacks
        to_hit_bonuses = [int(a.get("to_hit_bonus", 0)) for a in attacks]
        to_hit_result = await _roll_dice_async(
            num_dice=len(attacks),
            dice_size=20,
            bonuses=to_hit_bonuses,
            modifier=0,
            description=f"{npc} {action_name} to-hits",
            log_path=log_path,
        )

        # One damage roll per attack — fire them concurrently with asyncio.gather.
        # Each await calls _pop_numbers which contends a single fetch lock, but
        # under a warm in-memory cache that's a fast critical section; gather
        # still wins ~50-200ms per multiattack vs. sequential await.
        async def _roll_attack_damage(atk: dict) -> dict:
            num, size = _parse_dice_spec(atk["damage"])
            mod = int(atk.get("damage_modifier", 0))
            base = await _roll_dice_async(
                num_dice=num,
                dice_size=size,
                bonuses=None,
                modifier=mod,
                description=f"{npc} {atk['name']} damage",
                log_path=log_path,
            )
            # Optional `extra_damage: {dice, modifier?, type}` rider — roll it,
            # fold the result into the attack's total, and stash it for the
            # output loop so the DM sees the breakdown.
            extra = atk.get("extra_damage")
            if isinstance(extra, dict) and "dice" in extra:
                en, es = _parse_dice_spec(extra["dice"])
                ex = await _roll_dice_async(
                    num_dice=en,
                    dice_size=es,
                    bonuses=None,
                    modifier=int(extra.get("modifier", 0)),
                    description=f"{npc} {atk['name']} extra damage",
                    log_path=log_path,
                )
                base = {
                    **base,
                    "total_with_bonuses": base["total_with_bonuses"]
                    + ex["total_with_bonuses"],
                    "extra_damage": ex,
                    "extra_damage_type": extra.get("type", ""),
                }
            return base

        damage_results: list[dict] = await asyncio.gather(
            *(_roll_attack_damage(a) for a in attacks)
        )

        # Structured sidecar: an attack-roll action lands 0 until confirmed
        # `hit`. `damage_total` is the sum of every attack's rolled damage.
        rolls = {
            "kind": "attack",
            "damage_total": sum(d["total_with_bonuses"] for d in damage_results),
            "on_save": "none",
        }

        # Compact paired table — per-attack rider inlined ("if HIT: DC 15 ...")
        # so the DM sees the conditional save right next to the to-hit it depends on.
        lines.append("```")
        for i, atk in enumerate(attacks):
            to_hit = to_hit_result["rolls_with_bonuses"][i]
            dmg_res = damage_results[i]
            dmg_total = dmg_res["total_with_bonuses"]
            dmg_type = atk.get("damage_type", "")
            extra_res = dmg_res.get("extra_damage")
            if extra_res:
                etype = dmg_res.get("extra_damage_type", "")
                base_dmg = dmg_total - extra_res["total_with_bonuses"]
                line = (
                    f"{atk['name']:<10s} to-hit {to_hit:>3d} / dmg"
                    f" {base_dmg} {dmg_type} +{extra_res['total_with_bonuses']} {etype}"
                    f" = {dmg_total} total"
                )
            else:
                line = f"{atk['name']:<10s} to-hit {to_hit:>3d} / dmg {dmg_total:>3d} {dmg_type}"
            if atk.get("rider_on_hit"):
                line += f"   → if HIT: {atk['rider_on_hit']}"
            lines.append(line)
        lines.append("```")

        # apply_condition_on_hit riders — the runner can't roll PC saves, so
        # emit a clear DM-instruction line per attack that carries one.
        for atk in attacks:
            cfg = atk.get("apply_condition_on_hit")
            if isinstance(cfg, dict):
                dur = cfg.get("duration_rounds")
                dur_str = f" for {dur} round(s)" if dur else ""
                lines.append(
                    f"[ASK PLAYER: on a HIT, {atk['name']} target rolls a "
                    f"DC {cfg.get('save_dc', '?')} "
                    f"{str(cfg.get('save_ability', '?')).upper()} save — "
                    f"on fail, apply {cfg.get('condition', '?')}{dur_str}]"
                )

        # Verbatim quantum narratives — DM can visually confirm the ⚛️ marker
        # appears (proves rolls came from the quantum source, not random.org
        # fallback). The dice glyphs use the custom DnD-dice font and are
        # readable when that font is the terminal's primary fontFamily.
        lines.append(f"_to-hits:_ {to_hit_result['narrative']}")
        for i, atk in enumerate(attacks):
            lines.append(f"_{atk['name']} dmg:_ {damage_results[i]['narrative']}")
            extra_res = damage_results[i].get("extra_damage")
            if extra_res:
                lines.append(
                    f"_{atk['name']} extra dmg:_ {extra_res['narrative']}"
                )

        if narration:
            lines.append("")
            lines.append(f"*{narration}*")

    # ── area / save-based ──
    elif action_type == "area":
        damage = spec.get("damage", {})
        save = spec.get("save", {})
        num, size = _parse_dice_spec(damage["dice"])
        mod = int(damage.get("modifier", 0))
        dmg = await _roll_dice_async(
            num_dice=num,
            dice_size=size,
            modifier=mod,
            description=f"{npc} {action_name} damage",
            log_path=log_path,
        )
        full = dmg["total_with_bonuses"]
        on_save = save.get("on_save", "half")
        savers_take = full // 2 if on_save == "half" else 0

        rolls = {
            "kind": "save",
            "damage_total": full,
            "damage_type": damage.get("type", ""),
            "on_save": on_save,
            "save_dc": save.get("dc"),
            "save_ability": save.get("ability"),
        }

        lines.append(f"Damage: **{full} {damage.get('type', '')}**  ({dmg['narrative']})")
        lines.append("")
        lines.append(
            f"[ASKING PLAYER: each creature in {spec.get('area', 'area')} rolls "
            f"DC {save.get('dc', '?')} {save.get('ability', '?')} save — "
            f"failers take {full}, savers take {savers_take}]"
        )
        if save.get("notes"):
            lines.append(f"_(DM: {save['notes']})_")
        if "recharge" in spec:
            lines.append("")
            lines.append(
                f"_(Mark {action_name} USED — recharge die at start of next "
                f"turn, recovers on {spec['recharge']}+)_"
            )
        lines.append("")
        if narration:
            lines.append(f"*{narration}*")

    # ── utility (single non-attack roll OR no-roll buff/instant effect) ──
    elif action_type == "utility":
        roll = spec.get("roll")
        effect = spec.get("effect")
        if isinstance(roll, dict) and "dice" in roll:
            # Roll path: NPC makes a check (Stealth, Counterspell ability check, etc.)
            num, size = _parse_dice_spec(roll["dice"])
            mod = int(roll.get("modifier", 0))
            result = await _roll_dice_async(
                num_dice=num,
                dice_size=size,
                modifier=mod,
                description=f"{npc} {action_name}: {roll.get('label', 'roll')}",
                log_path=log_path,
            )
            lines.append(
                f"{roll.get('label', 'Result')}: **{result['total_with_bonuses']}**"
                f"  ({result['narrative']})"
            )
            if "notes" in roll:
                lines.append("")
                lines.append(f"_{roll['notes']}_")
        elif isinstance(effect, str) and effect.strip():
            # No-roll path: buff or instantaneous effect (Mage Armor, Shield,
            # Misty Step, etc.). Just print the effect and the narration.
            lines.append(effect.strip())
        else:
            return {"error": "utility action has neither roll.dice nor effect text"}
        lines.append("")
        if narration:
            lines.append(f"*{narration}*")

    # ── reaction (auto-trigger; damage rolled upfront, attacker saves) ──
    elif action_type == "reaction":
        # reaction_kind ∈ {damage, movement, buff}. movement/buff carry no
        # damage block — just print the effect, mirroring the utility no-roll
        # path. (validate_spec accepts these; the runner must honor them.)
        reaction_kind = spec.get("reaction_kind", "damage")
        if reaction_kind in ("movement", "buff"):
            effect = spec.get("effect", "")
            if isinstance(effect, str) and effect.strip():
                lines.append(effect.strip())
            lines.append("")
            lines.append(
                f"_(Reaction USED — refreshes at start of {npc}'s next turn)_"
            )
            lines.append("")
            if narration:
                lines.append(f"*{narration}*")
            return {
                "output": "\n".join(lines),
                "action_type": action_type,
                "logged": log_path is not None,
                "rolls": rolls,
            }

        damage = spec.get("damage", {})
        save = spec.get("attacker_save", {})
        num, size = _parse_dice_spec(damage["dice"])
        mod = int(damage.get("modifier", 0))
        dmg = await _roll_dice_async(
            num_dice=num,
            dice_size=size,
            modifier=mod,
            description=f"{npc} {action_name} damage",
            log_path=log_path,
        )
        rolls = {
            "kind": "save",
            "damage_total": dmg["total_with_bonuses"],
            "damage_type": damage.get("type", ""),
            "on_save": save.get("on_save", "no damage"),
            "save_dc": save.get("dc"),
            "save_ability": save.get("ability"),
        }
        lines.append(
            f"Damage rolled: **{dmg['total_with_bonuses']} {damage.get('type', '')}**"
            f"  ({dmg['narrative']})"
        )
        lines.append("")
        lines.append(
            f"[ASKING PLAYER: attacker rolls DC {save.get('dc', '?')} "
            f"{save.get('ability', '?')} save — fail = full damage, "
            f"success = {save.get('on_save', 'no damage')}]"
        )
        lines.append("")
        lines.append(f"_(Reaction USED — refreshes at start of {npc}'s next turn)_")
        lines.append("")
        if narration:
            lines.append(f"*{narration}*")

    else:
        return {"error": f"unknown action type: {action_type!r}"}

    return {
        "output": "\n".join(lines),
        "action_type": action_type,
        "logged": log_path is not None,
        "rolls": rolls,
    }


def roll_combat_action(
    npc: str,
    action: str,
    log_path: str | None = None,
) -> str:
    """Run a structured combat action for an NPC in one MCP call.

    Looks up the action in `combat-runner/actions.jsonl` (flat DB). `action` can
    be the action name OR a verb (resolved via the action's `verbs` list).

    Returns: JSON with `output` (Markdown reply, print verbatim), `action_type`,
    `logged`, `resolved_action`, and `rolls` (structured roll sidecar for the
    GUI's didn't-land lifecycle — `{kind, damage_total, on_save, ...}`, or `{}`
    for a no-roll action). On error: JSON with `error` and helpful diagnostic
    fields (available_npcs / available_actions / verb_index).
    """
    record = combat_actions_db.get(npc, action)
    if record is None:
        # Build helpful diagnostics
        all_records = combat_actions_db.read_all()
        available_npcs = sorted({r.get("npc") for r in all_records if r.get("npc")})
        if npc not in available_npcs:
            return json.dumps({
                "error": f"NPC '{npc}' not in actions DB",
                "available_npcs": available_npcs,
            })
        npc_actions = [r for r in all_records if r.get("npc") == npc]
        return json.dumps({
            "error": f"Action or verb '{action}' not found for {npc}",
            "available_actions": sorted(r.get("action") for r in npc_actions),
            "verb_index": {r.get("action"): r.get("verbs", []) for r in npc_actions},
        })

    resolved = record["action"]
    # Build the spec dict from the record (drop bookkeeping fields)
    spec = {k: v for k, v in record.items() if k not in ("npc", "action", "updated_at")}
    try:
        result = asyncio.run(_execute_combat_action_async(npc, resolved, spec, log_path))
        result["resolved_action"] = resolved
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        # Full traceback to stderr only (captured by the MCP host's logs); the
        # client gets a clean, path-free message — a traceback in the tool
        # result leaks abs paths and burns ~1k tokens mid-combat.
        import traceback
        sys.stderr.write(
            f"[roll_combat_action] {npc}/{resolved} failed:\n"
            f"{traceback.format_exc()}\n"
        )
        return json.dumps({
            "error": (
                f"roll_combat_action failed for {npc}/{resolved}: {e}. "
                f"The stored spec is malformed — re-author it with "
                f"combat_action_upsert (check dice strings are 'NdM')."
            ),
        })


def combat_action_upsert(npc: str, action: str, spec: dict) -> str:
    """Add or replace one (npc, action) entry in the actions DB.

    Validates the spec; raises ValueError on bad input. Persists atomically.
    Returns JSON with `ok`, `npc`, `action`, `updated_at`. On error: JSON with `error`.
    """
    try:
        record = combat_actions_db.upsert(npc, action, spec)
        return json.dumps({
            "ok": True,
            "npc": record["npc"],
            "action": record["action"],
            "updated_at": record["updated_at"],
        })
    except (ValueError, TypeError, AttributeError, KeyError) as e:
        return json.dumps({"ok": False, "error": str(e)})


def combat_actions_list(
    npc: str | None = None,
    npcs: list[str] | None = None,
) -> str:
    """List action summaries from the DB.

    Filter by single npc, or by a list of npc slugs (encounter use case). Returns
    lightweight summaries — verbs, narration preview, type, range/area/recharge —
    not the full attack/damage spec. Use `roll_combat_action` to execute.
    """
    summaries = combat_actions_db.list_actions(npc=npc, npcs=npcs)
    return json.dumps({"count": len(summaries), "actions": summaries}, ensure_ascii=False)


# Initialize cache on module load
_load_cache()


MCP_TOOLS = [
    {
        "name": "roll_dice",
        "description": (
            "Roll D&D dice and return a JSON object with a 'narrative' field plus a structured "
            "breakdown for verification.\n\n"
            "Begin your reply with the 'narrative' field VERBATIM — copy the exact characters, "
            "including any leading symbols and the dice glyphs between the parentheses. "
            "Do not paraphrase or describe what the leading symbol means; just include it as-is. "
            "After the narrative you may add commentary if it adds value.\n\n"
            "BONUSES vs MODIFIER:\n"
            "  - bonuses=[2,3,4]: per-die bonuses, one per roll. e.g., two attacks with +3 and +5: "
            "bonuses=[3, 5].\n"
            "  - modifier=5: flat bonus added to the final total only.\n"
            "  - Both can combine: roll_dice(3, 6, bonuses=[2,2,2], modifier=1) for a sneak-attack "
            "damage style roll.\n\n"
            "Supports d4, d6, d8, d10, d12, d20, d100."
        ),
        # roll_dice writes to disk when description+log_path are supplied
        # (see _append_log_entry) — not read-only / not idempotent in that mode.
        "annotations": {"title": "Roll D&D Dice (Quantum + Custom Font)", **_RW_LOCAL},
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
                "description": {
                    "type": "string",
                    "description": (
                        "Optional human-readable context for this roll, e.g. 'Multiattack on Brann (AC 18)' "
                        "or 'Glacial Roar damage'. When provided alongside log_path, the roll is appended "
                        "as a timestamped Markdown bullet to the log file, freeing the LLM from having to "
                        "Write a log entry separately. Use this on every action roll to build an automatic "
                        "session log. Skip for administrative rolls (recharge dice, passive stealth)."
                    ),
                },
                "log_path": {
                    "type": "string",
                    "description": (
                        "Optional path to a Markdown log file inside the repo. When provided alongside "
                        "description, the roll is appended as `- \\`<timestamp>\\` — **<description>** — "
                        "<narrative>` (the narrative already contains ` = <total>`). The file's parent "
                        "directory is created if missing; a `# Combat log` header is added on first write. "
                        "Logging is best-effort — failures never break the roll."
                    ),
                },
            },
            "required": ["num_dice", "dice_size"],
            "additionalProperties": False,
        },
    },
    {
        "name": "log_combat_event",
        "description": (
            "Append a non-roll combat event to a Markdown log file. Use for monster deaths, "
            "phase transitions (bloodied, enraged, fleeing), DM notes, or anything worth "
            "recording in the encounter log that isn't a dice roll. Rolls themselves should "
            "use roll_dice with the description+log_path args (which auto-logs the roll). "
            "This tool is for everything else.\n\n"
            "Format: appends a timestamped Markdown bullet to the log file. Creates parent "
            "directory and a `# Combat log` header on first write. Best-effort — failures "
            "never break the call."
        ),
        "annotations": {"title": "Log Combat Event", **_RW_LOCAL},
        "input_schema": {
            "type": "object",
            "properties": {
                "log_path": {
                    "type": "string",
                    "description": (
                        "Absolute path to the encounter's Markdown log file. The combat-runner "
                        "launcher provides this in the encounter's Memory section."
                    ),
                },
                "description": {
                    "type": "string",
                    "description": (
                        "Short event description, e.g. 'Glacier Stalker bloodied', 'Stalker flees', "
                        "'Players notice the snowdrift wobble'."
                    ),
                },
                "kind": {
                    "type": "string",
                    "description": (
                        "Optional event tag for structured filtering: 'death', 'note', 'phase', "
                        "'turn-start', 'session-start', 'session-end', 'event'."
                    ),
                },
                "details": {
                    "type": "string",
                    "description": (
                        "Optional longer detail string. Appended after the description, separated "
                        "by an em-dash."
                    ),
                },
            },
            "required": ["log_path", "description"],
            "additionalProperties": False,
        },
    },
]


MCP_TOOLS.append({
    "name": "roll_combat_action",
    "description": (
        "Run a pre-defined combat action for an NPC in a SINGLE MCP call. Action specs live "
        "in `combat-runner/actions.jsonl` (flat JSONL DB); this tool looks up the requested "
        "(npc, action) row and executes every roll (attacks, damage, saves, reactions, "
        "recharge tracking) in one shot, then returns a fully-formatted Markdown reply ready "
        "to print verbatim.\n\n"
        "Prefer this over multiple `roll_dice` calls when running an NPC turn — it's faster "
        "and the formatting is deterministic.\n\n"
        "ARGS:\n"
        "  npc: NPC slug (e.g. 'glacier-stalker').\n"
        "  action: Action name OR a verb the NPC's verb table maps to one (e.g. 'multiattack' "
        "or 'attack' or 'breath'). Verbs are resolved automatically via the per-action "
        "`verbs` list in the registry.\n"
        "  log_path: Optional log file path (provided by the launcher in the session "
        "context). When set, every internal roll auto-logs.\n\n"
        "RETURNS: JSON with `output` (Markdown reply — print this verbatim, the verbatim "
        "quantum narratives are already inside it), `action_type`, `logged`, "
        "`resolved_action`. On error: `error` plus `available_npcs` / `available_actions` / "
        "`verb_index` for diagnosis."
    ),
    "annotations": {"title": "Run Combat Action (preprocessed)", **_RW_LOCAL},
    "input_schema": {
        "type": "object",
        "properties": {
            "npc": {
                "type": "string",
                "description": "NPC slug (the filename stem of the NPC's .md file, e.g. 'glacier-stalker').",
            },
            "action": {
                "type": "string",
                "description": (
                    "Action name (e.g. 'multiattack', 'frozen_bile') OR a verb the NPC's "
                    "verb table maps to one (e.g. 'attack', 'breath', 'pounce'). The tool "
                    "resolves verbs automatically."
                ),
            },
            "log_path": {
                "type": "string",
                "description": (
                    "Optional log file path. When set, every internal roll is auto-logged "
                    "to it via the same pipeline as roll_dice."
                ),
            },
        },
        "required": ["npc", "action"],
        "additionalProperties": False,
    },
})


MCP_TOOLS.append({
    "name": "combat_action_upsert",
    "description": (
        "Add or replace a combat action in the actions DB (`combat-runner/actions.jsonl`). "
        "Use this from your authoring session (Opus) to define new NPC actions. The "
        "combat-runner launcher reads the DB at boot and injects a 'Ready actions' "
        "reference into the at-table Haiku session.\n\n"
        "ARGS:\n"
        "  npc: NPC slug (e.g. 'glacier-stalker'). Should match the NPC's .md file stem.\n"
        "  action: Action name in snake_case (e.g. 'multiattack', 'frozen_bile').\n"
        "  spec: The action specification dict. See `templates/npc-combat-runner-template.md` "
        "for the schema by action type. Required keys: `type` (one of multiattack, "
        "single_attack, area, utility, reaction), `narration`. Type-specific keys for "
        "attacks/damage/save/etc.\n\n"
        "RETURNS: JSON with `ok`, `npc`, `action`, `updated_at` on success. On validation "
        "failure: `ok: false` and `error` describing the problem."
    ),
    "annotations": {"title": "Upsert Combat Action (authoring)", **_RW_LOCAL},
    "input_schema": {
        "type": "object",
        "properties": {
            "npc": {"type": "string", "description": "NPC slug."},
            "action": {"type": "string", "description": "Action name (snake_case)."},
            "spec": {
                "type": "object",
                "description": "Action specification — see template for schema.",
            },
        },
        "required": ["npc", "action", "spec"],
        "additionalProperties": False,
    },
})


MCP_TOOLS.append({
    "name": "combat_actions_list",
    "description": (
        "List lightweight summaries of every action in the DB. Filter by a single NPC "
        "or a list of NPC slugs (the encounter use case). Returns verbs, narration "
        "preview, type, range/area/recharge — but NOT the full attack/damage spec. "
        "Use this from authoring sessions to inspect what's defined; for at-the-table "
        "execution, use `roll_combat_action`.\n\n"
        "ARGS:\n"
        "  npc: Optional single NPC slug filter.\n"
        "  npcs: Optional list of NPC slugs (e.g. all NPCs in an encounter).\n\n"
        "RETURNS: JSON with `count` and `actions` (list of summary dicts)."
    ),
    "annotations": {"title": "List Combat Actions (read-only)", **_RO_LOCAL},
    "input_schema": {
        "type": "object",
        "properties": {
            "npc": {"type": "string", "description": "Filter by single NPC slug."},
            "npcs": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Filter by a list of NPC slugs.",
            },
        },
        "required": [],
        "additionalProperties": False,
    },
})


MCP_HANDLERS = {
    "roll_dice": roll_dice,
    "log_combat_event": log_combat_event,
    "roll_combat_action": roll_combat_action,
    "combat_action_upsert": combat_action_upsert,
    "combat_actions_list": combat_actions_list,
}
