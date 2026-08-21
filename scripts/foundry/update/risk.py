#!/usr/bin/env python3
"""Deterministic bucketing: what applies unattended, what needs a brain, what waits.

This is the half of the decision that must not depend on an LLM. It runs on version
numbers, compatibility windows and declared relationships — all machine-checkable — and
it errs toward ``hold``. The adjudicator can only ever move things *out* of ``review``;
it can never promote something this module put in ``hold``.

Three buckets:

``auto``    apply without asking. Patch/minor bumps whose compatibility and
            relationships all check out against what is installed.
``review``  hand to Claude with the release notes. Major bumps, packages never seen
            before, and anything Foundry's own compatibility preview flagged.
``hold``    do not apply; report it. Core generation changes, anything that would
            need a core upgrade we are not doing, anything unresolvable.

"Never seen before" is tracked in ``.state/vtt-update.seen.json``. A module Joe
installed on Thursday should not silently auto-update on Saturday before anyone has
looked at it once.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from scripts.foundry.update.inventory import Package
from scripts.foundry.update.upstream import Upstream, bump_kind, is_newer

REPO_ROOT = Path(__file__).resolve().parents[3]
POLICY_PATH = REPO_ROOT / "foundry" / "update-policy.yml"
SEEN_PATH = REPO_ROOT / ".state" / "vtt-update.seen.json"

AUTO, REVIEW, HOLD, SKIP = "auto", "review", "hold", "skip"

# Foundry's PACKAGE_AVAILABILITY_CODES, from common/constants.mjs. It vends these as
# INTEGERS, not names — an earlier version of this file matched only on strings, which
# meant no blocker was ever detected and every compatibility preview came back "clean".
AVAILABILITY = {
    0: "UNKNOWN", 1: "VERIFIED", 2: "UNVERIFIED_BUILD", 3: "UNVERIFIED_SYSTEM",
    4: "UNVERIFIED_GENERATION", 5: "MISSING_SYSTEM", 6: "MISSING_DEPENDENCY",
    7: "REQUIRES_CORE_DOWNGRADE", 8: "REQUIRES_CORE_UPGRADE_STABLE",
    9: "REQUIRES_CORE_UPGRADE_UNSTABLE", 10: "REQUIRES_CORE_UPGRADE_UNKNOWN",
    11: "REQUIRES_DEPENDENCY_UPDATE",
}

# "This package will not work at that release." Anything here blocks a core update.
BLOCKING_AVAILABILITY = {
    "UNVERIFIED_SYSTEM", "MISSING_SYSTEM", "MISSING_DEPENDENCY",
    "REQUIRES_CORE_DOWNGRADE", "REQUIRES_CORE_UPGRADE_STABLE",
    "REQUIRES_CORE_UPGRADE_UNSTABLE", "REQUIRES_CORE_UPGRADE_UNKNOWN",
    "REQUIRES_DEPENDENCY_UPDATE",
}

# Worth reporting, but NOT worth blocking on. UNVERIFIED_GENERATION in particular is a
# standing state here, not an event: `wall-height` declares compatibility 13–13 and has
# been running happily on core 14 all along. Treating it as a blocker would freeze core
# updates forever on account of a module that already works.
NOTEWORTHY_AVAILABILITY = {"UNKNOWN", "UNVERIFIED_BUILD", "UNVERIFIED_GENERATION"}


def load_policy(path: Path = POLICY_PATH) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def load_seen() -> dict[str, str]:
    try:
        return json.loads(SEEN_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_seen(packages: list[Package], *, exclude: set[str] | None = None) -> None:
    """Record which packages a completed run has surfaced.

    ``exclude`` is for packages that ended the run **held**. Without it, a package held
    this week would count as "seen" next week and skip straight into ``auto`` — so the
    one thing that got flagged for a human would be the one thing that later updated
    without one. A held package keeps being reviewed until it is actually resolved.

    Never call this from a dry run: a dry run that marks everything seen would silently
    disarm the first-sighting guard for the next real one.
    """
    exclude = exclude or set()
    SEEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    seen = load_seen()
    seen.update({p.id: p.version for p in packages if p.id not in exclude})
    SEEN_PATH.write_text(json.dumps(seen, indent=2, sort_keys=True), encoding="utf-8")


def generation(version: str | int | None) -> int | None:
    """Foundry's generation is the leading integer: 14.365 -> 14.

    Manifests are not consistent about the type here — ``compatibility.minimum`` is a
    string in most and a bare integer in some — so coerce rather than assume.
    """
    if version is None or version == "":
        return None
    head = str(version).split(".")[0].lstrip("v")
    return int(head) if head.isdigit() else None


@dataclass
class Decision:
    id: str
    type: str
    bucket: str
    installed: str
    target: str | None
    bump: str
    reasons: list[str] = field(default_factory=list)
    manifest_url: str | None = None
    notes_url: str | None = None
    protected: bool = False

    def to_json(self) -> dict:
        return {
            "id": self.id, "type": self.type, "bucket": self.bucket,
            "installed": self.installed, "target": self.target, "bump": self.bump,
            "reasons": self.reasons, "notes_url": self.notes_url,
            "protected": self.protected,
        }


def _compat_ok(up: Upstream, core_version: str, system_version: str | None,
               installed_ids: set[str], reasons: list[str]) -> bool:
    """Check a candidate's declared compatibility and relationships against reality.

    This is the mechanical half of "does the patch collide with anything": Foundry's
    manifest schema states what a release needs, so a candidate that requires core 15
    or a module we do not have is knowable before installing anything.
    """
    ok = True
    core_gen = generation(core_version)
    min_core = up.compatibility.get("minimum")
    max_core = up.compatibility.get("maximum")

    if min_core and core_gen is not None and generation(min_core) is not None:
        if generation(min_core) > core_gen:
            reasons.append(f"needs core {min_core}+, running {core_version}")
            ok = False
    if max_core and core_gen is not None and generation(max_core) is not None:
        if generation(max_core) < core_gen:
            reasons.append(f"supports core up to {max_core}, running {core_version}")
            ok = False

    rel = up.relationships or {}
    for dep in rel.get("requires", []) or []:
        dep_id = dep.get("id") or dep.get("name")
        if dep_id and dep_id not in installed_ids:
            reasons.append(f"requires {dep_id}, which is not installed")
            ok = False
    for conflict in rel.get("conflicts", []) or []:
        c_id = conflict.get("id") or conflict.get("name")
        if c_id and c_id in installed_ids:
            reasons.append(f"declares a conflict with installed {c_id}")
            ok = False
    systems = rel.get("systems", []) or []
    if systems and system_version is not None:
        ids = {s.get("id") for s in systems if s.get("id")}
        if ids and "dnd5e" not in ids:
            reasons.append(f"targets systems {sorted(ids)}, not dnd5e")
            ok = False
    return ok


def classify_package(pkg: Package, up: Upstream, *, policy: dict, core_version: str,
                     system_version: str | None, installed_ids: set[str],
                     seen: dict[str, str]) -> Decision:
    reasons: list[str] = []
    bump = bump_kind(up.installed, up.latest) if up.latest else "none"
    d = Decision(id=pkg.id, type=pkg.type, bucket=SKIP, installed=up.installed,
                 target=up.latest, bump=bump, manifest_url=up.manifest_url,
                 notes_url=up.notes_url, protected=pkg.protected)

    pkg_policy = policy.get("packages", {}) or {}

    if pkg.kind == "local":
        d.reasons = ["built in this repo — updated by make foundry-sync, not upstream"]
        return d
    if pkg.kind == "forked":
        d.bucket = SKIP
        d.reasons = [f"git checkout ({pkg.git_remote}) — fork drift is reported, "
                     "never merged automatically"]
        return d
    if pkg.id in (pkg_policy.get("hold") or []):
        d.bucket = HOLD
        d.reasons = ["pinned by update-policy.yml"]
        return d
    if up.error or not up.latest:
        d.bucket = HOLD if pkg.kind != "local" else SKIP
        d.reasons = [up.error or "no upstream version resolved"]
        return d
    if not up.has_update:
        d.reasons = ["up to date"]
        return d

    compatible = _compat_ok(up, core_version, system_version, installed_ids, reasons)
    if not compatible:
        d.bucket, d.reasons = HOLD, reasons
        return d

    if pkg.id not in seen:
        d.bucket = REVIEW
        d.reasons = reasons + ["not seen by a previous run — reviewed once before "
                               "it can update unattended"]
        return d
    if pkg.id in (pkg_policy.get("review_always") or []):
        d.bucket = REVIEW
        d.reasons = reasons + ["listed under packages.review_always"]
        return d
    if bump == "major" and not pkg_policy.get("auto_major", False):
        d.bucket = REVIEW
        d.reasons = reasons + [f"major bump {up.installed} -> {up.latest}"]
        return d

    d.bucket = AUTO
    d.reasons = reasons + [f"{bump} bump, compatibility and relationships check out"]
    return d


def classify_core(status_version: str, target: dict | None, preview: dict | None,
                  *, policy: dict) -> Decision:
    """Bucket a core update.

    ``updateCheck`` returns the target ``ReleaseData`` — it does *not* return
    ``hasUpdate`` or ``willDisableModules``, which live on ``updater.availability`` and
    are vended over the socket only. So the generational comparison is done here.
    """
    core_policy = policy.get("core", {}) or {}
    d = Decision(id="core", type="core", bucket=SKIP, installed=status_version,
                 target=None, bump="none")

    if not target or not target.get("version"):
        d.reasons = ["no core update available"]
        return d

    target_version = str(target["version"])
    d.target = target_version
    if not is_newer(target_version, status_version):
        d.reasons = [f"upstream {target_version} is not newer than {status_version}"]
        return d

    running_gen, target_gen = generation(status_version), generation(target_version)
    d.bump = "major" if running_gen != target_gen else "minor"

    if running_gen != target_gen:
        d.bucket = HOLD if not core_policy.get("auto_generation_change") else REVIEW
        d.reasons = [
            f"generation change {running_gen} -> {target_gen}: Foundry disables every "
            "module that has not been re-verified for the new generation. This is the "
            "hands-on migration — do it deliberately, not at 06:00."
        ]
        return d

    if not core_policy.get("auto_build_updates", True):
        d.bucket = HOLD
        d.reasons = ["core.auto_build_updates is off in update-policy.yml"]
        return d

    if preview is None:
        # A preview we could not obtain is NOT a clean preview. Core updates are the
        # one class whose rollback needs a full app-bundle restore; do not take that
        # path on the strength of a check that did not run.
        d.bucket = HOLD
        d.reasons = ["Foundry's compatibility preview could not be obtained — refusing "
                     "to apply a core update without it"]
        return d

    blocked, notes = preview_findings(preview)
    if blocked:
        d.bucket = HOLD
        d.reasons = [f"Foundry's compatibility preview flags {len(blocked)} package(s) "
                     f"at {target_version}: "
                     + ", ".join(f"{p} ({notes[p]})" for p in sorted(blocked)[:6])]
        return d

    d.bucket = AUTO
    d.reasons = [f"build bump {status_version} -> {target_version} within generation "
                 f"{running_gen}; compatibility preview clean"]
    if notes:
        d.reasons.append("not blocking, but noted: "
                         + ", ".join(f"{k} ({v})" for k, v in sorted(notes.items())[:6]))
    return d


def availability_name(value) -> str | None:
    """Normalise ``availability`` to a code name. Foundry sends an int; be tolerant."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return AVAILABILITY.get(value)
    if isinstance(value, str):
        return value.upper() if value.upper() in AVAILABILITY.values() else None
    return None


def preview_findings(preview: dict | None) -> tuple[set[str], dict[str, str]]:
    """Read ``previewCompatibility``: ``(blocking ids, {id: code})`` for everything
    that is not plainly VERIFIED at the target release."""
    if not preview:
        return set(), {}
    blocked: set[str] = set()
    notes: dict[str, str] = {}
    for kind in ("module", "system", "world"):
        for entry in preview.get(kind, []) or []:
            name = availability_name(entry.get("availability"))
            if not name or name == "VERIFIED":
                continue
            pkg_id = entry.get("id", "?")
            if name in BLOCKING_AVAILABILITY:
                blocked.add(pkg_id)
                notes[pkg_id] = name
            elif name in NOTEWORTHY_AVAILABILITY:
                notes[pkg_id] = name
    return blocked, notes


def _preview_blockers(preview: dict | None) -> set[str]:
    return preview_findings(preview)[0]
