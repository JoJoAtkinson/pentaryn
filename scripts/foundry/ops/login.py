"""One command from a cold laptop to inside a world, as whoever you pick.

`make login` starts Foundry if it is down, offers an arrow-key menu of the campaigns on
disk and the users in the one you choose, authenticates as server administrator with
the password from Infisical (or the keychain mirror), logs that session in, and hands
the resulting cookie to the browser. No setup screen, no dropdown, no typed password.

The Foundry-side mechanics — why ``/auth`` cannot be used while a world is live, why
``/setup`` can, and why ``loginAs`` needs no user password — live in
:mod:`scripts.foundry.update.admin`, which is the client this module drives. What is
specific to *this* file is the last hop: getting the session into a real browser.

## The handoff

Foundry issues ``session=<id>; Path=/; HttpOnly; SameSite=Strict``
(``sessions.mjs``, ``COOKIE_MAX_AGE = 864e5``). ``HttpOnly`` puts it out of reach of a
bookmarklet or any page script, so the browser has to be *given* it on a response
header — but per RFC 6265 §8.5 cookies are scoped to a host, not a host:port. A
response from ``http://localhost:<ephemeral>`` therefore sets a cookie that
``http://localhost:30000`` will send. So: a one-shot local server that answers a single
request with the cookie and a 302 into ``/game``.

The admin password never leaves this process — the browser receives a session id, not a
credential, and the id is never printed, written to disk, or passed in argv (only the
one-shot nonce is, and it dies on first use). ``/auth``, ``/setup`` and ``/update`` are
403 at the Cloudflare edge (``foundry/cloudflared/config.yml``), so every step works
from the laptop and from nowhere else.

**The session handed over is admin-flagged**, which a human logging in through the
``/join`` form is not. Foundry offers no way to drop the flag while a world is active
(``adminLogout`` sits behind the same ``!game.world`` gate as every other action), so
this is inherent to logging in this way rather than a shortcut taken here. It is
``HttpOnly``, ``SameSite=Strict`` and scoped to ``localhost``, so it can never be sent
to the tunnel. See `context/foundry/ops.md` §6.
"""

from __future__ import annotations

import datetime
import http.server
import json
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse

import requests

from . import config as cfg, service
from ..admin_password import AdminPasswordUnavailable, foundry_admin_password
from ..update.admin import FoundryAdmin, FoundryError

OK, FAIL = 0, 1

GAMEMASTER_ROLE = 4
SESSION_COOKIE = "session"
COOKIE_MAX_AGE = 86400          # matches Foundry's own ClientSessions.COOKIE_MAX_AGE
HANDOFF_TIMEOUT = 90.0          # how long the one-shot server waits for the browser
WORLD_READY_TIMEOUT = 240.0
# Time for a deactivated world's LevelDB to finish closing before the next launch.
# Shorter and Foundry logs `LEVEL_DATABASE_NOT_OPEN`; smoke.py learned this the same way.
SETTLE_SECONDS = 8.0

ROLE_LABEL = {4: "Gamemaster", 3: "Assistant", 2: "Player", 1: "Trusted"}


def _say(msg: str) -> None:
    print(f"  {msg}")


# ── Picking things ───────────────────────────────────────────────────────────

def _interactive() -> bool:
    """Only prompt at a real terminal. `make vtt-login` inside a script, a cron job or
    a piped shell must never sit waiting on an arrow key nobody is there to press."""
    return sys.stdin.isatty() and sys.stdout.isatty()


def _choose(prompt: str, options: list[tuple[str, object]], default_index: int = 0):
    """An arrow-key menu, degrading to a numbered prompt.

    ``questionary`` is a declared dependency, but it is imported here rather than at
    module scope so that a checkout which has not run ``uv sync`` still gets a working
    ``vtt-login`` — just with a duller picker. A login command that cannot run because
    its *menu* library is missing would be a poor trade.
    """
    try:
        import questionary

        answer = questionary.select(
            prompt,
            choices=[questionary.Choice(title=label, value=value)
                     for label, value in options],
            default=options[default_index][1],
            qmark="▸",
            instruction="(↑/↓, enter)",
        ).ask()
        if answer is None:          # Ctrl-C / Esc
            raise KeyboardInterrupt
        return answer
    except ImportError:
        print(f"  {prompt}")
        for i, (label, _) in enumerate(options, 1):
            mark = "*" if i - 1 == default_index else " "
            print(f"   {mark}{i}. {label}")
        raw = input(f"   choose [1-{len(options)}, enter for {default_index + 1}]: ").strip()
        if not raw:
            return options[default_index][1]
        try:
            return options[int(raw) - 1][1]
        except (ValueError, IndexError):
            raise RuntimeError(f"{raw!r} is not one of 1-{len(options)}") from None


# Foundry stores `lastPlayed` as a raw JavaScript `Date.toString()` —
# "Sat Aug 22 2026 13:37:32 GMT-0400 (Eastern Daylight Time)" — not ISO 8601. Sorting
# those as strings orders by *weekday name* (Fri < Mon < Sat < Sun < Thu < Tue < Wed),
# which on two worlds can easily look correct by accident. Parse it.
_JS_DATE = re.compile(
    r"^\w{3} (?P<mon>\w{3}) (?P<day>\d{1,2}) (?P<year>\d{4}) "
    r"(?P<time>\d{2}:\d{2}:\d{2}) GMT(?P<tz>[+-]\d{4})"
)


def _last_played(raw: str) -> datetime.datetime:
    """``lastPlayed`` as a real datetime; ``datetime.min`` if it is missing or odd, so
    a world with an unreadable manifest sorts last instead of raising."""
    m = _JS_DATE.match(raw or "")
    if not m:
        return datetime.datetime.min.replace(tzinfo=datetime.UTC)
    try:
        return datetime.datetime.strptime(
            f"{m['day']} {m['mon']} {m['year']} {m['time']} {m['tz']}",
            "%d %b %Y %H:%M:%S %z",
        )
    except ValueError:
        return datetime.datetime.min.replace(tzinfo=datetime.UTC)


def worlds_on_disk() -> list[dict]:
    """Every world Foundry can launch, with its title and when it was last played.

    Read off disk rather than asked of the server, because the whole point is to choose
    a world *before* one is active — and ``/setup``'s socket handler, which is where
    Foundry's own list comes from, returns ``{}`` once ``game.world`` is set.
    """
    out = []
    for name in cfg.known_worlds():
        try:
            manifest = json.loads((cfg.WORLDS_DIR / name / "world.json").read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            manifest = {}
        played = _last_played(manifest.get("lastPlayed") or "")
        out.append({
            "id": name,
            "title": manifest.get("title") or name,
            "system": manifest.get("system", "?"),
            "played": played,
            "played_label": "" if played.year == 1 else played.strftime("%Y-%m-%d"),
        })
    # Most recently played first: the one you want is nearly always the one you left.
    out.sort(key=lambda w: w["played"], reverse=True)
    return out


def _pick_world(active: str | None, requested: str | None, prompt: bool) -> str:
    """Which world to end up in. An explicit `--world` always wins."""
    worlds = worlds_on_disk()
    if requested:
        if requested not in {w["id"] for w in worlds}:
            raise RuntimeError(
                f"no world named {requested!r} on disk — "
                f"have: {', '.join(w['id'] for w in worlds) or 'none'}"
            )
        return requested
    if not worlds:
        raise RuntimeError(f"no worlds in {cfg.WORLDS_DIR}")
    if len(worlds) == 1:
        return worlds[0]["id"]
    if not prompt:
        # Never silently switch a live world in a non-interactive run.
        return active or cfg.WORLD_NAME

    default_index = 0
    options = []
    for i, w in enumerate(worlds):
        tag = "  ← running" if w["id"] == active else ""
        if w["id"] == (active or cfg.WORLD_NAME):
            default_index = i
        played = w["played_label"]
        options.append((f"{w['title']}  ({w['id']}, {w['system']}"
                        f"{', last played ' + played if played else ''}){tag}", w["id"]))
    return _choose("Which campaign?", options, default_index)


def _pick_user(users: list[dict], wanted: str | None, prompt: bool) -> dict:
    """The named user, the one picked from the menu, or the first Gamemaster."""
    if not users:
        raise RuntimeError("this world has no users to log in as")
    if wanted:
        for u in users:
            if u.get("name", "").lower() == wanted.lower():
                return u
        raise RuntimeError(
            f"no user named {wanted!r} in this world — "
            f"have: {', '.join(sorted(u.get('name', '?') for u in users))}"
        )

    gms = [u for u in users if u.get("role") == GAMEMASTER_ROLE]
    if not gms and not prompt:
        raise RuntimeError("this world has no Gamemaster user to log in as")
    if not prompt:
        return gms[0]
    if len(users) == 1:
        return users[0]

    ordered = sorted(users, key=lambda u: (-(u.get("role") or 0), u.get("name", "")))
    default_index = next((i for i, u in enumerate(ordered)
                          if u.get("role") == GAMEMASTER_ROLE), 0)
    options = [
        (f"{u.get('name')}  ({ROLE_LABEL.get(u.get('role'), 'role ' + str(u.get('role')))})",
         u)
        for u in ordered
    ]
    return _choose("Log in as?", options, default_index)


# ── Getting the world running ────────────────────────────────────────────────

def _ensure_world(fa: FoundryAdmin, world: str, prompt: bool) -> None:
    """Leave the server serving ``world``, deactivating another one if that is what
    was asked for.

    Switching worlds is the one genuinely disruptive thing this command can do — every
    connected player is dropped — so it is confirmed, and the confirmation names how
    many are connected rather than making you guess.
    """
    status = fa.status()
    if status.active and status.world == world:
        return

    if status.active:
        connected = status.users or 0
        detail = (f" — {connected} user(s) connected, who will be disconnected"
                  if connected else "")
        if prompt:
            answer = _choose(
                f"'{status.world}' is running. Switch to '{world}'?{detail}",
                [("no, stay in " + str(status.world), False), ("yes, switch", True)],
                default_index=0,
            )
            if not answer:
                raise RuntimeError(f"staying in '{status.world}' — nothing changed")
        elif connected:
            raise RuntimeError(
                f"'{status.world}' is running with {connected} user(s) connected; "
                f"refusing to switch to '{world}' unattended. Re-run at a terminal, "
                f"or pass --world {status.world}."
            )
        _say(f"▸ deactivating '{status.world}'...")
        if not fa.deactivate_world():
            raise RuntimeError(
                "could not deactivate the running world — Foundry refuses "
                "POST /join {shutdown} unless an admin password is configured "
                "(make foundry-admin-configure)."
            )
        time.sleep(SETTLE_SECONDS)

    _say(f"▸ launching '{world}'...")
    fa.launch_world(world)
    fa.wait_for_world(world, timeout=WORLD_READY_TIMEOUT)


# ── The handoff ──────────────────────────────────────────────────────────────

def _handoff(session_id: str, host: str, game_url: str, open_browser: bool) -> bool:
    """Serve one request that sets the session cookie, then redirect into the game.

    The cookie is ``HttpOnly``, so no page script can install it — it has to arrive on
    a ``Set-Cookie`` header. It does not have to arrive from Foundry's own port,
    though: cookies are keyed by host, not host:port (RFC 6265 §8.5), so this server on
    an ephemeral port sets a cookie that ``localhost:30000`` will send.

    Bound to the loopback host, single-use, guarded by a nonce, and gone within
    ``HANDOFF_TIMEOUT``. The nonce is what travels in argv to ``open``; the session id
    stays in this process's memory.

    ``ThreadingHTTPServer``, not ``HTTPServer``, and that is not a style choice. Chrome
    opens a *speculative second connection* alongside the real request and leaves it
    idle. A single-threaded server accepts it and blocks in ``readline()`` waiting for
    a request line that never comes, so ``serve_forever`` never gets back to its
    shutdown flag: the login succeeded in the browser, the command hung, and the port
    stayed open. Observed, not theoretical.
    """
    nonce = secrets.token_urlsafe(16)
    served = threading.Event()
    # Threaded, so "we already served it" has to be decided under a lock rather than by
    # the main thread getting round to shutdown(). Browsers do issue more than one
    # request — a preconnect, a favicon probe — and the cookie should go out once.
    spent = threading.Lock()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):                                    # noqa: N802
            if urllib.parse.urlsplit(self.path).path != f"/{nonce}":
                self.send_error(404)
                return
            if not spent.acquire(blocking=False):
                self.send_error(410, "This login ticket has already been used")
                return
            self.send_response(302)
            self.send_header(
                "Set-Cookie",
                f"{SESSION_COOKIE}={session_id}; Path=/; Max-Age={COOKIE_MAX_AGE}; "
                "HttpOnly; SameSite=Strict",
            )
            self.send_header("Location", game_url)
            self.send_header("Content-Length", "0")
            self.end_headers()
            self.wfile.flush()      # the browser must have it before we tear down
            served.set()

        def log_message(self, *args):                        # noqa: D102
            pass    # the default handler logs to stderr and the request path is a ticket

    srv = http.server.ThreadingHTTPServer((host, 0), Handler)
    srv.daemon_threads = True
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    url = f"http://{host}:{port}/{nonce}"
    if open_browser:
        subprocess.run(["open", url], check=False, capture_output=True)
    else:
        _say(f"▸ open this once, in the browser you want logged in:\n     {url}")

    ok = served.wait(HANDOFF_TIMEOUT)
    srv.shutdown()
    srv.server_close()
    return ok


# ── The command ──────────────────────────────────────────────────────────────

def login(user: str | None = None, world: str | None = None,
          open_browser: bool = True, prompt: bool | None = None) -> int:
    """Start whatever is not running, then put the browser inside the world."""
    base_url = cfg.FOUNDRY_URL
    host = urllib.parse.urlsplit(base_url).hostname or "localhost"
    # An explicit --world AND --user is a fully specified request; don't interrupt it.
    if prompt is None:
        prompt = _interactive() and not (world and user)

    if service.up() != OK:
        return FAIL

    try:
        password = foundry_admin_password()
    except AdminPasswordUnavailable as exc:
        _say(f"✗ {exc}")
        return FAIL

    fa = FoundryAdmin(base_url=base_url, admin_password=password)
    try:
        active = fa.status().world if fa.status().active else None
        target = _pick_world(active, world, prompt)

        fa.authenticate()
        _ensure_world(fa, target, prompt)

        data = fa.join_data()
        who = _pick_user(data.get("users", []), user, prompt)
        _say(f"▸ '{target}' — logging in as {who.get('name')}")
        fa.login_as(who["_id"] or who.get("id"))
    except KeyboardInterrupt:
        _say("✗ cancelled")
        return FAIL
    except (requests.RequestException, FoundryError, RuntimeError, ValueError) as exc:
        _say(f"✗ {exc}")
        return FAIL

    session_id = fa.session.cookies.get(SESSION_COOKIE)
    if not session_id:
        _say("✗ Foundry issued no session cookie — nothing to hand to the browser.")
        return FAIL

    if not _handoff(session_id, host, f"{base_url}/game", open_browser):
        _say(f"✗ the browser never collected the session within {HANDOFF_TIMEOUT:.0f}s.")
        return FAIL

    _say(f"✓ logged in as {who.get('name')} at {base_url}/game")
    if service._tunnel_pid() is None:
        _say("  ▸ players still need the tunnel: make tunnel-up")
    return OK
