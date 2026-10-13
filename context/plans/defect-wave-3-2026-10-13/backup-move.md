# Defect wave 3b (2026-10-13): backups move into foundry-up / foundry-down

**Read this when:** you want the history of why `make foundry-up` takes the pre-launch backup and
`make vtt-up` no longer lists it. A record, not instructions. The use-doc is
[`context/foundry/ops.md`](../../foundry/ops.md) §2.

Branch `wave3/backup-move-2026-10-13`, from `origin/main` at `f9f155bd`. Source: Joe, 2026-10-13,
follow-up to wave 3 ([`README.md`](README.md)): "backups live in foundry-up (pre-launch) and
foundry-down (shutdown); vtt-up/vtt-down only add the tunnel around them, no double backup."
Gate: `make test` (2265 passed, 3 skipped, 4 xfailed) and `make check-context` green.

## What changed

| before | after |
|---|---|
| `vtt-up: vtt-lock-check foundry-boot foundry-backup-safe foundry-assets-safe foundry-up tunnel-up` | `vtt-up: vtt-lock-check foundry-up tunnel-up` |
| `foundry-up: foundry-boot` (no backup) | `foundry-up: foundry-boot foundry-backup-safe foundry-assets-safe` |
| `vtt-down: vtt-lock-check tunnel-down foundry-down`; `foundry-down` already took the shutdown backup (wave 3 py-ops) | unchanged — py-ops' half kept |

The commands `make -n vtt-up` prints are identical in content and order; only where they hang in
the graph moved. The `-safe` semantics are untouched: the pre-launch backup skips while the server
is up or a shutdown upload is still running, and an unreachable cloud (backup or assets) is a
warning, exit 0. So every up and every down takes exactly one backup; a restart is one of each,
and its pre-launch half skips or digest-skips at run time.

The Saturday updater was checked: it calls no `make foundry-*`/`vtt-*` target (it stops and starts
Foundry through `admin`, and runs only `make tunnel-up`/`tunnel-down`), so it gains no backup.
`make login` starts Foundry through `ops up` with the boot choice and no backup — unchanged.

## Tests (`scripts/tests/test_make_targets.py`, `_wave3b`)

Red on the parent (6): `test_vtt_up_is_lock_check_foundry_up_tunnel_up_wave3b` (prerequisites
read from `make -pq`), `test_foundry_up_takes_the_prelaunch_backup_after_boot_before_start_wave3b`,
`test_every_up_backs_up_exactly_once_wave3b` (`foundry-up`, `foundry-up FROM=latest`),
`test_a_restart_backs_up_once_per_half_wave3b` (`foundry-down foundry-up`),
`test_help_says_where_the_backups_live_wave3b`. Regression guards (green on the parent too):
the `vtt-up` rows of the exactly-once test, `test_every_down_backs_up_exactly_once_wave3b`,
`test_vtt_down_is_lock_check_tunnel_down_foundry_down_wave3b`, the `vtt-down vtt-up` restart
row, and `test_the_updater_never_starts_foundry_through_make_wave3b`.

## Docs

`ops.md` §2 (the lifecycle block, the step table, the every-up/every-down paragraph, the target
table), §3's `foundry-backup-safe` row, the gotcha row; `make help`; `scripts/foundry/README.md`;
the updater docs (`automation/README.md`, `automated-updates.md`) now name `foundry-down` as the
owner of the parting backup. The stale claim that `vtt-up` runs unattended from the updater
(Makefile comment, ops.md `make login` section) is corrected.

## Not changed

Coalescing: a snapshot taken within 5 days of this host's newest replaces it. The first start
after a Saturday run (now `foundry-up` as well as `vtt-up`, as before) takes a pre-launch
snapshot of the post-update world, which can coalesce over the run's pre-update snapshot. That
was already true of `vtt-up`; not touched here.

No restart, no module, no Foundry change.
