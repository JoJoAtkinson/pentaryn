# Claude Code instructions

For repo conventions, file locations, naming, frontmatter, and timeline workflows: see [AGENTS.md](AGENTS.md). The rules below are Claude-Code-specific additions that complement it.

## Golden rule (reinforces AGENTS.md)

**When a request maps to an MCP tool, use the MCP tool. Don't shell out to the underlying script.**

Run `/Users/joe/GitHub/dnd/.venv/bin/python scripts/mcp/server.py --list-tools` to see every tool available, including which are in-process (fast) vs. subprocess (slower).

## MCP usage hints — `dnd-scripts` server

### SRD lookups (in-process, disk-cached)

- `search_*` tools (monsters, spells, magic items, weapons, armor, rules) return **full entries inline**, not summaries. You usually don't need to chain `search_X → get_X_details`.
- Use `get_*_details` only when you already know the slug/key — it's a faster single-record path.
- **Name search is loose:** `search_monsters(name='goblin')` matches monsters whose *lore text* mentions goblins, not just goblin-named monsters. For exact matches use `get_monster_details(slug='goblin')`.
- For `search_rules` vs `get_rule_section`: search for keyword discovery, get for full text once you have the slug.
- Open5e mixes SRD with third-party sources (Tome of Beasts, Kobold Press). If a result's `document__slug` is `wotc-srd`, it's official 5e SRD.

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
