"""The snapshot upload queue: built tars waiting to go up, the locks, the status file.

``make vtt-down`` builds the snapshot tar while Foundry is stopped (the only moment a
LevelDB world copies consistently) and hands the ~3 GB upload to a detached process
(``python -m scripts.foundry.cloud upload-pending``), so the command returns at once.
This module is the hand-off between the two; ``cloud.py`` does the building and the
uploading. It imports nothing from ``cloud`` so either side can use it.

Everything lives in the data volume's ``.pentaryn-tmp/`` (outside every snapshotted path):

* ``<snapshot>.tar.gz`` + ``<snapshot>.tar.gz.job.json`` — one **job**: a finished tar
  and what its upload needs (reason, tree digest, the based-on record it expects to
  extend). The job file is written last and atomically, so a job file always means a
  complete tar. A job leaves only when its upload is recorded; a crash leaves both
  files and the next backup or uploader retries them, oldest first.
* ``<snapshot>.tar.gz.building`` — a tar being written; a leftover is a crash.
* ``snapshot-build.lock`` — held while a tar is built or a restore replaces the tree.
* ``snapshot-upload.lock`` — held while jobs are uploaded (the background process, or a
  blocking backup/restore draining the queue first). Locks are ``flock`` locks, so a
  process that dies releases them: "locked" always means "someone is uploading now".
  Order is always build → upload, never the reverse, so they cannot deadlock.
* ``upload-status.json`` — the last upload's state for ``make foundry-cloud``;
  ``upload.log`` — the background process's own output (rclone's progress).
"""

from __future__ import annotations

import json
import os
import threading
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Iterator

try:
    import fcntl
except ImportError:  # pragma: no cover — native Windows; BOSS runs Foundry in WSL
    fcntl = None  # type: ignore[assignment]

TMP_DIRNAME = ".pentaryn-tmp"
JOB_SUFFIX = ".job.json"
BUILDING_SUFFIX = ".building"
BUILD_LOCK = "snapshot-build.lock"
UPLOAD_LOCK = "snapshot-upload.lock"
STATUS_FILE = "upload-status.json"
LOG_FILE = "upload.log"


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

    @property
    def tar(self) -> Path:
        return tmp_dir() / self.name

    @property
    def file(self) -> Path:
        return tmp_dir() / (self.name + JOB_SUFFIX)

    def save(self) -> None:
        tmp = self.file.with_name(self.file.name + ".tmp")
        tmp.write_text(json.dumps(asdict(self), indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, self.file)

    def drop(self) -> None:
        self.file.unlink(missing_ok=True)
        self.tar.unlink(missing_ok=True)


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
            known = {k: data.get(k) for k in Job.__dataclass_fields__}
            jobs.append(Job(**known))
        except (OSError, ValueError, TypeError):
            continue
    return sorted(jobs, key=lambda j: (j.created or 0.0, j.name))


def sweep_building() -> list[Path]:
    """Half-written tars from a build that crashed. Call only while holding BUILD_LOCK."""
    gone = []
    for p in tmp_dir().glob("*" + BUILDING_SUFFIX):
        p.unlink(missing_ok=True)
        gone.append(p)
    return gone


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
    jobs = pending()
    if busy(UPLOAD_LOCK):
        return read_status().get("name") or (jobs[0].name if jobs else "a snapshot")
    return jobs[-1].name if jobs else None
