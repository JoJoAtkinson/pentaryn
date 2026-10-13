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
from functools import partial
from pathlib import Path

import pytest

from bundle_fakes import make_module
from cloud_fakes import install, make_edit
from cloud_fakes import bundle_names as _bundle_names
from cloud_fakes import worlds as _names
from scripts.foundry import cloud, storage

DAY = 86400


_install = partial(install, system=None)


_edit = make_edit(step=5)


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


# ── DL1: every "what is in the cloud now" listing is fresh over rclone ───────
#
# Each test fills one process's RcloneStorage cache first (as the boot prompt, the boot
# choice or an earlier step of the same command would), then the other host changes the
# cloud, then the site under test runs in that same process. test_dl1 (test_review_dataloss)
# pins the verify; these pin the GC mark, the GC sweep, the restore's plan and the backup's
# first two listings — any `fresh=True` dropped there fails one of them.

def _process(two_hosts, monkeypatch):
    """`switch()` → a new RcloneStorage (a new process: an empty cache) over the fake
    cloud, which `storage.get()` returns until the next switch."""
    from cloud_fakes import FakeRclone
    from scripts.foundry.storage import RcloneStorage
    current: list = [None]
    monkeypatch.setattr(storage, "get", lambda: current[0])

    def switch():
        current[0] = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone",
                                   runner=FakeRclone(two_hosts.cloud.parent),
                                   interactive=False)
        return current[0]
    switch()
    return switch


def _cache_everything(st):
    from scripts.foundry import bundles
    cloud.snapshots(st, cloud.WORLD_BACKUPS)
    cloud.snapshots(st, cloud.MAJOR_RELEASES)
    bundles.listing(st)


def _orphan_boss_only(two_hosts, switch):
    """boss backs up with a boss-only module, then that snapshot is gone (coalesced long
    ago): its bundle is old and referenced by nothing. The mac backs up its own. Returns
    the orphan bundle's name; every bundle is 30 days old."""
    c = two_hosts.cloud
    boss = _install(two_hosts.data["boss"])
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    switch()
    with two_hosts.use("boss"):
        cloud.backup("shutdown")
    [sb] = _names(c)
    (c / "world-backups" / sb).unlink()
    (c / "world-backups" / f"{sb}{cloud.PARENT_SUFFIX}").unlink()
    [only] = [n for n in _bundle_names(c) if n.startswith("module@boss-only@")]
    _install(two_hosts.data["mac"])
    switch()
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    for p in (c / "bundles").iterdir():
        t = time.time() - 30 * DAY
        os.utime(p, (t, t))
    return only


def test_dl1_gc_mark_sees_a_snapshot_the_other_host_wrote_after_the_cache_was_filled(
        two_hosts, monkeypatch):
    switch = _process(two_hosts, monkeypatch)
    only = _orphan_boss_only(two_hosts, switch)
    # Only the mark can save the bundle: no reused-bundle touch, so its mtime stays old.
    monkeypatch.setattr(cloud, "_refresh_reused", lambda *a, **k: None)
    mac_st = switch()
    _cache_everything(mac_st)                           # the mac process listed earlier
    _edit(two_hosts.data["boss"], "boss comes back")
    switch()
    with two_hosts.use("boss"):
        cloud.backup("shutdown")                        # reuses boss-only; its sidecar names it
    new_boss = [n for n in _names(two_hosts.cloud) if n.endswith("-boss.tar.gz")][-1]
    side = json.loads((two_hosts.cloud / "world-backups" /
                       f"{new_boss}{cloud.PARENT_SUFFIX}").read_text())
    assert only in side["modules"].values()
    with two_hosts.use("mac"):
        cloud._gc_after_backup(mac_st)                  # the mac process, its cache stale
    assert only in _bundle_names(two_hosts.cloud), (
        "GC marked from a cached world-backups/ listing and swept a referenced bundle")


def test_dl1_gc_sweep_spares_a_bundle_touched_after_the_cache_was_filled(two_hosts,
                                                                         monkeypatch):
    switch = _process(two_hosts, monkeypatch)
    only = _orphan_boss_only(two_hosts, switch)
    mac_st = switch()
    _cache_everything(mac_st)                           # bundles/ cached with the old mtime
    # boss's backup, in flight, reuses boss-only: _refresh_reused touched it; its sidecar
    # has not landed yet, so no mark can see it — only the sweep's fresh mtime can.
    os.utime(two_hosts.cloud / "bundles" / only, None)
    with two_hosts.use("mac"):
        cloud._gc_after_backup(mac_st)
    assert only in _bundle_names(two_hosts.cloud), (
        "the sweep read a cached bundles/ listing and deleted a bundle touched since")


def test_dl1_a_restores_plan_sees_a_bundle_swept_after_the_prompt_listed_bundles(
        two_hosts, monkeypatch):
    switch = _process(two_hosts, monkeypatch)
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [s1] = _names(two_hosts.cloud)
    [tools] = [n for n in _bundle_names(two_hosts.cloud) if n.startswith("module@tools@")]
    boss_st = switch()
    with two_hosts.use("boss"):
        snap = cloud.find_snapshot(boss_st, s1)
        cost = cloud.restore_cost(boss_st, snap)        # the boot prompt lists bundles/
        assert cost is not None and cost.n_bundles == 2
        (two_hosts.cloud / "bundles" / tools).unlink()  # the other host's GC, meanwhile
        boss_st.runner.calls.clear()
        with pytest.raises(cloud.RestoreError, match="missing from the cloud") as err:
            cloud.fetch_snapshot(boss_st, snap)
    assert tools in str(err.value) and "nothing local was touched" in str(err.value)
    copied = [a for a in boss_st.runner.calls if a[1] == "copyto"]
    assert copied == [], f"downloaded before the plan refused: {copied}"


def test_dl1_a_boot_backup_after_the_prompt_sees_a_bundle_swept_meanwhile(two_hosts,
                                                                          monkeypatch, capsys):
    switch = _process(two_hosts, monkeypatch)
    mac = _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [s1] = _names(two_hosts.cloud)
    [tools] = [n for n in _bundle_names(two_hosts.cloud) if n.startswith("module@tools@")]
    st = switch()                                       # the boot process
    with two_hosts.use("mac"):
        cloud.restore_cost(st, cloud.find_snapshot(st, s1))   # the prompt lists bundles/
        (two_hosts.cloud / "bundles" / tools).unlink()  # swept meanwhile (by hand, or GC)
        _edit(mac, "a session")
        capsys.readouterr()
        assert cloud.backup("pre-launch", if_stopped=True) == 0
    out = capsys.readouterr().out
    # The first listing must see it gone: staged and uploaded as new, not reused and then
    # caught by the verify.
    assert "with 1 new bundle(s)" in out, out
    assert "vanished from the cloud during this backup" not in out, out
    assert tools in _bundle_names(two_hosts.cloud)


def test_dl1_a_boot_backup_sees_its_based_on_deleted_after_the_boot_choice_listed_it(
        two_hosts, monkeypatch, capsys):
    switch = _process(two_hosts, monkeypatch)
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [s1] = _names(two_hosts.cloud)
    st = switch()                                       # the boot process
    with two_hosts.use("mac"):
        cloud.snapshots(st, cloud.WORLD_BACKUPS)        # the boot choice lists world-backups/
        (two_hosts.cloud / "world-backups" / s1).unlink()   # pruned on the other host
        (two_hosts.cloud / "world-backups" / f"{s1}{cloud.PARENT_SUFFIX}").unlink()
        capsys.readouterr()
        assert cloud.backup("pre-launch", if_stopped=True) == 0   # the tree is unchanged
    out = capsys.readouterr().out
    assert "no longer in the cloud — uploading this state again" in out, out
    assert len(_names(two_hosts.cloud)) == 1, "this tree has no cloud copy"


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


def _tree(root, *rels):
    """{relpath: bytes} of every file under root/<rel> for each rel."""
    out = {}
    for rel in rels:
        for p in sorted((root / rel).rglob("*")):
            if p.is_file():
                out[p.relative_to(root).as_posix()] = p.read_bytes()
    return out


def _damage_past_first_member(p):
    """Overwrite one 4 KiB block (a bad sync) at the first offset where the first member
    still reads but extracting the whole tar — what apply_snapshot's extractall does —
    hits a deflate error. Searched, not hard-coded: zlib builds compress differently. A
    flipped byte alone usually decodes to wrong literals, and tarfile neither checks the
    CRC nor fails on a later bad header, so the search wants a real inflate error."""
    import io
    import tarfile
    import zlib
    raw = p.read_bytes()
    for pct in range(10, 90):
        d = bytearray(raw)
        i = len(d) * pct // 100
        d[i:i + 4096] = b"\xff" * 4096
        with tarfile.open(fileobj=io.BytesIO(bytes(d)), mode="r:gz") as tar:
            try:
                tar.extractfile(tar.next()).read()     # the marker check's read
            except (zlib.error, tarfile.TarError, EOFError):
                continue                               # too early: the first member broke
            try:
                for m in tar:
                    fh = tar.extractfile(m)
                    if fh:
                        fh.read()
            except zlib.error:
                p.write_bytes(bytes(d))
                return
            except (tarfile.TarError, EOFError):
                continue
    raise AssertionError("no offset breaks the stream past the first member")


def test_a_full_snapshot_damaged_past_its_first_member_is_refused_before_the_clear(
        two_hosts, capsys):
    """R2's world half: a FULL (legacy) tar whose first member reads cleanly — the marker
    check reads only that one — but whose deflate stream is damaged further in, at the
    same size. apply_snapshot would rmtree Data/worlds, Config and Data/modules and then
    fail inside extractall; fetch_snapshot must read the whole stream first."""
    import random
    rng = random.Random(7)
    words = [b"seafoot", b"harbour", b"tide", b"lantern", b"kelp", b"wreck", b"gull"]
    art = b" ".join(rng.choice(words) + str(rng.randrange(10**6)).encode()
                    for _ in range(60000))              # compressible: dynamic blocks
    stamp = time.strftime("%Y-%m-%d-%H%M%S", time.gmtime(time.time() - 2 * DAY))
    name = f"world-{stamp}-fvtt14.369.tar.gz"
    p = _gz_tar(two_hosts.cloud / "world-backups" / name, {
        "Data/worlds/w/world.json": b'{"id": "w"}\n',
        "Data/modules/old-maps/module.json": b'{"id": "old-maps", "version": "1"}',
        "Data/modules/old-maps/art.txt": art,
        "Config/options.json": b'{"dataPath": "/elsewhere"}\n',
    })
    _damage_past_first_member(p)
    os.utime(p, (time.time() - 2 * DAY,) * 2)
    from scripts.foundry import bundles
    assert cloud._read_marker(p) == (False, None)       # the first member reads cleanly
    with pytest.raises(ValueError, match="damaged"):
        bundles.read_all(p)

    boss = _install(two_hosts.data["boss"])
    _edit(boss, "boss's own session")
    before = _tree(boss, "Data/worlds", "Data/modules", "Config")
    capsys.readouterr()
    with two_hosts.use("boss"), pytest.raises(SystemExit):
        cloud.restore(name, yes=True)
    err = capsys.readouterr().err
    assert "nothing local was touched" in err, err
    assert "failed part-way" not in err, err
    assert _tree(boss, "Data/worlds", "Data/modules", "Config") == before


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


def test_perf1_rebuilding_one_bundle_hashes_only_that_folder(two_hosts, tmp_path,
                                                             monkeypatch):
    from scripts.foundry import bundles
    loc, tar = _staged(two_hosts, tmp_path)
    tar.unlink()
    walked: list = []
    real = bundles._walk
    monkeypatch.setattr(bundles, "_walk", lambda root: (walked.append(Path(root)),
                                                        real(root))[1])
    rebuilt: list = []
    with two_hosts.use("mac"):
        assert cloud._rebuilder(rebuilt)(loc.name) == rebuilt[0]
    assert walked and set(walked) == {Path(loc.path)}, walked    # never module/maps


def test_m4_rebuilder_rebuilt_is_optional_and_tars_land_in_the_job_staging(two_hosts,
                                                                           tmp_path):
    """M4: every caller passed a throwaway `[]` for `rebuilt`, and its docstring said the
    caller deletes those tars — it never does: they land in `dest_dir` (the job's staging
    folder) and go with job.drop(). `rebuilt` is optional, collected only when given."""
    from scripts.foundry import bundles
    loc, tar = _staged(two_hosts, tmp_path)
    tar.unlink()
    dest = tmp_path / "job-staging"
    dest.mkdir()
    with two_hosts.use("mac"):
        src = cloud._rebuilder(dest_dir=dest)(loc.name)
    assert src is not None and src.parent == dest and src.is_file()
    doc = cloud._rebuilder.__doc__ or ""
    assert "for the caller to" not in " ".join(doc.split())
    assert "drop()" in doc


def test_a_staged_tar_built_days_ago_lands_with_a_fresh_cloud_mtime(two_hosts, tmp_path):
    from scripts.foundry import bundles
    loc, tar = _staged(two_hosts, tmp_path)
    t = time.time() - 9 * DAY
    os.utime(tar, (t, t))                       # a queued job that waited nine days
    with two_hosts.use("mac"):
        bundles.upload_missing(cloud.store(), {loc.name: tar}, {})
    landed = two_hosts.cloud / "bundles" / loc.name
    assert time.time() - landed.stat().st_mtime < 3600


def test_a_bundle_that_vanishes_before_the_sidecar_is_back_before_the_sidecar(two_hosts,
                                                                              monkeypatch):
    c = two_hosts.cloud
    mac = _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [maps] = [n for n in _bundle_names(c) if n.startswith("module@maps@")]
    _edit(mac, "a session")
    order: list[str] = []
    real_up, real_write = storage.FolderStorage.upload, storage.FolderStorage.write_text
    monkeypatch.setattr(storage.FolderStorage, "upload",
                        lambda self, src, rel: (order.append(rel), real_up(self, src, rel))[1])
    monkeypatch.setattr(storage.FolderStorage, "write_text",
                        lambda self, rel, text: (order.append(rel),
                                                 real_write(self, rel, text))[1])
    monkeypatch.setattr(cloud, "_refresh_reused",
                        lambda *a, **k: (c / "bundles" / maps).unlink())   # GC, right then
    with two_hosts.use("mac"):
        assert cloud.backup("shutdown") == 0
    side = next(i for i, r in enumerate(order) if r.endswith(cloud.PARENT_SUFFIX))
    assert order.index(f"bundles/{maps}") < side
    assert maps in _bundle_names(c)


# ── PL1: a backup removes the staged tars an earlier failed one left ─────────

def test_pl1_the_staging_sweep_removes_only_tars_this_run_will_not_stage(two_hosts, capsys):
    from scripts.foundry import bundles
    mac = _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        inv = bundles.local_inventory()
        staging = mac / cloud.TMP_DIRNAME / bundles.STAGING
        keep = bundles.build(inv["module/maps"], staging).name      # the cloud lacks it
        landed = bundles.build(inv["module/tools"], staging).name   # the cloud has it
        stale = bundles.bundle_name("module", "tools", "1.0", "0" * 16)
        (staging / stale).write_bytes(b"an older tools")            # the folder changed since
        (staging / f"{keep}.building").write_bytes(b"a build in progress")
        (staging / "notes.txt").write_text("not a bundle\n")
        (staging / "job-1").mkdir()
        (staging / "job-1" / landed).write_bytes(b"a queued job's own staging")
        capsys.readouterr()
        cloud._sweep_staging(bundles.manifest(inv),
                             {landed: storage.Entry(landed, 1, time.time())})
    left = sorted(p.relative_to(staging).as_posix() for p in staging.rglob("*") if p.is_file())
    assert left == sorted([keep, f"{keep}.building", "notes.txt", f"job-1/{landed}"])
    assert "removed 2 bundle tar(s)" in capsys.readouterr().out


def test_pl1_a_rerun_after_the_folder_changed_leaves_no_staged_tar(two_hosts, monkeypatch):
    from scripts.foundry import bundles
    mac = _install(two_hosts.data["mac"])
    real = storage.FolderStorage.upload
    fail = [True]

    def flaky(self, src, rel):
        if fail[0]:
            fail[0] = False
            raise storage.StorageError("upload failed: connection reset", verb="copyto")
        return real(self, src, rel)
    monkeypatch.setattr(storage.FolderStorage, "upload", flaky)
    with two_hosts.use("mac"), pytest.raises(SystemExit):
        cloud.backup("shutdown")                   # nothing landed; both bundles staged
    staging = mac / cloud.TMP_DIRNAME / bundles.STAGING
    # since the upload queue: staged in the job's own folder, the job still queued
    assert any(p.name.startswith("module@tools@") for p in staging.rglob("*"))
    (mac / "Data/modules/tools/scripts/main.js").write_text("// changed since\n")
    with two_hosts.use("mac"):
        assert cloud.backup("shutdown") == 0       # the queued job first, then this tree
    assert list(staging.iterdir()) == []


# ── DL7: an upload's size check never deletes a same-name bundle ─────────────

@pytest.mark.parametrize("sub", ["bundles", "world-backups"])
def test_dl7_rclone_size_check_keeps_another_writers_bundle_and_deletes_elsewhere(tmp_path,
                                                                                  sub):
    from cloud_fakes import FakeRclone
    fake = FakeRclone(tmp_path)
    rc = storage.RcloneStorage("fake:root", bin="rclone", runner=fake, interactive=False)
    src = tmp_path / "x.tar.gz"
    src.write_bytes(b"our archive " * 50)
    there = tmp_path / "root" / sub / "x.tar.gz"

    def racing(argv, **kw):
        out = fake(argv, **kw)
        if argv[1] == "moveto":                   # the other host's moveto, right after ours
            there.write_bytes(b"their archive of the same files " * 3)
        return out
    rc.runner = racing
    with pytest.raises(storage.StorageError) as err:
        rc.upload(src, f"{sub}/x.tar.gz")
    if sub == "bundles":
        assert isinstance(err.value, storage.Superseded)
        assert there.read_bytes() == b"their archive of the same files " * 3
    else:                                         # a unique name: a mismatch is ours, deleted
        assert not isinstance(err.value, storage.Superseded)
        assert "did not verify" in str(err.value) and not there.exists()


@pytest.mark.parametrize("sub", ["bundles", "world-backups"])
def test_dl7_folder_size_check_keeps_another_writers_bundle_and_deletes_elsewhere(
        tmp_path, monkeypatch, sub):
    fs = storage.FolderStorage(tmp_path / "root")
    src = tmp_path / "x.tar.gz"
    src.write_bytes(b"our archive " * 50)
    there = tmp_path / "root" / sub / "x.tar.gz"
    real = os.replace

    def racing(a, b):
        real(a, b)
        if os.fspath(b) == os.fspath(there):      # the sync client lands the other host's
            there.write_bytes(b"their archive of the same files " * 3)
    monkeypatch.setattr(storage.os, "replace", racing)
    with pytest.raises(storage.StorageError) as err:
        fs.upload(src, f"{sub}/x.tar.gz")
    monkeypatch.setattr(storage.os, "replace", real)
    assert isinstance(err.value, storage.Superseded) == (sub == "bundles")
    assert there.exists() == (sub == "bundles")


def test_dl7_a_backup_that_loses_the_same_name_race_succeeds_and_both_snapshots_hold(
        two_hosts, monkeypatch, capsys):
    from cloud_fakes import FakeRclone
    from scripts.foundry import bundles
    c = two_hosts.cloud
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        maps = bundles.local_inventory()["module/maps"].name
    boss_snap = f"world-{time.strftime('%Y-%m-%d-%H%M%S', time.gmtime())}-fvtt14.369-boss.tar.gz"
    (c / "world-backups" / boss_snap).write_bytes(b"x" * 64)
    (c / "world-backups" / f"{boss_snap}{cloud.PARENT_SUFFIX}").write_text(json.dumps(
        {"parent": None, "ancestors": [], "host": "boss", "bundled": 1,
         "modules": {"maps": maps}, "systems": {}}))
    fake = FakeRclone(c.parent)
    rc = storage.RcloneStorage(f"fake:{c.name}", bin="rclone", runner=fake, interactive=False)
    monkeypatch.setattr(storage, "get", lambda: rc)

    def racing(argv, **kw):
        out = fake(argv, **kw)
        if argv[1] == "moveto" and FakeRclone._positional(argv[2:])[1].endswith(f"/{maps}"):
            (c / "bundles" / maps).write_bytes(b"boss's archive of the same files " * 97)
        return out
    rc.runner = racing
    capsys.readouterr()
    with two_hosts.use("mac"):
        assert cloud.backup("shutdown") == 0
    out = capsys.readouterr().out
    assert f"bundle {maps}: the other machine's upload" in out, out
    [mine] = [n for n in _names(c) if n.endswith("-mac.tar.gz")]
    side = json.loads((c / "world-backups" / f"{mine}{cloud.PARENT_SUFFIX}").read_text())
    assert side["modules"]["maps"] == maps
    assert (c / "bundles" / maps).read_bytes() == b"boss's archive of the same files " * 97


def test_dl7_upload_one_accepts_superseded_and_raises_anything_else(two_hosts, tmp_path,
                                                                   monkeypatch):
    from scripts.foundry import bundles
    src = tmp_path / "b.tar.gz"
    src.write_bytes(b"x")
    calls = []

    def superseded(self, s, rel):
        calls.append(rel)
        raise storage.Superseded("theirs landed", verb="moveto")
    monkeypatch.setattr(storage.FolderStorage, "upload", superseded)
    bundles.upload_one(cloud.store(), src, "module@m@1@0123456789abcdef.tar.gz")
    assert calls == ["bundles/module@m@1@0123456789abcdef.tar.gz"]

    def broken(self, s, rel):
        raise storage.StorageError("connection reset", verb="copyto")
    monkeypatch.setattr(storage.FolderStorage, "upload", broken)
    with pytest.raises(storage.StorageError, match="connection reset"):
        bundles.upload_one(cloud.store(), src, "module@m@1@0123456789abcdef.tar.gz")


# ── DL8: a full restore keeps what no bundle holds ───────────────────────────

def _full_tar(path, files: dict[str, bytes], *, age_days: float = 0):
    """A legacy (full, untagged) snapshot: no marker, worlds + Config + modules."""
    import io
    import tarfile
    with tarfile.open(path, "w:gz") as tar:
        for name, data in sorted(files.items()):
            info = tarfile.TarInfo(name)
            info.size, info.mtime = len(data), int(time.time())
            tar.addfile(info, io.BytesIO(data))
    if age_days:
        t = time.time() - age_days * DAY
        os.utime(path, (t, t))
    return path


_LEGACY_NAME = "world-2026-10-01-120000-fvtt14.369.tar.gz"
_LEGACY_WORLD = {"Data/worlds/w/world.json": b'{"id": "w"}\n', "Config/options.json": b"{}\n"}


def _dev_checkout(tmp_path):
    outside = tmp_path / "dev-checkout"
    outside.mkdir()
    (outside / "module.json").write_text('{"id": "dev", "version": "0.1"}')
    return outside


def test_dl8_a_full_restore_keeps_every_shape_the_inventory_skips_in_place(two_hosts,
                                                                          tmp_path):
    from scripts.foundry import bundles
    c = two_hosts.cloud
    _full_tar(c / "world-backups" / _LEGACY_NAME, {
        **_LEGACY_WORLD,
        "Data/modules/old-maps/module.json": b'{"id": "old-maps", "version": "1"}',
        "Data/modules/old-maps/art.webp": b"old art"}, age_days=10)
    mac = _install(two_hosts.data["mac"])
    mods = mac / "Data/modules"
    (mods / "scratch").mkdir()                                  # no module.json
    (mods / "scratch/ideas.md").write_text("only copy\n")
    (mods / ".hidden").mkdir()
    (mods / ".hidden/x.txt").write_text("hidden\n")
    (mods / "a@b").mkdir()                                      # refused name
    (mods / "a@b/module.json").write_text('{"id": "a@b"}')
    outside = _dev_checkout(tmp_path)
    (mods / "dev").symlink_to(outside, target_is_directory=True)
    (mods / "notes.txt").write_text("loose\n")
    with two_hosts.use("mac"):
        assert {p.name for p in bundles.unbundled("module", mac)} == {
            "scratch", ".hidden", "a@b", "dev", "notes.txt"}
    _edit(mac, "local work")
    with two_hosts.use("mac"):
        cloud.restore(_LEGACY_NAME, yes=True)
    assert (mods / "scratch/ideas.md").read_text() == "only copy\n"
    assert (mods / ".hidden/x.txt").read_text() == "hidden\n"
    assert (mods / "a@b/module.json").is_file()
    assert (mods / "dev").is_symlink() and (outside / "module.json").is_file()
    assert (mods / "notes.txt").read_text() == "loose\n"
    assert (mods / "old-maps/art.webp").read_bytes() == b"old art"     # the snapshot's
    assert not (mods / "maps").exists() and not (mods / "tools").exists()
    assert any(n.startswith("module@maps@") for n in _bundle_names(c))  # the safety copy's
    assert not (mac / cloud.REPLACED_DIRNAME).exists()


def test_dl8_a_full_restore_moves_aside_what_the_snapshot_brings_under_the_same_name(
        two_hosts, tmp_path, capsys):
    c = two_hosts.cloud
    _full_tar(c / "world-backups" / _LEGACY_NAME, {
        **_LEGACY_WORLD,
        "Data/modules/scratch/module.json": b'{"id": "scratch", "version": "1"}',
        "Data/modules/scratch/new.js": b"// the snapshot's\n",
        "Data/modules/dev/module.json": b'{"id": "dev", "version": "0.0"}'}, age_days=10)
    mac = _install(two_hosts.data["mac"])
    mods = mac / "Data/modules"
    (mods / "scratch").mkdir()
    (mods / "scratch/ideas.md").write_text("only copy\n")
    outside = _dev_checkout(tmp_path)
    (mods / "dev").symlink_to(outside, target_is_directory=True)
    _edit(mac, "local work")
    capsys.readouterr()
    with two_hosts.use("mac"):
        cloud.restore(_LEGACY_NAME, yes=True)
    out = capsys.readouterr().out
    assert (mods / "scratch/new.js").is_file() and not (mods / "scratch/ideas.md").exists()
    [kept] = list((mac / cloud.REPLACED_DIRNAME).glob("*/Data/modules/scratch/ideas.md"))
    assert kept.read_text() == "only copy\n"
    assert not (mods / "dev").is_symlink()                      # the snapshot's real folder
    assert json.loads((mods / "dev/module.json").read_text())["version"] == "0.0"
    [link] = list((mac / cloud.REPLACED_DIRNAME).glob("*/Data/modules/dev"))
    assert link.is_symlink() and link.resolve() == outside.resolve()
    assert json.loads((outside / "module.json").read_text())["version"] == "0.1"
    assert "the snapshot brings the same name" in out, out


def test_dl8_the_updaters_full_extract_keeps_what_no_bundle_holds(two_hosts, tmp_path):
    mac = _install(two_hosts.data["mac"])
    (mac / "Data/modules/scratch").mkdir()
    (mac / "Data/modules/scratch/ideas.md").write_text("only copy\n")
    tar = _full_tar(tmp_path / "w.tar.gz", {
        **_LEGACY_WORLD, "Data/modules/old/module.json": b'{"id": "old", "version": "1"}'})
    with two_hosts.use("mac"):
        cloud.extract_snapshot(tar, systems=False)
    assert (mac / "Data/modules/scratch/ideas.md").read_text() == "only copy\n"
    assert (mac / "Data/modules/old/module.json").is_file()
    assert not (mac / "Data/modules/maps").exists()


# ── R2 (final review 2026-10-12): a local tar is read whole before anything is cleared ─

def _files(root):
    return {p.relative_to(root).as_posix(): p.read_bytes()
            for p in sorted(root.rglob("*")) if p.is_file()}


@pytest.mark.parametrize("damage", ["truncated", "not-gzip"])
def test_r2_extract_snapshot_refuses_an_unreadable_local_tar_before_clearing(
        two_hosts, tmp_path, damage):
    mac = _install(two_hosts.data["mac"])
    _edit(mac, "the only copy of tonight's session")
    (mac / "Config").mkdir(exist_ok=True)
    (mac / "Config/options.json").write_text('{"dataPath": "here"}')
    tar = tmp_path / "w.tar.gz"
    if damage == "truncated":
        # The first member (Config/options.json) reads fine; the cut is deep in the stream.
        _full_tar(tar, {**_LEGACY_WORLD, "Data/worlds/w/zz-big.bin": os.urandom(200_000)})
        data = tar.read_bytes()
        tar.write_bytes(data[:len(data) * 2 // 3])
    else:
        tar.write_bytes(b"this is not a gzip file at all\n" * 40)
    before = _files(mac)
    with two_hosts.use("mac"), pytest.raises(cloud.RestoreError) as exc:
        cloud.extract_snapshot(tar, systems=False)
    assert "nothing was touched" in str(exc.value) and tar.name in str(exc.value)
    assert _files(mac) == before


# ── R4: healing re-uploads only what the based-on snapshot names ─────────────

def _reads(monkeypatch):
    seen: list[str] = []
    real_text, real_head = storage.FolderStorage.read_text, storage.FolderStorage.read_head

    def text(self, rel):
        seen.append(rel)
        return real_text(self, rel)

    def head(self, rel, n):
        seen.append(f"head:{rel}")
        return real_head(self, rel, n)
    monkeypatch.setattr(storage.FolderStorage, "read_text", text)
    monkeypatch.setattr(storage.FolderStorage, "read_head", head)
    return seen


def test_r4_a_routine_skip_reads_no_sidecar(two_hosts, monkeypatch, capsys):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    seen = _reads(monkeypatch)
    capsys.readouterr()
    with two_hosts.use("mac"):
        cloud.backup("pre-launch", if_stopped=True)
    assert "skipped" in capsys.readouterr().out
    assert [r for r in seen if r.endswith(cloud.PARENT_SUFFIX) or r.startswith("head:")] == []


def test_r4_healing_reads_a_lost_sidecars_names_from_the_tar_marker(two_hosts, capsys):
    c = two_hosts.cloud
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [snap] = _names(c)
    [maps] = [n for n in _bundle_names(c) if n.startswith("module@maps@")]
    (c / "world-backups" / f"{snap}{cloud.PARENT_SUFFIX}").unlink()     # the sidecar lost
    (c / "bundles" / maps).unlink()                                     # and a bundle
    capsys.readouterr()
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    out = capsys.readouterr().out
    assert "uploaded 1 bundle(s) the cloud had lost" in out and "skipped" in out, out
    assert maps in _bundle_names(c)


def test_r4_a_tagged_full_era_based_on_heals_nothing(two_hosts, monkeypatch, capsys):
    """The full -mac snapshot of 2026-10-11 has a lineage-only sidecar (no "bundled")."""
    c = two_hosts.cloud
    name = f"world-{time.strftime('%Y-%m-%d-%H%M%S', time.gmtime(time.time() - 2 * DAY))}" \
           "-fvtt14.369-mac.tar.gz"
    _full_tar(c / "world-backups" / name, {
        **_LEGACY_WORLD,
        "Data/modules/old-maps/module.json": b'{"id": "old-maps", "version": "1"}',
        "Data/modules/old-maps/art.webp": b"old art " * 64}, age_days=2)
    (c / "world-backups" / f"{name}{cloud.PARENT_SUFFIX}").write_text(json.dumps(
        {"parent": None, "ancestors": [], "ancestor_mtimes": [], "origin_before": None,
         "host": "mac"}) + "\n")
    with two_hosts.use("mac"):
        cloud.restore(name, yes=True)
    real = storage.FolderStorage.upload
    sent: list[str] = []
    monkeypatch.setattr(storage.FolderStorage, "upload",
                        lambda self, src, rel: (sent.append(rel), real(self, src, rel))[1])
    capsys.readouterr()
    with two_hosts.use("mac"):
        cloud.backup("pre-launch", if_stopped=True)
    out = capsys.readouterr().out
    assert "skipped" in out and "had lost" not in out, out
    assert sent == []


def test_r4_a_heal_that_cannot_read_the_based_on_dies_naming_it(two_hosts, monkeypatch,
                                                                capsys):
    c = two_hosts.cloud
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [snap] = _names(c)
    [maps] = [n for n in _bundle_names(c) if n.startswith("module@maps@")]
    (c / "bundles" / maps).unlink()
    real = storage.FolderStorage.read_text

    def flaky(self, rel):
        if rel.endswith(cloud.PARENT_SUFFIX):
            raise storage.StorageError("cat: connection reset", verb="cat")
        return real(self, rel)
    monkeypatch.setattr(storage.FolderStorage, "read_text", flaky)
    capsys.readouterr()
    with two_hosts.use("mac"), pytest.raises(SystemExit):
        cloud.backup("shutdown")
    err = capsys.readouterr().err
    assert f"cannot read which bundles {snap} names" in err, err
    assert maps not in _bundle_names(c)


# ── R5: the prompt says when the offer needs a bundle the cloud lacks ────────

def _mac_snapshot_missing_maps(two_hosts):
    c = two_hosts.cloud
    _install(two_hosts.data["mac"])
    _edit(two_hosts.data["mac"], "mac session")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [snap] = _names(c)
    [maps] = [n for n in _bundle_names(c) if n.startswith("module@maps@")]
    [tools] = [n for n in _bundle_names(c) if n.startswith("module@tools@")]
    (c / "bundles" / maps).unlink()                     # hand-deleted, or swept
    return snap, tools


def test_r5_restore_cost_names_the_needed_bundles_the_cloud_lacks(two_hosts):
    snap, tools = _mac_snapshot_missing_maps(two_hosts)
    st = cloud.store()
    with two_hosts.use("boss"):                         # boss has `m`, lacks maps and tools
        cost = cloud.restore_cost(st, cloud.find_snapshot(st, snap))
    assert cost.missing == ("module/maps",)
    assert tuple(cost)[1:] == (2, (two_hosts.cloud / "bundles" / tools).stat().st_size)


def test_r5_enter_keeps_local_when_the_offer_would_refuse(two_hosts, tty, capsys):
    from scripts.foundry import boot, bootstate

    def tree(root):                                     # the answer itself is recorded
        return sorted(p.relative_to(root).as_posix() for p in root.rglob("*")
                      if cloud.TMP_DIRNAME not in p.parts and p.name != bootstate.FILENAME)
    snap, _tools = _mac_snapshot_missing_maps(two_hosts)
    boss = two_hosts.data["boss"]
    before = tree(boss)
    asked = tty(True, [""])                             # Enter
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    out = capsys.readouterr().out
    lines = [ln.strip() for ln in out.splitlines()]
    plus = next(i for i, ln in enumerate(lines) if ln.startswith("+ "))
    assert lines[plus + 1] == ("! 1 of them is missing from the cloud (module maps) — a restore "
                               "would refuse; Enter keeps local"), out
    assert "Enter = local" in asked[0]
    assert "boot: local world (the offered snapshot needs a bundle" in out, out
    assert "restoring" not in out
    assert tree(boss) == before
    # Enter here is not a decline: with the bundle back, the same snapshot is offered again
    with two_hosts.use("boss"):
        state = bootstate.load()
    assert state.keep_local_until_newer_than is None
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                        # unchanged tree: heals maps, skips
    tty(True, ["k"])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    out = capsys.readouterr().out
    assert f"cloud    {snap}" in out and "missing from the cloud" not in out, out
