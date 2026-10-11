"""Shared output for the ops CLI (python-tooling-33).

    say(msg)            the one human line: two-space indent on stdout — byte-identical to the
                        `_say` helpers it replaces in service.py and login.py
    fail(msg)           say("✗ msg") and return FAIL, for `return fail("…")`
    event(kind, **kw)   one structured JSON line `{ts, kind, …}` appended to the file named by
                        $PENTARYN_OPS_LOG; a no-op when the variable is unset, so nothing changes
                        for a person at a terminal

`scripts/foundry/cloud.py`'s `log`/`die` are deliberately NOT routed through here: `die` writes to
stderr and exits, and its callers depend on that stream.
"""

from __future__ import annotations

import datetime
import json
import os
from pathlib import Path

OK, FAIL = 0, 1

#: the environment variable naming the JSONL file `event()` appends to
ENV_LOG = "PENTARYN_OPS_LOG"


def say(msg: str, *, flush: bool = False) -> None:
    print(f"  {msg}", flush=flush)


def fail(msg: str) -> int:
    say(f"✗ {msg}")
    return FAIL


def now_iso() -> str:
    """UTC, seconds, with a Z — the timestamp every ops record carries."""
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def append_jsonl(path: Path, record: dict) -> None:
    """Append one JSON line, creating the parent folder. Never raises past a disk error."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False, sort_keys=False) + "\n")


def event(kind: str, **fields) -> None:
    """A machine-readable record of something the CLI did, when $PENTARYN_OPS_LOG asks for one."""
    target = os.environ.get(ENV_LOG)
    if not target:
        return
    append_jsonl(Path(target), {"ts": now_iso(), "kind": kind, **fields})
