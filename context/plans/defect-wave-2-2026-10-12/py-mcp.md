# Defect wave 2 2026-10-12 — py-mcp

**Read this when:** you want the history of defect wave 2 (2026-10-12) for the py-mcp group —
the dnd-scripts MCP server (`scripts/mcp/server.py`) and its in-process tools: what was fixed,
why, and how to check it after deploy. History, not instructions — the use-doc is
[`scripts/mcp/README.md`](../../../scripts/mcp/README.md).

Branch `fix2/py-mcp-2026-10-12`. Source records: `context/plans/final-review-2026-10-12/`.
Every fix is a declared behaviour change (Joe approved wave 2 on 2026-10-12); where Joe gave
no ruling the review's recommendation was taken. Python only — no Foundry module, no kit, no
fork change. No goldens changed. Nothing reverted: every item holds.

## Fixes

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| py-mcp-rob-2 | A non-object JSON-RPC frame (list, bare value, `null` body) crashed or ended the serve loop | recommendation | A malformed message is logged and ignored; the server keeps serving | 100fe93e | `test_py_mcp_rob_2_non_object_frame_is_skipped`, `test_py_mcp_rob_2_serve_loop_survives_a_batch` |
| py-mcp-rob-1 | A garbage line in JSONL mode was parsed as an LSP header and stalled the loop | recommendation | A stray non-JSON line is logged and skipped; later requests still answered | ed3ed0ae | `test_py_mcp_rob_1_non_json_line_in_jsonl_mode_is_skipped`, `test_py_mcp_rob_1_first_frame_still_sniffs_lsp` |
| py-mcp-MNT-3 | `discover_tools` was one long function | recommendation | Split into candidate-scan and in-process-load helpers; same tools, same order | e9d926f0 | `test_py_mcp_mnt_3_candidate_scripts_keeps_the_exclusions`, `test_py_mcp_mnt_3_load_in_process` |
| py-mcp-ext-6 | `DND_MCP_TOOLS_GROUP=all` dropped lore and timeline tools | recommendation | `all` loads every tool, same as unset | 6c757d37 | `test_group_all_is_the_same_as_unset` |
| py-mcp-EC-4 | `Content-Length: 0` or negative went quiet with no explanation | recommendation | Length 0 is noted and skipped; negative logs a clear line, then closes | 61256ab2 | `test_py_mcp_ec_4_zero_content_length_is_skipped`, `test_py_mcp_ec_4_negative_content_length_is_logged` |
| py-mcp-MNT-7 | Stale comments on the request cap, progress TODO and shutdown bound | recommendation | Comments now match the code; no behaviour change | 1269a6a6 | `test_py_mcp_mnt_7_comments_match_the_code` |
| py-mcp-ext-5 | JSON-RPC replies hand-built in several places | recommendation | Every reply goes through `_reply`/`_error` helpers | 08f82fb0 | `test_py_mcp_ext_5_envelope_helpers`, `test_py_mcp_ext_5_no_hand_built_envelopes` |
| py-mcp-rob-3 | Group-filter exclusions logged one failure line per script | recommendation | One summary line counts the excluded scripts; only real breakages listed; `--list-tools` still names each exclusion | e399caab | `test_py_mcp_rob_3_group_exclusions_are_one_summary_line` |
| py-mcp-rob-6 | Any `TypeError` inside a handler said "Invalid arguments" | recommendation | Only a signature mismatch says "Invalid arguments"; a body TypeError keeps its own message | 3a1a45fc | `test_py_mcp_rob_6_handler_body_type_error_keeps_its_message` |
| py-mcp-rob-7 | List/dict flag values passed to scripts as Python repr | recommendation | Rendered as JSON text; scalars as text; empty values skipped | 2da0233e | `test_py_mcp_rob_7_value_flags_render_list_and_dict_as_json` |
| py-mcp-rob-8 | A script raising `SystemExit` at import killed discovery | recommendation | That one script is skipped, the rest load, no half-loaded module left in `sys.modules` | 37b2c387 | `test_py_mcp_rob_8_system_exit_at_import_is_skipped_and_discovery_continues` |
| py-mcp-ext-3 | AST discovery matched any `MCP_TOOL*` name | recommendation | Only `MCP_TOOL`/`MCP_TOOLS` declare tools; helpers like `MCP_TOOL_NAMES` are ignored | 96086081 | `test_py_mcp_ext_3_mcp_tool_prefixed_helpers_are_ignored` |
| py-mcp-EC-3 | An error message with a lone surrogate failed to encode, so no reply was sent and Claude waited forever | recommendation | Surrogates are escaped; the -32000 error reply always goes out | f5bb2eb8 | `test_py_mcp_ec_3_lone_surrogate_error_still_replies`, `test_py_mcp_ec_3_plain_unicode_stays_unescaped` |
| py-mcp-EC-5 | A non-dict `MCP_HANDLERS` listed tools that could not run | recommendation | The whole script is skipped with "MCP_HANDLERS is not a dict" | 9a3046f7 | `test_py_mcp_ec_5_non_dict_handlers_skips_whole_module` |
| py-mcp-EC-7 | `initialize` echoed whatever protocolVersion the client sent | recommendation | Always answers `2025-06-18`, the only version supported | 5a6bd932 | `test_initialize_never_echoes_unsupported_version` |
| py-mcp-ac-3 | feedback / combat-action / dice tools could wait forever on a held file lock | recommendation | They give up after `DND_MCP_TOOL_TIMEOUT` (60 s) with "could not lock <file> within 60s" and free the slot | 10aefe66 | `scripts/tests/test_py_mcp_ac_3_lock_deadline.py` |
| py-mcp-ac-4 | Busy / unknown-tool / bad-argument refusals left no action-log line | recommendation | Each refusal writes one log line with mode `rejected`, so it shows in the eval report | c56cc2cc | `test_py_mcp_ac_4_rejected_calls_write_one_log_line_each` |
| py-mcp-ac-5 | A cancelled call could still run and reply | recommendation | A queued cancelled call never runs and frees its slot; a running one finishes without replying | e5a885bc | `test_py_mcp_ac_5_cancelled_calls_never_run_or_reply`, `test_py_mcp_ac_5_unhashable_id_still_replies` |
| py-mcp-perf-1 | On stdin EOF queued lookups ran for minutes with nobody listening | recommendation | Running calls finish; queued calls are dropped | 8d4c8702 | `test_py_mcp_perf_1_eof_drops_queued_calls` |
| py-mcp-ext-1 | The four feedback tools had no title annotation | recommendation | Titles: "List feedback reports", "Next feedback report", "Get a feedback report", "Resolve a feedback report"; every tool now has one | 2ce6c5b7 | `test_py_mcp_ext_1_feedback_tools_have_titles`, `test_every_tool_declares_the_five_annotation_keys` |
| py-mcp-MNT-9 | README's Raise row omitted the feedback tools | recommendation | README says `feedback_*` report failures as errors like the other built-ins | 97b22f59 | `test_py_mcp_mnt_9_readme_raise_row_names_every_in_process_tool` |

Goldens changed: none.

## Live check after deploy

Python only: restart the Claude Code session (or `/mcp` reconnect `dnd-scripts`) so the new
server loads. No Foundry, no scratch docs needed — none of these touch the world.

- **Discovery (MNT-3, ext-6, ext-3, rob-3, rob-8, EC-5):**
  1. `./.venv/bin/python scripts/mcp/server.py --list-tools` lists the same tools as before the deploy.
  2. `DND_MCP_TOOLS_GROUP=all ./.venv/bin/python scripts/mcp/server.py --list-tools | wc -l` equals the unset count.
  3. `DND_MCP_TOOLS_GROUP=combat ./.venv/bin/python scripts/mcp/server.py < /dev/null 2>&1` shows one exclusion summary line, no per-file lines.
- **Serve loop (rob-1, rob-2, EC-4, EC-3, EC-7, ext-5):**
  1. `printf '[1]\n{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' | ./.venv/bin/python scripts/mcp/server.py` — a tools/list reply arrives after the logged skip.
  2. `printf 'oops\n'` between two JSONL requests — the second is still answered.
  3. In a fresh session, `mcp__dnd-scripts__list_conditions` answers (initialize negotiated `2025-06-18`).
- **Calls (rob-6, rob-7, ac-3, ac-4, ac-5, perf-1):**
  1. `mcp__dnd-scripts__roll_dice` with `1d20` answers normally.
  2. Call an unknown tool name once; with `PENTARYN_MCP_LOG_DIR` set (as the session config sets it), the newest line of the action log in that dir has mode `rejected`.
  3. `mcp__dnd-scripts__feedback_list` answers normally (lock taken and released).
- **Titles and docs (ext-1, MNT-9, MNT-7):**
  1. `/mcp` in Claude Code shows "List feedback reports" etc. as the feedback tool titles.
  2. `make check-context` passes.
