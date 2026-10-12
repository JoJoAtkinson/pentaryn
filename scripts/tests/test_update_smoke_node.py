"""EXT-2: the browser smoke test finds Node on any primary, and says so when it cannot.

``smoke.py`` hard-coded ``/opt/homebrew/bin/node``, so on a primary that is not a
Homebrew Mac every world's client check failed with ``FileNotFoundError`` and the run
rolled back. ``host.node()`` now resolves it — ``PATH`` first, the Homebrew path when it
exists (launchd's PATH omits it), else plain ``node`` — and ``run_browser`` asks at call
time. A machine with no Node at all gets a not-ok client payload that names the problem.
"""

from __future__ import annotations

from scripts.foundry import host
from scripts.foundry.update import smoke


# ── host.node() ──────────────────────────────────────────────────────────────

def test_ext2_node_prefers_path(monkeypatch):
    monkeypatch.setattr(host.shutil, "which",
                        lambda name: "/usr/bin/node" if name == "node" else None)
    assert host.node() == "/usr/bin/node"


def test_ext2_node_falls_back_to_homebrew_when_path_lacks_it(monkeypatch, tmp_path):
    brew = tmp_path / "node"
    brew.write_text("")
    monkeypatch.setattr(host.shutil, "which", lambda name: None)
    monkeypatch.setattr(host, "HOMEBREW_NODE", brew)
    assert host.node() == str(brew)


def test_ext2_node_is_plain_node_when_nothing_is_found(monkeypatch, tmp_path):
    monkeypatch.setattr(host.shutil, "which", lambda name: None)
    monkeypatch.setattr(host, "HOMEBREW_NODE", tmp_path / "absent")
    assert host.node() == "node"


# ── run_browser ──────────────────────────────────────────────────────────────

class _Admin:
    base_url = "http://127.0.0.1:30000"

    def authenticate(self):
        pass

    def session_cookies(self):
        return {"session": "x"}


def _smoke_js(monkeypatch, tmp_path):
    js = tmp_path / "smoke.mjs"
    js.write_text("")
    monkeypatch.setattr(smoke, "SMOKE_JS", js)
    monkeypatch.setattr(smoke, "CHROME_PROFILE", tmp_path / "profile")


def test_ext2_run_browser_resolves_node_at_call_time(monkeypatch, tmp_path):
    _smoke_js(monkeypatch, tmp_path)
    monkeypatch.setattr(host, "node", lambda: "/usr/local/bin/node")
    monkeypatch.setattr(smoke.shutil, "which", lambda name: name)
    seen = []

    class _Proc:
        returncode = 0
        stdout = '{"ok": true, "errors": []}'
        stderr = ""

    monkeypatch.setattr(smoke.subprocess, "run",
                        lambda cmd, **k: seen.append(cmd) or _Proc())
    out = smoke.run_browser(_Admin(), "alpha", dwell=1, ignores=[])
    assert out == {"ok": True, "errors": []}
    assert seen[0][0] == "/usr/local/bin/node"


def test_ext2_missing_node_is_a_clear_not_ok_payload(monkeypatch, tmp_path):
    _smoke_js(monkeypatch, tmp_path)
    monkeypatch.setattr(host, "node", lambda: "node")
    monkeypatch.setattr(smoke.shutil, "which", lambda name: None)

    def no_spawn(*a, **k):
        raise FileNotFoundError(2, "No such file or directory", "node")

    monkeypatch.setattr(smoke.subprocess, "run", no_spawn)
    out = smoke.run_browser(_Admin(), "alpha", dwell=1, ignores=[])
    assert out["ok"] is False
    assert len(out["errors"]) == 1
    text = out["errors"][0]["text"]
    assert out["errors"][0]["type"] == "fatal"
    assert "Node.js not found" in text and "PATH" in text
