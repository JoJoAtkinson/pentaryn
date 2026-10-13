# Defect wave 2 2026-10-12 — py-blueprint

**Read this when** you need the history of defect wave 2 (2026-10-12) for the py-blueprint
group (`scripts/foundry/blueprint/`: conformance scorer, new-module generator, kit vendoring).
This is a record, not instructions; the use-doc is
[`context/foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md).

Branch `fix2/py-blueprint-2026-10-12`. Source findings:
[`final-review-2026-10-12/`](../final-review-2026-10-12/) (py-blueprint area plus the
untriaged AC/EXT/MAINT/perf/ROB rows). Every change is a declared behaviour change approved in
the wave-2 authorisation (Joe, 2026-10-12); where Joe gave no specific ruling the review
recommendation was taken. Gate: `make test`, 1815 passed, 2 skipped, 5 xfailed at the end.

Nothing here ships to Foundry: no module file under `foundry/modules/` changed. These are
Mac-side developer tools.

Tests are in `scripts/foundry/blueprint/tests/` (`test_conformance.py` = TC, `test_new_module.py`
= TN, `test_vendor.py` = TV, `test_usage_docs.py` = TU).

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| py-blueprint-ROB-2 | A broken or missing `adjustments.yml` (including `--snapshot` without one) made C47/C32 pass quietly. | Fix (recommendation) | C47 and C32 now fail with the loader's error, printed once. | `4b591a81` | TC `test_py_blueprint_rob_2_a_broken_or_missing_registry_fails_c47_and_c32` |
| py-blueprint-perf-1 | A full run re-read the registry and every sibling manifest once per module. | Fix (recommendation) | Read once per run; output byte-identical. | `be70e3fa` | TC `test_py_blueprint_perf_1_a_full_run_loads_the_registry_and_manifests_once` |
| EXT-2 | `new_module`'s printed "register it" row lacked `check=ALL_GATES` and repeated after-sync steps already in module.json. | Fix (recommendation) | The row turns on every check; after-sync steps print only when module.json has none. | `ea988633` | TN follow-ups test asserts `check=ALL_GATES` |
| ac-5/C59 | C59 missed a loop awaiting a same-file helper that saves one document at a time. | Fix (recommendation) | C59 follows that helper and warns. | `80037352` | TC C59 fixtures (new helper row) |
| PYB-E7 | `new_module --force` re-rendered at default tier/namespace/CSS/system and could half-write before a vendoring refusal. | Fix (recommendation) | `--force` keeps the module's own settings unless overridden, and refuses before touching files. | `4e516a4e` | TN force-keeps-tier and refusal-leaves-files-identical tests |
| PYB-E6 | Rules capped findings at 12, so the exception gate saw a truncated list: a "… more" line blocked, and later findings hid. | Fix (recommendation) | Every finding reaches the gate; only `--markdown` shortens. | `570af937` | TC `test_pyb_e6_strict_gate_matches_the_full_detail_list_and_display_caps_it` |
| py-blueprint-ROB-4 | A corrupt `kit.lock.json` crashed `vendor check/sync --all` with a traceback. | Fix (recommendation) | That module gets a ✗ "lock is not valid JSON"; the rest carry on; exit 1. | `0940e5de` | TV corrupt-lock test |
| py-blueprint-ROB-5 | One broken module.json crashed scoring of every module. | Fix (recommendation) | Siblings are still scored; C38 names the broken folder "unreadable — not compared"; the broken module itself prints one ✗ line and exits 2. | `6bb86a17` | TC `test_py_blueprint_rob_5_…` |
| py-blueprint-AC-8 | A `serialStore` created inside a function (a new store per call) passed C58. | Fix (recommendation) | C58 fails it unless cached with `x ??= serialStore(`, naming file and line. | `be6035e9` | TC `test_c58_serial_store_at_module_scope_py_blueprint_ac_8` |
| py-blueprint-AC-9 | C49/C60 knew only a fixed list of per-frame hooks. | Fix (recommendation) | Any hook starting `refresh`, `draw` or `hover` counts (prefixes in `packages.json` `hotHookPrefixes`). | `a1a946bc` | TC `test_py_blueprint_ac_9_hot_hooks_match_by_prefix_from_packages_json` |
| py-blueprint-AC-7 | A sync hot-hook handler doing `void paint(t)` on an async function started a job every call, unflagged. | Fix (recommendation) | C60 warns unless deferred via perFrame/debounce/coalesce. First real hit: transform `starry.mjs` updateWorldTime → `tickStarry()` (a warning, not a block). | `788d1d8b` | TC `test_c60_sync_handler_starting_an_async_function_py_blueprint_ac_7`, `test_c60_async_function_in_an_imported_file_py_blueprint_ac_7` |
| py-blueprint-MAINT-10 | C10 held only a file literally named `api.mjs` to the 300-line API cap. | Fix (recommendation) | `<short>-api.mjs` is capped the same. | `6e1e404e` | TC `test_py_blueprint_maint_10_c10_api_cap_follows_the_api_role` |
| py-blueprint-MAINT-9 | C62 said "not the first ref" for a Document param named e.g. `owner`. | Fix (recommendation) | Reason now reads "a Document kind the kit does not resolve". | `2644e1e1` | TC `test_c62_says_why_the_param_is_unresolved` |
| py-blueprint-AC-2 | C55 accepted a GM-query timeout placed in the data argument. | Fix (recommendation) | Only a timeout in the options argument passes. | `73881419` | TC `test_c55_timeout_in_the_options_argument_py_blueprint_ac_2` |
| py-blueprint-EXT-1 | C57 could not check a socket channel name imported from another module file. | Fix (recommendation) | Follows the import (aliases too); name clashes, shadowing params and destructured imports stay n/a. | `b1dbba80` | TC `test_c57_resolves_an_imported_channel_constant_py_blueprint_ext_1` |
| py-blueprint-EXT-8 | Generator and checker could silently disagree on full-tier-only files. | Fix (recommendation) | A pin test fails if they disagree. | `351c2cf9` | TN FULL_ONLY pin test |
| py-blueprint-AC-5 | C59 missed `for await` and `do { } while` loops. | Fix (recommendation) | Both now warn on per-document saves. | `8a6d6b37` | TC `test_c59_sees_for_await_and_do_while_py_blueprint_ac_5` |
| py-blueprint-AC-6 | C61 warned falsely on the positive "is it me" gate and on `game.user?.id`. | Fix (recommendation) | Either comparison direction, `==`/`===`, with or without `?.`, passes. | `76addb5a` | TC `test_c61_positive_and_optional_chained_initiator_gate_py_blueprint_ac_6` |
| PYB-E4 | C38 crashed on a sibling with a non-string id and listed shared-id folders unstably; it also compared a module with itself when folder ≠ id. | Fix (recommendation) | Skips itself by folder or id; names a bad-id sibling by folder; a shared id lists each folder once as `<id> (<folder>/)`, sorted. | `ff45bc1c`, `cc7af4da` | TC `test_pyb_e4_c38_skips_the_module_itself_…`, `test_pyb_e4_c38_names_a_sibling_with_a_non_string_or_shared_id` |
| py-blueprint-MAINT-7 | `vendor` crashed on `flags.pentaryn: null`. | Fix (recommendation) | Treated as no tier → full kit, matching the checker. | `c657149a` | TV null-flags test |
| py-blueprint-EXT-3 | C49 only saw `Hooks.on`/`reg.on` with inline handlers. | Fix (recommendation) | Also `Hooks.once`, `ctx.reg`, the kit's guard wrapper and named/const-arrow handlers. | `558c561a` | TC `test_py_blueprint_ext_3_c49_sees_every_listener_shape`, `…_keeps_the_hot_comment_and_count` |
| py-blueprint-AC-4 | C61 passed a document-change listener imported from another file without reading it. | Fix (recommendation) | Reads it; warns if ungated; lists an unresolvable one for manual review. | `55775934` | TC `test_c61_scores_a_handler_imported_…`, `test_c61_reports_an_unresolved_named_handler_…` |
| PYB-E5 | `new_module` missed a namespace published as `{ ...game.pentaryn, name: api }`. | Fix (recommendation) | It refuses that namespace. | `cd9c9edb` | TN namespace-collision test |
| py-blueprint-perf-2 | Package-use scan read each module's files twice. | Fix (recommendation) | Once; output byte-identical. | `c087e5ca` | existing C09/C47 tests |
| py-blueprint-perf-3 | Imports, listeners, feature files and tier recomputed per rule. | Fix (recommendation) | Memoised per module; output byte-identical. | `92964205` | full TC suite |
| py-blueprint-MAINT-4 | Several hand-rolled "find the body" scanners; a ready handler with `()` in default params was missed. | Fix (recommendation) | One `_block_after` helper; such handlers count. | `d437a91b` | TC `test_py_blueprint_maint_4_block_after`, `…_ready_handler_with_parens_in_its_parameters` |
| py-blueprint-MAINT-5 | `score()` comment listed too few warn+manual rules. | Fix (recommendation) | Comment names C36, C49, C54, C59, C61. | `19be729b` | TC `test_py_blueprint_maint_5_score_comment_names_every_warn_manual_rule` |
| py-blueprint-MAINT-6 | Scorer/generator had their own module discovery; a missing folder crashed. | Fix (recommendation) | Both use `vendor.resolve_module/all_modules`; missing folder scores nothing. | `85659742` | TC `test_py_blueprint_maint_6_…` (two) |
| py-blueprint-EXT-6 | C18/C34/C36/C42 still truncated lists themselves. | Fix (recommendation) | Full lists; only `--markdown` caps at 12 + "… N more". | `320ea223` | TC `test_py_blueprint_ext_6_rules_return_full_lists_and_hook_names_share_hook_reg` |
| py-blueprint-MAINT-13 | `vendor.py` imported `re` inside functions. | Fix (recommendation) | Imported once at the top. | `88258aae` | TV suite |
| py-blueprint-MAINT-11 | Script docstrings and README rows missed options. | Fix (recommendation) | Every argparse flag is listed. | `0c6bb6e2` | TU usage-docs test |
| EXT-8-c12 | C12 missed the module id exported/imported under a banned alias (MOD, MODULE_ID, SCOPE). | Fix (recommendation) | C12 fails those; combat/journal/riders' published `core.MOD` alias is an `exceptions.json` row. | `9efd6992` | TC C12 alias rows, `test_every_exception_pattern_names_a_live_finding` |

No item was reverted; every committed item was verified to hold (ROB-2, perf-1, EXT-2, ac-5/C59,
PYB-E7, PYB-E6, ROB-4, ROB-5, AC-8, AC-9, AC-7, MAINT-10 were found already fixed on the branch).

## Goldens changed

No committed golden file changed. Conformance output on the real tree changed only where
declared: `--json` gains previously truncated findings (EXT-6/PYB-E6); new C60 warnings (AC-7:
transform `starry.mjs` updateWorldTime) and any new C49/C59/C10 warnings from AC-9/EXT-3/AC-5/
MAINT-10; C61 false warnings disappear (AC-6); `exceptions.json` gains the C12 `core.MOD` row.
`--markdown` is byte-identical except where those findings changed.

## Live check after deploy

Mac-side scripts only; nothing changes in Foundry and no deploy, sync or restart is needed. Use
a ZZ scratch module folder (e.g. `new_module.py zz-scratch` into a temp root) and delete it after.

**Conformance rules (ROB-2, ROB-5, PYB-E6, EXT-6, AC-2/4/5/6/7/8/9, EXT-1/3, EXT-8-c12, MAINT-4/9/10, PYB-E4, ac-5/C59, perf-1/2/3)**
1. `make test` from the repo root — all green.
2. `./.venv/bin/python scripts/foundry/blueprint/conformance.py --json > /tmp/after.json` and diff against a run on the previous `main`: only the declared new warnings / full lists / vanished C61 warnings differ.
3. In a ZZ scratch module, add `reg.on("refreshTile", async () => {})` and confirm C60 warns; add `x ??= serialStore(...)` inside a function and confirm C58 passes.

**Generator (EXT-2, PYB-E7, PYB-E5, EXT-8, MAINT-6, MAINT-11)**
1. Generate `zz-scratch` with `--tier small`; confirm the printed register row has `check=ALL_GATES`.
2. Re-run with `--force` and no flags; module.json still says small, no full-only file appears. Delete the folder.

**Vendoring (ROB-4, MAINT-7, MAINT-13)**
1. In a temp copy, put `{` in one module's `kit.lock.json`; `vendor.py check --all` shows that module ✗ "not valid JSON", scores the rest, exit 1, no traceback.
