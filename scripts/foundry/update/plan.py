#!/usr/bin/env python3
"""Assemble the run plan: what is installed, what moved upstream, and what to do.

Runs in two modes.

**Standalone** needs nothing but the network. It reads the installed manifests off disk
and resolves each upstream, so ``make vtt-update-dry`` can be run at any time — mid
session, world up, whatever — without disturbing anything. That matters: a dry run that
required taking the world down would never get used.

**Foundry-assisted** additionally asks the running server, parked at its setup screen,
for ``checkPackage`` on every package and ``updateCheck`` + ``previewCompatibility`` for
the core. That is where Foundry's own compatibility engine gets to weigh in, and it is
the mode the real Saturday run uses. It requires no world to be active — every package
action 403s otherwise.

The output is ``plan.json``: the whole machine-readable record the adjudicator reads,
the applier acts on, and the report is written from.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from scripts.foundry.update import forks as forks_mod
from scripts.foundry.update.upstream import is_newer
from scripts.foundry.update import inventory, risk, upstream
from scripts.foundry.update.admin import FoundryAdmin, FoundryError

REPO_ROOT = Path(__file__).resolve().parents[3]


def build(*, admin: FoundryAdmin | None = None, notes: bool = True,
          check_forks: bool = True, policy: dict | None = None) -> dict:
    """Produce the plan. ``admin`` enables the Foundry-assisted extras."""
    policy = policy if policy is not None else risk.load_policy()
    started = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    packages = inventory.scan()
    installed_ids = {p.id for p in packages}
    seen = risk.load_seen()

    # Core/system versions come from the server when it is up, and from disk otherwise,
    # so a standalone dry run is still accurate.
    core_version, system_version, active_world = _versions(admin, packages)

    resolved = upstream.resolve_all(packages, notes=notes)

    decisions: list[risk.Decision] = []
    for pkg in packages:
        up = resolved[pkg.id]
        d = risk.classify_package(
            pkg, up, policy=policy, core_version=core_version,
            system_version=system_version, installed_ids=installed_ids, seen=seen,
        )
        # Foundry's own opinion, when we can get it — it knows about sidegrades and
        # per-system compatibility that a bare manifest read does not.
        if admin and d.bucket in (risk.AUTO, risk.REVIEW):
            _apply_foundry_check(admin, pkg, d)
        decisions.append(d)

    core_decision = _core_decision(admin, core_version, policy)

    plan = {
        "generated": started,
        "mode": "foundry" if admin else "standalone",
        "core": {"installed": core_version, "channel": policy.get("channel", "stable")},
        "system": {"id": "dnd5e", "installed": system_version},
        "active_world_at_scan": active_world,
        "worlds": inventory.worlds(),
        "counts": {k: sum(1 for p in packages if p.kind == k)
                   for k in ("tracked", "protected", "local", "forked", "untracked")},
        "local_drift": inventory.local_drift(packages),
        "decisions": [d.to_json() for d in ([core_decision] + decisions)],
        "upstream": {k: v.to_json(scrub=True) for k, v in resolved.items()},
        "forks": [f.to_json() for f in (forks_mod.check(packages) if check_forks else [])],
    }
    plan["buckets"] = {
        bucket: [d["id"] for d in plan["decisions"] if d["bucket"] == bucket]
        for bucket in (risk.AUTO, risk.REVIEW, risk.HOLD)
    }
    return plan


def _versions(admin: FoundryAdmin | None,
              packages: list[inventory.Package]) -> tuple[str, str | None, str | None]:
    system = next((p.version for p in packages if p.type == "system"), None)
    if admin:
        try:
            st = admin.status()
            return st.version or "", st.system_version or system, st.world
        except Exception:
            pass
    # No server: the app bundle's package.json is the authority on the core version.
    try:
        pkg = json.loads((Path("/Applications/Foundry Virtual Tabletop.app"
                               "/Contents/Resources/app/package.json")).read_text())
        rel = pkg.get("release", {})
        core = f"{rel.get('generation')}.{rel.get('build')}"
    except (OSError, json.JSONDecodeError):
        core = ""
    return core, system, None


def _apply_foundry_check(admin: FoundryAdmin, pkg: inventory.Package,
                         d: risk.Decision) -> None:
    """Fold Foundry's ``checkPackage`` verdict into a decision.

    It throws for packages with no manifest URL, which is normal rather than
    exceptional, so a failure here downgrades confidence instead of failing the run.
    """
    try:
        result = admin.check_package(pkg.type, pkg.id)
    except (FoundryError, Exception) as exc:  # noqa: BLE001 - deliberately broad
        d.reasons.append(f"Foundry's own check was unavailable ({exc})")
        return

    if result.get("isDowngrade"):
        d.bucket = risk.HOLD
        d.reasons.append("Foundry reports the upstream version as a downgrade")
        return
    if result.get("trackChange"):
        d.bucket = risk.REVIEW
        d.reasons.append("Foundry suggests a manifest track change — the package moved "
                         "its release channel; confirm before following it")
    incompatible = [
        f"{k} {v.get('version')}"
        for k, v in (result.get("systemCompatibility") or {}).items()
        if v.get("compatible") is False
    ]
    if incompatible:
        d.bucket = risk.HOLD
        d.reasons.append("incompatible with installed system(s): " + ", ".join(incompatible))
    # Foundry resolves the package's DECLARED manifest URL. When that URL is pinned to
    # a specific release — `multi-token-edit` points at .../releases/download/3.2.5/ —
    # it reports the installed version as "latest" forever, which is exactly the case
    # `trackChange` above is flagging. Adopting that verdict would undo the GitHub
    # fallback that found the real latest, and turn the install into a silent no-op.
    # So take Foundry's answer only when it is NEWER; never let it walk the target back.
    remote = result.get("remote") or {}
    remote_version = remote.get("version")
    if remote_version and remote_version != d.target:
        if is_newer(remote_version, d.target or d.installed):
            d.reasons.append(f"Foundry resolves a newer target: {remote_version}")
            d.target = remote_version
        else:
            d.reasons.append(
                f"Foundry's manifest resolves to {remote_version} (its manifest URL is "
                f"pinned); keeping {d.target} from the release feed")


def _normalise_release(target: dict | None) -> dict | None:
    """Give a ``ReleaseData`` payload a usable ``version``.

    ``updateCheck`` serialises the release as ``{generation, build, channel, suffix,
    node_version, time, flags, notes}`` — with **no ``version``**, because on the
    server ``ReleaseData.version`` is a getter and getters do not survive
    ``res.json()``. Keying on ``version`` therefore made every check look like "no
    update available", silently, forever: verified against the live licence server,
    which was offering 14.367 while this reported nothing.
    """
    if not target or target.get("version"):
        return target
    generation, build = target.get("generation"), target.get("build")
    if generation is None or build is None:
        return target
    return dict(target, version=f"{generation}.{build}")


def _core_decision(admin: FoundryAdmin | None, core_version: str,
                   policy: dict) -> risk.Decision:
    if not admin:
        d = risk.Decision(id="core", type="core", bucket=risk.SKIP,
                          installed=core_version, target=None, bump="none")
        d.reasons = ["core update check needs the running server (licence-authenticated "
                     "POST /update) — not available in a standalone scan"]
        return d
    try:
        target = admin.update_check(policy.get("channel", "stable"))
    except Exception as exc:  # noqa: BLE001
        d = risk.Decision(id="core", type="core", bucket=risk.HOLD,
                          installed=core_version, target=None, bump="none")
        d.reasons = [f"core update check failed: {exc}"]
        return d

    target = _normalise_release(target)
    if not target or not target.get("version") or target.get("info"):
        d = risk.Decision(id="core", type="core", bucket=risk.SKIP,
                          installed=core_version, target=None, bump="none")
        # Record what the licence server actually said. `Updater.check()` returns null
        # whenever `latest_release` is not newer than the running build, and Foundry
        # then substitutes `{info: "SETUP.UpdateNotAvailable"}` — which is
        # indistinguishable from a failed or throttled check unless the raw payload is
        # kept. Worth the two lines: "no core update available" was reported on a day
        # the website was advertising a newer stable, and there was nothing to inspect.
        d.reasons = [f"no core update available — licence server replied: "
                     f"{json.dumps(target)[:300] if target else 'null'}"]
        return d

    preview = None
    if risk.generation(str(target["version"])) == risk.generation(core_version):
        # previewCompatibility constructs a ReleaseData from what we pass, so it needs
        # generation/build/channel — the normalised dict carries all of them.
        try:
            preview = admin.preview_compatibility(target)
        except Exception as exc:  # noqa: BLE001
            preview = None
            # A missing preview must not read as "clean" — say so, and let classify_core
            # see an empty preview while the reason is on the record.
            target = dict(target, _preview_error=str(exc))
    return risk.classify_core(core_version, target, preview, policy=policy)


def write(plan: dict, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
    return path


def render_text(plan: dict) -> str:
    """The human view of a plan, used by ``vtt-update-dry`` and as the fallback report."""
    lines: list[str] = []
    core = plan["core"]
    lines.append(f"Foundry core {core['installed']}  ·  dnd5e "
                 f"{plan['system']['installed']}  ·  channel {core['channel']}")
    lines.append(f"scanned {plan['generated']}  ({plan['mode']} mode)")
    lines.append("")

    for bucket, title in ((risk.AUTO, "APPLY"), (risk.REVIEW, "REVIEW (Claude decides)"),
                          (risk.HOLD, "HOLD (needs you)")):
        rows = [d for d in plan["decisions"] if d["bucket"] == bucket]
        if not rows:
            continue
        lines.append(f"── {title} ──")
        for d in rows:
            arrow = f"{d['installed']} → {d['target']}" if d["target"] else d["installed"]
            lines.append(f"  {d['id']:<36} {arrow}")
            for reason in d["reasons"]:
                lines.append(f"       · {reason}")
        lines.append("")

    if plan["local_drift"]:
        lines.append("── LOCAL MODULE DRIFT ──")
        for item in plan["local_drift"]:
            lines.append(f"  {item['id']:<36} Data/={item['installed']} "
                         f"repo={item['repo']}  ({item['note']})")
        lines.append("")

    if plan["forks"]:
        lines.append("── FORKS ──")
        for f in plan["forks"]:
            lines.append(f"  {f['fork']}  ahead {f['ahead']} / behind {f['behind']}")
            for note in f["notes"]:
                lines.append(f"       · {note}")
        lines.append("")

    counts = plan["counts"]
    lines.append(f"{counts['tracked']} tracked · {counts['protected']} premium · "
                 f"{counts['local']} local · {counts['forked']} forked")
    return "\n".join(lines)
