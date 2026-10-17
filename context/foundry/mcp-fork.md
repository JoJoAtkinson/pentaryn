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

- Repo, per host: Mac `/Users/joe/Documents/GitHub/foundry-vtt-mcp` · BOSS (WSL, the primary
  since 2026-10-15) `/home/joe/code/foundry-vtt-mcp`, on the Linux filesystem, never under
  `/mnt/c` (cloned and built 2026-10-16). Branch `pentaryn` (fork of
  `adambdooley/foundry-vtt-mcp`; remote `upstream`). Claude Code runs its built wrapper,
  `packages/mcp-server/dist/index.js` (`.mcp.json` in this repo). **`.mcp.json` holds the
  Mac's absolute paths**; BOSS overrides it with a local-scope server of the same name
  (`claude mcp add --scope local foundry -e FOUNDRY_CONNECTION_TYPE=websocket -e
  PENTARYN_MCP_LOG_DIR=/home/joe/code/pentaryn/foundry/logs -- node
  /home/joe/code/foundry-vtt-mcp/packages/mcp-server/dist/index.js`, stored in `~/.claude.json`).
- **`FORK.md`** at the fork root lists every upstream file the fork edits — hunks, purpose, local
  vs upstream-PR candidate, covering test. `scripts/fork-footprint.sh` fails when an upstream file
  is touched without a row there. Run it before committing anything outside `src/fork/`.
- Everything the fork adds lives under `src/fork/`:

| Path | What |
|---|---|
| `packages/mcp-server/src/fork/index.ts` | builds the registry; one `registerX(registry, client, logger)` per tool |
| `packages/mcp-server/src/fork/registry.ts` | `ForkRegistry`: register, dispatch, tool filter, action log |
| `packages/mcp-server/src/fork/content.ts` | `__mcpContent` passthrough (image blocks) |
| `packages/mcp-server/src/fork/tools/*.ts` | the tools: `eval-js`, `prompt-markers`, and (wave-2 build) `pentaryn-read` / `pentaryn-write` over the one template in `pentaryn-call.ts` (each + its vitest) |
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

| Contract | Use for | In a pentaryn module (kit 1.0.2, `foundry/lib/queries.mjs`) | In the fork |
|---|---|---|---|
| **GM-only query** | anything an MCP tool calls; anything that writes as the GM | `guarded(fn)` — rejects a non-GM sender and a non-GM running client with `NOT_GM` (`"<name> is not a GM"`, `"this client is not a GM"`) | `requireGM(ctx)` in `handlers.ts` (same two checks). From the wave-2 build it throws the coded form (`NOT_GM: Access denied: …`, `code: "NOT_GM"`), and upstream's own `foundry-mcp-bridge.*` handlers get the sender check too (`guardBridgeQueries`) |
| **Player relay** | a player's client asking the GM to do something it may not | `relayed(fn, { activeGM: true })` — any sender, runs only on the active GM's client (`NOT_GM: this client is not the active GM`); the handler checks the sender (`ctx.user`) owns what it touches | — |

A module declares which one per API row: a manifest row with `relay: true` registers through
`relayed`, every other query row through `guarded` — see
[`addon-blueprint.md` §5.1a](addon-blueprint.md#51a-manifest-row-reference). Error codes are part
of the contract: LLM tooling matches on `NOT_GM`, not on the prose.

## `pentaryn-read` and `pentaryn-write` (wave-2 build)

Typed calls into a blueprint module's manifest, so a `game.pentaryn.<ns>.<path>` call needs no
`eval-js` (D14; design: [`../plans/addon-blueprint-2026-10/wave-2-bridge-plan.md`](../plans/addon-blueprint-2026-10/wave-2-bridge-plan.md) §2–§3).
Both send one fixed script through the GM-guarded `foundry-mcp-bridge.fork.eval` query; the only
variable part is a JSON literal, so no JavaScript is built from caller strings. In the GM tab it
reads `game.pentaryn[ns].describe()` on every call and routes on the row.

| Tool | Args | Runs | Action-log line (`mcp-<YYYY-MM>.jsonl`) |
|---|---|---|---|
| `pentaryn-read` | `{ns, path, ref?, opts?, timeoutMs?}`; `{ns: "*", path: "describe" \| "inspect"}` for the root | rows that declare `writes: false`, plus the kit's `describe` / `inspect` / `selftest` | compact: `{ts, tool, ns, path, ref, ok, code?, ms, client?}` — no args, no result; same file as the writes (W2-B2: code and this doc agree, 2026-10-11 — the `actions` stream; awaiting Joe's confirm) |
| `pentaryn-write` | the same, plus `dryRun?` | rows with `writes: true` only | a write line with the args, `ok`, `code`, `summary` (`<ns>.<path> [ref] [(dry run)] — ok\|<code>`) and `ids` — the module's own `ids`, else the documents its result returns (`uuid`, else `_id`, else a Foundry-shaped `id`; depth ≤ 4, ≤ 50; optfix build); `[]` for a dry run or a refusal |

- **Arguments map onto the row's `params`:** a param named `ref` takes `ref`; `opts` / `options`
  takes `opts`; any other param takes `opts[<its name>]` (`rules.search(query, opts)` →
  `{opts: {query: "grapple", limit: 3}}`). Leftover opts keys, or a `ref` on a row without one,
  are `BAD_ARGS`.
- **Refusals are values** `{ok: false, ns, path, code, reason}`, never a throw for an expected
  case. `NOT_FOUND` lists what exists (`namespaces`, or `paths` + `writes`); a read row on the
  write tool (or the reverse, or a row with no `writes` key on the read tool) is `BAD_ARGS`; a
  module's coded error (`AMBIGUOUS`, `NOT_GM`, `REFUSED`, `CONFLICT`, …) keeps its code.
- **`dryRun`** reaches only a row that declares one (`row.dryRun === true`, or a param whose type
  or doc names `dryRun`, e.g. `importer.import`); any other write row refuses it with `BAD_ARGS`
  rather than running for real.
- **A param that needs a live Document** (`journal.add(doc)`, `attunement.stash(owner, …)`,
  `names.sync`) is refused with `BAD_ARGS: … needs a live Document — eval-js only`.
- Results come back plain: Documents → `{_document, _id, name, uuid}`, depth ≤ 12, arrays ≤ 200.
  A namespace without `describe()` (not yet migrated) is `NOT_FOUND`: `eval-js` only.

## Other fork queries (wave-2 build)

| Query | Called by | What |
|---|---|---|
| `foundry-mcp-bridge.fork.eval` | `eval-js`, the D14 tools | runs the script; on a timeout the result carries `timedOut: true` and a note that the script may still be running — re-read state before retrying |
| `foundry-mcp-bridge.fork.applyRecharge` | `dnd5e-add-feature`'s `recharge` (2–6) | gives the feature Recharge n–6 (`src/fork/recharge.ts`); resolves the actor exactly, and an `itemId` never falls back to a name. The outcome rides on the add-feature action-log line |

The wrapper that adds the sender check to upstream's `foundry-mcp-bridge.*` handlers
(`guardBridgeQueries`) also fills in `toggle-token-condition`'s `active` when it is omitted: the
opposite of whether the token's actor has the condition now (`src/fork/toggle-condition.ts`,
optfix build). Upstream's schema always said "omitted = toggle"; its handler refused it.

**`toggle-token-condition` only finds tokens on the GM's viewed scene.** Upstream's handler looks
the `tokenId` up in `game.scenes.current` (the scene the bridge's GM tab is viewing, not the
active one; `data-access.ts` `toggleTokenCondition`), not across the world, so a token on any
other scene fails as not found even with the right id. View that scene in the GM tab first
(`eval-js`: `await game.scenes.get(id).view()`, which moves no player), or set the condition
through `eval-js` on the token's actor. Seen live in W3L (merge-and-go-live-2026-10-11, "Live checks").

## Build, restart, verify

```bash
cd /Users/joe/Documents/GitHub/foundry-vtt-mcp   # BOSS: cd /home/joe/code/foundry-vtt-mcp
npm -w @foundry-mcp/server run typecheck
npm -w @foundry-mcp/server test -- --run      # vitest, includes the timeout and dnd5e 6 suites
npm -w @foundry-mcp/module run typecheck
npm -w @foundry-mcp/module test -- --run      # vitest for the bridge module's src/fork (wave 2)
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
| `FOUNDRY_MCP_TOOL_FILTER` | comma-separated deny-globs; a matching tool (fork **or** upstream) is hidden from `tools/list` **and** refused at call time (`Tool '<name>' is disabled by FOUNDRY_MCP_TOOL_FILTER`; before the wave-2 build a filtered upstream tool was only hidden) |

The month in every file name is taken when the line is written, so a long-lived server rolls over
by itself.

- `mcp-<YYYY-MM>.jsonl` — one line per **write** call: `{ts, tool, action?, args (truncated at
  2 KB per value), ok, phase?, code?, summary?, ids?, error?, ms, client?}`, plus one compact line
  per `pentaryn-read` call (`{ts, tool: "pentaryn-read", ns, path, ref, ok, code?, ms, client?}` —
  no `args`, which is how to tell it from a write line; W2-B2). From the wave-2
  build that covers the upstream write tools too (`create-*`, `update-*`, `delete-*`, `manage-*`,
  `dnd5e-*`, `move-token`, `toggle-token-condition`, `use-item`, the ownership tools, … — the list
  is `src/fork/upstream-writes.ts`), and `ok` is `false` when a handler reports failure as a value
  (`{ok: false}`), not only when it throws. `eval-js`'s line carries `{purpose, scriptChars,
  timeoutMs}` as `args`; the script itself is only in the eval log. A call `eval-js` rejects for
  its own arguments has `phase: "args"` and a one-line `error` (`script: …; timeoutMs: …`) here
  too, as in the eval log (optfix build; before it the line had no phase and the multi-line
  validation text).
- `eval-<YYYY-MM>.jsonl` (wave-2 build; `eval.jsonl` keeps everything before it and is left in
  place) — one line per `eval-js` call: `{ts, purpose, script (never truncated), ok, phase, error?,
  timedOut?, ms, client?}`. Phases: `complete`, `runtime`, `compile` (from Foundry); `transport` — the call
  never reached Foundry; `args` — `eval-js` rejected its own arguments and sent nothing.
- `client: {pid, ppid}` — the MCP wrapper process that made the call (one per Claude session) and
  its parent; a wrapper older than the wave-2 build sends none.
- `dnd-scripts-<YYYY-MM>.jsonl` — the dnd-scripts server's own per-call log, when its entry in
  `.vscode/mcp.json` sets `PENTARYN_MCP_LOG_DIR` ([`../../scripts/mcp/README.md`](../../scripts/mcp/README.md)).

All of it is campaign data for deciding which `eval-js` uses earn a typed tool — see
[`README.md`](README.md) ("The action log is the promotion mechanism"). `make foundry-eval-report
[SINCE=YYYY-MM-DD] [JSON=1]` reads every one of these files (globbing `eval*.jsonl`, so both eval
names) and prints the review.

## Upstream

Upstream edits are small `// fork:`-marked hunks, each with a FORK.md row; logic moves into
`src/fork/` behind one call wherever it can. PR candidates (the per-query timeout, the dnd5e 6
port, the `mapGenAutoStart` default) go upstream and then leave FORK.md. Rebase onto a new upstream
release, then `scripts/fork-footprint.sh` and the vitest suite before building.

## Control-channel additions

- **`foundry_ping`** (2026-10-17) on the backend's control port `127.0.0.1:31414` (JSON lines,
  `{"id","method":"foundry_ping"}`): a real round trip to the module (`foundry-mcp-bridge.ping`,
  5 s timeout), answered `{ok, ms}` or `{ok: false, error}`. Not a tool call, so it never reaches
  the action log. The headless GM watchdog calls it every tick ([`headless-gm.md`](headless-gm.md) `BRIDGE_STALE`).
