"""ROB-3: a stalled or missing ``gh`` must degrade, not crash ``plan.build``.

``upstream.gh_api`` and ``forks._gh`` both promise to return ``None`` on failure — a
non-zero exit or unparseable output already did. But ``subprocess.run(..., timeout=)``
raises ``TimeoutExpired`` when gh hangs, and ``FileNotFoundError`` (an ``OSError``) when
gh is not on PATH; neither was caught, so one slow GitHub call killed the whole weekly
run. Both now land as "could not resolve an upstream version" (HOLD), exactly as a 404.
"""

from __future__ import annotations

import subprocess

import pytest

from scripts.foundry.update import forks, upstream


def _raiser(exc: BaseException):
    def run(*args, **kwargs):
        raise exc
    return run


FAILURES = [
    pytest.param(subprocess.TimeoutExpired(cmd=["gh"], timeout=60), id="timeout"),
    pytest.param(FileNotFoundError(2, "No such file or directory: 'gh'"), id="gh-missing"),
    pytest.param(PermissionError(13, "Permission denied: 'gh'"), id="gh-not-executable"),
]


@pytest.mark.parametrize("exc", FAILURES)
def test_rob3_gh_api_returns_none_when_gh_stalls_or_is_absent(monkeypatch, exc):
    monkeypatch.setattr(upstream.subprocess, "run", _raiser(exc))
    assert upstream.gh_api("repos/owner/repo/releases/latest") is None


@pytest.mark.parametrize("exc", FAILURES)
def test_rob3_forks_gh_returns_none_when_gh_stalls_or_is_absent(monkeypatch, exc):
    monkeypatch.setattr(forks.subprocess, "run", _raiser(exc))
    assert forks._gh(["repo", "list", "--fork"]) is None
    assert forks.list_forks() == []
