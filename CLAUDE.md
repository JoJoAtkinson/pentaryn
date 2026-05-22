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
- **No default source filter** for SRD search tools. With `source` unset, all sources are searched; results are *ranked* (srd-2024 first, third-party middle, srd-2014 last) but nothing is hidden. Pass an explicit `source='...'` (single key or comma-separated list) to hard-filter; pass `''` for no filter and no priority sort (raw API order).
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

## Combat Runner — the default at-table tool

For running combat live at the table, use the **PySide6 GUI** at `combat-runner/gui/` (`make combat-gui`). It's tab-per-combatant (NPCs **and** PCs), using a `<who> <stream>` grammar (`2 8 melee` for 8 melee damage to #2, `2 2` for action #2, `3 prone` for conditions, `3 tail-sweep` for fuzzy action-by-name), with permanent repeated-digit combatant ids, a live HP overlay, declarative reactions, mob support (`m<n>` targeting), universal actions, always-on async LLM review (`⟳ review:` log lines), `note <text>` for LLM-free log entries, `/reorder` and `/quit` slash commands, and player tabs with generic action chips. See [`combat-runner/gui/README.md`](combat-runner/gui/README.md) for the full grammar cheat-sheet, party roster schema, architecture, and headless-testing notes.

The old Haiku-Claude-Code CLI launcher at `combat-runner/launch.py` is still around as a fallback (NPC-only, no player support) but the GUI is the snappy default.

## Combat PCs / party roster

Player characters are first-class combatants in the GUI: each active player gets their own tab and is addressable by a permanent repeated-digit id. PCs are **not** authored as `.md` files and have **no entries** in `actions.jsonl`. They come from a party roster YAML:

- **File:** `world/party/<party>/combat-roster.yml`
- **Schema:** `party: <name>`, `players: [{name, id, max_hp, ac}]`
- **`id` must be a repeated-digit string** (`"1"`, `"22"`, `"333"` …) — non-uniform ids cannot be addressed by the `<who> <stream>` grammar.
- Load at launch: `python -m gui.app --party world/party/black-ledger/combat-roster.yml`
- See [`combat-runner/gui/README.md`](combat-runner/gui/README.md) for the full schema, picker UI, and player tab details.

## Combat NPCs (`#combat-runner` tag)

A combat-runner NPC is **one .md file + one or more rows in the central actions DB** at `combat-runner/actions.jsonl`:

- **`<slug>.md`** — human-readable stat sheet under `world/.../npcs/`. Status line, start-of-turn checklist, tactics, description. The `#combat-runner` frontmatter tag is what the launcher discovers. The .md does NOT contain a verb table or roll mechanics — that lives in the DB.
- **DB rows** — composite key `(npc_slug, action_name)`. Authored via the **`combat_action_upsert`** MCP tool (validates the spec before writing — malformed input bounces with a specific error). One row per action.

The shared operating protocol is at [`templates/npc-combat-protocol.md`](templates/npc-combat-protocol.md). Authoring template is at [`templates/npc-combat-runner-template.md`](templates/npc-combat-runner-template.md) (covers the .md + the spec schemas for `combat_action_upsert`).

### Encounter folder convention (how the runner discovers things)

The launcher (`combat-runner/launch.py`) finds encounters by:

1. Scanning every `world/**/*.md` for the literal string `#combat-runner` in the first ~30 lines.
2. From each tagged NPC file, walking the parent path **upward past any directory named `npcs`**. The first non-`npcs` directory is the **encounter root**.
3. Pre-loading **every `.md` file** under that encounter root (recursive, excluding `image/`, `.history/`, `.cache/`, `.output/`) into the Haiku session's context.
4. Querying the actions DB for every action belonging to the discovered NPC slugs, then injecting a compact "Ready actions" reference into the system prompt so Haiku knows what verbs and actions are callable.

That means:

- An NPC at `world/factions/<faction>/locations/<encounter>/npcs/<slug>.md` belongs to encounter `<encounter>`. Its DB rows are keyed by `npc=<slug>`.
- Anything you drop in `<encounter>/` alongside the `npcs/` folder (e.g. `_overview.md`, `terrain.md`, `hooks.md`) becomes Haiku scene context. Use this — Haiku will not go read referenced files.
- The encounter NAME shown in the launcher is the folder name (kebab-case slug).

### Creating or extending a `#combat-runner` NPC (Opus, do this)

When Joe asks for a new combat NPC ("make me a CR3 frost yeti for mountin-pass", "add an NPC to <encounter>"):

1. **Use [`templates/npc-combat-runner-template.md`](templates/npc-combat-runner-template.md)** as the canonical starting point. It documents the .md skeleton + the spec dict shape per action type, with concrete examples.
2. **Do NOT use `templates/creature-combat-ready-template.md`** — deprecated for combat-runner NPCs.
3. Save the .md at `world/.../<encounter-name>/npcs/<slug>.md`. Create the encounter folder + `npcs/` subfolder if needed.
4. If creating a **new encounter**, also drop a short `_overview.md` at the encounter root — terrain, light, hazards, hooks — Haiku gets it as scene context.
5. The .md frontmatter MUST include `#combat-runner` in the `tags` array (literal string, with the hash). Without it, discovery skips the NPC.
6. **Author each action with `combat_action_upsert`.** The tool validates the spec on write — type must be one of `multiattack | single_attack | area | utility | reaction`, required fields per type are checked. Bad spec → `{"ok": false, "error": "..."}` and the DB doesn't change. Good spec → row written, DB sorted, ready for the next launcher run.
7. **Pre-compute every roll**: `to_hit_bonus`, `damage_modifier`, save DCs are baked in. No ability-score derivations. PC saves and skill checks become `[ASK PLAYER]` — express them as `rider_on_hit` (per-attack rider), `pre_save` (before-attack save), or `area.save` / `reaction.attacker_save`.
8. For SRD-derived creatures, use `search_monsters(name=...)` to pull canonical stats before shaping into the template.
9. After upserting all actions, **run `python scripts/combat_actions_db.py validate`** — every DB row should pass. `... list --npc <slug>` to confirm the actions are in.

Reference exemplar: [`world/factions/garhammar-trade-league/locations/mountin-pass/npcs/glacier-stalker.md`](world/factions/garhammar-trade-league/locations/mountin-pass/npcs/glacier-stalker.md). Its DB rows in [`combat-runner/actions.jsonl`](combat-runner/actions.jsonl) exercise every action type — multiattack (including a multiattack-with-prereq, Pounce), single_attack, area (with recharge), utility, reaction.

## Don't read these directories

Build artifacts and caches — high token cost, zero signal:

- `.cache/` (HTTP cache for SRD lookups)
- `.output/` (generated PDFs, reports, vector DB)
- `.history/` (VSCode local history)
- `world/**/_history.*.svg` and `world/**/_timeline.*.svg` (generated)
- `.venv/`, `__pycache__/`

## Project-specific terms (already in `.vscode/cspell.json`)

If you're flagging spell-checker hits in code or docs, check the project dictionary before suggesting renames — character/place/faction names are intentional.
