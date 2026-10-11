#!/usr/bin/env python3
"""The boot choice: start from the newest cloud snapshot, or from the local world?

Design §6 (``context/plans/rclone-two-hosts-2026-10.md``). Joe almost always boots on
the primary (the Mac). When he boots the alt, he wants the primary's latest world — so
when the cloud holds a snapshot **newer than what this machine's world is based on**,
the boot step says so and offers it as the default:

* at a terminal: one question, Enter = take the newest (download it, archive the local
  world first, extract), ``k`` = keep local (remembered until something newer appears);
* without a terminal (launchd, an agent, ``ssh`` without ``-t``): never restores — boots
  local and prints one line saying exactly how to take the newer one, and remembers it
  as pending so this host's next backup cannot bury it (asked at the next terminal);
* a newer snapshot that does not contain this world's based-on one (its ``.parent``
  lineage lacks it) is "diverged": offered, but Enter keeps local;
* ``FROM=latest | local | <snapshot name>`` decides without asking.

"Newer" is by the cloud listing's mtime (the only clock comparable across hosts) and
"based on" is the local record in ``bootstate.py``. A snapshot this host just uploaded
is its own based-on, so the primary is asked only when the alt has really been used
since; restore safety copies and ``major-release/`` are never offered as "newer".

A cloud problem never blocks a boot: it boots local with a warning and exits 0. Only an
explicit ``FROM=<bad name>`` or a chosen restore that fails exits non-zero.

    python -m scripts.foundry.boot choose [--from latest|local|<name>] [--non-interactive] [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone

from scripts.foundry import bootstate, cloud, host
from scripts.foundry import storage as storage_mod
from scripts.foundry.cloud import Snapshot
from scripts.foundry.storage import StorageError

OK, FAIL = 0, 1
MAX_OTHERS = 5


class BootError(RuntimeError):
    """An explicit choice that cannot be honoured (a FROM= name that does not exist)."""


@dataclass
class Decision:
    action: str                    # "local" | "restore"
    snapshot: Snapshot | None
    why: str
    warning: str | None = None
    remember_keep_local: str | None = None   # the snapshot declined with "k"
    remember_keep_local_mtime: float | None = None
    # How the offered snapshot relates to this world. "newer": take it is the default.
    # "unknown": no based-on record and the local files are newer than it — local is.
    # "diverged": it does not contain what this world is based on — local is.
    relation: str = "newer"
    based_on: str | None = None              # this world's based-on, for the wording
    newest: bool = True                      # the offer is the newest (FROM=latest works)
    clear_pending: bool = False              # the pending notice is moot (gone, or had)

    def to_json(self) -> dict:
        s = self.snapshot
        return {"action": self.action, "why": self.why, "warning": self.warning,
                "relation": self.relation,
                "snapshot": None if s is None else {
                    "name": s.name, "host": s.host_label, "core": s.core, "size": s.size,
                    "mtime": s.mtime, "folder": s.folder}}


def say(msg: str) -> None:
    print(f"  {msg}", flush=True)


def _isatty() -> bool:
    try:
        return sys.stdin.isatty() and sys.stdout.isatty()
    except (AttributeError, ValueError):
        return False


def is_interactive() -> bool:
    return _isatty() and not os.environ.get("PENTARYN_NONINTERACTIVE")


def _utc(ts: float | None) -> str:
    if ts is None:
        return "?"
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _gb(n: int) -> str:
    return f"{n / 1e9:.1f} GB" if n >= 1e8 else f"{n / 1e6:.1f} MB"


def notice_line(newest: Snapshot, state: bootstate.BootState, relation: str = "newer",
                is_newest: bool = True) -> str:
    based = state.based_on or "an unknown snapshot"
    if relation == "unknown":
        how = ("may be newer than this world (cannot tell: no record of what it is based "
               "on, and its files changed after that snapshot)")
    elif relation == "diverged":
        how = (f"is newer but diverged — does not contain {based}, which this world is "
               "based on")
    else:
        how = f"is newer than this world (based on {based})"
    use = "FROM=latest" if is_newest else f"FROM={newest.name}"
    return (f"▸ boot: cloud snapshot {newest.name} ({newest.host_label}, {_utc(newest.mtime)}) "
            f"{how}; booting LOCAL. To use it: "
            f"make foundry-up {use}   (or: make foundry-restore SNAP={newest.name}). "
            "Asked again at the next boot with a terminal.")


def _ops_log(decision: Decision, from_: str | None, interactive: bool) -> None:
    """One line in foundry/logs/ops-YYYY-MM.jsonl; never fails a boot."""
    try:
        from scripts.foundry.ops import config as cfg
        from scripts.foundry.ops.out import append_jsonl, event, now_iso
        ts = now_iso()
        line = {"ts": ts, "cmd": "boot", "host": host.host_name(), "action": decision.action,
                "snapshot": decision.snapshot.name if decision.snapshot else None,
                "why": decision.why, "from": from_, "interactive": interactive}
        append_jsonl(cfg.OPS_LOG_DIR / f"ops-{ts[:7]}.jsonl", line)
        event("boot", **{k: v for k, v in line.items() if k != "ts"})
    except Exception:  # noqa: BLE001
        pass


# ── the algorithm (§6.2) ─────────────────────────────────────────────────────

def decide(from_: str | None, interactive: bool, *, st=None, adopt: bool = True) -> Decision:
    from_ = (from_ or "").strip() or None

    # 1. never restore under a live server
    if host.is_running():
        return Decision("local", None, "Foundry already up")

    # 2. the cloud listing; any failure → boot local with a warning
    try:
        st = st or storage_mod.get()
        snaps = cloud.all_snapshots(st)
    except StorageError as exc:
        verb = f"{exc.verb} " if exc.verb else ""
        return Decision("local", None, "cloud unreachable",
                        warning=f"cloud unreachable ({verb}failed: {exc}): booting the local world")

    state = bootstate.load()
    warning = None
    if state.corrupt:
        warning = f"{bootstate.path()} is unreadable — treating this world's origin as unknown"
    elif adopt:
        state = cloud.adopt_legacy_marker(st, state)

    rolling = [s for s in snaps if s.folder == cloud.WORLD_BACKUPS and not s.safety]
    newest = cloud.newest(rolling)

    # 3–5. FROM= decides without asking
    if from_ == "local":
        return Decision("local", None, "FROM=local", warning=warning)
    if from_ == "latest":
        if newest is None:
            return Decision("local", None, "FROM=latest",
                            warning="FROM=latest but the cloud has no snapshots")
        return Decision("restore", newest, "FROM=latest", warning=warning)
    if from_:
        chosen = next((s for s in snaps if s.name == from_), None)
        if chosen is None:
            names = "\n".join(f"      {s.name}" for s in cloud.by_mtime(snaps)) or "      (none)"
            raise BootError(f"FROM={from_}: no such snapshot. The cloud has:\n{names}")
        return Decision("restore", chosen, f"FROM={from_}", warning=warning)

    # 6.
    if newest is None:
        return Decision("local", None, "cloud has no snapshots", warning=warning)

    # 7. newer = a different snapshot with a later listing mtime than the based-on one.
    #    With no based-on record, the local files are the only clock: a snapshot older
    #    than them cannot be called newer, so "cannot tell" and local is the default.
    #    A newer one whose lineage lacks the based-on snapshot has "diverged": it is
    #    missing work this world has, so it is offered, never the default.
    contains = {state.based_on, *state.lineage} - {None}
    offer, relation, clear = None, "newer", False
    if state.based_on is None or state.based_on_mtime is None:
        offer = newest
        local_m = cloud.local_tree_mtime()
        if local_m is not None and newest.mtime <= local_m:
            relation = "unknown"
    elif (newest.name != state.based_on and newest.mtime > state.based_on_mtime
          and newest.name not in contains):
        offer = newest
        if cloud.descends(st, newest, state.based_on) is False:
            relation = "diverged"

    # 7b. a snapshot an earlier no-terminal boot noticed, which this host's own backup
    #     has since outdated by mtime: still unseen, so still offered until answered.
    if offer is None and state.pending_newer:
        p = next((s for s in rolling if s.name == state.pending_newer), None)
        if p is not None and p.name not in contains:
            offer = p
            relation = "newer" if cloud.descends(st, p, state.based_on) else "diverged"
        else:
            clear = True
    if offer is None:
        return Decision("local", None, "local world is based on the newest snapshot",
                        warning=warning, clear_pending=clear)
    is_newest = offer.name == newest.name

    # 8. declined earlier: by name, and by mtime — the declined one may since have been
    #    coalesced or pruned away, leaving an older snapshot newest; that is not news.
    declined_at = state.keep_local_mtime
    if state.keep_local_until_newer_than and (
            state.keep_local_until_newer_than == offer.name
            or (declined_at is not None and offer.mtime <= declined_at)):
        return Decision("local", None, "you chose to keep the local world over "
                        f"{state.keep_local_until_newer_than} earlier",
                        warning=warning, clear_pending=True)

    # 9.
    if not interactive:
        return Decision("local", offer, "newer snapshot, no terminal — notice only",
                        warning=warning, relation=relation, based_on=state.based_on,
                        newest=is_newest)

    # 10.
    return _prompt(offer, rolling, state, warning, relation)


def _prompt(newest: Snapshot, rolling: list[Snapshot], state: bootstate.BootState,
            warning: str | None, relation: str = "newer") -> Decision:
    """Ask about `newest` — the snapshot on offer (normally the newest in the cloud)."""
    others = [s for s in sorted(rolling, key=lambda s: (s.mtime, s.name), reverse=True)
              if s.name != newest.name][:MAX_OTHERS]
    local_default = relation != "newer"
    print()
    if relation == "unknown":
        say("▸ cannot tell which is newer: this machine has no record of which snapshot its "
            "world is based on, and its files changed after the newest cloud snapshot:")
    elif relation == "diverged":
        say(f"▸ cloud has a newer world snapshot, but it diverged — does not contain "
            f"{state.based_on}, which this machine's world is based on. Taking it would set "
            "aside this world's work (archived first); keeping local is the default:")
    else:
        say("▸ cloud has a newer world snapshot than this machine's world:")
    if state.pending_newer == newest.name:
        say("  (a boot without a terminal noticed it earlier)")
    print()
    say(f"    cloud    {newest.name}   {newest.host_label}   {_utc(newest.mtime)}   "
        f"{newest.core or '?'}   {_gb(newest.size)}")
    if state.based_on:
        say(f"    local    based on {state.based_on}   {state.based_on_host or 'untagged'}   "
            f"{_utc(state.based_on_mtime)}")
    else:
        say("    local    (no record of which snapshot this world is based on)")
    mine = host.core_version()
    if newest.core and newest.core != "unknown" and mine != "unknown" and newest.core != mine:
        say(f"  ! snapshot is from Foundry {newest.core}, this machine runs {mine} — Foundry "
            "will migrate on first launch; a major-generation jump may not be reversible")
    if others:
        print()
        say("  other snapshots (restore with FROM=<name>):")
        for i, s in enumerate(others, start=2):
            say(f"    {i}  {s.name}   {s.host_label}   {_utc(s.mtime)}")
    say("  (untagged and major-release snapshots: make foundry-restore)")
    print()
    question = ("  boot from latest or keep [local]?  (Enter = local, l/latest, k/local, "
                "or a number)  > " if local_default else
                "  boot from [latest] or keep local?  (Enter = latest, l/latest, k/local, "
                "or a number)  > ")
    for _ in range(3):
        try:
            ans = input(question).strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return Decision("local", None, "no answer — booting local", warning=warning)
        if ans == "":
            ans = "k" if local_default else "l"
        if ans in ("l", "latest"):
            return Decision("restore", newest, "you chose the offered snapshot", warning=warning)
        if ans in ("k", "local", "keep"):
            return Decision("local", None, "you chose to keep the local world",
                            warning=warning, remember_keep_local=newest.name,
                            remember_keep_local_mtime=newest.mtime)
        if ans.isdigit():
            n = int(ans)
            if n == 1:
                return Decision("restore", newest, "you chose the offered snapshot",
                                warning=warning)
            if 2 <= n < 2 + len(others):
                return Decision("restore", others[n - 2], f"you chose #{n}", warning=warning)
        say(f"? {ans!r} — Enter, l, k, or a listed number")
    return Decision("local", None, "no valid answer — booting local", warning=warning)


# ── acting on it ─────────────────────────────────────────────────────────────

def choose(from_: str | None = None, interactive: bool | None = None) -> int:
    """Decide, say why, and act (restore if chosen). Exit status for the make step."""
    from_ = from_ if from_ is not None else os.environ.get("FROM")
    interactive = is_interactive() if interactive is None else interactive
    try:
        d = decide(from_, interactive)
    except BootError as exc:
        print(f"  ✗ {exc}", file=sys.stderr)
        return FAIL
    except host.HostError as exc:
        print(f"  ✗ {exc}", file=sys.stderr)
        return FAIL
    _ops_log(d, from_, interactive)
    if d.warning:
        say(f"⚠ {d.warning}")

    if d.action == "local":
        if d.snapshot is not None:          # the non-interactive notice (§6.4)
            state = bootstate.load()
            say(notice_line(d.snapshot, state, d.relation, d.newest))
            # Remembered, so this host's next backup (which makes the local world the
            # newest by mtime) cannot bury it: shown again until answered at a terminal.
            state.set_pending(d.snapshot.name, d.snapshot.mtime)
        elif d.remember_keep_local:
            bootstate.load().remember_keep_local(d.remember_keep_local,
                                                 d.remember_keep_local_mtime)
            say(f"▸ boot: keeping the local world (not asked again until a snapshot newer "
                f"than {d.remember_keep_local} appears)")
        else:
            if d.clear_pending:
                bootstate.load().clear_pending()
            say(f"▸ boot: local world ({d.why})")
        return OK

    snap = d.snapshot
    say(f"▸ boot: restoring {snap.name} ({snap.host_label}, {_utc(snap.mtime)}) — {d.why}")
    try:
        cloud.restore_snapshot(storage_mod.get(), snap, reason="boot")
    except SystemExit as exc:
        if exc.code not in (0, None):
            print("  ✗ the chosen restore did not complete — Foundry was not started.\n"
                  "    boot the local world instead: make foundry-up FROM=local",
                  file=sys.stderr)
            return FAIL
    except StorageError as exc:
        print(f"  ✗ restore failed: {exc}\n"
              "    boot the local world instead: make foundry-up FROM=local", file=sys.stderr)
        return FAIL
    return OK


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="the boot choice: newest cloud snapshot or local")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("choose", help="decide (and restore if chosen)")
    c.add_argument("--from", dest="from_", default=None,
                   help="latest | local | <snapshot name> (default: $FROM)")
    c.add_argument("--non-interactive", action="store_true",
                   help="never prompt: boot local with a notice when the cloud is newer")
    c.add_argument("--json", action="store_true",
                   help="print the decision without acting (implies --non-interactive)")
    args = ap.parse_args(argv)

    from_ = args.from_ if args.from_ is not None else os.environ.get("FROM")
    if args.json:
        try:
            d = decide(from_, False, adopt=False)
        except BootError as exc:
            print(json.dumps({"action": "error", "why": str(exc)}))
            return FAIL
        print(json.dumps(d.to_json(), indent=2))
        return OK
    return choose(from_, False if args.non_interactive else None)


if __name__ == "__main__":
    sys.exit(main())
