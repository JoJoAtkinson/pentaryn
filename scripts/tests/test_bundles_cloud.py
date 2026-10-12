"""bundles.py, the cloud half: listing, upload_missing, fetch, gc.

Design: context/plans/module-bundles-2026-10.md §3.2 (layout), §3.7 (GC), §6 (failure
modes), §8 ("test_bundles_cloud.py"). Every test runs twice — once over the two_hosts
folder cloud (``cloud.store()`` → FolderStorage) and once over an RcloneStorage driven by
``cloud_fakes.FakeRclone`` on the same folder. No network, no rclone binary, no Foundry.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

from cloud_fakes import FakeRclone
from scripts.foundry import bundles, cloud, storage
from scripts.foundry.storage import RcloneStorage, StorageError

DAY = 86400
FP1, FP2, FP3 = "0123456789abcdef", "fedcba9876543210", "00112233445566ff"
A = f"module@alpha@1.0.0@{FP1}.tar.gz"
B = f"module@beta@2.1@{FP2}.tar.gz"
S = f"system@dnd5e@6.0.6@{FP3}.tar.gz"


class Cloud:
    """One storage under test plus the folder it writes to, and the fake (rclone only)."""

    def __init__(self, st, folder: Path, fake: FakeRclone | None):
        self.st, self.folder, self.fake = st, folder, fake

    @property
    def bdir(self) -> Path:
        return self.folder / bundles.BUNDLES

    def put(self, name: str, *, data: bytes | None = None, age_days: float = 0.0) -> Path:
        p = self.bdir / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data if data is not None else name.encode() * 8)
        t = time.time() - age_days * DAY
        os.utime(p, (t, t))
        return p

    def verbs(self) -> list[str]:
        return self.fake.verbs() if self.fake else []

    def clear(self) -> None:
        if self.fake:
            self.fake.calls.clear()


@pytest.fixture(params=["folder", "rclone"])
def cl(request, two_hosts, monkeypatch):
    folder = two_hosts.cloud
    if request.param == "folder":
        st = cloud.store()
        assert isinstance(st, storage.FolderStorage)
        return Cloud(st, folder, None)
    fake = FakeRclone(folder.parent)
    st = RcloneStorage(f"fake:{folder.name}", bin="rclone", runner=fake, interactive=False)
    monkeypatch.setattr(storage, "get", lambda: st)
    return Cloud(st, folder, fake)


def _staged(tmp_path: Path, *names: str, size: int = 512) -> dict[str, Path]:
    d = tmp_path / "staged"
    d.mkdir(exist_ok=True)
    out = {}
    for n in names:
        p = d / n
        p.write_bytes(os.urandom(size))
        out[n] = p
    return out


# ── layout ──────────────────────────────────────────────────────────────────

def test_bundles_is_a_cloud_subfolder():
    assert bundles.BUNDLES in storage.SUBFOLDERS


# ── listing ─────────────────────────────────────────────────────────────────

def test_listing_is_every_visible_name_with_size_and_mtime(cl):
    cl.put(A, data=b"a" * 100, age_days=3)
    cl.put(B, data=b"b" * 7)
    cl.put("README.txt", data=b"stray")
    have = bundles.listing(cl.st)
    assert sorted(have) == sorted([A, B, "README.txt"])     # all names; callers filter
    assert have[A].name == A and have[A].size == 100 and have[B].size == 7
    assert abs(have[A].mtime - (time.time() - 3 * DAY)) < 60


def test_listing_never_shows_a_partial(cl):
    cl.put(A)
    cl.put(B + storage.PARTIAL)
    assert list(bundles.listing(cl.st)) == [A]


def test_listing_of_an_empty_or_missing_folder_is_empty(cl):
    assert bundles.listing(cl.st) == {}


# ── upload_missing ──────────────────────────────────────────────────────────

def test_upload_missing_uploads_only_absent_names(cl, tmp_path):
    cl.put(A, data=b"already there")
    staged = _staged(tmp_path, A, B, S)
    have = bundles.listing(cl.st)
    cl.clear()
    up = bundles.upload_missing(cl.st, staged, have)
    assert up == sorted([B, S])
    assert (cl.bdir / A).read_bytes() == b"already there"        # untouched
    for n in (B, S):
        assert (cl.bdir / n).read_bytes() == staged[n].read_bytes()
    assert not list(cl.bdir.glob("*" + storage.PARTIAL))
    assert sorted(bundles.listing(cl.st)) == sorted([A, B, S])


def test_upload_missing_with_nothing_missing_touches_nothing(cl, tmp_path):
    staged = _staged(tmp_path, A)
    bundles.upload_missing(cl.st, staged, {})
    have = bundles.listing(cl.st)
    cl.clear()
    assert bundles.upload_missing(cl.st, staged, have) == []
    assert cl.verbs() == []


def test_upload_missing_overwrites_a_name_that_appeared_meanwhile(cl, tmp_path):
    """Plan §1 #2: the other host uploaded the same name after our listing — same
    content by construction, so the later moveto simply replaces it."""
    staged = _staged(tmp_path, A)
    cl.put(A, data=b"the other host's equivalent copy")
    assert bundles.upload_missing(cl.st, staged, {}) == [A]
    assert (cl.bdir / A).read_bytes() == staged[A].read_bytes()


def test_upload_missing_rclone_argv_is_copyto_partial_then_moveto(two_hosts, tmp_path):
    fake = FakeRclone(two_hosts.cloud.parent)
    root = two_hosts.cloud.name
    st = RcloneStorage(f"fake:{root}", bin="rclone", runner=fake, interactive=False)
    staged = _staged(tmp_path, B, A)
    assert bundles.upload_missing(st, staged, {}) == [A, B]      # sorted order
    assert all("--config" not in c for c in fake.calls)
    moves = [(c[1], c[2], c[3]) for c in fake.calls if c[1] in ("copyto", "moveto")]
    assert moves == [
        ("copyto", str(staged[A]), f"fake:{root}/bundles/{A}.partial"),
        ("moveto", f"fake:{root}/bundles/{A}.partial", f"fake:{root}/bundles/{A}"),
        ("copyto", str(staged[B]), f"fake:{root}/bundles/{B}.partial"),
        ("moveto", f"fake:{root}/bundles/{B}.partial", f"fake:{root}/bundles/{B}"),
    ]


def test_upload_missing_failure_raises_and_leaves_no_real_name(two_hosts, tmp_path):
    fake = FakeRclone(two_hosts.cloud.parent)
    st = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    fake.fail_always["moveto"] = (1, "Failed to move: connection reset")
    with pytest.raises(StorageError):
        bundles.upload_missing(st, _staged(tmp_path, A), {})
    assert bundles.listing(st) == {}


# ── fetch ───────────────────────────────────────────────────────────────────

def test_fetch_downloads_the_named_bundles_size_verified(cl, tmp_path):
    cl.put(A, data=b"alpha" * 20)
    cl.put(B, data=b"beta" * 3)
    cl.put(S)
    have = bundles.listing(cl.st)
    dest = tmp_path / "dl"
    got = bundles.fetch(cl.st, [A, B], dest, have)
    assert got == {A: dest / A, B: dest / B}
    assert (dest / A).read_bytes() == b"alpha" * 20
    assert sorted(p.name for p in dest.iterdir()) == sorted([A, B])   # not S


def test_fetch_of_nothing_is_empty(cl, tmp_path):
    assert bundles.fetch(cl.st, [], tmp_path / "dl", {}) == {}


def test_fetch_names_every_missing_bundle_before_any_download(cl, tmp_path):
    cl.put(A)
    have = bundles.listing(cl.st)
    cl.clear()
    dest = tmp_path / "dl"
    with pytest.raises(StorageError) as exc:
        bundles.fetch(cl.st, [A, B, S], dest, have)
    msg = str(exc.value)
    assert B in msg and S in msg and A not in msg
    assert "copyto" not in cl.verbs()
    assert not dest.exists() or list(dest.iterdir()) == []


def test_fetch_a_truncated_cloud_file_raises_and_leaves_nothing(cl, tmp_path):
    cl.put(A, data=b"a" * 50)
    cl.put(B, data=b"b" * 50)
    have = bundles.listing(cl.st)
    (cl.bdir / B).write_bytes(b"b" * 49)     # a same-name re-upload raced the download
    dest = tmp_path / "dl"
    with pytest.raises(StorageError) as exc:
        bundles.fetch(cl.st, [A, B], dest, have)
    assert B in str(exc.value)
    assert not dest.exists() or list(dest.iterdir()) == []   # A, downloaded first, removed too


def test_fetch_a_download_failure_removes_what_this_call_downloaded(two_hosts, tmp_path):
    fake = FakeRclone(two_hosts.cloud.parent)
    st = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    bdir = two_hosts.cloud / bundles.BUNDLES
    bdir.mkdir(exist_ok=True)
    (bdir / A).write_bytes(b"a" * 10)
    (bdir / B).write_bytes(b"b" * 10)
    have = bundles.listing(st)
    real = fake._copyto
    n = {"calls": 0}

    def flaky(argv, pos, _in):
        n["calls"] += 1
        if n["calls"] == 2:                       # the second bundle's download drops
            Path(pos[1]).write_bytes(b"half")
            return fake._done(argv, 1, "", "Failed to copy: connection reset")
        return real(argv, pos, _in)

    fake._copyto = flaky
    dest = tmp_path / "dl"
    with pytest.raises(StorageError):
        bundles.fetch(st, [A, B], dest, have)
    assert list(dest.iterdir()) == []


# ── gc ──────────────────────────────────────────────────────────────────────

def _aged(cl):
    """A referenced old bundle, an unreferenced old one, an unreferenced young one,
    an old stray file and an old .partial."""
    cl.put(A, age_days=30)
    cl.put(B, age_days=30)
    cl.put(S, age_days=1)
    cl.put("notes.txt", age_days=30)
    cl.put(f"module@gamma@1@{FP1}.tar.gz.partial", age_days=30)


def test_gc_sweeps_only_old_unreferenced_bundles(cl):
    _aged(cl)
    swept = bundles.gc(cl.st, referenced={A})
    assert swept == [B]
    left = sorted(p.name for p in cl.bdir.iterdir())
    assert left == sorted([A, S, "notes.txt", f"module@gamma@1@{FP1}.tar.gz.partial"])


def test_gc_grace_and_now_are_honoured(cl):
    _aged(cl)
    assert bundles.gc(cl.st, referenced={A}, grace=0) == sorted([B, S])
    cl.put(B, age_days=30)
    later = time.time() + 365 * DAY
    assert bundles.gc(cl.st, referenced=set(), grace=bundles.GC_GRACE_SECONDS,
                      now=later) == sorted([A, B])


def test_gc_dry_run_deletes_nothing_but_names_the_candidates(cl):
    _aged(cl)
    before = sorted(p.name for p in cl.bdir.iterdir())
    cl.clear()
    assert bundles.gc(cl.st, referenced={A}, dry_run=True) == [B]
    assert sorted(p.name for p in cl.bdir.iterdir()) == before
    assert "deletefile" not in cl.verbs()


def test_gc_twice_is_a_no_op(cl):
    _aged(cl)
    assert bundles.gc(cl.st, referenced={A}) == [B]
    cl.clear()
    assert bundles.gc(cl.st, referenced={A}) == []
    assert "deletefile" not in cl.verbs()


def test_gc_on_an_empty_cloud_is_empty(cl):
    assert bundles.gc(cl.st, referenced=set()) == []


def test_gc_an_already_gone_bundle_is_not_an_error(two_hosts):
    """The other host's GC deleted it between our listing and our delete: rclone exits 4."""
    fake = FakeRclone(two_hosts.cloud.parent)
    st = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    bdir = two_hosts.cloud / bundles.BUNDLES
    bdir.mkdir(exist_ok=True)
    p = bdir / B
    p.write_bytes(b"x")
    old = time.time() - 30 * DAY
    os.utime(p, (old, old))
    fake.fail_once["deletefile"] = (4, "error: object not found")
    assert bundles.gc(st, referenced=set()) == [B]


def test_gc_a_delete_failure_raises(two_hosts):
    fake = FakeRclone(two_hosts.cloud.parent)
    st = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    bdir = two_hosts.cloud / bundles.BUNDLES
    bdir.mkdir(exist_ok=True)
    p = bdir / B
    p.write_bytes(b"x")
    old = time.time() - 30 * DAY
    os.utime(p, (old, old))
    fake.fail_always["deletefile"] = (1, "permission denied")
    with pytest.raises(StorageError):
        bundles.gc(st, referenced=set())
