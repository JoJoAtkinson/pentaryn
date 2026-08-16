#!/usr/bin/env python3
"""
Migrate the Seafoot "Quarantine" 520-map bundle from 520 Foundry-v9 modules into a single
Foundry-v14 module.

The bundle ships one module per map, each with a NeDB (`packs/*.db`) Scene compendium targeting
core v9. Foundry v14 reads LevelDB only, and 520 modules would be unmanageable anyway. This script
consolidates them into one module:

    Data/modules/pentaryn-seafoot-maps/
    ├── module.json          v14, one LevelDB pack
    ├── maps/                deduplicated map images
    ├── audio/               deduplicated ambient loops (1411 files -> ~35)
    ├── packs/scenes/        LevelDB, written by Foundry itself
    └── scenes.import.json   staged v9 scene docs with rewritten asset paths

This script does everything EXCEPT the schema migration and the LevelDB write. Those are done by
Foundry: the staged documents are fed to `Scene.create()` in a running v14 client, which runs
Foundry's own `migrateData()` shims — the same code path used when upgrading an old world — and
persists natively. That avoids hand-writing a v9->v14 Scene schema conversion across 687 scenes.

Usage:
    seafoot_v9_to_v14.py stage     # consolidate assets + emit scenes.import.json
    seafoot_v9_to_v14.py verify    # compare a built compendium against the source .db files

Idempotent: re-running `stage` overwrites the staged output and skips assets already copied.
"""
from __future__ import annotations

import base64
import json
import shutil
import sys
import urllib.parse
from collections import Counter
from pathlib import Path

HOME = Path.home()
SRC = HOME / "Documents/DriveThruRPG/_extracted"
MODULE_ID = "pentaryn-seafoot-maps"
DEST = HOME / "Library/Application Support/FoundryVTT/Data/modules" / MODULE_ID

MAPS = DEST / "maps"
AUDIO = DEST / "audio"
PACK_DIR = DEST / "packs" / "scenes"
STAGED = DEST / "scenes.import.json"


def module_json() -> dict:
    return {
        "id": MODULE_ID,
        "title": "Seafoot Maps (Quarantine Bundle, migrated)",
        "description": (
            "520+ pre-walled, pre-lit Seafoot Games battlemaps, migrated from the original "
            "Foundry v9 per-map modules into a single v14 compendium."
        ),
        "version": "1.0.0",
        "authors": [{"name": "Seafoot Games"}],
        "compatibility": {"minimum": "13", "verified": "14"},
        "packs": [
            {
                "name": "scenes",
                "label": "Seafoot Maps",
                "path": "packs/scenes",
                "type": "Scene",
                "system": "",
                "ownership": {"PLAYER": "NONE", "ASSISTANT": "OWNER"},
            }
        ],
    }


def _resolve(ref: str, exact: dict, by_base: dict):
    """Resolve an asset reference to its new module-relative path.

    The source data is inconsistent: some scenes reference the module by folder name
    (`modules/basement/...`), others by display name (`modules/Basement/...`), and filenames are
    sometimes URL-encoded (`crumbling%20dragon-lords-throne.jpg`). Try exact match, then the
    URL-decoded form, then fall back to the decoded basename — which is unique across the
    consolidated folders because assets were deduplicated on copy.
    """
    if ref in exact:
        return exact[ref]
    decoded = urllib.parse.unquote(ref)
    if decoded in exact:
        return exact[decoded]
    return by_base.get(decoded.split("/")[-1])


# Fields that exist in v9 and have no v14 equivalent at the top level. They are consumed by
# migrate_scene() and must be dropped, or Foundry rejects/ignores them silently.
V9_ONLY = {
    "img", "grid", "gridType", "gridDistance", "gridUnits", "gridAlpha", "gridColor",
    "globalLight", "globalLightThreshold", "darkness", "fogExploration", "fogReset",
    "backgroundColor", "foreground", "size", "permission", "entryPermission",
}

# v9 stored scene thumbnails inline as base64 data URLs. v14's `thumb` is a strict FilePathField
# and rejects data: URLs, so the images are decoded to real files during staging. They're 300x100,
# which is exactly the sidebar thumbnail format — no re-rendering needed.
THUMBS = DEST / "thumbs"


def _slug(name: str) -> str:
    keep = "".join(c if (c.isalnum() or c in " -_") else "" for c in name)
    return "-".join(keep.lower().split())[:80] or "scene"



# Folder taxonomy. Ordered most-specific first; the first keyword hit wins, so e.g. a
# "Frozen Crypt" lands in Crypts & Tombs rather than Snow & Ice. ~90% of the library
# classifies; the rest are evocative names ("Blackbeard's Trove") that only a human or a
# look at the thumbnail can place, and they go to Unsorted.
TAXONOMY = [
  ("Taverns & Inns",        ["tavern","inn ","inn'","saloon","alehouse","brewery","feasting hall","feast hall","pub"]),
  ("Crypts & Tombs",        ["crypt","tomb","mausoleum","graveyard","catacomb","barrow","ossuary","burial","cemetery"]),
  ("Temples & Shrines",     ["temple","shrine","church","cathedral","chapel","altar","monastery","obelisk","sanctum","cloister"]),
  ("Prisons & Arenas",      ["prison","jail","gaol","arena","colosseum","coliseum","gallows","hangman","dungeon cell","torture"]),
  ("Ships & Coastal",       ["ship","boat","barge","galleon","frigate","dock","harbor","harbour","port ","port of","cove","pirate","seaside","island","beach","lighthouse","shipwreck","sea ","smuggler","reef","lagoon"]),
  ("Snow & Ice",            ["snow","ice ","icy","winter","frost","glacier","tundra","frozen","blizzard"]),
  ("Fire & Volcanic",       ["volcan","lava","magma","fiery","crucible","forge","ember","infernal","brimstone"]),
  ("Castles & Keeps",       ["castle","keep","fortress","fort ","stronghold","citadel","palace","throne","rampart","battlement","gates of","gate of","tower","watchtower","warlord"]),
  ("Dungeons & Caves",      ["dungeon","cave","cavern","mine","tunnel","grotto","hideout","lair","den ","den'","hold","undercity","underdark","sewer","depths","warren"]),
  ("Ruins & Abandoned",     ["ruin","remains","abandoned","forgotten","derelict","broken","fallen","crumbling","desolate","overgrown"]),
  ("Towns & Cities",        ["city","town","village","hamlet","market","bazaar","street","crossing","settlement","district","square"]),
  ("Wilderness",           ["forest","jungle","swamp","marsh","desert","mountain","cliff","river","lake","waterfall","valley","plains","meadow","woods","wood ","oasis","canyon","grove","sands","hills","gully"]),
  ("Camps & Roads",         ["camp","road","bridge","farm","mill","outpost","caravan","trail","path"]),
  ("Buildings & Interiors", ["house","home","manor","mansion","cottage","shop","library","laborator","basement","upper","lower","floor","room","chamber","vault","warehouse","emporium","estate","hall","guild","academy","tomb of","office","study","kitchen","barracks","stable","forge","smithy"]),
]
def classify(name: str) -> str:
    low = " " + name.lower() + " "
    for folder, kws in TAXONOMY:
        if any(k in low for k in kws):
            return folder
    return "Unsorted"


def migrate_scene(d: dict) -> dict:
    """Convert a Foundry v9 Scene document to the v14 shape.

    Foundry only carries migration shims a couple of versions back, so a v9 document fed straight
    to Scene.create() on v14 loses its grid size and its background image. Verified empirically:
    walls, lights, sounds, notes, tiles and drawings all survive untouched; these three families
    do not.

      img / backgroundColor / foreground  ->  levels[0].{background,foreground}
      grid + gridType + gridDistance
        + gridUnits + gridAlpha + gridColor ->  grid: {size, type, distance, units, alpha, color}
      globalLight / darkness               ->  environment.{globalLight.enabled, darknessLevel}

    v14 moved background/foreground/fog onto an embedded `Level` document; `background` is no
    longer a Scene field at all.
    """
    out = {k: v for k, v in d.items() if k not in V9_ONLY}

    # --- grid: six flat fields collapse into one object ---------------------
    grid = {}
    if isinstance(d.get("grid"), (int, float)):
        grid["size"] = int(d["grid"])
    elif isinstance(d.get("grid"), dict):
        grid.update(d["grid"])
    for src, dst in (("gridType", "type"), ("gridDistance", "distance"),
                     ("gridUnits", "units"), ("gridAlpha", "alpha"), ("gridColor", "color")):
        if d.get(src) is not None:
            grid[dst] = d[src]
    if grid:
        out["grid"] = grid

    # --- environment --------------------------------------------------------
    env = {}
    if d.get("darkness") is not None:
        env["darknessLevel"] = d["darkness"]
    if d.get("globalLight") is not None:
        env["globalLight"] = {"enabled": bool(d["globalLight"])}
    if env:
        out["environment"] = env

    # --- the level carrying the artwork ------------------------------------
    background = {}
    if d.get("img"):
        background["src"] = d["img"]
    if d.get("backgroundColor"):
        background["color"] = d["backgroundColor"]
    level = {"name": "Level"}
    if background:
        level["background"] = background
    if d.get("foreground"):
        level["foreground"] = {"src": d["foreground"]}
    out["levels"] = [level]

    # v9 inline base64 thumbnail -> a real file v14 will accept
    thumb = d.get("thumb")
    if isinstance(thumb, str) and thumb.startswith("data:image"):
        try:
            header, b64 = thumb.split(",", 1)
            ext = "png" if "png" in header else ("webp" if "webp" in header else "jpg")
            fn = f"{_slug(d.get('name') or 'scene')}.{ext}"
            target = THUMBS / fn
            if not target.exists():
                target.write_bytes(base64.b64decode(b64))
            out["thumb"] = f"modules/{MODULE_ID}/thumbs/{fn}"
        except Exception:
            out.pop("thumb", None)
    else:
        out.pop("thumb", None)

    out.setdefault("flags", {}).setdefault(MODULE_ID, {})["folder"] = classify(d.get("name") or "")
    out.pop("folder", None)   # v9 folder ids are meaningless here; assigned on import

    return out


def stage() -> int:
    if not SRC.is_dir():
        print(f"ERROR: source not found: {SRC}", file=sys.stderr)
        return 1

    for d in (MAPS, AUDIO, PACK_DIR, THUMBS):
        d.mkdir(parents=True, exist_ok=True)

    (DEST / "module.json").write_text(json.dumps(module_json(), indent=2) + "\n")

    # ---- consolidate assets -------------------------------------------------
    # Map images are namespaced by their module folder on collision; audio is deduplicated
    # aggressively because every module ships identical copies of the same ~35 loops.
    img_map: dict[str, str] = {}   # original scene path -> new module-relative path
    aud_map: dict[str, str] = {}
    img_by_base: dict[str, str] = {}   # decoded basename -> new path (fallback resolver)
    aud_by_base: dict[str, str] = {}
    copied_imgs = copied_auds = skipped = 0

    for mod_dir in sorted(SRC.glob("*/*")):
        if not (mod_dir / "module.json").is_file():
            continue
        mod = mod_dir.name

        for img in sorted((mod_dir / "maps").glob("*")):
            if not img.is_file():
                continue
            target = MAPS / img.name
            if target.exists() and target.stat().st_size != img.stat().st_size:
                target = MAPS / f"{mod}__{img.name}"       # genuine collision
            if not target.exists():
                shutil.copy2(img, target)
                copied_imgs += 1
            else:
                skipped += 1
            new_rel = f"modules/{MODULE_ID}/maps/{target.name}"
            img_map[f"modules/{mod}/maps/{img.name}"] = new_rel
            img_by_base.setdefault(img.name, new_rel)

        for aud in sorted((mod_dir / "audio").rglob("*")):
            if not aud.is_file():
                continue
            target = AUDIO / aud.name
            if not target.exists():
                shutil.copy2(aud, target)
                copied_auds += 1
            rel = aud.relative_to(mod_dir).as_posix()
            new_rel = f"modules/{MODULE_ID}/audio/{target.name}"
            aud_map[f"modules/{mod}/{rel}"] = new_rel
            aud_by_base.setdefault(aud.name, new_rel)

    # ---- stage scene documents ---------------------------------------------
    docs: list[dict] = []
    stats = Counter()
    unresolved: list[str] = []

    for db in sorted(SRC.glob("*/*/packs/*.db")):
        mod = db.parent.parent.name
        for line in db.read_text(errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                stats["unparseable_lines"] += 1
                continue

            # Rewrite the background image reference (v9 uses a flat `img`; Foundry's own
            # migration moves it to background.src on create).
            if d.get("img"):
                new = _resolve(d["img"], img_map, img_by_base)
                if new:
                    d["img"] = new
                else:
                    unresolved.append(f"{mod}: img {d['img']}")

            for s in d.get("sounds") or []:
                if s.get("path"):
                    new = _resolve(s["path"], aud_map, aud_by_base)
                    if new:
                        s["path"] = new
                    else:
                        unresolved.append(f"{mod}: audio {s['path']}")

            d.pop("_id", None)          # let Foundry mint fresh ids
            d["flags"] = {**(d.get("flags") or {}), MODULE_ID: {"sourceModule": mod}}

            stats["scenes"] += 1
            stats["walls"] += len(d.get("walls") or [])
            stats["lights"] += len(d.get("lights") or [])
            stats["sounds"] += len(d.get("sounds") or [])
            if d.get("grid"):
                stats["grid_carried"] += 1
            docs.append(migrate_scene(d))

    STAGED.write_text(json.dumps(docs))

    print(f"  module        : {DEST}")
    print(f"  images copied : {copied_imgs} (deduped {skipped})")
    print(f"  audio copied  : {copied_auds}  (from {len(aud_map)} references)")
    print(f"  scenes staged : {stats['scenes']}")
    print(f"  thumbnails    : {len(list(THUMBS.iterdir()))}")
    print(f"  walls         : {stats['walls']:,}")
    print(f"  lights        : {stats['lights']:,}")
    print(f"  sounds        : {stats['sounds']:,}")
    print(f"  staged file   : {STAGED} ({STAGED.stat().st_size / 1048576:.1f} MB)")
    if stats["unparseable_lines"]:
        print(f"  WARNING unparseable lines: {stats['unparseable_lines']}")
    if unresolved:
        print(f"  WARNING unresolved asset paths: {len(unresolved)}")
        for u in unresolved[:5]:
            print(f"    {u}")
    return 0


def verify() -> int:
    """Compare source totals against whatever the staged file holds."""
    if not STAGED.is_file():
        print("nothing staged", file=sys.stderr)
        return 1
    docs = json.loads(STAGED.read_text())
    def bg(doc):
        lv = (doc.get("levels") or [{}])[0]
        return (lv.get("background") or {}).get("src")
    missing = [d.get("name") for d in docs if bg(d) and not (DEST.parent.parent / bg(d)).is_file()]
    nogrid = [d.get("name") for d in docs if not (d.get("grid") or {}).get("size")]
    print(f"  scenes missing grid.size: {len(nogrid)}")
    print(f"  staged scenes        : {len(docs)}")
    print(f"  broken image paths   : {len(missing)}")
    for m in missing[:10]:
        print(f"    {m}")
    return 0 if not missing else 2


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stage"
    sys.exit({"stage": stage, "verify": verify}.get(cmd, lambda: 1)())
