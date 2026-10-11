"""Host-tagged snapshots and per-host policy (design §3, §4, §6.7), two fake hosts.

`mac` (primary) and `boss` (alt) share one temp-folder cloud (conftest.two_hosts).
Nothing here touches the network, rclone, or a real Foundry.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tarfile
import time

import pytest

from cloud_fakes import FakeRclone
from scripts.foundry import bootstate, cloud, storage
from scripts.foundry.cloud import Snapshot, parse_snapshot
from scripts.foundry.storage import Entry, RcloneStorage

DAY = 86400


def _names(cloud_dir, sub="world-backups"):
    """The files in a cloud subfolder, without the `.parent` lineage sidecars."""
    return sorted(p.name for p in (cloud_dir / sub).iterdir()
                  if not p.name.endswith(cloud.PARENT_SUFFIX))


def _sidecars(cloud_dir, sub="world-backups"):
    return sorted(p.name[:-len(cloud.PARENT_SUFFIX)] for p in (cloud_dir / sub).iterdir()
                  if p.name.endswith(cloud.PARENT_SUFFIX))


def _put(cloud_dir, name, *, age_days=0.0, sub="world-backups", data=b"x" * 64):
    p = cloud_dir / sub / name
    p.write_bytes(data)
    t = time.time() - age_days * DAY
    os.utime(p, (t, t))
    return p


def _stamp(age_days: float) -> str:
    return time.strftime("%Y-%m-%d-%H%M%S", time.gmtime(time.time() - age_days * DAY))


_bump = [0]


def _edit(data_root, text="edit"):
    f = data_root / "Data/worlds/w/journal.txt"
    f.write_text(text)
    # A new second every call, so the digest (int mtime) cannot repeat a previous state.
    _bump[0] += 5
    t = time.time() + _bump[0]
    os.utime(f, (t, t))


# ── the parser (§3) ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("name, host, core, safety", [
    ("world-2026-10-11-030412-fvtt14.369-mac.tar.gz", "mac", "14.369", False),
    ("world-2026-10-11-030412-fvtt14.369-boss.tar.gz", "boss", "14.369", False),
    ("world-2026-10-11-030412-fvtt14.369-a-b-1.tar.gz", "a-b-1", "14.369", False),
    ("world-2026-10-11-030412-fvtt14.369-mac.safety.tar.gz", "mac", "14.369", True),
    ("world-2026-09-01-120000-fvtt14.369.tar.gz", None, "14.369", False),
    ("world-2026-08-01-120000.tar.gz", None, None, False),
    ("world-2026-08-01-120000-fvttunknown.tar.gz", None, "unknown", False),
    ("world-2026-10-11-030412-fvttunknown-mac.tar.gz", "mac", "unknown", False),
])
def test_parser_reads_all_three_shapes(name, host, core, safety):
    s = parse_snapshot(Entry(name, 10, 1.0))
    assert s and (s.host, s.core, s.safety) == (host, core, safety)
    assert s.host_label == (host or "untagged")


@pytest.mark.parametrize("name", [
    "world-2026-10-11-030412-fvtt14.369-mac.tar.gz.partial",
    "world-2026-10-11-030412-fvtt14.369-mac.tar",
    "README.txt", ".last-digest", "world-2026-10-11.tar.gz",
    "world-2026-10-11-030412-fvtt14.369-mac.tar.gz.parent",
])
def test_parser_rejects(name):
    assert parse_snapshot(Entry(name, 1, 1.0)) is None


def test_newest_is_by_mtime_then_name_not_by_stamp():
    a = Snapshot("2026-10-11-090000", "a", "mac", "14.369", 1, mtime=100.0, folder="wb")
    b = Snapshot("2026-10-10-090000", "b", "boss", "14.369", 1, mtime=200.0, folder="wb")
    c = Snapshot("2026-10-10-090000", "c", "boss", "14.369", 1, mtime=200.0, folder="wb")
    assert cloud.newest([a, b, c]) is c
    assert sorted([b, a]) == [b, a]  # stamp order within the listing


def test_partial_upload_is_never_a_snapshot(two_hosts):
    _put(two_hosts.cloud, f"world-{_stamp(0)}-fvtt14.369-boss.tar.gz.partial")
    assert cloud.snapshots(cloud.store()) == []


# ── backup: tagging, per-host retention ─────────────────────────────────────

def test_backup_tags_with_this_host_and_a_utc_stamp(two_hosts, capsys):
    with two_hosts.use("boss"):
        assert cloud.backup("manual") == 0
    [name] = _names(two_hosts.cloud)
    assert re.fullmatch(r"world-\d{4}-\d{2}-\d{2}-\d{6}-fvtt14\.369-boss\.tar\.gz", name)
    stamp = name[6:23]
    utc_now = time.strftime("%Y-%m-%d-%H%M", time.gmtime())
    assert stamp[:15] == utc_now or abs(time.time() - time.mktime(
        time.strptime(stamp, "%Y-%m-%d-%H%M%S")) + time.timezone) < 120
    # tar built in the local temp dir, then uploaded; the temp copy is gone
    assert not list((two_hosts.data["boss"] / ".pentaryn-tmp").glob("*.tar.gz"))


def test_each_host_prunes_only_its_own(two_hosts):
    c = two_hosts.cloud
    for i in range(12):
        _put(c, f"world-{_stamp(60 - i)}-fvtt14.369-mac.tar.gz", age_days=60 - i)
    for i in range(5):
        _put(c, f"world-{_stamp(40 - i)}-fvtt14.369-boss.tar.gz", age_days=40 - i)
    for i in range(3):
        _put(c, f"world-2026-08-0{i + 1}-120000-fvtt14.369.tar.gz", age_days=70 - i)
    before = set(_names(c))
    with two_hosts.use("mac"):
        cloud.backup("manual")
    snaps = cloud.snapshots(cloud.store())
    assert len([s for s in snaps if s.host == "mac"]) == 10
    assert len([s for s in snaps if s.host == "boss"]) == 5
    assert len([s for s in snaps if s.host is None]) == 3
    gone = before - set(_names(c))
    assert len(gone) == 3 and all(n.endswith("-mac.tar.gz") for n in gone)
    # the three oldest mac snapshots are the ones pruned
    oldest = sorted(n for n in before if n.endswith("-mac.tar.gz"))[:3]
    assert gone == set(oldest)


def test_coalesce_replaces_only_this_hosts_newest_within_five_days(two_hosts):
    c = two_hosts.cloud
    mine = _put(c, f"world-{_stamp(1)}-fvtt14.369-mac.tar.gz", age_days=1).name
    theirs = _put(c, f"world-{_stamp(0.5)}-fvtt14.369-boss.tar.gz", age_days=0.5).name
    with two_hosts.use("mac"):
        cloud.backup("manual")
    names = _names(c)
    assert mine not in names                 # own, under 5 days → replaced
    assert theirs in names                   # the other host's → never
    assert len([n for n in names if n.endswith("-mac.tar.gz")]) == 1


def test_no_own_snapshot_means_nothing_is_coalesced(two_hosts):
    c = two_hosts.cloud
    theirs = _put(c, f"world-{_stamp(0.5)}-fvtt14.369-boss.tar.gz", age_days=0.5).name
    legacy = _put(c, f"world-{_stamp(0.2)}-fvtt14.369.tar.gz", age_days=0.2).name
    with two_hosts.use("mac"):
        cloud.backup("manual")
    assert {theirs, legacy} <= set(_names(c))
    assert len(_names(c)) == 3


def test_old_own_snapshot_is_kept(two_hosts):
    c = two_hosts.cloud
    old = _put(c, f"world-{_stamp(6)}-fvtt14.369-mac.tar.gz", age_days=6).name
    with two_hosts.use("mac"):
        cloud.backup("manual")
    assert old in _names(c) and len(_names(c)) == 2


def test_promotion_keys_on_this_hosts_newest(two_hosts):
    c = two_hosts.cloud
    mac13 = _put(c, f"world-{_stamp(10)}-fvtt13.351-mac.tar.gz", age_days=10).name
    boss13 = _put(c, f"world-{_stamp(9)}-fvtt13.351-boss.tar.gz", age_days=9).name
    with two_hosts.use("mac"):                      # mac now runs 14 → its 13 is preserved
        cloud.backup("manual")
    assert _names(c, "major-release") == [mac13]
    with two_hosts.use("mac"):                      # already preserved → not again
        _edit(two_hosts.data["mac"])
        cloud.backup("manual")
    assert _names(c, "major-release") == [mac13]
    assert boss13 in _names(c)                      # the other host's is not mac's to promote


def test_no_promotion_when_only_the_other_host_is_behind(two_hosts):
    c = two_hosts.cloud
    _put(c, f"world-{_stamp(10)}-fvtt13.351-boss.tar.gz", age_days=10)
    _put(c, f"world-{_stamp(8)}-fvtt14.369-mac.tar.gz", age_days=8)
    with two_hosts.use("mac"):
        cloud.backup("manual")
    assert _names(c, "major-release") == []


# ── digest: local, not shared ───────────────────────────────────────────────

def test_digest_is_local_so_identical_trees_both_upload(two_hosts):
    shutil.rmtree(two_hosts.data["boss"])
    shutil.copytree(two_hosts.data["mac"], two_hosts.data["boss"])  # copy2: same mtimes
    opts = json.dumps({"dataPath": "x"})
    for h in ("mac", "boss"):  # identical Config too
        (two_hosts.data[h] / "Config/options.json").write_text(opts)
        os.utime(two_hosts.data[h] / "Config/options.json", (1e9, 1e9))
    with two_hosts.use("mac"):
        cloud.backup("manual")
        d_mac = bootstate.load().digest
    with two_hosts.use("boss"):
        cloud.backup("manual")
        assert bootstate.load().digest == d_mac
    assert sorted(n.rsplit("-", 1)[1] for n in _names(two_hosts.cloud)) == [
        "boss.tar.gz", "mac.tar.gz"]


def test_unchanged_tree_is_skipped_and_state_records_the_upload(two_hosts, capsys):
    with two_hosts.use("mac"):
        cloud.backup("manual")
        st = bootstate.load()
        [name] = _names(two_hosts.cloud)
        assert (st.based_on, st.based_on_host, st.by) == (name, "mac", "backup")
        assert cloud.backup("manual") == 0
    assert "no change since the last snapshot" in capsys.readouterr().out
    assert len(_names(two_hosts.cloud)) == 1


def test_legacy_shared_marker_is_retired(two_hosts):
    (two_hosts.cloud / "world-backups/.last-digest").write_text("old\n")
    with two_hosts.use("mac"):
        cloud.backup("manual")
    assert not (two_hosts.cloud / "world-backups/.last-digest").exists()


def test_legacy_marker_matching_the_tree_is_adopted(two_hosts, capsys):
    legacy = _put(two_hosts.cloud, f"world-{_stamp(2)}-fvtt14.369.tar.gz", age_days=2).name
    with two_hosts.use("mac"):
        (two_hosts.cloud / "world-backups/.last-digest").write_text(cloud.snapshot_digest() + "\n")
        assert cloud.backup("prelaunch") == 0
        st = bootstate.load()
    assert "skipped" in capsys.readouterr().out
    assert st.based_on == legacy and st.based_on_host is None
    assert _names(two_hosts.cloud) == [".last-digest", legacy]  # nothing uploaded


def test_an_empty_tree_is_not_archived(two_hosts, capsys):
    shutil.rmtree(two_hosts.data["boss"] / "Data/worlds")
    with two_hosts.use("boss"):
        cloud.backup("manual")
    assert "no local world" in capsys.readouterr().out
    assert _names(two_hosts.cloud) == []


# ── lineage sidecars ────────────────────────────────────────────────────────

def _sidecar(cloud_dir, name, sub="world-backups"):
    return json.loads((cloud_dir / sub / f"{name}{cloud.PARENT_SUFFIX}").read_text())


def test_backup_writes_a_parent_sidecar_and_restore_inherits_its_lineage(two_hosts):
    c = two_hosts.cloud
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        [m0] = _names(c)
        assert _sidecar(c, m0) == {"parent": None, "ancestors": [], "host": "mac"}
        _edit(two_hosts.data["mac"], "two")
        cloud.backup("shutdown")                  # coalesces m0 away …
        [m1] = _names(c)
    assert _sidecar(c, m1)["ancestors"] == [m0]   # … but the lineage still names it
    assert _sidecars(c) == [m1]                   # m0's sidecar went with it
    with two_hosts.use("boss"):
        cloud.restore(m1, yes=True)
        st = bootstate.load()
        assert (st.based_on, st.lineage) == (m1, [m0])
        _edit(two_hosts.data["boss"], "boss")
        cloud.backup("shutdown")
        b1 = bootstate.load().based_on
    assert _sidecar(c, b1) == {"parent": m1, "ancestors": [m1, m0], "host": "boss"}
    snap = cloud.find_snapshot(cloud.store(), b1)
    assert cloud.descends(cloud.store(), snap, m0) is True
    assert cloud.descends(cloud.store(), snap, "world-other.tar.gz") is False


def test_a_snapshot_without_a_sidecar_is_unknown_not_diverged(two_hosts):
    legacy = _put(two_hosts.cloud, f"world-{_stamp(1)}-fvtt14.369.tar.gz", age_days=1).name
    snap = cloud.find_snapshot(cloud.store(), legacy)
    assert cloud.read_ancestry(cloud.store(), snap) is None
    assert cloud.descends(cloud.store(), snap, "anything") is None


def test_pruning_deletes_the_sidecar_too(two_hosts, monkeypatch):
    monkeypatch.setenv("PENTARYN_KEEP_SNAPSHOTS", "1")
    c = two_hosts.cloud
    old = _put(c, f"world-{_stamp(9)}-fvtt14.369-mac.tar.gz", age_days=9).name
    (c / "world-backups" / f"{old}.parent").write_text('{"ancestors": []}')
    with two_hosts.use("mac"):
        cloud.backup("manual")
    assert old not in _names(c) and old not in _sidecars(c)


# ── restore ─────────────────────────────────────────────────────────────────

def test_cross_host_restore_keeps_this_machines_config(two_hosts):
    mac, boss = two_hosts.data["mac"], two_hosts.data["boss"]
    (mac / "Data/worlds/w/journal.txt").write_text("mac world")
    (mac / "Config/admin.txt").write_text("mac-hash")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [snap] = _names(two_hosts.cloud)
    (boss / "Config/admin.txt").write_text("boss-hash")
    (boss / "Config/license.json").write_text('{"boss": true}')
    (boss / "Data/worlds/w/only-on-boss.txt").write_text("stale")
    boss_opts = (boss / "Config/options.json").read_text()
    with two_hosts.use("boss"):
        assert cloud.restore(snap, yes=True) == 0
        st = bootstate.load()
    assert (boss / "Data/worlds/w/journal.txt").read_text() == "mac world"
    assert not (boss / "Data/worlds/w/only-on-boss.txt").exists()   # cleared, not overlaid
    assert (boss / "Config/options.json").read_text() == boss_opts    # dataPath stays boss's
    assert (boss / "Config/admin.txt").read_text() == "boss-hash"
    assert (boss / "Config/license.json").read_text() == '{"boss": true}'
    assert (st.based_on, st.based_on_host) == (snap, "mac")
    assert st.keep_local_until_newer_than is None


def test_restore_without_local_options_rewrites_a_foreign_datapath(two_hosts):
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [snap] = _names(two_hosts.cloud)
    boss = two_hosts.data["boss"]
    shutil.rmtree(boss / "Config")
    shutil.rmtree(boss / "Data/worlds")            # a machine that never ran Foundry
    with two_hosts.use("boss"):
        cloud.restore(snap, yes=True)
    opts = json.loads((boss / "Config/options.json").read_text())
    assert opts["dataPath"] == str(boss)


def test_after_restore_own_backup_is_skipped(two_hosts, capsys):
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [snap] = _names(two_hosts.cloud)
    with two_hosts.use("boss"):
        cloud.restore(snap, yes=True)
        before = _names(two_hosts.cloud)
        capsys.readouterr()
        cloud.backup("prelaunch")
    assert "no change since the last snapshot" in capsys.readouterr().out
    assert _names(two_hosts.cloud) == before   # no 3 GB echo of what was just downloaded


def test_restore_archives_a_changed_local_world_as_a_safety_copy(two_hosts):
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [snap] = _names(two_hosts.cloud)
    boss = two_hosts.data["boss"]
    (boss / "Data/worlds/w/boss-work.txt").write_text("addon test world")
    with two_hosts.use("boss"):
        cloud.restore(snap, yes=True)
    safety = [n for n in _names(two_hosts.cloud) if n.endswith("-boss.safety.tar.gz")]
    assert len(safety) == 1
    with tarfile.open(two_hosts.cloud / "world-backups" / safety[0]) as tar:
        assert "Data/worlds/w/boss-work.txt" in tar.getnames()


def test_restoring_own_newest_under_five_days_succeeds(two_hosts):
    mac = two_hosts.data["mac"]
    (mac / "Data/worlds/w/journal.txt").write_text("v1")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        [v1] = _names(two_hosts.cloud)
        _edit(mac, "v2")
        cloud.restore(v1, yes=True)
    assert (mac / "Data/worlds/w/journal.txt").read_text() == "v1"


def test_restoring_own_oldest_of_ten_succeeds(two_hosts, monkeypatch):
    mac = two_hosts.data["mac"]
    (mac / "Data/worlds/w/journal.txt").write_text("the oldest")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [made] = _names(two_hosts.cloud)
    oldest = f"world-{_stamp(50)}-fvtt14.369-mac.tar.gz"
    p = two_hosts.cloud / "world-backups" / oldest
    (two_hosts.cloud / "world-backups" / made).rename(p)
    os.utime(p, (time.time() - 50 * DAY,) * 2)
    for i in range(9):
        _put(two_hosts.cloud, f"world-{_stamp(40 - i)}-fvtt14.369-mac.tar.gz", age_days=40 - i)
    with two_hosts.use("mac"):
        _edit(mac, "current")
        cloud.restore(oldest, yes=True)   # the safety copy would push it out of the 10 …
        assert bootstate.load().based_on == oldest
    # … but the restore protects it, so the based-on record names a snapshot that exists
    assert oldest in _names(two_hosts.cloud)
    assert (mac / "Data/worlds/w/journal.txt").read_text() == "the oldest"


def test_restoring_the_oldest_at_the_keep_limit_keeps_it_and_the_rollback_point(
        two_hosts, monkeypatch):
    """keep=2: the safety backup's pruning used to delete the snapshot being restored,
    leaving based_on pointing at nothing and the updater rolling back to another one."""
    from scripts.foundry.update import recover
    monkeypatch.setenv("PENTARYN_KEEP_SNAPSHOTS", "2")
    mac = two_hosts.data["mac"]
    c = two_hosts.cloud
    old = _put(c, f"world-{_stamp(20)}-fvtt14.369-mac.tar.gz", age_days=20).name
    newer = _put(c, f"world-{_stamp(10)}-fvtt14.369-mac.tar.gz", age_days=10).name
    with two_hosts.use("mac"):
        cloud.backup("shutdown")          # a third own → one pruned; keep the real tar
    [real] = [n for n in _names(c) if n not in (old, newer)]
    target = f"world-{_stamp(30)}-fvtt14.369-mac.tar.gz"
    (c / "world-backups" / real).rename(c / "world-backups" / target)
    os.utime(c / "world-backups" / target, (time.time() - 30 * DAY,) * 2)
    with two_hosts.use("mac"):
        _edit(mac, "current")
        cloud.restore(target, yes=True)
        assert bootstate.load().based_on == target
        assert recover.newest_world_snapshot().name == target
    assert target in _names(c)
    assert any(n.endswith("-mac.safety.tar.gz") for n in _names(c))


def test_unchanged_tree_reuploads_when_its_snapshot_is_gone(two_hosts, capsys):
    """Coalescing, pruning or prune-untagged on the other machine can delete the snapshot
    a world is based on; "no change" must not then mean "no cloud copy"."""
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        [first] = _names(two_hosts.cloud)
        (two_hosts.cloud / "world-backups" / first).unlink()
        capsys.readouterr()
        assert cloud.backup("prelaunch") == 0
        st = bootstate.load()
    assert "no longer in the cloud — uploading this state again" in capsys.readouterr().out
    [again] = _names(two_hosts.cloud)
    assert st.based_on == again


def test_restore_over_a_world_whose_snapshot_is_gone_takes_a_safety_copy(two_hosts):
    mac = two_hosts.data["mac"]
    (mac / "Data/worlds/w/journal.txt").write_text("only copy")
    with two_hosts.use("boss"):
        cloud.backup("shutdown")
        [boss_snap] = _names(two_hosts.cloud)
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        mine = bootstate.load().based_on
        (two_hosts.cloud / "world-backups" / mine).unlink()   # deleted elsewhere
        cloud.restore(boss_snap, yes=True)
    [safety] = [n for n in _names(two_hosts.cloud) if n.endswith("-mac.safety.tar.gz")]
    with tarfile.open(two_hosts.cloud / "world-backups" / safety) as tar:
        data = tar.extractfile("Data/worlds/w/journal.txt").read()
    assert data == b"only copy"


def test_restore_lists_every_host_with_columns(two_hosts, capsys):
    _put(two_hosts.cloud, f"world-{_stamp(2)}-fvtt14.369-boss.tar.gz", age_days=2)
    _put(two_hosts.cloud, f"world-{_stamp(1)}-fvtt14.369-mac.tar.gz", age_days=1)
    _put(two_hosts.cloud, "world-2026-08-01-120000.tar.gz", age_days=70)
    assert cloud.restore(None) == 0
    out = capsys.readouterr().out
    assert " boss " in out and " mac " in out and " untagged " in out and "UTC" in out
    assert "SNAP=world-" in out and "-mac.tar.gz" in out.split("SNAP=")[1]


def test_restore_unknown_name_dies(two_hosts):
    _put(two_hosts.cloud, f"world-{_stamp(1)}-fvtt14.369-mac.tar.gz", age_days=1)
    with pytest.raises(SystemExit):
        cloud.restore("world-nope.tar.gz", yes=True)


# ── backup failures ─────────────────────────────────────────────────────────

def _rclone_cloud(two_hosts, monkeypatch) -> FakeRclone:
    fake = FakeRclone(two_hosts.cloud.parent)
    rc = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    monkeypatch.setattr(storage, "get", lambda: rc)
    return fake


def test_failed_upload_leaves_the_temp_tar_and_names_it(two_hosts, monkeypatch, capsys):
    fake = _rclone_cloud(two_hosts, monkeypatch)
    fake.fail_always["copyto"] = (1, "Failed to copy: connection reset")
    with two_hosts.use("mac"), pytest.raises(SystemExit):
        cloud.backup("shutdown")
    err = capsys.readouterr().err
    [left] = list((two_hosts.data["mac"] / ".pentaryn-tmp").glob("world-*-mac.tar.gz"))
    assert str(left) in err and "rclone copyto" in err
    assert cloud.snapshots(cloud.store()) == []
    assert bootstate.load().based_on is None  # nothing recorded for a failed upload


def _cloud_down(fake):
    for verb in ("lsjson", "mkdir", "cat", "rcat", "copyto", "moveto", "deletefile"):
        fake.fail_always[verb] = (1, "Failed to create file system: network is unreachable")


def test_prelaunch_backup_with_the_cloud_down_warns_and_exits_0(two_hosts, monkeypatch, capsys):
    """`make vtt-up` must reach foundry-up when the cloud is down (ops.md §3)."""
    _cloud_down(_rclone_cloud(two_hosts, monkeypatch))
    with two_hosts.use("mac"):
        assert cloud.main(["backup", "--reason", "prelaunch", "--if-stopped"]) == 0
        with pytest.raises(SystemExit):           # the plain backup still fails loudly
            cloud.main(["backup", "--reason", "manual"])
    assert "⚠ the prelaunch snapshot was not taken" in capsys.readouterr().err


def test_prelaunch_backup_upload_failure_warns_and_names_the_tar(two_hosts, monkeypatch, capsys):
    fake = _rclone_cloud(two_hosts, monkeypatch)
    fake.fail_always["copyto"] = (1, "Failed to copy: connection reset")
    with two_hosts.use("mac"):
        assert cloud.backup("prelaunch", if_stopped=True) == 0
    err = capsys.readouterr().err
    [left] = list((two_hosts.data["mac"] / ".pentaryn-tmp").glob("world-*-mac.tar.gz"))
    assert "⚠ the prelaunch snapshot was not taken" in err and f"left on disk: {left}" in err
    assert bootstate.load().based_on is None


def test_assets_if_reachable_with_the_cloud_down_warns_and_exits_0(two_hosts, monkeypatch,
                                                                    capsys, tmp_path):
    monkeypatch.setattr(cloud, "MANIFEST", tmp_path / "manifest.json")
    _cloud_down(_rclone_cloud(two_hosts, monkeypatch))
    with two_hosts.use("mac"):
        assert cloud.main(["assets", "--if-reachable"]) == 0
        with pytest.raises(SystemExit):
            cloud.main(["assets"])
    assert "⚠ assets not checked: the cloud is unreachable" in capsys.readouterr().err


def test_assets_if_reachable_download_failure_is_a_warning(two_hosts, monkeypatch, capsys,
                                                           tmp_path):
    monkeypatch.setattr(cloud, "MANIFEST", tmp_path / "manifest.json")
    fake = _rclone_cloud(two_hosts, monkeypatch)
    _zip(two_hosts.cloud / "assets/tokens-01.zip", {"a.png": b"png"})
    fake.fail_always["copyto"] = (1, "Failed to copy: connection reset")
    with two_hosts.use("mac"):
        assert cloud.unpack_assets(if_reachable=True) == 0
        assert cloud.unpack_assets() == 1
    assert "tokens-01.zip: download failed" in capsys.readouterr().err


def test_disk_space_check_dies_with_the_numbers(two_hosts, monkeypatch, capsys):
    _put(two_hosts.cloud, f"world-{_stamp(9)}-fvtt14.369-mac.tar.gz", age_days=9,
         data=b"x" * 5000)
    monkeypatch.setattr(cloud.shutil, "disk_usage",
                        lambda p: shutil._ntuple_diskusage(10**9, 10**9 - 100, 100))
    with two_hosts.use("mac"), pytest.raises(SystemExit):
        cloud.backup("shutdown")
    assert "free at least twice that" in capsys.readouterr().err


def test_backup_and_restore_through_rclone(two_hosts, monkeypatch):
    fake = _rclone_cloud(two_hosts, monkeypatch)
    (two_hosts.data["mac"] / "Data/worlds/w/journal.txt").write_text("over rclone")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [snap] = [n for n in _names(two_hosts.cloud) if n.startswith("world-")]
    with two_hosts.use("boss"):
        cloud.restore(snap, yes=True)
    assert (two_hosts.data["boss"] / "Data/worlds/w/journal.txt").read_text() == "over rclone"
    assert "copyto" in fake.verbs() and "moveto" in fake.verbs()


# ── stale partials, system mirrors, untagged ────────────────────────────────

def test_ensure_cloud_sweeps_stale_partials_only(two_hosts):
    old = _put(two_hosts.cloud, "world-x-mac.tar.gz.partial", age_days=2)
    young = _put(two_hosts.cloud, "world-y-boss.tar.gz.partial", age_days=0.1)
    cloud.ensure_cloud()
    assert not old.exists() and young.exists()


def test_system_mirrors_are_shared_and_pruned_by_version(two_hosts):
    def install(h, version):
        d = two_hosts.data[h] / "Data/systems/dnd5e"
        d.mkdir(parents=True, exist_ok=True)
        (d / "system.json").write_text(json.dumps({"version": version}))

    for i, v in enumerate(["5.9", "5.10", "5.11", "5.12"]):
        install("mac", v)
        with two_hosts.use("mac"):
            _edit(two_hosts.data["mac"], v)
            cloud.backup("manual")
    assert _names(two_hosts.cloud, "system-backup") == [
        "dnd5e-5.10.tar.gz", "dnd5e-5.11.tar.gz", "dnd5e-5.12.tar.gz"]  # by version, not name
    install("boss", "5.12")
    before = (two_hosts.cloud / "system-backup/dnd5e-5.12.tar.gz").stat().st_mtime_ns
    with two_hosts.use("boss"):
        cloud.backup("manual")
    assert (two_hosts.cloud / "system-backup/dnd5e-5.12.tar.gz").stat().st_mtime_ns == before


def test_untagged_are_never_pruned_and_go_only_by_hand(two_hosts, monkeypatch):
    c = two_hosts.cloud
    legacy = [_put(c, f"world-2026-08-0{i}-120000-fvtt14.369.tar.gz", age_days=70 - i).name
              for i in range(1, 4)]
    for i in range(11):
        _put(c, f"world-{_stamp(60 - i)}-fvtt14.369-mac.tar.gz", age_days=60 - i)
    with two_hosts.use("mac"):
        cloud.backup("manual")
    assert set(legacy) <= set(_names(c))
    bootstate.load().record_snapshot(legacy[-1], None, 1.0, "d", by="test")
    monkeypatch.setattr(cloud.sys.stdin, "isatty", lambda: False, raising=False)
    with pytest.raises(SystemExit):              # no terminal → refuses
        cloud.prune_untagged()
    assert cloud.prune_untagged(yes=True) == 0
    left = set(_names(c))
    assert legacy[-1] in left                    # this machine's based-on is kept
    assert not ({legacy[0], legacy[1]} & left)


# ── assets over rclone: size + mtime, no re-download ────────────────────────

def _zip(path, files):
    import zipfile
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in files.items():
            zf.writestr(name, data)


def test_assets_skip_without_download_when_listing_matches(two_hosts, monkeypatch, tmp_path):
    monkeypatch.setattr(cloud, "MANIFEST", tmp_path / "manifest.json")
    fake = _rclone_cloud(two_hosts, monkeypatch)
    _zip(two_hosts.cloud / "assets/tokens-01.zip", {"Goblin Boss.png": b"png"})
    with two_hosts.use("mac"):
        assert cloud.unpack_assets() == 0
        assert (two_hosts.data["mac"] / "Data/assets/tokens/tokens-01/goblin-boss.png").exists()
        rec = json.loads((tmp_path / "manifest.json").read_text())["packs"]["tokens-01"]
        assert rec["mtime"] and rec["bytes"]
        fake.calls.clear()
        assert cloud.unpack_assets() == 0
    assert "copyto" not in fake.verbs()          # no download the second time


def test_assets_old_manifest_entry_is_checked_once_then_recorded(two_hosts, monkeypatch, tmp_path):
    monkeypatch.setattr(cloud, "MANIFEST", tmp_path / "manifest.json")
    fake = _rclone_cloud(two_hosts, monkeypatch)
    z = two_hosts.cloud / "assets/maps-01.zip"
    _zip(z, {"a.webp": b"w"})
    dest = two_hosts.data["mac"] / "Data/assets/maps/maps-01"
    dest.mkdir(parents=True)
    (tmp_path / "manifest.json").write_text(json.dumps({"packs": {"maps-01": {
        "zip": "maps-01.zip", "sha256": cloud.sha256_file(z), "bytes": z.stat().st_size,
        "files": 1, "dest": "Data/assets/maps/maps-01", "extracted": "x"}}}))
    with two_hosts.use("mac"):
        assert cloud.unpack_assets() == 0
        assert fake.verbs().count("copyto") == 1
        fake.calls.clear()
        assert cloud.unpack_assets() == 0
    assert "copyto" not in fake.verbs()
    assert "mtime" in json.loads((tmp_path / "manifest.json").read_text())["packs"]["maps-01"]


# ── the updater's rollback point (§9) ───────────────────────────────────────

def test_rollback_point_is_the_based_on_snapshot_then_own_newest(two_hosts):
    from scripts.foundry.update import recover
    _put(two_hosts.cloud, f"world-{_stamp(0.1)}-fvtt14.369-boss.tar.gz", age_days=0.1)
    with two_hosts.use("mac"):
        assert recover.newest_world_snapshot() is None      # never the other host's
        mine = _put(two_hosts.cloud, f"world-{_stamp(3)}-fvtt14.369-mac.tar.gz", age_days=3).name
        assert recover.newest_world_snapshot().name == mine
        legacy = _put(two_hosts.cloud, f"world-{_stamp(1)}-fvtt14.369.tar.gz", age_days=1).name
        bootstate.load().record_snapshot(legacy, None, 1.0, "d", by="adopt-legacy-marker")
        assert recover.newest_world_snapshot().name == legacy  # what the tree IS


def test_updater_world_restore_downloads_and_keeps_config(two_hosts):
    from scripts.foundry.update import recover
    (two_hosts.data["mac"] / "Data/worlds/w/journal.txt").write_text("pre-update")
    with two_hosts.use("mac"):
        cloud.backup("auto-update")
        snap = recover.newest_world_snapshot()
        opts = (two_hosts.data["mac"] / "Config/options.json").read_text()
        _edit(two_hosts.data["mac"], "migrated by a bad update")
        rec = recover.Recovery(kind="system", target="dnd5e")
        recover._restore_world_tar(snap, rec)
    assert (two_hosts.data["mac"] / "Data/worlds/w/journal.txt").read_text() == "pre-update"
    assert (two_hosts.data["mac"] / "Config/options.json").read_text() == opts
    assert rec.steps == [f"restored worlds/Config/modules from {snap.name}"]
