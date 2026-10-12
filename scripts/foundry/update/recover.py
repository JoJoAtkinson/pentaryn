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

from scripts.foundry import bootstate, cloud
from scripts.foundry import host as host_mod
from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update.admin import FOUNDRY_DATA
from scripts.foundry.update.admin import APP_PAYLOAD, FoundryAdmin
from scripts.foundry.update.state import CORE_ROLLBACK_DIR, SYSTEM_ASIDE_DIR
from scripts.foundry.update.upstream import _parts


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
    without ``force``. Foundry's per-package backups, written by ``createBackup``
    in ``apply.backup_packages`` before the run, are the actual mechanism.
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
                   world_snapshot: "cloud.Snapshot | Path | None") -> Recovery:
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


def recover_core(previous_version: str, world_snapshot: "cloud.Snapshot | Path | None",
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


def _restore_world_tar(snapshot: "cloud.Snapshot | Path | None", rec: Recovery) -> None:
    """Replace worlds/Config/modules from a cloud snapshot (or a local tar path).

    ``cloud.py restore`` cannot be used here: it prompts on stdin (an EOFError under
    launchd), refuses while the server answers, and runs a pre-restore ``backup()``.
    This goes through ``cloud.fetch_snapshot`` (the world tar plus every module bundle this
    machine lacks, downloaded and verified before anything local is touched) and
    ``cloud.apply_snapshot(systems=False)`` — the system comes back from its own aside
    copy (``_restore_system_from_aside``), never from the snapshot's manifest. Both keep
    this machine's own ``Config/options.json``, ``admin.txt`` and ``license.json``. A
    full (pre-bundles) snapshot restores as before; a refusal raises ``RuntimeError``.
    """
    if snapshot is None:
        raise RuntimeError("no world snapshot to restore from")
    if isinstance(snapshot, Path):
        if not snapshot.exists():
            raise RuntimeError(f"world snapshot missing: {snapshot}")
        cloud.extract_snapshot(snapshot, systems=False)
        rec.steps.append(f"restored worlds/Config/modules from {snapshot.name}")
        return
    st = cloud.store()
    fetched = cloud.fetch_snapshot(st, snapshot, systems=False)
    try:
        cloud.apply_snapshot(fetched, systems=False)
    finally:
        cloud.discard_fetched(fetched)
    anc = cloud.read_lineage(st, snapshot)
    bootstate.load().record_snapshot(snapshot.name, snapshot.host, snapshot.mtime,
                                     cloud.snapshot_digest(), by="updater-rollback",
                                     lineage=list(anc.names) if anc else [],
                                     origin_before=anc.origin_before if anc else None)
    rec.steps.append(f"restored worlds/Config/modules from {snapshot.name}")


def _restore_system_from_aside(system_id: str, version: str, rec: Recovery) -> None:
    """Put back the pre-update system code from the copy set aside before the run.

    The copy is the rollback's own: the cloud keeps a system bundle only while a retained
    snapshot's manifest names it, and the world restore here leaves ``Data/systems``
    alone (``systems=False``). Phase 1 stashes it in ``.state/system-aside/`` for exactly
    this moment.
    """
    aside = SYSTEM_ASIDE_DIR / f"{system_id}-{version}.tar.gz"
    if not aside.exists():
        prefix = f"{system_id}-"
        candidates = sorted(SYSTEM_ASIDE_DIR.glob(f"{prefix}*.tar.gz"),
                            key=lambda p: _version_key(p, prefix))
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

def _version_key(path: Path, prefix: str) -> tuple[list[int], str]:
    """Order ``<prefix><version>.tar.gz`` by version (``6.0.10`` after ``6.0.9``), name
    as tie-breaker, so a digit rollover never makes the newest artefact sort oldest."""
    return (_parts(path.name.removeprefix(prefix).removesuffix(".tar.gz")), path.name)


def newest_world_snapshot(host: str | None = None) -> "cloud.Snapshot | None":
    """This machine's rollback point: the snapshot its world is based on.

    Resolved by listing, never by parsing a backup run's output: ``cloud.py backup``
    skips silently when the content digest is unchanged — which is common, because
    Friday's ``make vtt-down`` already snapshotted the same bytes — so a run cannot
    assume the call it just made produced a file.

    The based-on record (bootstate) names exactly the snapshot whose bytes the local tree
    had after the last own backup or restore — after ``back_up`` that is the current
    state, whichever host's name it carries. Failing that, this host's own newest: the
    rollback point must be this machine's state, never the other machine's.
    """
    me = host or host_mod.host_name()
    try:
        snaps = cloud.all_snapshots(cloud.store())
    except Exception:  # noqa: BLE001 — no listing, no rollback point
        return None
    based_on = bootstate.load().based_on
    if based_on:
        for s in snaps:
            if s.name == based_on:
                return s
    mine = [s for s in snaps if s.host == me and s.folder == cloud.WORLD_BACKUPS]
    return cloud.newest(mine)


def newest_core_bundle() -> Path | None:
    bundles = sorted(CORE_ROLLBACK_DIR.glob("app-*.tar.gz"),
                     key=lambda p: _version_key(p, "app-"))
    return bundles[-1] if bundles else None


def _tar_to(out: Path, src: Path, arcname: str) -> None:
    """Write ``out`` via a ``.partial`` sibling so an interrupted write leaves nothing
    at ``out`` for a later run to trust. The gzip header still names ``out``."""
    tmp = out.with_name(out.name + ".partial")
    try:
        with open(tmp, "wb") as f, tarfile.open(out, "w:gz", fileobj=f) as tar:
            tar.add(src, arcname=arcname)
        tmp.replace(out)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def stash_system(system_id: str, version: str) -> Path:
    """Copy the installed system aside before anything can overwrite it."""
    SYSTEM_ASIDE_DIR.mkdir(parents=True, exist_ok=True)
    out = SYSTEM_ASIDE_DIR / f"{system_id}-{version}.tar.gz"
    if out.exists():
        return out
    src = FOUNDRY_DATA / "Data/systems" / system_id
    _tar_to(out, src, system_id)
    prefix = f"{system_id}-"
    for stale in sorted(SYSTEM_ASIDE_DIR.glob(f"{prefix}*.tar.gz"),
                        key=lambda p: _version_key(p, prefix))[:-3]:
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
    _tar_to(out, APP_PAYLOAD, APP_PAYLOAD.name)
    for stale in sorted(CORE_ROLLBACK_DIR.glob("app-*.tar.gz"),
                        key=lambda p: _version_key(p, "app-"))[:-keep]:
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
