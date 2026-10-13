"""Which release notes the adjudicator is shown (EC-6).

Only releases with installed < tag <= target are kept — betas and anything past the
target are dropped. When more than eight remain, the target's own note is kept plus the
seven nearest the installed version, still newest first.
"""

from __future__ import annotations

from pathlib import Path

from scripts.foundry.update import upstream
from scripts.foundry.update.inventory import Package


def _rel(tag: str, *, prerelease: bool = False) -> dict:
    return {"tag_name": f"v{tag}", "name": tag, "html_url": f"https://x/{tag}",
            "published_at": "2026-10-01T00:00:00Z", "body": f"notes {tag}",
            "prerelease": prerelease}


def _notes(monkeypatch, releases: list[dict], installed: str, latest: str) -> list[str]:
    monkeypatch.setattr(upstream, "_github_releases", lambda repo, limit=12: releases)
    pkg = Package(type="module", id="m", title="m", version=installed, path=Path("/x"))
    up = upstream.Upstream(id="m", type="module", installed=installed, latest=latest)
    upstream._attach_notes(pkg, up, "o/m")
    return [n["version"] for n in up.notes]


def test_ec6_notes_past_the_target_and_betas_are_dropped(monkeypatch):
    feed = [_rel("2.1.0-beta.1", prerelease=True), _rel("2.0.1"), _rel("2.0.0"),
            _rel("1.6.0-rc.1"), _rel("1.5.0"), _rel("1.4.0")]
    assert _notes(monkeypatch, feed, installed="1.4.0", latest="2.0.0") == ["2.0.0", "1.5.0"]


def test_ec6_more_than_eight_keeps_the_target_and_the_seven_nearest_installed(monkeypatch):
    feed = [_rel(f"1.{n}.0") for n in range(20, 0, -1)]   # 1.20.0 … 1.1.0, newest first
    got = _notes(monkeypatch, feed, installed="1.1.0", latest="1.15.0")
    assert got == ["1.15.0", "1.8.0", "1.7.0", "1.6.0", "1.5.0", "1.4.0", "1.3.0", "1.2.0"]


def test_ec6_eight_or_fewer_in_range_are_all_kept_newest_first(monkeypatch):
    feed = [_rel("1.2.0"), _rel("1.4.0"), _rel("1.3.0")]
    assert _notes(monkeypatch, feed, installed="1.1.0", latest="1.4.0") == ["1.4.0", "1.3.0", "1.2.0"]
