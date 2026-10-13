"""The snapshot upload queue: built tars waiting to go up, the locks, the status file.

``make vtt-down`` builds the snapshot while Foundry is stopped (the only moment a LevelDB
world copies consistently) — the ~45 MB world tar and a tar of every module/system bundle
the cloud lacks — and hands the upload to a detached process (``python -m
scripts.foundry.cloud upload-pending``), so the command returns at once. This module is the
hand-off between the two; ``cloud.py`` does the building and the uploading. It imports
nothing from ``cloud`` so either side can use it.

Everything lives in the data volume's ``.pentaryn-tmp/`` (outside every snapshotted path):

* ``<snapshot>.tar.gz`` + ``<snapshot>.tar.gz.job.json`` — one **job**: a finished tar
  and what its upload needs (reason, tree digest, the based-on record it expects to
  extend). The job file is written last and atomically, so a job file always means a
  complete tar. A job leaves only when its upload is recorded; a crash leaves both
  files and the next backup or uploader retries them, oldest first. A job that can never
  complete (a bundle it reuses was swept while it waited, and the folder changed since)
  is **dropped**: its tar moves to ``incomplete/`` (the newest one is kept) and the
  uploader goes on with the next.
* ``bundles/<job name>/<bundle>.tar.gz`` — the bundle tars a job staged (the ones the
  cloud lacked when it was built). Per job: two queued jobs may stage the same bundle,
  and one job's cleanup must never take the other's. ``drop()`` removes the folder.
* ``heal-<stamp>-<host>`` jobs have no world tar: an unchanged tree whose snapshot names a
  bundle the cloud lost (deleted by hand) re-uploads it from the background.
* ``<snapshot>.tar.gz.building`` — a tar being written; a leftover is a crash.
* ``snapshot-build.lock`` — held while a tar is built or a restore replaces the tree.
* ``snapshot-upload.lock`` — held while jobs are uploaded (the background process, or a
  blocking backup/restore draining the queue first). Locks are ``flock`` locks, so a
  process that dies releases them: "locked" always means "someone is uploading now".
  Order is always build → upload, never the reverse, so they cannot deadlock.
* ``dropped-parents.json`` — {dropped job: the parent it extended}, written under
  ``snapshot-upload.lock`` when a job is dropped. A build that read the queue before the
  drop saves its job with ``parent`` = the dropped name; the uploader resolves it through
  this map (following chains) so that job still uploads linked.
* ``upload-status.json`` — the last upload's state for ``make foundry-cloud``;
  ``upload.log`` — the background process's own output (rclone's progress).
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import time
from contextlib import contextmanager
from dataclasses import MISSING, asdict, dataclass, field
from pathlib import Path
from typing import Callable, Iterator

from scripts.foundry.bundles import STAGING, TMP_DIRNAME

try:
    import fcntl
except ImportError:  # pragma: no cover — native Windows; BOSS runs Foundry in WSL
    fcntl = None  # type: ignore[assignment]

JOB_SUFFIX = ".job.json"
BUILDING_SUFFIX = ".building"
BUILD_LOCK = "snapshot-build.lock"
UPLOAD_LOCK = "snapshot-upload.lock"
STATUS_FILE = "upload-status.json"
LOG_FILE = "upload.log"
DROPPED_PARENTS = "dropped-parents.json"
DROPPED_KEEP = 64           # the newest entries kept: drops are rare, the map stays small
# A dropped job's world tar is moved here (the newest only): with no later job queued it
# may be the only copy of that world state once Foundry runs again.
INCOMPLETE = "incomplete"
HEAL_PREFIX = "heal-"


def _dir() -> Path:
    from scripts.foundry import host
    return host.foundry_data() / TMP_DIRNAME


def tmp_dir() -> Path:
    d = _dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── locks ────────────────────────────────────────────────────────────────────

# name → (fd, depth, owning thread). Re-entrant per thread: a blocking backup holds both
# locks and its restore/safety-copy callees take them again. Another thread (a test, or
# a second caller in one process) opens its own fd, so flock makes it wait.
_held: dict[str, tuple[int, int, int]] = {}
_held_guard = threading.Lock()


def _lock_path(name: str) -> Path:
    return tmp_dir() / name


def _try_flock(fd: int, wait: bool) -> bool:
    if fcntl is None:
        return True
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | (0 if wait else fcntl.LOCK_NB))
        return True
    except BlockingIOError:
        return False


@contextmanager
def lock(name: str, *, wait: bool = True,
         on_wait: Callable[[], None] | None = None) -> Iterator[bool]:
    """Hold `name` for the block; yields whether it was acquired (always True with
    `wait`). `on_wait` runs once, before blocking, when someone else holds it."""
    me = threading.get_ident()
    with _held_guard:
        cur = _held.get(name)
        if cur and cur[2] == me:
            _held[name] = (cur[0], cur[1] + 1, me)
            reentered = True
        else:
            reentered = False
    if reentered:
        try:
            yield True
        finally:
            with _held_guard:
                fd, depth, owner = _held[name]
                _held[name] = (fd, depth - 1, owner)
        return

    fd = os.open(_lock_path(name), os.O_RDWR | os.O_CREAT, 0o644)
    try:
        got = _try_flock(fd, False)
        if not got and wait:
            if on_wait:
                on_wait()
            got = _try_flock(fd, True)
        if not got:
            yield False
            return
        with _held_guard:
            _held[name] = (fd, 1, me)
        try:
            yield True
        finally:
            with _held_guard:
                _held.pop(name, None)
    finally:
        os.close(fd)  # closing the only fd on the description releases the flock


def busy(name: str) -> bool:
    """Is `name` held by another process or thread right now?"""
    cur = _held.get(name)
    if cur and cur[2] == threading.get_ident():
        return False
    try:  # read-only: a lock file nobody created is a lock nobody holds
        fd = os.open(_dir() / name, os.O_RDWR)
    except FileNotFoundError:
        return False
    try:
        if not _try_flock(fd, False):
            return True
        return False
    finally:
        os.close(fd)


# ── jobs ─────────────────────────────────────────────────────────────────────

@dataclass
class Job:
    name: str                   # the snapshot's file name (and the tar's, in tmp)
    reason: str
    digest: str                 # the tree digest the tar was built from
    parent: str | None          # the based-on record it extends (a pending job's name
                                # when one was queued ahead of it)
    host: str
    size: int
    created: float
    safety: bool = False
    protect: str | None = None  # a restore's target: never coalesced or pruned away
    # The bundle manifest ({"modules": {id: name}, "systems": {id: name}}) the snapshot
    # names. None: a FULL tar (worlds+Config+modules) queued by the pre-bundles code —
    # uploaded as such, with a lineage-only sidecar and no bundle work.
    manifest: dict | None = None
    bundles: list[str] = field(default_factory=list)   # names staged in `staging`
    heal: bool = False          # no world tar: re-upload `bundles` the cloud lost

    @property
    def tar(self) -> Path:
        return tmp_dir() / self.name

    @property
    def file(self) -> Path:
        return tmp_dir() / (self.name + JOB_SUFFIX)

    @property
    def staging(self) -> Path:
        """This job's own bundle tars: never shared with another job."""
        return tmp_dir() / STAGING / self.name

    def save(self) -> None:
        tmp = self.file.with_name(self.file.name + ".tmp")
        tmp.write_text(json.dumps(asdict(self), indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, self.file)

    def drop(self) -> None:
        self.file.unlink(missing_ok=True)
        self.tar.unlink(missing_ok=True)
        shutil.rmtree(self.staging, ignore_errors=True)


def pending() -> list[Job]:
    """Every queued job, oldest first. An unreadable job file is skipped (and left for a
    human — it names a tar that may be the only copy of a session)."""
    jobs = []
    d = _dir()
    if not d.is_dir():
        return jobs
    for p in d.glob("*" + JOB_SUFFIX):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            # A key the job file lacks (written by older code) takes the field's default;
            # a required one reads as None, as before.
            known = {k: data[k] if k in data else _default(f)
                     for k, f in Job.__dataclass_fields__.items()}
            if not isinstance(known["bundles"], list):
                known["bundles"] = []
            known["heal"] = bool(known["heal"])
            jobs.append(Job(**known))
        except (OSError, ValueError, TypeError):
            continue
    return sorted(jobs, key=lambda j: (_created_key(j.created), j.name))


def _created_key(created) -> float:
    """A job's `created` as a sort key: a real number as is, anything else (null, a
    string from a hand-edited or foreign job file) as 0.0 — sorted first, never dropped."""
    if isinstance(created, (int, float)) and not isinstance(created, bool):
        return float(created)
    return 0.0


def _default(f):
    """A dataclass field's default; None for a required field."""
    if f.default is not MISSING:
        return f.default
    if f.default_factory is not MISSING:
        return f.default_factory()
    return None


def sweep_building() -> list[Path]:
    """Half-written tars from a build that crashed, and the staging folder of a job that
    never got its job file (a build killed after staging). Call only while holding
    BUILD_LOCK: then no build is running, and a staging folder whose job file exists
    belongs to a queued job — left alone, `.building` and all (the uploader may be
    rebuilding a bundle there; the job's drop() removes the folder)."""
    gone = []
    top = tmp_dir()
    for p in top.glob("*" + BUILDING_SUFFIX):
        p.unlink(missing_ok=True)
        gone.append(p)
    stage = top / STAGING
    try:
        entries = sorted(stage.iterdir())
    except OSError:
        return gone
    for p in entries:
        if p.is_symlink():
            continue
        if p.is_file() and p.name.endswith(BUILDING_SUFFIX):
            p.unlink(missing_ok=True)
            gone.append(p)
        elif p.is_dir() and not (top / (p.name + JOB_SUFFIX)).exists():
            shutil.rmtree(p, ignore_errors=True)
            gone.append(p)
    return gone


def keep_incomplete(job: Job) -> Path | None:
    """Move a dropped job's world tar to incomplete/<name>, replacing any older one there;
    the new path, or None when it has no tar."""
    if not job.tar.is_file():
        return None
    d = tmp_dir() / INCOMPLETE
    d.mkdir(parents=True, exist_ok=True)
    for old in d.iterdir():
        if old.is_file() and not old.is_symlink():
            old.unlink(missing_ok=True)
    dest = d / job.name
    os.replace(job.tar, dest)
    return dest


def _dropped_parents() -> dict[str, str | None]:
    try:
        data = json.loads((_dir() / DROPPED_PARENTS).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items()
            if isinstance(k, str) and (v is None or isinstance(v, str))}


def record_dropped(name: str, parent: str | None) -> None:
    """Remember that `name` left the queue without landing and extended `parent`. Call
    under UPLOAD_LOCK (the only writer)."""
    data = _dropped_parents()
    data.pop(name, None)
    data[name] = parent
    data = dict(list(data.items())[-DROPPED_KEEP:])
    p = tmp_dir() / DROPPED_PARENTS
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, p)


def resolve_parent(parent: str | None) -> str | None:
    """`parent` with every dropped job in the way skipped: a job built to extend a job
    that was dropped really extends what that one extended (and so on down a chain)."""
    data = _dropped_parents()
    seen = set()
    while parent in data and parent not in seen:
        seen.add(parent)
        parent = data[parent]
    return parent


def incomplete() -> list[Path]:
    """The kept tar of the last dropped job (at most one), for the status line."""
    d = _dir() / INCOMPLETE
    try:
        return sorted(p for p in d.iterdir() if p.is_file() and not p.is_symlink())
    except OSError:
        return []


# ── status ───────────────────────────────────────────────────────────────────

def read_status() -> dict:
    try:
        data = json.loads((_dir() / STATUS_FILE).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_status(**fields) -> None:
    p = tmp_dir() / STATUS_FILE
    data = {**fields, "pid": fields.get("pid", os.getpid()),
            "updated": time.time()}
    tmp = p.with_name(p.name + ".tmp")
    try:
        tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, p)
    except OSError:
        pass  # the status line is a convenience; never fail an upload over it


def in_flight() -> str | None:
    """The snapshot this host has not finished uploading — running now, or queued after
    a crash — else None. The boot choice keeps the local world while there is one."""
    jobs = [j for j in pending() if not j.heal]   # a heal holds no world state
    if busy(UPLOAD_LOCK):
        s = read_status()
        if s.get("heal"):
            return jobs[0].name if jobs else None
        return s.get("name") or (jobs[0].name if jobs else "a snapshot")
    return jobs[-1].name if jobs else None
