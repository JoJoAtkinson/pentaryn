"""One cloudflared connector per tunnel, and the suite never touches the live one.

2026-11-20/21 on BOSS: a test that called ``tunnel_down()`` with only ``_tunnel_pid``
patched deleted the real ``.run/cloudflared.pid`` while its cloudflared lived. tunnel-down
then said "already down", tunnel-up (and the nightly) started a second and a third
connector, and the old ones kept serving players on the config they were started with —
the ``protocol: http2`` pin reached a third of the traffic. Now tunnel-up and tunnel-down
look at the processes as well as the pidfile, `make vtt` names extras, and conftest's
``_isolate_tunnel`` gives every test its own run folder and no cloudflared processes.
"""

from __future__ import annotations

import subprocess

import pytest

from scripts.foundry.ops import config as cfg
from scripts.foundry.ops import service

# conftest's autouse fixture replaces service._tunnel_processes for every test; this is
# the real one, taken at import (collection) time, for the tests that parse `ps` output.
REAL_TUNNEL_PROCESSES = service._tunnel_processes

PS = """\
    328 cloudflared     /usr/local/bin/cloudflared tunnel --no-autoupdate --config /home/x/.cloudflared/other.yml run other
  43671 cloudflared     cloudflared tunnel --config /repo/foundry/cloudflared/config.yml run ardenhaven
 452965 cloudflared     cloudflared tunnel --config /repo/foundry/cloudflared/config.yml run ardenhaven
 601818 cloudflared     cloudflared tunnel --no-autoupdate --url http://localhost:38471 --protocol quic
 700001 bash            /bin/bash -c cloudflared tunnel run ardenhaven
 700002 python3         python3 -m pytest -k run ardenhaven
 700003 cloudflared     cloudflared tunnel info ardenhaven
"""


def _ps(monkeypatch, stdout=PS, rc=0):
    monkeypatch.setattr(service.subprocess, "run",
                        lambda argv, **kw: subprocess.CompletedProcess(argv, rc, stdout=stdout, stderr=""))


# ── the suite cannot reach the live tunnel ────────────────────────────────────

def test_the_run_folder_is_never_the_repos_by_default():
    """The regression itself: with the real paths, any test reaching _drop_stale_pidfile
    deleted the live pidfile."""
    real = cfg.REPO_ROOT / ".run"
    for path in (cfg.RUN_DIR, cfg.CF_PID, cfg.CF_LOG):
        assert real not in (path, *path.parents), path
    assert service._tunnel_processes() == []


def test_tunnel_down_with_only_the_pid_patched_leaves_the_real_pidfile_alone(monkeypatch):
    """What test_tunnel_down_never_sets_the_switch does. The pidfile it may remove is tmp."""
    cfg.CF_PID.write_text("4242")
    monkeypatch.setattr(service, "_tunnel_pid", lambda: None)
    assert service.tunnel_down() == 0
    assert not cfg.CF_PID.exists()
    assert (cfg.REPO_ROOT / ".run") not in cfg.CF_PID.parents


# ── which processes are this tunnel's connectors ──────────────────────────────

def test_tunnel_processes_names_only_this_tunnels_run_commands(monkeypatch):
    _ps(monkeypatch)
    # not: another tunnel, a quick tunnel, a shell or pytest that merely mentions it,
    # `cloudflared tunnel info <name>`
    assert REAL_TUNNEL_PROCESSES() == [43671, 452965]


def test_tunnel_processes_follows_the_configured_name(monkeypatch):
    _ps(monkeypatch)
    monkeypatch.setattr(cfg, "TUNNEL_NAME", "other")
    assert REAL_TUNNEL_PROCESSES() == [328]


@pytest.mark.parametrize("boom", [OSError("no ps"), subprocess.TimeoutExpired("ps", 5)])
def test_tunnel_processes_reads_a_failed_ps_as_none(monkeypatch, boom):
    def run(argv, **kw):
        raise boom
    monkeypatch.setattr(service.subprocess, "run", run)
    assert REAL_TUNNEL_PROCESSES() == []


# ── tunnel-down stops every connector ─────────────────────────────────────────

@pytest.fixture
def kills(monkeypatch):
    """Record signals; a signalled pid is gone at once. No real process is touched."""
    sent, dead = [], set()

    def kill(pid, sig):
        sent.append((pid, sig))
        if sig == 15:
            dead.add(pid)
    monkeypatch.setattr(service.os, "kill", kill)
    monkeypatch.setattr(service, "_is_cloudflared", lambda pid: pid not in dead)
    monkeypatch.setattr(service.time, "sleep", lambda s: None)
    return sent


def test_tunnel_down_stops_connectors_the_pidfile_does_not_name(kills, monkeypatch, capsys):
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [43671, 175426])
    assert service.tunnel_down() == 0       # no pidfile at all: used to say "already down"
    assert sorted(kills) == [(43671, 15), (175426, 15)]
    out = capsys.readouterr().out
    assert "not in the pidfile" in out and "tunnel stopped" in out


def test_tunnel_down_stops_the_pidfile_connector_and_the_extras(kills, monkeypatch):
    cfg.CF_PID.write_text("452965")
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [43671, 175426, 452965])
    assert service.tunnel_down() == 0
    assert sorted(p for p, sig in kills if sig == 15) == [43671, 175426, 452965]
    assert not cfg.CF_PID.exists()


def test_tunnel_down_fails_when_an_extra_survives_sigterm(monkeypatch, capsys):
    monkeypatch.setattr(service.os, "kill", lambda pid, sig: None)
    monkeypatch.setattr(service, "_is_cloudflared", lambda pid: True)   # never dies
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [43671])
    monkeypatch.setattr(service, "_stop_connectors",
                        lambda pids, wait=10.0: list(pids))             # no 10 s wait in a test
    assert service.tunnel_down() == 1
    assert "still running after SIGTERM: pid 43671" in capsys.readouterr().out


def test_stop_connectors_never_signals_init_or_a_group(kills):
    assert service._stop_connectors([0, 1, -5, 43671]) == []
    assert kills == [(43671, 15)]


# ── tunnel-up leaves exactly one ──────────────────────────────────────────────

@pytest.fixture
def ready(monkeypatch, tmp_path):
    cert = tmp_path / "cert.pem"
    cert.write_text("x")
    monkeypatch.setattr(service, "CF_CERT", cert)
    monkeypatch.setattr(service.host, "require_primary", lambda *a, **kw: None)
    monkeypatch.setattr(service, "tunnel_disabled", lambda: None)
    monkeypatch.setattr(service, "_tunnel_exists", lambda: True)
    started = []

    class FakePopen:
        def __init__(self, argv, **kw):
            started.append(list(argv))
            self.pid = 50001
    monkeypatch.setattr(service.subprocess, "Popen", FakePopen)
    return started


def test_tunnel_up_already_up_stops_the_extras_and_starts_nothing(ready, kills, monkeypatch, capsys):
    cfg.CF_PID.write_text("452965")
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [43671, 175426, 452965])
    assert service.tunnel_up() == 0
    assert sorted(kills) == [(43671, 15), (175426, 15), (452965, 0)]   # 0 = the liveness probe
    assert ready == []
    out = capsys.readouterr().out
    assert "2 other cloudflared connector(s)" in out and "tunnel already up (pid 452965)" in out


def test_tunnel_up_with_a_lost_pidfile_replaces_the_orphan(ready, kills, monkeypatch, capsys):
    """The 2026-11-20 shape: no pidfile, one connector alive. One connector afterwards,
    started now (so on today's config), and it is the pidfile's."""
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [43671])
    assert service.tunnel_up() == 0
    assert (43671, 15) in kills
    assert len(ready) == 1 and ready[0][-2:] == ["run", cfg.TUNNEL_NAME]
    assert cfg.CF_PID.read_text() == "50001"
    assert "1 other cloudflared connector(s)" in capsys.readouterr().out


def test_tunnel_up_refuses_to_add_a_connector_beside_one_that_will_not_stop(ready, monkeypatch, capsys):
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [43671])
    monkeypatch.setattr(service, "_stop_connectors", lambda pids, wait=10.0: list(pids))
    assert service.tunnel_up() == 1
    assert ready == []
    assert not cfg.CF_PID.exists()
    assert "tunnel not started" in capsys.readouterr().out


def test_tunnel_up_alone_is_unchanged(ready, kills, capsys):
    assert service.tunnel_up() == 0
    assert len(ready) == 1 and [k for k in kills if k[1] == 15] == []
    assert "other cloudflared connector" not in capsys.readouterr().out


# ── make vtt says so ──────────────────────────────────────────────────────────

def test_status_names_extra_connectors(monkeypatch, capsys):
    monkeypatch.setattr(service, "foundry_is_up", lambda *a: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: 452965)
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [43671, 175426, 452965])
    monkeypatch.setattr(service, "_probe", lambda *a: (302, "https://x/cdn-cgi/access/login"))
    assert service.status_report()["tunnel"]["strays"] == [43671, 175426]
    assert service.status() == 0
    out = capsys.readouterr().out
    assert "2 EXTRA connector(s) not in the pidfile (pid 43671, 175426)" in out
    assert "make tunnel-down && make tunnel-up" in out


def test_status_is_quiet_with_one_connector(monkeypatch, capsys):
    monkeypatch.setattr(service, "foundry_is_up", lambda *a: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: 452965)
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [452965])
    monkeypatch.setattr(service, "_probe", lambda *a: (302, "https://x/cdn-cgi/access/login"))
    assert service.status_report()["tunnel"]["strays"] == []
    assert service.status() == 0
    assert "EXTRA" not in capsys.readouterr().out
