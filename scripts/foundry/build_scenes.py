#!/usr/bin/env python3
"""Generate Foundry Scene documents as JSON, ready for `fvtt package pack`.

This is the offline/programmatic path into Foundry: emit JSON here, let the
official CLI write it into the world's LevelDB. No browser, no clicking.
Foundry must be STOPPED while packing — LevelDB holds an exclusive lock.

    make vtt-down
    python -m scripts.foundry.build_scenes --out staging/foundry-scenes
    fvtt package workon ardenhaven --type World
    fvtt package pack scenes --in staging/foundry-scenes
    make vtt-up

Scenes are created with a placeholder grid; align them in Foundry's
Scene Config → Grid → Grid Configuration, which adjusts grid size and
background offset together. These maps are gridless, so there is nothing to
autodetect — a human eye is genuinely the right tool for that one step.
"""

from __future__ import annotations

import argparse
import json
import random
import string
from pathlib import Path

from PIL import Image

FOUNDRY_DATA = Path.home() / "Library/Application Support/FoundryVTT/Data"

# Foundry enforces a minimum grid size of 50px.
GRID_MIN = 50
DEFAULT_GRID = 100

# The three starter scenes. `img` is relative to the Foundry Data directory.
SCENES = [
    {
        "name": "The Common Room",
        "img": "assets/maps/inn-common-room.jpg",
        "nav": "Inn",
    },
    {
        "name": "Undercity Hideout",
        "img": "assets/maps/undercity-hideout.jpg",
        "nav": "Hideout",
    },
    {
        "name": "Alchemist's Shop",
        "img": "assets/maps/alchemist-shop.jpg",
        "nav": "Alchemist",
    },
]


def foundry_id(rng: random.Random) -> str:
    """Foundry document IDs are 16 alphanumeric characters."""
    alphabet = string.ascii_letters + string.digits
    return "".join(rng.choice(alphabet) for _ in range(16))


def build_scene(spec: dict, rng: random.Random, sort: int) -> dict:
    img_path = FOUNDRY_DATA / spec["img"]
    if img_path.exists():
        with Image.open(img_path) as im:
            width, height = im.size
    else:
        raise FileNotFoundError(f"map not found: {img_path}")

    return {
        "_id": foundry_id(rng),
        "name": spec["name"],
        "active": False,
        "navigation": True,
        "navName": spec.get("nav", ""),
        "navOrder": sort,
        "sort": sort * 100,
        "background": {"src": spec["img"], "offsetX": 0, "offsetY": 0,
                       "scaleX": 1, "scaleY": 1, "tint": None},
        "foreground": None,
        "width": width,
        "height": height,
        "padding": 0.25,
        "backgroundColor": "#111111",
        "grid": {
            "type": 1,               # square
            "size": DEFAULT_GRID,    # align in the UI — maps are gridless
            "style": "solidLines",
            "thickness": 1,
            "color": "#000000",
            "alpha": 0.15,
            "distance": 5,
            "units": "ft",
        },
        "initial": None,
        "tokenVision": True,
        "fog": {"exploration": True, "overlay": None, "colors":
                {"explored": None, "unexplored": None}},
        "environment": {
            "darknessLevel": 0,
            "globalLight": {"enabled": True, "alpha": 0.5, "bright": False,
                            "color": None, "coloration": 1, "contrast": 0,
                            "darkness": {"min": 0, "max": 0}, "luminosity": 0,
                            "saturation": 0, "shadows": 0},
        },
        "drawings": [], "tokens": [], "lights": [], "notes": [],
        "sounds": [], "regions": [], "templates": [], "tiles": [], "walls": [],
        "playlist": None, "playlistSound": None, "journal": None,
        "journalEntryPage": None, "weather": "", "folder": None,
        "ownership": {"default": 0},
        "flags": {},
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, required=True,
                    help="directory to write scene JSON into")
    ap.add_argument("--seed", type=int, default=None,
                    help="seed for reproducible document IDs")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    args.out.mkdir(parents=True, exist_ok=True)

    for i, spec in enumerate(SCENES):
        scene = build_scene(spec, rng, i)
        # fvtt pack expects one file per document, named after it.
        slug = spec["img"].rsplit("/", 1)[-1].rsplit(".", 1)[0]
        dest = args.out / f"{slug}.json"
        dest.write_text(json.dumps(scene, indent=2) + "\n")
        print(f"  ✓ {scene['name']:20} {scene['width']}x{scene['height']}  → {dest.name}")

    print(f"\n  {len(SCENES)} scenes written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
