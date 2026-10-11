---
title: Migration guide — the MCP fork (foundry-vtt-mcp) against the addon blueprint
status: plan
last_modified: 2026-10-10
tags: [foundry, mcp, fork, blueprint, plan, migration]
---

# Migrating the MCP fork to the blueprint

**Read this when:** you are about to change the MCP fork (`foundry-vtt-mcp`, branch `pentaryn`) in
the fix phase — its contract with the modules' `describe()`, the typed tools, the query guards, or
any `mcp-fork-*` finding. **Not this file:** a module's own migration → its
`migrate-pentaryn-<m>.md` · the blueprint rules → [`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) ·
the finding text → [`../code-audit-2026-10/mcp-fork.md`](../code-audit-2026-10/mcp-fork.md).

The fork is a **separate repo** (`~/Documents/GitHub/foundry-vtt-mcp`; set `FOUNDRY_MCP_FORK` to its
root). Nothing here edits it yet; this guide says what changes there, in which stage, and which half
of each contract lives in a module. Line numbers are the audit snapshot's (fork `59c781e`); re-anchor
by quoted text first.

| | |
|---|---|
| Findings | 26: mcp-fork-1, -2, -4 … -25 (24; -3 was dropped in verification as a feature) + prompts-lookup-11, -12 (fork tool halves) |
| Module-contract findings | mcp-fork-15, -20, -22, -24; prompts-lookup-11, -12 — they land **with** prompts, lookup, journal, riders (§3) |
| Parallel lane | the other 20 — no module folder touched (§4) |
| Joe decision | **D3 of the design record** (§9.3): split read/write fork tools **and** compact read logging. Until Joe takes it, §2 is a design, not a task |
| WAIT | no — but every module-contract step waits for its module's migration (prompts is Stage 2.10) |
| Effort | parallel lane ≈ 4–5 agent-days (all S except -10, -11); D14 tools ≈ 2 days after D3 |

## 1. What the blueprint changes for the fork

1. **Every module describes itself.** `game.pentaryn.<ns>.describe()` returns the manifest as JSON
   (use-doc §5.1a): `methods[]` with `path, params, returns, gm, writes, query, queryName?, relay?,
   throws?, legacy?, doc`. The fork no longer needs a hand table per module to know what exists.
2. **Queries come from manifest rows.** A row with `query: true` is
   `CONFIG.queries["<module id>.<queryName ?? path>"]`, wrapped by the kit's `guarded` (GM sender and
   receiver, coded `NOT_GM`) or, for `relay: true`, `relayed` (any sender, active-GM receiver). Those
   two are the **only** query contracts (mcp-fork-24).
3. **Refs resolve exactly.** A module's `ref` param goes through `resolveRef`: Actor, Token, UUID,
   16-char id, exact then case-insensitive name — **never a substring**. Ambiguity throws
   `AMBIGUOUS` on a read and returns `fail("AMBIGUOUS")` on a write.
4. **Writes are visible.** A row with `writes: true` returns `{ ok, … } | { ok: false, code, reason }`
   and never throws for an expected refusal.

## 2. D14 — `pentaryn-read` and `pentaryn-write` (after Joe decision D3)

The audit dropped mcp-fork-3 (one generic `pentaryn-api` tool with substring `$actor`) as a feature
proposal. The blueprint's D14 keeps the idea but splits it, so a write has its own approval surface
and substring matching never reaches a write path. It is a **feature**: build it only after Joe
takes decision D3.

**Tool schemas, built from `describe()` at call time** (no hand table):

| Tool | Input | Allowed rows | Logged |
|---|---|---|---|
| `pentaryn-read` | `{ ns, path, ref?, opts? }`, or `{ ns: "*", path: "describe" }` | rows with `writes: false` (and `describe`, `inspect`, `selftest`) | compact: `{ts, tool, ns, path, ref, ok, ms}` — no result body (D3) |
| `pentaryn-write` | `{ ns, path, ref?, opts, dryRun? }` | rows with `writes: true` only; a read row is refused with `BAD_ARGS: use pentaryn-read` | full: args (sanitised), `ok`, `code`, result `summary`/`ids` |

- Routing is by the row's `writes` flag, read from that namespace's `describe()` **in the browser**
  (one eval or query per call), never from a fork-side cache that can drift.
- `ref` is passed through unchanged; the **module's** bound row resolves it (`resolveRef`). The fork
  never resolves a pentaryn ref itself and never does substring matching for these tools (the
  bridge's own upstream tools keep theirs — design record §9.2).
- A `gm: true` row from a non-GM connection is refused by the module (`NOT_GM`), not by the fork.
- Unknown `ns`/`path` → `NOT_FOUND` listing the namespace's paths (from `describe().methods`).
- Results come back through the module's `toPlain` (Documents → refs); `inspect` is depth ≤ 4.
- The tool description names `game.pentaryn.describe()` as the discovery call (mcp-fork-21).

**Tests (fork side):** a fake `describe()` with one read and one write row; `pentaryn-read` refuses the
write row and vice versa; a write logs its args, a read logs no body; `ref: "Ald"` is passed through
(the module, not the fork, answers `NOT_FOUND`).

## 3. Contracts with modules — the fork-side halves

These land in the **same stage as the module half** named in each module's guide; neither side
merges alone.

| Finding | Module half (where) | Fork half (here) | Stage |
|---|---|---|---|
| mcp-fork-15 | prompts step 8: `KINDS`, `PATCH_KEYS` in `prompts-core.mjs`; step 14 `contract.test.mjs` | the zod schemas in `prompt-markers.schema.ts` (after -14) take their vocabularies from a checked-in JSON copy of the module's constants; a fork test compares the copy with `$PENTARYN_REPO/foundry/module/pentaryn-prompts/prompts-core.mjs`, skipping with a note when absent | 2.10 (with prompts) |
| prompts-lookup-11 | prompts step 8/14: `PATCH_KEYS` the live source, `KNOWN_DRIFT` table | fork test pins the same drift table (`character: ["folder"]`, `gather: ["from"]`); widening the schemas is a **declared** change, deferred (audit) | 2.10 |
| prompts-lookup-12 | prompts step 13: the manifest **is** the query table (`describe().queries`); `replaceMany` row with `queryName: "replace"` (kit 1.0.1, K8) | one `ACTION_TABLE` in `prompt-markers.ts` from which `QUERIES`, `TIMEOUTS`, `ACTIONS`, `SCHEMAS` derive; exported names unchanged | 2.10 |
| mcp-fork-24 | kit `guarded` / `relayed` (landed, kit 1.0.1); lookup, prompts (GM-only), journal, riders (relay) adopt them | the fork's own bridge handlers use one `assertSenderIsGM` with coded errors; the fork use-doc (mcp-fork-19) names the two contracts and links use-doc §5.1a | doc half Stage 0; code with -2 |
| mcp-fork-22 | — | `ForkToolResult`, `WriteFlag` types in `registry.ts`; the D14 tools use them | parallel (Wave 2), before §2 |
| mcp-fork-20 | W7: the "Module APIs (`game.pentaryn`)" index in `context/foundry/README.md` (pentaryn repo) | — (the eval-js description points at it: -21) | Stage 0 (W7) |

**`contract.test.mjs` recipe (module side, every module a typed tool calls).** Use the test kit, not
a hand regex (use-doc §6):

```js
import { contractDrift, forkQueries, forkSource } from "./kit/harness.mjs";
const TOOL = "packages/mcp-server/src/fork/tools/prompt-markers.ts";

test("the fork sends only queries this module registers", t => {
  const fork = forkQueries(MODULE, TOOL);           // reads $FOUNDRY_MCP_FORK
  if (fork.skip) return t.skip(fork.skip);          // fork not checked out: skip with the note
  assert.deepEqual(contractDrift(api.describe(), fork).missing, []);
});

test("the fork's vocabularies match core", t => {
  const src = forkSource(TOOL);
  if (src.skip) return t.skip(src.skip);
  // extract NPC_SIZES / kinds / patch keys from src.text and compare with core's constants
});
```

With K8 landed, prompts registers `pentaryn-prompts.replace` from its `replaceMany` row, so the
"`describe().queries` + `replace`" special case in the prompts guide's step 14 is no longer needed.

## 4. Every fork finding, mapped to a stage

Audit wave in brackets. "Parallel" = the tooling/fork lane of README §3, in audit wave order; it
touches no module folder and can run beside any stage.

| Id | Title (short) | Lane / stage | Notes |
|---|---|---|---|
| mcp-fork-1 | upstream write tools never reach the action log | parallel [W4] | `upstream-writes.ts` globs; with -5's `ActionLog` |
| mcp-fork-2 | any player can trigger upstream bridge queries | parallel [W4] **declared** | prompts needs its `CONFIG.queries["pentaryn-prompts.*"]` left as plain functions (identity assertion) — the kit's wrappers are functions, so no conflict |
| mcp-fork-4 | failed evals logged ok:true; scripts stored twice | parallel [W4] | `logArgs` hook; feeds D3's compact read logging |
| mcp-fork-5 | two log writers, one env var | parallel [W2] | `action-log.ts`; -6, -30 (python-tooling) fold in |
| mcp-fork-6 | log month fixed at backend start | parallel [W2] | inside -5 |
| mcp-fork-7 | no session/caller id in logs | parallel [W4] | `client:{pid,ppid}`; the D14 tools pass it too |
| mcp-fork-8 | eval timeout timer never cleared | parallel [W4] | |
| mcp-fork-9 | extract + test `serialize()` | parallel [W0 test, W2 move] | `SERIALIZE_LIMITS` depth 4 = the blueprint's `inspect` cap |
| mcp-fork-10 | recharge resolves actors differently, unlogged | parallel [W4] **declared** | prompts' `rechargeData` stays exportable for parity (prompts guide §4, optional) |
| mcp-fork-11 | upstream footprint undocumented | parallel [W0] | `FORK.md`, `tool-list-watch.ts` |
| mcp-fork-12 | tool-list change detector misses schema edits | parallel [W2] | inside -11's file |
| mcp-fork-13 | tool filter hides but does not block | parallel [W4] | the D14 tools respect it |
| mcp-fork-14 | split the prompt-markers schema block | parallel [W2] | lands **before** -15's fork half |
| mcp-fork-15 | zod copy of prompts vocabularies can drift | **with prompts (2.10)** [W0 test, W4] | §3 |
| mcp-fork-16 | specFile replace logs only the path | parallel [W3] | uses -4's `logArgs` |
| mcp-fork-17 | eval-js arg rejection leaves no eval line | parallel [W4] | |
| mcp-fork-18 | sanitizer rebuilds constant key arrays | parallel [W4] | |
| mcp-fork-19 | no fork use-doc | parallel [W0] | `context/foundry/mcp-fork.md` (pentaryn repo): names the two query contracts (-24), the D14 tools once built, links use-doc §5.1a |
| mcp-fork-20 | no `game.pentaryn` index | **Stage 0, W7** [W0] | the Module APIs index; later generated from each module's `golden/describe.json` (ties, lookup guides) |
| mcp-fork-21 | eval-js description hides serializer rules | parallel [W3] | one sentence + "call `game.pentaryn.describe()` first" |
| mcp-fork-22 | type the fork tool contract | parallel [W2] | prerequisite of §2 |
| mcp-fork-23 | source comments describe things not there | parallel [W0] | comments only |
| mcp-fork-24 | four GM-guard implementations | doc **Stage 0**; kit half **landed** (1.0.1) | §3 |
| mcp-fork-25 | no report from the action logs | parallel [W3] | `scripts/foundry/ops/evallog.py` (pentaryn repo) + `make foundry-eval-report`; serialise with W1/W4 (`cli.py`, `Makefile`) — see [`tooling-lane.md`](tooling-lane.md) |
| prompts-lookup-11 | pin zod ↔ module drift | **with prompts (2.10)** [W0] | §3 |
| prompts-lookup-12 | one action table, one query list | **with prompts (2.10)** [W3] | §3 |

python-tooling-30 (`eval.jsonl` rotation) touches `eval-js.ts` in the fork; land it with -5/-6 here,
not in the Python lane.

## 5. Procedure

1. Re-anchor: `git -C "$FOUNDRY_MCP_FORK" log --oneline 59c781e..HEAD` and re-locate each anchor.
2. One finding (or one row of §3) per change; characterisation test first, as in the module guides.
3. Fork gates: `npm test` and `npm run typecheck` in the fork; pentaryn side
   `node foundry/module/<m>/test/run.mjs` with `FOUNDRY_MCP_FORK` set, so `contract.test.mjs` runs
   instead of skipping.
4. A `foundry-module` (bridge) change needs a module rebuild and a broker restart; say so in the
   hand-off. Declared changes (-2, -10) go to the live-test workflow.
5. Record below.

## Result (fill when done)

| | |
|---|---|
| Joe decision D3 (split tools + compact read logging) | taken / declined, date ______ |
| Parallel lane ids done | ______ |
| Module-contract ids done (with which module stage) | ______ |
| Fork commits (Joe-approved) | ______ |
| Declared changes handed to the live-test workflow | ______ |
