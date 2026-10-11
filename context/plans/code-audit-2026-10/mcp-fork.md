---
title: "Code audit 2026-10 — MCP fork (foundry-vtt-mcp, branch pentaryn)"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — MCP fork (foundry-vtt-mcp, branch pentaryn)

**Read this when:** you are about to refactor, harden or document MCP fork (foundry-vtt-mcp, branch pentaryn) and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

> Paths starting `packages/` are relative to the `foundry-vtt-mcp` repo (branch `pentaryn`, snapshot base `59c781e`).

## Summary

### fork: prompt-markers MCP tool (foundry-vtt-mcp)

**Purpose.**

A typed MCP front for pentaryn-prompts. It runs zod validation per action, sets transport timeouts, turns crops into MCP image blocks and temp files, gates batches over 5 on an identical-spec dry run, prints the module's readback text verbatim and logs replace calls to the action log.

**Health.**

Tested (735-line vitest file covering arguments, helpers, gather/replace rendering, specFile and registry logging).
- Validation drift: it duplicates the module's argument validation in zod by hand, and that copy has drifted (see prompts-lookup-11).
- Scattered tables: per-action knowledge is spread over six places.
- Thin logging: the only log line is `prompt-markers ${action}`, with no call id, counts, duration or module version.

**LLM interface.**

Good shape: one tool, an action enum, module error codes passed through, MODULE_MISSING and TIMEOUT made explicit. The problems are the drifted schema and the paging advice in the gather trailer (:764), which sends `scenes:[next]` instead of the module's `from`.

**How to extend.**

A new action means editing QUERIES (:37), TIMEOUTS (:46), the args schema, ACTIONS/SCHEMAS (:430–439), DEFINITION.inputSchema (:507), the handler switch (:879) and the module's registerQueries. Fold these into one ACTION_TABLE (prompts-lookup-12).

### mcp-fork (registry, action logging, tool filter, eval-js, bridge handlers)

**Purpose.**

Hangs fork-only MCP tools off the default: case of upstream's switch in backend.ts. Writes JSONL action logs (mcp-YYYY-MM.jsonl, plus a dedicated eval.jsonl). Hides tools that match the FOUNDRY_MCP_TOOL_FILTER deny-globs. On the module side it registers the GM-guarded `foundry-mcp-bridge.fork.eval` CONFIG.queries handler with a depth-capped serializer.

**Health.**

Small and well commented: registry 194 lines, eval-js 138, handlers 182, content 42, index 23.
- Tests: the registry has one logging test, borrowed from prompt-markers.test.ts. Nothing tests eval-js, serialize() or requireGM; foundry-module cannot run tests at all.
- Two separate log writers duplicate the env read, mkdir and append (registry.ts:87-102 and 167-193; eval-js.ts:73-81 and 115-133).
- Correctness: the log month is fixed when the backend starts. The `ok` field is wrong for failed evals. upstream write tools are never logged, so the audit trail covers only 2 of roughly 45 tools.
- Dead code: the Set branch in serialize (handlers.ts:86) and the deny branch in dispatch (registry.ts:137).
- Comment drift: "table-mode guard" (registry.ts:31) does not exist. "exactly two one-line hunks" (index.ts:3) is really 5 hunks in backend.ts plus hunks in 9 other upstream files.

**LLM interface.**

Today:
- Every pentaryn module is reached through eval-js with hand-written JavaScript against game.pentaryn.<ns>.
- There is no namespace index in context/foundry/README.md (line 44 only says eval-js is the escape hatch).
- The eval-js description does not state the serializer limits: depth 4, 200 array items, 100 collection items, `_` keys dropped, and full source only for a top-level document.
- The log shows 68 discovery-only calls and 814 game.pentaryn calls in total.

Should be (within this behaviour-preserving programme):
- A namespace index where an LLM looks first (mcp-fork-20) and an eval-js description that states the serializer rules and points at `game.pentaryn.<ns>.describe()` (mcp-fork-21). With the per-module `describe()`/`inspect(ref)` reads and the ref resolver (master §3.1–3.2), one eval answers each question.
- Feature proposal, deferred (was mcp-fork-3, dropped in verification as a new tool): one generic, logged fork tool `pentaryn-api` with `describe` and `call {path, args:[{$actor:"Esren"}]}`, resolving actor references the way the bridge's own findActorByIdentifier does. Nothing in the refactor waves depends on it.

**How to extend.**

Today a new tool means:
- add `packages/mcp-server/src/fork/tools/<name>.ts` exporting `register<Name>(registry, client, logger)`
- add it to `fork/index.ts:18-19`
- if it needs a browser-side handler, add it to `packages/foundry-module/src/fork/handlers.ts:175` (or call a pentaryn module's own `CONFIG.queries['pentaryn-<m>.<fn>']`, as prompt-markers does)
- build with `npm run build:server`, then `kill -9` backend.js (README.md:102)

What is unclear:
- None of this is written down. ops.md:24 and :777 still say "design only / not implemented".
- The `summary`/`ids` result convention the log reads is implicit (registry.ts:183-184).
- How to pick the `write` predicate is not documented.
- No checklist marks which upstream hunks are local and which could go upstream as PRs.

### mcp-fork prompt-markers tool

**Purpose.**

A typed MCP tool with an action enum: list, gather, crops, replace, show. It fronts the pentaryn-prompts module's GM-guarded CONFIG.queries. The tool:
- validates arguments with zod
- sets a timeout per action
- turns crops into MCP image blocks and also writes them to the OS temp dir
- requires a dry run before any batch over 5
- reads a replace spec from disk (specFile)
- logs only replace

**Health.**

905 lines, of which about 440 (lines 64-439) are zod schemas that mirror validators the module already enforces: npc-core.mjs:13/26, replace.mjs:33 and patch.mjs:66. There is no drift check between the two copies.
- Duplication inside the file: SIZE_WORDS duplicates NPC_SIZES (68 vs 79), and the inline `{data, quantity}` item union is pasted three times.
- Well tested: 735 lines of vitest using a mocked foundryClient. This is the fork's best-tested code and the template other tools should copy.

**LLM interface.**

Good. This is the one typed path into a pentaryn module, with one-call gather and the module's readback text returned verbatim.

Gaps:
- With specFile, the action log keeps only the path, so the spec itself is lost from the audit.
- The fork's copy of the validation drifts from the module's. A new module field means rebuilding the fork and SIGKILLing the broker.

**How to extend.**

A new action means touching three places:
- ACTIONS/SCHEMAS/QUERIES/TIMEOUTS (lines 37-52 and 430-439)
- a handler function and a case in `handle()` (lines 876-891)
- the description text (lines 507-603)

A new `with.kind` means adding a zod object to `With` (line 295) and to the module's KINDS (replace.mjs:33). Nothing enforces the second step.

### mcp-fork dnd5e 6 port

**Purpose.**

Reads the dnd5e 6 data shapes:
- movement.speeds, in adapter.ts:255-274 and compendium.ts:1321
- the `rarities` Set, in compendium.ts:1337 and data-access.ts:2772/2865
- Set fields in the sanitizer, at data-access.ts:3874
- the movement shim skip, at data-access.ts:3896

It also fixes the save and initiative formulas in request-player-rolls (data-access.ts:5839-5860) and adds `recharge` to dnd5e-add-feature, applied through the fork eval (add-feature.ts:458-504).

**Health.**

Tests: adapter.test.ts (71 lines) and compendium.dnd5e6.test.ts (108 lines) cover the server side. The module-side hunks in data-access.ts have no test.

Upstream footprint: all of it lives in upstream files, 499 lines across 21 files. Most of it could go upstream as a PR, but it was committed together with the fork-only prompt-markers in 59c781e.

The recharge code puts fork logic (an eval script built as a string) inside upstream's add-feature.ts. That script also resolves actors differently from the handler that just created the feature: it has no scene-token fallback, unlike data-access.ts:6962.

**LLM interface.**

Transparent to the LLM: the same upstream tools, now returning correct dnd5e 6 data. `recharge` is advertised in the add-feature schema.

**How to extend.**

Future dnd5e ports belong in an upstream-PR branch, kept separate from fork/ work. Fork behaviour that has to run in the browser (such as recharge) belongs in `packages/foundry-module/src/fork/handlers.ts` as a typed query, not in eval strings inside upstream tool files.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| mcp-fork-18 | Performance gains | low | S | The sanitizer rebuilds constant key arrays for every object it visits |
| mcp-fork-9 | Maintainability gains | medium | S | Extract and test serialize(): it has dead code and undocumented rules |
| mcp-fork-14 | Maintainability gains | medium | S | Split the ~375-line schema block out of prompt-markers.ts and remove internal duplicates |
| mcp-fork-5 | Defragmentation | medium | S | Two log writers read the same env var and append in two different ways |
| mcp-fork-24 | Defragmentation | low | S | Four implementations of the CONFIG.queries GM guard with different errors |
| mcp-fork-1 | Logging / auditability gains | high | S | Upstream write tools never reach the action log |
| mcp-fork-4 | Logging / auditability gains | medium | S | Failed evals are logged ok:true and every eval script is stored twice |
| mcp-fork-7 | Logging / auditability gains | medium | S | No session or caller id in the logs though several sessions share one broker |
| mcp-fork-16 | Logging / auditability gains | low | S | A replace made through specFile logs only the file path, not the spec |
| mcp-fork-17 | Logging / auditability gains | low | S | An eval-js call rejected for bad arguments leaves no line in eval.jsonl |
| mcp-fork-25 | Logging / auditability gains | low | S | No repeatable report from the action logs though they drive tool promotion |
| mcp-fork-2 | Hardening | high | S | Any player can trigger upstream bridge queries through User#query |
| mcp-fork-8 | Hardening | medium | S | The eval timeout timer is never cleared and a timeout looks like a script error |
| mcp-fork-10 | Hardening | medium | M | Recharge resolves actors differently from the tool that created the feature and its write is unlogged |
| mcp-fork-15 | Hardening | medium | S | The fork's zod copy of prompts vocabularies can drift from the module's validators |
| mcp-fork-6 | Hardening | low | S | The action log's month is fixed when the backend starts |
| mcp-fork-12 | Hardening | low | S | The tool-list change detector ignores schema changes and same-length description edits |
| mcp-fork-13 | Hardening | low | S | The tool filter hides upstream tools but does not block calls to them |
| prompts-lookup-11 | Extendability | high | M | Pin (tests only) the drift between the tool's zod schemas and what the module accepts |
| mcp-fork-11 | Extendability | medium | M | The fork's upstream footprint is undocumented and larger than claimed |
| prompts-lookup-12 | Extendability | medium | S | One per-action table in the tool and one query list in the module |
| mcp-fork-22 | Extendability | low | S | Type the fork tool contract: result fields and the write flag |
| mcp-fork-20 | LLM interface | medium | S | No index of game.pentaryn namespaces where an LLM looks first |
| mcp-fork-21 | LLM interface | medium | S | The eval-js description hides the serializer rules and where pentaryn APIs live |
| mcp-fork-19 | Documentation / skills | high | S | No use-doc for the fork, and the docs that exist say it is unimplemented |
| mcp-fork-23 | Documentation / skills | low | S | Source comments describe things that are not there |

## Performance gains

### mcp-fork-18 — The sanitizer rebuilds constant key arrays for every object it visits

**Category:** Performance gains · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/foundry-module/src/data-access.ts:3896–3899`

**Anchor:** `const DEPRECATED_DND5E_MOVEMENT_KEYS = ['walk', 'burrow', 'climb', 'fly', 'jump', 'swim'];`

**Current.**

removeSensitiveFields (data-access.ts:3842) recurses over every node of actor/item payloads; on each object node it allocates DEPRECATED_DND5E_SENSE_KEYS (upstream, line ~3888) and the fork's DEPRECATED_DND5E_MOVEMENT_KEYS (3896) and runs includes() scans per key. Thousands of nodes per get-character. The same six keys also appear in adapter.ts (LEGACY_SPEED_KEYS).

**Proposed.**

Hoist the fork constant to module scope as const DND5E_LEGACY_MOVEMENT_KEYS=new Set([...]) and use .has(). Leave the upstream senses array alone (hoist only in the dnd5e6 upstream PR) to keep the fork diff small.

**Behaviour test recipe (write first, must pass before and after).**

Add vitest to foundry-module (mcp-fork-2). src/data-access.sanitize.test.ts: const da=Object.create(FoundryDataAccess.prototype); da.moduleId='t'; call da.removeSensitiveFields(input) (signature: obj, visited=new WeakSet, depth=0; stub globalThis.game={} if the import needs it). Cases: {movement:{speeds:{walk:30},walk:30,fly:0,units:'ft'}} -> {movement:{speeds:{walk:30},units:'ft'}}; {movement:{walk:30,fly:10}} (pre-6, no speeds) unchanged; {senses:{ranges:{darkvision:60},darkvision:60}} -> {senses:{ranges:{darkvision:60}}}; {props:new Set(['mgc'])} -> {props:['mgc']}. All pass before and after.

**Risk.** Set.has equals Array.includes for string keys; the pre-6 and shim cases cover both branches.

**Related:** mcp-fork-11

## Maintainability gains

### mcp-fork-9 — Extract and test serialize(): it has dead code and undocumented rules

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/foundry-module/src/fork/handlers.ts:42–116`

**Anchor:** `function serialize(value: any, depth = 0, seen = new WeakSet()): any {`

**Current.**

Every eval-js result passes through module-private, untested serialize(). The Set branch at line 86 ('if (value instanceof Set) return [...value].slice(0, 100)...') is unreachable: a Set has entries() and numeric size so the collection test at ~70-72 catches it first (100 items plus a '[+N more]' marker). The single WeakSet treats any repeated reference as circular ({a:o,b:o} gives b:'[circular]'). Other unstated rules: document source only at depth 0, '_' keys other than _id dropped, depth cap 4 (depth>4 -> '[max depth]'), arrays capped at 200, strings unbounded.

**Proposed.**

Move serialize and safeToObject verbatim to packages/foundry-module/src/fork/serialize.ts exporting serialize and SERIALIZE_LIMITS={depth:4,array:200,collection:100} (used in place of the literals); handlers.ts imports it. Delete the unreachable line 86 (test proves equivalence). Add a JSDoc listing the rules.

**Behaviour test recipe (write first, must pass before and after).**

Add vitest to foundry-module (mcp-fork-2). src/fork/serialize.test.ts, written against the current code before the move: serialize(new Set([1,2])) -> [1,2]; Set of 150 numbers -> length 101, last '[+50 more]'; serialize(new Map([['a',1]])) -> [1]; const o={x:1}; serialize({a:o,b:o}) -> {a:{x:1},b:'[circular]'}; serialize({_id:'i',_hidden:1,v:2}) -> {_id:'i',v:2}; {l1:{l2:{l3:{l4:{l5:{l6:1}}}}}} -> l5 value '[max depth]'; array of 201 -> length 201, last '[+1 more]'; serialize({documentName:'Actor',_id:'A',name:'N',toObject:()=>({k:1})}) -> {_document:'Actor',_id:'A',name:'N',source:{k:1}} and nested one level has no source; serialize(new Error('e')).error==='e'; serialize(()=>1) matches /^\[Function/; serialize(10n)==='10'.

**Risk.** Only unreachable code is removed; the Set tests pass before and after, proving it.

**Related:** mcp-fork-8, mcp-fork-21

### mcp-fork-14 — Split the ~375-line schema block out of prompt-markers.ts and remove internal duplicates

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/tools/prompt-markers.ts:79–439`

**Anchor:** `const SIZE_WORDS = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;`

**Current.**

prompt-markers.ts is ~905 lines; roughly lines 64-439 are zod schemas. SIZE_WORDS (line 79) duplicates NPC_SIZES (line 68). The inline-item union z.object({data:z.record(z.unknown()),quantity:...}).strict() is pasted three times (Patch.addItems ~131-133, WithCharacter.items ~186-188, WithHotspot.items ~244-246). The disposition enum is repeated at 125 and 319. Handler, rendering and schemas share one file.

**Proposed.**

Create packages/mcp-server/src/fork/tools/prompt-markers.schema.ts holding lines ~64-439, badSpec, parseArgs, one SIZES constant, InlineItem and ItemSpec=z.union([ItemRef,InlineItem]), Disposition=z.enum([...]). prompt-markers.ts imports and re-exports parseArgs and ReplacementT so prompt-markers.test.ts imports (lines 5-15) do not change.

**Behaviour test recipe (write first, must pass before and after).**

Before the split add describe('schema characterisation') to prompt-markers.test.ts: run a fixed table of ~20 inputs through parseArgs and record {ok:true,data}|{ok:false,message} with expect(results).toMatchInlineSnapshot(). Table: every with.kind valid; each kind with one unknown key; patch.size:'lg' and npc.size:'lg'; addItems with {data,quantity:0} and {name} only; disposition:'evil' on patch and replacement; party '4x5', {size:4,level:5}, [3,3,4]; scenes as a string; crops with 'p1'; show without id. Snapshot byte-identical after the split; the existing ~30 tests pass.

**Risk.** zod error text depends on union order and refine placement; the inline snapshots of messages catch reordering.

**Related:** mcp-fork-15

## Defragmentation

### mcp-fork-5 — Two log writers read the same env var and append in two different ways

**Category:** Defragmentation · **Impact:** medium · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/registry.ts:87–102`

**Anchor:** `const logDir = (process.env.PENTARYN_MCP_LOG_DIR ?? '').trim();`

**Current.**

registry.ts:87-102 and the log() method read PENTARYN_MCP_LOG_DIR, mkdir, build a path and appendFileSync with a warn on failure. eval-js.ts (~73-81 and 115-133) repeats it with differences (mkdir error silently swallowed, path built from the env var directly). A third tool wanting its own log would copy it again.

**Proposed.**

Extract packages/mcp-server/src/fork/action-log.ts: class ActionLog { static fromEnv(logger, env=process.env); get enabled(); append(stream:'actions'|'eval', line:object) }. 'actions' -> mcp-YYYY-MM.jsonl, 'eval' -> eval.jsonl; warn once per stream on failure. ForkRegistry takes an optional ActionLog (default fromEnv); createForkRegistry passes the same instance to registerEvalJs. Keep file names and key order exactly.

**Behaviour test recipe (write first, must pass before and after).**

Before refactoring add eval-js.test.ts: registerEvalJs(fakeRegistry,{query:vi.fn(async()=>({ok:true,phase:'complete',ms:2,result:1}))},logger); capture the handler from fakeRegistry.register; call with {script:'return 1',purpose:'p'}. Assert eval.jsonl has one line whose Object.keys order is exactly ts,purpose,script,ok,phase,ms (ok:true,phase:'complete',ms:2). Query throwing new Error('Foundry VTT module not connected') -> line ok:false,phase:'transport', error starts 'Foundry VTT', handler rethrows. PENTARYN_MCP_LOG_DIR unset -> no file, handler still returns. Registry-side assertions from mcp-fork-4. Same tests after refactor.

**Risk.** Key order or file names could shift by accident; assert them explicitly since greps in context/foundry/README.md depend on them.

**Related:** mcp-fork-4, mcp-fork-6, mcp-fork-17

### mcp-fork-24 — Four implementations of the CONFIG.queries GM guard with different errors

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/foundry-module/src/fork/handlers.ts:26–33`

**Anchor:** `function requireGM(ctx?: { user?: { isGM?: boolean } }): void {`

**Current.**

The same rule is written four ways: the fork's requireGM (handlers.ts:26-33, plain Error); pentaryn-prompts guarded() (prompts.mjs:~261-268, same checks in opposite order, codedError('NOT_GM')); riders.mjs:~637 and journal.mjs:~547 inline 'not the active GM' checks that are player relays and deliberately accept non-GM senders. Two contracts (GM-only API vs player relay to active GM) are unnamed, so a new module copies whichever it finds first.

**Proposed.**

Document the two contracts by name in the mcp-fork use-doc (mcp-fork-19): GM-only query = copy prompts' guarded() (coded NOT_GM errors); player relay = riders/journal shape plus a ctx.user ownership check. In the fork use the single assertSenderIsGM (mcp-fork-2). Code sharing across pentaryn modules waits on the shared-lib decision.

**Behaviour test recipe (write first, must pass before and after).**

When extracted, a node test with stub game={user:{isGM:true},users:{activeGM:{isSelf:true}}}: gmQuery(fn)(d,{user:{isGM:false,name:'P'}}) rejects with code 'NOT_GM' and message 'P is not a GM' (pin against guarded() in prompts.mjs first); gmQuery(fn)(d) with no ctx calls fn; relayQuery(fn)(d,{user}) with activeGM.isSelf=false rejects 'not the active GM'. Until then the fork side is covered by mcp-fork-2's tests.

**Risk.** Docs first; the code consolidation is gated by pinned error texts (LLM tooling matches on codes).

**Related:** mcp-fork-2, mcp-fork-19

## Logging / auditability gains

### mcp-fork-1 — Upstream write tools never reach the action log

**Category:** Logging / auditability gains · **Impact:** high · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/backend.ts:1519–1793`

**Anchor:** `const { name, args } = (msg.params || {}) as { name: string; args?: any };`

**Current.**

Only forkRegistry.dispatch writes mcp-YYYY-MM.jsonl (registry.ts:149-164). Every upstream tool is dispatched by the switch at backend.ts:1522-1775 and never passes through the registry (the default case at ~1768 only reaches fork tools). So dnd5e-create-npc, dnd5e-add-feature, delete-tokens, update-token, move-token, manage-actors, manage-world-items, switch-scene, toggle-token-condition, use-item, create-actor-from-compendium and the ownership tools leave no trace. context/foundry/README.md:110 says 'Every fork tool call lands in foundry/logs/mcp-<month>.jsonl'; the upstream gap is never stated.

**Proposed.**

1. Add packages/mcp-server/src/fork/upstream-writes.ts exporting UPSTREAM_WRITE_GLOBS (create-*, update-*, delete-*, manage-*, dnd5e-*, wfrp4e-*, move-token, toggle-token-condition, switch-scene, use-item, assign-actor-ownership, remove-actor-ownership, link-quest-to-npc, request-player-rolls, generate-map, cancel-map-job) and isUpstreamWrite(name) reusing globToRegExp from registry.ts (export it). 2. Add ForkRegistry.auditUpstream(name,args,{ok,result?,error?,ms}) in registry.ts: return early if this.tools.has(name) (fork tools already logged) or !isUpstreamWrite(name); else call the private log(). 3. backend.ts hunks: 'const started = Date.now();' right after line 1519 (before the try); auditUpstream(...ok:true...) after the result is produced (after line 1775, before toMcpPayload at 1778); auditUpstream(...ok:false, error: errorMessage...) in the catch at ~1780. Tool results unchanged.

**Behaviour test recipe (write first, must pass before and after).**

New packages/mcp-server/src/fork/registry.test.ts (vitest, existing mcp-server harness: npm -w @foundry-mcp/server test -- --run src/fork). Set PENTARYN_MCP_LOG_DIR to an mkdtemp dir. Characterise first: register fork tool 't' write:true, dispatch once -> exactly 1 line matching {tool:'t',ok:true}; a write:false tool adds no line. New seam: auditUpstream('delete-tokens',{tokenIds:['a']},{ok:true,result:{success:true},ms:3}) appends one line matching {tool:'delete-tokens',ok:true,ms:3,args:{tokenIds:['a']}}; auditUpstream('get-character',{},{ok:true}) appends nothing; auditUpstream('t',...) for a registered fork tool appends nothing; {ok:false,error:'boom'} appends {ok:false,error:'boom'}. The backend hunk does not touch result, so toMcpPayload tests (prompt-markers.test.ts) stay green.

**Risk.** Logging only; log() has its own try/catch (registry.ts:~189) so a write failure cannot fail a call. A glob could log a read tool by mistake; the get-character negative case catches that. Logged args may include large payloads; sanitizeForLog caps them.

**Related:** mcp-fork-4, mcp-fork-5, mcp-fork-7

### mcp-fork-4 — Failed evals are logged ok:true and every eval script is stored twice

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/registry.ts:149–186`

**Anchor:** `if (isWrite) this.log({ tool: name, args, ok: true, result, ms: Date.now() - started });`

**Current.**

eval-js returns failures as values ({ok:false,phase:'runtime'}), so dispatch logs them ok:true (registry.ts:149). Each eval-js call is also logged in eval.jsonl with the full script and in mcp-*.jsonl with args sanitized to 2,048 chars, so eval-js dominates the monthly log (3,335 of 3,337 lines in mcp-2026-10.jsonl) and buries real actions.

**Proposed.**

1. registry.ts log() (~line 180): write ok: entry.ok && entry.result?.ok !== false and add phase: entry.result?.phase when present. 2. Add optional logArgs?: (args)=>unknown to register() opts and ForkToolEntry; dispatch passes entry.logArgs ? entry.logArgs(args) : args to log(), in a try/catch falling back to raw args. 3. eval-js.ts registers with { write: true, logArgs: a => ({ purpose: a?.purpose, scriptChars: String(a?.script ?? '').length, timeoutMs: a?.timeoutMs }) }; the full script remains in eval.jsonl. Update the context/foundry/README.md log paragraph (~lines 108-127).

**Behaviour test recipe (write first, must pass before and after).**

registry.test.ts (vitest): dispatch a write:true tool whose handler returns {ok:false,phase:'runtime',summary:'s'} and assert the CURRENT line has ok:true (pin), then flip to ok:false,phase:'runtime' in the same commit. A throwing tool still logs ok:false with error. logArgs: register with logArgs:a=>({n:a.script.length}), dispatch {script:'abc',purpose:'p'} -> line.args toEqual {n:3}; throwing logArgs falls back to raw args; dispatch result toEqual with and without logArgs. Existing prompt-markers.test.ts predicate test (~696-719) stays green.

**Risk.** Only log lines change; returned results are untouched (asserted). Anyone grepping mcp-*.jsonl for eval script text loses it; eval.jsonl remains the record.

**Related:** mcp-fork-1, mcp-fork-5, mcp-fork-16

### mcp-fork-7 — No session or caller id in the logs though several sessions share one broker

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/index.ts:371`

**Anchor:** `const res = await backend.send('call_tool', { name, args: args ?? {} });`

**Current.**

Each Claude Code session spawns its own index.js wrapper but all share one backend; lines in mcp-*.jsonl and eval.jsonl carry no session identity, so concurrent workflows' evals interleave indistinguishably.

**Proposed.**

1. index.ts:371: send client:{pid:process.pid,ppid:process.ppid} alongside name/args. 2. backend.ts:1519 destructure client; pass forkRegistry.dispatch(name,args,{client}) at line 1771 and into auditUpstream (mcp-fork-1). 3. registry dispatch(name,args,meta?) adds client:meta?.client to the log line; ForkToolHandler gains an optional 2nd param (meta) which existing handlers ignore; eval-js uses it for eval.jsonl.

**Behaviour test recipe (write first, must pass before and after).**

registry.test.ts: dispatch('t',{action:'replace'},{client:{pid:1,ppid:2}}) -> line has client:{pid:1,ppid:2}; dispatch('t',{action:'replace'}) with no meta -> line keys/values identical to today's ignoring ts/ms (undefined is dropped by JSON.stringify); handler receives args unchanged as first parameter. prompt-markers.test.ts stays green.

**Risk.** Old wrapper + new backend just yields client undefined; results unchanged.

**Related:** mcp-fork-1, mcp-fork-11

### mcp-fork-16 — A replace made through specFile logs only the file path, not the spec

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/tools/prompt-markers.ts:899–908`

**Anchor:** `registry.register(DEFINITION, createPromptMarkersHandler({ foundryClient, logger }), {`

**Current.**

The registry logs raw args (registry.ts log()). With {action:'replace',specFile:'/abs/x.json',dryRun:false} the audit line holds only the path; the playbook says to edit and then delete that file, so what was built cannot be reconstructed. ids survive, the spec does not. withSpecFile is at prompt-markers.ts:455 and used in the handler at ~877.

**Proposed.**

Use the logArgs hook from mcp-fork-4: registry.register(DEFINITION, handler, { write: a=>a?.action==='replace', logArgs: a=>{ try { return { ...withSpecFile(a), specFile: a?.specFile }; } catch { return a; } } }). sanitizeForLog still caps >20 replacements to {count,first}. Optionally add specHash (the dry-run gate's specKey) to tie a real run to its dry run. To avoid a double file read, have the handler return the expanded args on the result and log those.

**Behaviour test recipe (write first, must pass before and after).**

Extend the 'registry logging' describe in prompt-markers.test.ts: write a temp spec file {call:'pm-9',replacements:[none('p4')]}; register the real definition with a mocked client returning moduleResult (test ~352-375); dispatch {action:'replace',specFile:file,dryRun:true}; parse the log line: args.replacements[0].id==='p4', args.specFile===file, args.call==='pm-9'. Handler result toEqual the result without logArgs; existing specFile test (~601-661) passes unchanged.

**Risk.** withSpecFile runs twice (log and handler); a file edited between could log a different spec (microsecond window; closed by returning expanded args from the handler).

**Related:** mcp-fork-4

### mcp-fork-17 — An eval-js call rejected for bad arguments leaves no line in eval.jsonl

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/tools/eval-js.ts:86–87`

**Anchor:** `const args = ArgsSchema.parse(rawArgs);`

**Current.**

ArgsSchema.parse runs before the try/finally that writes eval.jsonl, so a call missing purpose or with timeoutMs:500 throws a ZodError and writes nothing there; only the registry line records it, with a multi-line zod error. The README says every eval-js call lands in eval.jsonl, the file the promotion review reads.

**Proposed.**

Use safeParse. On failure append {ts,purpose:rawArgs?.purpose??null,script:rawArgs?.script??null,ok:false,phase:'args',error:issues joined 'path: message; ',ms:0} to eval.jsonl then rethrow the ORIGINAL ZodError (so thrown text is unchanged). Update the phase list in context/foundry/README.md.

**Behaviour test recipe (write first, must pass before and after).**

eval-js.test.ts (harness from mcp-fork-5): handler({script:'return 1'}) with no purpose rejects; pin first: no eval.jsonl line and error is a ZodError mentioning 'purpose'. After: one line with phase:'args' and error matching /purpose/, call still rejects with instanceof ZodError. Valid calls produce the same line as before.

**Risk.** New phase value 'args' in eval.jsonl; greps excluding 'transport' unaffected.

**Related:** mcp-fork-5

### mcp-fork-25 — No repeatable report from the action logs though they drive tool promotion

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `scripts/foundry/ops/cli.py:54`

**Anchor:** `add("bridge-status", "MCP bridge processes: which are live sessions, which are orphans, "`

**Current.**

context/foundry/README.md makes the eval log 'the promotion mechanism' and schedules a revisit against a clean month of log, but nothing reads the logs; each review is ad-hoc Python (namespace usage, failure phases, discovery calls). The prose snapshot of 323 calls is as manual as the review.

**Proposed.**

Add scripts/foundry/ops/evallog.py with pure summarise(lines: Iterable[str], since: str|None)->dict returning totals by (ok,phase), top game.pentaryn.<ns>.<fn> paths (regex game\.pentaryn\??\.(\w+)(?:\??\.(\w+))?), count of Object.keys(game.pentaryn discovery calls, top 10 runtime errors, per-tool counts from mcp-*.jsonl, p50/p95 ms, skipped malformed lines. Wire as cli.py subcommand eval-report (next to line 54) and make foundry-eval-report, output via _say() like siblings. Read-only reporting; no existing behaviour changes.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_evallog.py with fixture lines: {"ok":true,"phase":"complete","script":"return game.pentaryn.ties.attributes.of(a)","ms":5}; {"ok":false,"phase":"runtime","error":"hits.slice is not a function","script":"game.pentaryn.rules.search('x').slice(0)","ms":3}; {"ok":false,"phase":"transport","error":"Foundry VTT module not connected","script":"x"}; {"ok":true,"phase":"complete","script":"return Object.keys(game.pentaryn)","ms":1}; one malformed line. Assert totals=={('True','complete'):2,('False','runtime'):1,('False','transport'):1}, paths[('ties','attributes')]==1, discovery==1, skipped==1, since='2026-09-01' filters on ts. Run: .venv/bin/python -m pytest -q -p no:cacheprovider scripts/tests/test_evallog.py.

**Risk.** New read-only script, no runtime path touched; parser must tolerate the multi-MB file and partial last lines (covered by the malformed fixture).

**Related:** mcp-fork-4

## Hardening

### mcp-fork-2 — Any player can trigger upstream bridge queries through User#query

**Category:** Hardening · **Impact:** high · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/foundry-module/src/fork/handlers.ts:175–182`

**Anchor:** `export function registerForkHandlers(): void {`

**Current.**

The fork guards only its own eval handler with ctx.user (handlers.ts:26-33). Upstream's CONFIG.queries['foundry-mcp-bridge.*'] handlers check only game.user?.isGM on the running client (queries.ts), which is always true in the GM tab, so a player's console running game.users.activeGM.query('foundry-mcp-bridge.createNpcActor',{...}) executes as the GM. The hole closed for eval is open for every typed write.

**Proposed.**

Add guardBridgeQueries() to handlers.ts, called at the end of registerForkHandlers() (main.ts runs queryHandlers.registerHandlers() first, so no upstream hunk). It wraps every CONFIG.queries key starting 'foundry-mcp-bridge.' but not 'foundry-mcp-bridge.fork.' once (mark h.__forkGuarded) as (data,ctx)=>{ if (ctx?.user && !ctx.user.isGM) throw new Error('Access denied: bridge queries may only be queried by a GM.'); return h(data,ctx); }. Factor the ctx check out of requireGM into assertSenderIsGM(ctx). No-ctx paths (bridge socket, pentaryn-prompts/npc.mjs calling CONFIG.queries['foundry-mcp-bridge.createNpcActor'] called with args directly) are unchanged. NOTE: this is a deliberate hardening that refuses non-GM senders; it is the only intended behaviour difference.

**Behaviour test recipe (write first, must pass before and after).**

foundry-module has no test runner: add vitest devDependency + 'test' script to packages/foundry-module/package.json. New src/fork/handlers.test.ts: globalThis.game={user:{isGM:true}}, globalThis.CONFIG={queries:{'foundry-mcp-bridge.x':vi.fn(async d=>({echo:d})),'pentaryn-prompts.list':fnP}}. Pin current eval first: CONFIG.queries['foundry-mcp-bridge.fork.eval'] called with ({script:'return 1'}, {user:{isGM:false}}) rejects /may only be queried by a GM/; with no ctx resolves {ok:true,result:1}. After registerForkHandlers(): x({a:1}) no ctx -> {echo:{a:1}}; with {user:{isGM:true}} same; with {user:{isGM:false}} rejects /Access denied/; CONFIG.queries['pentaryn-prompts.list']===fnP; calling registerForkHandlers() twice does not double-wrap (inner mock call count 1).

**Risk.** Only non-GM senders are refused. Grep of pentaryn modules found no player->bridge-query relay (riders/journal use their own pentaryn-* keys, left unwrapped; test asserts identity).

**Related:** mcp-fork-24

### mcp-fork-8 — The eval timeout timer is never cleared and a timeout looks like a script error

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/foundry-module/src/fork/handlers.ts:150–155`

**Anchor:** `const result = await Promise.race([`

**Current.**

setTimeout(() => reject(new Error(`eval timed out after ${timeoutMs}ms`)), timeoutMs) at handlers.ts:152-154 is never cleared, leaving a pending timer (up to 60 s) per eval in the GM tab. On timeout the script keeps running, yet the result is {phase:'runtime', error:'eval timed out after N ms'}, indistinguishable from a script that threw.

**Proposed.**

Keep the timer handle (let timer; ... timer = setTimeout(...)) and clearTimeout(timer) in a finally. On the timeout path return the same envelope plus timedOut:true and note:'the script may still be running; re-read state before retrying'. Keep phase:'runtime' so README greps still work; eval-js.ts copies timedOut into the eval.jsonl line when present.

**Behaviour test recipe (write first, must pass before and after).**

handlers.test.ts (vitest setup from mcp-fork-2), vi.useFakeTimers(): {script:'return 1'} -> {ok:true,phase:'complete',resultType:'number',result:1} and afterwards vi.getTimerCount()===0 (new; today 1). {script:'await new Promise(()=>{})',timeoutMs:1000}: advance 1000 ms -> {ok:false,phase:'runtime',error:'eval timed out after 1000ms'} (as today) plus timedOut:true. {script:'throw new Error("x")'} -> {ok:false,phase:'runtime',error:'x'} with no timedOut. {script:'return ('} -> phase:'compile'.

**Risk.** Envelope only gains fields; ok/phase/error unchanged and pinned for all four paths.

**Related:** mcp-fork-9

### mcp-fork-10 — Recharge resolves actors differently from the tool that created the feature and its write is unlogged

**Category:** Hardening · **Impact:** medium · **Effort:** M · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/tools/dnd5e/add-feature.ts:481–504`

**Anchor:** `const actor = game.actors.get(ref) ?? game.actors.getName(ref) ?? game.actors.find(a => a.name.toLowerCase().includes(ref.toLowerCase()));`

**Current.**

applyRecharge (add-feature.ts:~474-504) builds an eval script and sends it to foundry-mcp-bridge.fork.eval directly. (1) Its lookup is id, exact name, fuzzy name; upstream findActorByIdentifier (data-access.ts:6962) additionally falls back to a scene token id (synthetic actor), so add-feature with a token id adds the feature then reports 'not applied (actor not found)'. (2) The query bypasses eval-js so the write is in neither log. (3) The row-building logic duplicates pentaryn-prompts/patch.mjs rechargeData (line ~127) and traitItem (~143). About 50 fork lines sit inside an upstream file (rebase hazard).

**Proposed.**

1. handlers.ts: new query foundry-mcp-bridge.fork.applyRecharge, handleApplyRecharge({actorIdentifier,itemId?,featureName,n},ctx) -> requireGM, resolve via window.foundryMCPBridge.dataAccess.findActorByIdentifier (exposed main.ts:58), item = actor.items.get(itemId) ?? actor.items.filter(i=>i.name===featureName).pop(), updateEmbeddedDocuments('Item',[rechargeUpdate(item,n)]), return {label}. 2. Pure rechargeUpdate(item,n) in new packages/foundry-module/src/fork/recharge.ts holding exactly the row the script builds. 3. Move applyRecharge to new packages/mcp-server/src/fork/recharge.ts calling the query with itemId; add-feature.ts keeps a ~3-line call. 4. Log through ActionLog (mcp-fork-5). NOTE: requires a foundry-module rebuild (the current design deliberately avoided one) and fixes the token-id case, the one intended behaviour difference.

**Behaviour test recipe (write first, must pass before and after).**

1. Pin the script's row before refactoring: foundry-module/src/fork/recharge.test.ts with item={id:'I1',system:{activities:[{id:'a1',consumption:{targets:[{type:'itemUses',target:'',value:'1'},{type:'material',target:'x',value:'2',toObject(){return {type:'material',target:'x',value:'2'}}}]}}]}}, n=5: rechargeUpdate(item,5) toEqual {_id:'I1','system.uses':{max:'1',spent:0,recovery:[{period:'recharge',formula:'5',type:'recoverAll'}]},'system.activities.a1.consumption.targets':[{type:'material',target:'x',value:'2'},{type:'itemUses',target:'',value:'1'}]}. 2. Server side mcp-server/src/fork/recharge.test.ts with mocked client: query called with {actorIdentifier:'Ogre',itemId:'I1',featureName:'Breath',n:5}; {ok:false,error:'x'} -> 'not applied (x)'; throw -> 'not applied (<message>)'; success -> label (strings match add-feature.ts:~497-503). 3. Optional parity assert against pentaryn-prompts patch.mjs rechargeData if exported.

**Risk.** Token-id identifiers now succeed (intended). Item-by-id removes a duplicate-name ambiguity upstream already refuses. Requires module rebuild plus broker restart.

**Related:** mcp-fork-11, mcp-fork-1

### mcp-fork-15 — The fork's zod copy of prompts vocabularies can drift from the module's validators

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/tools/prompt-markers.ts:295–304`

**Anchor:** `const With = z.discriminatedUnion('kind', [`

**Current.**

The fork keeps its own copies of module vocabularies: with.kind (295-304) vs KINDS at pentaryn-prompts/replace.mjs:33; NPC sizes (line 68) vs NPC_SIZES npc-core.mjs:13; feature types (69-77) vs FEATURE_TYPES npc-core.mjs:26; Patch keys (~110-146) vs the local `known` array in checkPatch (patch.mjs:~66-67, not exported). Adding a patch key or kind in the module without updating the fork gives BAD_SPEC from the MCP tool while eval-js accepts it, contradicting the parity promised in context/foundry/prompt-markers.md.

**Proposed.**

1. In pentaryn-prompts: move `known` from patch.mjs checkPatch into npc-core.mjs as export const PATCH_KEYS=Object.freeze([...]) and import it in patch.mjs; move KINDS from replace.mjs:33 to build-core.mjs and have replace.mjs import AND re-export it (replace.mjs exports KINDS today). 2. Add foundry/module/pentaryn-prompts/test/fork-contract.mjs, called from test/run.mjs, that reads ${FOUNDRY_MCP_FORK ?? ~/Documents/GitHub/foundry-vtt-mcp}/packages/mcp-server/src/fork/tools/prompt-markers.ts (skips with a printed note if absent) and regex-extracts NPC_SIZES, FEATURE_TYPES, every kind: z.literal('x') and the keys of the Patch z.object, asserting set-equality with the module exports.

**Behaviour test recipe (write first, must pass before and after).**

Pin today's values first using run.mjs's existing check(name,got,want) helper: check('kinds',[...KINDS].sort(),['actor','character','hotspot','light','none','note','npc','tile']); check('patch keys',[...PATCH_KEYS].sort(),['ac','addItems','biography','cr','creatureType','disposition','hp','img','itemUpdates','languages','name','recharge','removeItems','set','size','speed','traits']); same for sizes and feature types; then compare to the fork-extracted lists. Run: cd foundry/module/pentaryn-prompts && node test/run.mjs -> same pass count plus new checks, 0 failed; node --check patch.mjs replace.mjs.

**Risk.** Cross-repo read must skip cleanly when the fork is absent. Constant moves could break imports; the node suite imports npc-core/build-core directly and fails loudly. pentaryn-prompts files are in flux (live-test workflow): rebase on live files.

**Related:** mcp-fork-14

### mcp-fork-6 — The action log's month is fixed when the backend starts

**Category:** Hardening · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/registry.ts:89–90`

**Anchor:** `const month = new Date().toISOString().slice(0, 7); // YYYY-MM`

**Current.**

logPath is computed once in the constructor. The backend is a long-lived shared broker (bridge.py documents one living days), so a backend started 2026-10-31 writes all of November into mcp-2026-10.jsonl, corrupting the per-month review the README schedules.

**Proposed.**

Compute the path at write time: private pathFor(now=new Date()){ return join(this.logDir, `mcp-${now.toISOString().slice(0,7)}.jsonl`); } used in log(). Keep the startup info line. Folds into ActionLog.append('actions') if mcp-fork-5 lands.

**Behaviour test recipe (write first, must pass before and after).**

registry.test.ts with vi.useFakeTimers(): setSystemTime 2026-10-31T23:59:00Z, dispatch -> line in mcp-2026-10.jsonl (pins today's behaviour). setSystemTime 2026-11-01T00:01:00Z, dispatch -> mcp-2026-11.jsonl has 1 line and mcp-2026-10.jsonl still 1 (the intended fix).

**Risk.** Only the target file across a month boundary changes; ts stays authoritative.

**Related:** mcp-fork-5

### mcp-fork-12 — The tool-list change detector ignores schema changes and same-length description edits

**Category:** Hardening · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/index.ts:313–317`

**Anchor:** `const toolsKey = (tools: any[]) =>`

**Current.**

toolsKey fingerprints tools by name and description length only (index.ts:313-317). Adding a property to an inputSchema (e.g. prompt-markers gaining specFile) or rewording a description at the same length sends no tools/list_changed, so sessions keep stale schemas, the exact failure context/foundry/README.md says the poll exists to prevent.

**Proposed.**

In the extracted tool-list-watch.ts (mcp-fork-11): toolsKey = tools => createHash('sha1').update(JSON.stringify((tools??[]).map(t=>[t?.name,t?.description??'',t?.inputSchema??null]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex').

**Behaviour test recipe (write first, must pass before and after).**

tool-list-watch.test.ts: pin first: identical list -> identical key; reordered list -> same key; renamed tool -> different key. New: changing inputSchema.properties changes the key; same-length description edit changes the key. The once-only notification test from mcp-fork-11 still passes.

**Risk.** Only more correct list_changed notifications; clients re-fetch. Key format changes but is process-local.

**Related:** mcp-fork-11

### mcp-fork-13 — The tool filter hides upstream tools but does not block calls to them

**Category:** Hardening · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/backend.ts:1454–1460`

**Anchor:** `].filter(t => {`

**Current.**

FOUNDRY_MCP_TOOL_FILTER drops matching tools from allTools (backend.ts:1454-1460) but the call_tool switch (1522+) still dispatches them by name. For fork tools has() (registry.ts:131) already excludes denied names, so the dedicated 'disabled by FOUNDRY_MCP_TOOL_FILTER' message in dispatch is unreachable from the backend. The filter is unset in .mcp.json today.

**Proposed.**

One hunk at the top of the call_tool branch (backend.ts:~1520): if (forkRegistry.isDenied(name)) throw new Error(`Tool '${name}' is disabled by FOUNDRY_MCP_TOOL_FILTER`); then has() can drop its isDenied clause. Document the filter in the mcp-fork use-doc. Behaviour changes only when the filter is set (intended contract).

**Behaviour test recipe (write first, must pass before and after).**

registry.test.ts: with FOUNDRY_MCP_TOOL_FILTER='dnd5e-*, generate-map' set before construction, isDenied('dnd5e-create-npc') and isDenied('generate-map') true; isDenied('generate-map-x') and isDenied('eval-js') false; getToolDefinitions() omits a registered 'dnd5e-x'; globToRegExp('a.b*') matches 'a.bc' not 'aXbc'. Filter unset: isDenied false for all names and has('t') true. Extract assertAllowed(name) into the registry so the backend hunk is testable.

**Risk.** Unobservable while the filter is unset.

**Related:** mcp-fork-19

## Extendability

### prompts-lookup-11 — Pin (tests only) the drift between the tool's zod schemas and what the module accepts

**Category:** Extendability · **Impact:** high · **Effort:** M · **Addon:** fork: prompt-markers MCP tool (foundry-vtt-mcp)

**Where:** `foundry-vtt-mcp/packages/mcp-server/src/fork/tools/prompt-markers.ts:164–355`

**Anchor:** `const WithCharacter = z`

**Current.**

The zod schemas re-declare by hand what replace.mjs, character.mjs, patch.mjs and gather.mjs read. Verified drift: WithCharacter has no `folder` (character.mjs:884-891 supports it), hp is enum avg|max and size is small|medium (module accepts more), GatherArgs has no `from` (gather.mjs:83), so the page trailer at :764 advises `scenes:[next]`, which gathers only that scene, unlike the module's `from` paging (README). Other entries from the original audit (npc actorId, crops 'on'/'off', Trait.description) were not re-verified and must be confirmed when the KNOWN_DRIFT table is built.

**Proposed.**

Tests and one constant only; widening the zod schemas or changing the trailer text is a behaviour change and is out of scope here. (a) Module: pure `spec-keys.mjs` exporting SPEC_KEYS per kind (character, npc, hotspot, note, light, tile, none, actor, patch, gather); use SPEC_KEYS.patch inside checkPatch (patch.mjs:66 `known` list) as the live source. (b) Fork test compares a checked-in JSON copy of SPEC_KEYS against the exported With* zod `.shape` keys and asserts the difference equals a KNOWN_DRIFT table exactly. (c) Also pin today's page trailer text ('gather again with scenes:["s9"]') in the existing 'says how to page when next is set' test (prompt-markers.test.ts:284). Joe removes drift entries deliberately later.

**Behaviour test recipe (write first, must pass before and after).**

Module, foundry/module/pentaryn-prompts/test/run.mjs: SPEC_KEYS.patch deep-equals the current `known` array in checkPatch (read it from patch.mjs when writing; the original proposal's list was not verified); checkPatch({bogus:1}) still rejects with code BAD_SPEC and a message containing 'known:'. Fork, prompt-markers.test.ts: export the With* consts; compare Object.keys(WithCharacter.shape) etc. to the JSON fixture; KNOWN_DRIFT initial value must be computed by running the comparison, expected to include character:['folder'], gather:['from']. Pin that a character replacement with folder:'X' is rejected by parseArgs today.

**Risk.** Low: tests plus extracting an existing constant. The checkPatch message test catches a changed key list.

**Related:** prompts-lookup-12, prompts-lookup-19

### mcp-fork-11 — The fork's upstream footprint is undocumented and larger than claimed

**Category:** Extendability · **Impact:** medium · **Effort:** M · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/index.ts:3–5`

**Anchor:** ` * backend.ts needs exactly two one-line hunks: spread the definitions into`

**Current.**

fork/index.ts:3 claims backend.ts needs 'exactly two one-line hunks'. backend.ts actually has 5 fork hunks: imports 13-14, registry creation 1418-1419, allTools spread 1422, filter 1454-1460, default case + toMcpPayload 1768-1778. The fork also touches many other upstream files (data-access.ts dnd5e6 shims at ~3896, adapter.ts, compendium.ts, settings.ts, add-feature.ts recharge, index.ts tool-list poll at 306-317 and ~386-404). That list was itself incomplete (corrected after the first pass, see the table below). Nothing lists which hunks are fork-only vs PR-candidates for upstream, against the plan's 'trend toward empty' principle.

**Complete footprint** (`git diff --stat f7e597d 59c781e`: 28 files, +2,718/−37). Files outside `src/fork/`:

| File | Lines | What the fork changed | Kind |
|---|---|---|---|
| `packages/mcp-server/src/backend.ts` | ±32 | 5 hunks: imports 13–14, registry 1418–1419, `allTools` spread 1422, filter 1454–1460, default case + `toMcpPayload` 1768–1778 | local (fork wiring) |
| `packages/mcp-server/src/index.ts` | ±31 | tool-list poll 306–317 and ~386–404 | local; moves to `fork/tool-list-watch.ts` (step 2) |
| `packages/mcp-server/src/foundry-connector.ts` | ±10 | **per-query timeout**, `query(method, data, opts?: {timeoutMs})` at 359–386 (anchor `const timeoutMs = Math.min(Math.max(opts?.timeoutMs ?? 10000, 1000), 120000);`); the flat 10 s capped eval-js's advertised 60 s and the prompt-markers gather; the rejection text gains `(<ms> ms)` | **PR candidate** (upstream bug) |
| `packages/mcp-server/src/foundry-client.ts` | ±4 | `query(method, data, opts?)` pass-through to the connector, 57–67 | PR candidate (with the connector hunk) |
| `packages/mcp-server/src/foundry-connector.timeout.test.ts` | +45 (new) | vitest: default 10 s; `timeoutMs` honoured and clamped to 1–120 s | PR candidate (ships with the hunk) |
| `packages/mcp-server/src/tools/dnd5e/add-feature.ts` | ±61 | recharge application through `fork.eval` (mcp-fork-10) | local; moves to `fork/recharge.ts` |
| `packages/mcp-server/src/tools/compendium.ts` (+ new `compendium.dnd5e6.test.ts`, +108) | ±30 | dnd5e 6 shapes | PR candidate |
| `packages/mcp-server/src/systems/dnd5e/adapter.ts` (+ new `adapter.test.ts`, +71) | +21 | dnd5e 6 `movement.speeds`, item `rarities` | PR candidate |
| `packages/foundry-module/src/data-access.ts` | ±57 | dnd5e 6 shims (~3896) | PR candidate |
| `packages/foundry-module/src/main.ts` | +5 | `registerForkHandlers()` after `registerHandlers()`; `unregisterForkHandlers()` in cleanup | local (fork wiring) |
| `packages/foundry-module/src/settings.ts` | ±6 | `mapGenAutoStart` default `false`, and `?? false` instead of `|| true` in `getData` | PR candidate (upstream bug: `|| true` made the settings submenu always show auto-start as on) |
| `README.md` | +1 | dnd5e 6 support line | PR candidate |
| `CHANGELOG.md` | +34 | fork release notes | local |
| `package.json`, `packages/*/package.json`, `shared/package.json`, `packages/foundry-module/module.json`, `package-lock.json` | version strings | `0.8.3` → `0.8.3-pentaryn.1` | local |

Fork-only files (`src/fork/**`): `packages/foundry-module/src/fork/handlers.ts`; `packages/mcp-server/src/fork/{content,index,registry}.ts`, `fork/tools/eval-js.ts`, `fork/tools/prompt-markers.ts` (+ test).

**Proposed.**

1. FORK.md at the fork root: the table above (every upstream file/hunk with purpose, local|PR-candidate, covering test — the connector timeout hunk is covered by `foundry-connector.timeout.test.ts`, the dnd5e 6 hunks by `adapter.test.ts` and `compendium.dnd5e6.test.ts`); fix the index.ts:3 comment to point at it. 2. Move the wrapper tool-list poll to new packages/mcp-server/src/fork/tool-list-watch.ts exporting toolsKey(tools) and watchToolList(mcp,send,intervalMs=30_000) (returning markServed(tools)); index.ts keeps one call. 3. Recharge per mcp-fork-10. 4. scripts/fork-footprint.sh running git diff --stat upstream/main...HEAD -- . ':!**/fork/**' ':!CHANGELOG.md' ':!package-lock.json'. 5. Optional dnd5e6-upstream branch holding only PR-candidate hunks.

**Behaviour test recipe (write first, must pass before and after).**

New packages/mcp-server/src/fork/tool-list-watch.test.ts. Pin the current toolsKey verbatim first: toolsKey([{name:'b',description:'xx'},{name:'a',description:'y'}])==='a:1|b:2'; toolsKey([])===''; toolsKey(undefined)===''. Then fake timers: watchToolList with send returning tools A, A, A+B calls sendToolListChanged exactly once, after the third tick; does nothing while servedTools is null; a rejecting send is swallowed. Existing suite stays green: npm -w @foundry-mcp/server test -- --run (it includes `foundry-connector.timeout.test.ts`, which pins the per-query timeout: default 10 s, clamp 1–120 s, message `Query timeout: <method> (<ms> ms)`). Footprint gate: `scripts/fork-footprint.sh` output must list exactly the 19 paths of the table above that it does not exclude (21 non-`fork/` paths minus `CHANGELOG.md` and `package-lock.json`); a new upstream file touched without a FORK.md row fails it.

**Risk.** Poll move is runtime-neutral if interval, unref and the null-guard are preserved (fake-timer test pins them). FORK.md and the script are docs/tooling only.

**Related:** mcp-fork-10, mcp-fork-12, mcp-fork-19

### prompts-lookup-12 — One per-action table in the tool and one query list in the module

**Category:** Extendability · **Impact:** medium · **Effort:** S · **Addon:** fork: prompt-markers MCP tool (foundry-vtt-mcp)

**Where:** `foundry-vtt-mcp/packages/mcp-server/src/fork/tools/prompt-markers.ts:37–52`

**Anchor:** `export const QUERIES = {`

**Current.**

Adding an action to the fork tool touches QUERIES (:37), TIMEOUTS (:46), ACTIONS, SCHEMAS, DEFINITION.inputSchema/description and the handler switch. On the module side registerQueries (prompts.mjs:271-278) hand-lists five handlers whose names must match QUERIES; only a live call ties them together.

**Proposed.**

Fork: `const ACTION_TABLE = {list:{query:'pentaryn-prompts.list',timeoutMs:15_000,schema:ListArgs,run:list},...}` and derive QUERIES, TIMEOUTS, ACTIONS, SCHEMAS from it, keeping the exported names. Module: export QUERY_HANDLERS from a small queries.mjs ({list,gather,crops,replace,show} closures identical to today's) and have registerQueries loop over it through guarded().

**Behaviour test recipe (write first, must pass before and after).**

Fork prompt-markers.test.ts: expect(QUERIES).toEqual({list:'pentaryn-prompts.list',gather:'pentaryn-prompts.gather',crops:'pentaryn-prompts.crops',replace:'pentaryn-prompts.replace',show:'pentaryn-prompts.show'}); expect(TIMEOUTS).toEqual({list:15000,gather:60000,crops:60000,replace:60000,show:15000}); keep the existing 'the JSON schema lists every action' test (:166). Module test/run.mjs: Object.keys(QUERY_HANDLERS) deep-equals ['list','gather','crops','replace','show']. Cross-check via a checked-in JSON of module query names against Object.values(QUERIES).

**Risk.** A typo in a derived name breaks a call; the toEqual pins catch it.

**Related:** prompts-lookup-11, prompts-lookup-3

### mcp-fork-22 — Type the fork tool contract: result fields and the write flag

**Category:** Extendability · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/registry.ts:25–35`

**Anchor:** `export type ForkToolHandler = (args: any) => Promise<any>;`

**Current.**

ForkToolHandler returns Promise<any>. The fields the registry reads (result.summary and result.ids in log()) and the __mcpContent passthrough (content.ts) are conventions learned only by reading three files. The write: boolean | ((args:any)=>boolean) type is spelled out twice (entry at line ~34 and register opts).

**Proposed.**

In registry.ts: export type WriteFlag = boolean | ((args:any)=>boolean); export type ForkToolResult = string | ({summary?:string; ids?:string[]; __mcpContent?:McpContentBlock[]} & Record<string,unknown>); export type ForkToolHandler = (args:any, meta?:{client?:unknown}) => Promise<ForkToolResult>; JSDoc on register() explaining each field. Import McpContentBlock from content.ts.

**Behaviour test recipe (write first, must pass before and after).**

Type-level: npm -w @foundry-mcp/server run typecheck passes with no changes to eval-js.ts or prompt-markers.ts (their returns already fit). Existing vitest suite unchanged. Optionally a // @ts-expect-error line in registry.test.ts registering a handler returning {ids:'x'}.

**Risk.** Types only; typecheck may expose a handler return that does not fit, which is a real contract bug, not a reason to widen the type.

**Related:** mcp-fork-19, mcp-fork-7

## LLM interface

### mcp-fork-20 — No index of game.pentaryn namespaces where an LLM looks first

**Category:** LLM interface · **Impact:** medium · **Effort:** S · **Addon:** mcp-fork

**Where:** `context/foundry/README.md:44–45`

**Anchor:** `` **Tools:** `mcp__foundry__*` for world ops (`eval-js` is the escape hatch). ``

**Current.**

context/foundry/README.md, the routing target for anything in Foundry, never names a game.pentaryn.<ns> namespace. The eval log shows the cost: ~68 eval calls only ran Object.keys(game.pentaryn...) for discovery, plus failures from guessed names (S.factStatus vs study.whoKnows; rules.search assumed to return an array; pentaryn-movement.policy vs ghostPolicy). Namespaces that do not match module ids (rules is pentaryn-lookup, chain is senses) cannot be inferred.

**Proposed.**

Add a 'Module APIs (game.pentaryn)' table to context/foundry/README.md after line 45: namespace, module id, use-doc, and the 2-3 most-used read calls (ties.attributes.of(actor), combat.plan(...), prompts.replaceMany(...), rules.search(q) returning {results}|{error} not an array, transform.forms, senses.light). State that ties functions take Actor documents. Optional later: generate the table from a live describe.

**Behaviour test recipe (write first, must pass before and after).**

Docs, gated by a pytest in scripts/tests/test_foundry_ops.py: grep foundry/module/*/*.mjs with regex game\.pentaryn = \{ \.\.\.(?:current|existing), (\w+): (both variable names occur, e.g. aoe.mjs:50 and cursors.mjs:151) to get the published namespace set, parse the README table's namespace column, and assert every published namespace has a row. Catches new modules added without a row.

**Risk.** None at runtime; drift caught by the pytest gate. Some modules may publish namespaces by other code shapes; the test should list and allowlist them explicitly.

**Related:** mcp-fork-19, mcp-fork-21

### mcp-fork-21 — The eval-js description hides the serializer rules and where pentaryn APIs live

**Category:** LLM interface · **Impact:** medium · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/tools/eval-js.ts:35–62`

**Anchor:** `'Escape hatch: evaluate JavaScript inside the Foundry client as the GM, and return the ' +`

**Current.**

The description says only that documents are serialized to id + name + source and large collections truncated. It omits: depth>4 -> '[max depth]', arrays <=200, Map/Set/Collection <=100, '_' keys except _id dropped, repeated reference -> '[circular]', only a top-level document carries full source, strings unbounded. Returning actor costs full source, returning [actor] gives identity only. It also does not say pentaryn module APIs live under game.pentaryn.<ns>.

**Proposed.**

Append one sentence to the description: 'Result rules: depth <=4 (deeper -> "[max depth]"), arrays <=200, Map/Set/Collection <=100, `_`-keys except `_id` dropped, a repeated object -> "[circular]", a top-level Document includes its full source (nested ones only id+name); return plain objects with the fields you need. Pentaryn worlds: module APIs are under game.pentaryn.<ns> (index: context/foundry/README.md).' Export the definition as EVAL_JS_DEFINITION (prompt-markers exports its DEFINITION near the file end).

**Behaviour test recipe (write first, must pass before and after).**

eval-js.test.ts: expect(EVAL_JS_DEFINITION.description).toMatch(/depth <=4/) and /<=200/. foundry-module serialize.test.ts: expect(SERIALIZE_LIMITS).toEqual({depth:4,array:200,collection:100}). Together they fail if either side changes alone. Handler behaviour unchanged; mcp-fork-5 eval tests still pass.

**Risk.** Description grows ~60 tokens per session; the wrapper sees a new length and emits one list_changed.

**Related:** mcp-fork-9, mcp-fork-20

## Documentation / skills

### mcp-fork-19 — No use-doc for the fork, and the docs that exist say it is unimplemented

**Category:** Documentation / skills · **Impact:** high · **Effort:** S · **Addon:** mcp-fork

**Where:** `context/foundry/ops.md:24`

**Anchor:** `` | Extend the MCP bridge's tool surface | `foundry-mcp-fork.md` (in context/plans) — design only | ``

**Current.**

ops.md:24 routes 'Extend the MCP bridge's tool surface' to the plan and calls it 'design only'; ops.md:777 says '(not implemented)'; the plan (context/plans/foundry-mcp-fork.md) still reads DESIGN ONLY; CLAUDE.md has no route for working on the bridge/fork. What a builder needs is scattered across context/foundry/README.md (~lines 76-148, 'action log' section) and source comments: where a tool file goes, the write predicate, the summary/ids result contract, __mcpContent, the vitest setup() pattern, build (npm run build:server) then kill -9 the broker and reload the GM tab, env vars, log schemas, upstream-hunk rules. Fork CHANGELOG.md:16 says npc replacements are 'composed server-side' but prompt-markers.ts says the module builds them since 0.3.0.

**Proposed.**

1. Write context/foundry/mcp-fork.md (opens with a 'Read this when' line): layout; adding a tool (6-step checklist: registry.ts register(), fork/index.ts, write predicate, {summary,ids}, __mcpContent); adding a browser-side handler (handlers.ts requireGM, or a module's own CONFIG.queries['pentaryn-<m>.<fn>'] wrapped like prompts' guarded()); tests command; build/restart/verify; env vars PENTARYN_MCP_LOG_DIR and FOUNDRY_MCP_TOOL_FILTER; both log schemas; upstream hunk policy linking FORK.md. 2. Fix ops.md:24 and :777. 3. Add a status line to the plan pointing at the use-doc. 4. Add a CLAUDE.md route row. 5. Correct fork CHANGELOG.md:16.

**Behaviour test recipe (write first, must pass before and after).**

Docs only; gate with scripts/tests/test_foundry_ops.py: read context/foundry/ops.md and assert no line contains 'foundry-mcp-fork.md' together with 'design only' or 'not implemented'; assert context/foundry/mcp-fork.md exists and its first 5 lines contain 'Read this when'. Run: .venv/bin/python -m pytest -q -p no:cacheprovider scripts/tests/test_foundry_ops.py.

**Risk.** None at runtime; doc staleness mitigated by the pytest gate and the footprint script.

**Related:** mcp-fork-11, mcp-fork-20, mcp-fork-22, mcp-fork-23

### mcp-fork-23 — Source comments describe things that are not there

**Category:** Documentation / skills · **Impact:** low · **Effort:** S · **Addon:** mcp-fork

**Where:** `packages/mcp-server/src/fork/registry.ts:31–34`

**Anchor:** `   * Writes are logged and are subject to the table-mode guard; reads are not. A predicate`

**Current.**

registry.ts:31 says writes are 'subject to the table-mode guard' but no such guard exists in the fork (grep table-mode/tableMode/TABLE_MODE finds only this comment). fork/index.ts:3-4 says backend.ts needs 'exactly two one-line hunks' (it has five, see mcp-fork-11). eval-js.ts:4 cites 'The design doc rejected this on principle' without naming context/plans/foundry-mcp-fork.md.

**Proposed.**

registry.ts:31 -> 'Writes are logged to the action log; reads are not.' index.ts:3-4 -> 'keeps upstream edits to small marked hunks (grep "fork:"); the full list is FORK.md.' eval-js.ts:4 -> name the plan path. Comments only.

**Behaviour test recipe (write first, must pass before and after).**

No runtime change: npm -w @foundry-mcp/server run typecheck and the vitest suite pass unchanged. Optional guard in scripts/fork-footprint.sh (mcp-fork-11): grep -c 'fork:' packages/mcp-server/src/backend.ts equals the hunk count recorded in FORK.md.

**Risk.** None.

**Related:** mcp-fork-11, mcp-fork-19
