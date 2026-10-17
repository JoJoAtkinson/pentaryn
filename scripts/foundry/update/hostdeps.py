"""Host dependencies: everything the game runs on that is not a Foundry package.

Design: context/plans/monday-updater-2026-10.md. The updater's package side (inventory,
upstream, risk) covers Foundry core, the system and the modules. This covers the host:

    node          the Node.js Foundry's service runs — newest within the core's engines.node
    apt:<pkg>     the game-path apt packages (cloudflared, infisical, gh) — one by one,
                  each with a rollback to the version it replaced
    apt:ubuntu    every other pending Ubuntu update — applied together, no rollback
    rclone        the backup transport — `rclone selfupdate`, the old binary kept aside
    chrome        the headless GM's chrome-headless-shell — a new dir, the env key swapped
    claude        the CLI the LLM steps use — it updates itself; reported, verified
    report-only   Python deps, the npm lockfiles, the WSL kernel — listed, never applied

Every component reports {id, label, installed, target, bucket, reason, restart} where
bucket is one of auto / review / hold / current, exactly the package side's words.
``plan()`` reads (it may run `apt-get update`, nothing else changes); ``apply()`` changes;
``rollback()`` undoes one applied record. Nothing here raises to the caller: a component
that cannot be read is a ``hold`` with the reason, and a failed apply is a record with an
``error``. Every subprocess goes through ``RUN`` so the tests can replace it.

Off Linux (the Mac) the whole module is a no-op: ``plan()`` returns [] — the Mac never runs
the updater again (apply.gate refuses off the primary) and has none of these layouts.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path

from scripts.foundry import host

REPO_ROOT = Path(__file__).resolve().parents[3]
ROLLBACK_DIR = REPO_ROOT / ".state" / "host-rollback"

HOME = Path.home()
NVM_DIR = HOME / ".nvm"
NODE_LINK = HOME / ".local" / "share" / "pentaryn" / "node"        # → ~/.nvm/versions/node/vX
NODE_LINK_BIN = NODE_LINK / "bin" / "node"
FOUNDRY_UNIT = HOME / ".config" / "systemd" / "user" / "foundryvtt.service"
CHROME_CACHE = HOME / ".cache" / "pentaryn-chrome"
HEADLESS_DIR = REPO_ROOT / "automation" / "headless-gm"

NODE_INDEX = "https://nodejs.org/dist/index.json"
RCLONE_VERSION_URL = "https://downloads.rclone.org/version.txt"
CHROME_VERSIONS_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json"

DEFAULT_APT_GAME = ("cloudflared", "infisical", "gh")

AUTO, REVIEW, HOLD, CURRENT = "auto", "review", "hold", "current"


@dataclass
class HostItem:
    id: str
    label: str
    installed: str | None
    target: str | None = None
    bucket: str = CURRENT
    reason: str = ""
    restart: list[str] = field(default_factory=list)   # foundry | tunnel | bot
    detail: dict = field(default_factory=dict)

    def to_json(self) -> dict:
        return asdict(self)


# ── plumbing ─────────────────────────────────────────────────────────────────

def _run(cmd: list[str], *, timeout: float = 120, env: dict | None = None,
         input: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                          env=env, input=input)


RUN = _run                                  # tests replace this


def run(cmd: list[str], **kw) -> tuple[int, str]:
    """(rc, stdout+stderr). A missing binary or a timeout is rc 127 / 124, never a raise."""
    try:
        p = RUN(cmd, **kw)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except FileNotFoundError:
        return 127, f"{cmd[0]}: not found"
    except subprocess.TimeoutExpired:
        return 124, f"{cmd[0]}: timed out"
    except OSError as exc:
        return 126, str(exc)


def fetch(url: str, timeout: float = 20) -> str | None:
    try:
        # downloads.rclone.org answers 403 to Python-urllib's default User-Agent
        req = urllib.request.Request(url, headers={"User-Agent": "pentaryn-updater/1 (+curl-compatible)"})
        with urllib.request.urlopen(req, timeout=timeout) as r:   # noqa: S310 (fixed https URLs)
            return r.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return None


FETCH = fetch                               # tests replace this


def vtuple(v: str | None) -> tuple:
    """'v24.21.0' / '2026.10.1' / '1.75.2' → a comparable tuple; junk → ()."""
    if not v:
        return ()
    nums = re.findall(r"\d+", str(v).split("-")[0].split("+")[0])
    return tuple(int(n) for n in nums[:4])


def newer(a: str | None, b: str | None) -> bool:
    return bool(vtuple(a)) and vtuple(a) > vtuple(b)


def satisfies(version: str, spec: str) -> bool:
    """A space-separated comparator list (`>=24.13.1 <25.0.0`, npm `engines` style).
    `||` alternatives are honoured; an empty or unreadable spec satisfies nothing."""
    spec = (spec or "").strip()
    if not spec:
        return False
    v = vtuple(version)
    for alt in spec.split("||"):
        ok = True
        terms = alt.split()
        if not terms:
            continue
        for term in terms:
            m = re.fullmatch(r"(>=|<=|>|<|=|\^|~)?v?(\d+(?:\.\d+){0,2})(?:\.x)?", term)
            if not m:
                ok = False
                break
            op, ver = m.group(1) or "=", vtuple(m.group(2))
            if op == "^":
                ok = v >= ver and v[:1] == ver[:1]
            elif op == "~":
                ok = v >= ver and v[:2] == ver[:2]
            elif op == ">=":
                ok = v >= ver
            elif op == ">":
                ok = v > ver
            elif op == "<=":
                ok = v <= ver
            elif op == "<":
                ok = v < ver
            else:
                ok = v[:len(ver)] == ver
            if not ok:
                break
        if ok:
            return True
    return False


def sudo_ok() -> bool:
    return run(["sudo", "-n", "true"], timeout=10)[0] == 0


def _policy(policy: dict | None) -> dict:
    return ((policy or {}).get("host") or {}) if isinstance(policy, dict) else {}


# ── node ─────────────────────────────────────────────────────────────────────

def unit_node() -> Path | None:
    """The node binary foundryvtt.service starts, resolved through any symlink."""
    try:
        text = FOUNDRY_UNIT.read_text()
    except OSError:
        return None
    m = re.search(r"^ExecStart=(\S+)", text, re.M)
    if not m:
        return None
    exe = Path(m.group(1).replace("%h", str(HOME)))
    try:
        return exe.resolve()
    except OSError:
        return exe


def node_version(exe: Path | str | None) -> str | None:
    if not exe:
        return None
    rc, out = run([str(exe), "--version"], timeout=15)
    return out.strip().lstrip("v") if rc == 0 and out.strip() else None


def foundry_engines() -> str | None:
    try:
        pkg = json.loads(host.app_package_json().read_text())
    except Exception:  # noqa: BLE001
        return None
    return ((pkg.get("engines") or {}).get("node")) or None


def node_candidates() -> list[str]:
    raw = FETCH(NODE_INDEX)
    try:
        rows = json.loads(raw) if raw else []
    except ValueError:
        return []
    return [str(r.get("version", "")).lstrip("v") for r in rows if isinstance(r, dict)]


def plan_node(policy: dict | None) -> HostItem:
    exe = unit_node()
    installed = node_version(exe)
    item = HostItem("node", "Node.js (Foundry's service)", installed, restart=["foundry"])
    if not installed:
        item.bucket, item.reason = HOLD, f"cannot read the node version from {FOUNDRY_UNIT}"
        return item
    engines = foundry_engines()
    item.detail["engines"] = engines
    if not engines:
        item.bucket, item.reason = HOLD, "Foundry's package.json declares no engines.node"
        return item
    if not satisfies(installed, engines):
        item.reason = f"installed {installed} is OUTSIDE Foundry's engines {engines}"
    fits = sorted((v for v in node_candidates() if satisfies(v, engines)), key=vtuple)
    if not fits:
        item.bucket = HOLD
        item.reason = item.reason or "could not read nodejs.org's release index"
        return item
    best = fits[-1]
    if not newer(best, installed):
        item.reason = item.reason or f"newest within {engines}"
        return item
    item.target = best
    item.bucket = AUTO if _policy(policy).get("node", "auto") == "auto" else REVIEW
    item.reason = f"newest Node within Foundry's engines {engines}"
    return item


def _nvm(args: str, timeout: float = 900) -> tuple[int, str]:
    script = f'export NVM_DIR="{NVM_DIR}"; . "$NVM_DIR/nvm.sh" && nvm {args}'
    return run(["bash", "-c", script], timeout=timeout)


def _swap_link(link: Path, target: Path) -> None:
    """Point ``link`` at ``target`` atomically (a rename over the old link)."""
    link.parent.mkdir(parents=True, exist_ok=True)
    tmp = link.with_name(link.name + ".new")
    if tmp.is_symlink() or tmp.exists():
        tmp.unlink()
    tmp.symlink_to(target)
    os.replace(tmp, link)


def migrate_node_link() -> list[str]:
    """One-time: make foundryvtt.service and PENTARYN_NODE run node through NODE_LINK, so
    an update or a rollback is a symlink swap. Idempotent; returns what it changed."""
    changed: list[str] = []
    current = unit_node()
    if current and not NODE_LINK.exists() and current.name == "node":
        _swap_link(NODE_LINK, current.parent.parent)
        changed.append(f"{NODE_LINK} → {current.parent.parent}")
    try:
        text = FOUNDRY_UNIT.read_text()
    except OSError:
        return changed
    new = re.sub(r"^ExecStart=\S+", f"ExecStart=%h/{NODE_LINK_BIN.relative_to(HOME)}", text, count=1,
                 flags=re.M)
    new = new.replace("# Node comes from nvm by absolute path; update this line if the nvm node version changes.",
                      "# Node comes through ~/.local/share/pentaryn/node, a symlink to the nvm version —\n"
                      "# the updater swaps it (scripts/foundry/update/hostdeps.py).")
    if new != text:
        FOUNDRY_UNIT.write_text(new)
        run(["systemctl", "--user", "daemon-reload"], timeout=30)
        changed.append(f"{FOUNDRY_UNIT.name} ExecStart → the symlink")
    if host.get("PENTARYN_NODE") != str(NODE_LINK_BIN):
        set_env_key("PENTARYN_NODE", str(NODE_LINK_BIN))
        changed.append("PENTARYN_NODE → the symlink")
    return changed


def apply_node(item: HostItem) -> dict:
    record = {"id": "node", "from": item.installed, "to": item.target, "restart": ["foundry"]}
    migrated = migrate_node_link()
    if migrated:
        record["migrated"] = migrated
    previous = NODE_LINK.resolve() if NODE_LINK.exists() else None
    rc, out = _nvm(f"install {item.target}")
    target_dir = NVM_DIR / "versions" / "node" / f"v{item.target}"
    if rc != 0 or not (target_dir / "bin" / "node").exists():
        return {**record, "error": f"nvm install {item.target} failed: {out.strip()[-300:]}"}
    _swap_link(NODE_LINK, target_dir)
    record["previous"] = str(previous) if previous else None
    return record


def rollback_node(record: dict) -> str | None:
    prev = record.get("previous")
    if not prev:
        return "no previous node to roll back to"
    _swap_link(NODE_LINK, Path(prev))
    return None


# ── apt ──────────────────────────────────────────────────────────────────────

def apt_installed(pkg: str) -> str | None:
    rc, out = run(["dpkg-query", "-W", "-f=${Version}", pkg], timeout=15)
    return out.strip() if rc == 0 and out.strip() else None


def apt_candidate(pkg: str) -> str | None:
    rc, out = run(["apt-cache", "policy", pkg], timeout=30)
    m = re.search(r"Candidate:\s*(\S+)", out) if rc == 0 else None
    return m.group(1) if m and m.group(1) != "(none)" else None


def apt_upgradable() -> list[str]:
    rc, out = run(["apt", "list", "--upgradable"], timeout=60)
    if rc != 0:
        return []
    return [ln.split("/", 1)[0] for ln in out.splitlines() if "/" in ln and "upgradable" in ln]


APT_ENV = {**os.environ, "DEBIAN_FRONTEND": "noninteractive"}
APT_OPTS = ["-y", "-o", "Dpkg::Options::=--force-confold", "-o", "Dpkg::Options::=--force-confdef"]


def plan_apt(policy: dict | None, *, refresh: bool = True) -> list[HostItem]:
    hp = _policy(policy)
    game = list(hp.get("apt_game") or DEFAULT_APT_GAME)
    can_sudo = sudo_ok()
    if refresh and can_sudo:
        run(["sudo", "-n", "apt-get", "update", "-qq"], timeout=300, env=APT_ENV)
    items: list[HostItem] = []
    for pkg in game:
        installed = apt_installed(pkg)
        item = HostItem(f"apt:{pkg}", f"{pkg} (apt)", installed,
                        restart=["tunnel"] if pkg == "cloudflared" else [])
        if not installed:
            item.bucket, item.reason = HOLD, "not installed through apt here"
        else:
            cand = apt_candidate(pkg)
            if cand and cand != installed and newer(cand, installed):
                item.target = cand
                item.bucket = AUTO if can_sudo else HOLD
                item.reason = "apt candidate" if can_sudo else "no passwordless sudo"
            else:
                item.reason = "apt's candidate is installed"
        items.append(item)
    others = sorted(set(apt_upgradable()) - set(game))
    item = HostItem("apt:ubuntu", "Ubuntu packages (apt)", f"{len(others)} pending",
                    detail={"packages": others})
    if others:
        item.target = f"{len(others)} upgraded"
        mode = hp.get("apt_os", "auto")
        item.bucket = HOLD if not can_sudo else (AUTO if mode == "auto" else REVIEW)
        item.reason = ("no passwordless sudo" if not can_sudo
                       else f"apt-get upgrade ({', '.join(others[:8])}{' …' if len(others) > 8 else ''})")
    else:
        item.reason = "nothing pending"
    items.append(item)
    return items


def apply_apt(item: HostItem) -> dict:
    if item.id == "apt:ubuntu":
        record = {"id": item.id, "from": item.installed, "to": item.target,
                  "packages": item.detail.get("packages", [])}
        rc, out = run(["sudo", "-n", "apt-get", "upgrade", *APT_OPTS], timeout=1800, env=APT_ENV)
        return record if rc == 0 else {**record, "error": out.strip()[-400:]}
    pkg = item.id.split(":", 1)[1]
    record = {"id": item.id, "from": item.installed, "to": item.target, "restart": item.restart}
    rc, out = run(["sudo", "-n", "apt-get", "install", "--only-upgrade", *APT_OPTS, pkg],
                  timeout=900, env=APT_ENV)
    now = apt_installed(pkg)
    if rc != 0 or now != item.target:
        return {**record, "error": f"apt-get install {pkg}: rc={rc}, now {now}: {out.strip()[-300:]}"}
    return record


def rollback_apt(record: dict) -> str | None:
    if record["id"] == "apt:ubuntu":
        return "Ubuntu package upgrades have no rollback"
    pkg = record["id"].split(":", 1)[1]
    rc, out = run(["sudo", "-n", "apt-get", "install", "--allow-downgrades", *APT_OPTS,
                   f"{pkg}={record['from']}"], timeout=900, env=APT_ENV)
    return None if rc == 0 else f"downgrade {pkg} to {record['from']} failed: {out.strip()[-300:]}"


# ── rclone ───────────────────────────────────────────────────────────────────

def rclone_bin() -> str | None:
    return shutil.which("rclone")


def rclone_version(exe: str | None = None) -> str | None:
    exe = exe or rclone_bin()
    if not exe:
        return None
    rc, out = run([exe, "version"], timeout=20)
    m = re.search(r"rclone v(\S+)", out) if rc == 0 else None
    return m.group(1) if m else None


def plan_rclone(policy: dict | None) -> HostItem:
    exe = rclone_bin()
    installed = rclone_version(exe)
    item = HostItem("rclone", "rclone (backups)", installed)
    if not installed:
        item.bucket, item.reason = HOLD, "rclone not found"
        return item
    m = re.search(r"v(\d[\d.]*)", FETCH(RCLONE_VERSION_URL) or "")
    if not m:
        item.bucket, item.reason = HOLD, "could not read rclone's current version"
        return item
    if not newer(m.group(1), installed):
        item.reason = "current"
        return item
    item.target = m.group(1)
    writable = os.access(exe, os.W_OK)
    if not writable and not sudo_ok():
        item.bucket, item.reason = HOLD, f"{exe} is not writable and there is no passwordless sudo"
    else:
        item.bucket = AUTO if _policy(policy).get("rclone", "auto") == "auto" else REVIEW
        item.reason = "rclone selfupdate --stable"
    item.detail["exe"] = exe
    return item


def apply_rclone(item: HostItem) -> dict:
    exe = item.detail.get("exe") or rclone_bin()
    record = {"id": "rclone", "from": item.installed, "to": item.target, "exe": exe}
    ROLLBACK_DIR.mkdir(parents=True, exist_ok=True)
    saved = ROLLBACK_DIR / f"rclone-{item.installed}"
    try:
        shutil.copy2(exe, saved)
    except OSError as exc:
        return {**record, "error": f"could not keep the old binary: {exc}"}
    record["saved"] = str(saved)
    prefix = [] if os.access(exe, os.W_OK) else ["sudo", "-n"]
    rc, out = run([*prefix, exe, "selfupdate", "--stable"], timeout=600)
    now = rclone_version(exe)
    if rc != 0 or now != item.target:
        return {**record, "error": f"selfupdate rc={rc}, now {now}: {out.strip()[-300:]}"}
    return record


def rollback_rclone(record: dict) -> str | None:
    saved, exe = record.get("saved"), record.get("exe")
    if not saved or not exe:
        return "no saved rclone binary"
    prefix = [] if os.access(exe, os.W_OK) else ["sudo", "-n"]
    rc, out = run([*prefix, "cp", saved, exe], timeout=60)
    return None if rc == 0 else f"restore {exe}: {out.strip()[-200:]}"


# ── chrome-headless-shell (the headless GM) ──────────────────────────────────

def chrome_path() -> str | None:
    p = host.get("PENTARYN_HEADLESS_CHROME")
    return p if p and Path(p).exists() else None


def chrome_version(path: str | None) -> str | None:
    if not path:
        return None
    m = re.search(r"/linux-([\d.]+)/", path)
    if m:
        return m.group(1)
    rc, out = run([path, "--version"], timeout=20)
    m = re.search(r"([\d]+\.[\d.]+)", out) if rc == 0 else None
    return m.group(1) if m else None


def plan_chrome(policy: dict | None) -> HostItem:
    path = chrome_path()
    installed = chrome_version(path)
    item = HostItem("chrome", "chrome-headless-shell (headless GM)", installed, restart=["bot"])
    if not path:
        item.bucket, item.reason = HOLD, "PENTARYN_HEADLESS_CHROME is not set (no headless GM here)"
        return item
    try:
        latest = json.loads(FETCH(CHROME_VERSIONS_URL) or "{}")["channels"]["Stable"]["version"]
    except Exception:  # noqa: BLE001
        item.bucket, item.reason = HOLD, "could not read Chrome for Testing's stable version"
        return item
    if not newer(latest, installed):
        item.reason = "current"
        return item
    item.target = latest
    item.bucket = AUTO if _policy(policy).get("chrome", "auto") == "auto" else REVIEW
    item.reason = "Chrome for Testing stable"
    return item


def apply_chrome(item: HostItem) -> dict:
    record = {"id": "chrome", "from": item.installed, "to": item.target,
              "previous": chrome_path(), "restart": ["bot"]}
    cli = HEADLESS_DIR / "node_modules" / "@puppeteer" / "browsers" / "lib" / "cjs" / "main-cli.js"
    rc, out = run([host.node(), str(cli), "install", f"chrome-headless-shell@{item.target}",
                   "--path", str(CHROME_CACHE)], timeout=900)
    new = out.strip().splitlines()[-1].split(" ", 1)[-1] if out.strip() else ""
    if rc != 0 or not new or not Path(new).exists():
        return {**record, "error": f"browsers install rc={rc}: {out.strip()[-300:]}"}
    set_env_key("PENTARYN_HEADLESS_CHROME", new)
    record["path"] = new
    return record


def rollback_chrome(record: dict) -> str | None:
    prev = record.get("previous")
    if not prev:
        return "no previous chrome path"
    set_env_key("PENTARYN_HEADLESS_CHROME", prev)
    return None


# ── report-only ──────────────────────────────────────────────────────────────

def plan_claude() -> HostItem:
    rc, out = run(["claude", "--version"], timeout=30)
    installed = out.split()[0] if rc == 0 and out.strip() else None
    item = HostItem("claude", "Claude Code CLI (LLM steps)", installed)
    item.reason = "updates itself; verified by a real claude -p call" if installed else "claude not found"
    item.bucket = CURRENT if installed else HOLD
    return item


def plan_report_only() -> list[HostItem]:
    items: list[HostItem] = []
    rc, out = run(["uv", "pip", "list", "--outdated", "--format", "json",
                   "--python", str(REPO_ROOT / ".venv" / "bin" / "python")], timeout=120)
    try:
        outdated = json.loads(out) if rc == 0 else None
    except ValueError:
        outdated = None
    py = HostItem("python", "Python deps (.venv)", "locked", bucket=REVIEW if outdated else CURRENT)
    py.reason = (f"{len(outdated)} outdated — bump in pyproject/uv.lock by hand"
                 if outdated else ("could not list" if outdated is None else "current"))
    py.detail["outdated"] = [f"{o.get('name')} {o.get('version')}→{o.get('latest_version')}"
                             for o in (outdated or [])][:30]
    if outdated is None:
        py.bucket = CURRENT
    items.append(py)
    for name, where in (("npm:headless-gm", HEADLESS_DIR), ("npm:smoke", REPO_ROOT / "automation" / "smoke")):
        if not (where / "package.json").exists():
            continue
        rc, out = run(["npm", "outdated", "--json", "--prefix", str(where)], timeout=120,
                      env=host.node_env())
        try:
            data = json.loads(out) if out.strip() else {}
        except ValueError:
            data = {}
        item = HostItem(name, f"npm deps ({where.name})", "locked",
                        bucket=REVIEW if data else CURRENT,
                        reason=(f"{len(data)} outdated — npm update in {where.relative_to(REPO_ROOT)}"
                                if data else "current"))
        item.detail["outdated"] = [f"{k} {v.get('current')}→{v.get('latest')}" for k, v in data.items()][:30]
        items.append(item)
    if host.is_wsl():
        # interop may be off the PATH (systemd --user, S4U): call it by its Windows path
        exe = shutil.which("wsl.exe") or "/mnt/c/Windows/System32/wsl.exe"
        rc, out = run([exe, "--version"], timeout=30)
        text = out.replace("\x00", "")
        wsl = re.search(r"WSL[^:]*:\s*(\S+)", text)
        kernel = re.search(r"Kernel[^:]*:\s*(\S+)", text)
        items.append(HostItem("wsl", "WSL (Windows side)", wsl.group(1) if wsl else None,
                              detail={"kernel": kernel.group(1) if kernel else None},
                              reason=(f"kernel {kernel.group(1)}; " if kernel else "")
                              + "report only — update from Windows: wsl --update"))
    return items


# ── env file ─────────────────────────────────────────────────────────────────

def set_env_key(key: str, value: str) -> None:
    """Replace or append one KEY=value line in ~/.config/pentaryn/env (never a secret)."""
    path = host.env_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text().splitlines() if path.exists() else []
    out, done = [], False
    for ln in lines:
        if ln.startswith(f"{key}="):
            out.append(f"{key}={value}")
            done = True
        else:
            out.append(ln)
    if not done:
        out.append(f"{key}={value}")
    path.write_text("\n".join(out) + "\n")
    os.environ.pop(key, None)        # host.get() reads the process env first


# ── the three verbs ──────────────────────────────────────────────────────────

APPLY = {"node": apply_node, "rclone": apply_rclone, "chrome": apply_chrome}
ROLLBACK = {"node": rollback_node, "rclone": rollback_rclone, "chrome": rollback_chrome}


def enabled(policy: dict | None) -> bool:
    return host.system() == "Linux" and _policy(policy).get("enabled", True) is not False


def plan(policy: dict | None = None, *, refresh: bool = True) -> list[dict]:
    """Every host component, read-only (bar `apt-get update`). [] off Linux or disabled."""
    if not enabled(policy):
        return []
    items: list[HostItem] = []
    for fn in (lambda: [plan_node(policy)], lambda: plan_apt(policy, refresh=refresh),
               lambda: [plan_rclone(policy)], lambda: [plan_chrome(policy)],
               lambda: [plan_claude()], plan_report_only):
        try:
            items.extend(fn())
        except Exception as exc:  # noqa: BLE001 — one unreadable component holds, never the run
            items.append(HostItem(f"error:{len(items)}", "unreadable component", None, bucket=HOLD,
                                  reason=f"{type(exc).__name__}: {exc}"))
    return [i.to_json() for i in items]


def apply(host_plan: list[dict]) -> tuple[list[dict], list[dict]]:
    """Apply every auto item. Returns (applied, failed) records."""
    applied: list[dict] = []
    failed: list[dict] = []
    order = {"apt": 0, "rclone": 1, "chrome": 2, "node": 3}   # node last: it restarts Foundry
    auto = sorted((d for d in host_plan if d.get("bucket") == AUTO),
                  key=lambda d: order.get(d["id"].split(":")[0], 9))
    for d in auto:
        item = HostItem(**d)
        fn = apply_apt if d["id"].startswith("apt:") else APPLY.get(d["id"])
        if not fn:
            continue
        started = time.monotonic()
        try:
            rec = fn(item)
        except Exception as exc:  # noqa: BLE001
            rec = {"id": d["id"], "from": d.get("installed"), "to": d.get("target"),
                   "error": f"{type(exc).__name__}: {exc}"}
        rec["seconds"] = round(time.monotonic() - started, 1)
        (failed if rec.get("error") else applied).append(rec)
    return applied, failed


def rollback(record: dict) -> str | None:
    """Undo one applied record. None on success, else the reason it could not."""
    fn = rollback_apt if record["id"].startswith("apt:") else ROLLBACK.get(record["id"])
    if not fn:
        return f"no rollback for {record['id']}"
    try:
        return fn(record)
    except Exception as exc:  # noqa: BLE001
        return f"{type(exc).__name__}: {exc}"


def restarts(records: list[dict]) -> set[str]:
    return {r for rec in records for r in (rec.get("restart") or [])}


def render_text(host_plan: list[dict]) -> str:
    if not host_plan:
        return ""
    lines = ["", "Host dependencies:"]
    mark = {AUTO: "→", REVIEW: "?", HOLD: "✋", CURRENT: "✓"}
    for d in host_plan:
        to = f" → {d['target']}" if d.get("target") else ""
        lines.append(f"  {mark.get(d['bucket'], '·')} {d['label']}: {d.get('installed') or '?'}{to}"
                     f"  [{d['bucket']}] {d.get('reason', '')}")
    return "\n".join(lines)
