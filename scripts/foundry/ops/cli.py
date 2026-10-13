"""`python -m scripts.foundry.ops <command>` — the Foundry ops surface.

The Makefile used to carry this as inline shell. It is here instead so the logic can
be read, tested and quoted correctly, and so the Makefile can go back to being a list
of the commands worth remembering.

Three layers, and they are not the same thing:

    ops up / down / status      one piece — the Foundry application itself
    ops tunnel-up / -down       one piece — the Cloudflare tunnel
    make vtt-up / vtt-down      the composite: lock check, backup, assets, app, tunnel

`make vtt-up` is what you want at the table. The pieces are what you reach for when
one of them is the thing that's wrong.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from . import (bridge, config as cfg, evallog, index, login as login_mod, modules, pipeline,
               service)
from .out import say


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m scripts.foundry.ops",
        description="Foundry server, tunnel, actor pipeline and module install.",
    )
    sub = p.add_subparsers(dest="command", required=True, metavar="<command>")

    def add(name: str, help_: str) -> argparse.ArgumentParser:
        return sub.add_parser(name, help=help_, description=help_)

    # ── service ──
    add("up", "Start the Foundry application and wait for it to answer.")
    lg = add("login", "Pick a campaign and a user, and open the browser inside the world.")
    lg.add_argument("--user", help="log in as this user; skips the picker")
    lg.add_argument("--world", help="world to end up in; skips the picker. Switching away "
                                    f"from a running world deactivates it (default: {cfg.WORLD_NAME})")
    lg.add_argument("--no-open", action="store_true",
                    help="print the handoff URL instead of opening the default browser")
    lg.add_argument("--no-prompt", action="store_true",
                    help="never show a picker; take the defaults (for scripts)")
    lg.add_argument("--host", type=login_mod.loopback_host, metavar="HOST",
                    help="browser-facing loopback host: localhost, 127.0.0.1 or <name>.localhost "
                         "(e.g. zz1.localhost); any name but the GM's gives a player tab its own "
                         "session beside the GM's localhost tab (default: the host in FOUNDRY_URL)")
    add("down", "Quit Foundry gracefully.")
    st = add("status", "Foundry, tunnel, and what players actually get.")
    st.add_argument("--json", action="store_true",
                    help="print {foundry, tunnel, public} as JSON instead of prose")
    add("lock-check", "Fail if an auto-update run holds the lock.")
    add("tunnel-up", "Start the Cloudflare tunnel.")
    add("tunnel-down", "Stop the Cloudflare tunnel.")
    add("tunnel-setup", "One-time: authenticate, create the tunnel, route DNS.")
    bs = add("bridge-status", "MCP bridge processes: which are live sessions, which are orphans, "
                              "and who holds the websocket ports.")
    bs.add_argument("--json", action="store_true", help="print the scan as JSON (same exit code)")
    bc = add("bridge-clean", "Kill orphaned MCP bridge processes. Never touches a server "
                             "whose parent is a live Claude session.")
    bc.add_argument("--dry-run", action="store_true", help="list what would be killed")
    er = add("eval-report", "What the MCP action logs show: eval-js outcomes, the "
                            "game.pentaryn paths it reaches (promotion candidates), discovery "
                            "calls, top errors, per-tool counts. Read-only.")
    er.add_argument("--since", metavar="DATE", help="only lines at or after this ISO date/time")
    er.add_argument("--json", action="store_true", help="print the report as JSON")
    er.add_argument("--dir", metavar="PATH", type=Path,
                    help="log folder (default: $PENTARYN_MCP_LOG_DIR, else foundry/logs)")
    logs = add("tunnel-logs", "Tail the tunnel log.")
    logs.add_argument("-n", "--lines", type=int, default=40)

    # ── actor pipeline ──
    add("actors", "Stage 1 — regenerate foundry/build/actors.json.")
    add("stage", "Copy the importer module + actors.json into Foundry's Data/.")
    add("importer-install", "Check, then install the importer module alone (no actors.json).")
    add("import", "The Stage 2 loop: stage, wait for the browser import, delete, verify.")
    add("clean", "Delete the staged actors.json, then prove it 404s publicly.")
    add("clean-only", "Delete the staged actors.json without verifying.")
    add("verify", "Assert the staged actors.json is not served publicly.")

    # ── modules ──
    # Derived, not hardcoded: adding a ModuleSpec is enough to make it syncable, and
    # `syncable=False` on the spec (the importer) keeps it out (EXT-6).
    names = sorted(k for k, s in cfg.MODULES.items() if s.syncable)
    mcheck = add("module-check", "Prove a module's sources before it can reach Foundry.")
    # `importer` is checkable but not syncable: the actor pipeline stages it, and a
    # `module-sync importer` would put a second copy where Foundry loads modules from.
    mcheck.add_argument("module", nargs="?", choices=sorted(cfg.MODULES))
    mcheck.add_argument("--all", action="store_true",
                        help="every registered module; keeps going past a failure")
    mcheck.add_argument("--json", action="store_true",
                        help="print {module, ok, gates} (a list with --all) instead of prose; "
                             "same exit code")
    msync = add("module-sync", "Check, then copy a module into Foundry's Data/modules.")
    msync.add_argument("module", choices=names)
    # ── blueprint (scripts/foundry/blueprint/; playbook context/foundry/addon-blueprint.md) ──
    # These rows exist for `--help`; _WRAPPERS below does the routing.
    rest = "arguments passed through unchanged"
    mnew = add("module-new", "Generate a module from the blueprint template: "
                             "<short> --title 'Pentaryn …' [--tier full|small] [--kit a,b] … "
                             "(new_module.py; writes under foundry/module/)")
    mnew.add_argument("args", nargs=argparse.REMAINDER, help=rest)
    mven = add("module-vendor", "Vendor the shared kit or prove the copies: "
                                "sync|check <module…|--all> [--tier] [--kit] [--json] (vendor.py)")
    mven.add_argument("args", nargs=argparse.REMAINDER, help=rest)
    mcon = add("module-conformance", "Score modules against the blueprint: "
                                     "[--module m…] [--json|--markdown] (conformance.py)")
    mcon.add_argument("args", nargs=argparse.REMAINDER, help=rest)

    midx = add("module-index", "Regenerate the Module APIs table in context/foundry/README.md.")
    midx.add_argument("--check", action="store_true", help="exit 1 when the table is stale; write nothing")

    add("walls-wasm", "Build the compiled (WASM) wall engine.")
    bench = add("walls-bench", "Scaling curve for the wall engine.")
    bench.add_argument("grid", nargs="?", help="grid size to extend the sweep to")

    return p


# The blueprint wrappers hand everything after the command to their script unchanged.
# argparse's REMAINDER rejects a first token that starts with `-` (`--module`, `--json`),
# so these are dispatched before parsing; the wrapped script owns its own `--help`.
# `ops -- module-new …` still reaches argparse and is routed here after parsing.
_WRAPPERS = {
    "module-new": lambda rest: modules.module_new(rest),
    "module-vendor": lambda rest: modules.module_vendor(rest),
    "module-conformance": lambda rest: modules.module_conformance(rest),
}


def eval_report(log_dir: Path | None, *, since: str | None, as_json: bool) -> int:
    """mcp-fork-25: the monthly action-log review as one command (evallog.py)."""
    log_dir = log_dir or Path(os.environ.get("PENTARYN_MCP_LOG_DIR") or cfg.OPS_LOG_DIR)
    if not log_dir.is_dir():
        say(f"✗ no log folder at {log_dir}")
        return 1
    r = evallog.report(log_dir, since=since)
    if as_json:
        print(json.dumps(evallog.to_json(r), indent=2, ensure_ascii=False))
        return 0
    for line in evallog.render(r):
        say(line)
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] in _WRAPPERS:
        return _WRAPPERS[argv[0]](argv[1:])
    parser = build_parser()
    args = parser.parse_args(argv)
    c = args.command
    if c in _WRAPPERS:       return _WRAPPERS[c](args.args)

    if c == "up":            return service.up()
    if c == "login":         return login_mod.login(
                                 user=args.user, world=args.world,
                                 open_browser=not args.no_open,
                                 prompt=False if args.no_prompt else None,
                                 host=args.host)
    if c == "down":          return service.down()
    if c == "status":        return service.status(as_json=args.json)
    if c == "lock-check":    return service.lock_check()
    if c == "tunnel-up":     return service.tunnel_up()
    if c == "tunnel-down":   return service.tunnel_down()
    if c == "tunnel-setup":  return service.tunnel_setup()
    if c == "tunnel-logs":   return service.tunnel_logs(args.lines)
    if c == "bridge-status": return bridge.status(as_json=args.json)
    if c == "bridge-clean":  return bridge.clean(dry_run=args.dry_run)
    if c == "eval-report":   return eval_report(args.dir, since=args.since, as_json=args.json)

    if c == "actors":        return pipeline.build_actors()
    if c == "stage":         return pipeline.stage()
    if c == "importer-install": return pipeline.install_importer()
    if c == "import":        return pipeline.run_import()
    if c == "clean":         return pipeline.clean()
    if c == "clean-only":    return pipeline.clean_only()
    if c == "verify":        return pipeline.verify()

    if c == "module-check":
        if args.all == bool(args.module):
            parser.error("module-check: name one module or pass --all")
        if args.all:
            return modules.check_all(as_json=args.json)
        if args.json:
            report = modules.check_report(args.module)
            print(json.dumps(report, indent=2, ensure_ascii=False))
            return 0 if report["ok"] else 1
        return modules.check(args.module)
    if c == "module-sync":   return modules.sync(args.module)
    if c == "module-index":  return index.main(check=args.check)
    if c == "walls-wasm":    return modules.walls_wasm()
    if c == "walls-bench":   return modules.walls_bench(args.grid)

    raise AssertionError(f"unrouted command {c!r}")  # pragma: no cover


if __name__ == "__main__":
    sys.exit(main())
