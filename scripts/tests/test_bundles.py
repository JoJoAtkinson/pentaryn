"""bundles.py alone: fingerprint, cache, names, inventory, build/extract.

Design: context/plans/module-bundles-2026-10.md §3.2–§3.4, §7; test matrix §8
("test_bundles.py"). No cloud, no rclone, no Foundry — the autouse ``fake_data`` fixture
points FOUNDRY_DATA at a temp root holding Data/modules/m and Data/worlds/w.
"""

from __future__ import annotations

import builtins
import json
import os
import shutil
import tarfile
from pathlib import Path

import pytest

from bundle_fakes import foundry_launch, make_leveldb_pack, make_module
from scripts.foundry import bundles
from scripts.foundry.bundles import Fingerprint, Local, Ref

FP = "0123456789abcdef"


def _copy_tree(src: Path, dst: Path, *, shift_ns: int = 0) -> Path:
    """Copy content only (fresh mtimes), then shift every mtime by `shift_ns`."""
    shutil.copytree(src, dst, copy_function=shutil.copyfile)
    if shift_ns:
        for p in [dst, *dst.rglob("*")]:
            st = p.stat()
            os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns + shift_ns))
    return dst


@pytest.fixture
def mod(tmp_path):
    return make_module(tmp_path / "a", "alpha", packs=2,
                       extra={"maps/big.webp": b"\x89map" * 1000})


# ── fingerprint ──────────────────────────────────────────────────────────────

def test_fingerprint_same_content_different_mtimes_is_same(mod, tmp_path):
    other = _copy_tree(mod, tmp_path / "b" / "alpha", shift_ns=-86_400_000_000_000)
    a, b = bundles.fingerprint(mod), bundles.fingerprint(other)
    assert isinstance(a, Fingerprint)
    assert a == b
    assert len(a.fp) == bundles.FP_LEN and all(c in "0123456789abcdef" for c in a.fp)


def test_fingerprint_one_changed_byte_differs(mod):
    before = bundles.fingerprint(mod).fp
    p = mod / "maps/big.webp"
    data = bytearray(p.read_bytes())
    data[100] ^= 1
    p.write_bytes(bytes(data))
    assert bundles.fingerprint(mod).fp != before


def test_fingerprint_renamed_file_differs(mod):
    before = bundles.fingerprint(mod).fp
    (mod / "maps/big.webp").rename(mod / "maps/big2.webp")
    assert bundles.fingerprint(mod).fp != before


def test_fingerprint_survives_a_foundry_launch(mod):
    """The key test: a launch rewrites every pack's housekeeping, the fp must not move."""
    before = bundles.fingerprint(mod)
    for pack in (mod / "packs").iterdir():
        foundry_launch(pack)
        foundry_launch(pack)
    names = sorted(p.name for p in (mod / "packs/pack0").iterdir())
    assert "MANIFEST-000148" not in names and "000149.log" not in names  # really rewritten
    assert bundles.fingerprint(mod) == before


def test_fingerprint_non_empty_wal_differs(mod):
    before = bundles.fingerprint(mod).fp
    (mod / "packs/pack0/000149.log").write_bytes(b"an unrecovered write")
    assert bundles.fingerprint(mod).fp != before


def test_fingerprint_changed_ldb_differs(mod):
    before = bundles.fingerprint(mod).fp
    (mod / "packs/pack0/000150.ldb").write_bytes(b"compacted table")
    assert bundles.fingerprint(mod).fp != before


def test_fingerprint_ignores_junk_and_appledouble(mod):
    before = bundles.fingerprint(mod)
    (mod / ".DS_Store").write_bytes(b"finder")
    (mod / "maps/Thumbs.db").write_bytes(b"win")
    (mod / "maps/._big.webp").write_bytes(b"appledouble")
    assert bundles.fingerprint(mod) == before


def test_fingerprint_counts_a_log_outside_a_leveldb(mod):
    """No CURRENT in the folder ⇒ a file named LOG is ordinary content."""
    before = bundles.fingerprint(mod)
    (mod / "scripts/LOG").write_text("changelog\n")
    after = bundles.fingerprint(mod)
    assert after.fp != before.fp and after.files == before.files + 1
    rels = [r for r, *_ in bundles._walk(mod)]
    assert "scripts/LOG" in rels


def test_walk_leveldb_rules(mod):
    rels = [r for r, *_ in bundles._walk(mod)]
    assert rels == sorted(rels)
    pack = [r.split("/")[-1] for r in rels if r.startswith("packs/pack0/")]
    assert pack == ["000013.ldb"]
    (mod / "packs/pack0/000149.log").write_bytes(b"x")
    rels = [r for r, *_ in bundles._walk(mod)]
    assert "packs/pack0/000149.log" in rels


def test_fingerprint_skips_symlinks(mod, tmp_path):
    before = bundles.fingerprint(mod)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.bin").write_bytes(b"not part of the module")
    (mod / "linked-dir").symlink_to(outside, target_is_directory=True)
    (mod / "linked-file").symlink_to(outside / "secret.bin")
    assert bundles.fingerprint(mod) == before


def test_fingerprint_counts_files_and_bytes(tmp_path):
    d = tmp_path / "x"
    d.mkdir()
    (d / "a").write_bytes(b"12345")
    (d / "sub").mkdir()
    (d / "sub/b").write_bytes(b"678")
    assert bundles.fingerprint(d)[1:] == (2, 8)


def test_fingerprint_streams_large_files(tmp_path, monkeypatch):
    d = tmp_path / "big"
    d.mkdir()
    blob = os.urandom(5 * 1024 * 1024 + 17)
    (d / "blob.bin").write_bytes(blob)
    expected = bundles.fingerprint(d)

    def no_read_bytes(self):  # pragma: no cover - only runs on a regression
        raise AssertionError("read_bytes used; files must be streamed")

    reads: list[int] = []
    real_open = builtins.open

    class Spy:
        def __init__(self, f):
            self.f = f

        def read(self, n=-1):
            assert n is not None and 0 < n <= 1024 * 1024, f"read({n}) is not chunked"
            data = self.f.read(n)
            reads.append(len(data))
            return data

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            self.f.close()

        def __getattr__(self, name):
            return getattr(self.f, name)

    def spy_open(file, mode="r", *a, **k):
        f = real_open(file, mode, *a, **k)
        return Spy(f) if "b" in mode and str(file).endswith("blob.bin") else f

    monkeypatch.setattr(Path, "read_bytes", no_read_bytes)
    monkeypatch.setattr(builtins, "open", spy_open)
    assert bundles.fingerprint(d) == expected
    assert sum(reads) == len(blob) and len(reads) >= 6


# ── names ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,clean", [
    ("1.2.3-beta+5", "1.2.3-beta+5"), ("v2", "v2"), ("1 2", "1-2"), ("a@b", "a-b"),
    ("3/4", "3-4"), ("", "0"), (None, "0"), (2, "0"), ("1.0_rc", "1.0_rc"),
])
def test_sanitize_version(raw, clean):
    assert bundles.sanitize_version(raw) == clean


@pytest.mark.parametrize("version", ["1.2.3-beta+5", "v2", "1 2", "a@b", "0"])
def test_name_round_trip(version):
    name = bundles.bundle_name("module", "dnd-monster-manual", version, FP)
    ref = bundles.parse_bundle(name)
    assert ref == Ref("module", "dnd-monster-manual", bundles.sanitize_version(version), FP)
    assert ref.name == name
    assert ref.key == "module/dnd-monster-manual"
    assert name == f"module@dnd-monster-manual@{bundles.sanitize_version(version)}@{FP}.tar.gz"


def test_system_name_round_trip():
    ref = bundles.parse_bundle(f"system@dnd5e@6.0.6@{FP}.tar.gz")
    assert ref == Ref("system", "dnd5e", "6.0.6", FP) and ref.key == "system/dnd5e"


def test_bundle_name_refuses_bad_ids():
    with pytest.raises(ValueError):
        bundles.bundle_name("module", "a@b", "1", FP)
    with pytest.raises(ValueError):
        bundles.bundle_name("module", "a/b", "1", FP)
    with pytest.raises(ValueError):
        bundles.bundle_name("world", "a", "1", FP)
    with pytest.raises(ValueError):
        bundles.bundle_name("module", "a", "1", "xyz")


@pytest.mark.parametrize("name", [
    f"module@m@1@{FP}.tar.gz.partial",
    f"module@m@1@{FP}.tar.gz.building",
    "world-2026-10-11-212143-fvtt14.369-mac.tar.gz",
    "world-2026-10-11-212143-fvtt14.369-mac.tar.gz.parent",
    f"world@m@1@{FP}.tar.gz",
    f"module@m@1@{FP[:-1]}.tar.gz",
    f"module@m@1@{FP.upper()}.tar.gz",
    f"module@a@b@1@{FP}.tar.gz",
    ".DS_Store",
])
def test_non_bundles_do_not_parse(name):
    assert bundles.parse_bundle(name) is None


# ── inventory ────────────────────────────────────────────────────────────────

@pytest.fixture
def modules_root(fake_data):
    return fake_data / "Data/modules"


def _inv(warnings=None, **kw):
    sink = warnings if warnings is not None else []
    return bundles.local_inventory(warn=sink.append, **kw)


def test_inventory_finds_the_fixture_module(fake_data):
    inv = _inv()
    assert list(inv) == ["module/m"]
    m = inv["module/m"]
    assert isinstance(m, Local)
    assert (m.kind, m.id, m.version) == ("module", "m", "0")
    assert m.path == fake_data / "Data/modules/m"
    assert m.files == 1 and m.bytes == len('{"id": "m"}\n')
    assert m.fp == bundles.fingerprint(m.path).fp
    assert m.name == f"module@m@0@{m.fp}.tar.gz"


def test_inventory_finds_systems(fake_data):
    sysdir = fake_data / "Data/systems/dnd5e"
    sysdir.mkdir(parents=True)
    (sysdir / "system.json").write_text(json.dumps({"id": "dnd5e", "version": "6.0.6"}))
    (fake_data / "Data/systems/nomanifest").mkdir()
    (fake_data / "Data/systems/nomanifest/module.json").write_text("{}")
    warnings: list[str] = []
    inv = _inv(warnings)
    assert sorted(inv) == ["module/m", "system/dnd5e"]
    assert inv["system/dnd5e"].version == "6.0.6"
    assert inv["system/dnd5e"].name.startswith("system@dnd5e@6.0.6@")
    assert any("nomanifest" in w for w in warnings)


def test_inventory_rules(modules_root, tmp_path):
    make_module(modules_root, "good", version="2.1")
    (modules_root / "README.txt").write_text("Foundry's own readme")
    (modules_root / ".DS_Store").write_bytes(b"")
    (modules_root / "._good").write_bytes(b"")
    target = make_module(tmp_path / "elsewhere", "linked")
    (modules_root / "linked").symlink_to(target, target_is_directory=True)
    make_module(modules_root, ".hidden")
    (modules_root / "empty-leftover").mkdir()
    (modules_root / "empty-leftover/stuff.txt").write_text("x")
    make_module(modules_root, "notjson", manifest_text="{ not json")
    make_module(modules_root, "renamed", manifest_text=json.dumps({"id": "original",
                                                                   "version": "1"}))
    make_module(modules_root, "at@sign")
    warnings: list[str] = []
    inv = _inv(warnings)
    assert sorted(inv) == ["module/good", "module/m", "module/notjson", "module/renamed"]
    assert inv["module/good"].version == "2.1"
    assert inv["module/notjson"].version == "0"
    assert inv["module/renamed"].id == "renamed"
    text = "\n".join(warnings)
    for needle in ("linked", ".hidden", "empty-leftover", "notjson", "renamed", "at@sign"):
        assert sum(needle in w for w in warnings) == 1, (needle, text)
    for silent in ("README.txt", ".DS_Store", "._good"):
        assert silent not in text
    assert len(warnings) == 6


def test_inventory_warns_through_log_by_default(modules_root, capsys):
    (modules_root / "leftover").mkdir()
    bundles.local_inventory()
    assert "leftover" in capsys.readouterr().out


def test_inventory_without_a_modules_root(fake_data):
    shutil.rmtree(fake_data / "Data/modules")
    assert _inv() == {}


# ── cache ────────────────────────────────────────────────────────────────────

@pytest.fixture
def counting(monkeypatch):
    calls: list[Path] = []
    real = bundles.fingerprint

    def counted(root, *a, **k):
        calls.append(Path(root))
        return real(root, *a, **k)

    monkeypatch.setattr(bundles, "fingerprint", counted)
    return calls


def test_cache_second_inventory_hashes_nothing(modules_root, fake_data, counting, monkeypatch):
    make_module(modules_root, "alpha")
    make_module(modules_root, "beta")
    first = _inv()
    assert len(counting) == 3
    cache = fake_data / bundles.CACHE_FILENAME
    data = json.loads(cache.read_text())
    assert data["schema"] == 1
    assert sorted(data["entries"]) == ["module/alpha", "module/beta", "module/m"]
    assert data["entries"]["module/alpha"]["fp"] == first["module/alpha"].fp
    assert not list(fake_data.glob("*.tmp"))
    counting.clear()

    real_open = builtins.open

    def no_content_reads(file, mode="r", *a, **k):
        if "b" in mode and str(file).startswith(str(modules_root)):
            raise AssertionError(f"read bytes of {file}")
        return real_open(file, mode, *a, **k)

    monkeypatch.setattr(builtins, "open", no_content_reads)
    second = _inv()
    assert counting == []
    assert second == first


def test_cache_survives_a_foundry_launch(modules_root, counting):
    d = make_module(modules_root, "alpha", packs=2)
    first = _inv()
    counting.clear()
    for pack in (d / "packs").iterdir():
        foundry_launch(pack)
    assert _inv() == first
    assert counting == []


def test_cache_touched_file_rehashes_only_that_module(modules_root, counting):
    make_module(modules_root, "alpha")
    b = make_module(modules_root, "beta")
    first = _inv()
    counting.clear()
    st = (b / "scripts/main.js").stat()
    os.utime(b / "scripts/main.js", ns=(st.st_atime_ns, st.st_mtime_ns + 10**9))
    second = _inv()
    assert counting == [b]
    assert second["module/beta"].fp == first["module/beta"].fp  # same bytes, new mtime


def test_cache_changed_content_gets_new_fp(modules_root, counting):
    b = make_module(modules_root, "beta")
    first = _inv()
    (b / "scripts/main.js").write_text("changed\n")
    assert _inv()["module/beta"].fp != first["module/beta"].fp


@pytest.mark.parametrize("text", ["", "{ broken", "[]", '{"schema": 99, "entries": {}}',
                                  '{"schema": 1, "entries": []}',
                                  '{"schema": 1, "entries": {"module/m": "x"}}',
                                  '{"schema": 1, "entries": {"module/m": {"sig": 1}}}'])
def test_corrupt_cache_is_harmless(fake_data, text, counting):
    expected = bundles.local_inventory(cache=False, warn=lambda m: None)
    counting.clear()
    (fake_data / bundles.CACHE_FILENAME).write_text(text)
    assert _inv() == expected
    assert counting == [fake_data / "Data/modules/m"]
    assert json.loads((fake_data / bundles.CACHE_FILENAME).read_text())["schema"] == 1


def test_cache_false_neither_reads_nor_writes(fake_data, counting):
    _inv(cache=False)
    _inv(cache=False)
    assert len(counting) == 2
    assert not (fake_data / bundles.CACHE_FILENAME).exists()


def test_inventory_signs_each_folder_once(modules_root, fake_data, monkeypatch):
    make_module(modules_root, "alpha")
    make_module(modules_root, "beta")
    calls: list[int] = []
    real = bundles._sig

    def counted(files):
        calls.append(len(files))
        return real(files)

    monkeypatch.setattr(bundles, "_sig", counted)
    first = _inv()
    assert len(calls) == len(first) == 3
    cache = fake_data / bundles.CACHE_FILENAME
    before = cache.read_bytes()
    calls.clear()
    assert _inv() == first
    assert len(calls) == 3
    assert cache.read_bytes() == before


def test_cache_drops_removed_modules(modules_root, fake_data):
    make_module(modules_root, "gone")
    _inv()
    shutil.rmtree(modules_root / "gone")
    _inv()
    entries = json.loads((fake_data / bundles.CACHE_FILENAME).read_text())["entries"]
    assert sorted(entries) == ["module/m"]


# ── manifest ─────────────────────────────────────────────────────────────────

def test_manifest_shapes(fake_data):
    sysdir = fake_data / "Data/systems/dnd5e"
    sysdir.mkdir(parents=True)
    (sysdir / "system.json").write_text(json.dumps({"id": "dnd5e", "version": "6.0.6"}))
    make_module(fake_data / "Data/modules", "zeta")
    make_module(fake_data / "Data/modules", "alpha")
    inv = _inv()
    m = bundles.manifest(inv)
    assert list(m) == ["modules", "systems"]
    assert list(m["modules"]) == ["alpha", "m", "zeta"]
    assert m["modules"]["alpha"] == inv["module/alpha"].name
    assert m["systems"] == {"dnd5e": inv["system/dnd5e"].name}
    assert bundles.manifest_names(m) == {loc.name for loc in inv.values()}
    assert bundles.manifest_keys(m) == {k: loc.name for k, loc in inv.items()}
    assert json.loads(json.dumps(m)) == m


def test_manifest_helpers_tolerate_missing_parts():
    assert bundles.manifest_names({}) == set()
    assert bundles.manifest_keys({"modules": {"a": "n"}}) == {"module/a": "n"}


# ── build / extract ──────────────────────────────────────────────────────────

def _local(path: Path, kind="module") -> Local:
    f = bundles.fingerprint(path)
    return Local(kind, path.name, "1.0.0", f.fp, path, f.files, f.bytes)


def test_build_members(mod, tmp_path):
    (mod / ".DS_Store").write_bytes(b"x")
    (mod / "maps/._big.webp").write_bytes(b"x")
    (mod / "link").symlink_to(mod / "module.json")
    loc = _local(mod)
    out = bundles.build(loc, tmp_path / "staging")
    assert out == tmp_path / "staging" / loc.name
    assert not list((tmp_path / "staging").glob("*.building"))
    with tarfile.open(out) as tar:
        members = tar.getmembers()
    names = [m.name for m in members]
    assert names[0] == "alpha"
    assert all(n == "alpha" or n.startswith("alpha/") for n in names)
    assert names == ["alpha"] + sorted(n for n in names if n != "alpha")
    for hk in ("CURRENT", "LOCK", "LOG", "LOG.old", "MANIFEST-000148", "000149.log",
               "000013.ldb"):
        assert f"alpha/packs/pack0/{hk}" in names
    assert "alpha/packs/pack0" in names and "alpha/maps" in names
    assert not any(n.endswith((".DS_Store", "._big.webp", "/link")) for n in names)
    by = {m.name: m for m in members}
    assert by["alpha/maps/big.webp"].mtime == pytest.approx(
        (mod / "maps/big.webp").stat().st_mtime, abs=1)
    assert len(set(names)) == len(names)


def test_build_failure_leaves_nothing(mod, tmp_path, monkeypatch):
    loc = _local(mod)
    staging = tmp_path / "staging"

    def boom(self, *a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(tarfile.TarFile, "addfile", boom)
    with pytest.raises(OSError):
        bundles.build(loc, staging)
    assert list(staging.iterdir()) == []


def test_build_then_extract_round_trip_keeps_fingerprint(mod, fake_data, tmp_path):
    loc = _local(mod)
    tar = bundles.build(loc, tmp_path / "staging")
    bundles.extract(tar, "module", "alpha", fake_data)
    dest = fake_data / "Data/modules/alpha"
    assert bundles.fingerprint(dest) == bundles.fingerprint(mod)
    assert (dest / "packs/pack0/CURRENT").read_text() == "MANIFEST-000148\n"
    assert (dest / "maps/big.webp").stat().st_mtime == pytest.approx(
        (mod / "maps/big.webp").stat().st_mtime, abs=1)


def test_extract_swaps_and_cleans_up(mod, fake_data, tmp_path):
    old = make_module(fake_data / "Data/modules", "alpha", version="0.9",
                      extra={"stale.txt": b"old only"})
    tar = bundles.build(_local(mod), tmp_path / "staging")
    bundles.extract(tar, "module", "alpha", fake_data)
    dest = fake_data / "Data/modules/alpha"
    assert not (dest / "stale.txt").exists()
    assert (dest / "maps/big.webp").exists()
    tmpdir = fake_data / bundles.TMP_DIRNAME
    assert not (tmpdir / bundles.EXTRACT).exists() or not any(
        (tmpdir / bundles.EXTRACT).iterdir())
    assert (fake_data / "Data/modules/m/module.json").exists()  # neighbours untouched


def test_extract_seeds_the_cache(mod, fake_data, tmp_path, counting):
    tar = bundles.build(_local(mod), tmp_path / "staging")
    bundles.extract(tar, "module", "alpha", fake_data)
    entries = json.loads((fake_data / bundles.CACHE_FILENAME).read_text())["entries"]
    assert entries["module/alpha"]["fp"] == bundles.parse_bundle(tar.name).fp
    counting.clear()
    inv = _inv()
    assert fake_data / "Data/modules/alpha" not in counting
    assert inv["module/alpha"].fp == bundles.parse_bundle(tar.name).fp


def _evil_tar(path: Path, names: list[str]) -> Path:
    import io
    with tarfile.open(path, "w:gz") as tar:
        for n in names:
            data = b"x"
            info = tarfile.TarInfo(n)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return path


@pytest.mark.parametrize("bad", ["other/file.txt", "alphabet/file.txt", "../escape.txt",
                                 "alpha/../escape.txt", "/abs/alpha/x"])
def test_extract_refuses_a_foreign_member(fake_data, tmp_path, bad):
    existing = make_module(fake_data / "Data/modules", "alpha")
    before = sorted(str(p.relative_to(fake_data)) for p in fake_data.rglob("*"))
    tar = _evil_tar(tmp_path / f"module@alpha@1@{FP}.tar.gz", ["alpha/ok.txt", bad])
    with pytest.raises(ValueError):
        bundles.extract(tar, "module", "alpha", fake_data)
    after = sorted(str(p.relative_to(fake_data)) for p in fake_data.rglob("*"))
    assert after == before
    assert existing.exists()


def test_extract_failure_mid_way_restores_nothing_and_cleans(fake_data, tmp_path, monkeypatch):
    existing = make_module(fake_data / "Data/modules", "alpha")
    tar = _evil_tar(tmp_path / f"module@alpha@1@{FP}.tar.gz", ["alpha/ok.txt", "alpha/two"])

    def boom(self, *a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(tarfile.TarFile, "extractall", boom)
    with pytest.raises(OSError):
        bundles.extract(tar, "module", "alpha", fake_data)
    assert (existing / "module.json").exists()
    ex = fake_data / bundles.TMP_DIRNAME / bundles.EXTRACT
    assert not ex.exists() or not any(ex.iterdir())


def test_extract_into_missing_root(fake_data, tmp_path, mod):
    tar = bundles.build(_local(mod, kind="system"), tmp_path / "staging")
    assert tar.name.startswith("system@alpha@")
    bundles.extract(tar, "system", "alpha", fake_data)
    assert (fake_data / "Data/systems/alpha/module.json").exists()


def test_inventory_with_save_false_reads_the_cache_but_never_writes_it(fake_data):
    from bundle_fakes import make_module
    make_module(fake_data / "Data/modules", "alpha")
    cache = fake_data / bundles.CACHE_FILENAME
    first = bundles.local_inventory(save=False)
    assert not cache.exists()
    bundles.local_inventory()
    assert cache.exists()
    before = cache.read_bytes()
    make_module(fake_data / "Data/modules", "beta")
    again = bundles.local_inventory(save=False)
    assert cache.read_bytes() == before                   # beta hashed, not recorded
    assert again["module/alpha"].name == first["module/alpha"].name
    assert "module/beta" in again
