"""ROB-10: a failed repair after a crashed run must be said, not swallowed.

``apply._repair_from`` puts service back the way the previous (crashed) run found it.
A relaunch that raised was swallowed by a bare ``except: pass`` and a failed
``tunnel_up`` was ignored, so the run reported nothing while the table stayed down.
Both now park a note in ``_WINDOW_NOTES``, which the run drains into its messages.
"""

from __future__ import annotations

import pytest

from scripts.foundry.update import apply, state

STALE = state.EntryState(foundry_up=True, tunnel_up=True, active_world="pentaryn",
                         recorded=1.0)


class _BrokenFA:
    def world_active(self):
        return False

    def launch_world(self, world):
        raise RuntimeError("launch refused")

    def wait_for_world(self, world, timeout):  # pragma: no cover - never reached
        raise AssertionError("unreachable")


class _OkFA:
    def world_active(self):
        return True


@pytest.fixture(autouse=True)
def _clean_notes():
    apply.drain_window_notes()
    yield
    apply.drain_window_notes()


@pytest.fixture
def repair_env(monkeypatch):
    monkeypatch.setattr(apply.admin_mod, "port_open", lambda: True)
    monkeypatch.setattr(apply.admin_mod, "start_app", lambda: None)
    monkeypatch.setattr(apply.recover, "tunnel_running", lambda root: False)
    return monkeypatch


def test_rob10_failed_relaunch_is_noted(repair_env):
    repair_env.setattr(apply, "_admin_client", _BrokenFA)
    repair_env.setattr(apply.recover, "tunnel_up", lambda root: True)
    apply._repair_from(STALE)
    assert apply.drain_window_notes() == [
        "repair after the previous crashed run: could not relaunch pentaryn: "
        "launch refused"]


def test_rob10_failed_tunnel_up_is_noted(repair_env):
    repair_env.setattr(apply, "_admin_client", _OkFA)
    repair_env.setattr(apply.recover, "tunnel_up", lambda root: False)
    apply._repair_from(STALE)
    assert apply.drain_window_notes() == [
        "repair after the previous crashed run: could not bring the tunnel back up"]


def test_rob10_clean_repair_says_nothing(repair_env):
    repair_env.setattr(apply, "_admin_client", _OkFA)
    repair_env.setattr(apply.recover, "tunnel_up", lambda root: True)
    apply._repair_from(STALE)
    assert apply.drain_window_notes() == []


def test_rob10_note_survives_a_gate_that_then_aborts(monkeypatch, tmp_path):
    """Repair failed, then the connected-users check refused: the note still lands."""
    monkeypatch.setattr(state, "STATE_DIR", tmp_path)
    monkeypatch.setattr(state, "STATUS_PATH", tmp_path / "vtt-update.status")
    monkeypatch.setattr(state, "ENTRY_PATH", tmp_path / "vtt-update.entry")
    monkeypatch.setattr(apply, "FoundryAdmin", lambda admin_password=None: object())
    monkeypatch.setattr(apply.admin_pw, "foundry_admin_password", lambda required=False: "x")
    monkeypatch.setattr(apply.risk, "load_policy", lambda: {})
    note = "repair after the previous crashed run: could not relaunch pentaryn: boom"

    def _gate(fa, policy, force=False):
        apply._WINDOW_NOTES.append(note)
        raise apply.Aborted("1 user(s) connected to 'pentaryn' — not touching a live table")
    monkeypatch.setattr(apply, "gate", _gate)

    result = apply._run_locked(apply.RunResult(run_id="t"), "t",
                               dry=True, force=False, skip_llm=True)
    assert result.outcome == "skipped"
    assert note in result.messages
