"""Find and clear orphaned Foundry MCP bridge processes.

Every Claude Code session spawns its own `index.js` MCP server, and the first one to
start also spawns the singleton `backend.js` that owns the bridge's websocket ports
(31414-31416). Nothing cleans them up when a session ends.

The failure that motivated this, on 2026-08-23: a `backend.js` from three days earlier
still owned all three ports. Foundry's browser client reconnected to *that* broker
after a restart, so every bridge tool timed out while three current sessions sat there
unable to bind. Nothing logged an error — the tools just stopped answering.

**The orphan signal is a dead parent.** When Claude Code exits, its `index.js` child is
reparented to launchd, so `ppid == 1` (or a parent that is no longer alive). That is a
precise test: a process whose parent is a live `claude` cannot belong to a finished
session, and must never be killed — doing so severs a working session's tools, which
is exactly the mistake that prompted writing this down.

A `backend.js` is judged by its parent `index.js`: a live backend whose parent is an
orphan is itself stale, and that is the specific shape that held the ports for three
days.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import time
from dataclasses import dataclass, field

from .out import FAIL, OK, say as _say

BRIDGE_PORTS = (31414, 31415, 31416)
MATCH = "foundry-vtt-mcp"


@dataclass
class Proc:
    pid: int
    ppid: int
    started: str
    command: str
    kind: str                      # "server" (index.js) | "backend" | "other"
    parent_alive: bool = False
    parent_comm: str = ""
    ports: tuple[int, ...] = ()
    orphan: bool = False
    reason: str = ""
    children: list["Proc"] = field(default_factory=list)


def _alive(pid: int) -> bool:
    if pid <= 1:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _comms() -> dict[int, str]:
    """pid -> executable basename, for every process, from one `ps` (python-tooling-37:
    was one `ps -p` per bridge process)."""
    out = subprocess.run(["ps", "-eo", "pid=,comm="], capture_output=True, text=True)
    names: dict[int, str] = {}
    for line in out.stdout.splitlines():
        parts = line.strip().split(maxsplit=1)
        if len(parts) < 2:
            continue
        try:
            names[int(parts[0])] = parts[1].strip().rsplit("/", 1)[-1]
        except ValueError:
            continue
    return names


def _port_owners() -> dict[int, list[int]]:
    """pid -> the bridge ports it is listening on."""
    owners: dict[int, list[int]] = {}
    for port in BRIDGE_PORTS:
        out = subprocess.run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
                             capture_output=True, text=True)
        for line in out.stdout.splitlines()[1:]:
            parts = line.split()
            if len(parts) < 2:
                continue
            try:
                owners.setdefault(int(parts[1]), []).append(port)
            except ValueError:
                continue
    return owners


def scan() -> list[Proc]:
    """Every bridge process, classified and judged."""
    out = subprocess.run(
        ["ps", "-eo", "pid=,ppid=,lstart=,command="], capture_output=True, text=True)
    owners = _port_owners()
    comms: dict[int, str] | None = None

    procs: list[Proc] = []
    for line in out.stdout.splitlines():
        if MATCH not in line:
            continue
        parts = line.split(maxsplit=1)
        if len(parts) < 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        rest = parts[1].split(maxsplit=1)
        try:
            ppid = int(rest[0])
            # lstart is a fixed 5-field date: "Thu Aug 20 09:47:41 2026"
            tail = rest[1].split(maxsplit=5)
        except (ValueError, IndexError):
            continue
        started, command = " ".join(tail[:5]), (tail[5] if len(tail) > 5 else "")

        kind = ("backend" if "backend.js" in command
                else "server" if "index.js" in command else "other")
        p = Proc(pid=pid, ppid=ppid, started=started, command=command, kind=kind)
        p.parent_alive = _alive(ppid)
        if p.parent_alive:
            if comms is None:
                comms = _comms()
            p.parent_comm = comms.get(ppid, "")
        p.ports = tuple(sorted(owners.get(pid, ())))
        procs.append(p)

    return judge(procs)


def judge(procs: list[Proc]) -> list[Proc]:
    """Decide which processes are orphans. Pure — no subprocess, no /proc.

    Servers are judged by their parent: a dead parent means the session ended. A live
    parent that is not Claude is left alone rather than guessed about.

    Backends are judged by *their* server: a live backend whose server is orphaned is
    the exact shape that held the ports for three days on 2026-08-23.
    """
    by_pid = {p.pid: p for p in procs}
    for p in procs:
        if p.ppid in by_pid:
            by_pid[p.ppid].children.append(p)

    for p in procs:
        if p.kind != "server":
            continue
        if not p.parent_alive:
            p.orphan, p.reason = True, f"parent {p.ppid} is gone — its session ended"
        elif "claude" not in p.parent_comm.lower():
            p.orphan, p.reason = False, f"parent {p.ppid} is {p.parent_comm!r} — leaving it alone"
        else:
            p.reason = f"live session (parent {p.ppid} {p.parent_comm})"

    for p in procs:
        if p.kind != "backend":
            continue
        parent = by_pid.get(p.ppid)
        if parent is None and not p.parent_alive:
            p.orphan, p.reason = True, f"parent {p.ppid} is gone"
        elif parent is not None and parent.orphan:
            p.orphan, p.reason = True, (
                f"its server (pid {parent.pid}) is orphaned — this is the shape that "
                f"holds the ports after a session ends")
        else:
            p.reason = "broker for a live session"
    return procs


def _port_holders(procs: list[Proc]) -> list[Proc]:
    """Every process listening on a bridge port (M8). EC-12: each one is judged — an
    orphan on any port is the stale broker, not only the first holder found."""
    return [p for p in procs if p.ports]


def status_report(procs: list[Proc] | None = None) -> dict:
    """Bridge processes as data (python-tooling-41): `ok` is False only when an orphan
    holds a bridge port — the state in which every bridge tool times out silently."""
    procs = scan() if procs is None else procs
    holders = _port_holders(procs)

    def row(p: Proc) -> dict:
        return {"pid": p.pid, "ppid": p.ppid, "kind": p.kind, "started": p.started,
                "ports": list(p.ports), "orphan": p.orphan, "reason": p.reason,
                "parent_alive": p.parent_alive, "parent_comm": p.parent_comm}

    return {
        "ok": not any(p.orphan for p in holders),
        "servers": sum(p.kind == "server" for p in procs),
        "backends": sum(p.kind == "backend" for p in procs),
        "holders": [{"pid": p.pid, "ports": list(p.ports), "orphan": p.orphan}
                    for p in holders],
        "orphans": [p.pid for p in procs if p.orphan],
        "procs": [row(p) for p in sorted(procs, key=lambda x: (x.kind, x.pid))],
    }


def status(as_json: bool = False) -> int:
    procs = scan()
    if as_json:
        r = status_report(procs)
        print(json.dumps(r, indent=2))
        return OK if r["ok"] else FAIL
    if not procs:
        _say("▸ no Foundry MCP bridge processes running")
        return OK

    servers = [p for p in procs if p.kind == "server"]
    backends = [p for p in procs if p.kind == "backend"]
    _say(f"▸ {len(servers)} MCP server(s), {len(backends)} backend broker(s)")
    print()
    for p in sorted(procs, key=lambda x: (x.kind, x.pid)):
        flag = "ORPHAN " if p.orphan else "       "
        ports = f" ports={','.join(map(str, p.ports))}" if p.ports else ""
        print(f"  {flag}{p.kind:8s} pid={p.pid:<7d} started={p.started}{ports}")
        print(f"          {p.reason}")
    print()

    holders = _port_holders(procs)
    if not holders:
        _say("▸ nothing is holding the bridge ports — the next server to start will bind")
    for h in holders:
        ports = ",".join(map(str, h.ports))
        if h.orphan:
            _say(f"✗ bridge port(s) {ports} held by an ORPHAN (pid {h.pid}, started {h.started}).")
        else:
            _say(f"✓ bridge port(s) {ports} held by a live broker (pid {h.pid})")
    if any(h.orphan for h in holders):
        _say("  Foundry's browser client will talk to that stale broker and every bridge")
        _say("  tool will time out with no error logged anywhere. Clear it with:")
        _say("    make foundry-bridge-clean")
        return FAIL

    stale = [p for p in procs if p.orphan]
    if stale:
        _say(f"▸ {len(stale)} orphaned process(es) are idling — `make foundry-bridge-clean` tidies them")
    return OK


def clean(dry_run: bool = False) -> int:
    """Kill orphans only. A process whose parent is a live Claude session is never
    touched — severing a working session's tools is worse than leaving a stray."""
    procs = scan()
    stale = [p for p in procs if p.orphan]
    live = [p for p in procs if not p.orphan and p.kind == "server"]

    if not stale:
        _say(f"✓ nothing to clean — {len(live)} live session server(s), no orphans")
        return OK

    # Backends first: killing a parent server first would orphan its child mid-scan.
    stale.sort(key=lambda p: 0 if p.kind == "backend" else 1)
    refused: set[int] = set()
    for p in stale:
        if dry_run:
            _say(f"▸ would kill {p.kind} pid={p.pid} ({p.started}) — {p.reason}")
            continue
        try:
            os.kill(p.pid, signal.SIGTERM)
            _say(f"✓ TERM {p.kind} pid={p.pid} ({p.started})")
        except ProcessLookupError:
            _say(f"▸ {p.pid} already gone")
        except PermissionError:
            refused.add(p.pid)
            _say(f"✗ not permitted to kill {p.pid}")

    if dry_run:
        _say(f"▸ dry run — {len(stale)} orphan(s) would go, {len(live)} live server(s) kept")
        return OK

    time.sleep(2)
    survivors = [p for p in scan() if p.orphan]
    for p in survivors:
        try:
            os.kill(p.pid, signal.SIGKILL)
            _say(f"✓ KILL {p.kind} pid={p.pid} (did not answer TERM)")
        except PermissionError:
            refused.add(p.pid)
        except OSError:
            pass

    # rob-11: OK only when every orphan is actually gone.
    if survivors:
        time.sleep(0.5)
    left = [p for p in survivors if _alive(p.pid)]
    _say(f"▸ kept {len(live)} live session server(s)")
    owners = _port_owners()
    if owners:
        _say(f"▸ bridge ports now held by pid {next(iter(owners))}")
    else:
        _say("▸ bridge ports free — the next MCP server to start will bind them")
        _say("  A Foundry client already open must reload to reconnect.")
    if left:
        _say(f"✗ {len(left)} orphan(s) still running:")
        for p in left:
            why = "not permitted to kill" if p.pid in refused else "survived SIGKILL"
            _say(f"    {p.kind} pid={p.pid} ({p.started}) — {why}")
        return FAIL
    return OK


def warn_if_stale() -> None:
    """Non-destructive check for `make vtt-up`.

    Warns only. `vtt-up` must never kill an MCP server: the one it would most likely
    reach is the caller's own.
    """
    try:
        procs = scan()
    except Exception:
        return
    stale = [h for h in _port_holders(procs) if h.orphan]
    if stale:
        _say("")
        for h in stale:
            _say(f"⚠ MCP bridge port(s) {','.join(map(str, h.ports))} held by an orphaned "
                 f"process (pid {h.pid}, started {h.started}).")
        _say("  Bridge tools will time out silently.")
        _say("  Fix: make foundry-bridge-clean   (then reload the Foundry browser tab)")
