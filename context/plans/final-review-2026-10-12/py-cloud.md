---
title: "Final review 2026-10-12 — py-cloud"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of py-cloud found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — py-cloud

## Verdict

**NEEDS-JOE.** Eight behaviour-preserving changes were kept and the gate is green. Several real defects were recorded rather than fixed, because each fix changes a failure path. The most important is R2: a corrupt local snapshot tar is detected only after `Data/worlds` and `Config` have been cleared. Two DO-EDGE fixes (EC-1, R4) were reverted in verification because they also changed inputs that no test pins.

## Scope

- Paths: `scripts/foundry/{cloud,storage,bundles,boot,bootstate,uploadq,host}.py` and their tests (`scripts/tests/test_cloud_*.py`, `test_bundles*.py`, `test_boot_choice.py`, `test_host.py`, `test_review_*.py`, `cloud_fakes.py`, `bundle_fakes.py`), plus this record.
- Base: `a6f1d2d9`. Branch: `review/py-cloud`, worktree `pentaryn-review-py-cloud-wt`.
- Triage: 55 findings. 10 were DO (3 DO-EDGE, 7 DO-REFACTOR), 40 were RECORD (11 of them deferred because of the cap), and 5 were dropped (R1, EC-9, EXT-5 and EXT-7 as duplicates; M13 as a nit).

## Findings by lens

Paths are under `scripts/foundry/` unless they start with `scripts/tests/` or `scripts/foundry/update/`. Line numbers for RECORD rows are as reported at triage.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| EC-1 | cloud.py:691 | high | DO-EDGE, reverted | `_extract_pack`: a folder that kebabs to nothing makes `rel` absolute (a write at `/`), and an empty middle segment hides a collision |
| R4 | uploadq.py:205 | medium | DO-EDGE, reverted | `pending()` crashes sorting when a parseable job file has a non-numeric `created` |
| EC-2 | host.py:70 | low | DO-EDGE, kept | `parse_env` kept the quotes on a quoted value followed by a trailing comment |
| M9 | cloud.py:115 | low | DO-REFACTOR, kept | `KEEP_SNAPSHOTS` was a second copy of `host.DEFAULT_KEEP_SNAPSHOTS` |
| M7 | cloud.py:426 | low | DO-REFACTOR, kept | `cloud._finite` duplicated `bootstate._finite` |
| M8 | uploadq.py:68, cloud.py:231 | low | DO-REFACTOR, kept | `.pentaryn-tmp` and `tmp_dir()` had two sources |
| M5 | storage.py | low | DO-REFACTOR, kept | `RcloneStorage._dir_cache` was written but never read |
| EXT-6 | scripts/tests/test_cloud_storage.py:60 | low | DO-REFACTOR, kept | Nothing tied `storage.SUBFOLDERS` to the cloud/bundles folder constants |
| PERF-5 | bundles.py:228 | low | DO-REFACTOR, kept | `local_inventory` signed each folder twice |
| PERF-6 | cloud.py:728 | low | DO-REFACTOR, kept | `_tree_digest` called stat() twice per file |
| R2 | cloud.py:2465 | medium | RECORD | `extract_snapshot` clears Data/worlds and Config before the tar is known to be readable |
| R3 | storage.py:185 | medium | RECORD | Non-UTF-8 cloud text raises UnicodeDecodeError, not StorageError |
| M15 | update/recover.py:211 | medium | RECORD | Updater rollback writes a different bootstate record from `_restore_locked` |
| M10 | cloud.py:1125 | medium | RECORD | `_upload_job` (~146 lines) mixes publishing with retention |
| EXT-1 | bundles.py:38 | medium | RECORD | Bundle kinds are spelled out in eight or more places |
| EXT-2 | cloud.py:1013 | medium | RECORD | Snapshot names have a parser but no builder; the stamp format appears three times |
| EC-3 | host.py:378 | medium | RECORD | Mac `request_stop()` raises TimeoutExpired, so force_stop is never reached |
| PERF-1 | cloud.py:1443 | medium | RECORD | Rebuilding one bundle re-hashes every module and system |
| R5 | cloud.py:1402 | low | RECORD | `_verify_bundles` raises AttributeError on an unparseable bundle name |
| R6 | cloud.py:1689 | low | RECORD | `_run_job` leaves status 'uploading' on non-StorageError exceptions |
| R7 | cloud.py:705 | low | RECORD | A corrupt pack zip escapes `unpack_assets` and loses the manifest for packs already unpacked |
| R8 | cloud.py:2613 | low | RECORD | `restore()` without --yes gives an EOFError traceback when there is no tty |
| EC-4 | host.py:325 | low | RECORD | Linux `pid()` pgrep pattern can match a sibling instance |
| EC-5 | cloud.py:1226 | low | RECORD | A late-uploaded world tar keeps its build mtime, so it is never offered as newer |
| EC-6 | boot.py:340 | low | RECORD | Prompt says "latest" when the offer is an older pending snapshot |
| EC-7 | host.py:185 | low | RECORD | A non-macOS hostname sanitising to 'mac' becomes the primary host |
| EC-8 | cloud.py:1804 | low | RECORD | `_job_size` races `Job.drop`, raising FileNotFoundError |
| EXT-3 | host.py:293 | low | RECORD | A non-numeric core version gives a snapshot name parsed with the wrong host |
| EXT-4 | cloud.py:2264 | low | RECORD | `<kind>/<id>` keys are split by hand about ten times |
| EXT-8 | cloud.py:1741 | low | RECORD | Queue loop and SystemExit test duplicated |
| EXT-9 | boot.py:105 | low | RECORD | Relation and sidecar states are bare strings |
| M1 | cloud.py:533 | low | RECORD | `snapshot_core_version()` has no caller |
| M2 | cloud.py:201 | low | RECORD | Module `__getattr__` back-compat shim has no caller in the repo |
| M3 | cloud.py:1883 | low | RECORD | `_coalesce_target`'s `protect` is always None |
| M4 | cloud.py:1410 | low | RECORD | `_rebuilder`'s `rebuilt` docstring is misleading |
| M6 | storage.py:9 | low | RECORD | Docstring says "nine operations"; there are 13 |
| M11 | cloud.py:1775 | low | RECORD | The "waiting for another build" callback is defined twice |
| M12 | boot.py:294 | low | RECORD | `_prompt`'s `newest` parameter is really the offer |
| M14 | scripts/tests/test_review_dataloss.py:41 | low | RECORD | Cloud test helpers are copied across 5-8 test files |
| M16 | cloud.py:2032 | low | RECORD | First tar member parsed in two places with different strictness |
| py-cloud-ac-1 | cloud.py:1177 | low | RECORD | pentaryn-boot.json read-modify-write with no lock |
| py-cloud-ac-2 | storage.py:531 | low | RECORD | Both hosts share the `.partial` path in bundles/ |
| py-cloud-ac-3 | cloud.py:1814 | low | RECORD | upload.log is rotated under a running uploader |
| py-cloud-ac-4 | host.py:376 | low | RECORD | START/STOP_CMD hooks have no timeout |
| py-cloud-ac-5 | cloud.py:1288 | low | RECORD | MC3 still open (strict xfail) |
| PERF-2 | bundles.py:455 | low | RECORD | A restore inflates each bundle three times |
| PERF-3 | cloud.py:2574 | low | RECORD | Sidecars read serially |
| PERF-4 | storage.py:542 | low | RECORD | Each upload verifies by listing the whole folder |
| PERF-7 | cloud.py:2228 | low | RECORD | A restoring boot walks all modules three or four times |
| PERF-8 | cloud.py:304 | low | RECORD | `ensure_cloud` costs about nine serial rclone calls |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 1d1220b8 | EC-2: `parse_env` strips one pair of matching quotes after cutting a trailing comment | `test_host.py::test_parse_env_strips_quotes_before_a_trailing_comment` (failed first) |
| 218103e5 | M9: `cloud.KEEP_SNAPSHOTS = host.DEFAULT_KEEP_SNAPSHOTS`; README_TEXT byte-identical | `test_cloud_storage.py::test_readme_retention_is_the_host_default` |
| 5577b198 | M7: `cloud._finite` aliases `bootstate._finite`; unused `import math` dropped | existing lineage/NaN sidecar tests in `test_cloud_snapshots.py`, `test_review_fixes.py` |
| 0f96cf30 | M8: one source for `TMP_DIRNAME` (bundles) and `tmp_dir()` (uploadq) | `test_cloud_background_upload.py::test_tmp_dirname_has_one_source` |
| 3471ccb7 | M5: drop the never-read `RcloneStorage._dir_cache` | existing suite |
| bb847119 | EXT-6: test-only guard tying `SUBFOLDERS`/`CONTENT_ADDRESSED` to the folder constants | `test_cloud_storage.py::test_subfolders_are_exactly_the_cloud_folders` |
| 452f69b3 | PERF-5: `_entry` takes the sig `local_inventory` already computed | `test_bundles.py::test_inventory_signs_each_folder_once` (failed first: 6 calls for 3 folders) |
| 0a9fa7f8, 6f6dcb08 | PERF-6: golden digest test first, then one stat() per file in `_tree_digest` | `test_cloud_snapshots.py::test_tree_digests_are_stable` |

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| ee49396a (EC-1) | 93e4b532 | The segment filter is sound, but the added `if not segs: continue` changes untested behaviour: two members that both normalise to nothing were refused cleanly (exit 1, "both normalise to ''") and are now silently dropped with exit 0, and a single such member that crashed is now silently dropped and the pack recorded complete. That contradicts "a badly named pack still fails". |
| 2c697756 (R4) | 730c6738 | The test pins the crash it names, but the fix also skips job files that loaded fine before (e.g. `created` missing or null, which sorted first as 0.0). The tar of a skipped job is then never uploaded, and `in_flight()` stops protecting its local world. |

## Recorded for Joe

- **defect** `cloud.py:691` (EC-1, reverted): `_extract_pack` builds `rel` from kebabbed segments, so a folder that kebabs to nothing makes `rel` absolute (it tried to write `/pentaryn-ec1-a.png`), and an empty middle segment hides a collision. Re-apply as the filter only, `rel = "/".join(k for k in (kebab(p) for p in parts) if k)`, with the two tests from ee49396a, and decide separately whether members whose whole name normalises to nothing are refused or skipped.
- **defect** `uploadq.py:205` (R4, reverted): `pending()` raises TypeError when sorting if one job file has a string `created`. That crashes `make foundry-cloud` and the boot check. Fix only the sort key (e.g. treat non-numbers as 0.0) rather than skipping files, so null/missing `created` jobs keep loading.
- **defect** `cloud.py:2465` (R2): `extract_snapshot` does not read the local tar end to end before `apply_snapshot` clears Data/worlds and Config. A corrupt tar fails after the clear, and a non-gzip tar raises a raw `tarfile.ReadError`. Mirror `fetch_snapshot`'s read_all guard and raise RestoreError before the clear. High priority (data loss).
- **defect** `storage.py:185` (R3): non-UTF-8 cloud text raises UnicodeDecodeError, not StorageError, crashing ensure_cloud, read_lineage/descends (boot.decide), `_read_sidecar` and post-landing GC (status stays 'uploading'). Decode with 'replace' in both read_text implementations; the rclone side needs `text=False` and bytes-aware `_not_found`.
- **defect** `host.py:378` (EC-3): on the Mac `request_stop()` lets osascript's TimeoutExpired escape, so callers never reach force_stop. Catch it and return False.
- **defect** `host.py:376` (py-cloud-ac-4): START/STOP_CMD hooks run with no timeout, so a hung hook blocks the updater forever. Use timeout=30; on timeout return False for stop and raise for start.
- **defect** `cloud.py:1177` (py-cloud-ac-1): pentaryn-boot.json is read-modify-written with no lock, and the uploader writes back a BootState that is minutes stale, losing concurrent writes (§5.9.4). Reload just before record_snapshot, or add a bootstate flock; recover should hold `_exclusive`.
- **defect** `host.py:325` (EC-4): the Linux `pid()` pgrep pattern is unanchored and unescaped, so `--dataPath=/d/foundry-test` matches FOUNDRY_DATA=/d/foundry and the wrong server can be stopped. Anchor and ERE-escape it.
- **defect** `cloud.py:1402` (R5): `_verify_bundles` dereferences `ref.kind` when `parse_bundle(n)` is None and raises AttributeError instead of the documented `_Incomplete`. Guard as at ~1480.
- **defect** `host.py:293` (EXT-3): a core version such as `14.0.0-beta` gives a snapshot name that parses with the wrong host, so this host's prune and coalesce skip it. Sanitise the version to the parser alphabet, or refuse in `_build`.
- `update/recover.py:211` (M15): the updater rollback writes the bootstate record without lineage_mtimes or `_finite`, and with the local-tree digest instead of the snapshot digest. Add `cloud.record_restored(...)` from cloud.py ~2538-2553 and call it from both places.
- `cloud.py:1689` (R6): `_run_job` records failure only for StorageError/SystemExit. Catch Exception, record 'failed', and re-raise.
- `cloud.py:705` (R7): a BadZipFile or write OSError escapes `unpack_assets` as a traceback and loses save_manifest for packs already unpacked in that run. Catch them around `_extract_pack` and append to problems.
- `cloud.py:2613` (R8): `restore()` without --yes calls input() with no tty check. Die cleanly with "without a terminal", as prune_untagged does.
- `cloud.py:1226` (EC-5): a queued world tar lands with its build-time mtime, so a late upload is never offered as newer on the other host. `os.utime(job.tar, None)` before upload, as bundles.fresh_mtime does.
- `boot.py:340` (EC-6): when the offer is an older pending snapshot, the prompt still says "boot from latest" / "l/latest". Pass is_newest into `_prompt` and reword (pairs with M12).
- `host.py:185` (EC-7): a non-macOS hostname that sanitises to 'mac' silently becomes the primary host. Map it to 'h-mac' off macOS if wanted.
- `cloud.py:1804` (EC-8, deferred: cap): `_job_size`'s is_file()-then-stat() races Job.drop's rmtree. Wrap each stat in try/except OSError and return 0.
- `storage.py:531` (py-cloud-ac-2): both hosts share `<rel>.partial` in content-addressed bundles/, so losing the moveto race raises StorageError instead of Superseded. Refresh and raise Superseded if listed, or use host-unique partials.
- `cloud.py:1814` (py-cloud-ac-3): `_spawn_uploader` rotates upload.log while a running uploader still writes the unlinked inode. Rotate only when UPLOAD_LOCK is free.
- `cloud.py:1288` (py-cloud-ac-5): MC3 is still open and pinned by a strict xfail. When fixing, resolve the parent at upload time through a dropped-to-parent map, which keeps the lock order.
- `cloud.py:1443` (PERF-1): rebuilding one bundle re-hashes every module and system (~3.6 GB). Add a scoped `bundles.local_one(kind, id)`.
- `bundles.py:455` (PERF-2): a restore inflates each bundle three times. Reuse verify's member list and stream-extract.
- `cloud.py:2574` (PERF-3): the restore listing, status and GC mark read sidecars serially. Use a small thread pool, printing in the existing order.
- `storage.py:542` (PERF-4): each upload verifies by listing the whole folder. No action; the argv is pinned and cloud.py:1236 relies on the refilled cache.
- `cloud.py:2228` (PERF-7): a restoring boot walks all modules three or four times. Possibly add an in-process (key, sig) to fp memo later.
- `cloud.py:304` (PERF-8): `ensure_cloud` costs about nine serial rclone calls per process. No action; this is the main fixed cost on the rclone path.
- `cloud.py:1125` (M10, deferred: cap): extract lines ~1243-1269 of `_upload_job` into `_after_landing(...)`, keeping order and strings.
- `bundles.py:38` (EXT-1, deferred: cap): one KINDS table plus `manifest_sections()`, keeping insertion order for sidecar bytes.
- `cloud.py:1013` (EXT-2, deferred: cap): add STAMP_FORMAT and `snapshot_filename()` beside parse_snapshot, with a round-trip test.
- `cloud.py:2264` (EXT-4, deferred: cap): add `bundles.split_key`/`key_rel` helpers.
- `cloud.py:1741` (EXT-8, deferred: cap): add a `_queue_once` generator and an `_is_failure` helper, with messages unchanged.
- `boot.py:105` (EXT-9): relation and sidecar states could become a Literal/Enum with one wording table.
- `cloud.py:533` (M1, deferred: cap): delete the unused `snapshot_core_version()`.
- `cloud.py:201` (M2, deferred: cap): decide whether to remove the module `__getattr__` shim for `cloud.FOUNDRY_DATA`/`CLOUD_ROOT` or keep it as deprecation.
- `cloud.py:1883` (M3, deferred: cap): drop `_coalesce_target`'s always-None `protect` parameter and fix its docstring.
- `cloud.py:1410` (M4, deferred: cap): make `_rebuilder`'s `rebuilt` list optional and fix its docstring.
- `storage.py:9` (M6, deferred: cap): the docstring says "nine operations". Say "the same operations".
- `cloud.py:1775` (M11, deferred: cap): one module-level `_waiting_build()` for both sites.
- `boot.py:294` (M12, deferred: cap): rename `_prompt`'s `newest` to `offer`.
- `scripts/tests/test_review_dataloss.py:41` (M14, deferred: cap): move the copied cloud test helpers into cloud_fakes.py.
- `cloud.py:2032` (M16): `_marker_from_head` and `_read_marker` parse the first tar member with different strictness. Unifying them changes failure paths and needs sign-off.

## Verification

- 1d1220b8: keep
- 218103e5: keep
- 5577b198: keep
- 0f96cf30: keep
- 3471ccb7: keep
- bb847119: keep
- 452f69b3: keep
- 0a9fa7f8 / 6f6dcb08: keep
- ee49396a: revert (93e4b532)
- 2c697756: revert (730c6738)

## Gates

- `make test` (run as `.venv/bin/python -m pytest -q` with the main checkout's .venv, because the worktree has none): 1587 passed, 2 skipped, 5 xfailed. All changed paths are in scope, and untouchables are clean.
- `make check-context` passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
