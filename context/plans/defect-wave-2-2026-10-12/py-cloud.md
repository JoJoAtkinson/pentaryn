# Defect wave 2 2026-10-12 — py-cloud

**Read this when:** you want the history of defect wave 2 (2026-10-12) for the py-cloud group:
the cloud backup, restore, upload queue, asset and host-control Python under
`scripts/foundry/`. It covers what was fixed, why, and how to check it after deploy. This is
history, not instructions. The use-doc is [`context/foundry/ops.md`](../../foundry/ops.md).

Branch `fix2/py-cloud-2026-10-12`. Joe approved defect wave 2 on 2026-10-12 ("Let's create a
dynamic workflow to solve all of these things"). Every fix is an approved, declared behaviour
change, and where Joe gave no ruling the recommendation was taken. The sources are the final
review records in [`final-review-2026-10-12/`](../final-review-2026-10-12/). Gate `make test`:
1794 passed, 2 skipped, 4 xfailed. **Nothing was reverted** (every item held).

The changes are code only: Python under `scripts/foundry/` and `scripts/tests/`, plus
`context/foundry/ops.md`. No Foundry module, no fork file and no kit file changed. **Goldens
changed: none.** `test_ext1_golden_manifest_bytes_and_digest_unchanged` pins the snapshot
manifest bytes and digest as they were before the KINDS refactor.

All test files are in `scripts/tests/`.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| EC-1 | A zip folder whose name normalised to nothing (e.g. `地图/`) misplaced its files; a nameless file broke the pack. | Approved (take recommendation) | Files under such a folder unpack into the pack folder. If a file's own name normalises to nothing, the whole pack is refused with a message naming that file, and the pack is not marked unpacked. | `28aa0c2a` | `test_cloud_snapshots.py::test_assets_member_whose_name_normalises_to_nothing_refuses_the_pack` (+2) |
| R4 | A queued job with a junk `created` crashed boot, status and upload. | Approved (take recommendation) | That job sorts first and is kept, so its world stays protected. | `7470a35c` | `test_cloud_background_upload.py::test_a_job_with_a_non_numeric_created_still_loads_and_sorts` |
| R3 | Non-UTF-8 bytes in a small cloud text file crashed the tools. | Approved (take recommendation) | They are read as replaced text and treated as a bad file. | `f83cf7f4` | `test_cloud_storage.py::test_read_text_of_non_utf8_bytes_replaces_them_not_raises` |
| EC-3 | A Mac Foundry that ignored the polite quit for 30 s crashed the stop. | Approved (take recommendation) | The stop falls through to a force-quit. | `46c27489` | `test_host.py::test_mac_stop_forces_when_osascript_quit_times_out` |
| M15 | An updater rollback wrote a different based-on record from a manual restore. | Approved (take recommendation) | A rollback writes the same record a restore does. | `1cb3f5c4` | `test_cloud_snapshots.py::test_updater_rollback_writes_the_same_record_as_a_restore_M15` |
| PERF-1 | Rebuilding one lost module bundle re-hashed every module and system. | Approved (take recommendation) | Only that module's folder is re-read. | `890d9884` | `test_review_fixes.py::test_perf1_rebuilding_one_bundle_hashes_only_that_folder` (+3: `test_bundles.py::test_perf1_local_one_*`) |
| M10 | `_upload_job` did landing and retention in one long function. | Approved (take recommendation) | Split into two steps. The behaviour and log lines are unchanged. | `4e0b90b4` | `test_cloud_background_upload.py::test_the_post_landing_retention_is_its_own_step` |
| EXT-1 | Bundle kinds were spelled out in about eight places. | Approved (take recommendation) | One `KINDS` table. | `a5607c49` | `test_bundles_kinds.py::test_ext1_*` |
| EXT-2 | Snapshot names were built in several places. | Approved (take recommendation) | One builder sits beside the parser, and a round-trip test checks it. | `33fe240c` | `test_cloud_snapshots.py::test_snapshot_filename_round_trips_through_the_parser` |
| py-cloud-ac-4 | A hung START/STOP_CMD hook waited forever. | Approved (take recommendation) | Each hook times out after 30 s. A hung stop falls back to a forced stop. A hung start fails with an error that names the hook and the 30 s limit. | `2b768478` | `test_host.py::test_hung_stop_cmd_hook_is_not_delivered`, `::test_hung_start_cmd_hook_is_a_host_error` |
| M12 | The boot prompt's parameter was named `latest` even when the snapshot it offered was not the newest. | Approved (take recommendation) | The parameter was renamed `offer`. The text change shipped with EC-6. | `8074c254` | `test_boot_choice.py::test_ec6_pending_older_offer_is_not_called_latest` |
| py-cloud-ac-1 | A finished background upload rewrote bootstate from a stale copy, so it erased saves made during the upload and could undo a restore. A rollback could also run during a build. | Approved (take recommendation) | The uploader re-reads bootstate before recording. If a restore moved the record, it leaves it alone and logs a warning. The updater rollback holds both queue locks. | `83047965` | `test_cloud_background_upload.py::test_a_bootstate_write_during_the_upload_is_kept_py_cloud_ac_1` (+2) |
| EC-4 | On Linux, `pid()` matched any Foundry whose data path started the same (`/d/foundry` hit `/d/foundry-test`). | Approved (take recommendation) | The pgrep pattern is escaped and anchored after the data path. | `43c55522` | `test_host.py::test_linux_pid_pattern_is_escaped_and_anchored_ec4` (+1) |
| R5 | A vanished bundle with an unreadable name crashed verify. | Approved (take recommendation) | Verify stops with "snapshot is incomplete" and names the bundle. | `c607d611` | `test_cloud_snapshots.py::test_verify_names_an_unparseable_vanished_bundle_instead_of_crashing` |
| EXT-3 | A core version like `15.0-beta` gave a name that read back as another host. | Approved (take recommendation) | The version is stamped `unknown`. A name that would not read back as this host is refused before anything is built. | `2fad25c7` | `test_host.py::test_a_non_numeric_core_version_reads_as_unknown_ext_3`, `test_cloud_background_upload.py::test_a_name_that_does_not_round_trip_is_refused_ext_3` |
| R6 | An unexpected uploader error left the status reading "uploading" forever. | Approved (take recommendation) | The status is marked failed, with the error named. | `95713d3c` | `test_cloud_background_upload.py::test_an_unexpected_error_marks_the_upload_failed_r6` |
| R7 | A corrupt pack zip crashed the asset check, which then forgot every pack unpacked in that run. | Approved (take recommendation) | The pack is named "could not be unpacked" and skipped. The other packs stay in the manifest, and the run reports a failure. | `aaa095a5` | `test_cloud_snapshots.py::test_assets_corrupt_zip_is_a_problem_and_the_manifest_still_records_the_rest` |
| R8 | A restore without `--yes` and without a terminal died with an EOFError traceback. | Approved (take recommendation) | It refuses with "refusing without a terminal — this replaces the world; pass --yes". The world is not touched. | `3f65e47d` | `test_cloud_snapshots.py::test_restore_without_yes_and_without_a_terminal_refuses_cleanly` |
| EC-5 | A world tar uploaded late kept its build-time mtime, so the other host did not treat it as newer. | Approved (take recommendation) | It lands with its upload time. | `3adf2d8d` | `test_cloud_background_upload.py::test_a_late_uploaded_world_tar_lands_with_a_fresh_mtime_ec_5` |
| EC-6 | A pending snapshot from an earlier boot with no terminal was called "latest" after it had stopped being the newest. | Approved (take recommendation) | The prompt says it is not the newest and asks "boot from the offered snapshot or keep local?" (l/take, k/local, or a number). | `8074c254` | `test_boot_choice.py::test_ec6_pending_older_offer_is_not_called_latest` |
| EC-7 | A non-Mac machine named `mac` with no PENTARYN_HOST was tagged `mac` and could claim the primary role. | Approved (take recommendation) | It is tagged `h-mac` and treated as the backup machine. | `a505ce06` | `test_host.py::test_a_non_mac_hostname_sanitising_to_mac_is_not_the_primary_ec7` |
| EC-8 | A bundle tar removed while the size line was being summed crashed the status. | Approved (take recommendation) | The missing file counts as 0 bytes. | `48141ea6` | `test_cloud_background_upload.py::test_job_size_survives_a_bundle_dropped_mid_sum_ec_8` |
| py-cloud-ac-2 | Two hosts uploading the same bundle: the one whose rename lost the race failed. | Approved (take recommendation) | That upload counts as Superseded, and the other host's copy is accepted. | `587e79a3` | `test_cloud_storage.py::test_losing_the_rename_race_in_bundles_is_superseded` (+2) |
| py-cloud-ac-3 | Starting a new uploader rotated `upload.log` while another uploader was still writing it. | Approved (take recommendation) | The log is rotated only when no uploader is writing it. | `cc1c310a` | `test_cloud_background_upload.py::test_upload_log_is_not_rotated_under_a_running_uploader_py_cloud_ac_3` |
| py-cloud-ac-5 | A job built while the job before it was being dropped uploaded unlinked, with no ancestors and no based-on record (MC3). | Approved (take recommendation) | Each drop is recorded in `dropped-parents.json`. The uploader resolves the job's parent through it before the linked check. | `ae363815` | `test_review_merge_compose.py` MC3 (strict xfail removed; must pass) |
| PERF-2 | A restore read each downloaded bundle three times. | Approved (take recommendation) | It now reads each bundle twice: once to verify and once to stream the extract. Extract refuses a stream that ends before the member names verify checked, so a tar cut on a member boundary never installs a partial module. | `daf64d08`, `a2367358`, `996f0af5` | `test_bundles.py::test_perf2_*`, `test_cloud_snapshots.py::test_perf2_a_bundled_restore_reads_each_downloaded_bundle_twice` |
| PERF-3 | The restore list, status and GC read sidecars one at a time. | Approved (take recommendation) | They read four at a time, in the same order. A failed read still stops the GC. | `445c9302` | `test_cloud_snapshots.py::test_perf3_*` |
| EXT-4 | About ten hand-written splits of `<kind>/<id>`. | Approved (take recommendation) | One splitter: `bundles.split_key` / `key_rel`. | `2bdf58a0` | `test_bundles_kinds.py::test_ext4_one_key_splitter_and_no_hand_splits_in_cloud` |
| EXT-8 | The queue walk, failure check and wait message were duplicated across the uploaders. | Approved (take recommendation) | Each now lives in one place, and the messages are the same as before. | `1c9e16d7` | `test_cloud_background_upload.py::test_one_queue_loop_one_failure_test_one_wait_message_ext_8` |
| M1 | `snapshot_core_version()` was never called. | Approved (take recommendation) | Deleted. | `e3f199bf` | `test_cloud_snapshots.py::test_m1_the_uncalled_snapshot_core_version_is_gone` |
| M2 | The `cloud.FOUNDRY_DATA`/`CLOUD_ROOT` back-compat shim was never used. | Approved (take recommendation) | Deleted. | `455e855c` | `test_cloud_snapshots.py::test_m2_the_uncalled_module_getattr_shim_is_gone` |
| M3 | `_coalesce_target`'s `protect` parameter was always None. | Approved (take recommendation) | The parameter was dropped. A protected snapshot is still never replaced. | `8ed08aae`, `c03b3623` | `test_cloud_snapshots.py::test_m3_coalesce_target_has_no_protect_parameter` |
| M4 | `_rebuilder` comments said the wrong thing about cleanup of rebuilt tars. | Approved (take recommendation) | The `rebuilt` list is optional, and the comments say rebuilt tars are cleaned up with `job.drop()`. | `384d58f7` | `test_review_fixes.py::test_m4_rebuilder_rebuilt_is_optional_and_tars_land_in_the_job_staging` |
| M14 | The cloud test helpers were copied into each test file. | Approved (take recommendation) | They are shared from `cloud_fakes.py`. | `e2a5f930` | `test_cloud_fakes_helpers.py::test_M14_*` |
| M16 | A local snapshot tar with a cut-short marker was misread. Two first-member readers could disagree. | Approved (take recommendation) | One parser reads the first member. A cut-short marker is refused with "... — nothing local was touched" (restore and fetch) or "... — nothing was touched" (extract). A zero-member tar is refused before the clear, and GC sweeps nothing for it. | `bcb1389f`, `99fc8dd1` | `test_cloud_snapshots.py::test_a_cut_short_marker_*`, `::test_a_zero_member_tar_cannot_answer_for_either_reader` |

## Live check after deploy

This group is code only: Python that runs from the repo, with no module or fork reload. These
checks are read-only on the Mac (FROM=local). Never use vtt-up, vtt-down or the tunnel for
them, and never restore over a real world. Any document a check needs is a ZZ-prefixed
scratch document, deleted afterwards.

- **All items (smoke):** Run `make foundry-cloud`. It prints storage, host, role, based-on and
  the per-host rows without a traceback. The size line prints (EC-8, EXT-8), the rows come
  out in date order (PERF-3), and the host tag is `mac` with role primary on the Mac (EC-7).
- **EXT-2, EXT-3, EXT-1, EXT-4, M1–M4, M10, M14:** `make foundry-cloud` lists the existing
  snapshots with the right date, host and version. No new backup is needed. A later normal
  shutdown backup should show up in the list under this host.
- **R8:** `echo | make foundry-restore SNAP=<any listed name>` with
  no `--yes` prints the "refusing without a terminal" line and exits non-zero. The world is
  untouched. Confirm with `make foundry-cloud`: based-on has not changed.
- **R7, EC-1:** Run `make foundry-assets-safe`. Every pack is
  either unpacked or named in a "could not be unpacked" / refused line, and there is no
  traceback.
- **EC-6, M12:** At the next boot, if a pending offer is older than the newest cloud
  snapshot, the prompt says it is not the newest and does not call it "latest".
- **py-cloud-ac-1, R6, py-cloud-ac-3, py-cloud-ac-5, EC-5, R4, py-cloud-ac-2:** After the
  next normal shutdown backup, check `make foundry-cloud`. The upload ends as done or failed
  with a reason, never stuck at "uploading". based-on names the new snapshot. The other host
  sees it as newer. The previous `upload.log` is still present until the following start.
- **EC-3, py-cloud-ac-4, EC-4, M15, PERF-1, PERF-2, R3, R5, M16:** These are failure paths
  (a hung quit or hook, a Linux pid, a rollback, a lost bundle, a truncated tar, bad bytes).
  They are covered by the tests above. A live run would need a real failure, so there is no
  extra live step beyond the smoke check.
