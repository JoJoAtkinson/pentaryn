"""Shared fixtures for scripts/tests (python-tooling-34).

Two things live here, and only these:

* ``fake_admin`` — a factory for a stand-in ``FoundryAdmin``. Test files used to define
  their own (``_FakeAdmin`` in test_foundry_ops, ``FakeFA`` in test_update_crash, an
  inline ``FA`` in test_update_escalation); they migrate here one file at a time, so a
  shared fake never silently gets more permissive than the test that used it.
* the ``repo`` marker (registered in pyproject.toml) — a test that reads live repo state
  (the real adjustments registry, the real module tree, automation scripts) rather than
  a tmp fixture. ``pytest -m 'not repo'`` is the suite that must pass on a partial
  checkout or a frozen snapshot.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest


@dataclass
class FakeStatus:
    """What ``FoundryAdmin.status()`` reports: is a world active, which, how many users."""

    active: bool
    world: str | None
    users: int = 0


class FakeAdmin:
    """The world-lifecycle half of ``FoundryAdmin`` that ``ops.login`` drives.

    Records what it was asked to do; never touches the network."""

    def __init__(self, status: FakeStatus):
        self._status = status
        self.launched: list[str] = []
        self.deactivated = False

    def status(self) -> FakeStatus:
        return self._status

    def deactivate_world(self) -> bool:
        self.deactivated = True
        return True

    def launch_world(self, world: str) -> None:
        self.launched.append(world)

    def wait_for_world(self, world: str, timeout: float = 0) -> None:
        pass


@pytest.fixture
def fake_admin():
    """``fake_admin(active, world, users=0)`` → a :class:`FakeAdmin` in that state."""

    def make(active: bool, world: str | None, users: int = 0) -> FakeAdmin:
        return FakeAdmin(FakeStatus(active, world, users))

    return make
