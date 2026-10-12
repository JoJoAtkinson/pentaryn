# Module bundles — go-live acceptance on the Mac (2026-10-11)

Evidence record for the go-live of per-module backup bundles
([module-bundles-2026-10.md](module-bundles-2026-10.md) §10, §15). History, not instructions.

Joe's bar (2026-10-11): "one complete snapshot in the new backup system that is confirmed
working that I can move fwd with ... confirm foundry saves out to it, can restore from it, also
confirm it doing the whole thing i designed it to do successfully".

Main checkout on `d98cd867 merge: per-module backup bundles (feature/module-bundles)`. Every boot
`FROM=local`; no tunnel; updater paused.

## Pre-state (read-only, 2026-10-12T02:02Z)

- Foundry UP on localhost:30000, tunnel down.
- `world-backups/`: only `world-2026-10-11-212143-fvtt14.369-mac.tar.gz` (3,235,622,773 B, full,
  pre-bundles) + `.parent` (99 B, `{"parent": null, ..., "host": "mac"}`).
- `make foundry-cloud`: based on that snapshot; `bundles 0 in the cloud; local: 45 modules + 1
  system, 46 not yet uploaded`.
- `make foundry-bundles`: 46 bundles, 3.59 GB (45 modules + `system dnd5e 6.0.6`). The plan said
  47 (46 modules + dnd5e): the 46th entry under `Data/modules/` is `README.txt`, not a module, so
  **46 is the right count**. Largest: `pentaryn-seafoot-maps` 2.07 GB.

## A. Fallback copy (server-side)

`rclone copyto` within `onedrive:` (19 s for 3.24 GB — server-side):

```
onedrive:DnD/foundry/pre-bundles-2026-10/
3235622773 world-2026-10-11-212143-fvtt14.369-mac.tar.gz
        99 world-2026-10-11-212143-fvtt14.369-mac.tar.gz.parent
```

quickxor hashes identical to the originals (`a84f910f…` tar, `4f45a671…` sidecar). The tooling
never looks in `pre-bundles-2026-10/`; it is Joe's fallback until he deletes it. Restoring it by
hand = download the tar, then old-style full restore (it carries `Data/modules` and
`Data/systems`).

## B. Disk

`df -h ~/Library/Application Support/FoundryVTT` → 580 GiB available of 926 GiB. Need ~11 GB. OK.

## C. First bundled backup — S_first

Upload queue empty first (`.pentaryn-tmp/` held no `*.job.json`; no `pentaryn-replaced/`).
`make foundry-down` → `✓ foundry stopped`. Then `make foundry-backup REASON=first-bundled`,
blocking, 02:02:28 → 02:25:39 UTC (23 min 11 s wall):

```
  staged 46 new bundle(s) (3.32 GB) for world-2026-10-12-020259-fvtt14.369-mac.tar.gz
  uploading world-2026-10-12-020259-fvtt14.369-mac.tar.gz (20.9 MB, first-bundled) to onedrive:DnD/foundry with 46 new bundle(s) (3.32 GB)...
  uploading bundle module@betterroofs@4.0.2@e0a6f40e10a6cc07.tar.gz (0.00 GB)
  … (one line per bundle, 46 in all; largest module@pentaryn-seafoot-maps@1.0.0@f49d305d3a0e139b.tar.gz 1.89 GB)
  uploading bundle system@dnd5e@6.0.6@b3a588b209538344.tar.gz (0.11 GB)
  snapshot → world-2026-10-12-020259-fvtt14.369-mac.tar.gz (20.9 MB, first-bundled)
  replaced world-2026-10-11-212143-fvtt14.369-mac.tar.gz (0.2 days old, inside the 5-day window)
  1 of 10 snapshots kept for mac
  swept 0 bundles (none unreferenced for 7 days)
```

**S_first = `world-2026-10-12-020259-fvtt14.369-mac.tar.gz`** (20,920,509 B; the world is 18 MB on
disk, so the tar is ~21 MB, not the ~45 MB the plan estimated).

Evidence:
- `make foundry-cloud`: `based on world-2026-10-12-020259-fvtt14.369-mac.tar.gz`; `snapshots mac:
  1`; `bundles 46 in the cloud (3.32 GB); local: 45 modules + 1 system, all in the cloud`;
  `upload last: … done 2026-10-12 02:25 UTC`.
- `make foundry-bundles`: all 46 rows end `yes`; `referenced by no snapshot: 0`.
- `rclone lsf onedrive:DnD/foundry/bundles | wc -l` → 46; `rclone size` → 46 objects, 3,323,359,382 B.
- No `.partial` anywhere under `onedrive:DnD/foundry` (recursive `lsf | grep -i partial` empty).
  Local staging `.pentaryn-tmp/bundles/` empty; no job file left.
- `.parent` sidecar (3,789 B): `parent` = the old full snapshot, `ancestors` = [it], `host` mac,
  `"bundled": 1` (the code writes `1`, truthy — the plan's wording "true" means this),
  45 modules + `systems: {dnd5e: system@dnd5e@6.0.6@b3a588b209538344.tar.gz}`. The module ids equal
  the 45 module folders under `Data/modules/` exactly; the 46 names equal the cloud `bundles/`
  listing exactly.
- World tar: first member `pentaryn-snapshot.json` (then `Data/worlds/`, …; 579 members); its
  marker (`bundled, core, host, modules, systems`) equals the sidecar's manifest.
- Coalescing: the 3.24 GB full `-mac` snapshot was **replaced** (expected). `world-backups/` now
  holds only S_first + sidecar. The fallback copy in `pre-bundles-2026-10/` is intact (3,235,622,773
  B + 99 B).

## C′. Skip check (unchanged tree)

`make foundry-backup REASON=acceptance-skip` (Foundry down, nothing changed since S_first) →
`no change since the last snapshot — skipped` (28 s, all of it the cloud listing).

## D. Save test — Foundry saves out to it — S_save

- `make foundry-bundles` saved before the launch.
- `make foundry-up FROM=local` → `▸ boot: local world (FROM=local)`, `✓ foundry up`.
  `make login WORLD=pentaryn NO_OPEN=1`; its one-time link opened in the existing localhost tab
  (the only GM tab) → `✓ logged in as Gamemaster`. `get-world-info`: pentaryn, dnd5e 6.0.6,
  Foundry 14.369, 1 active user (Gamemaster).
- Created journal **`ZZ bundles acceptance 20261012T023213Z`** (id `ussRnQm9Ou73gPN3`), one text
  page `token` (id `GmviOL6NzjvHmrNI`) with content **`ZZTOKEN-359119f12520b076`**.
  `list-journals journalId=ussRnQm9Ou73gPN3` → content `<p>ZZTOKEN-359119f12520b076</p>`.
- `make foundry-down`. The token is on disk in `Data/worlds/pentaryn/data/journal/000122.log`.
- **Fingerprints across a launch:** `make foundry-bundles` after the stop is byte-identical to the
  one before the launch (`diff` empty) — the LevelDB-housekeeping normalisation holds for all 46.
- `make foundry-backup REASON=acceptance-save`, 02:33:03 → 02:34:42 UTC (1 min 39 s wall, most
  of it rclone listings):

```
  uploading world-2026-10-12-023333-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-save) to onedrive:DnD/foundry...
  snapshot → world-2026-10-12-023333-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-save)
  replaced world-2026-10-12-020259-fvtt14.369-mac.tar.gz (0.0 days old, inside the 5-day window)
  1 of 10 snapshots kept for mac
  swept 0 bundles (none unreferenced for 7 days)
```

**S_save = `world-2026-10-12-023333-fvtt14.369-mac.tar.gz`** (18,902,684 B). **Zero new bundles**
(no "with N new bundle(s)" clause; `bundles/` still 46). Sidecar: parent S_first, ancestors
[S_first, the old full], `bundled: 1`, 45 modules + dnd5e. Downloaded S_save back from the cloud:
first member `pentaryn-snapshot.json`, and `Data/worlds/pentaryn/data/journal/000122.log` inside
it contains `ZZTOKEN-359119f12520b076` — the GM's edit made it into the cloud snapshot.
S_first was coalesced away by S_save (same lineage, inside the 5-day window) — by design every
backup in this run replaces the previous one; only the newest stays in `world-backups/`.

## E. Changed-module test — only changed modules upload

Scratch module `Data/modules/zz-bundles-probe/` (never enabled in any world): `module.json`
(`id zz-bundles-probe`, `title "ZZ bundles probe"`, `version 0.0.1`, `compatibility
{minimum: 14, verified: 14}`) and `probe.txt`. `make foundry-bundles` then listed 47 local
bundles, the probe `6d33710313e73218 … no`.

**probe.txt = "v1"** — `make foundry-backup REASON=acceptance-probe-v1` (1 min 56 s):

```
  staged 1 new bundle(s) (0.0 MB) for world-2026-10-12-023631-fvtt14.369-mac.tar.gz
  uploading world-2026-10-12-023631-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-probe-v1) to onedrive:DnD/foundry with 1 new bundle(s) (0.0 MB)...
  uploading bundle module@zz-bundles-probe@0.0.1@6d33710313e73218.tar.gz (0.00 GB)
  snapshot → world-2026-10-12-023631-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-probe-v1)
  replaced world-2026-10-12-023333-fvtt14.369-mac.tar.gz (0.0 days old, inside the 5-day window)
  1 of 10 snapshots kept for mac
  swept 0 bundles (none unreferenced for 7 days)
```

**S_probe1 = `world-2026-10-12-023631-fvtt14.369-mac.tar.gz`**: exactly 1 new bundle, the other 46
reused; its sidecar lists 46 modules incl. `zz-bundles-probe → …@6d33710313e73218.tar.gz`;
`bundles/` 47.

**probe.txt = "v2"** — `make foundry-backup REASON=acceptance-probe-v2` (2 min 3 s):

```
  staged 1 new bundle(s) (0.0 MB) for world-2026-10-12-023846-fvtt14.369-mac.tar.gz
  uploading world-2026-10-12-023846-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-probe-v2) to onedrive:DnD/foundry with 1 new bundle(s) (0.0 MB)...
  uploading bundle module@zz-bundles-probe@0.0.1@13dafef6009c39f4.tar.gz (0.00 GB)
  snapshot → world-2026-10-12-023846-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-probe-v2)
  replaced world-2026-10-12-023631-fvtt14.369-mac.tar.gz (0.0 days old, inside the 5-day window)
  1 of 10 snapshots kept for mac
  swept 0 bundles (none unreferenced for 7 days)
```

**S_probe2 = `world-2026-10-12-023846-fvtt14.369-mac.tar.gz`**: exactly 1 new bundle (same version
0.0.1, new fingerprint `13dafef6009c39f4` — a content change with no version bump is caught);
sidecar names the v2 bundle; `bundles/` 48 and the v1 bundle is still there. S_probe1 was
coalesced away by S_probe2, so the v1 bundle is now unreferenced — kept by the 7-day grace, not by
a reference.

**Probe folder deleted** — `make foundry-backup REASON=acceptance-probe-removed` (1 min 43 s):

```
  uploading world-2026-10-12-024111-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-probe-removed) to onedrive:DnD/foundry...
  snapshot → world-2026-10-12-024111-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-probe-removed)
  replaced world-2026-10-12-023846-fvtt14.369-mac.tar.gz (0.0 days old, inside the 5-day window)
  1 of 10 snapshots kept for mac
  swept 0 bundles (none unreferenced for 7 days)
```

**S_final = `world-2026-10-12-024111-fvtt14.369-mac.tar.gz`** (18,902,684 B + 4,041 B sidecar): 0
new bundles; sidecar parent S_probe2, `bundled: 1`, 45 modules + dnd5e, **no
`zz-bundles-probe`**; the tar's marker equals the sidecar; every bundle it names is in the cloud.
It still holds the save test's journal (`000122.log` contains `ZZTOKEN-359119f12520b076`).

`make foundry-bundles-gc` (dry run):

```
  would sweep 0 bundle(s) (0.0 MB) — every bundle in the cloud is referenced or younger than 7 days
```

`make foundry-cloud`: `based on world-2026-10-12-024111-fvtt14.369-mac.tar.gz`; `snapshots mac: 1`;
`bundles 48 in the cloud (3.32 GB); 2 unreferenced (0.0 MB, swept after 7 days); local: 45 modules
+ 1 system, all in the cloud`. `make foundry-bundles` lists the two probe bundles under
"referenced by no snapshot: 2 … 0.0 days old" — the first backup on or after 2026-10-19 sweeps
them (no action needed). `.pentaryn-tmp/` holds no job and an empty `bundles/` staging folder.

## State handed to the restore stage

- Foundry **down**; tunnel down. `world-backups/` = S_final only. `pre-bundles-2026-10/` = the
  fallback full snapshot. `bundles/` = 46 live + 2 unreferenced probe bundles.
- Scratch left in place on purpose: journal `ZZ bundles acceptance 20261012T023213Z`
  (`ussRnQm9Ou73gPN3`, token `ZZTOKEN-359119f12520b076`) — the restore proof needs it; delete it
  after the restore stage. The probe module folder is already gone locally.
