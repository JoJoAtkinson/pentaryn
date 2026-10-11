---
title: "The foundry-vtt-mcp fork — working on the MCP bridge"
status: active
last_modified: 2026-10-11
tags: [context, foundry, mcp, fork]
---

# The foundry-vtt-mcp fork

**Read this when:** adding or changing a tool on the Foundry MCP bridge (`mcp__foundry__*`), a
browser-side query a tool calls, or anything in the fork's repo — build, restart, logs, rebasing on
upstream. **Not this file:** calling the tools at the table → [`README.md`](README.md) (action log,
Module APIs) · the design history → [`../plans/foundry-mcp-fork.md`](../plans/foundry-mcp-fork.md)
· the audit findings → [`../plans/code-audit-2026-10/mcp-fork.md`](../plans/code-audit-2026-10/mcp-fork.md).

## Where it is

- Repo: `/Users/joe/Documents/GitHub/foundry-vtt-mcp`, branch `pentaryn` (fork of
  `adambdooley/foundry-vtt-mcp`; remote `upstream`). Claude Code runs its built wrapper,
  `packages/mcp-server/dist/index.js` (`.mcp.json` in this repo).
- **`FORK.md`** at the fork root lists every upstream file the fork edits — hunks, purpose, local
  vs upstream-PR candidate, covering test. `scripts/fork-footprint.sh` fails when an upstream file
  is touched without a row there. Run it before committing anything outside `src/fork/`.
- Everything the fork adds lives under `src/fork/`:

| Path | What |
|---|---|
| `packages/mcp-server/src/fork/index.ts` | builds the registry; one `registerX(registry, client, logger)` per tool |
| `packages/mcp-server/src/fork/registry.ts` | `ForkRegistry`: register, dispatch, tool filter, action log |
| `packages/mcp-server/src/fork/content.ts` | `__mcpContent` passthrough (image blocks) |
| `packages/mcp-server/src/fork/tools/*.ts` | the tools: `eval-js`, `prompt-markers` (+ its vitest) |
| `packages/foundry-module/src/fork/handlers.ts` | the bridge module's own browser-side queries (`foundry-mcp-bridge.fork.*`) |

## Adding a server-side tool

1. New file `packages/mcp-server/src/fork/tools/<tool>.ts` exporting `register<Tool>(registry,
   foundryClient, logger)`; call it from `fork/index.ts`. Upstream files stay untouched.
2. `registry.register(definition, handler, { write })` — `definition` is `{name, description,
   inputSchema}`; validate args in the handler (zod, as `eval-js.ts` does).
3. `write`: `true` for a tool that changes world data, or a predicate over the args for one fat
   tool with an `action` enum (`prompt-markers` logs only `replace`). Writes go to the action log;
   reads do not. A predicate that throws counts as a write.
4. Return a plain object. `summary` (one line) and `ids` (string[]) are the fields the action log
   records; anything else is the tool's own payload. `{ __mcpContent: [blocks] }` passes MCP
   content blocks (images) through untouched.
5. The handler calls the browser with `foundryClient.query("<module>.<fn>", data, { timeoutMs })`
   (default 10 s, clamped 1–120 s).
6. Test with vitest beside the tool — `prompt-markers.test.ts`'s `setup()` stubs the client and
   registry; copy that pattern.

## Browser-side queries: the two contracts

A tool reaches the GM's browser through a `CONFIG.queries["<module>.<fn>"]` handler. Core calls a
handler two ways: the bridge calls `handler(data)` from this GM's own client, and `User#query`
calls `handler(data, {user})` on behalf of **another** user — and every player holds `QUERY_USER`.
So every handler is one of two named contracts (audit mcp-fork-24); never write a third:

| Contract | Use for | In a pentaryn module (kit 1.0.1, `foundry/lib/queries.mjs`) | In the fork |
|---|---|---|---|
| **GM-only query** | anything an MCP tool calls; anything that writes as the GM | `guarded(fn)` — rejects a non-GM sender and a non-GM running client with `NOT_GM` (`"<name> is not a GM"`, `"this client is not a GM"`) | `requireGM(ctx)` in `handlers.ts` (same two checks; plain `Error`) |
| **Player relay** | a player's client asking the GM to do something it may not | `relayed(fn, { activeGM: true })` — any sender, runs only on the active GM's client (`NOT_GM: this client is not the active GM`); the handler checks the sender (`ctx.user`) owns what it touches | — |

A module declares which one per API row: a manifest row with `relay: true` registers through
`relayed`, every other query row through `guarded` — see
[`addon-blueprint.md` §5.1a](addon-blueprint.md#51a-manifest-row-reference). Error codes are part
of the contract: LLM tooling matches on `NOT_GM`, not on the prose.

## Build, restart, verify

```bash
cd /Users/joe/Documents/GitHub/foundry-vtt-mcp
npm -w @foundry-mcp/server run typecheck
npm -w @foundry-mcp/server test -- --run      # vitest, includes the timeout and dnd5e 6 suites
npm run build:server                          # → packages/mcp-server/dist/
scripts/fork-footprint.sh                     # upstream footprint vs FORK.md
```

- **Server side:** after a build, `kill -9` the stale `backend.js` (never a plain `kill` — see
  [`README.md`](README.md) and `make foundry-bridge-status`); the next tool call respawns it.
  Sessions started before the rebuild see new tools within 30 s (the wrapper polls and announces
  `tools/list_changed`); older wrappers need `/mcp` → reconnect.
- **Module side** (`packages/foundry-module`): `npm run build:foundry`, then the built files go to
  `Data/modules/foundry-mcp-bridge` (done for `handlers.js` on 2026-10-10,
  [`../plans/prompt-markers.md`](../plans/prompt-markers.md) §12) and the GM tab reloads.
- Verify with one real call of the tool, then check its line in the action log.

## Environment and logs

| Variable | Effect |
|---|---|
| `PENTARYN_MCP_LOG_DIR` | where the logs go (`.mcp.json` sets `foundry/logs`); unset = nothing is logged, silently |
| `FOUNDRY_MCP_TOOL_FILTER` | comma-separated deny-globs; a matching tool (fork **or** upstream) is hidden and refused |

- `mcp-<YYYY-MM>.jsonl` — one line per **write** call: `{ts, tool, action?, args (truncated at
  2 KB per value), ok, summary?, ids?, error?, ms}`.
- `eval.jsonl` — one line per `eval-js` call: `{ts, purpose, script (never truncated), ok, phase,
  error?, ms}`; `phase: "transport"` means the call never reached Foundry.

Both are campaign data for deciding which `eval-js` uses earn a typed tool — see
[`README.md`](README.md) ("The action log is the promotion mechanism").

## Upstream

Upstream edits are small `// fork:`-marked hunks, each with a FORK.md row; logic moves into
`src/fork/` behind one call wherever it can. PR candidates (the per-query timeout, the dnd5e 6
port, the `mapGenAutoStart` default) go upstream and then leave FORK.md. Rebase onto a new upstream
release, then `scripts/fork-footprint.sh` and the vitest suite before building.
