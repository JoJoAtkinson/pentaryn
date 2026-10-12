---
title: "Final review 2026-10-12 — py-update"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of py-update found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — py-update

## Verdict

**NEEDS-JOE**: eight behaviour-preserving commits were kept with the suite green and the goldens byte-identical, but real defects are recorded. They include rollback tars sorted as text, so a 6.0.9 -> 6.0.10 update prunes the copy it just wrote; non-atomic stash writes that a later restore trusts; and a stalled `gh` crashing plan.build despite "never raises for network reasons". Fixing any of them changes a failure path, so Joe has to decide.

## Scope

- Paths: `scripts/foundry/update/**`, `scripts/tests/test_update_*.py`, plus this record (area `py-update`, kind python).
- Base: `07479452` (origin/main of `/Users/joe/Documents/GitHub/pentaryn`).
- Branch: `review/py-update`, worktree `/Users/joe/Documents/GitHub/pentaryn-review-py-update-wt`.
- Triage: 70 findings. 10 were DO (5 DO-EDGE: EC-1, ROB-8, ROB-1, EC-5, perf-2; 5 DO-REFACTOR: M8, M6, M4, M3, M2), 43 RECORD, and 17 DROP (duplicates merged into another item, or docstrings folded into M8).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| EC-1 | update/recover.py (stash_system, stash_core, restore fallback, newest_core_bundle) | high | DO-EDGE → reverted | Rollback tars sorted as strings: 6.0.9 -> 6.0.10 prunes the copy just written; 14.99 beats 14.100 |
| ROB-8 | update/recover.py (stash_system, stash_core) | medium | DO-EDGE → reverted | An interrupted stash leaves a truncated final archive that `if out.exists()` later trusts (folds AC-3) |
| ROB-1 | update/adjudicate.py:87 | medium | DO-EDGE → kept | A release with `published: null` crashed build_prompt with TypeError |
| EC-5 | update/admin.py (installed_version) | low | DO-EDGE → kept | A numeric manifest version came back as an int and never compared equal to a string |
| perf-2 | update/adjustments.py (Registry._exposure) | low | DO-EDGE → kept | The exposure cache ignored root, so a second root got the first root's answer |
| M8 | update/__init__, admin, apply, forks, recover, risk, state | low | DO-REFACTOR → kept | Docstrings and comments contradicted the code and schedule (04:06, 06:12, outcomes, deactivate routes) |
| M6 | update/risk, smoke, adjudicate, report, inventory, admin | low | DO-REFACTOR → kept | Unreferenced dead code and unused exports |
| M4 | update/escalate.py | low | DO-REFACTOR → kept | The package-id filename sanitiser was written out five times |
| M3 | update/risk.py, plan.py, adjudicate.py, escalate.py | low | DO-REFACTOR → kept | The buckets comprehension was copy-pasted three times |
| M2 | update/llm.py, escalate.py, report.py | low | DO-REFACTOR → kept | cost_line lived in escalate and forced a report <-> escalate import |
| M1 | update/escalate.py:1222 | medium | RECORD (deferred: cap) | `_run` is ~285 lines doing five jobs and duplicates preview()'s preparation |
| M5 | update/escalate.py:249 | low | RECORD (deferred: cap) | plain() and clean_text() duplicate the scrub pipeline |
| M7 | update/risk.py:195 | low | RECORD (deferred: cap) | Unreachable `else SKIP`, redundant `d.bucket = SKIP`, no risk/upstream version-maths tests |
| M9 | update/adjudicate.py:49 | low | RECORD | SYSTEM_RULES and risk.py:256 say 06:00; the job runs at 04:06 |
| M10 | update/risk.py:13 | low | RECORD | automation/README.md:196-197 says compat flags go to review; code holds them |
| M11 | update/recover.py:85 | low | RECORD | recover_module error text still describes the old createSnapshot model |
| M14 | update/inventory.py:29 | low | RECORD | Unused MODULES_DIR/SYSTEMS_DIR imports; recover hand-builds Data/systems (folds EXT-11) |
| M15 | update/recover.py:323 | low | RECORD | tunnel_running treats PermissionError as dead; state._pid_alive treats it as alive |
| M17 | update/recover.py:147 | low | RECORD | Core Recovery target is 'foundry', everywhere else 'core' (folds EXT-15) |
| ROB-2 | update/adjustments.py:241 | medium | RECORD | Non-mapping `aliases` / non-list `adjustments` raise AttributeError/TypeError, not RegistryError |
| ROB-3 | update/upstream.py:175 | medium | RECORD | gh_api and forks._gh let TimeoutExpired/FileNotFoundError escape and crash plan.build (folds AC-2, perf-3) |
| ROB-4 | update/forks.py:77 | low | RECORD | _default_branch always returns None (`--jq` output is not JSON) (folds EC-4) |
| ROB-5 | update/apply.py:486 | medium | RECORD | restore_service calls quit_app() unguarded; a Timeout loses the report and notification |
| ROB-6 | update/smoke.py:123 | medium | RECORD | _return_to_setup's fallback can raise out of run_all, skipping recovery |
| ROB-7 | update/recover.py:120 | medium | RECORD | recover_system/recover_core quit/start outside the try; a Timeout leaves no Recovery record |
| ROB-9 | update/admin.py:720 | low | RECORD | error_log_since's midnight-rollover promise is not met (folds M16, EC-9) |
| ROB-10 | update/apply.py:228 | low | RECORD | _repair_from silently swallows a failed relaunch |
| ROB-11 | update/upstream.py:249 | low | RECORD | resolve() and risk._compat_ok trust third-party manifest shapes |
| EXT-2 | update/smoke.py:42 | medium | RECORD | NODE hard-coded to /opt/homebrew/bin/node; non-Mac primary fails every smoke |
| EXT-3 | update/plan.py:70 | low | RECORD (deferred: cap) | 'dnd5e' literal in seven or more places |
| EXT-5 | update/report.py:172 | low | RECORD (deferred: cap) | policy -> llm.Spec construction copied across three adapters |
| EXT-6 | update/escalate.py:1251 | low | RECORD (deferred: cap) | Preparation loop duplicated between _run and preview |
| EXT-8 | update/escalate.py:1119 | low | RECORD (deferred: cap) | 'pentaryn-<x> -> make foundry-<x>-check' rebuilt in four places |
| EXT-9 | update/plan.py:73 | low | RECORD (deferred: cap) | Package-kind tuple hard-coded twice |
| EXT-10 | update/upstream.py:245 | low | RECORD (deferred: cap) | resolve re-derives the manifest filename instead of admin.MANIFEST_NAME |
| EXT-13 | update/upstream.py:304 | low | RECORD (deferred: cap) | Release-note collection is two copy-pasted forge branches |
| EXT-14 | update/cli.py:332 | low | RECORD (deferred: cap) | notify --kind choices duplicate notify.CLASSES |
| EXT-16 | update/inventory.py:48 | low | RECORD | Per-module sync/check exceptions hard-coded, not in ops_cfg.MODULES |
| EXT-17 | update/escalate.py:1243 | low | RECORD (deferred: cap) | Escalation defaults duplicated as .get() literals |
| EXT-18 | update/recover.py:288 | low | RECORD (deferred: cap) | System-aside retention fixed at 3 in code |
| EC-2 | update/apply.py:547 | medium | RECORD | With several systems installed, the alphabetically first is "the system" (folds EXT-1) |
| EC-3 | update/adjudicate.py:165 | medium | RECORD | An unhashable verdict id raises TypeError instead of holding all |
| EC-6 | update/upstream.py:306 | medium | RECORD | _attach_notes has no upper bound; beta notes reach the adjudicator, nearest notes dropped |
| EC-7 | update/apply.py:102 | low | RECORD | Stale-entry repair returns before the connected-users check |
| EC-8 | update/smoke.py:226 | low | RECORD | run_browser's skipped payload is scored as a failed world |
| EC-11 | update/upstream.py:144 | low | RECORD | _cached keeps a failed fetch (None) for the full 6 h TTL (folds perf-4) |
| EC-12 | update/smoke.py:85 | low | RECORD | A smoke selection matching no world reports 'done' with nothing smoked |
| AC-1 | update/cli.py:238 | medium | RECORD | recover-service can restore service while the run is still alive |
| AC-4 | update/state.py:61 | low | RECORD | Lock.acquire races; two holders possible (folds EC-10) |
| AC-5 | update/report.py:327 | low | RECORD | _git has no timeout; a hung push loses the week's notification |
| AC-6 | update/llm.py:188 | low | RECORD | claude -p and node smoke children outlive a killed run |
| perf-1 | update/adjustments.py:109 | low | RECORD (deferred: cap) | exposure() re-globs and re-strips every file per package (~70 ms each) |
| perf-5 | update/plan.py:49 | low | RECORD (note) | Plan-build network round-trips run serially |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| `dc0f570d` | ROB-1: `str(n.get('published') or '')[:10]` in the adjudicator prompt | `test_update_escalation.py::test_adjudicator_prompt_tolerates_a_release_with_no_date` |
| `e943aef9` | EC-5: installed_version returns `str(v)` for a numeric manifest version | `test_update_admin.py::test_installed_version_is_a_string_for_numeric_manifests` (+2 controls) |
| `5bc4f837` | M8: docstrings and comments only; ast.dump identical for all 7 modules | existing suite |
| `cb6801f1` | M6: deleted dead code (risk._preview_blockers, smoke.wait_for_settle, IGNORED_WARNING_TYPES, adjudicate/report DENIED_TOOLS, Package.min_core/verified_core, admin.installed_manifest, unused `import re`) | existing suite |
| `c2b3aa4a` | M4: one escalate._safe_name used at five sites | `test_update_escalation.py::test_safe_name_is_shared_by_cache_and_plan_paths` |
| `2cf904d1` | M3: risk.bucket_index replaces three comprehensions | `test_update_escalation.py::test_bucket_index_matches_the_old_comprehension` |
| `4222a223` | M2: cost_line moves to llm; escalate keeps an alias | `test_update_escalation.py::test_cost_line` |
| `07f53ac5` | perf-2: Registry._exposure keyed by (package, resolved root) | `test_update_escalation.py::test_exposure_cache_is_per_root` |

## Changes reverted by verification

| commit | revert | verifier's reason |
|---|---|---|
| `6f8c799f` (EC-1) | `4087c28b` | The fix is real and pinned, but the new key (`upstream._parts`, digit runs only) sorts `6.1.0-beta.1` above `6.1.0`, so with prerelease asides it prunes the just-written copy or the release instead of the beta, and the fallback restores a beta. That is a recoverable-state change on inputs outside the claim. A natural-sort key on the full filename fixes the claim and keeps beta-below-release. |
| `cbe36c11` (ROB-8, AC-3) | `bc6a841d` | Reverted on the sign-off default. Happy path verified byte-identical (FNAME, mode, globs, return value) and the tests pin the claim, but the verifier produced a failure-path change on an input the claim does not cover (an interrupted stash now leaves no archive and re-raises after cleanup). |

## Recorded for Joe

- **defect** `scripts/foundry/update/recover.py` (stash_system / stash_core prune, restore fallback, newest_core_bundle): rollback tars are sorted as strings, so 6.0.9 -> 6.0.10 prunes the copy just written and the fallback restores 6.0.9. Redo EC-1 with a natural-sort key `[int(t) if t.isdigit() else t for t in re.split(r'(\d+)', name)]` and add a prerelease pin (reverted `6f8c799f`).
- **defect** `scripts/foundry/update/recover.py` (stash_system / stash_core): an interrupted stash leaves a truncated final archive that `if out.exists(): return out` trusts, and restore then rmtrees the live tree before extracting. Approve the `.partial` + replace approach of reverted `cbe36c11` (ROB-8, AC-3).
- **defect** `scripts/foundry/update/upstream.py:175`: gh_api and forks._gh let TimeoutExpired / FileNotFoundError escape and crash plan.build, against resolve()'s "never raises for network reasons". Catch `(subprocess.TimeoutExpired, OSError)` and return None (ROB-3, AC-2, perf-3).
- **defect** `scripts/foundry/update/adjustments.py:241`: non-mapping `aliases` / non-list `adjustments` raise AttributeError/TypeError instead of RegistryError, defeating load_or_empty. Add type checks (ROB-2).
- **defect** `scripts/foundry/update/forks.py:77`: _default_branch always returns None because `--jq` output is not JSON; drop `--jq` and read `data['default_branch']`. Reported ahead/behind values change (ROB-4, EC-4).
- **defect** `scripts/foundry/update/apply.py:486`: restore_service calls quit_app() unguarded; a Timeout escapes run() and no report or notification is produced. Wrap it like its siblings (ROB-5).
- **defect** `scripts/foundry/update/smoke.py:123`: _return_to_setup's quit/start fallback can raise Timeout out of run_all, skipping recovery and leaving untested packages live. Catch and record a not-ok WorldResult (ROB-6).
- **defect** `scripts/foundry/update/recover.py:120`: recover_system/recover_core call quit_app/start_app outside their try, so a Timeout abandons recovery with no Recovery record. Move into the try (ROB-7).
- **defect** `scripts/foundry/update/apply.py:547`: with more than one system installed the alphabetically first is stashed and recovered, so a failed dnd5e update is never rolled back. Choose "dnd5e by id" or "the world's system" here and in plan._versions (EC-2, EXT-1).
- **defect** `scripts/foundry/update/adjudicate.py:165`: an unhashable verdict id raises TypeError instead of the promised fail-closed hold-all. Add an `isinstance(pkg_id, str)` guard (EC-3).
- **defect** `scripts/foundry/update/upstream.py:306`: _attach_notes has no upper bound at the target, so beta notes reach the adjudicator and `releases[:8]` drops the notes nearest the installed version (EC-6).
- **defect** `scripts/foundry/update/apply.py:102`: the stale-entry repair path returns before the connected-users check and can take down a live table without --force (EC-7).
- **defect** `scripts/foundry/update/cli.py:238`: recover-service can restore service while the run is still alive (watchdog fires at 20 min of status silence, long phases have no heartbeat). Skip while the lock owner pid is alive, or heartbeat (AC-1).
- **defect** `scripts/foundry/update/state.py:61`: Lock.acquire races (owner-less dir treated as stale, raw OSError escapes, two holders possible); wrapper_timeout can exceed STALE_LOCK_SECONDS when max_minutes > 90 (AC-4, EC-10).
- **defect** `scripts/foundry/update/smoke.py:42`: NODE is hard-coded to /opt/homebrew/bin/node, so on a non-Mac primary every world fails smoke and is rolled back. Resolve via host.py (EXT-2).
- `scripts/foundry/update/admin.py:720`: error_log_since's midnight-rollover promise is not met; carry (day, offset) through, or reword the docstring (ROB-9, M16, EC-9).
- `scripts/foundry/update/apply.py:228`: _repair_from silently swallows a failed relaunch; append to _WINDOW_NOTES (ROB-10).
- `scripts/foundry/update/upstream.py:249`: resolve() and risk._compat_ok trust third-party manifest JSON shapes; coerce non-dicts so a bad manifest is a HOLD, not a crash (ROB-11).
- `scripts/foundry/update/smoke.py:226`: run_browser's skipped payload is scored as a failed world; treat as client_ok=None if Joe wants that gate loosened (EC-8).
- `scripts/foundry/update/upstream.py:144`: _cached persists a failed fetch (None) for the full 6 h TTL; do not persist None or give it a short TTL (EC-11, perf-4).
- `scripts/foundry/update/smoke.py:85`: a smoke selection that matches no world reports 'done' with nothing smoked; add a message or fail (EC-12).
- `scripts/foundry/update/report.py:327`: _git has no timeout and notify runs after the push; add a timeout or notify first (AC-5).
- `scripts/foundry/update/llm.py:188`: claude -p and node smoke children outlive a killed run; add a SIGTERM handler or signal the process group (AC-6).
- `scripts/foundry/update/adjudicate.py:49`: SYSTEM_RULES says '06:00 Saturday' and risk.py:256 says 'not at 06:00'; the job runs at 04:06. Align both (M9).
- `automation/README.md:196-197`: says a compat-preview flag goes to review and credits willDisableModules; code holds and does not use it. Out of scope here (M10).
- `scripts/foundry/update/recover.py:85`: recover_module's error text "the pre-run snapshot did not include it" is stale; reword (M11).
- `scripts/foundry/update/inventory.py:29`: remove unused MODULES_DIR/SYSTEMS_DIR imports with their conftest/test_foundry_data_isolation lines; switch recover to admin.SYSTEMS_DIR (M14, EXT-11).
- `scripts/foundry/update/recover.py:323`: tunnel_running treats PermissionError as not running; unify on state._pid_alive (M15).
- `scripts/foundry/update/recover.py:147`: core Recovery target 'foundry' vs 'core' elsewhere; switch or name one constant, keep the history mapping (M17, EXT-15).
- `scripts/foundry/update/inventory.py:48`: per-module sync/check exceptions belong in ops_cfg.ModuleSpec (EXT-16).
- `scripts/foundry/update/plan.py:49`: plan-build network round-trips run serially; note only, act if a run nears the 90-min backstop (perf-5).
- Deferred (cap), pure refactors: `escalate.py:1222` split _run (M1); `escalate.py:249` extract _defang (M5); `risk.py:195` pin tests then simplify (M7); `plan.py:70` SYSTEM_ID constant (EXT-3); `report.py:172` llm.spec_for (EXT-5); `escalate.py:1251` _prime shared with preview (EXT-6); `escalate.py:1119` inventory.check_hint (EXT-8); `plan.py:73` inventory.KINDS (EXT-9); `upstream.py:245` admin.MANIFEST_NAME, not identical for 'world' (EXT-10); `upstream.py:304` _note helper (EXT-13); `cli.py:332` choices=list(notify.CLASSES) (EXT-14); `escalate.py:1243` _d(cfg, key) (EXT-17); `recover.py:288` keep parameter (EXT-18); `adjustments.py:109` per-root corpus memo (perf-1).

## Verification

- `6f8c799f` EC-1 — revert (`4087c28b`)
- `cbe36c11` ROB-8 — revert (`bc6a841d`)
- `dc0f570d` ROB-1 — keep
- `e943aef9` EC-5 — keep
- `5bc4f837` M8 — keep
- `cb6801f1` M6 — keep
- `c2b3aa4a` M4 — keep
- `2cf904d1` M3 — keep
- `4222a223` M2 — keep
- `07f53ac5` perf-2 — keep

## Gates

- `make test` (PY = main checkout's `.venv` python; the worktree has no `.venv`): 1633 passed, 2 skipped, 5 xfailed. Diff within scope; untouchables clean.
- `make check-context` with this record in place: passed.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'`).
