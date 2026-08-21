#!/usr/bin/env python3
"""Build a dynamic-token-ring *subject* texture from a piece of round token art.

Why this exists
---------------
When a token has Foundry's dynamic ring enabled, the ring draws
``prototypeToken.ring.subject.texture`` — **not** ``texture.src``. Change the art
without changing the subject and the token keeps showing the old picture with no
error anywhere: the document says one thing, the canvas draws another. That bit us
on 2026-08-16 when the two Space Journey PCs were re-arted and looked unchanged in
the scene.

The spec (measured off the subjects already in the world, all identical)
------------------------------------------------------------------------
512x512 RGBA canvas, fully transparent, with the source art scaled to occupy the
centred **two-thirds** safe area: 341x341 at offset (85, 85). Nothing is cut out
and no background is removed — the source disc, decorative border and all, is
simply shrunk so the ring has room to draw around it.

Usage
-----
    ./.venv/bin/python scripts/foundry/ring_subject.py <source-image> [...]

Writes ``<slug>-<6 hex of the source's sha1>.webp`` into
``assets/tokens/custom/ring-subjects/`` under the Foundry data dir and prints the
Foundry-relative path to set as ``ring.subject.texture``. The hex suffix is only a
uniquifier — the subjects authored before this script used a random one, so don't
expect an existing filename to reproduce.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from PIL import Image

CANVAS = 512
SAFE = round(CANVAS * 2 / 3)  # 341 — Foundry's two-thirds ring safe area
OFFSET = (CANVAS - SAFE) // 2  # 85

DATA = Path.home() / "Library/Application Support/FoundryVTT/Data"
OUT_DIR = DATA / "assets/tokens/custom/ring-subjects"


def build(source: Path) -> Path:
    """Write the subject texture for `source` and return its path on disk."""
    art = Image.open(source).convert("RGBA").resize((SAFE, SAFE), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(art, (OFFSET, OFFSET), art)

    digest = hashlib.sha1(source.read_bytes()).hexdigest()[:6]
    out = OUT_DIR / f"{source.stem}-{digest}.webp"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(out, "WEBP", quality=92, method=6)
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    for arg in argv:
        src = Path(arg).expanduser()
        if not src.is_file():
            print(f"not a file: {src}", file=sys.stderr)
            return 1
        out = build(src)
        # The path Foundry wants is relative to the data dir, not absolute.
        print(out.relative_to(DATA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
