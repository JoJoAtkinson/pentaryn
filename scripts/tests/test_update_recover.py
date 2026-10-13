"""EC-1: rollback artefacts are ordered by natural sort, not by plain string.

``stash_system`` promises to "copy the installed system aside before anything can
overwrite it" and returns the copy. With a plain string sort, ``dnd5e-6.0.10`` sorts
before ``dnd5e-6.0.9``, so on a x.y.9 -> x.y.10 crossing the prune unlinked the copy it
had just written, and the restore fallback and ``newest_core_bundle`` picked the older
artefact. All four call sites now share one natural-sort key on the full filename.
"""

from __future__ import annotations

import tarfile

import pytest

from scripts.foundry.update import admin, recover


def _tar(path, member_dir, marker):
    member_dir.mkdir(parents=True, exist_ok=True)
    (member_dir / marker).write_text(marker)
    with tarfile.open(path, "w:gz") as tar:
        tar.add(member_dir, arcname="dnd5e")


def _natural_sorted(*names):
    return sorted(names, key=recover._natural_key)


# ── The key itself (also M7's missing version-maths pins) ───────────────────

def test_ec1_patch_digit_rollover_sorts_after():
    assert _natural_sorted("dnd5e-6.0.10.tar.gz", "dnd5e-6.0.9.tar.gz") == [
        "dnd5e-6.0.9.tar.gz", "dnd5e-6.0.10.tar.gz"]


def test_ec1_core_build_rollover_sorts_after():
    assert _natural_sorted("app-14.100.tar.gz", "app-14.99.tar.gz") == [
        "app-14.99.tar.gz", "app-14.100.tar.gz"]


def test_ec1_prerelease_sorts_below_its_release():
    assert _natural_sorted("dnd5e-6.1.0.tar.gz", "dnd5e-6.1.0-beta.1.tar.gz",
                  "dnd5e-6.0.10.tar.gz") == [
        "dnd5e-6.0.10.tar.gz", "dnd5e-6.1.0-beta.1.tar.gz", "dnd5e-6.1.0.tar.gz"]


# ── The four call sites ─────────────────────────────────────────────────────

def test_ec1_stash_system_keeps_the_copy_it_just_wrote(tmp_path, monkeypatch):
    aside = tmp_path / "aside"
    data = tmp_path / "data"
    system = data / "Data/systems/dnd5e"
    system.mkdir(parents=True)
    (system / "system.json").write_text('{"id": "dnd5e"}')
    aside.mkdir()
    for v in ("6.0.7", "6.0.8", "6.0.9"):
        (aside / f"dnd5e-{v}.tar.gz").write_bytes(b"old")
    monkeypatch.setattr(recover, "SYSTEM_ASIDE_DIR", aside)
    monkeypatch.setattr(admin, "SYSTEMS_DIR", data / "Data/systems")

    out = recover.stash_system("dnd5e", "6.0.10")

    assert out.exists()
    assert not (aside / "dnd5e-6.0.7.tar.gz").exists()
    assert (aside / "dnd5e-6.0.8.tar.gz").exists()
    assert (aside / "dnd5e-6.0.9.tar.gz").exists()


def test_ec1_stash_core_keeps_the_copy_it_just_wrote(tmp_path, monkeypatch):
    rollback = tmp_path / "rollback"
    payload = tmp_path / "app" / "resources" / "app"
    payload.mkdir(parents=True)
    (payload / "main.mjs").write_text("// core")
    rollback.mkdir()
    for v in ("14.98", "14.99"):
        (rollback / f"app-{v}.tar.gz").write_bytes(b"old")
    monkeypatch.setattr(recover, "CORE_ROLLBACK_DIR", rollback)
    monkeypatch.setattr(recover, "APP_PAYLOAD", payload)

    out = recover.stash_core("14.100")

    assert out.exists()
    assert not (rollback / "app-14.98.tar.gz").exists()
    assert (rollback / "app-14.99.tar.gz").exists()


def test_ec1_restore_fallback_takes_the_highest_version(tmp_path, monkeypatch):
    aside = tmp_path / "aside"
    data = tmp_path / "data"
    (data / "Data/systems").mkdir(parents=True)
    aside.mkdir()
    _tar(aside / "dnd5e-6.0.9.tar.gz", tmp_path / "src9" / "dnd5e", "v9")
    _tar(aside / "dnd5e-6.0.10.tar.gz", tmp_path / "src10" / "dnd5e", "v10")
    monkeypatch.setattr(recover, "SYSTEM_ASIDE_DIR", aside)
    monkeypatch.setattr(admin, "SYSTEMS_DIR", data / "Data/systems")
    rec = recover.Recovery(kind="system", target="dnd5e")

    recover._restore_system_from_aside("dnd5e", "6.0.11", rec)

    assert rec.steps == ["restored dnd5e from dnd5e-6.0.10.tar.gz"]
    assert (data / "Data/systems/dnd5e/v10").exists()


def test_ec1_newest_core_bundle_orders_numerically(tmp_path, monkeypatch):
    for v in ("14.99", "14.100"):
        (tmp_path / f"app-{v}.tar.gz").write_bytes(b"x")
    monkeypatch.setattr(recover, "CORE_ROLLBACK_DIR", tmp_path)

    assert recover.newest_core_bundle().name == "app-14.100.tar.gz"


# ── ROB-8: an interrupted stash leaves nothing at the final path ────────────
# The next run trusts any file already there (``if out.exists(): return out``) and
# recover_* rmtree the live tree before extracting it, so a truncated archive at the
# final path is a rollback that destroys the install it was meant to save.

def _fail_add(monkeypatch):
    def boom(self, *a, **k):
        raise OSError(28, "No space left on device")
    monkeypatch.setattr(tarfile.TarFile, "add", boom)


def test_rob8_interrupted_stash_system_leaves_no_archive(tmp_path, monkeypatch):
    aside = tmp_path / "aside"
    data = tmp_path / "data"
    system = data / "Data/systems/dnd5e"
    system.mkdir(parents=True)
    (system / "system.json").write_text('{"id": "dnd5e"}')
    monkeypatch.setattr(recover, "SYSTEM_ASIDE_DIR", aside)
    monkeypatch.setattr(admin, "SYSTEMS_DIR", data / "Data/systems")

    with monkeypatch.context() as m:
        _fail_add(m)
        with pytest.raises(OSError):
            recover.stash_system("dnd5e", "6.0.6")
    assert sorted(p.name for p in aside.iterdir()) == []

    out = recover.stash_system("dnd5e", "6.0.6")
    assert out == aside / "dnd5e-6.0.6.tar.gz"
    with tarfile.open(out) as tar:
        assert "dnd5e/system.json" in tar.getnames()
    assert sorted(p.name for p in aside.iterdir()) == ["dnd5e-6.0.6.tar.gz"]


def test_rob8_interrupted_stash_core_leaves_no_archive(tmp_path, monkeypatch):
    rollback = tmp_path / "rollback"
    payload = tmp_path / "app" / "resources" / "app"
    payload.mkdir(parents=True)
    (payload / "main.mjs").write_text("// core")
    monkeypatch.setattr(recover, "CORE_ROLLBACK_DIR", rollback)
    monkeypatch.setattr(recover, "APP_PAYLOAD", payload)

    with monkeypatch.context() as m:
        _fail_add(m)
        with pytest.raises(OSError):
            recover.stash_core("14.360")
    assert sorted(p.name for p in rollback.iterdir()) == []

    out = recover.stash_core("14.360")
    assert out == rollback / "app-14.360.tar.gz"
    with tarfile.open(out) as tar:
        assert "app/main.mjs" in tar.getnames()
    assert sorted(p.name for p in rollback.iterdir()) == ["app-14.360.tar.gz"]


# ── M14: one systems path — admin.SYSTEMS_DIR, not a hand-built Data/systems ─
# recover rebuilt ``FOUNDRY_DATA / "Data/systems"`` itself while inventory imported
# MODULES_DIR/SYSTEMS_DIR and never used them. Both now lean on admin's constant, read
# at call time, so a relocated or patched SYSTEMS_DIR is the one the rollback touches.

def test_m14_stash_and_restore_use_admin_systems_dir(tmp_path, monkeypatch):
    systems = tmp_path / "elsewhere" / "systems"
    (systems / "dnd5e").mkdir(parents=True)
    (systems / "dnd5e" / "system.json").write_text('{"id": "dnd5e"}')
    aside = tmp_path / "aside"
    monkeypatch.setattr(admin, "SYSTEMS_DIR", systems)
    monkeypatch.setattr(recover, "SYSTEM_ASIDE_DIR", aside)

    out = recover.stash_system("dnd5e", "6.0.6")
    with tarfile.open(out) as tar:
        assert "dnd5e/system.json" in tar.getnames()

    (systems / "dnd5e" / "system.json").unlink()
    recover._restore_system_from_aside("dnd5e", "6.0.6",
                                       recover.Recovery(kind="system", target="dnd5e"))
    assert (systems / "dnd5e" / "system.json").exists()


def test_m14_no_stale_path_copies_in_inventory_or_recover():
    from scripts.foundry.update import inventory

    assert not hasattr(inventory, "MODULES_DIR")
    assert not hasattr(inventory, "SYSTEMS_DIR")
    assert not hasattr(recover, "FOUNDRY_DATA")


# ── M17: the core Recovery's target is 'core', like every other record ──────

def test_m17_recover_core_target_is_core(tmp_path):
    rec = recover.recover_core("13.351", None, bundle=tmp_path / "missing.tar.gz")
    assert rec.kind == "core"
    assert rec.target == "core"
    assert rec.to_json()["target"] == "core"


def test_m17_history_reads_old_and_new_core_targets(tmp_path):
    import json

    from scripts.foundry.update import escalate

    def write(name, target):
        (tmp_path / name).write_text(json.dumps(
            {"recoveries": [{"kind": "core", "target": target}]}), encoding="utf-8")

    write("2026-08-21-old.json", "foundry")      # report history from before M17
    assert escalate.history(tmp_path) == {"core": "rolled_back"}
    write("2026-10-12-new.json", "core")
    assert escalate.history(tmp_path) == {"core": "rolled_back"}
