"""Server and tunnel lifecycle: up, down, status.

The composite `make vtt-up` is the app AND the tunnel AND a backup AND an asset
unpack. The commands here are the individual pieces it composes; run one on its own
and you get exactly that piece.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from scripts.foundry import host

from . import config as cfg
from .out import say as _say  # re-exported: modules.py and pipeline.py import it from here

OK, FAIL = 0, 1

# cloudflared's own credential, written by `cloudflared tunnel login`.
CF_CERT = Path.home() / ".cloudflared/cert.pem"

# Every probe claims to be a browser, and this is load-bearing rather than cosmetic.
# Cloudflare 403s a bare `Python-urllib/3.x` at the edge before the request ever
# reaches Foundry. That turns a healthy server into "HTTP 403" in `make vtt`, and —
# far worse — makes the Gate 2 verifier read "tunnel not reachable, nothing to
# verify" and PASS without checking anything, which is precisely the passes-for-the-
# wrong-reason failure the gate exists to prevent. The probes must see what a
# player's browser sees.
BROWSER_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def _http_code(url: str, timeout: float) -> int:
    """HTTP status for a HEAD-ish GET, or 0 if the request never landed.

    urllib raises on 4xx/5xx, which are perfectly good answers here — a 404 is the
    whole point of the pipeline's public-exposure check — so HTTPError is unwrapped
    rather than propagated.
    """
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": BROWSER_UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except Exception:
        return 0


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Report the redirect instead of following it — where it points is the answer."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _probe(url: str, timeout: float) -> tuple[int, str]:
    """(status, Location) without following redirects.

    Foundry answers the site root with a redirect whose target says what state the
    server is in: /setup when no world is launched, /join or /game when one is. That
    distinction is the whole difference between "players can connect" and "players
    get a 403", so it must not be flattened into a single status code.
    """
    opener = urllib.request.build_opener(_NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA})
    try:
        with opener.open(req, timeout=timeout) as resp:
            return resp.status, resp.headers.get("Location", "")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Location", "") if exc.headers else ""
    except Exception:
        return 0, ""


def foundry_is_up(timeout: float = 2.0) -> bool:
    return _probe(cfg.FOUNDRY_URL, timeout)[0] in (200, 302)


def world_is_launched(timeout: float = 3.0) -> bool | None:
    """True if a world is active, False if the server is parked at /setup, None if
    the server did not answer at all."""
    code, location = _probe(cfg.FOUNDRY_URL, timeout)
    if code == 0:
        return None
    if code == 302 and "/setup" in location:
        return False
    return True


# ── update-run lock ───────────────────────────────────────────────────────────

def lock_check() -> int:
    if cfg.UPDATE_LOCK.is_dir():
        _say(f"✗ an auto-update run is in progress ({cfg.UPDATE_LOCK.name}).")
        _say("  Wait for it, or: make vtt-update-status")
        return FAIL
    return OK


# ── the Foundry application ───────────────────────────────────────────────────

def _boot_choice() -> int:
    """The §6 boot choice, once per start.

    `make foundry-up` / `vtt-up` run it as their own `foundry-boot` step and set
    PENTARYN_BOOT_DONE so it is not asked twice; `make login` (and anything else that
    calls up()) gets it here. The updater sets PENTARYN_BOOT_DONE=skip: a restore in the
    middle of an update would invalidate its own rollback point."""
    if os.environ.get("PENTARYN_BOOT_DONE"):
        return OK
    from scripts.foundry import boot
    rc = boot.choose()
    os.environ["PENTARYN_BOOT_DONE"] = "1"
    return rc


def up() -> int:
    if foundry_is_up():
        _say("▸ foundry already up")
        return OK
    if _boot_choice() != OK:
        _say("✗ the boot step failed — Foundry was not started")
        return FAIL
    _say("▸ starting Foundry...")
    try:
        host.start()  # Mac: open -a · BOSS: PENTARYN_START_CMD (host.py)
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        _say(f"✗ can't launch Foundry ({host.foundry_app_root()}) — is it installed?")
        return FAIL

    for _ in range(cfg.FOUNDRY_BOOT_TIMEOUT):
        if foundry_is_up():
            _say(f"✓ foundry up on {cfg.FOUNDRY_URL}")
            _warn_stale_bridge()
            return OK
        time.sleep(1)
    _say(f"✗ foundry didn't answer after {cfg.FOUNDRY_BOOT_TIMEOUT}s "
         "(first run? finish activation in the window)")
    return FAIL


def _warn_stale_bridge() -> None:
    """A restart is exactly when the browser reconnects — and reconnecting to a stale
    broker is silent. Imported here to keep bridge.py out of the module import cycle."""
    try:
        from .bridge import warn_if_stale
        warn_if_stale()
    except Exception:
        pass


def down() -> int:
    if host.pid() is None:
        _say("▸ foundry already down")
        return OK
    # Ask politely first — a graceful quit lets Foundry close its LevelDB cleanly.
    if not host.request_stop():
        host.force_stop()
    _say("✓ foundry stopped")
    return OK


# ── the Cloudflare tunnel ─────────────────────────────────────────────────────

def _tunnel_pid() -> int | None:
    """The pid from the pidfile, if that process is actually alive."""
    try:
        pid = int(cfg.CF_PID.read_text().strip())
    except (OSError, ValueError):
        return None
    try:
        os.kill(pid, 0)
    except OSError:
        return None
    return pid


def tunnel_up() -> int:
    # The tunnel publishes this machine's Foundry as vtt.atjoseph.com; only the primary
    # does that (design §8). On the alt this is a loud no-op, not a failure: "Foundry up,
    # no tunnel" is exactly what the alt is for, so `vtt-up` still succeeds there.
    try:
        host.require_primary("the tunnel", "tunnel-up", log=_say)
    except host.NotPrimary as exc:
        _say(f"▸ tunnel NOT started — {exc}")
        return OK
    cfg.RUN_DIR.mkdir(parents=True, exist_ok=True)
    if (pid := _tunnel_pid()) is not None:
        _say(f"▸ tunnel already up (pid {pid})")
        return OK
    if not CF_CERT.exists():
        _say("✗ cloudflared not authenticated — run: make tunnel-setup")
        return FAIL
    listed = subprocess.run(["cloudflared", "tunnel", "list"],
                            capture_output=True, text=True)
    if cfg.TUNNEL_NAME not in (listed.stdout or ""):
        _say(f"✗ tunnel '{cfg.TUNNEL_NAME}' doesn't exist — run: make tunnel-setup")
        return FAIL

    _say("▸ starting tunnel...")
    with open(cfg.CF_LOG, "ab") as log:
        proc = subprocess.Popen(
            ["cloudflared", "tunnel", "--config", str(cfg.CF_CONFIG),
             "run", cfg.TUNNEL_NAME],
            stdout=log, stderr=log, stdin=subprocess.DEVNULL,
            start_new_session=True,   # survives the make process going away
        )
    cfg.CF_PID.write_text(str(proc.pid))
    time.sleep(3)
    if _tunnel_pid() is not None:
        _say(f"✓ tunnel up → https://{cfg.TUNNEL_HOST}")
        return OK
    _say(f"✗ tunnel died on startup — see {cfg.CF_LOG}")
    cfg.CF_PID.unlink(missing_ok=True)
    return FAIL


def tunnel_down() -> int:
    pid = _tunnel_pid()
    if pid is None:
        cfg.CF_PID.unlink(missing_ok=True)
        _say("▸ tunnel already down")
        return OK
    try:
        os.kill(pid, 15)
    except OSError:
        pass
    cfg.CF_PID.unlink(missing_ok=True)
    _say("✓ tunnel stopped")
    return OK


def tunnel_logs(lines: int = 40) -> int:
    if not cfg.CF_LOG.exists():
        _say(f"no log yet ({cfg.CF_LOG})")
        return OK
    tail = cfg.CF_LOG.read_text(errors="replace").splitlines()[-lines:]
    print("\n".join(tail))
    return OK


def tunnel_setup() -> int:
    """One-time: authenticate, create the named tunnel, point DNS at it."""
    if not shutil.which("cloudflared"):
        _say("✗ cloudflared is not installed — brew install cloudflared")
        return FAIL
    if not CF_CERT.exists():
        if subprocess.run(["cloudflared", "tunnel", "login"]).returncode != 0:
            return FAIL
    listed = subprocess.run(["cloudflared", "tunnel", "list"],
                            capture_output=True, text=True)
    if cfg.TUNNEL_NAME not in (listed.stdout or ""):
        if subprocess.run(["cloudflared", "tunnel", "create", cfg.TUNNEL_NAME]).returncode != 0:
            return FAIL
    routed = subprocess.run(
        ["cloudflared", "tunnel", "route", "dns", cfg.TUNNEL_NAME, cfg.TUNNEL_HOST],
        capture_output=True, text=True,
    )
    if routed.returncode != 0:
        _say("▸ DNS route already exists (fine)")
    _say("✓ setup complete — now: make vtt-up")
    return OK


# ── status ────────────────────────────────────────────────────────────────────

def status_report() -> dict:
    """The three answers as data: `{foundry, tunnel, public}` (python-tooling-41)."""
    up = foundry_is_up(3.0)
    pid = _tunnel_pid()
    # The one that matters — and the one that used to lie. "HTTP 403" was printed
    # both when the tunnel was down and when it was perfectly healthy but no world
    # was launched: Foundry redirects the root to /setup, and /setup is 403'd at the
    # Cloudflare edge on purpose. Two opposite situations, one message. Now the
    # redirect target is read, so the line says which one it is.
    code, location = _probe(f"https://{cfg.TUNNEL_HOST}/", 8.0)
    if code == 0:
        state = "unreachable"
        verdict = "not reachable — tunnel or DNS is down"
    elif code == 302 and "/setup" in location:
        state = "no-world"
        verdict = ("tunnel OK, but NO WORLD IS LAUNCHED — players get a 403.\n"
                   f"  {'':<10} Launch one in the Foundry window (/setup is blocked "
                   "through the tunnel by design).")
    elif code in (200, 302):
        state = "reachable"
        verdict = f"reachable (HTTP {code}) — players can connect"
    else:
        state = "unexpected"
        verdict = f"unexpected HTTP {code}{f' → {location}' if location else ''}"
    return {
        "foundry": {"up": up, "url": cfg.FOUNDRY_URL},
        "tunnel": {"up": bool(pid), "pid": pid, "host": cfg.TUNNEL_HOST},
        "public": {"state": state, "code": code, "location": location, "verdict": verdict},
    }


def status(as_json: bool = False) -> int:
    """Three answers: the app, the tunnel process, and what players actually get."""
    r = status_report()
    if as_json:
        print(json.dumps(r, indent=2, ensure_ascii=False))
        return OK
    print(f"  {'foundry:':<10} "
          + (f"UP   ({cfg.FOUNDRY_URL})" if r["foundry"]["up"] else "down"))
    pid = r["tunnel"]["pid"]
    print(f"  {'tunnel:':<10} "
          + (f"UP   (pid {pid}, https://{cfg.TUNNEL_HOST})" if pid else "down"))
    print(f"  {'public:':<10} {r['public']['verdict']}")
    return OK
