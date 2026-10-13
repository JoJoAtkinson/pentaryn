#!/usr/bin/env python3
"""Run state: the lock, the phase file, and the service state to put back.

Three separate things live in ``.state/``, and conflating them is how an unattended job
turns one bad Saturday into a bad month:

``vtt-update.lock``     a directory. ``mkdir`` is atomic on every filesystem here, and
                        macOS ships no ``flock(1)`` for the shell side, so the directory
                        is the lock everyone can see: ``make vtt-up`` / ``vtt-down`` read
                        it so a human cannot start the tunnel underneath a running update.
``vtt-update.lock.guard`` a plain file, ``fcntl.flock``-ed (Python has it on macOS) for the
                        few microseconds it takes to create, judge, break or remove the
                        directory. Two runs breaking the same stale lock would otherwise
                        each delete the other's fresh one (AC-4); the kernel drops the
                        flock if its holder dies, so the guard itself never goes stale.
``vtt-update.status``   written at *start* and updated on every phase. The watchdog
                        needs to tell "still downloading a 400 MB core" from "died in
                        phase 4" from "never fired at all", and a heartbeat written only
                        at the end cannot distinguish the first two.
``vtt-update.entry``    the service state to restore: was Foundry up, was the tunnel up,
                        which world was active. **If this file still exists when a run
                        starts, the previous run crashed** — and its contents, not the
                        current broken state, are what should be restored. Otherwise
                        Saturday's crash silently becomes next Saturday's "desired
                        state: everything down".
"""

from __future__ import annotations

import fcntl
import json
import os
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
STATE_DIR = REPO_ROOT / ".state"
LOCK_DIR = STATE_DIR / "vtt-update.lock"
STATUS_PATH = STATE_DIR / "vtt-update.status"
ENTRY_PATH = STATE_DIR / "vtt-update.entry"
PAUSE_PATH = STATE_DIR / "vtt-update.pause"
CORE_ROLLBACK_DIR = STATE_DIR / "core-rollback"
SYSTEM_ASIDE_DIR = STATE_DIR / "system-aside"

# A lock older than this is from a run that died without cleaning up. Long enough to
# cover a core download plus a full smoke test on both worlds.
STALE_LOCK_SECONDS = 3 * 3600
# A lock directory with no owner.json yet is mid-acquire, not abandoned, for this long.
OWNERLESS_GRACE_SECONDS = 60


class Locked(RuntimeError):
    """Another run holds the lock."""


# How long to wait for another run to finish its (microsecond) turn at the guard.
GUARD_WAIT_SECONDS = 5.0


@contextmanager
def _guard(lock_path: Path):
    """Serialise every change to the lock directory across processes.

    Only one process at a time may create, judge, break or remove ``lock_path``, so a
    stale lock is broken exactly once and nobody deletes a directory it did not judge.
    Raises :class:`Locked` if the guard cannot be had within ``GUARD_WAIT_SECONDS``."""
    guard = lock_path.with_name(lock_path.name + ".guard")
    try:
        guard.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(guard, os.O_RDWR | os.O_CREAT, 0o644)
    except OSError as exc:
        raise Locked(f"could not open the lock guard: {exc}") from None
    try:
        deadline = time.monotonic() + GUARD_WAIT_SECONDS
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise Locked("another run is taking the lock right now") from None
                time.sleep(0.01)
            except OSError as exc:
                raise Locked(f"could not take the lock guard: {exc}") from None
        yield
    finally:
        os.close(fd)        # closing the descriptor drops the flock


class Lock:
    """Atomic ``mkdir`` lock, with the owning pid recorded for diagnosis. Every change to
    the directory happens under :func:`_guard`, so at most one run ever holds it."""

    def __init__(self, path: Path = LOCK_DIR) -> None:
        self.path = path
        self.held = False
        self.token: str | None = None

    def acquire(self) -> "Lock":
        with _guard(self.path):
            try:
                self.path.mkdir(parents=True)
            except FileExistsError:
                self._break_stale()
            token = f"{os.getpid()}-{time.time_ns()}"
            try:
                (self.path / "owner.json").write_text(
                    json.dumps({"pid": os.getpid(), "started": time.time(),
                                "token": token}),
                    encoding="utf-8")
            except OSError as exc:
                try:
                    self.path.rmdir()       # leave nothing owner-less behind if we can
                except OSError:
                    pass
                raise Locked(f"could not record the lock owner: {exc}") from None
            # Belt and braces: a run outside the guard (an older checkout) may have
            # replaced ours in between.
            if self.owner().get("token") != token:
                raise Locked("another run took the lock at the same moment")
            self.token = token
            self.held = True
        return self

    def _break_stale(self) -> None:
        """Remove a stale lock and take it, or raise :class:`Locked`. Called under the
        guard. Any filesystem failure (the lock vanished, filled up, or was re-taken
        under us) means held."""
        try:
            info = self.owner()
            age = time.time() - self.path.stat().st_mtime
            pid = info.get("pid")
            if not info and age < OWNERLESS_GRACE_SECONDS:
                # The owner may be between its mkdir and its owner.json write.
                raise Locked(f"another run is taking the lock ({age:.0f} s old, "
                             "no owner yet)")
            try:
                alive = pid is not None and _pid_alive(int(pid))
            except (TypeError, ValueError):
                alive = False
            if alive and age < STALE_LOCK_SECONDS:
                raise Locked(f"another run holds the lock (pid {pid}, "
                             f"{age / 60:.0f} min old)")
            # Stale: the owner is gone, or it has been running implausibly long.
            if self.owner() != info:
                raise Locked("the lock changed hands while it was being checked")
            (self.path / "owner.json").unlink(missing_ok=True)
            self.path.rmdir()
            self.path.mkdir(parents=True)
        except OSError as exc:
            raise Locked(f"could not take the stale lock: {exc}") from None
        if self.owner():
            raise Locked("another run took the stale lock first")

    def owner(self) -> dict:
        try:
            return json.loads((self.path / "owner.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def release(self) -> None:
        """Remove the lock if it is still ours. A lock another run has since taken over
        (ours looked stale to it) is left alone. If the guard cannot be had, the
        directory stays behind with our dead pid in it, which the next run breaks."""
        if not self.held:
            return
        self.held = False
        try:
            with _guard(self.path):
                if self.owner().get("token") != self.token:
                    return
                (self.path / "owner.json").unlink(missing_ok=True)
                try:
                    self.path.rmdir()
                except OSError:
                    pass
        except (Locked, OSError):
            pass

    def __enter__(self) -> "Lock":
        return self.acquire()

    def __exit__(self, *exc) -> None:
        self.release()


def release_if_owner_dead(path: Path | None = None) -> bool:
    """Remove the lock if the process that took it is gone. Returns True if removed.

    A run killed by the wrapper's backstop (SIGTERM, then SIGKILL) never reaches its
    ``finally``, so the lock directory outlives it — and ``make vtt-up``'s lock check
    refuses to start the table while it exists, with no staleness test of its own. A
    lock whose owner is still alive is never touched, however old."""
    path = path or LOCK_DIR
    if not path.is_dir():
        return False
    try:
        with _guard(path):
            if not path.is_dir():
                return False
            pid = Lock(path).owner().get("pid")
            try:
                if pid is not None and _pid_alive(int(pid)):
                    return False
            except (TypeError, ValueError):
                pass
            (path / "owner.json").unlink(missing_ok=True)
            try:
                path.rmdir()
            except OSError:
                return False
            return True
    except (Locked, OSError):
        return False


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, ValueError):
        return False
    except PermissionError:
        return True


def is_paused() -> bool:
    return PAUSE_PATH.exists()


# ── Phase / status ───────────────────────────────────────────────────────────

@dataclass
class RunStatus:
    run_id: str
    started: float
    phase: str = "start"
    outcome: str = "running"        # running | done | no-op | dry | skipped | failed | recovered
    detail: str = ""
    updated: float = field(default_factory=time.time)

    def write(self) -> None:
        self.updated = time.time()
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        STATUS_PATH.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")

    def set_phase(self, phase: str, detail: str = "") -> None:
        self.phase, self.detail = phase, detail
        self.write()

    def finish(self, outcome: str, detail: str = "") -> None:
        self.outcome, self.detail, self.phase = outcome, detail, "finished"
        self.write()


def read_status() -> dict | None:
    try:
        return json.loads(STATUS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


# ── Entry state ──────────────────────────────────────────────────────────────

@dataclass
class EntryState:
    """What service looked like before we touched it — the restore target."""

    foundry_up: bool
    tunnel_up: bool
    active_world: str | None
    recorded: float = field(default_factory=time.time)

    def write(self) -> None:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        ENTRY_PATH.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")

    @staticmethod
    def read() -> "EntryState | None":
        try:
            d = json.loads(ENTRY_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return EntryState(foundry_up=d["foundry_up"], tunnel_up=d["tunnel_up"],
                          active_world=d.get("active_world"),
                          recorded=d.get("recorded", 0.0))

    @staticmethod
    def clear() -> None:
        ENTRY_PATH.unlink(missing_ok=True)
