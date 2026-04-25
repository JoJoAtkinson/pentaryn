# Claude Code instructions

For repo conventions, file locations, naming, frontmatter, and timeline workflows: see [AGENTS.md](AGENTS.md). The rules below are Claude-Code-specific additions that complement it.

## Golden rule (reinforces AGENTS.md)

**When a request maps to an MCP tool, use the MCP tool. Don't shell out to the underlying script.**

Run `/Users/joe/GitHub/dnd/.venv/bin/python scripts/mcp/server.py --list-tools` to see every tool available, including which are in-process (fast) vs. subprocess (slower).

## MCP usage hints — `dnd-scripts` server

### SRD lookups (in-process, disk-cached, v2)

- `search_*` tools return **full entries inline**, not summaries. You usually don't need to chain `search_X → get_X_details`.
- `get_*_details` tools take a v2 **`key`** (e.g., `'srd-2024_goblin-warrior'`, `'srd-2024_fireball'`) — not a v1 slug. Use after a search when you have the key and want a single-record fast fetch.
- **Name search is by name only:** `search_monsters(name='goblin')` does case-insensitive substring matching on the **name field** (via `name__icontains`); it does *not* match against lore/description text. Pass `match='exact'` for exact-name lookups.
- **Default source filter** for SRD search tools is `'srd-2024,srd-2014'` — prefers 5.5e content, falls back to 2014. Pass an explicit `source='...'` (single key, comma-separated list, or empty string for no filter) to override.
- **Conditions live under `'core'` and `'a5e-ag'`**, not `'srd-2024'`. `list_conditions` defaults to `'core,a5e-ag'`.
- For `search_rules` vs `get_rule_section`: search needs a `query` (required) for keyword discovery; get fetches full text once you have the key.
- `get_spell_list` returns v1-style spell **slugs** (e.g., `'fireball'`); these don't match v2 spell **keys** (e.g., `'srd-2024_fireball'`). To chain into `get_spell_details`, first call `search_spells(name=slug, match='exact')` and use the returned `key`.
- For local lore (NPCs, factions, sessions, free-text vault search), use the `lore.py` tools: `search_npcs`, `get_npc`, `get_faction_overview`, `last_session_summary`, `find_lore`. These read the repo directly — no API.

### Campaign-time math (in-process, mtime-checked)

- `age_convert` is the default for free-form input — it auto-detects year ⇄ label.
- Only use `year_to_age` / `age_to_year` when the input direction is known.

### Repo operations (subprocess, slower — call sparingly)

- `pandoc_export_pdf` → never invoke `scripts/pandoc-export.py` directly.
- `build_timeline_svg` / `build_timeline_key` → don't run the build scripts manually.
- `dnd_pass1` / `dnd_pass2` / `dnd_pass3` → session transcript pipeline; expensive, ask before running.
- `lore_inconsistency_report` → indexes the whole vault; expensive, ask before running.
- `fix_md_links` → defaults to dry-run; pass `write=true` only after reviewing the proposed changes.

## Don't read these directories

Build artifacts and caches — high token cost, zero signal:

- `.cache/` (HTTP cache for SRD lookups)
- `.output/` (generated PDFs, reports, vector DB)
- `.history/` (VSCode local history)
- `world/**/_history.*.svg` and `world/**/_timeline.*.svg` (generated)
- `.venv/`, `__pycache__/`

## Project-specific terms (already in `.vscode/cspell.json`)

If you're flagging spell-checker hits in code or docs, check the project dictionary before suggesting renames — character/place/faction names are intentional.
