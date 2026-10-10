#!/usr/bin/env python3
"""Generate the six prompt-marker images for the pentaryn-prompts module.

A prompt marker is a hidden token Joe drops on a map with a few words on it. The art has to say
three things at a glance, on a busy battlemap, at sizes from half a square to four:

  * "this is a prompt, not a number/colour marker" -> a rounded speech bubble with a quill,
  * "this is the whole footprint"                  -> a dashed border at the image edge and a faint
                                                      wash inside it, so the token reads as a box,
  * "which size"                                    -> the size word inside the bubble.

One hue family for all six (ink-violet bubble, parchment text). Small and mid share a 1x1
footprint, so small's bubble is drawn noticeably smaller (and the actor also sets texture scale
0.8). The border is thicker on the small sizes so it is about as thick on the map at every size.

    ./.venv/bin/python scripts/foundry/prompt-marker-art.py            # module assets only
    ./.venv/bin/python scripts/foundry/prompt-marker-art.py --data     # also Data/assets/tokens/custom/markers/

Writes 512x512 RGBA webp into foundry/module/pentaryn-prompts/assets/marker-<size>.webp, which is
what the marker actors point at (modules/pentaryn-prompts/assets/...). `--data` also copies them to
$FOUNDRY_DATA/assets/tokens/custom/markers/prompt-<size>.webp beside the colour/number markers.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "foundry/module/pentaryn-prompts/assets"
DATA_DIR = Path.home() / "Library/Application Support/FoundryVTT/Data/assets/tokens/custom/markers"

SIZE = 512
SS = 2                      # supersample, then downscale for smooth edges
INK = (91, 63, 166)         # #5b3fa6
INK_DARK = (52, 34, 102)
PARCHMENT = (243, 233, 210)  # #f3e9d2
QUILL = (250, 246, 236)

# size key -> (bubble scale of the canvas, border width px at 512, word)
SIZES = {
    "tiny":  (0.78, 16, "tiny"),
    "small": (0.60, 11, "small"),
    "mid":   (0.78, 11, "mid"),
    "large": (0.66, 8, "large"),
    "xl":    (0.56, 6, "xl"),
    "xxl":   (0.50, 5, "xxl"),
}

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _font(px: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, px)
    return ImageFont.load_default(size=px)


def _dashed_rect(draw: ImageDraw.ImageDraw, inset: float, width: int, dash: int, gap: int, fill) -> None:
    """A dashed square border `inset` px in from the edge (all at supersampled scale)."""
    n = SIZE * SS
    x0 = y0 = inset
    x1 = y1 = n - inset
    for (ax, ay, bx, by) in ((x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)):
        length = math.hypot(bx - ax, by - ay)
        ux, uy = (bx - ax) / length, (by - ay) / length
        pos = 0.0
        while pos < length:
            end = min(pos + dash, length)
            draw.line((ax + ux * pos, ay + uy * pos, ax + ux * end, ay + uy * end), fill=fill, width=width)
            pos += dash + gap


def _bubble(draw: ImageDraw.ImageDraw, scale: float) -> tuple[float, float, float, float]:
    """Rounded speech bubble with a tail at the lower left; returns its body box."""
    n = SIZE * SS
    w = n * scale
    h = w * 0.72
    cx, cy = n / 2, n / 2 - w * 0.06
    box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    r = h * 0.32
    outline = max(4, int(w * 0.022))
    # tail: a triangle from the lower-left of the body down and out
    tail = [(cx - w * 0.28, box[3] - r * 0.4), (cx - w * 0.06, box[3] - r * 0.2), (cx - w * 0.36, box[3] + h * 0.30)]
    draw.polygon(tail, fill=INK_DARK)
    draw.rounded_rectangle(box, radius=r, fill=INK, outline=INK_DARK, width=outline)
    # cover the seam where the tail meets the body
    draw.polygon([(tail[0][0] + outline, tail[0][1] - outline), (tail[1][0] - outline, tail[1][1] - outline),
                  (tail[2][0] + outline * 1.2, tail[2][1] - outline * 2.2)], fill=INK)
    return box


def _quill(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float]) -> None:
    """A feather quill across the bubble's upper-right corner."""
    x0, y0, x1, y1 = box
    w = x1 - x0
    base = (x1 - w * 0.10, y0 + w * 0.02)      # nib end, inside the bubble
    tip = (x1 + w * 0.12, y0 - w * 0.22)       # feather end, outside
    dx, dy = tip[0] - base[0], tip[1] - base[1]
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    vane = w * 0.07
    pts = []
    steps = 14
    for i in range(steps + 1):  # one side of the vane
        t = i / steps
        bulge = math.sin(math.pi * min(1.0, t * 1.15)) * vane
        pts.append((base[0] + dx * (0.18 + 0.82 * t) + px * bulge, base[1] + dy * (0.18 + 0.82 * t) + py * bulge))
    for i in range(steps, -1, -1):
        t = i / steps
        bulge = math.sin(math.pi * min(1.0, t * 1.15)) * vane * 0.75
        pts.append((base[0] + dx * (0.18 + 0.82 * t) - px * bulge, base[1] + dy * (0.18 + 0.82 * t) - py * bulge))
    draw.polygon(pts, fill=QUILL, outline=INK_DARK, width=max(3, int(w * 0.012)))
    draw.line((base[0] - ux * w * 0.05, base[1] - uy * w * 0.05, tip[0], tip[1]), fill=INK_DARK, width=max(3, int(w * 0.012)))
    # the nib
    draw.polygon([(base[0] - ux * w * 0.08, base[1] - uy * w * 0.08),
                  (base[0] + px * w * 0.018, base[1] + py * w * 0.018),
                  (base[0] - px * w * 0.018, base[1] - py * w * 0.018)], fill=INK_DARK)


def render(key: str) -> Image.Image:
    scale, border, word = SIZES[key]
    n = SIZE * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    wash = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    ImageDraw.Draw(wash).rectangle((0, 0, n, n), fill=(*INK, 38))
    img = Image.alpha_composite(img, wash)
    draw = ImageDraw.Draw(img)
    bw = border * SS
    _dashed_rect(draw, inset=bw / 2 + SS, width=bw, dash=int(n * 0.07), gap=int(n * 0.04), fill=(*INK, 235))
    box = _bubble(draw, scale)
    _quill(draw, box)
    # the size word, as large as fits the bubble body
    bx0, by0, bx1, by1 = box
    target_w = (bx1 - bx0) * 0.74
    target_h = (by1 - by0) * 0.52
    px = int(target_h)
    font = _font(px)
    while px > 10:
        font = _font(px)
        l, t, r, b = draw.textbbox((0, 0), word, font=font)
        if r - l <= target_w and b - t <= target_h:
            break
        px -= 4
    l, t, r, b = draw.textbbox((0, 0), word, font=font)
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    draw.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), word, font=font, fill=PARCHMENT,
              stroke_width=max(2, px // 18), stroke_fill=INK_DARK)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", action="store_true", help="also copy into Foundry Data/assets/tokens/custom/markers/")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for key in SIZES:
        im = render(key)
        out = OUT_DIR / f"marker-{key}.webp"
        im.save(out, "WEBP", quality=90, method=6)
        print(f"wrote {out.relative_to(REPO)}")
        if args.data:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            dst = DATA_DIR / f"prompt-{key}.webp"
            im.save(dst, "WEBP", quality=90, method=6)
            print(f"wrote {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
