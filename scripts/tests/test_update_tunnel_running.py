"""M15: tunnel_running agrees with state._pid_alive on a PermissionError.

``os.kill(pid, 0)`` raising PermissionError means the process exists but belongs to
another user, so it is running. ``state._pid_alive`` already says so; tunnel_running
used to count it as dead, so the two liveness checks disagreed on the same pid.
"""

from __future__ import annotations

import os

from scripts.foundry.update import recover


def _pid_file(tmp_path, text="4242"):
    run = tmp_path / ".run"
    run.mkdir()
    (run / "cloudflared.pid").write_text(text)
    return tmp_path


def test_m15_permission_error_counts_as_running(tmp_path, monkeypatch):
    def _kill(pid, sig):
        raise PermissionError(1, "Operation not permitted")

    monkeypatch.setattr(os, "kill", _kill)
    assert recover.tunnel_running(_pid_file(tmp_path)) is True


def test_m15_missing_process_is_not_running(tmp_path, monkeypatch):
    def _kill(pid, sig):
        raise ProcessLookupError

    monkeypatch.setattr(os, "kill", _kill)
    assert recover.tunnel_running(_pid_file(tmp_path)) is False


def test_m15_no_or_bad_pid_file_is_not_running(tmp_path):
    assert recover.tunnel_running(tmp_path) is False
    assert recover.tunnel_running(_pid_file(tmp_path, "not-a-pid")) is False
