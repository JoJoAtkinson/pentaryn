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
import sys

from . import config as cfg, login as login_mod, modules, pipeline, service


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
    add("down", "Quit Foundry gracefully.")
    add("status", "Foundry, tunnel, and what players actually get.")
    add("lock-check", "Fail if an auto-update run holds the lock.")
    add("tunnel-up", "Start the Cloudflare tunnel.")
    add("tunnel-down", "Stop the Cloudflare tunnel.")
    add("tunnel-setup", "One-time: authenticate, create the tunnel, route DNS.")
    logs = add("tunnel-logs", "Tail the tunnel log.")
    logs.add_argument("-n", "--lines", type=int, default=40)

    # ── actor pipeline ──
    add("actors", "Stage 1 — regenerate foundry/build/actors.json.")
    add("stage", "Copy the importer module + actors.json into Foundry's Data/.")
    add("import", "The Stage 2 loop: stage, wait for the browser import, delete, verify.")
    add("clean", "Delete the staged actors.json, then prove it 404s publicly.")
    add("clean-only", "Delete the staged actors.json without verifying.")
    add("verify", "Assert the staged actors.json is not served publicly.")

    # ── modules ──
    # Derived, not hardcoded: adding a ModuleSpec is enough to make it syncable.
    # "importer" is excluded because the actor pipeline stages it, not module-sync.
    names = sorted(k for k in cfg.MODULES if k != "importer")
    mcheck = add("module-check", "Prove a module's sources before it can reach Foundry.")
    mcheck.add_argument("module", choices=names)
    msync = add("module-sync", "Check, then copy a module into Foundry's Data/modules.")
    msync.add_argument("module", choices=names)
    add("walls-wasm", "Build the compiled (WASM) wall engine.")
    bench = add("walls-bench", "Scaling curve for the wall engine.")
    bench.add_argument("grid", nargs="?", help="grid size to extend the sweep to")

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    c = args.command

    if c == "up":            return service.up()
    if c == "login":         return login_mod.login(
                                 user=args.user, world=args.world,
                                 open_browser=not args.no_open,
                                 prompt=False if args.no_prompt else None)
    if c == "down":          return service.down()
    if c == "status":        return service.status()
    if c == "lock-check":    return service.lock_check()
    if c == "tunnel-up":     return service.tunnel_up()
    if c == "tunnel-down":   return service.tunnel_down()
    if c == "tunnel-setup":  return service.tunnel_setup()
    if c == "tunnel-logs":   return service.tunnel_logs(args.lines)

    if c == "actors":        return pipeline.build_actors()
    if c == "stage":         return pipeline.stage()
    if c == "import":        return pipeline.run_import()
    if c == "clean":         return pipeline.clean()
    if c == "clean-only":    return pipeline.clean_only()
    if c == "verify":        return pipeline.verify()

    if c == "module-check":  return modules.check(args.module)
    if c == "module-sync":   return modules.sync(args.module)
    if c == "walls-wasm":    return modules.walls_wasm()
    if c == "walls-bench":   return modules.walls_bench(args.grid)

    raise AssertionError(f"unrouted command {c!r}")  # pragma: no cover


if __name__ == "__main__":
    sys.exit(main())
