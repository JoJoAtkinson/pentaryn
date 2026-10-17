#!/usr/bin/env python3
"""Client for Foundry's local admin HTTP API, plus the app's process lifecycle.

Everything the updater needs is already implemented inside Foundry; this module is a
typed front door onto it rather than a reimplementation. Read
``/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/dist/server/views/``
if you want the other side of any of these calls.

Five facts about that API shape this whole file (re-checked against 14.369's
``dist/server``; where 14.369 changed one, the older behaviour is noted):

0. **Every POST must look same-origin (14.369+).** ``express.mjs`` answers any POST
   whose ``Sec-Fetch-Site`` is not ``same-origin`` — or, with no such header, whose
   ``Origin`` is missing or differs from ``protocol://host`` — with **400 "The request
   could not be processed."** before any route runs. A browser sends both headers; a
   script sends neither. So :class:`FoundryAdmin` sends ``Origin: <base_url>`` on every
   request. Without it every action 400s and ``/auth`` *looks* like it succeeded.

1. **Every ``/setup`` and ``/update`` package action is gated on ``!game.world``.**
   While a world is active ``/setup`` answers **400** with that same "could not be
   processed" body (14.367: 403) and ``/update`` answers 403. A non-admin session gets
   **401** from ``/setup`` (14.367: 403). So the updater has to park the server at the
   setup screen before it can do anything.

2. **The graceful deactivate is ``POST /setup {action: "worldShutdown",
   adminPassword}`` (14.369+).** It authenticates the password strictly, then calls
   ``world.deactivate(req, {asAdmin})`` and redirects to ``/setup`` on success or
   ``/join`` on refusal. The old route, ``POST /join {action: "shutdown"}``, is gone:
   14.369's ``join.mjs`` ignores the action and answers 200 ``{}``.
   :meth:`FoundryAdmin.deactivate_world` tries the new route and falls back to the old
   one, so a core rollback to 14.367 still deactivates.

3. **The world-active gate gets applied to the *actions*, not to the admin
   handshake.** ``setup.mjs`` runs ``sessions.authenticateAdmin(…, {strict: true})``
   before its world-active test, so ``/setup`` is the one route that can establish an
   admin session at any time — which is why ``authenticate()`` uses it whenever a world
   is up. ``/auth`` cannot: with a world up it redirects to ``/join`` without checking
   the password, and on a bad password it re-renders the form (401) rather than
   redirecting. Only a redirect to ``/setup`` means success.

4. **Several actions are fire-and-forget.** ``createSnapshot``, ``restoreSnapshot``,
   ``restoreBackup`` and ``launchWorld`` return ``{}`` at once and emit progress (and
   errors) only over socket.io. Callers must poll for the effect — hence
   ``wait_for_world``, ``wait_for_snapshot`` and ``wait_for_package_version``.

Admin auth needs the configured admin password (hashed into ``Config/admin.txt``, not
options.json). Pass it via ``admin_password=`` — read from Infisical or the login
keychain at the point of use, never from a file in this repo and never in argv.

Without one, ``sessions.authenticateAdmin`` returns ``{success: true}`` but leaves
``session.admin`` **false**, which quietly breaks the two calls that check that flag
directly: ``loginAsUser`` (the smoke test's GM login) and the world deactivate —
``POST /setup {worldShutdown}`` on 14.369+, ``POST /join {shutdown}`` before it.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path

import requests

from scripts.foundry import host

# Paths and the port come from host.py (Mac defaults are today's values; BOSS sets them
# in ~/.config/pentaryn/env). Resolved once at import, as before.
FOUNDRY_DATA = host.foundry_data()
BASE_URL = f"http://127.0.0.1:{host.foundry_port()}"
APP_NAME = host.MAC_APP_NAME
# The app payload (package.json, main.js). On the Mac this is inside the .app bundle.
APP_PAYLOAD = host.foundry_app_root()

DATA = FOUNDRY_DATA / "Data"
MODULES_DIR = DATA / "modules"
SYSTEMS_DIR = DATA / "systems"
WORLDS_DIR = DATA / "worlds"
BACKUPS_DIR = DATA / "Backups"
SNAPSHOTS_DIR = BACKUPS_DIR / "snapshots"
LOGS_DIR = FOUNDRY_DATA / "Logs"
OPTIONS_JSON = FOUNDRY_DATA / "Config/options.json"

# Manifest filename per package type — systems use system.json, not module.json.
MANIFEST_NAME = {"module": "module.json", "system": "system.json", "world": "world.json"}
PACKAGE_DIR = {"module": MODULES_DIR, "system": SYSTEMS_DIR, "world": WORLDS_DIR}


class FoundryError(RuntimeError):
    """A Foundry API call returned an ``error`` field, or refused the request."""


class JoinRejected(FoundryError):
    """``/join`` refused the user's password (401). Never carries the password."""


# 14.369's express.mjs answers a cross-origin POST with exactly this body — and so does
# setup.mjs, for any action other than worldShutdown/editWorld while a world is active.
REFUSED_400 = "The request could not be processed."


def _redirect_target(r: requests.Response) -> str:
    """Where a 3xx points, without its trailing slash; "" for anything else."""
    if r.status_code not in (301, 302, 303, 307, 308):
        return ""
    return (r.headers.get("Location") or "").rstrip("/")


def _error_text(r: requests.Response) -> str:
    """The ``error`` field of a JSON refusal, else the start of the body."""
    try:
        data = r.json()
    except ValueError:
        return (r.text or "")[:200]
    if isinstance(data, dict) and data.get("error"):
        return str(data["error"])[:200]
    return (r.text or "")[:200]


class Timeout(RuntimeError):
    """A polled state never arrived. Always a failure — never assume success."""


@dataclass(frozen=True)
class Status:
    """``GET /api/status``. ``users`` is absent entirely when no world is active,
    which is *not* the same as zero users — hence ``Optional``, not a defaulted 0."""

    active: bool
    version: str | None
    world: str | None = None
    system: str | None = None
    system_version: str | None = None
    users: int | None = None
    uptime: int | None = None

    @classmethod
    def from_json(cls, d: dict) -> "Status":
        return cls(
            active=bool(d.get("active")),
            version=d.get("version"),
            world=d.get("world"),
            system=d.get("system"),
            system_version=d.get("systemVersion"),
            users=d.get("users"),
            uptime=d.get("uptime"),
        )


# ── Process lifecycle ────────────────────────────────────────────────────────

def port_open(timeout: float = 2.0) -> bool:
    """The server answers on ``host.foundry_port()`` when up. `cloud.py` uses the same probe, and
    several of its operations `die()` while it is true."""
    try:
        requests.get(BASE_URL, timeout=timeout, allow_redirects=False)
        return True
    except requests.RequestException:
        return False


def process_running() -> bool:
    return host.pid() is not None


def quit_app(timeout: float = 120.0) -> None:
    """Quit Foundry and wait until it is *actually* gone.

    ``osascript quit`` returns as soon as the Apple Event is delivered, long before
    Electron has closed the world's LevelDB and released the port. Returning early
    here would hand a still-live server to ``cloud.py backup``, which `die()`s on it.
    """
    if not process_running() and not port_open():
        return
    host.request_stop()  # Mac: osascript quit · Linux: PENTARYN_STOP_CMD or SIGTERM
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not port_open(timeout=1.0) and not process_running():
            time.sleep(2.0)  # let LevelDB finish flushing after the port drops
            return
        time.sleep(1.0)
    # Escalate exactly once; a wedged Electron would otherwise block the whole run.
    host.force_stop()
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if not port_open(timeout=1.0) and not process_running():
            return
        time.sleep(1.0)
    raise Timeout(f"{APP_NAME} would not quit")


def start_app(timeout: float = 120.0) -> None:
    """Launch Foundry and wait for the port. With ``world: null`` in options.json it
    boots to the setup screen — which is the only state the package API answers in."""
    if port_open():
        return
    host.start()  # Mac: open -a · Linux: PENTARYN_START_CMD or a detached node main.js
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if port_open(timeout=2.0):
            return
        time.sleep(1.0)
    raise Timeout(f"{APP_NAME} did not answer on {BASE_URL} within {timeout:.0f}s")


def parse_ack(payload: str, ack_id: int = 1) -> dict | None:
    """The first argument of socket.io ack ``ack_id`` in one polling response, or None.

    A polling response is Engine.IO packets joined by ``\x1e``; an ack to the default
    namespace is Engine.IO MESSAGE (4) + Socket.IO ACK (3) + the id + a JSON array.
    """
    prefix = f"43{ack_id}["
    for packet in payload.split("\x1e"):
        if packet.startswith(prefix):
            args = json.loads(packet[len(prefix) - 1:])
            return args[0] if args else {}
    return None


# ── HTTP client ──────────────────────────────────────────────────────────────

class FoundryAdmin:
    """A session against the local server. Cookies carry the admin flag between calls."""

    def __init__(self, base_url: str = BASE_URL, admin_password: str | None = None,
                 timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._admin_password = admin_password
        self.session = requests.Session()
        # Fact 0: 14.369 refuses any POST that does not look same-origin. This is the
        # header a browser on the Foundry page sends; it is not a credential.
        self.session.headers["Origin"] = self.base_url
        self._authenticated = False

    # -- status -------------------------------------------------------------

    def status(self) -> Status:
        r = self.session.get(f"{self.base_url}/api/status", timeout=self.timeout)
        r.raise_for_status()
        return Status.from_json(r.json())

    def world_active(self) -> bool:
        return self.status().active

    # -- auth ---------------------------------------------------------------

    def authenticate(self) -> None:
        """Establish an admin session, whatever state the server is in.

        Two routes, because ``/auth`` **cannot authenticate while a world is live** —
        ``auth.mjs`` reads::

            const t = !game.world && sessions.authenticateAdmin(e,s).success;

        The ``&&`` short-circuits, so with a world up ``authenticateAdmin`` is never
        called and the route redirects back to ``/auth``: identical to a rejected
        password. This used to raise "the one supplied did not match" against a
        perfectly good password — a diagnosis that sends you to re-sync a secret that
        was never wrong. The updater only escaped it by always authenticating while
        parked at the setup screen.

        With a world active, ``/setup`` is the route that works: ``setup.mjs`` runs
        ``authenticateAdmin`` *before* its world-active test and gates only the package
        actions on the result, so the flag gets set and the action is then refused with
        a status (400 on 14.369, 403 before) we expect and ignore. The body must carry neither ``shutdown`` nor
        ``editWorld`` — both are handled above that 403 and would deactivate or mutate
        the live world. ``isAdmin`` in the ``getJoinData`` payload is Foundry's own
        report of the resulting flag, so the check is authoritative rather than
        inferred from a status code.

        Sends ``adminPassword`` only if we were given one — in the body, never in argv,
        and never logged.
        """
        if self._authenticated:
            return
        body = {}
        if self._admin_password:
            body["adminPassword"] = self._admin_password

        if self.world_active():
            # The action is refused (400 on 14.369, 403 before) *after* the password
            # check has set the flag — expected, and the reason the status is ignored.
            self.session.post(
                f"{self.base_url}/setup",
                json={"action": "listBackups", **body},
                timeout=self.timeout, allow_redirects=False,
            )
            if self._admin_password and not self.join_data().get("isAdmin"):
                raise FoundryError(
                    "admin authentication failed — Foundry reports the session is not "
                    "admin after posting the password to /setup. Either the configured "
                    "password (Config/admin.txt) and the one supplied differ (re-sync "
                    "with: make foundry-admin-push), or the server refused the POST "
                    "outright — 14.369+ does that to any POST without a same-origin "
                    "Origin header."
                )
            self._authenticated = True
            return

        r = self.session.post(f"{self.base_url}/auth", data=body,
                              timeout=self.timeout, allow_redirects=False)
        # /auth redirects to /setup on success — and ONLY then. A bad password re-renders
        # the form (401 on 14.369, a redirect back to /auth on 14.367); a world that came
        # up in between redirects to /join; 14.369's same-origin guard answers 400. Every
        # one of those used to slip through as success.
        location = _redirect_target(r)
        if location.endswith("/setup"):
            self._authenticated = True
            return
        if r.status_code == 400:
            raise FoundryError(
                f"admin authentication refused before the password was checked "
                f"(HTTP 400 {_error_text(r)!r}) — Foundry 14.369+ rejects a POST whose "
                f"Origin does not match the server; this client sends {self.base_url!r}."
            )
        if location.endswith("/join"):
            raise FoundryError("admin authentication raced a world launch — /auth "
                               "redirected to /join. Retry.")
        raise FoundryError(
            "admin authentication failed — an admin password is configured "
            "(Config/admin.txt) and the one supplied did not match "
            f"(HTTP {r.status_code}{', → ' + location if location else ''}). "
            "Re-sync it with: make foundry-admin-push"
        )

    def join_data(self) -> dict:
        """``getJoinData`` over socket.io's polling transport.

        Foundry serves exactly one HTTP API route — ``/api/status`` (``api.mjs``) — and
        it carries no users and no admin flag. Everything the ``/join`` page renders
        arrives over the socket instead, so a script that wants the user list (to find
        the GM without pinning an id) or ``isAdmin`` (to verify an admin handshake) has
        to speak socket.io.

        Returns ``{}`` when no world is active — ``join.mjs``'s handler short-circuits
        on ``!game.world``.
        """
        return self._socket_call("getJoinData")

    def setup_data(self) -> dict:
        """``getSetupData`` — the payload the ``/setup`` page renders from.

        This is the **only** place ``packageWarnings`` (``globalThis.packages.warnings``,
        keyed by package id, each ``{id, type, warning: [...], error: [...]}``) is
        vended. The ``getPackages`` setup *action* is something else entirely: it
        returns the remote repository listing as a bare **list** (``views.mjs``:
        ``return Array.from(r.values())``), with no warnings in it. Reading
        ``packageWarnings`` off that list is what crashed every run from 2026-08-29 to
        2026-10-03 with ``'list' object has no attribute 'get'``.

        ``setup.mjs handleSocket`` returns ``{}`` while a world is active, or when an
        admin password is configured and this session is not admin.
        """
        self.authenticate()
        return self._socket_call("getSetupData")

    def _socket_call(self, event: str, timeout: float | None = None) -> dict:
        """Emit one acked event over socket.io's polling transport and return the ack.

        The polling transport is plain HTTP: Engine.IO handshake, connect to the
        default namespace, emit with ack id 1, then poll until the ``431[...]`` ack
        arrives. A poll can carry several packets separated by ``\x1e``, and the
        server may push unrelated events ahead of the ack, so the ack is picked out by
        packet rather than by grabbing everything after the first ``431``.

        **The socket needs a session cookie first.** ``sockets.mjs`` looks the session up
        from the handshake's cookie and, with none, emits ``session: null`` and binds *no*
        listeners — so on a fresh client every event goes unanswered and this used to
        poll out its whole timeout. Any HTTP route mints one; ``/api/status`` is the
        cheapest, so a client that has made no request yet makes that one.
        """
        jar = getattr(self.session, "cookies", None)     # test fakes have no jar
        if jar is not None and not jar.get("session"):
            self.status()
        q = {"EIO": "4", "transport": "polling"}
        r = self.session.get(f"{self.base_url}/socket.io/", params=q, timeout=self.timeout)
        r.raise_for_status()
        # Engine.IO frames are a single-digit packet type followed by the payload.
        sid = json.loads(r.text[1:].split("\x1e", 1)[0])["sid"]

        q_sid = {**q, "sid": sid}
        self.session.post(f"{self.base_url}/socket.io/", params=q_sid, data="40",
                          timeout=self.timeout)
        self.session.get(f"{self.base_url}/socket.io/", params=q_sid,
                         timeout=self.timeout)                       # CONNECT ack
        self.session.post(f"{self.base_url}/socket.io/", params=q_sid,
                          data=f"421[{json.dumps(event)}]",
                          timeout=self.timeout)
        deadline = time.monotonic() + (timeout or self.timeout)
        seen = ""
        while time.monotonic() < deadline:
            r = self.session.get(f"{self.base_url}/socket.io/", params=q_sid,
                                 timeout=self.timeout)
            r.raise_for_status()
            seen = r.text
            ack = parse_ack(r.text, ack_id=1)
            if ack is not None:
                return ack
        raise FoundryError(f"{event} returned no ack payload: {seen[:200]!r}")

    def reauthenticate(self) -> None:
        """Force a fresh admin handshake.

        Needed straight after changing the admin password: the session was
        authenticated under the *old* state, and Foundry only sets ``session.admin`` at
        the moment of a successful password check. Without this, the very next
        privileged call is refused by the password we just set.
        """
        self._authenticated = False
        self.session.cookies.clear()
        self.authenticate()

    # -- raw actions --------------------------------------------------------

    def _post(self, route: str, payload: dict, _retried: bool = False) -> dict:
        self.authenticate()
        r = self.session.post(f"{self.base_url}{route}", json=payload,
                              timeout=self.timeout, allow_redirects=False)
        # 401 (/setup, 14.369+) and 403 (/update; /setup before 14.369) both mean "this
        # session is not admin".
        if r.status_code in (401, 403) and not _retried and self._admin_password:
            # Sessions live in the server's memory, so ANY restart invalidates the
            # cookie and every admin call starts 403ing. A core update restarts the
            # process by design (`Updater.restart()` respawns it), which made a
            # successful core update look like a failed one: the update landed, the
            # smoke test could not launch a world, and the whole thing was rolled back.
            # One transparent re-auth turns that into a non-event.
            self.reauthenticate()
            return self._post(route, payload, _retried=True)
        if r.status_code in (401, 403):
            raise FoundryError(
                f"{route} {payload.get('action')} refused ({r.status_code}) — a world is "
                "active, or admin auth was rejected. Package actions need the setup screen."
            )
        if r.status_code == 400:
            err = _error_text(r)
            hint = (" — on 14.369+ /setup answers this while a world is active (package "
                    "actions need the setup screen), and so does the same-origin guard "
                    "for a POST without a matching Origin header"
                    if err == REFUSED_400 else "")
            raise FoundryError(f"{route} {payload.get('action')} refused (400): {err}{hint}")
        r.raise_for_status()
        try:
            data = r.json()
        except json.JSONDecodeError:
            raise FoundryError(f"{route} {payload.get('action')} returned non-JSON") from None
        if isinstance(data, dict) and data.get("error"):
            raise FoundryError(f"{payload.get('action')}: {data['error']}")
        return data

    def setup(self, action: str, **body) -> dict:
        return self._post("/setup", {"action": action, **body})

    def update(self, action: str, **body) -> dict:
        return self._post("/update", {"action": action, **body})

    # -- package queries ----------------------------------------------------

    def check_package(self, pkg_type: str, pkg_id: str, manifest: str | None = None) -> dict:
        """Foundry's own update check. Returns ``remote`` (the upstream manifest),
        ``isUpgrade``/``isDowngrade``, ``trackChange``, and — for modules —
        ``systemCompatibility``. Throws server-side when the package has no manifest
        URL at all, which is normal for premium and local packages; callers should
        classify those as untracked rather than treating it as an error."""
        body = {"type": pkg_type, "id": pkg_id}
        if manifest:
            body["manifest"] = manifest
        return self.setup("checkPackage", **body)

    def install_package(self, pkg_type: str, pkg_id: str, manifest: str,
                        force: bool = False) -> dict:
        """Start an install. **Resolves on fetch, not on completion** — the promise
        Foundry returns fires from ``onFetched``. An install-step failure resolves
        ``{}`` and surfaces only in ``packageWarnings``. Always follow with
        ``wait_for_package_version``."""
        return self.setup("installPackage", type=pkg_type, id=pkg_id,
                          manifest=manifest, force=force)

    def preview_compatibility(self, release: dict) -> dict:
        """Foundry's own collision check for a core bump: re-resolves every installed
        package against the repository *at the target release* and returns per-package
        availability codes. This is the single most valuable call in the API."""
        return self.update("previewCompatibility", release=release)

    def update_check(self, channel: str = "stable") -> dict:
        """Core update check. Returns the target ``ReleaseData`` — *not* ``hasUpdate``
        or ``willDisableModules``; those live on ``updater.availability``, which is
        vended over the socket only. Compare ``generation`` yourself.

        Side effect worth knowing: this persists a changed ``updateChannel`` to
        options.json, so always pass the channel you actually want."""
        return self.update("updateCheck", updateChannel=channel)

    def launch_world(self, world: str) -> dict:
        """Fire-and-forget. Follow with ``wait_for_world``.

        **This is a destructive step.** ``world.mjs setup()`` runs ``migrateCore()``
        when the core is newer and ``migrateSystem()`` when the system is newer —
        in place, over every document, stamped into world.json. Take the backups first.
        """
        return self.setup("launchWorld", world=world)

    def login_as(self, user_id: str) -> None:
        """Log the session in as any user with **no user password**.

        ``sessions.loginAsUser`` permits this only when ``session.admin`` is true::

            if (!(session.admin || currentUser?.role === USER_ROLES.GAMEMASTER))
              return 403 USERS.LoginAsGMRequired

        And ``session.admin`` is set **only** on a successful password check —
        ``authenticateAdmin`` early-returns ``{success: true}`` without setting it when
        no password is configured. So this needs the admin password; it was verified
        403ing on this server before one was set. The payoff is that no *user*
        password is ever stored: one admin secret, from Infisical or the keychain,
        buys a GM browser session for the smoke test.
        """
        self.authenticate()
        r = self.session.post(f"{self.base_url}/join",
                              json={"action": "loginAs", "userId": user_id},
                              timeout=self.timeout, allow_redirects=False)
        if r.status_code != 200:
            raise FoundryError(
                f"loginAs {user_id} failed: HTTP {r.status_code} {r.text[:200]} — "
                "if this is USERS.LoginAsGMRequired, the admin password is not set "
                "(make foundry-admin-configure)"
            )
        data = r.json()
        if data.get("status") != "success":
            raise FoundryError(f"loginAs {user_id} failed: {data}")

    def join(self, user_id: str, password: str) -> None:
        """Log in as a user **with that user's password**, the way the ``/join`` form does.

        Unlike :meth:`login_as` this never authenticates as admin, so the session it
        leaves behind has ``session.admin`` false. That matters for a session handed to a
        long-lived browser: an admin-flagged session passes ``/setup``'s
        ``authenticateAdmin`` without a password, so its page could shut the world down
        (``game.shutDown()``) even as a role-3 user, and Foundry offers no way to drop the
        flag while a world is active (``adminLogout`` is a setup-screen action).
        Call it on a fresh instance that has never called :meth:`authenticate`.

        ``join.mjs`` → ``sessions.authenticateUser`` reads ``{userId, password}``; a wrong
        password is 401 ``JOIN.ErrorInvalidPassword`` (raised as :class:`JoinRejected`).
        """
        r = self.session.post(f"{self.base_url}/join",
                              json={"action": "join", "userId": user_id, "password": password},
                              timeout=self.timeout, allow_redirects=False)
        if r.status_code == 401:
            raise JoinRejected(f"join {user_id} refused: HTTP 401 {r.text[:120]}")
        if r.status_code != 200:
            raise FoundryError(f"join {user_id} failed: HTTP {r.status_code} {r.text[:200]}")
        data = r.json()
        if data.get("status") != "success":
            raise FoundryError(f"join {user_id} failed: {data}")

    def deactivate_world(self) -> bool:
        """Return the server to the setup screen **without quitting the app**.

        14.369+: ``POST /setup {action: "worldShutdown", adminPassword}`` (fact 2). It
        checks the password strictly, deactivates as admin, and redirects to ``/setup``
        on success or ``/join`` on refusal.

        14.367 and earlier: ``POST /join {action: "shutdown", adminPassword}``. Kept as a
        fallback so a core rollback does not silently turn every deactivate into an app
        restart. On 14.369 that route answers 200 ``{}`` and does nothing, which is why
        it is tried second and why success is judged by ``/api/status``, never by the
        response.

        Both need an admin password. Returns False without one, or when neither route
        brings the server to setup, so the caller can fall back to quitting the app.
        """
        if not self._admin_password:
            return False
        attempts = (
            ("/setup", {"action": "worldShutdown", "adminPassword": self._admin_password}),
            ("/join", {"action": "shutdown", "adminPassword": self._admin_password}),
        )
        for route, body in attempts:
            try:
                r = self.session.post(f"{self.base_url}{route}", data=body,
                                      timeout=self.timeout, allow_redirects=False)
            except requests.RequestException:
                continue
            if r.status_code in (401, 403):
                continue
            # A worldShutdown that was refused redirects to /join; do not wait on it.
            target = _redirect_target(r)
            if target and not target.endswith("/setup"):
                continue
            try:
                self.wait_for_setup(timeout=60)
            except Timeout:
                continue
            return True
        return False

    def set_admin_password(self, new_password: str) -> None:
        """Configure Foundry's own admin password (``updateServerConfiguration``).

        Requires no world to be active. Foundry hashes it into ``Config/admin.txt``
        (not options.json, despite what the option is called); the plaintext is never
        written anywhere by us.

        Note that ``updateServerConfiguration`` only calls ``options.save()`` when some
        *other* option also changed — but ``setAdministratorPassword`` writes admin.txt
        itself, so the password alone does persist immediately.
        """
        if self.world_active():
            raise FoundryError("a world is active — stop it before changing the "
                               "server configuration")

        # Once a password exists, Foundry refuses to change it until the *current* one
        # has been proved in this session ("The existing administrator password must be
        # provided before it can be changed"). The `adminPassword` action is that proof
        # — it sets the private flag adminConfigure then checks. Harmless and expected
        # to fail on a server that has none yet, which is why the result is not fatal.
        current = self._admin_password or new_password
        try:
            self._post("/setup", {"action": "adminPassword", "adminPassword": current})
        except FoundryError:
            pass

        self._post("/setup", {"action": "adminConfigure",
                              "config": {"adminPassword": new_password}})

    def session_cookies(self) -> list[dict]:
        """The session cookie jar, in the shape Chrome DevTools wants for setCookie."""
        return [
            {"name": c.name, "value": c.value, "domain": "127.0.0.1",
             "path": c.path or "/", "httpOnly": True, "secure": False}
            for c in self.session.cookies
        ]

    # -- backups ------------------------------------------------------------

    def create_snapshot(self, snapshot_id: str, note: str = "") -> None:
        """Foundry's native snapshot: one BackupData per installed package, plus
        worlds. Fire-and-forget — ``wait_for_snapshot`` is not optional."""
        self.setup("createSnapshot", id=snapshot_id, note=note)

    def list_backups(self) -> dict:
        return self.setup("listBackups")

    def restore_backup(self, pkg_type: str, pkg_id: str, backup_id: str) -> None:
        """Restore exactly one package from a native backup. Fire-and-forget."""
        self.setup("restoreBackup", backups=[{"type": pkg_type, "packageId": pkg_id,
                                              "id": backup_id}])

    def delete_snapshot(self, snapshot_id: str) -> None:
        self.setup("deleteSnapshot", snapshots=[snapshot_id])

    def check_snapshot_disk_space(self) -> dict:
        """Refused (400 on 14.369, 403 before) while a world is active — call it only
        after the server is parked at setup."""
        return self.setup("checkCreateSnapshotDiskSpace")

    # -- polling ------------------------------------------------------------

    def wait_for_world(self, world: str, timeout: float = 180.0) -> Status:
        """Poll ``/api/status`` until the named world is genuinely serving.

        A world that fails to launch leaves the server at the setup screen and emits
        the error over the socket only, so a timeout here means failure — never
        interpret it as "probably fine, just slow"."""
        deadline = time.monotonic() + timeout
        last: Status | None = None
        while time.monotonic() < deadline:
            try:
                last = self.status()
                if last.active and last.world == world:
                    return last
            except requests.RequestException:
                pass  # the server restarts its express app around a launch
            time.sleep(2.0)
        raise Timeout(f"world {world!r} did not become active within {timeout:.0f}s "
                      f"(last status: {last})")

    def wait_for_setup(self, timeout: float = 120.0) -> None:
        """Wait until no world is active, i.e. the package API will answer."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if not self.status().active:
                    return
            except requests.RequestException:
                pass
            time.sleep(2.0)
        raise Timeout(f"server still had a world active after {timeout:.0f}s")


# ── Disk verification — the counterweight to a fire-and-forget API ───────────

def installed_version(pkg_type: str, pkg_id: str) -> str | None:
    """Read a package's version off disk. ``None`` if the manifest is absent — which
    happens legitimately *mid-install*, while the archive is being extracted."""
    path = PACKAGE_DIR[pkg_type] / pkg_id / MANIFEST_NAME[pkg_type]
    try:
        v = json.loads(path.read_text(encoding="utf-8")).get("version")
    except (OSError, json.JSONDecodeError):
        return None
    return None if v is None else str(v)


def wait_for_package_version(pkg_type: str, pkg_id: str, expected: str,
                             timeout: float = 600.0) -> None:
    """Poll the on-disk manifest until it reports ``expected``.

    This is the only honest completion signal for an install: ``installPackage``
    resolves on fetch, and an install-step failure resolves ``{}``. A timeout is a
    failure and must trigger recovery.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if installed_version(pkg_type, pkg_id) == expected:
            return
        time.sleep(2.0)
    raise Timeout(f"{pkg_type} {pkg_id} never reached version {expected} "
                  f"(on disk: {installed_version(pkg_type, pkg_id)!r})")


def wait_for_snapshot(snapshot_id: str, timeout: float = 900.0) -> Path:
    """Wait for ``Data/Backups/snapshots/<id>.json``.

    Foundry writes that manifest only once every package backup in the snapshot has
    completed, so its existence is a correct completion signal — unlike the ``{}``
    that ``createSnapshot`` returns immediately.
    """
    target = SNAPSHOTS_DIR / f"{snapshot_id}.json"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if target.exists():
            return target
        time.sleep(2.0)
    raise Timeout(f"snapshot {snapshot_id} was not written within {timeout:.0f}s")


def error_log_path(day: str | None = None) -> Path:
    """Foundry's error log is date-suffixed and **only exists if an error occurred** —
    there is no plain ``error.log``. Callers must treat a missing file as "no errors"."""
    day = day or time.strftime("%Y-%m-%d")
    return LOGS_DIR / f"error.{day}.log"


def error_log_offset(day: str | None = None) -> int:
    p = error_log_path(day)
    return p.stat().st_size if p.exists() else 0


def error_log_since(offset: int, day: str | None = None) -> str:
    """New error-log bytes since ``offset`` in ``day``'s file. A run crossing midnight
    rolls over to a new file, so every later ``error.<date>.log`` up to today is new in
    full and is appended after the start day's tail (ROB-9)."""
    day = day or time.strftime("%Y-%m-%d")
    today = time.strftime("%Y-%m-%d")
    out = ""
    p = error_log_path(day)
    if p.exists():
        with p.open("r", encoding="utf-8", errors="replace") as fh:
            if p.stat().st_size >= offset:
                fh.seek(offset)
            out = fh.read()
    # ISO dates sort as strings; anything that is not a date is ignored.
    later = sorted(f for f in LOGS_DIR.glob("error.*.log")
                   if re.fullmatch(r"\d{4}-\d{2}-\d{2}", f.name[6:-4])
                   and day < f.name[6:-4] <= today)
    for f in later:
        out += f.read_text(encoding="utf-8", errors="replace")
    return out


def read_options() -> dict:
    return json.loads(OPTIONS_JSON.read_text(encoding="utf-8"))
