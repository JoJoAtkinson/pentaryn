"""A fake `rclone` for the cloud tests: no binary, no network, no config.

:class:`FakeRclone` is called exactly like ``subprocess.run`` and implements the verbs
``RcloneStorage`` uses — ``lsjson cat rcat copyto moveto deletefile mkdir listremotes``,
and ``cat --count N`` (binary, the first N bytes) — against a temp folder. ``fake:<path>`` maps to ``<base>/<path>``; anything else is a local
path. It records every argv and refuses any argv carrying ``--config`` or a token-ish flag or value, so a
flag change is a visible test diff and a leak is a test failure.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

# Flags that take a value, so the parser can skip the value with the flag.
_VALUE_FLAGS = {"--retries", "--low-level-retries", "--contimeout", "--timeout",
                "--stats", "--log-level", "--count", "--offset"}


class FakeRclone:
    def __init__(self, base: Path, *, remote: str = "fake", remotes: tuple[str, ...] = ("fake",)):
        self.base = Path(base)
        self.remote = remote
        self.remotes = list(remotes)
        self.calls: list[list[str]] = []
        self.fail_once: dict[str, tuple[int, str]] = {}   # verb → (exit, stderr), consumed
        self.fail_always: dict[str, tuple[int, str]] = {}
        self.hang: set[str] = set()                        # verbs that time out
        self.truncate_uploads = False                      # copyto to the cloud drops bytes
        self._text = True                                  # the current call's text= flag

    # -- helpers -------------------------------------------------------------

    def verbs(self) -> list[str]:
        return [c[1] for c in self.calls]

    def _path(self, arg: str) -> Path:
        prefix = f"{self.remote}:"
        if arg.startswith(prefix):
            return self.base / arg[len(prefix):]
        return Path(arg)

    def _is_remote(self, arg: str) -> bool:
        return arg.startswith(f"{self.remote}:")

    @staticmethod
    def _positional(args: list[str]) -> list[str]:
        out, skip = [], False
        for a in args:
            if skip:
                skip = False
                continue
            if a in _VALUE_FLAGS:
                skip = True
                continue
            if a.startswith("--"):
                continue
            out.append(a)
        return out

    @staticmethod
    def _done(argv, rc=0, out="", err=""):
        return subprocess.CompletedProcess(argv, rc, stdout=out, stderr=err)

    # -- the call ------------------------------------------------------------

    def __call__(self, argv, *, input=None, capture_output=False, text=True, timeout=None,
                 **_kw):
        argv = list(argv)
        self.calls.append(argv)
        assert "--config" not in argv, f"--config passed: {argv}"
        # A pack named tokens-01.zip is fine; a token-ish flag or value never is.
        assert not any(("token" in a.lower() and a.startswith("-")) or "_token" in a.lower()
                       or "bearer" in a.lower() for a in argv), f"token in argv: {argv}"
        verb = argv[1]
        if verb in self.hang:
            if timeout is not None:
                time.sleep(min(timeout, 0.2))
            raise subprocess.TimeoutExpired(argv, timeout or 0)
        if verb in self.fail_once:
            rc, err = self.fail_once.pop(verb)
            return self._done(argv, rc, "", err)
        if verb in self.fail_always:
            rc, err = self.fail_always[verb]
            return self._done(argv, rc, "", err)
        pos = self._positional(argv[2:])
        self._text = text
        return getattr(self, "_" + verb)(argv, pos, input)

    def _listremotes(self, argv, pos, _in):
        return self._done(argv, 0, "".join(f"{r}:\n" for r in self.remotes))

    def _lsjson(self, argv, pos, _in):
        d = self._path(pos[0])
        if not d.is_dir():
            return self._done(argv, 3, "", "error listing: directory not found")
        rows = []
        for p in sorted(d.iterdir()):
            if p.is_dir() and "--files-only" in argv:
                continue
            st = p.stat()
            stamp = datetime.fromtimestamp(st.st_mtime, timezone.utc)
            rows.append({"Path": p.name, "Name": p.name, "Size": st.st_size if p.is_file() else -1,
                         "ModTime": stamp.strftime("%Y-%m-%dT%H:%M:%S.%f") + "123Z",
                         "IsDir": p.is_dir()})
        return self._done(argv, 0, json.dumps(rows))

    def _cat(self, argv, pos, _in):
        p = self._path(pos[0])
        if not p.is_file():
            return self._done(argv, 3, "" if self._text else b"",
                              "error: object not found" if self._text else b"error: not found")
        if "--count" in argv:                       # `cat --count N`: the first N bytes
            n = int(argv[argv.index("--count") + 1])
            with p.open("rb") as fh:
                data = fh.read(n)
            return self._done(argv, 0, data if not self._text else data.decode("utf-8"))
        return self._done(argv, 0, p.read_text(encoding="utf-8"))

    def _rcat(self, argv, pos, data):
        p = self._path(pos[0])
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(data or "", encoding="utf-8")
        return self._done(argv, 0)

    def _copyto(self, argv, pos, _in):
        src, dst = self._path(pos[0]), self._path(pos[1])
        if not src.is_file():
            return self._done(argv, 3, "", "error: object not found")
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        if self.truncate_uploads and self._is_remote(pos[1]) and not self._is_remote(pos[0]):
            with dst.open("r+b") as fh:
                fh.truncate(max(0, dst.stat().st_size - 1))
        return self._done(argv, 0)

    def _moveto(self, argv, pos, _in):
        src, dst = self._path(pos[0]), self._path(pos[1])
        if not src.is_file():
            return self._done(argv, 3, "", "error: object not found")
        dst.parent.mkdir(parents=True, exist_ok=True)
        os.replace(src, dst)
        return self._done(argv, 0)

    def _deletefile(self, argv, pos, _in):
        p = self._path(pos[0])
        if not p.is_file():
            return self._done(argv, 4, "", "error: object not found")
        p.unlink()
        return self._done(argv, 0)

    def _mkdir(self, argv, pos, _in):
        self._path(pos[0]).mkdir(parents=True, exist_ok=True)
        return self._done(argv, 0)
