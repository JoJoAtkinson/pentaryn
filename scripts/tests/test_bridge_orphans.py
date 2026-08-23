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
