"""EC-1: rollback artefacts are ordered by natural sort, not by plain string.

``stash_system`` promises to "copy the installed system aside before anything can
overwrite it" and returns the copy. With a plain string sort, ``dnd5e-6.0.10`` sorts
before ``dnd5e-6.0.9``, so on a x.y.9 -> x.y.10 crossing the prune unlinked the copy it
had just written, and the restore fallback and ``newest_core_bundle`` picked the older
artefact. All four call sites now share one natural-sort key on the full filename.
"""

from __future__ import annotations

import tarfile

from scripts.foundry.update import recover


def _tar(path, member_dir, marker):
    member_dir.mkdir(parents=True, exist_ok=True)
    (member_dir / marker).write_text(marker)
    with tarfile.open(path, "w:gz") as tar:
        tar.add(member_dir, arcname="dnd5e")


def _names(*names):
    return sorted(names, key=recover._natural_key)


# ── The key itself (also M7's missing version-maths pins) ───────────────────

def test_ec1_patch_digit_rollover_sorts_after():
    assert _names("dnd5e-6.0.10.tar.gz", "dnd5e-6.0.9.tar.gz") == [
        "dnd5e-6.0.9.tar.gz", "dnd5e-6.0.10.tar.gz"]


def test_ec1_core_build_rollover_sorts_after():
    assert _names("app-14.100.tar.gz", "app-14.99.tar.gz") == [
        "app-14.99.tar.gz", "app-14.100.tar.gz"]


def test_ec1_prerelease_sorts_below_its_release():
    assert _names("dnd5e-6.1.0.tar.gz", "dnd5e-6.1.0-beta.1.tar.gz",
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
    monkeypatch.setattr(recover, "FOUNDRY_DATA", data)

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
    monkeypatch.setattr(recover, "FOUNDRY_DATA", data)
    rec = recover.Recovery(kind="system", target="dnd5e")

    recover._restore_system_from_aside("dnd5e", "6.0.11", rec)

    assert rec.steps == ["restored dnd5e from dnd5e-6.0.10.tar.gz"]
    assert (data / "Data/systems/dnd5e/v10").exists()


def test_ec1_newest_core_bundle_orders_numerically(tmp_path, monkeypatch):
    for v in ("14.99", "14.100"):
        (tmp_path / f"app-{v}.tar.gz").write_bytes(b"x")
    monkeypatch.setattr(recover, "CORE_ROLLBACK_DIR", tmp_path)

    assert recover.newest_core_bundle().name == "app-14.100.tar.gz"
