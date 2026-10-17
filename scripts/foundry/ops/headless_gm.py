"""The headless Assistant-GM bot's credential side: find the bot, mint its session.

Use-doc: ``context/foundry/headless-gm.md``. The MCP bridge module only connects from a
GM-level browser tab **on the same machine** as the Claude session's broker
(``ws://localhost:31415``). Joe's tab lives elsewhere, so BOSS keeps one of its own: a
headless Chrome logged in as a non-human user, ``Claude``, at role 3 (Assistant GM). The
browser half is ``automation/headless-gm/watchdog.mjs``; this module is the half that
touches credentials, so that Node never sees the admin password.

    python -m scripts.foundry.ops headless-gm ensure                    # JSON: world, bot, gm
    python -m scripts.foundry.ops headless-gm cookie --as bot --out F   # 0600 file, JSON summary (never admin)
    python -m scripts.foundry.ops headless-gm cookie --as gm --out F --bot-password
    python -m scripts.foundry.ops headless-gm cookie --as gm --out /dev/fd/3   # the caller's pipe, no file
    python -m scripts.foundry.ops headless-gm status [--json]

## How the bot gets in

**With its own password, never through the admin.** ``cookie --as bot`` reads the user
list from ``getJoinData`` (no auth), then logs in on a brand-new session with the bot's
password from Infisical (:meth:`FoundryAdmin.join`) — the ``/join`` form, nothing more.
``loginAs`` would be simpler but it needs ``session.admin``, and that flag *stays on the
session the browser gets*: ``/setup`` then accepts that page's ``worldShutdown`` without a
password, so a role-3 bot could shut the world down, and Foundry cannot drop the flag while
a world is active. The resulting session cookie goes to the watchdog in a 0600 file under
``$XDG_RUNTIME_DIR`` (tmpfs) that it deletes on read — never argv, never stdout. stdout
carries only ``{ok, world, user_id, user, role}``.

``cookie --as gm`` (the bootstrap only: a throwaway context that creates the bot and is
closed) still uses admin + ``loginAs``, because no GM password is stored anywhere.

**Or on a pipe, with no file at all.** ``--out /dev/fd/N`` writes the same JSON to fd ``N``,
which the caller opened for this process (``automation/smoke/pins-live.mjs`` gives it a fourth
stdio pipe and reads it into memory). Only a pipe or an AF_UNIX socket on fd 3 or above is
accepted, checked before any network call: fds 0-2 (our own stdout/stderr), a terminal, a
regular file or a TCP socket are refused (:class:`HandOffRefused`, exit 1) before a byte is written.

## The bot's own password

A random, non-human password (``secrets.token_urlsafe(32)``) in Infisical as
``FOUNDRY_VTT_BOT_PW`` beside the grandmaster password. It is what the bot logs in with, and
it keeps anyone who gets past Cloudflare Access from picking the bot on ``/join``.
:func:`bot_password` creates it the first time the bot is bootstrapped (value on stdin,
never argv) and hands it to the bootstrap page in the same 0600 file as the GM cookie; the
bootstrap sets it on the user, and re-sets it on an existing bot whose password no longer
matches (``cookie --as bot`` exit 7).

## Infisical under systemd

On BOSS the machine identity arrives from Windows through ``WSLENV`` and ``~/.boss-env``
turns it into ``INFISICAL_TOKEN``, caching that token at ``~/.cache/infisical-boss-token``.
A systemd ``--user`` service has neither, so :func:`adopt_cached_infisical_token` reads the
cache into *this process's* environment when no token is set. The nightly (launched by
Task Scheduler through ``wsl.exe``, so it has ``WSLENV``) is what keeps that cache fresh.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import socket
import stat
import subprocess
import sys
import time
from pathlib import Path

import requests

from .. import host
from ..admin_password import (AdminPasswordUnavailable, ENVIRONMENT, PROJECT_ID, SECRET_PATH,
                              foundry_admin_password)
from ..update.admin import BASE_URL, FoundryAdmin, FoundryError, JoinRejected
from .out import FAIL, OK, say

# Foundry's CONST.USER_ROLES. Assistant GM is `isGM` in Foundry (User#isGM is
# hasRole(ASSISTANT)), which is the bridge module's only gate.
GAMEMASTER_ROLE = 4
ASSISTANT_ROLE = 3
ROLE_LABEL = {4: "Gamemaster", 3: "Assistant", 2: "Trusted", 1: "Player", 0: "None"}

DEFAULT_BOT_NAME = "Claude"
BOT_PW_SECRET = "FOUNDRY_VTT_BOT_PW"
UNIT = "foundry-headless-gm"
DEFAULT_TOKEN_CACHE = "~/.cache/infisical-boss-token"

# Exit codes the watchdog branches on. 1 stays "anything else went wrong".
EXIT_NO_WORLD = 2
EXIT_BOT_MISSING = 3
EXIT_NO_GM = 4
EXIT_ADMIN_PW = 5
EXIT_BOT_PW = 6
EXIT_BOT_AUTH = 7       # the bot exists but its password (Infisical) was refused

_INFISICAL_AUTH_RE = re.compile(r"auth|login|token|unauthor", re.IGNORECASE)


class HandOffRefused(RuntimeError):
    """``--out /dev/fd/N`` names an fd that is not a pipe (a terminal, a file, or closed)."""


class BotPasswordUnavailable(RuntimeError):
    """The bot password could not be read or stored in Infisical. Never carries the value."""


# ── names and places ─────────────────────────────────────────────────────────

def bot_name() -> str:
    return host.get("PENTARYN_BOT_USER", DEFAULT_BOT_NAME) or DEFAULT_BOT_NAME


def runtime_dir() -> Path:
    """Where the cookie hand-off and status file live: tmpfs, per user, gone at reboot."""
    base = os.environ.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
    return Path(base) / "pentaryn-headless-gm"


def status_path() -> Path:
    return runtime_dir() / "status.json"


def role_label(role) -> str:
    return ROLE_LABEL.get(role, f"role {role}")


# ── Infisical ────────────────────────────────────────────────────────────────

def adopt_cached_infisical_token(path: str | None = None) -> bool:
    """Put ``~/.boss-env``'s cached Infisical token into this process's env if none is set.

    Returns True when it did. The value goes into ``os.environ`` only — the ``infisical``
    child inherits it there — and is never printed or passed in argv.
    """
    if os.environ.get("INFISICAL_TOKEN"):
        return False
    p = Path(path or host.get("PENTARYN_INFISICAL_TOKEN_FILE", DEFAULT_TOKEN_CACHE)).expanduser()
    try:
        value = p.read_text(encoding="utf-8").strip()
    except OSError:
        return False
    if not value:
        return False
    os.environ["INFISICAL_TOKEN"] = value
    return True


def _infisical(args: list[str], stdin: str | None = None) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            ["infisical", "secrets", *args, "--projectId", PROJECT_ID, "--env", ENVIRONMENT,
             "--path", SECRET_PATH, "--silent"],
            input=stdin, capture_output=True, text=True, check=True, timeout=30,
            **({} if stdin is not None else {"stdin": subprocess.DEVNULL}),
        )
    except subprocess.TimeoutExpired as exc:
        raise BotPasswordUnavailable("the infisical CLI did not answer within 30s") from exc
    except FileNotFoundError as exc:
        raise BotPasswordUnavailable("the `infisical` CLI is not installed") from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        if _INFISICAL_AUTH_RE.search(stderr):
            raise BotPasswordUnavailable(
                "Infisical could not authenticate. Run `infisical login` in WSL (or check the "
                "machine identity), then retry.") from exc
        # stderr from `secrets get/set` names the secret, never its value
        raise BotPasswordUnavailable(
            f"infisical exited {exc.returncode} on {BOT_PW_SECRET}: {stderr[:200]}") from exc


def bot_password(create: bool = True) -> str:
    """The bot user's password from Infisical, generating and storing one if there is none.

    Generated in-process (``secrets.token_urlsafe(32)`` — nobody types it), written with
    ``infisical secrets set --file /dev/stdin`` so the value is on a pipe, never in argv,
    then read back to prove the store took it before anything uses it.
    """
    value = _infisical(["get", BOT_PW_SECRET, "--plain"]).stdout.strip()
    if value and not value.startswith("@"):
        return value
    if not create:
        raise BotPasswordUnavailable(f"{BOT_PW_SECRET} is not set in Infisical")
    value = secrets.token_urlsafe(32)
    # `NAME=@/dev/stdin` looks like the CLI's file syntax but 0.43 stores it literally
    # (seen 2026-10-16 — hence the `@` guard above and the read-back below). `--file`
    # takes a path and parses dotenv, so the value goes in on a pipe as `NAME=value`.
    _infisical(["set", "--file", "/dev/stdin"], stdin=f"{BOT_PW_SECRET}={value}\n")
    if _infisical(["get", BOT_PW_SECRET, "--plain"]).stdout.strip() != value:
        raise BotPasswordUnavailable(f"{BOT_PW_SECRET} did not read back after storing it")
    return value


# ── Foundry ──────────────────────────────────────────────────────────────────

def active_world(base_url: str = BASE_URL) -> str | None:
    """The world Foundry is serving now, or None — asked, never assumed."""
    try:
        r = requests.get(f"{base_url}/api/status", timeout=10)
        r.raise_for_status()
        s = r.json()
    except (requests.RequestException, ValueError):
        return None
    return s.get("world") if s.get("active") else None


def find_bot(users: list[dict], name: str | None = None) -> dict | None:
    """The bot: the user with the bot's name AND at least Assistant GM. A role-1 user who
    happens to be called "Claude" is a player, not the bot, and is never logged in as."""
    name = name or bot_name()
    for u in users:
        if u.get("name") == name and (u.get("role") or 0) >= ASSISTANT_ROLE:
            return u
    return None


def find_gm(users: list[dict]) -> dict | None:
    """A full Gamemaster to bootstrap the bot as: the first role-4 user by id, so the
    choice is stable from run to run."""
    gms = sorted((u for u in users if u.get("role") == GAMEMASTER_ROLE),
                 key=lambda u: u.get("_id") or u.get("id") or "")
    return gms[0] if gms else None


def _uid(u: dict) -> str:
    return u.get("_id") or u.get("id") or ""


def _admin() -> FoundryAdmin:
    adopt_cached_infisical_token()
    return FoundryAdmin(admin_password=foundry_admin_password())


def _emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


_FD_PATH = re.compile(r"^/dev/fd/(\d+)$")


def _fd_of(out: Path | None) -> int | None:
    m = _FD_PATH.match(str(out)) if out is not None else None
    return int(m.group(1)) if m else None


def _claim_fd(fd: int) -> tuple[int, int]:
    """Check ``fd`` is the caller's hand-off pipe; → its (st_dev, st_ino) identity.

    Refused (:class:`HandOffRefused`): fds 0-2 (this process's own stdio — a piped stdout is a
    pipe too, and the summary goes there), a closed fd, a terminal, a regular file, and any socket
    that is not AF_UNIX (a TCP socket on that number is this process's own connection to Foundry,
    not something the caller handed over). :func:`cookie` claims it before any network call, so
    the number cannot yet belong to one of our own connections.
    """
    if fd < 3:
        raise HandOffRefused(f"fd {fd} is this process's own stdio: refusing to write a session to it")
    try:
        st = os.fstat(fd)
    except OSError:
        raise HandOffRefused(f"fd {fd} is not open") from None
    if os.isatty(fd):
        raise HandOffRefused(f"fd {fd} is a terminal: refusing to write a session to it")
    if stat.S_ISSOCK(st.st_mode):
        try:
            with socket.socket(fileno=os.dup(fd)) as sock:
                family = sock.family
        except OSError:
            family = None
        if family != socket.AF_UNIX:
            raise HandOffRefused(f"fd {fd} is a network socket, not the caller's pipe: refusing it")
    elif not stat.S_ISFIFO(st.st_mode):
        raise HandOffRefused(f"fd {fd} is not a pipe: refusing to write a session to it")
    return (st.st_dev, st.st_ino)


def _write_fd(fd: int, payload: dict, expect: tuple[int, int] | None = None) -> None:
    """Hand ``payload`` to the caller's pipe on ``fd``, then close it. Never stdio, a tty or a file.

    ``expect``: the identity :func:`_claim_fd` saw before any network call; a different file on
    that number now is refused.
    """
    ident = _claim_fd(fd)
    if expect is not None and ident != expect:
        raise HandOffRefused(f"fd {fd} changed since it was claimed: refusing to write a session to it")
    view = memoryview(json.dumps(payload).encode("utf-8"))
    try:
        while view:
            view = view[os.write(fd, view):]
    finally:
        os.close(fd)


def _write_private(path: Path, payload: dict, expect: tuple[int, int] | None = None) -> None:
    """Write JSON readable by this user only. O_EXCL-free but 0600 from the first byte.

    ``/dev/fd/N`` is the caller's pipe instead (:func:`_write_fd`): nothing touches disk.
    """
    fd = _fd_of(path)
    if fd is not None:
        _write_fd(fd, payload, expect)
        return
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)


def _hand_off(out: Path, payload: dict, world: str, expect: tuple[int, int] | None = None) -> bool:
    """:func:`_write_private`, reporting a refused or broken hand-off on stdout (never the payload)."""
    try:
        _write_private(out, payload, expect)
        return True
    except HandOffRefused as exc:
        _emit({"ok": False, "error": str(exc), "world": world})
    except OSError as exc:
        _emit({"ok": False, "error": f"hand-off to {out} failed: {exc.strerror or type(exc).__name__}",
               "world": world})
    return False


def ensure() -> int:
    """JSON ``{ok, world, bot_id, bot, gm_id}`` — what the watchdog decides from.

    ``bot_id`` null means the active world has no bot yet and the watchdog should
    bootstrap one. Read-only: creating the user is the browser's job (it needs a client).
    """
    world = active_world()
    if not world:
        _emit({"ok": False, "error": "no active world", "world": None})
        return EXIT_NO_WORLD
    try:
        users = _admin().join_data().get("users") or []
    except AdminPasswordUnavailable as exc:
        _emit({"ok": False, "error": f"admin password unavailable: {exc}", "world": world})
        return EXIT_ADMIN_PW
    except (FoundryError, requests.RequestException) as exc:
        _emit({"ok": False, "error": str(exc)[:300], "world": world})
        return FAIL
    bot, gm = find_bot(users), find_gm(users)
    _emit({"ok": True, "world": world, "bot": bot_name(),
           "bot_id": _uid(bot) if bot else None, "bot_role": bot.get("role") if bot else None,
           "gm_id": _uid(gm) if gm else None})
    return OK


def _bot_cookie(world: str, out: Path, claim: tuple[int, int] | None = None) -> int:
    """The bot's session: its own password on a session that has never been admin."""
    adopt_cached_infisical_token()
    try:
        users = FoundryAdmin().join_data().get("users") or []
    except (FoundryError, requests.RequestException) as exc:
        _emit({"ok": False, "error": str(exc)[:300], "world": world})
        return FAIL
    who = find_bot(users)
    if not who:
        _emit({"ok": False, "error": f"no user {bot_name()!r} at role >= {ASSISTANT_ROLE}",
               "world": world})
        return EXIT_BOT_MISSING
    try:
        password = bot_password(create=False)
    except BotPasswordUnavailable as exc:
        _emit({"ok": False, "error": f"bot password unavailable: {exc}", "world": world})
        return EXIT_BOT_PW
    fresh = FoundryAdmin()          # no admin password: this session is never admin
    try:
        fresh.join(_uid(who), password)
    except JoinRejected:
        _emit({"ok": False, "error": f"{bot_name()} refused its {BOT_PW_SECRET} password "
                                     "(the bootstrap re-sets it)", "world": world})
        return EXIT_BOT_AUTH
    except (FoundryError, requests.RequestException) as exc:
        _emit({"ok": False, "error": str(exc)[:300], "world": world})
        return FAIL
    if not _hand_off(out, {"cookies": fresh.session_cookies()}, world, claim):
        return FAIL
    _emit({"ok": True, "world": world, "user_id": _uid(who), "user": who.get("name"),
           "role": who.get("role"), "out": str(out)})
    return OK


def cookie(as_: str, out: Path | None, *, with_bot_password: bool = False) -> int:
    """Mint a session as the bot (or the GM) and hand its cookie over by file.

    ``bot``: :func:`_bot_cookie` — password join, never admin. ``gm``: admin + ``loginAs``,
    for the short-lived bootstrap context only.
    The file is ``{"cookies": [...], "botPassword"?: "..."}`` at mode 0600; the watchdog
    deletes it on read. ``out`` = ``/dev/fd/N`` writes the same JSON to the caller's pipe
    instead, with no file. stdout is only the summary — never a cookie or a password.
    """
    out = out or runtime_dir() / "cookie.json"
    claim = None
    fd = _fd_of(out)
    if fd is not None:
        # before any network call: the fd must be the caller's pipe, not one of our own sockets
        try:
            claim = _claim_fd(fd)
        except HandOffRefused as exc:
            _emit({"ok": False, "error": str(exc), "world": None})
            return FAIL
    world = active_world()
    if not world:
        _emit({"ok": False, "error": "no active world", "world": None})
        return EXIT_NO_WORLD
    if as_ == "bot":
        return _bot_cookie(world, out, claim)
    try:
        fa = _admin()
        users = fa.join_data().get("users") or []
    except AdminPasswordUnavailable as exc:
        _emit({"ok": False, "error": f"admin password unavailable: {exc}", "world": world})
        return EXIT_ADMIN_PW
    except (FoundryError, requests.RequestException) as exc:
        _emit({"ok": False, "error": str(exc)[:300], "world": world})
        return FAIL

    who = find_gm(users)
    if not who:
        _emit({"ok": False, "error": "no Gamemaster (role 4) user in this world",
               "world": world})
        return EXIT_NO_GM

    payload: dict = {}
    if with_bot_password:
        try:
            payload["botPassword"] = bot_password(create=True)
        except BotPasswordUnavailable as exc:
            _emit({"ok": False, "error": f"bot password unavailable: {exc}", "world": world})
            return EXIT_BOT_PW
    try:
        fa.login_as(_uid(who))
    except (FoundryError, requests.RequestException) as exc:
        _emit({"ok": False, "error": str(exc)[:300], "world": world})
        return FAIL
    payload["cookies"] = fa.session_cookies()
    if not _hand_off(out, payload, world, claim):
        return FAIL
    _emit({"ok": True, "world": world, "user_id": _uid(who), "user": who.get("name"),
           "role": who.get("role"), "out": str(out)})
    return OK


# ── status ───────────────────────────────────────────────────────────────────

def _unit_state() -> str:
    try:
        r = subprocess.run(["systemctl", "--user", "is-active", UNIT], capture_output=True,
                           text=True, timeout=10)
        return r.stdout.strip() or "unknown"
    except (OSError, subprocess.TimeoutExpired):
        return "unknown"


def status_report() -> dict:
    try:
        st = json.loads(status_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        st = None
    return {"unit": _unit_state(), "foundry_world": active_world(), "watchdog": st}


def status(as_json: bool = False) -> int:
    r = status_report()
    st = r["watchdog"] or {}
    ok = r["unit"] == "active" and st.get("state") == "CONNECTED"
    if as_json:
        print(json.dumps({"ok": ok, **r}, indent=2))
        return OK if ok else FAIL
    say(f"▸ unit {UNIT}: {r['unit']}")
    say(f"▸ Foundry world: {r['foundry_world'] or '(none active)'}")
    if not st:
        say(f"✗ no watchdog status at {status_path()} — is the unit running?")
        return FAIL
    age = ""
    if isinstance(st.get("updatedAtMs"), (int, float)):
        secs = int(time.time() - st["updatedAtMs"] / 1000)
        age = f" (updated {secs}s ago)"
        if secs > 60:
            ok = False      # the watchdog writes every tick; a stale file is a dead watchdog
    bridge = st.get("bridge") or {}
    perms = st.get("perms") or {}
    mark = "✓" if ok else "✗"
    say(f"{mark} state {st.get('state')} since {st.get('since')}{age}")
    say(f"  user {st.get('user') or '-'} ({st.get('userId') or '-'}) isGM={st.get('isGM')} "
        f"world={st.get('world') or '-'}")
    say(f"  bridge connected={bridge.get('connected')} state={bridge.get('connectionState')} "
        f"enabled={bridge.get('enabled')} · broker on :31415={st.get('broker')}")
    if perms:
        say("  perms " + " ".join(f"{k}={v}" for k, v in perms.items()))
    if st.get("reason"):
        say(f"  last: {st['reason']}")
    return OK if ok else FAIL


def main(action: str, *, as_: str = "bot", out: Path | None = None,
         with_bot_password: bool = False, as_json: bool = False) -> int:
    if action == "ensure":
        return ensure()
    if action == "cookie":
        return cookie(as_, out, with_bot_password=with_bot_password)
    if action == "status":
        return status(as_json=as_json)
    print(f"unknown headless-gm action {action!r}", file=sys.stderr)
    return FAIL
