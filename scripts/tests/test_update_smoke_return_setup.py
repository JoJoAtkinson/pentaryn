"""ROB-6: ``_return_to_setup``'s restart fallback must not raise out of ``run_all``.

When the graceful deactivate fails, ``_return_to_setup`` restarts the app with
``admin.quit_app()`` / ``admin.start_app()``. Both raise ``Timeout`` when Electron is
wedged, and that escaped ``run_all`` — so ``apply`` never reached its recover phase and
the untested packages stayed live. The world it was about to smoke is now recorded as a
not-ok result (``could not return to setup: <exc>``), the remaining worlds still run, and
the broken result is what sends ``apply`` into recovery.
"""

from __future__ import annotations

from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update import smoke
from scripts.foundry.update.admin import Timeout


class _StuckAdmin:
    """A world is live and the graceful deactivate is refused."""

    def world_active(self):
        return True

    def deactivate_world(self):
        return False

    def reauthenticate(self):
        pass


def test_rob6_restart_timeout_is_a_failed_world_not_a_crash(monkeypatch):
    def wedged_quit(*a, **k):
        raise Timeout("Foundry still running after force stop")

    smoked: list[str] = []
    monkeypatch.setattr(admin_mod, "quit_app", wedged_quit)
    monkeypatch.setattr(admin_mod, "start_app", lambda *a, **k: None)
    monkeypatch.setattr(admin_mod, "error_log_offset", lambda day=None: 0)
    monkeypatch.setattr(
        smoke, "_smoke_one",
        lambda fa, world, **k: smoked.append(world["id"]) or smoke.WorldResult(world=world["id"], ok=True))

    results = smoke.run_all(_StuckAdmin(), [{"id": "alpha"}, {"id": "beta"}],
                            policy={}, touched=set(), error_offset=0)

    assert [r.world for r in results] == ["alpha", "beta"]
    assert all(not r.ok for r in results)
    assert results[0].errors == [
        "could not return to setup: Foundry still running after force stop"]
    assert smoked == []          # a world that could not be reached is not smoked


def test_rob6_start_failure_is_recorded_too(monkeypatch):
    def broken_start(*a, **k):
        raise RuntimeError("no such app")

    monkeypatch.setattr(admin_mod, "quit_app", lambda *a, **k: None)
    monkeypatch.setattr(admin_mod, "start_app", broken_start)
    monkeypatch.setattr(admin_mod, "error_log_offset", lambda day=None: 0)

    results = smoke.run_all(_StuckAdmin(), [{"id": "alpha"}],
                            policy={}, touched=set(), error_offset=0)

    assert len(results) == 1 and not results[0].ok
    assert results[0].errors == ["could not return to setup: no such app"]
