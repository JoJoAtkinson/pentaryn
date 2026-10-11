"""Tests for the fixes to the adversarial review of module bundles (plan §14, "review fixes").

The review's own repros live in test_review_dataloss.py and test_review_restore_boot.py;
this file pins the mechanisms each fix added, so a later change cannot quietly undo one.
Nothing here touches the network, rclone, OneDrive or Foundry: the cloud is the fake folder
(conftest.two_hosts) or FakeRclone over it.
"""

from __future__ import annotations

import json
import os
import time

import pytest

from bundle_fakes import make_module
from scripts.foundry import cloud, storage

DAY = 86400


def _install(root):
    mods = root / "Data/modules"
    make_module(mods, "maps", version="2.0.0", packs=2, extra={"art/big.webp": b"map art " * 512})
    make_module(mods, "tools", version="1.1", packs=1)
    return root


_bump = [0]


def _edit(root, text):
    f = root / "Data/worlds/w/journal.txt"
    f.write_text(text)
    _bump[0] += 5
    t = time.time() + _bump[0]
    os.utime(f, (t, t))


def _names(c, sub="world-backups"):
    return sorted(p.name for p in (c / sub).iterdir() if p.name.endswith(".tar.gz"))


def _bundle_names(c):
    return sorted(p.name for p in (c / "bundles").iterdir())


# ── DL3: promotion copies the sidecar first, loudly, and repairs it later ────

def _promote(two_hosts, monkeypatch, *, fail_sidecar: bool, coalesce: bool = True):
    """The Mac backs up on 13.351, then on 14.369: the first snapshot is promoted."""
    c = two_hosts.cloud
    mac = _install(two_hosts.data["mac"])
    two_hosts.set_core("mac", "13.351")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [old] = _names(c)
    order: list[str] = []
    real_write, real_copy = storage.FolderStorage.write_text, storage.FolderStorage.copy

    def write(self, rel, text):
        if rel.startswith("major-release/"):
            order.append(rel)
            if fail_sidecar:
                raise storage.StorageError("rcat: connection reset", verb="rcat")
        return real_write(self, rel, text)

    def copy(self, src, dst):
        order.append(dst)
        return real_copy(self, src, dst)
    monkeypatch.setattr(storage.FolderStorage, "write_text", write)
    monkeypatch.setattr(storage.FolderStorage, "copy", copy)
    if not coalesce:
        monkeypatch.setattr(cloud, "COALESCE_WINDOW_DAYS", 0)
    two_hosts.set_core("mac", "14.369")
    _edit(mac, "on 14")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    monkeypatch.setattr(storage.FolderStorage, "write_text", real_write)
    monkeypatch.setattr(storage.FolderStorage, "copy", real_copy)
    return old, order


def test_promotion_writes_the_sidecar_before_the_tar(two_hosts, monkeypatch):
    old, order = _promote(two_hosts, monkeypatch, fail_sidecar=False)
    assert order == [f"major-release/{old}{cloud.PARENT_SUFFIX}", f"major-release/{old}"]


def test_a_failed_sidecar_copy_at_promotion_is_a_warning_not_silence(two_hosts, monkeypatch,
                                                                      capsys):
    capsys.readouterr()
    old, order = _promote(two_hosts, monkeypatch, fail_sidecar=True)
    err = capsys.readouterr().err
    assert f"could not copy the sidecar of {old}" in err, err
    assert order.count(f"major-release/{old}{cloud.PARENT_SUFFIX}") == 2      # tried twice
    assert (two_hosts.cloud / "major-release" / old).exists()                # still preserved


def test_the_next_backup_copies_a_missing_preserved_sidecar_while_its_source_is_kept(
        two_hosts, monkeypatch, capsys):
    c = two_hosts.cloud
    old, _ = _promote(two_hosts, monkeypatch, fail_sidecar=True, coalesce=False)
    side = c / "major-release" / f"{old}{cloud.PARENT_SUFFIX}"
    assert not side.exists() and old in _names(c)
    _edit(two_hosts.data["mac"], "later on 14")
    capsys.readouterr()
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    assert json.loads(side.read_text())["bundled"] == 1
    assert "copied the missing sidecar" in capsys.readouterr().out


# ── DL4: a lost or torn sidecar is marked from the tar's marker ──────────────

def _rclone(two_hosts, monkeypatch):
    from cloud_fakes import FakeRclone
    from scripts.foundry.storage import RcloneStorage
    fake = FakeRclone(two_hosts.cloud.parent)
    rc = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    monkeypatch.setattr(storage, "get", lambda: rc)
    return fake


@pytest.mark.parametrize("damage", ["torn", "lost"])
def test_gc_over_rclone_marks_a_snapshot_whose_sidecar_is_lost_from_its_tar_head(
        two_hosts, monkeypatch, damage):
    c = two_hosts.cloud
    fake = _rclone(two_hosts, monkeypatch)
    boss = _install(two_hosts.data["boss"])
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    with two_hosts.use("boss"):
        cloud.backup("shutdown")
    [sb] = _names(c)
    [only] = [n for n in _bundle_names(c) if n.startswith("module@boss-only@")]
    side = c / "world-backups" / f"{sb}{cloud.PARENT_SUFFIX}"
    if damage == "torn":
        side.write_text(side.read_text()[:40])
    else:
        side.unlink()
    for p in (c / "bundles").iterdir():
        t = time.time() - 30 * DAY
        os.utime(p, (t, t))
    fake.calls.clear()
    with two_hosts.use("mac"):
        refs = cloud.referenced_bundles(cloud.store())
        assert only in refs
        cloud.bundles_gc_cmd(yes=True)
    assert only in _bundle_names(c)
    heads = [a for a in fake.calls if a[1] == "cat" and "--count" in a]
    assert heads and all(a[-len(storage.COMMON_FLAGS) - 1].endswith(sb) for a in heads)


# ── DL2: each half of the cross-host fix holds on its own ────────────────────

def _dl2_race(two_hosts, monkeypatch):
    """test_review_dataloss DL2's scenario: an old, unreferenced boss-only bundle; during
    the Mac's GC mark BOSS runs a whole backup that reuses it. Returns (bundle, boss's
    new snapshot)."""
    c = two_hosts.cloud
    boss = _install(two_hosts.data["boss"])
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    with two_hosts.use("boss"):
        cloud.backup("shutdown")
    [sb] = _names(c)
    (c / "world-backups" / sb).unlink()
    (c / "world-backups" / f"{sb}{cloud.PARENT_SUFFIX}").unlink()
    [only] = [n for n in _bundle_names(c) if n.startswith("module@boss-only@")]
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    for p in (c / "bundles").iterdir():
        t = time.time() - 30 * DAY
        os.utime(p, (t, t))
    _edit(boss, "boss comes back")
    real = cloud._read_sidecar
    raced = []

    def mark_while_boss_backs_up(st, snap):
        if not raced:
            raced.append(1)
            with two_hosts.use("boss"):
                cloud.backup("shutdown")
        return real(st, snap)
    monkeypatch.setattr(cloud, "_read_sidecar", mark_while_boss_backs_up)
    with two_hosts.use("mac"):
        cloud.bundles_gc_cmd(yes=True)
    monkeypatch.setattr(cloud, "_read_sidecar", real)
    assert raced
    return only


def test_dl2_the_remark_alone_spares_a_bundle_the_other_hosts_new_snapshot_reuses(
        two_hosts, monkeypatch, capsys):
    monkeypatch.setattr(cloud, "_refresh_reused", lambda *a, **k: None)
    only = _dl2_race(two_hosts, monkeypatch)
    assert only in _bundle_names(two_hosts.cloud)
    assert "a snapshot that landed during this sweep" in capsys.readouterr().out


def test_dl2_the_refreshed_mtime_alone_spares_a_bundle_the_other_hosts_snapshot_reuses(
        two_hosts, monkeypatch, capsys):
    monkeypatch.setattr(cloud, "_remark", lambda st, seen: (lambda: set()))
    only = _dl2_race(two_hosts, monkeypatch)
    assert only in _bundle_names(two_hosts.cloud)
    assert "reused bundle(s) older than 3.5 days" in capsys.readouterr().out
    assert time.time() - (two_hosts.cloud / "bundles" / only).stat().st_mtime < 3600


def test_reused_bundles_named_by_this_hosts_own_based_on_are_not_touched(two_hosts,
                                                                       monkeypatch):
    c = two_hosts.cloud
    mac = _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    for p in (c / "bundles").iterdir():
        t = time.time() - 30 * DAY
        os.utime(p, (t, t))
    touched: list[str] = []
    monkeypatch.setattr(storage.FolderStorage, "touch",
                        lambda self, rel: touched.append(rel))
    _edit(mac, "a session")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    assert touched == []


def test_rclone_touch_never_creates(two_hosts, monkeypatch):
    fake = _rclone(two_hosts, monkeypatch)
    rc = storage.get()
    rc.touch("bundles/module@gone@1@0123456789abcdef.tar.gz")
    [argv] = [a for a in fake.calls if a[1] == "touch"]
    assert "--no-create" in argv
    assert not (two_hosts.cloud / "bundles" / "module@gone@1@0123456789abcdef.tar.gz").exists()
