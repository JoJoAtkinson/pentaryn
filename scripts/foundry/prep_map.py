#!/usr/bin/env python3
"""Crop, measure, and install a battlemap into Foundry's asset directory.

Many published battlemaps ship as a single image containing TWO panels side by
side — ground floor / upper floor, or unlit / lit. Foundry wants one image per
scene, so this splits them.

It also measures the grid by autocorrelating a high-pass-filtered brightness
profile: grid lines are the dominant periodic signal in a battlemap, so the
first strong autocorrelation peak is the cell size in pixels. That number goes
straight into the scene's `grid.size`, which is what makes tokens line up
without any manual "align grid" fiddling.

Usage:
    python -m scripts.foundry.prep_map SRC --panel left --name tipsy-lantern
    python -m scripts.foundry.prep_map SRC --panel full --name undercity --no-trim

Prints the scene parameters to feed into Foundry (or into build_scenes.py).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

FOUNDRY_DATA = Path.home() / "Library/Application Support/FoundryVTT/Data"
MAPS_DIR = FOUNDRY_DATA / "assets/maps"

# Grid cells in published battlemaps are essentially always in this range.
MIN_CELL_PX = 20
MAX_CELL_PX = 200


def find_panels(img: Image.Image, dark_thresh: int = 28) -> list[tuple[int, int]]:
    """Find horizontal spans of non-dark content — one per panel.

    Two-panel maps have a dark gutter between them and a dark frame around the
    outside. Column-mean brightness makes both obvious.
    """
    g = np.asarray(img.convert("L"), dtype=np.float32)
    col_mean = g.mean(axis=0)
    lit = col_mean > dark_thresh

    spans: list[tuple[int, int]] = []
    start = None
    for x, on in enumerate(lit):
        if on and start is None:
            start = x
        elif not on and start is not None:
            spans.append((start, x))
            start = None
    if start is not None:
        spans.append((start, len(lit)))

    # Drop slivers — frame artifacts, not panels.
    min_w = img.width * 0.15
    return [s for s in spans if (s[1] - s[0]) >= min_w]


def trim_dark_border(img: Image.Image, dark_thresh: int = 28) -> Image.Image:
    """Crop the dark frame off a single panel."""
    g = np.asarray(img.convert("L"), dtype=np.float32)
    rows = np.where(g.mean(axis=1) > dark_thresh)[0]
    cols = np.where(g.mean(axis=0) > dark_thresh)[0]
    if rows.size == 0 or cols.size == 0:
        return img
    return img.crop((int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1))


def measure_grid(img: Image.Image) -> tuple[float | None, float]:
    """Return (cell_size_px, confidence 0-1) via autocorrelation.

    Averages the estimate from both axes when they agree, which they should on
    a square grid — disagreement is the main signal that detection failed.
    """
    g = np.asarray(img.convert("L"), dtype=np.float32)

    def axis_period(profile: np.ndarray) -> tuple[float | None, float]:
        # High-pass: subtract a moving average to kill slow illumination drift,
        # leaving the periodic grid-line signal.
        k = 31
        kernel = np.ones(k) / k
        smooth = np.convolve(profile, kernel, mode="same")
        hp = profile - smooth
        hp -= hp.mean()
        if hp.std() < 1e-6:
            return None, 0.0
        hp /= hp.std()

        ac = np.correlate(hp, hp, mode="full")[len(hp) - 1:]
        ac /= ac[0]

        lo, hi = MIN_CELL_PX, min(MAX_CELL_PX, len(ac) - 1)
        if hi <= lo:
            return None, 0.0
        window = ac[lo:hi]
        peak = int(np.argmax(window)) + lo
        return float(peak), float(ac[peak])

    py, cy = axis_period(g.mean(axis=1))
    px, cx = axis_period(g.mean(axis=0))

    candidates = [(p, c) for p, c in ((py, cy), (px, cx)) if p]
    if not candidates:
        return None, 0.0
    if len(candidates) == 2 and abs(candidates[0][0] - candidates[1][0]) <= 2:
        # Both axes agree — average them and take the stronger confidence.
        return (candidates[0][0] + candidates[1][0]) / 2, max(cy, cx)
    return max(candidates, key=lambda t: t[1])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", type=Path)
    ap.add_argument("--panel", choices=["left", "right", "full"], default="full")
    ap.add_argument("--name", required=True, help="output basename (no extension)")
    ap.add_argument("--no-trim", action="store_true", help="keep the dark border")
    ap.add_argument("--grid", type=float, help="override measured grid size (px)")
    ap.add_argument("--quality", type=int, default=88)
    args = ap.parse_args()

    if not args.source.exists():
        print(f"✗ no such file: {args.source}", file=sys.stderr)
        return 1

    img = Image.open(args.source)
    img.load()
    orig = img.size

    if args.panel != "full":
        panels = find_panels(img)
        if len(panels) < 2:
            print(f"✗ expected 2 panels, found {len(panels)} — use --panel full",
                  file=sys.stderr)
            return 1
        x0, x1 = panels[0] if args.panel == "left" else panels[-1]
        img = img.crop((x0, 0, x1, img.height))

    if not args.no_trim:
        img = trim_dark_border(img)

    cell, conf = (args.grid, 1.0) if args.grid else measure_grid(img)

    MAPS_DIR.mkdir(parents=True, exist_ok=True)
    out = MAPS_DIR / f"{args.name}.jpg"
    img.convert("RGB").save(out, "JPEG", quality=args.quality, optimize=True)

    scene = {
        "name": args.name,
        "img": f"assets/maps/{args.name}.jpg",
        "width": img.width,
        "height": img.height,
        "grid_size": round(cell) if cell else None,
        "grid_confidence": round(conf, 3),
        "cells_across": round(img.width / cell, 1) if cell else None,
        "cells_down": round(img.height / cell, 1) if cell else None,
    }

    print(f"  source : {args.source.name} {orig[0]}x{orig[1]}")
    print(f"  panel  : {args.panel}")
    print(f"  output : {out}")
    print(f"  size   : {img.width} x {img.height}")
    if cell:
        flag = "" if conf >= 0.25 else "   ⚠️ LOW CONFIDENCE — verify in Foundry"
        print(f"  grid   : {round(cell)} px/cell (confidence {conf:.2f}){flag}")
        print(f"  cells  : {scene['cells_across']} x {scene['cells_down']}")
    else:
        print("  grid   : ✗ could not detect — set manually in Foundry")
    print(json.dumps(scene))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
