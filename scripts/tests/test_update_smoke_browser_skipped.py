"""EC-8: a skipped browser check is "not run", not "the world is broken".

``run_browser`` returns ``{"ok": True, "skipped": "smoke.mjs not installed", ...}`` when
the browser harness is absent. That payload has no ``gameReady``, so ``_smoke_one``
scored it ``client_ok=False`` with "game.ready never became true" — a healthy world
failed the smoke test and sent the update into recovery. It also wrote an empty
fingerprint as the world's baseline, as if the browser had seen a clean load.

A skipped payload is now handled exactly like ``browser: false`` in update-policy.yml:
``client_ok`` stays ``None``, the skip reason becomes a note, ``ok`` is the server
verdict, and the baseline is left alone.
"""

from __future__ import annotations

from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update import smoke
from scripts.foundry.update.admin import Status


class _HealthyAdmin:
    def launch_world(self, world):
        pass

    def wait_for_world(self, world, timeout=0):
        return Status(active=True, version="14.369", world=world,
                      system="dnd5e", system_version="5.1.0")


def _smoke(monkeypatch, tmp_path, *, error_log=""):
    monkeypatch.setattr(smoke, "BASELINE_PATH", tmp_path / "baseline.json")
    monkeypatch.setattr(admin_mod, "error_log_since", lambda offset, day=None: error_log)
    monkeypatch.setattr(smoke, "run_browser", lambda fa, world, **k: {
        "ok": True, "skipped": "smoke.mjs not installed", "errors": []})
    world = {"id": "alpha", "system_version": "5.1.0", "core_version": "14.369"}
    return smoke._smoke_one(_HealthyAdmin(), world, policy={}, touched=set(),
                            error_offset=0, log_day=None)


def test_ec8_skipped_browser_check_scores_on_the_server(monkeypatch, tmp_path):
    result = _smoke(monkeypatch, tmp_path)

    assert result.ok is True
    assert result.server_ok is True
    assert result.client_ok is None
    assert result.errors == []
    assert any("smoke.mjs not installed" in n for n in result.notes)
    assert not (tmp_path / "baseline.json").exists()   # nothing seen, nothing recorded


def test_ec8_skipped_browser_check_still_fails_a_broken_server(monkeypatch, tmp_path):
    result = _smoke(monkeypatch, tmp_path, error_log="boom")

    assert result.ok is False
    assert result.server_ok is False
    assert result.client_ok is None
