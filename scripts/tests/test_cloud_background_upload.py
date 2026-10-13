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
from scripts.foundry import bootstate, bundles, cloud, storage, uploadq
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


def _moved(fake, sub) -> list[str]:
    """The `moveto` renames into cloud subfolder `sub` (one per completed upload)."""
    dsts = [FakeRclone._positional(c[2:])[1] for c in fake.calls if c[1] == "moveto"]
    return [d.rsplit("/", 1)[-1] for d in dsts if f"/{sub}/" in d]


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


def test_the_post_landing_retention_is_its_own_step(two_hosts, spawned, monkeypatch,
                                                    capsys):
    """Review M10: `_upload_job` publishes; `_after_landing` does what follows a landed
    snapshot — the record, the queue drop, coalescing, pruning, GC — in the same order
    and with the same log lines as when it was one function."""
    seen = []
    real = cloud._after_landing

    def spy(st, job, me, state, linked, superseded, keep_names, snap, **kw):
        seen.append((job.name, me, linked, superseded and superseded.name, snap.name,
                     job.tar.exists() or uploadq.pending() != []))
        return real(st, job, me, state, linked, superseded, keep_names, snap, **kw)

    monkeypatch.setattr(cloud, "_after_landing", spy)
    with two_hosts.use("mac") as data:
        cloud.backup("shutdown")
        first = bootstate.load().based_on
        _edit(data, "second session")
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        capsys.readouterr()
        cloud.upload_pending()
        out = capsys.readouterr().out
        assert seen[-1] == (job.name, "mac", True, first, job.name, True)
        assert bootstate.load().based_on == job.name and uploadq.pending() == []
        landed, replaced, kept = (out.index(f"snapshot → {job.name} ("),
                                  out.index(f"replaced {first} ("),
                                  out.index(" snapshots kept for mac"))
        assert landed < replaced < kept


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
    """Uploaded, but the process died before recording: the retry sees it is there.
    (Bundles go up before the world tar, so they are there too.)"""
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        assert job.bundles                                     # the module's bundle, staged
        for n in job.bundles:
            cloud.store().upload(job.staging / n, f"bundles/{n}")
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


def test_a_name_that_does_not_round_trip_is_refused_ext_3(two_hosts, spawned, monkeypatch,
                                                           capsys):
    """EXT-3: a snapshot name must parse back with this host's tag — a core version like
    `15.0-beta` would make `fvtt15.0-beta-mac` read as host `beta-mac`."""
    monkeypatch.setattr(cloud, "core_version", lambda: "15.0-beta")
    with two_hosts.use("mac"):
        with pytest.raises(SystemExit):
            cloud.backup("shutdown", background=True)
        assert uploadq.pending() == [] and spawned == []
        assert not list(uploadq.tmp_dir().glob("world-*"))
    err = capsys.readouterr().err
    assert "15.0-beta" in err and "beta-mac" in err


# ── the lock: no duplicates, no corrupt record ──────────────────────────────

def test_a_second_uploader_waits_and_uploads_nothing_twice(two_hosts, spawned, held,
                                                           monkeypatch):
    fake = _rclone_cloud(two_hosts, monkeypatch)
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        job_bundles = job.bundles
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
        assert len(_moved(fake, "world-backups")) == 1
        assert len(_moved(fake, "bundles")) == len(job_bundles)


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


# ── module bundles in the queue (module-bundles-2026-10 §5) ──────────────────

def _tool(data_root, body="// v1\n"):
    """A second module, `tools`, whose content a test can change (module-sync)."""
    d = data_root / "Data/modules/tools"
    d.mkdir(parents=True, exist_ok=True)
    (d / "module.json").write_text('{"id": "tools", "version": "1"}\n')
    (d / "main.js").write_text(body)


def _bundles(cloud_dir):
    return sorted(p.name for p in (cloud_dir / "bundles").iterdir()
                  if p.name.endswith(".tar.gz"))


def _tools_bundle(cloud_dir):
    [n] = [n for n in _bundles(cloud_dir) if n.startswith("module@tools@")]
    return n


def _sidecar(cloud_dir, name):
    return json.loads((cloud_dir / "world-backups" / f"{name}.parent").read_text())


def _local_hash(root):
    """Data/ and Config/ — the local world, its modules and systems — by path, bytes and
    mtime (the temp dir, the bundle cache and the boot state are not the tree)."""
    import hashlib
    h = hashlib.sha256()
    for top in ("Data", "Config"):
        for p in sorted((root / top).rglob("*")):
            st = p.lstat()
            h.update(f"{p.relative_to(root).as_posix()}\0{st.st_mtime_ns}\0".encode())
            if p.is_file():
                h.update(p.read_bytes())
    return h.hexdigest()


def _sweep_after_build(monkeypatch, cloud_dir, name, *, only_safety=False):
    """The other host's GC sweeps bundle `name` right after this host's build queued a job
    that reuses it, and the folder has changed since (a rebuild finds another
    fingerprint): the job can never be complete."""
    real = cloud._build

    def build(*a, **k):
        job = real(*a, **k)
        if job is not None and (job.safety or not only_safety):
            (cloud_dir / "bundles" / name).unlink()
        return job
    monkeypatch.setattr(cloud, "_build", build)
    monkeypatch.setattr(cloud, "_rebuilder", lambda rebuilt, dest_dir=None: (lambda n: None))


def test_a_background_job_stages_and_uploads_the_bundles_the_cloud_lacks(two_hosts,
                                                                          spawned):
    with two_hosts.use("mac") as data:
        _tool(data)
        assert cloud.backup("shutdown", background=True) == 0
        [job] = uploadq.pending()
        assert job.manifest is not None
        assert {n.split("@")[1] for n in job.bundles} == {"m", "tools"}
        assert all((job.staging / n).is_file() for n in job.bundles)
        assert _bundles(two_hosts.cloud) == []                  # nothing up yet
        assert cloud.upload_pending() == 0
        assert _bundles(two_hosts.cloud) == sorted(job.bundles)
        side = _sidecar(two_hosts.cloud, job.name)
        assert side["bundled"] == 1 and set(side["modules"]) == {"m", "tools"}
        assert not job.staging.exists() and not job.tar.exists()


def test_two_queued_jobs_staging_the_same_bundle_keep_their_own_tars(two_hosts, spawned):
    """Review M1: job 2 is built while job 1 still waits, so both stage `tools`. Job 1
    leaving the queue (here its tar is gone) must not take job 2's staged tar; job 2
    uploads it from its own folder — no rebuild, which would fail: the folder changed."""
    with two_hosts.use("mac") as data:
        _tool(data, "// v1\n")
        cloud.backup("shutdown", background=True)
        _edit(data, "more work")
        cloud.backup("shutdown", background=True)
        j1, j2 = uploadq.pending()
        [t1] = [n for n in j1.bundles if n.startswith("module@tools@")]
        assert t1 in j2.bundles and j1.staging != j2.staging
        _tool(data, "// v2, after both builds\n")
        j1.tar.unlink()
        assert cloud.upload_pending() == 0
        assert _snaps(two_hosts.cloud) == [j2.name]
        assert t1 in _bundles(two_hosts.cloud)
        state = bootstate.load()
        assert state.based_on == j2.name and state.digest == j2.digest   # linked
        assert uploadq.pending() == [] and not j1.staging.exists() and not j2.staging.exists()


def test_a_pre_merge_job_without_a_manifest_uploads_as_a_full_snapshot(two_hosts, spawned):
    """Review merge finding (a): a job the pre-bundles code queued holds a FULL tar. It
    goes up as one — a lineage-only sidecar, no bundle uploads, no checks — and restores
    as a full snapshot."""
    with two_hosts.use("mac") as data:
        name = f"world-2026-10-11-200000-fvtt{cloud.core_version()}-mac.tar.gz"
        tar_path = uploadq.tmp_dir() / name
        import tarfile
        with tarfile.open(tar_path, "w:gz") as tar:
            for rel in ("Data/worlds", "Config", "Data/modules"):
                tar.add(data / rel, arcname=rel)
        (uploadq.tmp_dir() / f"{name}{uploadq.JOB_SUFFIX}").write_text(json.dumps({
            "name": name, "reason": "shutdown", "digest": "pre-merge", "parent": None,
            "host": "mac", "size": tar_path.stat().st_size, "created": time.time(),
            "safety": False, "protect": None}))
        [job] = uploadq.pending()
        assert job.manifest is None and job.bundles == [] and job.heal is False
        assert cloud.upload_pending() == 0
        assert _snaps(two_hosts.cloud) == [name] and _bundles(two_hosts.cloud) == []
        side = _sidecar(two_hosts.cloud, name)
        assert "bundled" not in side and side["host"] == "mac"
        st = cloud.store()
        assert cloud.read_manifest(st, cloud.find_snapshot(st, name)) is None
        assert bootstate.load().based_on == name
    with two_hosts.use("boss") as data:
        (data / "Data/modules/m").rename(data / "Data/modules/gone")
        cloud.restore(name, yes=True)
        assert (data / "Data/modules/m/module.json").is_file()      # the full tar's modules


def test_a_rerun_that_skips_the_world_upload_still_checks_the_bundles(two_hosts, spawned,
                                                                       monkeypatch):
    """Review (R): the second check runs when the world tar is already up (a re-run after
    a crash) too. Here the bundle vanishes after the first check."""
    with two_hosts.use("mac") as data:
        _tool(data)
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        st = cloud.store()
        for n in job.bundles:                                  # an earlier attempt got
            st.upload(job.staging / n, f"bundles/{n}")         # past the rename
        st.upload(job.tar, f"world-backups/{job.name}")
        tools = _tools_bundle(two_hosts.cloud)
        real_write, real_upload = storage.FolderStorage.write_text, storage.FolderStorage.upload
        ups = []

        def write(self, rel, text):
            if rel.endswith(".parent"):                        # after the first check
                (two_hosts.cloud / "bundles" / tools).unlink(missing_ok=True)
            return real_write(self, rel, text)

        def upload(self, src, rel):
            ups.append(rel)
            return real_upload(self, src, rel)
        monkeypatch.setattr(storage.FolderStorage, "write_text", write)
        monkeypatch.setattr(storage.FolderStorage, "upload", upload)
        assert cloud.upload_pending() == 0
        assert ups == [f"bundles/{tools}"]                     # the world was not sent again
        assert tools in _bundles(two_hosts.cloud)
        assert bootstate.load().based_on == job.name


def test_a_job_built_days_before_it_runs_lands_its_bundles_with_a_fresh_mtime(two_hosts,
                                                                              spawned):
    """Review M2: the cloud listing's mtime is the GC grace clock; a tar staged 8 days
    ago must not land already past it."""
    with two_hosts.use("mac") as data:
        _tool(data)
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        old = time.time() - 8 * DAY
        for n in job.bundles:
            os.utime(job.staging / n, (old, old))
        job.created = old
        job.save()
        assert cloud.upload_pending() == 0
        for n in job.bundles:
            assert time.time() - (two_hosts.cloud / "bundles" / n).stat().st_mtime < 3600


@pytest.mark.parametrize("at", ["first check", "second check"])
def test_a_job_whose_reused_bundle_was_swept_and_folder_changed_is_dropped(
        two_hosts, spawned, monkeypatch, capsys, at):
    """Review merge map (h): J1 reuses tools' bundle X; the other host's GC sweeps X while
    J1 waits (or right as its world tar lands) and module-sync changed tools since, so X
    cannot be rebuilt. J1 is dropped — never retried, never stuck: the job behind it (J2,
    built after the change) still uploads, LINKED, and the queue empties."""
    with two_hosts.use("mac") as data:
        _tool(data, "// v1\n")
        cloud.backup("shutdown")                               # X in the cloud, recorded
        first = bootstate.load().based_on
        x = _tools_bundle(two_hosts.cloud)
        _edit(data, "session 1")
        cloud.backup("shutdown", background=True)
        [j1] = uploadq.pending()
        assert x in j1.manifest["modules"].values() and x not in j1.bundles   # reused
        _tool(data, "// v2\n")                                 # module-sync, after J1
        _edit(data, "session 2")
        cloud.backup("shutdown", background=True)
        j1, j2 = uploadq.pending()
        assert j2.parent == j1.name
        if at == "first check":
            (two_hosts.cloud / "bundles" / x).unlink()         # swept while J1 waited
        else:
            real = storage.FolderStorage.upload

            def racing(self, src, rel):
                real(self, src, rel)
                if rel == f"world-backups/{j1.name}":          # swept right then
                    (two_hosts.cloud / "bundles" / x).unlink(missing_ok=True)
            monkeypatch.setattr(storage.FolderStorage, "upload", racing)
        capsys.readouterr()
        assert cloud.upload_pending() == 0
        err = capsys.readouterr().err
        assert "module tools" in err and "job dropped" in err
        # J1 never stands in the cloud — at the second check its tar and sidecar landed
        # and were removed again; J2 landed, linked to `first`, recorded, coalesced it
        assert _snaps(two_hosts.cloud) == [j2.name]
        assert not (two_hosts.cloud / "world-backups" / f"{j1.name}.parent").exists()
        st = cloud.store()
        assert cloud.read_ancestry(st, cloud.find_snapshot(st, j2.name))[0] == first
        state = bootstate.load()
        assert state.based_on == j2.name and state.digest == j2.digest
        assert uploadq.pending() == [] and uploadq.in_flight() is None
        # the dropped job's world tar is kept and named, after J2's status replaced its own
        [kept] = uploadq.incomplete()
        assert kept.name == j1.name and kept.is_file()
        assert uploadq.read_status()["state"] == "done"
        cloud.status()
        out = capsys.readouterr().out
        assert f"dropped: {j1.name}" in out and str(kept) in out
    from scripts.foundry.ops import config as cfg
    lines = [json.loads(x) for f in cfg.OPS_LOG_DIR.glob("ops-*.jsonl")
             for x in f.read_text().splitlines()]
    assert any(x.get("state") == "dropped" and x.get("snapshot") == j1.name for x in lines)


def test_a_rerun_whose_first_check_fires_removes_what_an_earlier_attempt_published(
        two_hosts, spawned, monkeypatch):
    """An earlier attempt published J1's sidecar and tar, then its second check's listing
    failed (J1 stayed queued). Meanwhile X was swept and tools changed: the re-run's first
    check fires — and removes both, so no snapshot name stands without its bundles."""
    with two_hosts.use("mac") as data:
        _tool(data, "// v1\n")
        cloud.backup("shutdown")
        first = bootstate.load().based_on
        x = _tools_bundle(two_hosts.cloud)
        _edit(data, "session")
        cloud.backup("shutdown", background=True)
        [j1] = uploadq.pending()
        real_verify, calls = cloud._verify_bundles, []

        def flaky(*a, **k):
            calls.append(1)
            if len(calls) == 2:
                raise storage.StorageError("lsjson: connection reset", verb="lsjson")
            return real_verify(*a, **k)
        monkeypatch.setattr(cloud, "_verify_bundles", flaky)
        assert cloud.upload_pending() == 1                     # stays queued
        assert j1.name in _snaps(two_hosts.cloud)
        assert (two_hosts.cloud / "world-backups" / f"{j1.name}.parent").is_file()
        monkeypatch.setattr(cloud, "_verify_bundles", real_verify)
        (two_hosts.cloud / "bundles" / x).unlink()
        _tool(data, "// v2\n")
        assert cloud.upload_pending() == 0
        assert _snaps(two_hosts.cloud) == [first]
        assert not (two_hosts.cloud / "world-backups" / f"{j1.name}.parent").exists()
        assert uploadq.pending() == [] and bootstate.load().based_on == first


def test_a_restore_whose_safety_copy_is_dropped_refuses_before_touching_anything(
        two_hosts, spawned, monkeypatch, capsys):
    """Review round 3: _run_job is the foreground path too. A safety copy that can never
    complete must stop the restore (never read as "no safety copy needed") before
    apply_snapshot clears anything: the local world has no cloud copy."""
    with two_hosts.use("boss") as data:
        _edit(data, "boss work")
        cloud.backup("shutdown")
    boss = _snaps(two_hosts.cloud)[0]
    with two_hosts.use("mac") as data:
        _tool(data, "// v1\n")
        cloud.backup("shutdown")
        first = bootstate.load().based_on
        x = _tools_bundle(two_hosts.cloud)
        _edit(data, "a mac session that is only on this disk")
        _sweep_after_build(monkeypatch, two_hosts.cloud, x, only_safety=True)
        applied = []
        monkeypatch.setattr(cloud, "apply_snapshot", lambda *a, **k: applied.append(1))
        before = _local_hash(data)
        capsys.readouterr()
        with pytest.raises(SystemExit) as exc:
            cloud.restore(boss, yes=True)
        assert exc.value.code not in (0, None)
        assert applied == [] and _local_hash(data) == before
        err = capsys.readouterr().err
        assert "module tools" in err and "job dropped" in err
        assert "nothing local was touched" in err
        assert bootstate.load().based_on == first              # nothing recorded
        assert uploadq.pending() == []
        assert (data / "Data/worlds/w/journal.txt").read_text() == \
            "a mac session that is only on this disk"


def test_foundry_backup_exits_non_zero_when_its_snapshot_is_dropped(two_hosts, spawned,
                                                                    monkeypatch, capsys):
    """`make foundry-backup` (cloud backup), `vtt-down WAIT=1` and the pre-launch
    `foundry-backup-safe` are the foreground: a dropped snapshot fails loudly."""
    with two_hosts.use("mac") as data:
        _tool(data, "// v1\n")
        cloud.backup("shutdown")
        first = bootstate.load().based_on
        x = _tools_bundle(two_hosts.cloud)
        _edit(data, "a session")
        _sweep_after_build(monkeypatch, two_hosts.cloud, x)
        capsys.readouterr()
        with pytest.raises(SystemExit) as exc:
            cloud.main(["backup", "--reason", "manual"])
        assert exc.value.code == 1
        err = capsys.readouterr().err
        assert "module tools" in err and "job dropped" in err and "rerun the backup" in err
        assert bootstate.load().based_on == first
        assert uploadq.pending() == [] and uploadq.in_flight() is None
        assert _snaps(two_hosts.cloud) == [first]


def test_background_heals_a_hand_deleted_bundle_from_the_uploader(two_hosts, spawned,
                                                                  capsys):
    """Review (R) §5 row 3: an unchanged tree whose snapshot names a bundle deleted by hand
    re-uploads it — from the background, not while vtt-down waits."""
    with two_hosts.use("mac") as data:
        _tool(data)
        cloud.backup("shutdown")
        based = bootstate.load().based_on
        x = _tools_bundle(two_hosts.cloud)
        (two_hosts.cloud / "bundles" / x).unlink()
        capsys.readouterr()
        assert cloud.backup("shutdown", background=True) == 0
        [job] = uploadq.pending()
        assert job.heal and job.bundles == [x] and spawned == [1]
        assert x not in _bundles(two_hosts.cloud)              # nothing sent in the foreground
        assert "re-uploading 1 bundle(s) the cloud lost" in capsys.readouterr().out
        assert uploadq.in_flight() is None                     # no world state in flight
        assert cloud.backup("shutdown", background=True) == 0   # queued once, not twice
        assert len(uploadq.pending()) == 1
        assert cloud.upload_pending() == 0
        assert x in _bundles(two_hosts.cloud) and uploadq.pending() == []
        assert bootstate.load().based_on == based and _snaps(two_hosts.cloud) == [based]
        assert not job.staging.exists()


def test_gc_marks_the_bundles_a_queued_job_names(two_hosts, spawned):
    with two_hosts.use("mac") as data:
        _tool(data)
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        from scripts.foundry import bundles
        assert bundles.manifest_names(job.manifest) <= cloud.referenced_bundles(cloud.store())


def test_a_killed_builds_staging_is_swept_a_queued_jobs_is_not(two_hosts, spawned):
    from scripts.foundry import bundles
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        orphan = uploadq.tmp_dir() / bundles.STAGING / "world-2026-10-11-000000-fvtt1-mac.tar.gz"
        orphan.mkdir(parents=True)
        (orphan / "module@x@1@0123456789abcdef.tar.gz").write_bytes(b"staged, no job file")
        live = job.staging / "module@y@1@0123456789abcdef.tar.gz.building"
        live.write_bytes(b"the uploader rebuilding a bundle")
        top = uploadq.tmp_dir() / bundles.STAGING / "module@z@1@0123456789abcdef.tar.gz.building"
        top.write_bytes(b"a pre-queue build that crashed")
        with uploadq.lock(uploadq.BUILD_LOCK):
            uploadq.sweep_building()
        assert not orphan.exists() and not top.exists() and live.exists()
        assert all((job.staging / n).is_file() for n in job.bundles)


def test_tmp_dirname_has_one_source():
    """bundles owns the '.pentaryn-tmp' name; uploadq and cloud take it from there, and
    cloud.tmp_dir() is uploadq.tmp_dir(), one scratch directory."""
    assert cloud.TMP_DIRNAME == bundles.TMP_DIRNAME == uploadq.TMP_DIRNAME
    assert cloud.tmp_dir() == uploadq.tmp_dir()


@pytest.mark.parametrize("bad", ["2026-10-11", None, "missing"])
def test_a_job_with_a_non_numeric_created_still_loads_and_sorts(two_hosts, bad):
    """Review R4: a job file whose `created` is a string sorted against a numeric one
    crashed pending() (str < float). Every job still loads — a null/missing/string
    created sorts as 0.0, first — so in_flight() keeps protecting its world."""
    with two_hosts.use("mac"):
        def job(name, created):
            data = {"name": name, "reason": "shutdown", "digest": "d", "parent": None,
                    "host": "mac", "size": 1, "created": created,
                    "safety": False, "protect": None}
            if created == "missing":
                del data["created"]
            (uploadq.tmp_dir() / f"{name}{uploadq.JOB_SUFFIX}").write_text(
                json.dumps(data))
        job("world-b.tar.gz", time.time())
        job("world-a.tar.gz", bad)
        assert [j.name for j in uploadq.pending()] == ["world-a.tar.gz", "world-b.tar.gz"]
        assert uploadq.in_flight() == "world-b.tar.gz"           # the newest, as before
        (uploadq.tmp_dir() / f"world-b.tar.gz{uploadq.JOB_SUFFIX}").unlink()
        assert uploadq.in_flight() == "world-a.tar.gz"           # still protected alone


# ── py-cloud-ac-1: the record is written from a fresh bootstate, never a stale one ──

def _during_world_upload(monkeypatch, action):
    """Run `action` while the uploader copies a world tar up (minutes, in real life)."""
    real = storage.FolderStorage.upload

    def slow(self, src, rel):
        if rel.startswith(f"{cloud.WORLD_BACKUPS}/world-"):
            action()
        return real(self, src, rel)
    monkeypatch.setattr(storage.FolderStorage, "upload", slow)


def test_a_bootstate_write_during_the_upload_is_kept_py_cloud_ac_1(two_hosts, spawned,
                                                                    monkeypatch):
    """py-cloud-ac-1: the uploader recorded from the BootState it loaded before the
    upload, writing back over anything saved meanwhile (here a boot notice)."""
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        _during_world_upload(monkeypatch, lambda: bootstate.load().set_pending(
            "boss-20990101-000000.tar.gz", 123.0))
        assert cloud.upload_pending() == 0
        st = bootstate.load()
    assert st.based_on == job.name
    assert (st.pending_newer, st.pending_newer_mtime) == ("boss-20990101-000000.tar.gz",
                                                          123.0)


def test_a_record_moved_during_the_upload_is_not_overwritten_py_cloud_ac_1(
        two_hosts, spawned, monkeypatch, capsys):
    """py-cloud-ac-1: a restore recorded while the upload ran is the tree on disk now —
    the landed snapshot was built from the old one and must not take the record back."""
    with two_hosts.use("mac"):
        cloud.backup("shutdown", background=True)
        [job] = uploadq.pending()
        _during_world_upload(monkeypatch, lambda: bootstate.load().record_snapshot(
            "boss-20990101-000000.tar.gz", "boss", 123.0, "d1g3st", by="restore",
            clear_pending=True))
        capsys.readouterr()
        assert cloud.upload_pending() == 0
        out = capsys.readouterr().out
        st = bootstate.load()
        assert uploadq.pending() == []
    assert (st.based_on, st.by) == ("boss-20990101-000000.tar.gz", "restore")
    assert "unknown lineage, and not recording it" in out
    assert job.name in _snaps(two_hosts.cloud)
