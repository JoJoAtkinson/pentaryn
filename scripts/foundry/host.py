"""Which machine am I, what role do I have, where is Foundry, how do I start and stop it.

Design: ``context/plans/rclone-two-hosts-2026-10.md`` §2. Two machines share one cloud
folder: the **primary** (the Mac, where Joe almost always boots and where the tunnel and
the Saturday updater run) and an **alt** (BOSS, Windows 11 with Foundry in WSL, for
building addons and testing in parallel). Everything here has a platform default and an
override, and the defaults reproduce the Mac exactly, so the Mac needs no configuration.

Values come from, in order: the real environment, then ``~/.config/pentaryn/env``
(``$PENTARYN_ENV_FILE`` relocates it), then the platform default. The env file is read,
never written, and never holds a secret — rclone reads its own config. Every value is
looked up when asked for (``host.HOST`` is a lazy module attribute), so a test that sets
an environment variable sees it with no monkeypatching of constants.

    python -m scripts.foundry.host show
    python -m scripts.foundry.host role                 # prints primary | alt
    python -m scripts.foundry.host require-primary <what>
    <secret> | python -m scripts.foundry.host clipboard # never echoes what it copies
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

RESERVED_HOSTS = {"untagged", "latest", "local"}
HOST_RE = re.compile(r"^[a-z0-9-]{1,32}$")
DEFAULT_PRIMARY = "mac"
DEFAULT_PORT = 30000
DEFAULT_KEEP_SNAPSHOTS = 10
MAC_APP_NAME = "Foundry Virtual Tabletop"
MAC_APP_BUNDLE = Path("/Applications/Foundry Virtual Tabletop.app")

# Every key the env file may set, with what it means. host.env.example is checked
# against this list by a test, so the two cannot drift.
KEYS = (
    "PENTARYN_HOST", "PENTARYN_PRIMARY_HOST", "PENTARYN_ROLE_OVERRIDE", "FOUNDRY_DATA",
    "FOUNDRY_APP_ROOT", "FOUNDRY_PORT", "PENTARYN_CLOUD", "PENTARYN_RCLONE",
    "PENTARYN_KEEP_SNAPSHOTS", "PENTARYN_START_CMD", "PENTARYN_STOP_CMD",
)


class HostError(ValueError):
    """A configured value is unusable — said once, with the fix."""


class NotPrimary(RuntimeError):
    """A primary-only action (the tunnel, the updater) was asked for on the alt."""


# ── the env file ─────────────────────────────────────────────────────────────

def env_file() -> Path:
    return Path(os.environ.get("PENTARYN_ENV_FILE")
                or Path.home() / ".config/pentaryn/env").expanduser()


_file_cache: dict[tuple[str, float], dict[str, str]] = {}


def parse_env(text: str) -> dict[str, str]:
    """`KEY=value` lines, `#` comments, an optional leading `export`, one pair of
    matching quotes stripped. Nothing else — this is not a shell."""
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        key, sep, val = line.partition("=")
        key = key.strip()
        if not sep or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        elif " #" in val:  # trailing comment on an unquoted value
            val = val.split(" #", 1)[0].rstrip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
        out[key] = val
    return out


def file_values() -> dict[str, str]:
    path = env_file()
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {}
    key = (str(path), mtime)
    if key not in _file_cache:
        try:
            _file_cache.clear()
            _file_cache[key] = parse_env(path.read_text(encoding="utf-8"))
        except OSError:
            return {}
    return _file_cache[key]


def get(key: str, default: str | None = None) -> str | None:
    """The environment wins, then the env file, then `default`. Empty means unset."""
    val = os.environ.get(key)
    if val:
        return val
    val = file_values().get(key)
    return val if val else default


# ── platform ─────────────────────────────────────────────────────────────────

def system() -> str:
    return platform.system()


def is_mac() -> bool:
    return system() == "Darwin"


def is_wsl() -> bool:
    try:
        return "microsoft" in Path("/proc/version").read_text().lower()
    except OSError:
        return False


# ── identity and role ────────────────────────────────────────────────────────

def sanitize(name: str) -> str:
    """Lower-case, anything outside [a-z0-9-] → '-', runs collapsed, trimmed, ≤32."""
    s = re.sub(r"[^a-z0-9-]", "-", (name or "").lower())
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s[:32].strip("-")


def validate_host(name: str) -> str:
    """The host tag goes into every snapshot filename, so its alphabet is the parser's.

    Reserved: `untagged` (what legacy snapshots are called), `latest` and `local` (the
    `FROM=` keywords). Pure digits-and-dots and an `fvtt…` prefix are refused because
    they would read as part of the `-fvtt<version>` group."""
    if not name or not HOST_RE.fullmatch(name):
        raise HostError(f"PENTARYN_HOST={name!r}: must be 1-32 of [a-z0-9-]")
    if name in RESERVED_HOSTS:
        raise HostError(f"PENTARYN_HOST={name!r} is reserved ({', '.join(sorted(RESERVED_HOSTS))})")
    if re.fullmatch(r"[0-9.]+", name) or name.startswith("fvtt") or name.startswith("-"):
        raise HostError(f"PENTARYN_HOST={name!r} would be ambiguous in a snapshot name")
    return name


def host_is_default() -> bool:
    """True when PENTARYN_HOST is unset and a default (mac / the hostname) is in use."""
    return not get("PENTARYN_HOST")


def host_name() -> str:
    """PENTARYN_HOST, else `mac` on macOS, else the sanitised short hostname.

    A non-macOS hostname that sanitises to `mac` (or to a reserved word) is prefixed
    `h-` — only macOS is tagged `mac`, and so the primary, by default.

    The macOS default is `mac` — the default PENTARYN_PRIMARY_HOST — so the Mac with no
    env file is the primary exactly as before (tunnel and updater unchanged), and its
    snapshots are tagged `-mac`.

    An explicit `mac` off macOS is refused: it is what copying a filled-in example env
    file onto BOSS would produce, and two machines tagged `mac` both claim the primary
    role (tunnel, updater) and prune and coalesce each other's snapshots."""
    explicit = get("PENTARYN_HOST")
    if explicit:
        name = validate_host(explicit)
        if name == DEFAULT_PRIMARY and not is_mac():
            raise HostError(
                f"PENTARYN_HOST={name} on a non-macOS machine: `{name}` is the Mac's tag. "
                f"Set PENTARYN_HOST to this machine's own name (BOSS: boss) in "
                f"{env_file()} or the environment")
        return name
    if is_mac():
        return DEFAULT_PRIMARY
    fallback = sanitize(socket.gethostname().split(".")[0]) or "host"
    if fallback == DEFAULT_PRIMARY:  # only macOS is ever `mac` by default (EC-7)
        return validate_host(f"h-{fallback}")
    try:
        return validate_host(fallback)
    except HostError:
        return validate_host(f"h-{fallback}"[:32].strip("-"))


def primary_host() -> str:
    return get("PENTARYN_PRIMARY_HOST", DEFAULT_PRIMARY)


def role() -> str:
    return "primary" if host_name() == primary_host() else "alt"


def role_override() -> bool:
    return (os.environ.get("PENTARYN_ROLE_OVERRIDE") or "").strip() == "primary"


def require_primary(what: str, target: str | None = None, *, log=None) -> None:
    """Refuse a primary-only action on the alt. Only the tunnel and the updater call this.

    `PENTARYN_ROLE_OVERRIDE=primary` (environment only, never the file — it is a
    per-run decision) lets it through, loudly."""
    log = log or (lambda m: print(f"  {m}", file=sys.stderr))
    if role() == "primary":
        return
    if role_override():
        log(f"! PENTARYN_ROLE_OVERRIDE=primary — running {what} from the alt host {host_name()}")
        return
    how = f"PENTARYN_ROLE_OVERRIDE=primary make {target}" if target else \
        "PENTARYN_ROLE_OVERRIDE=primary <command>"
    raise NotPrimary(
        f"{what} runs only on the primary host ({primary_host()}); this is {host_name()} "
        f"({role()}). Deliberately switching? {how}")


# ── paths ────────────────────────────────────────────────────────────────────

def _default_data() -> Path:
    if is_mac():
        return Path.home() / "Library/Application Support/FoundryVTT"
    return Path.home() / ".local/share/FoundryVTT"


# Where an unpacked Linux download keeps the app payload (package.json, main.js), in
# probe order: the Node.js build (v12 on) puts it at the top of the unpacked folder, the
# Electron "Linux" build under resources/app. The first that holds package.json wins.
LINUX_APP_CANDIDATES = ("foundryvtt", "foundryvtt/resources/app")


def _default_app_root() -> Path:
    if is_mac():
        return MAC_APP_BUNDLE / "Contents/Resources/app"
    home = Path.home()
    for rel in LINUX_APP_CANDIDATES:
        if (home / rel / "package.json").is_file():
            return home / rel
    return home / LINUX_APP_CANDIDATES[0]


def foundry_data() -> Path:
    """The data ROOT — the folder holding Config/ Data/ Logs/ — never Data/ itself.

    Pointing it at Data/ would make a restore clear the wrong trees, so that mistake is
    refused rather than guessed around."""
    raw = get("FOUNDRY_DATA")
    root = Path(raw).expanduser() if raw else _default_data()
    if raw and root.name == "Data" and (root / "worlds").is_dir() and not (root / "Data").exists():
        raise HostError(f"FOUNDRY_DATA={root} is Foundry's Data/ folder; it must be the root "
                        f"that holds Config/ Data/ Logs/ — {root.parent}")
    return root


def foundry_app_root() -> Path:
    raw = get("FOUNDRY_APP_ROOT")
    return Path(raw).expanduser() if raw else _default_app_root()


def foundry_port() -> int:
    try:
        return int(get("FOUNDRY_PORT", str(DEFAULT_PORT)))
    except ValueError as exc:
        raise HostError(f"FOUNDRY_PORT={get('FOUNDRY_PORT')!r} is not a port") from exc


def keep_snapshots() -> int:
    try:
        n = int(get("PENTARYN_KEEP_SNAPSHOTS", str(DEFAULT_KEEP_SNAPSHOTS)))
    except ValueError:
        return DEFAULT_KEEP_SNAPSHOTS
    return max(1, n)


def app_package_json() -> Path:
    return foundry_app_root() / "package.json"


def core_version() -> str:
    """The installed Foundry version from the app's package.json — no server needed.

    `release.generation`.`release.build` (14.369), as the snapshot names have always
    carried it; "unknown" when the app cannot be read or the version is not all digits
    and dots — the snapshot-name parser reads `fvtt15.0-beta-mac` as host `beta-mac`."""
    try:
        pkg = json.loads(app_package_json().read_text(encoding="utf-8"))
        rel = pkg.get("release") or {}
        if rel.get("generation") is not None and rel.get("build") is not None:
            ver = f"{rel['generation']}.{rel['build']}"
        else:
            ver = str(pkg.get("version") or "")
    except (OSError, ValueError, AttributeError):
        return "unknown"
    return ver if re.fullmatch(r"[0-9.]+", ver) else "unknown"


# ── process control ──────────────────────────────────────────────────────────

def is_running(port: int | None = None) -> bool:
    """Something is listening on the Foundry port. A TCP connect, not an HTTP 200:
    a server answering 4xx or speaking TLS is still live, and "stopped" is the unsafe
    direction for every guard that asks."""
    port = port or foundry_port()
    for addr in ("127.0.0.1", "::1"):
        try:
            with socket.create_connection((addr, port), timeout=2):
                return True
        except OSError:
            continue
    return False


def _mac_bundle() -> Path | None:
    """The .app that holds FOUNDRY_APP_ROOT (…/X.app/Contents/Resources/app)."""
    root = foundry_app_root()
    for parent in root.parents:
        if parent.suffix == ".app":
            return parent
    return None


def _linux_pattern() -> str:
    """`pgrep -f` ERE for this data root's `node main.js`. The path is escaped and must end
    at a space or the end of the line, so /d/foundry never matches /d/foundry-test (EC-4)."""
    return rf"main\.js --dataPath={re.escape(str(foundry_data()))}( |$)"


def pid() -> int | None:
    pattern = f"MacOS/{MAC_APP_NAME}" if is_mac() else _linux_pattern()
    proc = subprocess.run(["pgrep", "-f", pattern], capture_output=True, text=True)
    if proc.returncode != 0:
        return None
    try:
        return int(proc.stdout.split()[0])
    except (IndexError, ValueError):
        return None


HOOK_TIMEOUT = 30  # seconds a PENTARYN_START_CMD / PENTARYN_STOP_CMD hook may take


def _hook(name: str) -> str | None:
    return get(name)


def start() -> None:
    """Start Foundry and return; callers poll `is_running()` for the port.

    Mac: `open -a` on the app bundle. Linux: `$PENTARYN_START_CMD` via `bash -c` when set
    (BOSS's supervisor — the whole story), else a detached `node main.js`."""
    cmd = _hook("PENTARYN_START_CMD")
    if cmd:
        try:
            subprocess.run(["bash", "-c", cmd], check=True, timeout=HOOK_TIMEOUT)
        except subprocess.TimeoutExpired:
            raise HostError(f"PENTARYN_START_CMD did not return within {HOOK_TIMEOUT}s "
                            "(it must start Foundry and return promptly)") from None
        return
    if is_mac():
        bundle = _mac_bundle()
        subprocess.run(["open", "-a", str(bundle) if bundle else MAC_APP_NAME],
                       check=True, capture_output=True, text=True)
        return
    data = foundry_data()
    log = data / "Logs" / "pentaryn-start.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    main_js = foundry_app_root() / "main.js"
    with open(log, "ab") as fh:
        subprocess.Popen(["node", str(main_js), f"--dataPath={data}", f"--port={foundry_port()}"],
                         stdout=fh, stderr=fh, stdin=subprocess.DEVNULL, start_new_session=True)


def can_request_stop() -> bool:
    """Is there any way to ask Foundry to stop? The hook, the Mac's quit, or a pid to signal.
    Without one, a server whose port answers cannot be stopped from here."""
    return bool(_hook("PENTARYN_STOP_CMD")) or is_mac() or pid() is not None


def request_stop() -> bool:
    """Ask politely (a graceful quit closes LevelDB cleanly). True if the ask was delivered."""
    cmd = _hook("PENTARYN_STOP_CMD")
    if cmd:
        try:
            return subprocess.run(["bash", "-c", cmd], timeout=HOOK_TIMEOUT).returncode == 0
        except subprocess.TimeoutExpired:
            return False  # a hung hook is not delivered — stop() forces instead
    if is_mac():
        try:
            return subprocess.run(["osascript", "-e", f'quit app "{MAC_APP_NAME}"'],
                                  capture_output=True, text=True, timeout=30).returncode == 0
        except subprocess.TimeoutExpired:
            return False  # a hung quit is not delivered — stop() forces instead
    p = pid()
    if p is None:
        return True
    try:
        os.kill(p, signal.SIGTERM)
        return True
    except OSError:
        return False


def force_stop() -> None:
    if is_mac():
        subprocess.run(["pkill", "-f", f"MacOS/{MAC_APP_NAME}"], capture_output=True)
        return
    p = pid()
    if p is not None:
        try:
            os.kill(p, signal.SIGKILL)
        except OSError:
            pass


def stop(timeout: float = 30) -> None:
    """Graceful stop, then force after `timeout` if the process or port is still there."""
    if not request_stop():
        force_stop()
        return
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if pid() is None and not is_running():
            return
        time.sleep(1.0)
    force_stop()


# ── clipboard ────────────────────────────────────────────────────────────────

def clipboard(text: str) -> bool:
    """Copy `text`. pbcopy, then clip.exe (WSL), then xclip. Never prints the text —
    what goes through here is usually a secret; no tool means False, not an echo."""
    for argv in (["pbcopy"], ["clip.exe"], ["xclip", "-selection", "clipboard"]):
        if shutil.which(argv[0]):
            return subprocess.run(argv, input=text, text=True).returncode == 0
    return False


# ── lazy module attributes: host.HOST, host.ROLE, host.FOUNDRY_DATA … ──────────

_LAZY = {
    "HOST": host_name, "ROLE": role, "PRIMARY_HOST": primary_host,
    "FOUNDRY_DATA": foundry_data, "FOUNDRY_APP_ROOT": foundry_app_root,
    "FOUNDRY_PORT": foundry_port, "KEEP_SNAPSHOTS": keep_snapshots,
}


def __getattr__(name: str):
    if name in _LAZY:
        return _LAZY[name]()
    raise AttributeError(name)


# ── CLI ──────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    cmd = args[0] if args else "show"
    try:
        if cmd == "show":
            print(f"  host         {host_name()}"
                  + ("   (PENTARYN_HOST unset — the platform default)" if host_is_default() else ""))
            print(f"  role         {role()}   (primary host: {primary_host()})")
            print(f"  data         {foundry_data()}")
            print(f"  app          {foundry_app_root()}   (Foundry {core_version()})")
            print(f"  port         {foundry_port()}")
            print(f"  env file     {env_file()}{'' if env_file().exists() else '   (absent)'}")
            return 0
        if cmd == "role":
            print(role())
            return 0
        if cmd == "require-primary":
            what = " ".join(args[1:]) or "this"
            require_primary(what)
            return 0
        if cmd == "clipboard":
            if not clipboard(sys.stdin.read()):
                print("  ✗ no clipboard tool (pbcopy, clip.exe, xclip) — nothing copied",
                      file=sys.stderr)
                return 1
            return 0
    except NotPrimary as exc:
        print(f"  ✗ {exc}", file=sys.stderr)
        return 3
    except HostError as exc:
        print(f"  ✗ {exc}", file=sys.stderr)
        return 2
    print(f"  ✗ unknown command {cmd!r} (show | role | require-primary <what> | clipboard)",
          file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
