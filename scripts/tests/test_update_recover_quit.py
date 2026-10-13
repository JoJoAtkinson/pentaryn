"""ROB-7: ``recover_system`` / ``recover_core`` must not raise on a quit or start timeout.

Both called ``admin.quit_app()`` before their ``try`` and ``admin.start_app()`` after it
(and, in ``recover_system``, again inside the ``except``). Each raises ``Timeout`` when
Electron is wedged or never answers, which escaped the recovery with no ``Recovery``
record — so ``apply`` lost the steps already taken and the report could not say what was
put back. Every quit/start now sits inside a guard: a failure sets ``rec.error`` and the
``Recovery`` comes back ``ok=False`` with the steps taken so far.
"""

from __future__ import annotations

from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update import recover
from scripts.foundry.update.admin import Timeout


def _wedged(*a, **k):
    raise Timeout("Foundry would not quit")


def _no_answer(*a, **k):
    raise Timeout("Foundry did not answer within 120s")


def _fake_restores(monkeypatch, calls):
    monkeypatch.setattr(recover, "_restore_world_tar",
                        lambda snap, rec: calls.append("world")
                        or rec.steps.append("restored worlds"))
    monkeypatch.setattr(recover, "_restore_system_from_aside",
                        lambda sid, ver, rec: calls.append("system")
                        or rec.steps.append("restored system"))


# ── recover_system ──────────────────────────────────────────────────────────

def test_rob7_system_quit_timeout_returns_a_failed_recovery(monkeypatch):
    calls: list[str] = []
    _fake_restores(monkeypatch, calls)
    monkeypatch.setattr(admin_mod, "quit_app", _wedged)
    monkeypatch.setattr(admin_mod, "start_app", lambda *a, **k: None)

    rec = recover.recover_system(object(), "dnd5e", "5.1.0", None)

    assert rec.ok is False
    assert "would not quit" in rec.error
    assert calls == []           # a live LevelDB is never replaced


def test_rob7_system_relaunch_timeout_keeps_the_steps(monkeypatch):
    calls: list[str] = []
    _fake_restores(monkeypatch, calls)
    monkeypatch.setattr(admin_mod, "quit_app", lambda *a, **k: None)
    monkeypatch.setattr(admin_mod, "start_app", _no_answer)

    rec = recover.recover_system(object(), "dnd5e", "5.1.0", None)

    assert rec.ok is False
    assert "did not answer" in rec.error
    assert calls == ["world", "system"]
    assert "restored world" in " ".join(rec.steps)


def test_rob7_system_restore_failure_then_relaunch_timeout(monkeypatch):
    def broken_world(snap, rec):
        raise RuntimeError("no world snapshot to restore from")

    monkeypatch.setattr(recover, "_restore_world_tar", broken_world)
    monkeypatch.setattr(admin_mod, "quit_app", lambda *a, **k: None)
    monkeypatch.setattr(admin_mod, "start_app", _no_answer)

    rec = recover.recover_system(object(), "dnd5e", "5.1.0", None)

    assert rec.ok is False
    assert "no world snapshot" in rec.error   # the cause is not overwritten
    assert "did not answer" in rec.error      # and the failed relaunch is recorded


# ── recover_core ────────────────────────────────────────────────────────────

def test_rob7_core_quit_timeout_returns_a_failed_recovery(monkeypatch, tmp_path):
    bundle = tmp_path / "app-14.360.tar.gz"
    bundle.write_bytes(b"not touched")
    calls: list[str] = []
    _fake_restores(monkeypatch, calls)
    monkeypatch.setattr(recover, "APP_PAYLOAD", tmp_path / "app")
    monkeypatch.setattr(admin_mod, "quit_app", _wedged)
    monkeypatch.setattr(admin_mod, "start_app", lambda *a, **k: None)

    rec = recover.recover_core("14.360", None, bundle=bundle)

    assert rec.ok is False
    assert "would not quit" in rec.error
    assert calls == []


def test_rob7_core_relaunch_timeout_keeps_the_steps(monkeypatch, tmp_path):
    import tarfile

    src = tmp_path / "src" / "app"
    src.mkdir(parents=True)
    (src / "main.mjs").write_text("// old build")
    bundle = tmp_path / "app-14.360.tar.gz"
    with tarfile.open(bundle, "w:gz") as tar:
        tar.add(src, arcname="app")
    calls: list[str] = []
    _fake_restores(monkeypatch, calls)
    monkeypatch.setattr(recover, "APP_PAYLOAD", tmp_path / "live" / "app")
    monkeypatch.setattr(admin_mod, "quit_app", lambda *a, **k: None)
    monkeypatch.setattr(admin_mod, "start_app", _no_answer)

    rec = recover.recover_core("14.360", None, bundle=bundle)

    assert rec.ok is False
    assert "did not answer" in rec.error
    assert calls == ["world"]
    assert any("restored the app payload" in s for s in rec.steps)
