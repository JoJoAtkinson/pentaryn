# Codex MCP Setup (Repo-Local Helper)

This repo includes a local MCP server at `scripts/mcp/server.py`.

Because Codex discovers MCP servers at startup, you need a config entry that tells Codex how to launch the server.

## Setup

1. Install/refresh the MCP server entry into your user config:
   - `make codex-config` (or `make codex-install`)
   - This adds/updates a managed block inside `~/.codex/config.toml`.

2. Restart Codex / reload VS Code window.

## Remove

- `make codex-uninstall`
