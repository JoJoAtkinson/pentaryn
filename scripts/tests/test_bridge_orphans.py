"""Orphan detection for the Foundry MCP bridge.

The bug: on 2026-08-23 a `backend.js` from three days earlier still owned the bridge's
websocket ports. Foundry's browser reconnected to that stale broker after a restart and
every bridge tool timed out, with nothing logged anywhere.

The near-miss: the obvious fix — kill the bridge processes — severs the tools of every
*live* Claude Code session, which is exactly what happened while diagnosing it. So the
property that matters most here is not "finds orphans", it is **"never kills a live
session"**.
"""

from __future__ import annotations

import pytest

from scripts.foundry.ops.bridge import Proc, judge


def server(pid, ppid, *, parent_alive=True, parent_comm="claude", ports=()):
    return Proc(pid=pid, ppid=ppid, started="Sat Aug 22 12:00:00 2026",
                command="node /x/foundry-vtt-mcp/packages/mcp-server/dist/index.js",
                kind="server", parent_alive=parent_alive, parent_comm=parent_comm,
                ports=tuple(ports))


def backend(pid, ppid, *, parent_alive=True, ports=()):
    return Proc(pid=pid, ppid=ppid, started="Thu Aug 20 09:47:41 2026",
                command="node /x/foundry-vtt-mcp/packages/mcp-server/dist/backend.js",
                kind="backend", parent_alive=parent_alive, ports=tuple(ports))


def by_pid(procs):
    return {p.pid: p for p in procs}


# ── the property that matters most ───────────────────────────────────────────

def test_a_server_owned_by_a_live_claude_is_never_an_orphan():
    procs = judge([server(100, 99, parent_comm="claude")])
    assert procs[0].orphan is False
    assert "live session" in procs[0].reason


def test_three_concurrent_sessions_are_all_kept():
    """The real machine state while this was written — three live sessions."""
    procs = judge([server(11598, 11581), server(71365, 71305), server(82438, 82398)])
    assert [p.orphan for p in procs] == [False, False, False]


def test_a_live_backend_under_a_live_server_is_kept():
    procs = judge([server(100, 99), backend(101, 100, ports=(31414, 31415))])
    assert not any(p.orphan for p in procs)
    assert by_pid(procs)[101].reason == "broker for a live session"


def test_an_unrecognised_live_parent_is_left_alone_rather_than_guessed_about():
    procs = judge([server(100, 99, parent_comm="zsh")])
    assert procs[0].orphan is False
    assert "leaving it alone" in procs[0].reason


# ── finding the actual orphans ───────────────────────────────────────────────

def test_a_server_whose_parent_died_is_an_orphan():
    procs = judge([server(100, 99, parent_alive=False, parent_comm="")])
    assert procs[0].orphan is True
    assert "session ended" in procs[0].reason


def test_the_exact_2026_08_23_shape_is_caught():
    """A LIVE backend holding the ports, whose parent server is orphaned.

    The backend itself looks healthy — running, listening, parent pid present in the
    table. Only the grandparent is gone. Judging the backend on its own liveness misses
    it entirely, which is why it survived three days.
    """
    stale_server = server(80974, 80786, parent_alive=False, parent_comm="")
    stale_backend = backend(80975, 80974, parent_alive=True, ports=(31414, 31415, 31416))
    live_server = server(82438, 82398)
    procs = judge([stale_server, stale_backend, live_server])
    m = by_pid(procs)
    assert m[80974].orphan is True
    assert m[80975].orphan is True, "the port-holding backend must be caught"
    assert "orphaned" in m[80975].reason
    assert m[82438].orphan is False, "the live session must survive"


def test_a_backend_whose_server_is_gone_entirely_is_an_orphan():
    procs = judge([backend(101, 100, parent_alive=False, ports=(31415,))])
    assert procs[0].orphan is True


def test_orphans_and_live_sessions_coexist_without_contaminating_each_other():
    procs = judge([
        server(1, 999, parent_alive=False, parent_comm=""),   # orphan
        backend(2, 1, parent_alive=True, ports=(31415,)),     # orphan by parent
        server(3, 300, parent_comm="claude"),                 # live
        backend(4, 3, parent_alive=True),                     # live
    ])
    m = by_pid(procs)
    assert [m[1].orphan, m[2].orphan, m[3].orphan, m[4].orphan] == [True, True, False, False]


# ── edge cases ───────────────────────────────────────────────────────────────

def test_empty_input_is_fine():
    assert judge([]) == []


def test_parent_comm_matching_is_case_insensitive():
    assert judge([server(100, 99, parent_comm="Claude")])[0].orphan is False


def test_children_are_linked_for_reporting():
    procs = judge([server(100, 99), backend(101, 100)])
    assert by_pid(procs)[100].children[0].pid == 101


@pytest.mark.parametrize("ppid", [0, 1])
def test_reparented_to_launchd_counts_as_orphaned(ppid):
    """When Claude Code exits, its child is reparented to launchd (pid 1)."""
    assert judge([server(100, ppid, parent_alive=False, parent_comm="")])[0].orphan is True


# ── scan(): the ps/lsof parse (python-tooling-37) ────────────────────────────
#
# Canned `subprocess.run` answers, so scan() runs without touching the machine. The fake
# answers both the per-pid `ps -p <pid> -o comm=` form and the one-shot
# `ps -eo pid=,comm=` form from the same comm map, so the same pins hold whichever way
# scan() asks for parent names.

import subprocess as _subprocess
from types import SimpleNamespace

from scripts.foundry.ops import bridge as bridge_mod

PS_ROWS = [
    "  100    99 Sat Aug 22 12:00:00 2026     node /x/foundry-vtt-mcp/packages/mcp-server/dist/index.js",
    "  101   100 Sat Aug 22 12:00:01 2026     node /x/foundry-vtt-mcp/packages/mcp-server/dist/backend.js",
    "  200    98 Thu Aug 20 09:47:41 2026     node /x/foundry-vtt-mcp/packages/mcp-server/dist/index.js",
    "  500     1 Thu Aug 20 09:00:00 2026     /usr/bin/unrelated --flag",
]
MALFORMED_ROW = "  300 notapid Thu Aug 20 09:47:41 2026 node /x/foundry-vtt-mcp/dist/index.js"
COMM = {99: "/Applications/Claude.app/Contents/MacOS/claude", 100: "node",
        101: "node", 1: "/sbin/launchd", 500: "/usr/bin/unrelated"}
ALIVE = {99, 100, 101, 1, 500}
LSOF = {31414: "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n"
               "node 101 joe 20u IPv4 0x1 0t0 TCP 127.0.0.1:31414 (LISTEN)\n"}


def _fake_run(ps_rows, calls):
    def run(cmd, capture_output=True, text=True, **kw):
        calls.append(list(cmd))
        if cmd[0] == "lsof":
            port = int(cmd[2].split(":", 1)[1])
            return SimpleNamespace(stdout=LSOF.get(port, ""), returncode=0)
        if cmd[:2] == ["ps", "-eo"] and cmd[2] == "pid=,ppid=,lstart=,command=":
            return SimpleNamespace(stdout="\n".join(ps_rows) + "\n", returncode=0)
        if cmd[:2] == ["ps", "-eo"] and cmd[2] == "pid=,comm=":
            return SimpleNamespace(
                stdout="".join(f"{pid:>5} {c}\n" for pid, c in COMM.items()), returncode=0)
        if cmd[:2] == ["ps", "-p"]:
            return SimpleNamespace(stdout=COMM.get(int(cmd[2]), "") + "\n", returncode=0)
        raise AssertionError(f"unexpected subprocess call {cmd}")
    return run


@pytest.fixture
def canned(monkeypatch):
    calls: list[list[str]] = []

    def kill(pid, sig):
        if pid not in ALIVE:
            raise ProcessLookupError(pid)

    monkeypatch.setattr(bridge_mod.os, "kill", kill)

    def use(rows):
        monkeypatch.setattr(bridge_mod.subprocess, "run", _fake_run(rows, calls))
        return calls
    return use


def _summary(procs):
    return sorted((p.pid, p.ppid, p.kind, p.started, p.parent_alive, p.parent_comm,
                   p.ports, p.orphan, p.reason) for p in procs)


SCAN_PIN = [
    (100, 99, "server", "Sat Aug 22 12:00:00 2026", True, "claude", (), False,
     "live session (parent 99 claude)"),
    (101, 100, "backend", "Sat Aug 22 12:00:01 2026", True, "node", (31414,), False,
     "broker for a live session"),
    (200, 98, "server", "Thu Aug 20 09:47:41 2026", False, "", (), True,
     "parent 98 is gone — its session ended"),
]


def test_scan_classifies_canned_ps_output(canned):
    """Characterisation: the parse and the verdicts on a canned process table."""
    canned(PS_ROWS)
    assert _summary(bridge_mod.scan()) == SCAN_PIN


def test_scan_skips_a_malformed_ppid_row(canned):
    """python-tooling-37 [declared]: a row whose ppid is not an int is skipped, not fatal."""
    canned(PS_ROWS[:2] + [MALFORMED_ROW] + PS_ROWS[2:])
    assert _summary(bridge_mod.scan()) == SCAN_PIN


def test_scan_asks_ps_for_parent_names_once(canned):
    """python-tooling-37: one `ps` for the table, one for every name, three `lsof` — the
    count no longer grows with the number of bridge processes."""
    calls = canned(PS_ROWS)
    bridge_mod.scan()
    assert [c[0] for c in calls].count("ps") == 2
    assert [c[0] for c in calls].count("lsof") == len(bridge_mod.BRIDGE_PORTS)
    assert len(calls) == 5


# ── clean(): the exit code tells the truth (rob-11) ──────────────────────────
#
# scan() is replaced by a scripted sequence of process tables and os.kill by a fake
# that records signals, so clean() runs without touching the machine.

import signal as _signal


def _orphan_server(pid):
    p = server(pid, 1, parent_alive=False, parent_comm="")
    p.orphan, p.reason = True, "reparented to launchd"
    return p


@pytest.fixture
def cleaner(monkeypatch):
    def use(*, refuse=(), immortal=()):
        alive = {300, 301}
        sent: list[tuple[int, int]] = []

        def kill(pid, sig):
            if pid not in alive:
                raise ProcessLookupError(pid)
            if pid in refuse and sig != 0:
                raise PermissionError(pid)
            if sig == 0:
                return
            sent.append((pid, sig))
            if pid not in immortal and sig == _signal.SIGKILL:
                alive.discard(pid)

        def scan():
            return [_orphan_server(pid) for pid in sorted(alive)]

        monkeypatch.setattr(bridge_mod.os, "kill", kill)
        monkeypatch.setattr(bridge_mod, "scan", scan)
        monkeypatch.setattr(bridge_mod, "_port_owners", lambda: {})
        monkeypatch.setattr(bridge_mod.time, "sleep", lambda s: None)
        return sent
    return use


def test_clean_is_ok_when_every_orphan_goes(cleaner, capsys):
    cleaner()
    assert bridge_mod.clean() == bridge_mod.OK
    assert "✗" not in capsys.readouterr().out


def test_clean_fails_when_a_kill_is_refused_rob_11(cleaner, capsys):
    """rob-11 [declared]: a PermissionError on kill used to print a ✗ and still exit 0."""
    cleaner(refuse={301})
    assert bridge_mod.clean() == bridge_mod.FAIL
    out = capsys.readouterr().out
    assert "✗" in out and "301" in out.split("still running")[-1]


def test_clean_fails_when_an_orphan_survives_sigkill_rob_11(cleaner, capsys):
    """rob-11 [declared]: an orphan still alive after the SIGKILL pass is named and fails."""
    sent = cleaner(immortal={300})
    assert bridge_mod.clean() == bridge_mod.FAIL
    assert (300, _signal.SIGKILL) in sent
    tail = capsys.readouterr().out.split("still running")[-1]
    assert "300" in tail and "301" not in tail


# --- EC-12: every port holder is judged, not just the first ---------------------------

def _two_holders():
    """A live broker on one port and an orphan on another — the shape EC-12 missed."""
    live = Proc(pid=10, ppid=1, started="t1", command="c", kind="backend",
                ports=(31414,), reason="broker for a live session")
    orphan = Proc(pid=20, ppid=1, started="t2", command="c", kind="backend",
                  ports=(31415,), orphan=True, reason="parent 1 is gone")
    return [live, orphan]


def test_status_report_fails_on_an_orphan_holding_a_second_port_ec_12():
    r = bridge_mod.status_report(_two_holders())
    assert r["ok"] is False
    assert r["holders"] == [{"pid": 10, "ports": [31414], "orphan": False},
                            {"pid": 20, "ports": [31415], "orphan": True}]
    assert bridge_mod.status_report([])["holders"] == []


def test_status_fails_and_names_an_orphan_on_a_second_port_ec_12(monkeypatch, capsys):
    monkeypatch.setattr(bridge_mod, "scan", _two_holders)
    assert bridge_mod.status() == bridge_mod.FAIL
    out = capsys.readouterr().out
    assert "✗" in out and "pid 20" in out
    assert "pid 10" in out


def test_warn_if_stale_warns_on_an_orphan_holding_a_second_port_ec_12(monkeypatch, capsys):
    monkeypatch.setattr(bridge_mod, "scan", _two_holders)
    bridge_mod.warn_if_stale()
    out = capsys.readouterr().out
    assert "⚠" in out and "pid 20" in out


def test_warn_if_stale_is_quiet_when_every_holder_is_live_ec_12(monkeypatch, capsys):
    live = _two_holders()[0]
    monkeypatch.setattr(bridge_mod, "scan", lambda: [live])
    bridge_mod.warn_if_stale()
    assert capsys.readouterr().out == ""
