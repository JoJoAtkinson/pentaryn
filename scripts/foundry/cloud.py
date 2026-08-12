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

Sizes, measured, which is why this is cheap: the world is ~1.7 MB, Config 8 KB,
modules 2.5 MB. Systems (144 MB) are mirrored once rather than rolled, because
they change only on a version bump and are reinstallable anyway.
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
SYSTEM_BACKUP = CLOUD_ROOT / "system-backup"  # automatic, one copy

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "foundry" / "assets-manifest.json"

KEEP_SNAPSHOTS = 100

# A pack zip is `<kind>-<nn>.zip`. The kind decides where it lands; the number
# only keeps names unique and ordered. Append-only: published zips are never
# edited, new finds get the next number.
ZIP_NAME = re.compile(r"^([a-z][a-z0-9-]*)-(\d{2})\.zip$")
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
    for d in (ASSETS_IN, WORLD_BACKUPS, SYSTEM_BACKUP):
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
            f"                The most recent {KEEP_SNAPSHOTS} are kept.\n\n"
            "system-backup/  AUTOMATIC — do not edit.\n"
            "                One copy of the game system, for rebuilding from scratch.\n"
            "                Refreshed only when its version changes.\n\n"
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

    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    out = WORLD_BACKUPS / f"world-{stamp}.tar.gz"
    with tarfile.open(out, "w:gz") as tar:
        for rel in SNAPSHOT_PATHS:
            src = FOUNDRY_DATA / rel
            if src.exists():
                tar.add(src, arcname=rel)
    marker.write_text(digest + "\n", encoding="utf-8")
    log(f"snapshot → {out.name} ({out.stat().st_size / 1e6:.1f} MB, {reason})")

    snaps = sorted(WORLD_BACKUPS.glob("world-*.tar.gz"))
    for old in snaps[:-KEEP_SNAPSHOTS]:
        old.unlink()
        log(f"pruned {old.name}")
    log(f"{min(len(snaps), KEEP_SNAPSHOTS)} of {KEEP_SNAPSHOTS} snapshots kept")

    mirror_systems()
    return 0


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
        for stale in SYSTEM_BACKUP.glob(f"{sysdir.name}-*.tar.gz"):
            stale.unlink()
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
    if not snaps:
        die(f"no snapshots in {WORLD_BACKUPS}")

    if which is None:
        print(f"  snapshots in {WORLD_BACKUPS} (newest last):")
        for s in snaps[-20:]:
            print(f"      {s.name}  {s.stat().st_size / 1e6:5.1f} MB")
        print(f"\n  restore one with:  make foundry-restore SNAP={snaps[-1].name}")
        return 0

    chosen = WORLD_BACKUPS / which
    if not chosen.exists():
        die(f"no such snapshot: {which}")
    if not yes:
        print(f"  about to restore {chosen.name} over {FOUNDRY_DATA}")
        print("  the current state is archived first, so this is undoable")
        if input("  type 'restore' to continue: ").strip() != "restore":
            log("aborted")
            return 1

    backup(reason="pre-restore safety copy")
    with tarfile.open(chosen, "r:gz") as tar:
        tar.extractall(FOUNDRY_DATA, filter="data")
    log(f"restored {chosen.name}")
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
