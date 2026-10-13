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
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from scripts.foundry import host

from . import config as cfg
from .out import say as _say  # kept for compatibility (test_out.py and older importers)

try:
    import fcntl
except ImportError:  # pragma: no cover — native Windows; BOSS runs Foundry in WSL
    fcntl = None  # type: ignore[assignment]

OK, FAIL = 0, 1

# cloudflared's own credential, written by `cloudflared tunnel login`.
CF_CERT = Path.home() / ".cloudflared/cert.pem"
# `cloudflared tunnel list/create/route` talk to Cloudflare; a stuck one must not hang
# `make` (py-ops-ac-4). `tunnel login` has none: it waits on a person in a browser.
CF_TIMEOUT = 20

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


def is_access_login(code: int, location: str) -> bool:
    """True when the answer is Cloudflare Access's login redirect, not the origin's.

    Access answers the public hostname itself — a 3xx to
    ``https://<team>.cloudflareaccess.com/cdn-cgi/access/login/...`` (or the same path
    on our own host) — whether or not a tunnel and Foundry sit behind it. So that
    redirect proves nothing about the origin.
    """
    if not 300 <= code < 400 or not location:
        return False
    parts = urlsplit(location)
    host = (parts.hostname or "").lower()
    if host == "cloudflareaccess.com" or host.endswith(".cloudflareaccess.com"):
        return True
    return host in ("", cfg.TUNNEL_HOST) and parts.path.startswith("/cdn-cgi/access/login")


# ── update-run lock ───────────────────────────────────────────────────────────

def lock_check() -> int:
    if cfg.UPDATE_LOCK.is_dir():
        _say(f"✗ an auto-update run is in progress ({cfg.UPDATE_LOCK.name}).")
        _say("  Wait for it, or: make vtt-update-status")
        return FAIL
    return OK


# ── the Foundry application ───────────────────────────────────────────────────

def _boot_choice() -> int:
    """The boot choice (design §6, context/plans/rclone-two-hosts-2026-10.md;
    use-doc ops.md §3), once per start.

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
    # Both probes: on BOSS a PENTARYN_START_CMD whose command line does not match
    # `main.js --dataPath=<root>` has no pid we can find, but its port still answers.
    if host.pid() is None and not host.is_running():
        _say("▸ foundry already down")
        return OK
    if not host.can_request_stop():
        # Port live, no process found, no hook: there is nothing to signal. Saying
        # "stopped" here would be a false success (and a vtt-down backup would follow it).
        _say(f"✗ foundry is answering on port {host.foundry_port()}, but this machine can't "
             "stop it: no Foundry process found and PENTARYN_STOP_CMD is not set "
             "(host.env). Stop it by hand, or set PENTARYN_STOP_CMD.")
        return FAIL
    # Ask politely first — a graceful quit lets Foundry close its LevelDB cleanly.
    if not host.request_stop():
        host.force_stop()
    _say("✓ foundry stopped")
    return OK


# ── the Cloudflare tunnel ─────────────────────────────────────────────────────

def _tunnel_pid() -> int | None:
    """The pid from the pidfile, if that process is alive AND is cloudflared."""
    try:
        pid = int(cfg.CF_PID.read_text().strip())
    except (OSError, ValueError):
        return None
    if pid <= 0:   # os.kill(0|-n, …) would signal a whole process group, not one process
        return None
    try:
        os.kill(pid, 0)
    except OSError:
        return None
    return pid if _is_cloudflared(pid) else None


def _is_cloudflared(pid: int) -> bool:
    """A pidfile outlives its process and the OS hands the number to whatever starts
    next, so `kill -0` alone would call that process the tunnel — and tunnel-down
    would SIGTERM it (EC-3). `ps` names the executable (a full path on macOS)."""
    try:
        res = subprocess.run(["ps", "-p", str(pid), "-o", "comm="],
                             capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return False
    return Path((res.stdout or "").strip()).name in ("cloudflared", "cloudflared.exe")


def _drop_stale_pidfile() -> None:
    """Called once _tunnel_pid() has said no: any pidfile left is stale."""
    if cfg.CF_PID.exists():
        cfg.CF_PID.unlink(missing_ok=True)
        _say("▸ stale pidfile removed")


@contextmanager
def _tunnel_lock():
    """Exclusive flock on RUN_DIR/cloudflared.lock (py-ops-ac-3).

    tunnel_up's pidfile check and its pidfile write are seconds apart (`cloudflared
    tunnel list` sits between them), so two overlapping runs both saw "no tunnel" and
    both started cloudflared. Holding this across that window makes the second run
    wait, then see the first one's pidfile and say "already up"."""
    if fcntl is None:
        yield
        return
    with open(cfg.RUN_DIR / "cloudflared.lock", "a") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


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
    with _tunnel_lock():   # check → start → pidfile is one step to a concurrent run
        if (pid := _tunnel_pid()) is not None:
            _say(f"▸ tunnel already up (pid {pid})")
            return OK
        _drop_stale_pidfile()
        if not CF_CERT.exists():
            _say("✗ cloudflared not authenticated — run: make tunnel-setup")
            return FAIL
        try:
            listed = subprocess.run(["cloudflared", "tunnel", "list"],
                                    capture_output=True, text=True, timeout=CF_TIMEOUT)
        except subprocess.TimeoutExpired:
            _say(f"✗ cloudflared did not answer in {CF_TIMEOUT}s — tunnel not started")
            return FAIL
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
        _drop_stale_pidfile()
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
    lines_ = cfg.CF_LOG.read_text(errors="replace").splitlines()
    tail = lines_[-lines:] if lines > 0 else []   # [-0:] is the whole log (rob-9)
    if tail:
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
    try:
        listed = subprocess.run(["cloudflared", "tunnel", "list"],
                                capture_output=True, text=True, timeout=CF_TIMEOUT)
        if cfg.TUNNEL_NAME not in (listed.stdout or ""):
            if subprocess.run(["cloudflared", "tunnel", "create", cfg.TUNNEL_NAME],
                              timeout=CF_TIMEOUT).returncode != 0:
                return FAIL
        routed = subprocess.run(
            ["cloudflared", "tunnel", "route", "dns", cfg.TUNNEL_NAME, cfg.TUNNEL_HOST],
            capture_output=True, text=True, timeout=CF_TIMEOUT,
        )
    except subprocess.TimeoutExpired as exc:
        _say(f"✗ cloudflared did not answer in {CF_TIMEOUT}s ({' '.join(exc.cmd[1:3])}) "
             "— setup not complete")
        return FAIL
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
    elif is_access_login(code, location) and not pid:
        state = "access-only"
        verdict = "Access login only (tunnel down — players cannot connect)"
    elif is_access_login(code, location):
        state = "access-gated"
        verdict = ("behind Cloudflare Access (login redirect) — tunnel process up; "
                   "a script cannot see the origin past the login")
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
