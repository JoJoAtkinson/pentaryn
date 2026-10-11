"""Role gating (design §8): only the tunnel and the updater are primary-only.

`mac` is the primary, `boss` the alt. Backup, restore, assets, the boot choice and
foundry-up run on either — the boot tests exercise those as `boss`.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from scripts.foundry.ops import service


@pytest.fixture
def alt(monkeypatch):
    monkeypatch.setenv("PENTARYN_HOST", "boss")
    monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "mac")


@pytest.fixture
def no_processes(monkeypatch):
    def boom(*a, **kw):
        raise AssertionError(f"no process may be started on the alt: {a}")
    monkeypatch.setattr(service.subprocess, "run", boom)
    monkeypatch.setattr(service.subprocess, "Popen", boom)


def test_tunnel_up_on_the_alt_is_a_loud_no_op(alt, no_processes, capsys):
    assert service.tunnel_up() == 0
    out = capsys.readouterr().out
    assert "tunnel NOT started" in out
    assert "the tunnel runs only on the primary host (mac); this is boss (alt)" in out
    assert "PENTARYN_ROLE_OVERRIDE=primary make tunnel-up" in out


def test_tunnel_up_on_the_alt_with_the_override_proceeds(alt, monkeypatch, capsys):
    monkeypatch.setenv("PENTARYN_ROLE_OVERRIDE", "primary")
    monkeypatch.setattr(service, "_tunnel_pid", lambda: 4242)
    assert service.tunnel_up() == 0
    out = capsys.readouterr().out
    assert "PENTARYN_ROLE_OVERRIDE=primary — running the tunnel from the alt host boss" in out
    assert "tunnel already up (pid 4242)" in out


def test_tunnel_up_on_the_primary_is_not_gated(monkeypatch, capsys):
    monkeypatch.setattr(service.host, "system", lambda: "Darwin")
    monkeypatch.setenv("PENTARYN_HOST", "mac")
    monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "mac")
    monkeypatch.setattr(service, "_tunnel_pid", lambda: 7)
    assert service.tunnel_up() == 0
    assert "tunnel already up (pid 7)" in capsys.readouterr().out


def test_updater_gate_aborts_on_the_alt(alt):
    from scripts.foundry.update import apply
    with pytest.raises(apply.Aborted, match="the auto-updater runs only on the primary host"):
        apply.gate(fa=None, policy={}, force=True)   # --force does not override the role


def test_updater_gate_passes_with_the_override(alt, monkeypatch):
    from scripts.foundry.update import apply, state
    monkeypatch.setenv("PENTARYN_ROLE_OVERRIDE", "primary")
    monkeypatch.setattr(state, "is_paused", lambda: True)
    with pytest.raises(apply.Aborted, match="paused"):  # got past the role check
        apply.gate(fa=None, policy={}, force=False)


def test_the_updater_run_never_runs_the_boot_choice(monkeypatch):
    import os
    from scripts.foundry.update import apply, state

    class HeldLock:
        def acquire(self):
            raise state.Locked("held by another run")

    monkeypatch.setattr(state, "Lock", HeldLock)
    assert apply.run(dry=True).outcome == "skipped"   # returns before touching anything
    assert os.environ.get("PENTARYN_BOOT_DONE") == "skip"


def test_update_wrapper_checks_the_role_before_the_run():
    script = (Path(__file__).resolve().parents[2] / "automation/bin/vtt-update.sh").read_text()
    gate = script.index('-m scripts.foundry.host require-primary "the auto-updater"')
    run = script.index("-m scripts.foundry.update.cli run")
    assert gate < run
    assert 'if [ "$GATE_RC" -eq 3 ]; then' in script[gate:run]
    assert "exit 0" in script[gate:run]
