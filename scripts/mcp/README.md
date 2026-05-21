# MCP Servers (Local)

This folder contains MCP servers that expose repo-local tooling to an MCP-capable client (e.g., Codex).

## Run

The server is launched by your MCP client over stdio (see VS Code setup below).
To run it manually: `./.venv/bin/python scripts/mcp/server.py`.

## VS Code setup

This repo includes a workspace MCP config at `.vscode/mcp.json` that registers the `dnd-scripts` server.

- Ensure your venv exists at `./.venv` (e.g. `uv sync` / `uv venv`).
- Reload VS Code (Command Palette: `Developer: Reload Window`).
- Check `View -> Output -> MCP Server Logs` to confirm `dnd-scripts` started and tools were detected.

## Codex setup

- `./.venv/bin/python scripts/mcp/manage_codex_config.py` installs/refreshes the managed block in `~/.codex/config.toml`.
- Restart Codex / reload your editor to pick up the new server.
  - Verify with `codex mcp list` (it should show `dnd-scripts`).

## Tools (current)

The server auto-discovers ~70 tools by scanning `scripts/` for modules exposing an
`MCP_TOOL` marker. Run `./.venv/bin/python scripts/mcp/server.py --list-tools` for
the live list, including which tools run in-process (fast) vs. in a subprocess.
