"""``apply_core`` must bring the server back itself when the build does not.

Foundry's ``Updater.restart()`` (``dist/core/update.mjs``) only respawns on Electron. The
Node build — BOSS, the ``foundryvtt`` user unit — does ``setTimeout(process.exit, 50)``
with ``SETUP.UpdateCompleteManual``: exit 0, which ``Restart=on-failure`` leaves down.
Until 2026-11-20 ``apply_core`` polled ``/api/status`` for 1800 s and reported
"server never came back". It now waits for the port to drop, gives a self-restart a short
grace, and otherwise calls ``admin.start_app()`` — once, and never when the port came back
on its own.

No real clock, port or server here: a fake ``time`` drives a scripted server whose port
and version depend on the fake clock and on whether ``start_app`` was called.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update import apply

OLD, NEW = "14.369", "14.370"
DECISION = {"id": "core", "type": "core", "installed": OLD, "target": NEW}


class Clock:
    """``time.monotonic`` / ``time.sleep`` where sleeping is the only thing that moves."""

    def __init__(self) -> None:
        self.t = 0.0

    def monotonic(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.t += seconds


class Server:
    """A server whose state is a function of the clock.

    ``exit_at``: when the old process exits (None = the install never finishes).
    ``respawn_at``: when a self-restarted new process re-binds (None = Node build: never).
    ``start_app`` brings the new process up after ``boot_seconds``.
    ``new_version_ok``: whether the new process reports the target (False = came back wrong).
    """

    def __init__(self, clock, *, exit_at, respawn_at=None, boot_seconds=10,
                 new_version_ok=True):
        self.clock = clock
        self.exit_at = exit_at
        self.respawn_at = respawn_at
        self.boot_seconds = boot_seconds
        self.new_version_ok = new_version_ok
        self.start_calls: list[float] = []
        self.started_at: float | None = None

    # -- what admin.py would see ---------------------------------------------
    def _new_up(self) -> bool:
        if self.respawn_at is not None and self.clock.t >= self.respawn_at:
            return True
        return self.started_at is not None and self.clock.t >= self.started_at + self.boot_seconds

    def port_open(self, timeout: float = 2.0) -> bool:
        if self.exit_at is None or self.clock.t < self.exit_at:
            return True          # the old process, still installing
        return self._new_up()

    def status(self):
        if not self.port_open():
            raise ConnectionError("connection refused")
        if self.exit_at is None or self.clock.t < self.exit_at:
            return SimpleNamespace(version=OLD)
        return SimpleNamespace(version=NEW if self.new_version_ok else OLD)

    def start_app(self, timeout: float = 120.0) -> None:
        self.start_calls.append(self.clock.t)
        if self.port_open():
            return               # admin.start_app's own guard: never a second instance
        self.started_at = self.clock.t
        self.clock.sleep(self.boot_seconds)   # start_app waits for the port


class FA:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def update(self, action: str, **body) -> dict:
        self.calls.append(action)
        return {}


@pytest.fixture
def rig(monkeypatch):
    def build(**server_kw):
        clock = Clock()
        server = Server(clock, **server_kw)
        monkeypatch.setattr(apply, "time", clock)
        monkeypatch.setattr(admin_mod, "port_open", server.port_open)
        monkeypatch.setattr(admin_mod, "start_app", server.start_app)
        monkeypatch.setattr(apply, "FoundryAdmin", lambda *a, **k: server)
        return clock, server
    return build


def test_node_build_exits_and_the_updater_starts_it_once(rig):
    """(1) The port drops and nothing comes back on its own: ``start_app`` is called
    exactly once and the step succeeds when the started server reports the target."""
    clock, server = rig(exit_at=120)      # a 2-minute download + install
    fa = FA()

    record = apply.apply_core(fa, DECISION)

    assert fa.calls == ["updateDownload"]
    assert "error" not in record
    assert record["restarted"] == "started by updater"
    assert record["from"] == OLD and record["to"] == NEW
    assert len(server.start_calls) == 1
    # It did not jump the gun: start_app came after the grace window, not on the drop.
    assert server.start_calls[0] >= 120 + apply.CORE_RESPAWN_GRACE
    # And nowhere near the old 1800 s wait.
    assert clock.t < 120 + apply.CORE_RESPAWN_GRACE + 60


def test_self_restart_is_recognised_and_not_started_twice(rig):
    """(2) An Electron-style respawn re-binds the port during the grace window:
    ``start_app`` is never called and the record says so."""
    clock, server = rig(exit_at=120, respawn_at=128)
    record = apply.apply_core(FA(), DECISION)

    assert "error" not in record
    assert record["restarted"] == "self"
    assert server.start_calls == []


def test_self_restart_too_fast_to_see_the_port_drop(rig):
    """A respawn inside one poll interval never shows a closed port; the new version on
    ``/api/status`` is what identifies it. Still no ``start_app``."""
    _, server = rig(exit_at=120, respawn_at=121)
    record = apply.apply_core(FA(), DECISION)

    assert "error" not in record
    assert record["restarted"] == "self"
    assert server.start_calls == []


def test_install_that_never_finishes_is_an_error_without_starting_anything(rig):
    """(3) The port never drops: an error record after the install deadline, and no
    ``start_app`` against a server that is still running."""
    clock, server = rig(exit_at=None)
    record = apply.apply_core(FA(), DECISION)

    assert "error" in record
    assert "never left the old build" in record["error"]
    assert "restarted" not in record
    assert server.start_calls == []
    assert clock.t >= apply.CORE_INSTALL_TIMEOUT


def test_started_server_on_the_wrong_version_is_an_error(rig):
    """The started server answers, but not with the target: bounded by
    ``CORE_RESTART_TIMEOUT`` and reported, with how it was restarted."""
    clock, server = rig(exit_at=120, new_version_ok=False)
    record = apply.apply_core(FA(), DECISION)

    assert "error" in record
    assert NEW in record["error"]
    assert record["restarted"] == "started by updater"
    assert len(server.start_calls) == 1
    assert clock.t < 120 + apply.CORE_RESPAWN_GRACE + 10 + apply.CORE_RESTART_TIMEOUT + 10


def test_start_app_failure_is_an_error_record(rig, monkeypatch):
    clock, server = rig(exit_at=120)

    def wedged(*a, **k):
        raise admin_mod.Timeout("Foundry did not answer on :30000 within 120s")

    monkeypatch.setattr(admin_mod, "start_app", wedged)
    record = apply.apply_core(FA(), DECISION)

    assert "could not be started" in record["error"]
    assert "did not answer" in record["error"]
    assert record["restarted"] == "started by updater"


def test_download_failure_returns_before_touching_the_server(rig):
    _, server = rig(exit_at=120)

    class Broken(FA):
        def update(self, action, **body):
            raise RuntimeError("403 from /update")

    record = apply.apply_core(Broken(), DECISION)

    assert record["error"] == "403 from /update"
    assert server.start_calls == []
