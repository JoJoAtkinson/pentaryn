#!/usr/bin/env python3
"""
Open5e v2 API integration for D&D 5e SRD content (and beyond).

Provides MCP tools for monsters, spells, items, conditions, rules, backgrounds,
species, feats, and a universal cross-type search. Uses /v2/ endpoints, which
include both the 2014 SRD (srd-2014) and the 2024 SRD 5.2 (srd-2024) — the
latter is the rules basis for D&D 5.5e.

Common source keys for the `source` parameter:
  srd-2024  → 2024 SRD 5.2 (5.5e). Default choice for current play.
  srd-2014  → 2014 SRD 5.1.
  tob       → Tome of Beasts (Kobold Press).
  a5e-ag    → Adventurer's Guide (Level Up: Advanced 5E).
  open5e    → Open5e Originals.

Import as: from scripts.srd5_2 import search_monsters, search_spells, etc.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Optional

import requests
from requests.adapters import HTTPAdapter
from requests_cache import CachedSession
from urllib3.util.retry import Retry


BASE_URL = "https://api.open5e.com"

_REPO_ROOT = Path(__file__).resolve().parents[1]
_CACHE_DIR = _REPO_ROOT / ".cache"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Bumping cache_name forces a fresh SQLite — old v1 responses are discarded
# automatically on first call after the v2 migration.
_CACHE_NAME = "srd5_2_v2"

_session: Optional[CachedSession] = None


def _get_session() -> CachedSession:
    global _session
    if _session is not None:
        return _session
    session = CachedSession(
        cache_name=str(_CACHE_DIR / _CACHE_NAME),
        backend="sqlite",
        expire_after=60 * 60 * 24 * 30,  # 30 days
        allowable_methods=("GET",),
    )
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=(500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    _session = session
    return session


def _api_get(endpoint: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """GET an open5e endpoint via the cached, retrying session."""
    url = f"{BASE_URL}{endpoint}"
    response = _get_session().get(url, params=params or {}, timeout=10)
    response.raise_for_status()
    return response.json()


def _build_query(
    *,
    name: Optional[str] = None,
    match: str = "partial",
    source: Optional[str] = None,
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Compose v2 query params, applied uniformly across search tools."""
    params: dict[str, Any] = {"limit": limit}
    if name:
        params["name__iexact" if match == "exact" else "name__icontains"] = name
    if source:
        params["document__key__in"] = source
    if fields:
        params["fields"] = fields
    if exclude:
        params["exclude"] = exclude
    if ordering:
        params["ordering"] = ordering
    if extra:
        params.update(extra)
    return params


# Default ranking when the caller doesn't pass `source`. No filter is applied —
# all sources are searched — but results are sorted in three tiers: `prefer`
# first, `demote` last, everything else in between. Combined with dedupe-keeping-
# first, this yields "latest canonical, third-party fallback, 2014 only if
# nothing else has it" without hiding obscure-source hits behind a hard filter.
@dataclass(frozen=True)
class PrioritySpec:
    prefer: tuple[str, ...] = ()
    demote: tuple[str, ...] = ()


DEFAULT_PRIORITY_SRD = PrioritySpec(prefer=("srd-2024",), demote=("srd-2014",))
DEFAULT_PRIORITY_CONDITIONS = PrioritySpec(prefer=("core", "a5e-ag"))


def _resolve_source(
    source: Optional[str], default: PrioritySpec
) -> tuple[Optional[str], PrioritySpec]:
    """Map the caller's `source` arg into (filter, priority_spec).
    - source=None        → no filter, default priority
    - source="" / whitespace / "," → no filter, no priority sort (raw API order)
    - source="x"         → filter to x (single-source spec, sort is a no-op)
    - source="x,y"       → filter to x,y; rank x first, y second (user order wins)
    """
    if source is None:
        return None, default
    keys = tuple(k.strip() for k in source.split(",") if k.strip())
    if not keys:
        return None, PrioritySpec()
    return source, PrioritySpec(prefer=keys)


def _doc_key(entry: dict[str, Any]) -> str:
    """Extract a source key from a result, handling both shapes open5e returns
    (nested {key, name, ...} object on creatures/spells; bare string on rules)."""
    doc = entry.get("document") if isinstance(entry, dict) else None
    if isinstance(doc, dict):
        return str(doc.get("key") or "")
    if isinstance(doc, str):
        return doc
    return ""


def _rank_by_spec(key: str, spec: PrioritySpec) -> tuple[int, int]:
    """3-tier rank: 0=prefer, 1=middle, 2=demote. Sub-rank preserves listed order
    within each tier so the sort is fully deterministic."""
    if key in spec.prefer:
        return (0, spec.prefer.index(key))
    if key in spec.demote:
        return (2, spec.demote.index(key))
    return (1, 0)


def _sort_by_priority(
    results: list[dict[str, Any]], spec: PrioritySpec
) -> list[dict[str, Any]]:
    """Stable sort by spec. Empty spec is a no-op (preserves API order)."""
    if not spec.prefer and not spec.demote:
        return list(results)
    return sorted(results, key=lambda item: _rank_by_spec(_doc_key(item), spec))


def _dedupe_by_name(
    results: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Stable dedupe keeping the first occurrence of each name (case-folded,
    trimmed). Items missing a name are kept (they can't be safely collapsed).
    Returns (kept, dropped_keys). Run *after* the priority sort so the surviving
    entry is the highest-priority one."""
    seen: set[str] = set()
    kept: list[dict[str, Any]] = []
    dropped: list[str] = []
    for item in results:
        if not isinstance(item, dict):
            kept.append(item)
            continue
        name = (item.get("name") or "").strip().casefold()
        if not name:
            kept.append(item)
            continue
        if name in seen:
            dropped.append(str(item.get("key") or ""))
            continue
        seen.add(name)
        kept.append(item)
    return kept, dropped


def _apply_priority_and_dedupe(
    response: dict[str, Any], spec: PrioritySpec, dedupe: bool
) -> dict[str, Any]:
    """Sort response.results by priority, then optionally dedupe by name. Returns
    a shallow copy with a new `results` list — never mutates the cached response.
    When dedupe drops items, their keys are surfaced as `dropped_variants` so the
    caller can still fetch them explicitly via the matching `get_*` tool."""
    if not isinstance(response, dict):
        return response
    results = response.get("results")
    if not isinstance(results, list):
        return response
    ranked = _sort_by_priority(results, spec)
    if not dedupe:
        return {**response, "results": ranked}
    kept, dropped = _dedupe_by_name(ranked)
    out = {**response, "results": kept}
    if dropped:
        out["dropped_variants"] = dropped
    return out


# --- Creatures (formerly v1 monsters) -----------------------------------------

def search_monsters(
    name: Optional[str] = None,
    cr: Optional[str] = None,
    type: Optional[str] = None,
    size: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    extra: dict[str, Any] = {}
    if cr is not None:
        extra["challenge_rating"] = cr
    if type:
        extra["type__key"] = type
    if size:
        extra["size__key"] = size
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit, extra=extra,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/creatures/", params), spec, dedupe)


def get_monster_details(key: str) -> dict[str, Any]:
    return _api_get(f"/v2/creatures/{key}/")


# --- Spells -------------------------------------------------------------------

def search_spells(
    name: Optional[str] = None,
    level: Optional[int] = None,
    school: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    extra: dict[str, Any] = {}
    if level is not None:
        extra["level"] = level
    if school:
        extra["school__key"] = school
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit, extra=extra,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/spells/", params), spec, dedupe)


def get_spell_details(key: str) -> dict[str, Any]:
    return _api_get(f"/v2/spells/{key}/")


# --- Conditions ---------------------------------------------------------------

def list_conditions(
    name: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    limit: int = 25,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_CONDITIONS)
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        limit=limit,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/conditions/", params), spec, dedupe)


# --- Magic items --------------------------------------------------------------

def search_magic_items(
    name: Optional[str] = None,
    rarity: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    extra: dict[str, Any] = {}
    if rarity:
        extra["rarity__key"] = rarity
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit, extra=extra,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/magicitems/", params), spec, dedupe)


def get_magic_item(key: str) -> dict[str, Any]:
    return _api_get(f"/v2/magicitems/{key}/")


# --- Mundane items / equipment -----------------------------------------------

def search_items(
    name: Optional[str] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    extra: dict[str, Any] = {}
    if category:
        extra["category__key"] = category
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit, extra=extra,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/items/", params), spec, dedupe)


def get_item(key: str) -> dict[str, Any]:
    return _api_get(f"/v2/items/{key}/")


# --- Classes ------------------------------------------------------------------

def search_classes(
    name: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/classes/", params), spec, dedupe)


def get_class_info(key: str) -> dict[str, Any]:
    return _api_get(f"/v2/classes/{key}/")


# --- Weapons / armor ---------------------------------------------------------

def search_weapons(
    name: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/weapons/", params), spec, dedupe)


def search_armor(
    name: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/armor/", params), spec, dedupe)


# --- Rules (formerly v1 sections) --------------------------------------------

def search_rules(
    query: str,
    source: Optional[str] = None,
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 5,
) -> dict[str, Any]:
    if not query or not str(query).strip():
        raise ValueError("search_rules requires a non-empty `query` keyword.")
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    params: dict[str, Any] = {"limit": limit, "search": query}
    if filter_source:
        params["document__key__in"] = filter_source
    if fields:
        params["fields"] = fields
    if exclude:
        params["exclude"] = exclude
    if ordering:
        params["ordering"] = ordering
    # Rule sections share generic names ("Combat", "Cover") across sources without
    # being true duplicates — sort by priority but never dedupe.
    return _apply_priority_and_dedupe(_api_get("/v2/rules/", params), spec, dedupe=False)


def get_rule_section(key: str) -> dict[str, Any]:
    return _api_get(f"/v2/rules/{key}/")


# --- Backgrounds / Species / Feats -------------------------------------------

def search_backgrounds(
    name: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/backgrounds/", params), spec, dedupe)


def get_background(key: str) -> dict[str, Any]:
    return _api_get(f"/v2/backgrounds/{key}/")


def search_species(
    name: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/species/", params), spec, dedupe)


def get_species(key: str) -> dict[str, Any]:
    return _api_get(f"/v2/species/{key}/")


def search_feats(
    name: Optional[str] = None,
    source: Optional[str] = None,
    match: str = "partial",
    fields: Optional[str] = None,
    exclude: Optional[str] = None,
    ordering: Optional[str] = None,
    limit: int = 10,
    dedupe: bool = True,
) -> dict[str, Any]:
    filter_source, spec = _resolve_source(source, DEFAULT_PRIORITY_SRD)
    params = _build_query(
        name=name, match=match, source=filter_source, fields=fields, exclude=exclude,
        ordering=ordering, limit=limit,
    )
    return _apply_priority_and_dedupe(_api_get("/v2/feats/", params), spec, dedupe)


def get_feat(key: str) -> dict[str, Any]:
    return _api_get(f"/v2/feats/{key}/")


# --- Class spell lists (only path: deprecated v1 endpoint, but still works) --

def get_spell_list(class_slug: str) -> dict[str, Any]:
    """Class -> list of spell slugs. Uses /v1/spelllist/ (v2 has no equivalent)."""
    return _api_get(f"/v1/spelllist/{class_slug}/")


# --- Universal cross-type search ---------------------------------------------

def search_srd(query: str, limit: int = 10) -> dict[str, Any]:
    """Search all object types in one call (/v2/search/). Returns mixed results
    with `object_model` indicating type and `highlighted` snippets."""
    return _api_get("/v2/search/", {"query": query, "limit": limit})


# --- Tool definitions for the MCP server -------------------------------------

# Common annotations for read-only, cached, external-API tools.
_RO_OPEN_WORLD = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": True,
}

# Reusable param descriptions for the SRD search tools.
_PARAM_SOURCE = {
    "type": "string",
    "description": (
        "Filter by source document key. Comma-separated values both filter AND "
        "set priority order — earlier sources are listed first in results. "
        "Default for SRD tools is 'srd-2024,srd-2014' (prefer 5.5e content, fall back "
        "to 5e 2014). Pass an empty string to disable the filter entirely (returns from "
        "all sources). Common keys: 'srd-2024', 'srd-2014', 'tob' (Tome of Beasts), "
        "'a5e-ag' (Level Up Adventurer's Guide), 'a5e-mm' (Monstrous Menagerie), 'open5e'."
    ),
}
_PARAM_MATCH = {
    "type": "string",
    "enum": ["partial", "exact"],
    "description": "Name match mode: 'partial' (default, case-insensitive substring) or 'exact'.",
    "default": "partial",
}
_PARAM_FIELDS = {
    "type": "string",
    "description": (
        "Comma-separated list of top-level fields to include in the response "
        "(server-side trim — useful for compact lookups). Example: 'key,name,challenge_rating,hit_points,armor_class'."
    ),
}
_PARAM_EXCLUDE = {
    "type": "string",
    "description": "Comma-separated list of top-level fields to exclude from the response.",
}
_PARAM_ORDERING = {
    "type": "string",
    "description": (
        "Sort by field name; prefix with '-' for descending. Examples: 'name', "
        "'-challenge_rating', 'level'."
    ),
}
_PARAM_LIMIT = {"type": "integer", "description": "Max results (default varies by tool).", "default": 10}
_PARAM_DEDUPE = {
    "type": "boolean",
    "description": (
        "When true (default), collapse same-name entries across sources, keeping the "
        "highest-priority one. Dropped keys are surfaced in the response's "
        "`dropped_variants` field so they remain reachable via the matching get_* tool. "
        "Pass false to see every variant (rarely needed; this tool is not designed for "
        "edition comparison)."
    ),
    "default": True,
}


def _common_search_value_flags() -> dict[str, str]:
    return {
        "name": "--name",
        "source": "--source",
        "match": "--match",
        "fields": "--fields",
        "exclude": "--exclude",
        "ordering": "--ordering",
        "limit": "--limit",
    }


MCP_TOOLS = [
    {
        "name": "search_monsters",
        "description": (
            "Search D&D creatures (/v2/creatures/) by name, CR, type, size, or source. "
            "Returns full stat blocks. Default behavior: searches all sources, ranks "
            "srd-2024 first, third-party (tob, a5e-ag, open5e) middle, srd-2014 last; "
            "same-name duplicates are collapsed (dropped keys surfaced in `dropped_variants`). "
            "NOT designed for edition comparison — for 2014 vs 2024 side-by-side, pass "
            "source='srd-2014,srd-2024' AND dedupe=false. "
            "Name match is partial by default; pass match='exact' for an exact name. "
            "If you already know the key (e.g., 'srd-2024_goblin-warrior'), use get_monster_details. "
            "Examples: search_monsters(cr='1/4', type='humanoid'); "
            "search_monsters(name='dragon', size='large', ordering='-challenge_rating')."
        ),
        "annotations": {"title": "Search Creatures (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_monsters"],
        "value_flags": {**_common_search_value_flags(), "cr": "--cr", "type": "--type", "size": "--size", "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Creature name (partial unless match='exact')."},
                "cr": {"type": "string", "description": "Challenge rating (e.g., '1', '1/2', '5')."},
                "type": {"type": "string", "description": "Creature type key (e.g., 'beast', 'dragon', 'undead')."},
                "size": {"type": "string", "description": "Size key: 'tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_monster_details",
        "description": (
            "Get one creature by exact key (e.g., 'srd-2024_goblin-warrior', 'tob_abominable-beauty'). "
            "Use after search_monsters to fetch a single full record fast. "
            "For fuzzy/partial-name lookup, use search_monsters."
        ),
        "annotations": {"title": "Get Creature Details (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_monster_details", "{key}"],
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Creature key (v2)."}},
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_spells",
        "description": (
            "Search spells (/v2/spells/) by name, level, school, or source. Returns full spell entries. "
            "Default behavior: searches all sources, ranks srd-2024 first, third-party "
            "(tob, a5e-ag, open5e) middle, srd-2014 last; same-name duplicates are collapsed "
            "(dropped keys surfaced in `dropped_variants`). NOT designed for edition comparison — "
            "for example, Fireball's damage formula differs between 2014 and 2024; default dedupe=true "
            "returns only the prefer-ranked one. For side-by-side, pass source='srd-2014,srd-2024' AND dedupe=false. "
            "Examples: search_spells(level=3, school='evocation'); search_spells(name='shield', match='exact')."
        ),
        "annotations": {"title": "Search Spells (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_spells"],
        "value_flags": {**_common_search_value_flags(), "level": "--level", "school": "--school", "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Spell name."},
                "level": {"type": "integer", "description": "Spell level (0=cantrip, 1-9)."},
                "school": {"type": "string", "description": "School key (evocation, abjuration, conjuration, divination, enchantment, illusion, necromancy, transmutation)."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_spell_details",
        "description": (
            "Get one spell by exact key (e.g., 'srd-2024_fireball', 'a5e-ag_fireball'). "
            "Use after search_spells when you have a key and want a fast single-record fetch."
        ),
        "annotations": {"title": "Get Spell Details (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_spell_details", "{key}"],
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Spell key (v2)."}},
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_conditions",
        "description": (
            "List conditions (/v2/conditions/). Pass `name` to filter (substring); omit for all. "
            "Standard 5e conditions (blinded, charmed, frightened, grappled, etc.) live under "
            "source='core' — there's no srd-2024 source for conditions; a5e-ag has extras like Bloodied. "
            "Default behavior: searches all sources, ranks core first then a5e-ag; same-name duplicates "
            "are collapsed (dropped keys surfaced in `dropped_variants`). "
            "Use during combat for quick condition-effect lookup."
        ),
        "annotations": {"title": "List Conditions (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "list_conditions"],
        "value_flags": {"name": "--name", "source": "--source", "match": "--match", "fields": "--fields", "exclude": "--exclude", "limit": "--limit", "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Filter by condition name (substring unless match='exact')."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "limit": {"type": "integer", "description": "Max results (default 25).", "default": 25},
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "search_magic_items",
        "description": (
            "Search magic items (/v2/magicitems/) by name, rarity, or source. "
            "Default behavior: searches all sources, ranks srd-2024 first, third-party "
            "(tob, a5e-ag, open5e) middle, srd-2014 last; same-name duplicates are collapsed "
            "(dropped keys surfaced in `dropped_variants`). Not for edition comparison. "
            "Examples: search_magic_items(rarity='legendary'); search_magic_items(name='cloak')."
        ),
        "annotations": {"title": "Search Magic Items (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_magic_items"],
        "value_flags": {**_common_search_value_flags(), "rarity": "--rarity", "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Item name."},
                "rarity": {"type": "string", "description": "Rarity key (common, uncommon, rare, very-rare, legendary, artifact)."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_magic_item",
        "description": "Get one magic item by exact key (e.g., 'srd-2024_adamantine-armor-breastplate').",
        "annotations": {"title": "Get Magic Item (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_magic_item", "{key}"],
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Magic item key."}},
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_items",
        "description": (
            "Search mundane items / equipment (/v2/items/) — not magic items. "
            "Filter by category (key) for armor/weapon/adventuring-gear etc. "
            "Default behavior: searches all sources, ranks srd-2024 first, third-party middle, "
            "srd-2014 last; same-name duplicates collapsed (dropped keys in `dropped_variants`). "
            "Not for edition comparison. "
            "Examples: search_items(name='rope'); search_items(category='adventuring-gear')."
        ),
        "annotations": {"title": "Search Mundane Items (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_items"],
        "value_flags": {**_common_search_value_flags(), "category": "--category", "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Item name."},
                "category": {"type": "string", "description": "Category key (e.g., 'weapon', 'armor', 'adventuring-gear')."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_item",
        "description": "Get one mundane item by exact key (e.g., 'srd-2024_acid').",
        "annotations": {"title": "Get Item (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_item", "{key}"],
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Item key."}},
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_classes",
        "description": (
            "Search classes & archetypes (/v2/classes/). Returns class features and progression. "
            "Default behavior: searches all sources, ranks srd-2024 first, third-party middle, "
            "srd-2014 last; same-name duplicates collapsed (dropped keys in `dropped_variants`). "
            "Use for character creation help."
        ),
        "annotations": {"title": "Search Classes (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_classes"],
        "value_flags": {**_common_search_value_flags(), "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Class name."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_class_info",
        "description": "Get one class by exact key (e.g., 'srd-2024_fighter'). Returns full features and progression.",
        "annotations": {"title": "Get Class Info (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_class_info", "{key}"],
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Class key."}},
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_weapons",
        "description": (
            "Search weapons (/v2/weapons/). Returns damage, properties, cost, weight. "
            "Default behavior: searches all sources, ranks srd-2024 first, third-party middle, "
            "srd-2014 last; same-name duplicates collapsed (dropped keys in `dropped_variants`)."
        ),
        "annotations": {"title": "Search Weapons (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_weapons"],
        "value_flags": {**_common_search_value_flags(), "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Weapon name."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "search_armor",
        "description": (
            "Search armor (/v2/armor/). Returns AC, weight, strength req, stealth disadvantage. "
            "Default behavior: searches all sources, ranks srd-2024 first, third-party middle, "
            "srd-2014 last; same-name duplicates collapsed (dropped keys in `dropped_variants`)."
        ),
        "annotations": {"title": "Search Armor (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_armor"],
        "value_flags": {**_common_search_value_flags(), "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Armor name."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "search_rules",
        "description": (
            "Search rules sections (/v2/rules/) by keyword. Includes 2014 AND 2024 SRD content "
            "(filter source='srd-2024' for 5.5e). "
            "If you already know the section key, use get_rule_section."
        ),
        "annotations": {"title": "Search Rules (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_rules"],
        "value_flags": {"query": "--query", "source": "--source", "fields": "--fields", "exclude": "--exclude", "ordering": "--ordering", "limit": "--limit"},
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term (e.g., 'grapple', 'opportunity attack', 'cover')."},
                "source": _PARAM_SOURCE,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": {"type": "integer", "description": "Max results (default 5).", "default": 5},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_rule_section",
        "description": "Get one rules section by exact key (e.g., 'srd-2024_d20-tests_ability-checks').",
        "annotations": {"title": "Get Rule Section (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_rule_section", "{key}"],
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Rule section key."}},
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_backgrounds",
        "description": (
            "Search character backgrounds (/v2/backgrounds/) — Acolyte, Sage, Soldier, etc. "
            "Default behavior: searches all sources, ranks srd-2024 first, third-party middle, "
            "srd-2014 last; same-name duplicates collapsed (dropped keys in `dropped_variants`)."
        ),
        "annotations": {"title": "Search Backgrounds (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_backgrounds"],
        "value_flags": {**_common_search_value_flags(), "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Background name."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_background",
        "description": "Get one background by exact key (e.g., 'a5e-ag_acolyte').",
        "annotations": {"title": "Get Background (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_background", "{key}"],
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Background key."}},
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_species",
        "description": (
            "Search character species (/v2/species/) — Elf, Dwarf, Human, etc. "
            "Replaces the v1 'races' endpoint. "
            "Default behavior: searches all sources, ranks srd-2024 first, third-party middle, "
            "srd-2014 last; same-name duplicates collapsed (dropped keys in `dropped_variants`)."
        ),
        "annotations": {"title": "Search Species (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_species"],
        "value_flags": {**_common_search_value_flags(), "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Species name."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_species",
        "description": "Get one species by exact key (e.g., 'srd-2024_elf').",
        "annotations": {"title": "Get Species (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_species", "{key}"],
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Species key."}},
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_feats",
        "description": (
            "Search feats (/v2/feats/) — Great Weapon Master, Lucky, etc. "
            "Default behavior: searches all sources, ranks srd-2024 first, third-party middle, "
            "srd-2014 last; same-name duplicates collapsed (dropped keys in `dropped_variants`)."
        ),
        "annotations": {"title": "Search Feats (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_feats"],
        "value_flags": {**_common_search_value_flags(), "dedupe": "--dedupe"},
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Feat name."},
                "source": _PARAM_SOURCE,
                "match": _PARAM_MATCH,
                "fields": _PARAM_FIELDS,
                "exclude": _PARAM_EXCLUDE,
                "ordering": _PARAM_ORDERING,
                "limit": _PARAM_LIMIT,
                "dedupe": _PARAM_DEDUPE,
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_feat",
        "description": "Get one feat by exact key (e.g., 'a5e-ag_ace-driver').",
        "annotations": {"title": "Get Feat (SRD/v2)", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_feat", "{key}"],
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string", "description": "Feat key."}},
            "required": ["key"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_spell_list",
        "description": (
            "Get all spell slugs available to a class (e.g., 'wizard', 'cleric', 'bard'). "
            "Returns a list of spell slugs you can chain into get_spell_details. "
            "Note: uses /v1/spelllist/ (deprecated, but only path) and v1-style spell slugs."
        ),
        "annotations": {"title": "Get Class Spell List", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "get_spell_list", "{class_slug}"],
        "input_schema": {
            "type": "object",
            "properties": {"class_slug": {"type": "string", "description": "Class slug (e.g., 'bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard')."}},
            "required": ["class_slug"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_srd",
        "description": (
            "Universal cross-type search (/v2/search/) — searches monsters, spells, items, rules, "
            "backgrounds, etc. all in one call. Best when you don't know which tool to use, "
            "or when checking whether a term exists in any category. "
            "Returns results with `object_model` indicating the type and `highlighted` snippets. "
            "Chain into the type-specific get_* tool using the returned `object_pk` as the key."
        ),
        "annotations": {"title": "Universal SRD Search", **_RO_OPEN_WORLD},
        "argv": ["--mcp-tool", "search_srd"],
        "value_flags": {"query": "--query", "limit": "--limit"},
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Free-text search across all D&D resources."},
                "limit": _PARAM_LIMIT,
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
]


# In-process dispatch: server.py imports this module, reads MCP_HANDLERS,
# and calls these directly (no subprocess startup, shared cached session).
MCP_HANDLERS = {
    "search_monsters": search_monsters,
    "get_monster_details": get_monster_details,
    "search_spells": search_spells,
    "get_spell_details": get_spell_details,
    "list_conditions": list_conditions,
    "search_magic_items": search_magic_items,
    "get_magic_item": get_magic_item,
    "search_items": search_items,
    "get_item": get_item,
    "search_classes": search_classes,
    "get_class_info": get_class_info,
    "search_weapons": search_weapons,
    "search_armor": search_armor,
    "search_rules": search_rules,
    "get_rule_section": get_rule_section,
    "search_backgrounds": search_backgrounds,
    "get_background": get_background,
    "search_species": search_species,
    "get_species": get_species,
    "search_feats": search_feats,
    "get_feat": get_feat,
    "get_spell_list": get_spell_list,
    "search_srd": search_srd,
}


# --- Subprocess fallback (kept for compatibility; in-process is preferred) ---

def _parse_flag_args(tokens: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if not token.startswith("--"):
            i += 1
            continue
        key = token[2:]
        if i + 1 < len(tokens) and not tokens[i + 1].startswith("--"):
            out[key] = tokens[i + 1]
            i += 2
        else:
            out[key] = True
            i += 1
    for int_key in ("limit", "level"):
        if int_key in out and isinstance(out[int_key], str):
            try:
                out[int_key] = int(out[int_key])
            except ValueError:
                pass
    # Boolean flags from CLI come in as strings; only explicit falsy values flip
    # to False (any unrecognized string stays truthy, matching the function default).
    for bool_key in ("dedupe",):
        if bool_key in out and isinstance(out[bool_key], str):
            out[bool_key] = out[bool_key].strip().lower() not in ("false", "0", "no", "off")
    return out


def main() -> int:
    if len(sys.argv) >= 3 and sys.argv[1] == "--mcp-tool":
        tool_name = sys.argv[2]
        handler = MCP_HANDLERS.get(tool_name)
        if handler is None:
            print(f"Error: Unknown tool: {tool_name}", file=sys.stderr)
            return 1
        try:
            single_arg_tools = {
                "get_monster_details": "key",
                "get_spell_details": "key",
                "get_magic_item": "key",
                "get_item": "key",
                "get_class_info": "key",
                "get_rule_section": "key",
                "get_background": "key",
                "get_species": "key",
                "get_feat": "key",
                "get_spell_list": "class_slug",
            }
            if tool_name in single_arg_tools:
                if len(sys.argv) < 4:
                    print(f"Error: {tool_name} requires an argument", file=sys.stderr)
                    return 1
                kwargs = {single_arg_tools[tool_name]: sys.argv[3]}
            else:
                rest = sys.argv[3:]
                if rest and rest[0].startswith("--"):
                    kwargs = _parse_flag_args(rest)
                elif rest:
                    try:
                        kwargs = json.loads(rest[0])
                    except json.JSONDecodeError as exc:
                        print(f"Error: Invalid JSON arguments: {exc}", file=sys.stderr)
                        return 1
                else:
                    kwargs = {}
            result = handler(**kwargs)
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0
        except requests.HTTPError as exc:
            print(f"API Error: {exc.response.status_code} - {exc.response.text}", file=sys.stderr)
            return 1
        except TypeError as exc:
            print(f"Error: Invalid arguments for {tool_name}: {exc}", file=sys.stderr)
            return 1
        except Exception as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1

    print("Usage: srd5_2.py --mcp-tool <tool_name> [args]", file=sys.stderr)
    print(f"Available tools: {', '.join(sorted(MCP_HANDLERS.keys()))}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
