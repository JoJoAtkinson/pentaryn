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
- A backup is two halves: **build** the tar (needs Foundry stopped) and **upload** it.
  ``make vtt-down`` builds, then hands the upload to a detached ``upload-pending``
  process and returns (``scripts/foundry/uploadq.py`` is the queue between them);
  ``WAIT=1`` and every other caller do both halves before returning. Either way the
  based-on record moves only when the upload completes, and a failed or crashed
  upload stays queued for the next backup to retry.

Systems (132 MB) are mirrored per version and shared by both hosts (the same version is
the same bytes); the last ``KEEP_SYSTEM_MIRRORS`` versions are kept.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scripts.foundry import bootstate, host, uploadq
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

# Restore safety copies are kept apart from the rolling ten: this many per host, so
# repeated "take the latest" boots on the alt never push regular snapshots out.
KEEP_SAFETY_COPIES = 3

# A snapshot taken while this host's newest one is younger than this REPLACES it.
COALESCE_WINDOW_DAYS = 5

# How many versions of each system's mirror to retain. More than one, because a system
# rollback needs the version you were on *before* the update.
KEEP_SYSTEM_MIRRORS = 3

# A crash between upload and rename leaves a `.partial`; younger ones may be the other
# machine mid-upload, so only these are swept.
STALE_PARTIAL_SECONDS = 24 * 3600

# Where tars are built and downloads land: on the data volume, outside SNAPSHOT_PATHS.
# The upload queue (uploadq.py) lives there too.
TMP_DIRNAME = uploadq.TMP_DIRNAME

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
    "                A name ending .safety.tar.gz is the state a restore replaced;\n"
    f"                each machine keeps its last {KEEP_SAFETY_COPIES} of those as well.\n"
    "                A name ending .tar.gz.parent is that snapshot's lineage (tiny).\n"
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
    if base is None or marker != snapshot_digest():
        return state
    state.record_snapshot(base.name, None, base.mtime, marker, by="adopt-legacy-marker",
                          lineage=[])
    log(f"recorded this world as based on {base.name} (the legacy digest marker matches)")
    return state


def backup(reason: str = "manual", if_stopped: bool = False, background: bool = False) -> int:
    """`if_stopped` is for lifecycle hooks: skip quietly rather than fail the target.
    `make vtt-up` on an already-running server is normal, and must not abort there —
    and neither must a cloud that is down: the pre-launch snapshot is then a warning
    (naming any tar left on disk), exit 0, and `make vtt-down` tries again. Nor must an
    upload this host is still running in the background: that one holds this world.

    `background` is `make vtt-down`'s: build the tar now, upload it from a detached
    process (`upload-pending`), return at once."""
    if server_running():
        if if_stopped:
            log("Foundry already running — skipping the pre-launch snapshot")
            return 0
        die("Foundry is running — stop it first (a live LevelDB cannot be copied consistently)")
    if background:
        return _backup_background(ensure_cloud(), reason)
    if not if_stopped:
        with _exclusive():
            _backup(ensure_cloud(), reason)
        return 0
    try:
        with _exclusive(wait=False) as got:
            if not got:
                log(f"a background upload is in progress ({uploadq.in_flight() or 'a snapshot'})"
                    " — skipping the pre-launch snapshot; that upload holds this world")
                return 0
            if uploadq.pending():
                # An upload that never finished (a crash, a sleep): retry it from the
                # background too — the launch must not wait ~3 GB for it.
                return _backup_background(ensure_cloud(), reason)
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


# ── The two halves: build a tar (stopped world), upload it (any time later) ───

@contextmanager
def _exclusive(wait: bool = True):
    """Both queue locks, build then upload (uploadq.py). Yields whether they were got;
    with `wait`, says what it is waiting for and blocks until they are."""
    def waiting_build():
        log("waiting for another snapshot build or restore on this machine to finish...")

    def waiting_upload():
        name = uploadq.read_status().get("name") or "a snapshot"
        log(f"waiting for the background upload of {name} to finish "
            "(make foundry-cloud shows it)...")
    with uploadq.lock(uploadq.BUILD_LOCK, wait=wait, on_wait=waiting_build) as built:
        if not built:
            yield False
            return
        with uploadq.lock(uploadq.UPLOAD_LOCK, wait=wait, on_wait=waiting_upload) as up:
            yield up


def _backup(st: Storage, reason: str, *, safety: bool = False,
            protect: Snapshot | None = None) -> Snapshot | None:
    """Build and upload, blocking. The snapshot uploaded, or None when skipped
    (unchanged, or nothing to archive). The caller holds both locks (`_exclusive`).

    Anything still queued from an earlier background upload goes up first, so the
    based-on record this run extends is the real one.

    `protect` is the snapshot a restore is about to extract: this run must not delete it
    (neither coalescing nor pruning may remove the state the based-on record is about to
    point at), and an unchanged tree it already contains needs no safety copy."""
    _drain(st)
    job = _build(st, reason, safety=safety, protect=protect)
    if job is None:
        return None
    try:
        return _run_job(st, job)
    except StorageError as exc:
        die(f"upload failed: {exc}\n"
            f"    the snapshot is still on disk: {job.tar}\n"
            "    it stays queued: the next backup retries it (make foundry-backup)")


def _build(st: Storage, reason: str, *, safety: bool = False,
           protect: Snapshot | None = None) -> uploadq.Job | None:
    """Build this tree's tar in tmp and queue it; None when there is nothing to build.
    The caller holds BUILD_LOCK.

    With jobs already queued (an upload not finished yet), the tree's effective based-on
    is the newest queued one: an unchanged tree builds nothing, a changed one is queued
    behind it, extending it."""
    uploadq.sweep_building()
    queued = uploadq.pending()  # before the state: a job finishing now then reads as recorded
    state = adopt_legacy_marker(st, bootstate.load())
    digest = snapshot_digest()
    try:
        existing = snapshots(st, WORLD_BACKUPS)
    except StorageError as exc:
        die(f"cannot list {WORLD_BACKUPS}/: {exc}")
    if queued:
        parent = queued[-1].name
        if queued[-1].digest == digest:
            log(f"no change since {parent} — its upload has not finished yet")
            return None
    else:
        parent = state.based_on
        if state.digest == digest:
            # Unchanged since the last upload or restore — but "skip" is only safe while
            # that snapshot still exists. Coalescing, pruning or prune-untagged (on either
            # machine) may have deleted it, and then this tree has no cloud copy at all.
            if state.based_on and _in_cloud(st, state.based_on, existing):
                log("no change since the last snapshot — skipped")
                return None
            if (safety and protect is not None and state.based_on
                    and descends(st, protect, state.based_on, state.based_on_mtime) is True):
                log(f"no change since {state.based_on}, which {protect.name} contains — "
                    "no safety copy needed")
                return None
            log(f"no change since {state.based_on or 'the last snapshot'}, but it is no "
                "longer in the cloud — uploading this state again")
    if not tree_has_world():
        log("no local world to snapshot — skipped")
        return None

    me = host.host_name()
    core = core_version()
    taken = {s.name for s in existing} | {j.name for j in queued}
    when = datetime.now(timezone.utc)
    while True:  # a name is an identity (based_on, keep-local): never reuse one
        stamp = when.strftime("%Y-%m-%d-%H%M%S")
        name = f"world-{stamp}-fvtt{core}-{me}{'.safety' if safety else ''}.tar.gz"
        if name not in taken:
            break
        when += timedelta(seconds=1)

    tmp = tmp_dir() / name
    last = newest(own(existing, me)) or newest(existing)
    if last:
        free = shutil.disk_usage(tmp.parent).free
        if free < 2 * last.size:
            die(f"only {_mb(free)} free on {tmp.parent} — a snapshot is ~{_mb(last.size)} and "
                "is built locally before upload; free at least twice that")

    # Built under a `.building` name and renamed, then the job file written last: a job
    # file always means a complete tar.
    building = tmp.with_name(tmp.name + uploadq.BUILDING_SUFFIX)
    try:
        with tarfile.open(building, "w:gz") as tar:
            for rel in SNAPSHOT_PATHS:
                src = data_root() / rel
                if src.exists():
                    tar.add(src, arcname=rel)
        os.replace(building, tmp)
    except BaseException:
        building.unlink(missing_ok=True)
        raise
    job = uploadq.Job(name=name, reason=reason, digest=digest, parent=parent, host=me,
                      size=tmp.stat().st_size, created=time.time(), safety=safety,
                      protect=protect.name if protect else None)
    job.save()
    return job


def _upload_job(st: Storage, job: uploadq.Job, protect: str | None = None) -> Snapshot | None:
    """Upload one queued tar and do everything that follows it: lineage sidecar,
    `.partial` copy and rename, the based-on record, coalescing, pruning, system
    mirrors. The caller holds UPLOAD_LOCK. Safe to re-run after a crash at any point:
    a snapshot already in the cloud at the right size is not uploaded again.

    The record moves only here, and only when this machine's based-on is still the one
    the tar was built to extend (`job.parent`) — otherwise the snapshot is uploaded with
    an unknown lineage and the record is left alone.

    `protect` (beside the job's own) is a snapshot a restore waiting on this upload is
    about to download: neither coalescing nor pruning may take it away first."""
    me = host.host_name()
    keep_names = {job.protect, protect} - {None}
    try:
        existing = snapshots(st, WORLD_BACKUPS)
    except StorageError as exc:
        raise StorageError(f"cannot list {WORLD_BACKUPS}/: {exc}") from exc
    there = next((s for s in existing if s.name == job.name), None)
    others = [s for s in existing if s.name != job.name]
    if there is None and not job.tar.is_file():
        log(f"✗ {job.name}: its tar is gone from {tmp_dir()} — dropping it from the queue")
        job.file.unlink(missing_ok=True)
        return None

    # Before writing anything: if the installed generation has moved on since this host's
    # last backup, its newest snapshot from the OLD generation is the last state that still
    # runs on it. Preserve it now, while it is still inside the rolling window.
    promote_major_release(st, others)

    state = bootstate.load()
    linked = state.based_on == job.parent
    if linked:
        ancestors, ancestor_mtimes, origin = next_lineage(state)
        contained = {state.based_on, *state.lineage} - {None}
    else:
        ancestors, ancestor_mtimes, origin = None, None, None
        contained = set()
        log(f"⚠ this machine's based-on record is {state.based_on or 'empty'}, not "
            f"{job.parent or 'empty'} as when {job.name} was built — uploading it with an "
            "unknown lineage, and not recording it")

    # Coalescing: note the snapshot this one may replace, but write the new one FIRST and
    # only then delete the old. A safety copy never coalesces in either direction.
    superseded = (None if job.safety
                  else _coalesce_target(others, me, None, contained))
    if superseded is not None and superseded.name in keep_names:
        superseded = None

    size = job.size
    # The sidecar first: by the time the snapshot's name appears, its lineage exists.
    st.write_text(parent_rel(WORLD_BACKUPS, job.name), json.dumps(
        {"parent": job.parent, "ancestors": ancestors,
         "ancestor_mtimes": ancestor_mtimes, "origin_before": _finite(origin),
         "host": me}, allow_nan=False) + "\n")
    if there is None or there.size != size:
        log(f"uploading {job.name} ({_mb(size)}, {job.reason}) to {st.root}...")
        st.upload(job.tar, f"{WORLD_BACKUPS}/{job.name}")
    else:
        log(f"{job.name} is already in the cloud (an earlier attempt got that far)")

    entry = next((e for e in st.ls(WORLD_BACKUPS) if e.name == job.name), None)
    snap = parse_snapshot(entry or Entry(job.name, size, time.time()), WORLD_BACKUPS)
    if linked:
        state.record_snapshot(job.name, me, snap.mtime, job.digest, by="backup",
                              lineage=ancestors, lineage_mtimes=ancestor_mtimes,
                              origin_before=_finite(origin), keep_local=None)
    job.drop()
    log(f"snapshot → {job.name} ({_mb(size)}, {job.reason})")
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

    keep = host.keep_snapshots()
    mine = [s for s in own(snapshots(st, WORLD_BACKUPS), me) if s.name not in keep_names]
    regular = [s for s in mine if not s.safety]
    safeties = [s for s in mine if s.safety]
    for stale in regular[:-keep] + safeties[:-KEEP_SAFETY_COPIES]:
        _delete_snapshot(st, stale)
        log(f"pruned {stale.name}")
    log(f"{min(len(regular), keep)} of {keep} snapshots kept for {me}"
        + (f", and {min(len(safeties), KEEP_SAFETY_COPIES)} of {KEEP_SAFETY_COPIES} "
           "restore safety copies" if safeties else ""))

    mirror_systems(st)
    return snap


# ── The background half: the queue's uploader ────────────────────────────────

# Where the uploader's ops-log lines go; the detached process gets its parent's folder
# through --log-dir, so a test's tmp log folder reaches it too.
_LOG_DIR: Path | None = None


def _ops_event(state: str, job: uploadq.Job, **extra) -> None:
    """One line in foundry/logs/ops-YYYY-MM.jsonl; never fails an upload."""
    try:
        from scripts.foundry.ops import config as cfg
        from scripts.foundry.ops.out import append_jsonl, now_iso
        ts = now_iso()
        folder = _LOG_DIR or cfg.OPS_LOG_DIR
        append_jsonl(folder / f"ops-{ts[:7]}.jsonl", {
            "ts": ts, "cmd": "cloud-upload", "host": job.host, "state": state,
            "snapshot": job.name, "reason": job.reason, "bytes": job.size, **extra})
    except Exception:  # noqa: BLE001
        pass


def _run_job(st: Storage, job: uploadq.Job, protect: str | None = None) -> Snapshot | None:
    """`_upload_job` with the status file and the ops log kept. Raises on failure (the
    job stays queued), after recording the failure."""
    t0 = time.time()
    uploadq.write_status(state="uploading", name=job.name, reason=job.reason,
                         size=job.size, started=t0)
    _ops_event("uploading", job)
    try:
        snap = _upload_job(st, job, protect)
    except (StorageError, SystemExit) as exc:
        if isinstance(exc, SystemExit) and exc.code in (0, None):
            raise
        err = str(exc) if isinstance(exc, StorageError) else f"see {tmp_dir() / uploadq.LOG_FILE}"
        uploadq.write_status(state="failed", name=job.name, reason=job.reason,
                             size=job.size, started=t0, finished=time.time(), error=err)
        _ops_event("failed", job, error=err, seconds=round(time.time() - t0, 1))
        raise
    uploadq.write_status(state="done", name=job.name, reason=job.reason, size=job.size,
                         started=t0, finished=time.time())
    _ops_event("done", job, seconds=round(time.time() - t0, 1))
    return snap


def _drain(st: Storage, protect: str | None = None) -> None:
    """Upload everything queued, oldest first, blocking. The caller holds UPLOAD_LOCK.
    A failure dies: what is queued is a world state the cloud does not have yet.
    `protect`: a snapshot about to be restored, kept from coalescing and pruning."""
    seen: set[str] = set()
    while (jobs := uploadq.pending()):
        job = jobs[0]
        if job.name in seen:
            die(f"{job.name} stays queued after its upload — check {tmp_dir()}")
        seen.add(job.name)
        log(f"an earlier snapshot is still queued — uploading {job.name} first")
        try:
            _run_job(st, job, protect)
        except StorageError as exc:
            die(f"the queued upload of {job.name} failed again: {exc}\n"
                f"    it is still on disk: {job.tar} — the next backup retries it")


def finish_uploads() -> None:
    """Wait for any running upload and upload anything still queued (the boot step,
    before an explicit FROM= restore)."""
    with _exclusive():
        _drain(ensure_cloud())


def upload_in_flight() -> str | None:
    """The snapshot this host has queued or is uploading right now, else None."""
    try:
        return uploadq.in_flight()
    except OSError:
        return None


def _backup_background(st: Storage, reason: str) -> int:
    """Build the tar now (Foundry is stopped), queue it, and start the detached
    uploader. Waits only for another build; never for a running upload — a new tar
    queues behind it, extending it."""
    def waiting_build():
        log("waiting for another snapshot build or restore on this machine to finish...")
    with uploadq.lock(uploadq.BUILD_LOCK, on_wait=waiting_build):
        job = _build(st, reason)
    queued = uploadq.pending()
    if not queued:
        return 0
    head = job or queued[-1]
    if job is not None:
        _ops_event("queued", job)
    # Always start one: an uploader already running may be past its last look at the
    # queue. A second one waits for the lock and finds nothing left — never a duplicate.
    _spawn_uploader()
    what = "uploading" if job is not None else "retrying the unfinished upload of"
    log(f"▸ {what} {head.name} ({_mb(head.size)}) in the background — progress: "
        "make foundry-cloud. Don't sleep the laptop until it finishes.")
    return 0


def _spawn_uploader() -> int:
    """Start `upload-pending` detached (own session, no terminal), its output appended to
    .pentaryn-tmp/upload.log. On a Mac, `caffeinate -i -w` keeps idle sleep away while it
    runs (closing the lid still sleeps). Returns its pid."""
    from scripts.foundry.ops import config as cfg
    logfile = tmp_dir() / uploadq.LOG_FILE
    try:
        if logfile.stat().st_size > 2_000_000:
            logfile.unlink()
    except OSError:
        pass
    argv = [sys.executable, "-u", "-m", "scripts.foundry.cloud", "upload-pending",
            "--log-dir", str(_LOG_DIR or cfg.OPS_LOG_DIR)]
    with logfile.open("ab") as out:
        out.write(f"\n── {datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S} UTC  "
                  "upload-pending\n".encode())
        out.flush()
        proc = subprocess.Popen(argv, cwd=str(REPO_ROOT), stdin=subprocess.DEVNULL,
                                stdout=out, stderr=subprocess.STDOUT,
                                start_new_session=True, close_fds=True)
    caf = shutil.which("caffeinate")
    if caf:
        try:
            subprocess.Popen([caf, "-i", "-w", str(proc.pid)], stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
        except OSError:
            pass
    return proc.pid


def upload_pending() -> int:
    """The detached uploader: take the upload lock (waiting for any other), upload every
    queued job oldest first, re-reading the queue after each so a tar queued meanwhile
    goes up too. 1 on the first failure — that job and the rest stay queued."""
    with uploadq.lock(uploadq.UPLOAD_LOCK):
        if not uploadq.pending():
            return 0
        try:
            st = ensure_cloud()
        except SystemExit as exc:
            if exc.code in (0, None):
                raise
            job = uploadq.pending()[0]
            uploadq.write_status(state="failed", name=job.name, reason=job.reason,
                                 size=job.size, finished=time.time(),
                                 error="the cloud is unreachable")
            _ops_event("failed", job, error="the cloud is unreachable")
            return 1
        seen: set[str] = set()
        while (jobs := uploadq.pending()):
            job = jobs[0]
            if job.name in seen:
                print(f"  ✗ {job.name} stays queued after its upload — check {tmp_dir()}",
                      file=sys.stderr)
                return 1
            seen.add(job.name)
            try:
                _run_job(st, job)
            except (StorageError, SystemExit) as exc:
                if isinstance(exc, SystemExit) and exc.code in (0, None):
                    raise
                if isinstance(exc, StorageError):
                    print(f"  ✗ upload of {job.name} failed: {exc}", file=sys.stderr)
                print(f"    it is still on disk: {job.tar} — the next backup (or "
                      "make vtt-down) retries it", file=sys.stderr)
                return 1
    return 0


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
    try:
        sidecar = st.read_text(parent_rel(WORLD_BACKUPS, source.name))
        if sidecar:
            st.write_text(parent_rel(MAJOR_RELEASES, source.name), sidecar)
    except StorageError:
        pass
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
    its own pruning, so the based-on record never names a snapshot this restore deleted.

    Holds both queue locks throughout, and uploads anything still queued first: a
    background upload finishing after the extract would record the old world as this
    machine's based-on."""
    if server_running():
        die("Foundry is running — stop it first")
    with _exclusive():
        _drain(st, protect=snap.name)
        _restore_locked(st, snap, reason)


def _restore_locked(st: Storage, snap: Snapshot, reason: str) -> None:
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
            extract_snapshot(local_tar)
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
        _delete_snapshot(st, s)
        log(f"deleted {s.name}")
    return 0


def _upload_lines() -> list[str]:
    """What `make foundry-cloud` says about this host's queue: running, stuck, last."""
    try:
        jobs = uploadq.pending()
        running = uploadq.busy(uploadq.UPLOAD_LOCK)
        s = uploadq.read_status()
    except OSError:
        return []
    lines = []
    name = s.get("name")
    if running:
        cur = name or (jobs[0].name if jobs else "a snapshot")
        started = s.get("started")
        lines.append(f"in progress: {cur}"
                     + (f" (started {_utc(started)})" if started else "")
                     + f" — don't sleep the laptop until it finishes; "
                       f"log: {tmp_dir() / uploadq.LOG_FILE}")
        lines += [f"queued: {j.name} ({_mb(j.size)})" for j in jobs if j.name != cur]
        return lines
    for j in jobs:
        lines.append(f"pending: {j.name} ({_mb(j.size)}) — not uploading (interrupted?); "
                     "the next backup or make vtt-down retries it (now: make foundry-backup)")
    if name and s.get("state") == "done":
        lines.append(f"last: {name} done {_utc(s.get('finished') or s.get('updated') or 0)}")
    elif name and s.get("state") == "failed":
        lines.append(f"last: {name} FAILED {_utc(s.get('finished') or s.get('updated') or 0)}"
                     f": {s.get('error') or '?'}")
    return lines


def status() -> int:
    for line in _upload_lines():
        log(f"upload       {line}")
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
    b.add_argument("--background", action="store_true",
                   help="build the tar now, upload it from a detached process (vtt-down)")
    u = sub.add_parser("upload-pending",
                       help="upload every queued snapshot (what --background starts)")
    u.add_argument("--log-dir", default=None, help="the ops-log folder (default foundry/logs)")
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
            return backup(args.reason, args.if_stopped, args.background)
        if args.cmd == "upload-pending":
            global _LOG_DIR
            if args.log_dir:
                _LOG_DIR = Path(args.log_dir)
            return upload_pending()
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
