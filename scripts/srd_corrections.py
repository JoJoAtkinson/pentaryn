"""House-rules + known-changed SRD entry loader.

Reads `scripts/srd_corrections.yml` and exposes:

  * `load_corrections() -> dict` — parse the YAML once, cached by mtime.
  * `warnings_for_upsert(action, spec) -> list[str]` — given an action name
    and the spec a caller is about to persist, return any advisory warnings
    based on expected_phrases / banned_phrases for that action.

NOT used by the MCP / SRD live path. Consumed ONLY by `combat_action_upsert`
so authoring sessions get nudged toward the right encoding without the
runtime path acquiring an opaque override layer.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

_CORRECTIONS_FILE = Path(__file__).resolve().parent / "srd_corrections.yml"

_cache: dict[str, Any] = {}
_cache_mtime: float | None = None


def _spec_text_blob(spec: dict) -> str:
    """Concatenate every user-visible text field of a spec into one lowercase
    string for phrase scanning. Covers narration, effect, prerequisite,
    roll.label, roll.notes, save.notes — wherever a 2014/2024 phrasing might
    hide."""
    parts: list[str] = []
    for key in ("narration", "effect", "prerequisite", "pre_save"):
        v = spec.get(key)
        if isinstance(v, str):
            parts.append(v)
    roll = spec.get("roll") or {}
    if isinstance(roll, dict):
        for key in ("label", "notes"):
            v = roll.get(key)
            if isinstance(v, str):
                parts.append(v)
    save = spec.get("save") or {}
    if isinstance(save, dict):
        for key in ("ability", "notes"):
            v = save.get(key)
            if isinstance(v, str):
                parts.append(v)
    return " | ".join(parts).lower()


def load_corrections() -> dict[str, Any]:
    """Return the parsed corrections dict. Re-reads only when the YAML mtime
    changes. Returns {} on missing/unreadable/empty file (corrections are
    optional — the absence of an entry just means no extra checks)."""
    global _cache, _cache_mtime
    if not _CORRECTIONS_FILE.exists():
        _cache = {}
        _cache_mtime = None
        return _cache
    try:
        mtime = _CORRECTIONS_FILE.stat().st_mtime
    except OSError:
        return _cache or {}
    if _cache_mtime == mtime and _cache:
        return _cache
    try:
        import yaml  # type: ignore
        with _CORRECTIONS_FILE.open(encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except ImportError:
        # Fallback: empty corrections. The user can install pyyaml; the live
        # path doesn't depend on this file so we never want to hard-fail.
        return {}
    except (OSError, ValueError):
        return _cache or {}
    if not isinstance(data, dict):
        data = {}
    _cache = data
    _cache_mtime = mtime
    return data


def warnings_for_upsert(action: str, spec: dict) -> list[str]:
    """Return advisory warnings for a row about to be upserted.

    Looks up `action` in the corrections file. If present, scans the spec's
    text fields for missing `expected_phrases` and present `banned_phrases`.
    Empty list = nothing to warn about (which is the common case — most
    actions are bespoke and have no SRD parent).
    """
    if not action:
        return []
    corrections = load_corrections()
    # Walk every section (spells, rules, …) — the corrections file is
    # structured by kind for readability, but the lookup is just by action.
    entry: dict[str, Any] | None = None
    for section in corrections.values():
        if isinstance(section, dict) and action in section:
            entry = section[action]
            break
    if not isinstance(entry, dict):
        return []

    blob = _spec_text_blob(spec)
    warnings: list[str] = []

    expected = entry.get("expected_phrases", []) or []
    for phrase in expected:
        if not isinstance(phrase, str):
            continue
        if phrase.lower() not in blob:
            warnings.append(
                f"correction[{action}]: missing expected phrase {phrase!r} "
                f"(2024 mechanic / house rule) — see scripts/srd_corrections.yml"
            )

    banned = entry.get("banned_phrases", []) or []
    for phrase in banned:
        if not isinstance(phrase, str):
            continue
        if phrase.lower() in blob:
            warnings.append(
                f"correction[{action}]: BANNED phrase {phrase!r} found in spec "
                f"— this looks like an outdated encoding "
                f"(see scripts/srd_corrections.yml)"
            )

    return warnings
