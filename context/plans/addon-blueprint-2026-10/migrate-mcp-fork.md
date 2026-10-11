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

## Result (fork lane, wave 2 — code phase, 2026-10-11)

Branch `migrate/wave-2` of the fork (`foundry-vtt-mcp`), `6a52673..442e74b`, **not merged, not
deployed**. Build plan and commit map: [`wave-2-bridge-plan.md`](wave-2-bridge-plan.md) §2–§3, §6.

| | |
|---|---|
| Joe decision D3 (split tools + compact read logging) | **taken**, 2026-10-11. Built as `pentaryn-read` / `pentaryn-write`. W2-B2 (compact read lines share `mcp-<YYYY-MM>.jsonl` with the write lines) is built as the default and is still open in [`wave-2-report.md`](wave-2-report.md) |
| Parallel lane ids done | mcp-fork-1, -2, -4, -5, -6, -7, -8, -9, -10, -11 (step 2, the poll move), -12, -13, -14, -16, -17, -18, -21, -22, -24 (code half: coded `NOT_GM`); python-tooling-30 (the fork half: `eval-<YYYY-MM>.jsonl`); D14 (§2). Wave 1 had already landed -11 step 1, -19, -20, -23 and the -24 doc half |
| Module-contract ids done (with which module stage) | none this wave: mcp-fork-15, prompts-lookup-11, prompts-lookup-12 wait for prompts (Stage 2.10). For -15: after -14 the vocabularies live in `packages/mcp-server/src/fork/tools/prompt-markers.schema.ts` (one `SIZES` replaces `NPC_SIZES`/`SIZE_WORDS`); `QUERIES` and the `chars` default stay in `prompt-markers.ts`, so prompts' current `test/contract.test.mjs` passes against the branch (checked with `FOUNDRY_MCP_FORK` set to the worktree) |
| Fork commits (Joe-approved) | 30 commits, approval pending. F0 `a97be99` · F1 `f9492e4` · F2 `5b9e3bd` (pins) + `74d9de8` · F3 `b6afb9e` · F4 `c2fd036` · F5 `745c0fd` · F6 `b628500` · F7 `c1e9103` · F8 `4e9b031` · F9 `6500710` · F10 `2457e18` · F11 `a666102` · F12 `0909494` · F13 `4b52c80` · F14 `ad25af5` (pins) + `552d222` · F15 `16a33d1` · F16a `506415b` · F16b `4727fcf` · F17 `e5fc5b6` (pins) + `6f2c6e0` · F18 `6723685` (snapshot) + `0a7441a` · F19 `c200fad` (pins) + `3875d2c` · F20 `09537bd` · F21 `20841db` · F22 `01222a9` · F23 `442e74b` (0.8.3-pentaryn.2). Gates green after every commit: server typecheck + vitest (161 → 257 tests), module typecheck + vitest (new harness, 38 tests), `scripts/fork-footprint.sh`; `npm run build:server` and `build:foundry` in the worktree (static, not deployed) |
| Declared changes handed to the live-test workflow | F16a (-2): a player's `game.users.activeGM.query('foundry-mcp-bridge.listActors', {})` → `NOT_GM: Access denied: bridge queries may only be queried by a GM.`; the GM tab's bridge tools still answer · F19 (-10): `dnd5e-add-feature` with `recharge` on a scene **token id** applies (was "not applied (actor not found)") · F15 (-8): a 1 s-timeout eval returns `timedOut: true`, and a finished eval leaves no timer · F16b (-24): fork guard errors start `NOT_GM:` · F10 (-13): with `FOUNDRY_MCP_TOOL_FILTER` set, a filtered tool's call is refused (unset in `.mcp.json`: not observable) · F12 (-12): a schema-only change now sends `tools/list_changed` · log-shape changes for the review (F3, F4, F5, F6, F8, F9): month at write time, `eval-<YYYY-MM>.jsonl`, value failures `ok:false` with `phase`/`code`, `phase:"args"`, `client`, upstream write lines |
| Deviations from the plan | D14 (F20): (1) the real manifests have positional legacy rows (`rules.search(query, opts)`, `pings.recent(n)`), so a param other than `ref`/`opts`/`options` is taken from `opts` by name and leftover opts keys (or a `ref` on a row without one) are `BAD_ARGS`; rows whose params need a live Document (journal.add's `doc`) stay eval-js-only; (2) the envelope crosses as JSON text made plain in the browser (Documents → `{_document,_id,name,uuid}`, depth ≤12, arrays ≤200) because `serialize()`'s depth-4 cap cut `describe()` at methods → params; (3) `{ns:"*", path:"inspect"}` (the root inspect) is served beside the root describe. F16b keeps "Access denied" inside the coded text (`NOT_GM: Access denied: …`) so the F16a pins and the live check hold. F0: the module's test script is `vitest` (as the server's): `vitest --run` plus the gate's `-- --run` is refused by vitest |
| Stopped steps (frozen test red twice) | none |
| Deploy (gated live phase, nothing run) | [`wave-2-bridge-plan.md`](wave-2-bridge-plan.md) §6, in order: (1) merge `migrate/wave-2` into `pentaryn` in the live fork → `npm -w @foundry-mcp/server test -- --run` → `npm run build:server` → `scripts/fork-footprint.sh` → `make foundry-bridge-status` → `kill -9` the stale `backend.js`; (2) **same session**: `npm run build:foundry` → copy the built files into `Data/modules/foundry-mcp-bridge` → reload the GM tab (F14–F17, F19 change the module; without it recharge reads "not applied (No handler found …)"); (3) the python lane's `PENTARYN_MCP_LOG_DIR` on dnd-scripts; (4) smoke: `pentaryn-read {ns:"*", path:"describe"}`, `{ns:"cursors", path:"status"}`, `{ns:"importer", path:"selftest"}`, `pentaryn-write {ns:"importer", path:"import", dryRun:true}`, `pentaryn-write` on a read row (`BAD_ARGS`), `pentaryn-read {ns:"ties", path:"x"}` (`NOT_FOUND` + namespaces), then one `eval-js` (`eval-2026-10.jsonl`, `client`) and one `delete-tokens` on a scratch token (its line); (5) the declared checks above; (6) `make foundry-eval-report` |
| Review and integration fixes (after F23) | ten review defects, one commit each: `d5ba3c4` (fake timers), `6f598fb` dryRun only where a row has one, `a79f5f3` read only `writes:false`, `a6fb891` live-Document params refused, `b8f540f` coded errors keep their code, `81f8bb4` exact actor and item in recharge, `9c845d1` recharge on the add-feature line, `7f6680a` FORK.md row, `d77c496` `fork:` markers (each fix [declared]); integration review `213c6c3` (`rules` is no longer called eval-js only). At `213c6c3`: server vitest 275, module vitest 43, both typechecks, `fork-footprint.sh` green. Not merged, not built into a deployed path. Record: [`wave-2-report.md`](wave-2-report.md) §Bridge lane; live: [`wave-2-live-plan.md`](wave-2-live-plan.md) |
