#!/usr/bin/env python3
"""OneDrive as Foundry's source of truth — one direction each way.

The whole design rests on a single rule: **each direction is one-way, and the two
never touch the same files.**

- **Assets flow DOWN.** You drop ``tokens-02.zip`` into OneDrive; the next server
  start unpacks it into ``Data/assets/tokens/tokens-02/``. Extracted once, tracked
  by hash, never re-extracted, never overwritten. Local assets are never uploaded.
- **The world flows UP.** Every server stop (and every start, before launch)
  archives the world, Config and modules to OneDrive as a timestamped snapshot.
  Restoring is **never** automatic — see ``restore`` below for why.

Why not just sync the whole data directory, which would be simpler? Because
``Data/worlds/<world>/data/`` is a live LevelDB. A sync client reads ``.ldb`` files
mid-compaction and uploads inconsistent snapshots, and resolves conflicts by
writing *conflict copies* into the directory — junk inside a live database.
LevelDB's single-writer ``LOCK`` means neither side detects the other, so nothing
errors; the world simply fails to open, weeks later. Measured on this machine, a
read through ``~/Library/CloudStorage`` also hung for 30 s while the OneDrive
daemon was busy, against 6 ms for the same file read directly — a stall that would
land mid-session on every document read.

So: a *stopped* database is copied wholesale, which is always consistent. A
*running* one is never touched by the cloud at all.

Sizes, re-measured 2026-08-21 — and no longer cheap. The world is ~1.7 MB and Config
8 KB, but ``Data/modules`` has grown to **2.7 GB**, almost entirely premium map art
(the eledryll bundles and mad-endlesswiz). A snapshot is therefore ~2.5 GB, not the
~4 MB this docstring used to claim, and 8 of them already occupy 13 GB.

Retention is therefore built around that size rather than around a count:

- **Ten** rolling snapshots, not a hundred. At ~2.5 GB each that is a 25 GB ceiling.
- A snapshot taken within **five days** of the newest one *replaces* it. A day of
  editing should cost one snapshot, not six — otherwise an afternoon of
  `vtt-up`/`vtt-down` cycles evicts weeks of real history from a ten-deep window.
  The weekly auto-update always lands outside that window, so it always adds one.
- Snapshots from a Foundry **generation you have left** are copied into
  ``major-release/`` and never pruned. Abandoning a generation should be a decision you
  can unmake in six months, and a rolling window cannot promise that.

If the ceiling still bothers you, the lever is ``Data/modules``: it is 2.7 GB of
re-downloadable premium map art that changes a few times a year, riding along in a
snapshot whose job is to protect a 1.7 MB world.

Systems (132 MB) are mirrored per version rather than rolled, because they change only
on a version bump — but see ``KEEP_SYSTEM_MIRRORS``: more than one is kept now, because
rolling a system update back needs the version you were on *before* it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

# ── Locations ────────────────────────────────────────────────────────────────

FOUNDRY_DATA = Path.home() / "Library/Application Support/FoundryVTT"
CLOUD_ROOT = Path.home() / "Library/CloudStorage/OneDrive-Personal/DnD/foundry"

ASSETS_IN = CLOUD_ROOT / "assets"           # you put zips here
WORLD_BACKUPS = CLOUD_ROOT / "world-backups"  # automatic, rolling
SYSTEM_BACKUP = CLOUD_ROOT / "system-backup"  # automatic, one copy per version
# Never pruned. One snapshot per Foundry GENERATION: the last state captured while you
# were still on it. Leaving a generation behind is a decision you should get to unmake
# months later, and the rolling window cannot promise that.
MAJOR_RELEASES = CLOUD_ROOT / "major-release"

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "foundry" / "assets-manifest.json"

# Ten rolling snapshots, one per COALESCE_WINDOW_DAYS at the tightest — so roughly
# 50 days of history at worst and ~10 weeks at the normal weekly cadence.
KEEP_SNAPSHOTS = 10

# A snapshot taken while the newest one is younger than this REPLACES it instead of
# stacking on top. The point is that a day of edits should cost one snapshot, not six:
# without this, an afternoon of `vtt-up`/`vtt-down` cycles evicts weeks of real history
# from the rolling window, which is the opposite of what the window is for. The weekly
# auto-update always lands well outside the window, so it always writes a fresh one.
COALESCE_WINDOW_DAYS = 5

# How many versions of each system's mirror to retain. More than one, because a
# system rollback needs the version you were on *before* the update, and the
# post-update backup would otherwise have already deleted it.
KEEP_SYSTEM_MIRRORS = 3

# A pack zip is `<kind>-<nn>.zip`. The kind decides where it lands; the number
# only keeps names unique and ordered. Append-only: published zips are never
# edited, new finds get the next number.
ZIP_NAME = re.compile(r"^([a-z][a-z0-9-]*)-(\d{2})\.zip$")
# `world-<stamp>-fvtt<version>.tar.gz`. The version suffix was added 2026-08-21; older
# snapshots have no suffix and simply report an unknown Foundry version, which the
# major-release promotion treats as "cannot tell" rather than as a generation change.
SNAPSHOT_NAME = re.compile(r"^world-(\d{4}-\d{2}-\d{2}-\d{6})(?:-fvtt([0-9.]+))?\.tar\.gz$")
APP_PACKAGE_JSON = Path("/Applications/Foundry Virtual Tabletop.app"
                        "/Contents/Resources/app/package.json")
# FOUNDRY_DATA is the root that holds Config/ Data/ Logs/, so these are Data-relative.
KINDS = {
    "tokens": "Data/assets/tokens",
    "maps": "Data/assets/maps",
    "tiles": "Data/assets/tiles",
    "portraits": "Data/assets/portraits",
    "audio": "Data/assets/audio",
}

# What a rolling snapshot contains, relative to FOUNDRY_DATA. Small and
# fast-changing. Systems are deliberately excluded — see SYSTEM_BACKUP.
SNAPSHOT_PATHS = ["Data/worlds", "Config", "Data/modules"]

JUNK_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}


def log(msg: str) -> None:
    print(f"  {msg}")


def die(msg: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"  ✗ {msg}", file=sys.stderr)
    sys.exit(1)


def server_running() -> bool:
    """Foundry answers on :30000 when up. Several operations must refuse while it is."""
    try:
        import urllib.request
        urllib.request.urlopen("http://localhost:30000", timeout=2)
        return True
    except Exception:
        return False


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_cloud() -> None:
    """Create the folder structure, with a README so it explains itself to a human."""
    for d in (ASSETS_IN, WORLD_BACKUPS, SYSTEM_BACKUP, MAJOR_RELEASES):
        d.mkdir(parents=True, exist_ok=True)
    readme = CLOUD_ROOT / "README.txt"
    if not readme.exists():
        readme.write_text(
            "Foundry Virtual Tabletop — cloud store\n"
            "======================================\n\n"
            "Managed by the pentaryn repo (`make foundry-assets`, `make foundry-backup`).\n"
            "Everything Foundry-related lives under this one folder.\n\n"
            "assets/         YOU PUT THINGS HERE.\n"
            "                Art packs as zips, named <kind>-<nn>.zip — e.g.\n"
            "                tokens-01.zip, maps-01.zip, maps-02.zip.\n"
            "                The next server start unpacks anything new into Foundry.\n"
            "                Never edit a zip once added; add the next number instead.\n"
            f"                Kinds: {', '.join(sorted(KINDS))}\n\n"
            "world-backups/  AUTOMATIC — do not edit.\n"
            "                Rolling snapshots of the campaign, Config and modules,\n"
            "                written on every server stop and start. Newest last.\n"
            f"                The most recent {KEEP_SNAPSHOTS} are kept, and a snapshot\n"
            f"                taken within {COALESCE_WINDOW_DAYS} days of the previous one\n"
            "                REPLACES it — so a day of editing costs one snapshot,\n"
            "                not six, and the window keeps real weeks of history.\n\n"
            "major-release/  AUTOMATIC — never pruned.\n"
            "                When Foundry moves to a new generation (14 -> 15), the\n"
            "                last snapshot taken while you were still on the old one\n"
            "                is preserved here. Deleting one is you deciding you are\n"
            "                never going back to that version.\n\n"
            "system-backup/  AUTOMATIC — do not edit.\n"
            "                One copy per game-system version, for rebuilding from\n"
            f"                scratch. The last {KEEP_SYSTEM_MIRRORS} versions are kept, because\n"
            "                rolling a system update back needs the code you were on\n"
            "                BEFORE it.\n\n"
            "Restoring is never automatic. Run `make foundry-restore` and pick a\n"
            "snapshot; it archives the current state first, so a restore is undoable.\n",
            encoding="utf-8",
        )
        log(f"wrote {readme}")


# ── Assets: OneDrive → local, additive only ──────────────────────────────────

def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {"packs": {}}


def save_manifest(m: dict) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def kebab(name: str) -> str:
    """Normalise once, at extraction, before any Foundry document references the path.

    Safe precisely because packs are append-only: an extracted path never changes
    afterwards. The standing rule is to never rename inside an extracted pack —
    fix names in the next zip instead.
    """
    stem, dot, ext = name.rpartition(".")
    if not dot:
        stem, ext = name, ""
    stem = stem.lower().replace("_", "-").replace(" ", "-")
    stem = re.sub(r"\((\d+)\)", r"-\1", stem)
    stem = re.sub(r"[^a-z0-9.-]", "-", stem)
    stem = re.sub(r"-{2,}", "-", stem).strip("-.")
    return f"{stem}.{ext.lower()}" if ext else stem


def unpack_assets(dry_run: bool = False) -> int:
    ensure_cloud()
    manifest = load_manifest()
    zips = sorted(p for p in ASSETS_IN.glob("*.zip") if p.is_file())
    if not zips:
        log(f"no packs in {ASSETS_IN}")
        return 0

    problems, extracted = [], 0
    for zp in zips:
        m = ZIP_NAME.match(zp.name)
        if not m:
            problems.append(f"{zp.name}: name must be <kind>-<nn>.zip "
                            f"(kinds: {', '.join(sorted(KINDS))})")
            continue
        kind, num = m.group(1), m.group(2)
        if kind not in KINDS:
            problems.append(f"{zp.name}: unknown kind '{kind}' "
                            f"(allowed: {', '.join(sorted(KINDS))})")
            continue

        pack = f"{kind}-{num}"
        dest = FOUNDRY_DATA / KINDS[kind] / pack
        digest = sha256_file(zp)
        prior = manifest["packs"].get(pack)

        if prior and dest.is_dir():
            if prior["sha256"] == digest:
                continue  # already unpacked, unchanged — the common case
            # Append-only means a republished zip is a mistake, not an update.
            problems.append(
                f"{zp.name}: contents changed since it was unpacked. Packs are "
                f"append-only — add {kind}-{int(num) + 1:02d}.zip instead, or delete "
                f"{dest} to force a re-extract.")
            continue

        if dry_run:
            log(f"would unpack {zp.name} → {dest}")
            extracted += 1
            continue

        # Extract to a temp dir, then move into place, so an interrupted run never
        # leaves a half-populated pack that the manifest would later call complete.
        count = 0
        dest.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=str(dest.parent)) as tmp:
            staging = Path(tmp) / pack
            with zipfile.ZipFile(zp) as zf:
                seen: dict[str, str] = {}
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    parts = [p for p in Path(info.filename).parts
                             if p not in ("__MACOSX",) and not p.startswith("._")]
                    if not parts or parts[-1] in JUNK_NAMES or parts[-1].startswith("."):
                        continue
                    rel = "/".join(kebab(p) for p in parts)
                    if rel in seen:
                        problems.append(
                            f"{zp.name}: '{info.filename}' and '{seen[rel]}' both "
                            f"normalise to '{rel}' — rename one inside the zip")
                        break
                    seen[rel] = info.filename
                    target = staging / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(info) as src, target.open("wb") as out:
                        shutil.copyfileobj(src, out)
                    count += 1
                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    if dest.exists():
                        shutil.rmtree(dest)
                    shutil.move(str(staging), str(dest))
                    manifest["packs"][pack] = {
                        "zip": zp.name, "sha256": digest,
                        "bytes": zp.stat().st_size, "files": count,
                        "dest": str(dest.relative_to(FOUNDRY_DATA)),
                        "extracted": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    }
                    log(f"unpacked {zp.name} → {dest.relative_to(FOUNDRY_DATA)} ({count} files)")
                    extracted += 1
                    continue
        # only reached when the for-loop broke on a collision
        log(f"✗ {zp.name} refused")

    if not dry_run:
        save_manifest(manifest)
    if problems:
        print("  ✗ some packs were not unpacked:", file=sys.stderr)
        for p in problems:
            print(f"      {p}", file=sys.stderr)
        return 1
    if extracted == 0:
        log(f"assets up to date ({len(manifest['packs'])} packs)")
    return 0


# ── World: local → OneDrive, rolling, one-way ────────────────────────────────

def snapshot_digest() -> str:
    """Content hash of everything a snapshot covers, so identical states are skipped."""
    h = hashlib.sha256()
    for rel in SNAPSHOT_PATHS:
        root = FOUNDRY_DATA / rel
        if not root.exists():
            continue
        for p in sorted(root.rglob("*")):
            if p.is_file():
                h.update(str(p.relative_to(FOUNDRY_DATA)).encode())
                h.update(str(p.stat().st_size).encode())
                h.update(str(int(p.stat().st_mtime)).encode())
    return h.hexdigest()


def backup(reason: str = "manual", if_stopped: bool = False) -> int:
    """`if_stopped` is for lifecycle hooks: skip quietly rather than fail the target.
    `make vtt-up` on an already-running server is normal, and must not abort there."""
    if server_running():
        if if_stopped:
            log("Foundry already running — skipping the pre-launch snapshot")
            return 0
        die("Foundry is running — stop it first (a live LevelDB cannot be copied consistently)")
    ensure_cloud()

    digest = snapshot_digest()
    marker = WORLD_BACKUPS / ".last-digest"
    if marker.exists() and marker.read_text(encoding="utf-8").strip() == digest:
        log("no change since the last snapshot — skipped")
        return 0

    # Before writing anything: if the installed generation has moved on since the last
    # backup, the newest snapshot from the OLD generation is the last state that still
    # runs on it. Preserve it now, while it is still inside the rolling window.
    promote_major_release()

    core = core_version()
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    out = WORLD_BACKUPS / f"world-{stamp}-fvtt{core}.tar.gz"

    # Coalescing: note the snapshot this one may replace, but write the new one FIRST
    # and only then delete the old. Deleting first would leave a window — however
    # short — in which a 2.5 GB write could fail and take the restore point with it.
    superseded = _coalesce_target()

    with tarfile.open(out, "w:gz") as tar:
        for rel in SNAPSHOT_PATHS:
            src = FOUNDRY_DATA / rel
            if src.exists():
                tar.add(src, arcname=rel)
    marker.write_text(digest + "\n", encoding="utf-8")
    log(f"snapshot → {out.name} ({out.stat().st_size / 1e6:.1f} MB, {reason})")

    if superseded and superseded.exists():
        age_days = (time.time() - superseded.stat().st_mtime) / 86400
        superseded.unlink()
        log(f"replaced {superseded.name} ({age_days:.1f} days old, inside the "
            f"{COALESCE_WINDOW_DAYS}-day window)")

    snaps = sorted(WORLD_BACKUPS.glob("world-*.tar.gz"))
    for stale in snaps[:-KEEP_SNAPSHOTS]:
        stale.unlink()
        log(f"pruned {stale.name}")
    log(f"{min(len(snaps), KEEP_SNAPSHOTS)} of {KEEP_SNAPSHOTS} snapshots kept")

    mirror_systems()
    return 0


def core_version() -> str:
    """The installed Foundry version, read from the app bundle — no server needed.

    Stamped into every snapshot filename so a snapshot is self-describing about which
    Foundry it came from. That is what makes the major-release promotion below possible
    without a separate index to keep in sync.
    """
    try:
        pkg = json.loads((APP_PACKAGE_JSON).read_text(encoding="utf-8"))
        rel = pkg.get("release", {})
        return f"{rel.get('generation')}.{rel.get('build')}"
    except (OSError, json.JSONDecodeError, AttributeError):
        return "unknown"


def snapshot_core_version(path: Path) -> str | None:
    """Pull the `-fvtt<version>` suffix back out of a snapshot filename."""
    m = SNAPSHOT_NAME.match(path.name)
    return m.group(2) if m else None


def generation(version: str | None) -> str | None:
    """Foundry's generation is the leading integer: 14.365 -> 14."""
    if not version:
        return None
    head = version.split(".")[0]
    return head if head.isdigit() else None


def _coalesce_target() -> Path | None:
    """The newest snapshot, if it is young enough to be replaced rather than kept."""
    snaps = sorted(WORLD_BACKUPS.glob("world-*.tar.gz"))
    if not snaps:
        return None
    newest = snaps[-1]
    age_days = (time.time() - newest.stat().st_mtime) / 86400
    return newest if age_days < COALESCE_WINDOW_DAYS else None


def promote_major_release() -> Path | None:
    """Preserve the last snapshot taken on a generation you have since left.

    Called before each backup. If the installed generation differs from the one the
    newest existing snapshot was taken under, that snapshot is the final state that
    still runs on the old generation — copy it into ``major-release/``, where nothing
    prunes it.

    Doing it here rather than at upgrade time also catches an upgrade done by hand
    through Foundry's own setup screen, which the updater never sees.
    """
    MAJOR_RELEASES.mkdir(parents=True, exist_ok=True)
    current = generation(core_version())
    snaps = sorted(WORLD_BACKUPS.glob("world-*.tar.gz"))
    if not current or not snaps:
        return None

    previous = generation(snapshot_core_version(snaps[-1]))
    if not previous or previous == current:
        return None

    # Newest snapshot actually taken while on the old generation.
    candidates = [s for s in snaps
                  if generation(snapshot_core_version(s)) == previous]
    if not candidates:
        return None
    source = candidates[-1]

    if any(f"-fvtt{previous}." in q.name for q in MAJOR_RELEASES.glob("*.tar.gz")):
        return None  # this generation is already preserved

    target = MAJOR_RELEASES / source.name
    shutil.copy2(source, target)
    log(f"Foundry {previous} → {current}: preserved {source.name} in major-release/ "
        f"({target.stat().st_size / 1e6:.0f} MB, never pruned)")
    return target


def mirror_systems() -> None:
    """One copy per system version — needed to rebuild, pointless to roll."""
    systems = FOUNDRY_DATA / "Data/systems"
    if not systems.is_dir():
        return
    for sysdir in sorted(p for p in systems.iterdir() if p.is_dir()):
        manifest = sysdir / "system.json"
        if not manifest.exists():
            continue
        try:
            version = json.loads(manifest.read_text(encoding="utf-8")).get("version", "unknown")
        except Exception:
            version = "unknown"
        out = SYSTEM_BACKUP / f"{sysdir.name}-{version}.tar.gz"
        if out.exists():
            continue
        # Keep the last few versions, not just the current one. This used to delete
        # every older mirror before writing the new one, which meant the first backup
        # taken *after* a system update destroyed the only copy of the version you
        # would want to roll back to — at exactly the moment you would want it. The
        # auto-updater depends on the old mirror surviving; see
        # scripts/foundry/update/recover.py.
        for stale in sorted(SYSTEM_BACKUP.glob(f"{sysdir.name}-*.tar.gz"))[:-KEEP_SYSTEM_MIRRORS]:
            stale.unlink()
            log(f"pruned system mirror {stale.name}")
        with tarfile.open(out, "w:gz") as tar:
            tar.add(sysdir, arcname=sysdir.name)
        log(f"system mirror → {out.name} ({out.stat().st_size / 1e6:.0f} MB)")


def restore(which: str | None, yes: bool = False) -> int:
    """Deliberately manual. Rolling backups make an automatic restore *more*
    dangerous, not less: an older snapshot silently overwriting a newer world is
    now a thing that can happen a hundred different ways."""
    if server_running():
        die("Foundry is running — stop it first")
    snaps = sorted(WORLD_BACKUPS.glob("world-*.tar.gz"))
    preserved = sorted(MAJOR_RELEASES.glob("world-*.tar.gz"))
    if not snaps and not preserved:
        die(f"no snapshots in {WORLD_BACKUPS}")

    if which is None:
        print(f"  rolling snapshots in {WORLD_BACKUPS} (newest last):")
        for s in snaps[-KEEP_SNAPSHOTS:]:
            print(f"      {s.name}  {s.stat().st_size / 1e6:5.1f} MB")
        if preserved:
            print(f"\n  preserved past generations in {MAJOR_RELEASES} (never pruned):")
            for s in preserved:
                print(f"      {s.name}  {s.stat().st_size / 1e6:5.1f} MB")
            print("      ⚠ restoring one of these gives you a world last opened by an")
            print("        OLDER Foundry. Reinstall that version first, or it will be")
            print("        migrated forward again on the next launch.")
        newest = (snaps or preserved)[-1]
        print(f"\n  restore one with:  make foundry-restore SNAP={newest.name}")
        return 0

    # Accept a name from either directory — a preserved generation is a legitimate
    # restore target, and making the caller supply a path would be a footgun.
    chosen = WORLD_BACKUPS / which
    if not chosen.exists():
        chosen = MAJOR_RELEASES / which
    if not chosen.exists():
        die(f"no such snapshot: {which}")
    if not yes:
        print(f"  about to restore {chosen.name} over {FOUNDRY_DATA}")
        print("  the current state is archived first, so this is undoable")
        if input("  type 'restore' to continue: ").strip() != "restore":
            log("aborted")
            return 1

    backup(reason="pre-restore safety copy")

    # Clear each target before extracting. `extractall` overlays: it writes the files
    # in the archive and leaves everything else alone, so restoring an older snapshot
    # over a newer tree keeps every file the newer version added. The result runs, and
    # is a mixed-version install — the worst kind of failed restore, because it looks
    # like it worked.
    for rel in SNAPSHOT_PATHS:
        target = FOUNDRY_DATA / rel
        if target.exists():
            shutil.rmtree(target)
            log(f"cleared {rel}")

    with tarfile.open(chosen, "r:gz") as tar:
        tar.extractall(FOUNDRY_DATA, filter="data")
    log(f"restored {chosen.name}")

    # Snapshots cover worlds/Config/modules but NOT Data/systems, which is mirrored
    # separately. A world restored to an older state expects the system version it was
    # migrated with, so say so rather than leaving a half-restore looking complete.
    mirrors = sorted(SYSTEM_BACKUP.glob("*.tar.gz"))
    if mirrors:
        log("note: systems are NOT part of this snapshot. If you are rolling back a")
        log("      system update, also restore its code from:")
        for mirror in mirrors[-KEEP_SYSTEM_MIRRORS:]:
            log(f"        {mirror}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("assets", help="unpack new packs from OneDrive (down)")
    a.add_argument("--dry-run", action="store_true")
    b = sub.add_parser("backup", help="snapshot world+config+modules to OneDrive (up)")
    b.add_argument("--reason", default="manual")
    b.add_argument("--if-stopped", action="store_true",
                   help="skip instead of failing when the server is up")
    r = sub.add_parser("restore", help="list snapshots, or restore one")
    r.add_argument("--snapshot", default=None)
    r.add_argument("--yes", action="store_true")
    sub.add_parser("status", help="show what is where")

    args = ap.parse_args()
    if args.cmd == "assets":
        return unpack_assets(args.dry_run)
    if args.cmd == "backup":
        return backup(args.reason, args.if_stopped)
    if args.cmd == "restore":
        return restore(args.snapshot, args.yes)

    ensure_cloud()
    m = load_manifest()
    snaps = sorted(WORLD_BACKUPS.glob("world-*.tar.gz"))
    log(f"cloud root   {CLOUD_ROOT}")
    log(f"packs in     {ASSETS_IN}: {len(list(ASSETS_IN.glob('*.zip')))} zip(s), "
        f"{len(m['packs'])} unpacked")
    log(f"snapshots    {len(snaps)} kept (limit {KEEP_SNAPSHOTS})"
        + (f", newest {snaps[-1].name}" if snaps else ""))
    log(f"foundry      {'RUNNING' if server_running() else 'stopped'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
