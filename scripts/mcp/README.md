# `dnd-scripts` MCP server

A local stdio MCP server that exposes this repo's tooling to Claude Code. It auto-discovers
tools by scanning `scripts/` for modules that declare an `MCP_TOOL` / `MCP_TOOLS` literal —
adding a tool means adding that literal to a script, not editing the server.

## Running it

Registered for this workspace in [`../../.vscode/mcp.json`](../../.vscode/mcp.json). It is
launched by the client over stdio; you rarely start it by hand.

```bash
./.venv/bin/python scripts/mcp/server.py --list-tools   # the live tool list
./.venv/bin/python scripts/mcp/server.py                # run it manually
```

`--list-tools` also reports which tools run **in-process** (fast) and which shell out to a
**subprocess** (slower), plus every script it skipped and why.

## Tool semantics

Quirks worth knowing before you call something — SRD source filters, v1-slug vs v2-key,
`find_lore`'s substring matching, the expensive subprocess tools — are documented in
[`../../context/tools.md`](../../context/tools.md).

## Optional group filter

Set `DND_MCP_TOOLS_GROUP=combat` and only modules whose top-level `MCP_GROUPS` list contains
that group are loaded — a cold-start speed-up for a session that needs dice and stat blocks
but not the lore and timeline surface. Nothing sets it automatically; it is opt-in.
