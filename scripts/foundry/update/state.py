#!/usr/bin/env python3
"""Run state: the lock, the phase file, and the service state to put back.

Three separate things live in ``.state/``, and conflating them is how an unattended job
turns one bad Saturday into a bad month:

``vtt-update.lock``     a directory. ``mkdir`` is atomic on every filesystem here, and
                        **macOS has no ``flock``** — the obvious first choice is simply
                        not available. Also read by ``make vtt-up`` / ``vtt-down`` so a
                        human cannot start the tunnel underneath a running update.
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

import json
import os
import time
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


class Locked(RuntimeError):
    """Another run holds the lock."""


class Lock:
    """Atomic ``mkdir`` lock, with the owning pid recorded for diagnosis."""

    def __init__(self, path: Path = LOCK_DIR) -> None:
        self.path = path
        self.held = False

    def acquire(self) -> "Lock":
        try:
            self.path.mkdir(parents=True)
        except FileExistsError:
            info = self.owner()
            age = time.time() - self.path.stat().st_mtime
            pid = info.get("pid")
            alive = pid is not None and _pid_alive(int(pid))
            if alive and age < STALE_LOCK_SECONDS:
                raise Locked(f"another run holds the lock (pid {pid}, "
                             f"{age / 60:.0f} min old)") from None
            # Stale: the owner is gone, or it has been running implausibly long.
            (self.path / "owner.json").unlink(missing_ok=True)
            self.path.rmdir()
            self.path.mkdir(parents=True)
        (self.path / "owner.json").write_text(
            json.dumps({"pid": os.getpid(), "started": time.time()}), encoding="utf-8")
        self.held = True
        return self

    def owner(self) -> dict:
        try:
            return json.loads((self.path / "owner.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def release(self) -> None:
        if not self.held:
            return
        (self.path / "owner.json").unlink(missing_ok=True)
        try:
            self.path.rmdir()
        except OSError:
            pass
        self.held = False

    def __enter__(self) -> "Lock":
        return self.acquire()

    def __exit__(self, *exc) -> None:
        self.release()


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
    outcome: str = "running"        # running | done | skipped | failed | recovered
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
