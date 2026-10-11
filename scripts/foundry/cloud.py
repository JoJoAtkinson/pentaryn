#!/usr/bin/env python3
"""OneDrive as Foundry's source of truth — one direction each way, two machines.

The whole design rests on a single rule: **each direction is one-way, and the two
never touch the same files.**

- **Assets flow DOWN.** You drop ``tokens-02.zip`` into OneDrive; the next server
  start unpacks it into ``Data/assets/tokens/tokens-02/``. Extracted once, tracked
  by hash, never re-extracted, never overwritten. Local assets are never uploaded.
- **The world flows UP.** Every server stop (and every start, before launch)
  archives the world, Config and modules to OneDrive as a timestamped snapshot,
  tagged with the machine that took it (``world-<UTC stamp>-fvtt<ver>-<host>.tar.gz``).
- **Restore is never silent.** At an interactive boot, when the newest snapshot in the
  cloud (from either machine) is newer than what this machine's world is based on, the
  boot step *tells you* and offers it as the default (``scripts/foundry/boot.py``).
  Without a terminal it never restores — it prints one line saying how to. Every restore
  downloads first and archives the local state before touching it, so it is undoable.

Two machines (design: ``context/plans/rclone-two-hosts-2026-10.md``): the **primary**
(the Mac — where Joe plays, where the tunnel and the Saturday updater run) and an
**alt** (BOSS) for building addons in parallel. Both reach the same cloud folder through
``scripts/foundry/storage.py`` — rclone when an ``onedrive:`` remote exists, else the Mac's
OneDrive folder. Each machine prunes, coalesces and promotes **only its own** snapshots;
legacy untagged snapshots belong to nobody and are only ever deleted by hand
(``make foundry-prune-untagged``).

Why not just sync the whole data directory? Because ``Data/worlds/<world>/data/`` is a
live LevelDB. A sync client reads ``.ldb`` files mid-compaction and uploads inconsistent
snapshots, and resolves conflicts by writing *conflict copies* into the directory — junk
inside a live database. A *stopped* database is copied wholesale, which is always
consistent. A *running* one is never touched by the cloud at all.

Sizes, re-measured 2026-10: the world is a few MB and Config 8 KB, but ``Data/modules`` is
~2.7 GB of premium map art, so a snapshot is **~2.5–3.2 GB**. Retention is built around
that size:

- **Ten** rolling snapshots per host (``PENTARYN_KEEP_SNAPSHOTS``).
- A snapshot taken within **five days** of this host's newest one *replaces* it, so a
  day of editing costs one snapshot, not six. The weekly auto-update lands outside it.
- Snapshots from a Foundry **generation you have left** are copied into
  ``major-release/`` and never pruned.
- Uploads land as ``<name>.partial`` and are renamed when complete; a ``.partial`` is
  never a snapshot, and one older than a day is swept as a crash leftover.

Systems (132 MB) are mirrored per version and shared by both hosts (the same version is
the same bytes); the last ``KEEP_SYSTEM_MIRRORS`` versions are kept.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tarfile
import tempfile
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scripts.foundry import bootstate, host
from scripts.foundry import storage as storage_mod
from scripts.foundry.storage import JUNK_NAMES, Entry, Storage, StorageError

# ── Locations ────────────────────────────────────────────────────────────────

# Cloud subfolders, relative to the cloud root (storage.py resolves the root).
ASSETS_IN = "assets"              # you put zips here
WORLD_BACKUPS = "world-backups"   # automatic, rolling, per host
SYSTEM_BACKUP = "system-backup"   # automatic, one copy per version, shared
# Never pruned. One snapshot per host per Foundry GENERATION: the last state captured
# while that host was still on it.
MAJOR_RELEASES = "major-release"

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "foundry" / "assets-manifest.json"

# Default per-host retention; PENTARYN_KEEP_SNAPSHOTS overrides (host.keep_snapshots()).
KEEP_SNAPSHOTS = 10

# A snapshot taken while this host's newest one is younger than this REPLACES it.
COALESCE_WINDOW_DAYS = 5

# How many versions of each system's mirror to retain. More than one, because a system
# rollback needs the version you were on *before* the update.
KEEP_SYSTEM_MIRRORS = 3

# A crash between upload and rename leaves a `.partial`; younger ones may be the other
# machine mid-upload, so only these are swept.
STALE_PARTIAL_SECONDS = 24 * 3600

# Where tars are built and downloads land: on the data volume, outside SNAPSHOT_PATHS.
TMP_DIRNAME = ".pentaryn-tmp"

# A pack zip is `<kind>-<nn>.zip`. Append-only: published zips are never edited.
ZIP_NAME = re.compile(r"^([a-z][a-z0-9-]*)-(\d{2})\.zip$")

# world-<YYYY-MM-DD-HHMMSS>-fvtt<ver>-<host>[.safety].tar.gz   (2026-10-11 on)
# world-<YYYY-MM-DD-HHMMSS>-fvtt<ver>.tar.gz                    untagged, 2026-08-21 .. 2026-10-11
# world-<YYYY-MM-DD-HHMMSS>.tar.gz                              untagged, before
# The host group is host.py's alphabet; host.validate_host refuses anything that would
# read as part of the version group. `.safety` marks the copy a restore takes of the
# state it is about to replace (see restore_snapshot).
SNAPSHOT_NAME = re.compile(
    r"^world-(\d{4}-\d{2}-\d{2}-\d{6})(?:-fvtt([0-9.]+|unknown))?(?:-([a-z0-9-]+))?"
    r"(\.safety)?\.tar\.gz$")

# FOUNDRY_DATA is the root that holds Config/ Data/ Logs/, so these are root-relative.
KINDS = {
    "tokens": "Data/assets/tokens",
    "maps": "Data/assets/maps",
    "tiles": "Data/assets/tiles",
    "portraits": "Data/assets/portraits",
    "audio": "Data/assets/audio",
}

# What a rolling snapshot contains, relative to FOUNDRY_DATA. Systems are excluded.
SNAPSHOT_PATHS = ["Data/worlds", "Config", "Data/modules"]

# This machine's own files under Config/, kept across every restore: options.json holds
# this machine's absolute dataPath (a Mac path planted on BOSS would break Foundry),
# admin.txt the admin password hash, license.json the licence. The snapshot's copies stay
# inside the tar for forensics.
KEEP_LOCAL_CONFIG = ("Config/options.json", "Config/admin.txt", "Config/license.json")


def log(msg: str) -> None:
    print(f"  {msg}")


def die(msg: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"  ✗ {msg}", file=sys.stderr)
    sys.exit(1)


def data_root() -> Path:
    return host.foundry_data()


def store() -> Storage:
    try:
        return storage_mod.get()
    except StorageError as exc:
        die(str(exc))


def __getattr__(name: str):
    # Back-compat for callers that imported the old module constants.
    if name == "FOUNDRY_DATA":
        return host.foundry_data()
    if name == "CLOUD_ROOT":
        return storage_mod.get().root
    raise AttributeError(name)


def server_running() -> bool:
    """Something is listening on the Foundry port. Several operations refuse while it is.
    A TCP connect (host.is_running): a server answering 4xx or TLS is still live."""
    return host.is_running()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tmp_dir() -> Path:
    d = data_root() / TMP_DIRNAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def _mb(n: int | float) -> str:
    return f"{n / 1e9:.2f} GB" if n >= 1e9 else f"{n / 1e6:.1f} MB"


def _utc(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


README_TEXT = (
    "Foundry Virtual Tabletop — cloud store\n"
    "======================================\n\n"
    "Managed by the pentaryn repo (`make vtt-up`, `make foundry-backup`, …) from two\n"
    "machines: the primary (the Mac) and an alt (BOSS). Both reach this folder through\n"
    "rclone or the OneDrive app. Everything Foundry-related lives under this one folder.\n\n"
    "assets/         YOU PUT THINGS HERE.\n"
    "                Art packs as zips, named <kind>-<nn>.zip — e.g.\n"
    "                tokens-01.zip, maps-01.zip, maps-02.zip.\n"
    "                The next server start unpacks anything new into Foundry.\n"
    "                Never edit a zip once added; add the next number instead.\n"
    f"                Kinds: {', '.join(sorted(KINDS))}\n\n"
    "world-backups/  AUTOMATIC — do not edit.\n"
    "                Snapshots of the campaign, Config and modules (~2.5-3.2 GB each),\n"
    "                written on every server stop and start, named\n"
    "                world-<UTC stamp>-fvtt<version>-<machine>.tar.gz.\n"
    f"                Each machine keeps its own most recent {KEEP_SNAPSHOTS}, and a snapshot\n"
    f"                taken within {COALESCE_WINDOW_DAYS} days of that machine's previous one\n"
    "                REPLACES it. Names without a machine are from before 2026-10-11;\n"
    "                nothing deletes those automatically.\n"
    "                A name ending .safety.tar.gz is the state a restore replaced.\n"
    "                A name ending .partial is an upload in progress (or a crash, swept\n"
    "                after a day) — never a snapshot.\n\n"
    "major-release/  AUTOMATIC — never pruned.\n"
    "                When Foundry moves to a new generation (14 -> 15), the\n"
    "                last snapshot each machine took on the old one is preserved\n"
    "                here. Deleting one is you deciding you are never going back.\n\n"
    "system-backup/  AUTOMATIC — do not edit.\n"
    "                One copy per game-system version, shared by both machines.\n"
    f"                The last {KEEP_SYSTEM_MIRRORS} versions are kept, because rolling a\n"
    "                system update back needs the code you were on BEFORE it.\n\n"
    "Restoring is never silent and never automatic without a terminal. At an\n"
    "interactive `make vtt-up`, when this folder has a newer snapshot than the\n"
    "machine's world, you are told and the default is the newest snapshot; the\n"
    "local state is archived first, so it is undoable. `make foundry-restore`\n"
    "lists everything; `FROM=local` keeps the local world.\n"
)

_ensured: set[str] = set()


def ensure_cloud(st: Storage | None = None) -> Storage:
    """Create the folder structure and README once per process; sweep stale partials."""
    st = st or store()
    key = f"{st.kind}:{st.root}"
    if key in _ensured:
        return st
    try:
        st.mkdirs()
        if st.read_text("README.txt") != README_TEXT:
            st.write_text("README.txt", README_TEXT)
        for sub in (WORLD_BACKUPS, SYSTEM_BACKUP):
            for e in storage_mod.stale_partials(st, sub, max_age=STALE_PARTIAL_SECONDS):
                st.delete(f"{sub}/{e.name}")
                log(f"swept a stale upload {sub}/{e.name} "
                    f"({(time.time() - e.mtime) / 3600:.0f} h old — a crash, not in progress)")
    except StorageError as exc:
        die(f"cloud unreachable ({st.kind} {st.root}): {exc}")
    _ensured.add(key)
    return st


# ── Snapshots: the single parse site ─────────────────────────────────────────

@dataclass(frozen=True, order=True)
class Snapshot:
    stamp: str              # sort key 1 — the stamp (UTC from 2026-10-11, Mac-local before)
    name: str               # sort key 2 — ties broken by name, so order is total
    host: str | None        # None → legacy, "untagged"
    core: str | None
    size: int
    mtime: float            # from the listing; the cross-host "newest" comparison uses this
    folder: str             # "world-backups" | "major-release"
    safety: bool = False    # the copy a restore took of the state it replaced

    @property
    def rel(self) -> str:
        return f"{self.folder}/{self.name}"

    @property
    def host_label(self) -> str:
        return self.host or "untagged"


def parse_snapshot(entry: Entry, folder: str = WORLD_BACKUPS) -> Snapshot | None:
    m = SNAPSHOT_NAME.match(entry.name)
    if not m:
        return None
    return Snapshot(stamp=m.group(1), name=entry.name, host=m.group(3), core=m.group(2),
                    size=entry.size, mtime=entry.mtime, folder=folder,
                    safety=bool(m.group(4)))


def snapshots(st: Storage | None = None, folder: str = WORLD_BACKUPS) -> list[Snapshot]:
    """Every parseable snapshot in one folder, oldest first by (stamp, name)."""
    st = st or store()
    snaps = [s for e in st.ls(folder) if (s := parse_snapshot(e, folder))]
    return sorted(snaps)


def all_snapshots(st: Storage | None = None) -> list[Snapshot]:
    st = st or store()
    return snapshots(st, WORLD_BACKUPS) + snapshots(st, MAJOR_RELEASES)


def by_mtime(snaps: list[Snapshot]) -> list[Snapshot]:
    return sorted(snaps, key=lambda s: (s.mtime, s.name))


def newest(snaps: list[Snapshot]) -> Snapshot | None:
    """Newest by the listing's mtime — the only clock comparable across hosts."""
    return max(snaps, key=lambda s: (s.mtime, s.name), default=None)


def own(snaps: list[Snapshot], me: str | None = None) -> list[Snapshot]:
    me = me or host.host_name()
    return [s for s in snaps if s.host == me]


def find_snapshot(st: Storage, name: str) -> Snapshot | None:
    """A name from either folder — a preserved generation is a legitimate target."""
    for folder in (WORLD_BACKUPS, MAJOR_RELEASES):
        for s in snapshots(st, folder):
            if s.name == name:
                return s
    return None


def snapshot_core_version(path: Path | str) -> str | None:
    """Pull the `-fvtt<version>` suffix back out of a snapshot filename."""
    m = SNAPSHOT_NAME.match(Path(str(path)).name)
    return m.group(2) if m else None


def generation(version: str | None) -> str | None:
    """Foundry's generation is the leading integer: 14.365 -> 14."""
    if not version:
        return None
    head = version.split(".")[0]
    return head if head.isdigit() else None


def core_version() -> str:
    """The installed Foundry version (host.core_version), stamped into every name."""
    return host.core_version()


# ── Assets: OneDrive → local, additive only ──────────────────────────────────

def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {"packs": {}}


def save_manifest(m: dict) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def kebab(name: str) -> str:
    """Normalise once, at extraction, before any Foundry document references the path.

    Safe precisely because packs are append-only: an extracted path never changes
    afterwards. Never rename inside an extracted pack — fix names in the next zip.
    """
    stem, dot, ext = name.rpartition(".")
    if not dot:
        stem, ext = name, ""
    stem = stem.lower().replace("_", "-").replace(" ", "-")
    stem = re.sub(r"\((\d+)\)", r"-\1", stem)
    stem = re.sub(r"[^a-z0-9.-]", "-", stem)
    stem = re.sub(r"-{2,}", "-", stem).strip("-.")
    return f"{stem}.{ext.lower()}" if ext else stem


def _local_copy(st: Storage, rel: str) -> tuple[Path, bool]:
    """A local path for a cloud file: the file itself for a folder, else a temp download.
    The bool says whether the caller must delete it."""
    if st.kind == "folder":
        return Path(getattr(st, "path")) / rel, False
    dest = tmp_dir() / Path(rel).name
    st.download(rel, dest)
    return dest, True


def _same_listing(prior: dict, e: Entry) -> bool:
    return (prior.get("bytes") == e.size and prior.get("mtime") is not None
            and abs(float(prior["mtime"]) - e.mtime) < 2.0)


def _lifecycle_warning(what: str, exc: BaseException | str, after: str) -> None:
    detail = f": {exc}" if str(exc) and not isinstance(exc, SystemExit) else ""
    print(f"  ⚠ {what}{detail} — {after}", file=sys.stderr)


def unpack_assets(dry_run: bool = False, if_reachable: bool = False) -> int:
    """New or changed zips only. A zip already unpacked whose (size, mtime) match the
    manifest is skipped without a download — over rclone, hashing every zip on every
    start would mean downloading every zip on every start.

    `if_reachable` is for `make vtt-up`: an unreachable cloud (or a pack that will not
    download) is a warning and exit 0, so a cloud outage never stops a session starting.
    A badly named or edited pack still fails — that is a fix in the cloud folder."""
    try:
        st = ensure_cloud()
        zips = [e for e in st.ls(ASSETS_IN) if e.name.endswith(".zip")]
    except (StorageError, SystemExit) as exc:
        if not if_reachable or (isinstance(exc, SystemExit) and exc.code in (0, None)):
            if isinstance(exc, StorageError):
                die(f"cannot list {ASSETS_IN}/: {exc}")
            raise
        _lifecycle_warning("assets not checked: the cloud is unreachable", exc,
                           "starting with the packs already on disk")
        return 0
    root = data_root()
    manifest = load_manifest()
    if not zips:
        log(f"no packs in {st.root}/{ASSETS_IN}")
        return 0

    problems, unreachable, extracted = [], [], 0
    for e in zips:
        m = ZIP_NAME.match(e.name)
        if not m:
            problems.append(f"{e.name}: name must be <kind>-<nn>.zip "
                            f"(kinds: {', '.join(sorted(KINDS))})")
            continue
        kind, num = m.group(1), m.group(2)
        if kind not in KINDS:
            problems.append(f"{e.name}: unknown kind '{kind}' "
                            f"(allowed: {', '.join(sorted(KINDS))})")
            continue

        pack = f"{kind}-{num}"
        dest = root / KINDS[kind] / pack
        prior = manifest["packs"].get(pack)
        rel = f"{ASSETS_IN}/{e.name}"

        if prior and dest.is_dir() and _same_listing(prior, e):
            continue  # already unpacked, listing unchanged — the common case, no download

        if dry_run:
            log(f"would {'check' if prior and dest.is_dir() else 'unpack'} {e.name}")
            extracted += 0 if prior and dest.is_dir() else 1
            continue

        try:
            zp, cleanup = _local_copy(st, rel)
        except StorageError as exc:
            (unreachable if if_reachable else problems).append(
                f"{e.name}: download failed: {exc}")
            continue
        try:
            digest = sha256_file(zp)
            if prior and dest.is_dir():
                if prior["sha256"] == digest:
                    prior["bytes"], prior["mtime"] = e.size, e.mtime  # check once, record
                    continue
                problems.append(
                    f"{e.name}: contents changed since it was unpacked. Packs are "
                    f"append-only — add {kind}-{int(num) + 1:02d}.zip instead, or delete "
                    f"{dest} to force a re-extract.")
                continue
            count = _extract_pack(zp, e.name, pack, dest, problems)
            if count is None:
                log(f"✗ {e.name} refused")
                continue
            manifest["packs"][pack] = {
                "zip": e.name, "sha256": digest, "bytes": e.size, "mtime": e.mtime,
                "files": count, "dest": str(dest.relative_to(root)),
                "extracted": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
            log(f"unpacked {e.name} → {dest.relative_to(root)} ({count} files)")
            extracted += 1
        finally:
            if cleanup:
                zp.unlink(missing_ok=True)

    if not dry_run:
        save_manifest(manifest)
    for u in unreachable:
        _lifecycle_warning(u, "", "not unpacked; the next start tries again")
    if problems:
        print("  ✗ some packs were not unpacked:", file=sys.stderr)
        for p in problems:
            print(f"      {p}", file=sys.stderr)
        return 1
    if extracted == 0:
        log(f"assets up to date ({len(manifest['packs'])} packs)")
    return 0


def _extract_pack(zp: Path, zname: str, pack: str, dest: Path, problems: list) -> int | None:
    """Extract to a temp dir, then move into place, so an interrupted run never leaves a
    half-populated pack the manifest would later call complete. None on a collision."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=str(dest.parent)) as tmp:
        staging = Path(tmp) / pack
        count = 0
        with zipfile.ZipFile(zp) as zf:
            seen: dict[str, str] = {}
            for info in zf.infolist():
                if info.is_dir():
                    continue
                parts = [p for p in Path(info.filename).parts
                         if p not in ("__MACOSX",) and not p.startswith("._")]
                if not parts or parts[-1] in JUNK_NAMES or parts[-1].startswith("."):
                    continue
                rel = "/".join(kebab(p) for p in parts)
                if rel in seen:
                    problems.append(
                        f"{zname}: '{info.filename}' and '{seen[rel]}' both "
                        f"normalise to '{rel}' — rename one inside the zip")
                    return None
                seen[rel] = info.filename
                target = staging / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, target.open("wb") as out:
                    shutil.copyfileobj(src, out)
                count += 1
        if dest.exists():
            shutil.rmtree(dest)
        staging.mkdir(parents=True, exist_ok=True)
        shutil.move(str(staging), str(dest))
        return count


# ── World: local → OneDrive, rolling, one-way ────────────────────────────────

def snapshot_digest() -> str:
    """Content hash (path, size, int mtime) of everything a snapshot covers."""
    root = data_root()
    h = hashlib.sha256()
    for rel in SNAPSHOT_PATHS:
        base = root / rel
        if not base.exists():
            continue
        for p in sorted(base.rglob("*")):
            if p.is_file():
                h.update(str(p.relative_to(root)).encode())
                h.update(str(p.stat().st_size).encode())
                h.update(str(int(p.stat().st_mtime)).encode())
    return h.hexdigest()


def tree_has_world() -> bool:
    """Is there anything worth a snapshot? A machine that has never run Foundry has none,
    and archiving an empty tree before its first restore would be noise."""
    worlds = data_root() / "Data/worlds"
    return worlds.is_dir() and any(worlds.iterdir())


def adopt_legacy_marker(st: Storage, state: bootstate.BootState) -> bootstate.BootState:
    """First run of this code on the machine that wrote the old shared marker.

    Before 2026-10-11 the digest lived in ``world-backups/.last-digest`` and every snapshot
    was untagged. If that marker equals this tree's digest, this tree IS the newest
    untagged snapshot: record that, so neither the boot choice nor the backup treats an
    unchanged world as new (no 3 GB re-upload, no question on the Mac's first boot)."""
    if state.based_on or state.digest:
        return state
    try:
        marker = (st.read_text(f"{WORLD_BACKUPS}/.last-digest") or "").strip()
        if not marker:
            return state
        legacy = [s for s in snapshots(st, WORLD_BACKUPS) if s.host is None]
    except StorageError:
        return state
    base = newest(legacy)
    if base is None or marker != snapshot_digest():
        return state
    state.record_snapshot(base.name, None, base.mtime, marker, by="adopt-legacy-marker")
    log(f"recorded this world as based on {base.name} (the legacy digest marker matches)")
    return state


def backup(reason: str = "manual", if_stopped: bool = False) -> int:
    """`if_stopped` is for lifecycle hooks: skip quietly rather than fail the target.
    `make vtt-up` on an already-running server is normal, and must not abort there —
    and neither must a cloud that is down: the pre-launch snapshot is then a warning
    (naming any tar left on disk), exit 0, and `make vtt-down` tries again."""
    if server_running():
        if if_stopped:
            log("Foundry already running — skipping the pre-launch snapshot")
            return 0
        die("Foundry is running — stop it first (a live LevelDB cannot be copied consistently)")
    if not if_stopped:
        _backup(ensure_cloud(), reason)
        return 0
    try:
        _backup(ensure_cloud(), reason)
    except (StorageError, SystemExit) as exc:
        if isinstance(exc, SystemExit) and exc.code in (0, None):
            raise
        _lifecycle_warning(f"the {reason} snapshot was not taken", exc,
                           "starting anyway; the shutdown backup (make vtt-down) tries again")
        try:
            left = sorted(tmp_dir().glob("world-*.tar.gz"), key=lambda p: p.stat().st_mtime)
        except OSError:
            left = []
        if left:
            print(f"    left on disk: {left[-1]}", file=sys.stderr)
    return 0


def _in_cloud(st: Storage, name: str, existing: list[Snapshot]) -> bool:
    """Is `name` still a snapshot in the cloud — rolling, or preserved in major-release/?"""
    if any(s.name == name for s in existing):
        return True
    try:
        return any(s.name == name for s in snapshots(st, MAJOR_RELEASES))
    except StorageError:
        return False


def _backup(st: Storage, reason: str, *, safety: bool = False,
            protect: str | None = None) -> Snapshot | None:
    """The snapshot uploaded, or None when skipped (unchanged, or nothing to archive).

    `protect` names a snapshot this run must not delete — the one a restore is about to
    extract — so neither coalescing nor pruning can remove the state the based-on record
    is about to point at."""
    state = adopt_legacy_marker(st, bootstate.load())
    digest = snapshot_digest()
    try:
        existing = snapshots(st, WORLD_BACKUPS)
    except StorageError as exc:
        die(f"cannot list {WORLD_BACKUPS}/: {exc}")
    if state.digest == digest:
        # Unchanged since the last upload or restore — but "skip" is only safe while that
        # snapshot still exists. Coalescing, pruning or prune-untagged (on either machine)
        # may have deleted it, and then this tree has no cloud copy at all.
        if state.based_on and _in_cloud(st, state.based_on, existing):
            log("no change since the last snapshot — skipped")
            return None
        log(f"no change since {state.based_on or 'the last snapshot'}, but it is no longer "
            "in the cloud — uploading this state again")
    if not tree_has_world():
        log("no local world to snapshot — skipped")
        return None

    me = host.host_name()
    keep = host.keep_snapshots()

    # Before writing anything: if the installed generation has moved on since this host's
    # last backup, its newest snapshot from the OLD generation is the last state that still
    # runs on it. Preserve it now, while it is still inside the rolling window.
    promote_major_release(st, existing)

    core = core_version()
    taken = {s.name for s in existing}
    when = datetime.now(timezone.utc)
    while True:  # a name is an identity (based_on, keep-local): never reuse one
        stamp = when.strftime("%Y-%m-%d-%H%M%S")
        name = f"world-{stamp}-fvtt{core}-{me}{'.safety' if safety else ''}.tar.gz"
        if name not in taken:
            break
        when += timedelta(seconds=1)

    # Coalescing: note the snapshot this one may replace, but write the new one FIRST and
    # only then delete the old. A safety copy never coalesces in either direction.
    superseded = None if safety else _coalesce_target(existing, me, protect)

    tmp = tmp_dir() / name
    last = newest(own(existing, me)) or newest(existing)
    if last:
        free = shutil.disk_usage(tmp.parent).free
        if free < 2 * last.size:
            die(f"only {_mb(free)} free on {tmp.parent} — a snapshot is ~{_mb(last.size)} and "
                "is built locally before upload; free at least twice that")

    with tarfile.open(tmp, "w:gz") as tar:
        for rel in SNAPSHOT_PATHS:
            src = data_root() / rel
            if src.exists():
                tar.add(src, arcname=rel)
    size = tmp.stat().st_size
    log(f"uploading {name} ({_mb(size)}, {reason}) to {st.root}...")
    try:
        st.upload(tmp, f"{WORLD_BACKUPS}/{name}")
    except StorageError as exc:
        die(f"upload failed: {exc}\n"
            f"    the snapshot is still on disk: {tmp}\n"
            f"    finish it by hand: rclone copyto \"{tmp}\" {st.root}/{WORLD_BACKUPS}/{name}")
    tmp.unlink(missing_ok=True)

    entry = next((e for e in st.ls(WORLD_BACKUPS) if e.name == name), None)
    snap = parse_snapshot(entry or Entry(name, size, time.time()), WORLD_BACKUPS)
    state.record_snapshot(name, me, snap.mtime, digest, by="backup")
    log(f"snapshot → {name} ({_mb(size)}, {reason})")
    # The shared digest marker is retired: the digest is local now (bootstate).
    try:
        st.delete(f"{WORLD_BACKUPS}/.last-digest")
    except StorageError:
        pass

    if superseded:
        age_days = (time.time() - superseded.mtime) / 86400
        st.delete(superseded.rel)
        log(f"replaced {superseded.name} ({age_days:.1f} days old, inside the "
            f"{COALESCE_WINDOW_DAYS}-day window)")

    mine = [s for s in own(snapshots(st, WORLD_BACKUPS), me) if s.name != protect]
    for stale in mine[:-keep]:
        st.delete(stale.rel)
        log(f"pruned {stale.name}")
    log(f"{min(len(mine), keep)} of {keep} snapshots kept for {me}")

    mirror_systems(st)
    return snap


def _coalesce_target(existing: list[Snapshot], me: str,
                     protect: str | None = None) -> Snapshot | None:
    """This host's newest regular snapshot, if young enough to be replaced. Never another
    host's, never an untagged one, never a safety copy, never `protect`."""
    mine = [s for s in own(existing, me) if not s.safety]
    last = newest(mine)
    if last is None or last.name == protect:
        return None
    age_days = (time.time() - last.mtime) / 86400
    return last if age_days < COALESCE_WINDOW_DAYS else None


def promote_major_release(st: Storage, existing: list[Snapshot] | None = None) -> Snapshot | None:
    """Preserve the last snapshot this host took on a generation it has since left.

    Called before each backup, so it also catches an upgrade done by hand through
    Foundry's own setup screen, which the updater never sees. The promoted copy keeps its
    full name (with host), so major-release/ holds one per host per generation."""
    me = host.host_name()
    current = generation(core_version())
    mine = own(existing if existing is not None else snapshots(st, WORLD_BACKUPS), me)
    last = newest(mine)
    if not current or last is None:
        return None
    previous = generation(last.core)
    if not previous or previous == current:
        return None
    candidates = [s for s in mine if generation(s.core) == previous]
    source = newest(candidates)
    if source is None:
        return None
    preserved = snapshots(st, MAJOR_RELEASES)
    if any(s.host == me and generation(s.core) == previous for s in preserved):
        return None  # this host's copy of that generation is already preserved
    st.copy(source.rel, f"{MAJOR_RELEASES}/{source.name}")
    log(f"Foundry {previous} → {current}: preserved {source.name} in major-release/ "
        f"({_mb(source.size)}, never pruned)")
    return source


def _version_key(v: str) -> tuple:
    return tuple(int(p) if p.isdigit() else -1 for p in re.split(r"[.\-]", v))


def mirror_systems(st: Storage) -> None:
    """One copy per system version, shared by both hosts — `exists` is the dedupe."""
    systems = data_root() / "Data/systems"
    if not systems.is_dir():
        return
    listing = [e.name for e in st.ls(SYSTEM_BACKUP)]
    for sysdir in sorted(p for p in systems.iterdir() if p.is_dir()):
        manifest = sysdir / "system.json"
        if not manifest.exists():
            continue
        try:
            version = json.loads(manifest.read_text(encoding="utf-8")).get("version", "unknown")
        except Exception:
            version = "unknown"
        name = f"{sysdir.name}-{version}.tar.gz"
        if name in listing:
            continue
        tmp = tmp_dir() / name
        with tarfile.open(tmp, "w:gz") as tar:
            tar.add(sysdir, arcname=sysdir.name)
        try:
            st.upload(tmp, f"{SYSTEM_BACKUP}/{name}")
        finally:
            size = tmp.stat().st_size if tmp.exists() else 0
            tmp.unlink(missing_ok=True)
        log(f"system mirror → {name} ({_mb(size)})")
        listing.append(name)
        # Keep the last few versions, by version — the rollback needs the one before.
        pat = re.compile(rf"^{re.escape(sysdir.name)}-(\d[^/]*)\.tar\.gz$")
        versions = sorted((m.group(1), n) for n in listing if (m := pat.match(n)))
        versions.sort(key=lambda vn: _version_key(vn[0]))
        for _, stale in versions[:-KEEP_SYSTEM_MIRRORS]:
            st.delete(f"{SYSTEM_BACKUP}/{stale}")
            listing.remove(stale)
            log(f"pruned system mirror {stale}")


# ── Restore ──────────────────────────────────────────────────────────────────

def extract_snapshot(tar_path: Path) -> None:
    """Replace worlds/Config/modules from a local snapshot tar, keeping this machine's
    own KEEP_LOCAL_CONFIG files.

    Each target is cleared before extracting: `extractall` overlays, so restoring an older
    snapshot over a newer tree would keep every file the newer version added — a
    mixed-version install that runs, the worst kind of failed restore."""
    root = data_root()
    kept = {rel: (root / rel).read_bytes() for rel in KEEP_LOCAL_CONFIG
            if (root / rel).is_file()}
    for rel in SNAPSHOT_PATHS:
        target = root / rel
        if target.exists():
            shutil.rmtree(target)
            log(f"cleared {rel}")
    with tarfile.open(tar_path, "r:gz") as tar:
        tar.extractall(root, filter="data")
    for rel, data in kept.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_bytes(data)
    if kept:
        log(f"kept this machine's {', '.join(Path(r).name for r in kept)}")
    _fix_foreign_data_path(root, kept)


def _fix_foreign_data_path(root: Path, kept: dict) -> None:
    """No local options.json to keep (Foundry never ran here): the snapshot's carries the
    other machine's absolute dataPath. Point it at this machine's root."""
    if "Config/options.json" in kept:
        return
    opts = root / "Config/options.json"
    try:
        data = json.loads(opts.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    if isinstance(data, dict) and data.get("dataPath") and data["dataPath"] != str(root):
        log(f"options.json came from another machine (dataPath {data['dataPath']}); "
            f"set to {root}")
        data["dataPath"] = str(root)
        opts.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def restore_snapshot(st: Storage, snap: Snapshot, reason: str = "manual") -> None:
    """resolve → download → safety backup → clear → extract. Nothing local is touched
    until the chosen bytes are on this disk, and the safety backup protects `snap` from
    its own pruning, so the based-on record never names a snapshot this restore deleted."""
    if server_running():
        die("Foundry is running — stop it first")
    local_tar = tmp_dir() / snap.name
    log(f"downloading {snap.name} ({_mb(snap.size)}, {snap.host_label})...")
    try:
        st.download(snap.rel, local_tar)
    except StorageError as exc:
        local_tar.unlink(missing_ok=True)
        die(f"download of {snap.name} failed — nothing local was touched: {exc}\n"
            "    to boot the local world instead: make foundry-up FROM=local")
    try:
        if local_tar.stat().st_size != snap.size:
            die(f"download of {snap.name} is {local_tar.stat().st_size} B, the cloud says "
                f"{snap.size} B — nothing local was touched")
        safety = _backup(st, f"pre-restore safety copy ({reason})", safety=True,
                         protect=snap.name)
        before = safety.name if safety else bootstate.load().based_on
        try:
            extract_snapshot(local_tar)
        except Exception as exc:  # noqa: BLE001
            back = (f"put the previous state back: make foundry-restore SNAP={before}"
                    if before else "there was no previous local world")
            die(f"extract of {snap.name} failed part-way: {exc}\n    {back}")
        bootstate.load().record_snapshot(snap.name, snap.host, snap.mtime, snapshot_digest(),
                                         by=f"restore:{reason}")
        log(f"restored {snap.name}" + (f" (the state it replaced: {before})" if before else ""))
    finally:
        local_tar.unlink(missing_ok=True)

    # Snapshots cover worlds/Config/modules but NOT Data/systems, mirrored separately.
    try:
        mirrors = [e.name for e in st.ls(SYSTEM_BACKUP)]
    except StorageError:
        mirrors = []
    if mirrors:
        log("note: systems are NOT part of this snapshot. If you are rolling back a")
        log("      system update, also restore its code from system-backup/:")
        for m in mirrors[-KEEP_SYSTEM_MIRRORS:]:
            log(f"        {m}")


def _print_listing(snaps: list[Snapshot]) -> None:
    for s in by_mtime(snaps):
        print(f"      {s.name:<58} {s.host_label:<9} {_utc(s.mtime)}  "
              f"{s.core or '?':<8} {_mb(s.size):>9}")


def restore(which: str | None, yes: bool = False, reason: str = "manual") -> int:
    """List every host's snapshots, or restore one by name (from either folder)."""
    if server_running():
        die("Foundry is running — stop it first")
    st = ensure_cloud()
    try:
        rolling = snapshots(st, WORLD_BACKUPS)
        preserved = snapshots(st, MAJOR_RELEASES)
    except StorageError as exc:
        die(f"cannot list the cloud: {exc}")
    if not rolling and not preserved:
        die(f"no snapshots in {st.root}/{WORLD_BACKUPS}")

    if which is None:
        state = bootstate.load()
        print(f"  snapshots in {st.root}/{WORLD_BACKUPS} (newest last, all machines):")
        _print_listing(rolling)
        if preserved:
            print(f"\n  preserved past generations in {MAJOR_RELEASES}/ (never pruned):")
            _print_listing(preserved)
            print("      ⚠ restoring one of these gives you a world last opened by an")
            print("        OLDER Foundry. Reinstall that version first, or it will be")
            print("        migrated forward again on the next launch.")
        print(f"\n  this machine ({host.host_name()}) is based on: {state.based_on or 'unknown'}")
        latest = newest([s for s in rolling if not s.safety]) or newest(rolling + preserved)
        print(f"  restore one with:  make foundry-restore SNAP={latest.name}")
        return 0

    chosen = find_snapshot(st, which)
    if chosen is None:
        die(f"no such snapshot: {which}")
    if not yes:
        print(f"  about to restore {chosen.name} ({chosen.host_label}) over {data_root()}")
        print("  the current state is archived first, so this is undoable")
        if input("  type 'restore' to continue: ").strip() != "restore":
            log("aborted")
            return 1
    restore_snapshot(st, chosen, reason)
    return 0


def prune_untagged(yes: bool = False) -> int:
    """Untagged (pre-2026-10-11) snapshots belong to no host, so nothing prunes them.
    This lists them and deletes only on a typed confirmation."""
    st = ensure_cloud()
    legacy = [s for s in snapshots(st, WORLD_BACKUPS) if s.host is None]
    if not legacy:
        log("no untagged snapshots")
        return 0
    print(f"  {len(legacy)} untagged snapshot(s) in {WORLD_BACKUPS}/ "
          f"({_mb(sum(s.size for s in legacy))}):")
    _print_listing(legacy)
    state = bootstate.load()
    keep = {state.based_on} if state.based_on else set()
    doomed = [s for s in legacy if s.name not in keep]
    if keep & {s.name for s in legacy}:
        print(f"  kept: {state.based_on} (this machine's world is based on it)")
    if not doomed:
        return 0
    if not yes:
        if not sys.stdin.isatty():
            die("refusing without a terminal — this deletes snapshots")
        if input(f"  type 'delete' to delete {len(doomed)}: ").strip() != "delete":
            log("aborted")
            return 1
    for s in doomed:
        st.delete(s.rel)
        log(f"deleted {s.name}")
    return 0


def status() -> int:
    st = ensure_cloud()
    m = load_manifest()
    me = host.host_name()
    state = bootstate.load()
    log(f"cloud        {st.kind}  {st.root}")
    log(f"host         {me}  ({host.role()}; primary is {host.primary_host()})"
        + ("  (PENTARYN_HOST unset — platform default)" if host.host_is_default() else ""))
    log(f"based on     {state.based_on or 'unknown'}"
        + (f"  (keeping local over {state.keep_local_until_newer_than})"
           if state.keep_local_until_newer_than else ""))
    try:
        zips = [e for e in st.ls(ASSETS_IN) if e.name.endswith(".zip")]
        snaps = snapshots(st, WORLD_BACKUPS)
    except StorageError as exc:
        die(f"cannot list the cloud: {exc}")
    log(f"packs        {len(zips)} zip(s), {len(m['packs'])} unpacked")
    hosts = sorted({s.host for s in snaps if s.host})
    for h in hosts:
        mine = [s for s in snaps if s.host == h]
        last = newest(mine)
        log(f"snapshots    {h}: {len(mine)}, newest {last.name} ({_utc(last.mtime)})")
    untagged = [s for s in snaps if s.host is None]
    if untagged:
        log(f"untagged     {len(untagged)} ({_mb(sum(s.size for s in untagged))}) — "
            "make foundry-prune-untagged")
    log(f"keep         {host.keep_snapshots()} per host")
    log(f"foundry      {'RUNNING' if server_running() else 'stopped'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("assets", help="unpack new packs from OneDrive (down)")
    a.add_argument("--dry-run", action="store_true")
    a.add_argument("--if-reachable", action="store_true",
                   help="warn and exit 0 instead of failing when the cloud is unreachable")
    b = sub.add_parser("backup", help="snapshot world+config+modules to OneDrive (up)")
    b.add_argument("--reason", default="manual")
    b.add_argument("--if-stopped", action="store_true",
                   help="skip instead of failing when the server is up")
    r = sub.add_parser("restore", help="list snapshots, or restore one")
    r.add_argument("--snapshot", default=None)
    r.add_argument("--yes", action="store_true")
    p = sub.add_parser("prune-untagged", help="list untagged snapshots and delete on confirm")
    p.add_argument("--yes", action="store_true")
    sub.add_parser("status", help="show what is where")

    args = ap.parse_args(argv)
    try:
        if args.cmd == "assets":
            return unpack_assets(args.dry_run, args.if_reachable)
        if args.cmd == "backup":
            return backup(args.reason, args.if_stopped)
        if args.cmd == "restore":
            return restore(args.snapshot, args.yes)
        if args.cmd == "prune-untagged":
            return prune_untagged(args.yes)
        return status()
    except host.HostError as exc:
        die(str(exc))
    except StorageError as exc:
        die(f"cloud: {exc}")


if __name__ == "__main__":
    sys.exit(main())
