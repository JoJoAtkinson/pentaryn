"""ROB-4: ``forks._default_branch`` must read upstream's real default branch.

It used to call ``gh api repos/<repo> --jq .default_branch``. With ``--jq``, gh prints a
string result raw (``main``), not as JSON (``"main"``), so ``_gh``'s ``json.loads``
failed and the helper always returned ``None``. ``_compare`` then fell back to the
fork's own branch name, so a fork on ``main`` of an upstream on ``master`` compared
against the wrong (or a missing) base. Now the full repo object is parsed and
``default_branch`` read from the dict.
"""

from __future__ import annotations

import json
import subprocess

from scripts.foundry.update import forks


def _fake_gh(responses: dict[str, object], calls: list[list[str]]):
    """Emulate gh: ``--jq .x`` prints a string raw; otherwise prints JSON."""
    def run(cmd, *args, **kwargs):
        calls.append(cmd)
        path = cmd[2]
        data = responses.get(path)
        if data is None:
            return subprocess.CompletedProcess(cmd, 1, "", "HTTP 404")
        if "--jq" in cmd:
            key = cmd[cmd.index("--jq") + 1].lstrip(".")
            val = data.get(key)
            out = val if isinstance(val, str) else json.dumps(val)
            return subprocess.CompletedProcess(cmd, 0, out + "\n", "")
        return subprocess.CompletedProcess(cmd, 0, json.dumps(data), "")
    return run


def test_rob4_default_branch_reads_upstream_default(monkeypatch):
    calls: list[list[str]] = []
    monkeypatch.setattr(forks.subprocess, "run",
                        _fake_gh({"repos/up/mod": {"default_branch": "master"}}, calls))
    assert forks._default_branch("up/mod") == "master"


def test_rob4_compare_uses_upstream_default_not_fork_branch(monkeypatch):
    calls: list[list[str]] = []
    responses = {
        "repos/up/mod": {"default_branch": "master"},
        "repos/up/mod/compare/master...joe:main": {"ahead_by": 2, "behind_by": 5},
    }
    monkeypatch.setattr(forks.subprocess, "run", _fake_gh(responses, calls))
    assert forks._compare("up/mod", "joe/mod", "main") == (2, 5, None)


def test_rob4_default_branch_none_when_missing_or_failed(monkeypatch):
    calls: list[list[str]] = []
    monkeypatch.setattr(forks.subprocess, "run",
                        _fake_gh({"repos/up/odd": {"name": "odd"}}, calls))
    assert forks._default_branch("up/odd") is None
    assert forks._default_branch("up/gone") is None
