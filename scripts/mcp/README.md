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
`all` is the same as unset; any other name loads only modules whose `MCP_GROUPS` lists it.
At startup the left-out scripts are one stderr line, `[mcp-server] N script(s) excluded by
DND_MCP_TOOLS_GROUP=<name>`, so only real failures are listed one per line; `--list-tools`
still names each excluded script and its groups.

## Error channels

A failing call reaches the caller one of two ways, and the tool decides which:

| Channel | What the caller sees | Tools |
|---|---|---|
| **Raise** (the default) | a JSON-RPC error `-32000` whose message is the exception text; the traceback goes to the server's stderr (Claude Code's MCP log) | every in-process tool (`lore`, `srd5_2`, `ages_converter`, `roll_dice`, `combat_actions_list`); every subprocess tool, when the script exits non-zero (`check_lore_links` does so when a check fails, so its report arrives as the error message) |
| **`{"ok": false, "error": …}`** in a successful result | a normal tool result; parse `ok` | `combat_action_upsert` only — callers already parse `ok`, so it keeps that shape |

**New tools raise.** Do not add a second `{ok: false}` tool. A subprocess tool's success-path
stderr is appended to its result under `[warnings from <script>]`, not dropped.

Every tool declares MCP `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`, plus a `title`); `test_dnd_scripts_contracts.py` fails if one is missing.

## Action log

When `PENTARYN_MCP_LOG_DIR` is set (the same switch as the Foundry fork's log), every
`tools/call` appends one line to `<dir>/dnd-scripts-<YYYY-MM>.jsonl`:
`{ts, server: "dnd-scripts", tool, mode: "inprocess"|"subprocess"|"rejected", args, ok, ms, error}`.
A call the server refuses before running it — unknown tool, non-object `arguments`, or
server busy — is logged too, with `mode: "rejected"`, the tool name as given, `ok: false`,
`ms: 0` and the same error text the caller got.
Argument values longer than 2 KB (after JSON encoding) are truncated with a marker. There is
no `client` field — a stdio server never learns who called it. Unset, nothing is written; a
log write that fails goes to stderr and never fails the call. `make foundry-eval-report`
reads these files beside the fork's.
