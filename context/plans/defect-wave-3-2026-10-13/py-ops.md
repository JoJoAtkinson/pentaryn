# Defect wave 3 (2026-10-13): py-ops

**Read this when:** you need the history of defect wave 3 (2026-10-13) for the py-ops group
(the Makefile's stop/backup and module-index targets, and `scripts/foundry/ops/`). This is a
record, not instructions. The use-doc is [`context/foundry/ops.md`](../../foundry/ops.md).

Branch `wave3/py-ops-2026-10-13`, from `main` at `e392ba56`. Source: Joe's wave-3 request
(2026-10-13: "make backups run on shutdown/restart") and the "Still open" list in
[`defect-wave-2-2026-10-12/README.md`](../defect-wave-2-2026-10-12/README.md) (py-ops:
"`make foundry-module-index --check` swallows `--check`, and EXT-6 refuses at argparse").
Gate: `make test` (2207 passed, 3 skipped, 4 xfailed) and `make check-context` green.

Every change is a declared behaviour change approved by Joe for wave 3. Each test below was
written first and failed on the parent commit. Every test file lives in `scripts/tests/`.

| item | defect | what changed | commits | test |
|---|---|---|---|---|
| backup-on-shutdown | `make vtt-down` took the shutdown backup, but `make foundry-down` did not, so stopping or restarting the app alone left no snapshot. | `foundry-down` stops the app, then runs `foundry-backup REASON=shutdown` with the upload in the background (`WAIT=1` waits). `vtt-down` gets it through `foundry-down` and no longer runs its own, so it backs up once. A restart (down, then up) backs up once: the pre-launch backup on the way up digest-skips the unchanged world. `ops.md` §2 and the "I want to" table, the scripts README and the Makefile comments say so. | `1a9f0924` | `test_make_targets.py`: `test_foundry_down_takes_the_shutdown_backup_after_the_server_stops_wave3_1`, `test_vtt_down_backs_up_exactly_once_wave3_1` (with and without `WAIT=1`), `test_a_restart_backs_up_once_wave3_1`; the existing `test_vtt_down_snapshots_after_everything_is_down` and `test_cloud_background_upload.py::test_vtt_down_backgrounds_unless_wait` still pass |
| module-index-check | `make foundry-module-index --check` rewrote the table. GNU make read `--check` as a short form of its own `--check-symlink-times` (`-L`), so the flag never reached the recipe. | The target passes `--check` through when MAKEFLAGS has that `L` flag, or when `CHECK=1` is set. With neither it regenerates the table as before. Documented in `scripts/foundry/README.md`. | `3ea13c53` | `test_make_targets.py`: `test_foundry_module_index_passes_check_through_wave3_2` |
| EXT-6 | `module-sync importer` failed in argparse with "invalid choice": the parser's choices left out modules marked `syncable=False`, so wave 2's own refusal never ran. | Every registered module name now parses for `module-sync`. `modules.sync()` refuses a `syncable=False` module with "✗ importer is not synced by module-sync — … use `importer-install`" and exits 1, with no gates run and nothing installed. The same applies to `make foundry-importer-sync`. | `a93abfa4` | `test_module_install.py`: `test_cli_module_sync_importer_reaches_the_coded_refusal_ext_6`, `test_module_sync_choices_are_every_registered_module_ext_6` (replaces wave 2's choices test, which pinned the old behaviour); `test_sync_refuses_a_non_syncable_spec_ext_6` unchanged |

## Goldens changed

None.

## Restart

None (addon blueprint §10): no module file changed, only the Makefile and Python tooling.

## Live check after deploy

Code-only: covered by the tests above. None of these steps touch the world or any document, so
no ZZ docs are needed. Optional checks on the Mac (FROM=local, never the tunnel):

- **module-index-check:** `make foundry-module-index --check` prints "✓ context/foundry/README.md:
  module index current" and leaves the file unchanged (`git status`).
- **EXT-6:** `./.venv/bin/python -m scripts.foundry.ops module-sync importer` prints the ✗ line
  naming `importer-install`, exits 1, and installs nothing. There is no argparse usage error.
- **backup-on-shutdown:** `make -n foundry-down` shows `ops down` and then
  `cloud backup --reason shutdown --background`. `make -n vtt-down` shows one `cloud backup`.
  At Joe's next real shutdown, after `make vtt-down` or `make foundry-down`, `make foundry-cloud`
  shows one shutdown upload in progress or done. Never stop the live server just to check this.
