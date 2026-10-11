"""The content digest of an installed module folder, shared by module-sync (the stamp it writes,
python-tooling-10) and the updater's drift report (python-tooling-9) — one ignore list for both.

Stdlib only: the unattended updater imports it."""

from __future__ import annotations

import hashlib
from pathlib import Path

#: written into every installed copy by `ops.modules.install`; never part of a digest
SYNC_STAMP = ".pentaryn-sync.json"


def tree_digest(root: Path, *, ignore: tuple[str, ...] = (SYNC_STAMP,)) -> str:
    """sha256 over every file's folder-relative path and bytes, in path order.

    `ignore` names top-level files left out — the sync stamp, so a repo folder and the copy
    installed from it digest the same."""
    h = hashlib.sha256()
    files = [p for p in root.rglob("*") if p.is_file()]
    for p in sorted(files, key=lambda q: q.relative_to(root).as_posix()):
        rel = p.relative_to(root).as_posix()
        if rel in ignore:
            continue
        h.update(rel.encode("utf-8") + b"\0")
        h.update(p.read_bytes())
        h.update(b"\0")
    return f"sha256:{h.hexdigest()}"
