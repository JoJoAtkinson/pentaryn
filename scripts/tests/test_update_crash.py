"""The post-install crash that failed every applying run from 2026-08-29 to 2026-10-03.

Each of those runs installed its modules, then died with ``'list' object has no
attribute 'get'`` before core, before any smoke test, and before any rollback — and the
report said only that one line. The cause was ``smoke.package_warnings`` reading
``packageWarnings`` off the ``getPackages`` setup action, which returns the remote
repository listing as a bare list (Foundry ``packages/views.mjs``:
``return Array.from(r.values())``). ``packageWarnings`` lives only in the
``getSetupData`` socket payload (``server/views/setup.mjs handleSocket``).

These tests pin the fix, the run reaching core + smoke after modules, and the crash path
saying where it crashed and what it left live.
"""

from __future__ import annotations

import pytest

from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update import apply, smoke, state

# What `getPackages` really returns: a list of repository entries, no warnings.
REPO_LISTING = [{"id": "dice-so-nice", "version": "6.4.2"},
                {"id": "multi-token-edit", "version": "3.3.7"}]

# What `getSetupData` vends: PackageWarnings.toJSON(), keyed by package id.
SETUP_DATA = {
    "isSetup": True,
    "packageWarnings": {
        "dice-so-nice": {"id": "dice-so-nice", "type": "module",
                         "warning": [], "error": ["Installation failed: EACCES"]},
        "lib-wrapper": {"id": "lib-wrapper", "type": "module",
                        "warning": ["unverified for 14.368"], "error": []},
    },
}


class FakeFA:
    """Answers the two calls the way the live server does."""

    def __init__(self, setup_data=SETUP_DATA, admin_password=None):
        self._setup_data = setup_data
        self.calls: list[str] = []

    def setup(self, action, **body):
        self.calls.append(action)
        if action == "getPackages":
            return list(REPO_LISTING)
        return {}

    def setup_data(self):
        self.calls.append("getSetupData")
        if isinstance(self._setup_data, Exception):
            raise self._setup_data
        return self._setup_data

    # used by the run path
    def wait_for_setup(self, timeout=180):
        return None

    def reauthenticate(self):
        self.calls.append("reauthenticate")

    def world_active(self):
        return False


# ── package_warnings ─────────────────────────────────────────────────────────

def test_package_warnings_reads_setup_data_not_the_repository_listing():
    fa = FakeFA()
    got = smoke.package_warnings(fa, {"dice-so-nice", "multi-token-edit"})
    assert got == {"dice-so-nice": SETUP_DATA["packageWarnings"]["dice-so-nice"]}
    assert "getPackages" not in fa.calls, "getPackages is the repo listing, not warnings"


@pytest.mark.parametrize("payload", [
    REPO_LISTING,                       # the shape that crashed six runs
    {},                                 # world active / session not admin
    {"packageWarnings": None},
    {"packageWarnings": ["not", "a", "dict"]},
    None,
    RuntimeError("socket refused"),
])
def test_package_warnings_never_raises_on_odd_payloads(payload):
    assert smoke.package_warnings(FakeFA(setup_data=payload), {"dice-so-nice"}) == {}


# ── socket.io ack parsing ───────────────────────────────────────────────────

def test_parse_ack_picks_the_ack_out_of_a_multi_packet_poll():
    payload = '42["progress",{"pct":10}]\x1e431[{"packageWarnings":{}}]\x1e2'
    assert admin_mod.parse_ack(payload) == {"packageWarnings": {}}


def test_parse_ack_returns_none_without_an_ack():
    assert admin_mod.parse_ack('42["progress",{}]') is None
    assert admin_mod.parse_ack("6") is None


def test_parse_ack_ignores_other_ack_ids():
    assert admin_mod.parse_ack('432[{"x":1}]', ack_id=1) is None
    assert admin_mod.parse_ack('431[]') == {}


class _Resp:
    def __init__(self, text):
        self.text = text
        self.status_code = 200

    def raise_for_status(self):
        pass


class _PollingSession:
    """Engine.IO polling transport where the ack lands on the second poll."""

    def __init__(self, polls):
        self.posts: list[str] = []
        self._gets = ['0{"sid":"abc","pingInterval":25000}', "40", *polls]

    def get(self, url, params=None, timeout=None):
        # An idle poll answers NOOP ("6") once the scripted packets run out.
        return _Resp(self._gets.pop(0) if self._gets else "6")

    def post(self, url, params=None, data=None, timeout=None, **kw):
        self.posts.append(data)
        return _Resp("ok")


def test_socket_call_polls_until_the_ack_arrives():
    fa = admin_mod.FoundryAdmin()
    fa.session = _PollingSession(['42["userActivity",{}]',
                                  '431[{"packageWarnings":{"a":{"error":["x"]}}}]'])
    assert fa._socket_call("getSetupData") == {"packageWarnings": {"a": {"error": ["x"]}}}
    assert fa.session.posts == ["40", '421["getSetupData"]']


def test_socket_call_raises_when_no_ack_ever_comes():
    fa = admin_mod.FoundryAdmin(timeout=0.01)
    fa.session = _PollingSession([])
    with pytest.raises(admin_mod.FoundryError, match="getSetupData returned no ack"):
        fa._socket_call("getSetupData")


def test_socket_call_mints_a_session_first(monkeypatch):
    """Without a session cookie Foundry binds no socket listeners and never acks; a fresh
    client makes one HTTP request first (/api/status sets the cookie)."""
    import requests
    fa = admin_mod.FoundryAdmin(timeout=0.01)
    calls: list[str] = []
    monkeypatch.setattr(fa, "status", lambda: calls.append("status"))
    real = fa.session
    fa.session = _PollingSession(['431[{}]'])
    fa.session.cookies = requests.cookies.RequestsCookieJar()
    assert fa._socket_call("getJoinData") == {}
    assert calls == ["status"]
    fa.session.cookies.set("session", "x")
    calls.clear()
    fa.session = type(fa.session)(['431[{}]'])
    fa.session.cookies = real.cookies
    fa.session.cookies.set("session", "x")
    fa._socket_call("getJoinData")
    assert calls == []


def test_setup_data_authenticates_then_emits_getSetupData(monkeypatch):
    fa = admin_mod.FoundryAdmin()
    order: list[str] = []
    monkeypatch.setattr(fa, "authenticate", lambda: order.append("auth"))
    monkeypatch.setattr(fa, "_socket_call", lambda ev, timeout=None: order.append(ev) or {})
    fa.setup_data()
    assert order == ["auth", "getSetupData"]


# ── the run path: modules → warnings → core → smoke ──────────────────────────

MODULE = {"id": "dice-so-nice", "type": "module", "bucket": "auto",
          "installed": "6.4.1", "target": "6.4.2"}
CORE = {"id": "core", "type": "core", "bucket": "auto",
        "installed": "14.367", "target": "14.368"}


@pytest.fixture
def run_env(monkeypatch, tmp_path):
    """Everything around the post-install section stubbed; state files in tmp."""
    monkeypatch.setattr(state, "STATE_DIR", tmp_path)
    monkeypatch.setattr(state, "STATUS_PATH", tmp_path / "vtt-update.status")
    monkeypatch.setattr(state, "ENTRY_PATH", tmp_path / "vtt-update.entry")

    seen: dict = {"core": 0, "smoke": 0, "finished": None}
    fa = FakeFA()
    monkeypatch.setattr(apply, "FoundryAdmin", lambda admin_password=None: fa)
    monkeypatch.setattr(apply.admin_pw, "foundry_admin_password", lambda required=False: "x")
    monkeypatch.setattr(apply.risk, "load_policy", lambda: {})
    monkeypatch.setattr(apply.risk, "save_seen", lambda *a, **k: None)
    monkeypatch.setattr(apply, "gate", lambda fa, policy, force=False:
                        state.EntryState(foundry_up=True, tunnel_up=False,
                                         active_world="pentaryn"))
    monkeypatch.setattr(apply.inventory, "scan", lambda: [])
    monkeypatch.setattr(apply, "back_up", lambda *a: (tmp_path / "snap", None))
    monkeypatch.setattr(apply.admin_mod, "port_open", lambda *a, **k: True)
    monkeypatch.setattr(apply.plan_mod, "build", lambda **k: {
        "decisions": [dict(MODULE), dict(CORE)], "worlds": [{"id": "pentaryn"}]})
    monkeypatch.setattr(apply.adjudicate, "apply_verdicts", lambda *a: None)
    monkeypatch.setattr(apply, "backup_packages", lambda *a: {"snapshot": "s1", "packages": []})
    monkeypatch.setattr(apply.recover, "stash_core", lambda *a, **k: None)
    monkeypatch.setattr(apply.admin_mod, "error_log_offset", lambda day: 0)
    monkeypatch.setattr(apply, "apply_decisions", lambda fa, plan: (
        [{"id": "dice-so-nice", "from": "6.4.1", "to": "6.4.2"}], []))

    def _core(fa, decision):
        seen["core"] += 1
        return {"id": "core", "from": "14.367", "to": "14.368"}
    monkeypatch.setattr(apply, "apply_core", _core)

    def _smoke(*a, **k):
        seen["smoke"] += 1
        return []
    monkeypatch.setattr(apply.smoke, "run_all", _smoke)
    monkeypatch.setattr(apply, "shut_down_service", lambda messages: None)
    monkeypatch.setattr(apply, "restore_service", lambda entry, messages: None)
    return fa, seen


def test_run_gets_past_package_warnings_to_core_and_smoke(run_env):
    fa, seen = run_env
    result = apply._run_locked(apply.RunResult(run_id="t"), "t",
                               dry=False, force=True, skip_llm=True)
    assert result.outcome == "done", result.messages
    assert seen["core"] == 1, "core 14.368 must be installed after the modules"
    assert seen["smoke"] == 1, "the smoke test must run"
    assert result.traceback is None
    assert "getPackages" not in fa.calls
    # Only touched packages are kept, and an install error is surfaced as a note.
    assert set(result.warnings) == {"dice-so-nice"}
    assert any("install errors for dice-so-nice" in m for m in result.messages)


def test_a_crash_records_its_traceback_and_what_it_left_live(run_env, monkeypatch):
    def _boom(fa, touched):
        return [].get("packageWarnings")   # the original bug, verbatim
    monkeypatch.setattr(apply.smoke, "package_warnings", _boom)
    _, seen = run_env

    result = apply._run_locked(apply.RunResult(run_id="t"), "t",
                               dry=False, force=True, skip_llm=True)
    assert result.outcome == "failed"
    assert seen["core"] == 0 and seen["smoke"] == 0
    assert "AttributeError" in result.messages[0]
    assert result.traceback and "_boom" in result.traceback
    assert result.to_json()["traceback"] == result.traceback
    assert any("UNTESTED" in m and "dice-so-nice 6.4.1 → 6.4.2" in m
               for m in result.messages)


# ── the notification must not claim a rollback that never happened ───────────

def test_failed_without_recovery_does_not_say_rolled_back(monkeypatch):
    sent: list[tuple] = []
    monkeypatch.setattr(apply.notify, "notify", lambda *a: sent.append(a))
    apply.notify_result(apply.RunResult(run_id="t", outcome="failed",
                                        messages=["run failed: boom"]))
    assert "rolled back" not in sent[0][1].replace("nothing rolled back", "")
    assert "FAILED" in sent[0][1]


def test_recovered_still_says_rolled_back(monkeypatch):
    sent: list[tuple] = []
    monkeypatch.setattr(apply.notify, "notify", lambda *a: sent.append(a))
    apply.notify_result(apply.RunResult(run_id="t", outcome="recovered",
                                        recoveries=[{"kind": "module"}]))
    assert sent[0][1].startswith("update rolled back")
