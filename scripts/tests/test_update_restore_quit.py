"""ROB-5: ``restore_service``'s stop-Foundry branch must not raise.

When the run found Foundry stopped, ``restore_service`` puts it back that way with
``admin.quit_app()``. That call was the only unguarded one in the function: a wedged
Electron makes it raise ``TimeoutError`` after its escalation, which escaped
``restore_service``, skipped the tunnel restore and the entry-state clear, and — from
``_finish`` — skipped the status write, the report and the notification. It is now
guarded like its siblings and recorded as ``could not stop Foundry: <exc>``.
"""

from __future__ import annotations

import pytest

from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update import apply, recover, state


@pytest.fixture
def state_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(state, "STATE_DIR", tmp_path)
    monkeypatch.setattr(state, "ENTRY_PATH", tmp_path / "vtt-update.entry")
    return state


def test_rob5_quit_timeout_is_recorded_and_restore_finishes(state_dir, monkeypatch):
    entry = state_dir.EntryState(foundry_up=False, tunnel_up=True, active_world=None)
    entry.write()
    tunnel_calls: list[str] = []

    def wedged_quit(*a, **k):
        raise TimeoutError("Foundry still running after force stop")

    monkeypatch.setattr(apply, "_admin_client", lambda: object())
    monkeypatch.setattr(admin_mod, "quit_app", wedged_quit)
    monkeypatch.setattr(recover, "tunnel_running", lambda root: False)
    monkeypatch.setattr(recover, "tunnel_up", lambda root: tunnel_calls.append("up") or True)

    messages: list[str] = []
    apply.restore_service(entry, messages)

    assert messages == ["could not stop Foundry: Foundry still running after force stop"]
    assert tunnel_calls == ["up"]                     # the tunnel step still ran
    assert not state_dir.ENTRY_PATH.exists()          # and the entry state was cleared
