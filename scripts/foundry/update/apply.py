#!/usr/bin/env python3
"""The run itself: gate → back up → scan → adjudicate → apply → smoke → recover.

Sequencing here is not cosmetic; three orderings are load-bearing and each one exists
because getting it wrong is silent rather than loud.

**The OneDrive backup happens with the app fully stopped, before anything else.**
``cloud.py backup`` refuses while the server answers on :30000, because a live LevelDB
cannot be copied consistently. And ``osascript quit`` returns as soon as the Apple Event
is delivered, so "quit then back up" without waiting hands a still-running server to a
backup that then dies.

**The scan happens after the world is down, not before.** Every ``/setup`` and
``/update`` package action is gated on ``!game.world`` and 403s otherwise.

**``packageWarnings`` is read before any world is launched.** ``setup.mjs``'s socket
handler returns ``{}`` once a world is active, and package warnings are the *only* place
an install-step failure appears — ``installPackage`` resolves ``{}`` on one. Read it
after launching and a failed install looks like a clean run.

Everything writes its phase to ``.state/vtt-update.status`` before acting, so the 08:00
watchdog can tell a slow core download from a dead run, and everything that changes
service records the entry state first, so a crash is recoverable rather than permanent.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from scripts.foundry import admin_password as admin_pw
from scripts.foundry.cloud import WORLD_BACKUPS
from scripts.foundry.update import (
    adjudicate, admin as admin_mod, inventory, notify, plan as plan_mod,
    recover, risk, smoke, state, upstream,
)
from scripts.foundry.update.admin import FoundryAdmin

REPO_ROOT = Path(__file__).resolve().parents[3]


class Aborted(RuntimeError):
    """The gate declined the run. Not a failure — a deliberate no-op."""


@dataclass
class RunResult:
    run_id: str
    outcome: str = "running"          # done | skipped | failed | recovered | no-op
    plan: dict = field(default_factory=dict)
    applied: list[dict] = field(default_factory=list)
    failed: list[dict] = field(default_factory=list)
    recoveries: list[dict] = field(default_factory=list)
    smoke: list[dict] = field(default_factory=list)
    warnings: dict = field(default_factory=dict)
    messages: list[str] = field(default_factory=list)
    snapshot: str | None = None
    native_snapshot: str | None = None
    started: str = ""
    finished: str = ""

    def to_json(self) -> dict:
        return {
            "run_id": self.run_id, "outcome": self.outcome,
            "started": self.started, "finished": self.finished,
            "snapshot": self.snapshot, "native_snapshot": self.native_snapshot,
            "applied": self.applied, "failed": self.failed,
            "recoveries": self.recoveries, "smoke": self.smoke,
            "warnings": self.warnings, "messages": self.messages,
            "plan": self.plan,
        }


# ── Phase 0: the gate ────────────────────────────────────────────────────────

def gate(fa: FoundryAdmin, policy: dict, *, force: bool = False) -> state.EntryState:
    """Decide whether to run at all, and record what to put back afterwards."""
    if state.is_paused() and not force:
        raise Aborted("paused — remove .state/vtt-update.pause to resume")

    if not force:
        _check_window(policy)

    # A leftover entry file means the previous run died partway. Its recorded state is
    # the truth about what service should look like; the current (possibly broken)
    # state is not. Repair first, then adopt it as this run's restore target.
    stale = state.EntryState.read()
    if stale:
        _repair_from(stale)
        return stale

    status = fa.status() if admin_mod.port_open() else None
    users = (status.users or 0) if status and status.active else 0
    if users > 0 and not force:
        raise Aborted(f"{users} user(s) connected to {status.world!r} — "
                      "not touching a live table")

    entry = state.EntryState(
        foundry_up=admin_mod.port_open(),
        tunnel_up=recover.tunnel_running(REPO_ROOT),
        active_world=status.world if status and status.active else None,
    )
    entry.write()
    return entry


def _check_window(policy: dict) -> None:
    """launchd coalesces a run missed while the Mac was asleep onto the next wake.

    Without this guard a Saturday-afternoon wake would take the tunnel down and start
    reinstalling packages an hour before a session.
    """
    window = policy.get("window", {}) or {}
    earliest = str(window.get("earliest", "05:00"))
    latest = str(window.get("latest", "09:00"))
    now = datetime.now().strftime("%H:%M")
    if not (earliest <= now <= latest):
        raise Aborted(f"{now} is outside the {earliest}–{latest} window — this is a "
                      "run launchd deferred from a sleeping Mac, not the scheduled one")


def _admin_client() -> FoundryAdmin:
    """A client that can actually act.

    Launching a world is an admin action, so a bare ``FoundryAdmin()`` cannot do it once
    an admin password is configured — it authenticates with an empty body and is
    rejected. That is not a theoretical failure: it left the table down after a run,
    because the service-restore path built exactly such a client.
    """
    return FoundryAdmin(admin_password=admin_pw.foundry_admin_password(required=False))


def _repair_from(entry: state.EntryState) -> None:
    """Put service back the way a crashed previous run found it."""
    if entry.foundry_up and not admin_mod.port_open():
        admin_mod.start_app()
    if entry.active_world and admin_mod.port_open():
        fa = _admin_client()
        try:
            if not fa.world_active():
                fa.launch_world(entry.active_world)
                fa.wait_for_world(entry.active_world, timeout=240)
        except Exception:  # noqa: BLE001
            pass
    if entry.tunnel_up and not recover.tunnel_running(REPO_ROOT):
        recover.tunnel_up(REPO_ROOT)


# ── Phase 1: backups ─────────────────────────────────────────────────────────

def back_up(system_id: str, system_version: str) -> tuple[Path, Path | None]:
    """Stop the server, snapshot to OneDrive, stash the system, restart at setup.

    This is deliberately the *same* code path `make vtt-down` uses — it shells out to
    ``scripts.foundry.cloud backup``, exactly as the Makefile does, differing only in
    the ``--reason`` label that appears in the log line. So the retention rules (the
    5-day coalescing window, the 10-deep roll, the major-release promotion, the
    digest skip) behave identically whether a snapshot comes from a creative session
    or from the Saturday run. One implementation, one set of rules.
    """
    admin_mod.quit_app()

    import subprocess
    proc = subprocess.run(
        [str(REPO_ROOT / ".venv/bin/python"), "-m", "scripts.foundry.cloud",
         "backup", "--reason", "auto-update"],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=900,
    )
    if proc.returncode != 0:
        # cloud.py `die()`s on a server that is still running, an unreachable OneDrive,
        # or a failed write. Without this check the run would carry on and find an OLD
        # snapshot below, believing it had a current restore point — the one failure
        # that must never be silent.
        detail = (proc.stderr or proc.stdout).strip()[-400:]
        raise RuntimeError(f"the pre-update backup failed, so there is no fresh restore "
                           f"point — refusing to update anything: {detail}")

    # Resolve the rollback target by listing, never from the backup's stdout: the
    # digest check means the call above legitimately writes nothing when Friday's
    # `make vtt-down` already snapshotted the same bytes. That is fine — an identical
    # digest means that snapshot IS the current state.
    snapshot = recover.newest_world_snapshot()
    if not snapshot:
        raise RuntimeError(
            f"no world snapshot exists in {WORLD_BACKUPS} — refusing to "
            "update anything without a restore point")

    aside = None
    if system_version:
        aside = recover.stash_system(system_id, system_version)

    admin_mod.start_app()
    return snapshot, aside


def backup_packages(fa: FoundryAdmin, decisions: list[dict], policy: dict,
                    run_id: str) -> dict:
    """Back up exactly the packages this run is about to change.

    Foundry's ``createSnapshot`` backs up *every* installed package. Here that is 2.7 GB
    — almost all of it premium map art that has not changed in months — copied every
    Saturday to protect an update to one 3 MB module. ``createBackups`` takes a package
    list, produces exactly what ``recover_module`` needs to put a single package back,
    and costs seconds instead of minutes.

    Set ``retention.full_snapshot: true`` in update-policy.yml to take the whole-world
    snapshot as well; the OneDrive tar taken in phase 1 already covers worlds, Config
    and modules, so it is off by default.

    Fire-and-forget like the rest of this API, so completion is confirmed by reading
    the backup listing back rather than by the ``{}`` the call returns.
    """
    targets = [{"packageId": d["id"], "type": d["type"],
                "note": f"pre-auto-update {run_id}"}
               for d in decisions if d["type"] in ("module", "system")]
    result = {"packages": [t["packageId"] for t in targets], "snapshot": None,
              "error": None}
    if not targets:
        return result

    try:
        fa.check_snapshot_disk_space()
    except Exception as exc:  # noqa: BLE001
        result["error"] = f"disk space check failed: {exc}"
        return result

    try:
        fa.setup("createBackup", backups=targets)
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
        return result

    # Confirm on disk: a package with no backup cannot be rolled back, and finding that
    # out during recovery is far too late.
    missing = _await_backups(fa, targets, timeout=900)
    if missing:
        result["error"] = f"no backup was written for: {', '.join(missing)}"
        return result

    if (policy.get("retention", {}) or {}).get("full_snapshot"):
        snapshot_id = f"auto-update-{run_id}"
        try:
            fa.create_snapshot(snapshot_id, note=f"pre-auto-update {run_id}")
            admin_mod.wait_for_snapshot(snapshot_id, timeout=3600)
            result["snapshot"] = snapshot_id
            _prune_snapshots(fa, int((policy.get("retention", {}) or {})
                                     .get("native_snapshots", 4)))
        except Exception as exc:  # noqa: BLE001
            result["error"] = f"full snapshot skipped: {exc}"
    return result


def _await_backups(fa: FoundryAdmin, targets: list[dict], timeout: float) -> list[str]:
    """Poll ``listBackups`` until every target has one. Returns those that never did."""
    deadline = time.monotonic() + timeout
    outstanding = {t["packageId"]: t["type"] for t in targets}
    while time.monotonic() < deadline and outstanding:
        try:
            listing = fa.list_backups()
        except Exception:  # noqa: BLE001
            listing = {}
        for pkg_id, pkg_type in list(outstanding.items()):
            entries = (listing.get(pkg_type) or {}).get(pkg_id) or []
            if entries:
                del outstanding[pkg_id]
        if outstanding:
            time.sleep(3.0)
    return sorted(outstanding)


def _prune_snapshots(fa: FoundryAdmin, keep: int) -> None:
    snaps = sorted(admin_mod.SNAPSHOTS_DIR.glob("*.json"),
                   key=lambda p: p.stat().st_mtime)
    for stale in snaps[:-keep] if keep > 0 else []:
        try:
            fa.delete_snapshot(stale.stem)
        except Exception:  # noqa: BLE001
            pass


# ── Phase 4: apply ───────────────────────────────────────────────────────────

def apply_decisions(fa: FoundryAdmin, plan: dict) -> tuple[list[dict], list[dict]]:
    """Install everything in the ``auto`` bucket. System first, then modules, core last.

    Core is last because installing it restarts the process; anything queued behind it
    would never run.
    """
    applied: list[dict] = []
    failed: list[dict] = []

    auto = [d for d in plan["decisions"] if d["bucket"] == "auto"]
    order = {"system": 0, "module": 1, "core": 2}
    auto.sort(key=lambda d: order.get(d["type"], 1))

    for decision in auto:
        if decision["type"] == "core":
            continue  # handled by the caller: it restarts the server
        record = {"id": decision["id"], "type": decision["type"],
                  "from": decision["installed"], "to": decision["target"]}
        # A target that is not actually newer would make wait_for_package_version
        # succeed instantly against the version already on disk — an install that did
        # nothing, reported as applied. Refuse rather than report a phantom update.
        if not upstream.is_newer(decision.get("target"), decision["installed"]):
            failed.append({**record,
                           "error": f"target {decision.get('target')!r} is not newer "
                                    f"than the installed {decision['installed']!r}"})
            continue
        manifest = plan["upstream"].get(decision["id"], {}).get("manifest_url")
        if not manifest:
            failed.append({**record, "error": "no manifest URL to install from"})
            continue
        try:
            fa.install_package(decision["type"], decision["id"], manifest)
            admin_mod.wait_for_package_version(decision["type"], decision["id"],
                                               decision["target"], timeout=900)
            applied.append(record)
        except Exception as exc:  # noqa: BLE001
            # A timeout here is a failure, not "probably still going": installPackage
            # resolves on fetch and an install-step error resolves {} silently.
            failed.append({**record, "error": str(exc)})
    return applied, failed


def apply_core(fa: FoundryAdmin, decision: dict) -> dict:
    """Download, install and restart into a new core build."""
    record = {"id": "core", "type": "core", "from": decision["installed"],
              "to": decision["target"]}
    try:
        fa.update("updateDownload")
    except Exception as exc:  # noqa: BLE001
        return {**record, "error": str(exc)}

    # The server restarts itself when the install completes; wait for it to come back
    # reporting the new version rather than trusting the call.
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        try:
            status = FoundryAdmin().status()
            if status.version == decision["target"]:
                return record
        except Exception:  # noqa: BLE001
            pass
        time.sleep(5)
    return {**record, "error": f"server never came back reporting {decision['target']}"}


# ── Phase 9: put service back ────────────────────────────────────────────────

def shut_down_service(messages: list[str]) -> None:
    """Leave the table down: world deactivated, server quit, tunnel closed.

    The default end state for a scheduled run. Nobody is playing at four in the morning,
    and leaving Foundry and a public tunnel up for the rest of the week is exposure and
    resource use for nothing — you start it yourself with `make vtt-up` when you want it.

    Deliberately does NOT take a parting backup the way `make vtt-down` does. The run
    already snapshotted before it touched anything, and that snapshot is the week's
    rollback point; a second one now would be inside the 5-day coalescing window and
    would REPLACE it with post-update state — quietly destroying the only pre-update
    restore point on the very run that created it.

    Tunnel first: a live tunnel pointed at a server that is going away serves errors to
    anyone who happens to be looking.
    """
    if recover.tunnel_running(REPO_ROOT):
        if recover.tunnel_down(REPO_ROOT):
            messages.append("tunnel closed")
        else:
            messages.append("could not close the Cloudflare tunnel")
    try:
        admin_mod.quit_app()
        messages.append("Foundry stopped — start it again with: make vtt-up")
    except Exception as exc:  # noqa: BLE001
        messages.append(f"could not stop Foundry: {exc}")
    state.EntryState.clear()


def restore_service(entry: state.EntryState, messages: list[str]) -> None:
    """Return Foundry and the tunnel to how they were found.

    This runs in a ``finally``-shaped position: whatever else happened, the table has to
    come back. Failures here are recorded in ``messages`` and surfaced in the report and
    the notification rather than raised.
    """
    fa = _admin_client()
    if entry.foundry_up:
        if not admin_mod.port_open():
            try:
                admin_mod.start_app()
            except Exception as exc:  # noqa: BLE001
                messages.append(f"could not restart Foundry: {exc}")
        if entry.active_world:
            try:
                if not fa.world_active():
                    fa.launch_world(entry.active_world)
                    fa.wait_for_world(entry.active_world, timeout=240)
            except Exception as exc:  # noqa: BLE001
                messages.append(f"could not relaunch {entry.active_world}: {exc}")
    else:
        admin_mod.quit_app()

    if entry.tunnel_up and not recover.tunnel_running(REPO_ROOT):
        if not recover.tunnel_up(REPO_ROOT):
            messages.append("could not bring the Cloudflare tunnel back up — "
                            "players cannot reach the server until it is")
    state.EntryState.clear()


# ── The whole run ────────────────────────────────────────────────────────────

def run(*, dry: bool = False, force: bool = False, skip_llm: bool = False) -> RunResult:
    """Take the lock for the whole run, then execute it.

    The lock is held across everything — including the phases that stop Foundry — so
    `make vtt-up` cannot start the tunnel underneath a run that has deliberately parked
    the server world-inactive, which is the one state where /setup answers.
    """
    run_id = time.strftime("%Y%m%d-%H%M%S")
    result = RunResult(run_id=run_id, started=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
    try:
        lock = state.Lock().acquire()
    except state.Locked as exc:
        result.outcome = "skipped"
        result.messages.append(str(exc))
        return result
    try:
        return _run_locked(result, run_id, dry=dry, force=force, skip_llm=skip_llm)
    finally:
        lock.release()


def _run_locked(result: RunResult, run_id: str, *, dry: bool, force: bool,
                skip_llm: bool) -> RunResult:
    policy = risk.load_policy()
    status = state.RunStatus(run_id=run_id, started=time.time())
    status.write()

    password = admin_pw.foundry_admin_password(required=False)
    if not password:
        result.messages.append(
            "no admin password configured — the browser smoke test cannot log in "
            "(run: make foundry-admin-push && make foundry-admin-configure)")
    fa = FoundryAdmin(admin_password=password)

    entry: state.EntryState | None = None
    try:
        status.set_phase("gate")
        entry = gate(fa, policy, force=force)

        status.set_phase("tunnel-down")
        if entry.tunnel_up and not dry:
            # /setup answers only while no world is active — which is exactly the state
            # this run creates. With the tunnel up that surface is public.
            recover.tunnel_down(REPO_ROOT)

        packages = inventory.scan()
        system = next((p for p in packages if p.type == "system"), None)

        if not dry:
            status.set_phase("backup")
            snapshot, _ = back_up(system.id if system else "dnd5e",
                                  system.version if system else "")
            result.snapshot = snapshot.name
        else:
            snap = recover.newest_world_snapshot()
            result.snapshot = snap.name if snap else None

        status.set_phase("scan")
        if not dry:
            fa.wait_for_setup(timeout=180)
        assisted = fa if (admin_mod.port_open() and not fa.world_active()) else None
        result.plan = plan_mod.build(admin=assisted, notes=True, policy=policy)

        status.set_phase("adjudicate")
        if skip_llm:
            adjudicate.apply_verdicts(result.plan, [], "adjudication skipped (--skip-llm)")
        else:
            verdicts, error = adjudicate.run(result.plan)
            adjudicate.apply_verdicts(result.plan, verdicts, error)

        auto = [d for d in result.plan["decisions"] if d["bucket"] == "auto"]
        held = {d["id"] for d in result.plan["decisions"] if d["bucket"] == "hold"}
        if dry or not auto:
            result.outcome = "dry" if dry else "no-op"
            # A dry run must NOT mark packages as seen: doing so would disarm the
            # first-sighting review guard for the next real run.
            if not dry:
                risk.save_seen(packages, exclude=held)
            return _finish(result, status, entry, dry=dry, policy=policy)

        status.set_phase("snapshot")
        backups = backup_packages(fa, auto, policy, run_id)
        result.native_snapshot = backups.get("snapshot") or (
            f"per-package: {', '.join(backups['packages'])}" if backups["packages"] else None)
        if backups.get("error"):
            # No backup means no rollback. Refuse rather than update blind.
            raise RuntimeError(f"pre-update package backup failed: {backups['error']}")

        core_decision = next((d for d in auto if d["type"] == "core"), None)
        if core_decision:
            recover.stash_core(core_decision["installed"],
                               keep=int((policy.get("retention", {}) or {})
                                        .get("core_bundles", 2)))

        status.set_phase("apply")
        log_day = time.strftime("%Y-%m-%d")
        error_offset = admin_mod.error_log_offset(log_day)
        result.applied, result.failed = apply_decisions(fa, result.plan)

        touched = {a["id"] for a in result.applied}
        result.warnings = smoke.package_warnings(fa, touched)

        if core_decision and not result.failed:
            core_record = apply_core(fa, core_decision)
            (result.failed if core_record.get("error") else result.applied).append(core_record)
            # The core installer respawns the server process, so this session's cookie
            # belongs to a server that no longer exists. Mint a new one before the smoke
            # test tries to launch anything.
            if not core_record.get("error"):
                try:
                    fa.reauthenticate()
                except Exception as exc:  # noqa: BLE001
                    result.messages.append(f"re-auth after the core update failed: {exc}")

        status.set_phase("smoke")
        results = smoke.run_all(fa, result.plan["worlds"], policy=policy,
                                touched=touched, error_offset=error_offset,
                                log_day=log_day)
        result.smoke = [r.to_json() for r in results]

        broken = [r for r in results if not r.ok]
        if broken or result.failed:
            status.set_phase("recover")
            _recover(result, fa, system, broken)
            result.outcome = "recovered" if result.recoveries else "failed"
        else:
            result.outcome = "done"
            risk.save_seen(inventory.scan(), exclude=held)

        return _finish(result, status, entry, dry=False, policy=policy)

    except Aborted as exc:
        result.outcome = "skipped"
        result.messages.append(str(exc))
        status.finish("skipped", str(exc))
        # A gate abort must not clear an entry file it did not write.
        return result
    except Exception as exc:  # noqa: BLE001
        result.outcome = "failed"
        result.messages.append(f"run failed: {exc}")
        status.finish("failed", str(exc))
        if entry:
            # A crash is the one case that does NOT shut down: the run may have been
            # started by hand while the table was in use, and a half-finished run
            # should hand back what it found rather than switch the lights off.
            restore_service(entry, result.messages)
        return result


def _recover(result: RunResult, fa: FoundryAdmin, system, broken) -> None:
    """Dispatch on failure class. See recover.py for why it is not a ladder."""
    snapshot = recover.newest_world_snapshot()
    applied_by_id = {a["id"]: a for a in result.applied}

    core = applied_by_id.get("core")
    system_change = applied_by_id.get(system.id) if system else None

    if core:
        rec = recover.recover_core(core["from"], snapshot)
        result.recoveries.append(rec.to_json())
    elif system_change:
        rec = recover.recover_system(fa, system_change["id"], system_change["from"],
                                     snapshot)
        result.recoveries.append(rec.to_json())
    else:
        for record in result.applied:
            if record["type"] != "module":
                continue
            rec = recover.recover_module(fa, "module", record["id"], record["from"])
            result.recoveries.append(rec.to_json())

    for world in broken:
        result.messages.append(
            f"{world.world}: " + "; ".join(world.errors[:3]) if world.errors
            else f"{world.world}: smoke test failed")


def _finish(result: RunResult, status: state.RunStatus,
            entry: state.EntryState | None, *, dry: bool,
            policy: dict | None = None) -> RunResult:
    shutdown = ((policy or {}).get("lifecycle", {}) or {}).get("shutdown_when_done", True)
    if entry and not dry:
        if shutdown:
            shut_down_service(result.messages)
        else:
            restore_service(entry, result.messages)
    elif entry and dry:
        state.EntryState.clear()
    result.finished = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    status.finish(result.outcome, "; ".join(result.messages[:3]))
    return result


def notify_result(result: RunResult) -> None:
    """One notification, class chosen by what actually happened."""
    held = [d for d in result.plan.get("decisions", []) if d["bucket"] == "hold"]
    applied = result.applied

    if result.outcome in ("failed", "recovered"):
        detail = "; ".join(result.messages[:2]) or "see the run report"
        notify.notify("failed", f"update rolled back ({result.run_id})",
                      f"{detail}\n\nRestore point: {result.snapshot or 'none'}")
        return
    if result.outcome == "skipped":
        notify.notify("done", "update skipped", result.messages[0] if result.messages
                      else "the gate declined this run")
        return

    lines = [f"{a['id']} {a['from']} → {a['to']}" for a in applied] or ["nothing to update"]
    if any("Foundry stopped" in m for m in result.messages):
        lines.append("")
        lines.append("Server left down — bring it up with: make vtt-up")
    if held:
        notify.notify("attention", f"{len(applied)} applied, {len(held)} need you",
                      "\n".join(lines + [""] +
                                [f"HELD · {d['id']}: {(d['reasons'] or [''])[-1]}"
                                 for d in held[:4]]))
    else:
        notify.notify("done", f"{len(applied)} package(s) updated", "\n".join(lines))
