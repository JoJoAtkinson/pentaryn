"""AC-5: a hung git push must not cost the week's notification.

``report._git`` ran with no timeout, and ``cli.cmd_run`` notified only after
``commit_and_push`` returned — so a push stuck on the network (a credential prompt, a
dead remote) hung the run and the notification never went out. The ruling: every git
call has a timeout (120 s, push 300 s); a timeout becomes a "git <verb> timed out —
report written but not pushed" message; and the run notifies *before* committing.
"""

from __future__ import annotations

import subprocess
from types import SimpleNamespace

from scripts.foundry.update import apply, cli, report


def _fake_git(monkeypatch, hang_on: str, seen: list):
    """subprocess.run stand-in: every git verb succeeds except ``hang_on``, which times out."""

    def run(cmd, cwd=None, capture_output=False, text=False, timeout=None):
        verb = cmd[1]
        seen.append((verb, timeout))
        if verb == hang_on:
            raise subprocess.TimeoutExpired(cmd, timeout)
        out = {"symbolic-ref": "main\n", "rev-parse": ".git\n"}.get(verb, "")
        return subprocess.CompletedProcess(cmd, 0, stdout=out, stderr="")

    monkeypatch.setattr(report.subprocess, "run", run)


def test_ac5_hung_push_times_out_with_a_message(monkeypatch, tmp_path):
    seen: list = []
    _fake_git(monkeypatch, "push", seen)
    monkeypatch.setattr(report, "REPO_ROOT", tmp_path)
    paths = [tmp_path / "2026-10-12-run.md", tmp_path / "2026-10-12-run.json"]

    messages = report.commit_and_push(paths)

    assert messages[-1] == "git push timed out — report written but not pushed"
    assert "committed the report to main" in messages
    timeouts = dict(seen)
    assert timeouts["push"] == 300
    assert all(t == 120 for verb, t in seen if verb != "push")


def test_ac5_hung_commit_times_out_with_a_message(monkeypatch, tmp_path):
    seen: list = []
    _fake_git(monkeypatch, "commit", seen)
    monkeypatch.setattr(report, "REPO_ROOT", tmp_path)

    messages = report.commit_and_push([tmp_path / "2026-10-12-run.md"])

    assert messages == ["git commit timed out — report written but not pushed"]
    assert "push" not in dict(seen)


def test_ac5_run_notifies_before_committing(monkeypatch, tmp_path):
    order: list[str] = []
    result = apply.RunResult(run_id="t", outcome="done")
    monkeypatch.setattr(apply, "run", lambda **k: result)
    monkeypatch.setattr(apply, "notify_result", lambda r: order.append("notify"))
    monkeypatch.setattr(cli, "_policy", lambda: {})
    monkeypatch.setattr(cli, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(report, "write", lambda *a, **k: (tmp_path / "r.md", tmp_path / "r.json"))
    monkeypatch.setattr(report, "commit_and_push",
                        lambda paths, push=True: order.append("commit") or [])

    rc = cli.cmd_run(SimpleNamespace(dry=False, force=False, skip_llm=True))

    assert rc == 0
    assert order == ["notify", "commit"]
