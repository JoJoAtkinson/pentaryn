"""AC-4 / EC-10: the updater's mkdir lock must never hand out two holders, never leak a raw
OSError, and the wrapper's backstop must fire before the lock is old enough to look stale.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from scripts.foundry.update import escalate as esc
from scripts.foundry.update import state


@pytest.fixture
def lock_dir(tmp_path) -> Path:
    return tmp_path / "vtt-update.lock"


def _dead_pid() -> int:
    p = subprocess.Popen([sys.executable, "-c", "pass"])
    p.wait()
    return p.pid


def _age_seconds(path: Path, seconds: float) -> None:
    t = time.time() - seconds
    os.utime(path, (t, t))


def test_ac4_ownerless_young_lock_is_held(lock_dir):
    """The owner may be between its mkdir and its owner.json write: not stale yet."""
    lock_dir.mkdir()
    with pytest.raises(state.Locked):
        state.Lock(lock_dir).acquire()
    assert lock_dir.is_dir() and not (lock_dir / "owner.json").exists()


def test_ac4_ownerless_old_lock_is_taken(lock_dir):
    lock_dir.mkdir()
    _age_seconds(lock_dir, 120)
    lock = state.Lock(lock_dir).acquire()
    assert lock.held and lock.owner()["pid"] == os.getpid()
    lock.release()
    assert not lock_dir.exists()


def test_ac4_failed_stale_break_raises_locked_not_oserror(lock_dir):
    """A stale lock that cannot be removed (here: not empty) is reported as held."""
    lock_dir.mkdir()
    (lock_dir / "owner.json").write_text(json.dumps({"pid": _dead_pid()}))
    (lock_dir / "something-else").write_text("x")
    with pytest.raises(state.Locked):
        state.Lock(lock_dir).acquire()


def test_ac4_lock_vanishing_mid_check_raises_locked(lock_dir, monkeypatch):
    lock_dir.mkdir()
    real_stat = Path.stat

    def stat(self, *a, **k):
        if self == lock_dir:
            raise FileNotFoundError(str(self))
        return real_stat(self, *a, **k)
    monkeypatch.setattr(Path, "stat", stat)
    with pytest.raises(state.Locked):
        state.Lock(lock_dir).acquire()


def test_ac4_racer_owner_after_remkdir_is_respected(lock_dir, monkeypatch):
    """Two runs break the same stale lock; the one that finds the other's owner.json after
    its own re-mkdir must back off instead of overwriting it."""
    lock_dir.mkdir()
    (lock_dir / "owner.json").write_text(json.dumps({"pid": _dead_pid()}))
    real_mkdir = Path.mkdir
    calls = {"n": 0}

    def mkdir(self, *a, **k):
        real_mkdir(self, *a, **k)
        if self == lock_dir:
            calls["n"] += 1
            if calls["n"] == 1:     # our re-mkdir; a racer's owner lands right after
                (self / "owner.json").write_text(
                    json.dumps({"pid": os.getppid(), "started": time.time(), "token": "racer"}))
    monkeypatch.setattr(Path, "mkdir", mkdir)
    lock = state.Lock(lock_dir)
    with pytest.raises(state.Locked):
        lock.acquire()
    assert not lock.held
    assert json.loads((lock_dir / "owner.json").read_text())["token"] == "racer"


def _stale(lock_dir: Path) -> None:
    lock_dir.mkdir()
    (lock_dir / "owner.json").write_text(json.dumps({"pid": _dead_pid()}))
    _age_seconds(lock_dir, 4 * 3600)


def test_ac4_second_run_cannot_acquire_inside_a_stale_break(lock_dir, monkeypatch):
    """Run A has judged the lock stale and is about to remove it; run B tries a whole
    acquire in that window. The guard makes B wait (here: give up), so A's removal never
    deletes a lock B believes it holds."""
    _stale(lock_dir)
    monkeypatch.setattr(state, "GUARD_WAIT_SECONDS", 0.05)
    A, B = state.Lock(lock_dir), state.Lock(lock_dir)
    real_unlink = Path.unlink
    fired = {"n": 0}

    def unlink(self, *a, **k):
        if self.name == "owner.json" and fired["n"] == 0:
            fired["n"] = 1
            with pytest.raises(state.Locked):
                B.acquire()
        return real_unlink(self, *a, **k)
    monkeypatch.setattr(Path, "unlink", unlink)
    A.acquire()
    assert fired["n"] == 1
    assert A.held and not B.held
    assert A.owner()["token"] == A.token


def test_ac4_owner_write_failure_raises_locked_not_oserror(lock_dir, monkeypatch):
    """If the directory is gone by the time owner.json is written, that is Locked, not a
    raw FileNotFoundError that crashes the run."""
    _stale(lock_dir)
    real_mkdir = Path.mkdir
    n = {"k": 0}

    def mkdir(self, *a, **k):
        r = real_mkdir(self, *a, **k)
        if self == lock_dir:
            n["k"] += 1
            if n["k"] == 1:
                lock_dir.rmdir()
        return r
    monkeypatch.setattr(Path, "mkdir", mkdir)
    lock = state.Lock(lock_dir)
    with pytest.raises(state.Locked):
        lock.acquire()
    assert not lock.held


def test_ac4_release_leaves_a_lock_taken_over_by_another_run(lock_dir):
    """A run whose lock was broken (it looked stale) must not delete the new owner's."""
    lock = state.Lock(lock_dir).acquire()
    (lock_dir / "owner.json").write_text(json.dumps({"pid": os.getpid(), "token": "other"}))
    lock.release()
    assert not lock.held
    assert json.loads((lock_dir / "owner.json").read_text())["token"] == "other"


_RACER = r"""
import sys, time
sys.path.insert(0, sys.argv[1])
from pathlib import Path
from scripts.foundry.update import state
lock = state.Lock(Path(sys.argv[2]))
print("ready", flush=True)
sys.stdin.readline()                      # the start gun
try:
    lock.acquire()
except state.Locked:
    print("locked", flush=True)
    sys.exit(0)
except BaseException as exc:
    print(f"raw {type(exc).__name__}: {exc}", flush=True)
    sys.exit(0)
print("won", flush=True)
time.sleep(0.1)
lock.release()
"""


@pytest.mark.parametrize("mode", ["stale", "fresh"])
def test_ac4_real_processes_racing_get_exactly_one_holder(tmp_path, mode):
    """Separate processes, released together, race the same lock: exactly one wins every
    trial, and nothing but Locked comes out of acquire()."""
    root = str(Path(__file__).resolve().parents[2])
    for trial in range(12):
        path = tmp_path / f"t{trial}" / "vtt-update.lock"
        path.parent.mkdir()
        if mode == "stale":
            _stale(path)
        procs = [subprocess.Popen([sys.executable, "-c", _RACER, root, str(path)],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
                 for _ in range(4)]
        for p in procs:
            assert p.stdout.readline().strip() == "ready"
        for p in procs:
            p.stdin.write("go\n")
            p.stdin.flush()
        results = [p.communicate(timeout=30)[0].strip() for p in procs]
        assert results.count("won") == 1, results
        assert all(r in ("won", "locked") for r in results), results
        assert not path.exists()


def test_ac4_live_owner_still_refuses(lock_dir):
    lock_dir.mkdir()
    (lock_dir / "owner.json").write_text(json.dumps({"pid": os.getpid()}))
    with pytest.raises(state.Locked):
        state.Lock(lock_dir).acquire()


def test_ac4_wrapper_timeout_never_exceeds_stale_lock():
    """EC-10: max_minutes is clamped so the backstop kill lands before the lock reads stale,
    and the clamp is said out loud in the ceiling reasons."""
    policy = {"escalation": {"enabled": True, "max_tier": "analyze", "max_minutes": 180}}
    assert esc.wrapper_timeout(policy) <= state.STALE_LOCK_SECONDS
    assert esc.wrapper_timeout(policy) == state.STALE_LOCK_SECONDS
    cfg = esc.config(policy)
    _, why = esc.ceiling(cfg, minutes_remaining=600, budget_left=100)
    assert any("max_minutes 180 clamped to 90" in r for r in why)
    # Inside the cap: no message, unchanged.
    ok = esc.config({"escalation": {"enabled": True, "max_minutes": 60}})
    assert esc.max_minutes(ok) == 60
    assert not any("clamped" in r for r in esc.ceiling(ok, minutes_remaining=600,
                                                       budget_left=100)[1])
