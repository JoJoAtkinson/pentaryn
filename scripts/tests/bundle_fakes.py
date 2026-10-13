"""Realistic LevelDB pack folders for the bundle tests (module-bundles-2026-10 §8).

Foundry keeps every compendium pack as a LevelDB folder and rewrites its housekeeping on
every launch, even for packs nobody edits: ``CURRENT`` points at a new ``MANIFEST-nnnnnn``,
``LOG`` is rotated to ``LOG.old``, and the empty write-ahead ``nnnnnn.log`` is replaced by
a new empty one with a new number. The ``*.ldb`` data files are left alone. These helpers
reproduce exactly that on disk, so the fingerprint can be tested against what a launch does.
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path

DEFAULT_LDB = {"000013.ldb": b"leveldb table bytes \x00\x01\x02 for pack entries"}


def _bump(path: Path, when_ns: int) -> None:
    os.utime(path, ns=(when_ns, when_ns))


def make_leveldb_pack(dir: Path, ldb: dict[str, bytes] | None = None, manifest_no: int = 148,
                      wal_no: int = 149) -> Path:
    """A pack folder as Foundry leaves it after one launch."""
    dir = Path(dir)
    dir.mkdir(parents=True, exist_ok=True)
    for name, data in (DEFAULT_LDB if ldb is None else ldb).items():
        (dir / name).write_bytes(data)
    (dir / "CURRENT").write_text(f"MANIFEST-{manifest_no:06d}\n")
    (dir / f"MANIFEST-{manifest_no:06d}").write_bytes(
        b"manifest " + str(manifest_no).encode() + b" edits")
    (dir / "LOG").write_text(f"launch log for manifest {manifest_no}\n")
    (dir / "LOG.old").write_text("an older launch log\n")
    (dir / "LOCK").write_bytes(b"")
    (dir / f"{wal_no:06d}.log").write_bytes(b"")
    return dir


def _numbers(dir: Path) -> tuple[int, int]:
    manifest = int((dir / "CURRENT").read_text().strip().split("-")[1])
    wals = [int(p.stem) for p in dir.iterdir() if re.fullmatch(r"\d{6}\.log", p.name)]
    return manifest, max(wals) if wals else manifest + 1


def foundry_launch(dir: Path) -> None:
    """What one Foundry launch does to a pack nobody wrote to."""
    dir = Path(dir)
    manifest_no, wal_no = _numbers(dir)
    new_manifest, new_wal = wal_no + 1, wal_no + 2
    (dir / f"MANIFEST-{manifest_no:06d}").unlink()
    (dir / f"MANIFEST-{new_manifest:06d}").write_bytes(
        b"manifest " + str(new_manifest).encode() + b" edits, rewritten at open")
    (dir / "CURRENT").write_text(f"MANIFEST-{new_manifest:06d}\n")
    os.replace(dir / "LOG", dir / "LOG.old")
    (dir / "LOG").write_text(f"launch log for manifest {new_manifest} at {time.time()}\n")
    old_wal = dir / f"{wal_no:06d}.log"
    if old_wal.exists() and old_wal.stat().st_size == 0:
        old_wal.unlink()
    (dir / f"{new_wal:06d}.log").write_bytes(b"")
    (dir / "LOCK").write_bytes(b"")
    later = time.time_ns() + 3_600_000_000_000
    for name in ("CURRENT", "LOG", "LOG.old", "LOCK", f"MANIFEST-{new_manifest:06d}",
                 f"{new_wal:06d}.log"):
        _bump(dir / name, later)


def make_module(root: Path, id: str, *, version: str | None = "1.0.0", packs: int = 1,
                extra: dict[str, bytes] | None = None, manifest_text: str | None = None) -> Path:
    """A module folder: module.json, a script, `packs` LevelDB packs, any extra files."""
    import json
    d = Path(root) / id
    d.mkdir(parents=True, exist_ok=True)
    if manifest_text is None:
        data = {"id": id}
        if version is not None:
            data["version"] = version
        manifest_text = json.dumps(data)
    (d / "module.json").write_text(manifest_text)
    (d / "scripts").mkdir(exist_ok=True)
    (d / "scripts/main.js").write_text(f"console.log('{id}');\n")
    for i in range(packs):
        make_leveldb_pack(d / "packs" / f"pack{i}")
    for rel, data in (extra or {}).items():
        p = d / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    return d


class _CountingFile:
    """A read-only file whose reads add to `counter[key]` (bytes handed to the reader)."""

    def __init__(self, fh, counter: dict, key: str):
        self._fh, self._counter, self._key = fh, counter, key

    def _add(self, n: int) -> None:
        self._counter[self._key] = self._counter.get(self._key, 0) + n

    def read(self, *a):
        data = self._fh.read(*a)
        self._add(len(data))
        return data

    def read1(self, *a):
        data = self._fh.read1(*a)
        self._add(len(data))
        return data

    def readinto(self, b):
        n = self._fh.readinto(b) or 0
        self._add(n)
        return n

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._fh.close()

    def __iter__(self):
        return iter(self._fh)

    def __getattr__(self, name):
        return getattr(self._fh, name)


def count_tar_reads(monkeypatch, suffix: str = ".tar.gz") -> dict[str, int]:
    """Patch every way the bundle code opens a file so reads of a `*<suffix>` file are
    counted by its name: builtins.open (which gzip uses), tarfile's own bltn_open, and
    os.open/os.read — tarfile's stream modes ('r|gz') read through a raw fd
    (_LowLevelFile), which the first two never see. Returns the live
    {file name: bytes read} map — bytes read / file size is how many times that tar was
    read end to end (PERF-2)."""
    import builtins
    import tarfile

    counter: dict[str, int] = {}
    real = builtins.open
    real_os_open, real_os_read, real_os_close = os.open, os.read, os.close
    fds: dict[int, str] = {}                     # raw fd → tar name, while it is open

    def _counted(file) -> bool:
        return isinstance(file, (str, os.PathLike)) and os.fspath(file).endswith(suffix)

    def counting_open(file, mode="r", *a, **k):
        fh = real(file, mode, *a, **k)
        if _counted(file) and "r" in mode and "+" not in mode:
            return _CountingFile(fh, counter, Path(file).name)
        return fh

    def counting_os_open(path, flags, *a, **k):
        fd = real_os_open(path, flags, *a, **k)
        if _counted(path) and flags & (os.O_WRONLY | os.O_RDWR) == 0:
            fds[fd] = Path(path).name
        return fd

    def counting_os_read(fd, n):
        data = real_os_read(fd, n)
        if fd in fds:
            counter[fds[fd]] = counter.get(fds[fd], 0) + len(data)
        return data

    def counting_os_close(fd):
        fds.pop(fd, None)
        return real_os_close(fd)

    monkeypatch.setattr(builtins, "open", counting_open)
    monkeypatch.setattr(tarfile, "bltn_open", counting_open)
    monkeypatch.setattr(os, "open", counting_os_open)
    monkeypatch.setattr(os, "read", counting_os_read)
    monkeypatch.setattr(os, "close", counting_os_close)
    return counter
