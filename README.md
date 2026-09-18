# Pentaryn

A D&D 5.5e campaign vault and the Foundry VTT automation that runs it.

The lore lives in Markdown under `world/`. The table runs in Foundry VTT — server, tunnel,
assets, actors, modules and an unattended updater, all driven from this repo. A local MCP
server (`dnd-scripts`) exposes SRD lookups, vault search and repo operations to Claude Code.

## Layout

| Path | What's in it |
|---|---|
| `world/` | The campaign vault — factions, locations, NPCs, parties, per-event history, house rules |
| `characters/` | Player characters — a stat file and a `.narrative.md` companion each |
| `campaigns/` | Campaign framing and handouts. Currently **Ardenford Underdogs** |
| `oneshots/` | Self-contained adventures. Currently **Space Journey / Twenty-One** |
| `sessions/` | Per-session transcripts and notes. Audio lives in OneDrive, not here |
| `items/` | Magic and notable items |
| `staging/` | Drafts on their way to a permanent home. Never link into it from canonical lore |
| `adhok_notes/` | Loose one-off notes that were never filed |
| `foundry/` | Foundry-side data — the actor contract, generated actors, update policy, tunnel config, five in-house modules |
| `scripts/` | Python tooling: SRD client, vault search, timeline renderer, Foundry pipeline, the MCP server |
| `automation/` | The Saturday auto-updater — launchd jobs, smoke test, notifier |
| `context/` | Instructions for Claude, sharded by domain. Start at [`CLAUDE.md`](CLAUDE.md) |
| `templates/` | Content skeletons you copy |
| `fonts/` | The `dnd-dice` font and its install notes |

## Getting set up

```bash
uv sync                      # create .venv and install
make vtt-status              # is Foundry up?
make vtt-up                  # server + cloudflare tunnel
```

`make` with no target lists everything. Day-to-day Foundry operation is documented in
[`context/foundry/ops.md`](context/foundry/ops.md).

## Working in here with Claude

[`CLAUDE.md`](CLAUDE.md) is a routing table, not a manual — it points at the one context file
your task needs. Two trees under `context/`:

- **`context/<domain>/`** — how to *use* something that exists.
- **`context/plans/`** — how something was *built*. History, kept deliberately.

## Secrets

Nothing sensitive is committed. The Foundry license key and server admin password live in
Infisical and are read at the point of use; see [`scripts/foundry/README.md`](scripts/foundry/README.md).
