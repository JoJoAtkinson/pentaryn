"""Adversarial review of module bundles — the plan/focus-list lens (PL).

context/plans/module-bundles-2026-10.md §12 and the workflow's review focus, item by item.
A `PL<n>` test proves a finding of this lens: it fails on the build as reviewed, so it is
``xfail(strict=True)`` with the finding id; the fix loop flips it to a pass and drops the
marker. Findings another reviewer already pinned (test_review_dataloss.py DL1/DL3/DL5/DL6a,
test_review_restore_boot.py R1/R3/R6) are not repeated here. The unmarked tests are focus
items this lens checked that hold today; they stay as guards.
"""

from __future__ import annotations

import json
import os
import time
from functools import partial

import pytest

from bundle_fakes import foundry_launch, make_leveldb_pack, make_module
from cloud_fakes import install, make_edit
from cloud_fakes import bundle_names as _bundle_names
from cloud_fakes import names as _names
from scripts.foundry import bootstate, bundles, cloud, storage
from scripts.foundry.storage import StorageError

DAY = 86400.0


# ── helpers (shared, from cloud_fakes — M14) ──────────────────────────────────

_install = partial(install, maps_extra=b"map " * 2048, system="5.12")


_edit = make_edit(step=5)


# ── PL1: staged bundle tars from a failed upload are never cleaned up ─────────

def test_PL1_a_successful_rerun_leaves_no_staged_bundle_tars(two_hosts, monkeypatch):
    """PL1 (fixed): a rerun stages only what the cloud still lacks, so the tars a failed run
    staged for bundles that did land stayed in .pentaryn-tmp/bundles/ forever. The backup
    now removes them before it stages (cloud._sweep_staging)."""
    mac = _install(two_hosts.data["mac"])
    real = storage.FolderStorage.upload
    fail = [True]

    def flaky(self, src, rel):
        if rel.startswith("world-backups/") and fail[0]:
            fail[0] = False
            raise StorageError("upload failed: connection reset", verb="copyto")
        return real(self, src, rel)
    monkeypatch.setattr(storage.FolderStorage, "upload", flaky)
    with two_hosts.use("mac"), pytest.raises(SystemExit):
        cloud.backup("shutdown")                     # bundles landed, the world did not
    with two_hosts.use("mac"):
        assert cloud.backup("shutdown") == 0         # the rerun succeeds
    staging = mac / cloud.TMP_DIRNAME / bundles.STAGING
    left = sorted(p.name for p in staging.iterdir()) if staging.exists() else []
    assert left == []


def test_orphan_bundles_from_a_failed_world_upload_are_reused_and_not_swept(two_hosts,
                                                                           monkeypatch):
    """§6: bundles that landed before a failed world upload are orphans; the next backup
    finds them listed and does not send them again, and GC leaves them (young, and now
    referenced)."""
    _install(two_hosts.data["mac"])
    real = storage.FolderStorage.upload
    sent: list[str] = []
    fail = [True]

    def flaky(self, src, rel):
        sent.append(rel)
        if rel.startswith("world-backups/") and fail[0]:
            fail[0] = False
            raise StorageError("upload failed: connection reset", verb="copyto")
        return real(self, src, rel)
    monkeypatch.setattr(storage.FolderStorage, "upload", flaky)
    with two_hosts.use("mac"), pytest.raises(SystemExit):
        cloud.backup("shutdown")
    orphans = _bundle_names(two_hosts.cloud)
    assert orphans and _names(two_hosts.cloud) == []          # bundles up, no snapshot
    sent.clear()
    with two_hosts.use("mac"):
        assert cloud.backup("shutdown") == 0
    assert [r for r in sent if r.startswith("bundles/")] == []  # reused, not re-sent
    assert _bundle_names(two_hosts.cloud) == orphans          # and not swept


# ── properties checked by the review that hold (guards, not findings) ─────────

def _pack_shapes(root):
    """Every pack shape seen on the Mac: several .ldb; no .ldb at all (a pack Foundry
    created empty); no LOG.old yet (first open); and a LevelDB nested several levels deep."""
    make_leveldb_pack(root / "packs/many", ldb={f"0000{n}.ldb": bytes([n]) * 300
                                               for n in range(10, 16)})
    p = make_leveldb_pack(root / "packs/empty", ldb={})
    p2 = make_leveldb_pack(root / "packs/first-open")
    (p2 / "LOG.old").unlink()
    make_leveldb_pack(root / "a/b/c/d/packs/deep", ldb={"000099.ldb": b"deep table"})
    return [root / "packs/many", p, p2, root / "a/b/c/d/packs/deep"]


def test_fingerprint_is_stable_over_launches_on_every_pack_shape(tmp_path):
    mod = make_module(tmp_path, "shapes", packs=1)
    packs = _pack_shapes(mod) + [mod / "packs/pack0"]
    before = bundles.fingerprint(mod)
    for _ in range(3):
        for p in packs:
            foundry_launch(p)
    assert bundles.fingerprint(mod) == before
    # and each real change still moves it
    for change in (lambda: (mod / "a/b/c/d/packs/deep/000100.log").write_bytes(b"wal"),
                   lambda: (mod / "packs/empty/000020.ldb").write_bytes(b"first table"),
                   lambda: (mod / "packs/many/000012.ldb").write_bytes(b"\x0c" * 299 + b"!")):
        prev = bundles.fingerprint(mod).fp
        change()
        assert bundles.fingerprint(mod).fp != prev


def test_leveldb_names_without_current_are_content(tmp_path):
    d = tmp_path / "notes"
    d.mkdir()
    (d / "readme.md").write_text("x")
    before = bundles.fingerprint(d)
    for name, data in (("LOG", b"log"), ("MANIFEST-1", b"m"), ("LOCK", b""),
                       ("LOG.old", b"o"), ("000001.log", b"")):
        (d / name).write_bytes(data)
        after = bundles.fingerprint(d)
        assert after.files == before.files + 1, name
        before = after


def test_backup_bundle_set_is_unchanged_by_launches_on_every_pack_shape(two_hosts,
                                                                        monkeypatch):
    mac = _install(two_hosts.data["mac"])
    packs = _pack_shapes(mac / "Data/modules/maps")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    first = _bundle_names(two_hosts.cloud)
    for p in packs + sorted(q.parent for q in mac.rglob("CURRENT")):
        foundry_launch(p)
    _edit(mac, "a session")
    with two_hosts.use("mac"):
        cloud.backup("shutdown")
    assert _bundle_names(two_hosts.cloud) == first


def test_first_bundled_backup_coalesces_the_full_era_mac_snapshot(two_hosts):
    """§4: the 3.24 GB full mac snapshot is this tree's based-on and inside 5 days."""
    mac = _install(two_hosts.data["mac"])
    stamp = time.strftime("%Y-%m-%d-%H%M%S", time.gmtime(time.time() - DAY))
    full = f"world-{stamp}-fvtt14.369-mac.tar.gz"
    p = two_hosts.cloud / "world-backups" / full
    p.write_bytes(b"x" * 64)
    t = time.time() - DAY
    os.utime(p, (t, t))
    (two_hosts.cloud / "world-backups" / f"{full}.parent").write_text(json.dumps(
        {"parent": None, "ancestors": None, "ancestor_mtimes": None, "origin_before": None,
         "host": "mac"}))
    with two_hosts.use("mac"):
        bootstate.load().record_snapshot(full, "mac", t, "a-pre-bundles-digest", by="backup",
                                         lineage=[])
        cloud.backup("shutdown")
    names = _names(two_hosts.cloud)
    assert full not in names and len(names) == 1


def test_parse_bundle_never_matches_snapshots_partials_or_sidecars():
    good = "module@x@1.0@0123456789abcdef.tar.gz"
    assert bundles.parse_bundle(good) is not None
    for name in (good + ".partial", good + ".parent", good + ".building",
                 "world-2026-10-11-212143-fvtt14.369-mac.tar.gz",
                 "world-2026-10-11-212143-fvtt14.369-mac.tar.gz.parent",
                 "module@x@1.0@0123456789ABCDEF.tar.gz", "module@x@1.0@0123456789abcde.tar.gz",
                 "theme@x@1.0@0123456789abcdef.tar.gz", "module@@1.0@0123456789abcdef.tar.gz"):
        assert bundles.parse_bundle(name) is None, name
    for v in ("1.2.3-beta+5", "1 2", "ünï", "a@b", "a/b"):
        assert bundles.parse_bundle(bundles.bundle_name("module", "ünï mod", v,
                                                        "0123456789abcdef")) is not None
