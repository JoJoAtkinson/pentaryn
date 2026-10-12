"""The cloud store's mechanics — one small interface, two implementations.

``cloud.py`` keeps the *policy* (one-way rules, retention, coalescing, promotion,
the boot choice's inputs); everything that actually touches the cloud goes through a
:class:`Storage` from here. Design: ``context/plans/rclone-two-hosts-2026-10.md`` §1.

- :class:`FolderStorage` — plain ``Path`` operations on a folder. The fallback on a Mac
  with the OneDrive app and no rclone remote, and the fake cloud every test uses.
- :class:`RcloneStorage` — the same nine operations through the ``rclone`` binary, so a
  machine without the OneDrive app (BOSS, in WSL) reaches the same ``DnD/foundry`` folder.

``rel`` paths are always ``"<subfolder>/<name>"`` relative to the cloud root, forward
slashes, never absolute.

Two rules that hold for both implementations:

* **An upload is never visible under its real name until it is complete.** It is written
  to ``<rel>.partial`` and renamed; ``ls`` never returns a ``.partial``, so an
  interrupted 3 GB upload can never be parsed as a snapshot.
* **No secret ever reaches an argv or a log.** ``--config`` is never passed (rclone finds
  its own config), the config path is never printed, and the stderr attached to a
  failure is scrubbed of any token-looking line.

An upload whose size check fails deletes what it wrote — except in a
``CONTENT_ADDRESSED`` folder (``bundles/``), where the file there may be the other
host's same-name upload: it raises :class:`Superseded` and deletes nothing.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Protocol

SUBFOLDERS = ("assets", "world-backups", "system-backup", "major-release", "bundles")
JUNK_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
PARTIAL = ".partial"
# Folders whose file names are content-addressed: a name IS its content, and either host
# may write it at any time (bundles.py). An upload's size check never deletes there — see
# `upload` and `Superseded`.
CONTENT_ADDRESSED = frozenset({"bundles"})

# The Mac's OneDrive app folder: today's cloud, and the fallback when rclone has no remote.
MAC_FOLDER = Path.home() / "Library/CloudStorage/OneDrive-Personal/DnD/foundry"
DEFAULT_REMOTE = "onedrive:DnD/foundry"


class StorageError(RuntimeError):
    """Any failure touching the cloud: rclone exit, timeout, missing binary, folder error.

    Callers decide whether it is fatal (a backup: yes) or degradable (the boot choice:
    no — it boots the local world with a warning)."""

    def __init__(self, msg: str, *, verb: str = "", code: int | None = None):
        super().__init__(msg)
        self.verb = verb
        self.code = code


class Superseded(StorageError):
    """An upload into a CONTENT_ADDRESSED folder landed, and by the size check the name
    held another writer's file: the other host uploaded the same name a moment later. By
    construction that is the same content, archived on another machine (another zlib,
    other mtimes — so another size). Nothing was deleted; the caller decides (a bundle
    upload accepts it: the name is there, review DL7)."""


def _superseded(rel: str, got: int, want: int) -> Superseded:
    return Superseded(f"upload of {rel}: the cloud holds {got} B, ours was {want} B — another "
                      "writer's file of the same name replaced ours; left in place",
                      verb="moveto")


@dataclass(frozen=True)
class Entry:
    name: str          # basename
    size: int          # bytes
    mtime: float       # epoch seconds, UTC


class Storage(Protocol):
    kind: str          # "folder" | "rclone"
    root: str          # display only

    def ls(self, sub: str, *, must_exist: bool = False) -> list[Entry]: ...
    def partials(self, sub: str) -> list[Entry]: ...
    def exists(self, rel: str) -> bool: ...
    def read_text(self, rel: str) -> str | None: ...
    def read_head(self, rel: str, n: int) -> bytes | None: ...
    def write_text(self, rel: str, text: str) -> None: ...
    def download(self, rel: str, dest: Path) -> Path: ...
    def upload(self, src: Path, rel: str) -> None: ...
    def copy(self, src_rel: str, dst_rel: str) -> None: ...
    def delete(self, rel: str) -> None: ...
    def touch(self, rel: str) -> None: ...
    def mkdirs(self) -> None: ...
    def refresh(self, sub: str) -> None: ...


def refresh(st: "Storage", sub: str) -> None:
    """Forget any listing of `sub` this process holds, so the next `ls` asks the cloud.

    An `RcloneStorage` keeps each folder's listing for the life of the process and clears
    it only after its own writes there; what the OTHER host did since is invisible until
    then. Every check whose point is "what is in the cloud now" (the post-upload verify,
    the GC mark and sweep, a restore's plan, a backup's first listing) refreshes first."""
    fn = getattr(st, "refresh", None)
    if fn is not None:
        fn(sub)


def _visible(name: str) -> bool:
    """A name `ls` returns: no junk, no dotfiles, no half-uploaded `.partial`."""
    return not (name in JUNK_NAMES or name.startswith(".") or name.endswith(PARTIAL))


def _check_rel(rel: str) -> str:
    if not rel or rel.startswith("/") or "\\" in rel or ".." in rel.split("/"):
        raise StorageError(f"bad cloud path {rel!r} (must be '<subfolder>/<name>')")
    return rel


def _split(rel: str) -> tuple[str, str]:
    head, _, name = _check_rel(rel).rpartition("/")
    return head, name


# ── FolderStorage ────────────────────────────────────────────────────────────

class FolderStorage:
    """Today's behaviour: a mounted folder (the OneDrive app's, or a test's temp dir)."""

    kind = "folder"

    def __init__(self, root: Path | str):
        self.path = Path(root).expanduser()
        self.root = str(self.path)

    def _p(self, rel: str) -> Path:
        return self.path / _check_rel(rel)

    def _entries(self, sub: str, must_exist: bool = False) -> list[Entry]:
        d = self.path / sub if sub else self.path
        try:
            items = list(d.iterdir())
        except FileNotFoundError as exc:
            if must_exist:
                raise StorageError(f"cannot list {sub or '/'}: the folder is not found",
                                   verb="ls") from exc
            return []
        except OSError as exc:
            raise StorageError(f"cannot list {sub or '/'}: {exc}", verb="ls") from exc
        out = []
        for p in items:
            try:
                if not p.is_file():
                    continue
                st = p.stat()
            except OSError:
                continue
            out.append(Entry(p.name, st.st_size, st.st_mtime))
        return sorted(out, key=lambda e: e.name)

    def ls(self, sub: str, *, must_exist: bool = False) -> list[Entry]:
        """The visible files in `sub`. A folder that is not there lists as empty — unless
        `must_exist`: then it raises StorageError (the GC mark: "cannot tell" is never
        "nothing is there", review MD1)."""
        return [e for e in self._entries(sub, must_exist) if _visible(e.name)]

    def partials(self, sub: str) -> list[Entry]:
        return [e for e in self._entries(sub) if e.name.endswith(PARTIAL)]

    def exists(self, rel: str) -> bool:
        return self._p(rel).is_file()

    def read_text(self, rel: str) -> str | None:
        try:
            return self._p(rel).read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise StorageError(f"cannot read {rel}: {exc}", verb="cat") from exc

    def read_head(self, rel: str, n: int) -> bytes | None:
        try:
            with self._p(rel).open("rb") as fh:
                return fh.read(n)
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise StorageError(f"cannot read {rel}: {exc}", verb="cat") from exc

    def write_text(self, rel: str, text: str) -> None:
        p = self._p(rel)
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_name(p.name + PARTIAL)
            tmp.write_text(text, encoding="utf-8")
            os.replace(tmp, p)
        except OSError as exc:
            raise StorageError(f"cannot write {rel}: {exc}", verb="rcat") from exc

    def download(self, rel: str, dest: Path) -> Path:
        src = self._p(rel)
        dest = Path(dest)
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
        except FileNotFoundError as exc:
            raise StorageError(f"no such file in the cloud: {rel}", verb="copyto") from exc
        except OSError as exc:
            raise StorageError(f"download of {rel} failed: {exc}", verb="copyto") from exc
        return dest

    def upload(self, src: Path, rel: str) -> None:
        p = self._p(rel)
        part = p.with_name(p.name + PARTIAL)
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, part)
            os.replace(part, p)
        except OSError as exc:
            raise StorageError(f"upload of {rel} failed: {exc}", verb="copyto") from exc
        want = Path(src).stat().st_size
        try:
            got = p.stat().st_size
        except FileNotFoundError:
            raise StorageError(f"upload of {rel} is gone right after it landed",
                               verb="moveto") from None
        if got != want:
            if _split(rel)[0] in CONTENT_ADDRESSED:
                raise _superseded(rel, got, want)       # never delete the other host's
            p.unlink(missing_ok=True)
            raise StorageError(f"upload of {rel} arrived with the wrong size", verb="moveto")

    def copy(self, src_rel: str, dst_rel: str) -> None:
        dst = self._p(dst_rel)
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(self._p(src_rel), dst)
        except OSError as exc:
            raise StorageError(f"copy {src_rel} → {dst_rel} failed: {exc}", verb="copyto") from exc

    def delete(self, rel: str) -> None:
        try:
            self._p(rel).unlink(missing_ok=True)
        except OSError as exc:
            raise StorageError(f"cannot delete {rel}: {exc}", verb="deletefile") from exc

    def touch(self, rel: str) -> None:
        """Set the file's mtime to now; a file that is not there is left not there."""
        try:
            os.utime(self._p(rel), None)
        except FileNotFoundError:
            return
        except OSError as exc:
            raise StorageError(f"cannot touch {rel}: {exc}", verb="touch") from exc

    def mkdirs(self) -> None:
        try:
            for sub in SUBFOLDERS:
                (self.path / sub).mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise StorageError(f"cannot create {self.root}: {exc}", verb="mkdir") from exc

    def refresh(self, sub: str) -> None:
        """Nothing to forget: every `ls` reads the folder."""


# ── RcloneStorage ────────────────────────────────────────────────────────────

Runner = Callable[..., "subprocess.CompletedProcess"]

# Every call. rclone's own retries cover a flaky link; the per-verb timeouts below
# cover a hung process on the small calls. The two big transfers have no wall-clock
# timeout (a 3 GB upload on a slow uplink is legitimately 20 minutes).
COMMON_FLAGS = ("--retries", "3", "--low-level-retries", "10",
                "--contimeout", "30s", "--timeout", "120s")
TIMEOUTS = {"lsjson": 60.0, "cat": 60.0, "rcat": 60.0, "moveto": 120.0, "copy": 300.0,
            "deletefile": 60.0, "touch": 60.0, "mkdir": 60.0, "listremotes": 10.0}
# rclone exit codes: 3 = directory not found, 4 = file not found.
NOT_FOUND_CODES = (3, 4)
_NOT_FOUND_TEXT = ("not found", "doesn't exist", "does not exist")
_SECRET_MARKERS = ("token", "client_secret", "access_token", "bearer")


def scrub(text: str) -> str:
    """Drop every line that could carry a credential. Costs nothing; rclone's error
    output does not normally carry secrets, and this keeps it that way."""
    keep = [ln for ln in (text or "").splitlines()
            if not any(m in ln.lower() for m in _SECRET_MARKERS)]
    return "\n".join(keep).strip()


def _parse_modtime(s: str) -> float:
    """rclone's ModTime: ISO-8601 with an offset or Z, up to nanoseconds."""
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    head, sep, tail = s.partition(".")
    if sep:  # trim the fraction to microseconds; keep the offset
        i = 0
        while i < len(tail) and tail[i].isdigit():
            i += 1
        s = f"{head}.{tail[:min(i, 6)].ljust(6, '0')}{tail[i:]}"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def default_rclone_bin() -> str:
    from scripts.foundry import host
    explicit = host.get("PENTARYN_RCLONE")
    if explicit:
        return explicit
    found = shutil.which("rclone")
    if found:
        return found
    for cand in ("/opt/homebrew/bin/rclone", "/usr/local/bin/rclone", "/usr/bin/rclone"):
        if os.path.exists(cand):
            return cand
    return "rclone"


class RcloneStorage:
    """The cloud through rclone. `remote_root` looks like ``onedrive:DnD/foundry``.

    ``runner`` is injected so the tests stub rclone with no binary and no network; it is
    called like ``subprocess.run``."""

    kind = "rclone"

    def __init__(self, remote_root: str, *, bin: str | None = None,
                 runner: Runner | None = None, timeouts: dict | None = None,
                 interactive: bool | None = None):
        self.remote = remote_root.rstrip("/")
        self.root = self.remote
        self.bin = bin or default_rclone_bin()
        self.runner = runner or subprocess.run
        self.timeouts = {**TIMEOUTS, **(timeouts or {})}
        self.interactive = interactive
        self._raw_cache: dict[str, list[Entry]] = {}
        self._missing: set[str] = set()     # cached listings that were "not found"

    # -- plumbing -----------------------------------------------------------

    def _r(self, rel: str = "") -> str:
        return f"{self.remote}/{rel}" if rel else self.remote

    def _tty(self) -> bool:
        if self.interactive is not None:
            return self.interactive
        try:
            return sys.stderr.isatty()
        except (AttributeError, ValueError):
            return False

    def _transfer_flags(self) -> tuple[str, ...]:
        if self._tty():
            return ("--progress", "--stats-one-line", "--stats", "5s")
        return ("--stats", "30s", "--stats-one-line", "--log-level", "NOTICE")

    def _run(self, verb: str, *args: str, timeout: float | None, input: str | None = None,
             capture: bool = True, what: str = "", text: bool = True
             ) -> subprocess.CompletedProcess:
        argv = [self.bin, verb, *args, *COMMON_FLAGS]
        assert "--config" not in argv, "never pass --config: rclone finds its own"
        kwargs: dict = {"text": text, "timeout": timeout}
        if input is not None:
            kwargs["input"] = input
        if capture:
            kwargs["capture_output"] = True
        try:
            proc = self.runner(argv, **kwargs)
        except subprocess.TimeoutExpired as exc:
            raise StorageError(f"rclone {verb} {what} timed out after {timeout:.0f}s",
                               verb=verb) from exc
        except FileNotFoundError as exc:
            raise StorageError(f"rclone not found ({self.bin}) — install it or set "
                               "PENTARYN_RCLONE", verb=verb) from exc
        except OSError as exc:
            raise StorageError(f"rclone {verb} {what} could not run: {exc}", verb=verb) from exc
        return proc

    def _fail(self, verb: str, what: str, proc) -> StorageError:
        err = getattr(proc, "stderr", "") or ""
        if isinstance(err, bytes):
            err = err.decode("utf-8", "replace")
        err = scrub(err)
        tail = f": {err.splitlines()[-1]}" if err else ""
        return StorageError(f"rclone {verb} {what} failed (exit {proc.returncode}){tail}",
                            verb=verb, code=proc.returncode)

    @staticmethod
    def _not_found(proc) -> bool:
        if proc.returncode in NOT_FOUND_CODES:
            return True
        err = getattr(proc, "stderr", "") or ""
        if isinstance(err, bytes):
            err = err.decode("utf-8", "replace")
        err = err.lower()
        return proc.returncode != 0 and any(t in err for t in _NOT_FOUND_TEXT)

    def _invalidate(self, rel: str) -> None:
        head, _ = _split(rel)
        self.refresh(head)

    def refresh(self, sub: str) -> None:
        """Drop the cached listing of `sub`: the next `ls` runs `lsjson` again."""
        self._raw_cache.pop(sub, None)
        self._missing.discard(sub)

    # -- listing ------------------------------------------------------------

    def _lsjson(self, sub: str, must_exist: bool = False) -> list[Entry]:
        if sub in self._raw_cache:
            if must_exist and sub in self._missing:
                raise StorageError(f"rclone lsjson {sub}: the folder is not found",
                                   verb="lsjson")
            return self._raw_cache[sub]
        proc = self._run("lsjson", "--files-only", "--no-mimetype", self._r(sub),
                         timeout=self.timeouts["lsjson"], what=sub)
        if proc.returncode != 0:
            if self._not_found(proc):
                if must_exist:
                    raise StorageError(f"rclone lsjson {sub}: the folder is not found",
                                       verb="lsjson", code=proc.returncode)
                self._raw_cache[sub] = []
                self._missing.add(sub)
                return []
            raise self._fail("lsjson", sub, proc)
        try:
            rows = json.loads(proc.stdout or "[]")
        except ValueError as exc:
            raise StorageError(f"rclone lsjson {sub}: unparsable output", verb="lsjson") from exc
        out = []
        for row in rows:
            if row.get("IsDir"):
                continue
            try:
                out.append(Entry(row["Name"], int(row.get("Size", 0)),
                                 _parse_modtime(row.get("ModTime", "1970-01-01T00:00:00Z"))))
            except (KeyError, ValueError):
                continue
        out.sort(key=lambda e: e.name)
        self._raw_cache[sub] = out
        return out

    def ls(self, sub: str, *, must_exist: bool = False) -> list[Entry]:
        """The visible files in `sub`. A folder rclone says is not found lists as empty —
        unless `must_exist`: then it raises StorageError (the GC mark, review MD1)."""
        return [e for e in self._lsjson(sub, must_exist) if _visible(e.name)]

    def partials(self, sub: str) -> list[Entry]:
        return [e for e in self._lsjson(sub) if e.name.endswith(PARTIAL)]

    def exists(self, rel: str) -> bool:
        head, name = _split(rel)
        return any(e.name == name for e in self._lsjson(head))

    # -- small files --------------------------------------------------------

    def read_text(self, rel: str) -> str | None:
        proc = self._run("cat", self._r(_check_rel(rel)), timeout=self.timeouts["cat"], what=rel)
        if proc.returncode != 0:
            if self._not_found(proc):
                return None
            raise self._fail("cat", rel, proc)
        return proc.stdout

    def read_head(self, rel: str, n: int) -> bytes | None:
        """The first `n` bytes of a cloud file (``rclone cat --count``), or None when it is
        not there. Binary: a snapshot's gzip head, for its first tar member."""
        proc = self._run("cat", "--count", str(int(n)), self._r(_check_rel(rel)),
                         timeout=self.timeouts["cat"], what=rel, text=False)
        if proc.returncode != 0:
            if self._not_found(proc):
                return None
            raise self._fail("cat", rel, proc)
        out = proc.stdout or b""
        return out.encode("utf-8", "surrogateescape") if isinstance(out, str) else out

    def write_text(self, rel: str, text: str) -> None:
        proc = self._run("rcat", self._r(_check_rel(rel)), input=text,
                         timeout=self.timeouts["rcat"], what=rel)
        self._invalidate(rel)
        if proc.returncode != 0:
            raise self._fail("rcat", rel, proc)

    # -- transfers ----------------------------------------------------------

    def download(self, rel: str, dest: Path) -> Path:
        dest = Path(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        proc = self._run("copyto", self._r(_check_rel(rel)), str(dest), *self._transfer_flags(),
                         timeout=None, capture=False, what=rel)
        if proc.returncode != 0 or not dest.is_file():
            if self._not_found(proc):
                raise StorageError(f"no such file in the cloud: {rel}", verb="copyto",
                                   code=proc.returncode)
            raise self._fail("copyto", rel, proc)
        return dest

    def _copy_up(self, src: Path, part: str) -> None:
        proc = self._run("copyto", str(src), self._r(part), *self._transfer_flags(),
                         timeout=None, capture=False, what=part)
        self._invalidate(part)
        if proc.returncode != 0:
            raise self._fail("copyto", part, proc)

    def upload(self, src: Path, rel: str) -> None:
        """copyto `<rel>.partial`, then a server-side moveto, then a size check.

        A copyto failure is retried once (rclone's own retries have already run by
        then, but a whole-transfer retry is cheap insurance against a dropped link);
        a size mismatch is not retried — it deletes and raises. In a CONTENT_ADDRESSED
        folder it never deletes: rclone has already verified the transfer and the move
        is a server-side rename, so a different size there is the other host's
        same-name upload landing after ours — `Superseded`, the file left in place."""
        src = Path(src)
        part = _check_rel(rel) + PARTIAL
        try:
            self._copy_up(src, part)
        except StorageError:
            self._copy_up(src, part)
        proc = self._run("moveto", self._r(part), self._r(rel),
                         timeout=self.timeouts["moveto"], what=rel)
        self._invalidate(rel)
        if proc.returncode != 0:
            raise self._fail("moveto", rel, proc)
        head, name = _split(rel)
        got = next((e for e in self._lsjson(head) if e.name == name), None)
        want = src.stat().st_size
        if got is not None and got.size != want and head in CONTENT_ADDRESSED:
            raise _superseded(rel, got.size, want)      # never delete the other host's
        if got is None or got.size != want:
            self.delete(rel)
            raise StorageError(
                f"upload of {rel} did not verify (cloud has "
                f"{'nothing' if got is None else f'{got.size} B'}, expected {want} B) — deleted",
                verb="moveto")

    def copy(self, src_rel: str, dst_rel: str) -> None:
        proc = self._run("copyto", self._r(_check_rel(src_rel)), self._r(_check_rel(dst_rel)),
                         timeout=self.timeouts["copy"], what=f"{src_rel} → {dst_rel}")
        self._invalidate(dst_rel)
        if proc.returncode != 0:
            raise self._fail("copyto", f"{src_rel} → {dst_rel}", proc)

    def delete(self, rel: str) -> None:
        proc = self._run("deletefile", self._r(_check_rel(rel)),
                         timeout=self.timeouts["deletefile"], what=rel)
        self._invalidate(rel)
        if proc.returncode != 0 and not self._not_found(proc):
            raise self._fail("deletefile", rel, proc)

    def touch(self, rel: str) -> None:
        """``rclone touch --no-create``: the cloud file's modification time becomes now (the
        listing's mtime, which the bundle GC's grace reads); a file that is not there is
        not created."""
        proc = self._run("touch", "--no-create", self._r(_check_rel(rel)),
                         timeout=self.timeouts["touch"], what=rel)
        self._invalidate(rel)
        if proc.returncode != 0 and not self._not_found(proc):
            raise self._fail("touch", rel, proc)

    def mkdirs(self) -> None:
        for sub in SUBFOLDERS:
            proc = self._run("mkdir", self._r(sub), timeout=self.timeouts["mkdir"], what=sub)
            if proc.returncode != 0:
                raise self._fail("mkdir", sub, proc)


# ── Picking one: PENTARYN_CLOUD ──────────────────────────────────────────────

def has_onedrive_remote(*, bin: str | None = None, runner: Runner | None = None,
                        name: str = "onedrive") -> bool:
    """Does `rclone listremotes` name the remote? Any failure (no binary, timeout) is no."""
    run = runner or subprocess.run
    try:
        proc = run([bin or default_rclone_bin(), "listremotes"], capture_output=True,
                   text=True, timeout=TIMEOUTS["listremotes"])
    except (OSError, subprocess.TimeoutExpired):
        return False
    if proc.returncode != 0:
        return False
    return any(line.strip() == f"{name}:" for line in (proc.stdout or "").splitlines())


def select(value: str | None, *, runner: Runner | None = None,
           mac_folder: Path | None = None) -> Storage:
    """`PENTARYN_CLOUD` → a Storage (design §1.8).

    unset          → rclone `onedrive:DnD/foundry` if that remote exists, else the Mac
                     OneDrive folder if it exists, else a StorageError naming the fix
    "mac-folder"   → the Mac folder (explicit opt-out of rclone)
    "<x>:<y>"      → rclone at that remote path
    anything else  → a folder at that path (tests, offline work)
    """
    mac = mac_folder or MAC_FOLDER
    v = (value or "").strip()
    if not v:
        if has_onedrive_remote(runner=runner):
            return RcloneStorage(DEFAULT_REMOTE, runner=runner)
        if mac.is_dir():
            return FolderStorage(mac)
        raise StorageError("no cloud: set PENTARYN_CLOUD or run `rclone config` to add "
                           "an `onedrive` remote", verb="listremotes")
    if v == "mac-folder":
        return FolderStorage(mac)
    if _is_remote(v):
        return RcloneStorage(v, runner=runner)
    return FolderStorage(Path(v))


def _is_remote(v: str) -> bool:
    """`name:path` is an rclone remote; `/x`, `~/x`, `./x` and `C:\\x` are paths."""
    if v.startswith(("/", "~", ".")) or ":" not in v:
        return False
    head = v.split(":", 1)[0]
    return len(head) > 1  # a one-letter head is a Windows drive


_memo: dict[str, Storage] = {}


def get() -> Storage:
    """The process's Storage, memoised per `PENTARYN_CLOUD` value so a test that sets
    the variable gets a fresh one with no monkeypatching of module constants."""
    from scripts.foundry import host
    key = host.get("PENTARYN_CLOUD") or ""
    if key not in _memo:
        _memo[key] = select(key)
    return _memo[key]


def reset() -> None:
    _memo.clear()


def stale_partials(st: Storage, sub: str, *, max_age: float = 24 * 3600,
                   now: float | None = None) -> list[Entry]:
    """`.partial` files old enough to be a crash, not the other machine mid-upload."""
    now = time.time() if now is None else now
    return [e for e in st.partials(sub) if now - e.mtime > max_age]
