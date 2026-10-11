"""This machine's "based-on" record: which cloud snapshot the local world came from.

Design §5. One small JSON file at the Foundry data root (``FOUNDRY_DATA/pentaryn-boot.json``),
beside ``Config/`` and ``Data/`` but outside every snapshotted path, so it never travels
inside a snapshot and a restore never overwrites it. ``$PENTARYN_BOOT_STATE`` relocates it.

It answers two questions:

* the boot choice's: *is the newest cloud snapshot newer than what this world is based
  on?* — compared by the listing's ``mtime``, never by stamp across hosts;
* the backup's: *has the local tree changed since it was last uploaded or restored?* —
  the tree digest that used to live in the shared ``world-backups/.last-digest``, now
  local, so neither host can skip a backup because the other uploaded identical bytes.

Kept apart from ``boot.py`` so ``cloud.py`` (which writes it on backup and restore) and
``boot.py`` (which reads it and imports ``cloud``) do not import each other.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = 1
FILENAME = "pentaryn-boot.json"


def path() -> Path:
    from scripts.foundry import host
    override = os.environ.get("PENTARYN_BOOT_STATE")
    return Path(override).expanduser() if override else host.foundry_data() / FILENAME


@dataclass
class BootState:
    schema: int = SCHEMA
    host: str | None = None
    based_on: str | None = None
    based_on_host: str | None = None
    based_on_mtime: float | None = None
    digest: str | None = None
    keep_local_until_newer_than: str | None = None
    # The declined snapshot's listing mtime: nothing at or before it asks again, even if
    # the declined one is later deleted (coalesced, pruned) and an older one is newest.
    keep_local_mtime: float | None = None
    # The based-on snapshot's ancestors, newest first (from its `.parent` sidecar): what
    # this world already contains, so a newer snapshot that lacks `based_on` is "diverged".
    lineage: list[str] = field(default_factory=list)
    # A newer snapshot the no-terminal notice told nobody about yet. Kept across this
    # host's own backups and shown again until Joe answers at a terminal (or restores).
    pending_newer: str | None = None
    pending_newer_mtime: float | None = None
    written: str | None = None
    by: str | None = None
    # Set when the file existed but could not be read; never written back.
    corrupt: bool = field(default=False, compare=False)

    def save(self, by: str) -> None:
        """Always the whole file, atomically (`.tmp` + `os.replace`)."""
        from scripts.foundry import host
        self.schema = SCHEMA
        self.host = host.host_name()
        self.by = by
        self.written = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        p = path()
        p.parent.mkdir(parents=True, exist_ok=True)
        data = {k: v for k, v in asdict(self).items() if k != "corrupt"}
        tmp = p.with_name(p.name + ".tmp")
        tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, p)
        self.corrupt = False

    # -- the events of the §5 table --------------------------------------------

    def record_snapshot(self, name: str, snap_host: str | None, mtime: float,
                        digest: str, *, by: str, keep_local: str | None = None,
                        lineage: list[str] | None = None,
                        clear_pending: bool = False) -> None:
        """Own backup uploaded `name`, or `name` was restored: the tree IS that snapshot.

        A restore answers any pending notice (`clear_pending`); this host's own backup
        does not — uploading the local world is not Joe seeing the newer one."""
        self.based_on = name
        self.based_on_host = snap_host
        self.based_on_mtime = mtime
        self.digest = digest
        self.keep_local_until_newer_than = keep_local
        self.keep_local_mtime = None
        self.lineage = list(lineage or [])
        if clear_pending:
            self.pending_newer = self.pending_newer_mtime = None
        self.save(by)

    def remember_keep_local(self, declined: str, mtime: float | None = None) -> None:
        self.keep_local_until_newer_than = declined
        self.keep_local_mtime = mtime
        self.pending_newer = self.pending_newer_mtime = None
        self.save("boot-keep-local")

    def set_pending(self, name: str, mtime: float) -> None:
        if (self.pending_newer, self.pending_newer_mtime) == (name, mtime):
            return
        self.pending_newer, self.pending_newer_mtime = name, mtime
        self.save("boot-notice")

    def clear_pending(self) -> None:
        if self.pending_newer is None:
            return
        self.pending_newer = self.pending_newer_mtime = None
        self.save("boot-pending-cleared")


def load() -> BootState:
    """The record, or an empty one. A corrupt file reads as empty with `corrupt=True`
    (the boot choice then asks, which is the safe direction) and is overwritten on the
    next write."""
    p = path()
    try:
        raw = p.read_text(encoding="utf-8")
    except FileNotFoundError:
        return BootState()
    except OSError:
        return BootState(corrupt=True)
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or data.get("schema") != SCHEMA:
            raise ValueError("schema")
        known = {k: data.get(k) for k in BootState.__dataclass_fields__ if k != "corrupt"}
        st = BootState(**known)
        if st.based_on_mtime is not None:
            st.based_on_mtime = float(st.based_on_mtime)
        if st.keep_local_mtime is not None:
            st.keep_local_mtime = float(st.keep_local_mtime)
        if st.pending_newer_mtime is not None:
            st.pending_newer_mtime = float(st.pending_newer_mtime)
        st.lineage = [str(n) for n in (st.lineage or []) if n]
        return st
    except (ValueError, TypeError):
        return BootState(corrupt=True)
