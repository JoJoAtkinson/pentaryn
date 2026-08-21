#!/usr/bin/env python3
"""Recovery, by failure class — not by "try the cheapest thing first".

The intuitive design is a ladder: reinstall the old module, and if that does not work
restore a snapshot, and if that does not work restore everything. It is wrong here, and
the reason is worth writing down.

**Launching a world migrates it.** ``world.mjs setup()`` runs ``migrateCore()`` when the
core is newer than the world's stamped ``coreVersion`` and ``migrateSystem()`` when the
system is newer than its ``systemVersion`` — in place, across every document and every
world compendium, before the smoke test gets a chance to say anything. By the time a
system or core update is known to be bad, the world's data has *already* been rewritten
and the new version stamped into world.json.

So putting the old code back does not undo a bad system update. It produces something
worse: a world whose documents are in the new shape, whose world.json claims a version
that is no longer installed, and which may now refuse to launch at all. The recovery set
has to match what was actually damaged:

===============  ====================================================================
Failure          What has to be put back
===============  ====================================================================
module           just that package — Foundry's own per-package backup. World untouched.
system           the world's data *and* the system code. Both, always.
core             the app bundle *and* the world data, because migrateCore already ran.
===============  ====================================================================

A second rule runs through all of it: **verify on disk**. ``restoreBackup`` and
``restoreSnapshot`` are fire-and-forget like everything else in this API — they return
``{}`` immediately and report failure only over socket.io. A recovery that reports
success because an HTTP call did not error is not a recovery.
"""

from __future__ import annotations

import shutil
import subprocess
import tarfile
import time
from dataclasses import dataclass, field
from pathlib import Path

from scripts.foundry.cloud import FOUNDRY_DATA, SNAPSHOT_PATHS, WORLD_BACKUPS
from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update.admin import APP_PAYLOAD, FoundryAdmin
from scripts.foundry.update.state import CORE_ROLLBACK_DIR, SYSTEM_ASIDE_DIR


@dataclass
class Recovery:
    kind: str                       # module | system | core
    target: str
    steps: list[str] = field(default_factory=list)
    ok: bool = False
    error: str | None = None

    def to_json(self) -> dict:
        return {"kind": self.kind, "target": self.target, "steps": self.steps,
                "ok": self.ok, "error": self.error}


# ── Module: the cheap case, and the only genuinely cheap one ─────────────────

def recover_module(fa: FoundryAdmin, pkg_type: str, pkg_id: str,
                   previous_version: str) -> Recovery:
    """Restore one package from Foundry's own backup of it.

    Note what this deliberately does *not* do: reinstall the previous version from its
    manifest. A package's stable manifest URL always points at *latest* — there is no
    "previous version" URL to install, and ``installPackage`` refuses downgrades anyway
    without ``force``. Foundry's per-package backups, written by ``createSnapshot``
    before the run, are the actual mechanism.
    """
    rec = Recovery(kind="module", target=pkg_id)
    try:
        listing = fa.list_backups()
    except Exception as exc:  # noqa: BLE001
        rec.error = f"could not list backups: {exc}"
        return rec

    entry = _newest_backup(listing, pkg_type, pkg_id, previous_version)
    if not entry:
        rec.error = (f"no backup of {pkg_id} {previous_version} to restore — "
                     "the pre-run snapshot did not include it")
        return rec

    rec.steps.append(f"restoreBackup {pkg_id} ← {entry.get('id')}")
    try:
        fa.restore_backup(pkg_type, pkg_id, entry["id"])
        admin_mod.wait_for_package_version(pkg_type, pkg_id, previous_version,
                                           timeout=300)
    except Exception as exc:  # noqa: BLE001
        rec.error = f"restore did not take: {exc}"
        return rec

    rec.steps.append(f"verified on disk: {pkg_id} {previous_version}")
    rec.ok = True
    return rec


def _newest_backup(listing: dict, pkg_type: str, pkg_id: str,
                   version: str) -> dict | None:
    """Pick the backup matching the pre-update version, newest first."""
    entries = (listing.get(pkg_type) or {}).get(pkg_id) or []
    if isinstance(entries, dict):
        entries = list(entries.values())
    matching = [e for e in entries if str(e.get("version")) == str(version)]
    pool = matching or entries
    return max(pool, key=lambda e: e.get("createdAt") or 0, default=None)


# ── System and core: the world's data has already been rewritten ─────────────

def recover_system(fa: FoundryAdmin, system_id: str, previous_version: str,
                   world_snapshot: Path) -> Recovery:
    """Roll a system back — code *and* every world it just migrated."""
    rec = Recovery(kind="system", target=system_id)
    admin_mod.quit_app()
    rec.steps.append("quit Foundry (a live LevelDB cannot be replaced safely)")

    try:
        _restore_world_tar(world_snapshot, rec)
        _restore_system_from_aside(system_id, previous_version, rec)
    except Exception as exc:  # noqa: BLE001
        rec.error = str(exc)
        admin_mod.start_app()
        return rec

    admin_mod.start_app()
    rec.steps.append("relaunched Foundry")

    on_disk = admin_mod.installed_version("system", system_id)
    if on_disk != previous_version:
        rec.error = (f"{system_id} reads {on_disk!r} on disk after the restore, "
                     f"expected {previous_version!r}")
        return rec
    rec.steps.append(f"verified on disk: {system_id} {previous_version}")
    rec.ok = True
    return rec


def recover_core(previous_version: str, world_snapshot: Path,
                 bundle: Path | None = None) -> Recovery:
    """Roll the core back: the whole app payload, plus the world data it migrated."""
    rec = Recovery(kind="core", target="foundry")
    bundle = bundle or newest_core_bundle()
    if not bundle or not bundle.exists():
        rec.error = "no core rollback bundle on disk — cannot restore the app"
        return rec

    admin_mod.quit_app()
    rec.steps.append("quit Foundry")

    try:
        # Clear before extracting. A tar extracted over a newer tree leaves every file
        # the new build added, which is a mixed-version install that runs and misbehaves
        # rather than failing loudly.
        if APP_PAYLOAD.exists():
            shutil.rmtree(APP_PAYLOAD)
        APP_PAYLOAD.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(bundle, "r:gz") as tar:
            tar.extractall(APP_PAYLOAD.parent, filter="data")
        rec.steps.append(f"restored the app payload from {bundle.name}")
        _restore_world_tar(world_snapshot, rec)
    except Exception as exc:  # noqa: BLE001
        rec.error = str(exc)
        return rec

    admin_mod.start_app()
    fa = FoundryAdmin()
    for _ in range(30):
        try:
            status = fa.status()
            if status.version == previous_version:
                rec.steps.append(f"verified live: /api/status reports {status.version}")
                rec.ok = True
                return rec
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2)
    rec.error = f"server did not come back reporting {previous_version}"
    return rec


def _restore_world_tar(snapshot: Path, rec: Recovery) -> None:
    """Replace worlds/Config/modules from a OneDrive snapshot.

    ``cloud.py restore`` cannot be used here: it prompts on stdin (an EOFError under
    launchd), refuses while the server answers, and extracts *over* the existing trees
    without clearing them. This does the same job with those three things fixed, and
    without its pre-restore ``backup()`` — which calls ``mirror_systems()`` and would
    delete the older system tar that a system rollback is about to need.
    """
    if not snapshot or not snapshot.exists():
        raise RuntimeError(f"world snapshot missing: {snapshot}")
    for rel in SNAPSHOT_PATHS:
        target = FOUNDRY_DATA / rel
        if target.exists():
            shutil.rmtree(target)
    with tarfile.open(snapshot, "r:gz") as tar:
        tar.extractall(FOUNDRY_DATA, filter="data")
    rec.steps.append(f"restored worlds/Config/modules from {snapshot.name}")


def _restore_system_from_aside(system_id: str, version: str, rec: Recovery) -> None:
    """Put back the pre-update system code from the copy set aside before the run.

    The copy is essential: ``cloud.py``'s ``mirror_systems()`` deletes every older
    ``<system>-*.tar.gz`` before writing the current one, so the moment a post-update
    backup runs, the only OneDrive copy of the old system is gone. Phase 1 stashes it
    in ``.state/system-aside/`` for exactly this moment.
    """
    aside = SYSTEM_ASIDE_DIR / f"{system_id}-{version}.tar.gz"
    if not aside.exists():
        candidates = sorted(SYSTEM_ASIDE_DIR.glob(f"{system_id}-*.tar.gz"))
        if not candidates:
            raise RuntimeError(
                f"no set-aside copy of {system_id} {version}; the snapshot's "
                "Data/modules restore does not cover Data/systems")
        aside = candidates[-1]
    target = FOUNDRY_DATA / "Data/systems" / system_id
    if target.exists():
        shutil.rmtree(target)
    with tarfile.open(aside, "r:gz") as tar:
        tar.extractall(FOUNDRY_DATA / "Data/systems", filter="data")
    rec.steps.append(f"restored {system_id} from {aside.name}")


# ── Artefacts the recovery paths depend on ──────────────────────────────────

def newest_world_snapshot() -> Path | None:
    """The newest OneDrive world snapshot.

    Resolved by listing, never by parsing a backup run's output: ``cloud.py backup``
    skips silently when the content digest is unchanged — which is common, because
    Friday's ``make vtt-down`` already snapshotted the same bytes — so a run cannot
    assume the call it just made produced a file.
    """
    snaps = sorted(WORLD_BACKUPS.glob("world-*.tar.gz"))
    return snaps[-1] if snaps else None


def newest_core_bundle() -> Path | None:
    bundles = sorted(CORE_ROLLBACK_DIR.glob("app-*.tar.gz"))
    return bundles[-1] if bundles else None


def stash_system(system_id: str, version: str) -> Path:
    """Copy the installed system aside before anything can overwrite it."""
    SYSTEM_ASIDE_DIR.mkdir(parents=True, exist_ok=True)
    out = SYSTEM_ASIDE_DIR / f"{system_id}-{version}.tar.gz"
    if out.exists():
        return out
    src = FOUNDRY_DATA / "Data/systems" / system_id
    with tarfile.open(out, "w:gz") as tar:
        tar.add(src, arcname=system_id)
    for stale in sorted(SYSTEM_ASIDE_DIR.glob(f"{system_id}-*.tar.gz"))[:-3]:
        stale.unlink()
    return out


def stash_core(version: str, keep: int = 2) -> Path:
    """Tar the **whole** app payload before a core update.

    Not just ``dist``/``public``/``templates``: ``core/update.mjs`` rm -rf's those three
    and then copies the *entire* downloaded archive over the app directory, which also
    replaces ``client/``, ``common/``, ``main.mjs`` and parts of ``node_modules``.
    Restoring an old ``dist`` against a new ``common`` is a mixed build that starts and
    then misbehaves — the worst possible failure mode for a rollback.
    """
    CORE_ROLLBACK_DIR.mkdir(parents=True, exist_ok=True)
    out = CORE_ROLLBACK_DIR / f"app-{version}.tar.gz"
    if out.exists():
        return out
    with tarfile.open(out, "w:gz") as tar:
        tar.add(APP_PAYLOAD, arcname=APP_PAYLOAD.name)
    for stale in sorted(CORE_ROLLBACK_DIR.glob("app-*.tar.gz"))[:-keep]:
        stale.unlink()
    return out


def tunnel_up(repo_root: Path) -> bool:
    return subprocess.run(["make", "tunnel-up"], cwd=repo_root,
                          capture_output=True, text=True).returncode == 0


def tunnel_down(repo_root: Path) -> bool:
    return subprocess.run(["make", "tunnel-down"], cwd=repo_root,
                          capture_output=True, text=True).returncode == 0


def tunnel_running(repo_root: Path) -> bool:
    pid_file = repo_root / ".run" / "cloudflared.pid"
    try:
        pid = int(pid_file.read_text().strip())
    except (OSError, ValueError):
        return False
    try:
        import os
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, ValueError):
        return False
