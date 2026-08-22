# CLAUDE.md — routing only

D&D 5.5e campaign vault plus the Foundry VTT automation that runs it. Current campaign:
**Space Journey / Twenty-One**, in Foundry world `ardenhaven`.

This file is auto-loaded into every session, so it stays short. Anything longer than two
lines belongs in `context/`, and this table is how you find it.

## Always

- **When a request maps to an MCP tool, use the MCP tool** — never shell out to the script
  behind it. `./.venv/bin/python scripts/mcp/server.py --list-tools` lists them.
- **Secrets live in Infisical, never in this repo.** Never write a secret value to a file, a
  log, stdout, or a command-line argument; read it at the point of use. If the Infisical CLI
  reports an auth failure, stop and tell Joe to run `infisical login` — do not prompt for the
  value, hardcode it, or invent a `.env`. Retrieval helpers: `scripts/foundry/README.md`.
- **Never read these** — build artifacts, high token cost, zero signal:
  `.cache/` `.output/` `.state/` `.history/` `.venv/` `__pycache__/`
  `world/**/_history.*.svg` `world/**/_timeline.*.svg`

## Route by task

Open the entry point, then only what it points to. Every context file opens with a
"**Read this when**" line — if it doesn't match your task, close it.

| Doing… | Read first |
|---|---|
| Anything in Foundry — scenes, actors, tokens, server, tunnel, updater, assets | [`context/foundry/README.md`](context/foundry/README.md) |
| The current one-shot — scene state, cast, IDs, what's still unbuilt | [`context/space-journey.md`](context/space-journey.md) |
| World & lore authoring — where files go, naming, frontmatter, combat NPCs | [`context/world/README.md`](context/world/README.md) |
| Timeline events and the history SVGs | [`context/world/timelines.md`](context/world/timelines.md) |
| SRD lookups, vault search, campaign-time math — tool semantics and quirks | [`context/tools.md`](context/tools.md) |
| Creating content from a skeleton | [`templates/README.md`](templates/README.md) |
| How something was designed or migrated (history, not instructions) | [`context/plans/`](context/plans/) |

## The two trees under `context/`

- **`context/<domain>/`** — how to *use* something that exists. Read before acting.
- **`context/plans/`** — how something was *built*. Design docs and migration records, kept
  as history. Never load one to operate the thing it describes.

Design a new system → write the plan in `context/plans/`. Ship it → write the use-doc in its
domain folder. Don't leave the plan as the only documentation.
