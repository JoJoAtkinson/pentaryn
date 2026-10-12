"""Rollback artefacts are ordered by version, not by string.

``stash_system`` promises to "copy the installed system aside before anything can
overwrite it" and returns the copy. With a plain string sort, ``dnd5e-6.0.10`` sorts
before ``dnd5e-6.0.9``, so on a x.y.9 -> x.y.10 crossing the prune unlinked the copy it
had just written, and the restore fallback and ``newest_core_bundle`` picked the older
artefact.
"""

from __future__ import annotations

import tarfile

import pytest

from scripts.foundry.update import recover


def _tar(path, member_dir, marker):
    member_dir.mkdir(parents=True, exist_ok=True)
    (member_dir / marker).write_text(marker)
    with tarfile.open(path, "w:gz") as tar:
        tar.add(member_dir, arcname="dnd5e")


def test_stash_system_keeps_the_copy_it_just_wrote_across_a_digit_rollover(tmp_path, monkeypatch):
    aside = tmp_path / "aside"
    data = tmp_path / "data"
    system = data / "Data/systems/dnd5e"
    system.mkdir(parents=True)
    (system / "system.json").write_text('{"id": "dnd5e"}')
    aside.mkdir()
    for v in ("6.0.7", "6.0.8", "6.0.9"):
        (aside / f"dnd5e-{v}.tar.gz").write_bytes(b"old")
    monkeypatch.setattr(recover, "SYSTEM_ASIDE_DIR", aside)
    monkeypatch.setattr(recover, "FOUNDRY_DATA", data)

    out = recover.stash_system("dnd5e", "6.0.10")

    assert out.exists()
    assert not (aside / "dnd5e-6.0.7.tar.gz").exists()
    assert (aside / "dnd5e-6.0.8.tar.gz").exists()
    assert (aside / "dnd5e-6.0.9.tar.gz").exists()


def test_restore_fallback_takes_the_highest_version(tmp_path, monkeypatch):
    aside = tmp_path / "aside"
    data = tmp_path / "data"
    (data / "Data/systems").mkdir(parents=True)
    aside.mkdir()
    _tar(aside / "dnd5e-6.0.9.tar.gz", tmp_path / "src9" / "dnd5e", "v9")
    _tar(aside / "dnd5e-6.0.10.tar.gz", tmp_path / "src10" / "dnd5e", "v10")
    monkeypatch.setattr(recover, "SYSTEM_ASIDE_DIR", aside)
    monkeypatch.setattr(recover, "FOUNDRY_DATA", data)
    rec = recover.Recovery(kind="system", target="dnd5e")

    recover._restore_system_from_aside("dnd5e", "6.0.11", rec)

    assert rec.steps == ["restored dnd5e from dnd5e-6.0.10.tar.gz"]
    assert (data / "Data/systems/dnd5e/v10").exists()


def test_newest_core_bundle_orders_numerically(tmp_path, monkeypatch):
    for v in ("14.99", "14.100"):
        (tmp_path / f"app-{v}.tar.gz").write_bytes(b"x")
    monkeypatch.setattr(recover, "CORE_ROLLBACK_DIR", tmp_path)

    assert recover.newest_core_bundle().name == "app-14.100.tar.gz"


# An interrupted stash must not leave a truncated archive at the final path: the next run
# trusts any file already there (``if out.exists(): return out``) and recover_* rmtree the
# live tree before extracting it.

def _fail_add(monkeypatch):
    def boom(self, *a, **k):
        raise OSError(28, "No space left on device")
    monkeypatch.setattr(tarfile.TarFile, "add", boom)


def test_interrupted_stash_system_leaves_no_archive(tmp_path, monkeypatch):
    aside = tmp_path / "aside"
    data = tmp_path / "data"
    system = data / "Data/systems/dnd5e"
    system.mkdir(parents=True)
    (system / "system.json").write_text('{"id": "dnd5e"}')
    monkeypatch.setattr(recover, "SYSTEM_ASIDE_DIR", aside)
    monkeypatch.setattr(recover, "FOUNDRY_DATA", data)

    with monkeypatch.context() as m:
        _fail_add(m)
        with pytest.raises(OSError):
            recover.stash_system("dnd5e", "6.0.6")
    assert sorted(p.name for p in aside.iterdir()) == []

    out = recover.stash_system("dnd5e", "6.0.6")
    assert out == aside / "dnd5e-6.0.6.tar.gz"
    with tarfile.open(out) as tar:
        assert "dnd5e" in tar.getnames()
    assert sorted(p.name for p in aside.iterdir()) == ["dnd5e-6.0.6.tar.gz"]


def test_interrupted_stash_core_leaves_no_archive(tmp_path, monkeypatch):
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
