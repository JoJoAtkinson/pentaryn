# Defect wave 2 2026-10-12 — py-update

**Read this when:** you want the history of defect wave 2 (2026-10-12) for the py-update group,
the weekly/nightly updater under `scripts/foundry/update/` and its wrappers: what was fixed,
why, and how to check it after deploy. History, not instructions. The use-doc is
[`context/foundry/automated-updates.md`](../../foundry/automated-updates.md).

Branch `fix2/py-update-2026-10-12`. Every fix is a declared behaviour change, approved by Joe
on 2026-10-12. Where Joe gave no ruling, the review's recommendation was taken. No module,
fork or kit files changed: this is Python plus the `automation/bin` wrappers, so no Foundry
restart is needed. Gate at close: `make test`, 1834 passed, 2 skipped, 5 xfailed.

## Fixes

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| EC-1 | Rollback tars were sorted as text, so 6.0.10 sorted before 6.0.9 and the wrong copy was kept | recommendation | Rollback copies are sorted by version number. The updater keeps the copy it just made and restores the newest one | 48ff0898 | test_update_recover.py |
| ROB-8 | An interrupted rollback stash left a half-written archive at the final path | recommendation | The copy is written to a `.partial` file and renamed only when complete, so an interrupted copy leaves nothing behind | 3792235f | test_update_recover.py |
| ROB-3 | A hung or missing `gh` crashed plan.build | recommendation | The package is marked "could not resolve an upstream version" and held | d734a9d5 | test_update_gh_failures.py |
| ROB-2 | A wrong-shaped adjustments registry crashed the Saturday run | recommendation | The run records "registry is broken", names the bad key and carries on with an empty registry | 5c5657f4 | test_update_registry_shapes.py |
| ROB-5 | A stop timeout in restore_service crashed it before the report went out | recommendation | It records "could not stop Foundry: <reason>" and still restores the tunnel, writes the report and notifies | 689df4fc | test_update_restore_quit.py |
| ROB-6 | A failed restart back to setup during smoke crashed the run and left untested modules live | recommendation | That world counts as a failed check ("could not return to setup: ..."), so rollback still runs | 94a4aa4c | test_update_smoke_return_setup.py |
| ROB-7 | A quit/relaunch hang during system or core rollback crashed with no record | recommendation | The rollback is reported as failed, with the steps it got through | 0c990d05 | test_update_recover_quit.py |
| EC-2 | With several systems installed, the alphabetically first one was treated as the game system | recommendation | dnd5e (`SYSTEM_ID`) is always the game system for backup, version compare and rollback | f639695d | test_update_system_id.py |
| EC-3 | A non-string package id from the adjudicator crashed the run | recommendation | Every package is held with an "unexpected entry" reason | 966a4753 | test_update_escalation.py |
| EC-6 | Release notes fed to the grader included betas and releases past the target | recommendation | Only notes between installed and target. If there are more than eight, it keeps the target note plus the seven releases just after the installed version, newest first | eca7e18d | test_update_upstream_notes.py |
| AC-1 | The watchdog restored service under a run that was slow but still alive | recommendation | A live run is left alone and reported "still alive". The wrapper's kill backstop still cleans up a real hang | adba4dc8 | test_update_escalation.py |
| EXT-2 | Smoke found Node only on PATH, and a client fatal error never reached the report | recommendation | `host.node()` checks PATH, then `/opt/homebrew/bin/node`, then falls back to plain `node`. A missing Node gives a clear fatal error, and fatal client errors (500 chars each) go into result.errors and the notification. Scoring is unchanged | 51a17ddc, 31b0bb40 | test_update_smoke_node.py |
| ROB-4 | Fork drift compared against an upstream branch named after the fork's branch | recommendation | Drift is compared with upstream's real default branch | 5d88cb69 | test_update_forks_default_branch.py |
| EC-7 | Repair after a crashed run ignored connected players | standing principle (don't disrupt the table) | The repair still happens, but it stops while players are connected unless you pass `--force` | 21543b7c | test_update_gate_stale.py |
| AC-4 | Two runs racing a stale lock could both end up holding it | recommendation | Every lock create, stale-break and release runs under an `fcntl.flock` guard (non-blocking, 5 s of retries), so exactly one run holds the lock. An owner-write failure raises `Locked`. release() removes the lock only if it still owns it | bbc7f913, d280e76e | test_update_lock_race.py |
| ROB-9 | A run that crossed midnight missed the new day's error log | recommendation | Smoke reads the logs for both days | d951ccd0 | test_update_error_log_rollover.py |
| ROB-10 | A failed repair after a crashed run went unreported | recommendation | The report says the world or tunnel could not be brought back | 3ee3408f | test_update_repair_notes.py |
| ROB-11 | A malformed third-party manifest crashed the scan | recommendation | Any wrong-shaped requires/conflicts/systems/compatibility holds the package as "malformed manifest". Absent or empty means nothing is declared | 928137df, e171eca6 | test_update_manifest_shapes.py |
| EC-8 | When the browser check could not run, the world was marked failed | recommendation | The world is judged on server checks only, and the report says the browser check was skipped | 5975e6eb | test_update_smoke_browser_skipped.py |
| EC-11 | A failed upstream fetch was cached as "unknown" for 6 h | recommendation | Failures are not cached, so the next run tries again | 6d351b7e | test_update_cache_failed_fetch.py |
| EC-12 | A smoke selection that matched no world finished as a clean "updated" | recommendation | The report says "smoke: policy selection <names> matched no world — nothing was smoked" and the notification is a warning | 7a8f908e | test_update_smoke_selection.py |
| AC-5 | A hung git commit or push blocked the notification forever | recommendation | It notifies first. Git times out after 2 min (5 for push) and logs "git push timed out — report written but not pushed" | 77ebb13b | test_update_report_git_timeout.py |
| AC-6 | A killed run orphaned its `claude -p` and node smoke children and kept the lock | recommendation | Children are tracked and terminated on SIGTERM, and the lock is released. children.run mirrors subprocess.run: kill then wait on timeout, kill on any BaseException. A TERM during spawn waits until the child is registered | 649396cf, 3ff5faad | test_update_sigterm_children.py, test_update_smoke_node.py |
| M9 | Prompt and core-hold reason gave the wrong Saturday run time | recommendation | Both say 04:06 Saturday | 7407bc89 | test_update_schedule_time.py |
| M10 | README said a compat-preview flag on a core bump goes to review | recommendation | README says it is a hold | 72982b6c | test_update_readme_buckets.py |
| M11 | The no-backup module rollback error mentioned a pre-run snapshot that doesn't exist | recommendation | The message is "no backup of <module> <version> to restore — backup_packages did not record one before the run" | 22becc46 | test_update_recover_module_message.py |
| M14 | System rollback used its own systems path instead of the shared one | recommendation | It uses `admin.SYSTEMS_DIR`, the path the rest of the updater uses | a2ef94bc | test_update_recover.py, test_foundry_data_isolation.py |
| M15 | A tunnel process owned by another user counted as stopped | recommendation | A PermissionError on the PID probe counts as running | 57821194 | test_update_tunnel_running.py |
| M17 | A core rollback was recorded as "foundry", not "core" | recommendation | It is recorded as "core". Older reports that say "foundry" still count as a core rollback | 17619cc5 | test_update_recover.py |

No item was reverted: every committed fix held on verification. **Goldens changed:** none.

## Live check after deploy

This group is code only and never touches Foundry, so its live checks are dry runs and
log/report reads. None of them touches real PCs, campaign scenes or the tunnel.

- **All items:** `make test` on main after the merge is green.
- **EC-1, ROB-8, EC-2, M14, M17, ROB-7:** on the next Saturday run that rolls something back,
  the report target says `core` or `dnd5e`, the newest tar is restored, and the rollback
  directory holds no `*.partial` file.
- **ROB-3, ROB-2, ROB-11, EC-3, EC-11, EC-6:** run the updater's plan/dry-run (see
  automated-updates.md) and confirm it completes. Any package with no upstream or a bad
  manifest shows as held with the stated reason, not a traceback.
- **ROB-5, ROB-6, ROB-9, ROB-10, EC-8, EC-12, EXT-2:** after the next run, read the report
  JSON. Smoke errors carry client fatal reasons, a skipped browser check is labelled skipped,
  and an empty smoke selection shows the "matched no world" warning.
- **AC-1, AC-4, AC-5, AC-6, EC-7, M15:** when the run ends, `.state/vtt-update.lock/` is gone
  and no `claude -p` or `node` smoke child is left (`pgrep -fl smoke.mjs` prints nothing).
  The watchdog log says "still alive" rather than restoring service during a slow run.
- **M9, M10, M11, ROB-4:** the README and the core-hold reason say 04:06 Saturday. The weekly
  fork section shows ahead/behind counts measured against upstream main.
