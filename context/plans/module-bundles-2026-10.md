---
title: "Module bundles — the world snapshot shrinks to worlds+Config; modules and systems become content-addressed bundles"
status: built 2026-10-11 on feature/module-bundles, adversarial review fixed (§14 "Review fixes"); merge with main (§5) and go-live (§10) pending
last_modified: 2026-10-11
tags: [context, plans, foundry, cloud, rclone, backups, bundles]
---

# Module bundles — the world snapshot shrinks to worlds+Config; modules and systems become content-addressed bundles

**Read this when:** building, reviewing or merging the change that splits the ~3.3 GB world
snapshot into a ~45 MB world snapshot plus per-module (and per-system) bundles that are uploaded
once per content fingerprint and shared by both hosts. This is the design (history); the use-doc
is `context/foundry/ops.md` §3 once it ships. It builds on
[`rclone-two-hosts-2026-10.md`](rclone-two-hosts-2026-10.md) (storage layer, host tags, boot
choice, lineage) and must compose with the background-upload change built on
`feature/vtt-down-background-upload` (§5 — that branch lands on main first).

Joe's design (2026-10-11, his words): *"the backup is two parts, the maps, and the primary … the
maps can have a hash … if it did not change it doesn't make a new copy … rolling copies of both,
but because one rarely changes it mostly doesn't keep changing"* — then per-module granularity:
each module a content-addressed bundle, a manifest sidecar per world snapshot, restore only what
this machine lacks, prune bundles by reference. §1 is the review of that design against the code
and the real data; §3 is the design as built.

---

## 0. Facts verified on the Mac (2026-10-11, read-only)

These were measured, not assumed. The build must not re-derive them; the review must not
contradict them without re-measuring.

| Fact | Value | Consequence |
| --- | --- | --- |
| `Data/modules`: 46 module folders + Foundry's own `README.txt`; **no symlinks**; every folder has `module.json` | 8 349 files, 3.45 GB | Per-module bundling is clean; loose top-level files are ignored, never deleted |
| Sizes: `pentaryn-seafoot-maps` 1.98 GB (2 094 files), `eledryll-spiders-tear-opera-house` 319 MB, `dnd-monster-manual` 293 MB (2 080 files), `dnd-dungeon-masters-guide` 266 MB, `mad-endlesswiz` 106 MB, `eledryll-maps-castle-life-bundle-1` 106 MB, `dnd-players-handbook` 90 MB, `mad-endlesswiz2` 89 MB; everything else ≤ 20 MB, the 21 `pentaryn-*` modules ≤ 2 MB each | | Eight modules are 97 % of the bytes and almost never change; the rest churn and are tiny |
| `Data/worlds` 37 MB, `Config` 5.6 MB, `Data/systems/dnd5e` 6.0.6 ≈ 135 MB | | The world snapshot is ~45 MB; a system is a medium bundle |
| **Foundry rewrites LevelDB housekeeping in every module pack on every launch.** Each `packs/<name>/` holds `CURRENT` (16 B), `MANIFEST-nnnnnn` (new number each open), `LOG` / `LOG.old`, `LOCK` (0 B) and an empty write-ahead `nnnnnn.log` (new number each open). All of these carried today's launch time (17:35) in every pack of every module, including read-only premium ones; the `*.ldb` data files kept their August / 2026-10-10 mtimes | ~30 pack folders across the big modules | **A naive content hash changes for every pack-bearing module on every launch → every session would re-upload ~3 GB and the design would gain nothing.** The fingerprint must ignore LevelDB housekeeping (§3.4). The world's own `data/` LevelDB has the same churn, which is why today's digest-skip never fires after a launch; the world is 45 MB now, so that is left alone |
| A stat walk of `Data/modules` is 0.04 s warm; sha256 of 3.45 GB is ~5–15 s on this machine | | A per-module stat-signature cache makes the no-change case free; a changed module re-hashes only itself |
| The Mac's Python is 3.14.6 with zlib 1.2.12; BOSS (WSL Ubuntu) will have another zlib | | Two hosts tarring identical content are **not** guaranteed byte-identical bundles; nothing may depend on that (§3.5) |
| Cloud today: 10 untagged full snapshots (2.5–3.3 GB each) + `world-2026-10-11-212143-fvtt14.369-mac.tar.gz` (3.24 GB, full) + its `.parent` sidecar; `.last-digest` retired by that backup; the Mac's `pentaryn-boot.json` is based on it | ~33 GB | The first bundled Mac backup coalesces that mac snapshot (it is inside the 5-day window and is this tree's based-on), so the footprint drops at once; the untagged ones go by hand, later (§10) |
| `.pentaryn-tmp/` exists and is empty; 554 GB free on the Mac | | Local temp is not a constraint here; BOSS's is unknown (§10) |

---

## 1. Review of Joe's design — what is wrong, missing or risky

| # | Concern | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Fingerprint method | A plain content hash is defeated by Foundry itself (§0: LevelDB housekeeping rewritten every launch). path+size+mtime is worse: a module installed from the same manifest on BOSS has different mtimes, so identical content would get two bundles. Speed is not the problem (stat walk 0.04 s; hashing ~10 s once) | **Normalised content hash** with a per-module stat-signature cache (§3.4). Same bytes on both hosts ⇒ same fingerprint; a launch does not change it; a real pack edit does |
| 2 | Determinism of the tar | Cannot be guaranteed across hosts (zlib versions differ; mtimes differ). Joe's "same content gives the same bundle" is true of the **name**, not the bytes | The bundle **name** is the identity. Bytes are never compared across bundles. A same-name upload race is benign (either copy is a valid archive of the same content); the restore verifies a download against the listing it downloaded from and fails loudly on mismatch (§3.6, §6) |
| 3 | Cloud layout `module-bundles/<id>/<version>-<fp>.tar.gz` | Over rclone+OneDrive every `exists()` is one `lsjson` of one folder ≈ one process + one API call. Nested folders = ~50 calls per backup, per restore, per GC. Flat = **one** | **Flat** `bundles/<kind>@<id>@<version>@<fp>.tar.gz` (§3.2). Joe question Q1, default flat |
| 4 | "Each module folder is a bundle" | What is a module: a direct subfolder of `Data/modules` holding `module.json`. Symlinked folders (none today) would snapshot whatever they point at; hidden folders and `README.txt` are Foundry's; a folder without `module.json` is junk or a crash leftover; `module-sync` stages outside `Data/modules` (`FOUNDRY_DATA/.pentaryn-sync/`), so a half-copied module never appears; Foundry cannot be mid-install because backup and restore refuse while it runs | §3.3 rules: bundle real folders with a manifest file; **skip** symlinks, hidden folders, manifest-less folders and loose files with one warning line naming them; never delete what was skipped |
| 5 | `Data/systems` | Not in the snapshot today; mirrored per version to `system-backup/` and **never restored** by `restore`. A world migrated by dnd5e 6.1 on BOSS and restored on a Mac still on 6.0.6 is exactly the drift the two-host design worries about, and the mirror does not close it | **Systems become bundles** of the same kind (`system@dnd5e@6.0.6@<fp>`), in the manifest, restored when the fingerprint differs. `mirror_systems` is retired; `system-backup/` is left for Joe to delete by hand. The updater's rollback keeps using its local aside (§4.6). Joe question Q2, default yes |
| 6 | Manifest sidecar `<snapshot>.modules` | A second sidecar means a second write, a second delete path, a second read per snapshot for GC, and a second thing that can be missing. The `.parent` sidecar already exists, is written **before** the tar's rename, is copied on promotion and deleted on prune | **The manifest lives in the existing `.parent` sidecar** (`"bundled": 1, "modules": {…}, "systems": {…}`) and, authoritatively, as the **first member** of the world tar (`pentaryn-snapshot.json`). `read_lineage` ignores the new keys. One sidecar, one atomicity story (§3.2) |
| 7 | Order of operations / atomicity | A snapshot name must never appear before its bundles and manifest exist | Upload order: bundles → sidecar → world tar (`.partial` → rename) → **verify** the bundle listing once more → record state → coalesce/prune → GC (§3.5). A crash anywhere before the rename leaves only orphan bundles, which GC sweeps after the grace period |
| 8 | GC safety | Refcount by sidecar is right but incomplete: (a) a host mid-upload has bundles up and no snapshot yet; (b) a host offline for weeks still has a module locally whose bundle every retained snapshot stopped naming — when it comes back and reuses the name, the other host's GC may be sweeping it at that moment; (c) two hosts pruning/GC-ing concurrently; (d) a bundle a safety copy or a `major-release/` snapshot needs | Mark = every sidecar in `world-backups/` **and** `major-release/` (safety copies included) + this host's queued jobs. Sweep only when **unreferenced and older than 7 days** (grace covers a). The uploader **re-lists after the snapshot lands and re-uploads any referenced bundle that vanished** (closes b). Double deletes are no-ops (c). Any unreadable sidecar aborts that GC run (§3.7). Joe question Q4 |
| 9 | Restore: local modules not in the manifest | Today's full restore `rmtree`s `Data/modules`, so "the machine becomes the snapshot" is the existing contract. Leaving extras makes zombie modules that travel back in the next snapshot. But removing them must never lose a BOSS-only test module | **Remove**, after they are in the cloud: the pre-restore safety copy bundles and references them (or the unchanged tree's based-on snapshot already does). With **no local world** there is nothing to archive, so extras are left in place and listed (§3.6). Joe question Q3, default remove |
| 10 | Safety copy before restore | Must capture the local modules too | It is an ordinary bundled snapshot: its manifest references them (and uploads any bundle the cloud lacks). It costs 45 MB + changed modules, not 3 GB |
| 11 | Boot choice / lineage / coalescing / digest-skip | Names, stamps, mtimes, `.parent` lineage, coalescing, per-host prune and promotion all key on the **world snapshot name** and are untouched. The digest changes formula (world tree + manifest). The boot prompt's size column would read "45 MB" when BOSS must also fetch 3.4 GB of bundles | Unchanged algorithms. The prompt gains "+ N bundles (x GB) to fetch" from one sidecar read and one listing (§3.8). `adopt_legacy_marker` keeps the old digest formula (`legacy_snapshot_digest`) for the one case it exists for |
| 12 | `KEEP_LOCAL_CONFIG` | Unaffected: `Config/` stays in the world tar; the keep-and-rewrite-`dataPath` rule runs as today | Unchanged |
| 13 | Legacy full snapshots | Must stay restorable; the parser, listing, boot choice, lineage, coalescing and pruning must not change | Detection is by the sidecar (`"bundled"` absent ⇒ full) **cross-checked against the tar's first member** before anything local is touched (`pentaryn-snapshot.json` ⇒ bundled). A full tar restores exactly as today (clear worlds+Config+modules, extract). Nothing in the cloud is rewritten (§4) |
| 14 | Migrating the existing cloud | No rewrite. The 3.24 GB mac snapshot is coalesced away by the first bundled backup; the 10 untagged ones stay until Joe prunes them — **after** BOSS's first boot has proven the bundles (§10) | — |
| 15 | Disk for local temp | Backup stages the *missing* bundles' tars (first run 3.4 GB, later ≤ the changed modules) + the world tar; restore stages the *needed* bundles + the world tar | The existing 2× free-space check now counts (world estimate + staged/needed bundle bytes) (§3.5, §3.6) |
| 16 | Failure modes | Partial bundle upload; network drop mid-restore; a bundle missing from the cloud | `.partial` + rename for bundles too (storage.upload already does it); restore downloads **everything** before touching anything and dies naming the missing bundle(s) (§6) |
| 17 | Background-upload branch | Its build/upload split is the right seam: staging happens in the build half (Foundry stopped), uploads in the upload half; the job carries the manifest and the staged bundle names; the boot/in-flight logic needs nothing new | §5 gives the merge map; this branch keeps every bundle call behind named functions in a new `bundles.py` so the merge is re-inserting a handful of call sites |
| 18 | BOSS first boot | 45 MB + every bundle (~3.5 GB incl. the system) once; `tree_has_world()` is false so no safety copy; extras (none) left alone | The prompt shows the real download; disk check covers it; afterwards host switching is 45 MB + changed modules (§10) |
| 19 | Old code vs bundled snapshots | Old `extract_snapshot` clears `Data/modules` and extracts a tar that has none → an empty modules folder | Both hosts must run the merged code before the first bundled backup; rollback (§11) says what to do first |
| 20 | `module-sync` stamp | `.pentaryn-sync.json` carries `synced_at`, so every re-sync of an unchanged `pentaryn-*` module is a new ~1 MB bundle | Accepted (GC cleans it); not special-cased, so the fingerprint stays "what is on disk" |

Expected wins (unchanged from Joe's estimate, now with measured numbers): `vtt-down` upload
3.3 GB → ~45 MB + changed modules; host switch after the first time ~45 MB + changed modules;
cloud footprint ~33 GB per host → ~3.5 GB of bundles + ~0.5 GB of world snapshots per host.

---

## 2. Goals and non-goals

**Goals**

1. A world snapshot is `Data/worlds` + `Config` (~45 MB), named and handled exactly as today.
2. Every module under `Data/modules` and every system under `Data/systems` is a bundle in the
   cloud, named by kind, id, version and a content fingerprint, uploaded only when that name is
   absent, shared by both hosts.
3. Each world snapshot records which bundle each module/system was at (the manifest), in its
   sidecar and inside the tar.
4. Restore = world tar + only the bundles this machine lacks; modules already at the right
   fingerprint are not touched.
5. Bundles are deleted only by a mark-and-sweep that never deletes what any retained snapshot,
   safety copy, preserved generation or queued upload references, and never anything younger
   than the grace period.
6. Every existing snapshot stays restorable; listing, boot choice, lineage, coalescing, pruning,
   promotion and the updater's rollback keep working.

**Non-goals**

- Deduplicating inside the world snapshot (its LevelDB churns every launch; 45 MB is fine).
- Byte-identical bundles across hosts (§1 #2).
- A cross-host lock (rejected in the two-hosts design; the grace period + post-upload verify
  cover the races here).
- Rewriting or converting the legacy full snapshots.
- Assets (`assets/` zips) — a separate, append-only pipeline.

---

## 3. The design as built

### 3.1 Shape of the change

```
scripts/foundry/
  bundles.py       NEW   kinds and roots, fingerprint (+ cache), bundle names, local inventory,
                         manifest, build/extract a bundle tar, cloud listing/upload/fetch, GC
  cloud.py         MOD   WORLD_PATHS; manifest in the sidecar and the tar; upload order; verify;
                         digest = world tree + manifest; fetch_snapshot/apply_snapshot;
                         bundled vs full restore; status/bundles/bundles-gc commands;
                         mirror_systems retired
  storage.py       MOD   SUBFOLDERS gains "bundles"
  boot.py          MOD   the prompt shows what a restore would download
  update/recover.py MOD  _restore_world_tar → fetch_snapshot/apply_snapshot (systems=False)
Makefile           MOD   foundry-bundles, foundry-bundles-gc; help lines
scripts/tests/test_bundles.py, test_bundles_cloud.py   NEW;  test_cloud_snapshots.py etc. extended
context/foundry/ops.md §3, scripts/foundry/README.md, cloud.py docstring + README_TEXT  docs
```

`bundles.py` imports `storage` and `host` only — never `cloud` — so `cloud` can import it.

### 3.2 Cloud layout and names

```
OneDrive/DnD/foundry/
  world-backups/   world-<stamp>-fvtt<ver>-<host>[.safety].tar.gz    unchanged names; from go-live on
                                                                      these hold Data/worlds + Config only,
                                                                      first member pentaryn-snapshot.json
                   <name>.parent                                      the sidecar: lineage + manifest
  major-release/   same
  bundles/         FLAT, shared by both hosts, content-addressed:
                   module@<id>@<version>@<fp>.tar.gz
                   system@<id>@<version>@<fp>.tar.gz
                   *.partial                                          an upload in progress
  system-backup/   legacy (no longer written); assets/ unchanged
```

**Bundle name:** `BUNDLE_NAME = ^(module|system)@([^@/]+)@([^@/]*)@([0-9a-f]{16})\.tar\.gz$`.
`id` is the folder name (what Foundry loads; `module.json`'s `id` is checked and a mismatch is
warned about, never used). `version` is `module.json` / `system.json` `version` with anything
outside `[A-Za-z0-9.+_-]` replaced by `-`, `0` when absent. A folder name containing `@` is
refused with a warning (Foundry would not load it either). `fp` is the first 16 hex of the
fingerprint. The tar's members are `<id>/…`.

**Sidecar** (`<snapshot>.parent`, written before the tar's rename, as today):

```json
{"parent": "...", "ancestors": [...], "ancestor_mtimes": [...], "origin_before": 1760.0, "host": "mac",
 "bundled": 1,
 "modules": {"dnd-monster-manual": "module@dnd-monster-manual@3.2.1@0123456789abcdef.tar.gz", "...": "..."},
 "systems": {"dnd5e": "system@dnd5e@6.0.6@89abcdef01234567.tar.gz"}}
```

`read_lineage` reads only `ancestors` / `ancestor_mtimes` / `origin_before` and is untouched.
`cloud.read_manifest(st, snap) -> Manifest | None` reads the same text; `None` means "full
snapshot" (no sidecar, or a sidecar without `"bundled"`). `major-release/` promotion copies the
sidecar text as it does today, so the manifest travels with a preserved generation.

**First tar member** `pentaryn-snapshot.json` = the same `{"bundled": 1, "modules": …,
"systems": …, "host": …, "core": …}`; it is the authoritative copy (the sidecar can be lost; the
tar cannot be restored without being read). `apply_snapshot` never extracts it to the data root.

### 3.3 What counts as a module (or system)

`bundles.local_inventory() -> dict[str, Local]` keyed `"<kind>/<id>"`, walking
`ROOTS = {"module": "Data/modules", "system": "Data/systems"}` under `FOUNDRY_DATA`:

- **bundled:** a direct subfolder (not a symlink) whose name has no `@` and which contains
  `module.json` (modules) / `system.json` (systems);
- **skipped, with one warning line per backup naming them:** symlinked folders, hidden folders
  (`.`-prefixed), folders without the manifest file, a manifest that is not JSON (bundled under
  version `0`, warned), an `id` inside the manifest that differs from the folder name (bundled
  under the folder name, warned);
- **ignored silently:** loose files directly under the root (`README.txt` is Foundry's), junk
  names (`storage.JUNK_NAMES`), AppleDouble `._*` files, symlinks inside a module.

Restore (§3.6) never deletes anything it would have skipped.

### 3.4 Fingerprint

`bundles.fingerprint(root: Path) -> Fingerprint(fp: str, files: int, bytes: int)`:

1. `files = _walk(root)`: every regular file under `root` (no symlinks followed), as
   `(relpath_posix, path, size, mtime_ns)`, sorted by `relpath`, **excluding** junk names and
   `._*`, and — inside any directory that contains a file named `CURRENT` (a LevelDB) — the
   housekeeping files `LOCK`, `LOG`, `LOG.old`, `CURRENT`, `MANIFEST-*`, and any `*.log` of
   **size 0**. A non-empty `*.log` is a write-ahead log holding real data and is included.
2. `h = sha256()`; for each file: `h.update(relpath + "\0" + str(size) + "\0")`, then the bytes
   streamed in 1 MiB chunks, then `"\0"`. `fp = h.hexdigest()[:16]`.
3. The **bundle tar** contains everything `_walk` would list **plus** the LevelDB housekeeping
   files (Foundry needs `CURRENT` → `MANIFEST` to open the pack; a stale `LOCK` file is harmless
   — LevelDB locks with `flock`, not by the file's presence). So: two bundles with the same
   fingerprint may differ in housekeeping bytes, and both open to the same data.

Why this is sound: `.ldb` files are immutable once written and only change number through a
write or a compaction; `MANIFEST-nnnnnn` / `CURRENT` / the empty WAL are rewritten on every open
and describe the same `.ldb` set when nothing was written. After an edit to an unlocked pack
(seafoot) the WAL is non-empty until the next launch recovers it into a new `.ldb`, so one edit
costs two bundles of that module; accepted.

**Cache** `FOUNDRY_DATA/pentaryn-bundle-cache.json` (beside `pentaryn-boot.json`, outside every
snapshot path; written atomically via `.tmp` + `os.replace`):

```json
{"schema": 1, "entries": {"module/dnd-monster-manual": {"sig": "<sha256 of the sorted (relpath, size, mtime_ns) list>",
                                                       "fp": "0123456789abcdef", "version": "3.2.1", "files": 2080, "bytes": 293000000}}}
```

`local_inventory(cache=True)` computes `sig` from the stat walk (same filtered file set); on a
match it reuses `fp` without reading a byte, otherwise it hashes that module and updates the
entry. Deleting the cache changes nothing but time. `apply_snapshot` may seed the entry for a
module it just extracted (it knows the fingerprint), so BOSS's first backup after its first boot
does not re-hash 3.4 GB.

### 3.5 Backup

`_backup(st, reason, *, safety, protect)` keeps its signature and its skip rules; the body becomes:

1. `inv = bundles.local_inventory()`; `manifest = bundles.manifest(inv)` (`{"modules": {id:
   name}, "systems": {id: name}}`); `digest = snapshot_digest(manifest)` =
   `sha256(world_tree_digest() + "\n" + json.dumps(manifest, sort_keys=True))` where
   `world_tree_digest()` is today's path/size/int-mtime hash over `WORLD_PATHS =
   ["Data/worlds", "Config"]`. (`legacy_snapshot_digest()` keeps today's formula over
   `SNAPSHOT_PATHS` for `adopt_legacy_marker` only.)
2. `existing = snapshots(st)`; `have = bundles.listing(st)` (one `ls("bundles")`).
3. **Digest-skip, as today**, with one addition: when the tree is unchanged and `based_on` is
   still in the cloud but some bundle the manifest names is **not** in `have` (deleted by hand),
   upload just those bundles ("healing") and still skip the snapshot.
4. `missing = [inv entries whose name ∉ have]`. Disk check: free ≥ 2 × (size of this host's
   newest world snapshot, or 64 MB when none, + Σ `bytes` of `missing`), else `die` with the
   numbers.
5. Name the snapshot (as today). **Stage**: for each `missing`, `bundles.build(local,
   tmp/bundles/)` → `<name>.building` then rename; then the world tar `tmp/<snapshot>` with
   `pentaryn-snapshot.json` as its first member, then `Data/worlds`, `Config` (members sorted
   as today's `tar.add`).
6. **Upload, in this order:** each staged bundle (`st.upload` → `.partial` → rename; a name that
   appeared meanwhile is simply overwritten — same content; the staged tar's mtime set to now
   first); the cloud mtime of every **reused** bundle older than half the grace is refreshed
   (`storage.touch`, skipping what this host's own still-listed based-on names); a first
   verify (below) before anything names them; the sidecar (lineage + manifest); the world tar.
   Then **verify** (always over a fresh listing — over rclone a cached one sees nothing): `bundles.listing(st)` again; any manifest name absent → upload
   it again from the staged tar (still on disk), or if it was never staged (it existed in step 2
   and vanished since) re-fingerprint the live folder and stage+upload it if the fingerprint
   still matches, else `die` naming the module (the snapshot is incomplete).
7. Record the state (`record_snapshot` with the new digest), delete the staged tars, retire the
   legacy marker (as today), coalesce, prune (as today), then `bundles.gc(st,
   referenced=cloud.referenced_bundles(st))` (§3.7). `mirror_systems` is gone.

A failed upload dies as today, naming the tar(s) left in `.pentaryn-tmp/`; orphan bundles that
did land are swept by GC after the grace period. The `--if-stopped` warning path is unchanged.

### 3.6 Restore

```python
@dataclass
class Fetched:                 # everything a restore needs, on local disk, verified
    snap: Snapshot | None      # None for a local tar path (the updater)
    tar: Path
    manifest: Manifest | None  # None → full (legacy) snapshot
    bundle_tars: dict[str, Path]   # bundle name → downloaded tar, for every `needed` entry
    needed: dict[str, str]     # "<kind>/<id>" → bundle name to install
    extras: list[str]          # "<kind>/<id>" present locally, absent from the manifest
    unchanged: list[str]       # present locally at the manifest's fingerprint

def fetch_snapshot(st, snap) -> Fetched      # downloads and verifies; touches nothing local
def apply_snapshot(f: Fetched, *, systems: bool = True) -> None   # clears/extracts/swaps
```

`restore_snapshot(st, snap, reason)` = `fetch_snapshot` → safety `_backup(safety=True,
protect=snap)` (as today) → `apply_snapshot` → record state (as today, with the new digest).

**`fetch_snapshot`:**

1. `manifest = read_manifest(st, snap)`; `inv = local_inventory()`;
   `needed = {k: name for k, name in manifest if inv.get(k).name != name}`;
   `extras = [k for k in inv if k not in manifest]`; `unchanged = the rest`.
2. `have = bundles.listing(st)`; `missing = [n for n in needed.values() if n ∉ have]` →
   `die("cannot restore <snap> completely — missing from the cloud: <names> — nothing local was
   touched")`.
3. Disk check: free ≥ 2 × (`snap.size` + Σ listed sizes of `needed`).
4. Download the world tar (size-verified, as today). Open it and read the **first member only**:
   `pentaryn-snapshot.json` present ⇔ `manifest is not None`, and its `modules`/`systems`
   must equal the sidecar's, else `die("sidecar and snapshot disagree")`. A full tar whose
   first member is `pentaryn-snapshot.json`, or a bundled tar without it, is refused the same way.
5. Download each `needed` bundle to `tmp/bundles/`, size-verified against the listing it came
   from (a mismatch dies before anything local is touched; the cause is a same-name re-upload
   racing the download — rerun).

**`apply_snapshot`:**

- **Full** (`manifest is None`): exactly today's `extract_snapshot`: keep `KEEP_LOCAL_CONFIG`,
  clear `SNAPSHOT_PATHS` (worlds, Config, modules), `extractall(filter="data")`, put the kept
  files back, `_fix_foreign_data_path`.
- **Bundled**: keep `KEEP_LOCAL_CONFIG`; clear `WORLD_PATHS` only; extract every member except
  `pentaryn-snapshot.json`; put the kept files back; `_fix_foreign_data_path`. Then for each
  `needed`: `bundles.extract(tar, kind, id)` extracts to `tmp/extract/<id>` (`filter="data"`;
  every member's first path component must be `<id>`, else refuse), `rmtree(root/<id>)` if
  present, `os.rename` into place (same filesystem: `.pentaryn-tmp` is under `FOUNDRY_DATA`).
  `unchanged` entries are not touched. `extras` are **removed** (`rmtree`) — unless the restore
  found no local world (`tree_has_world()` was false before the clear): then they are left and
  listed, because nothing in the cloud references them. With `systems=False` (the updater) the
  `system/*` entries of `needed` and `extras` are ignored.
- One summary line: `restored <name>: world 45 MB; modules: 3 installed (1.2 GB), 42 unchanged,
  1 removed; systems: unchanged`.

The order (download everything → safety copy → clear → extract → swap) keeps the two-hosts
guarantees: nothing local changes until every byte is on this disk, and the safety copy's
manifest references every local module before any is removed. Mid-extract failure dies naming
the safety copy, as today.

`cloud.restore(which=None)` (the listing) marks each snapshot `full` or `bundled` in a column.

### 3.7 GC — mark and sweep

`bundles.gc(st, *, referenced: set[str], grace=GC_GRACE_SECONDS (7 days), dry_run=False, now=None)
-> list[str]`:

- `have = listing(st)`; a candidate is a listed name that parses as a bundle, is not in
  `referenced`, and whose listing mtime is older than `grace`.
- Delete each candidate (`st.delete`; a missing file is not an error). Log `swept N bundles
  (x GB) no retained snapshot references`.

`cloud.referenced_bundles(st) -> set[str]` = the union of the manifests of **every tagged
snapshot in `world-backups/` and `major-release/`** (regular, `.safety`, all hosts; untagged
ones have no sidecar and reference nothing) **plus** the manifests of this host's queued upload
jobs (§5; empty on this branch). A sidecar that cannot be read (`StorageError`) **aborts the GC
run** with a warning — never "assume unreferenced". A sidecar without `"bundled"` is a full
snapshot and references nothing. *(Review fix DL4, §14:)* a tagged snapshot whose sidecar is
**missing, empty or torn** is marked from its tar's first member (`SNAPSHOT_MARKER`, read from
the first 256 KiB with `storage.read_head`), and one whose tar head cannot answer either aborts
the run. The listings are fresh (`storage.refresh`). *(DL2:)* `bundles.gc(recheck=…)` re-marks
right before the first delete — both folders listed again, only the sidecars of snapshots that
landed during the mark read — and keeps what they name; together with the uploader's mtime
refresh of old reused bundles (§3.5 step 6) this closes the cross-host mark/sweep race to a
window of seconds (§6).

When it runs: at the end of every `_backup` that uploaded (not on a skip), on either host; and
`make foundry-bundles-gc` (dry run by default, `YES=1` deletes). Cost: one `ls` + one sidecar
read per tagged snapshot (~25 × ~1 s over rclone).

Races, and why each is safe: see §1 #8 and §6.

### 3.8 Boot choice and status

`boot.decide` is unchanged. `boot._prompt` adds, after the `cloud` line, `  + 3 bundles (1.2 GB)
to fetch` / `  + all 47 bundles (3.5 GB) to fetch` / `  (every bundle is already on this
machine)` from `cloud.restore_cost(st, snap)` (one sidecar read, one listing, the local
inventory); any failure there shows nothing extra. The non-interactive notice line is unchanged.

`cloud status` (`make foundry-cloud`) adds: `bundles      47 in the cloud (3.5 GB); 2
unreferenced (0.3 GB, swept after 7 days); local: 46 modules + 1 system, all in the cloud` (or
`N not yet uploaded`). `cloud bundles` (`make foundry-bundles`) lists every local module/system
with its fingerprint, size and whether its bundle is in the cloud, then the cloud bundles nobody
references.

---

## 4. Compatibility

| Area | Behaviour |
| --- | --- |
| Snapshot names, parser, `Snapshot`, `snapshots()`, `newest`, `own`, `by_mtime` | Unchanged |
| Untagged legacy snapshots (10) | Full; restorable by the full path; listed, offered by the boot choice, never pruned, `prune-untagged` unchanged |
| `world-2026-10-11-212143-fvtt14.369-mac.tar.gz` (full, with a sidecar lacking `"bundled"`) | Full; restorable; the first bundled Mac backup coalesces it (inside 5 days, it is the tree's based-on) |
| `.safety` copies from the full era | Full; restorable; pruned at 3 per host as today |
| Lineage (`.parent`), `descends`, `next_lineage`, `LINEAGE_CAP` | Unchanged; the sidecar gains keys they ignore |
| Coalescing, per-host prune, `KEEP_SAFETY_COPIES`, promotion to `major-release/` | Unchanged; GC runs after them; promotion's sidecar copy carries the manifest |
| Digest-skip | New formula (world tree + manifest); `adopt_legacy_marker` compares the legacy marker with `legacy_snapshot_digest()` |
| `KEEP_LOCAL_CONFIG`, `_fix_foreign_data_path` | Unchanged (Config is in the world tar) |
| `tree_has_world`, `local_tree_mtime` | Unchanged |
| `unpack_assets`, `assets/` | Untouched |
| `system-backup/`, `mirror_systems`, `KEEP_SYSTEM_MIRRORS` | Retired: nothing writes or prunes there; the folder and its tars stay until Joe deletes them; `restore` no longer prints the "systems are NOT part of this snapshot" note |
| Updater: `apply.back_up` | Same `cloud backup --reason auto-update`; now uploads 45 MB + the modules the update changed (well inside its 900 s) |
| Updater: `recover.newest_world_snapshot` | Unchanged |
| Updater: `recover._restore_world_tar(snap)` | `fetch_snapshot` + `apply_snapshot(systems=False)` + record; the system comes back from `.state/system-aside/` as today. A local `Path` argument is applied as a full tar, or as a bundled tar whose `needed` must be empty (else it raises naming what is missing) |
| `make foundry-<m>-sync`, `.pentaryn-sync.json` | Untouched; a re-sync yields a new small bundle |
| `storage.SUBFOLDERS` | + `"bundles"`; `ensure_cloud` sweeps stale `.partial` there too; `README_TEXT` describes it |
| Old code (either host not yet on the merged main) | Must not restore a bundled snapshot (it would clear `Data/modules`). Go-live (§10) orders the pulls before the first bundled backup |

---

## 5. Composing with `feature/vtt-down-background-upload` (on main since `938c36d4`)

That change splits `_backup` into `_build` (digest skip, name, disk check, tar → `uploadq.Job`)
and `_upload_job` (promotion, sidecar, upload, record, coalesce, prune, `mirror_systems`), with
`uploadq.py` (jobs, two `flock`s, status), `_run_job`, `_drain`, `upload_pending`;
`restore_snapshot` becomes `_exclusive()` + `_drain()` + `_restore_locked()`; `boot` keeps local
while an upload is in flight. The branch is merged and deleted, so read it as
`git diff bb74bf6b 938c36d4` (the merge base of this branch is `bb74bf6b`).

**This branch is built against `bb74bf6b`.** The follow-up workflow merges main into
`feature/module-bundles` (in its worktree only) using this map; the bundle logic lives in
`bundles.py` and in named `cloud.py` helpers, so the merge is re-inserting calls. The review
(§14 "Review fixes") found that a mechanical merge gets several design points wrong that the
suite would not catch; they are rows here, marked **(R)**.

| Site on this branch (§3.5 step) | Where it goes in the background-upload code | Notes |
| --- | --- | --- |
| 1–2 inventory, manifest, digest, listings | top of `_build` (after `sweep_building`, before the digest skip) | `Job` gains `manifest: dict \| None` and `bundles: list[str]` (the staged names). Both listings **fresh** (`snapshots(…, fresh=True)`, `bundles.listing(…, fresh=True)`) **(R)** |
| 3 healing of hand-deleted bundles | the digest-skip branch of `_build` | **(R)** `_heal_bundles` uploads synchronously, so a background `vtt-down` would block for the lost bundle's size (seafoot 1.9 GB). Queue it instead: a heal-only `Job` (`manifest` = the based-on's, no world tar, `bundles` = the lost names) that the uploader runs like any other, or run `_heal_bundles` from `_upload_job`'s start for the next job. Not in the build half |
| 4 disk check | `_build` | `_check_backup_disk` replaces main's inline check (this branch's own-regular-snapshot estimate + Σ `missing`) |
| 5 staging | `_build`, before the world tar | **(R, M1)** stage **per job**: `tmp/bundles/<job name>/<bundle>` — never the shared `tmp/bundles/<bundle>`. Two queued jobs can stage the same name (job 2 built while job 1 still queued, so the cloud still lacks it), and job 1's `drop()` would delete the tar job 2 still needs. `.building` per bundle; `Job.save()` last. `upload_missing(…, rebuild=_rebuilder(rebuilt))` already turns a vanished staged tar into a rebuild or a `StorageError` (never `FileNotFoundError`, which escapes `_run_job`/`_drain`/`upload_pending` and leaves the job stuck holding the session's world) |
| 6 upload order + verify | `_upload_job`: bundles (`upload_missing`, which sets each staged tar's mtime to now — **(R, M2)** a job may wait days); `_refresh_reused` (touch old reused bundles); `_verify_bundles` (first look); the sidecar `write_text`; the world tar; `_verify_bundles` again | **(R)** the second verify runs on **both** paths — after `st.upload` *and* when `there is not None and there.size == size` skips the upload (a re-run after a crash). Every verify lists `bundles/` fresh, never the build-time `have` **(R)**. `have` for the upload half is a fresh listing taken at the start of `_upload_job`, not the one `_build` used |
| 6 verify failure | `_upload_job` / `_run_job` | **(R)** Any `_Incomplete`, from **either** verify, is permanent and ends that job — never `die()`. Here `_backup` turns it into `die()` (`SystemExit`); in the uploader that is a stuck queue: `_run_job` re-raises `SystemExit`, `_drain` catches only `StorageError`, `upload_pending` returns 1 with "that job and the rest stay queued", so the job is retried forever, every later `vtt-down` job queues behind it, `in_flight()` stays set (boot keeps local for good) and cloud backups stop with only a status line. How it happens: the job reuses bundle X (often after a host switch, from the other host's snapshot), the other host coalesces that snapshot and its GC sweeps X (past the grace) while the job sits queued, and meanwhile `foundry-<m>-sync` changed the live folder, so `_rebuilder` returns None. What the merged code does: (1) **verify-1** (before the sidecar) publishes nothing — bundles already uploaded are orphans the GC sweeps; (2) **verify-2** (after the world tar, or on the skip-the-world re-run) first removes the snapshot and its sidecar, as here; then for both: `_run_job` catches `_Incomplete` itself (not via `SystemExit`), writes `state=failed` with the reason ("`<kind> <id>`: its bundle vanished and the folder changed — job dropped"), logs an ops `dropped` event, moves the world tar out of the queue to `tmp/incomplete/<name>` (only the newest is kept; the next job's status overwrites `state=failed`, so `_upload_lines()` in `status()` names `tmp/incomplete/<name>` for as long as it exists), `job.drop()`s the job file and its staging folder, and **returns** so `_drain` / `upload_pending` go on to the next job. Never leave it queued, never retry it: the later jobs already hold a newer state of the same world, and with none queued the next backup uploads the tree (the dropped job's digest was never recorded). `_rebuilder` must build into the **job's own** staging folder `tmp/bundles/<job>/` (M1), so `job.drop()` removes the rebuilt tars too |
| 7 record / GC | `_upload_job`, after prune | `_gc_after_backup` (mark + `recheck`). `referenced_bundles`/`_mark` add the manifests of `uploadq.pending()` jobs (this host's GC only — the other host never sees them; M2's fresh mtime + `_refresh_reused` are what protect a queued job's bundles from the other host) |
| — | `_upload_job`'s tail | **(R)** delete `mirror_systems(st)` (and `mirror_systems` itself, `KEEP_SYSTEM_MIRRORS`): systems are bundles |
| **(R)** jobs queued by pre-merge code | `uploadq.pending()` → `Job(**known)` gives `manifest=None` | such a job's tar is **full** (worlds+Config+modules). The upload half must treat `manifest is None` as full: lineage-only sidecar (no `"bundled"`), no bundle uploads, no verify, no reused-bundle refresh. Otherwise it crash-loops or publishes a "bundled" sidecar over a full tar. §10 step 0 also requires an empty queue |
| `job.drop()` | removes the job file, the world tar **and the job's staging folder** `tmp/bundles/<job>/` | only its own folder (M1) |
| **(R)** `uploadq.sweep_building()` | globs only the top of `.pentaryn-tmp` | also sweep `tmp/bundles/**/*.building` (a killed build leaves them), and a `tmp/bundles/<job>/` whose job file is gone |
| `restore_snapshot` | the body is `_restore_locked`; `_drain` before it already protects `snap` | `fetch_snapshot` inside the locks, after the drain (it replaces main's inline download + size check); `_restore_locked` catches `RestoreError` from `fetch_snapshot` and from `apply_snapshot`'s pre-check ("refused", not "failed part-way"); it records `snapshot_digest(f.manifest)` for a bundled snapshot (review DL5/R1), not `snapshot_digest()`; **(R)** delete its trailing "systems are NOT part of this snapshot" note |
| `status()` | `_upload_lines()` first, then the bundle line | |
| `main()` | both add subcommands | keep both |
| `test_cloud_snapshots.py` | both append tests at the end | keep both |
| `test_cloud_background_upload.py` (main) | builds full tars today | its tests must pass against bundled jobs; add: two queued jobs staging the same bundle (drop job 1, job 2 still uploads), a pre-merge `manifest=None` job uploads as full, the skip-the-world re-run still verifies, a job built 8 days before it runs lands bundles with a fresh mtime, and a job whose reused bundle was swept while queued and whose folder changed since — once at verify-1, once at verify-2 — is dropped with `state=failed` while the job queued behind it uploads, `upload_pending` returns 0, `in_flight()` is clear and `status()` names the kept tar |
| `ops.md` §3, `rclone-two-hosts` §14 | both add paragraphs | keep both |

Expected conflict hunks: `cloud.py` docstring, `_backup`/`_build`/`_upload_job`,
`restore_snapshot`/`_restore_locked`, `status`, `main`; `test_cloud_snapshots.py` tail; `ops.md`
§3; `Makefile` help. After the merge the whole suite (`scripts/tests`) must pass and `make -n
vtt-up`, `make -n vtt-down WAIT=1`, `make -n foundry-bundles-gc` must show the expected commands.

---

## 6. Failure modes

| Failure | Behaviour |
| --- | --- |
| Bundle upload interrupted | Only `<name>.partial` exists; `ls` hides it; swept after 24 h by `ensure_cloud`; the snapshot name never appeared; the next backup stages and uploads it again |
| Crash after the bundles, before the world tar | Orphan bundles; swept after the grace period; the next backup finds them listed and skips re-uploading |
| World tar upload fails | Dies as today, naming the tars left on disk; state not recorded; bundles already up are reused next time |
| A referenced bundle vanished between listing and the snapshot landing (other host's GC) | The verify — before the sidecar and again after the world tar, over a **fresh** listing — re-uploads it (staged tar, or rebuilt from the live folder); if the local folder changed meanwhile the backup dies naming the module (after the world tar: the new snapshot is removed again). In the background uploader (after the §5 merge) that job is dropped and named instead, never left queued (§5 row "6 verify failure") |
| The other host's GC marks while this host's whole backup reuses an old unreferenced bundle (review DL2) | This backup touched it (cloud mtime → now) before its sidecar, so a sweep listing taken after that skips it; the GC's re-mark just before deleting reads the new sidecar and keeps it. Left open: this host's sidecar landing between that re-mark and the delete *and* its post-upload verify finishing before the delete — seconds; the next backup's healing (unchanged tree) or upload (changed tree) puts the bundle back from the still-local folder |
| Restore: a needed bundle missing from the cloud | Dies before any download beyond the listing; nothing local touched; names the bundle(s) and the module(s) |
| Restore: network drop mid-download | `StorageError` → die; nothing local touched; temp files removed |
| Restore: a bundle's size differs from the listing | Die; nothing local touched (a same-name re-upload raced the download; rerun) |
| Restore: sidecar says bundled, tar's first member says otherwise (or the reverse) | Die before touching anything: "sidecar and snapshot disagree" |
| Restore: extract of a bundle fails mid-way | Die naming the safety copy and the `foundry-restore SNAP=` that puts it back (as today); the world is already extracted; the failed module folder is absent or partial — the message names it |
| Restore: a downloaded bundle (or world tar) is corrupt but the right size (review R2) | Read end to end (`bundles.read_all`: gzip CRC, every member) and member-checked in `fetch_snapshot`; refuses, nothing local touched, names the bundle and how to heal it |
| Restore: the folder a needed bundle replaces is a symlink (review DL6a) | Refused in `fetch_snapshot`'s plan (before any download or safety copy) and again in `apply_snapshot` before the clear; names the link and its target |
| Restore: the folder a needed bundle replaces has no `module.json` (review DL6b) | Moved whole to `FOUNDRY_DATA/pentaryn-replaced/<UTC stamp>/<relpath>` and named; never deleted |
| Restore: not enough disk | Die with the numbers before downloading |
| GC: a sidecar unreadable | That GC run does nothing, warns |
| GC: a tagged snapshot's sidecar is missing, empty or torn (review DL3/DL4) | Marked from the tar's own marker (`read_head`, 256 KiB); a tar head that cannot answer aborts the run |
| Promotion: the sidecar copy to `major-release/` fails (review DL3) | Written before the tar, tried twice, a stderr warning; the preserved copy stays marked via its marker and restorable via `fetch_snapshot`'s marker path; every later backup copies the sidecar again while its source is still in the rolling window |
| GC on A while B restores a snapshot A is pruning | B's world download fails (as today) — nothing touched |
| Two hosts upload the same new bundle name at once | The later `moveto` overwrites with an equivalent archive; both snapshots are valid |
| Cloud unreachable at `vtt-up` | `backup --if-stopped` warns and exits 0 as today (the inventory is local; the listing is what fails) |
| Old code on one host | Must not restore a bundled snapshot (§4, §11) |

---

## 7. Code shape

`scripts/foundry/bundles.py`

```python
BUNDLES = "bundles"
ROOTS = {"module": "Data/modules", "system": "Data/systems"}
MANIFEST_FILE = {"module": "module.json", "system": "system.json"}
FP_LEN = 16
GC_GRACE_SECONDS = 7 * 86400
CACHE_FILENAME = "pentaryn-bundle-cache.json"
STAGING = "bundles"                      # under .pentaryn-tmp/
EXTRACT = "extract"                      # under .pentaryn-tmp/
LEVELDB_MARKER = "CURRENT"
LEVELDB_HOUSEKEEPING = {"LOCK", "LOG", "LOG.old", "CURRENT"}      # + MANIFEST-* + empty *.log
BUNDLE_NAME = re.compile(r"^(module|system)@([^@/]+)@([^@/]*)@([0-9a-f]{16})\.tar\.gz$")

@dataclass(frozen=True) class Ref: kind, id, version, fp;  name -> str;  key -> "<kind>/<id>"
@dataclass(frozen=True) class Local(Ref): path: Path, files: int, bytes: int
@dataclass(frozen=True) class Fingerprint: fp, files, bytes
def bundle_name(kind, id, version, fp) -> str;  def parse_bundle(name) -> Ref | None
def sanitize_version(raw) -> str
def _walk(root) -> list[tuple[str, Path, int, int]]          # the filtered file set (§3.4)
def fingerprint(root) -> Fingerprint                         # pure; no cache
def local_inventory(*, cache=True, warn=log) -> dict[str, Local]
def manifest(inv) -> dict                                    # {"modules": {...}, "systems": {...}}
def manifest_names(m) -> set[str];  def manifest_keys(m) -> dict[str, str]   # "<kind>/<id>" → name
def build(local, dest_dir) -> Path                           # .building → rename; sorted members; housekeeping included
def extract(tar, kind, id, data_root) -> None                # to tmp/extract/<id>, verify <id>/ prefix, swap into place
def listing(st) -> dict[str, Entry];  def upload_missing(st, staged: dict[str, Path], have) -> list[str]
def fetch(st, names, dest_dir, have) -> dict[str, Path]      # size-verified; StorageError names the missing
def gc(st, *, referenced, grace=GC_GRACE_SECONDS, dry_run=False, now=None) -> list[str]
```

`scripts/foundry/cloud.py` — new or changed:

```python
WORLD_PATHS = ["Data/worlds", "Config"]        # SNAPSHOT_PATHS stays, for full (legacy) restores
SNAPSHOT_MARKER = "pentaryn-snapshot.json"
def world_tree_digest() -> str;  def snapshot_digest(manifest=None) -> str;  def legacy_snapshot_digest() -> str
def read_manifest(st, snap) -> dict | None;  def referenced_bundles(st) -> set[str]
def restore_cost(st, snap) -> tuple[int, int, int] | None     # (world bytes, n bundles, bundle bytes)
def fetch_snapshot(st, snap) -> Fetched;  def apply_snapshot(f, *, systems=True) -> None
def extract_snapshot(tar_path)                                # kept: = apply_snapshot(Fetched(full local tar))
def bundles_cmd() / bundles_gc_cmd(yes)                       # `cloud bundles`, `cloud bundles-gc [--yes]`
```

---

## 8. Test matrix

All under `scripts/tests/`, no network, no rclone binary, no Foundry; the `two_hosts`,
`fake_rclone` and `tty` fixtures and `cloud_fakes.FakeRclone` as they are. A helper
`make_leveldb_pack(dir, ldb={"000013.ldb": b"..."}, manifest_no=148)` builds a realistic pack
folder (`CURRENT`, `MANIFEST-nnnnnn`, `LOG`, `LOG.old`, `LOCK`, empty `nnnnnn.log`, the `.ldb`s),
and `foundry_launch(dir)` rewrites the housekeeping the way a launch does (new MANIFEST and WAL
numbers, new `LOG`, `CURRENT` rewritten, same `.ldb`s, all with a new mtime).

**`test_bundles.py`** (bundles.py alone)

- Fingerprint: identical content in two folders with different mtimes ⇒ same `fp`; one changed
  byte ⇒ different; a renamed file ⇒ different; `foundry_launch` ⇒ **same**; a non-empty WAL
  ⇒ different; `.DS_Store` / `._x` ignored; a `CURRENT`-less folder with a file named `LOG` is
  **not** ignored; symlinks skipped; large file streamed (a 5 MB file, `read_bytes` not used —
  assert via a patched `open` or just correctness).
- Cache: second `local_inventory` reads no bytes (patch `fingerprint` to count); a touched file
  re-hashes only that module; a deleted/corrupt cache file is harmless; the cache lives at
  `FOUNDRY_DATA/pentaryn-bundle-cache.json`.
- Names: round-trip `bundle_name`/`parse_bundle`; versions `1.2.3-beta+5`, `v2`, `1 2`, `a@b`
  sanitised; ids with `@` refused with a warning; `.partial` and `world-*.tar.gz` do not parse.
- Inventory rules (§3.3): symlinked folder, hidden folder, folder without `module.json`,
  non-JSON `module.json`, `id` mismatch, loose `README.txt` — each warned or ignored as stated;
  systems found under `Data/systems`.
- `build`/`extract`: members all under `<id>/`, sorted, housekeeping included; `.building` never
  left behind on failure; `extract` refuses a tar with a member outside `<id>/`, swaps
  atomically (old folder gone, new in place), leaves `tmp/extract` clean.

**`test_bundles_cloud.py`** (two_hosts cloud, FolderStorage and FakeRclone)

- `listing`, `upload_missing` (uploads only absent names; a `.partial` is never listed; argv for
  rclone: `copyto … .partial` then `moveto`, no `--config`), `fetch` (size-verified; a missing
  name raises naming it; a truncated cloud file raises before returning).
- `gc`: referenced never deleted; unreferenced but younger than grace kept; older swept;
  `dry_run` deletes nothing; a non-bundle file in `bundles/` ignored; double gc is a no-op.

**`test_cloud_snapshots.py`** (extended; every existing test keeps passing except where noted)

- Backup uploads the world tar (first member `pentaryn-snapshot.json`, then worlds and Config,
  **no** `Data/modules`), every bundle once, the sidecar with `bundled`/`modules`/`systems`;
  a second backup after `foundry_launch` on every pack uploads **no** bundle; a changed module
  uploads one; the state digest changes only with the world or the manifest.
- Upload order: with `st.upload` patched to fail on the world tar, every bundle and the sidecar
  exist and no snapshot name does; with it failing on a bundle, nothing but a `.partial`.
- Verify-after-upload: delete a referenced bundle between the listing and the world upload
  (patch `st.upload`) ⇒ it is re-uploaded; with the folder changed meanwhile ⇒ die naming it.
- Healing: tree unchanged, based_on in the cloud, one bundle deleted by hand ⇒ that bundle is
  uploaded and the snapshot is skipped.
- Disk check counts the missing bundles' bytes (message has both numbers).
- Coalescing of the full-era mac snapshot by the first bundled backup; promotion copies the
  manifest; prune then GC sweeps what only the pruned snapshot referenced (after grace).
- `referenced_bundles`: safety copies and `major-release/` count; an unreadable sidecar aborts
  GC; a full-era sidecar references nothing.
- Restore (bundled): only `needed` downloaded (count `copyto` calls), unchanged modules' inodes
  untouched, extras removed **after** the safety copy references them, extras left when there
  is no local world, `KEEP_LOCAL_CONFIG` kept, foreign `dataPath` rewritten, state recorded,
  summary line; `systems=False` leaves systems alone.
- Restore (full/legacy): a hand-made legacy tar (worlds+Config+modules, no marker, no sidecar)
  clears `Data/modules` and extracts it — today's `test_cross_host_restore_keeps_this_machines_config`
  logic, now explicitly on a legacy tar; a full-era sidecar (no `bundled`) does the same.
- Restore refusals, each with **nothing local touched** (compare a tree hash before/after):
  missing bundle; size mismatch; sidecar/tar disagreement both ways; disk.
- The two-hosts scenario: BOSS with no world and no modules takes the Mac's newest ⇒ every
  bundle downloaded; BOSS plays, backs up ⇒ world + 0 bundles; the Mac takes BOSS's ⇒ 0
  bundles; BOSS installs module X and backs up ⇒ 1 bundle; the Mac takes it ⇒ 1 bundle;
  the Mac removes X and backs up; BOSS takes it ⇒ X removed on BOSS and still in the cloud
  (referenced by BOSS's own safety/based-on) until pruned + grace.
- Updater: `recover._restore_world_tar` on a bundled snapshot restores the world and the
  needed modules, not the system; the existing test's `rec.steps` line still holds.
- `boot`: the prompt line shows `+ N bundles (x) to fetch` / `all` / `already on this machine`;
  every existing boot test unchanged.
- `restore` listing shows `full` / `bundled`; `status` shows the bundle line; `cloud bundles`
  and `cloud bundles-gc` (dry run default, `--yes` deletes).
- `test_system_mirrors_are_shared_and_pruned_by_version` is **replaced** by systems-as-bundles
  tests (`system@dnd5e@…` uploaded once, shared, restored when the fingerprint differs).

**`test_cloud_storage.py`**: `SUBFOLDERS` has five entries (mkdir argv count); stale `.partial`
in `bundles/` swept. **`test_make_targets.py`**: `foundry-bundles` → `cloud bundles`,
`foundry-bundles-gc` → `cloud bundles-gc` and `YES=1` → `--yes`; `vtt-up`/`vtt-down` orders
unchanged.

---

## 9. Staged build (small commits, `[declared]` for behaviour changes)

| Stage | Builds | Depends on |
| --- | --- | --- |
| S1 `bundles.py` core | kinds/roots, `_walk` + LevelDB rules, `fingerprint`, cache, names, `local_inventory`, `manifest`, `build`, `extract`; `test_bundles.py` | — |
| S2 `bundles.py` cloud side | `listing`, `upload_missing`, `fetch`, `gc`; `storage.SUBFOLDERS`; stale-partial sweep; `test_bundles_cloud.py`, `test_cloud_storage.py` | S1 |
| S3 backup integration | `WORLD_PATHS`, digests, manifest in sidecar + tar, staging, upload order, verify, healing, disk check, GC call, `referenced_bundles`, `mirror_systems` retired, `status`/`bundles`/`bundles-gc` commands; `test_cloud_snapshots.py` backup half | S2 |
| S4 restore integration | `read_manifest`, `Fetched`, `fetch_snapshot`, `apply_snapshot`, full vs bundled detection, extras rule, `restore_snapshot`, `recover._restore_world_tar`, `restore_cost` + the boot prompt line, listing column; the restore half of the tests and the two-hosts scenario | S3 |
| S5 targets and docs | Makefile targets + help, `test_make_targets.py`, `ops.md` §3, `scripts/foundry/README.md`, `cloud.py` docstring + `README_TEXT`, `context/plans/README.md` row, this plan's §14 build record | S4 |

Then (the workflow, not a stage): adversarial review against §12's focus → fix loop → this
plan's §14 updated with what changed.

**Later, a separate workflow** (§10 step 0): merge main (with the background-upload change) into
this branch per §5, rerun everything, then the go-live.

---

## 10. Go-live (a later workflow; Joe at a terminal; nothing else running against Foundry or the cloud)

Nothing in the build touches the real OneDrive, rclone, Foundry or BOSS; every step below is a
first real run. Stop at the first surprise. Foundry stays **down** from step 2 to step 5.

**0. Preconditions (agent):** `feature/vtt-down-background-upload` is on main (it is, `938c36d4`);
main merged into `feature/module-bundles` per §5; whole suite green; `make check-context` clean;
`make -n vtt-up`, `make -n vtt-down`, `make -n foundry-bundles-gc` as expected; the branch merged
to main and the Mac checkout on it; `live-checks-and-push` not running. **No upload queued or in
flight on the Mac before the merged code is checked out** (review merge finding (a)): `make
foundry-cloud` shows no `upload` line, `FOUNDRY_DATA/.pentaryn-tmp/` holds no `*.job.json`, and
the upload lock is free — a job queued by the pre-merge code is a full tar (`manifest=None`); if
one is there, finish it first with the old code (`make foundry-backup` — a blocking backup
drains the queue first — or `./.venv/bin/python -m scripts.foundry.cloud upload-pending`). Then `FOUNDRY_DATA/pentaryn-replaced/` should not exist (nothing has been
moved aside yet).

**1. Mac, reads only:** `make foundry-cloud` → the existing lines plus `bundles 0 in the cloud;
local: 46 modules + 1 system, 47 not yet uploaded`. `make foundry-bundles` → every module with a
fingerprint and size (expect ~3.45 GB + dnd5e). `./.venv/bin/python -m scripts.foundry.boot
choose --json` → `local` (own newest is the based-on).

**2. Mac, the first bundled backup (blocking, so you watch it):** `make vtt-down WAIT=1` if
Foundry is up, else `make foundry-backup REASON=first-bundled`. Expect: 47 bundle uploads
(~3.5 GB, ~10 min — the one-time cost), the sidecar, a ~45 MB world tar, `replaced
world-2026-10-11-212143-fvtt14.369-mac.tar.gz` (coalesced), `swept 0 bundles`. Check:
`rclone lsf onedrive:DnD/foundry/bundles | wc -l` = 47 and no `.partial`; `rclone lsf
onedrive:DnD/foundry/world-backups` shows the new `-mac.tar.gz` and its `.parent`, and the old
3.24 GB one gone; `make foundry-cloud` → `based on` = the new name, `bundles 47 … all in the
cloud`.

**3. Mac, the skip and the launch test (the proof that §0's LevelDB rule holds):**
`make foundry-backup` → `no change since the last snapshot — skipped`. Then `make vtt-up`
(FROM=local as always on the Mac; the boot should be quiet), open the world, open a seafoot map
and a Monster Manual entry, `make vtt-down` → the upload (background or `WAIT=1`) must say
**world only, 0 new bundles** (or only a module you actually changed). If it uploads dozens of
bundles, stop: the fingerprint normalisation is wrong for something on disk — run `make
foundry-bundles` twice around a launch and diff.

**4. Mac, dress rehearsal (optional, recommended):** `make foundry-restore SNAP=<the newest
-mac.tar.gz>` with Foundry down: expect `0 bundles to fetch`, `no safety copy needed`, a 45 MB
download, `46 unchanged`, and `make vtt-up` works. This proves the bundled restore path on the
machine that matters before BOSS depends on it.

**5. BOSS first boot** (per `rclone-two-hosts-2026-10.md` §11/§15 step 5, plus): BOSS's
checkout on the merged main **before** anything else; free disk ≥ 8 GB under `FOUNDRY_DATA`;
`ssh -t boss 'cd <repo> && make vtt-up'` → the prompt shows the Mac's newest with `+ all 47
bundles (3.5 GB) to fetch`; Enter → world + bundles + dnd5e installed; Foundry up; open the
world, a seafoot map, a Monster Manual entry, check `Data/systems/dnd5e` is 6.0.6. Then `make
vtt-down` on BOSS → world + 0 bundles. On the Mac, `make vtt-up` is asked about BOSS's snapshot
(`+ 0 bundles`); `k` or Enter as Joe likes.

**6. Prune the legacy snapshots:** only now, `make foundry-prune-untagged` (types `delete`;
~30 GB). `system-backup/` can be deleted by hand whenever.

**7. BOSS hand-off addendum** for BOSS's Claude: the cloud has `bundles/`; `make foundry-bundles`
shows them; GC runs after each backup on BOSS too; the first boot downloads ~3.5 GB once.

---

## 11. Rollback

- **Code:** revert the merge commit on main (an agent does it; Joe never commits). The cloud
  layout is additive: old code ignores `bundles/` and the extra sidecar keys, and never prunes
  them.
- **Before restoring anything with the old code:** take one full backup with it
  (`make foundry-backup` — the old digest formula differs, so it uploads a full ~3.3 GB
  snapshot) on the machine whose world you want to keep. Old code must **never** restore a
  bundled snapshot (it would clear `Data/modules`); `make foundry-restore` with no `SNAP` lists
  names — bundled ones are the `-mac`/`-boss` snapshots written after the go-live stamp.
- The 10 untagged full snapshots are untouched until §10 step 6; keep them until the first
  BOSS boot has proven the bundles.
- `bundles/` can be deleted by hand after a revert; it costs ~3.5 GB to keep.

---

## 12. Review focus (for the adversarial pass)

1. Fingerprint stability across a Foundry launch (`foundry_launch` on every pack kind seen in
   §0) and sensitivity to a real edit (non-empty WAL, new `.ldb`); the `CURRENT` heuristic on a
   folder that merely contains a file named `LOG`.
2. GC can never delete a bundle a retained snapshot, safety copy, preserved generation or queued
   job references; the grace period; the post-upload verify under a simulated concurrent sweep;
   an unreadable sidecar aborts.
3. Restore refusals touch nothing local (tree hash before/after): missing bundle, size mismatch,
   sidecar/tar disagreement both ways, disk; extras are removed only after a cloud copy
   references them; no-world case leaves them.
4. The full/legacy path still clears `Data/modules` and extracts; the bundled path never clears
   unchanged modules; `KEEP_LOCAL_CONFIG` and the `dataPath` rewrite on both.
5. Healing of a hand-deleted bundle on an unchanged tree; digest changes only with world or
   manifest.
6. rclone argv: `.partial` + `moveto` for bundles, no `--config`, `deletefile` exit 3/4 tolerated.
7. All 47 boot-choice tests unchanged; lineage parses sidecars with the new keys; promotion
   copies the manifest; `_coalesce_target`/prune untouched.
8. Updater rollback on a bundled snapshot with `systems=False`; `newest_world_snapshot`.
9. Names: ids/versions with odd characters; `@` refusal; `parse_bundle` never matches a world
   snapshot or a `.partial`.
10. Inventory rules: symlink, hidden, manifest-less, non-JSON manifest, id mismatch, loose
    files — warned/ignored, never deleted.
11. The two-hosts scenario (§8) end to end, counting `copyto` calls.
12. Disk-space numbers; staged tars removed after a successful upload; `.building` never left.
13. The merge map (§5) is complete: every call site named; `Job` fields listed.

---

## 13. On this workflow's shape (critique)

Setup → design → staged Opus builds → adversarial review → fix loop → go-live plan is right for
a change with this many invariants. Three things to change:

1. **Recon before design, written down.** The decisive fact here (§0: LevelDB housekeeping
   rewritten per launch) came from a read-only look at the real `Data/modules`, not from the
   code or the previous plan. Give the design stage an explicit "verify assumptions against
   the live data, read-only" step and a place in the plan for the results, so builders and
   reviewers work from measured facts and the review cannot relitigate them without
   re-measuring.
2. **Adversarial review should write failing tests, not findings.** Hand the reviewer §12 and
   the `two_hosts` fixture and ask for property-style tests that break the build; the fix loop
   then has repros instead of prose, and the tests stay.
3. **The merge with the background-upload branch is its own stage with a precondition**, run by
   the follow-up workflow (it cannot run now). Give it §5 as its brief and the full suite plus
   `make -n` checks as acceptance. Likewise the go-live is Joe-at-a-terminal with an agent
   checking each step's expected output; the workflow should emit the exact commands and the
   expected lines (§10), not a narrative.

Smaller: run the **whole** `scripts/tests` suite after every stage (not just the new files —
S3/S4 change `cloud.py`, which five other test files exercise); keep a Sonnet verify step at
the end (suite, `make check-context`, `make -n` targets) as the memory rule says; and put the
"do not change" guard list (boot tests, lineage, coalescing) in every brief.

---

## 14. Build record

*(filled in by the build stages and the review: what differs from §3 and why, with commits.)*

| Design said | Built | Why |
| --- | --- | --- |
| S1: `Fingerprint` a frozen dataclass | `typing.NamedTuple(fp, files, bytes)` | Same fields and equality; also unpacks. `Ref`/`Local` are frozen dataclasses as designed — note `Local(...) != Ref(...)` even with equal names (dataclass `__eq__` checks the class); compare `.name` across them (S1, `ac892ccf`) |
| S1: `fingerprint(root)` | `fingerprint(root, *, files=None)` | `local_inventory` walks once for the stat signature and passes that walk in, so the sig and the hash always describe the same file set (S1) |
| S1: `extract` = `rmtree` the old folder, then `os.rename` the staged one in | Old folder renamed aside to `.pentaryn-tmp/extract/.old-<id>`, staged one renamed in, aside removed; on a failed second rename the old folder is renamed back. Refuses a symlinked destination. Keyword `seed_cache=True` | No window where a crash loses the old module with the new one not yet in place; staging still left clean either way (S1) |
| S1: `TMP_DIRNAME` from `cloud` | `bundles.TMP_DIRNAME = ".pentaryn-tmp"` (duplicated) | `bundles` must not import `cloud`; S3 may make `cloud.TMP_DIRNAME = bundles.TMP_DIRNAME` (S1) |
| S1: tar members "mtimes preserved" | mtimes preserved (PAX keeps sub-second floats); uid/gid zeroed, uname/gname blank; the folder itself is the first member `<id>`, then sorted `<id>/<rel>` | Owner names of one host mean nothing on the other; `filter='data'` ignores them anyway (S1) |
| S1: cache semantics | Entries for folders no longer present are dropped on each inventory; the cache is rewritten only when it changed; a failed cache write is one warning line, never fatal; `cache=False` neither reads nor writes it | Keeps the file small; the cache only ever costs time (S1) |
| S1: `bundle_name` | Also raises `ValueError` for an unknown kind, an id with `@`/`/`/empty, or an fp that is not 16 lowercase hex; sanitises the version | A bad name can never be built; `local_inventory` warns about `@` folders before this is reached (S1) |
| S1: inventory rules | A top-level symlink to a *file* is ignored silently (only symlinked folders warn); a `module.json` that parses but is not a JSON object (e.g. a list) is treated like non-JSON (version `0`, warned); warnings read `⚠ Data/modules/<name> skipped: …` | §3.3 talks about folders; a non-object manifest has no `version` to read (S1) |
| S2: `fetch(st, names, dest_dir, have)` | `names` is any iterable, de-duplicated in order; an empty list returns `{}` without creating `dest_dir`; the missing-names `StorageError` carries `verb="lsjson"`; the cleanup on failure also removes the half-written file of the bundle that failed (and would remove a same-named file that was already in `dest_dir` — `dest_dir` is meant to be a fresh temp dir) | All-or-nothing for the caller; S4 passes a fresh `.pentaryn-tmp/` dir (S2, `9094e1f8`) |
| S2: `gc` returns the swept names | Returns them **sorted**; logs `would sweep …` on a dry run and `swept N bundle(s) (x GB) …` otherwise, nothing when there is nothing; a bundle already gone (rclone exit 3/4) still counts as swept; any other delete failure raises `StorageError` and stops the sweep (the caller decides whether that is fatal) | `storage.delete` already treats not-found as success; a partial sweep is safe to rerun (S2) |
| S2: `upload_missing` | Logs `uploading bundle <name> (x GB)` per upload; never mutates `have` | The caller re-lists for the verify step (§3.5) anyway (S2) |
| S2: `ensure_cloud` sweep | `cloud.py` imports `bundles` (the only `cloud.py` change in S2) and sweeps `bundles/` with the same 24 h `STALE_PARTIAL_SECONDS`. `SUBFOLDERS` gained `bundles`, so the first run of this code creates an empty `DnD/foundry/bundles/` (`[declared]`, `aebb3954`); conftest's `fake_cloud` creates it too | §6 "Bundle upload interrupted" (S2) |
| S3 scope | The brief put the restore half (`read_manifest`, `Fetched`, `fetch_snapshot`, `apply_snapshot`, `extract_snapshot`, `restore_snapshot`, `recover._restore_world_tar`) in S3 with the backup half; the disk check, healing, verify-after-upload, GC call, `referenced_bundles`, `restore_cost`/boot prompt line, listing column and `status`/`bundles`/`bundles-gc` commands are left to S4; the `cloud.py` docstring and `README_TEXT` (still describing system mirrors; `KEEP_SYSTEM_MIRRORS` kept only for it) to S5 | Brief for S3 (`34588186`…`fbbc5e56`) |
| S3: `adopt_legacy_marker` compares the marker with `legacy_snapshot_digest()` and records it as the digest | Adopts when the marker equals `legacy_snapshot_digest()` **or** the current `snapshot_digest()`, and records the **current** digest | Recording the old-formula marker would make the next backup see a different digest and re-upload (the whole point of adoption is that it skips). The guard test `test_alt_backing_up_first_leaves_the_legacy_marker_for_the_primary` writes `cloud.snapshot_digest()` as its marker and must pass unchanged (S3, `84828228`) |
| S3: sidecar/marker disagreement refused both ways | A sidecar that is **present** and full-era, different, or malformed is refused ("sidecar and snapshot disagree"); a sidecar that is **missing** (or not JSON) over a marked tar is not a refusal — the marker names the bundles (one log line), and the missing-bundle check then runs after the world download | §3.2 makes the marker authoritative ("the sidecar can be lost"). The guard tests `test_restoring_own_oldest_of_ten_succeeds` and `test_restoring_the_oldest_at_the_keep_limit…` rename a real tar without its sidecar (S3) |
| S3: `fetch_snapshot` dies | Raises `cloud.RestoreError` (a `RuntimeError`); `restore_snapshot` turns it into `die`; `recover` lets it propagate | A `SystemExit` would escape `recover_system`'s `except Exception` and leave Foundry quit and not restarted (S3) |
| S3: bundles fetched into `tmp/bundles/` (`bundles.STAGING`) | Into `.pentaryn-tmp/fetch/` (`cloud.FETCH_DIRNAME`), cleared before and after each fetch; `Fetched` gains `cleanup: list[Path]` and `cloud.discard_fetched(f)` removes the temp files | The safety backup runs between fetch and apply and stages into `bundles/`, deleting its staged tars after upload; `bundles.fetch`'s cleanup may delete a same-named file in its `dest_dir` (S2 row) (S3) |
| S3: `local_inventory()` in `fetch_snapshot` | `bundles.local_inventory(save=False)`: reads the cache, never writes it (new keyword, tested in `test_bundles.py`) | Nothing local may change before every download succeeded; the boot guard test `test_download_failure_after_choosing_restore_touches_nothing` hashes the whole data root around a failed download. Cost: with a cold cache a restore hashes a changed module twice (plan, then the safety backup) (S3, `c1d601b3`) |
| S3: `fetch_snapshot(st, snap)`; `extract_snapshot(tar_path)` | Both take `systems=True`; with `systems=False` no system is needed, downloaded or required in the cloud. `recover._restore_world_tar` passes `systems=False` for a `Snapshot` and for a local `Path` | A system rollback is exactly when the local system differs from the snapshot's: it would download ~135 MB to ignore it, or refuse if that bundle were gone (S3, `fbbc5e56`) |
| S3: `apply_snapshot` bundled | Before clearing anything it refuses (`RestoreError`, "nothing was touched") a bundled world tar holding a member outside `WORLD_PATHS`, or a needed bundle that was not fetched; `restore_snapshot` reports those as "refused", not "failed part-way". It reads the tar once | A bundled tar must never overlay `Data/modules` (S3) |
| S3: summary line | `restored <name>: world x MB; modules: N installed (x MB), M unchanged, K removed[, L left (ids)]; systems: …` — `all M unchanged` when nothing changed, `none` when there are none, `not touched` with `systems=False` | Readable for both the Mac's dress rehearsal (`all 46 unchanged`) and BOSS's first boot (S3) |
| S3: backup | The `bundles/` listing is taken on every backup, beside the world listing (also when the backup then skips): one extra `lsjson`; S4's healing needs it there. On a failed upload the staged bundle tars stay in `.pentaryn-tmp/bundles/` and are named in the error (a rerun rebuilds them in place). The upload log line says `with N new bundle(s) (x MB)` | (S3) |
| S3: tests | `test_backup_writes_a_parent_sidecar_and_restore_inherits_its_lineage` compares the sidecar's lineage keys (`_lineage()`), not the whole dict — the sidecar carries the manifest by design; `test_legacy_marker_matching_the_tree_is_adopted` writes `legacy_snapshot_digest()`; `test_system_mirrors_are_shared_and_pruned_by_version` replaced by systems-as-bundles tests. Every other existing test, and `test_boot_choice.py`, `test_host.py`, `test_role_gates.py`, `test_make_targets.py`, unchanged | (S3) |
| S3 merge note (§5) | In the background-upload code `_restore_locked` must catch `RestoreError` from `fetch_snapshot` (as `restore_snapshot` does here); the job's staged bundle tars are under `.pentaryn-tmp/bundles/`, restore downloads under `.pentaryn-tmp/fetch/` | (S3) |
| S4: backup disk check "this host's newest world snapshot, or 64 MB" | `newest` of this host's **regular** snapshots (no longer falling back to another host's newest, as the pre-bundles check did), else `WORLD_ESTIMATE_BYTES` (64 MB); the bundle bytes are `Local.bytes` (the fingerprinted, uncompressed bytes — conservative). The message names free and needed (`only x free on <dir> — this backup builds ~y locally before upload (the world ~w + N new bundle(s) b); free at least twice that`). Until the full-era 3.24 GB mac snapshot is coalesced it is the estimate — conservative, harmless with 554 GB free | Brief for S4 (`e9c24378`) |
| S4: restore disk check before any download | `fetch_snapshot` checks 2 × (`snap.size` + Σ listed sizes of `needed`) before the world download; with a lost sidecar (the marker plans only after the world tar is here) a second check counts the bundles alone. A **full** restore now has a disk check too (2 × its size; there was none before). A refusal is a `RestoreError` ending "nothing local was touched" | §3.6 step 3 (S4) |
| S4: verify-after-upload — die naming the module | Also on any `StorageError` during the verify (re-list or re-upload). Before dying it **removes the new snapshot and its sidecar from the cloud** (best effort; the message says whether that worked) and deletes the world tar, the staged and the rebuilt tars; the state is not recorded, so nothing coalesces or prunes. A rebuilt bundle goes through `bundles.build` into `.pentaryn-tmp/bundles/` and is deleted with the others | §1 #7: a snapshot name must never stand without its bundles — otherwise the other host's boot offers a snapshot whose restore refuses (S4) |
| S4: healing | `_heal_bundles` (digest-skip branch, `based_on` in the cloud): its own disk check (2 × the lost bundles' bytes), builds, `upload_missing`, deletes the staged tars whether or not the upload worked, logs `uploaded N bundle(s) the cloud had lost`; a failed upload dies (the `--if-stopped` path turns that into the usual warning) | (S4) |
| S4: `referenced_bundles` — unreadable sidecar raises | A sidecar that says `bundled` but whose manifest is **malformed** also raises `StorageError` (GC aborts), not "references nothing" | It may well name bundles; "cannot tell" must never shrink the mark (S4) |
| S4: GC after `_backup` | `_gc_after_backup` after prune, only on an upload (also after a restore's safety copy — it uploads). Never fatal: a failed mark is `⚠ bundle GC skipped: … — nothing was deleted`, a failed delete `⚠ bundle GC stopped part-way`; `bundles.gc` logs `swept N bundle(s) (x GB) …`, and cloud adds `swept 0 bundles (none unreferenced for 7 days)` when nothing went (§10 step 2 expects that line) | The snapshot is already recorded when GC runs (S4) |
| S4: `restore_cost(st, snap) -> (world, n, bytes)` | Returns `cloud.RestoreCost`, a `tuple` subclass that is exactly that 3-tuple (unpacks, compares) plus `.total` = how many bundles the manifest names, so the prompt can say "all". Plans with the inventory's warnings silenced (they would land inside the prompt). None for a full snapshot, a **lost** sidecar, or any exception | (S4) |
| S4: boot prompt | `_prompt(..., *, st=None)`; `decide` passes its `st`. Lines: `+ 1 bundle (x) to fetch` (singular), `+ N bundles (x) to fetch`, `+ all N bundles (x) to fetch` when N equals the manifest's count and N > 1, `(every bundle is already on this machine)`; sizes in the prompt's own `_gb` format. A `restore_cost` that raises shows nothing. `decide()`, `notice_line` and every existing boot test unchanged (`e511248d`) | (S4) |
| S4: listing column | `restore` (the listing) prints `bundled` / `full` / `?` after the host; untagged snapshots read as `full` **without** a sidecar read (they predate sidecars); a `bad` sidecar shows `?`. `prune-untagged`'s listing has no column (`_print_listing(snaps, st=None)`) | One `cat` per tagged row over rclone (~25 rows) (S4) |
| S4: `status` bundle line | `(x GB)` is left out when the cloud has 0 bundles and the `M unreferenced` part when M is 0 (so §10 step 1 reads `bundles      0 in the cloud; local: 46 modules + 1 system, 47 not yet uploaded`); an unreadable manifest shows `unreferenced: unknown (…)`; `referenced_bundles` is computed once (a test counts the sidecar reads) | (S4) |
| S4: `cloud bundles`, `cloud bundles-gc [--yes]` | `bundles_cmd`: header, then one row per local bundle — kind, id, version, fp, size, `yes`/`no` — then the unreferenced cloud bundles with size and age in days. `bundles_gc_cmd`: a failed mark dies `cannot read every snapshot's manifest — nothing was deleted`; lists each name with size and age; the count+bytes line is `bundles.gc`'s own (`would sweep` / `swept`), plus a zero line and, on a dry run, the `--yes` hint. Makefile targets are S5 | (S4) |
| S4 test note | One S4 test first used `monkeypatch.undo()` to drop its own patch; that also undid the autouse fixtures' `PENTARYN_CLOUD` / env isolation, so its second half most likely resolved the **real** cloud through `storage.select("")` (read-only: `ls` of world-backups/ and major-release/, sidecar `cat`s; no write, no `ensure_cloud`). Fixed before commit (the test restores the one patched method instead) and commented. `test_foundry_ops.py` has a pre-existing `monkeypatch.undo()` (not cloud-related) | Never `monkeypatch.undo()` in this suite (S4) |
| S4 merge note (§5) | Main now has the background-upload code (`_build` / `_upload_job` / `_run_job` / `_restore_locked`, `uploadq`). `_check_backup_disk` and `_heal_bundles` go in `_build` (healing in its digest-skip branch); `_verify_bundles` goes in `_upload_job` right after the world tar's `st.upload`, so the job's staged bundle tars must outlive it (`job.drop()` after the verify); on a verify failure the job must be dropped, not retried (its snapshot was removed); `_gc_after_backup` after prune in `_upload_job`; `referenced_bundles` must add the manifests of `uploadq.pending()` jobs; `status` = `_upload_lines()` then the bundle line; `main` keeps both sets of subcommands; `fetch_snapshot`'s disk check runs inside `_restore_locked` | (S4) |
| S3: a corrupt world tar | A gzip stream that fails to inflate (`zlib.error`) reads as an unreadable snapshot (`RestoreError`, nothing touched), like a `TarError` / `EOFError` | §6 "nothing local touched" for every bad download; `tarfile` lets `zlib.error` through (S3, `fbbc5e56`) |
| S4 follow-up | `restore_cost` plans quietly (inventory warnings silenced); `bundles-gc` prints only the zero line and the `--yes` hint, `bundles.gc` prints the count line | Both rows above describe the result (S4, `d9903b43`) |
| S5: help lines "under the OneDrive section" | Under **Housekeeping**, after `foundry-prune-untagged` (the help has no OneDrive section; the Makefile's `# ─── Foundry ⇄ OneDrive` block holds the two recipes, each with a one-line comment) | (S5, `d5f9c182`) |
| S5: tests | Besides the two targets and `YES=1` → `--yes`: `foundry-bundles` never names `bundles-gc`; a `vtt-down` order guard (lock-check → tunnel-down → down → `backup --reason shutdown`); the help names both targets and `~45 MB`; `ensure_cloud` rewrites a stale `README.txt` and the text has `bundles/`, `~45 MB`, the `.parent` manifest line and `system-backup/` as legacy (`test_cloud_storage.py`) | Tests first, `99957774` (S5) |
| S5: `cloud.py` | Docstring and `README_TEXT` rewritten; `KEEP_SYSTEM_MIRRORS` **deleted** (its comment said only `README_TEXT` still quoted it); `cloud backup`'s argparse help says `world+Config (+ new bundles)`. The cloud README spells the bundle name `module@<id>@<version>@<fingerprint>.tar.gz` (ops.md uses `<fp>`) and says older snapshots hold the modules too (~2.5–3.3 GB). The first run of this code on each host rewrites the cloud `README.txt` (`ensure_cloud` compares the text) | Nothing else read the constant (S5, `f66f9757`) |
| S5: docs beyond the brief | `ops.md`: a task-table row (`foundry-bundles` / `-bundles-gc`), the `.parent` line and a paragraph under the tree, `bundles.py` + this plan in the source note, lifecycle row 0 and the digest rule no longer say "3 GB", `foundry-cloud`'s row mentions bundles, a rule "both machines must run the bundle-aware code" (§4 last row), the rclone `lsd` check lists `bundles`, the disk gotcha says ~7 GB once, then ~45 MB + changed modules. `automated-updates.md`: snapshot sizes and the retired system mirrors (the rollback's system copy is still `.state/system-aside/`) | Every line there was made false by S3/S4 (S5, `cc03a830`) |
| S5: `context/plans/README.md` — "update rclone-two-hosts' row" | That row did not exist (not on main either); added it ("built and merged 2026-10-11 (go-live §15); extended by module-bundles-2026-10.md") above the new module-bundles row | (S5, `c24f5621`) |
| S5 merge note (§5) — docs and Makefile | Main's background-upload change touches the same lines. **Makefile**: the `vtt-down` help line → `tear both down, snapshot the world (~45 MB) + changed modules; upload in background (WAIT=1 waits)` or split over two lines; the `vtt-down` / `foundry-backup` recipes are main's (`BACKGROUND=1`, `--background`) — this branch did not touch them; `.PHONY` and the two new targets merge cleanly. **README** (`scripts/foundry/`): `foundry-cloud` = main's background-upload wording + ", bundles"; `vtt-down` = main's row + "the world (~45 MB) and any bundle the cloud lacks". **ops.md**: the task table's "Play tonight" row (main), §2's background paragraph says "the ~3 GB upload" → "~45 MB + the bundles the cloud lacks"; the §3 `foundry-backup` row = this branch's text + main's "the first rclone…" clause where still true, and "with `BACKGROUND=1` the uploads run detached"; the `foundry-cloud` row = main's upload part + this branch's bundles part; "the rules" bullet on `.partial` = main's "queued … retries it" + this branch's "~2× (world + bundles)"; keep both new bullets. **automated-updates.md**: main changed the "updater shells out" row, this branch the retention section — no overlap. `test_make_targets.py`: this branch's `vtt-down` order guard still holds (main adds `BACKGROUND=1` after `--reason shutdown`, the substring `cloud backup --reason shutdown` still matches); main's merge added no make-target test, so add one: `make -n vtt-down WAIT=1` has no `--background` | (S5) |

### Review fixes (2026-10-11)

The adversarial review (`test_review_dataloss.py` DL1–DL8, `test_review_restore_boot.py` R1–R6,
`test_bundles_review.py` PL1, all strict xfails, plus three merge findings) was fixed finding by
finding; each proving test now passes with its marker removed, and `test_review_fixes.py` pins
each mechanism on its own. **Not in this round, still strict xfails:** R4 (healing after a full
restore uploads every bundle), R5 (the prompt does not say a bundle is missing), DL7 (rclone's
upload size check can delete the other host's same-name bundle), DL8 (a full restore wipes what
the bundled safety copy cannot hold) and PL1 (staged tars of a failed run outlive the rerun).

| Finding | Fixed how | Deviation from the review's suggestion, and why |
| --- | --- | --- |
| DL1 (and the duplicate "verify does nothing over rclone"): `RcloneStorage` caches each folder's `lsjson` for the process, so the verify, GC and a restore's plan read stale listings | `storage.refresh(st, sub)` (`RcloneStorage.refresh` drops the cache entry; `FolderStorage` no-op; tolerant of a storage without it); `bundles.listing(st, fresh=True)`, `snapshots(st, folder, fresh=True)`. Fresh in `_verify_bundles`, `bundles.gc`'s sweep listing, the mark (`world-backups/` + `major-release/`), `fetch_snapshot`'s plan, `_backup`'s first two listings and `bundles-gc`'s printout (`0ae9139f`) | The review suggested `st.ls(sub, fresh=True)`; a separate `refresh` keeps `ls(sub)`'s signature (every caller and fake unchanged). `_backup`'s world-backups listing is fresh too (the boot choice listed it in the same process) |
| DL2: mark → sweep not atomic across hosts | Both of the review's option (b): `bundles.gc(recheck=…)` — after the sweep listing, before the first delete, `cloud._remark` lists both folders again and reads only the sidecars of snapshots that landed since the first mark (`_mark(st, skip)`); and `_refresh_reused` — before the sidecar, the backup `touch`es every reused bundle whose cloud mtime is past half the grace, except those its own still-listed based-on names. New `Storage.touch` (`rclone touch --no-create`; `os.utime`) (`dfa9a73d`) | Option (a), the two-phase candidates file, was not built: (b) closes the repro with either half alone (both pinned), and a shared `.gc-candidates.json` is one more file two hosts write. The residual window (§6 row) is seconds and self-heals at the next backup while the folder is local. The based-on skip keeps a routine backup at zero `touch` calls (~47 rclone calls every 3.5 days otherwise) |
| DL3 / R6: promotion copied the tar, then the sidecar under `except StorageError: pass` | Sidecar first, then the tar; the write tried twice; a failure is a stderr warning; every backup copies a missing `major-release/` sidecar again while its source is still in this host's rolling window (`_repair_preserved_sidecars`). The preserved copy stays GC-marked and restorable through its tar's marker (DL4) (`fe7462c3`) | The review offered "fail the promotion (or skip and retry)". Failing or skipping would let the same backup coalesce the source away — the generation's last snapshot gone. The tar is self-describing (its marker), so it is still copied; only its lineage is lost, as before bundles. The repros' own assertion (the tar preserved, the source coalesced) agrees |
| DL4: an empty or torn sidecar read as "absent" = references nothing | The mark reads a tagged snapshot whose sidecar is missing, empty or not JSON from its tar's head: `Storage.read_head(rel, n)` (`rclone cat --count`, binary; `FolderStorage` open+read), `_marker_from_head` parses the first member from the first 256 KiB of the gzip; a full-era tar names nothing; a head that cannot answer raises → GC does nothing (`1ec600d1`) | The review's main suggestion was "abort when a tagged snapshot's sidecar is missing"; that would stop GC for good after one lost sidecar, so its alternative (read the tar's first member) was built, aborting only when that fails too. `test_referenced_bundles_counts_safety_and_major_release_ignores_full_era` changed: its no-sidecar snapshot was 64 bytes of `x` (now "cannot tell"); it is a real full tar, joined by a marked tar without a sidecar. `FakeRclone` learned `cat --count` |
| DL5 / R1: a world-less restore that left extras recorded the local digest | `restore_snapshot` records `snapshot_digest(f.manifest)` for a bundled snapshot (world as on disk + the snapshot's manifest); a full restore records the local digest as before (`80712104`) | — (the review's second option). With no extras the two are equal, so the pre-launch backup after a normal restore still skips (pinned) |
| R2: a corrupt bundle of the right size was first opened after the world was cleared | `bundles.read_all(tar)` (one sequential pass: tar stream, every byte, gzip CRC) and `bundles.verify(tar, kind, id)` (+ member check); `fetch_snapshot` reads the world tar whole and verifies every fetched bundle → `RestoreError`, nothing touched, naming the bundle and how to heal it (`ca2abe62`) | Extract does not re-verify the extracted fingerprint (the review's optional item): the CRC + member check already proves the archive is the one uploaded; a fingerprint pass would read a 1.9 GB module twice more |
| DL6a / R3: a symlinked module folder the snapshot names | `_destinations()` + `_refuse_links()`: refused in `fetch_snapshot`'s plan (before any download or safety copy) and again in `apply_snapshot` before the clear (the updater's path too), naming the link and its target (`3d93efdf`) | — |
| DL6b: a folder without `module.json` the snapshot names was replaced with no copy | Moved whole to `FOUNDRY_DATA/pentaryn-replaced/<UTC stamp>/<relpath>` (outside `Data/` and `Config/`: never snapshotted, bundled, inventoried or swept) and named in one line; a stray *file* there is moved the same way (`3d93efdf`) | The review's alternative (move aside) rather than refusal, so a leftover folder does not block a boot; `pentaryn-replaced/` rather than its `.pentaryn-tmp/replaced/` — nothing that holds the only copy of something may live in a temp dir. The DL6b test's acceptance gained "kept under `pentaryn-replaced/`" (it accepted only "in place" or "in a cloud bundle") |
| M1 (merge): staged tars keyed by bundle name, shared by queued jobs | Here: `upload_missing(…, rebuild=)` — a vanished staged tar is rebuilt from the live folder when its fingerprint matches (`cloud._rebuilder`, shared with the verify), else `StorageError`, never `FileNotFoundError` (`5c09446d`). For the merge: per-job staging, `job.drop()` removes only its own folder (§5) | Staging is still `tmp/bundles/<name>` on this branch: there is one backup per process here, and changing the path now would only move the merge conflict |
| M2 (merge): a queued job's staged tars keep their build mtime | `bundles.fresh_mtime(tar)` before every bundle upload (`upload_missing`, the verify's re-uploads); `_verify_bundles` also runs before the sidecar, not only after the world tar; the reused-bundle refresh is DL2's (`7e407a58`). §5 rows for the job's two verifies and fresh `have` | — |
| Merge map (a)–(g) | §5 rewritten against main's real code (`938c36d4`): (a) a pre-merge job (`manifest=None`) uploads as full, and §10 step 0 requires an empty queue; (b) the second verify on the skip-the-world re-run path too; (c) fresh listings in the upload half; (d) per-job staging; (e) `sweep_building` covers `tmp/bundles/**`, `mirror_systems` and the restore's system note deleted; (f) fresh mtimes; (g) healing queued, not synchronous in `_build`. The diff to read is `git diff bb74bf6b 938c36d4` | Docs only on this branch: the code those rows change exists only on main |
| Second review round, test gap: DL1 was pinned over rclone only at the verify (`test_dl1`); dropping `fresh=True` at the GC sweep, the mark, `fetch_snapshot`'s plan or `_backup`'s first two listings failed nothing (the DL2/DL4 GC tests run on `FolderStorage`, which has no cache) | Five `test_dl1_*` tests in `test_review_fixes.py`, each over `FakeRclone`: one process's `RcloneStorage` cache is filled first, the other host changes the cloud, then the site runs in that process — the mark keeps a bundle the other host's new snapshot reuses; the sweep spares a bundle touched since; the restore's plan refuses "missing from the cloud" before any download; a boot backup stages a bundle swept after the prompt listed `bundles/` ("with 1 new bundle(s)", not the verify's re-upload) and re-uploads an unchanged tree whose based-on was pruned after the boot choice listed it. Mutation-checked: dropping `fresh=True` at any one site fails exactly one test (`7c74e8b3`) | Tests only, no code change. The mark and the GC re-mark share `_mark`'s one `fresh=True`, so one test covers both. The backup test (d) isolates the first listing by asserting the staged path: the verify would otherwise put the bundle back and hide it |
| Second review round, test gap: R2's world half (`bundles.read_all(local_tar)` in `fetch_snapshot`) untested | `test_a_full_snapshot_damaged_past_its_first_member_is_refused_before_the_clear`: a legacy full tar whose first member reads but whose deflate stream breaks further in, same size; `cloud.restore` refuses "nothing local was touched", `Data/worlds`, `Data/modules` and `Config` byte-identical. Without the line the restore clears all three and fails part-way (mutation-checked) (`c2417693`) | The damage is a 4 KiB `0xFF` block at an offset the test searches for (the first member still reads, a full extract hits `zlib.error`), not one flipped byte: a flipped byte usually inflates to wrong literals, and `tarfile` neither checks the gzip CRC nor fails on a later bad header — without `read_all` such a tar would restore silently corrupted rather than fail part-way. Searched, not hard-coded, because zlib builds compress differently |
| Merge map (h), second review round: an `_Incomplete` in the merged `_upload_job` became `die()`, and main's uploader leaves a job that raised `SystemExit` queued for good (`_run_job` re-raises, `_drain` catches only `StorageError`, `upload_pending` returns 1) — the queue, `in_flight()` and every later backup stuck behind one job whose reused bundle was swept while it waited | §5 row "6 verify failure" rewritten: any `_Incomplete`, from verify-1 or verify-2, ends that job — `state=failed` with the reason, an ops `dropped` event, the world tar kept as `tmp/incomplete/<name>` and named by `status()`, `job.drop()`, and the uploader goes on to the next job; `_rebuilder` builds into the job's own staging folder. §6's verify row points at it; `test_cloud_background_upload.py`'s list gains the two drop tests | Docs only on this branch (the uploader exists only on main). The review said "keep or name its tar": it is kept (one, the newest) because with no later job queued it may be the only copy of that world state once Foundry runs again; a status line alone would be overwritten by the next job's |
| Docs | `ops.md` §3 "rules that keep it safe": whole-download reads, the symlink refusal and `pentaryn-replaced/`, the GC's lost-sidecar mark and re-check, the reused-bundle refresh, fresh listings (`a267c2cf`); this plan's §3.5, §3.7, §6 and §10 step 0 | — |
