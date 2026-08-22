#!/usr/bin/env python3
"""Generate the travel-indicator glyph family.

A scene link (see context/foundry/scene-links.md) is a Region with a
teleportToken behavior — invisible to players by design. These glyphs are the
*sign* that goes with it: a soft feathered mark laid down as a Tile, below the
token layer, saying "you can leave from here".

Deliberately in the `interact-glint` register, not the `icon-eye` one. No hard
outline, no fill — the maps are dark and already lit, and a bold outlined badge
reads as UI sitting on top of the art. These sit *in* it.

Directionality comes from the Tile's `rotation`, not from the asset, so one
chevron file serves stairs up, stairs down, and a street heading off-map.

    ./.venv/bin/python scripts/foundry/travel_glyph.py

Writes 256x256 RGBA webp into
    $FOUNDRY_DATA/assets/tokens/custom/props/
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

FOUNDRY_DATA = Path.home() / "Library/Application Support/FoundryVTT/Data"
OUT_DIR = FOUNDRY_DATA / "assets/tokens/custom/props"

SIZE = 256

# Warm white is the default: it reads as *light*, not as magic, so it sits on a
# mundane wooden staircase without implying a portal. Cyan is for things that
# genuinely are arcane. Gold matches the ring/marker palette but risks vanishing
# into sconce light on the warm-lit Seafoot interiors.
PALETTE = {
    "": (255, 246, 230),        # warm white — the default
    "-cyan": (150, 214, 255),   # arcane: portals, summoning circles
    "-gold": (255, 204, 77),    # matches the PC ring tier
}


def _canvas() -> Image.Image:
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


def _bloom(shape: Image.Image, radius: int, gain: float) -> Image.Image:
    """A blurred copy of `shape` to sit underneath it as an atmospheric glow."""
    glow = shape.filter(ImageFilter.GaussianBlur(radius))
    a = glow.getchannel("A").point(lambda v: min(255, int(v * gain)))
    glow.putalpha(a)
    return glow


def _chevron(draw: ImageDraw.ImageDraw, cy: int, rgb: tuple, alpha: int,
             half_w: int = 62, rise: int = 34, width: int = 26) -> None:
    """One ^ centred horizontally, apex at `cy`."""
    cx = SIZE // 2
    draw.line(
        [(cx - half_w, cy + rise), (cx, cy), (cx + half_w, cy + rise)],
        fill=rgb + (alpha,), width=width, joint="curve",
    )
    # `joint="curve"` rounds the elbow but leaves the two ends square; discs at
    # the tips finish the rounded-cap look PIL's line() will not do itself.
    r = width // 2
    for px, py in ((cx - half_w, cy + rise), (cx + half_w, cy + rise)):
        draw.ellipse([px - r, py - r, px + r, py + r], fill=rgb + (alpha,))


def build_chevron(rgb: tuple) -> Image.Image:
    """Leading chevron bright, trailing chevron faint — the pair reads as motion.

    Same idea as the existing icon-chevron.webp, but centred in the canvas so it
    can be placed by centre-point like everything else in foundry-markers.md.
    """
    sharp = _canvas()
    d = ImageDraw.Draw(sharp)
    _chevron(d, cy=84, rgb=rgb, alpha=255)    # leading
    _chevron(d, cy=140, rgb=rgb, alpha=96)    # trailing, half-lost

    out = _canvas()
    out.alpha_composite(_bloom(sharp, radius=14, gain=0.85))
    out.alpha_composite(sharp)
    return out


def build_ring(rgb: tuple) -> Image.Image:
    """Non-directional: a soft annulus for "you can leave from anywhere here" —
    a street mouth, a cave entrance, a scene edge where facing is meaningless."""
    sharp = _canvas()
    d = ImageDraw.Draw(sharp)
    cx = cy = SIZE // 2
    r, w = 78, 18
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=rgb + (235,), width=w)
    # A dot in the middle keeps it from reading as an empty selection circle.
    d.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], fill=rgb + (200,))

    out = _canvas()
    out.alpha_composite(_bloom(sharp, radius=16, gain=0.8))
    out.alpha_composite(sharp)
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = []
    for suffix, rgb in PALETTE.items():
        for stem, build in (("travel-chevron", build_chevron),
                            ("travel-ring", build_ring)):
            path = OUT_DIR / f"{stem}{suffix}.webp"
            build(rgb).save(path, "WEBP", lossless=True, quality=100)
            written.append(path)
    for p in written:
        print(f"{p.relative_to(FOUNDRY_DATA)}  {p.stat().st_size:,} B")


if __name__ == "__main__":
    main()
