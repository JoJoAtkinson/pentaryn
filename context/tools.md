---
title: "dnd-scripts MCP tools — semantics and quirks"
status: active
last_modified: 2026-08-22
tags: [context, mcp, srd, tools]
---

# dnd-scripts MCP tools — semantics and quirks

**Read this when:** doing SRD lookups, searching the vault, or calling any
`mcp__dnd-scripts__*` tool and wanting the right one on the first try.
**Not this file:** Foundry's own tools (`mcp__foundry__*`) → [`foundry/README.md`](foundry/README.md)

`./.venv/bin/python scripts/mcp/server.py --list-tools` prints the live list, including
which tools run in-process (fast) and which shell out to a subprocess (slower).

---

## SRD lookups (in-process, disk-cached, Open5e v2)

- `search_*` tools return **full entries inline**, not summaries. You usually don't need to
  chain `search_X → get_X_details`.
- `get_*_details` take a v2 **`key`** (`'srd-2024_goblin-warrior'`, `'srd-2024_fireball'`) —
  not a v1 slug. Use them when you already have the key and want one record fast.
- **Name search is name-only.** `search_monsters(name='goblin')` is a case-insensitive
  substring match on the name field; it does *not* search lore or description text. Pass
  `match='exact'` for exact-name lookups.
- **No default source filter.** With `source` unset, everything is searched and results are
  *ranked* (srd-2024 first, third-party middle, srd-2014 last) but nothing is hidden. Pass an
  explicit `source=` (single key or comma-separated) to hard-filter; pass `''` for no filter
  and no priority sort.
- **Conditions live under `'core'` and `'a5e-ag'`**, not `'srd-2024'`. `list_conditions`
  defaults to `'core,a5e-ag'`.
- `search_rules` needs a `query` for keyword discovery; `get_rule_section` fetches full text
  once you have the key.
- `get_spell_list` returns v1-style **slugs** (`'fireball'`), which do **not** match v2
  **keys** (`'srd-2024_fireball'`). To chain into `get_spell_details`, first call
  `search_spells(name=slug, match='exact')` and use the returned `key`. Better: skip it and
  use `search_spells(classes='srd-2024_wizard')`, which returns v2 keys directly.

## Local lore

`search_npcs`, `get_npc`, `get_faction_overview`, `last_session_summary`, `find_lore` read
the repo directly — no API. `find_lore` is a raw substring match with no word-boundary
tokenization, so `'writ'` matches `'written'`, `'writer'`, `'rewrite'`. Disambiguate with a
longer phrase. It returns at most one snippet per file.

## Combat action authoring

`combat_action_upsert` / `combat_actions_list` maintain `foundry/actions.jsonl`, the input to
`scripts/foundry/build_actors.py`. Upsert validates the spec on write — a bad spec returns
`{"ok": false, "error": ...}` and the DB is untouched. After a batch, run
`python scripts/combat_actions_db.py validate`. Actions are **executed in Foundry**, not
here.

## Campaign-time math

`age_convert` auto-detects the direction and is the default for free-form input. Use
`year_to_age` / `age_to_year` only when the input direction is known.

## Subprocess tools — slower, call sparingly

| Tool | Note |
|---|---|
| `pandoc_export_pdf` | Never invoke `scripts/pandoc-export.py` directly. Setup and troubleshooting: [`pdf-export.md`](pdf-export.md). |
| `build_timeline_svg` / `build_timeline_key` | **Broken until the renderer is replaced** — see [`world/timelines.md`](world/timelines.md). |
| `lore_inconsistency_report` | Indexes the whole vault into ChromaDB. Expensive — ask first. Needs `uv sync --extra vector`. |
| `fix_md_links` | Dry-run by default. Pass `write=true` only after reviewing the proposed changes. |
