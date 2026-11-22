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


# ── the tunnel as a systemd --user unit (BOSS) ────────────────────────────────
# With foundry-tunnel.service installed, tunnel-up / tunnel-down drive the unit: systemd
# owns the process, so there is one, and it returns after a boot. No unit file (the Mac):
# everything above, unchanged.

REAL_TUNNEL_UNIT = service._tunnel_unit
REAL_TUNNEL_PID = service._tunnel_pid
REAL_CONNECTORS = service._tunnel_connectors


class FakeSystemd:
    """`systemctl --user` for one unit: start/stop flip a main pid; every call is recorded."""

    def __init__(self, pid=None, start_rc=0, stop_rc=0):
        self.pid, self.start_rc, self.stop_rc, self.calls = pid, start_rc, stop_rc, []

    def __call__(self, *args, timeout=None):
        self.calls.append(args)
        rc, out = 0, ""
        if args[0] == "start":
            rc = self.start_rc
            if rc == 0:
                self.pid = 60001
        elif args[0] == "stop":
            rc = self.stop_rc
            if rc == 0:
                self.pid = None
        elif args[0] == "show":
            out = f"{self.pid or 0}\n"
        return subprocess.CompletedProcess(args, rc, stdout=out, stderr="boom" if rc else "")

    def did(self, verb):
        return [a for a in self.calls if a[0] == verb]


@pytest.fixture
def unit(monkeypatch):
    sd = FakeSystemd()
    monkeypatch.setattr(service, "_tunnel_unit", lambda: service.TUNNEL_UNIT)
    monkeypatch.setattr(service, "_systemctl", sd)
    return sd


def test_no_unit_file_means_the_pidfile_path(monkeypatch):
    monkeypatch.setattr(service.shutil, "which", lambda name: "/usr/bin/" + name)
    assert REAL_TUNNEL_UNIT() is None            # conftest's _unit_path: nothing installed
    service._unit_path().parent.mkdir(parents=True)
    service._unit_path().write_text("[Unit]\n")
    assert REAL_TUNNEL_UNIT() == "foundry-tunnel.service"
    monkeypatch.setattr(service.shutil, "which", lambda name: None)   # the Mac: no systemctl
    assert REAL_TUNNEL_UNIT() is None


def test_tunnel_up_starts_the_unit_not_a_process(unit, ready, kills, capsys):
    assert service.tunnel_up() == 0
    assert unit.did("start") == [("start", "foundry-tunnel.service")]
    assert ready == [], "no Popen: systemd owns the process"
    assert cfg.CF_PID.read_text() == "60001"     # kept in step for the nightly and the updater
    assert "tunnel up" in capsys.readouterr().out


def test_tunnel_up_with_the_unit_running_is_already_up(unit, ready, kills, capsys):
    unit.pid = 60001
    assert service.tunnel_up() == 0
    assert unit.did("start") == [] and ready == []
    assert "tunnel already up (pid 60001)" in capsys.readouterr().out


def test_tunnel_up_hands_a_pidfile_started_connector_over_to_the_unit(unit, ready, kills, monkeypatch, capsys):
    """The day the unit is installed: the old connector is running, the unit is not."""
    cfg.CF_PID.write_text("452965")
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [452965])
    assert service.tunnel_up() == 0
    assert (452965, 15) in kills
    assert unit.did("start") and ready == []
    assert cfg.CF_PID.read_text() == "60001"


def test_tunnel_up_stops_strays_beside_the_running_unit(unit, ready, kills, monkeypatch):
    unit.pid = 60001
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [43671, 60001])
    assert service.tunnel_up() == 0
    assert [p for p, sig in kills if sig == 15] == [43671]
    assert unit.did("start") == [] and unit.did("stop") == []


def test_tunnel_up_reports_a_failed_unit_start(unit, ready, kills, capsys):
    unit.start_rc = 1
    assert service.tunnel_up() == 1
    out = capsys.readouterr().out
    assert "systemctl --user start foundry-tunnel.service failed: boom" in out
    assert ready == []


def test_tunnel_up_while_disabled_never_touches_the_unit(unit, ready, monkeypatch, tmp_path):
    switch = tmp_path / "tunnel.disabled"
    switch.write_text("2026-11-21 — a test\n")
    monkeypatch.setattr(cfg, "TUNNEL_DISABLED", switch)
    monkeypatch.setattr(service, "tunnel_disabled", lambda: "2026-11-21 — a test")
    assert service.tunnel_up() == 0
    assert unit.calls == []


def test_tunnel_up_on_the_alt_never_touches_the_unit(unit, monkeypatch, capsys):
    def not_primary(*a, **k):
        raise service.host.NotPrimary("this host is the alt")
    monkeypatch.setattr(service, "tunnel_disabled", lambda: None)
    monkeypatch.setattr(service.host, "require_primary", not_primary)
    assert service.tunnel_up() == 0
    assert unit.calls == []
    assert "tunnel NOT started" in capsys.readouterr().out


def test_tunnel_down_stops_the_unit_and_never_signals_its_pid(unit, kills, capsys):
    unit.pid = 60001
    cfg.CF_PID.write_text("60001")
    assert service.tunnel_down() == 0
    assert unit.did("stop") == [("stop", "foundry-tunnel.service")]
    assert [k for k in kills if k[1] == 15] == [], "systemd stops its own process"
    assert not cfg.CF_PID.exists()
    assert "tunnel stopped" in capsys.readouterr().out


def test_tunnel_down_stops_the_unit_and_the_strays(unit, kills, monkeypatch):
    unit.pid = 60001
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [43671, 60001])
    assert service.tunnel_down() == 0
    assert unit.did("stop") and [p for p, sig in kills if sig == 15] == [43671]


def test_tunnel_down_with_the_unit_idle_still_cancels_a_pending_restart(unit, kills, capsys):
    assert service.tunnel_down() == 0
    assert unit.did("stop"), "a unit waiting out RestartSec would come back"
    assert "tunnel already down" in capsys.readouterr().out


def test_tunnel_down_reports_a_failed_unit_stop(unit, kills, capsys):
    unit.pid, unit.stop_rc = 60001, 1
    assert service.tunnel_down() == 1
    assert "systemctl --user stop foundry-tunnel.service failed" in capsys.readouterr().out


def test_tunnel_pid_under_the_unit_rewrites_a_lost_pidfile(unit, kills):
    """The 2026-11-20 failure, now harmless: the file is gone, the unit still knows."""
    unit.pid = 60001
    assert not cfg.CF_PID.exists()
    assert REAL_TUNNEL_PID() == 60001
    assert cfg.CF_PID.read_text() == "60001"


# ── the unit file ─────────────────────────────────────────────────────────────

def test_the_unit_template_is_single_instance_and_honours_the_switch():
    text = service.UNIT_TEMPLATE.read_text()
    assert "exec @CLOUDFLARED@ tunnel --config @CONFIG@ run @TUNNEL@ >> @REPO@/.run/cloudflared.log" in text
    directives = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
    assert not [ln for ln in directives if ln.startswith("Standard")], \
        "systemd opens StandardOutput= before .run exists (209/STDOUT)"
    assert text.index("ExecStartPre=/bin/mkdir -p @REPO@/.run") < text.index("ExecStart=/bin/sh")
    assert "ConditionPathExists=!@REPO@/.state/tunnel.disabled" in text
    assert "Restart=on-failure" in text and "WantedBy=default.target" in text
    assert "echo $MAINPID > @REPO@/.run/cloudflared.pid" in text
    # ordering only: starting the tunnel must never start Foundry
    assert not [ln for ln in directives if ln.startswith(("Wants=", "Requires="))]
    # the switch the unit checks is the one tunnel-disable writes
    assert cfg.TUNNEL_DISABLED == cfg.REPO_ROOT / ".state" / "tunnel.disabled"


def test_unit_install_renders_enables_and_starts_nothing(monkeypatch, capsys):
    sd = FakeSystemd()
    monkeypatch.setattr(service, "_systemctl", sd)
    monkeypatch.setattr(service.host, "require_primary", lambda *a, **k: None)
    monkeypatch.setattr(service.host, "is_mac", lambda: False)
    monkeypatch.setattr(service.shutil, "which", lambda name: "/usr/local/bin/" + name)
    assert service.tunnel_unit_install() == 0
    text = service._unit_path().read_text()
    assert "@" not in text.replace("vtt.atjoseph.com", "")
    assert (f"exec /usr/local/bin/cloudflared tunnel --config {cfg.CF_CONFIG} "
            f"run {cfg.TUNNEL_NAME} >> {cfg.REPO_ROOT}/.run/cloudflared.log") in text
    assert f"ConditionPathExists=!{cfg.REPO_ROOT}/.state/tunnel.disabled" in text
    assert [a[0] for a in sd.calls if a[0] != "show"] == ["daemon-reload", "enable"]
    assert sd.did("start") == [] and sd.did("stop") == []
    assert "installed and enabled" in capsys.readouterr().out


def test_unit_install_says_how_to_hand_over_a_running_tunnel(monkeypatch, capsys):
    monkeypatch.setattr(service, "_systemctl", FakeSystemd())
    monkeypatch.setattr(service.host, "require_primary", lambda *a, **k: None)
    monkeypatch.setattr(service.host, "is_mac", lambda: False)
    monkeypatch.setattr(service.shutil, "which", lambda name: "/usr/local/bin/" + name)
    monkeypatch.setattr(service, "_tunnel_processes", lambda: [452965])
    assert service.tunnel_unit_install() == 0
    assert "was not started by the unit" in capsys.readouterr().out


def test_unit_install_refuses_on_the_alt_and_without_systemd(monkeypatch, capsys):
    def not_primary(*a, **k):
        raise service.host.NotPrimary("this host is the alt")
    monkeypatch.setattr(service.host, "require_primary", not_primary)
    assert service.tunnel_unit_install() == 1
    monkeypatch.setattr(service.host, "require_primary", lambda *a, **k: None)
    monkeypatch.setattr(service.shutil, "which", lambda name: None)
    assert service.tunnel_unit_install() == 1
    assert not service._unit_path().exists()
    assert "no systemd on this host" in capsys.readouterr().out


def test_unit_remove_stops_disables_and_deletes(monkeypatch, capsys):
    sd = FakeSystemd(pid=60001)
    monkeypatch.setattr(service, "_systemctl", sd)
    assert service.tunnel_unit_remove() == 0          # nothing installed
    service._unit_path().parent.mkdir(parents=True)
    service._unit_path().write_text("[Unit]\n")
    assert service.tunnel_unit_remove() == 0
    assert ("disable", "--now", "foundry-tunnel.service") in sd.calls
    assert not service._unit_path().exists()


# ── Cloudflare's own connector count ──────────────────────────────────────────

INFO = """\
NAME:     ardenhaven
ID:       3f188349-3bfb-4674-bde1-b4eb61b872f0
CREATED:  2026-08-01 00:00:00 +0000 UTC

CONNECTOR ID                         CREATED              ARCHITECTURE VERSION   ORIGIN IP   EDGE
0b5659e2-e91c-454d-a33c-d3d44c7b35bf 2026-11-21T17:13:31Z linux_amd64  2026.11.1 203.0.113.9 2xiad05, 2xiad17
21521078-2a52-41f0-bfae-ba2cbda8f4dd 2026-11-20T17:40:30Z linux_amd64  2026.11.1 203.0.113.9 2xiad02, 2xiad16
"""


@pytest.fixture
def asks_cloudflare(monkeypatch, tmp_path):
    cert = tmp_path / "cert.pem"
    cert.write_text("x")
    monkeypatch.setattr(service, "CF_CERT", cert)
    monkeypatch.setattr(service.host, "role", lambda: "primary")
    monkeypatch.setattr(service.shutil, "which", lambda name: "/usr/local/bin/" + name)


def test_tunnel_connectors_counts_the_rows(asks_cloudflare, monkeypatch):
    seen = []

    def run(argv, **kw):
        seen.append((argv, kw.get("timeout")))
        return subprocess.CompletedProcess(argv, 0, stdout=INFO, stderr="")
    monkeypatch.setattr(service.subprocess, "run", run)
    assert REAL_CONNECTORS() == 2                 # the ID: line and the header are not rows
    assert seen == [(["cloudflared", "tunnel", "info", "ardenhaven"], 10)]


@pytest.mark.parametrize("why", ["alt", "no-cert", "rc", "timeout"])
def test_tunnel_connectors_is_none_when_it_cannot_ask(asks_cloudflare, monkeypatch, why):
    def run(argv, **kw):
        if why == "timeout":
            raise subprocess.TimeoutExpired(argv, 10)
        return subprocess.CompletedProcess(argv, 1 if why == "rc" else 0, stdout=INFO, stderr="")
    monkeypatch.setattr(service.subprocess, "run", run)
    if why == "alt":
        monkeypatch.setattr(service.host, "role", lambda: "alt")
    if why == "no-cert":
        service.CF_CERT.unlink()
    assert REAL_CONNECTORS() is None


def test_status_warns_when_cloudflare_lists_more_than_one_connector(monkeypatch, capsys):
    monkeypatch.setattr(service, "foundry_is_up", lambda *a: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: 452965)
    monkeypatch.setattr(service, "_tunnel_connectors", lambda: 3)
    monkeypatch.setattr(service, "_probe", lambda *a: (302, "https://x/cdn-cgi/access/login"))
    assert service.status_report()["tunnel"]["connectors"] == 3
    assert service.status() == 0
    assert "Cloudflare lists 3 connectors for 'ardenhaven' (want 1)" in capsys.readouterr().out


def test_status_does_not_ask_cloudflare_while_no_tunnel_runs_here(monkeypatch):
    monkeypatch.setattr(service, "foundry_is_up", lambda *a: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: None)
    monkeypatch.setattr(service, "_tunnel_connectors", lambda: pytest.fail("no need to ask"))
    monkeypatch.setattr(service, "_probe", lambda *a: (0, ""))
    assert service.status_report()["tunnel"]["connectors"] is None


def test_status_names_the_unit(unit, kills, monkeypatch, capsys):
    unit.pid = 60001
    monkeypatch.setattr(service, "foundry_is_up", lambda *a: True)
    monkeypatch.setattr(service, "_probe", lambda *a: (302, "https://x/cdn-cgi/access/login"))
    assert service.status() == 0
    assert "UP   (pid 60001, foundry-tunnel.service," in capsys.readouterr().out
