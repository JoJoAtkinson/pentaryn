---
title: Wave 2 — bridge lane build plan (D14 tools, the fork's parallel findings, the MCP tooling)
status: plan
last_modified: 2026-10-11
tags: [foundry, mcp, fork, blueprint, plan, migration, tooling]
---

# Wave 2 — the bridge lane

**Read this when:** you are the fork lane or the python lane of workflow 2 and need the commit
order, the D14 design, the owned paths and what has to be deployed afterwards. **Not this file:**
why each finding exists → [`../code-audit-2026-10/mcp-fork.md`](../code-audit-2026-10/mcp-fork.md)
and [`../code-audit-2026-10/python-tooling.md`](../code-audit-2026-10/python-tooling.md) · the
fork's stage map → [`migrate-mcp-fork.md`](migrate-mcp-fork.md) · how the fork is built and its
footprint rules → [`../../foundry/mcp-fork.md`](../../foundry/mcp-fork.md) · the Python crosswalk →
[`tooling-lane.md`](tooling-lane.md).

Joe took **D3** on 2026-10-11 (split `pentaryn-read` / `pentaryn-write`, compact read logging), so
§2 of the fork guide is now a task. Two lanes, no shared file, both code-phase only.

| | |
|---|---|
| Fork lane worktree | `/Users/joe/Documents/GitHub/foundry-vtt-mcp-wave2-wt`, branch `migrate/wave-2`, tip `6a52673` (= `migrate/wave-1`'s tip: `pentaryn` + the three wave-1 doc commits) |
| Python lane worktree | `/Users/joe/Documents/GitHub/pentaryn-wave2-wt`, branch `migrate/wave-2` |
| Never | edit, build or switch branches in `…/pentaryn` or `…/foundry-vtt-mcp` (the live MCP servers run from them); run any `mcp__foundry__*` tool, `eval-js`, `make foundry-*-sync`/`-up`/`-down`/`-backup`, `make login`, the browser, or restart a broker |
| Gates only | fork: `npm -w @foundry-mcp/server run typecheck`, `npm -w @foundry-mcp/server test -- --run`, `npm -w @foundry-mcp/module run typecheck`, (new) `npm -w @foundry-mcp/module test -- --run`, `scripts/fork-footprint.sh` · python: `.venv/bin/python -m pytest -q -p no:cacheprovider <file>` then the full `pytest -q`; `.venv/bin/python scripts/check_context.py` when `context/` changes. `npm run build:server` in the **worktree** is a static gate (its `dist/` is not deployed); never build in the live checkout |
| Commits | one logical step each; `git commit -m … -- <paths>`; a pin flip or any behaviour change is its own `[declared]` commit; footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_012TgNisf3FCgvrSYGmA7Pj1`; never `foundry/logs/**` |
| Tests | characterise first (the audit's recipe), then change; a frozen test red twice on one step → stop that step and record it in [`wave-2-report.md`](wave-2-report.md). No real timers (`vi.useFakeTimers`, `t.mock.timers`) |

## 1. Where the lane starts

**Already landed (wave 1, do not redo):** mcp-fork-11 (FORK.md + `scripts/fork-footprint.sh`; step 2,
the poll move, is **not** done), -19 (use-doc), -20 (generated Module APIs index), -23, -24 doc
half; python-tooling-41 (`module-check --all --json`, `status --json`, `bridge-status --json`,
`GateResult`), -34 (conftest), -36 (index), -38, -52, and the **characterisation pins** for -42/-43/-44
(`test_combat_actions_db_characterisation.py`), -48/-49/-50 (`test_dnd_scripts_contracts.py` +
`fixtures/dnd_scripts_schemas.json`), -51 (`test_dnd_roller.py`, strict xfail in a subprocess).

**Waits for a module (not this wave):** mcp-fork-15, prompts-lookup-11, prompts-lookup-12 (prompts
is Stage 2.10; wave 2 is lookup → dropbin). mcp-fork-20's "later generated from each module's
`golden/describe.json`" is already how `ops/index.py` works; the index regenerates in each module
lane's tier-change commit, nothing for this lane.

**Out of this lane:** python-tooling-50 (lore/srd/ages dispatch, W2, not in `scripts/mcp`), -27's
cousins in `scripts/foundry/update/**`, anything in `foundry/module/**`.

**Facts the design rests on** (checked in the worktrees at `6a52673` / `b541e412`):

- The bridge's socket path calls `CONFIG.queries[method](data)` with **no context** on the bridge
  GM tab only (`socket-bridge.ts:271-278`); only `User#query` relays reach every tab of the
  recipient account (playbook §5.9.5, J8). A fork tool therefore runs a handler on exactly one tab.
- `foundry-mcp-bridge.fork.eval` (`handlers.ts:124-172`) runs the script as an async function body
  in the GM tab behind `requireGM`, and returns `{ok, phase, ms, resultType, result}` through
  `serialize()` (depth 4, arrays 200, collections 100, `_`-keys dropped, a top-level Document with
  `source`). The connector's per-query timeout is clamped 1–120 s (`foundry-connector.ts:359-363`).
- `game.pentaryn.describe()` (kit `publish.mjs:69-81`) returns `{modules, namespaces: {ns: describe}}`
  for every namespace whose `contract` is a string; `game.pentaryn.namespaces()` lists them. A
  namespace's `describe().methods[]` rows carry `path, params, gm, writes, query, …` (use-doc §5.1a);
  the kit-owned members `describe`, `inspect`, `selftest` are never rows (`api.mjs:11-14`).
- A bound row with a leading `ref` param resolves it per call (`api.mjs:45-66`): a read throws
  `NOT_FOUND`/`AMBIGUOUS`/`BAD_ARGS` (coded, `code` property + message prefix); a write returns
  `fail(code, reason)`. The fork never resolves a ref.
- The registry logs writes only, with fixed keys `ts, tool, action, args, ok, summary, ids, error,
  ms` (`registry.ts:167-193`); `eval.jsonl` is written by the eval-js **tool**, not by the query, so a
  tool that calls `fork.eval` directly leaves no eval line.
- `packages/foundry-module` has no test runner; `vitest` is hoisted in the root `node_modules`.

## 2. Fork lane — order and commits

One agent, sequential. Each row is one commit (a `[declared]` row is one commit that flips the
named pin). Re-locate every anchor by its quoted text; the tree is three doc commits past the
audit snapshot, so the audit's line numbers still hold within a few lines.

| # | Id | Commit (subject) | What lands | Pins / tests | Upstream footprint |
|---|---|---|---|---|---|
| F0 | harness | `test(module): vitest for packages/foundry-module` | `packages/foundry-module/package.json`: `"test": "vitest --run"`, devDependency `vitest` at the server's version; `vitest.config.ts` (node env, globals); `npm install --no-audit --no-fund` once (lockfile moves only for the workspace entry). tsconfig already excludes `*.test.*` | a smoke test importing `./fork/handlers.js` with `globalThis.game = {user:{isGM:true}}`, `globalThis.CONFIG = {queries:{}}` | `package.json` row in FORK.md widens ("version; test script"); `package-lock.json` is excluded |
| F1 | -22 | `refactor(fork): type the tool contract — WriteFlag, ForkToolResult, handler meta` | `registry.ts`: `export type WriteFlag`, `ForkToolResult`, `ForkToolHandler = (args, meta?: {client?}) => Promise<ForkToolResult>`; JSDoc on `register()`; import `McpContentBlock` from `content.ts` | typecheck only; a `// @ts-expect-error` line in the new `registry.test.ts` for `{ids:'x'}` | none |
| F2 | -5 | `refactor(fork): one ActionLog for the action and eval streams` | new `src/fork/action-log.ts`: `class ActionLog { static fromEnv(logger, env); get enabled; append(stream: 'actions'\|'eval', line) }`; `ForkRegistry(logger, log = ActionLog.fromEnv(logger))`; `createForkRegistry` passes the same instance to `registerEvalJs`. File names and key order byte-identical | **write first** `eval-js.test.ts` (key order `ts,purpose,script,ok,phase,ms`; transport line on throw; no dir → no file) and `registry.test.ts` (write:true → 1 line, write:false → none), both green before and after | none |
| F3 | -6 | `fix(fork): action-log month computed at write time [declared]` | `ActionLog.pathFor(stream, now)`; startup info line kept | pin with fake timers: 2026-10-31T23:59Z → `mcp-2026-10.jsonl`; then 2026-11-01 → `mcp-2026-11.jsonl` (the flip) | none |
| F4 | python-tooling-30 | `fix(fork): eval log rotates monthly — eval-YYYY-MM.jsonl [declared]` | `ActionLog` 'eval' stream → `eval-<YYYY-MM>.jsonl`; the existing `eval.jsonl` is left; the eval-js header comment stops claiming "always on" | same fake-timer shape as F3; keys unchanged | none. Readers: `evallog.py` (python lane) globs `eval*.jsonl` from its first commit; the README paragraph is the python lane's docs commit (P9) |
| F5 | -4 | `fix(fork): failed evals log ok:false; logArgs hook keeps scripts out of the action log [declared]` | `log()`: `ok: entry.ok && entry.result?.ok !== false`, plus `phase` and `code` from the result when present (D14's write line needs `code`); `register(def, handler, {write, logArgs?})`, a throwing `logArgs` falls back to raw args; eval-js registers `logArgs: a => ({purpose, scriptChars, timeoutMs})` | pin `{ok:false, phase:'runtime'}` logging `ok:true` first, flip in the same commit; `logArgs` cases per the audit; prompt-markers predicate test stays green | none |
| F6 | -17 | `fix(fork): an eval-js call rejected for bad args leaves a phase:"args" eval line [declared]` | `safeParse`; on failure append `{…, ok:false, phase:'args', error:'path: message; …', ms:0}` then rethrow the original `ZodError` | pin "no line, ZodError mentions purpose" first; flip | none |
| F7 | -16 | `fix(fork): prompt-markers logs the expanded specFile spec, not the path` | `registerPromptMarkers`: `logArgs: a => ({...withSpecFile(a), specFile: a?.specFile})` in a try/catch; optional `specHash` | extend the 'registry logging' describe with a temp spec file; handler result unchanged | none |
| F8 | -7 | `feat(fork): client {pid, ppid} on every action and eval line` | `index.ts:371` sends `client:{pid,ppid}`; `backend.ts` call_tool destructures `client` and passes `{client}` as `dispatch` meta (and to F9's `auditUpstream`); `dispatch(name, args, meta?)` adds `client` to the line; eval-js copies it into its line | `dispatch('t', {action:'replace'}, {client:{pid:1,ppid:2}})` → `client` on the line; no meta → identical keys to today | `index.ts` row widens; `backend.ts` gains 1 marker (4→5): update both FORK.md tables in the commit |
| F9 | -1 | `feat(fork): upstream write tools reach the action log` | new `src/fork/upstream-writes.ts` (`UPSTREAM_WRITE_GLOBS`, `isUpstreamWrite`; `globToRegExp` exported from registry); `ForkRegistry.auditUpstream(name, args, {ok, result?, error?, ms, client?})` — early return for fork tools and non-writes; three `backend.ts` hunks (`started` before the try, ok after the switch, error in the catch) | `registry.test.ts`: `delete-tokens` logs, `get-character` does not, a fork tool does not, `{ok:false,error}` logs the error | `backend.ts` +3 markers (5→8); FORK.md hunk list and marker table |
| F10 | -13 | `fix(fork): FOUNDRY_MCP_TOOL_FILTER blocks calls, not only listings [declared when the filter is set]` | `registry.assertAllowed(name)` throws `Tool '<name>' is disabled by FOUNDRY_MCP_TOOL_FILTER`; one `backend.ts` hunk at the top of `call_tool`; `has()` drops its `isDenied` clause | filter `dnd5e-*, generate-map` cases per the audit; `globToRegExp('a.b*')` | `backend.ts` +1 marker; FORK.md |
| F11 | -11 step 2 | `refactor(fork): wrapper tool-list poll moves to src/fork/tool-list-watch.ts` | `toolsKey(tools)`, `watchToolList(mcp, send, intervalMs = 30_000)` returning `markServed`; `index.ts` keeps one call; interval, `unref` and the null guard preserved | **pin the current key first**: `'a:1\|b:2'`, `''` for `[]`/`undefined`; fake timers: A, A, A+B → one `sendToolListChanged`; rejecting send swallowed | `index.ts` row shrinks; FORK.md "none yet" → the new test |
| F12 | -12 | `fix(fork): tool-list key hashes name, description and inputSchema [declared]` | `toolsKey` = sha1 of the sorted `[name, description, inputSchema]` triples | pin: identical → same key; reordered → same; renamed → different. New: `inputSchema.properties` change and a same-length description edit change the key; F11's once-only test still passes | none (fork file) |
| F13 | -21 | `docs(fork): eval-js description states the serializer rules and game.pentaryn` | append the one sentence from the audit; `export { DEFINITION as EVAL_JS_DEFINITION }` | `eval-js.test.ts`: `/depth <=4/`, `/<=200/` | none |
| F14 | -9 | `refactor(module): serialize() to src/fork/serialize.ts with SERIALIZE_LIMITS` | move `serialize` + `safeToObject` verbatim; `SERIALIZE_LIMITS = {depth:4, array:200, collection:100}` in place of the literals; delete the unreachable `Set` line (`handlers.ts:86`); JSDoc of the rules | `serialize.test.ts` written **against the current code before the move** (the eleven cases in the audit); `expect(SERIALIZE_LIMITS).toEqual({depth:4,array:200,collection:100})` pairs with F13 | none |
| F15 | -8 | `fix(module): eval timeout timer is cleared; a timeout says timedOut [declared]` | `let timer; … finally { clearTimeout(timer) }`; timeout path adds `timedOut:true`, `note:'the script may still be running; re-read state before retrying'`; `phase` stays `'runtime'`; eval-js copies `timedOut` into its line when present | `handlers.test.ts` with fake timers: `return 1` → `getTimerCount() === 0` (today 1: the pin, flipped here); the 1000 ms hang; `throw` → no `timedOut`; `return (` → `compile` | none |
| F16a | -2 | `fix(module): upstream bridge queries refuse a non-GM sender [declared]` | `guardBridgeQueries()` at the end of `registerForkHandlers()`: wraps every `CONFIG.queries` key starting `foundry-mcp-bridge.` but not `foundry-mcp-bridge.fork.`, once (`h.__forkGuarded`); `assertSenderIsGM(ctx)` factored out of `requireGM`; no-ctx paths unchanged (pentaryn-prompts' `npc.mjs` calls `createNpcActor` directly) | `handlers.test.ts`: pin eval's current texts first; after: `x({a:1})` no ctx → echo; `{user:{isGM:true}}` same; `{user:{isGM:false}}` rejects `/Access denied/`; `pentaryn-prompts.list` identity; double registration does not double-wrap | none (`main.ts` already calls `registerForkHandlers()` after `registerHandlers()`) |
| F16b | -24 code half | `fix(module): fork GM guard throws coded NOT_GM errors [declared]` | `assertSenderIsGM` / `requireGM` messages become `NOT_GM: fork tools may only be queried by a GM` and `NOT_GM: fork tools require a GM session`, `code = 'NOT_GM'` on the Error (kit `errors.mjs` prefix form) | the F16a pins keep their substrings; add `code === 'NOT_GM'` | none |
| F17 | -18 | `perf(module): legacy dnd5e movement keys are one module-scope Set` | `src/fork/legacy-keys.ts` exports `DND5E_LEGACY_MOVEMENT_KEYS = new Set([...])`; `data-access.ts:3896` keeps a one-line `.has()` call; upstream senses array untouched | the four `removeSensitiveFields` cases; if `data-access.ts` does not load under node, test the Set and the one-line helper instead and say so in the commit | `data-access.ts` row: hunk list updated; FORK.md |
| F18 | -14 | `refactor(fork): prompt-markers schemas in prompt-markers.schema.ts; one SIZES, InlineItem, Disposition` | lines ~64–439 move; `prompt-markers.ts` re-exports `parseArgs`, `ReplacementT`; the test's import list (lines 5–15) does not change | **before the split** add `describe('schema characterisation')` with ~20 inputs through `parseArgs` and `toMatchInlineSnapshot()`; byte-identical after | none |
| F19 | -10 | `fix(fork): recharge applies through a typed fork query; token ids resolve [declared]` | `packages/foundry-module/src/fork/recharge.ts` (pure `rechargeUpdate(item, n)`), handler `foundry-mcp-bridge.fork.applyRecharge` (`requireGM`, `window.foundryMCPBridge.dataAccess.findActorByIdentifier`, `updateEmbeddedDocuments`); `packages/mcp-server/src/fork/recharge.ts` (`applyRecharge` → the query, logged via `ActionLog` as `{tool:'dnd5e-add-feature', action:'recharge', …}`); `add-feature.ts` shrinks to a 3-line call | pin the row first (`recharge.test.ts`, the audit's fixture); server-side mocked-client cases; strings of `add-feature.ts:~497-503` kept | `add-feature.ts` row shrinks (hunk list); FORK.md |
| F20 | D14 | `feat(fork): pentaryn-call — one eval template that routes on describe()` | `src/fork/tools/pentaryn-call.ts`: `buildCallScript(call)` and the envelope types (§3) | `pentaryn-call.test.ts` **executes the template** in node against a fake `game.pentaryn` (§3.6) | none |
| F21 | D14 | `feat(fork): pentaryn-read` | `src/fork/tools/pentaryn-read.ts` (§3.1–3.5) registered `write:false`; compact line via `ActionLog` | §3.6 read cases | none |
| F22 | D14 | `feat(fork): pentaryn-write` | `src/fork/tools/pentaryn-write.ts`, `write:true`, `logArgs: a => a` (sanitised by the registry), `summary`/`ids`/`code` on the result | §3.6 write cases | none |
| F23 | release | `chore(fork): 0.8.3-pentaryn.2 — CHANGELOG, version strings` | the six version files + CHANGELOG (tools added, filter now blocks, logs rotate, client ids, recharge query) | `scripts/fork-footprint.sh` green | version rows unchanged in kind |

Run the full fork gate set after every commit; F23 is the last fork commit of the wave.

## 3. D14 — `pentaryn-read` and `pentaryn-write`

### 3.1 Transport: the existing eval path, no new GM-side handler

Both tools call `foundryClient.query('foundry-mcp-bridge.fork.eval', { script, timeoutMs }, {
timeoutMs: timeoutMs + 2000 })` with a **fixed script template** whose only variable part is one
JSON literal (`const call = <JSON.stringify(call)>;`). The fork never builds JavaScript from user
strings any other way, so there is no injection surface, and the browser-side handler, GM guard,
serializer and timeout clamp are the ones already deployed: **no `foundry-module` rebuild is needed
for D14**. Rows with `query: true` are *not* called through their `CONFIG.queries` handler; one path
keeps the error envelope and the logging identical for every row.

The eval log is untouched (it is the eval-js tool's, not the query's), so D3's compact read line is
the only trace of a read.

### 3.2 The template (`pentaryn-call.ts`)

`buildCallScript({ mode: 'read'|'write', ns, path, ref?, opts?, dryRun? })` returns the body of an
async function that:

1. `root = game.pentaryn` — absent → `{ok:false, code:'NOT_FOUND', reason:'game.pentaryn is not installed (no blueprint module is active)'}`.
2. `ns === '*'` and `path === 'describe'` → `{ok:true, result: root.describe()}` (read only).
3. `api = root[ns]`; not an object with a string `contract` → `NOT_FOUND` with
   `namespaces: root.namespaces()` and the reason "`<ns>` is not a blueprint namespace; the others
   are eval-js only (see the Module APIs index)".
4. `d = api.describe()`; `row = d.methods.find(m => m.path === path)`. Read mode also accepts the
   kit members `describe`, `inspect`, `selftest` when they are functions on `api` (no row, `writes:
   false`). Nothing found → `NOT_FOUND` with `paths: d.methods.map(m => m.path)` plus the accepted
   kit members, and `writes` per path so the LLM can see which tool to use.
5. Routing on the row: read mode with `row.writes === true` → `{ok:false, code:'BAD_ARGS',
   reason:'<ns>.<path> is a write row; use pentaryn-write'}`; write mode with `writes === false` →
   `BAD_ARGS: … is a read row; use pentaryn-read`. The flag is read from `describe()` **in the
   browser on every call** — no fork-side cache.
6. The call: `fn = path.split('.').reduce(...)`; `args = row.params?.[0]?.name === 'ref' ? [call.ref,
   opts] : [opts]` (the shape `registerQueries` uses, `queries.mjs:76-78`), where `opts =
   {...call.opts, ...(call.dryRun ? {dryRun:true} : {})}`; kit members: `describe()` no args,
   `inspect(call.ref, call.opts)`, `selftest(call.opts)`. `ref` is passed **unchanged**; the module's
   bound row resolves it.
7. `await`ed inside a try: a thrown error → `{ok:false, code: err.code ?? /^([A-Z][A-Z0-9_]*):/
   prefix ?? 'INTERNAL', reason: err.message}` (a read's `NOT_FOUND`/`AMBIGUOUS`/`BAD_ARGS`/`NOT_GM`
   all arrive this way). A write row's own `{ok:false, code, reason}` is returned as is. Success →
   `{ok:true, ns, path, result}`; for a write row `result` **is** the `ok()/fail()` object and the
   envelope copies its `ok`/`code`/`reason` up one level.

The envelope then crosses `serialize()`: a read result containing a Document comes back as the
eval identity shape (`{_document, _id, name}` nested, `source` at depth 0 only), which is the
blueprint's "refs, not documents" rule applied by the bridge instead of `toPlain`. `inspect` is
already depth ≤ 4 on the module side.

### 3.3 Tool schemas (built by hand, the describe-driven part is in the browser)

| Tool | `inputSchema` | Required | Registry |
|---|---|---|---|
| `pentaryn-read` | `ns` (string; `"*"` with `path:"describe"` for the root), `path` (string; a `describe().methods[].path`, or `describe`, `inspect`, `selftest`), `ref` (string, optional; Actor/Token uuid, 16-char id or exact name — resolved by the module, never a substring), `opts` (object, optional; the row's options, `sceneId`/`base`/`as` live here), `timeoutMs` (1000–60000, default 10000) | `ns`, `path` | `write: false`; the handler appends `{ts, tool:'pentaryn-read', ns, path, ref, ok, code?, ms, client?}` to the `actions` stream in a `finally` — no args body, no result body |
| `pentaryn-write` | the same plus `dryRun` (boolean, default false; merged into `opts.dryRun`) | `ns`, `path` | `write: true`, `logArgs: a => a` (the registry's `sanitizeForLog` caps it); result carries `summary: "<ns>.<path>${ref ? ' ' + ref : ''} — ok" \| "— <code>"`, `ids: result.ids ?? []`, and `code`, so the write line holds args, `ok`, `code`, `summary`, `ids` |

zod validates both (`ns`/`path` non-empty, no dots in `ns`, `ref` string, `opts` plain object,
`timeoutMs` clamp); a rejected call throws a `BAD_ARGS: …` error before any query (and, as with
eval-js, leaves the registry's error line for the write tool only).

Transport failures use prompt-markers' `friendlyError` shape: no handler → `MODULE_MISSING:
foundry-mcp-bridge is not connected`; connector timeout → `TIMEOUT: <ns>.<path> did not answer in
<ms> ms`; an eval `phase:'compile'`/`'runtime'` on the template itself (cannot happen with a fixed
template, but is handled) → `INTERNAL: …`. Coded refusals from the module are **values**, not throws.

### 3.4 Descriptions (mcp-fork-21 style, each ≤ ~120 words)

- `pentaryn-read`: "Call a read method of a Pentaryn blueprint module: `game.pentaryn.<ns>.<path>`.
  Discovery first: `{ns:"*", path:"describe"}` returns every namespace's manifest
  (`game.pentaryn.describe()`), or `{ns, path:"describe"}` one module's rows with `params`, `gm`,
  `writes`, `doc`. `ref` is resolved by the module (Actor, Token, uuid, id or exact name; ambiguity →
  `AMBIGUOUS`). Write rows are refused with `BAD_ARGS: use pentaryn-write`. Unknown ns/path →
  `NOT_FOUND` listing what exists. Namespaces without `describe()` (ties, rules, …) are eval-js
  only — see the Module APIs index in context/foundry/README.md. Result rules: depth ≤4, arrays
  ≤200, Documents as id+name."
- `pentaryn-write`: "Call a write method (`describe().methods[].writes === true`) of a Pentaryn
  module as the GM. Returns the module's `{ok, …}` or `{ok:false, code, reason}` — `NOT_FOUND`,
  `AMBIGUOUS`, `BAD_ARGS`, `NOT_GM`, `REFUSED`, `CONFLICT` — never a throw for an expected refusal.
  `dryRun:true` where the row supports it (bulk rows). Every call is written to the action log with
  its arguments. Read rows are refused with `BAD_ARGS: use pentaryn-read`."

### 3.5 Logging and the registry

- Read line (compact, D3): `{ts, tool:'pentaryn-read', ns, path, ref, ok, code?, ms, client?}` in
  `mcp-<YYYY-MM>.jsonl`, written by the tool through the shared `ActionLog` (F2); nothing from the
  registry (`write:false`). `code` appears only on a coded refusal, so `grep '"ok":false'` keeps
  working for reviews.
- Write line (full): the registry's line with F5's `code`/`phase`, F8's `client`, args sanitised by
  `sanitizeForLog`.
- The tool filter (F10) and `has()` apply automatically; nothing D14-specific.

### 3.6 Tests (`pentaryn-call.test.ts`, `pentaryn-read.test.ts`, `pentaryn-write.test.ts`)

The fake client's `query('foundry-mcp-bridge.fork.eval', {script})` **runs the template**: `new
AsyncFunction(script)` with `globalThis.game.pentaryn` stubbed, then returns `{ok:true,
phase:'complete', result}` — so the routing is tested, not a mock of it. The stub:

```ts
const calls: any[] = [];
const ns = {
  contract: 'pentaryn-fake/api@1',
  describe: () => ({ module: 'pentaryn-fake', namespace: 'fake', methods: [
    { path: 'store.list', params: [{ name: 'ref', kind: 'actor' }], gm: false, writes: false, doc: 'list' },
    { path: 'store.set',  params: [{ name: 'ref', kind: 'actor' }, { name: 'opts' }], gm: true, writes: true, doc: 'set' },
  ]}),
  inspect: async (ref: string) => ({ ref, depth: 1 }),
  store: {
    list: async (ref: string, opts: any) => { calls.push(['list', ref, opts]); if (ref === 'Ald') throw Object.assign(new Error('NOT_FOUND: actor Ald'), { code: 'NOT_FOUND' }); return { rows: [ref] }; },
    set:  async (ref: string, opts: any) => { calls.push(['set', ref, opts]); return opts?.dryRun ? { ok: true, dryRun: true, ids: [] } : { ok: true, ids: ['i1'] }; },
  },
};
globalThis.game = { pentaryn: { fake: ns, namespaces: () => ['fake'], describe: () => ({ modules: ['pentaryn-fake'], namespaces: { fake: ns.describe() } }) } };
```

Cases: read of `store.list` → `{ok:true, result:{rows:['Esren']}}` and `calls[0]` is `['list',
'Esren', {}]`; read of `store.set` → `BAD_ARGS` mentioning `pentaryn-write`, `calls` empty; write of
`store.list` → `BAD_ARGS` mentioning `pentaryn-read`; write `store.set` with `dryRun` → `opts.dryRun
=== true`, `ids: []`, summary ends `— ok`; `ref:'Ald'` is passed through verbatim and the envelope
is `{ok:false, code:'NOT_FOUND', reason:'NOT_FOUND: actor Ald'}` (the module answered, not the
fork); unknown path → `NOT_FOUND` with `paths` `['store.list','store.set','describe','inspect']`
(+ `selftest` when present); unknown ns → `NOT_FOUND` with `namespaces:['fake']`; `{ns:'*',
path:'describe'}` → the root object; `inspect` with `ref` works on read and is `BAD_ARGS` on write;
`timeoutMs` reaches the query opts as `+2000`; a thrown transport error becomes `MODULE_MISSING`/
`TIMEOUT`. Logging (with `PENTARYN_MCP_LOG_DIR` at a mkdtemp): a read appends exactly one line whose
keys are `ts,tool,ns,path,ref,ok,ms` (plus `code` on the `Ald` case) and **no** `args`/`result`; a
write appends the registry line with `args.opts`, `ok`, `summary`, `ids`; a `BAD_ARGS` zod rejection
of the write tool logs `ok:false` with the error. The tool filter: `FOUNDRY_MCP_TOOL_FILTER=pentaryn-write`
hides and refuses it (`assertAllowed`, F10).

### 3.7 What the module side must already give (no module work in this lane)

A namespace is reachable only when it publishes `contract` and `describe()`; today that is importer
and cursors (their `golden/describe.json` exist), names and pings (small tier), and every wave-2
module once its lane lands. `pentaryn-write` therefore has one live target at the gated phase
(`importer.import` with `dryRun:true`) and `pentaryn-read` has `describe`/`inspect`/`cursors.status`.
That is enough for the live smoke (§6).

## 4. Python lane — order and commits

| # | Id | Commit (subject) | What lands | Pins / tests |
|---|---|---|---|---|
| P1 | -37 | `fix(ops): bridge.scan guards ppid and reads ps once [declared]` | `scripts/foundry/ops/bridge.py:107-120`: `try/except (ValueError, IndexError): continue` around the ppid/lstart parse; one `ps -eo pid=,comm=` into a dict replaces `_comm(ppid)` per process (`_alive` unchanged) | `test_bridge_orphans.py`: canned `subprocess.run` (two valid rows, one malformed, comm map with a `claude` path, empty lsof) — pin today's `scan()` output through `judge()` first (the malformed row raises today: pin that), then the skip and `subprocess.run` call count 3 |
| P2 | -51 | `fix(scripts): roll_dice draws under a threading.Lock; httpx client per call [declared]` | `scripts/dnd_roller.py`: module-level `threading.Lock` taken in `roll_dice` around `asyncio.run`; `httpx.AsyncClient` created inside `_roll_dice_async` (`async with`); delete `_fetch_lock` and `_get_async_client`; `_pop_numbers` stays inside the guarded region | the strict xfail `test_concurrent_rolls_all_return_with_distinct_numbers` flips to plain; add the audit's 8-thread subprocess case (`timeout=20`, spy on `_pop_numbers`: 32 distinct values); serial pin unchanged |
| P3 | -44 | `fix(scripts): actions DB writers take a file lock [declared]` | `scripts/combat_actions_db.py`: `_locked()` context manager (`fcntl.flock(LOCK_EX)` on `<db>.lock`), wrapping the read-modify-write of `upsert`, `upsert_many`, `delete`; readers unlocked; `foundry/actions.jsonl.lock` in `.gitignore` | `test_concurrent_upserts_keep_every_row` from `xfail(strict=False)` to plain; serial render pin unchanged; a test that the lock file sits beside a tmp DB path (`DND_COMBAT_ACTIONS_DB`) |
| P4 | -48 | `docs(scripts): dnd-scripts tool contracts — annotations, error channels, the owned books [declared]` | (a) `annotations` on `year_to_age`, `age_to_year`, `age_convert`, `check_lore_links` (read-only), `build_timeline_svg`/`_key` (read-write, non-destructive), `fix_md_links` (`destructiveHint: true`); (b) `scripts/mcp/README.md` "Error channels" section (new tools raise; `combat_action_upsert` returns `{ok:false}`); (c) the one-sentence owned-books pointer on `search_rules`, `get_rule_section`, `search_spells`, `get_spell_details`, `search_srd`, `search_monsters`, `get_monster_details` | `NO_ANNOTATIONS` pin → empty set; `test_input_schemas_unchanged` must stay green (schemas untouched); `test_error_channels` unchanged |
| P5 | -27 | `perf(mcp): discovery parses only scripts that mention MCP_; skips are counted, not listed` | `scripts/mcp/server.py:550-595`: substring guard before `ast.parse`; `main()` prints real failures plus one count line; `--list-tools` unchanged | `test_server_discovery.py`: `test_discovery_unchanged_on_repo` (`repo` marker: sorted (name, path, handler present) and skipped (path, reason) equal before/after); `ast.parse` counter ≤ files containing `MCP_`; tmp repo with one helper + one broken tool → only the broken one on stderr |
| P6 | -29 | `feat(mcp): dnd-scripts per-call action log under PENTARYN_MCP_LOG_DIR` | `_run_call_worker`: when the env var is set append `{ts, server:'dnd-scripts', tool, mode:'inprocess'\|'subprocess', args (truncated 2 KB/value), ok, ms, error}` to `dnd-scripts-<YYYY-MM>.jsonl` (month per call); try/except so logging never fails a call; `client` is not available here (stdio) — omit | env unset → no file, payload identical; set → one line with exactly those keys; raising handler → `ok:false` and the unchanged JSON-RPC error; env pointing at a file → call still answers |
| P7 | mcp-fork-25 | `feat(ops): evallog.summarise + ops eval-report + make foundry-eval-report` | new `scripts/foundry/ops/evallog.py`: pure `summarise(lines, since)` → totals by `(ok, phase)`, top `game.pentaryn.<ns>.<fn>` paths, discovery-call count, top 10 runtime errors, per-tool counts from `mcp-*.jsonl`, p50/p95 ms, skipped malformed lines; it globs **`eval*.jsonl`** (F4) and `mcp-*.jsonl`, and reads `dnd-scripts-*.jsonl` per-tool counts (P6); `cli.py` subcommand `eval-report [--since] [--json]` beside `bridge-status`; one Makefile target `foundry-eval-report` (read the Makefile first; add beside `foundry-bridge-status`, never run a deploying target) | new `scripts/tests/test_evallog.py` with the audit's five fixture lines; `test_make_targets.py` gains the `-n` pin of the new target |
| P8 | -28 | `feat(ops): read-only foundry_modules and foundry_action_log dnd-scripts tools` — **gated on Joe (W2-B1)**; build only on a yes | new `scripts/foundry/ops/mcp_tools.py` (`MCP_GROUPS=['foundry']`, lazy imports): `foundry_modules` from `ops.index.rows()` (module.json + `golden/describe.json`) and `modules.check_report` (gates, as `--json` already does); `foundry_action_log` over `evallog.summarise` with `since`/`tool`/`ns` filters; `context/tools.md` section | discovery includes both with handlers; tmp logs dir with 3 lines (one `ok:false`) → `count=3` and the failure; tmp `MODULE_SRC_ROOT` → id/version; the full tool list equals the pre-change golden plus exactly these two (`fixtures/dnd_scripts_schemas.json` grows by two entries in the same commit) |
| P9 | docs | `docs(foundry): mcp-fork.md and README log paragraph for wave 2 — D14 tools, rotating eval log, client ids, filter blocks, phase args` | `context/foundry/mcp-fork.md`: the D14 tools (one table: what to call, the two log lines, the error codes), `FOUNDRY_MCP_TOOL_FILTER` now refuses calls, `eval-<YYYY-MM>.jsonl`, `client`, `phase:'args'`, `timedOut`, the foundry-module vitest command, `foundry-mcp-bridge.fork.applyRecharge`; `context/foundry/README.md` action-log paragraph (file names, phases, "upstream write tools are logged too"); guide Result tables in `migrate-mcp-fork.md` and `tooling-lane.md` | `check_context.py`; the existing `test_foundry_ops.py` doc gates stay green |

Order: P1 → P2 → P3 → P4 are independent of each other and of the fork; P5 → P6 → P7 → P8 share
`server.py`/the log conventions, in that order; P9 last, after the fork lane's F23 (it describes
what landed). -41 is **closed by pointer** (`c8fd327`, `9a83ba1`, wave 1); write that in
`tooling-lane.md`'s Result row in P9.

## 5. Owned paths

| Lane | Owns | Never touches |
|---|---|---|
| Fork | everything under `/Users/joe/Documents/GitHub/foundry-vtt-mcp-wave2-wt` (`src/fork/**` in both packages; the marked upstream hunks listed in §2 with their FORK.md rows; `packages/foundry-module/package.json` + `vitest.config.ts`; CHANGELOG, version files) | any file in the pentaryn repo; `dist/` in the live checkout |
| Python | `scripts/mcp/**`; `scripts/foundry/ops/{bridge.py, cli.py, evallog.py, mcp_tools.py}`; `scripts/{dnd_roller.py, combat_actions_db.py, check_lore_links.py, ages_converter.py, fix-md-links.py, build_timeline_svg.py, build_timeline_key.py, srd5_2.py}` (P4: descriptions/annotations only); `scripts/tests/{test_bridge_orphans, test_dnd_roller, test_combat_actions_db_characterisation, test_dnd_scripts_contracts, test_server_discovery, test_evallog, test_mcp_tools, test_make_targets}.py` + `scripts/tests/fixtures/dnd_scripts_schemas.json`; `Makefile` (one target); `.gitignore` (one line); `scripts/mcp/README.md`; `context/tools.md`; `context/foundry/mcp-fork.md`; the action-log paragraph of `context/foundry/README.md` (**not** the generated `module-index` block); `context/plans/addon-blueprint-2026-10/{migrate-mcp-fork.md, tooling-lane.md, wave-2-report.md, wave-2-bridge-plan.md}` | `foundry/module/**`, `foundry/lib/**`, `scripts/foundry/ops/{config.py, modules.py, index.py}`, `scripts/foundry/update/**`, `.mcp.json`, `.vscode/mcp.json` (live config: §6) |

The module lanes regenerate the Module APIs index in their own tier-change commits; the python lane
reads `ops/index.py` and `ops/modules.py` but does not edit them.

## 6. Deploy later — the gated live phase (nothing here runs in the code phase)

In this order, once Joe opens the live phase and `migrate/wave-2` is merged into `pentaryn` in
the fork and into the pentaryn integration branch:

1. **Fork server** (live checkout `/Users/joe/Documents/GitHub/foundry-vtt-mcp`): `git merge
   migrate/wave-2` → `npm -w @foundry-mcp/server test -- --run` → `npm run build:server` →
   `scripts/fork-footprint.sh` → `make foundry-bridge-status` → `kill -9` the stale `backend.js`
   (never a plain `kill`). Running sessions see `pentaryn-read`/`pentaryn-write` within 30 s
   (F11/F12's watcher); older wrappers need `/mcp` → reconnect.
2. **Bridge module** (F14, F15, F16a/b, F17, F19 change `packages/foundry-module`): `npm run
   build:foundry` → copy the built `dist/` files into `Data/modules/foundry-mcp-bridge` as on
   2026-10-10 ([`../prompt-markers.md`](../prompt-markers.md) §12) → reload the GM tab. Until this
   step the server-side F19 `applyRecharge` query answers "No handler found" and the fork's
   `recharge` falls back to its 'not applied (…)' text — ship 1 and 2 together.
3. **dnd-scripts log** (P6): add `PENTARYN_MCP_LOG_DIR=/Users/joe/Documents/GitHub/pentaryn/foundry/logs`
   to the dnd-scripts server entry in `.vscode/mcp.json` → Claude Code restart. Until then P6 logs
   nothing, silently, like the fork.
4. **Live smoke** (one call each, then its log line): `pentaryn-read {ns:"*", path:"describe"}`;
   `pentaryn-read {ns:"cursors", path:"status"}`; `pentaryn-read {ns:"importer", path:"inspect",
   ref:"<a PC name>"}`; `pentaryn-write {ns:"importer", path:"import", dryRun:true}`; `pentaryn-write`
   on a read row (expect `BAD_ARGS`); `pentaryn-read {ns:"ties", path:"x"}` (expect `NOT_FOUND`
   with the namespace list). Then one `eval-js` (expect `eval-2026-10.jsonl`, `client` on the
   line) and one `delete-tokens` of a scratch token (expect its line, F9).
5. **Declared changes to the live-test workflow** (they change what a player or the GM sees):
   F16a (-2): from a player console `game.users.activeGM.query('foundry-mcp-bridge.listActors', {})`
   → `Access denied`, while the GM tab's bridge tools still answer; F19 (-10): `dnd5e-add-feature`
   with `recharge` on a **token id** now applies; F15 (-8): a 1 s timeout eval returns `timedOut:true`.
6. `make foundry-eval-report` once, on the real logs (P7), and read what it says about the first
   D14 calls.

## 7. Open for Joe

Appended to [`wave-2-report.md`](wave-2-report.md) "Open for Joe" as W2-B1 and W2-B2:

| # | Item | What is needed |
|---|---|---|
| W2-B1 | python-tooling-28 adds two **new** dnd-scripts tools (`foundry_modules`, `foundry_action_log`). Joe's wave rule is "no new features except the approved bridge tools", and the audit itself calls -28 a possible deferred feature. P7 (`evallog.py` + `make foundry-eval-report`) gives the same answers from the shell without a new tool surface. | yes → P8 lands as planned (read-only, additive); no → close -28 by pointer to P7 |
| W2-B2 | D14 compact read lines go into `mcp-<YYYY-MM>.jsonl` beside the write lines (distinguished by `tool` and the absence of `args`), not into a third file. Chosen because the monthly review already reads that file and `evallog.py` reports per-tool counts from it. | confirm, or ask for `reads-<YYYY-MM>.jsonl` (a one-line change in F21 and P7) |

Not decisions, recorded for the merge review: mcp-fork-15 / prompts-lookup-11 / -12 wait for
prompts (2.10); python-tooling-50 is not in this lane; namespaces without `describe()` stay
eval-js-only until their module migrates (the D14 `NOT_FOUND` names them).

## Result (fill when done)

| | |
|---|---|
| Fork commits F0–F23 (sha each) | ______ |
| Python commits P1–P9 (sha each) | P1 `6931c7c7` + `586eeb1b` · P2 `09412de5` · P3 `df3a47ac` · P4 `e1062a2b` · P5 `6ecdaf43` + `ea0d3d2c` · P6 `cc2a9570` + `f1aeff07` · P7 `85727ca8` · P8 **not built** (W2-B1 unanswered) · P9 first half `b4b62e29` (what had landed: fork F0, F3–F6, F8–F10 + python P6/P7); second half: `migrate-mcp-fork.md` Result `bfca9429`; `mcp-fork.md` (D14 table, `timedOut`, `applyRecharge`, coded `NOT_GM`) `7c2aef7b` (integration review) |
| Pins flipped (`[declared]` list) | python: -37 (malformed-ppid raise → skip; per-parent `ps` → one), -51 (`test_concurrent_rolls_all_return_with_distinct_numbers` strict xfail → plain), -44 (`test_concurrent_upserts_keep_every_row` xfail → plain), -48 (`NO_ANNOTATIONS` → ∅); -27's two perf/stderr pins (not declared: no behaviour a caller sees) |
| Stopped steps (frozen test red twice) | python: none. Pre-existing red on the branch, not this lane: `test_update_escalation.py::test_the_real_registry_matches_the_code` (`itempiles-attunement-repair` and two more rows: the attunement lane's `5f3bf2d5` moved the markers into `actor-adapter.mjs`, `foundry/adjustments.yml` still names `attunement.mjs`; for that lane) |
| Deployed (date, by which live session) | ______ |
