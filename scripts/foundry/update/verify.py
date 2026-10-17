"""The weekly proof that the whole stack still runs the game.

Design: context/plans/monday-updater-2026-10.md §phase 3. Runs at the end of every real
updater run, after service is restored, whether or not anything was updated. Each check
returns ``{id, label, ok, detail, component}``. ``component`` names the host item
(hostdeps ids) whose update would be the likely cause when the check fails, so apply can
roll exactly that one back and check again.

Nothing here raises; nothing here prints a secret (the admin password check reports
resolved / not resolved, never the value).
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

from scripts.foundry import host
from scripts.foundry.update import hostdeps

REPO_ROOT = Path(__file__).resolve().parents[3]
TUNNEL_CONFIG = REPO_ROOT / "foundry" / "cloudflared" / "config.yml"
# Cloudflare Access answers an anonymous request with a redirect to its login (302), or
# 401/403; 200 would mean the gate is off. Any of them proves the tunnel reaches Foundry's
# edge — a 502/530 is the tunnel failing.
TUNNEL_OK = {200, 301, 302, 303, 307, 401, 403}
TOOLS = (("cloudflared", ["cloudflared", "--version"], "apt:cloudflared"),
         ("infisical", ["infisical", "--version"], "apt:infisical"),
         ("gh", ["gh", "--version"], "apt:gh"),
         ("rclone", ["rclone", "version"], "rclone"),
         ("git", ["git", "--version"], None),
         ("uv", ["uv", "--version"], None))


def _check(id_: str, label: str, ok: bool, detail: str, component: str | None = None) -> dict:
    return {"id": id_, "label": label, "ok": bool(ok), "detail": detail, "component": component}


def public_hostname() -> str | None:
    try:
        m = re.search(r"hostname:\s*(\S+)", TUNNEL_CONFIG.read_text())
    except OSError:
        return None
    return m.group(1) if m else None


def check_node() -> dict:
    version = hostdeps.node_version(hostdeps.unit_node())
    engines = hostdeps.foundry_engines()
    ok = bool(version and engines and hostdeps.satisfies(version, engines))
    return _check("node", "Node.js within Foundry's engines", ok,
                  f"{version or '?'} vs {engines or '?'}", "node")


def check_foundry(world: str | None) -> dict:
    from scripts.foundry.update.admin import FoundryAdmin
    try:
        s = FoundryAdmin().status()
    except Exception as exc:  # noqa: BLE001
        return _check("foundry", "Foundry serving", False, f"/api/status: {exc}", "node")
    if world:
        ok = bool(s.active and s.world == world)
        return _check("foundry", "Foundry serving the world", ok,
                      f"world={s.world or '-'} (want {world}), v{s.version}", "node")
    return _check("foundry", "Foundry answering", True, f"v{s.version}, no world expected", "node")


def check_tunnel(expected: bool) -> dict:
    from scripts.foundry.update import recover
    if not expected:
        return _check("tunnel", "Cloudflare tunnel", True, "not expected up (it was down at start)")
    if not recover.tunnel_running(REPO_ROOT):
        return _check("tunnel", "Cloudflare tunnel", False, "cloudflared is not running", "apt:cloudflared")
    name = public_hostname()
    if not name:
        return _check("tunnel", "Cloudflare tunnel", False, f"no hostname in {TUNNEL_CONFIG.name}",
                      "apt:cloudflared")
    rc, out = hostdeps.run(["curl", "-sS", "-o", "/dev/null", "-m", "20", "-w", "%{http_code}",
                            f"https://{name}/"], timeout=30)
    code = int(out.strip()[-3:]) if rc == 0 and out.strip()[-3:].isdigit() else 0
    return _check("tunnel", f"https://{name} answers", code in TUNNEL_OK,
                  f"HTTP {code or out.strip()[-120:]}", "apt:cloudflared")


def check_backup_remote() -> dict:
    from scripts.foundry import cloud, storage
    try:
        entries = storage.get().ls(cloud.WORLD_BACKUPS, must_exist=True)
        return _check("backup", "backup remote reachable", True,
                      f"{len(entries)} entries in {cloud.WORLD_BACKUPS}/", "rclone")
    except Exception as exc:  # noqa: BLE001
        return _check("backup", "backup remote reachable", False, str(exc)[:200], "rclone")


def check_secrets() -> dict:
    from scripts.foundry import admin_password
    try:
        ok = bool(admin_password.foundry_admin_password(required=False))
    except Exception as exc:  # noqa: BLE001
        return _check("secrets", "Infisical resolves the admin password", False,
                      f"{type(exc).__name__}", "apt:infisical")
    return _check("secrets", "Infisical resolves the admin password", ok,
                  "resolved" if ok else "not resolved — infisical login / machine identity?",
                  "apt:infisical")


def check_llm() -> dict:
    with tempfile.TemporaryDirectory(prefix="vtt-verify-") as cwd:
        rc, out = hostdeps.run(["bash", "-c", f'cd "{cwd}" && claude -p "Reply with exactly the word ok" '
                                "--no-session-persistence"], timeout=180)
    ok = rc == 0 and "ok" in out.strip().lower()[:40]
    return _check("llm", "claude -p answers (the LLM steps)", ok,
                  "answered" if ok else f"rc={rc}: {out.strip()[-160:]}", "claude")


def check_tools() -> list[dict]:
    out: list[dict] = []
    for name, cmd, component in TOOLS:
        rc, text = hostdeps.run(cmd, timeout=30)
        first = text.strip().splitlines()[0][:80] if text.strip() else ""
        out.append(_check(f"tool:{name}", f"{name} runs", rc == 0, first or f"rc={rc}", component))
    return out


def run_all(*, world: str | None, tunnel_expected: bool, llm: bool = True) -> list[dict]:
    if host.system() != "Linux":
        return []
    checks = [check_node(), check_foundry(world), check_tunnel(tunnel_expected),
              check_backup_remote(), check_secrets()]
    if llm:
        checks.append(check_llm())
    checks.extend(check_tools())
    return checks


RECHECK = {"node": check_node, "tunnel": None, "backup": check_backup_remote,
           "secrets": check_secrets, "llm": check_llm}


def render_text(checks: list[dict]) -> str:
    if not checks:
        return ""
    lines = ["", "Validation:"]
    for c in checks:
        lines.append(f"  {'✓' if c['ok'] else '✗'} {c['label']}: {c['detail']}")
    return "\n".join(lines)
