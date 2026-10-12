---
title: "Final review 2026-10-12 — py-ops"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of py-ops found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — py-ops

## Verdict

**NEEDS-JOE**: ten behaviour-preserving commits were kept with the suite green and the goldens byte-identical, but the review recorded real defects whose fix changes a failure path or exit code. Joe has to decide those. They include a stale tunnel pidfile that can SIGTERM an unrelated process, actors.json left public on SIGHUP, and a malformed module.json crashing the gates when node is missing.

## Scope

- Paths: `scripts/foundry/ops/**`, `scripts/tests/test_foundry_ops.py`, `scripts/tests/test_module_*.py`, `scripts/tests/test_evallog.py`, `scripts/tests/test_bridge_orphans.py`, `scripts/tests/test_make_targets.py`, `scripts/tests/test_role_gates.py`, `scripts/tests/test_out.py`, plus this record (area `py-ops`, kind python).
- Base: `ba8c4f91` (origin/main of `/Users/joe/Documents/GitHub/pentaryn`).
- Branch: `review/py-ops`, worktree `/Users/joe/Documents/GitHub/pentaryn-review-py-ops-wt`.
- Triage: 63 findings. 10 were DO (6 DO-EDGE, 4 DO-REFACTOR, with M12 and M17 folded into M2), 33 RECORD (16 of them deferred: cap or out of scope), and 20 DROP (duplicates or not worth a commit).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| rob-3 | ops/service.py (_tunnel_pid) | medium | DO-EDGE → kept | A pidfile holding 0 or -1 read as a live tunnel, so tunnel-down signalled a process group |
| rob-1 | ops/jsscan.py (exports_of) | medium | DO-EDGE → kept | `export {a} from` forwarded every name of the target to the imports gate, as if it were `export *` |
| rob-2 | ops/modules.py (_ops_log) | low | DO-EDGE → kept | An unwritable event log failed the module sync, though the ops log is best-effort |
| rob-4 | ops/pipeline.py (run_import) | medium | DO-EDGE → kept | Any exception out of the import prompt left actors.json staged |
| EC-11 | ops/modules.py (module_new) | low | DO-EDGE → kept | `--out=DIR` was not seen as a chosen --out, so `--install` was added |
| rob-7 | ops/login.py (_choose) | low | DO-EDGE → kept | The numbered picker accepted 0 and negatives, which pick from the end of the list |
| EXT-1 | scripts/tests/test_module_gates.py | low | DO-REFACTOR → kept | Nothing pinned that the three gate-name tables agree |
| M1 | ops/modules.py, bridge.py, pipeline.py, cli.py | low | DO-REFACTOR → kept | Ops modules took say/OK/FAIL from service.py instead of out.py |
| M6 | ops/config.py:183 | low | DO-REFACTOR → kept | The same gate tuple was written out 20 times in MODULES |
| M2 | ops/modules.py, service.py (docstrings) | low | DO-REFACTOR → kept | Docstrings listed four gates of six and named stale docs (folds M12, M17) |
| M3 | ops/modules.py:96 | medium | RECORD | Parse gate checks only two files, skips them without node, and a bad module.json then crashes at :212 |
| EXT-4 | ops/modules.py:109 | low | RECORD (deferred: cap) | Parse gate ignores declared language files beyond lang/en.json |
| M4 | ops/service.py:105 | low | RECORD (deferred: cap) | world_is_launched is dead in production |
| M5 | ops/config.py:23 | low | RECORD (deferred: cap) | FOUNDRY_APP is unused |
| M7 | ops/index.py:49 | low | RECORD (deferred: cap) | index._json copies config._read_json; docstring wrong at :16 |
| M8 | ops/bridge.py:222 | low | RECORD (deferred: cap) | Port-holder expression repeated three times |
| M9 | ops/service.py:229 | low | RECORD (deferred: cap) | Two copies of the `cloudflared tunnel list` existence check |
| M10 | ops/cli.py:194 | low | RECORD (deferred: cap) | Wrapper commands routed twice; duplicated comment |
| M11 | ops/pipeline.py:70 | low | RECORD (deferred: cap) | Lazy `modules` import inside install_importer |
| M14 | ops/config.py:131 | low | RECORD | ModuleSpec accepts a check name 'none' nothing dispatches |
| M15 | ops/login.py:418 | low | RECORD | login() calls fa.status() twice in one expression |
| M16 | ops/pipeline.py:124 | low | RECORD (out of scope) | README omits foundry-verify's Access/tunnel-down skip |
| rob-5 | ops/pipeline.py:99 | low | RECORD | clean_only's "check permissions" branch is unreachable; PermissionError traces back |
| rob-6 | ops/login.py:427 | low | RECORD (deferred: cap) | `who["_id"]` raises KeyError before the `id` fallback runs |
| rob-9 | ops/service.py:272 | low | RECORD (deferred: cap) | `tunnel-logs -n 0` prints the whole log; negative -n misbehaves |
| rob-10 | ops/pipeline.py:225 | medium | RECORD | SIGHUP at the import prompt leaves actors.json staged publicly |
| rob-11 | ops/bridge.py:262 | low | RECORD | bridge-clean returns OK when a kill was refused or an orphan survived |
| rob-12 | ops/jsscan.py:156 | low | RECORD (deferred: cap) | Backslash line continuation in a string shifts later line numbers by one |
| EXT-2 | ops/config.py:183 | medium | RECORD (out of scope) | new_module.py:303 prints a registration row without *_BLUEPRINT |
| EXT-3 | ops/index.py:39 | low | RECORD (deferred: cap) | index._RESERVED hand-copies the kit's RESERVED list |
| EXT-6 | ops/cli.py:89 | low | RECORD | Syncability decided by the literal key 'importer' |
| EXT-7 | ops/evallog.py:130 | low | RECORD (deferred: cap) | eval-report picks files by name glob despite "by shape" docstring |
| EC-3 | ops/service.py:200 | medium | RECORD | A stale pidfile reused by another process reads as "already up", and tunnel-down SIGTERMs it |
| EC-5 | ops/jsscan.py:272 | low | RECORD (deferred: cap) | Semicolon-less side-effect import swallows the next import |
| EC-8 | ops/modules.py:573 | low | RECORD | install() crashes when dst is a dangling symlink |
| EC-12 | ops/bridge.py:184 | low | RECORD | bridge status judges only the first port holder |
| EC-14 | ops/login.py:188 | low | RECORD | Non-interactive _pick_world returns WORLD_NAME without checking it exists |
| py-ops-ac-1 | ops/modules.py:570 | medium | RECORD | Concurrent install() of one module share .new/.old staging with no lock |
| py-ops-ac-3 | ops/service.py:223 | low | RECORD | tunnel_up check-then-start race can start two cloudflared |
| py-ops-ac-4 | ops/bridge.py:87 | low | RECORD | lsof / ps / `cloudflared tunnel list` run with no timeout |
| py-ops-ac-5 | ops/pipeline.py:225 | low | RECORD | Signal handlers installed only after stage() has copied actors.json |
| perf-1 | ops/modules.py:101 | medium | RECORD | Parse gate runs `node --check` serially (~25 s for --all) |
| perf-2 | ops/modules.py:262 | low | RECORD | Each source file is lexed twice per check |
| perf-3 | ops/modules.py:155 | low | RECORD (deferred: cap) | resolve() recomputes spec.src.resolve() per import edge |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 7f4da834 | `_tunnel_pid` returns None for pid <= 0 before the os.kill probe | test_foundry_ops.py::test_tunnel_pid_rejects_non_positive_pids |
| 585487f6 | exports_of: only `export * from` feeds stars; braced re-exports forward only their names; exported() docstring fixed | test_module_checks.py::test_imports_gate_rejects_a_name_a_list_reexport_does_not_forward (+ ..._accepts_a_name_a_list_reexport_forwards) |
| 66062e8f | `_ops_log` guards the event() call with the existing "ops log not written" message | test_module_install.py::test_an_unwritable_event_log_never_fails_the_sync |
| 577a93a7 | run_import unlinks actors.json on any exception and re-raises | test_foundry_ops.py::test_import_deletes_when_the_prompt_raises |
| 52c02146 | module_new treats `--out=DIR` as a chosen --out | test_foundry_ops.py::test_module_new_respects_out_equals |
| 09fc6e8f | `_choose` fallback rejects numbers outside 1..N with the existing error | test_foundry_ops.py::test_numbered_picker_rejects_zero_and_negatives (+ ..._still_takes_a_number_in_range) |
| f4d34c50 | Test-only pin: ModuleSpec.CHECKS == modules._CHECKS == modules._GATES | test_module_gates.py::test_gate_tables_agree |
| 83ee0ae6 | modules/bridge/pipeline/cli import say/OK/FAIL from out.py; service keeps its alias | test_out.py::test_ops_modules_share_out_say |
| 37dcebd2 | `ALL_GATES` in config.py, used by all 20 MODULES rows; repr snapshot identical | test_module_gates.py::test_every_spec_uses_all_gates |
| 0b43fcbd | Docstrings in modules.py/service.py name all six gates and the real docs (no code) | Full suite |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** M3 — `scripts/foundry/ops/modules.py:96`: the parse gate skips its JSON checks when node is missing, so a malformed module.json crashes `_gate_imports` at modules.py:212 with a JSONDecodeError traceback. Move the JSON loop above the node check and/or guard :212.
- **defect** EC-3 — `scripts/foundry/ops/service.py:200`: a stale pidfile whose pid now belongs to another process makes tunnel-up say "already up" and tunnel-down SIGTERM that process. Check `ps -p pid -o comm=` is cloudflared before trusting the pidfile.
- **defect** rob-10 — `scripts/foundry/ops/pipeline.py:225`: closing the terminal (SIGHUP) at the import prompt leaves actors.json staged publicly. Add SIGHUP to the handled signals.
- **defect** py-ops-ac-5 — `scripts/foundry/ops/pipeline.py:225`: the SIGINT/SIGTERM handlers go in only after stage() copies actors.json, so Ctrl-C in that window leaves it public. Install them before stage() and restore in a finally.
- **defect** rob-5 — `scripts/foundry/ops/pipeline.py:99`: clean_only's "still on disk — check permissions" branch is unreachable; unlink's PermissionError traces back instead. Wrap the unlink in `try/except OSError`.
- **defect** rob-11 — `scripts/foundry/ops/bridge.py:262`: bridge-clean exits 0 when a kill was refused or an orphan survived. Return FAIL in that case.
- **defect** EC-12 — `scripts/foundry/ops/bridge.py:184`: bridge status judges only the first port holder, so an orphan on a second port reads as ok. Use `not any(p.ports and p.orphan for p in procs)` and name every holder.
- EC-8 — `scripts/foundry/ops/modules.py:573`: install() crashes when dst is a dangling symlink. Use os.path.lexists for set-aside/recovery, and handle the symlink rmtree(ignore_errors=True) leaves in staging.
- EC-14 — `scripts/foundry/ops/login.py:188`: non-interactive _pick_world returns cfg.WORLD_NAME without checking it is on disk. Validate it like an explicit --world.
- M15 — `scripts/foundry/ops/login.py:418`: two GET /api/status calls in one expression. Use `st = fa.status(); active = st.world if st.active else None`.
- M14 — `scripts/foundry/ops/config.py:131`: ModuleSpec accepts check name 'none'. Remove the allowance or document it beside CHECKS.
- EXT-6 — `scripts/foundry/ops/cli.py:89`: module-sync choices exclude the literal 'importer'. Consider a `syncable` field on ModuleSpec.
- py-ops-ac-1 — `scripts/foundry/ops/modules.py:570`: concurrent install() of one module share .new/.old staging. Hold a per-module fcntl.flock on staging/<name>.lock.
- py-ops-ac-3 — `scripts/foundry/ops/service.py:223`: overlapping tunnel-up runs can start two cloudflared. flock RUN_DIR/cloudflared.lock or create the pidfile with O_EXCL.
- py-ops-ac-4 — `scripts/foundry/ops/bridge.py:87`: lsof, ps and `cloudflared tunnel list` have no timeout. Pass timeout= and turn TimeoutExpired into a ✗ line.
- perf-1 — `scripts/foundry/ops/modules.py:101`: serial `node --check` (~25 s for --all). ThreadPoolExecutor with in-order results.
- perf-2 — `scripts/foundry/ops/modules.py:262`: each file is lexed twice per check. Scan cache keyed by (path, mtime_ns, size).
- rob-6 (deferred: cap) — `scripts/foundry/ops/login.py:427`: `who["_id"] or who.get("id")` raises KeyError before the fallback. Use `who.get("_id") or who.get("id")`.
- rob-9 (deferred: cap) — `scripts/foundry/ops/service.py:272`: `tunnel-logs -n 0` prints everything. `tail = lines_[-lines:] if lines > 0 else []`.
- rob-12 (deferred: cap) — `scripts/foundry/ops/jsscan.py:156`: a backslash line continuation in a string drops a newline. Emit `src.count('\n', i, j)` newlines after _push.
- EC-5 (deferred: cap) — `scripts/foundry/ops/jsscan.py:272`: semicolon-less side-effect import swallows the next import. Clause class `[^;\x01]*?`.
- EXT-4 (deferred: cap) — `scripts/foundry/ops/modules.py:109`: parse every language file module.json declares, not just lang/en.json.
- EXT-3 (deferred: cap) — `scripts/foundry/ops/index.py:39`: add a test pinning index._RESERVED == conformance.RESERVED_API == errors.mjs RESERVED.
- EXT-7 (deferred: cap) — `scripts/foundry/ops/evallog.py:130`: lift the eval-report globs into LOG_GLOBS and fix the "by shape" docstring.
- M4 (deferred: cap) — `scripts/foundry/ops/service.py:105`: delete dead world_is_launched and its test.
- M5 (deferred: cap) — `scripts/foundry/ops/config.py:23`: delete unused FOUNDRY_APP.
- M7 (deferred: cap) — `scripts/foundry/ops/index.py:49`: call cfg._read_json; reword index.py:16.
- M8 (deferred: cap) — `scripts/foundry/ops/bridge.py:222`: add a `_port_holder(procs)` helper.
- M9 (deferred: cap) — `scripts/foundry/ops/service.py:229`: add a `_tunnel_exists()` helper.
- M10 (deferred: cap) — `scripts/foundry/ops/cli.py:194`: route wrappers once via _WRAPPERS (keep `ops -- module-new`); drop the duplicate comment.
- M11 (deferred: cap) — `scripts/foundry/ops/pipeline.py:70`: hoist `from . import modules`, keep the patched `install` global.
- perf-3 (deferred: cap) — `scripts/foundry/ops/modules.py:155`: compute src_root once before `def resolve`.
- M16 (out of scope) — `scripts/foundry/README.md:61`: document foundry-verify's skip when Access answers and the local tunnel is down (code at pipeline.py:124).
- EXT-2 (out of scope) — `scripts/foundry/blueprint/new_module.py:303`: print `check=ALL_GATES` instead of `check=(*_STATIC, "node-test")`.

## Verification

- 7f4da834 — keep
- 585487f6 — keep
- 66062e8f — keep
- 577a93a7 — keep
- 52c02146 — keep
- 09fc6e8f — keep
- f4d34c50 — keep
- 83ee0ae6 — keep
- 37dcebd2 — keep
- 0b43fcbd — keep

## Gates

- `make test` (PY = main checkout's .venv python; the worktree has no .venv): 1594 passed, 2 skipped, 5 xfailed, exit 0.
- `make foundry-modules-check`: exit 0, all 20 modules pass their gates.
- `git diff --quiet origin/main -- '**/golden/**'`: clean. Goldens byte-identical: yes.
- Untouchables clean; every changed path is inside scope.
