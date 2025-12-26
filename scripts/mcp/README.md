# MCP Servers (Local)

This folder contains MCP servers that expose repo-local tooling to an MCP-capable client (e.g., Codex).

## Run

- `make mcp`

This starts `scripts/mcp/server.py` over stdio.

## VS Code setup

This repo includes a workspace MCP config at `.vscode/mcp.json` that registers the `dnd-scripts` server.

- Ensure your venv exists at `./venv` (e.g. `uv sync` / `uv venv`).
- Reload VS Code (Command Palette: `Developer: Reload Window`).
- Check `View -> Output -> MCP Server Logs` to confirm `dnd-scripts` started and tools were detected.

## Codex setup

- `make codex-config` (or `make codex-install`) installs/refreshes the managed block in `~/.codex/config.toml`.
- Restart Codex / reload your editor to pick up the new server.
  - Verify with `codex mcp list` (it should show `dnd-scripts`).

## Tools (current)

- `year_to_age` — converts an A.F. year (e.g. `4150`) to an age glyph label (e.g. `ᛏ200`)
- `age_to_year` — converts an age glyph label back to an A.F. year
- `age_convert` — auto-detects which direction to convert

All tools execute the **latest** `scripts/ages_converter.py` in a subprocess, so updating the converter does not require changing the MCP server code.
