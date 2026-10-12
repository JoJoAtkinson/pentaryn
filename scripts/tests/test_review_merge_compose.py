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


def _pack_opens(tar_path, pack_rel="tools/packs/items"):
    """The tar's pack CURRENT names a MANIFEST the tar holds (LevelDB can open it)."""
    import tarfile
    with tarfile.open(tar_path) as tf:
        names = set(tf.getnames())
        target = tf.extractfile(f"{pack_rel}/CURRENT").read().decode().strip()
    return f"{pack_rel}/{target}" in names


def test_mc2c_foundry_starting_during_the_rebuild_tar_never_uploads_that_tar(
        two_hosts, spawned, monkeypatch):
    """The re-review's residual: the server check ran once, before the tar. A launch
    during the tar writes the new MANIFEST and repoints CURRENT before deleting the old
    one — no OSError — so the tar named X held a CURRENT naming a MANIFEST it lacked."""
    with two_hosts.use("mac") as data:
        pack = make_leveldb_pack(data / "Data/modules/tools/packs/items")
        j1, x = _reused_bundle_swept_while_queued(two_hosts, data)
        running, fired = {"on": False}, []
        monkeypatch.setattr(host_mod, "is_running", lambda port=None: running["on"])
        real_members = bundles._members

        def members(root):
            out = real_members(root)
            if root.name == "tools" and not fired:
                fired.append(1)
                running["on"] = True                  # Foundry is up now
                (pack / "MANIFEST-000151").write_bytes(b"new manifest")
                (pack / "CURRENT").write_text("MANIFEST-000151\n")
            return out
        monkeypatch.setattr(bundles, "_members", members)
        assert cloud.upload_pending() == 1
        assert not (two_hosts.cloud / "bundles" / x).exists()
        assert [j.name for j in uploadq.pending()] == [j1.name]
        assert not [p for p in j1.staging.glob("**/*") if p.name == x]  # live tar not kept

        running["on"] = False                                  # Foundry stopped again
        assert cloud.upload_pending() == 0
        assert uploadq.pending() == []
        assert bootstate.load().based_on == j1.name
        assert _pack_opens(two_hosts.cloud / "bundles" / x)


def test_mc2d_a_launch_before_its_port_binds_is_seen_by_the_rebuild(
        two_hosts, spawned, monkeypatch):
    """The port check misses a launch until the port binds; the process does not."""
    with two_hosts.use("mac") as data:
        make_leveldb_pack(data / "Data/modules/tools/packs/items")
        j1, x = _reused_bundle_swept_while_queued(two_hosts, data)
        monkeypatch.setattr(host_mod, "pid", lambda: 777)     # launching, port not bound
        built = []
        monkeypatch.setattr(bundles, "build", lambda loc, d: built.append(loc.name))
        assert cloud.upload_pending() == 1
        assert built == [] and [j.name for j in uploadq.pending()] == [j1.name]


def test_mc2e_a_module_sync_between_inventory_and_tar_never_lands_new_content_under_the_old_name(
        two_hosts, spawned, monkeypatch):
    """A foundry-<m>-sync swap that finishes between the rebuild's inventory and its tar:
    no OSError, and the tar of v2 would go up as X, whose name says v1."""
    import tarfile
    with two_hosts.use("mac") as data:
        j1, x = _reused_bundle_swept_while_queued(two_hosts, data)
        real_build = bundles.build

        def build(loc, dest_dir):
            if loc.id == "tools":
                _tool(data, "// v2\n")                        # the sync lands now
            return real_build(loc, dest_dir)
        monkeypatch.setattr(bundles, "build", build)
        assert cloud.upload_pending() in (0, 1)
        up = two_hosts.cloud / "bundles" / x
        if up.exists():
            with tarfile.open(up) as tf:
                assert tf.extractfile("tools/main.js").read() == b"// v1\n"
        assert not [p for p in j1.staging.glob("**/*") if p.name == x]


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
