"""`make vtt-down` uploads in the background (rclone-two-hosts-2026-10 §14, 2026-10-11).

The tar is built in the foreground (Foundry is stopped, so the world is consistent); the
upload — sidecar, `.partial` copy, rename, coalesce, prune, the based-on record — runs in
a detached `cloud upload-pending`. Here the spawn is captured and the uploader run
in-process, except for one test that starts the real detached process.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time

import pytest

from cloud_fakes import FakeRclone
from scripts.foundry import bootstate, cloud, storage, uploadq
from scripts.foundry.storage import RcloneStorage

DAY = 86400


def _snaps(cloud_dir):
    return sorted(p.name for p in (cloud_dir / "world-backups").iterdir()
                  if p.name.startswith("world-") and p.name.endswith(".tar.gz"))


def _edit(data_root, text):
    f = data_root / "Data/worlds/w/journal.txt"
    f.write_text(text)
    t = time.time() + len(text) * 7
    os.utime(f, (t, t))


@pytest.fixture
def spawned(monkeypatch):
    """Capture the background hand-off instead of starting a process."""
    calls = []
    monkeypatch.setattr(cloud, "_spawn_uploader", lambda: calls.append(1) or 4242)
    return calls


def _rclone_cloud(two_hosts, monkeypatch) -> FakeRclone:
    fake = FakeRclone(two_hosts.cloud.parent)
    rc = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    monkeypatch.setattr(storage, "get", lambda: rc)
    return fake


@pytest.fixture
def held():
    """`held(name)` holds a queue lock from another thread until `.release()` —
    another process uploading right now."""
    holders = []

    class Holder:
        def __init__(self, name):
            self.go, self.release_ev = threading.Event(), threading.Event()

            def run():
                with uploadq.lock(name):
                    self.go.set()
                    self.release_ev.wait(10)
            self.t = threading.Thread(target=run, daemon=True)
            self.t.start()
            assert self.go.wait(5)

        def release(self):
            self.release_ev.set()
            self.t.join(5)

    def make(name):
        h = Holder(name)
        holders.append(h)
        return h
    yield make
    for h in holders:
        h.release()


# ── the hand-off ────────────────────────────────────────────────────────────

def test_background_backup_returns_before_the_upload(two_hosts, spawned, capsys):
    with two_hosts.use("mac") as data:
        assert cloud.backup("shutdown", background=True) == 0
        [job] = uploadq.pending()
        assert job.tar.is_file() and job.reason == "shutdown" and job.parent is None
        assert _snaps(two_hosts.cloud) == []                   # nothing uploaded yet
        assert bootstate.load().based_on is None               # nor recorded
        assert spawned == [1]
        out = capsys.readouterr().out
        assert job.name in out and "make foundry-cloud" in out and "sleep" in out

        assert cloud.upload_pending() == 0                     # the detached process
        assert _snaps(two_hosts.cloud) == [job.name]
        assert (two_hosts.cloud / "world-backups" / (job.name + ".parent")).is_file()
        state = bootstate.load()
        assert state.based_on == job.name and state.digest == job.digest
        assert uploadq.pending() == [] and not job.tar.exists()
        assert uploadq.read_status()["state"] == "done"
        assert not list((data / ".pentaryn-tmp").glob("world-*"))


def test_the_uploader_logs_to_the_ops_log(two_hosts, spawned):
    from scripts.foundry.ops import config as cfg
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        cloud.upload_pending()
    lines = [json.loads(x) for f in cfg.OPS_LOG_DIR.glob("ops-*.jsonl")
             for x in f.read_text().splitlines()]
    states = [x["state"] for x in lines if x.get("cmd") == "cloud-upload"]
    assert states == ["queued", "uploading", "done"]


def test_an_unchanged_world_queues_nothing(two_hosts, spawned):
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                               # blocking, recorded
        assert cloud.backup("shutdown", background=True) == 0
        assert uploadq.pending() == [] and spawned == []


def test_coalescing_pruning_and_lineage_are_unchanged(two_hosts, spawned):
    with two_hosts.use("mac") as data:
        cloud.backup("shutdown")
        first = bootstate.load().based_on
        _edit(data, "second session")
        cloud.backup("shutdown", background=True)
        cloud.upload_pending()
        [second] = _snaps(two_hosts.cloud)                     # coalesced `first` away
        assert second != first
        anc = cloud.read_ancestry(cloud.store(), cloud.find_snapshot(cloud.store(), second))
        assert anc == [first]


# ── bootstate moves only when the upload completes; a failure is retried ─────

def test_a_failed_upload_records_nothing_and_leaves_the_job(two_hosts, spawned, monkeypatch):
    fake = _rclone_cloud(two_hosts, monkeypatch)
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        fake.fail_always["copyto"] = (1, "Failed to copy: connection reset")
        assert cloud.upload_pending() == 1
        assert bootstate.load().based_on is None
        [job] = uploadq.pending()
        assert job.tar.is_file()
        st = uploadq.read_status()
        assert st["state"] == "failed" and "connection reset" in st["error"]

        del fake.fail_always["copyto"]
        assert cloud.upload_pending() == 0                     # the retry
        assert bootstate.load().based_on == job.name
        assert _snaps(two_hosts.cloud) == [job.name]


def test_a_crashed_upload_is_retried_by_the_next_blocking_backup(two_hosts, spawned):
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)              # …and the uploader died
        [job] = uploadq.pending()
        assert cloud.backup("manual") == 0                     # drains it, then: unchanged
        assert _snaps(two_hosts.cloud) == [job.name]
        assert bootstate.load().based_on == job.name and uploadq.pending() == []


def test_a_crash_after_the_rename_does_not_upload_twice(two_hosts, spawned, monkeypatch):
    """Uploaded, but the process died before recording: the retry sees it is there."""
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        cloud.store().upload(job.tar, f"world-backups/{job.name}")
        fake = _rclone_cloud(two_hosts, monkeypatch)
        assert cloud.upload_pending() == 0
        assert "copyto" not in fake.verbs()
        assert bootstate.load().based_on == job.name


def test_a_change_behind_a_crashed_upload_extends_it(two_hosts, spawned):
    """A second vtt-down while the first upload never finished: the new snapshot's
    based-on is the queued one, both go up in order, and the record ends on the second."""
    with two_hosts.use("mac") as data:
        cloud.backup("shutdown", background=True)
        [j1] = uploadq.pending()
        _edit(data, "more work")
        cloud.backup("shutdown", background=True)
        j1b, j2 = uploadq.pending()
        assert j1b.name == j1.name and j2.parent == j1.name
        assert cloud.upload_pending() == 0
        assert bootstate.load().based_on == j2.name
        snap = cloud.find_snapshot(cloud.store(), j2.name)
        assert cloud.read_ancestry(cloud.store(), snap)[0] == j1.name


def test_an_unchanged_world_behind_a_crashed_upload_builds_nothing(two_hosts, spawned):
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        cloud.backup("shutdown", background=True)
        assert len(uploadq.pending()) == 1 and spawned == [1, 1]   # retried, not rebuilt


def test_a_crashed_build_leaves_nothing_queued(two_hosts, spawned, monkeypatch):
    def boom(*a, **k):
        raise KeyboardInterrupt
    with two_hosts.use("mac"):
        with monkeypatch.context() as m:
            m.setattr(cloud.tarfile, "open", boom)
            with pytest.raises(KeyboardInterrupt):
                cloud.backup("shutdown", background=True)
        assert uploadq.pending() == [] and spawned == []
        assert not list(uploadq.tmp_dir().glob("*" + uploadq.BUILDING_SUFFIX))
        assert cloud.backup("shutdown", background=True) == 0    # the lock was released
        assert len(uploadq.pending()) == 1


# ── the lock: no duplicates, no corrupt record ──────────────────────────────

def test_a_second_uploader_waits_and_uploads_nothing_twice(two_hosts, spawned, held,
                                                           monkeypatch):
    fake = _rclone_cloud(two_hosts, monkeypatch)
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        h = held(uploadq.UPLOAD_LOCK)
        assert uploadq.busy(uploadq.UPLOAD_LOCK)
        done = []
        t = threading.Thread(target=lambda: done.append(cloud.upload_pending()))
        t.start()
        time.sleep(0.3)
        assert done == [] and "copyto" not in fake.verbs()    # waiting, not uploading
        h.release()
        t.join(10)
        assert done == [0]
        assert cloud.upload_pending() == 0                     # nothing left: no-op
        assert fake.verbs().count("moveto") == 1


def test_prelaunch_backup_skips_while_an_upload_runs(two_hosts, spawned, held, capsys):
    with two_hosts.use("mac") as data:
        _edit(data, "unsaved")
        held(uploadq.UPLOAD_LOCK)
        t0 = time.time()
        assert cloud.backup("prelaunch", if_stopped=True) == 0
        assert time.time() - t0 < 2
        assert "upload is in progress" in capsys.readouterr().out
        assert uploadq.pending() == [] and _snaps(two_hosts.cloud) == []


def test_prelaunch_retries_a_crashed_upload_in_the_background(two_hosts, spawned,
                                                              monkeypatch, capsys):
    """vtt-up after an upload that never finished: it goes up again from the background,
    and the launch does not wait for it."""
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        fake = _rclone_cloud(two_hosts, monkeypatch)
        assert cloud.backup("prelaunch", if_stopped=True) == 0
        assert "copyto" not in fake.verbs() and spawned == [1, 1]
        assert [j.name for j in uploadq.pending()] == [job.name]   # unchanged: not rebuilt
        assert "retrying the unfinished upload" in capsys.readouterr().out


def test_a_blocking_backup_waits_for_the_running_upload(two_hosts, spawned, held, capsys):
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        h = held(uploadq.UPLOAD_LOCK)
        done = []
        t = threading.Thread(target=lambda: done.append(cloud.backup("manual")))
        t.start()
        time.sleep(0.3)
        assert done == []
        h.release()
        t.join(10)
        assert done == [0]
        assert _snaps(two_hosts.cloud) == [job.name]
        assert bootstate.load().based_on == job.name
    assert "waiting for the background upload" in capsys.readouterr().out


def test_restore_finishes_the_pending_upload_first(two_hosts, spawned):
    """The record must be the restored snapshot, not the queued one finishing after."""
    with two_hosts.use("boss") as data:
        _edit(data, "boss work")
        cloud.backup("shutdown")
    boss = _snaps(two_hosts.cloud)[0]
    with two_hosts.use("mac") as data:
        _edit(data, "mac session")
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        cloud.restore(boss, yes=True)
        assert job.name in _snaps(two_hosts.cloud)             # uploaded first
        assert uploadq.pending() == []
        assert bootstate.load().based_on == boss
        assert cloud.upload_pending() == 0 and bootstate.load().based_on == boss


def test_restoring_the_snapshot_the_queued_upload_would_coalesce_keeps_it(two_hosts,
                                                                          spawned):
    """X is this host's newest (inside the 5-day window) and the queued tar extends it:
    its upload would replace X — but a restore of X is waiting on that upload."""
    with two_hosts.use("mac") as data:
        cloud.backup("shutdown")
        x = bootstate.load().based_on
        _edit(data, "after x")
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        cloud.restore(x, yes=True)
        assert {x, job.name} <= set(_snaps(two_hosts.cloud))
        assert bootstate.load().based_on == x


# ── the boot choice and the status line ─────────────────────────────────────

def test_boot_keeps_local_while_this_worlds_upload_is_in_flight(two_hosts, spawned, tty):
    from scripts.foundry import boot
    with two_hosts.use("boss") as data:
        _edit(data, "boss work")
        cloud.backup("shutdown")
    with two_hosts.use("mac") as data:
        _edit(data, "mac session")
        cloud.backup("shutdown", background=True)
        asked = tty(True, ["l"])
        d = boot.decide(None, True)
        assert d.action == "local" and "uploading" in d.why and asked == []


def test_boot_from_latest_finishes_the_upload_first(two_hosts, spawned, tty):
    from scripts.foundry import boot
    with two_hosts.use("mac") as data:
        _edit(data, "mac session")
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        tty(False)
        assert boot.choose("latest", False) == 0
        assert uploadq.pending() == [] and bootstate.load().based_on == job.name


def test_status_shows_the_upload(two_hosts, spawned, held, capsys, monkeypatch):
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        h = held(uploadq.UPLOAD_LOCK)
        uploadq.write_status(state="uploading", name=job.name, started=time.time())
        cloud.status()
        assert f"in progress: {job.name}" in capsys.readouterr().out
        h.release()
        uploadq.write_status(state="uploading", name=job.name, started=time.time())
        cloud.status()                                         # lock free → crashed
        out = capsys.readouterr().out
        assert f"pending: {job.name}" in out and "retries" in out
        cloud.upload_pending()
        cloud.status()
        assert f"last: {job.name} done" in capsys.readouterr().out


# ── WAIT=1 and the real detached process ────────────────────────────────────

@pytest.mark.repo
@pytest.mark.skipif(__import__("shutil").which("make") is None, reason="make not installed")
def test_vtt_down_backgrounds_unless_wait(tmp_path):
    from scripts.foundry.ops import config as cfg

    def dry(*args):
        p = subprocess.run(["make", "-n", "vtt-down", *args], cwd=cfg.REPO_ROOT,
                           capture_output=True, text=True, timeout=30)
        assert p.returncode == 0, p.stderr
        return p.stdout
    assert "backup --reason shutdown --background" in dry()
    waited = dry("WAIT=1")
    assert "backup --reason shutdown" in waited and "--background" not in waited


def test_wait_mode_uploads_before_returning(two_hosts, spawned):
    with two_hosts.use("mac"):
        assert cloud.main(["backup", "--reason", "shutdown"]) == 0
        assert len(_snaps(two_hosts.cloud)) == 1 and spawned == []
        assert bootstate.load().based_on == _snaps(two_hosts.cloud)[0]


def test_the_real_detached_uploader_finishes_on_its_own(fake_cloud, fake_data, monkeypatch):
    """No capture: `backup --background` starts the real process, returns, and the
    process uploads and records by itself (logging to the tmp ops-log folder)."""
    monkeypatch.setattr(cloud.host, "is_running", lambda port=None: False)
    monkeypatch.setattr(cloud.shutil, "which", lambda name: None)    # no caffeinate
    assert cloud.backup("shutdown", background=True) == 0
    deadline = time.time() + 60
    while time.time() < deadline and (uploadq.pending() or uploadq.busy(uploadq.UPLOAD_LOCK)):
        time.sleep(0.2)
    log = (fake_data / ".pentaryn-tmp" / uploadq.LOG_FILE)
    assert uploadq.pending() == [], log.read_text() if log.exists() else "no log"
    assert len(_snaps(fake_cloud)) == 1
    assert bootstate.load().based_on == _snaps(fake_cloud)[0]
    assert uploadq.read_status()["state"] == "done"
