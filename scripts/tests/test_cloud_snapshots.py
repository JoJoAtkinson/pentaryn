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


def test_safety_copies_have_their_own_cap_and_never_push_regulars_out(two_hosts):
    c = two_hosts.cloud
    regular = [_put(c, f"world-{_stamp(60 - i)}-fvtt14.369-mac.tar.gz", age_days=60 - i).name
               for i in range(10)]
    safety = [_put(c, f"world-{_stamp(9 - i)}-fvtt14.369-mac.safety.tar.gz",
                   age_days=9 - i).name for i in range(5)]
    with two_hosts.use("mac"):
        cloud.backup("manual")
    left = set(_names(c))
    snaps = cloud.snapshots(cloud.store())
    assert len([s for s in snaps if s.host == "mac" and not s.safety]) == 10
    assert set(regular[1:]) <= left and regular[0] not in left   # only the 11th went
    assert [n for n in safety if n in left] == safety[2:]          # the last 3 safeties


def _based_on(two_hosts, who, name):
    """`who`'s tree is based on `name` (its digest differs, so a backup uploads)."""
    with two_hosts.use(who):
        snap = cloud.find_snapshot(cloud.store(), name)
        bootstate.BootState().record_snapshot(name, snap.host, snap.mtime, "older",
                                              by="test")


def test_coalesce_replaces_only_this_hosts_newest_within_five_days(two_hosts):
    c = two_hosts.cloud
    mine = _put(c, f"world-{_stamp(1)}-fvtt14.369-mac.tar.gz", age_days=1).name
    theirs = _put(c, f"world-{_stamp(0.5)}-fvtt14.369-boss.tar.gz", age_days=0.5).name
    _based_on(two_hosts, "mac", mine)
    with two_hosts.use("mac"):
        cloud.backup("manual")
    names = _names(c)
    assert mine not in names                 # own, under 5 days → replaced
    assert theirs in names                   # the other host's → never
    assert len([n for n in names if n.endswith("-mac.tar.gz")]) == 1


@pytest.mark.parametrize("record", ["none", "other-line"])
def test_own_newest_the_tree_does_not_contain_is_never_coalesced(two_hosts, record):
    """After a restore of another line (or with no record at all), this host's newest may
    be the only copy of a session the tree no longer holds: never replace it."""
    c = two_hosts.cloud
    mine = _put(c, f"world-{_stamp(1)}-fvtt14.369-mac.tar.gz", age_days=1).name
    theirs = _put(c, f"world-{_stamp(0.5)}-fvtt14.369-boss.tar.gz", age_days=0.5).name
    if record == "other-line":
        _based_on(two_hosts, "mac", theirs)
    with two_hosts.use("mac"):
        cloud.backup("manual")
    names = _names(c)
    assert {mine, theirs} <= set(names)
    assert len([n for n in names if n.endswith("-mac.tar.gz")]) == 2


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
        (two_hosts.cloud / "world-backups/.last-digest").write_text(
            cloud.legacy_snapshot_digest() + "\n")
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


def _lineage(cloud_dir, name, sub="world-backups"):
    """The sidecar's lineage keys — without the bundle manifest it also carries."""
    return {k: v for k, v in _sidecar(cloud_dir, name, sub).items()
            if k not in ("bundled", "modules", "systems")}


def test_backup_writes_a_parent_sidecar_and_restore_inherits_its_lineage(two_hosts):
    c = two_hosts.cloud
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        [m0] = _names(c)
        # No based-on record: the lineage is unknown, not "no ancestors".
        assert _lineage(c, m0) == {"parent": None, "ancestors": None,
                                   "ancestor_mtimes": None, "origin_before": None,
                                   "host": "mac"}
        m0_mtime = cloud.find_snapshot(cloud.store(), m0).mtime
        _edit(two_hosts.data["mac"], "two")
        cloud.backup("shutdown")                  # coalesces m0 away …
        [m1] = _names(c)
    # … but the lineage still names it; m0's own origin is unknown, so the chain's edge
    # is m0's mtime: anything older may be in it.
    assert _sidecar(c, m1)["ancestors"] == [m0]
    assert _sidecar(c, m1)["ancestor_mtimes"] == [m0_mtime]
    assert _sidecar(c, m1)["origin_before"] == m0_mtime
    assert _sidecars(c) == [m1]                   # m0's sidecar went with it
    with two_hosts.use("boss"):
        cloud.restore(m1, yes=True)
        st = bootstate.load()
        assert (st.based_on, st.lineage, st.lineage_origin_before) == (m1, [m0], m0_mtime)
        assert st.lineage_mtimes == [m0_mtime]
        m1_mtime = st.based_on_mtime
        _edit(two_hosts.data["boss"], "boss")
        cloud.backup("shutdown")
        b1 = bootstate.load().based_on
    assert _lineage(c, b1) == {"parent": m1, "ancestors": [m1, m0],
                               "ancestor_mtimes": [m1_mtime, m0_mtime],
                               "origin_before": m0_mtime, "host": "boss"}
    snap = cloud.find_snapshot(cloud.store(), b1)
    assert cloud.descends(cloud.store(), snap, m0) is True
    other = "world-other.tar.gz"
    assert cloud.descends(cloud.store(), snap, other, m0_mtime + 60) is False  # newer: diverged
    assert cloud.descends(cloud.store(), snap, other, m0_mtime - 60) is None   # older: unknown
    assert cloud.descends(cloud.store(), snap, other) is None                  # no mtime: unknown


def test_a_snapshot_taken_with_no_record_is_unknown_and_so_are_its_descendants(two_hosts):
    """Round-2 finding: `"ancestors": []` read as "known, none", so every later check called
    it diverged — and its children too, since their lists still lacked the old state."""
    c = two_hosts.cloud
    legacy_mtime = time.time() - DAY              # a state from before the unknown root
    st = cloud.store()
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                  # no record: unknown origin
        m1 = bootstate.load().based_on
        m1_mtime = cloud.find_snapshot(st, m1).mtime
        assert cloud.descends(st, cloud.find_snapshot(st, m1), "world-L.tar.gz",
                              legacy_mtime) is None
        _edit(two_hosts.data["mac"], "two")
        cloud.backup("shutdown")                  # its child: [m1], edge m1's mtime
        m2 = bootstate.load().based_on
    assert _sidecar(c, m2)["ancestors"] == [m1]
    snap = cloud.find_snapshot(st, m2)
    assert cloud.descends(st, snap, "world-L.tar.gz", legacy_mtime) is None
    assert cloud.descends(st, snap, "world-B.tar.gz", m1_mtime + 60) is False


def test_a_lost_state_file_makes_the_next_snapshot_unknown(two_hosts):
    c = two_hosts.cloud
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        two_hosts.state_file("mac").unlink()      # lost
        _edit(two_hosts.data["mac"], "after the loss")
        cloud.backup("shutdown")
        m = bootstate.load().based_on
    assert _sidecar(c, m)["ancestors"] is None
    assert cloud.read_lineage(cloud.store(), cloud.find_snapshot(cloud.store(), m)) is None


def test_based_on_a_legacy_snapshot_the_edge_is_its_mtime():
    st = bootstate.BootState(based_on="world-L.tar.gz", based_on_mtime=1000.0, lineage=[])
    assert cloud.next_lineage(st) == (["world-L.tar.gz"], [1000.0], 1000.0)


def test_a_known_edge_is_inherited():
    st = bootstate.BootState(based_on="b", based_on_mtime=5000.0, lineage=["a", "z"],
                             lineage_origin_before=1000.0)
    assert cloud.next_lineage(st) == (["b", "a", "z"], [5000.0, None, None], 1000.0)


def test_no_record_has_no_lineage():
    assert cloud.next_lineage(bootstate.BootState()) == (None, None, None)


def test_cutting_at_the_cap_moves_the_edge_to_the_newest_dropped_ancestor(monkeypatch):
    """Final review (HIGH): the edge moves only as far as the dropped ancestors — not to
    the based-on snapshot, which would make everything older than it "cannot tell"."""
    monkeypatch.setattr(cloud, "LINEAGE_CAP", 3)
    lineage = ["a3", "a2", "a1", "a0"]                       # newest first
    mt = [4000.0, 3000.0, 2000.0, 1500.0]
    st = bootstate.BootState(based_on="b", based_on_mtime=5000.0, lineage=lineage,
                             lineage_mtimes=mt, lineage_origin_before=1000.0)
    names, mtimes, origin = cloud.next_lineage(st)
    assert names == ["b", "a3", "a2"] and mtimes == [5000.0, 4000.0, 3000.0]
    assert origin == 2000.0                                  # a1, the newest dropped


def test_cutting_with_unknown_dropped_mtimes_falls_back_to_the_oldest_kept(monkeypatch):
    monkeypatch.setattr(cloud, "LINEAGE_CAP", 3)
    st = bootstate.BootState(based_on="b", based_on_mtime=5000.0,
                             lineage=["a3", "a2", "a1", "a0"],
                             lineage_mtimes=[4000.0, None, None, None],
                             lineage_origin_before=1000.0)
    names, _, origin = cloud.next_lineage(st)
    assert names == ["b", "a3", "a2"] and origin == 4000.0   # a3 bounds a1 from above
    st.lineage_mtimes = []                                   # an older state file
    assert cloud.next_lineage(st)[2] == 5000.0               # only the based-on bounds it


def test_the_default_cap_is_generous():
    assert cloud.LINEAGE_CAP >= 1000


def test_a_sidecar_without_an_edge_is_unknown_for_anything_it_does_not_name(two_hosts):
    name = f"world-{_stamp(1)}-fvtt14.369-mac.tar.gz"
    _put(two_hosts.cloud, name, age_days=1)
    (two_hosts.cloud / "world-backups" / f"{name}.parent").write_text('{"ancestors": ["x"]}')
    snap = cloud.find_snapshot(cloud.store(), name)
    assert cloud.descends(cloud.store(), snap, "x", 1.0) is True
    assert cloud.descends(cloud.store(), snap, "y", time.time()) is None


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


def test_restore_skips_the_safety_copy_when_the_target_contains_the_unchanged_world(
        two_hosts, capsys):
    """The Mac's world is unchanged since m0, m0 has left the cloud, and b1 (being
    restored) descends from m0: a safety copy would re-upload ~3 GB that b1 already holds."""
    c = two_hosts.cloud
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        m0 = bootstate.load().based_on
    with two_hosts.use("boss"):
        cloud.restore(m0, yes=True)
        _edit(two_hosts.data["boss"], "boss on top of m0")
        cloud.backup("shutdown")
        b1 = bootstate.load().based_on
    (c / "world-backups" / m0).unlink()               # coalesced/pruned elsewhere
    capsys.readouterr()
    with two_hosts.use("mac"):
        cloud.restore(b1, yes=True)
        assert bootstate.load().based_on == b1
    out = capsys.readouterr().out
    assert f"which {b1} contains — no safety copy needed" in out
    assert not any(n.endswith("-mac.safety.tar.gz") for n in _names(c))


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


# ── stale partials, untagged ───────────────────────────────────────────────

def test_ensure_cloud_sweeps_stale_partials_only(two_hosts):
    old = _put(two_hosts.cloud, "world-x-mac.tar.gz.partial", age_days=2)
    young = _put(two_hosts.cloud, "world-y-boss.tar.gz.partial", age_days=0.1)
    cloud.ensure_cloud()
    assert not old.exists() and young.exists()


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


# ── module bundles: the world snapshot is worlds+Config, modules/systems are bundles ──
# (context/plans/module-bundles-2026-10.md §3.2, §3.5, §3.6, §4, §8)

from bundle_fakes import foundry_launch, make_module  # noqa: E402
from scripts.foundry import bundles  # noqa: E402


def _install(root, *, maps_extra: bytes = b"map art " * 512, system: str | None = "5.12"):
    """Real module content: a map pack with two LevelDB packs, a small tool, a system.
    Deterministic bytes, so two hosts installing it get the same fingerprints."""
    mods = root / "Data/modules"
    make_module(mods, "maps", version="2.0.0", packs=2, extra={"art/big.webp": maps_extra})
    make_module(mods, "tools", version="1.1", packs=1)
    if system:
        _system(root, system)
    return root


def _system(root, version, body="export const dnd5e = 1;\n"):
    d = root / "Data/systems/dnd5e"
    d.mkdir(parents=True, exist_ok=True)
    (d / "system.json").write_text(json.dumps({"id": "dnd5e", "version": version}))
    (d / "dnd5e.mjs").write_text(body)
    return d


def _packs(root):
    return sorted(p.parent for p in (root / "Data/modules").glob("*/packs/*/CURRENT"))


def _bundle_names(cloud_dir):
    return sorted(p.name for p in (cloud_dir / "bundles").iterdir())


def _uploads(monkeypatch):
    """Every rel FolderStorage.upload is asked for, in order."""
    seen: list[str] = []
    real = storage.FolderStorage.upload

    def spy(self, src, rel):
        seen.append(rel)
        return real(self, src, rel)
    monkeypatch.setattr(storage.FolderStorage, "upload", spy)
    return seen


def _bundle_uploads(seen):
    return [r.split("/", 1)[1] for r in seen if r.startswith("bundles/")]


def _rclone_moves(fake, sub, direction):
    """Bundle/snapshot names copied up to (`up`) or down from (`down`) cloud subfolder `sub`."""
    out = []
    for c in fake.calls:
        if c[1] != "copyto":
            continue
        src, dst = FakeRclone._positional(c[2:])[:2]
        if direction == "down" and src.startswith("fake:") and f"/{sub}/" in src \
                and not dst.startswith("fake:"):
            out.append(src.rsplit("/", 1)[1])
        if direction == "up" and dst.startswith("fake:") and f"/{sub}/" in dst \
                and not src.startswith("fake:"):
            out.append(dst.rsplit("/", 1)[1].removesuffix(".partial"))
    return out


def _tree_hash(root):
    """Everything under a data root except the bundle cache and the temp dir."""
    import hashlib
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root).as_posix()
        if rel.startswith(cloud.TMP_DIRNAME) or rel == bundles.CACHE_FILENAME:
            continue
        st = p.lstat()
        h.update(f"{rel}\0{p.is_dir()}\0{st.st_mtime_ns}\0".encode())
        if p.is_file():
            h.update(p.read_bytes())
    return h.hexdigest()


def _tmp_files(root):
    tmp = root / cloud.TMP_DIRNAME
    return sorted(p.relative_to(tmp).as_posix() for p in tmp.rglob("*") if p.is_file()) \
        if tmp.exists() else []


def _first_member(tar_path):
    with tarfile.open(tar_path) as tar:
        first = tar.next()
        return first.name, json.loads(tar.extractfile(first).read())


def _newest(cloud_dir, suffix="-mac.tar.gz"):
    return [n for n in _names(cloud_dir) if n.endswith(suffix)][-1]


def test_bundled_backup_uploads_a_world_tar_every_bundle_and_the_manifest(two_hosts,
                                                                          monkeypatch):
    mac = _install(two_hosts.data["mac"])
    seen = _uploads(monkeypatch)
    with two_hosts.use("mac"):
        assert cloud.backup("shutdown") == 0
        inv = bundles.local_inventory()
    [name] = _names(two_hosts.cloud)
    want = bundles.manifest(inv)
    assert set(want["modules"]) == {"m", "maps", "tools"} and set(want["systems"]) == {"dnd5e"}
    assert want["systems"]["dnd5e"].startswith("system@dnd5e@5.12@")
    # every bundle once, before the world tar
    assert sorted(_bundle_uploads(seen)) == _bundle_names(two_hosts.cloud) == sorted(
        bundles.manifest_names(want))
    assert seen[-1] == f"world-backups/{name}"
    # the world tar: the marker first, then worlds + Config only
    tar_path = two_hosts.cloud / "world-backups" / name
    first, marker = _first_member(tar_path)
    assert first == cloud.SNAPSHOT_MARKER
    assert marker["bundled"] == 1 and marker["host"] == "mac" and marker["core"] == "14.369"
    assert (marker["modules"], marker["systems"]) == (want["modules"], want["systems"])
    with tarfile.open(tar_path) as tar:
        names = tar.getnames()
        assert tar.extractfile("Data/worlds/w/world.json").read() == b'{"id": "w"}\n'
    assert "Config/options.json" in names
    assert not any(n.startswith(("Data/modules", "Data/systems")) for n in names)
    # the sidecar: lineage as before, plus the manifest
    side = _sidecar(two_hosts.cloud, name)
    assert side["bundled"] == 1 and side["host"] == "mac" and "ancestors" in side
    assert (side["modules"], side["systems"]) == (want["modules"], want["systems"])
    # nothing staged is left behind; no system mirror is written any more
    assert _tmp_files(mac) == []
    assert _names(two_hosts.cloud, "system-backup") == []


def test_a_foundry_launch_uploads_no_bundle_and_a_changed_module_uploads_one(two_hosts,
                                                                             monkeypatch):
    mac = _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        first = _bundle_names(two_hosts.cloud)
        seen = _uploads(monkeypatch)
        _edit(mac, "after a session")
        for pack in _packs(mac):
            foundry_launch(pack)
        cloud.backup("shutdown")
        assert _bundle_uploads(seen) == []                # world only
        assert any(r.startswith("world-backups/") for r in seen)
        seen.clear()
        (mac / "Data/modules/tools/scripts/new.js").write_text("// a real change\n")
        _edit(mac, "and another")
        cloud.backup("shutdown")
    [one] = _bundle_uploads(seen)
    assert one.startswith("module@tools@1.1@") and one not in first
    assert len(_bundle_names(two_hosts.cloud)) == len(first) + 1


def test_the_digest_changes_only_with_the_world_or_the_manifest(two_hosts):
    mac = _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        d0 = cloud.snapshot_digest()
        for pack in _packs(mac):
            foundry_launch(pack)
        assert cloud.snapshot_digest() == d0              # housekeeping is not content
        (mac / "Data/modules/maps/art/big.webp").write_bytes(b"repainted")
        d1 = cloud.snapshot_digest()
        assert d1 != d0                                   # the manifest moved
        _edit(mac, "world")
        d2 = cloud.snapshot_digest()
        assert d2 not in (d0, d1)                         # the world moved
        m = bundles.manifest(bundles.local_inventory())
        assert cloud.snapshot_digest(m) == d2
        assert cloud.snapshot_digest({"modules": {}, "systems": {}}) != d2
        assert cloud.legacy_snapshot_digest() != d2


def test_a_failed_world_upload_leaves_bundles_and_sidecar_but_no_snapshot(two_hosts,
                                                                          monkeypatch):
    _install(two_hosts.data["mac"])
    real = storage.FolderStorage.upload

    def flaky(self, src, rel):
        if rel.startswith("world-backups/"):
            raise storage.StorageError("upload of the world failed", verb="copyto")
        return real(self, src, rel)
    monkeypatch.setattr(storage.FolderStorage, "upload", flaky)
    with two_hosts.use("mac"), pytest.raises(SystemExit):
        cloud.backup("shutdown")
    with two_hosts.use("mac"):
        want = bundles.manifest_names(bundles.manifest(bundles.local_inventory()))
    assert set(_bundle_names(two_hosts.cloud)) == want
    assert len(_sidecars(two_hosts.cloud)) == 1
    assert cloud.snapshots(cloud.store()) == []
    with two_hosts.use("mac"):
        assert bootstate.load().based_on is None


def test_a_failed_bundle_upload_leaves_only_a_partial(two_hosts, monkeypatch, capsys):
    _install(two_hosts.data["mac"])

    def broken(self, src, rel):
        if rel.startswith("bundles/"):
            shutil.copy2(src, self._p(rel + ".partial"))
            raise storage.StorageError("connection reset", verb="copyto")
        raise AssertionError(f"uploaded {rel} after a failed bundle")
    monkeypatch.setattr(storage.FolderStorage, "upload", broken)
    with two_hosts.use("mac"), pytest.raises(SystemExit):
        cloud.backup("shutdown")
    left = _bundle_names(two_hosts.cloud)
    assert len(left) == 1 and left[0].endswith(".partial")
    assert list((two_hosts.cloud / "world-backups").iterdir()) == []
    err = capsys.readouterr().err
    assert "upload failed" in err and "world-" in err


def test_promotion_copies_the_manifest(two_hosts):
    c = two_hosts.cloud
    _install(two_hosts.data["mac"])
    two_hosts.set_core("mac", "13.351")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [old] = _names(c)
    two_hosts.set_core("mac", "14.369")
    with two_hosts.use("mac"):
        _edit(two_hosts.data["mac"], "on 14")
        cloud.backup("shutdown")
    assert _names(c, "major-release") == [old]
    preserved = _sidecar(c, old, "major-release")
    assert preserved["bundled"] == 1 and "maps" in preserved["modules"]
    snap = cloud.find_snapshot(cloud.store(), old)
    assert snap.folder == "major-release"
    assert cloud.read_manifest(cloud.store(), snap)["modules"] == preserved["modules"]


# ── systems are bundles (replaces the system-backup/ mirrors) ────────────────

def test_systems_are_bundles_shared_by_both_hosts(two_hosts, monkeypatch):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [sysb] = [n for n in _bundle_names(two_hosts.cloud) if n.startswith("system@")]
    assert sysb.startswith("system@dnd5e@5.12@")
    before = (two_hosts.cloud / "bundles" / sysb).stat().st_mtime_ns
    _install(two_hosts.data["boss"])                      # the same bytes on the other host
    seen = _uploads(monkeypatch)
    with two_hosts.use("boss"):
        _edit(two_hosts.data["boss"], "boss")
        cloud.backup("shutdown")
    assert _bundle_uploads(seen) == []                    # shared, not uploaded twice
    assert (two_hosts.cloud / "bundles" / sysb).stat().st_mtime_ns == before
    boss_snap = _newest(two_hosts.cloud, "-boss.tar.gz")
    assert _sidecar(two_hosts.cloud, boss_snap)["systems"] == {"dnd5e": sysb}
    assert _names(two_hosts.cloud, "system-backup") == []


def test_a_system_is_restored_only_when_its_fingerprint_differs(two_hosts):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    snap = _newest(two_hosts.cloud)
    boss = _install(two_hosts.data["boss"], system=None)
    _system(boss, "5.11", body="old code\n")
    with two_hosts.use("boss"):
        cloud.restore(snap, yes=True)
    sysjson = json.loads((boss / "Data/systems/dnd5e/system.json").read_text())
    assert sysjson["version"] == "5.12"
    assert (boss / "Data/systems/dnd5e/dnd5e.mjs").read_text() == "export const dnd5e = 1;\n"
    ino = (boss / "Data/systems/dnd5e/dnd5e.mjs").stat().st_ino
    with two_hosts.use("boss"):
        _edit(boss, "boss plays")
        cloud.backup("shutdown")
        cloud.restore(snap, yes=True)                     # same fingerprint now → untouched
    assert (boss / "Data/systems/dnd5e/dnd5e.mjs").stat().st_ino == ino


# ── bundled restore ──────────────────────────────────────────────────────────

def test_bundled_restore_downloads_only_what_this_machine_lacks(two_hosts, monkeypatch,
                                                               capsys):
    fake = _rclone_cloud(two_hosts, monkeypatch)
    _install(two_hosts.data["mac"])
    (two_hosts.data["mac"] / "Data/modules/tools/scripts/main.js").write_text("// mac v2\n")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        mac_inv = bundles.local_inventory()
    snap = [n for n in _names(two_hosts.cloud) if n.startswith("world-")][-1]
    boss = _install(two_hosts.data["boss"])               # same maps + system, older tools
    maps_file = boss / "Data/modules/maps/art/big.webp"
    maps_stat = (maps_file.stat().st_ino, maps_file.stat().st_mtime_ns)
    maps_dir_ino = (boss / "Data/modules/maps").stat().st_ino
    fake.calls.clear()
    capsys.readouterr()
    with two_hosts.use("boss"):
        assert cloud.restore(snap, yes=True) == 0
        st = bootstate.load()
        boss_inv = bundles.local_inventory()
    assert _rclone_moves(fake, "bundles", "down") == [mac_inv["module/tools"].name]
    assert (boss / "Data/modules/tools/scripts/main.js").read_text() == "// mac v2\n"
    assert (maps_file.stat().st_ino, maps_file.stat().st_mtime_ns) == maps_stat
    assert (boss / "Data/modules/maps").stat().st_ino == maps_dir_ino
    assert {k: v.name for k, v in boss_inv.items()} == {k: v.name for k, v in mac_inv.items()}
    assert (st.based_on, st.based_on_host, st.digest) == (snap, "mac", cloud_digest(two_hosts))
    out = capsys.readouterr().out
    assert re.search(rf"restored {re.escape(snap)}: world [\d.]+ [MG]B; modules: 1 installed "
                     r"\([\d.]+ [MG]B\), 2 unchanged, 0 removed; systems: all 1 unchanged", out), out
    assert not (boss / "Data/modules" / cloud.SNAPSHOT_MARKER).exists()
    assert not (boss / cloud.SNAPSHOT_MARKER).exists()
    assert _tmp_files(boss) == []


def cloud_digest(two_hosts, who="boss"):
    with two_hosts.use(who):
        return cloud.snapshot_digest()


def test_bundled_restore_removes_extras_after_the_safety_copy_references_them(two_hosts):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    snap = _newest(two_hosts.cloud)
    boss = _install(two_hosts.data["boss"])
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    (boss / "Data/modules/.hidden-thing").mkdir()           # skipped → never deleted
    (boss / "Data/modules/no-manifest").mkdir()
    (boss / "Data/modules/README.txt").write_text("Foundry's\n")
    with two_hosts.use("boss"):
        _edit(boss, "boss work")
        cloud.restore(snap, yes=True)
    assert not (boss / "Data/modules/boss-only").exists()
    assert (boss / "Data/modules/.hidden-thing").is_dir()
    assert (boss / "Data/modules/no-manifest").is_dir()
    assert (boss / "Data/modules/README.txt").read_text() == "Foundry's\n"
    [safety] = [n for n in _names(two_hosts.cloud) if n.endswith("-boss.safety.tar.gz")]
    ref = _sidecar(two_hosts.cloud, safety)["modules"]["boss-only"]
    assert ref in _bundle_names(two_hosts.cloud)          # in the cloud before it went


def test_bundled_restore_with_no_local_world_leaves_extras_and_lists_them(two_hosts, capsys):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    snap = _newest(two_hosts.cloud)
    boss = two_hosts.data["boss"]
    shutil.rmtree(boss / "Data/worlds")
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    capsys.readouterr()
    with two_hosts.use("boss"):
        cloud.restore(snap, yes=True)
    assert (boss / "Data/modules/boss-only/module.json").exists()
    assert (boss / "Data/modules/maps/module.json").exists()
    out = capsys.readouterr().out
    assert "boss-only" in out and "left" in out
    assert not any(n.endswith(".safety.tar.gz") for n in _names(two_hosts.cloud))


def test_apply_with_systems_false_leaves_systems_alone(two_hosts):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    snap_name = _newest(two_hosts.cloud)
    boss = _install(two_hosts.data["boss"], system=None)
    _system(boss, "6.0", body="newer code\n")
    (boss / "Data/systems/other").mkdir(parents=True)
    (boss / "Data/systems/other/system.json").write_text('{"id": "other", "version": "1"}')
    with two_hosts.use("boss"):
        st = cloud.store()
        f = cloud.fetch_snapshot(st, cloud.find_snapshot(st, snap_name))
        assert "system/dnd5e" in f.needed and "system/other" in f.extras
        try:
            cloud.apply_snapshot(f, systems=False)
        finally:
            cloud.discard_fetched(f)
    assert json.loads((boss / "Data/systems/dnd5e/system.json").read_text())["version"] == "6.0"
    assert (boss / "Data/systems/other/system.json").exists()
    assert _tmp_files(boss) == []


# ── full (legacy) restore ────────────────────────────────────────────────────

def _legacy_tar(path, root_files: dict[str, bytes]):
    """A hand-made full snapshot: worlds + Config + modules, no marker."""
    import io
    with tarfile.open(path, "w:gz") as tar:
        for rel, data in sorted(root_files.items()):
            info = tarfile.TarInfo(rel)
            info.size = len(data)
            info.mtime = int(time.time()) - 3600
            tar.addfile(info, io.BytesIO(data))
    return path


_LEGACY = {
    "Data/worlds/w/world.json": b'{"id": "w"}\n',
    "Data/worlds/w/journal.txt": b"from the full era",
    "Config/options.json": b'{"dataPath": "/Users/someone/FoundryData"}\n',
    "Data/modules/old-maps/module.json": b'{"id": "old-maps", "version": "1"}',
    "Data/modules/old-maps/art.webp": b"old art",
}


@pytest.mark.parametrize("sidecar", [None, "full-era"])
def test_a_full_snapshot_restores_exactly_as_before(two_hosts, sidecar):
    name = (f"world-{_stamp(2)}-fvtt14.369.tar.gz" if sidecar is None
            else f"world-{_stamp(2)}-fvtt14.369-mac.tar.gz")
    p = _legacy_tar(two_hosts.cloud / "world-backups" / name, _LEGACY)
    os.utime(p, (time.time() - 2 * DAY,) * 2)
    if sidecar:
        (two_hosts.cloud / "world-backups" / f"{name}.parent").write_text(json.dumps(
            {"parent": None, "ancestors": [], "ancestor_mtimes": [], "origin_before": 1.0,
             "host": "mac"}))
    boss = _install(two_hosts.data["boss"])
    with two_hosts.use("boss"):
        snap = cloud.find_snapshot(cloud.store(), name)
        assert cloud.read_manifest(cloud.store(), snap) is None
        assert cloud.restore(name, yes=True) == 0
        assert bootstate.load().based_on == name
    assert (boss / "Data/worlds/w/journal.txt").read_text() == "from the full era"
    assert sorted(p.name for p in (boss / "Data/modules").iterdir()) == ["old-maps"]
    assert (boss / "Data/modules/old-maps/art.webp").read_bytes() == b"old art"
    assert (boss / "Data/systems/dnd5e").is_dir()           # a full restore never touched systems
    opts = json.loads((boss / "Config/options.json").read_text())
    assert opts["dataPath"] == str(boss)                    # boss's own options.json kept


def test_extract_snapshot_of_a_local_bundled_tar_needs_every_bundle_here(two_hosts):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    tar = two_hosts.cloud / "world-backups" / _newest(two_hosts.cloud)
    boss = two_hosts.data["boss"]                           # lacks maps, tools, dnd5e
    before = _tree_hash(boss)
    with two_hosts.use("boss"), pytest.raises(RuntimeError) as exc:
        cloud.extract_snapshot(tar)
    assert "module@maps@2.0.0@" in str(exc.value) and "module@tools@1.1@" in str(exc.value)
    assert _tree_hash(boss) == before
    _install(boss)
    (boss / "Data/worlds/w/journal.txt").write_text("boss")
    with two_hosts.use("boss"):
        cloud.extract_snapshot(tar)
    assert not (boss / "Data/worlds/w/journal.txt").exists()   # mac's world has none
    assert not (boss / cloud.SNAPSHOT_MARKER).exists()


# ── refusals: nothing local touched ──────────────────────────────────────────

def _refusal_setup(two_hosts):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    snap = _newest(two_hosts.cloud)
    boss = two_hosts.data["boss"]                          # needs maps, tools, dnd5e
    (boss / "Data/worlds/w/journal.txt").write_text("boss's own")
    make_module(boss / "Data/modules", "boss-only")
    with two_hosts.use("boss"):
        bundles.local_inventory()                          # the cache exists before
    return snap, boss


def _refused(two_hosts, snap, boss, capsys, *needles):
    before = _tree_hash(boss)
    capsys.readouterr()
    with two_hosts.use("boss"), pytest.raises(SystemExit):
        cloud.restore(snap, yes=True)
    err = capsys.readouterr().err
    for n in needles:
        assert n in err, err
    assert "nothing local was touched" in err
    assert _tree_hash(boss) == before
    assert _tmp_files(boss) == []
    assert not any(n.endswith("-boss.safety.tar.gz") for n in _names(two_hosts.cloud))
    with two_hosts.use("boss"):
        assert bootstate.load().based_on is None


def test_restore_refuses_when_a_needed_bundle_is_missing(two_hosts, capsys):
    snap, boss = _refusal_setup(two_hosts)
    [maps] = [n for n in _bundle_names(two_hosts.cloud) if n.startswith("module@maps@")]
    (two_hosts.cloud / "bundles" / maps).unlink()
    _refused(two_hosts, snap, boss, capsys, f"cannot restore {snap} completely", maps)


def test_restore_refuses_when_a_bundle_arrives_with_the_wrong_size(two_hosts, monkeypatch,
                                                                   capsys):
    snap, boss = _refusal_setup(two_hosts)
    real = storage.FolderStorage.download

    def short(self, rel, dest):
        out = real(self, rel, dest)
        if rel.startswith("bundles/module@tools@"):
            with open(out, "ab") as fh:
                fh.write(b"!")
        return out
    monkeypatch.setattr(storage.FolderStorage, "download", short)
    _refused(two_hosts, snap, boss, capsys, "module@tools@")


def test_restore_refuses_a_bundled_sidecar_over_a_tar_without_the_marker(two_hosts, capsys):
    snap, boss = _refusal_setup(two_hosts)
    p = two_hosts.cloud / "world-backups" / snap
    _legacy_tar(p, _LEGACY)                                # sidecar still says bundled
    _refused(two_hosts, snap, boss, capsys, "sidecar and snapshot disagree")


@pytest.mark.parametrize("how", ["full-era", "different", "malformed"])
def test_restore_refuses_a_marked_tar_whose_sidecar_disagrees(two_hosts, capsys, how):
    snap, boss = _refusal_setup(two_hosts)
    side = two_hosts.cloud / "world-backups" / f"{snap}.parent"
    data = json.loads(side.read_text())
    if how == "malformed":
        data["modules"]["tools"] = "not-a-bundle.tar.gz"
        side.write_text(json.dumps(data))
    elif how == "full-era":
        for k in ("bundled", "modules", "systems"):
            data.pop(k)
        side.write_text(json.dumps(data))
    else:
        data["modules"].pop("tools")
        side.write_text(json.dumps(data))
    _refused(two_hosts, snap, boss, capsys, "sidecar and snapshot disagree")


def test_a_lost_sidecar_is_not_a_refusal_the_marker_names_the_bundles(two_hosts, capsys):
    snap, boss = _refusal_setup(two_hosts)
    (two_hosts.cloud / "world-backups" / f"{snap}.parent").unlink()
    with two_hosts.use("boss"):
        assert cloud.restore(snap, yes=True) == 0
    assert "has no sidecar" in capsys.readouterr().out
    assert (boss / "Data/modules/maps/module.json").exists()
    assert (boss / "Data/systems/dnd5e/system.json").exists()
    assert _tmp_files(boss) == []


def test_a_lost_sidecar_with_a_missing_bundle_still_refuses(two_hosts, capsys):
    snap, boss = _refusal_setup(two_hosts)
    (two_hosts.cloud / "world-backups" / f"{snap}.parent").unlink()
    [tools] = [n for n in _bundle_names(two_hosts.cloud) if n.startswith("module@tools@")]
    (two_hosts.cloud / "bundles" / tools).unlink()
    _refused(two_hosts, snap, boss, capsys, "missing from the cloud", tools)


# ── the two-hosts scenario (§8), counting transfers ─────────────────────────

def test_two_hosts_scenario_moves_only_the_bundles_that_changed(two_hosts, monkeypatch):
    fake = _rclone_cloud(two_hosts, monkeypatch)
    mac, boss = _install(two_hosts.data["mac"]), two_hosts.data["boss"]
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        everything = sorted(v.name for v in bundles.local_inventory().values())
    m1 = [n for n in _names(two_hosts.cloud) if n.startswith("world-")][-1]

    def run(who, fn):
        fake.calls.clear()
        with two_hosts.use(who):
            fn()
        return (sorted(_rclone_moves(fake, "bundles", "down")),
                sorted(_rclone_moves(fake, "bundles", "up")))

    def newest_of(h):
        return [n for n in _names(two_hosts.cloud)
                if n.endswith(f"-{h}.tar.gz")][-1]

    # 1. BOSS, never ran Foundry, takes the Mac's newest: every bundle comes down
    for sub in ("Data/worlds", "Data/modules", "Config"):
        shutil.rmtree(boss / sub)
    down, up = run("boss", lambda: cloud.restore(m1, yes=True))
    assert down == everything and up == []
    assert (boss / "Data/systems/dnd5e/system.json").exists()
    # 2. BOSS plays and backs up: the world, no bundle
    def boss_session():
        _edit(boss, "boss session")
        cloud.backup("shutdown")
    down, up = run("boss", boss_session)
    assert (down, up) == ([], [])
    b1 = newest_of("boss")
    # 3. the Mac takes BOSS's: no bundle
    down, up = run("mac", lambda: cloud.restore(b1, yes=True))
    assert (down, up) == ([], [])
    assert (mac / "Data/worlds/w/journal.txt").read_text() == "boss session"
    # 4. BOSS installs X and backs up: one bundle up
    def boss_installs():
        make_module(boss / "Data/modules", "x-tool", version="0.9")
        _edit(boss, "boss with x")
        cloud.backup("shutdown")
    down, up = run("boss", boss_installs)
    assert down == [] and len(up) == 1 and up[0].startswith("module@x-tool@0.9@")
    x = up[0]
    b2 = newest_of("boss")
    # 5. the Mac takes it: one bundle down
    down, up = run("mac", lambda: cloud.restore(b2, yes=True))
    assert (down, up) == ([x], [])
    assert (mac / "Data/modules/x-tool/module.json").exists()
    # 6. the Mac removes X and backs up; BOSS takes it: X goes on BOSS, stays in the cloud
    def mac_removes():
        shutil.rmtree(mac / "Data/modules/x-tool")
        _edit(mac, "mac without x")
        cloud.backup("shutdown")
    down, up = run("mac", mac_removes)
    assert (down, up) == ([], [])
    m2 = newest_of("mac")
    assert "x-tool" not in _sidecar(two_hosts.cloud, m2)["modules"]
    down, up = run("boss", lambda: cloud.restore(m2, yes=True))
    assert (down, up) == ([], [])
    assert not (boss / "Data/modules/x-tool").exists()
    assert x in _bundle_names(two_hosts.cloud)
    assert (boss / "Data/worlds/w/journal.txt").read_text() == "mac without x"


# ── the updater on a bundled snapshot ───────────────────────────────────────

def test_updater_world_restore_of_a_bundled_snapshot_restores_modules_not_the_system(
        two_hosts):
    from scripts.foundry.update import recover
    mac = _install(two_hosts.data["mac"])
    (mac / "Data/worlds/w/journal.txt").write_text("pre-update")
    with two_hosts.use("mac"):
        cloud.backup("auto-update")
        snap = recover.newest_world_snapshot()
        _edit(mac, "migrated by a bad update")
        (mac / "Data/modules/tools/scripts/main.js").write_text("// updated module\n")
        _system(mac, "5.13", body="the new system\n")
        rec = recover.Recovery(kind="system", target="dnd5e")
        recover._restore_world_tar(snap, rec)
        st = bootstate.load()
    assert (mac / "Data/worlds/w/journal.txt").read_text() == "pre-update"
    assert (mac / "Data/modules/tools/scripts/main.js").read_text() == "console.log('tools');\n"
    assert (mac / "Data/systems/dnd5e/dnd5e.mjs").read_text() == "the new system\n"
    assert rec.steps == [f"restored worlds/Config/modules from {snap.name}"]
    assert (st.based_on, st.by) == (snap.name, "updater-rollback")
    assert _tmp_files(mac) == []
