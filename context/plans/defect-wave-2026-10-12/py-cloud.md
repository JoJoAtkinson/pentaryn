# Defect wave 2026-10-12 — py-cloud

**Read this when** you want the history of the 2026-10-12 defect wave for the py-cloud group
(`scripts/foundry/cloud.py`, the snapshot/backup/restore tooling). This is a record, not
instructions. The review finding is in
[`../final-review-2026-10-12/py-cloud.md`](../final-review-2026-10-12/py-cloud.md).

Branch `fix/py-cloud-2026-10-12`. Gate:
`./.venv/bin/python -m pytest -q scripts/tests -k 'cloud or backup or snapshot or restore'`.
Result: 329 passed, 1 xfailed. The xfail is MD1b, which was already there and is unrelated.

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| R2 | `cloud.py:2465` `extract_snapshot` (the updater's local-tar rollback) did not read the tar end to end before `apply_snapshot` cleared Data/worlds, Config and Data/modules. A truncated tar logged "cleared …" for all three and then raised EOFError, so the world was lost. A non-gzip file raised a raw `tarfile.ReadError`. | Fix (wave approval, 2026-10-12: "take all of those") | If a local snapshot file is damaged or isn't a real snapshot, the restore stops with "… is not a readable snapshot — nothing was touched" and the world, Config and modules stay exactly as they were. The function now reads the marker and every member (`bundles.read_all`) inside the same exception guard `fetch_snapshot` uses, and raises `RestoreError` before anything is cleared. `RestoreError` subclasses `RuntimeError`, so `update/recover.py`'s refusal contract still holds. | 30f8b3f1 | `scripts/tests/test_review_fixes.py::test_r2_extract_snapshot_refuses_an_unreadable_local_tar_before_clearing` (truncated and not-gzip) |

## Goldens changed

None. No README, lang or manifest text was made untrue by this change.

## Live check after deploy

This is Python tooling only, with no Foundry-side behaviour, so no scratch actors or scenes are
needed. **Never** point `extract_snapshot` at a damaged tar while the real Foundry data root is
the active host. If the guard were missing, the call would clear the live world.

- **R2**
  1. In the deployed checkout, run
     `./.venv/bin/python -m pytest -q scripts/tests/test_review_fixes.py -k r2`. Expect 2 passed.
     The test uses the `two_hosts` tmp data roots and never touches a real Foundry dir.
  2. `grep -n "is not a readable snapshot" scripts/foundry/cloud.py`. Expect exactly one hit,
     inside `extract_snapshot`, which shows the deployed copy has the guard.
