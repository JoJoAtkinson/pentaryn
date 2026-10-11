"""Adversarial review of feature/module-bundles — the data-loss lens.

Each test proves one finding (DL1…DL8) of the review: a way to leave a retained snapshot
unrestorable or to lose local data. They are `xfail(strict=True)` until the finding is
fixed — a fix flips the test to XPASS, which fails the suite until the marker is removed.

Nothing here touches the network, rclone, OneDrive or Foundry: the cloud is the fake
folder (conftest.two_hosts) or FakeRclone over it.
"""

from __future__ import annotations

import json
import os
import shutil
import tarfile
import time

import pytest

from bundle_fakes import make_module
from cloud_fakes import FakeRclone
from scripts.foundry import bootstate, bundles, cloud, storage
from scripts.foundry.storage import RcloneStorage

DAY = 86400


# ── helpers (local copies, so this file stands alone) ─────────────────────────

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


def _worlds(c, sub="world-backups"):
    return sorted(p.name for p in (c / sub).iterdir() if p.name.endswith(".tar.gz"))


def _newest(c, suffix):
    return [n for n in _worlds(c) if n.endswith(suffix)][-1]


def _bundle_names(c):
    return sorted(p.name for p in (c / "bundles").iterdir())


def _sidecar(c, name, sub="world-backups"):
    return json.loads((c / sub / f"{name}{cloud.PARENT_SUFFIX}").read_text())


def _age(p, days):
    t = time.time() - days * DAY
    os.utime(p, (t, t))


def _rclone(two_hosts, monkeypatch) -> tuple[FakeRclone, RcloneStorage]:
    """A fresh RcloneStorage (= a fresh process: an empty listing cache) over the fake cloud."""
    fake = FakeRclone(two_hosts.cloud.parent)
    rc = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    monkeypatch.setattr(storage, "get", lambda: rc)
    return fake, rc


def _retained_refs_exist(c) -> list[str]:
    """Every bundle a retained tagged snapshot's sidecar names that is NOT in bundles/."""
    have = set(_bundle_names(c))
    lost = []
    for sub in ("world-backups", "major-release"):
        for p in sorted((c / sub).glob(f"*{cloud.PARENT_SUFFIX}")):
            if not (c / sub / p.name[:-len(cloud.PARENT_SUFFIX)]).exists():
                continue                                    # an orphan sidecar
            m = cloud._parse_manifest(json.loads(p.read_text()))
            if m is not None:
                lost += sorted(n for n in bundles.manifest_names(m) if n not in have)
    return lost


# ── DL1: the post-upload verify is a no-op over rclone ───────────────────────

@pytest.mark.xfail(strict=True, reason="DL1: RcloneStorage caches each folder's lsjson for the "
                   "process; _verify_bundles re-reads bundles/ from that cache, so a bundle the "
                   "other host's GC swept after the backup's first listing is never noticed")
def test_dl1_verify_sees_a_bundle_swept_mid_backup_over_rclone(two_hosts, monkeypatch):
    c = two_hosts.cloud
    mac = _install(two_hosts.data["mac"])
    _rclone(two_hosts, monkeypatch)
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                        # every bundle up once
    [maps] = [n for n in _bundle_names(c) if n.startswith("module@maps@")]
    _edit(mac, "a session")

    # The next backup is a new process (a fresh cache). It reuses every bundle; while its
    # sidecar goes up, the other host's GC sweeps `maps` (§1 #8 (b), §6 row 4).
    fake, rc = _rclone(two_hosts, monkeypatch)

    def racing(argv, **kw):
        if argv[1] == "rcat" and FakeRclone._positional(argv[2:])[0].endswith(
                cloud.PARENT_SUFFIX):
            (c / "bundles" / maps).unlink(missing_ok=True)
        return fake(argv, **kw)
    rc.runner = racing
    with two_hosts.use("mac"):
        assert cloud.backup("shutdown") == 0
        new = bootstate.load().based_on
    assert maps in bundles.manifest_names(_sidecar(c, new))
    # The verify must have re-listed bundles/ and put `maps` back — over FolderStorage it
    # does (test_verify_rebuilds_a_vanished_bundle_from_the_live_folder); over rclone not.
    assert maps in _bundle_names(c), "the new snapshot names a bundle that is gone"


# ── DL2: mark → sweep is not atomic across hosts ─────────────────────────────

@pytest.mark.xfail(strict=True, reason="DL2: GC marks from a world-backups listing taken before "
                   "the other host's snapshot landed and sweeps after that host's verify passed; "
                   "a reused bundle older than the grace is deleted under a retained snapshot")
def test_dl2_gc_on_one_host_never_sweeps_a_bundle_the_other_hosts_new_snapshot_reuses(
        two_hosts, monkeypatch):
    c = two_hosts.cloud
    boss = _install(two_hosts.data["boss"])
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    with two_hosts.use("boss"):
        cloud.backup("shutdown")
    # boss's snapshot that named boss-only is gone (coalesced/pruned long ago); its bundle is
    # still in the cloud, old and unreferenced — the next GC on either host sweeps it.
    [sb] = _worlds(c)
    (c / "world-backups" / sb).unlink()
    (c / "world-backups" / f"{sb}{cloud.PARENT_SUFFIX}").unlink()
    [only] = [n for n in _bundle_names(c) if n.startswith("module@boss-only@")]
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                        # the mac's own snapshot (no boss-only)
    for p in (c / "bundles").iterdir():
        _age(p, 30)
    _edit(boss, "boss comes back and backs up")

    real = cloud._read_sidecar
    raced = []

    def mark_while_boss_backs_up(st, snap):
        if not raced:                                   # once, during the mac's mark phase
            raced.append(1)
            with two_hosts.use("boss"):
                cloud.backup("shutdown")                # lists boss-only → reuses it; verify ok
        return real(st, snap)
    monkeypatch.setattr(cloud, "_read_sidecar", mark_while_boss_backs_up)
    with two_hosts.use("mac"):
        cloud.bundles_gc_cmd(yes=True)                  # same as _gc_after_backup on the mac
    assert raced
    new_boss = _newest(c, "-boss.tar.gz")
    assert only in bundles.manifest_names(_sidecar(c, new_boss))
    assert _retained_refs_exist(c) == [], "a retained snapshot names a swept bundle"


# ── DL3/DL4: a manifest GC cannot see is treated as "references nothing" ──────

@pytest.mark.xfail(strict=True, reason="DL3: promote_major_release copies the tar, then the "
                   "sidecar under `except StorageError: pass`; a failed sidecar copy leaves the "
                   "never-pruned generation without a manifest, GC sweeps its bundles, and the "
                   "preserved snapshot no longer restores")
def test_dl3_a_failed_sidecar_copy_at_promotion_makes_the_preserved_generation_unrestorable(
        two_hosts, monkeypatch):
    c = two_hosts.cloud
    mac = _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [s14] = _worlds(c)
    two_hosts.set_core("mac", "15.300")
    real = storage.FolderStorage.write_text

    def flaky(self, rel, text):
        if rel.startswith("major-release/"):
            raise storage.StorageError(f"rclone rcat {rel} failed (exit 1): connection reset",
                                       verb="rcat")
        return real(self, rel, text)
    monkeypatch.setattr(storage.FolderStorage, "write_text", flaky)
    (mac / "Data/modules/tools/scripts/main.js").write_text("// tools, updated on 15\n")
    _edit(mac, "first session on 15")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                        # promotes s14; coalesces it away
    monkeypatch.setattr(storage.FolderStorage, "write_text", real)
    assert (c / "major-release" / s14).exists() and s14 not in _worlds(c)
    for p in (c / "bundles").iterdir():
        _age(p, 8)
    _edit(mac, "a week later")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                        # GC after the upload
        st = cloud.store()
        snap = cloud.find_snapshot(st, s14)
        assert snap is not None and snap.folder == "major-release"
        f = cloud.fetch_snapshot(st, snap)              # RestoreError: tools@1.1 was swept
        cloud.discard_fetched(f)


@pytest.mark.xfail(strict=True, reason="DL4: _read_sidecar reads an empty or non-JSON sidecar as "
                   "'absent' and referenced_bundles skips it, so GC sweeps that snapshot's "
                   "bundles instead of aborting (§3.7: 'cannot tell' must never shrink the mark)")
def test_dl4_a_torn_sidecar_aborts_gc_instead_of_sweeping_its_bundles(two_hosts):
    c = two_hosts.cloud
    boss = _install(two_hosts.data["boss"])
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    with two_hosts.use("boss"):
        cloud.backup("shutdown")
    [sb] = _worlds(c)
    [only] = [n for n in _bundle_names(c) if n.startswith("module@boss-only@")]
    side = c / "world-backups" / f"{sb}{cloud.PARENT_SUFFIX}"
    side.write_text(side.read_text()[:40])              # torn: not JSON any more
    for p in (c / "bundles").iterdir():
        _age(p, 30)
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                        # GC after the upload
    assert only in _bundle_names(c), "boss's retained snapshot lost a bundle to GC"


# ── DL5: extras a no-world restore left are folded into the recorded digest ───

@pytest.mark.xfail(strict=True, reason="DL5: after a no-world restore leaves extras, the recorded "
                   "digest covers them but the based-on snapshot's manifest does not; the next "
                   "restore skips its safety copy (unchanged tree) and rmtree's them — no "
                   "retained snapshot references them, and the healed bundle is swept in 7 days")
def test_dl5_extras_left_by_a_no_world_restore_are_never_removed_without_a_cloud_reference(
        two_hosts):
    c = two_hosts.cloud
    mac = _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    s1 = _newest(c, "-mac.tar.gz")
    boss = two_hosts.data["boss"]
    shutil.rmtree(boss / "Data/worlds")                 # BOSS's first boot: no world yet
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    with two_hosts.use("boss"):
        cloud.restore(s1, yes=True)                     # boss-only left in place, listed
        cloud.backup("startup", if_stopped=True)        # vtt-up's pre-launch backup: skipped
    assert (boss / "Data/modules/boss-only/module.json").exists()
    _edit(mac, "the next session, on the mac")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                        # coalesces s1 (contained, < 5 days)
    s2 = _newest(c, "-mac.tar.gz")
    with two_hosts.use("boss"):
        cloud.restore(s2, yes=True)                     # "no safety copy needed"
        refs = cloud.referenced_bundles(cloud.store())
    kept = (boss / "Data/modules/boss-only/module.json").exists()
    covered = any(n.startswith("module@boss-only@") and n in _bundle_names(c) for n in refs)
    assert kept or covered, "boss-only was removed and no retained snapshot references it"


# ── DL6: a skipped local folder whose id the manifest names ──────────────────

def _mac_snapshot(two_hosts):
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    return _newest(two_hosts.cloud, "-mac.tar.gz")


@pytest.mark.xfail(strict=True, reason="DL6a: apply_snapshot's pre-check does not cover a "
                   "symlinked destination; bundles.extract raises only after Data/worlds and "
                   "Config were cleared and replaced — a part-way restore, state not recorded")
def test_dl6a_a_symlinked_dev_module_is_refused_before_the_world_is_touched(two_hosts, tmp_path):
    s1 = _mac_snapshot(two_hosts)
    boss = two_hosts.data["boss"]
    dev = make_module(tmp_path / "checkout", "tools", version="9.9-dev")
    (boss / "Data/modules/tools").symlink_to(dev, target_is_directory=True)
    _edit(boss, "boss's own session")
    with two_hosts.use("boss"):
        try:
            cloud.restore(s1, yes=True)
            finished = True
        except SystemExit:
            finished = False
    if not finished:   # a refusal is fine — but only one that touched nothing
        assert (boss / "Data/worlds/w/journal.txt").read_text() == "boss's own session"
    assert (dev / "module.json").exists()               # the checkout itself never touched


@pytest.mark.xfail(strict=True, reason="DL6b: a manifest-less folder is skipped by the inventory "
                   "(so no safety copy or bundle holds it) yet bundles.extract replaces it when the "
                   "manifest names that id — its files are gone with no copy anywhere")
def test_dl6b_a_manifest_less_folder_is_never_replaced_without_a_copy(two_hosts):
    s1 = _mac_snapshot(two_hosts)
    boss = two_hosts.data["boss"]
    (boss / "Data/modules/tools").mkdir(parents=True)
    (boss / "Data/modules/tools/notes.md").write_text("half-built module; not in git yet\n")
    _edit(boss, "boss's own session")
    with two_hosts.use("boss"):
        cloud.restore(s1, yes=True)
    if (boss / "Data/modules/tools/notes.md").exists():
        return
    held = []
    for p in (two_hosts.cloud / "bundles").iterdir():
        with tarfile.open(p) as tar:
            held += [n for n in tar.getnames() if n.endswith("tools/notes.md")]
    assert held, "notes.md was deleted by the restore and no cloud copy holds it"


# ── DL7: the upload size check deletes the other host's same-name bundle ──────

@pytest.mark.xfail(strict=True, reason="DL7: RcloneStorage.upload deletes `rel` when the listed "
                   "size differs from the local file; for a shared bundle name the other host's "
                   "equivalent archive (other zlib/mtimes, other size) is what it deletes — §6 "
                   "calls same-name races benign")
def test_dl7_a_same_name_upload_race_never_deletes_the_other_hosts_bundle(two_hosts,
                                                                       monkeypatch):
    c = two_hosts.cloud
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        maps = bundles.local_inventory()["module/maps"].name
    # boss installed the same module (same fingerprint) and its snapshot names it
    boss_snap = f"world-{time.strftime('%Y-%m-%d-%H%M%S', time.gmtime())}-fvtt14.369-boss.tar.gz"
    (c / "world-backups" / boss_snap).write_bytes(b"x" * 64)
    (c / "world-backups" / f"{boss_snap}{cloud.PARENT_SUFFIX}").write_text(json.dumps(
        {"parent": None, "ancestors": [], "host": "boss", "bundled": 1,
         "modules": {"maps": maps}, "systems": {}}))
    fake, rc = _rclone(two_hosts, monkeypatch)

    def racing(argv, **kw):
        out = fake(argv, **kw)
        pos = FakeRclone._positional(argv[2:])
        if argv[1] == "moveto" and pos[1].endswith(f"/bundles/{maps}"):
            # boss's moveto of its own archive of the same content lands right after ours
            (c / "bundles" / maps).write_bytes(b"boss's archive of the same files " * 97)
        return out
    rc.runner = racing
    with two_hosts.use("mac"):
        try:
            cloud.backup("shutdown")
        except SystemExit:
            pass                                        # the mac may fail; boss must not lose
    assert maps in _bundle_names(c), "the mac's size check deleted boss's bundle"


# ── DL8: a full restore wipes what the bundled safety copy cannot hold ────────

def _legacy_full_tar(path, src_root):
    with tarfile.open(path, "w:gz") as tar:
        for rel in ("Data/worlds", "Config", "Data/modules"):
            if (src_root / rel).exists():
                tar.add(src_root / rel, arcname=rel)


@pytest.mark.xfail(strict=True, reason="DL8: a full (legacy) restore rmtree's Data/modules; the "
                   "safety copy is now bundled, so a hidden/manifest-less/symlinked folder there "
                   "(which the old full safety copy held) is lost with no copy")
def test_dl8_a_full_restore_never_loses_a_folder_the_safety_copy_could_not_hold(two_hosts,
                                                                            tmp_path):
    c = two_hosts.cloud
    legacy_src = _install(tmp_path / "legacy")
    (legacy_src / "Data/worlds/w").mkdir(parents=True)
    (legacy_src / "Data/worlds/w/world.json").write_text('{"id": "w"}\n')
    legacy = "world-2026-10-01-120000-fvtt14.369.tar.gz"
    _legacy_full_tar(c / "world-backups" / legacy, legacy_src)
    _age(c / "world-backups" / legacy, 10)
    mac = _install(two_hosts.data["mac"])
    (mac / "Data/modules/scratch").mkdir()              # no module.json: never bundled
    (mac / "Data/modules/scratch/ideas.md").write_text("only copy\n")
    _edit(mac, "local work")
    with two_hosts.use("mac"):
        cloud.restore(legacy, yes=True)
    if (mac / "Data/modules/scratch/ideas.md").exists():
        return
    held = []
    for sub in ("world-backups", "bundles"):
        for p in (c / sub).glob("*.tar.gz"):
            with tarfile.open(p) as tar:
                held += [n for n in tar.getnames() if n.endswith("scratch/ideas.md")]
    assert held, "ideas.md was wiped by the full restore and no cloud copy holds it"
