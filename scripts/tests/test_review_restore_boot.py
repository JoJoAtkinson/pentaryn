"""Adversarial review of module bundles — restore and the boot choice (module-bundles-2026-10 §12).

Each finding is a test named `test_R<n>_…`, marked `xfail(strict=True)` with the finding id
while the production code still has the defect, so the fix loop flips it to a pass and the
test stays. Tests without an xfail are probes that held: they pin behaviour the review
tried to break and could not.

`mac` and `boss` share one temp-folder cloud (conftest.two_hosts). Nothing here touches the
network, rclone, OneDrive or a real Foundry.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import time

import pytest

from bundle_fakes import make_module
from cloud_fakes import FakeRclone
from scripts.foundry import boot, bootstate, bundles, cloud, storage
from scripts.foundry.storage import RcloneStorage

DAY = 86400
_tick = [0]


# ── helpers (copied, not imported, from test_cloud_snapshots so each file stands alone) ──

def _edit(root, text):
    f = root / "Data/worlds/w/journal.txt"
    f.write_text(text)
    _tick[0] += 7                   # a fresh int-second mtime: a new world digest
    t = time.time() + _tick[0]
    os.utime(f, (t, t))


def _install(root, *, system: str | None = "5.12"):
    mods = root / "Data/modules"
    make_module(mods, "maps", version="2.0.0", packs=2,
                extra={"art/big.webp": b"map art " * 512})
    make_module(mods, "tools", version="1.1", packs=1)
    if system:
        d = root / "Data/systems/dnd5e"
        d.mkdir(parents=True, exist_ok=True)
        (d / "system.json").write_text(json.dumps({"id": "dnd5e", "version": system}))
        (d / "dnd5e.mjs").write_text("export const dnd5e = 1;\n")
    return root


def _names(cloud_dir, sub="world-backups"):
    return sorted(p.name for p in (cloud_dir / sub).iterdir()
                  if not p.name.endswith(cloud.PARENT_SUFFIX))


def _newest(cloud_dir, suffix="-mac.tar.gz"):
    return [n for n in _names(cloud_dir) if n.endswith(suffix)][-1]


def _bundle_names(cloud_dir):
    return sorted(p.name for p in (cloud_dir / "bundles").iterdir())


def _manifests(cloud_dir):
    """Every sidecar's module manifest, in world-backups/ and major-release/."""
    out = {}
    for sub in ("world-backups", "major-release"):
        for p in (cloud_dir / sub).glob("*.parent"):
            data = json.loads(p.read_text())
            out[p.name] = data.get("modules") or {}
    return out


def _tmp_files(root):
    tmp = root / cloud.TMP_DIRNAME
    return sorted(p.relative_to(tmp).as_posix() for p in tmp.rglob("*") if p.is_file()) \
        if tmp.exists() else []


def _tree_hash(root):
    """Everything under a data root but the temp dir, the bundle cache and the boot state
    (each test checks the state on its own)."""
    import hashlib
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root).as_posix()
        if rel.startswith(cloud.TMP_DIRNAME) or rel in (bundles.CACHE_FILENAME,
                                                        bootstate.FILENAME):
            continue
        st = p.lstat()
        h.update(f"{rel}\0{p.is_dir()}\0{st.st_mtime_ns}\0".encode())
        if p.is_file() and not p.is_symlink():
            h.update(p.read_bytes())
    return h.hexdigest()


def _rclone_cloud(two_hosts, monkeypatch) -> FakeRclone:
    fake = FakeRclone(two_hosts.cloud.parent)
    rc = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    monkeypatch.setattr(storage, "get", lambda: rc)
    return fake


def _uploads(monkeypatch):
    seen: list[str] = []
    real = storage.FolderStorage.upload

    def spy(self, src, rel):
        seen.append(rel)
        return real(self, src, rel)
    monkeypatch.setattr(storage.FolderStorage, "upload", spy)
    return seen


def _legacy_tar(path, files: dict[str, bytes]):
    import io
    import tarfile
    with tarfile.open(path, "w:gz") as tar:
        for rel, data in sorted(files.items()):
            info = tarfile.TarInfo(rel)
            info.size = len(data)
            info.mtime = int(time.time()) - 3600
            tar.addfile(info, io.BytesIO(data))
    return path


# ── R1: extras left on a world-less restore are lost at the next restore ─────────────

@pytest.mark.parametrize("mac_coalesces", [False, True])
def test_R1_extras_left_by_a_worldless_restore_survive_the_next_restore(two_hosts, monkeypatch,
                                                                       mac_coalesces):
    """§1 #9 / §3.6: "with no local world … extras are left in place and listed" — because
    nothing in the cloud references them. The restore then records `snapshot_digest()` of
    the local tree (extras included) as the digest of `based_on`, which does NOT name them.
    Before Foundry ever launches (the first `foundry-up` on BOSS failed, or Joe picks
    another snapshot), the next restore's safety backup sees "unchanged" and skips, and
    apply_snapshot — now with a world — removes the extras. They were never uploaded."""
    mac = _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    s1 = _newest(two_hosts.cloud)

    boss = two_hosts.data["boss"]
    shutil.rmtree(boss / "Data/worlds")                    # never made a world
    make_module(boss / "Data/modules", "boss-only", version="0.1")
    with two_hosts.use("boss"):
        cloud.restore(s1, yes=True)                         # leaves boss-only, as designed
        assert (boss / "Data/modules/boss-only/module.json").exists()
        # vtt-up's pre-launch backup, then foundry-up fails (Foundry not installed yet)
        cloud.backup("pre-launch", if_stopped=True)

    # The Mac plays another session; inside 5 days it coalesces s1 (or not).
    if not mac_coalesces:
        monkeypatch.setattr(cloud, "COALESCE_WINDOW_DAYS", 0)
    _edit(mac, "mac session 2")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    s2 = _newest(two_hosts.cloud)
    assert (s1 in _names(two_hosts.cloud)) is not mac_coalesces

    with two_hosts.use("boss"):                             # Enter on the next boot prompt
        cloud.restore(s2, yes=True)

    on_disk = (boss / "Data/modules/boss-only/module.json").exists()
    referenced = [n for n, mods in _manifests(two_hosts.cloud).items()
                  if "boss-only" in mods and mods["boss-only"] in _bundle_names(two_hosts.cloud)]
    assert on_disk or referenced, ("boss-only was removed and no retained snapshot references "
                                   "a bundle of it — it is gone")


# ── R2: a corrupt bundle of the right size fails the restore part-way ────────────────

def test_R2_a_corrupt_bundle_is_refused_before_anything_local_is_touched(two_hosts, capsys):
    """S3 made a corrupt world gzip a refusal ("§6 nothing local touched for every bad
    download"); a bundle gets only the size check. A same-size corrupt bundle (a zeroed
    OneDrive block, a bad sync) is opened for the first time by `bundles.extract`, after
    `apply_snapshot` has already cleared and replaced Data/worlds and Config."""
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    snap = _newest(two_hosts.cloud)
    [tools] = [n for n in _bundle_names(two_hosts.cloud) if n.startswith("module@tools@")]
    p = two_hosts.cloud / "bundles" / tools
    p.write_bytes(b"\0" * p.stat().st_size)                 # same size, not a gzip

    boss = two_hosts.data["boss"]
    _edit(boss, "boss's own session")
    capsys.readouterr()
    with two_hosts.use("boss"), pytest.raises(SystemExit):
        cloud.restore(snap, yes=True)
    err = capsys.readouterr().err
    journal = boss / "Data/worlds/w/journal.txt"
    assert journal.exists() and journal.read_text() == "boss's own session", (
        "the world was replaced before the bad bundle was noticed:\n" + err)
    assert "nothing local was touched" in err, err
    assert _tmp_files(boss) == []


# ── R3: a symlinked module folder the manifest names fails the restore part-way ──────

def test_R3_a_symlinked_module_the_snapshot_names_is_refused_before_the_world_is_touched(
        two_hosts, capsys, tmp_path):
    """§3.3 skips a symlinked module folder (so it is never in a manifest and never deleted).
    When the snapshot's manifest names that id, the plan calls it `needed`; `bundles.extract`
    then raises `… is a symlink — refusing to replace it` — after the world was cleared and
    extracted. The pre-clear checks in apply_snapshot (stray members, unfetched bundles)
    should include it."""
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    snap = _newest(two_hosts.cloud)

    boss = _install(two_hosts.data["boss"])
    elsewhere = tmp_path / "other-disk" / "tools"
    elsewhere.parent.mkdir(parents=True)
    shutil.move(boss / "Data/modules/tools", elsewhere)
    (boss / "Data/modules/tools").symlink_to(elsewhere, target_is_directory=True)
    _edit(boss, "boss's own session")
    capsys.readouterr()
    with two_hosts.use("boss"), pytest.raises(SystemExit):
        cloud.restore(snap, yes=True)
    err = capsys.readouterr().err
    journal = boss / "Data/worlds/w/journal.txt"
    assert journal.exists() and journal.read_text() == "boss's own session", (
        "the world was replaced before the symlink was noticed:\n" + err)
    assert "failed part-way" not in err, err


# ── R4: after a full restore the "skipped" backup uploads every module bundle ───────

@pytest.mark.xfail(strict=True, reason="R4: _heal_bundles heals against the local inventory, "
                   "not against based_on's manifest; a full based-on names no bundle")
def test_R4_an_unchanged_tree_restored_from_a_full_snapshot_uploads_no_bundle_on_a_skip(
        two_hosts, monkeypatch, capsys):
    """Healing (§3.5 step 3) is for a bundle *the based-on manifest names* that was deleted
    by hand. After a restore of a full (legacy) snapshot the recorded digest is the new
    formula over the restored tree, so the next backup (vtt-up's pre-launch one) skips —
    and `_heal_bundles` uploads a bundle for every module, though no snapshot references
    them, while the boot waits ("uploaded N bundle(s) the cloud had lost")."""
    name = f"world-{time.strftime('%Y-%m-%d-%H%M%S', time.gmtime(time.time() - 2 * DAY))}" \
           "-fvtt14.369.tar.gz"
    p = _legacy_tar(two_hosts.cloud / "world-backups" / name, {
        "Data/worlds/w/world.json": b'{"id": "w"}\n',
        "Config/options.json": b'{"dataPath": "/elsewhere"}\n',
        "Data/modules/old-maps/module.json": b'{"id": "old-maps", "version": "1"}',
        "Data/modules/old-maps/art.webp": b"old art " * 4096,
    })
    os.utime(p, (time.time() - 2 * DAY,) * 2)
    with two_hosts.use("mac"):
        cloud.restore(name, yes=True)
    seen = _uploads(monkeypatch)
    capsys.readouterr()
    with two_hosts.use("mac"):
        cloud.backup("pre-launch", if_stopped=True)
    out = capsys.readouterr().out
    assert "skipped" in out, out
    assert [r for r in seen if r.startswith("bundles/")] == [], out


# ── R5: the boot prompt offers (Enter = take it) a snapshot whose restore must refuse ──

@pytest.mark.xfail(strict=True, reason="R5: restore_cost drops manifest names that are not in "
                   "the listing; the prompt counts only what it can price")
def test_R5_the_prompt_says_when_a_bundle_the_offer_needs_is_missing(two_hosts, tty, capsys):
    """`restore_cost` sums `have[n].size for n in needed if n in have` — a missing bundle is
    silently dropped, so the prompt reads '+ 1 bundle (…) to fetch' and Enter (the default)
    starts a restore that refuses after the world download. The prompt has everything it
    needs to say '(1 missing from the cloud — a restore would refuse)' and default to local."""
    _install(two_hosts.data["mac"])
    _edit(two_hosts.data["mac"], "mac session")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [maps] = [n for n in _bundle_names(two_hosts.cloud) if n.startswith("module@maps@")]
    (two_hosts.cloud / "bundles" / maps).unlink()           # hand-deleted, or swept
    tty(True, ["k"])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    out = capsys.readouterr().out
    assert re.search(r"missing", out), out


# ── R6: a promotion whose sidecar copy fails leaves a preserved generation GC can strip ──

def test_R6_a_preserved_generation_stays_restorable_when_its_sidecar_copy_failed(
        two_hosts, monkeypatch, capsys):
    """`promote_major_release` copies the tar, then the sidecar inside `except StorageError:
    pass`. Before bundles a missing major-release sidecar cost only lineage; now the sidecar
    is GC's only mark. One transient failure (an rclone rcat timeout) and the never-pruned
    rollback point of a Foundry generation is "full" to `referenced_bundles`: once the
    world-backups/ copy is coalesced away and 7 days pass, its bundles are swept and its
    restore refuses ("missing from the cloud"). The restore itself would have worked —
    the tar's marker names the bundles — had they still been there."""
    c = two_hosts.cloud
    mac = _install(two_hosts.data["mac"])
    two_hosts.set_core("mac", "13.351")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [old] = _names(c)
    [tools_old] = [n for n in _bundle_names(c) if n.startswith("module@tools@")]

    real = storage.FolderStorage.write_text

    def flaky(self, rel, text):
        if rel.startswith("major-release/"):
            raise storage.StorageError("rcat: context deadline exceeded", verb="rcat")
        return real(self, rel, text)
    monkeypatch.setattr(storage.FolderStorage, "write_text", flaky)
    two_hosts.set_core("mac", "14.369")
    (mac / "Data/modules/tools/scripts/main.js").write_text("// updated for v14\n")
    _edit(mac, "on 14")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")                            # promotes old, coalesces it
    monkeypatch.setattr(storage.FolderStorage, "write_text", real)
    assert _names(c, "major-release") == [old]
    assert old not in _names(c)                            # only the preserved copy is left

    eight_days_ago = time.time() - 8 * DAY
    for b in (c / "bundles").iterdir():
        os.utime(b, (eight_days_ago, eight_days_ago))
    with two_hosts.use("mac"):
        cloud.bundles_gc_cmd(yes=True)
    capsys.readouterr()
    assert tools_old in _bundle_names(c), (
        "GC swept the bundle only the preserved generation major-release/" + old + " needs")


# ── probes that held ─────────────────────────────────────────────────────────

def test_probe_network_drop_on_the_second_bundle_touches_nothing(two_hosts, monkeypatch,
                                                                 capsys):
    """A drop mid-way through the bundle downloads (rclone copyto fails on the 2nd bundle):
    refused, nothing local touched, no temp file left, no state recorded."""
    fake = _rclone_cloud(two_hosts, monkeypatch)
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    snap = _newest(two_hosts.cloud)
    boss = two_hosts.data["boss"]
    _edit(boss, "boss's own")
    with two_hosts.use("boss"):
        bundles.local_inventory()
    before = _tree_hash(boss)
    real = fake._copyto
    n = [0]

    def flaky(argv, pos, data):
        if pos[0].startswith("fake:") and "/bundles/" in pos[0]:
            n[0] += 1
            if n[0] == 2:
                dst = fake._path(pos[1])
                dst.write_bytes(b"half a bundle")         # what a dropped copy leaves
                return fake._done(argv, 1, "", "Failed to copy: connection reset by peer")
        return real(argv, pos, data)
    monkeypatch.setattr(fake, "_copyto", flaky)
    capsys.readouterr()
    with two_hosts.use("boss"), pytest.raises(SystemExit):
        cloud.restore(snap, yes=True)
    err = capsys.readouterr().err
    assert "nothing local was touched" in err, err
    assert _tree_hash(boss) == before
    assert _tmp_files(boss) == []
    with two_hosts.use("boss"):
        assert bootstate.load().based_on is None


def test_probe_from_latest_without_a_terminal_and_a_missing_bundle_fails_cleanly(
        two_hosts, tty, capsys):
    """FROM=latest is explicit, so it restores even without a terminal; a missing bundle
    must make the boot step fail (Foundry not started) with nothing local touched."""
    _install(two_hosts.data["mac"])
    _edit(two_hosts.data["mac"], "mac session")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    [maps] = [n for n in _bundle_names(two_hosts.cloud) if n.startswith("module@maps@")]
    (two_hosts.cloud / "bundles" / maps).unlink()
    boss = two_hosts.data["boss"]
    _edit(boss, "boss's own")
    with two_hosts.use("boss"):
        bundles.local_inventory()
    before = _tree_hash(boss)
    tty(False)
    with two_hosts.use("boss"):
        assert boot.choose(from_="latest") == boot.FAIL
    err = capsys.readouterr().err
    assert "Foundry was not started" in err and maps in err, err
    assert _tree_hash(boss) == before


def test_probe_no_terminal_never_restores_even_when_bundles_are_all_local(two_hosts, tty,
                                                                          capsys):
    _install(two_hosts.data["mac"])
    _edit(two_hosts.data["mac"], "mac session")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    boss = _install(two_hosts.data["boss"])
    before = _tree_hash(boss)
    tty(False)
    with two_hosts.use("boss"):
        assert boot.choose() == boot.OK
    out = capsys.readouterr().out
    assert "booting LOCAL" in out
    assert _tree_hash(boss) == before


def test_probe_boss_first_boot_through_the_prompt_then_the_prelaunch_backup_skips(
        two_hosts, tty, monkeypatch, capsys):
    """BOSS with no world, no modules, no Config, no systems: Enter takes the Mac's newest;
    every bundle comes down once; the pre-launch backup that follows uploads nothing."""
    fake = _rclone_cloud(two_hosts, monkeypatch)
    _install(two_hosts.data["mac"])
    _edit(two_hosts.data["mac"], "mac session")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
        mac_names = sorted(v.name for v in bundles.local_inventory().values())
    boss = two_hosts.data["boss"]
    for sub in ("Data/worlds", "Data/modules", "Config"):
        shutil.rmtree(boss / sub)
    tty(True, [""])
    fake.calls.clear()
    with two_hosts.use("boss"):
        assert boot.choose() == boot.OK
        st = bootstate.load()
        boss_names = sorted(v.name for v in bundles.local_inventory().values())
    out = capsys.readouterr().out
    assert f"+ all {len(mac_names)} bundles" in out, out
    assert boss_names == mac_names
    assert st.based_on == _newest(two_hosts.cloud)
    opts = json.loads((boss / "Config/options.json").read_text())
    assert opts["dataPath"] == str(boss)
    fake.calls.clear()
    with two_hosts.use("boss"):
        assert cloud.backup("pre-launch", if_stopped=True) == 0
    assert not any(c[1] in ("copyto", "moveto", "rcat") for c in fake.calls), fake.calls
    assert _tmp_files(boss) == []


def test_probe_restore_never_records_state_when_apply_fails_part_way(two_hosts, monkeypatch,
                                                                     capsys):
    """A bundle that fails to extract (disk full) dies naming the safety copy; based_on is
    the safety copy, never the snapshot that was only half applied."""
    _install(two_hosts.data["mac"])
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    snap = _newest(two_hosts.cloud)
    boss = two_hosts.data["boss"]
    _edit(boss, "boss's own")

    def full(*_a, **_k):
        raise OSError(28, "No space left on device")
    monkeypatch.setattr(bundles, "extract", full)
    capsys.readouterr()
    with two_hosts.use("boss"), pytest.raises(SystemExit):
        cloud.restore(snap, yes=True)
    err = capsys.readouterr().err
    [safety] = [n for n in _names(two_hosts.cloud) if n.endswith("-boss.safety.tar.gz")]
    assert f"SNAP={safety}" in err, err
    with two_hosts.use("boss"):
        assert bootstate.load().based_on == safety
    assert _tmp_files(boss) == []
