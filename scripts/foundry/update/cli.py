#!/usr/bin/env python3
"""Command line for the updater.

    python -m scripts.foundry.update.cli scan            # read-only, safe any time
    python -m scripts.foundry.update.cli run             # the real thing
    python -m scripts.foundry.update.cli run --dry       # everything except changing anything
    python -m scripts.foundry.update.cli status          # what the last/current run is doing
    python -m scripts.foundry.update.cli notify --demo   # one notification of each class
    python -m scripts.foundry.update.cli admin-configure # set Foundry's admin password
    python -m scripts.foundry.update.cli recover-service # put world + tunnel back
    python -m scripts.foundry.update.cli killed --after N  # the wrapper's backstop fired

Use the make targets rather than this directly; they are the documented surface.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def cmd_scan(args) -> int:
    from scripts.foundry.update import admin as admin_mod, plan as plan_mod

    fa = None
    if args.foundry:
        from scripts.foundry import admin_password as admin_pw
        from scripts.foundry.update.admin import FoundryAdmin
        # checkPackage / updateCheck are admin actions; an unauthenticated client is
        # rejected once an admin password is configured.
        fa = FoundryAdmin(admin_password=admin_pw.foundry_admin_password(required=False))
        if not admin_mod.port_open():
            print("  ✗ Foundry is not running — omit --foundry for a standalone scan",
                  file=sys.stderr)
            return 1
        if fa.world_active():
            print("  ✗ a world is active; every package action is refused while one is. "
                  "Omit --foundry, or stop the world first.", file=sys.stderr)
            return 1

    result = plan_mod.build(admin=fa, notes=args.notes, check_forks=not args.no_forks)
    preview = None
    if args.escalation:
        # Facts, floor and ceiling only — no LLM call, nothing written.
        from scripts.foundry.update import escalate, risk
        preview = escalate.preview(result, risk.load_policy())
    if args.json:
        print(json.dumps(result if preview is None else {**result, "escalation_preview": preview},
                         indent=2))
    else:
        print(plan_mod.render_text(result))
        if preview is not None:
            print()
            print(escalate.render_preview(preview))
    if args.out:
        plan_mod.write(result, Path(args.out))
        print(f"\n  → {args.out}")
    return 0


def cmd_run(args) -> int:
    from scripts.foundry.update import apply as apply_mod, children, report as report_mod

    # The wrapper's backstop TERMs this process: end the claude -p / node children it
    # started, then SystemExit(143) so the run's finally blocks release the lock (AC-6).
    with children.terminate_on_sigterm():
        return _run(args, apply_mod, report_mod)


def _run(args, apply_mod, report_mod) -> int:
    result = apply_mod.run(dry=args.dry, force=args.force, skip_llm=args.skip_llm)
    print(f"  outcome: {result.outcome}")
    for record in result.applied:
        print(f"  ✓ applied {record['id']} {record['from']} → {record['to']}")
    for record in result.failed:
        print(f"  ✗ failed  {record['id']}: {record.get('error')}")
    # Spell the recovery out here, not only in the report. This log is the first place
    # anyone looks, and "outcome: recovered" on its own does not say WHAT was rolled
    # back or from which snapshot — which is exactly the question it prompts.
    for rec in result.recoveries:
        verdict = "ok" if rec["ok"] else f"FAILED: {rec.get('error')}"
        print(f"  ↩ ROLLED BACK {rec['kind']} {rec['target']} — {verdict}")
        for step in rec.get("steps", []):
            print(f"      · {step}")
    for message in result.messages:
        print(f"  · {message}")
    if result.traceback:
        print(result.traceback.rstrip())
    if result.escalation:
        esc = result.escalation
        print(f"  ▲ escalation: tier {esc.get('tier')} (floor {esc.get('tier_floor')}, "
              f"ceiling {esc.get('tier_ceiling')})"
              + (f" — {esc['skipped']}" if esc.get("skipped") else ""))
        for pkg, a in (esc.get("analysis") or {}).items():
            print(f"      {pkg}: {a.get('impact', '?')} / {a.get('recommendation', '?')}"
                  + (" (cached)" if a.get("cached") else "")
                  + (f" — {a['error']}" if a.get("error") else "")
                  + (f" → {a['path']}" if a.get("path") else ""))
        print(f"  {report_mod.cost_line(result.to_json())}")

    if args.dry:
        from scripts.foundry.update import plan as plan_mod
        if result.plan:
            print()
            print(plan_mod.render_text(result.plan))
        return 0

    policy = _policy()
    md_path, json_path = report_mod.write(result.to_json(), use_llm=not args.skip_llm,
                                          policy=policy)
    print(f"  report: {md_path.relative_to(REPO_ROOT)}")

    # Plans the escalation step wrote ride along with the report — same explicit
    # pathspec, never `-A`. Only paths under the plans directory are accepted.
    plan_paths = _plan_paths(result)

    # Notify first: the commit and push touch the network and must never delay or
    # lose the week's notification (AC-5).
    apply_mod.notify_result(result)

    policy_report = policy.get("report", {}) or {}
    if policy_report.get("commit", True):
        for message in report_mod.commit_and_push(
                [md_path, json_path, *plan_paths], push=policy_report.get("push", True)):
            result.messages.append(message)
            print(f"  · {message}")
    return 0 if result.outcome in ("done", "no-op", "skipped", "dry") else 1


def cmd_status(args) -> int:
    from scripts.foundry.update import state

    status = state.read_status()
    if not status:
        print("  no run has been recorded yet")
        return 0
    import time

    age = (time.time() - status.get("updated", 0)) / 60
    print(f"  run {status['run_id']}  phase={status['phase']}  "
          f"outcome={status['outcome']}  ({age:.0f} min since last update)")
    if status.get("detail"):
        print(f"  {status['detail']}")
    entry = state.EntryState.read()
    if entry:
        print(f"  ⚠ entry state still recorded (foundry_up={entry.foundry_up}, "
              f"tunnel_up={entry.tunnel_up}, world={entry.active_world}) — "
              "a run did not finish cleanly")
    return 0


def cmd_notify(args) -> int:
    from scripts.foundry.update import notify

    if args.demo:
        notify.demo()
    else:
        notify.notify(args.kind, args.subtitle, args.message)
    return 0


def cmd_admin_configure(args) -> int:
    """Push the stored admin password into Foundry's own configuration."""
    from scripts.foundry import admin_password as admin_pw
    from scripts.foundry.update import admin as admin_mod
    from scripts.foundry.update.admin import FoundryAdmin

    try:
        password = admin_pw.foundry_admin_password()
    except admin_pw.AdminPasswordUnavailable as exc:
        print(f"  ✗ {exc}", file=sys.stderr)
        return 1

    if not admin_mod.port_open():
        print("  ▸ starting Foundry...")
        admin_mod.start_app()

    fa = FoundryAdmin(admin_password=password)
    if fa.world_active():
        print("  ✗ a world is active. Foundry refuses server configuration changes "
              "while one is running — stop it (make foundry-down) and retry.",
              file=sys.stderr)
        return 1

    try:
        fa.set_admin_password(password)
    except Exception as exc:  # noqa: BLE001
        print(f"  ✗ could not set the admin password: {exc}", file=sys.stderr)
        return 1

    # Prove it, with a brand-new session. The call above reports success from an HTTP
    # 200, and Foundry's own save path for this option is odd enough to be worth
    # checking rather than trusting: updateServerConfiguration skips options.save()
    # unless some other field also changed, and the password lands in Config/admin.txt.
    try:
        FoundryAdmin(admin_password=password).authenticate()
    except Exception as exc:  # noqa: BLE001
        print(f"  ✗ the password did not take — a fresh session could not authenticate: "
              f"{exc}", file=sys.stderr)
        return 1

    print(f"  ✓ Foundry's admin password now matches "
          f"{admin_pw.SECRET_NAME} (via {admin_pw.source_of_record()}), verified with "
          f"a fresh session")
    print("  ▸ this also enables: the browser smoke test's passwordless GM login,")
    print("    and graceful world shutdown over the API.")

    # UPnP is the other half of "administration is localhost-only". With it on, Foundry
    # asks the router to map port 30000 on every start, so taking the Cloudflare tunnel
    # down does NOT mean the server is unreachable — and the tunnel's ingress rules,
    # which block /setup, are bypassed entirely by a direct connection to that port.
    if not args.keep_upnp:
        try:
            # The session above was authenticated BEFORE the password existed, so
            # session.admin is still false and this call would be refused. Foundry only
            # sets that flag at the moment of a successful password check.
            fa.reauthenticate()
            if admin_mod.read_options().get("upnp"):
                fa.setup("adminConfigure", config={"upnp": False})
                print("  ✓ UPnP disabled — Foundry no longer asks the router to expose "
                      "port 30000")
            else:
                print("  ▸ UPnP already off")
        except Exception as exc:  # noqa: BLE001
            print(f"  ▸ could not disable UPnP ({exc}) — do it in Setup → Configuration",
                  file=sys.stderr)
    return 0


def cmd_recover_service(args) -> int:
    """Put world + tunnel back after a run that died. What the watchdog calls.

    The watchdog's only evidence of death is 20 minutes of status silence, and a long
    phase can be silent that long while alive. So a live lock owner wins: nothing is
    touched, and a hung-but-alive run is the wrapper's backstop's job (``cli killed``)."""
    from scripts.foundry.update import apply as apply_mod, state

    pid = state.Lock(state.LOCK_DIR).owner().get("pid")
    try:
        alive = pid is not None and state._pid_alive(int(pid))
    except (TypeError, ValueError):
        alive = False
    if alive:
        print(f"  run {pid} still alive — not restoring service")
        return 0
    entry = state.EntryState.read()
    messages: list[str] = []
    if state.release_if_owner_dead():
        messages.append("removed the dead run's lock (make vtt-up refuses while it exists)")
    if not entry:
        print("  nothing to restore — no interrupted run recorded")
        for message in messages:
            print(f"  · {message}")
        return 0
    apply_mod.restore_service(entry, messages)
    for message in messages or ["service restored"]:
        print(f"  · {message}")
    return 0


def cmd_killed(args) -> int:
    """The wrapper's backstop killed the run (``automation/bin/vtt-update.sh``).

    SIGTERM then SIGKILL. On TERM the run ends its ``claude -p``/``node`` children and
    unwinds its ``finally`` blocks (AC-6), which release the lock; but no ``except``
    block ran, so the status still says ``running``, the entry state was not restored
    and nothing was reported (after a KILL, not even the lock was released). The 06:12 watchdog would catch that — but only if the
    kill landed before it, and a slow escalation Saturday can move the kill past it. So
    whoever kills the run cleans up after it: mark the status, put service back the way
    the run found it (what the watchdog would do), release the dead lock, and notify."""
    from scripts.foundry.update import apply as apply_mod, notify, state

    status = state.read_status() or {}
    if status.get("outcome") not in (None, "", "running"):
        print(f"  run {status.get('run_id')} had already finished as "
              f"{status.get('outcome')!r} — nothing to clean up")
        return 0
    run_id, phase = status.get("run_id", "?"), status.get("phase", "?")
    detail = f"killed by the wrapper after {args.after}s, in phase {phase}"
    # phase "killed" is what the watchdog looks for, so it does not alert a second time.
    state.RunStatus(run_id=run_id, started=float(status.get("started") or 0),
                    phase="killed", outcome="failed", detail=detail).write()

    messages: list[str] = []
    entry = state.EntryState.read()
    if entry:
        try:
            apply_mod.restore_service(entry, messages)
        except Exception as exc:  # noqa: BLE001 - still notify
            messages.append(f"could not restore service: {exc}")
    if state.release_if_owner_dead():
        messages.append("released the dead run's lock")
    for message in messages:
        print(f"  · {message}")
    notify.notify("failed", f"update run killed ({run_id})",
                  f"{detail}. Anything it installed is live and untested; nothing was "
                  f"rolled back. " + "; ".join(messages)[:300]
                  + " Restore point: the newest OneDrive snapshot (make foundry-restore).")
    return 0


def _plan_paths(result) -> list[Path]:
    from scripts.foundry.update import escalate
    plans_dir = escalate.PLANS_DIR.resolve()
    out: list[Path] = []
    for rel in (result.escalation or {}).get("plans") or []:
        path = (REPO_ROOT / rel).resolve()
        if path.parent == plans_dir and path.suffix == ".md" and path.is_file():
            out.append(path)
    return out


def _policy() -> dict:
    from scripts.foundry.update import risk
    return risk.load_policy()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="vtt-update", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    scan = sub.add_parser("scan", help="what would change (read-only)")
    scan.add_argument("--foundry", action="store_true",
                      help="also ask the running server (needs no active world)")
    scan.add_argument("--notes", action="store_true", help="fetch release notes too")
    scan.add_argument("--no-forks", action="store_true", help="skip the GitHub fork check")
    scan.add_argument("--escalation", action="store_true",
                      help="also preview escalation facts, floor and ceiling (no LLM)")
    scan.add_argument("--json", action="store_true")
    scan.add_argument("--out", help="also write plan.json here")
    scan.set_defaults(func=cmd_scan)

    run = sub.add_parser("run", help="the full update run")
    run.add_argument("--dry", action="store_true", help="scan and adjudicate, change nothing")
    run.add_argument("--force", action="store_true",
                     help="ignore the pause file, the time window and connected users")
    run.add_argument("--skip-llm", action="store_true",
                     help="no adjudication, no escalation and no written report; holds "
                          "every review item")
    run.set_defaults(func=cmd_run)

    status = sub.add_parser("status", help="what the last run did")
    status.set_defaults(func=cmd_status)

    notify_cmd = sub.add_parser("notify", help="post a notification")
    notify_cmd.add_argument("--demo", action="store_true")
    notify_cmd.add_argument("--kind", default="done", choices=["done", "attention", "failed"])
    notify_cmd.add_argument("--subtitle", default="test")
    notify_cmd.add_argument("--message", default="hello")
    notify_cmd.set_defaults(func=cmd_notify)

    admin_cmd = sub.add_parser(
        "admin-configure",
        help="set Foundry's admin password from the stored secret, and disable UPnP")
    admin_cmd.add_argument("--keep-upnp", action="store_true",
                           help="leave UPnP alone (it exposes port 30000 at the router, "
                                "bypassing the tunnel's admin-surface block)")
    admin_cmd.set_defaults(func=cmd_admin_configure)

    recover_cmd = sub.add_parser("recover-service",
                                 help="restore world + tunnel after an interrupted run")
    recover_cmd.set_defaults(func=cmd_recover_service)

    killed_cmd = sub.add_parser("killed", help="clean up after the wrapper's backstop "
                                               "killed a run (called by vtt-update.sh)")
    killed_cmd.add_argument("--after", type=int, default=0, help="the timeout, seconds")
    killed_cmd.set_defaults(func=cmd_killed)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
