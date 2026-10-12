---
title: "Final review 2026-10-12 — fork"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---
**Read this when:** you want to know what the final code review of fork found, changed, and left for Joe. History, not instructions.

## Verdict

**NEEDS-JOE**: ten behaviour-preserving commits were kept, but four real defects are recorded and need decisions that change behaviour. One is a landed write reported as a failure (rob-1). One is upstream `{success:false}` refusals audited as ok (fork-edge-2). One is a toggle-by-name that can never apply (fork-edge-4). One is a timed-out recharge reported as "not applied" (fork-ac-3).

## Scope

- Paths: `packages/mcp-server/src/fork/**`, `packages/foundry-module/src/fork/**` and their tests, in the foundry-vtt-mcp repo.
- Base: `ea36cef` (origin/pentaryn). Branch: `review/fork`, pushed to origin. Head: `1a9d855`.
- Triage: 42 findings. 10 DO (2 DO-EDGE, 8 DO-REFACTOR), 27 RECORD, 5 DROP as duplicates (ext-1, ext-2, ext-4, ext-10, fork-edge-3, each merged into another finding).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| fork-edge-1 | mcp-server/src/fork/tools/pentaryn-write.ts | medium | DO-EDGE | A truthy `opts.dryRun` was logged and summarised as a real run |
| fork-ac-1 | mcp-server/src/fork/tools/prompt-markers.ts | medium | DO-EDGE | specFile was re-read for the log after the query, so it could log content that never ran |
| M5 | foundry-module/src/fork/handlers.ts:4 | low | DO-REFACTOR | Header wrongly said the fork never edits data-access.ts |
| M6 | mcp-server/src/fork/tools/prompt-markers.schema.ts | low | DO-REFACTOR | Comments on specFile and BAD_SPEC did not match behaviour |
| fork-ac-2 | mcp-server/src/fork/recharge.ts | low | DO-REFACTOR | applyRecharge relied on an implicit 10 s query timeout (§5.9.4) |
| ext-3 | mcp-server/src/fork/action-log.ts | low | DO-REFACTOR | Stream-to-file ternary replaced by a Record |
| M9 | foundry-module/src/fork/handlers.ts | low | DO-REFACTOR | register/unregister now driven from one FORK_QUERIES table |
| perf-1 | mcp-server/src/fork/registry.ts | low | DO-REFACTOR | logArgs was built even when the action log was disabled |
| M1 | mcp-server/src/fork/upstream-writes.ts | low | DO-REFACTOR | registry/upstream-writes import cycle; globToRegExp moved to glob.ts |
| ext-7 | mcp-server/src/fork/tools/prompt-markers.ts | low | DO-REFACTOR | A switch with no default replaced by a typed Record<Action> table |
| rob-1 | mcp-server/src/fork/tools/pentaryn-call.ts:99 | medium | RECORD (defect) | An invalid Date in a write result turns a landed write into a thrown INTERNAL |
| fork-edge-2 | mcp-server/src/fork/registry.ts:280 | medium | RECORD (defect) | Upstream `{success:false}` refusals are audited as ok:true |
| fork-edge-4 | foundry-module/src/fork/toggle-condition.ts:33 | low | RECORD (defect) | Toggle by name can choose active:false where upstream removes nothing |
| fork-ac-3 | mcp-server/src/fork/recharge.ts:50 | low | RECORD (defect) | A timed-out recharge says "not applied" when the outcome is unknown |
| ext-6 | mcp-server/src/fork/upstream-writes.ts:13 | medium | RECORD | Write globs are checked against hand-typed lists, not the served upstream tools |
| rob-2 | foundry-module/src/fork/serialize.ts:45 | low | RECORD | An invalid Date outside an object key throws, so the eval fails |
| rob-3 | foundry-module/src/fork/handlers.ts:109 | low | RECORD | A non-numeric timeoutMs becomes NaN and the eval times out at once |
| rob-4 | foundry-module/src/fork/toggle-condition.ts:26 | low | RECORD | A non-boolean `active` is overwritten instead of refused |
| rob-5 | mcp-server/src/fork/tools/pentaryn-call.ts:176 | low | RECORD | A null describe() row gives INTERNAL instead of NOT_FOUND |
| rob-6 | mcp-server/src/fork/tool-list-watch.ts:47 | low | RECORD | A failed list_changed send is swallowed, so the session is never told |
| rob-7 | mcp-server/src/fork/tools/prompt-markers.ts:219 | low | RECORD | Coded errors have no `code` property |
| fork-edge-5 | foundry-module/src/fork/recharge.ts:20 | low | RECORD | Recharge drops itemUses targets that point at other items |
| fork-edge-6 | mcp-server/src/fork/tools/pentaryn-call.ts:156 | low | RECORD | Root calls ignore a ref or opts the header promises to refuse |
| fork-edge-7 | mcp-server/src/fork/tool-list-watch.ts:39 | low | RECORD | Overlapping polls can send duplicate notifications |
| fork-edge-8 | foundry-module/src/fork/serialize.ts:86 | low | RECORD | Typed arrays bypass the serializer caps |
| ext-11 | mcp-server/src/fork/tools/pentaryn-call.ts:156 | low | RECORD | Root dispatch is a ternary and does not read ROOT |
| perf-2 | mcp-server/src/fork/action-log.ts:68 | low | RECORD | The action log uses sync fs appends on the shared backend |
| M11 | mcp-server/src/fork/tools/eval-js.ts:73 | low | RECORD | eval-js defaults to its own ActionLog, unlike the other fork tools |
| M2 | mcp-server/src/fork/tools/eval-js.ts:115 | low | RECORD (cap) | The eval query name and timeout constants are duplicated |
| ext-5 | mcp-server/src/fork/tools/eval-js.test.ts:246 | low | RECORD (cap) | The server-module contract is pinned only by duplicated literals |
| M8 | mcp-server/src/fork/tools/pentaryn-write.ts:79 | low | RECORD (cap) | The identity logArgs is redundant |
| M7 | mcp-server/src/fork/index.ts:16 | low | RECORD (cap) | Unused re-exports |
| M3 | mcp-server/src/fork/tools/pentaryn-read.ts:31 | low | RECORD (cap) | Three copies of the zod issue formatter |
| M4 | mcp-server/src/fork/tools/pentaryn-write.ts:13 | low | RECORD (cap) | Shared call symbols live in pentaryn-read.ts |
| M10 | mcp-server/src/fork/tools/prompt-markers.ts:216 | low | RECORD (cap) | Connector error unwrapping is duplicated |
| ext-9 | mcp-server/src/fork/tools/pentaryn-read.ts:38 | low | RECORD (cap) | No parity test between the JSON schema and the zod schema |
| ext-8 | mcp-server/src/fork/tools/prompt-markers.schema.ts:16 | low | RECORD (cap) | Copies of upstream enums with no drift check |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| b094c6b | M5: handlers.ts header comment corrected (comment only) | none needed (no code tokens changed) |
| c0c11c6 | M6: prompt-markers.schema.ts comments match specFile/BAD_SPEC | prompt-markers.test.ts "a non-string specFile fails as specFile: Expected string" |
| 8f14119 | fork-edge-1: a truthy opts.dryRun counts as a dry run in the summary and ids | pentaryn-write.test.ts "opts.dryRun counts as a dry run: summary says (dry run) and no ids are logged" (failed first) |
| 58b3422 | fork-ac-2: explicit `APPLY_RECHARGE_TIMEOUT_MS = 10_000` (effective timeout unchanged) | recharge.test.ts "applyRecharge through the typed fork query (mcp-fork-10) > sends the request to the applyRecharge query and returns the label" |
| 43fa2c9 | ext-3: STREAM_FILE Record for log file names | action-log.test.ts "ActionLog > pathFor maps each stream to its file" |
| 5f0ff6a | M9: FORK_QUERIES table drives register/unregister | handlers.smoke.test.ts "register adds exactly the fork queries and unregister removes them" |
| e76fed8 | perf-1: logArgs is skipped when the action log is disabled | registry.test.ts "value failures and logArgs (mcp-fork-4) > a disabled action log never builds logArgs" (failed first) |
| cba065a | M1: globToRegExp moved to glob.ts, removing the import cycle; matchers are built eagerly | registry.test.ts globToRegExp / UPSTREAM_WRITE_GLOBS / auditUpstream cases (unchanged) |
| 44a3af8 | ext-7: prompt-markers dispatches through a Record<Action> table | prompt-markers.test.ts, the existing 39 tests (unchanged) |
| 1a9d855 | fork-ac-1: the log records the specFile content read at call start | prompt-markers.test.ts "registry logging > a specFile replace logs what the file held when it ran, even if it changes mid-call" (failed first) |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** rob-1 `packages/mcp-server/src/fork/tools/pentaryn-call.ts:99`: in the template's plain(), map an invalid Date to `'[unserializable]'`, or catch an out() failure after a successful write. Today a landed write is reported as INTERNAL "Invalid time value" and logged ok:false.
- **defect** fork-edge-2 `packages/mcp-server/src/fork/registry.ts:280`: in log(), treat `result.success === false` as a failure and copy `result.error`. switch-scene, ownership and wfrp4e-* refusals are audited as ok:true today.
- **defect** fork-edge-4 `packages/foundry-module/src/fork/toggle-condition.ts:33`: make the default-active check match only what upstream's removal matches (drop `condition?.id` from `ids`). Today a condition given by name, whose resolved status is already on the token under another name, can never be applied.
- **defect** fork-ac-3 `packages/mcp-server/src/fork/recharge.ts:50`: on `Query timeout:`, say the outcome is unknown and to re-read before retrying, instead of "not applied".
- ext-6 `packages/mcp-server/src/fork/upstream-writes.ts:13`: add a rebase guard test. Build every upstream tool definition and require each name to be classified as a write or a read.
- rob-2 `packages/foundry-module/src/fork/serialize.ts:45`: serialize an invalid Date as `'[unserializable]'` at top level and inside containers too.
- rob-3 `packages/foundry-module/src/fork/handlers.ts:109`: fall back to 10 000 ms when timeoutMs is not finite.
- rob-4 `packages/foundry-module/src/fork/toggle-condition.ts:26`: fill `active` in only when it is absent, so a non-boolean value reaches upstream's refusal.
- rob-5 `packages/mcp-server/src/fork/tools/pentaryn-call.ts:176`: filter out non-object describe() rows before mapping `m.path`.
- rob-6 `packages/mcp-server/src/fork/tool-list-watch.ts:47`: set `served` only after sendToolListChanged resolves, and log failures.
- rob-7 `packages/mcp-server/src/fork/tools/prompt-markers.ts:219`: build coded errors with codedError() so `code` is set, keeping the message bytes.
- fork-edge-5 `packages/foundry-module/src/fork/recharge.ts:20`: keep itemUses targets that point at another item. This is a 5e-rule call.
- fork-edge-6 `packages/mcp-server/src/fork/tools/pentaryn-call.ts:156`: refuse a ref or non-empty opts on root describe with BAD_ARGS, as the header promises.
- fork-edge-7 `packages/mcp-server/src/fork/tool-list-watch.ts:39`: add a busy flag and a generation counter so overlapping polls cannot send duplicates (note only).
- fork-edge-8 `packages/foundry-module/src/fork/serialize.ts:86`: cap typed arrays (ArrayBuffer.isView) like arrays, and/or add a node cap.
- ext-11 `packages/mcp-server/src/fork/tools/pentaryn-call.ts:156`: route root calls through ROOT's params once a third root member exists (note only).
- perf-2 `packages/mcp-server/src/fork/action-log.ts:68`: switch to an async or buffered appender only if sync appends ever cost anything noticeable (note only).
- M11 `packages/mcp-server/src/fork/tools/eval-js.ts:73`: default to `registry.actionLog`. This needs eval-js.test.ts's fakeRegistry to carry an actionLog.
- M2 `packages/mcp-server/src/fork/tools/eval-js.ts:115`: export EVAL_QUERY, EVAL_TRANSPORT_MARGIN_MS and EVAL_DEFAULT_TIMEOUT_MS from pentaryn-call.ts and use them (deferred: cap).
- ext-5 `packages/mcp-server/src/fork/tools/eval-js.test.ts:246`: build the limit regexes from SERIALIZE_LIMITS and test the query names against registerForkHandlers (deferred: cap).
- M8 `packages/mcp-server/src/fork/tools/pentaryn-write.ts:79`: drop the identity logArgs (deferred: cap).
- M7 `packages/mcp-server/src/fork/index.ts:16`: drop the unused ForkRegistry and ReplacementT re-exports (deferred: cap).
- M3 `packages/mcp-server/src/fork/tools/pentaryn-read.ts:31`: one zodIssueText() helper in place of the three formatters (deferred: cap).
- M4 `packages/mcp-server/src/fork/tools/pentaryn-write.ts:13`: move the shared call symbols to pentaryn-call.ts (deferred: cap).
- M10 `packages/mcp-server/src/fork/tools/prompt-markers.ts:216`: one unwrapQueryError() helper shared by friendlyError and runPentarynCall (deferred: cap).
- ext-9 `packages/mcp-server/src/fork/tools/pentaryn-read.ts:38`: a key-parity test between the zod schema and inputSchema.properties (deferred: cap).
- ext-8 `packages/mcp-server/src/fork/tools/prompt-markers.schema.ts:16`: test SIZES and FEATURE_TYPES against the upstream enums (deferred: cap).
- perf-1 side note (`packages/mcp-server/src/fork/registry.ts`): with the log disabled, a thrown non-stringifiable non-Error now rethrows the original error instead of a TypeError. No handler throws such a value, and production keeps the log enabled.

## Verification

- b094c6b: keep
- c0c11c6: keep
- 8f14119: keep
- 58b3422: keep
- 43fa2c9: keep
- 5f0ff6a: keep
- e76fed8: keep
- cba065a: keep
- 44a3af8: keep
- 1a9d855: keep

## Gates

- `npm run typecheck`: pass.
- `npm test -w packages/mcp-server -- --run`: 288/288 pass.
- `npm test -w packages/foundry-module -- --run`: 50/50 pass.
- `scripts/fork-footprint.sh`: pass ("every upstream file the fork touches has a FORK.md row; marker counts match").
- Diff against origin/pentaryn is only inside src/fork/** of the two packages. Untouchables are clean.
- Goldens byte-identical: yes (`git diff --quiet origin/pentaryn -- '**/golden/**'` exits 0).
