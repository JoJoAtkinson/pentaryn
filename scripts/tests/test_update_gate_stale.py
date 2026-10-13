"""EC-7: a leftover entry file must not let the run skip the connected-users check.

The stale-entry branch of ``apply.gate`` repairs service from the crashed run's record
and used to return straight away, so a table that connected after the repair (or was
already playing when the previous run died) was taken down without ``--force``.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from scripts.foundry.update import apply, state

STALE = state.EntryState(foundry_up=True, tunnel_up=True, active_world="pentaryn",
                         recorded=1.0)


class _FA:
    def __init__(self, users):
        self._users = users

    def status(self):
        return SimpleNamespace(active=True, users=self._users, world="pentaryn")


@pytest.fixture
def stale_gate(monkeypatch):
    repaired: list[state.EntryState] = []
    monkeypatch.setattr(apply.host, "require_primary", lambda *a, **k: None)
    monkeypatch.setattr(state, "is_paused", lambda: False)
    monkeypatch.setattr(apply, "_check_window", lambda policy: None)
    monkeypatch.setattr(state.EntryState, "read", staticmethod(lambda: STALE))
    monkeypatch.setattr(apply, "_repair_from", repaired.append)
    monkeypatch.setattr(apply.admin_mod, "port_open", lambda: True)

    def _no_new_entry(self):
        raise AssertionError("a stale entry must be adopted, not overwritten")
    monkeypatch.setattr(state.EntryState, "write", _no_new_entry)
    return repaired


def test_ec7_stale_entry_still_refuses_a_live_table(stale_gate):
    with pytest.raises(apply.Aborted, match="2 user\\(s\\) connected"):
        apply.gate(_FA(users=2), policy={}, force=False)
    assert stale_gate == [STALE]          # repaired first, then refused


def test_ec7_stale_entry_with_force_is_adopted(stale_gate):
    assert apply.gate(_FA(users=2), policy={}, force=True) is STALE


def test_ec7_stale_entry_with_an_empty_table_is_adopted(stale_gate):
    assert apply.gate(_FA(users=0), policy={}, force=False) is STALE
    assert stale_gate == [STALE]
