#!/usr/bin/env python3
"""Post-update verification, and the honest definition of "it still works".

Two layers, because they catch different things and only one of them is cheap.

**Server side** proves the world launches and the server is not throwing: the world
becomes active with the expected system, nothing new lands in Foundry's error log, and
no package we touched is in ``packageWarnings``.

**Client side** proves the part the server cannot see. A module that throws in the
browser and leaves the canvas blank is, from the server's point of view, a completely
healthy world. That failure would be discovered at the table.

Two things about the sequencing matter more than the checks themselves:

1. **Launching a world is itself destructive.** ``world.mjs setup()`` runs
   ``migrateCore()`` when the core is newer and ``migrateSystem()`` when the system is,
   in place, across every document, before anything here can pass or fail. That is why
   the backups happen first and why a failure at this stage restores *data*, not just code.

2. **Every world migrates independently, when it is launched.** Smoking only
   ``space-journey`` would leave ``ardenhaven`` to migrate unobserved at Joe's next
   manual launch — with no fresh snapshot and nobody watching. So all worlds are
   smoked, sequentially, and the report records which ones migrated.
"""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update.admin import FoundryAdmin, Timeout

REPO_ROOT = Path(__file__).resolve().parents[3]
SMOKE_JS = REPO_ROOT / "automation" / "smoke" / "smoke.mjs"
NODE = "/opt/homebrew/bin/node"
CHROME_PROFILE = REPO_ROOT / ".state" / "smoke-chrome-profile"
BASELINE_PATH = REPO_ROOT / ".state" / "vtt-smoke-baseline.json"
# Time for a deactivated world's LevelDB to finish closing before the next launch.
SETTLE_SECONDS = 8.0

_DIGITS = re.compile(r"\d+")

# Modules whose warnings are noise rather than breakage.
IGNORED_WARNING_TYPES = {"info"}


@dataclass
class WorldResult:
    world: str
    ok: bool = False
    server_ok: bool = False
    client_ok: bool | None = None       # None when the browser check was skipped
    migrated_system: str | None = None
    migrated_core: str | None = None
    errors: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    client: dict = field(default_factory=dict)

    def to_json(self) -> dict:
        return {
            "world": self.world, "ok": self.ok, "server_ok": self.server_ok,
            "client_ok": self.client_ok, "migrated_system": self.migrated_system,
            "migrated_core": self.migrated_core, "errors": self.errors,
            "notes": self.notes,
            # The full client payload carries console text; keep the useful summary.
            "client": {k: self.client.get(k) for k in
                       ("gameReady", "canvasReady", "scene", "systemVersion",
                        "coreVersion", "durationMs", "loggedInAs", "note")},
        }


def run_all(fa: FoundryAdmin, worlds: list[dict], *, policy: dict,
            touched: set[str], error_offset: int,
            log_day: str | None = None) -> list[WorldResult]:
    """Smoke every world in turn, leaving the last one launched."""
    smoke_policy = policy.get("smoke", {}) or {}
    wanted = smoke_policy.get("worlds", "all")
    selected = [w for w in worlds
                if wanted == "all" or w["id"] in (wanted if isinstance(wanted, list) else [wanted])]

    results: list[WorldResult] = []
    for world in selected:
        # Foundry serves ONE world at a time, and `launchWorld` is a /setup action —
        # which 403s while any world is active. So the previous world has to come down
        # before the next can go up, or every world after the first fails to launch.
        _return_to_setup(fa)
        results.append(_smoke_one(fa, world, policy=policy, touched=touched,
                                  error_offset=error_offset, log_day=log_day))
        # Each world's launch appends to the same log; advance the mark so the next
        # world is not blamed for the previous one's output.
        error_offset = admin_mod.error_log_offset(log_day)
    return results


def _return_to_setup(fa: FoundryAdmin) -> None:
    """Deactivate whatever world is running, so the setup API answers again.

    Prefers the graceful path (`POST /join {shutdown}`, which needs the admin password)
    and falls back to restarting the app — `options.json` has `world: null`, so a fresh
    start lands on the setup screen.
    """
    try:
        if not fa.world_active():
            return
    except Exception:  # noqa: BLE001
        return
    if fa.deactivate_world():
        # /api/status flips to inactive as soon as the world is torn down, but the
        # world's LevelDB closes asynchronously after that. Launching the next world
        # too quickly produces `LEVEL_DATABASE_NOT_OPEN — Failed to connect to database`
        # in the server log, which the error-log check then reports as breakage caused
        # by the update. Observed; the settle is not superstition.
        time.sleep(SETTLE_SECONDS)
        return
    admin_mod.quit_app()
    admin_mod.start_app()
    try:
        fa.reauthenticate()   # the restart invalidated the session
    except Exception:  # noqa: BLE001
        pass


def _fingerprint(errors: list[dict]) -> list[str]:
    """A stable signature for a world's client errors.

    Numbers are masked because line/column offsets and ids move between builds while
    the underlying fault is the same one.
    """
    seen = {_DIGITS.sub("#", (e.get("text") or "")[:200]).strip()
            for e in errors if e.get("type") in ("pageerror", "console", "canvas")}
    return sorted(x for x in seen if x)


def load_baseline() -> dict:
    try:
        return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_baseline(world: str, fingerprint: list[str]) -> None:
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = load_baseline()
    data[world] = fingerprint
    BASELINE_PATH.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def _smoke_one(fa: FoundryAdmin, world: dict, *, policy: dict, touched: set[str],
               error_offset: int, log_day: str | None) -> WorldResult:
    smoke_policy = policy.get("smoke", {}) or {}
    result = WorldResult(world=world["id"])

    pre_system = world.get("system_version")
    pre_core = world.get("core_version")

    # ── Server side ──
    try:
        fa.launch_world(world["id"])
        status = fa.wait_for_world(world["id"], timeout=240)
    except (Timeout, Exception) as exc:  # noqa: BLE001
        result.errors.append(f"world did not launch: {exc}")
        return result

    if status.system_version and status.system_version != pre_system:
        result.migrated_system = f"{pre_system} → {status.system_version}"
    if status.version and pre_core and status.version != pre_core:
        result.migrated_core = f"{pre_core} → {status.version}"

    new_errors = admin_mod.error_log_since(error_offset, log_day).strip()
    if new_errors:
        # Keep a bounded excerpt: the log can contain player IPs, and the report is
        # committed, so report.py scrubs this before it is written out.
        result.errors.append("new server errors:\n" + new_errors[-2000:])

    result.server_ok = not result.errors

    # ── Client side ──
    if not smoke_policy.get("browser", True):
        result.notes.append("browser check disabled in update-policy.yml")
        result.ok = result.server_ok
        return result

    client = run_browser(fa, world["id"],
                         dwell=int(smoke_policy.get("browser_dwell_seconds", 60)),
                         ignores=smoke_policy.get("ignore_console") or [])
    result.client = client

    # A world that was ALREADY throwing before we touched anything must not veto an
    # update. `ardenhaven` throws "Cannot add property walls, object is not extensible"
    # on every load, entirely independently of this run — without a baseline, that one
    # broken world would roll back every good update forever. So the pass/fail question
    # is "did this run make it worse", not "is it perfect".
    fingerprint = _fingerprint(client.get("errors", []))
    baseline = load_baseline().get(world["id"])
    new_faults = ([f for f in fingerprint if f not in baseline]
                  if baseline is not None else [])

    if baseline is None:
        # First sighting: nothing to compare against, so record rather than accuse.
        result.client_ok = True
        if fingerprint:
            result.notes.append(
                f"{len(fingerprint)} pre-existing client error(s) recorded as this "
                f"world's baseline; a future run fails only on NEW ones")
        save_baseline(world["id"], fingerprint)
    elif new_faults:
        result.client_ok = False
        for fault in new_faults[:10]:
            result.errors.append(f"client (new since last run): {fault}")
    else:
        result.client_ok = True
        if fingerprint:
            result.notes.append(f"{len(fingerprint)} known client error(s), unchanged "
                                f"from the recorded baseline")
        # Refresh, so a fault that has since been FIXED stops being tolerated.
        if fingerprint != baseline:
            save_baseline(world["id"], fingerprint)
    if not client.get("gameReady"):
        # Whatever the baseline says, a world that never becomes ready is a failure.
        result.client_ok = False
        result.errors.append("client: game.ready never became true")
    if client.get("note"):
        result.notes.append(client["note"])

    # A module that was updated and now warns is the signal we care about; unrelated
    # pre-existing noise is not this run's problem.
    for module in client.get("activeModules", []):
        pkg_id = module.split("@")[0]
        if pkg_id in touched:
            result.notes.append(f"updated module active after reload: {module}")

    result.ok = result.server_ok and result.client_ok
    return result


def run_browser(fa: FoundryAdmin, world: str, *, dwell: int,
                ignores: list[str]) -> dict:
    """Drive Chrome through the world as GM and report what the browser saw.

    The admin session cookie is handed to Node through a 0600 temp file rather than an
    argument — cookies are bearer credentials and argv is world-readable. The GM's own
    password is never involved: the browser is already an authenticated admin and uses
    ``loginAs``.
    """
    if not SMOKE_JS.exists():
        return {"ok": True, "skipped": "smoke.mjs not installed", "errors": []}

    try:
        fa.authenticate()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "errors": [{"type": "fatal",
                                         "text": f"admin auth failed: {exc}"}]}

    cookies = fa.session_cookies()
    if not cookies:
        return {"ok": False, "errors": [{"type": "fatal",
                                         "text": "no admin session cookie to hand the browser"}]}

    CHROME_PROFILE.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump(cookies, fh)
        cookie_path = Path(fh.name)
    cookie_path.chmod(0o600)

    cmd = [NODE, str(SMOKE_JS), "--url", fa.base_url, "--world", world,
           "--dwell", str(dwell), "--cookies", str(cookie_path),
           "--profile", str(CHROME_PROFILE)]
    for pattern in ignores:
        cmd += ["--ignore", pattern]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=dwell + 600)
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {"ok": False, "errors": [{"type": "fatal",
                                         "text": f"browser smoke test failed to run: {exc}"}]}
    finally:
        cookie_path.unlink(missing_ok=True)

    try:
        return json.loads(proc.stdout[proc.stdout.find("{"):])
    except (json.JSONDecodeError, ValueError):
        return {"ok": False, "errors": [
            {"type": "fatal",
             "text": f"unparseable smoke output (rc={proc.returncode}): "
                     f"{(proc.stderr or proc.stdout)[-500:]}"}]}


def package_warnings(fa: FoundryAdmin, touched: set[str]) -> dict:
    """Foundry's own per-package warnings.

    Must be read **before** a world is launched: ``setup.mjs``'s socket handler returns
    ``{}`` once ``game.world`` is set, so this is silently empty afterwards. It is also
    the only place an install-step failure shows up — ``installPackage`` resolves ``{}``
    on one.
    """
    try:
        data = fa.setup("getPackages", type="module")
    except Exception:  # noqa: BLE001
        return {}
    warnings = data.get("packageWarnings") or {}
    return {k: v for k, v in warnings.items() if k in touched}


def wait_for_settle(seconds: float = 5.0) -> None:
    """Let the server finish its post-launch bookkeeping before probing again."""
    time.sleep(seconds)
