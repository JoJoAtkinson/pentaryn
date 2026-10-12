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
