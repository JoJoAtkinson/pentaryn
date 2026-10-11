"""The storage layer (design §1): one contract, two implementations.

Both `FolderStorage` and `RcloneStorage` (driven by the fake runner in cloud_fakes.py)
must pass the same contract, so the cloud policy above them cannot tell which it has.
No network, no rclone binary, no real OneDrive.
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path

import pytest

from cloud_fakes import FakeRclone
from scripts.foundry import storage
from scripts.foundry.storage import Entry, FolderStorage, RcloneStorage, StorageError


@pytest.fixture
def cloud_dir(tmp_path):
    d = tmp_path / "cloud"
    d.mkdir()
    return d


@pytest.fixture
def fake(cloud_dir):
    return FakeRclone(cloud_dir)


@pytest.fixture(params=["folder", "rclone"])
def st(request, cloud_dir, fake):
    if request.param == "folder":
        s = FolderStorage(cloud_dir)
    else:
        s = RcloneStorage("fake:", bin="rclone", runner=fake, interactive=False)
        s.remote = "fake:"  # `fake:` + `world-backups/x` → base/world-backups/x
        s._r = lambda rel="": f"fake:{rel}"
    s.mkdirs()
    return s


def _src(tmp_path: Path, name="snap.tar.gz", size=4096) -> Path:
    p = tmp_path / "local" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(os.urandom(size))
    return p


# ── the shared contract ─────────────────────────────────────────────────────

def test_mkdirs_creates_the_four_subfolders(st, cloud_dir):
    assert sorted(p.name for p in cloud_dir.iterdir()) == sorted(storage.SUBFOLDERS)


def test_write_read_exists_delete(st):
    assert st.read_text("world-backups/README.txt") is None
    assert not st.exists("world-backups/README.txt")
    st.write_text("world-backups/README.txt", "hello\n")
    assert st.read_text("world-backups/README.txt") == "hello\n"
    assert st.exists("world-backups/README.txt")
    st.delete("world-backups/README.txt")
    assert not st.exists("world-backups/README.txt")
    st.delete("world-backups/README.txt")  # a missing file is not an error


def test_upload_lists_with_size_and_leaves_no_partial(st, tmp_path, cloud_dir):
    src = _src(tmp_path)
    st.upload(src, "world-backups/world-2026-10-11-030412-fvtt14.369-mac.tar.gz")
    [e] = st.ls("world-backups")
    assert e.name == "world-2026-10-11-030412-fvtt14.369-mac.tar.gz"
    assert e.size == src.stat().st_size
    assert abs(e.mtime - time.time()) < 3600
    assert not list((cloud_dir / "world-backups").glob("*.partial"))


def test_download_round_trips_bytes(st, tmp_path):
    src = _src(tmp_path)
    st.upload(src, "world-backups/a.tar.gz")
    out = st.download("world-backups/a.tar.gz", tmp_path / "dl" / "a.tar.gz")
    assert out.read_bytes() == src.read_bytes()


def test_download_of_a_missing_file_raises(st, tmp_path):
    with pytest.raises(StorageError):
        st.download("world-backups/nope.tar.gz", tmp_path / "dl" / "nope.tar.gz")


def test_copy_within_the_cloud(st, tmp_path):
    src = _src(tmp_path)
    st.upload(src, "world-backups/a.tar.gz")
    st.copy("world-backups/a.tar.gz", "major-release/a.tar.gz")
    assert [e.name for e in st.ls("major-release")] == ["a.tar.gz"]
    assert [e.name for e in st.ls("world-backups")] == ["a.tar.gz"]


def test_ls_hides_junk_dotfiles_and_partials(st, cloud_dir):
    wb = cloud_dir / "world-backups"
    for name in (".DS_Store", "desktop.ini", ".last-digest", "x.tar.gz.partial", "real.tar.gz"):
        (wb / name).write_text("x")
    (wb / "subdir").mkdir()
    assert [e.name for e in st.ls("world-backups")] == ["real.tar.gz"]
    assert [e.name for e in st.partials("world-backups")] == ["x.tar.gz.partial"]


def test_ls_of_a_missing_folder_is_empty(st, cloud_dir):
    assert st.ls("no-such-folder") == []


def test_stale_partials_are_older_than_a_day(st, cloud_dir):
    wb = cloud_dir / "world-backups"
    old, young = wb / "old.tar.gz.partial", wb / "young.tar.gz.partial"
    old.write_text("x")
    young.write_text("x")
    day_ago = time.time() - 25 * 3600
    os.utime(old, (day_ago, day_ago))
    assert [e.name for e in storage.stale_partials(st, "world-backups")] == ["old.tar.gz.partial"]


def test_bad_rel_paths_are_refused(st):
    for bad in ("/etc/passwd", "../x", "a/../../x", ""):
        with pytest.raises(StorageError):
            st.read_text(bad)


# ── rclone only: the two-step upload, failures, argv ────────────────────────

@pytest.fixture
def rc(cloud_dir, fake):
    s = RcloneStorage("fake:root", bin="rclone", runner=fake, interactive=False)
    fake.base = cloud_dir.parent  # fake:root → <tmp>/root
    s.mkdirs()
    fake.calls.clear()
    return s


def test_rclone_upload_is_copyto_partial_then_moveto(rc, fake, tmp_path):
    src = _src(tmp_path)
    rc.upload(src, "world-backups/w.tar.gz")
    verbs = fake.verbs()
    assert verbs == ["copyto", "moveto", "lsjson"]
    copy, move = fake.calls[0], fake.calls[1]
    assert copy[2:4] == [str(src), "fake:root/world-backups/w.tar.gz.partial"]
    assert move[2:4] == ["fake:root/world-backups/w.tar.gz.partial", "fake:root/world-backups/w.tar.gz"]


def test_rclone_failing_copyto_leaves_only_partial_and_raises(rc, fake, tmp_path):
    src = _src(tmp_path)
    # Simulate a link that drops mid-transfer: the .partial exists, rclone exits 1.
    part = fake.base / "root/world-backups/w.tar.gz.partial"

    def broken(argv, **kw):
        if argv[1] == "copyto":
            fake.calls.append(argv)
            part.write_bytes(b"half")
            return subprocess.CompletedProcess(argv, 1, "", "Failed to copy: connection reset")
        return fake(argv, **kw)

    rc.runner = broken
    with pytest.raises(StorageError, match="copyto"):
        rc.upload(src, "world-backups/w.tar.gz")
    assert fake.verbs() == ["copyto", "copyto"]       # retried once, then gave up
    assert rc.ls("world-backups") == []               # never the real name
    assert [e.name for e in rc.partials("world-backups")] == ["w.tar.gz.partial"]


def test_rclone_copyto_retry_succeeds_on_second_try(rc, fake, tmp_path):
    fake.fail_once["copyto"] = (1, "transient")
    rc.upload(_src(tmp_path), "world-backups/w.tar.gz")
    assert [e.name for e in rc.ls("world-backups")] == ["w.tar.gz"]


def test_rclone_size_check_deletes_and_raises(rc, fake, tmp_path):
    fake.truncate_uploads = True
    with pytest.raises(StorageError, match="did not verify"):
        rc.upload(_src(tmp_path), "world-backups/w.tar.gz")
    assert rc.ls("world-backups") == []
    assert not (fake.base / "root/world-backups/w.tar.gz").exists()


def test_rclone_read_text_not_found_is_none_and_other_exits_raise(rc, fake):
    assert rc.read_text("world-backups/README.txt") is None
    fake.fail_once["cat"] = (7, "fatal error")
    with pytest.raises(StorageError):
        rc.read_text("world-backups/README.txt")


def test_rclone_delete_missing_is_fine_other_exits_raise(rc, fake):
    rc.delete("world-backups/nope")                       # exit 4 → fine
    fake.fail_once["deletefile"] = (3, "directory not found")
    rc.delete("world-backups/nope")                       # exit 3 → fine
    fake.fail_once["deletefile"] = (1, "permission denied")
    with pytest.raises(StorageError):
        rc.delete("world-backups/nope")


def test_rclone_lsjson_timeout_is_a_storage_error(cloud_dir, fake):
    fake.base = cloud_dir.parent
    rc = RcloneStorage("fake:root", bin="rclone", runner=fake, timeouts={"lsjson": 0.2})
    fake.hang.add("lsjson")
    t0 = time.monotonic()
    with pytest.raises(StorageError, match="timed out"):
        rc.ls("world-backups")
    assert time.monotonic() - t0 < 5


def test_rclone_missing_binary_is_a_storage_error():
    def gone(argv, **kw):
        raise FileNotFoundError(argv[0])
    rc = RcloneStorage("onedrive:DnD/foundry", bin="/nope/rclone", runner=gone)
    with pytest.raises(StorageError, match="rclone not found"):
        rc.ls("world-backups")


def test_rclone_scrubs_secrets_from_errors(rc, fake):
    fake.fail_once["lsjson"] = (1, "access_token=eyJhbGciOi.secret\n"
                                   "Bearer abc123\nCouldn't list: 401 unauthorized")
    with pytest.raises(StorageError) as exc:
        rc.ls("world-backups")
    msg = str(exc.value)
    assert "eyJhbGciOi" not in msg and "abc123" not in msg
    assert "401 unauthorized" in msg


def test_rclone_exists_is_one_listing_per_folder(rc, fake, tmp_path):
    rc.upload(_src(tmp_path), "world-backups/a.tar.gz")
    fake.calls.clear()
    assert rc.exists("world-backups/a.tar.gz")
    assert not rc.exists("world-backups/b.tar.gz")
    assert fake.verbs() == []  # served from the listing cached by upload's size check
    rc.delete("world-backups/a.tar.gz")
    assert not rc.exists("world-backups/a.tar.gz")


def test_rclone_modtime_parses_to_utc_epoch():
    assert storage._parse_modtime("2026-10-11T03:04:12.123456789Z") == pytest.approx(
        1791687852.123456, abs=1e-3)
    assert storage._parse_modtime("2026-10-11T05:04:12+02:00") == pytest.approx(1791687852)
    assert storage._parse_modtime("2026-10-11T03:04:12Z") == pytest.approx(1791687852)


# argv snapshots: a flag change is a visible diff here.
COMMON = list(storage.COMMON_FLAGS)


def test_rclone_argv_snapshots(rc, fake, tmp_path):
    src = _src(tmp_path)
    rc.ls("assets")
    rc.read_text("world-backups/README.txt")
    rc.write_text("world-backups/README.txt", "x")
    rc.copy("world-backups/README.txt", "major-release/README.txt")
    rc.delete("major-release/README.txt")
    rc.upload(src, "world-backups/w.tar.gz")
    rc.download("world-backups/w.tar.gz", tmp_path / "dl.tar.gz")
    quiet = ["--stats", "30s", "--stats-one-line", "--log-level", "NOTICE"]
    assert fake.calls == [
        ["rclone", "lsjson", "--files-only", "--no-mimetype", "fake:root/assets", *COMMON],
        ["rclone", "cat", "fake:root/world-backups/README.txt", *COMMON],
        ["rclone", "rcat", "fake:root/world-backups/README.txt", *COMMON],
        ["rclone", "copyto", "fake:root/world-backups/README.txt",
         "fake:root/major-release/README.txt", *COMMON],
        ["rclone", "deletefile", "fake:root/major-release/README.txt", *COMMON],
        ["rclone", "copyto", str(src), "fake:root/world-backups/w.tar.gz.partial", *quiet, *COMMON],
        ["rclone", "moveto", "fake:root/world-backups/w.tar.gz.partial",
         "fake:root/world-backups/w.tar.gz", *COMMON],
        ["rclone", "lsjson", "--files-only", "--no-mimetype", "fake:root/world-backups", *COMMON],
        ["rclone", "copyto", "fake:root/world-backups/w.tar.gz", str(tmp_path / "dl.tar.gz"),
         *quiet, *COMMON],
    ]


def test_rclone_transfers_show_progress_on_a_tty(cloud_dir, fake, tmp_path):
    fake.base = cloud_dir.parent
    rc = RcloneStorage("fake:root", bin="rclone", runner=fake, interactive=True)
    rc.upload(_src(tmp_path), "world-backups/w.tar.gz")
    assert "--progress" in fake.calls[0]


# ── PENTARYN_CLOUD selection (§1.8) ─────────────────────────────────────────

def test_select_a_path_is_a_folder(tmp_path):
    s = storage.select(str(tmp_path / "c"))
    assert isinstance(s, FolderStorage) and s.root == str(tmp_path / "c")


def test_select_a_remote_is_rclone():
    s = storage.select("onedrive:DnD/foundry", runner=lambda *a, **k: None)
    assert isinstance(s, RcloneStorage) and s.root == "onedrive:DnD/foundry"


def test_select_a_windows_drive_is_a_folder():
    assert isinstance(storage.select(r"C:\cloud"), FolderStorage)


def test_select_unset_with_an_onedrive_remote_is_rclone(tmp_path):
    fake = FakeRclone(tmp_path, remotes=("gdrive", "onedrive"))
    s = storage.select(None, runner=fake, mac_folder=tmp_path / "nope")
    assert isinstance(s, RcloneStorage) and s.root == "onedrive:DnD/foundry"
    assert fake.verbs() == ["listremotes"]


def test_select_unset_without_the_remote_falls_back_to_the_mac_folder(tmp_path):
    fake = FakeRclone(tmp_path, remotes=("gdrive",))
    mac = tmp_path / "mac"
    mac.mkdir()
    s = storage.select(None, runner=fake, mac_folder=mac)
    assert isinstance(s, FolderStorage) and s.path == mac


def test_select_unset_with_nothing_names_the_fix(tmp_path):
    def gone(argv, **kw):
        raise FileNotFoundError(argv[0])
    with pytest.raises(StorageError, match="rclone config"):
        storage.select(None, runner=gone, mac_folder=tmp_path / "nope")


def test_select_mac_folder_is_an_explicit_opt_out(tmp_path):
    s = storage.select("mac-folder", mac_folder=tmp_path)
    assert isinstance(s, FolderStorage) and s.path == tmp_path


def test_entry_is_plain_data():
    assert Entry("a", 1, 2.0) == Entry("a", 1, 2.0)
