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

## G. Clean-room restore — S_final from the cloud into an empty data root

Scratch root `~/pentaryn-restore-test/FoundryVTT` (empty `Data/` + `Config/`, same SSD), selected
with `FOUNDRY_DATA` only. `host show` with that override printed `data
/Users/joe/pentaryn-restore-test/FoundryVTT`; `bootstate.path()`, `uploadq._dir()` and
`cloud.data_root()` all resolved under it; `tree_has_world()` was false. Foundry down (the restore
refuses otherwise). Then, 02:50:57 → 02:58:54 UTC (7 min 57 s, exit 0):

```
$ echo restore | FOUNDRY_DATA=~/pentaryn-restore-test/FoundryVTT make foundry-restore SNAP=world-2026-10-12-024111-fvtt14.369-mac.tar.gz
  about to restore world-2026-10-12-024111-fvtt14.369-mac.tar.gz (mac) over /Users/joe/pentaryn-restore-test/FoundryVTT
  downloading world-2026-10-12-024111-fvtt14.369-mac.tar.gz (18.9 MB, mac)...
  downloading 46 bundle(s) (3.32 GB)...
  no local world to snapshot — skipped
  cleared Config
  options.json came from another machine (dataPath /Users/joe/Library/Application Support/FoundryVTT); set to /Users/joe/pentaryn-restore-test/FoundryVTT
  restored world-2026-10-12-024111-fvtt14.369-mac.tar.gz: world 18.9 MB; modules: 45 installed (3.21 GB), 0 unchanged, 0 removed; systems: 1 installed (108.4 MB), 0 unchanged, 0 removed
  restored world-2026-10-12-024111-fvtt14.369-mac.tar.gz
```

No safety copy (no local world), so nothing was written to the cloud.

**Scratch tree compared with the live tree**, file by file, full byte compare (`filecmp`, not
shallow), 48 areas: all of `Data/worlds`, `Config`, each of the 45 `Data/modules/<id>` and
`Data/systems/dnd5e`. `Data/worlds` and `Config` were compared with **no exclusions**. In
module/system folders the only files left out were the LevelDB housekeeping files, by
`bundles._housekeeping`, the fingerprint's own rule: 330 on each side.

- 10,016 files identical, 3.63 GB compared.
- `Data/worlds` (all four worlds + `README.txt`): **byte-identical, every file, housekeeping
  included.**
- `Config`: 3 of 4 identical. `options.json` differs **only** in `dataPath` (the restore points
  it at the scratch root, per plan, because there was no local `options.json` to keep) plus a
  trailing newline. `admin.txt`, `license.json` and `package-index.json` are identical.
- All 45 modules + dnd5e identical except for one file. Live `dnd-players-handbook` has
  `assets/journal-art/desktop.ini`, a Windows junk name (`storage.JUNK_NAMES`) that bundles never
  carry, by design (§3.3). There were no other differences, missing files or extra files.
- Fresh, uncached `bundles.fingerprint` of every restored folder: **46 of 46 equal the
  fingerprint in the bundle name** that S_final's manifest records (3.59 GB hashed). The same
  check on the live tree gives 46 of 46.
- The housekeeping files left out of the compare are exactly the ones a launch rewrites: 55
  identical, 165 differ, and 110 exist on one side only on each side. These are new
  `MANIFEST-*` and empty WAL numbers from the save test's launch, since the bundles were tarred
  before that launch.
- **Journal token:** `ZZTOKEN-359119f12520b076` is in the restored
  `Data/worlds/pentaryn/data/journal/000122.log`, the same file as on the live tree.
- **`zz-bundles-probe` is absent** from the restored `Data/modules`, which has 45 folders. S_final
  does not list it. No module or system folder exists that the manifest does not name.

## H. Older snapshot: S_probe2 no longer exists, so substitutes were run

S_probe2 (`world-2026-10-12-023846-…`) **cannot be restored: it is no longer in the cloud.**
S_final coalesced it in stage E. That is by design: each backup in this run replaced the one
before it inside the 5-day window. `world-backups/` holds only S_final + sidecar, and
`major-release/` is empty. No older bundled snapshot is left to restore. Two substitutes cover
what H was meant to prove, and neither writes to the cloud.

**H1. Old bundle versions are intact and restorable.** Scratch root 2
`~/pentaryn-restore-test/FoundryVTT-old` (`FOUNDRY_DATA` override). The restore's own functions
were run: `bundles.listing` → `fetch` → `verify` → `extract`, on both probe bundles, which the
7-day grace still keeps:

```
module@zz-bundles-probe@0.0.1@6d33710313e73218.tar.gz: size 465 B (listing 465 B); probe.txt='v1'; files=['module.json', 'probe.txt']; fingerprint of extracted folder 6d33710313e73218 — name says 6d33710313e73218 — MATCH
module@zz-bundles-probe@0.0.1@13dafef6009c39f4.tar.gz: size 473 B (listing 473 B); probe.txt='v2'; files=['module.json', 'probe.txt']; fingerprint of extracted folder 13dafef6009c39f4 — name says 13dafef6009c39f4 — MATCH
```

The v2 bundle was extracted over v1, which is the replace path.

**H2. Differential restore: only what this machine lacks, replaced with the version the snapshot
names.** The step-G scratch root was reused. Three changes were made first:
- `Data/worlds` deleted, so there is no local world, no safety copy and no cloud write.
- One module tampered: a line appended to `pentaryn-walls/README.md` and a new
  `zz-extra-file.txt` added. Its fingerprint became `b3f6cf4e5372d5a0`; the manifest says
  `cf227cd3567d4043`.
- The v2 probe module (from H1) dropped in as an extra.

Then the same `make foundry-restore SNAP=<S_final>` (55 s, exit 0):

```
  downloading world-2026-10-12-024111-fvtt14.369-mac.tar.gz (18.9 MB, mac)...
  downloading 1 bundle(s) (0.3 MB)...
  no local world to snapshot — skipped
  cleared Config
  kept this machine's options.json, admin.txt, license.json
  left in place (no local world, so no cloud copy references them): module/zz-bundles-probe
  restored world-2026-10-12-024111-fvtt14.369-mac.tar.gz: world 18.9 MB; modules: 1 installed (0.3 MB), 44 unchanged, 0 removed, 1 left (zz-bundles-probe); systems: all 1 unchanged
```

The restore fetched exactly the one changed module. `zz-extra-file.txt` and the tamper are
gone. The compare against live is again clean: 10,016 identical, only `options.json`
`dataPath` and the `desktop.ini` junk. The probe was left in place, as plan §3.6 says for the
no-world case (Q3). The token is present again in the re-extracted world.

Taken together: a snapshot's manifest names exact bundle versions. Old versions stay in the
cloud while any snapshot names them, plus 7 days. A restore installs exactly the named version
over whatever is local, and fetches only what differs. Both scratch roots were then deleted.

## I. In-place dress rehearsal (Q6): S_final over the real data root

Two things were checked first. The upload queue was empty: no `*.job.json` and no
`pentaryn-replaced/`. A **local** copy of `Config/`, `Data/worlds/`, `pentaryn-boot.json` and
`pentaryn-bundle-cache.json` was taken (35 MB, `cp -a`) to
`~/pentaryn-restore-test/pre-I-local-copy/` as an extra net; it was never needed. Then, with
Foundry down, 03:01:44 → 03:02:51 UTC (67 s, exit 0):

```
$ echo restore | make foundry-restore SNAP=world-2026-10-12-024111-fvtt14.369-mac.tar.gz
  about to restore world-2026-10-12-024111-fvtt14.369-mac.tar.gz (mac) over /Users/joe/Library/Application Support/FoundryVTT
  downloading world-2026-10-12-024111-fvtt14.369-mac.tar.gz (18.9 MB, mac)...
  no change since the last snapshot — skipped
  cleared Data/worlds
  cleared Config
  kept this machine's options.json, admin.txt, license.json
  restored world-2026-10-12-024111-fvtt14.369-mac.tar.gz: world 18.9 MB; modules: all 45 unchanged; systems: all 1 unchanged
  restored world-2026-10-12-024111-fvtt14.369-mac.tar.gz (the state it replaced: world-2026-10-12-024111-fvtt14.369-mac.tar.gz)
```

- **0 bundles fetched:** there is no "downloading N bundle(s)" line, and modules and the system
  are all unchanged. The safety copy was correctly **not** needed: the tree was S_final, so
  "no change since the last snapshot — skipped". Nothing was uploaded.
- `diff -r` of the restored `Data/worlds` and `Config` against the pre-restore local copy:
  **identical**, file content of every file.
- `make foundry-bundles` after the restore is byte-identical to the one before stage G, so all
  46 module and system folders were untouched.
- Boot state: `based_on` = S_final, `by: restore:manual`. The recorded digest
  (`e10bf363…`) equals the digest of the tree as it now is, so the next backup's skip check is
  sound. It differs from the pre-restore digest (`a72b9ac0…`) only because the three kept Config
  files were rewritten with new mtimes.
- `make foundry-up FROM=local` → `▸ boot: local world (FROM=local)`, `✓ foundry up`. Then
  `make login WORLD=pentaryn NO_OPEN=1`, with the one-time link opened in the existing localhost
  tab (the only GM tab) → `✓ logged in as Gamemaster`.
- `get-world-info`: `pentaryn`, dnd5e 6.0.6, Foundry 14.369, 1 active user (Gamemaster).
- **ZZ acceptance journal present after the restore:** `list-journals journalId=ussRnQm9Ou73gPN3`
  → `<p>ZZTOKEN-359119f12520b076</p>`.
- `list-characters type=character` (read only): Caven Calderon (`IxcfWOvpcKID6bdn`), Marrith
  Ashcroft (`RNDTDBlFXxZ7Uc8i`) and Talo (`pfCQRWnqsQjkZQnB`) are present, along with their
  item piles. They are unchanged: the world folder is byte-identical to the pre-restore copy.
- Boot probe:
  - `pentaryn-read {ns:"*", path:"describe"}` lists all 10 blueprint namespaces at their
    on-disk `module.json` versions: attunement 0.2.1, cursors 0.2.0, dropbin 0.2.3, feedback
    0.1.1, importer 1.1.0, journal 0.1.0, movement 0.1.2, names 0.1.1, pings 0.1.1 (`ready:gm`),
    rules/pentaryn-lookup 0.3.0. All are kit 1.0.2 and published at `ready`.
  - A read-only `eval-js` over `game.modules` finds all 21 `pentaryn-*` modules at their on-disk
    versions. 20 are active. `pentaryn-walls` 0.2.0 is inactive, which is expected: it is off on
    Joe's instruction (`context/pentaryn.md`).
  - `game.pentaryn` has 24 keys. 45 modules are installed and 44 are active.
- Console: the buffer was cleared, then the tab reloaded. **0 errors** on load. Two warnings,
  both v13 deprecation notices from third-party modules (scene-packer `JournalSheet`,
  lib-wrapper `CompendiumCollection`); both were there before.

## J. Clean up, then the final confirmed snapshot — S_ok

- The ZZ acceptance journal was deleted through MCP (`eval-js`, guarded by id + name prefix):
  `{deleted: true, name: "ZZ bundles acceptance 20261012T023213Z", stillThere: false,
  zzJournalsLeft: []}`. The probe module was already gone (stage E). No ZZ document from this run
  remains.
- `make foundry-down` → `✓ foundry stopped`. `make foundry-bundles` after this second launch is
  again byte-identical to the one taken before stage G, so the fingerprints held across this
  launch too.
- `make foundry-backup REASON=acceptance-final`, blocking, 03:08:04 → 03:09:34 UTC (90 s, exit 0):

```
  uploading world-2026-10-12-030832-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-final) to onedrive:DnD/foundry...
  snapshot → world-2026-10-12-030832-fvtt14.369-mac.tar.gz (18.9 MB, acceptance-final)
  replaced world-2026-10-12-024111-fvtt14.369-mac.tar.gz (0.0 days old, inside the 5-day window)
  1 of 10 snapshots kept for mac
  swept 0 bundles (none unreferenced for 7 days)
```

**0 new bundles**: the upload line has no "with N new bundle(s)" clause, and `bundles/` stayed at 48.

### The snapshot Joe moves forward with

**S_ok = `world-2026-10-12-030832-fvtt14.369-mac.tar.gz`**

| | |
| --- | --- |
| World tar | 18,919,427 B (18.9 MB) in `onedrive:DnD/foundry/world-backups/` |
| Sidecar | `.parent` 4,104 B: `bundled: 1`, host `mac`, parent S_final; ancestors S_final → S_probe2 → S_probe1 → S_save → S_first → the old full `-mac` snapshot |
| Bundles it names | **46**: 45 modules + `system@dnd5e@6.0.6@b3a588b209538344.tar.gz` (3.32 GB in the cloud). The manifest is identical to S_final's, which stage G restored byte for byte |
| All 46 in the cloud | yes: every name is in `rclone lsf bundles/`; `make foundry-bundles` shows 46 local rows, all `yes`, 0 `no` |
| `make foundry-cloud` | `based on world-2026-10-12-030832-fvtt14.369-mac.tar.gz`; `snapshots mac: 1`; `bundles 48 in the cloud (3.32 GB); 2 unreferenced (0.0 MB, swept after 7 days); local: 45 modules + 1 system, all in the cloud` |
| Cloud hygiene | `world-backups/` = S_ok + sidecar only; 0 `.partial` anywhere under `onedrive:DnD/foundry`; no job queued, `.pentaryn-tmp/bundles/` empty, no `pentaryn-replaced/` |
| Not in it | `zz-bundles-probe`. The two probe bundles are the only unreferenced ones, and the first backup on or after 2026-10-19 sweeps them |
| Fallback | `pre-bundles-2026-10/` still holds the old 3.24 GB full snapshot (untouched since stage A) |

**S_ok restored from nothing (added check).** Foundry was still down after the backup. S_ok was
restored into a fresh scratch root, `~/pentaryn-restore-test/FoundryVTT-final`, the same way as
stage G: 03:09:59 → 03:17:43 UTC (7 min 43 s, exit 0). Output: `downloading 46 bundle(s)
(3.32 GB)`, `no local world to snapshot — skipped`, `restored …: world 18.9 MB; modules: 45
installed (3.21 GB) …; systems: 1 installed (108.4 MB)`.

Compared with the live tree that S_ok was taken from: 10,019 files identical, 3.63 GB compared.
`Data/worlds` is **byte-identical, every file, housekeeping included**. The only differences are
the expected two: `options.json` `dataPath`, and the `desktop.ini` junk in
`dnd-players-handbook`. Fresh fingerprints: 46 of 46 match the manifest. No probe module, no
extra folders. The scratch root was then deleted, along with the stage-I local copy and the
whole `~/pentaryn-restore-test/`.

## K. Left running

- `make foundry-up FROM=local` → `▸ boot: local world (FROM=local)`, `✓ foundry up`. Then
  `make login WORLD=pentaryn NO_OPEN=1` → `✓ logged in as Gamemaster`, in the existing localhost
  tab, which is the only GM tab.
- `get-world-info`: `pentaryn`, dnd5e 6.0.6, Foundry 14.369, 1 active user (Gamemaster).
  The ZZ journal is gone (0 `ZZ bundles…` journals). Caven, Marrith and Talo are present
  (read only). 20 `pentaryn-*` modules are active; walls is off on purpose. 0 console errors.
- `make vtt-status`: foundry UP, tunnel down. The updater was not touched.

## Verdict against Joe's bar

- **"Foundry saves out to it."** D: a GM edit made in the live world was in the cloud snapshot
  after `make foundry-backup` (token found inside the downloaded tar). It survived 4 further
  backups and came back out of a restore (G, I).
- **"Can restore from it."** It restores from nothing: S_final in G, and S_ok in J, each with
  46 bundles + the world, byte-identical to the live tree. It restores in place (I): 0 bundles
  fetched, world identical, Foundry boots clean. It restores differentially (H2): only the
  changed module was fetched.
- **"Doing the whole thing I designed it to do."** Each design point was checked in this run:
  - Per-module content-addressed bundles uploaded once (C: 46).
  - Only changed modules upload, and a version-less content change is caught (E).
  - Launches do not churn fingerprints (D, J).
  - The skip on no change (C′).
  - The manifest is in the sidecar and in the tar, and they agree (C–J).
  - Rolling copies coalesce (each stage).
  - Old bundle versions are kept and restorable (H1).
  - GC keeps referenced bundles and keeps unreferenced ones for 7 days (E, J).
  - `dnd5e` is a bundle (Q2).
  - The flat `bundles/` layout (Q1).
  - Extras: left in place with no local world (Q3, H2). The with-world removal path was not run
    live, by design: the house rules allowed no restore that would delete local modules.
  - The dress rehearsal (Q6, I).
- **Not proven live:** BOSS. The second host's first boot (plan §10 step 5) is still to come.
