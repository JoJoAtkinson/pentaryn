#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import os
import random
import re
import sys
import textwrap
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

MCP_TOOL = {
    "name": "lore_inconsistency_report",
    "description": (
        "Index Markdown + history TSV into a local ChromaDB collection and generate a Markdown report of "
        "likely lore inconsistencies (optionally using an OpenAI-compatible LLM to extract claims and judge conflicts). "
        "Defaults to writing `.output/inconsistencies.md` and persisting the vector DB under `.output/chroma`."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "output": {"type": "string", "description": "Output Markdown path (default: .output/inconsistencies.md)."},
            "persist_dir": {
                "type": "string",
                "description": "Chroma persist directory (default: .output/chroma).",
            },
            "collection": {"type": "string", "description": "Chroma collection name (optional)."},
            "roots": {
                "type": "string",
                "description": (
                    "Comma-separated repo roots to scan. Default: 'world,characters,creatures,items,quests,rules'."
                ),
            },
            "reindex": {"type": "boolean", "description": "Rebuild the collection from scratch (default: false)."},
            "max_files": {"type": "integer", "description": "Limit files scanned (debug)."},
            "chunk_max_chars": {"type": "integer", "description": "Max characters per indexed chunk (default: 1800)."},
            "embedding_provider": {
                "type": "string",
                "enum": ["hash", "openai"],
                "description": "Embedding provider (default: hash).",
            },
            "hash_dim": {"type": "integer", "description": "Hash embedding dimension (default: 512)."},
            "entities": {
                "type": "string",
                "description": "Comma-separated entity names to audit (optional).",
            },
            "entity_file": {"type": "string", "description": "Path to a newline-delimited entity list file (optional)."},
            "max_entities": {"type": "integer", "description": "Max auto-discovered entities (default: 50)."},
            "top_k": {"type": "integer", "description": "Chunks to retrieve per entity (default: 8)."},
            "conflict_scope": {
                "type": "string",
                "enum": ["cross-doc", "any"],
                "description": "Report only cross-document conflicts (default: cross-doc).",
            },
            "include_history_entities": {
                "type": "boolean",
                "description": "Also audit each history row `event_id` as an entity (default: false).",
            },
            "max_history_entities": {
                "type": "integer",
                "description": "Max history event_id entities to add (default: 250).",
            },
            "llm_provider": {
                "type": "string",
                "enum": ["none", "openai"],
                "description": "LLM provider for claim extraction (default: openai).",
            },
            "llm_model": {"type": "string", "description": "LLM model (default: gpt-5.2)."},
            "adjudicate": {
                "type": "boolean",
                "description": "Use the LLM to adjudicate candidate conflicts (default: false).",
            },
            "max_conflicts": {
                "type": "integer",
                "description": "Max conflicts to adjudicate (default: 50).",
            },
            "skip_multi_valued": {
                "type": "boolean",
                "description": "Don't skip multi-valued attributes like 'npcs' or 'quests' (default: false).",
            },
            "print_report": {"type": "boolean", "description": "Print the report to stdout (default: false)."},
            "multi_valued_attrs": {
                "type": "string",
                "description": "Comma-separated attribute names treated as multi-valued (not conflicts).",
            },
        },
        "additionalProperties": False,
    },
    "argv": [],
    "bool_flags": {
        "reindex": "--reindex",
        "adjudicate": "--adjudicate",
        "print_report": "--print-report",
        "include_history_entities": "--include-history-entities",
        "skip_multi_valued": "--skip-multi-valued",
    },
    "value_flags": {
        "output": "--output",
        "persist_dir": "--persist-dir",
        "collection": "--collection",
        "roots": "--roots",
        "max_files": "--max-files",
        "chunk_max_chars": "--chunk-max-chars",
        "embedding_provider": "--embedding-provider",
        "hash_dim": "--hash-dim",
        "entities": "--entities",
        "entity_file": "--entity-file",
        "max_entities": "--max-entities",
        "top_k": "--top-k",
        "conflict_scope": "--conflict-scope",
        "max_history_entities": "--max-history-entities",
        "llm_provider": "--llm-provider",
        "llm_model": "--llm-model",
        "max_conflicts": "--max-conflicts",
        "multi_valued_attrs": "--multi-valued-attrs",
    },
}


REPO_ROOT = Path(__file__).resolve().parents[1]


_WORD_RE = re.compile(r"[a-z0-9]{2,}", re.IGNORECASE)
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    text: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class Claim:
    entity: str
    attribute: str
    value: str
    sources: tuple[str, ...]
    confidence: float


def _citation_path(citation: str) -> str:
    c = (citation or "").strip()
    if not c:
        return ""
    if "#L" in c:
        return c.split("#L", 1)[0]
    if "#" in c:
        return c.split("#", 1)[0]
    return c


def _default_multi_valued_attributes() -> set[str]:
    # Attributes where "many values" is normal and should not be treated as a contradiction.
    return {
        "adventure_hook",
        "adventure_hooks",
        "hook",
        "hooks",
        "rumor",
        "rumors",
        "quest",
        "quests",
        "quest_offered",
        "quest_offers",
        "quest_hooks",
        "npc",
        "npcs",
        "notable_npc",
        "notable_npcs",
        "ally",
        "allies",
        "rival",
        "rivals",
        "enemy",
        "enemies",
        "benefit",
        "benefits",
        "obligation",
        "obligations",
        "activity",
        "activities",
        "project",
        "projects",
        "location",
        "locations",
        "point_of_interest",
        "points_of_interest",
    }


def _is_multi_valued_attribute(attribute: str, *, extra_multi: Iterable[str] = ()) -> bool:
    attr = re.sub(r"[^a-z0-9]+", "_", (attribute or "").casefold()).strip("_")
    if not attr:
        return False
    multi = set(_default_multi_valued_attributes())
    for a in extra_multi:
        a2 = re.sub(r"[^a-z0-9]+", "_", (a or "").casefold()).strip("_")
        if a2:
            multi.add(a2)
    return attr in multi


def _discover_history_event_ids(files: list[Path], *, max_entities: int, namespace: bool = True) -> list[str]:
    """Discover event_id values from _history.tsv files.
    
    Args:
        files: List of files to scan
        max_entities: Maximum number of event IDs to return
        namespace: If True, prefix event IDs with faction name (e.g., 'merrowgate:evt-001')
        
    Returns:
        List of event IDs (optionally namespaced)
    """
    event_ids: list[str] = []
    seen: set[str] = set()
    for path in files:
        name_lower = path.name.lower()
        if not (name_lower.endswith("_history.tsv") or name_lower.endswith("_timeline.tsv")):
            continue
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        if not lines:
            continue
        
        # Extract faction/namespace from path
        faction_prefix = ""
        if namespace:
            parts = path.parts
            if "factions" in parts:
                idx = parts.index("factions")
                if idx + 1 < len(parts):
                    faction_prefix = f"{parts[idx + 1]}:"
        
        header = [h.strip() for h in lines[0].split("\t")]
        if "event_id" not in header:
            continue
        idx = header.index("event_id")
        for row in lines[1:]:
            if not row.strip():
                continue
            parts = row.split("\t")
            if idx >= len(parts):
                continue
            eid = parts[idx].strip()
            if not eid:
                continue
            
            # Apply namespace if configured
            namespaced_id = f"{faction_prefix}{eid}" if faction_prefix else eid
            key = namespaced_id.casefold()
            if key in seen:
                continue
            seen.add(key)
            event_ids.append(namespaced_id)
            if len(event_ids) >= max_entities:
                return event_ids
    return event_ids


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT)).replace(os.path.sep, "/")
    except ValueError:
        return str(path).replace(os.path.sep, "/")


def _iter_source_files(*, roots: list[Path] | None, max_files: int | None) -> list[Path]:
    skip_dirs = {
        ".git",
        ".venv",
        "venv",
        ".output",
        ".artifacts",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
        ".timeline_data",
    }

    start_paths = [REPO_ROOT / r for r in roots] if roots else [REPO_ROOT]
    out: list[Path] = []
    for start in start_paths:
        if not start.exists():
            continue
        if start.is_file():
            out.append(start)
            continue

        for dirpath, dirnames, filenames in os.walk(start):
            dirnames[:] = [
                d
                for d in dirnames
                if d not in skip_dirs and not d.startswith(".pandoc-merged-") and not d.startswith(".")
            ]
            for filename in filenames:
                if filename.startswith("."):
                    continue
                path = Path(dirpath) / filename
                if not path.is_file():
                    continue
                name_lower = path.name.lower()
                if name_lower.endswith(".md") or name_lower.endswith("_history.tsv") or name_lower.endswith("_timeline.tsv"):
                    out.append(path)
                    if max_files is not None and len(out) >= max_files:
                        return sorted(out, key=lambda p: str(p).casefold())

    return sorted(out, key=lambda p: str(p).casefold())


def _split_by_char_budget(lines: list[tuple[int, str]], *, max_chars: int) -> list[list[tuple[int, str]]]:
    if not lines:
        return []
    parts: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []
    current_chars = 0
    last_blank_idx: int | None = None

    def flush(up_to: int | None = None) -> None:
        nonlocal current, current_chars, last_blank_idx
        if not current:
            return
        if up_to is None:
            parts.append(current)
            current = []
            current_chars = 0
            last_blank_idx = None
            return
        head = current[:up_to]
        tail = current[up_to:]
        if head:
            parts.append(head)
        current = tail
        current_chars = sum(len(s) + 1 for _, s in current)
        last_blank_idx = None
        for idx, (_, s) in enumerate(current):
            if not s.strip():
                last_blank_idx = idx

    for ln, line in lines:
        current.append((ln, line))
        current_chars += len(line) + 1
        if not line.strip():
            last_blank_idx = len(current) - 1
        if current_chars <= max_chars:
            continue
        if last_blank_idx is not None and last_blank_idx >= 4:
            flush(last_blank_idx + 1)
        else:
            flush()

    flush()
    return parts


def _heading_path(stack: list[str]) -> str:
    if not stack:
        return ""
    return " > ".join(stack)


def _chunk_markdown(path: Path, *, max_chars: int) -> list[Chunk]:
    """Parse a Markdown file into chunks respecting heading hierarchy.
    
    Args:
        path: Path to the Markdown file
        max_chars: Maximum characters per chunk (soft limit)
        
    Returns:
        List of Chunk objects with heading context preserved
    """
    rel_path = _rel(path)
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        sys.stderr.write(f"Warning: Failed to read {rel_path}: {exc}\n")
        return []
        
    lines = raw.splitlines()

    chunks: list[Chunk] = []
    stack: list[str] = []
    in_fence = False

    current_lines: list[tuple[int, str]] = []
    current_heading_path = ""
    current_start_line = 1

    def flush() -> None:
        nonlocal current_lines, current_heading_path, current_start_line
        if not current_lines:
            return
        parts = _split_by_char_budget(current_lines, max_chars=max_chars)
        for part_index, part in enumerate(parts):
            start_ln = part[0][0]
            body = "\n".join(s for _, s in part).strip()
            if not body:
                continue
            header = f"[FILE] {rel_path}"
            if current_heading_path:
                header += f"\n[HEADING] {current_heading_path}"
            doc = f"{header}\n\n{body}".strip()
            chunk_id = f"{rel_path}::md::{start_ln}::{part_index}"
            chunks.append(
                Chunk(
                    chunk_id=chunk_id,
                    text=doc,
                    metadata={
                        "path": rel_path,
                        "kind": "md",
                        "heading": current_heading_path,
                        "start_line": start_ln,
                    },
                )
            )
        current_lines = []
        current_heading_path = _heading_path(stack)
        current_start_line = len(lines) + 1

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence

        m = _HEADING_RE.match(line) if not in_fence else None
        if m:
            flush()
            level = len(m.group(1))
            title = m.group(2).strip()
            while len(stack) >= level:
                stack.pop()
            stack.append(f"{'#' * level} {title}")
            current_heading_path = _heading_path(stack)
            current_start_line = idx
            current_lines = [(idx, line)]
            continue

        if not current_lines:
            current_start_line = idx
            current_heading_path = _heading_path(stack)
        current_lines.append((idx, line))

    flush()

    if not chunks and raw.strip():
        chunks.append(
            Chunk(
                chunk_id=f"{rel_path}::md::1::0",
                text=f"[FILE] {rel_path}\n\n{raw.strip()}",
                metadata={"path": rel_path, "kind": "md", "heading": "", "start_line": 1},
            )
        )

    return chunks


def _chunk_history_tsv(path: Path) -> list[Chunk]:
    """Parse a _history.tsv or _timeline.tsv file into chunks.
    
    Args:
        path: Path to the TSV file
        
    Returns:
        List of Chunk objects, one per event row
    """
    rel_path = _rel(path)
    try:
        rows = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as exc:
        # Gracefully handle read errors
        sys.stderr.write(f"Warning: Failed to read {rel_path}: {exc}\n")
        return []
    
    if not rows:
        return []

    reader = csv.DictReader(rows, delimiter="\t")
    chunks: list[Chunk] = []
    for row_index, row in enumerate(reader, start=2):  # 1-based header line
        if not any((v or "").strip() for v in row.values()):
            continue
        event_id = (row.get("event_id") or "").strip()
        date = (row.get("date") or "").strip()
        title = (row.get("title") or "").strip()
        tags = (row.get("tags") or "").strip()
        summary = (row.get("summary") or "").strip()
        duration = (row.get("duration") or "").strip()

        doc = "\n".join(
            [
                f"[FILE] {rel_path}",
                "[HISTORY_EVENT]",
                f"event_id: {event_id}",
                f"date: {date}",
                f"duration_days: {duration}",
                f"tags: {tags}",
                f"title: {title}",
                f"summary: {summary}",
            ]
        ).strip()
        chunk_id = f"{rel_path}::tsv::{row_index}::0"
        chunks.append(
            Chunk(
                chunk_id=chunk_id,
                text=doc,
                metadata={
                    "path": rel_path,
                    "kind": "history_tsv",
                    "event_id": event_id,
                    "date": date,
                    "tags": tags,
                    "title": title,
                    "start_line": row_index,
                },
            )
        )
    return chunks


def _chunk_file(path: Path, *, chunk_max_chars: int) -> list[Chunk]:
    name_lower = path.name.lower()
    if name_lower.endswith(".md"):
        return _chunk_markdown(path, max_chars=chunk_max_chars)
    if name_lower.endswith("_history.tsv") or name_lower.endswith("_timeline.tsv"):
        return _chunk_history_tsv(path)
    return []


def _hash_embed(text: str, *, dim: int) -> list[float]:
    """Generate a normalized hash-based embedding vector for text.
    
    Args:
        text: Input text to embed
        dim: Dimensionality of output vector
        
    Returns:
        Normalized embedding vector of length dim
    """
    if dim <= 0:
        raise ValueError("hash_dim must be > 0")
    vec = [0.0] * dim
    tokens = _WORD_RE.findall(text.lower())
    
    # If no tokens, create a deterministic "empty" embedding
    if not tokens:
        # Use a simple pattern to avoid all-zeros
        for i in range(min(dim, 3)):
            vec[i] = 1.0
    else:
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            idx = int.from_bytes(digest[:4], "little") % dim
            vec[idx] += 1.0
    
    # Normalize to unit vector
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        inv = 1.0 / norm
        vec = [v * inv for v in vec]
    return vec


def _openai_api_key() -> str | None:
    return os.environ.get("OPENAI_API_KEY") or os.environ.get("OPENAI_APIKEY")


def _openai_base_url() -> str:
    return (os.environ.get("OPENAI_BASE_URL") or os.environ.get("OPENAI_API_BASE") or "https://api.openai.com").rstrip("/")


def _openai_post_json(url: str, payload: dict[str, Any], *, timeout_s: int = 120) -> dict[str, Any]:
    api_key = _openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        method="POST",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if hasattr(exc, "read") else ""
        raise RuntimeError(f"OpenAI API error ({exc.code}): {body or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenAI API request failed: {exc.reason}") from exc


def _openai_embed_texts(texts: list[str], *, model: str = "text-embedding-3-small") -> list[list[float]]:
    url = f"{_openai_base_url()}/v1/embeddings"
    payload = {"model": model, "input": texts}
    data = _openai_post_json(url, payload)
    items = data.get("data") or []
    if not isinstance(items, list) or len(items) != len(texts):
        raise RuntimeError("Unexpected embeddings response shape")
    out: list[list[float]] = []
    for item in items:
        emb = item.get("embedding")
        if not isinstance(emb, list) or not all(isinstance(x, (int, float)) for x in emb):
            raise RuntimeError("Unexpected embedding vector")
        out.append([float(x) for x in emb])
    return out


def _openai_chat_json(*, model: str, messages: list[dict[str, str]], timeout_s: int = 180) -> dict[str, Any]:
    url = f"{_openai_base_url()}/v1/chat/completions"
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    data = _openai_post_json(url, payload, timeout_s=timeout_s)
    content = (
        (((data.get("choices") or [])[0] or {}).get("message") or {}).get("content")  # type: ignore[union-attr]
        if isinstance(data.get("choices"), list) and data.get("choices")
        else None
    )
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("OpenAI chat response missing content")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(content[start : end + 1])
        raise RuntimeError(f"LLM did not return JSON: {content[:2000]}")


def _parse_csv_list(value: str | None) -> list[str]:
    if not value:
        return []
    raw = value.strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list) and all(isinstance(x, str) for x in parsed):
                return [x.strip() for x in parsed if x.strip()]
        except json.JSONDecodeError:
            pass
    return [part.strip() for part in raw.split(",") if part.strip()]


def _discover_entities_from_files(files: list[Path], *, max_entities: int) -> list[str]:
    """Auto-discover entity names from Markdown file titles.
    
    Args:
        files: List of file paths to scan
        max_entities: Maximum number of entities to discover
        
    Returns:
        List of discovered entity names (deduplicated)
    """
    candidates: list[str] = []
    skip_titles = {"readme", "quick start", "contributing", "agents", "changelog", "license"}
    
    for path in files:
        if path.suffix.lower() != ".md":
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        title = ""
        for line in text.splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
                break
        if not title:
            # Fallback to filename if no h1 heading
            title = path.stem.replace("-", " ").replace("_", " ").strip()
        title = re.sub(r"\s+", " ", title).strip()
        if not title or len(title) > 80:
            continue
        if title.casefold() in skip_titles:
            continue
        candidates.append(title)

    seen: set[str] = set()
    out: list[str] = []
    for title in candidates:
        key = title.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(title)
        if len(out) >= max_entities:
            break
    return out


def _load_entities(*, entities_raw: str | None, entity_file: str | None, files: list[Path], max_entities: int) -> list[str]:
    entities = _parse_csv_list(entities_raw)
    if entity_file:
        try:
            text = (REPO_ROOT / entity_file).read_text(encoding="utf-8", errors="replace")
            for line in text.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                entities.append(line)
        except OSError as exc:
            raise RuntimeError(f"Failed to read entity file '{entity_file}': {exc}") from exc
    cleaned: list[str] = []
    seen: set[str] = set()
    for e in entities:
        e2 = re.sub(r"\s+", " ", e).strip()
        if not e2:
            continue
        key = e2.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(e2)
    if cleaned:
        return cleaned
    return _discover_entities_from_files(files, max_entities=max_entities)


def _render_excerpt(text: str, *, default_start_line: int, max_lines: int = 80) -> str:
    lines = text.splitlines()
    # Skip the synthetic [FILE]/[HEADING] wrapper lines for readability in prompts.
    while lines and lines[0].startswith("[FILE]"):
        lines = lines[1:]
    while lines and lines[0].startswith("[HEADING]"):
        lines = lines[1:]
    if lines and not lines[0].strip():
        lines = lines[1:]

    lines = lines[:max_lines]
    numbered: list[str] = []
    for offset, line in enumerate(lines):
        numbered.append(f"{default_start_line + offset}: {line}")
    return "\n".join(numbered).strip()


def _excerpt_has_non_heading_content(excerpt: str) -> bool:
    for line in excerpt.splitlines():
        m = re.match(r"^\d+:\s*(.*)$", line)
        content = (m.group(1) if m else line).strip()
        if not content:
            continue
        if content.startswith("#"):
            continue
        return True
    return False


def _extract_claims_for_entity(
    *,
    entity: str,
    sources: list[dict[str, Any]],
    llm_provider: str,
    llm_model: str,
) -> list[Claim]:
    if llm_provider == "none":
        return []
    if llm_provider != "openai":
        raise ValueError(f"Unknown llm_provider: {llm_provider}")

    def _norm_source_id(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", value.casefold())

    prompt_sources: list[str] = []
    source_id_to_citation: dict[str, str] = {}
    for idx, src in enumerate(sources, start=1):
        sid = f"SRC{idx}"
        citation = f"{src['path']}#L{src['start_line']}"
        heading = src.get("heading") or src.get("title") or ""
        excerpt = _render_excerpt(src["text"], default_start_line=int(src["start_line"]))
        if not excerpt:
            continue
        source_id_to_citation[_norm_source_id(sid)] = citation
        heading_line = f" ({heading})" if heading else ""
        prompt_sources.append(f"- [{sid}] {citation}{heading_line}\n{excerpt}")

    user = "\n".join(
        [
            f"Entity: {entity}",
            "",
            "Excerpts:",
            *prompt_sources,
            "",
            "Task: Extract atomic, factual claims about the entity that are directly supported by the excerpts.",
            "",
            "Return JSON with this shape (and no extra keys):",
            textwrap.dedent(
                """\
                {
                  "entity": "...",
                  "claims": [
                    {
                      "attribute": "lower_snake_case_short_label",
                      "value": "string",
                      "sources": ["SRC1"],
                      "confidence": 0.0
                    }
                  ]
                }
                """
            ).strip(),
            "",
            "Rules:",
            "- Do not infer, speculate, or combine unrelated facts.",
            "- Each claim must cite at least 1 source id from the excerpts.",
            "- Prefer stable attributes (leader, location, status, founder, founding_date, allegiance, objective, etc.).",
            "- If you cannot extract any supported claims, return an empty claims list.",
        ]
    ).strip()

    data = _openai_chat_json(
        model=llm_model,
        messages=[
            {"role": "system", "content": "You are a careful lore auditor. Output JSON only."},
            {"role": "user", "content": user},
        ],
    )
    claims_raw: Any | None = None
    if isinstance(data, list):
        claims_raw = data
    elif isinstance(data, dict):
        # Prefer exact "claims", but accept case variants and shallow wrappers.
        if "claims" in data:
            claims_raw = data.get("claims")
        else:
            lower_keys = {str(k).casefold(): k for k in data.keys() if isinstance(k, str)}
            key = lower_keys.get("claims")
            if key is not None:
                claims_raw = data.get(key)
            else:
                for v in data.values():
                    if not isinstance(v, dict):
                        continue
                    if "claims" in v:
                        claims_raw = v.get("claims")
                        break
                    lower2 = {str(k).casefold(): k for k in v.keys() if isinstance(k, str)}
                    key2 = lower2.get("claims")
                    if key2 is not None:
                        claims_raw = v.get(key2)
                        break
    if not isinstance(claims_raw, list):
        return []

    out: list[Claim] = []
    for item in claims_raw:
        if not isinstance(item, dict):
            continue
        lower_keys = {str(k).casefold(): k for k in item.keys() if isinstance(k, str)}
        attribute_raw = str(item.get(lower_keys.get("attribute", ""), "") or item.get(lower_keys.get("attr", ""), "") or "").strip()
        attribute = re.sub(r"[^a-z0-9]+", "_", attribute_raw.casefold()).strip("_")
        value = str(item.get(lower_keys.get("value", ""), "") or item.get(lower_keys.get("val", ""), "") or "").strip()
        sources_raw: Any = item.get(lower_keys.get("sources", ""), "") or item.get(lower_keys.get("source", ""), "") or []
        if not attribute or not value:
            continue
        if isinstance(sources_raw, str):
            # Allow "SRC1, SRC2" or "SRC1 SRC2" variants.
            sources_raw = [s for s in re.split(r"[,\s]+", sources_raw) if s]
        if not isinstance(sources_raw, list) or not all(isinstance(s, str) for s in sources_raw):
            continue
        citations: list[str] = []
        for src in sources_raw:
            src = src.strip()
            if not src:
                continue
            mapped = source_id_to_citation.get(_norm_source_id(src), "").strip()
            if mapped:
                citations.append(mapped)
                continue
            # If the model returned citations directly, keep them.
            if "#L" in src or src.lower().endswith((".md", ".tsv")):
                citations.append(src)

        citations2 = tuple(sorted({c for c in citations if c}, key=lambda s: s.casefold()))
        citations = list(citations2)
        if not citations:
            continue
        confidence_raw = item.get("confidence")
        try:
            confidence = float(confidence_raw)
        except (TypeError, ValueError):
            confidence = 0.5
        confidence = max(0.0, min(1.0, confidence))
        out.append(
            Claim(
                entity=entity,
                attribute=attribute,
                value=value,
                sources=tuple(citations),
                confidence=confidence,
            )
        )
    return out


def _adjudicate_conflict(
    *,
    entity: str,
    attribute: str,
    values: list[dict[str, Any]],
    llm_provider: str,
    llm_model: str,
) -> dict[str, Any] | None:
    if llm_provider == "none":
        return None
    if llm_provider != "openai":
        raise ValueError(f"Unknown llm_provider: {llm_provider}")

    lines: list[str] = [
        f"Entity: {entity}",
        f"Attribute: {attribute}",
        "",
        "Candidate values (each is a distinct claim value with sources):",
    ]
    for idx, item in enumerate(values, start=1):
        v = item["value"]
        citations = ", ".join(item.get("sources") or [])
        lines.append(f"- V{idx}: {v} (sources: {citations})")

    lines += [
        "",
        "Task: Determine whether these values are actually contradictory, or could be compatible (e.g. different time periods, titles, or scope).",
        "Return JSON with this shape (and no extra keys):",
        textwrap.dedent(
            """\
            {
              "is_conflict": true,
              "severity": "low|medium|high",
              "reason": "string",
              "suggested_followup": "string"
            }
            """
        ).strip(),
        "",
        "Rules:",
        "- Use only the provided values and citations; do not guess missing context.",
        "- If unclear/insufficient evidence, set is_conflict=false and explain what info is missing.",
    ]
    user = "\n".join(lines).strip()
    return _openai_chat_json(
        model=llm_model,
        messages=[
            {"role": "system", "content": "You are a careful lore auditor. Output JSON only."},
            {"role": "user", "content": user},
        ],
    )


def _md_escape(text: str) -> str:
    return text.replace("\r", "").strip()


def _build_report(
    *,
    scanned_files: list[Path],
    roots: list[str],
    conflict_scope: str,
    include_history_entities: bool,
    collection_name: str,
    persist_dir: str,
    embedding_provider: str,
    llm_provider: str,
    llm_model: str,
    entities: list[str],
    claims_by_entity: dict[str, list[Claim]],
    conflicts: list[dict[str, Any]],
    non_conflicts: list[dict[str, Any]],
    started_at: dt.datetime,
) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    lines: list[str] = [
        "# Lore Inconsistency Report",
        "",
        f"- Generated: {now.isoformat()}",
        f"- Repo: `{REPO_ROOT}`",
        f"- Roots: {', '.join(f'`{r}`' for r in roots) if roots else '`(repo root)`'}",
        f"- Conflict scope: `{conflict_scope}`",
        f"- History entities: `{include_history_entities}`",
        f"- Files scanned: {len(scanned_files)}",
        f"- Chroma persist dir: `{persist_dir}`",
        f"- Chroma collection: `{collection_name}`",
        f"- Embeddings: `{embedding_provider}`",
        f"- LLM: `{llm_provider}`" + (f" (`{llm_model}`)" if llm_provider != "none" else ""),
        f"- Entities audited: {len(entities)}",
    ]
    
    # Show entity breakdown if history entities are included
    if include_history_entities:
        history_count = sum(1 for e in entities if ":" in e)
        regular_count = len(entities) - history_count
        lines += [
            f"  - Regular entities: {regular_count}",
            f"  - History event IDs: {history_count}",
        ]
    
    lines += [
        "",
        "## Summary",
        "",
        f"- Conflicts: {len(conflicts)}",
        f"- Review items (non-conflicts): {len(non_conflicts)}",
        f"- Runtime: {str(now - started_at).split('.')[0]}",
        "",
    ]

    if llm_provider == "none":
        lines += [
            "> Note: Claim extraction is disabled (`llm_provider=none`).",
            "> Pass `llm_provider=openai` and set `OPENAI_API_KEY` to enable extraction + conflict adjudication.",
            "",
        ]

    lines += ["## Conflicts", ""]
    if not conflicts:
        lines += ["- (none found)", ""]
    else:
        for item in conflicts:
            entity = item["entity"]
            attribute = item["attribute"]
            values = item["values"]
            adjudication = item.get("adjudication")

            lines.append(f"### {entity} — `{attribute}`")
            lines.append("")
            for v in values:
                v_text = _md_escape(v["value"])
                # Create VS Code clickable links
                source_links = []
                for s in (v.get("sources") or []):
                    # Format: [path#L123](path#L123) for VS Code compatibility
                    source_links.append(f"[{s}]({s})")
                citations = ", ".join(source_links)
                lines.append(f"- **{v_text}** — {citations}")
                
                # Add excerpts if available
                excerpts = v.get("excerpts") or []
                if excerpts:
                    for exc in excerpts:
                        exc_text = _md_escape(exc["text"])
                        if exc_text:
                            lines.append(f"  > {exc_text}...")
                
            if adjudication:
                is_conflict = adjudication.get("is_conflict")
                severity = adjudication.get("severity")
                reason = adjudication.get("reason")
                followup = adjudication.get("suggested_followup")
                lines.append("")
                lines.append("**Adjudication**")
                lines.append(f"- is_conflict: `{is_conflict}`")
                if severity:
                    lines.append(f"- severity: `{severity}`")
                if reason:
                    lines.append(f"- reason: {reason}")
                if followup:
                    lines.append(f"- followup: {followup}")
            lines.append("")

    if non_conflicts:
        lines += ["## Review Items", "", "> These were flagged as candidates but adjudicated as compatible.", ""]
        for item in non_conflicts:
            entity = item["entity"]
            attribute = item["attribute"]
            values = item["values"]
            adjudication = item.get("adjudication")

            lines.append(f"### {entity} — `{attribute}`")
            lines.append("")
            for v in values:
                v_text = _md_escape(v["value"])
                citations = ", ".join(f"`{s}`" for s in (v.get("sources") or []))
                lines.append(f"- {v_text} ({citations})")
            if adjudication:
                is_conflict = adjudication.get("is_conflict")
                severity = adjudication.get("severity")
                reason = adjudication.get("reason")
                followup = adjudication.get("suggested_followup")
                lines.append("")
                lines.append("**Adjudication**")
                lines.append(f"- is_conflict: `{is_conflict}`")
                if severity:
                    lines.append(f"- severity: `{severity}`")
                if reason:
                    lines.append(f"- reason: {reason}")
                if followup:
                    lines.append(f"- followup: {followup}")
            lines.append("")

    lines += ["## Entities (Claims)", ""]
    for entity in entities:
        claims = claims_by_entity.get(entity) or []
        if not claims:
            continue
        lines.append(f"### {entity}")
        lines.append("")
        by_attr: dict[str, list[Claim]] = {}
        for c in claims:
            by_attr.setdefault(c.attribute, []).append(c)
        for attr in sorted(by_attr.keys()):
            vals = by_attr[attr]
            # Compact unique values for readability.
            unique = {}
            for c in vals:
                unique.setdefault(c.value, c)
            lines.append(f"- `{attr}`:")
            for val, c in list(unique.items())[:8]:
                citations = ", ".join(f"`{s}`" for s in c.sources)
                lines.append(f"  - {val} ({citations})")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate a lore inconsistency report using ChromaDB + optional LLM.")
    parser.add_argument("--output", default=".output/inconsistencies.md", help="Output Markdown path.")
    parser.add_argument("--persist-dir", default=".output/chroma", help="Chroma persist directory.")
    parser.add_argument("--collection", default="", help="Chroma collection name (optional).")
    parser.add_argument(
        "--roots",
        default="world,characters,creatures,items,quests,rules",
        help="Comma-separated repo roots to scan.",
    )
    parser.add_argument("--reindex", action="store_true", help="Rebuild the collection from scratch.")
    parser.add_argument("--max-files", type=int, default=0, help="Limit number of files scanned (debug).")
    parser.add_argument("--chunk-max-chars", type=int, default=1800, help="Max characters per indexed chunk.")
    parser.add_argument(
        "--embedding-provider",
        choices=["hash", "openai"],
        default="hash",
        help="Embedding provider (hash works offline; openai uses embeddings API).",
    )
    parser.add_argument("--hash-dim", type=int, default=512, help="Hash embedding dimension.")
    parser.add_argument("--entities", default="", help="Comma-separated entity names to audit.")
    parser.add_argument("--entity-file", default="", help="Path to newline-delimited entity list.")
    parser.add_argument("--max-entities", type=int, default=50, help="Max auto-discovered entities.")
    parser.add_argument("--top-k", type=int, default=8, help="Chunks to retrieve per entity.")
    parser.add_argument(
        "--multi-valued-attrs",
        default="",
        help="Comma-separated attribute names that should be treated as multi-valued (not conflicts).",
    )
    parser.add_argument(
        "--conflict-scope",
        choices=["cross-doc", "any"],
        default="cross-doc",
        help="Whether to report only cross-document conflicts (default) or any conflicts.",
    )
    parser.add_argument(
        "--include-history-entities",
        action="store_true",
        help="Also audit each history row `event_id` as its own entity (useful for catching history drift).",
    )
    parser.add_argument("--max-history-entities", type=int, default=250, help="Max history event_id entities to add.")
    parser.add_argument(
        "--llm-provider",
        choices=["none", "openai"],
        default="openai",
        help="LLM provider for extraction (use 'none' for offline indexing).",
    )
    parser.add_argument("--llm-model", default="gpt-5.2", help="LLM model name.")
    parser.add_argument("--adjudicate", action="store_true", help="Use LLM to adjudicate candidate conflicts.")
    parser.add_argument("--max-conflicts", type=int, default=50, help="Max conflicts to adjudicate.")
    parser.add_argument(
        "--skip-multi-valued",
        action="store_true",
        help="Don't skip multi-valued attributes like 'npcs' or 'quests' (report all conflicts).",
    )
    parser.add_argument("--print-report", action="store_true", help="Print full report to stdout.")
    args = parser.parse_args(argv)

    started_at = dt.datetime.now(dt.timezone.utc)

    # Best-effort: load local `.env` so OPENAI_API_KEY can live there.
    try:
        from dotenv import load_dotenv  # type: ignore[import-not-found]

        load_dotenv(dotenv_path=REPO_ROOT / ".env", override=False)
    except Exception:
        pass

    if (args.embedding_provider == "openai" or args.llm_provider == "openai") and not _openai_api_key():
        raise SystemExit(
            "OPENAI_API_KEY is not set.\n\n"
            "- Set it to use `embedding_provider=openai` or `llm_provider=openai`.\n"
            "- Or run with `--embedding-provider hash --llm-provider none` for offline indexing.\n"
        )

    try:
        import chromadb  # type: ignore[import-not-found]
    except Exception as exc:
        raise SystemExit(
            "chromadb is not installed. Install deps with:\n\n"
            "  uv sync\n\n"
            f"Import error: {exc}"
        ) from exc

    roots_list = _parse_csv_list(args.roots)
    roots = [Path(p) for p in roots_list] if roots_list else None
    max_files = args.max_files if args.max_files > 0 else None

    files = _iter_source_files(roots=roots, max_files=max_files)
    if not files:
        raise SystemExit("No source files found to index.")

    entities = _load_entities(
        entities_raw=args.entities or None,
        entity_file=args.entity_file or None,
        files=files,
        max_entities=max(1, args.max_entities),
    )
    if args.include_history_entities:
        hist_ids = _discover_history_event_ids(files, max_entities=max(1, int(args.max_history_entities)))
        seen = {e.casefold() for e in entities}
        for eid in hist_ids:
            key = eid.casefold()
            if key in seen:
                continue
            seen.add(key)
            entities.append(eid)

    persist_dir = str((REPO_ROOT / args.persist_dir).resolve())
    os.makedirs(persist_dir, exist_ok=True)

    collection_name = args.collection.strip()
    if not collection_name:
        suffix = f"{args.embedding_provider}_{args.hash_dim}" if args.embedding_provider == "hash" else "openai"
        collection_name = f"dnd_vault_{suffix}"

    client = chromadb.PersistentClient(path=persist_dir)
    if args.reindex:
        try:
            client.delete_collection(collection_name)
        except Exception:
            pass
    collection = client.get_or_create_collection(collection_name, metadata={"hnsw:space": "cosine"})

    chunks: list[Chunk] = []
    for file_path in files:
        chunks.extend(_chunk_file(file_path, chunk_max_chars=max(200, args.chunk_max_chars)))

    if not chunks:
        raise SystemExit("No chunks produced from scanned files.")

    documents = [c.text for c in chunks]
    ids = [c.chunk_id for c in chunks]
    metadatas = [c.metadata for c in chunks]

    embeddings: list[list[float]]
    if args.embedding_provider == "hash":
        embeddings = [_hash_embed(doc, dim=args.hash_dim) for doc in documents]
    else:
        # OpenAI embeddings: batch for efficiency.
        batch_size = 128
        embeddings = []
        for i in range(0, len(documents), batch_size):
            embeddings.extend(_openai_embed_texts(documents[i : i + batch_size]))

    # Upsert everything so incremental runs converge.
    collection.upsert(ids=ids, documents=documents, metadatas=metadatas, embeddings=embeddings)

    # Build chunk lookup for excerpt retrieval
    chunks_by_id: dict[str, Chunk] = {c.chunk_id: c for c in chunks}
    chunks_by_path: dict[str, Chunk] = {}
    for c in chunks:
        path = str(c.metadata.get("path") or "").strip()
        if path and path not in chunks_by_path:
            chunks_by_path[path] = c

    # Build per-entity evidence sets (retrieval).
    top_k = max(1, args.top_k)
    claims_by_entity: dict[str, list[Claim]] = {}
    conflicts: list[dict[str, Any]] = []
    non_conflicts: list[dict[str, Any]] = []
    extra_multi_attrs = _parse_csv_list(args.multi_valued_attrs)

    # Randomize entities a bit to keep reports fresh when capped.
    entities_work = list(entities)
    random.seed(0)
    random.shuffle(entities_work)

    for entity in entities_work:
        query_text = entity
        if args.embedding_provider == "hash":
            query_embedding = _hash_embed(query_text, dim=args.hash_dim)
        else:
            query_embedding = _openai_embed_texts([query_text])[0]

        # Query more than we strictly need, then filter out heading-only chunks so the LLM sees real content.
        candidate_k = max(top_k, min(60, top_k * 6))
        result = collection.query(
            query_embeddings=[query_embedding],
            n_results=candidate_k,
            include=["documents", "metadatas", "distances"],
        )
        docs = (result.get("documents") or [[]])[0]
        metas = (result.get("metadatas") or [[]])[0]
        if not isinstance(docs, list) or not isinstance(metas, list):
            continue

        candidates: list[dict[str, Any]] = []
        for doc, meta in zip(docs, metas, strict=False):
            if not isinstance(doc, str) or not isinstance(meta, dict):
                continue
            candidates.append(
                {
                    "text": doc,
                    "path": str(meta.get("path") or ""),
                    "heading": str(meta.get("heading") or ""),
                    "title": str(meta.get("title") or ""),
                    "start_line": int(meta.get("start_line") or 1),
                }
            )

        sources: list[dict[str, Any]] = []
        for cand in candidates:
            excerpt = _render_excerpt(cand["text"], default_start_line=int(cand["start_line"]), max_lines=60)
            if excerpt and _excerpt_has_non_heading_content(excerpt):
                sources.append(cand)
                if len(sources) >= top_k:
                    break
        if len(sources) < top_k:
            # If we filtered too aggressively, fall back to the remaining candidates in rank order.
            for cand in candidates:
                if cand in sources:
                    continue
                sources.append(cand)
                if len(sources) >= top_k:
                    break

        claims = _extract_claims_for_entity(
            entity=entity,
            sources=sources,
            llm_provider=args.llm_provider,
            llm_model=args.llm_model,
        )
        if claims:
            claims_by_entity[entity] = claims

    # Candidate conflicts: same entity + attribute, divergent values.
    for entity, claims in claims_by_entity.items():
        by_attr: dict[str, list[Claim]] = {}
        for c in claims:
            by_attr.setdefault(c.attribute.strip(), []).append(c)
        for attr, items in by_attr.items():
            if not args.skip_multi_valued and _is_multi_valued_attribute(attr, extra_multi=extra_multi_attrs):
                continue

            distinct: dict[str, list[Claim]] = {}
            for c in items:
                key = re.sub(r"\s+", " ", c.value).strip().casefold()
                distinct.setdefault(key, []).append(c)
            if len(distinct) <= 1:
                continue

            if args.conflict_scope == "cross-doc":
                all_paths = {_citation_path(src) for c in items for src in c.sources}
                all_paths = {p for p in all_paths if p}
                if len(all_paths) <= 1:
                    continue

            # Build value blocks with citations and excerpts
            value_blocks: list[dict[str, Any]] = []
            for key, claims_for_value in distinct.items():
                sample = claims_for_value[0]
                citations: list[str] = []
                excerpts: list[dict[str, str]] = []
                
                for c in claims_for_value:
                    citations.extend(list(c.sources))
                    # Try to find excerpt for each source
                    for src in c.sources:
                        # Parse citation format: path#L123
                        if "#L" in src:
                            src_path = src.split("#L")[0]
                            chunk = chunks_by_path.get(src_path)
                            if chunk:
                                chunk_lines = chunk.text.splitlines()
                                # Skip [FILE] and [HEADING] markers
                                content_lines = [l for l in chunk_lines if not l.startswith("[")]
                                if content_lines:
                                    excerpt_text = " ".join(content_lines[:3])[:200].strip()
                                    if excerpt_text and excerpt_text not in [e["text"] for e in excerpts]:
                                        excerpts.append({"citation": src, "text": excerpt_text})
                
                citations = sorted({c for c in citations if c}, key=lambda s: s.casefold())
                value_blocks.append(
                    {
                        "value": sample.value,
                        "sources": citations[:6],
                        "excerpts": excerpts[:3],  # Limit to 3 excerpts per value
                    }
                )

            conflict: dict[str, Any] = {"entity": entity, "attribute": attr, "values": value_blocks}

            if args.adjudicate and len(conflicts) < max(0, args.max_conflicts):
                try:
                    conflict["adjudication"] = _adjudicate_conflict(
                        entity=entity,
                        attribute=attr,
                        values=value_blocks,
                        llm_provider=args.llm_provider,
                        llm_model=args.llm_model,
                    )
                except Exception as exc:
                    conflict["adjudication"] = {
                        "is_conflict": None,
                        "severity": None,
                        "reason": f"adjudication failed: {exc}",
                        "suggested_followup": "Re-run with a working LLM configuration.",
                    }

            adjudication = conflict.get("adjudication")
            if isinstance(adjudication, dict) and adjudication.get("is_conflict") is False:
                non_conflicts.append(conflict)
            else:
                conflicts.append(conflict)

    # Sort conflicts for stable review.
    conflicts.sort(key=lambda c: (str(c["entity"]).casefold(), str(c["attribute"]).casefold()))
    non_conflicts.sort(key=lambda c: (str(c["entity"]).casefold(), str(c["attribute"]).casefold()))

    report = _build_report(
        scanned_files=files,
        roots=roots_list,
        conflict_scope=str(args.conflict_scope),
        include_history_entities=bool(args.include_history_entities),
        collection_name=collection_name,
        persist_dir=os.path.relpath(persist_dir, start=str(REPO_ROOT)).replace(os.path.sep, "/"),
        embedding_provider=args.embedding_provider,
        llm_provider=args.llm_provider,
        llm_model=args.llm_model,
        entities=sorted(entities, key=lambda e: e.casefold()),
        claims_by_entity=claims_by_entity,
        conflicts=conflicts,
        non_conflicts=non_conflicts,
        started_at=started_at,
    )

    output_path = (REPO_ROOT / args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding="utf-8")

    if args.print_report:
        sys.stdout.write(report)
        return 0

    sys.stdout.write(
        "\n".join(
            [
                f"Wrote report: {_rel(output_path)}",
                f"Scanned files: {len(files)}",
                f"Indexed chunks: {len(chunks)}",
                f"Entities audited: {len(entities)}",
                f"Conflicts: {len(conflicts)}",
                f"Review items: {len(non_conflicts)}",
                f"Chroma: {os.path.relpath(persist_dir, start=str(REPO_ROOT)).replace(os.path.sep, '/')}/{collection_name}",
            ]
        ).strip()
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
