"""Adversarial review of feature/module-bundles after the merge with main — the
composition lens: the background uploader (main, 938c36d4) and the bundles.

Each test proves one finding (MC1…MC3) against module-bundles-2026-10.md §5. They are
`xfail(strict=True)` until the finding is fixed — a fix flips the test to XPASS, which
fails the suite until the marker is removed.

Nothing here touches the network, rclone, OneDrive or Foundry: the cloud is the fake
folder (conftest.two_hosts), the uploader runs in-process.
"""

from __future__ import annotations

import os
import time

import pytest

from bundle_fakes import foundry_launch, make_leveldb_pack
from scripts.foundry import bootstate, bundles, cloud, uploadq
from scripts.foundry import host as host_mod


# ── helpers (local copies, so this file stands alone) ─────────────────────────

_bump = [0]


def _edit(data_root, text):
    f = data_root / "Data/worlds/w/journal.txt"
    f.write_text(text)
    _bump[0] += 7
    t = time.time() + _bump[0]
    os.utime(f, (t, t))


def _tool(data_root, body="// v1\n"):
    """A second module, `tools`, whose content a test can change (module-sync)."""
    d = data_root / "Data/modules/tools"
    d.mkdir(parents=True, exist_ok=True)
    (d / "module.json").write_text('{"id": "tools", "version": "1"}\n')
    (d / "main.js").write_text(body)
    return d


def _tools_bundle(cloud_dir):
    [n] = [p.name for p in (cloud_dir / "bundles").iterdir()
           if p.name.startswith("module@tools@") and p.name.endswith(".tar.gz")]
    return n


@pytest.fixture
def spawned(monkeypatch):
    """Capture the background hand-off instead of starting a process."""
    calls = []
    monkeypatch.setattr(cloud, "_spawn_uploader", lambda: calls.append(1) or 4242)
    return calls


# ── MC1: a never-completable job reported as a retryable StorageError ─────────

@pytest.mark.xfail(strict=True, reason=(
    "MC1: upload_missing raises StorageError (retryable) when a job's staged tar is gone "
    "and the live folder no longer matches it — that job can never complete (the bundle "
    "exists nowhere), so it is retried forever: upload_pending returns 1 every run, every "
    "later job is stuck behind it and in_flight() keeps the boot local for good. §5 row "
    "'6 verify failure' says any never-completable job is dropped (_Incomplete)"))
def test_mc1_a_job_whose_staged_tar_is_gone_and_folder_changed_is_dropped_not_stuck(
        two_hosts, spawned):
    with two_hosts.use("mac") as data:
        _tool(data, "// v1\n")
        cloud.backup("shutdown", background=True)              # J1 stages m and tools
        [j1] = uploadq.pending()
        [t1] = [n for n in j1.bundles if n.startswith("module@tools@")]
        (j1.staging / t1).unlink()            # freed by hand: 3.5 GB staged on day one
        _tool(data, "// v2\n")                # module-sync since: a rebuild cannot match
        _edit(data, "session 2")
        cloud.backup("shutdown", background=True)              # J2 queued behind J1
        _j1, j2 = uploadq.pending()
        assert j2.parent == j1.name

        rc1 = cloud.upload_pending()
        rc2 = cloud.upload_pending()                           # the next vtt-down's retry
        assert (rc1, rc2) == (0, 0)
        assert uploadq.pending() == [] and uploadq.in_flight() is None
        assert bootstate.load().based_on == j2.name            # J2 landed, linked


# ── MC2: the upload half tars live module folders ─────────────────────────────

def _reused_bundle_swept_while_queued(two_hosts, data):
    """J1 reuses tools' bundle X; the other host's GC sweeps X while J1 waits (the
    uploader died: a sleep). The folder is unchanged, so the uploader rebuilds X."""
    _tool(data, "// v1\n")
    cloud.backup("shutdown")                                   # X up, recorded
    x = _tools_bundle(two_hosts.cloud)
    _edit(data, "session")
    cloud.backup("shutdown", background=True)
    [j1] = uploadq.pending()
    assert x in j1.manifest["modules"].values() and x not in j1.bundles   # reused
    (two_hosts.cloud / "bundles" / x).unlink()
    return j1, x


@pytest.mark.xfail(strict=True, reason=(
    "MC2: the uploader (_verify_bundles / upload_missing → _rebuilder → bundles.build) "
    "tars a module folder from the live tree with Foundry running. vtt-up's pre-launch "
    "backup hands a crashed or slept upload to a background uploader and then starts "
    "Foundry, which rewrites every pack's LevelDB housekeeping at launch: the bundle can "
    "capture CURRENT → a MANIFEST it lacks (an unopenable pack, under a content-addressed "
    "name nothing ever re-uploads) — the build half exists precisely so that only a "
    "stopped tree is tarred"))
def test_mc2_the_uploader_never_tars_a_live_module_folder_while_foundry_runs(
        two_hosts, spawned, monkeypatch):
    with two_hosts.use("mac") as data:
        j1, x = _reused_bundle_swept_while_queued(two_hosts, data)
        # make vtt-up: the pre-launch backup retries J1 in the background, then Foundry
        # starts while that uploader runs
        assert cloud.backup("prelaunch", if_stopped=True) == 0
        assert len(spawned) == 2
        monkeypatch.setattr(host_mod, "is_running", lambda port=None: True)
        built, real = [], bundles.build

        def spy(loc, dest_dir):
            built.append((loc.name, cloud.server_running()))
            return real(loc, dest_dir)
        monkeypatch.setattr(bundles, "build", spy)
        cloud.upload_pending()
        assert [n for n, live in built if live] == []


@pytest.mark.xfail(strict=True, reason=(
    "MC2b: an OSError from a rebuild in the upload half (a pack file replaced between the "
    "tar's walk and its add — Foundry's launch, or foundry-<m>-sync swapping the folder, "
    "neither holds a queue lock) escapes _run_job (it catches only _Incomplete, "
    "StorageError, SystemExit): upload_pending dies with a traceback and the status file "
    "is left at 'uploading' with no live process — §5 row 5 / review M1: a rebuild is a "
    "StorageError, never a bare FileNotFoundError"))
def test_mc2b_a_rebuild_racing_a_pack_rewrite_is_a_handled_failure_never_a_crash(
        two_hosts, spawned, monkeypatch):
    with two_hosts.use("mac") as data:
        pack = make_leveldb_pack(data / "Data/modules/tools/packs/items")
        j1, x = _reused_bundle_swept_while_queued(two_hosts, data)
        real_members = bundles._members

        def members(root):
            out = real_members(root)
            if root.name == "tools":
                foundry_launch(pack)          # housekeeping rewritten mid-tar
            return out
        monkeypatch.setattr(bundles, "_members", members)
        try:
            rc = cloud.upload_pending()
        except OSError as exc:                # the uploader process dies here
            pytest.fail(f"upload_pending raised {exc!r}")
        assert rc in (0, 1)
        assert uploadq.read_status().get("state") in ("failed", "done")


# ── MC3: re-parenting misses the job a concurrent build is writing ────────────

@pytest.mark.xfail(strict=True, reason=(
    "MC3 (low): _reparent_next runs under UPLOAD_LOCK only; a vtt-down build (BUILD_LOCK "
    "only) that read the queue before the drop saves its job afterwards with parent = the "
    "dropped job, so it uploads unlinked — no ancestors in its sidecar, not recorded as "
    "based-on, never coalesced — the hole §5 row '6 verify failure' (3) closes for jobs "
    "already queued"))
def test_mc3_a_job_built_while_the_one_before_it_is_dropped_still_uploads_linked(
        two_hosts, spawned, monkeypatch):
    with two_hosts.use("mac") as data:
        _tool(data, "// v1\n")
        cloud.backup("shutdown")
        first = bootstate.load().based_on
        x = _tools_bundle(two_hosts.cloud)
        _edit(data, "session 1")
        cloud.backup("shutdown", background=True)              # J1 reuses X
        [j1] = uploadq.pending()
        (two_hosts.cloud / "bundles" / x).unlink()             # swept while J1 waits
        _tool(data, "// v2\n")                                 # and tools changed: J1
        _edit(data, "session 2")                               # can never complete

        # The next vtt-down builds J2 while the detached uploader is running J1: J2's
        # build has read the queue (J1 there → parent = J1) when the uploader drops J1.
        real_manifest, fired = bundles.manifest, []

        def manifest(inv):
            if not fired:
                fired.append(1)
                assert cloud.upload_pending() == 0             # J1 dropped right now
            return real_manifest(inv)
        monkeypatch.setattr(bundles, "manifest", manifest)
        cloud.backup("shutdown", background=True)
        monkeypatch.setattr(bundles, "manifest", real_manifest)
        [j2] = uploadq.pending()
        assert cloud.upload_pending() == 0
        assert bootstate.load().based_on == j2.name            # recorded: linked
        st = cloud.store()
        assert cloud.read_ancestry(st, cloud.find_snapshot(st, j2.name))[0] == first
