---
title: "Final review 2026-10-12 — py-mcp"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of py-mcp found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — py-mcp

## Verdict

**NEEDS-JOE.** The eight kept changes are behaviour-preserving and the gate is green, but real defects are recorded. One non-object JSON frame crashes the server. One non-JSON line in JSONL mode makes the server ignore every later request. Under `DND_MCP_TOOLS_GROUP=all`, 12 of the 65 tools do not load.

## Scope

- Paths: `scripts/mcp/server.py`, `scripts/tests/test_dnd_scripts_contracts.py`, `scripts/tests/test_server_discovery.py`, `scripts/tests/test_actions_contract.py`, and this record.
- Base: `a1d696b1` (origin/main when the review started).
- Branch: `review/py-mcp`, worktree `pentaryn-review-py-mcp-wt`.
- Triage: 41 findings, giving 10 DO, 19 RECORD and 12 DROP (11 duplicates, plus MNT-8, which was not worth a commit). The in-scope baseline was 64 passing tests.

## Findings by lens

Line numbers are at the review HEAD of `scripts/mcp/server.py` unless another file is named.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| ext-1 | test_dnd_scripts_contracts.py:54 | low | DO-EDGE, kept | Pins the five MCP annotation keys per tool; the four `feedback_*` tools' missing `title` is listed as KNOWN |
| ext-2 | server.py:417 | low | DO-EDGE, kept | Annotated `MCP_TOOL: T = {...}` / `MCP_GROUPS: T = [...]` were invisible to AST discovery |
| EC-2 | server.py:205 | low | DO-EDGE, kept | A lone surrogate in the arguments dropped the action-log line |
| py-mcp-ac-6 | test_server_discovery.py | low | DO-REFACTOR (tests), kept | Pins the serve loop's inline replies, busy reply and slot release |
| py-mcp-rob-4 | server.py:844 | low | DO-EDGE, reverted | Release the slot if `executor.submit` raises (the verifier found it double-releases under the real executor) |
| MNT-6 | server.py:522 | low | DO-REFACTOR, kept | One `_flag_map` helper parses both bool_flags and value_flags |
| MNT-2 | server.py:287 | low | DO-REFACTOR, kept | Replaces the stale brace TODO with an accurate comment, plus a verbatim-substitution pin |
| MNT-7 | server.py:30, 585 | low | DO-REFACTOR, reverted | Comment corrections; the SQLite clause it deleted was true |
| ext-7 | test_dnd_scripts_contracts.py | low | DO-REFACTOR (tests), kept | `_mapped` finds placeholders anywhere in a template token |
| MNT-1 | server.py:287 | low | DO-REFACTOR, kept | Splits `ToolRunner.run` into `_build_argv` and `_run_subprocess` |
| MNT-3 | server.py:582 | medium | RECORD | `discover_tools` is about 125 lines doing five jobs; `p.name != "__init__.py"` at :601 is dead |
| ext-5 | server.py:797 | low | RECORD | JSON-RPC envelopes are hand-built at six sites |
| py-mcp-rob-2 | server.py:784 | medium | RECORD (defect) | A valid but non-object JSON frame crashes the server at `msg.get` |
| py-mcp-rob-1 | server.py:94 | medium | RECORD (defect) | In JSONL mode, one non-JSON line makes the LSP header parser swallow every later request |
| EC-4 | server.py:134 | low | RECORD | LSP `Content-Length` of 0 or less is treated as EOF |
| py-mcp-rob-3 | server.py:632 | low | RECORD | With a group filter, every excluded file is listed as a startup discovery failure |
| py-mcp-rob-6 | server.py:280 | low | RECORD | Any TypeError inside a handler is relabelled "Invalid arguments" |
| py-mcp-rob-7 | server.py:287 | low | RECORD | value_flags pass non-scalars as a Python repr, but placeholders pass them as JSON (latent) |
| py-mcp-rob-8 | server.py:647 | low | RECORD | SystemExit at handler-module import aborts discovery and leaves a half-initialised `sys.modules` entry |
| ext-3 | server.py:463 | low | RECORD | The AST path accepts an undocumented `MCP_TOOL_<name>` shape and turns a helper such as `MCP_TOOL_NAMES` into a failure |
| ext-6 | server.py:630 | low | RECORD (defect) | `DND_MCP_TOOLS_GROUP=all` loads 53 of 65 tools |
| EC-3 | server.py:232 | low | RECORD | A lone surrogate in a handler error message means no reply is sent |
| EC-5 | server.py:665 | low | RECORD | A non-dict `MCP_HANDLERS` registers half-wired tools with handler=None |
| EC-7 | server.py:790 | low | RECORD | `initialize` echoes any requested protocolVersion |
| py-mcp-ac-3 | server.py:280 | low | RECORD | In-process handlers have no wall-clock cap |
| py-mcp-ac-4 | server.py:830 | low | RECORD | Busy, unknown-tool and bad-argument calls write no action-log line, which contradicts the README |
| py-mcp-ac-5 | server.py:847 | low | RECORD | `notifications/cancelled` is ignored |
| perf-1 | server.py:768 | low | RECORD | EOF shutdown also runs every queued call (worst case about 240s) |
| MNT-9 | scripts/mcp/README.md:38 | low | RECORD | The README Raise-channel row leaves out feedback_reports |

## Changes kept

| commit | what | pinned by |
|---|---|---|
| 291003d5 | Annotation-key contract test with a KNOWN `feedback_*` title gap | `test_every_tool_declares_the_five_annotation_keys` |
| 123d149d | `_top_level_assignments` reads annotated `MCP_TOOL`/`MCP_TOOLS`/`MCP_GROUPS` | `test_annotated_mcp_tool_is_discovered`, `test_annotated_mcp_groups_passes_the_group_filter` |
| f3251430 | Action log opened with `errors="backslashreplace"` | `test_log_line_survives_a_lone_surrogate` |
| 6d206244 | Serve-loop characterisation pins (tests only) | `test_serve_loop_inline_payloads_pinned`, `test_serve_loop_busy_reply_when_slots_exhausted`, `test_serve_loop_releases_slots` |
| be761a64 | `_flag_map` helper | `test_flag_map_errors_pinned`, `test_flag_map_camel_case_and_blank_entries` |
| 8b7a80e2 | Accurate brace comment in place of the stale TODO | `test_placeholder_values_with_braces_render_verbatim` |
| e40c5c1c | `_mapped` uses `string.Formatter().parse` (tests only) | `test_mapped_sees_embedded_placeholders` |
| fdbb6fec | `ToolRunner.run` split into `_build_argv` and `_run_subprocess` | `test_build_argv_direct` |

## Changes reverted by verification

| commit | revert | verifier's reason |
|---|---|---|
| 766b2ead | 4120215d | CPython's `submit()` queues the work item before `t.start()` can raise. A queued worker then releases the slot again, and the plain Semaphore ratchets above `_INFLIGHT_LIMIT`. This was reproduced with a real ThreadPoolExecutor: old code ends at 2 (correct), the commit ends at 3. |
| e9518383 | 88f030c3 | The SQLite clause it deleted is true. `scripts/srd5_2.py:111` uses `CachedSession(backend="sqlite")`, and that in-process cache is shared by the pool threads. The other three comment edits were accurate but went with the revert. |

## Recorded for Joe

- **defect** — `scripts/mcp/server.py:784`: a JSON frame that is not an object (a JSONL batch `[...]`, or an LSP scalar body) raises AttributeError outside the try and kills the server, and an LSP `null` body is read as EOF. Fix in `_read_message` (around :98 and :139): log "discarding non-object JSON-RPC message" and return `_SKIP_MESSAGE` (py-mcp-rob-2, EC-1, py-mcp-ac-1).
- **defect** — `scripts/mcp/server.py:94`: in JSONL mode, a line that does not start with `{` or `[` falls into the LSP header parser, which then swallows every later request until EOF. When `_TRANSPORT_MODE == "jsonl"`, log and return `_SKIP_MESSAGE` instead (py-mcp-rob-1).
- **defect** — `scripts/mcp/server.py:630`: under `DND_MCP_TOOLS_GROUP=all`, only modules that list `all` load, giving 53 of 65 tools. lore, ages, timeline and fix_md_links are missing, although the feedback plan says "all is what matters". Either make `all` mean no filter, or treat modules without `MCP_GROUPS` as members of it, and document the rule in the README group-filter section (ext-6).
- `scripts/mcp/server.py:134`: an LSP `Content-Length` of 0 or a negative value exits silently. Treat 0 as a skip and a negative length as a logged close (EC-4).
- `scripts/mcp/server.py:844`: if `executor.submit` raises without queueing, the admission slot leaks. That cannot happen in today's loop. A fix must tell "queued, then thread start failed" apart from "never queued", for example by having the worker set a started flag, or by using a BoundedSemaphore so an over-release fails loudly. The reverted 766b2ead shows the naive fix is wrong (py-mcp-rob-4).
- `scripts/mcp/server.py:30`, `:585`: the comment fixes from reverted e9518383 are still worth making, without deleting the SQLite clause. The admission comment should say `max(4× workers, 32)`. The progress TODO should name only `build_timeline_*`, because no `dnd_pass*` exists. The shutdown comment should say that shutdown waits for running and queued calls, that subprocess calls are capped by `DND_MCP_TOOL_TIMEOUT` (default 60s), and that in-process handlers are uncapped (MNT-7).
- `scripts/mcp/server.py:582`: extract `_candidate_scripts` and `_load_in_process` from `discover_tools`, keep the order of the skipped list, and drop the dead `__init__.py` check at :601 (MNT-3, deferred by the cap).
- `scripts/mcp/server.py:797`: add `SERVER_NAME`, `_E_SERVER` and `_E_NO_METHOD` constants and `_reply`/`_error` helpers that keep key order. The py-mcp-ac-6 pins now guard this change (ext-5, deferred by the cap).
- `scripts/mcp/server.py:632`: when a group filter is set, report "group filter excludes" skips as one summary line, so real discovery failures stand out in stderr (py-mcp-rob-3).
- `scripts/mcp/server.py:280`: relabel a TypeError as "Invalid arguments for <tool>" only when `inspect.signature(handler).bind(**arguments)` fails (py-mcp-rob-6, EC-8).
- `scripts/mcp/server.py:287`: value_flags pass list or dict values as a Python repr. Encode them as JSON, the way placeholders are, if a value_flags tool ever takes non-scalars. This is latent: the only value_flags argument today is a string (py-mcp-rob-7).
- `scripts/mcp/server.py:647`: catch `(Exception, SystemExit)` when importing an `MCP_HANDLERS` module, and pop `sys.modules[spec_name]` on failure (py-mcp-rob-8, latent).
- `scripts/mcp/server.py:463`: decide on the `MCP_TOOL_<name>` shape. Either match exactly `{MCP_TOOL, MCP_TOOLS}`, or document the shape and support it on the import path, with one shared normaliser either way (ext-3, MNT-5).
- `scripts/mcp/server.py:232`: if the error reply fails with UnicodeEncodeError (a lone surrogate in a handler's message), retry once with a backslashreplace'd message so the id still gets a reply (EC-3).
- `scripts/mcp/server.py:665`: a non-dict `MCP_HANDLERS` should skip the module with the reason "MCP_HANDLERS is not a dict" rather than register handler=None tools (EC-5, latent).
- `scripts/mcp/server.py:790`: echo only a supported protocolVersion and answer `PROTOCOL_VERSION` otherwise. Today's echo is pinned by py-mcp-ac-6 (EC-7).
- `scripts/mcp/server.py:280`: in-process handlers have no wall-clock cap, so a handler stuck on `fcntl.flock` holds a slot forever. Fix with `future.result(timeout=...)` or a `LOCK_NB` deadline in the `_locked` helpers (py-mcp-ac-3).
- `scripts/mcp/server.py:830`: busy, unknown-tool and non-object-argument calls write no action-log line, while README:49-50 says every tools/call does. Log them, or narrow the README to "every dispatched tools/call" (py-mcp-ac-4).
- `scripts/mcp/server.py:847`: `notifications/cancelled` is ignored. Keep an id->Future map, cancel queued futures, and suppress the reply for cancelled ids (py-mcp-ac-5).
- `scripts/mcp/server.py:768`: use `executor.shutdown(wait=True, cancel_futures=True)` so EOF does not run queued calls (perf-1).
- `scripts/feedback_reports.py`: give `feedback_list`, `feedback_next`, `feedback_get` and `feedback_resolve` a `title` annotation, then empty `KNOWN_MISSING_ANNOTATIONS` in `scripts/tests/test_dnd_scripts_contracts.py:57` (ext-1).
- `scripts/mcp/README.md:38`: add feedback_reports (the `feedback_*` tools) to the Raise-channel row (MNT-9).

## Verification

- 291003d5 — keep
- 123d149d — keep
- f3251430 — keep
- 6d206244 — keep
- 766b2ead — revert (4120215d)
- be761a64 — keep
- 8b7a80e2 — keep
- e9518383 — revert (88f030c3)
- e40c5c1c — keep
- fdbb6fec — keep

## Gates

- `make test` (pytest -q from the worktree root, using the main checkout's `.venv` python): 1594 passed, 2 skipped, 5 xfailed.
- `make check-context`: passes with this record in place.
- Every changed path is in scope; untouchables are clean.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'`).
