"""Modules and systems as content-addressed bundles — the local half.

Design: ``context/plans/module-bundles-2026-10.md`` (§3.2 names, §3.3 what counts as a
module, §3.4 fingerprint and cache, §7 code shape). The world snapshot carries only
``Data/worlds`` + ``Config``; every folder under ``Data/modules`` and ``Data/systems`` is a
bundle named ``<kind>@<id>@<version>@<fp>.tar.gz``, where ``fp`` is a content fingerprint
that ignores what a Foundry launch rewrites on its own (LevelDB housekeeping), so an
untouched module keeps its name across launches and across hosts.

This module has no cloud I/O of its own in this stage: it fingerprints, names, inventories,
builds and extracts. It imports :mod:`host` and :mod:`storage` only — never ``cloud`` — so
``cloud`` can import it.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tarfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, NamedTuple

from scripts.foundry import host
from scripts.foundry.storage import JUNK_NAMES

BUNDLES = "bundles"                       # the cloud subfolder (flat, shared by both hosts)
ROOTS = {"module": "Data/modules", "system": "Data/systems"}
MANIFEST_FILE = {"module": "module.json", "system": "system.json"}
FP_LEN = 16
GC_GRACE_SECONDS = 7 * 86400
CACHE_FILENAME = "pentaryn-bundle-cache.json"   # beside pentaryn-boot.json, outside snapshots
CACHE_SCHEMA = 1
TMP_DIRNAME = ".pentaryn-tmp"             # = cloud.TMP_DIRNAME; same filesystem as Data/
STAGING = "bundles"                       # under .pentaryn-tmp/
EXTRACT = "extract"                       # under .pentaryn-tmp/
LEVELDB_MARKER = "CURRENT"
LEVELDB_HOUSEKEEPING = {"LOCK", "LOG", "LOG.old", "CURRENT"}      # + MANIFEST-* + empty *.log
BUNDLE_NAME = re.compile(r"^(module|system)@([^@/]+)@([^@/]*)@([0-9a-f]{16})\.tar\.gz$")
CHUNK = 1024 * 1024

_VERSION_BAD = re.compile(r"[^A-Za-z0-9.+_-]")
_FP_RE = re.compile(r"^[0-9a-f]{16}$")
_PLURAL = {"module": "modules", "system": "systems"}


def log(msg: str) -> None:
    print(f"  {msg}")


# ── names ────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Ref:
    """A bundle by name: what a manifest or a cloud listing says."""

    kind: str
    id: str
    version: str
    fp: str

    @property
    def name(self) -> str:
        return f"{self.kind}@{self.id}@{self.version}@{self.fp}.tar.gz"

    @property
    def key(self) -> str:
        return f"{self.kind}/{self.id}"


@dataclass(frozen=True)
class Local(Ref):
    """A bundle as it sits on this machine: the folder, how many files and bytes it hashes."""

    path: Path
    files: int
    bytes: int


class Fingerprint(NamedTuple):
    fp: str
    files: int
    bytes: int


def sanitize_version(raw) -> str:
    """A version safe inside a bundle name: anything outside [A-Za-z0-9.+_-] → '-';
    missing, empty or not a string → '0'."""
    if not isinstance(raw, str) or not raw:
        return "0"
    return _VERSION_BAD.sub("-", raw)


def _check_id(kind: str, id: str) -> None:
    if kind not in ROOTS:
        raise ValueError(f"unknown bundle kind {kind!r} (want one of {sorted(ROOTS)})")
    if not id or "@" in id or "/" in id or "\\" in id or id in (".", ".."):
        raise ValueError(f"{kind} id {id!r} cannot be a bundle (no '@', '/', or empty)")


def bundle_name(kind: str, id: str, version, fp: str) -> str:
    _check_id(kind, id)
    if not _FP_RE.match(fp or ""):
        raise ValueError(f"fingerprint {fp!r} is not {FP_LEN} lowercase hex digits")
    return Ref(kind, id, sanitize_version(version), fp).name


def parse_bundle(name: str) -> Ref | None:
    """The Ref a bundle file name stands for, or None for anything else (a `.partial`, a
    world snapshot, a sidecar, junk)."""
    m = BUNDLE_NAME.match(name or "")
    return Ref(*m.groups()) if m else None


# ── the filtered file set and the fingerprint (§3.4) ─────────────────────────

def _junk(name: str) -> bool:
    return name in JUNK_NAMES or name.startswith("._")


def _housekeeping(name: str, size: int) -> bool:
    """Inside a LevelDB folder: what every open rewrites without changing the data."""
    return (name in LEVELDB_HOUSEKEEPING or name.startswith("MANIFEST-")
            or (name.endswith(".log") and size == 0))


def _walk(root: Path) -> list[tuple[str, Path, int, int]]:
    """Every regular file under `root` that the fingerprint covers, as
    (relpath_posix, path, size, mtime_ns), sorted by relpath. Symlinks are never followed;
    junk and AppleDouble names are skipped; in a folder holding a file named CURRENT
    (a LevelDB) the housekeeping files are skipped too, but a non-empty WAL is kept."""
    out: list[tuple[str, Path, int, int]] = []

    def visit(d: str, prefix: str) -> None:
        with os.scandir(d) as it:
            entries = list(it)
        leveldb = any(e.name == LEVELDB_MARKER and e.is_file(follow_symlinks=False)
                      for e in entries)
        for e in entries:
            if e.is_symlink():
                continue
            if e.is_dir(follow_symlinks=False):
                visit(e.path, f"{prefix}{e.name}/")
                continue
            if not e.is_file(follow_symlinks=False) or _junk(e.name):
                continue
            st = e.stat(follow_symlinks=False)
            if leveldb and _housekeeping(e.name, st.st_size):
                continue
            out.append((prefix + e.name, Path(e.path), st.st_size, st.st_mtime_ns))

    visit(os.fspath(root), "")
    out.sort(key=lambda t: t[0])
    return out


def _enc(text: str) -> bytes:
    return text.encode("utf-8", "surrogateescape")


def fingerprint(root: Path, *, files: list[tuple[str, Path, int, int]] | None = None
                ) -> Fingerprint:
    """The content fingerprint of a module/system folder. Pure — no cache. `files` lets a
    caller that already walked the folder pass that walk in."""
    files = _walk(Path(root)) if files is None else files
    h = hashlib.sha256()
    total = 0
    for rel, path, size, _mtime in files:
        h.update(_enc(rel) + b"\0" + str(size).encode() + b"\0")
        with open(path, "rb") as f:
            while chunk := f.read(CHUNK):
                h.update(chunk)
        h.update(b"\0")
        total += size
    return Fingerprint(h.hexdigest()[:FP_LEN], len(files), total)


def _sig(files: list[tuple[str, Path, int, int]]) -> str:
    """The stat signature of a filtered file set: what the cache keys a fingerprint on."""
    text = "\n".join(f"{rel}\0{size}\0{mtime_ns}" for rel, _p, size, mtime_ns in files)
    return hashlib.sha256(_enc(text)).hexdigest()


# ── the cache ────────────────────────────────────────────────────────────────

def _valid_entry(v) -> bool:
    return (isinstance(v, dict) and isinstance(v.get("sig"), str)
            and isinstance(v.get("fp"), str) and bool(_FP_RE.match(v["fp"]))
            and isinstance(v.get("files"), int) and isinstance(v.get("bytes"), int))


def _load_cache(path: Path) -> dict[str, dict]:
    """The cache's entries; anything missing, unreadable or malformed reads as empty."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict) or data.get("schema") != CACHE_SCHEMA:
        return {}
    entries = data.get("entries")
    if not isinstance(entries, dict):
        return {}
    return {k: v for k, v in entries.items() if isinstance(k, str) and _valid_entry(v)}


def _save_cache(path: Path, entries: dict[str, dict]) -> None:
    """Atomic (.tmp + os.replace). A failure only costs time next run, so it is not fatal."""
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_text(json.dumps({"schema": CACHE_SCHEMA, "entries": dict(sorted(
            entries.items()))}, indent=1) + "\n", encoding="utf-8")
        os.replace(tmp, path)
    except OSError as e:
        tmp.unlink(missing_ok=True)
        log(f"⚠ could not write the bundle cache {path}: {e}")


def _entry(files, fp: str, version: str) -> dict:
    return {"sig": _sig(files), "fp": fp, "version": version, "files": len(files),
            "bytes": sum(size for _r, _p, size, _m in files)}


# ── the inventory (§3.3) ─────────────────────────────────────────────────────

def local_inventory(*, cache: bool = True, warn: Callable[[str], None] | None = None
                    ) -> dict[str, Local]:
    """Every module and system on this machine that is a bundle, keyed "<kind>/<id>".

    A bundle is a direct, real (not symlinked) subfolder of the kind's root whose name has
    no '@' and which holds the kind's manifest file. Anything else is skipped with one
    warning line, and never deleted by a restore. Loose files (Foundry's README.txt), junk
    and AppleDouble names are ignored silently. With `cache`, a folder whose stat
    signature matches the cache reuses its fingerprint without reading a byte."""
    say = warn or log
    data = host.foundry_data()
    cache_path = data / CACHE_FILENAME
    old = _load_cache(cache_path) if cache else {}
    new: dict[str, dict] = {}
    inv: dict[str, Local] = {}
    for kind, rel_root in ROOTS.items():
        root = data / rel_root
        if not root.is_dir():
            continue
        with os.scandir(root) as it:
            entries = sorted(it, key=lambda e: e.name)
        for e in entries:
            name, where = e.name, f"{rel_root}/{e.name}"
            if e.is_symlink():
                if e.is_dir():
                    say(f"⚠ {where} skipped: a symlinked folder is not bundled")
                continue
            if not e.is_dir(follow_symlinks=False):
                continue
            if name.startswith("."):
                say(f"⚠ {where} skipped: a hidden folder is not bundled")
                continue
            if "@" in name:
                say(f"⚠ {where} refused: a {kind} folder name may not contain '@'")
                continue
            path = Path(e.path)
            mf = path / MANIFEST_FILE[kind]
            if not mf.is_file():
                say(f"⚠ {where} skipped: no {MANIFEST_FILE[kind]}")
                continue
            try:
                meta = json.loads(mf.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                meta = None
            if not isinstance(meta, dict):
                say(f"⚠ {where}: {MANIFEST_FILE[kind]} is not a JSON object — "
                    f"bundled under version 0")
                version = "0"
            else:
                version = sanitize_version(meta.get("version"))
                mid = meta.get("id")
                if mid is not None and mid != name:
                    say(f"⚠ {where}: {MANIFEST_FILE[kind]} says id {mid!r} — "
                        f"bundled under the folder name {name!r}")
            files = _walk(path)
            key = f"{kind}/{name}"
            hit = old.get(key)
            sig = _sig(files)
            if hit is not None and hit["sig"] == sig:
                fp = hit["fp"]
            else:
                fp = fingerprint(path, files=files).fp
            new[key] = _entry(files, fp, version)
            inv[key] = Local(kind, name, version, fp, path, new[key]["files"],
                             new[key]["bytes"])
    if cache and new != old:
        _save_cache(cache_path, new)
    return inv


# ── the manifest ─────────────────────────────────────────────────────────────

def manifest(inv: dict[str, Local]) -> dict:
    """{"modules": {id: bundle name}, "systems": {id: bundle name}}, keys sorted."""
    out: dict[str, dict[str, str]] = {"modules": {}, "systems": {}}
    for loc in sorted(inv.values(), key=lambda l: (l.kind, l.id)):
        out[_PLURAL[loc.kind]][loc.id] = loc.name
    return out


def manifest_keys(m: dict) -> dict[str, str]:
    """"<kind>/<id>" → bundle name, for every entry of a manifest."""
    out: dict[str, str] = {}
    for kind, plural in _PLURAL.items():
        for id, name in sorted((m.get(plural) or {}).items()):
            out[f"{kind}/{id}"] = name
    return out


def manifest_names(m: dict) -> set[str]:
    return set(manifest_keys(m).values())


# ── build / extract ──────────────────────────────────────────────────────────

def _members(root: Path) -> list[tuple[str, Path]]:
    """Every directory and file under `root` for the tar, root first then sorted by
    relpath: symlinks and junk skipped, LevelDB housekeeping kept (Foundry needs
    CURRENT → MANIFEST to open a pack)."""
    out: list[tuple[str, Path]] = [("", root)]

    def visit(d: str, prefix: str) -> None:
        with os.scandir(d) as it:
            entries = list(it)
        for e in entries:
            if e.is_symlink() or _junk(e.name):
                continue
            rel = prefix + e.name
            if e.is_dir(follow_symlinks=False):
                out.append((rel, Path(e.path)))
                visit(e.path, rel + "/")
            elif e.is_file(follow_symlinks=False):
                out.append((rel, Path(e.path)))

    visit(os.fspath(root), "")
    out[1:] = sorted(out[1:], key=lambda t: t[0])
    return out


def _anonymous(info: tarfile.TarInfo) -> tarfile.TarInfo:
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    return info


def build(local: Local, dest_dir: Path) -> Path:
    """Tar `local` to dest_dir/<bundle name> (written as .building, then renamed). Members
    are `<id>` and `<id>/<relpath>`, sorted, mtimes kept. Nothing is left on failure."""
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / local.name
    building = out.with_name(out.name + ".building")
    try:
        with tarfile.open(building, "w:gz") as tar:
            for rel, path in _members(Path(local.path)):
                arc = f"{local.id}/{rel}" if rel else local.id
                tar.add(path, arcname=arc, recursive=False, filter=_anonymous)
        os.replace(building, out)
    except BaseException:
        building.unlink(missing_ok=True)
        raise
    return out


def _check_members(tar_name: str, id: str, names: list[str]) -> None:
    if not names:
        raise ValueError(f"{tar_name}: empty bundle")
    for n in names:
        parts = n.split("/")
        if (not (n == id or n.startswith(id + "/")) or n.startswith("/")
                or ".." in parts or "\\" in n):
            raise ValueError(f"{tar_name}: member {n!r} is outside {id}/ — refused, "
                             f"nothing extracted")


def extract(tar: Path, kind: str, id: str, data_root: Path, *, seed_cache: bool = True
            ) -> None:
    """Put the bundle `tar` in place as data_root/<kind root>/<id>.

    Every member is checked to be `<id>` or under `<id>/` before anything is written.
    The tar is extracted (filter='data') to .pentaryn-tmp/extract/<id>; the folder in
    place, if any, is moved aside, the new one renamed in, and the old one removed — on a
    failed swap the old one is put back. The staging area is left clean either way. With
    `seed_cache`, the cache learns the extracted folder's fingerprint from the tar's name,
    so the next backup does not hash what it just downloaded."""
    tar, data_root = Path(tar), Path(data_root)
    _check_id(kind, id)
    dest = data_root / ROOTS[kind] / id
    if dest.is_symlink():
        raise ValueError(f"{dest} is a symlink — refusing to replace it")
    exdir = data_root / TMP_DIRNAME / EXTRACT
    staged, aside = exdir / id, exdir / f".old-{id}"
    with tarfile.open(tar, "r:gz") as tf:
        members = tf.getmembers()
        _check_members(tar.name, id, [m.name for m in members])
        try:
            for leftover in (staged, aside):
                if leftover.exists() or leftover.is_symlink():
                    shutil.rmtree(leftover)
            exdir.mkdir(parents=True, exist_ok=True)
            tf.extractall(exdir, members=members, filter="data")
            if not staged.is_dir():
                raise ValueError(f"{tar.name}: holds no {id}/ folder")
            dest.parent.mkdir(parents=True, exist_ok=True)
            moved = False
            if dest.exists():
                os.rename(dest, aside)
                moved = True
            try:
                os.rename(staged, dest)
            except BaseException:
                if moved and not dest.exists():
                    os.rename(aside, dest)
                raise
            if moved:
                shutil.rmtree(aside, ignore_errors=True)
        finally:
            if staged.exists():
                shutil.rmtree(staged, ignore_errors=True)
            try:
                exdir.rmdir()
            except OSError:
                pass
    if seed_cache:
        ref = parse_bundle(tar.name)
        if ref is not None and ref.kind == kind and ref.id == id:
            cache_path = data_root / CACHE_FILENAME
            entries = _load_cache(cache_path)
            entries[ref.key] = _entry(_walk(dest), ref.fp, ref.version)
            _save_cache(cache_path, entries)
