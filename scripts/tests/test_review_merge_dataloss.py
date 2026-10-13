"""Adversarial review of feature/module-bundles after the merge with main — the data-loss
lens: can any path (foreground, background, restore, GC, coalesce, two hosts) lose the
world or leave a retained snapshot unrestorable?

Each test proves one finding (MD1, MD1b, MD2). They are `xfail(strict=True)` until the finding
is fixed — a fix flips the test to XPASS, which fails the suite until the marker is
removed. The composition lens's findings (MC1–MC3, test_review_merge_compose.py: the
stuck queue, the uploader tarring live module folders, the re-parent race) are not
repeated here.

Nothing here touches the network, rclone, OneDrive or Foundry: the cloud is the fake
folder (conftest.two_hosts) or FakeRclone over it.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from functools import partial

import pytest

from bundle_fakes import make_module
from cloud_fakes import FakeRclone, bundle_names, make_edit
from cloud_fakes import age as _age
from cloud_fakes import worlds as _worlds
from scripts.foundry import bundles, cloud, storage
from scripts.foundry.storage import RcloneStorage

DAY = 86400


# ── helpers (shared, from cloud_fakes — M14) ──────────────────────────────────

_edit = make_edit(step=5)
_bundle_names = partial(bundle_names, tars_only=True)


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


def _target(argv) -> str:
    return FakeRclone._positional(argv[2:])[-1] if argv[1] != "lsjson" else \
        FakeRclone._positional(argv[2:])[0]


# ── MD1: the GC mark reads a snapshot folder it cannot find as "no snapshots" ──

@pytest.mark.parametrize("folder", ["world-backups", "major-release"])
def test_md1_gc_never_reads_a_snapshot_folder_it_cannot_find_as_empty(
        two_hosts, monkeypatch, folder):
    c = two_hosts.cloud
    two_hosts.set_core("mac", "13.351")
    with two_hosts.use("mac") as mac:
        make_module(mac / "Data/modules", "maps", version="1.0.0", packs=1)
        cloud.backup("shutdown")                            # maps@1 up; the v13 snapshot
    # Foundry 14, and the module updated with it: the v13 snapshot is preserved in
    # major-release/ and coalesced out of world-backups/ — only the preserved copy names
    # maps@1 now
    two_hosts.set_core("mac", "14.369")
    with two_hosts.use("mac") as mac:
        make_module(mac / "Data/modules", "maps", version="2.0.0", packs=1)
        _edit(mac, "after the upgrade")
        cloud.backup("shutdown")
    assert len(_worlds(c, "major-release")) == 1 and len(_worlds(c)) == 1
    for p in (c / "bundles").iterdir():
        _age(p, 8)                                          # uploaded over a week ago
    assert _retained_refs_exist(c) == []

    # The next backup, over rclone: while its GC marks, one listing of `folder` comes
    # back "directory not found".
    _fake, rc = _rclone(two_hosts, monkeypatch)
    real_runner, missing = rc.runner, {"on": False}

    def runner(argv, **kw):
        if missing["on"] and argv[1] == "lsjson" and _target(argv).endswith("/" + folder):
            return subprocess.CompletedProcess(argv, 3, stdout="",
                                               stderr="error listing: directory not found")
        return real_runner(argv, **kw)
    rc.runner = runner
    real_gc = cloud._gc_after_backup

    def gc(st):
        missing["on"] = True
        try:
            real_gc(st)
        finally:
            missing["on"] = False
    monkeypatch.setattr(cloud, "_gc_after_backup", gc)
    with two_hosts.use("mac") as mac:
        _edit(mac, "a session")
        assert cloud.backup("shutdown") == 0

    assert _retained_refs_exist(c) == [], "a retained snapshot names a bundle the GC swept"


@pytest.mark.xfail(strict=True, reason=(
    "MD1b (low; MD1 one level down): _snapshot_manifest reads a LISTED snapshot whose "
    "sidecar `cat` and tar-head `cat --count` both come back 'not found' as 'the tar is "
    "gone since the listing — it needs nothing', and the recheck (_remark) never reads it "
    "again because it is in `seen`. A transient not-found on both reads (the same OneDrive "
    "itemNotFound moment) shrinks the mark exactly like MD1: a snapshot still in the "
    "listing must be 'cannot tell', or be re-read by the recheck, never 'names nothing'"))
def test_md1b_a_listed_snapshot_whose_reads_say_not_found_is_never_marked_as_naming_nothing(
        two_hosts, monkeypatch):
    c = two_hosts.cloud
    with two_hosts.use("mac") as mac:
        make_module(mac / "Data/modules", "maps", version="1.0.0", packs=1)
        cloud.backup("shutdown")
    for p in (c / "bundles").iterdir():
        _age(p, 8)

    _fake, rc = _rclone(two_hosts, monkeypatch)
    real_runner, missing = rc.runner, {"on": False}

    def runner(argv, **kw):
        if missing["on"] and argv[1] == "cat" and "/world-backups/" in _target(argv):
            text = kw.get("text", True)
            return subprocess.CompletedProcess(argv, 3, stdout="" if text else b"",
                                               stderr="error: object not found")
        return real_runner(argv, **kw)
    rc.runner = runner
    real_gc = cloud._gc_after_backup

    def gc(st):
        missing["on"] = True
        try:
            real_gc(st)
        finally:
            missing["on"] = False
    monkeypatch.setattr(cloud, "_gc_after_backup", gc)
    with two_hosts.use("mac") as mac:
        _edit(mac, "a session")
        assert cloud.backup("shutdown") == 0

    assert _retained_refs_exist(c) == [], "a retained snapshot names a bundle the GC swept"


# ── MD2: a bundle upload still deletes the name on a listing that misses it ────

@pytest.mark.xfail(strict=True, reason=(
    "MD2 (low): RcloneStorage.upload's post-move check exempts bundles/ only from a size "
    "MISMATCH (DL7, storage.Superseded). When the listing right after the moveto does not "
    "show the name at all (OneDrive's listing lagging a server-side move), it still runs "
    "`deletefile bundles/<name>` — and that name may already be the other host's "
    "same-name upload, which its just-landed snapshot names: that retained snapshot is "
    "left without a bundle (a restore of it refuses) until a backup on a machine holding "
    "the module heals it. In a CONTENT_ADDRESSED folder an upload must never delete"))
def test_md2_a_bundle_upload_never_deletes_a_name_the_post_move_listing_misses(
        two_hosts, monkeypatch, tmp_path):
    c = two_hosts.cloud
    for host in ("mac", "boss"):                            # the same module on both
        make_module(two_hosts.data[host] / "Data/modules", "shared", version="3.0.0",
                    packs=1)
    with two_hosts.use("boss"):
        cloud.backup("shutdown")
    [x] = [n for n in _bundle_names(c) if n.startswith("module@shared@")]
    [sb] = _worlds(c)
    # BOSS's backup lands while the Mac is uploading the same bundle: hold it back, and
    # put it in place at the Mac's copyto of that name.
    held = tmp_path / "held"
    held.mkdir()
    landed = [c / "bundles" / x, c / "world-backups" / sb,
              c / "world-backups" / f"{sb}{cloud.PARENT_SUFFIX}"]
    for p in landed:
        shutil.move(str(p), str(held / p.name))

    _fake, rc = _rclone(two_hosts, monkeypatch)
    real_runner, lag = rc.runner, {"armed": False}

    def runner(argv, **kw):
        if argv[1] == "copyto" and _target(argv).endswith(f"/bundles/{x}.partial"):
            for p in landed:                                # BOSS lands now
                if not p.exists():
                    shutil.move(str(held / p.name), str(p))
        if argv[1] == "lsjson" and lag["armed"] and _target(argv).endswith("/bundles"):
            lag["armed"] = False                            # the listing lags the move once
            proc = real_runner(argv, **kw)
            rows = [r for r in json.loads(proc.stdout or "[]") if r.get("Name") != x]
            return subprocess.CompletedProcess(argv, proc.returncode,
                                               stdout=json.dumps(rows), stderr="")
        proc = real_runner(argv, **kw)
        if argv[1] == "moveto" and _target(argv).endswith(f"/bundles/{x}"):
            lag["armed"] = True
        return proc
    rc.runner = runner
    with two_hosts.use("mac") as mac:
        _edit(mac, "a mac session")
        try:
            cloud.backup("shutdown")
        except SystemExit:
            pass                                            # this backup may fail; fine

    assert sb in _worlds(c)
    assert _retained_refs_exist(c) == [], f"BOSS's {sb} names {x}, which an upload deleted"
