#!/usr/bin/env python3
"""
Local lore tools for the campaign vault.

Bridges the dnd-scripts MCP server to the repo content: NPCs, factions,
session notes, and free-text lore search. All in-process and mtime-cached
where useful.

Tools exposed:
  - search_npcs        — filter character-registry.tsv by name/race/origin/affiliation/type
  - get_npc            — registry row + linked markdown file (PCs and NPCs)
  - get_faction_overview — read world/factions/<slug>/_overview.md
  - last_session_summary — list all notes from the highest-numbered session
  - find_lore          — substring search across vault markdown (and TSV history)
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional


_REPO_ROOT = Path(__file__).resolve().parents[1]
_REGISTRY_PATH = _REPO_ROOT / "world" / "naming_conventions" / "character-registry.tsv"
_FACTIONS_DIR = _REPO_ROOT / "world" / "factions"
_PCS_DIR = _REPO_ROOT / "characters" / "player-characters"
_NPCS_DIR = _REPO_ROOT / "characters" / "npcs"
_SESSIONS_DIR = _REPO_ROOT / "sessions"


# --- Registry cache (mtime-checked) ------------------------------------------

@dataclass(frozen=True)
class NpcRow:
    name: str
    race: str
    pattern: str
    origin: str
    type: str
    notes: str

    def to_dict(self) -> dict[str, str]:
        return {
            "name": self.name, "race": self.race, "pattern": self.pattern,
            "origin": self.origin, "type": self.type, "notes": self.notes,
        }


_registry_cache: tuple[float, tuple[NpcRow, ...]] | None = None


def _load_registry() -> tuple[NpcRow, ...]:
    global _registry_cache
    try:
        mtime = _REGISTRY_PATH.stat().st_mtime
    except FileNotFoundError:
        return tuple()
    if _registry_cache is not None and _registry_cache[0] == mtime:
        return _registry_cache[1]
    rows: list[NpcRow] = []
    with _REGISTRY_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for raw in reader:
            rows.append(
                NpcRow(
                    name=(raw.get("Name") or "").strip(),
                    race=(raw.get("Race") or "").strip(),
                    pattern=(raw.get("Pattern") or "").strip(),
                    origin=(raw.get("Origin") or "").strip(),
                    type=(raw.get("Type") or "").strip(),
                    notes=(raw.get("Notes") or "").strip(),
                )
            )
    parsed = tuple(rows)
    _registry_cache = (mtime, parsed)
    return parsed


# --- Markdown helpers --------------------------------------------------------

_FRONTMATTER_RE = re.compile(r"^---\s*\n(?P<body>.*?)\n---\s*\n?", re.DOTALL)


def _split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Return (frontmatter_dict, body). Frontmatter dict is best-effort YAML-lite."""
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    fm: dict[str, Any] = {}
    for line in m.group("body").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        fm[key.strip()] = value.strip().strip('"').strip("'")
    return fm, text[m.end():]


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    return s


def _find_npc_file(name: str) -> Optional[Path]:
    """Search common NPC/PC locations for a markdown file matching this name."""
    slug = _slugify(name)
    if not slug:
        return None
    candidates: list[Path] = []
    # Player characters use first-name-last-name slugs but also <player>-<character>.md
    candidates.extend(_PCS_DIR.glob(f"*{slug}*.md"))
    candidates.extend(_NPCS_DIR.glob(f"{slug}.md"))
    candidates.extend(_REPO_ROOT.glob(f"world/factions/*/npcs/{slug}.md"))
    candidates.extend(_REPO_ROOT.glob(f"world/factions/*/npcs/**/{slug}.md"))
    candidates.extend(_REPO_ROOT.glob(f"world/factions/*/locations/*/npcs/{slug}.md"))
    # Skip narrative variants when a primary file is also present
    primary = [p for p in candidates if not p.name.endswith(".narrative.md")]
    chosen = primary or candidates
    if not chosen:
        return None
    return sorted(chosen, key=lambda p: len(p.parts))[0]


# --- Tool implementations ----------------------------------------------------

def search_npcs(
    name: Optional[str] = None,
    race: Optional[str] = None,
    origin: Optional[str] = None,
    affiliation: Optional[str] = None,
    type: Optional[str] = None,
    limit: int = 25,
) -> dict[str, Any]:
    """Filter the character-registry.tsv. All filters are case-insensitive substring
    matches; pass any subset. `affiliation` matches the free-form Notes column
    (e.g., 'Black Ledger', 'Shardrunners'). `type` is 'PC' or 'NPC'."""
    rows = _load_registry()

    def matches(row: NpcRow) -> bool:
        if name and name.lower() not in row.name.lower():
            return False
        if race and race.lower() not in row.race.lower():
            return False
        if origin and origin.lower() not in row.origin.lower():
            return False
        if affiliation and affiliation.lower() not in row.notes.lower():
            return False
        if type and type.lower() != row.type.lower():
            return False
        return True

    matched = [r.to_dict() for r in rows if matches(r)]
    return {"count": len(matched), "results": matched[:limit]}


def get_npc(name: str) -> dict[str, Any]:
    """Look up an NPC/PC by name. Returns the registry row plus any matching
    markdown file (frontmatter + body). If no .md file is found, just the row."""
    rows = _load_registry()
    name_lower = name.lower().strip()
    # Prefer exact match, then prefix, then substring
    exact = [r for r in rows if r.name.lower() == name_lower]
    prefix = [r for r in rows if r.name.lower().startswith(name_lower)] if not exact else []
    contains = [r for r in rows if name_lower in r.name.lower()] if not (exact or prefix) else []
    candidates = exact or prefix or contains
    if not candidates:
        raise ValueError(f"No registry entry found for {name!r}")
    row = candidates[0]
    out: dict[str, Any] = {"registry": row.to_dict(), "matched_count": len(candidates)}
    if len(candidates) > 1:
        out["other_matches"] = [r.name for r in candidates[1:5]]
    md_path = _find_npc_file(row.name)
    if md_path is not None and md_path.exists():
        text = md_path.read_text(encoding="utf-8")
        fm, body = _split_frontmatter(text)
        out["file"] = {
            "path": str(md_path.relative_to(_REPO_ROOT)),
            "frontmatter": fm,
            "body": body.strip(),
        }
    return out


def get_faction_overview(slug: str) -> dict[str, Any]:
    """Return the faction's _overview.md (frontmatter + body)."""
    path = _FACTIONS_DIR / slug / "_overview.md"
    if not path.exists():
        available = sorted(p.name for p in _FACTIONS_DIR.iterdir() if p.is_dir())
        raise ValueError(f"No overview for {slug!r}. Available factions: {', '.join(available)}")
    text = path.read_text(encoding="utf-8")
    fm, body = _split_frontmatter(text)
    return {
        "path": str(path.relative_to(_REPO_ROOT)),
        "slug": slug,
        "frontmatter": fm,
        "body": body.strip(),
    }


def last_session_summary(session: Optional[int] = None) -> dict[str, Any]:
    """List all notes from a numbered session folder (default: highest-numbered).
    Returns each notes file's path and a short preview (first 600 chars). Pass
    `session=N` to fetch session N specifically."""
    sessions = sorted(
        (p for p in _SESSIONS_DIR.iterdir() if p.is_dir() and p.name.isdigit()),
        key=lambda p: int(p.name),
    )
    if not sessions:
        raise ValueError("No numbered session folders found under sessions/")
    if session is None:
        chosen = sessions[-1]
    else:
        match = [p for p in sessions if int(p.name) == session]
        if not match:
            raise ValueError(f"Session {session} not found. Available: {[int(p.name) for p in sessions]}")
        chosen = match[0]

    notes_dir = chosen / "notes"
    notes: list[dict[str, Any]] = []
    if notes_dir.exists():
        for md in sorted(notes_dir.rglob("*.md")):
            text = md.read_text(encoding="utf-8")
            fm, body = _split_frontmatter(text)
            notes.append(
                {
                    "path": str(md.relative_to(_REPO_ROOT)),
                    "frontmatter": fm,
                    "preview": body.strip()[:600],
                }
            )
    return {
        "session": int(chosen.name),
        "session_path": str(chosen.relative_to(_REPO_ROOT)),
        "notes_count": len(notes),
        "notes": notes,
    }


def find_lore(
    query: str,
    paths: Optional[str] = None,
    case_sensitive: bool = False,
    limit: int = 25,
    context_chars: int = 200,
) -> dict[str, Any]:
    """Substring search across vault markdown. `paths` is an optional
    comma-separated list of subpaths to restrict the search (e.g.,
    'world/factions,characters'). Returns matched files with snippets."""
    if not query:
        raise ValueError("query is required")

    roots: list[Path] = []
    if paths:
        for p in paths.split(","):
            p = p.strip().lstrip("/")
            if not p:
                continue
            full = (_REPO_ROOT / p).resolve()
            if full.exists() and _REPO_ROOT in full.parents or full == _REPO_ROOT:
                roots.append(full)
    if not roots:
        roots = [_REPO_ROOT]

    skip_dirs = {".git", ".venv", "venv", "__pycache__", ".history", ".cache", ".output", ".artifacts", "node_modules"}
    needle = query if case_sensitive else query.lower()

    hits: list[dict[str, Any]] = []
    for root in roots:
        for path, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in skip_dirs]
            for fname in filenames:
                if not (fname.endswith(".md") or fname.endswith(".tsv")):
                    continue
                file_path = Path(path) / fname
                try:
                    text = file_path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                haystack = text if case_sensitive else text.lower()
                idx = haystack.find(needle)
                if idx == -1:
                    continue
                start = max(0, idx - context_chars // 2)
                end = min(len(text), idx + len(query) + context_chars // 2)
                snippet = text[start:end].replace("\n", " ").strip()
                if start > 0:
                    snippet = "…" + snippet
                if end < len(text):
                    snippet = snippet + "…"
                hits.append(
                    {
                        "path": str(file_path.relative_to(_REPO_ROOT)),
                        "snippet": snippet,
                    }
                )
                if len(hits) >= limit:
                    return {"count": len(hits), "results": hits, "truncated": True}
    return {"count": len(hits), "results": hits, "truncated": False}


# --- MCP_TOOLS + MCP_HANDLERS -------------------------------------------------

_RO_LOCAL = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": False,
}


MCP_TOOLS = [
    {
        "name": "search_npcs",
        "description": (
            "Search the campaign character registry (world/naming_conventions/character-registry.tsv). "
            "All filters are case-insensitive substring matches; pass any subset. "
            "`type` is 'PC' or 'NPC'. `affiliation` searches the Notes column "
            "(e.g., 'Black Ledger', 'Shardrunners', 'Inkbound'). "
            "Examples: search_npcs(faction='Elderholt'), search_npcs(affiliation='Black Ledger'), "
            "search_npcs(race='Derro')."
        ),
        "annotations": {"title": "Search Campaign NPCs", **_RO_LOCAL},
        "argv": ["--mcp-tool", "search_npcs"],
        "value_flags": {
            "name": "--name",
            "race": "--race",
            "origin": "--origin",
            "affiliation": "--affiliation",
            "type": "--type",
            "limit": "--limit",
        },
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Character name (substring)."},
                "race": {"type": "string", "description": "Race (e.g., 'Human', 'Elf', 'Derro')."},
                "origin": {"type": "string", "description": "Origin/faction (substring of Origin column)."},
                "affiliation": {"type": "string", "description": "Affiliation in Notes (e.g., 'Black Ledger')."},
                "type": {"type": "string", "enum": ["PC", "NPC"], "description": "Player character or non-player character."},
                "limit": {"type": "integer", "description": "Max results (default 25).", "default": 25},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_npc",
        "description": (
            "Get a campaign NPC or PC by name. Returns the registry row and, if a markdown file "
            "exists for them (PC under characters/player-characters/, NPC under any "
            "world/factions/<faction>/npcs/<name>.md or characters/npcs/), the file's frontmatter and body. "
            "Match priority: exact > prefix > substring. "
            "If multiple matches, returns the first plus a list of the other matched names."
        ),
        "annotations": {"title": "Get NPC / PC details", **_RO_LOCAL},
        "argv": ["--mcp-tool", "get_npc", "{name}"],
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "Character name (full or partial)."}},
            "required": ["name"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_faction_overview",
        "description": (
            "Read a faction's overview file (world/factions/<slug>/_overview.md). "
            "Returns frontmatter and full body text. "
            "Available faction slugs: araethilion, ardenhaven, calderon-imperium, "
            "dulgarum-oathholds, elderholt, garhammar-trade-league, garrok-confederation, "
            "merrowgate, rakthok-horde."
        ),
        "annotations": {"title": "Get Faction Overview", **_RO_LOCAL},
        "argv": ["--mcp-tool", "get_faction_overview", "{slug}"],
        "input_schema": {
            "type": "object",
            "properties": {"slug": {"type": "string", "description": "Faction slug (kebab-case)."}},
            "required": ["slug"],
            "additionalProperties": False,
        },
    },
    {
        "name": "last_session_summary",
        "description": (
            "List notes from a numbered session folder. By default returns the highest-numbered "
            "session (the most recent). Pass `session=N` for a specific session number. "
            "Returns each note's path, frontmatter, and a 600-char preview — useful for session "
            "prep / recall without dumping every full note into context."
        ),
        "annotations": {"title": "Last Session Notes", **_RO_LOCAL},
        "argv": ["--mcp-tool", "last_session_summary"],
        "value_flags": {"session": "--session"},
        "input_schema": {
            "type": "object",
            "properties": {"session": {"type": "integer", "description": "Specific session number; omit for latest."}},
            "additionalProperties": False,
        },
    },
    {
        "name": "find_lore",
        "description": (
            "Substring search across all .md and .tsv files in the vault (case-insensitive by default). "
            "Optional `paths` parameter restricts the search to subdirectories "
            "(comma-separated, e.g., 'world/factions,characters'). "
            "Returns matched files with surrounding snippets — fast triage tool when you need to find "
            "any mention of a name/place/concept across the whole vault."
        ),
        "annotations": {"title": "Find Lore (text search)", **_RO_LOCAL},
        "argv": ["--mcp-tool", "find_lore"],
        "value_flags": {
            "query": "--query",
            "paths": "--paths",
            "limit": "--limit",
            "context_chars": "--context-chars",
        },
        "bool_flags": {"case_sensitive": "--case-sensitive"},
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Substring to search for."},
                "paths": {"type": "string", "description": "Optional subpaths to restrict (comma-separated)."},
                "case_sensitive": {"type": "boolean", "default": False},
                "limit": {"type": "integer", "default": 25, "description": "Max hits to return."},
                "context_chars": {"type": "integer", "default": 200, "description": "Snippet window size."},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
]


MCP_HANDLERS = {
    "search_npcs": search_npcs,
    "get_npc": get_npc,
    "get_faction_overview": get_faction_overview,
    "last_session_summary": last_session_summary,
    "find_lore": find_lore,
}


# --- Subprocess fallback ----------------------------------------------------

def _parse_flag_args(tokens: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if not token.startswith("--"):
            i += 1
            continue
        key = token[2:].replace("-", "_")
        if i + 1 < len(tokens) and not tokens[i + 1].startswith("--"):
            out[key] = tokens[i + 1]
            i += 2
        else:
            out[key] = True
            i += 1
    for int_key in ("limit", "session", "context_chars"):
        if int_key in out and isinstance(out[int_key], str):
            try:
                out[int_key] = int(out[int_key])
            except ValueError:
                pass
    return out


def main() -> int:
    if len(sys.argv) >= 3 and sys.argv[1] == "--mcp-tool":
        tool_name = sys.argv[2]
        handler = MCP_HANDLERS.get(tool_name)
        if handler is None:
            print(f"Error: Unknown tool: {tool_name}", file=sys.stderr)
            return 1
        try:
            single_arg_tools = {"get_npc": "name", "get_faction_overview": "slug"}
            if tool_name in single_arg_tools:
                if len(sys.argv) < 4:
                    print(f"Error: {tool_name} requires an argument", file=sys.stderr)
                    return 1
                kwargs: dict[str, Any] = {single_arg_tools[tool_name]: sys.argv[3]}
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
        except Exception as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1

    print("Usage: lore.py --mcp-tool <tool_name> [args]", file=sys.stderr)
    print(f"Available tools: {', '.join(sorted(MCP_HANDLERS.keys()))}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
