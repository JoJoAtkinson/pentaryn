#!/usr/bin/env python3
"""OneDrive as Foundry's source of truth — one direction each way, two machines.

The whole design rests on a single rule: **each direction is one-way, and the two
never touch the same files.**

- **Assets flow DOWN.** You drop ``tokens-02.zip`` into OneDrive; the next server
  start unpacks it into ``Data/assets/tokens/tokens-02/``. Extracted once, tracked
  by hash, never re-extracted, never overwritten. Local assets are never uploaded.
- **The world flows UP.** Every server stop (and every start, before launch)
  archives the world and Config to OneDrive as a timestamped snapshot, tagged with
  the machine that took it (``world-<UTC stamp>-fvtt<ver>-<host>.tar.gz``). Modules
  and systems travel beside it as content-addressed **bundles** (below).
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

Sizes, re-measured 2026-10-11: ``Data/worlds`` ~37 MB and ``Config`` ~6 MB, so a world
snapshot is **~45 MB**. ``Data/modules`` (~3.45 GB, mostly premium map art that almost never
changes) and ``Data/systems`` (~135 MB) are not in it. Each module and system folder is a
**bundle** in ``bundles/``, named ``<kind>@<id>@<version>@<fingerprint>.tar.gz``
(``scripts/foundry/bundles.py``). The fingerprint is a content hash that ignores LevelDB
housekeeping, so a Foundry launch changes nothing and the same bytes on either machine get
the same name. A bundle is uploaded only when the cloud lacks that name, so a backup costs
~45 MB plus whatever modules really changed. Each world snapshot's ``.parent`` sidecar,
and the tar's first member ``pentaryn-snapshot.json``, list the bundle each module and
system was at (the manifest). A restore downloads the world tar and only the bundles this
machine lacks. Snapshots from before bundles (untagged ones, and the first ``-mac``
snapshot) are **full**: worlds + Config + modules in one tar. They restore exactly as
before; the sidecar says which kind a snapshot is and the tar's first member confirms it.
Design: ``context/plans/module-bundles-2026-10.md``. Retention:

- **Ten** rolling snapshots per host (``PENTARYN_KEEP_SNAPSHOTS``).
- A snapshot taken within **five days** of this host's newest one *replaces* it, so a
  day of editing costs one snapshot, not six. The weekly auto-update lands outside it.
- Snapshots from a Foundry **generation you have left** are copied into
  ``major-release/`` and never pruned.
- Uploads land as ``<name>.partial`` and are renamed when complete; a ``.partial`` is
  never a snapshot, and one older than a day is swept as a crash leftover.
- A bundle is deleted only by a mark-and-sweep after an uploading backup (or
  ``make foundry-bundles-gc YES=1``): when no retained snapshot, safety copy or
  ``major-release/`` generation references it and it is older than seven days. The
  uploader lists the cloud again once its snapshot has landed and re-uploads any
  referenced bundle that was swept meanwhile.

``system-backup/`` (the per-version system mirrors) is legacy: nothing writes or prunes it
any more, and Joe deletes it by hand.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
import shutil
import sys
import tarfile
import tempfile
import time
import zipfile
import zlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scripts.foundry import bootstate, bundles, host
from scripts.foundry import storage as storage_mod
from scripts.foundry.storage import JUNK_NAMES, Entry, Storage, StorageError

# ── Locations ────────────────────────────────────────────────────────────────

# Cloud subfolders, relative to the cloud root (storage.py resolves the root).
ASSETS_IN = "assets"              # you put zips here
WORLD_BACKUPS = "world-backups"   # automatic, rolling, per host
SYSTEM_BACKUP = "system-backup"   # legacy: no longer written (systems are bundles);
                                  # still swept for stale .partial uploads
# Never pruned. One snapshot per host per Foundry GENERATION: the last state captured
# while that host was still on it.
MAJOR_RELEASES = "major-release"

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "foundry" / "assets-manifest.json"

# Default per-host retention; PENTARYN_KEEP_SNAPSHOTS overrides (host.keep_snapshots()).
KEEP_SNAPSHOTS = 10

# Restore safety copies are kept apart from the rolling ten: this many per host, so
# repeated "take the latest" boots on the alt never push regular snapshots out.
KEEP_SAFETY_COPIES = 3

# A snapshot taken while this host's newest one is younger than this REPLACES it.
COALESCE_WINDOW_DAYS = 5

# A crash between upload and rename leaves a `.partial`; younger ones may be the other
# machine mid-upload, so only these are swept.
STALE_PARTIAL_SECONDS = 24 * 3600

# Where tars are built and downloads land: on the data volume, outside SNAPSHOT_PATHS.
TMP_DIRNAME = ".pentaryn-tmp"

# The disk check's world-tar estimate when this host has no regular snapshot to measure.
WORLD_ESTIMATE_BYTES = 64 * 10**6

# A bundle no retained snapshot references is swept once its upload is this old.
GC_GRACE_DAYS = round(bundles.GC_GRACE_SECONDS / 86400)

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

# What a FULL (legacy, before module bundles) snapshot contains, relative to FOUNDRY_DATA.
# A full restore still clears all three; the boot clock (local_tree_mtime) still reads them.
SNAPSHOT_PATHS = ["Data/worlds", "Config", "Data/modules"]

# What a BUNDLED snapshot contains: the world and Config only. Every folder under
# Data/modules and Data/systems is a content-addressed bundle in the cloud's bundles/
# (scripts/foundry/bundles.py), named by the snapshot's manifest.
WORLD_PATHS = ["Data/worlds", "Config"]

# The first member of a bundled snapshot's tar: {"bundled": 1, "modules", "systems",
# "host", "core"}. Authoritative; the `.parent` sidecar carries a copy. Never extracted.
SNAPSHOT_MARKER = "pentaryn-snapshot.json"

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
    "                Snapshots of the campaign and Config (~45 MB each),\n"
    "                written on every server stop and start, named\n"
    "                world-<UTC stamp>-fvtt<version>-<machine>.tar.gz.\n"
    f"                Each machine keeps its own most recent {KEEP_SNAPSHOTS}, and a snapshot\n"
    f"                taken within {COALESCE_WINDOW_DAYS} days of that machine's previous one\n"
    "                REPLACES it. Names without a machine are from before 2026-10-11;\n"
    "                nothing deletes those automatically.\n"
    "                A name ending .safety.tar.gz is the state a restore replaced;\n"
    f"                each machine keeps its last {KEEP_SAFETY_COPIES} of those as well.\n"
    "                A name ending .parent is that snapshot's lineage and bundle manifest\n"
    "                (tiny): which bundle each module and system was at.\n"
    "                Older snapshots (names without a machine, and the first -mac one)\n"
    "                hold the modules too (~2.5-3.3 GB) and restore as before.\n"
    "                A name ending .partial is an upload in progress (or a crash, swept\n"
    "                after a day) — never a snapshot.\n\n"
    "major-release/  AUTOMATIC — never pruned.\n"
    "                When Foundry moves to a new generation (14 -> 15), the\n"
    "                last snapshot each machine took on the old one is preserved\n"
    "                here. Deleting one is you deciding you are never going back.\n\n"
    "bundles/        AUTOMATIC — do not edit. Shared by both machines.\n"
    "                One tar per module or game system per content fingerprint:\n"
    "                module@<id>@<version>@<fingerprint>.tar.gz, system@... the same.\n"
    "                A backup uploads only the bundles this folder lacks, so the\n"
    "                map packs go up once; a restore downloads only the bundles the\n"
    "                machine lacks. A bundle is deleted only when no kept snapshot\n"
    f"                lists it and it is older than {GC_GRACE_DAYS} days.\n\n"
    "system-backup/  LEGACY — no longer written (systems are bundles now).\n"
    "                Safe to delete by hand.\n\n"
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
        for sub in (WORLD_BACKUPS, SYSTEM_BACKUP, bundles.BUNDLES):
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


def snapshots(st: Storage | None = None, folder: str = WORLD_BACKUPS, *,
              fresh: bool = False) -> list[Snapshot]:
    """Every parseable snapshot in one folder, oldest first by (stamp, name). `fresh`
    drops this process's cached listing first (storage.refresh)."""
    st = st or store()
    if fresh:
        storage_mod.refresh(st, folder)
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


# ── Lineage: `<snapshot>.parent` sidecars ────────────────────────────────────
#
# Each snapshot gets a small JSON sidecar, written before the upload's rename, naming the
# snapshot its tree was based on and that one's ancestors (newest first, capped), with
# each ancestor's listing mtime beside it (`ancestor_mtimes`, same order). One
# read then answers "does this snapshot contain the one my world is based on?" — even
# after coalescing and pruning have deleted the snapshots in between. A sidecar never
# parses as a snapshot (it does not end in .tar.gz).
#
# Every chain starts somewhere this code cannot see into: a tree with no based-on record
# (a lost or corrupt state file, a first run), a legacy untagged snapshot, an adopted
# marker. `origin_before` carries that edge: the listing mtime at or before which this
# tree may hold snapshots its list does not name. A snapshot not in the list is
# "diverged" only when it is newer than that; older, it is "cannot tell". A tree with no
# record at all writes `"ancestors": null` — unknown, never "no ancestors". A sidecar
# with no edge (`null`, or an older format without the key) reads as unbounded.
#
# The list is cut at LINEAGE_CAP; the cut moves the edge only to the newest DROPPED
# ancestor's mtime, so the "diverged" window shrinks by the dropped generations alone.

PARENT_SUFFIX = ".parent"
LINEAGE_CAP = 2000


def parent_rel(folder: str, name: str) -> str:
    return f"{folder}/{name}{PARENT_SUFFIX}"


@dataclass(frozen=True)
class Ancestry:
    """What a snapshot's tree contains: `names` (newest first) for certain, and possibly
    any snapshot whose listing mtime is at or before `origin_before`. `mtimes` runs
    beside `names` (None where an older sidecar did not record one)."""
    names: tuple[str, ...]
    origin_before: float
    mtimes: tuple[float | None, ...] = ()


def _finite(x) -> float | None:
    """`x` as a finite float, else None — never NaN or ±Infinity (non-strict JSON)."""
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return None
    x = float(x)
    return x if math.isfinite(x) else None


def read_lineage(st: Storage, snap: Snapshot) -> Ancestry | None:
    """`snap`'s ancestry; None when it has no sidecar (legacy, or unreadable) or its
    sidecar says the lineage is unknown — "unknown", never "diverged"."""
    try:
        raw = st.read_text(parent_rel(snap.folder, snap.name))
    except StorageError:
        return None
    if not raw:
        return None
    try:
        data = json.loads(raw)
        anc = data.get("ancestors")
        if not isinstance(anc, list):
            return None
        origin = _finite(data.get("origin_before"))
        # A sidecar without the edge (an older format) cannot say where its chain began:
        # treat every snapshot it does not name as "cannot tell".
        origin = float("inf") if origin is None else origin
        raw_m = data.get("ancestor_mtimes")
        raw_m = raw_m if isinstance(raw_m, list) and len(raw_m) == len(anc) else [None] * len(anc)
        pairs = [(str(a), _finite(m)) for a, m in zip(anc, raw_m) if a]
        return Ancestry(tuple(a for a, _ in pairs), origin, tuple(m for _, m in pairs))
    except (ValueError, TypeError, AttributeError):
        return None


def read_ancestry(st: Storage, snap: Snapshot) -> list[str] | None:
    """`snap`'s ancestors' names, newest first; None when unknown."""
    a = read_lineage(st, snap)
    return None if a is None else list(a.names)


def descends(st: Storage, snap: Snapshot, based_on: str | None,
             based_on_mtime: float | None = None) -> bool | None:
    """Does `snap` contain the state `based_on` names? True, False ("diverged"), or None
    when it cannot be told: no sidecar, an unknown lineage, or `based_on` old enough to
    sit before the chain's unknown root (or in the part cut at LINEAGE_CAP)."""
    if not based_on:
        return None
    if snap.name == based_on:
        return True
    anc = read_lineage(st, snap)
    if anc is None:
        return None
    if based_on in anc.names:
        return True
    if based_on_mtime is None or based_on_mtime <= anc.origin_before:
        return None
    return False


def next_lineage(state: bootstate.BootState
                 ) -> tuple[list[str] | None, list[float | None] | None, float | None]:
    """The (ancestors, their mtimes, origin_before) a snapshot of this tree carries.

    No based-on record: (None, None, None) — unknown. Otherwise the based-on snapshot and
    its ancestors, with the edge inherited from it; when its own lineage is unknown
    (legacy, adopted marker, no sidecar) the edge is its own mtime — it may hold anything
    older.

    Cutting at LINEAGE_CAP moves the edge to the newest DROPPED ancestor's mtime: the
    dropped ones are all at or before it, and every kept one stays named. Not the
    based-on snapshot's own mtime — that would turn every snapshot older than the
    based-on one into "cannot tell", and after enough generations a diverged line reads
    as plain "newer". Nor a time read from a name (legacy stamps are Mac local time).
    With the dropped one's mtime unknown (an older sidecar), the oldest kept ancestor
    with a known mtime still bounds it; failing that, the based-on snapshot's."""
    if not state.based_on:
        return None, None, None
    lineage = list(state.lineage)
    lm = list(state.lineage_mtimes or [])
    lm = lm if len(lm) == len(lineage) else [None] * len(lineage)
    pairs = [(state.based_on, state.based_on_mtime)] + [
        (a, m) for a, m in zip(lineage, lm) if a != state.based_on]
    edge_self = state.based_on_mtime if state.based_on_mtime is not None else time.time()
    origin = _finite(state.lineage_origin_before)
    if origin is None:
        origin = edge_self
    if len(pairs) > LINEAGE_CAP:
        kept, dropped = pairs[:LINEAGE_CAP], pairs[LINEAGE_CAP:]
        edge = dropped[0][1]
        if edge is None:
            edge = next((m for _, m in reversed(kept) if m is not None), edge_self)
        pairs = kept
        origin = max(origin, edge)
    return [a for a, _ in pairs], [_finite(m) for _, m in pairs], origin


def _delete_snapshot(st: Storage, snap: Snapshot) -> None:
    """The snapshot, then its sidecar (best effort — an orphan sidecar is harmless)."""
    st.delete(snap.rel)
    try:
        st.delete(parent_rel(snap.folder, snap.name))
    except StorageError:
        pass


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

def _tree_digest(paths: list[str]) -> str:
    """Content hash (path, size, int mtime) of every file under `paths`."""
    root = data_root()
    h = hashlib.sha256()
    for rel in paths:
        base = root / rel
        if not base.exists():
            continue
        for p in sorted(base.rglob("*")):
            if p.is_file():
                h.update(str(p.relative_to(root)).encode())
                h.update(str(p.stat().st_size).encode())
                h.update(str(int(p.stat().st_mtime)).encode())
    return h.hexdigest()


def world_tree_digest() -> str:
    """The world snapshot's own files (WORLD_PATHS), by path, size and int mtime."""
    return _tree_digest(WORLD_PATHS)


def legacy_snapshot_digest() -> str:
    """The pre-bundles formula over SNAPSHOT_PATHS — what `.last-digest` markers hold."""
    return _tree_digest(SNAPSHOT_PATHS)


def snapshot_digest(manifest: dict | None = None) -> str:
    """What a bundled snapshot of this tree would hold: the world tree plus the manifest
    (each module/system's bundle name). A Foundry launch changes neither for an untouched
    module — the fingerprint ignores LevelDB housekeeping — so the digest-skip holds."""
    if manifest is None:
        manifest = bundles.manifest(bundles.local_inventory())
    m = {"modules": manifest.get("modules") or {}, "systems": manifest.get("systems") or {}}
    return hashlib.sha256((world_tree_digest() + "\n" + json.dumps(m, sort_keys=True))
                          .encode()).hexdigest()


def local_tree_mtime() -> float | None:
    """The newest file mtime under SNAPSHOT_PATHS, or None when there is no local world.

    The boot choice's fallback clock when this machine has no based-on record: a cloud
    snapshot older than the local files cannot be called newer."""
    if not tree_has_world():
        return None
    root = data_root()
    newest_m = None
    for rel in SNAPSHOT_PATHS:
        base = root / rel
        if not base.exists():
            continue
        for p in base.rglob("*"):
            try:
                if p.is_file():
                    m = p.stat().st_mtime
                    newest_m = m if newest_m is None or m > newest_m else newest_m
            except OSError:
                continue
    return newest_m


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
    if base is None:
        return state
    # The marker holds the old formula (legacy_snapshot_digest). What is recorded is this
    # tree's digest in the current formula, so the next backup sees "unchanged" and skips.
    current = snapshot_digest(bundles.manifest(bundles.local_inventory(warn=lambda _m: None)))
    if marker not in (legacy_snapshot_digest(), current):
        return state
    state.record_snapshot(base.name, None, base.mtime, current, by="adopt-legacy-marker",
                          lineage=[])
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
            protect: Snapshot | None = None) -> Snapshot | None:
    """The snapshot uploaded, or None when skipped (unchanged, or nothing to archive).

    `protect` is the snapshot a restore is about to extract: this run must not delete it
    (neither coalescing nor pruning may remove the state the based-on record is about to
    point at), and an unchanged tree it already contains needs no safety copy."""
    state = adopt_legacy_marker(st, bootstate.load())
    inv = bundles.local_inventory()
    manifest = bundles.manifest(inv)
    digest = snapshot_digest(manifest)
    # Fresh listings: in a boot process the prompt's restore_cost (or the boot choice)
    # listed both folders earlier, possibly while Joe sat at the prompt.
    try:
        existing = snapshots(st, WORLD_BACKUPS, fresh=True)
    except StorageError as exc:
        die(f"cannot list {WORLD_BACKUPS}/: {exc}")
    try:
        have = bundles.listing(st, fresh=True)
    except StorageError as exc:
        die(f"cannot list {bundles.BUNDLES}/: {exc}")
    if state.digest == digest:
        # Unchanged since the last upload or restore — but "skip" is only safe while that
        # snapshot still exists. Coalescing, pruning or prune-untagged (on either machine)
        # may have deleted it, and then this tree has no cloud copy at all.
        if state.based_on and _in_cloud(st, state.based_on, existing):
            _heal_bundles(st, inv, have)
            log("no change since the last snapshot — skipped")
            return None
        if (safety and protect is not None and state.based_on
                and descends(st, protect, state.based_on, state.based_on_mtime) is True):
            log(f"no change since {state.based_on}, which {protect.name} contains — "
                "no safety copy needed")
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
    keep_name = protect.name if protect else None
    contained = {state.based_on, *state.lineage} - {None}
    superseded = None if safety else _coalesce_target(existing, me, keep_name, contained)

    tmp = tmp_dir() / name
    missing = [loc for loc in inv.values() if loc.name not in have]
    last = newest([s for s in own(existing, me) if not s.safety])
    _check_backup_disk(tmp.parent, last.size if last else WORLD_ESTIMATE_BYTES, missing)

    # Stage every bundle the cloud lacks, then the world tar (the marker first).
    staged = {loc.name: bundles.build(loc, tmp_dir() / bundles.STAGING) for loc in missing}
    _build_world_tar(tmp, {"bundled": 1, "modules": manifest["modules"],
                           "systems": manifest["systems"], "host": me, "core": core})
    size = tmp.stat().st_size
    ancestors, ancestor_mtimes, origin = next_lineage(state)
    log(f"uploading {name} ({_mb(size)}, {reason}) to {st.root}"
        + (f" with {len(staged)} new bundle(s) "
           f"({_mb(sum(p.stat().st_size for p in staged.values()))})" if staged else "")
        + "...")
    try:
        # Bundles, then the sidecar, then the snapshot: by the time the snapshot's name
        # appears, its lineage and every bundle its manifest names exist.
        bundles.upload_missing(st, staged, have)
        st.write_text(parent_rel(WORLD_BACKUPS, name), json.dumps(
            {"parent": state.based_on, "ancestors": ancestors,
             "ancestor_mtimes": ancestor_mtimes, "origin_before": _finite(origin),
             "host": me, "bundled": 1, "modules": manifest["modules"],
             "systems": manifest["systems"]}, allow_nan=False) + "\n")
        st.upload(tmp, f"{WORLD_BACKUPS}/{name}")
    except StorageError as exc:
        bundle_lines = "".join(f"\n    a bundle is still on disk: {p}"
                               for p in staged.values() if p.exists())
        die(f"upload failed: {exc}\n"
            f"    the snapshot is still on disk: {tmp}{bundle_lines}\n"
            f"    rerun the backup (bundles already uploaded are not sent again), or finish "
            f"it by hand: rclone copyto \"{tmp}\" {st.root}/{WORLD_BACKUPS}/{name}")
    rebuilt: list[Path] = []
    try:
        # The snapshot's name is up: every bundle its manifest names must still be there
        # (the other host's GC may have swept one between the listing and now).
        _verify_bundles(st, name, manifest, staged, rebuilt)
    except (StorageError, _Incomplete) as exc:
        for p in (tmp, *staged.values(), *rebuilt):
            p.unlink(missing_ok=True)
        try:
            _delete_snapshot(st, Snapshot(stamp, name, me, core, size, time.time(),
                                          WORLD_BACKUPS, safety))
            gone = f"\n    {name} was removed from the cloud again; rerun the backup"
        except StorageError:
            gone = (f"\n    {name} could not be removed from the cloud (a restore of it "
                    "refuses: a bundle is missing); rerun the backup")
        why = str(exc) if isinstance(exc, _Incomplete) else (
            f"verifying the bundles of {name} failed: {exc} — snapshot {name} is incomplete")
        die(why + gone)
    for p in (tmp, *staged.values(), *rebuilt):
        p.unlink(missing_ok=True)

    entry = next((e for e in st.ls(WORLD_BACKUPS) if e.name == name), None)
    snap = parse_snapshot(entry or Entry(name, size, time.time()), WORLD_BACKUPS)
    state.record_snapshot(name, me, snap.mtime, digest, by="backup", lineage=ancestors,
                          lineage_mtimes=ancestor_mtimes, origin_before=_finite(origin),
                          keep_local=None)
    log(f"snapshot → {name} ({_mb(size)}, {reason})")
    # The shared digest marker is retired: the digest is local now (bootstate). Only the
    # primary — the Mac, which wrote it — may delete it, and only once it has backed up
    # (so its first boot has already had the chance to adopt it). The alt backing up
    # first must not take that chance away.
    if host.role() == "primary":
        try:
            st.delete(f"{WORLD_BACKUPS}/.last-digest")
        except StorageError:
            pass

    if superseded:
        age_days = (time.time() - superseded.mtime) / 86400
        _delete_snapshot(st, superseded)
        log(f"replaced {superseded.name} ({age_days:.1f} days old, inside the "
            f"{COALESCE_WINDOW_DAYS}-day window)")

    mine = [s for s in own(snapshots(st, WORLD_BACKUPS), me) if s.name != keep_name]
    regular = [s for s in mine if not s.safety]
    safeties = [s for s in mine if s.safety]
    for stale in regular[:-keep] + safeties[:-KEEP_SAFETY_COPIES]:
        _delete_snapshot(st, stale)
        log(f"pruned {stale.name}")
    log(f"{min(len(regular), keep)} of {keep} snapshots kept for {me}"
        + (f", and {min(len(safeties), KEEP_SAFETY_COPIES)} of {KEEP_SAFETY_COPIES} "
           "restore safety copies" if safeties else ""))
    _gc_after_backup(st)
    return snap


class _Incomplete(Exception):
    """A bundle the new snapshot names is gone from the cloud and cannot be rebuilt."""


def _check_backup_disk(where: Path, world: int, missing: list) -> None:
    """free ≥ 2 × (the world tar's estimate + every bundle this backup stages), else die
    with both numbers: everything is built locally before it is uploaded."""
    bundle_bytes = sum(loc.bytes for loc in missing)
    need = world + bundle_bytes
    free = shutil.disk_usage(where).free
    if free < 2 * need:
        die(f"only {_mb(free)} free on {where} — this backup builds ~{_mb(need)} locally "
            f"before upload (the world ~{_mb(world)} + {len(missing)} new bundle(s) "
            f"{_mb(bundle_bytes)}); free at least twice that")


def _heal_bundles(st: Storage, inv: dict, have: dict[str, Entry]) -> None:
    """The tree is unchanged and its snapshot is in the cloud, but a bundle the manifest
    names is not (deleted by hand): upload just those (§3.5 step 3)."""
    lost = [loc for loc in inv.values() if loc.name not in have]
    if not lost:
        return
    _check_backup_disk(tmp_dir(), 0, lost)
    staged: dict[str, Path] = {}
    try:
        for loc in lost:
            staged[loc.name] = bundles.build(loc, tmp_dir() / bundles.STAGING)
        up = bundles.upload_missing(st, staged, have)
    except StorageError as exc:
        die(f"uploading a bundle the cloud had lost failed: {exc} — rerun the backup")
    finally:
        for p in staged.values():
            p.unlink(missing_ok=True)
    log(f"uploaded {len(up)} bundle(s) the cloud had lost")


def _verify_bundles(st: Storage, name: str, manifest: dict, staged: dict[str, Path],
                    rebuilt: list[Path]) -> None:
    """§3.5 step 6: re-list bundles/; upload again every manifest name that vanished —
    from its staged tar, or rebuilt from the live folder when its fingerprint still
    matches. Raises _Incomplete naming the module when it does not; `rebuilt` collects
    the tars built here, for the caller to delete. The listing is always fresh: over
    rclone a cached one would never show what the other host swept meanwhile."""
    now = bundles.listing(st, fresh=True)
    lost = sorted(n for n in bundles.manifest_names(manifest) if n not in now)
    live = None
    for n in lost:
        src = staged.get(n)
        if src is None or not src.exists():
            ref = bundles.parse_bundle(n)
            if live is None:
                live = bundles.local_inventory(cache=False, warn=lambda _m: None)
            loc = live.get(ref.key)
            if loc is None or loc.name != n:
                raise _Incomplete(
                    f"{ref.kind} {ref.id}: its bundle {n} vanished from the cloud and the "
                    f"local folder changed since — snapshot {name} is incomplete")
            src = bundles.build(loc, tmp_dir() / bundles.STAGING)
            rebuilt.append(src)
        log(f"bundle {n} vanished from the cloud during this backup — uploading it again")
        st.upload(src, f"{bundles.BUNDLES}/{n}")


def referenced_bundles(st: Storage) -> set[str]:
    """GC's mark phase (§3.7): every bundle any tagged snapshot's manifest names — regular
    and .safety, every host, in world-backups/ and major-release/. Untagged snapshots
    predate sidecars and name nothing; a full-era sidecar names nothing.

    "Cannot tell" never shrinks the mark. A tagged snapshot whose sidecar is missing,
    empty or torn (not JSON) is marked from its tar's first member instead (the
    authoritative SNAPSHOT_MARKER, read from the first bytes of the tar): a promotion
    whose sidecar copy failed, a sidecar cut short. A sidecar or tar head that cannot be
    read, a sidecar that says bundled but is malformed, or a tar head that cannot be
    parsed raises StorageError: the caller must not sweep on a partial mark."""
    return _mark(st)[0]


def _mark(st: Storage, skip: frozenset[str] = frozenset()
          ) -> tuple[set[str], set[str]]:
    """(referenced bundle names, the snapshots read) over fresh listings; snapshots named
    in `skip` (by `rel`) were read by an earlier pass and are not read again."""
    out: set[str] = set()
    seen: set[str] = set()
    for folder in (WORLD_BACKUPS, MAJOR_RELEASES):
        for s in snapshots(st, folder, fresh=True):
            if s.host is None or s.rel in skip:
                continue
            seen.add(s.rel)
            kind, m = _read_sidecar(st, s)
            if kind == "bad":
                raise StorageError(f"the sidecar of {s.rel} says bundled but its manifest is "
                                   "malformed", verb="cat")
            if kind == "absent":
                m = _manifest_from_tar_head(st, s)
            if m is not None:
                out |= bundles.manifest_names(m)
    return out, seen


# How much of a snapshot tar GC reads when its sidecar is lost: the marker is the first
# member (a few KB of JSON), so the first 256 KiB of the gzip always hold it.
MARKER_HEAD_BYTES = 256 * 1024


def _marker_from_head(head: bytes) -> tuple[bool, dict | None]:
    """(marker present, its manifest) from the first bytes of a snapshot tar. Raises
    ValueError when those bytes cannot answer (not gzip, cut inside the first member, a
    marker that is not a valid manifest)."""
    try:
        raw = zlib.decompressobj(16 + zlib.MAX_WBITS).decompress(head, 16 * 1024 * 1024)
    except zlib.error as exc:
        raise ValueError(f"not a gzip stream: {exc}") from exc
    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:") as tar:
            first = tar.next()
            if first is None:
                raise ValueError("no first member")
            if first.name != SNAPSHOT_MARKER:
                return False, None
            fh = tar.extractfile(first) if first.isfile() else None
            body = fh.read() if fh else b""
            if len(body) != first.size:
                raise ValueError(f"{SNAPSHOT_MARKER} is cut short")
    except tarfile.TarError as exc:
        raise ValueError(f"not a readable tar head: {exc}") from exc
    try:
        parsed = _parse_manifest(json.loads(body))
    except ValueError:
        parsed = None
    if parsed is None:
        raise ValueError(f"its {SNAPSHOT_MARKER} is not a valid manifest")
    return True, parsed


def _manifest_from_tar_head(st: Storage, s: Snapshot) -> dict | None:
    """The manifest `s`'s tar marker names (None: a full tar, or the tar is gone since
    the listing — it then needs nothing). Raises StorageError when it cannot tell."""
    head = st.read_head(s.rel, MARKER_HEAD_BYTES)
    if head is None:
        return None
    try:
        _marked, m = _marker_from_head(head)
    except ValueError as exc:
        raise StorageError(f"the sidecar of {s.rel} is missing or unreadable, and so is its "
                           f"tar's {SNAPSHOT_MARKER} ({exc})", verb="cat") from exc
    return m


def _gc_after_backup(st: Storage) -> None:
    """Sweep the bundles no retained snapshot references (after the grace period). Never
    fatal: the snapshot is already recorded; any failure is one warning line."""
    try:
        refs = referenced_bundles(st)
    except StorageError as exc:
        print(f"  ⚠ bundle GC skipped: cannot read every snapshot's manifest ({exc}) — "
              "nothing was deleted", file=sys.stderr)
        return
    try:
        swept = bundles.gc(st, referenced=refs)
    except StorageError as exc:
        print(f"  ⚠ bundle GC stopped part-way: {exc} — the next backup sweeps the rest",
              file=sys.stderr)
        return
    if not swept:
        log(f"swept 0 bundles (none unreferenced for {GC_GRACE_DAYS} days)")


def _build_world_tar(tmp: Path, marker: dict) -> None:
    """The world snapshot: SNAPSHOT_MARKER first (a restore reads only that member to
    tell bundled from full), then each WORLD_PATHS entry that exists."""
    data = (json.dumps(marker, sort_keys=True, indent=1) + "\n").encode()
    try:
        with tarfile.open(tmp, "w:gz") as tar:
            info = tarfile.TarInfo(SNAPSHOT_MARKER)
            info.size, info.mtime, info.mode = len(data), int(time.time()), 0o644
            tar.addfile(info, io.BytesIO(data))
            for rel in WORLD_PATHS:
                src = data_root() / rel
                if src.exists():
                    tar.add(src, arcname=rel)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def _coalesce_target(existing: list[Snapshot], me: str, protect: str | None = None,
                     contained: set[str] | None = None) -> Snapshot | None:
    """This host's newest regular snapshot, if young enough to be replaced. Never another
    host's, never an untagged one, never a safety copy, never `protect` — and only one
    the new snapshot's tree contains (`contained`: its based-on and lineage). After a
    restore of another line, this host's newest may be the only copy of a session the
    restore replaced (no safety copy was made: it was already in the cloud); replacing
    it with a snapshot of the other line would lose that session."""
    mine = [s for s in own(existing, me) if not s.safety]
    last = newest(mine)
    if last is None or last.name == protect:
        return None
    if contained is not None and last.name not in contained:
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
    _repair_preserved_sidecars(st, me, mine)
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
    # The sidecar FIRST: a crash between the two copies leaves an orphan sidecar (harmless,
    # and the next backup promotes again), never a preserved tar without its manifest.
    _copy_preserved_sidecar(st, source)
    st.copy(source.rel, f"{MAJOR_RELEASES}/{source.name}")
    log(f"Foundry {previous} → {current}: preserved {source.name} in major-release/ "
        f"({_mb(source.size)}, never pruned)")
    return source


def _copy_preserved_sidecar(st: Storage, source: Snapshot) -> bool:
    """Copy `source`'s sidecar (lineage + bundle manifest) into major-release/: read, then
    write, the write tried twice. A failure is a loud warning, never silent: GC then
    reads the preserved tar's own marker (referenced_bundles), so its bundles stay marked
    and the copy stays restorable — only its lineage is lost."""
    try:
        sidecar = st.read_text(parent_rel(WORLD_BACKUPS, source.name))
    except StorageError as exc:
        _lifecycle_warning(f"could not read the sidecar of {source.name} to preserve it", exc,
                           "the preserved copy's own marker names its bundles")
        return False
    if not sidecar:
        return False
    err: StorageError | None = None
    for _attempt in range(2):
        try:
            st.write_text(parent_rel(MAJOR_RELEASES, source.name), sidecar)
            return True
        except StorageError as exc:
            err = exc
    _lifecycle_warning(f"could not copy the sidecar of {source.name} to {MAJOR_RELEASES}/",
                       err, "the preserved copy's own marker names its bundles; the next "
                       "backup copies the sidecar again while its source is still kept")
    return False


def _repair_preserved_sidecars(st: Storage, me: str, mine: list[Snapshot]) -> None:
    """This host's preserved snapshots whose sidecar copy failed at promotion: copy it now
    while the source is still in the rolling window (one major-release/ listing, which
    the backup reads anyway). Best effort — the preserved tar's marker still names its
    bundles for GC."""
    rolling = {s.name for s in mine}
    try:
        names = {e.name for e in st.ls(MAJOR_RELEASES)}
    except StorageError:
        return
    for kept in snapshots(st, MAJOR_RELEASES):
        if (kept.host == me and kept.name in rolling
                and f"{kept.name}{PARENT_SUFFIX}" not in names
                and _copy_preserved_sidecar(st, kept)):
            log(f"copied the missing sidecar of {MAJOR_RELEASES}/{kept.name}")


# ── Restore ──────────────────────────────────────────────────────────────────

class RestoreError(RuntimeError):
    """A restore refused before anything local was touched (fetch_snapshot), or a local
    tar that cannot be applied here (extract_snapshot). The message says why."""


# Downloads for a restore land here (a fixed folder, cleared before and after each fetch,
# so a crash leftover never mixes with a new fetch); never the backup's staging folder.
FETCH_DIRNAME = "fetch"


def _parse_manifest(data) -> dict | None:
    """{"modules": {id: name}, "systems": {id: name}} from a sidecar's or a marker's JSON
    object; None unless it says "bundled" and every entry is a bundle name of its kind
    and id."""
    if not isinstance(data, dict) or not data.get("bundled"):
        return None
    out: dict[str, dict[str, str]] = {}
    for kind, plural in (("module", "modules"), ("system", "systems")):
        section = data.get(plural) or {}
        if not isinstance(section, dict):
            return None
        for id, name in section.items():
            ref = bundles.parse_bundle(name) if isinstance(name, str) else None
            if ref is None or ref.kind != kind or ref.id != id:
                return None
        out[plural] = dict(sorted(section.items()))
    return out


def _read_sidecar(st: Storage, snap: Snapshot) -> tuple[str, dict | None]:
    """What `snap`'s sidecar says about bundles: ("absent", None) — no sidecar, or not
    JSON (lost); ("full", None) — a sidecar without "bundled" (lineage only, the full
    era); ("bundled", manifest); ("bad", None) — says bundled, entries malformed. A
    sidecar that cannot be READ raises StorageError."""
    raw = st.read_text(parent_rel(snap.folder, snap.name))
    if not raw:
        return "absent", None
    try:
        data = json.loads(raw)
    except ValueError:
        return "absent", None
    if not isinstance(data, dict) or not data.get("bundled"):
        return "full", None
    m = _parse_manifest(data)
    return ("bundled", m) if m is not None else ("bad", None)


def read_manifest(st: Storage, snap: Snapshot) -> dict | None:
    """The bundle manifest `snap`'s sidecar records; None for a full snapshot (no sidecar,
    an unparsable one, or one without "bundled"). A sidecar that cannot be READ raises
    StorageError — "unreadable" is never taken to mean "full"."""
    return _read_sidecar(st, snap)[1]


def _read_marker(tar_path: Path) -> tuple[bool, dict | None]:
    """(marker present, its manifest) from the tar's FIRST member only. A marker that is
    present but not a valid bundled manifest raises RestoreError."""
    with tarfile.open(tar_path, "r:gz") as tar:
        first = tar.next()
        if first is None or first.name != SNAPSHOT_MARKER:
            return False, None
        fh = tar.extractfile(first) if first.isfile() else None
        try:
            parsed = _parse_manifest(json.loads(fh.read())) if fh else None
        except ValueError:
            parsed = None
    if parsed is None:
        raise RestoreError(f"{tar_path.name}: its {SNAPSHOT_MARKER} is not a valid manifest")
    return True, parsed


@dataclass
class Fetched:
    """Everything a restore needs, on local disk and verified. `manifest` None → a full
    (legacy) snapshot, and the three plans below are empty."""
    snap: Snapshot | None              # None for a local tar path (the updater)
    tar: Path
    manifest: dict | None
    bundle_tars: dict[str, Path]       # bundle name → downloaded tar, for every `needed`
    needed: dict[str, str]             # "<kind>/<id>" → bundle name to install
    extras: list[str]                  # "<kind>/<id>" here, absent from the manifest
    unchanged: list[str]               # "<kind>/<id>" here at the manifest's bundle
    cleanup: list[Path] = field(default_factory=list)   # temp files/dirs to remove


def _bundle_plan(manifest: dict, *, systems: bool = True, warn=None
                 ) -> tuple[dict[str, str], list[str], list[str]]:
    """(needed, extras, unchanged) of `manifest` against this machine's inventory. The
    bundle cache is read, not written: planning a restore changes nothing on disk. With
    `systems=False` a system is never needed (the caller leaves Data/systems alone)."""
    inv = bundles.local_inventory(save=False, warn=warn)
    want = bundles.manifest_keys(manifest)
    differ = {k: n for k, n in want.items() if inv.get(k) is None or inv[k].name != n}
    needed = {k: n for k, n in differ.items() if systems or not k.startswith("system/")}
    extras = sorted(k for k in inv if k not in want)
    unchanged = sorted(k for k in want if k not in differ)
    return needed, extras, unchanged


def discard_fetched(f: Fetched) -> None:
    """Remove a fetch's temp files (the downloaded world tar, the bundle downloads)."""
    for p in f.cleanup:
        try:
            if p.is_dir() and not p.is_symlink():
                shutil.rmtree(p, ignore_errors=True)
            else:
                p.unlink(missing_ok=True)
        except OSError:
            pass


def fetch_snapshot(st: Storage, snap: Snapshot, *, systems: bool = True) -> Fetched:
    """Download `snap` and every bundle this machine lacks for it, and verify them; touch
    nothing local. Raises RestoreError (temp files removed) when the cloud lacks a bundle,
    a download fails or arrives short, or the sidecar and the tar's marker disagree.

    The tar's first member (SNAPSHOT_MARKER) is authoritative. A sidecar that is present
    must agree with it both ways; a sidecar that is missing (lost, or the tar renamed by
    hand) is not a disagreement — the marker then names the bundles. With
    `systems=False` (the updater) no system bundle is needed or downloaded."""
    try:
        side, side_manifest = _read_sidecar(st, snap)
    except StorageError as exc:
        raise RestoreError(f"cannot read the sidecar of {snap.name} — nothing local was "
                           f"touched: {exc}") from exc
    local_tar = tmp_dir() / snap.name
    fetch_dir = tmp_dir() / FETCH_DIRNAME
    f = Fetched(snap, local_tar, None, {}, {}, [], [], cleanup=[local_tar, fetch_dir])
    have: dict[str, Entry] = {}

    def plan(manifest: dict) -> None:
        nonlocal have
        f.manifest = manifest
        f.needed, f.extras, f.unchanged = _bundle_plan(manifest, systems=systems)
        try:
            have = bundles.listing(st, fresh=True)
        except StorageError as exc:
            raise RestoreError(f"cannot list {bundles.BUNDLES}/ — nothing local was "
                               f"touched: {exc}") from exc
        gone = [f"{n} ({k})" for k, n in f.needed.items() if n not in have]
        if gone:
            raise RestoreError(f"cannot restore {snap.name} completely — missing from the "
                               f"cloud: {', '.join(gone)} — nothing local was touched")

    def check_disk(world: int) -> None:
        bundle_bytes = sum(have[n].size for n in f.needed.values())
        need = world + bundle_bytes
        free = shutil.disk_usage(tmp_dir()).free
        if free < 2 * need:
            raise RestoreError(
                f"only {_mb(free)} free on {tmp_dir()} — restoring {snap.name} downloads "
                f"~{_mb(need)} (the world {_mb(world)} + {len(f.needed)} bundle(s) "
                f"{_mb(bundle_bytes)}); free at least twice that — nothing local was touched")

    try:
        if side == "bundled":
            plan(side_manifest)            # before the download: a missing bundle costs 0 B
        check_disk(snap.size)              # before any download
        shutil.rmtree(fetch_dir, ignore_errors=True)
        log(f"downloading {snap.name} ({_mb(snap.size)}, {snap.host_label})...")
        try:
            st.download(snap.rel, local_tar)
        except StorageError as exc:
            raise RestoreError(f"download of {snap.name} failed — nothing local was touched: "
                               f"{exc}\n    to boot the local world instead: "
                               "make foundry-up FROM=local") from exc
        if local_tar.stat().st_size != snap.size:
            raise RestoreError(f"download of {snap.name} is {local_tar.stat().st_size} B, the "
                               f"cloud says {snap.size} B — nothing local was touched")
        try:
            marked, in_tar = _read_marker(local_tar)
        except (tarfile.TarError, OSError, EOFError, zlib.error) as exc:
            raise RestoreError(f"{snap.name} is not a readable snapshot — nothing local was "
                               f"touched: {exc}") from exc
        why = None
        if side == "bad":
            why = "the sidecar says bundled but its manifest is malformed"
        elif side == "full" and marked:
            why = "the snapshot is bundled, its sidecar is not"
        elif side == "bundled" and not marked:
            why = "the sidecar says bundled, the snapshot has no marker"
        elif side == "bundled" and in_tar != side_manifest:
            why = "the sidecar names other bundles than the snapshot"
        if why:
            raise RestoreError(f"sidecar and snapshot disagree for {snap.name} ({why}) — "
                               "nothing local was touched")
        if side == "absent" and marked:
            log(f"{snap.name} has no sidecar — its own {SNAPSHOT_MARKER} names its bundles")
            plan(in_tar)
            check_disk(0)                  # the world tar is already here
        if f.needed:
            total = sum(have[n].size for n in f.needed.values())
            log(f"downloading {len(f.needed)} bundle(s) ({_mb(total)})...")
            try:
                f.bundle_tars = bundles.fetch(st, f.needed.values(), fetch_dir, have)
            except StorageError as exc:
                raise RestoreError(f"fetching the bundles of {snap.name} failed — nothing "
                                   f"local was touched: {exc}") from exc
    except BaseException:
        discard_fetched(f)
        raise
    return f


class RestoreCost(tuple):
    """(world_bytes, n_bundles, bundle_bytes) a restore of a bundled snapshot downloads;
    `.total` is how many bundles its manifest names (n_bundles == total: this machine has
    none of them)."""

    def __new__(cls, world_bytes: int, n_bundles: int, bundle_bytes: int, total: int):
        self = super().__new__(cls, (world_bytes, n_bundles, bundle_bytes))
        self.total = total
        return self

    world_bytes = property(lambda self: self[0])
    n_bundles = property(lambda self: self[1])
    bundle_bytes = property(lambda self: self[2])


def restore_cost(st: Storage, snap: Snapshot) -> RestoreCost | None:
    """What restoring `snap` here would download (§3.8): one sidecar read, one bundles/
    listing, the local inventory (its cache read, never written). None for a full
    snapshot, a lost sidecar, or any failure — the boot prompt then shows nothing extra."""
    try:
        m = read_manifest(st, snap)
        if m is None:
            return None
        needed, _extras, _unchanged = _bundle_plan(m, warn=lambda _m: None)
        have = bundles.listing(st)
        size = sum(have[n].size for n in needed.values() if n in have)
        return RestoreCost(snap.size, len(needed), size, len(bundles.manifest_keys(m)))
    except Exception:  # noqa: BLE001 — a cost estimate never stops a boot
        return None


def _bundle_summary(plural: str, unchanged: int, installed: list[str], size: int,
                    removed: list[str], left: list[str]) -> str:
    if not (installed or removed or left):
        return f"{plural}: all {unchanged} unchanged" if unchanged else f"{plural}: none"
    out = (f"{plural}: {len(installed)} installed ({_mb(size)}), {unchanged} unchanged, "
           f"{len(removed)} removed")
    if left:
        out += f", {len(left)} left ({', '.join(k.split('/', 1)[1] for k in left)})"
    return out


def apply_snapshot(f: Fetched, *, systems: bool = True) -> None:
    """Make this machine the snapshot. Full: clear worlds/Config/modules and extract (as
    before bundles). Bundled: clear worlds/Config, extract the world tar, put each needed
    bundle in place, leave unchanged modules untouched, remove the extras — unless there
    was no local world (nothing in the cloud references them then): those are left and
    listed. Both keep this machine's KEEP_LOCAL_CONFIG files and fix a foreign dataPath.
    With `systems=False` (the updater, which restores the system from its own aside copy)
    Data/systems is left alone. A RestoreError means nothing was touched.

    Each target is cleared before extracting: `extractall` overlays, so restoring an older
    snapshot over a newer tree would keep every file the newer version added — a
    mixed-version install that runs, the worst kind of failed restore."""
    root = data_root()
    bundled = f.manifest is not None

    def ours(key: str) -> bool:
        return systems or not key.startswith("system/")

    with tarfile.open(f.tar, "r:gz") as tar:
        members = None
        if bundled:
            # Before anything is cleared: a bundled world tar holds only WORLD_PATHS, and
            # every bundle to install is on this disk.
            members = [m for m in tar.getmembers() if m.name != SNAPSHOT_MARKER]
            stray = [m.name for m in members if not any(
                m.name == r or m.name.startswith(r + "/") for r in WORLD_PATHS)]
            if stray:
                raise RestoreError(f"{f.tar.name} is bundled but holds {stray[0]!r} outside "
                                   f"{' and '.join(WORLD_PATHS)} — nothing was touched")
            unfetched = [n for k, n in f.needed.items() if ours(k) and n not in f.bundle_tars]
            if unfetched:
                raise RestoreError(f"bundles not fetched: {', '.join(unfetched)} — nothing "
                                   "was touched")
        had_world = tree_has_world()
        kept = {rel: (root / rel).read_bytes() for rel in KEEP_LOCAL_CONFIG
                if (root / rel).is_file()}
        for rel in (WORLD_PATHS if bundled else SNAPSHOT_PATHS):
            target = root / rel
            if target.exists():
                shutil.rmtree(target)
                log(f"cleared {rel}")
        tar.extractall(root, members=members, filter="data")
    for rel, data in kept.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_bytes(data)
    if kept:
        log(f"kept this machine's {', '.join(Path(r).name for r in kept)}")
    _fix_foreign_data_path(root, kept)
    if not bundled:
        return

    installed, removed, left = [], [], []
    for key, name in sorted(f.needed.items()):
        if not ours(key):
            continue
        kind, id = key.split("/", 1)
        bundles.extract(f.bundle_tars[name], kind, id, root)
        installed.append(key)
    for key in f.extras:
        if not ours(key):
            continue
        if not had_world:
            left.append(key)
            continue
        kind, id = key.split("/", 1)
        path = root / bundles.ROOTS[kind] / id
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path)
        removed.append(key)
    if left:
        log("left in place (no local world, so no cloud copy references them): "
            + ", ".join(left))
    parts = []
    for kind, plural in (("module", "modules"), ("system", "systems")):
        if kind == "system" and not systems:
            parts.append(f"{plural}: not touched")
            continue
        mine = [k for k in installed if k.startswith(kind + "/")]
        mine_size = sum(f.bundle_tars[f.needed[k]].stat().st_size for k in mine)
        parts.append(_bundle_summary(
            plural, sum(1 for k in f.unchanged if k.startswith(kind + "/")), mine, mine_size,
            [k for k in removed if k.startswith(kind + "/")],
            [k for k in left if k.startswith(kind + "/")]))
    label = f.snap.name if f.snap else f.tar.name
    log(f"restored {label}: world {_mb(f.tar.stat().st_size)}; {'; '.join(parts)}")


def extract_snapshot(tar_path: Path, *, systems: bool = True) -> None:
    """Restore from a LOCAL snapshot tar (the updater's entry point). A full tar is
    applied as before bundles. A bundled tar is applied only when every bundle it names
    is already here at its fingerprint — there is nothing to download them from — else
    RestoreError (a RuntimeError) names the missing ones before anything is touched."""
    tar_path = Path(tar_path)
    marked, manifest = _read_marker(tar_path)
    if not marked:
        apply_snapshot(Fetched(None, tar_path, None, {}, {}, [], []), systems=systems)
        return
    needed, extras, unchanged = _bundle_plan(manifest, systems=systems)
    lacking = list(needed.values())
    if lacking:
        raise RestoreError(f"{tar_path.name} needs bundles this machine does not have: "
                           f"{', '.join(lacking)} — restore it from the cloud "
                           "(make foundry-restore SNAP=…); nothing was touched")
    apply_snapshot(Fetched(None, tar_path, manifest, {}, needed, extras, unchanged),
                   systems=systems)


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
    """fetch (world tar + the bundles this machine lacks, verified) → safety backup →
    apply. Nothing local is touched until every byte is on this disk, and the safety
    backup protects `snap` from its own pruning, so the based-on record never names a
    snapshot this restore deleted; its manifest references every local module before a
    restore removes any."""
    if server_running():
        die("Foundry is running — stop it first")
    try:
        f = fetch_snapshot(st, snap)
    except RestoreError as exc:
        die(str(exc))
    try:
        safety = _backup(st, f"pre-restore safety copy ({reason})", safety=True,
                         protect=snap)
        before = safety.name if safety else bootstate.load().based_on
        back = (f"put the previous state back: make foundry-restore SNAP={before}"
                if before else "there was no previous local world")
        if before and not safety and before != snap.name:
            try:
                gone = not _in_cloud(st, before, snapshots(st, WORLD_BACKUPS))
            except StorageError:
                gone = False
            if gone:  # no safety copy because `snap` already contains it
                back = (f"the previous state ({before}) is contained in {snap.name}: "
                        f"make foundry-restore SNAP={snap.name}")
        try:
            apply_snapshot(f)
        except RestoreError as exc:
            die(f"restore of {snap.name} refused: {exc}\n    {back}")
        except Exception as exc:  # noqa: BLE001
            die(f"extract of {snap.name} failed part-way: {exc}\n    {back}")
        anc = read_lineage(st, snap)
        bootstate.load().record_snapshot(snap.name, snap.host, snap.mtime, snapshot_digest(),
                                         by=f"restore:{reason}",
                                         lineage=list(anc.names) if anc else [],
                                         lineage_mtimes=list(anc.mtimes) if anc else [],
                                         # unbounded (no edge recorded) is stored as
                                         # None: edge = this snapshot's own mtime, which
                                         # is sound — it holds nothing newer than itself
                                         origin_before=_finite(anc.origin_before)
                                         if anc else None,
                                         clear_pending=True)
        log(f"restored {snap.name}" + (f" (the state it replaced: {before})" if before else ""))
    finally:
        discard_fetched(f)


def _snapshot_kind(st: Storage, s: Snapshot) -> str:
    """'bundled' / 'full' from the sidecar ('?' when it cannot be read or is malformed).
    Untagged snapshots predate sidecars: full, without a read."""
    if s.host is None:
        return "full"
    try:
        kind, _m = _read_sidecar(st, s)
    except StorageError:
        return "?"
    return {"bundled": "bundled", "bad": "?"}.get(kind, "full")


def _print_listing(snaps: list[Snapshot], st: Storage | None = None) -> None:
    """One row per snapshot; with `st`, a full/bundled column after the host."""
    for s in by_mtime(snaps):
        kind = f"{_snapshot_kind(st, s):<7} " if st is not None else ""
        print(f"      {s.name:<58} {s.host_label:<9} {kind}{_utc(s.mtime)}  "
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
        _print_listing(rolling, st)
        if preserved:
            print(f"\n  preserved past generations in {MAJOR_RELEASES}/ (never pruned):")
            _print_listing(preserved, st)
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
        _delete_snapshot(st, s)
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
    if state.pending_newer:
        log(f"not yet seen {state.pending_newer} (a boot without a terminal noticed it; "
            "the next boot at a terminal asks)")
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
    log(_bundles_status_line(st))
    log(f"keep         {host.keep_snapshots()} per host")
    log(f"foundry      {'RUNNING' if server_running() else 'stopped'}")
    return 0


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _bundles_status_line(st: Storage) -> str:
    """`bundles      N in the cloud (x); M unreferenced (y, swept after 7 days); local: A
    modules + B systems, all in the cloud` (or `K not yet uploaded`)."""
    try:
        have = {n: e for n, e in bundles.listing(st).items() if bundles.parse_bundle(n)}
    except StorageError as exc:
        die(f"cannot list {bundles.BUNDLES}/: {exc}")
    line = f"bundles      {len(have)} in the cloud"
    if have:
        line += f" ({_mb(sum(e.size for e in have.values()))})"
    try:
        refs = referenced_bundles(st)
        unref = [e for n, e in have.items() if n not in refs]
    except StorageError as exc:
        line += f"; unreferenced: unknown (a manifest cannot be read: {exc})"
    else:
        if unref:
            line += (f"; {len(unref)} unreferenced ({_mb(sum(e.size for e in unref))}, "
                     f"swept after {GC_GRACE_DAYS} days)")
    inv = bundles.local_inventory(warn=lambda _m: None)
    mods = sum(1 for loc in inv.values() if loc.kind == "module")
    lacking = sum(1 for loc in inv.values() if loc.name not in have)
    line += (f"; local: {_plural(mods, 'module')} + {_plural(len(inv) - mods, 'system')}, "
             + (f"{lacking} not yet uploaded" if lacking else "all in the cloud"))
    return line


def bundles_cmd() -> int:
    """`cloud bundles`: every local module/system with its bundle and whether the cloud
    has it, then the cloud bundles no retained snapshot references."""
    st = ensure_cloud()
    inv = bundles.local_inventory()
    try:
        have = bundles.listing(st)
    except StorageError as exc:
        die(f"cannot list {bundles.BUNDLES}/: {exc}")
    print(f"  on this machine ({host.host_name()}): {len(inv)} bundle(s), "
          f"{_mb(sum(loc.bytes for loc in inv.values()))} — kind, id, version, "
          "fingerprint, size, in the cloud")
    for loc in sorted(inv.values(), key=lambda l: (l.kind, l.id)):
        print(f"      {loc.kind:<6} {loc.id:<40} {loc.version:<12} {loc.fp}  "
              f"{_mb(loc.bytes):>9}  {'yes' if loc.name in have else 'no'}")
    try:
        refs = referenced_bundles(st)
    except StorageError as exc:
        print(f"  ⚠ cannot tell which cloud bundles are unreferenced: {exc}", file=sys.stderr)
        return 0
    now = time.time()
    unref = sorted((n, e) for n, e in have.items()
                   if bundles.parse_bundle(n) and n not in refs)
    print(f"\n  in the cloud, referenced by no snapshot: {len(unref)} "
          f"({_mb(sum(e.size for _n, e in unref))}; swept {GC_GRACE_DAYS} days after upload)")
    for n, e in unref:
        print(f"      {n}  {_mb(e.size):>9}  {(now - e.mtime) / 86400:.1f} days old")
    return 0


def bundles_gc_cmd(yes: bool = False) -> int:
    """`cloud bundles-gc [--yes]`: the GC sweep by hand. A dry run unless `yes`."""
    st = ensure_cloud()
    try:
        refs = referenced_bundles(st)
        have = bundles.listing(st, fresh=True)
    except StorageError as exc:
        die(f"cannot read every snapshot's manifest — nothing was deleted: {exc}")
    try:
        doomed = bundles.gc(st, referenced=refs, dry_run=not yes)
    except StorageError as exc:
        die(f"the sweep stopped part-way: {exc} — rerun it")
    now = time.time()
    total = sum(have[n].size for n in doomed if n in have)
    for n in doomed:
        e = have.get(n)
        print(f"      {n}  {_mb(e.size) if e else '?':>9}  "
              f"{(now - e.mtime) / 86400 if e else 0:.1f} days old")
    if not doomed:      # gc logs the count and bytes itself when there is something
        log(f"{'swept' if yes else 'would sweep'} 0 bundle(s) ({_mb(0)}) — every bundle in "
            f"the cloud is referenced or younger than {GC_GRACE_DAYS} days")
    elif not yes:
        log(f"dry run ({_mb(total)}): rerun with --yes (make foundry-bundles-gc YES=1) to "
            "delete them")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("assets", help="unpack new packs from OneDrive (down)")
    a.add_argument("--dry-run", action="store_true")
    a.add_argument("--if-reachable", action="store_true",
                   help="warn and exit 0 instead of failing when the cloud is unreachable")
    b = sub.add_parser("backup", help="snapshot world+Config (+ new bundles) to OneDrive (up)")
    b.add_argument("--reason", default="manual")
    b.add_argument("--if-stopped", action="store_true",
                   help="skip instead of failing when the server is up")
    r = sub.add_parser("restore", help="list snapshots, or restore one")
    r.add_argument("--snapshot", default=None)
    r.add_argument("--yes", action="store_true")
    p = sub.add_parser("prune-untagged", help="list untagged snapshots and delete on confirm")
    p.add_argument("--yes", action="store_true")
    sub.add_parser("status", help="show what is where")
    sub.add_parser("bundles", help="list local modules/systems and the cloud's bundles")
    g = sub.add_parser("bundles-gc", help="sweep unreferenced bundles (a dry run unless --yes)")
    g.add_argument("--yes", action="store_true")

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
        if args.cmd == "bundles":
            return bundles_cmd()
        if args.cmd == "bundles-gc":
            return bundles_gc_cmd(args.yes)
        return status()
    except host.HostError as exc:
        die(str(exc))
    except StorageError as exc:
        die(f"cloud: {exc}")


if __name__ == "__main__":
    sys.exit(main())
