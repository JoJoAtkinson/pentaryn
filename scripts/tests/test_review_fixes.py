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


# ── DL5/R1: extras a world-less restore left go up with the next backup ──────

def test_the_backup_after_a_worldless_restore_that_left_extras_uploads_them(two_hosts):
    import shutil
    c = two_hosts.cloud
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [s1] = _names(c)
    boss = two_hosts.data["boss"]
    shutil.rmtree(boss / "Data/worlds")
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    with two_hosts.use("boss"):
        cloud.restore(s1, yes=True)
        cloud.backup("pre-launch", if_stopped=True)
    [sb] = [n for n in _names(c) if n.endswith("-boss.tar.gz")]
    side = json.loads((c / "world-backups" / f"{sb}{cloud.PARENT_SUFFIX}").read_text())
    assert side["modules"]["boss-only"] in _bundle_names(c)


def test_a_restore_that_left_nothing_behind_still_skips_the_next_backup(two_hosts, capsys):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [s1] = _names(two_hosts.cloud)
    _edit(two_hosts.data["boss"], "boss's own")
    with two_hosts.use("boss"):
        cloud.restore(s1, yes=True)
        capsys.readouterr()
        cloud.backup("pre-launch", if_stopped=True)
    assert "no change since the last snapshot — skipped" in capsys.readouterr().out


# ── R2: a downloaded bundle is read end to end before anything is touched ────

def _gz_tar(path, files: dict[str, bytes]):
    import io
    import tarfile
    with tarfile.open(path, "w:gz") as tar:
        for rel, data in files.items():
            info = tarfile.TarInfo(rel)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return path


def test_read_all_names_the_members_of_a_whole_archive(tmp_path):
    from scripts.foundry import bundles
    p = _gz_tar(tmp_path / "a.tar.gz", {"x/1": b"one", "x/2": os.urandom(4096)})
    assert bundles.read_all(p) == ["x/1", "x/2"]


@pytest.mark.parametrize("where", ["middle", "crc"])
def test_read_all_refuses_a_damaged_archive_of_the_same_size(tmp_path, where):
    from scripts.foundry import bundles
    p = _gz_tar(tmp_path / "a.tar.gz", {"x/big": os.urandom(256 * 1024)})
    data = bytearray(p.read_bytes())
    i = len(data) // 2 if where == "middle" else len(data) - 6     # inside the CRC32
    data[i] ^= 0xFF
    p.write_bytes(bytes(data))
    with pytest.raises(ValueError, match="damaged"):
        bundles.read_all(p)


def test_verify_refuses_a_member_outside_the_bundles_folder(tmp_path):
    from scripts.foundry import bundles
    p = _gz_tar(tmp_path / "b.tar.gz", {"tools/module.json": b"{}", "maps/evil.js": b"x"})
    with pytest.raises(ValueError, match="outside tools/"):
        bundles.verify(p, "module", "tools")


def test_a_bundle_holding_another_folder_is_refused_before_the_world_is_touched(
        two_hosts, capsys):
    c = two_hosts.cloud
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [s1] = _names(c)
    [tools] = [n for n in _bundle_names(c) if n.startswith("module@tools@")]
    _gz_tar(c / "bundles" / tools, {"tools/module.json": b"{}", "maps/evil.js": b"x"})
    boss = two_hosts.data["boss"]
    _edit(boss, "boss's own session")
    capsys.readouterr()
    with two_hosts.use("boss"), pytest.raises(SystemExit):
        cloud.restore(s1, yes=True)
    err = capsys.readouterr().err
    assert "nothing local was touched" in err and tools in err, err
    assert (boss / "Data/worlds/w/journal.txt").read_text() == "boss's own session"


# ── DL6: a destination the inventory skips is refused (link) or kept (folder) ─

def _mac_s1(two_hosts):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    return _names(two_hosts.cloud)[0]


def test_a_symlinked_destination_is_refused_before_any_download_or_safety_copy(
        two_hosts, monkeypatch, tmp_path, capsys):
    s1 = _mac_s1(two_hosts)
    boss = two_hosts.data["boss"]
    dev = make_module(tmp_path / "checkout", "tools", version="9.9-dev")
    (boss / "Data/modules/tools").symlink_to(dev, target_is_directory=True)
    _edit(boss, "boss's own")
    downloads: list[str] = []
    real = storage.FolderStorage.download
    monkeypatch.setattr(storage.FolderStorage, "download",
                        lambda self, rel, dest: (downloads.append(rel), real(self, rel, dest))[1])
    before = _names(two_hosts.cloud)
    capsys.readouterr()
    with two_hosts.use("boss"), pytest.raises(SystemExit):
        cloud.restore(s1, yes=True)
    err = capsys.readouterr().err
    assert "is a symlink" in err and "nothing local was touched" in err, err
    assert str(dev) in err                                   # names where it points
    assert downloads == [] and _names(two_hosts.cloud) == before
    assert (boss / "Data/modules/tools").is_symlink()


@pytest.mark.parametrize("shape", ["folder", "file"])
def test_an_unbundled_destination_is_moved_aside_whole_and_named(two_hosts, capsys, shape):
    s1 = _mac_s1(two_hosts)
    boss = two_hosts.data["boss"]
    dest = boss / "Data/modules/tools"
    if shape == "folder":
        dest.mkdir(parents=True)
        (dest / "notes.md").write_text("only copy\n")
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text("a stray file named like the module\n")
    _edit(boss, "boss's own")
    capsys.readouterr()
    with two_hosts.use("boss"):
        cloud.restore(s1, yes=True)
    out = capsys.readouterr().out
    assert "moved aside" in out and "Data/modules/tools →" in out, out
    [kept] = list((boss / cloud.REPLACED_DIRNAME).glob("*/Data/modules/tools"))
    if shape == "folder":
        assert (kept / "notes.md").read_text() == "only copy\n"
    else:
        assert kept.read_text().startswith("a stray file")
    assert (dest / "module.json").is_file()                  # the snapshot's tools is in


# ── M1/M2: staged tars — gone is a StorageError or a rebuild; mtime is fresh ──

def _staged(two_hosts, tmp_path):
    from scripts.foundry import bundles
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        loc = bundles.local_inventory()["module/tools"]
    return loc, bundles.build(loc, tmp_path / "staging")


def test_upload_missing_raises_storage_error_when_a_staged_tar_is_gone(two_hosts, tmp_path):
    from scripts.foundry import bundles
    loc, tar = _staged(two_hosts, tmp_path)
    tar.unlink()
    with two_hosts.use("mac"), pytest.raises(storage.StorageError, match="staged tar"):
        bundles.upload_missing(cloud.store(), {loc.name: tar}, {})


def test_upload_missing_rebuilds_a_gone_staged_tar_and_replaces_its_entry(two_hosts,
                                                                           tmp_path):
    from scripts.foundry import bundles
    loc, tar = _staged(two_hosts, tmp_path)
    tar.unlink()
    rebuilt: list = []
    staged = {loc.name: tar}
    with two_hosts.use("mac"):
        up = bundles.upload_missing(cloud.store(), staged, {},
                                    rebuild=cloud._rebuilder(rebuilt))
    assert up == [loc.name] and staged[loc.name] == rebuilt[0] != tar
    assert loc.name in _bundle_names(two_hosts.cloud)

