# Defect wave 2 (2026-10-12): py-ops

**Read this when** you need the history of defect wave 2 (2026-10-12) for the py-ops group
(`scripts/foundry/ops/` and the blueprint generator's gate call). This is a record, not instructions. The use-doc is
[`context/foundry/ops.md`](../../foundry/ops.md).

Branch `fix2/py-ops-2026-10-12`. Source findings:
[`final-review-2026-10-12/py-ops.md`](../final-review-2026-10-12/py-ops.md) and the related
py-blueprint/perf/robustness/edge-case/extensibility records. Gate: `make test`, at the end
1773 passed, 2 skipped, 5 xfailed.

Ruling for every row: **Fix** (Joe approved defect wave 2 on 2026-10-12, "Let's create a dynamic
workflow to solve all of these things"; where Joe gave no specific ruling we took the review's
recommendation). Every change is a declared behaviour change. Every test file lives in `scripts/tests/` unless a row says otherwise.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| M3 | With no `node` on PATH the parse gate skipped JSON too. The imports gate crashed on a malformed `module.json`. | Fix | A broken `module.json` or lang file gets a normal ✗ parse line even without node. The imports gate says "module.json is malformed JSON" and does not crash. | `3c350fb6` | `test_module_gates.py`: `test_parse_gate_checks_json_even_without_node_M3`, `test_imports_gate_reports_a_malformed_manifest_M3` (+2) |
| EC-3 | The tunnel pidfile was trusted even after the OS reused its pid for another program, so tunnel-down could kill that program. | Fix | The pidfile is trusted only if `ps` names cloudflared. Otherwise it is deleted and the tooling prints "▸ stale pidfile removed". tunnel-down never signals the other program. | `e8fe4a86` | `test_foundry_ops.py`: `test_tunnel_pid_ignores_a_pid_that_is_not_cloudflared`, `test_tunnel_down_never_signals_a_reused_pid` (+2) |
| py-ops-ac-1 | Two syncs of the same module at once could wreck each other's staged copy. | Fix | Each module install takes a lock (`staging/<id>.lock`). A second sync waits, then installs on top. | `3ac12378`, `b6397c71` (doc) | `test_module_install.py`: `test_a_second_install_waits_for_the_first_then_installs_py_ops_ac_1` (+2) |
| perf-1 | The parse gate ran `node --check` on one file at a time. | Fix | It runs them in parallel and still reports the first broken file in file order, with the same output. | `42057b81` | `test_module_gates.py`: `test_parse_gate_runs_node_check_concurrently_perf_1`, `test_parse_gate_reports_the_first_failure_in_sorted_order_perf_1` |
| py-blueprint-MAINT-12 | `new_module.py --check` reached into the private `_CHECKS` table and crashed with a KeyError on an unknown name. | Fix | A public `ops.modules.run_gate` runs the checks, and an unknown check name gets a clear error. | `3f582ac5` | `scripts/foundry/blueprint/tests/test_new_module.py`: `test_run_checks_goes_through_the_public_run_gate`. `test_module_gates.py`: `test_run_gate_is_the_public_prose_runner` |
| py-blueprint-ops-index-reserved | The module index kept its own copy of the kit's reserved API names, which could fall out of step with the kit. | Fix | A pin test fails if the list stops matching the kit's `errors.RESERVED`. | `1620eed8` | `test_module_index.py`: `test_reserved_names_mirror_the_kit` |
| rob-5 | If the staged actors file could not be deleted, the clean step crashed with a traceback. | Fix | It prints a ✗ line saying the file is still on disk, says to check permissions and gives the error, then exits 1. | `2ea279ec` | `test_foundry_ops.py`: `test_clean_only_reports_a_refused_delete_instead_of_tracing_back` |
| rob-11 | `foundry-bridge-clean` reported success even when a kill was refused or an orphan survived SIGKILL. | Fix | Each orphan it could not kill is named with a ✗ and the command exits 1. It reports success only once every orphan is gone. | `e847f001` | `test_bridge_orphans.py`: `test_clean_fails_when_a_kill_is_refused_rob_11`, `test_clean_fails_when_an_orphan_survives_sigkill_rob_11` (+1) |
| EC-12 | Bridge status looked only at the first port holder, so an orphan on a second port was missed. | Fix | Every holder on every bridge port is judged. If any of them is an orphan, the status fails and names each one. | `94b4b556` | `test_bridge_orphans.py` / `test_foundry_ops.py`: `test_status_fails_and_names_an_orphan_on_a_second_port_ec_12` (+3) |
| M8 | Bridge status, the JSON status report and the vtt-up warning each found port holders their own way. | Fix | All three use one list of every holder. This shipped in the EC-12 commit. | `94b4b556` | as EC-12 (`test_warn_if_stale_warns_on_an_orphan_holding_a_second_port_ec_12`) |
| EC-8 | A symlinked or dangling `Data/modules/<id>` crashed the install. | Fix | The symlink is replaced with a real copy, and whatever it pointed at is never deleted. | `833b0002` | `test_module_install.py`: `test_a_dangling_symlink_at_the_destination_is_replaced_ec_8` (+2) |
| EC-14 | A non-interactive login asked Foundry to launch a configured world that did not exist on disk. | Fix | Login stops with "no world named '…' on disk — have: …". | `f06d3041` | `test_foundry_ops.py`: `test_pick_world_without_a_terminal_rejects_a_configured_world_not_on_disk` |
| M15 | Login asked Foundry for its status twice and could get two different answers. | Fix | Login asks once. | `34e439b7` | `test_foundry_ops.py`: `test_login_asks_foundry_for_its_status_once` |
| M14 | The check name `none` was accepted, so a module could be synced unchecked. | Fix | `ModuleSpec(check='none')` raises ValueError like any other unknown gate. | `064388d9` | `test_module_gates.py`: `test_spec_rejects_the_none_check_M14` |
| EXT-6 | module-sync left out the importer by its hard-coded key `'importer'`. | Fix | `syncable` is now a field on the spec. A direct sync of the importer is refused with a ✗ line pointing to importer-install. | `496753a3` | `test_module_install.py`: `test_module_sync_choices_come_from_the_spec_not_the_key_ext_6`, `test_sync_refuses_a_non_syncable_spec_ext_6` (+1) |
| py-ops-ac-3 | Two overlapping tunnel-up runs could each start a cloudflared. | Fix | A lock covers everything from the pidfile check to the pidfile write. The second run waits, then reports "tunnel already up". | `b85a0ed6` | `test_foundry_ops.py`: `test_overlapping_tunnel_up_runs_start_one_cloudflared` |
| py-ops-ac-4 | A hung `ps`, `lsof` or `cloudflared` hung `make` forever. | Fix | These calls time out after 10 s or 20 s with a ✗ "did not answer" line and exit 1. | `6cefb6c9` | `test_foundry_ops.py`: `test_bridge_commands_fail_on_a_hung_ps_instead_of_hanging`, `test_tunnel_up_fails_when_cloudflared_does_not_answer` (+2) |
| perf-2 | The imports gate and the i18n gate each read and lexed the same files. | Fix | `jsscan.scan()` keeps the result keyed by path, mtime and size, so the two gates share one read. An edited file is read again. | `b2fcd0dc` | `test_module_checks.py`: `test_perf_2_the_i18n_gate_reuses_the_imports_gates_scan`, `test_perf_2_an_edited_file_is_scanned_again` |
| rob-6 | `make login` crashed when Foundry listed a user under `id` instead of `_id`. | Fix | Either key is accepted. | `27d30486` | `test_foundry_ops.py`: `test_login_accepts_a_user_record_with_only_an_id_key` |
| rob-9 | `tunnel-logs -n 0` or a negative N dumped the whole log. | Fix | Zero or a negative N prints nothing. | `5885b91f` | `test_foundry_ops.py`: `test_tunnel_logs_prints_only_the_last_n_lines` |
| rob-12 | A backslash line continuation inside a string put every later gate line number off by one. | Fix | Line numbers stay correct after a continuation. | `ea2e5ac4` | `test_module_checks.py`: `test_rob_12_a_line_continuation_in_a_string_keeps_later_lines` |
| EC-5 | A side-effect `import "./x.mjs"` with no semicolon swallowed the import on the next line. | Fix | Both imports are seen, each on its own line number. | `bdf5c46d` | `test_module_checks.py`: `test_a_semicolon_less_side_effect_import_does_not_swallow_the_next` |
| EXT-4 | The parse gate checked only `lang/en.json`. | Fix | Every declared language file and every lang file on disk is checked, and a broken one fails by name. | `456154a3` | `test_module_gates.py`: `test_parse_gate_checks_a_declared_language_path_EXT_4` (+2) |
| EXT-3 | The module index filtered reserved API names with its own copy of the list. | Fix | It uses `conformance.RESERVED_API`, the single list. | `12e99d8e` | `test_module_index.py`: `test_index_filters_by_conformance_reserved_not_its_own_copy` |
| EXT-7 | The eval report's help claimed it told log files apart by their contents. | Fix | Files are chosen only by the `LOG_GLOBS` names (eval*, mcp-*, dnd-scripts-*), and the help text says so. | `8eeff8d5` | `test_evallog.py`: `test_log_files_selects_by_the_named_globs` |
| M4 | `world_is_launched` was dead code. | Fix | It is deleted. The status report still detects the setup screen by itself. | `19115665` | `test_foundry_ops.py`: `test_world_is_launched_is_gone_M4` |
| M5 | `config.FOUNDRY_APP` was never read. | Fix | It is removed. The launch error still names the install folder. | `908ff635` | `test_foundry_ops.py`: `test_config_has_no_foundry_app_M5` |
| M7 | The index had its own JSON reader. | Fix | It reads through the shared `config.read_json`. Its output is unchanged. | `a0cbf909` | `test_module_index.py`: `test_index_reads_json_through_config_not_its_own_copy` |
| M9 | tunnel-up and tunnel-setup each had their own "does the tunnel exist" call. | Fix | They share one `_tunnel_exists` with the 20 s timeout. | `5682748b` | `test_foundry_ops.py`: `test_tunnel_up_and_setup_share_the_existence_check` (+1) |
| M10 | module-new, module-vendor and module-conformance were routed in two places. | Fix | They are routed once, through `_WRAPPERS`. | `938f13bf` | `test_foundry_ops.py`: `test_blueprint_wrappers_route_once_through_the_table` |
| M11 | `install_importer` imported its helpers partway through the command. | Fix | They are imported at the top of `pipeline.py`. | `0e27c99c` | `test_module_install.py`: `test_pipeline_imports_modules_at_the_top_not_inside_install_importer` |
| perf-3 | The imports gate resolved the module root again for every import edge. | Fix | It resolves the root once per run. | `e0354846` | `test_module_checks.py`: `test_perf_3_the_imports_gate_resolves_the_module_root_once` |
| M16 | The README's help table did not say when `foundry-verify` passes or fails behind Cloudflare Access. | Fix | The README now says it passes when Access answers and the tunnel here is down. It fails and asks for a check in a logged-in browser when the tunnel is up. | `612132f9` | `test_foundry_ops.py`: `test_readme_documents_verify_skip_behind_access` |

No item was reverted: a verifier confirmed every committed item holds, and the
already-fixed items were checked against their tests.

## Goldens changed

None.

## Live check after deploy

Python/ops only, so nothing in Foundry changes. Never run the tunnel commands live (Mac is FROM=local), and use no world documents.

- **perf-1 / perf-2 / perf-3 / rob-12 / EC-5 / EXT-4 / M3 / M14:** run `make foundry-modules-check` and confirm the same ✓ line for each module as before, with a markedly faster `--all` run.
- **EXT-3 / M7 / py-blueprint-ops-index-reserved:** run `make foundry-module-index --check` and confirm it reports the table current.
- **EC-12 / M8 / rob-11:** run `./.venv/bin/python -m scripts.foundry.ops bridge-status --json` (read-only) and confirm it lists every port holder and that `ok` is true when the only holder is the live broker.
- **py-blueprint-MAINT-12:** run `./.venv/bin/python scripts/foundry/blueprint/new_module.py zz --title ZZ --out <scratch tmp> --check` and confirm the four gates run, then delete the tmp dir.
- **EXT-6:** run `./.venv/bin/python -m scripts.foundry.ops module-sync importer` and confirm the ✗ line points to importer-install and nothing is synced.
- **Everything else** (EC-3, py-ops-ac-1/3/4, EC-8, EC-14, M15, rob-5/6/9, EXT-7, M4/M5/M9/M10/M11, M16): unit tests only. `make test` is green.
