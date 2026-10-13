"""py-mcp-ac-3: an in-process MCP handler stuck on a file lock gives up after a deadline.

A Python thread cannot be killed, so the server cannot cap an in-process handler the way it
caps a subprocess. The only call those handlers block on is `flock` in the three `_locked`
helpers; each now waits at most DND_MCP_TOOL_TIMEOUT seconds (same env as subprocess tools)
and then raises a clear "could not lock <file> within Ns".
"""

from __future__ import annotations

import fcntl
import time
from pathlib import Path

import pytest

from scripts import combat_actions_db as cdb
from scripts import dnd_roller
from scripts import feedback_reports as fr

_SERVER = Path(__file__).resolve().parents[1] / "mcp" / "server.py"


def _hold(lock: Path):
    """Take the lock from a separate open file description (flock conflicts within a process)."""
    lock.parent.mkdir(parents=True, exist_ok=True)
    fh = open(lock, "a")
    fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
    return fh


def _cases(tmp_path, monkeypatch):
    report = tmp_path / "fb" / "abc.json"
    report.parent.mkdir()
    monkeypatch.setenv("DND_COMBAT_ACTIONS_DB", str(tmp_path / "db" / "actions.jsonl"))
    monkeypatch.setattr(dnd_roller, "_CACHE_FILE", tmp_path / "roll" / "quant_numbers.bin")
    return {
        "feedback_reports": (report.with_name("abc.json.lock"), lambda: fr._locked(report)),
        "combat_actions_db": (tmp_path / "db" / "actions.jsonl.lock", cdb._locked),
        "dnd_roller": (tmp_path / "roll" / "quant_numbers.bin.lock", dnd_roller._cache_locked),
    }


@pytest.mark.parametrize("name", ["feedback_reports", "combat_actions_db", "dnd_roller"])
def test_py_mcp_ac_3_held_lock_times_out(name, tmp_path, monkeypatch):
    monkeypatch.setenv("DND_MCP_TOOL_TIMEOUT", "1")
    lock, enter = _cases(tmp_path, monkeypatch)[name]
    holder = _hold(lock)
    try:
        started = time.monotonic()
        with pytest.raises(TimeoutError, match=r"could not lock .*\.lock within 1s"):
            with enter():
                pass
        assert time.monotonic() - started < 5
    finally:
        holder.close()


@pytest.mark.parametrize("name", ["feedback_reports", "combat_actions_db", "dnd_roller"])
def test_py_mcp_ac_3_free_lock_is_taken_and_released(name, tmp_path, monkeypatch):
    monkeypatch.setenv("DND_MCP_TOOL_TIMEOUT", "1")
    lock, enter = _cases(tmp_path, monkeypatch)[name]
    with enter():
        pass
    with enter():                       # released on exit, so a second entry succeeds at once
        pass
    holder = _hold(lock)                # and nothing still holds it
    holder.close()


def test_py_mcp_ac_3_shutdown_comment_names_the_lock_bound():
    src = _SERVER.read_text(encoding="utf-8")
    assert "in-process handlers have no cap" not in src
    assert "in-process handlers are bounded only by their own locks" in src
