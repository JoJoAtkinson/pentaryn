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

import os
import signal
import subprocess
import time
from dataclasses import dataclass, field

from .service import _say

OK, FAIL = 0, 1

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


def _comm(pid: int) -> str:
    out = subprocess.run(["ps", "-p", str(pid), "-o", "comm="],
                         capture_output=True, text=True)
    return out.stdout.strip().rsplit("/", 1)[-1]


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
        ppid = int(rest[0])
        # lstart is a fixed 5-field date: "Thu Aug 20 09:47:41 2026"
        tail = rest[1].split(maxsplit=5)
        started, command = " ".join(tail[:5]), (tail[5] if len(tail) > 5 else "")

        kind = ("backend" if "backend.js" in command
                else "server" if "index.js" in command else "other")
        p = Proc(pid=pid, ppid=ppid, started=started, command=command, kind=kind)
        p.parent_alive = _alive(ppid)
        p.parent_comm = _comm(ppid) if p.parent_alive else ""
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


def status() -> int:
    procs = scan()
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

    holder = next((p for p in procs if p.ports), None)
    if holder is None:
        _say("▸ nothing is holding the bridge ports — the next server to start will bind")
    elif holder.orphan:
        _say(f"✗ the bridge ports are held by an ORPHAN (pid {holder.pid}, started {holder.started}).")
        _say("  Foundry's browser client will talk to that stale broker and every bridge")
        _say("  tool will time out with no error logged anywhere. Clear it with:")
        _say("    make foundry-bridge-clean")
        return FAIL
    else:
        _say(f"✓ bridge ports held by a live broker (pid {holder.pid})")

    stale = [p for p in procs if p.orphan]
    if stale and (holder is None or not holder.orphan):
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
        except OSError:
            pass

    _say(f"▸ kept {len(live)} live session server(s)")
    owners = _port_owners()
    if owners:
        _say(f"▸ bridge ports now held by pid {next(iter(owners))}")
    else:
        _say("▸ bridge ports free — the next MCP server to start will bind them")
        _say("  A Foundry client already open must reload to reconnect.")
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
    holder = next((p for p in procs if p.ports), None)
    if holder is not None and holder.orphan:
        _say("")
        _say(f"⚠ the MCP bridge ports are held by an orphaned process (pid {holder.pid},")
        _say(f"  started {holder.started}). Bridge tools will time out silently.")
        _say("  Fix: make foundry-bridge-clean   (then reload the Foundry browser tab)")
