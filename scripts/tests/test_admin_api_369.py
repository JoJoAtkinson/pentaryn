"""FoundryAdmin against the HTTP behaviour of Foundry 14.369's server.

14.369 changed four things under the updater and ``make vtt-login`` at once
(``dist/server/express.mjs``, ``views/setup.mjs``, ``views/auth.mjs``, ``views/join.mjs``):

* any POST without a same-origin ``Origin`` (or ``Sec-Fetch-Site``) gets
  400 "The request could not be processed." before a route runs;
* ``/setup`` answers 400 (same body) while a world is active, and 401 to a non-admin
  session — both were 403;
* ``/auth`` re-renders the form (401) on a bad password instead of redirecting to
  ``/auth``, and redirects to ``/join`` with a world up;
* ``POST /join {shutdown}`` is gone; ``POST /setup {worldShutdown}`` replaces it.

On 2026-10-10 the first of those made every package action fail while
``authenticate()`` reported success, and ``make vtt-login`` blamed the password. The
fake below is a few lines of each route, written from the 14.369 sources.
"""

from __future__ import annotations

import pytest

from scripts.foundry.update import admin as admin_mod

BASE = "http://127.0.0.1:30000"
PASSWORD = "correct horse"
REFUSED = admin_mod.REFUSED_400


class _Resp:
    def __init__(self, status=200, json_body=None, location=None, text=None):
        self.status_code = status
        self._json = json_body
        self.headers = {"Location": location} if location else {}
        self.text = text if text is not None else ("" if json_body is None else str(json_body))

    @property
    def is_redirect(self):
        return self.status_code in (301, 302, 303, 307, 308) and "Location" in self.headers

    def json(self):
        if self._json is None:
            raise ValueError("not json")
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _Cookies(dict):
    def clear(self):
        super().clear()


class Server369:
    """The routes FoundryAdmin touches, as 14.369 answers them."""

    def __init__(self, *, world: str | None = None, legacy_shutdown: bool = False):
        self.world = world
        self.admin = False
        self.legacy_shutdown = legacy_shutdown     # True = a 14.367 server
        self.headers: dict = {}
        self.cookies = _Cookies()
        self.calls: list[tuple[str, str]] = []

    # requests.Session surface -------------------------------------------------
    def get(self, url, **kw):
        route = url[len(BASE):]
        self.calls.append(("GET", route))
        if route == "/api/status":
            return _Resp(200, {"active": bool(self.world), "version": "14.369",
                               "world": self.world})
        raise AssertionError(f"unexpected GET {route}")

    def post(self, url, json=None, data=None, **kw):
        route = url[len(BASE):]
        body = json if json is not None else (data or {})
        self.calls.append(("POST", f"{route} {body.get('action', '')}".strip()))
        if not self.legacy_shutdown and self.headers.get("Origin") != BASE:
            return _Resp(400, {"error": REFUSED})
        return getattr(self, "_" + route.strip("/"))(body)

    # routes -------------------------------------------------------------------
    def _strict_auth(self, body) -> bool:
        if self.admin:
            return True
        self.admin = body.get("adminPassword") == PASSWORD
        return self.admin

    def _auth(self, body):
        if not self.world and self._strict_auth(body):
            return _Resp(302, location=f"{BASE}/setup")
        if self.world:
            return _Resp(302, location=f"{BASE}/join")
        return _Resp(401, text="<html>auth form</html>")

    def _setup(self, body):
        ok = self._strict_auth(body)
        action = body.get("action")
        if self.world:
            if action == "worldShutdown":
                if not ok:
                    return _Resp(302, location=f"{BASE}/join")
                self.world = None
                return _Resp(302, location=f"{BASE}/setup")
            return _Resp(400, {"error": REFUSED})
        if not ok:
            return _Resp(401, {"error": "You lack server administrator permission"})
        return _Resp(200, {"action": action})

    def _join(self, body):
        if self.legacy_shutdown and body.get("action") == "shutdown":
            if body.get("adminPassword") != PASSWORD:
                return _Resp(403)
            self.world = None
            return _Resp(302, location=f"{BASE}/setup")
        return _Resp(200, {})                       # 14.369: unknown action, no-op


def _fa(server: Server369, password: str | None = PASSWORD) -> admin_mod.FoundryAdmin:
    fa = admin_mod.FoundryAdmin(base_url=BASE, admin_password=password, timeout=0.05)
    server.headers.update(fa.session.headers)       # what the real Session would send
    fa.session = server
    return fa


@pytest.fixture(autouse=True)
def _fast_polls(monkeypatch):
    monkeypatch.setattr(admin_mod.time, "sleep", lambda s: None)


# ── fact 0: the same-origin guard ────────────────────────────────────────────

def test_every_request_carries_the_server_origin():
    fa = admin_mod.FoundryAdmin(base_url=BASE + "/")
    assert fa.session.headers["Origin"] == BASE


def test_without_origin_auth_raises_instead_of_reporting_success():
    server = Server369()
    fa = _fa(server)
    server.headers.pop("Origin")
    with pytest.raises(admin_mod.FoundryError, match="Origin"):
        fa.authenticate()
    assert fa._authenticated is False


# ── /auth: only a redirect to /setup is success ──────────────────────────────

def test_auth_succeeds_on_redirect_to_setup():
    server = Server369()
    fa = _fa(server)
    fa.authenticate()
    assert fa._authenticated and server.admin


def test_auth_with_a_wrong_password_raises_on_the_401_re_render():
    fa = _fa(Server369(), password="wrong")
    with pytest.raises(admin_mod.FoundryError, match="did not match.*HTTP 401"):
        fa.authenticate()


def test_auth_racing_a_world_launch_is_not_blamed_on_the_password():
    server = Server369()
    fa = _fa(server)
    fa.world_active = lambda: False                 # status said no world…
    server.world = "pentaryn"                       # …and one came up before the POST
    with pytest.raises(admin_mod.FoundryError, match="raced a world launch"):
        fa.authenticate()


def test_auth_with_a_world_up_goes_through_setup_and_checks_isAdmin(monkeypatch):
    server = Server369(world="pentaryn")
    fa = _fa(server)
    monkeypatch.setattr(fa, "join_data", lambda: {"isAdmin": server.admin})
    fa.authenticate()
    assert ("POST", "/setup listBackups") in server.calls and server.admin


def test_auth_with_a_world_up_and_a_bad_password_says_so(monkeypatch):
    server = Server369(world="pentaryn")
    fa = _fa(server, password="wrong")
    monkeypatch.setattr(fa, "join_data", lambda: {"isAdmin": server.admin})
    with pytest.raises(admin_mod.FoundryError, match="differ"):
        fa.authenticate()


# ── _post: 400 / 401 on 14.369 ───────────────────────────────────────────────

def test_package_action_with_a_world_up_explains_the_400(monkeypatch):
    server = Server369(world="pentaryn")
    fa = _fa(server)
    fa._authenticated = True
    with pytest.raises(admin_mod.FoundryError, match=r"refused \(400\).*world is active"):
        fa.check_package("module", "dice-so-nice")


def test_a_401_after_a_restart_reauthenticates_once_and_succeeds():
    server = Server369()
    fa = _fa(server)
    fa._authenticated = True                        # stale: the server forgot the session
    assert fa.check_package("module", "dice-so-nice") == {"action": "checkPackage"}
    assert ("POST", "/auth") in server.calls


def test_a_401_without_a_password_is_a_clear_refusal():
    server = Server369()
    fa = _fa(server, password=None)
    fa._authenticated = True
    with pytest.raises(admin_mod.FoundryError, match=r"refused \(401\)"):
        fa.check_package("module", "dice-so-nice")


# ── deactivate_world: worldShutdown, then the 14.367 route ───────────────────

def test_deactivate_uses_worldShutdown_on_14_369():
    server = Server369(world="pentaryn")
    fa = _fa(server)
    assert fa.deactivate_world() is True
    assert server.world is None
    assert ("POST", "/setup worldShutdown") in server.calls
    assert not any(c == ("POST", "/join shutdown") for c in server.calls)


def test_deactivate_falls_back_to_join_shutdown_on_14_367():
    server = Server369(world="pentaryn", legacy_shutdown=True)
    # 14.367 /setup with a world up: 403 for every action, worldShutdown included.
    server._setup = lambda body: _Resp(403)
    fa = _fa(server)
    assert fa.deactivate_world() is True
    assert ("POST", "/join shutdown") in server.calls


def test_deactivate_with_a_wrong_password_returns_false(monkeypatch):
    server = Server369(world="pentaryn")
    fa = _fa(server, password="wrong")
    waited: list[str] = []

    def no_setup(timeout):
        waited.append(server.calls[-1][1])
        raise admin_mod.Timeout("still active")
    monkeypatch.setattr(fa, "wait_for_setup", no_setup)
    # /setup refuses (→ /join), /join is a 200 no-op on 14.369, the world stays up.
    assert fa.deactivate_world() is False
    assert server.world == "pentaryn"
    # The refused worldShutdown redirected to /join and was not waited on; only the
    # (no-op) legacy route was.
    assert waited == ["/join shutdown"]


def test_deactivate_without_a_password_does_not_try():
    server = Server369(world="pentaryn")
    fa = _fa(server, password=None)
    assert fa.deactivate_world() is False
    assert server.calls == []


# ── cloud.server_running: a guard must not call a live server "stopped" ──────

def test_server_running_is_a_tcp_check(monkeypatch):
    import socket

    from scripts.foundry import cloud

    class _Conn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    tried: list[str] = []

    def connect(addr, timeout=None):
        tried.append(addr[0])
        if addr[0] == "::1":
            return _Conn()                         # e.g. only the IPv6 loopback answers
        raise ConnectionRefusedError

    monkeypatch.setattr(socket, "create_connection", connect)
    assert cloud.server_running() is True
    assert tried == ["127.0.0.1", "::1"]

    monkeypatch.setattr(socket, "create_connection",
                        lambda addr, timeout=None: (_ for _ in ()).throw(OSError()))
    assert cloud.server_running() is False
