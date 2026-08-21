#!/usr/bin/env python3
"""Client for Foundry's local admin HTTP API, plus the app's process lifecycle.

Everything the updater needs is already implemented inside Foundry; this module is a
typed front door onto it rather than a reimplementation. Read
``/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/dist/server/views/``
if you want the other side of any of these calls.

Three facts about that API shape this whole file:

1. **Every ``/setup`` and ``/update`` package action is gated on ``!game.world``.**
   They return 403 while a world is active (``setup.mjs``: ``c = !game.world && adminOk``).
   So the updater has to park the server at the setup screen before it can do anything.

2. **``POST /setup {shutdown: true}`` does not work from a script.** It calls
   ``world.deactivate(req, {asAdmin: c})`` with that same always-false ``c``, and
   ``world.mjs`` then bails to ``{redirect: "/join"}`` because a curl session has no
   ``req.user``. The only script-reachable graceful deactivate is
   ``POST /join {action: "shutdown", adminPassword}`` — which needs an admin password.
   Since a OneDrive backup needs the server fully stopped anyway, we quit the app
   instead: exactly what ``make vtt-down`` has done safely every session.

3. **Several actions are fire-and-forget.** ``createSnapshot``, ``restoreSnapshot``,
   ``restoreBackup`` and ``launchWorld`` return ``{}`` at once and emit progress (and
   errors) only over socket.io. Callers must poll for the effect — hence
   ``wait_for_world``, ``wait_for_snapshot`` and ``wait_for_package_version``.

Admin auth needs the configured admin password (hashed into ``Config/admin.txt``, not
options.json). Pass it via ``admin_password=`` — read from Infisical or the login
keychain at the point of use, never from a file in this repo and never in argv.

Without one, ``sessions.authenticateAdmin`` returns ``{success: true}`` but leaves
``session.admin`` **false**, which quietly breaks the two calls that check that flag
directly: ``loginAsUser`` (the smoke test's GM login) and ``POST /join {shutdown}``.
"""

from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

import requests

from scripts.foundry.cloud import FOUNDRY_DATA

BASE_URL = "http://127.0.0.1:30000"
APP_NAME = "Foundry Virtual Tabletop"
APP_DIR = Path("/Applications/Foundry Virtual Tabletop.app")
APP_PAYLOAD = APP_DIR / "Contents/Resources/app"

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
    """The server answers on :30000 when up. `cloud.py` uses the same probe, and
    several of its operations `die()` while it is true."""
    try:
        requests.get(BASE_URL, timeout=timeout, allow_redirects=False)
        return True
    except requests.RequestException:
        return False


def process_running() -> bool:
    return subprocess.run(
        ["pgrep", "-f", f"MacOS/{APP_NAME}"], capture_output=True, text=True
    ).returncode == 0


def quit_app(timeout: float = 120.0) -> None:
    """Quit Foundry and wait until it is *actually* gone.

    ``osascript quit`` returns as soon as the Apple Event is delivered, long before
    Electron has closed the world's LevelDB and released the port. Returning early
    here would hand a still-live server to ``cloud.py backup``, which `die()`s on it.
    """
    if not process_running() and not port_open():
        return
    subprocess.run(
        ["osascript", "-e", f'quit app "{APP_NAME}"'],
        capture_output=True, text=True, timeout=30,
    )
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not port_open(timeout=1.0) and not process_running():
            time.sleep(2.0)  # let LevelDB finish flushing after the port drops
            return
        time.sleep(1.0)
    # Escalate exactly once; a wedged Electron would otherwise block the whole run.
    subprocess.run(["pkill", "-f", f"MacOS/{APP_NAME}"], capture_output=True)
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
    subprocess.run(["open", "-a", str(APP_DIR)], check=True, capture_output=True)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if port_open(timeout=2.0):
            return
        time.sleep(1.0)
    raise Timeout(f"{APP_NAME} did not answer on {BASE_URL} within {timeout:.0f}s")


# ── HTTP client ──────────────────────────────────────────────────────────────

class FoundryAdmin:
    """A session against the local server. Cookies carry the admin flag between calls."""

    def __init__(self, base_url: str = BASE_URL, admin_password: str | None = None,
                 timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._admin_password = admin_password
        self.session = requests.Session()
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
        """Establish an admin session. Sends ``adminPassword`` only if we were given
        one — in the body, never in argv, and never logged."""
        if self._authenticated:
            return
        body = {}
        if self._admin_password:
            body["adminPassword"] = self._admin_password
        r = self.session.post(f"{self.base_url}/auth", data=body,
                              timeout=self.timeout, allow_redirects=False)
        # /auth redirects to /setup on success, back to /auth on failure.
        location = r.headers.get("Location", "")
        if r.status_code == 403 or location.endswith("/auth"):
            raise FoundryError(
                "admin authentication failed — an admin password is configured "
                "(Config/admin.txt) and the one supplied did not match. "
                "Re-sync it with: make foundry-admin-push"
            )
        self._authenticated = True

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
        if r.status_code == 403 and not _retried and self._admin_password:
            # Sessions live in the server's memory, so ANY restart invalidates the
            # cookie and every admin call starts 403ing. A core update restarts the
            # process by design (`Updater.restart()` respawns it), which made a
            # successful core update look like a failed one: the update landed, the
            # smoke test could not launch a world, and the whole thing was rolled back.
            # One transparent re-auth turns that into a non-event.
            self.reauthenticate()
            return self._post(route, payload, _retried=True)
        if r.status_code == 403:
            raise FoundryError(
                f"{route} {payload.get('action')} refused (403) — a world is active, "
                "or admin auth was rejected. Package actions need the setup screen."
            )
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

    def deactivate_world(self) -> bool:
        """Return the server to the setup screen **without quitting the app**.

        ``POST /setup {shutdown: true}`` looks like the way to do this and is not:
        ``setup.mjs`` passes ``asAdmin = !game.world && adminOk``, which is always
        false while a world is up, and ``world.deactivate`` then bails to
        ``{redirect: "/join"}`` because a scripted session has no ``req.user``.

        ``POST /join {action: "shutdown"}`` is the one that works — but it refuses
        outright unless an admin password is configured (``if (!config.adminPassword)
        return 403``). Returns False when that is the case, so the caller can fall
        back to quitting the app.
        """
        if not self._admin_password:
            return False
        r = self.session.post(
            f"{self.base_url}/join",
            data={"action": "shutdown", "adminPassword": self._admin_password},
            timeout=self.timeout, allow_redirects=False,
        )
        if r.status_code in (401, 403):
            return False
        try:
            self.wait_for_setup(timeout=90)
        except Timeout:
            return False
        return True

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
        """403s while a world is active — call it only after the server is parked
        at setup."""
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
        return json.loads(path.read_text(encoding="utf-8")).get("version")
    except (OSError, json.JSONDecodeError):
        return None


def installed_manifest(pkg_type: str, pkg_id: str) -> dict | None:
    path = PACKAGE_DIR[pkg_type] / pkg_id / MANIFEST_NAME[pkg_type]
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


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
    """New error-log bytes since ``offset``. A run crossing midnight rolls over to a
    new file, in which case the whole new file is new."""
    p = error_log_path(day)
    if not p.exists():
        return ""
    with p.open("r", encoding="utf-8", errors="replace") as fh:
        if p.stat().st_size >= offset:
            fh.seek(offset)
        return fh.read()


def read_options() -> dict:
    return json.loads(OPTIONS_JSON.read_text(encoding="utf-8"))
