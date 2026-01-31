#!/usr/bin/env python3
"""
Take the image currently in the macOS clipboard, crop to the largest centered square,
mask it into a circle with a transparent background, and put the result back into
the clipboard as PNG.

Usage:
  .venv/bin/python scripts/clipboard_circle.py
  python3 scripts/clipboard_circle.py

Output:
  Writes a PNG to ~/Downloads and also replaces the clipboard image with the circular PNG.

Token sizing:
  The output is normalized to a common VTT token size:
    72 DPI × 2 inches = 144×144 px
  (DPI metadata is embedded for editors; most VTTs only care about pixel dimensions.)

Token look:
  Adds a subtle vignette and a metallic rim so it reads as a "token" in a VTT.
"""

from __future__ import annotations

import platform
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

TOKEN_DPI = 72
TOKEN_INCHES = 2
TOKEN_PX = TOKEN_DPI * TOKEN_INCHES

TOKEN_BORDER_STYLE = "obsidian"  # options: bronze, iron, obsidian, verdigris
TOKEN_BORDER_PX = 12
TOKEN_INNER_STROKE_PX = 2
TOKEN_VIGNETTE_STRENGTH = 0.28  # 0..1
TOKEN_AA_SCALE = 4  # supersample factor for smooth edges


def _run_osascript(script: str) -> None:
    proc = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "").strip() or "osascript failed"
        raise RuntimeError(msg)


def _as_quote(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def export_clipboard_png(out_path: Path) -> None:
    script = f"""
        set outFile to POSIX file "{_as_quote(out_path.as_posix())}"
        try
            set imgData to (the clipboard as «class PNGf»)
        on error
            set imgData to (the clipboard as «class TIFF»)
        end try
        set f to open for access outFile with write permission
        set eof f to 0
        write imgData to f
        close access f
    """
    _run_osascript(script)


def import_png_to_clipboard(in_path: Path) -> None:
    script = f"""
        set the clipboard to (read (POSIX file "{_as_quote(in_path.as_posix())}") as «class PNGf»)
    """
    _run_osascript(script)


def crop_center_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def circle_mask(size: int) -> Image.Image:
    scale = max(1, int(TOKEN_AA_SCALE))
    big = size * scale
    mask_big = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask_big)
    draw.ellipse((0, 0, big - 1, big - 1), fill=255)
    if scale == 1:
        return mask_big
    return mask_big.resize((size, size), resample=Image.Resampling.LANCZOS)


def circle_crop_rgba(img: Image.Image, *, size: int) -> Image.Image:
    square = crop_center_square(img.convert("RGBA"))
    if square.size != (size, size):
        square = square.resize((size, size), resample=Image.Resampling.LANCZOS)
    mask = circle_mask(size)
    r, g, b, a = square.split()
    a2 = ImageChops.multiply(a, mask)
    out = square.copy()
    out.putalpha(a2)
    return out


def _theme_colors(name: str) -> dict[str, tuple[int, int, int, int]]:
    name = (name or "").strip().lower()
    themes: dict[str, dict[str, tuple[int, int, int, int]]] = {
        "bronze": {
            "light": (212, 171, 102, 255),
            "dark": (78, 49, 25, 255),
            "stroke": (25, 16, 10, 180),
            "highlight": (255, 240, 210, 130),
        },
        "iron": {
            "light": (200, 205, 214, 255),
            "dark": (54, 60, 70, 255),
            "stroke": (15, 18, 22, 175),
            "highlight": (255, 255, 255, 115),
        },
        "obsidian": {
            "light": (92, 90, 110, 255),
            "dark": (18, 16, 24, 255),
            "stroke": (0, 0, 0, 190),
            "highlight": (210, 210, 255, 95),
        },
        "verdigris": {
            "light": (145, 202, 186, 255),
            "dark": (18, 64, 58, 255),
            "stroke": (6, 24, 22, 175),
            "highlight": (230, 255, 250, 110),
        },
    }
    return themes.get(name, themes["bronze"])


def _scale_alpha(alpha: Image.Image, factor: float) -> Image.Image:
    factor = max(0.0, min(1.0, float(factor)))
    if factor == 1.0:
        return alpha
    return alpha.point(lambda p: int(p * factor))


def apply_token_vignette(img: Image.Image, *, strength: float, border_px: int) -> Image.Image:
    size = img.size[0]
    circle = circle_mask(size)

    inner = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(inner)
    inset = max(1, int(border_px * 0.8))
    draw.ellipse((inset, inset, size - 1 - inset, size - 1 - inset), fill=255)
    inner = inner.filter(ImageFilter.GaussianBlur(radius=max(2, int(border_px * 0.65))))

    edge = ImageChops.multiply(ImageOps.invert(inner), circle)
    edge = _scale_alpha(edge, strength)
    shade = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    shade.putalpha(edge)
    return Image.alpha_composite(img, shade)


def apply_token_border(img: Image.Image, *, style: str, border_px: int, inner_stroke_px: int) -> Image.Image:
    size = img.size[0]
    colors = _theme_colors(style)

    circle = circle_mask(size)
    inner = max(1, int(border_px))

    scale = max(1, int(TOKEN_AA_SCALE))
    big = size * scale
    ring_big = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(ring_big)
    draw.ellipse((0, 0, big - 1, big - 1), fill=255)
    inner_big = inner * scale
    draw.ellipse((inner_big, inner_big, big - 1 - inner_big, big - 1 - inner_big), fill=0)
    ring = ring_big.resize((size, size), resample=Image.Resampling.LANCZOS) if scale != 1 else ring_big

    # Directional "metal" gradient across the ring (top-left brighter, bottom-right darker).
    g = Image.linear_gradient("L").resize((size, size), resample=Image.Resampling.BICUBIC)
    g = g.rotate(45, resample=Image.Resampling.BICUBIC)
    ring_rgb = ImageOps.colorize(g, black=colors["dark"][:3], white=colors["light"][:3]).convert("RGBA")
    ring_rgb.putalpha(ring)

    # Thin highlight on the outer rim.
    highlight_big = Image.new("L", (big, big), 0)
    h = ImageDraw.Draw(highlight_big)
    h_width = max(2, int(border_px * 0.25))
    h.ellipse((0, 0, big - 1, big - 1), outline=255, width=max(1, h_width * scale))
    highlight = (
        highlight_big.resize((size, size), resample=Image.Resampling.LANCZOS) if scale != 1 else highlight_big
    )
    highlight = highlight.filter(ImageFilter.GaussianBlur(radius=max(1, int(border_px * 0.12))))
    highlight = ImageChops.multiply(highlight, ring)
    hl = Image.new("RGBA", (size, size), colors["highlight"])
    hl.putalpha(highlight)

    # Inner separating stroke so the art doesn't visually merge into the rim.
    stroke_big = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    s = ImageDraw.Draw(stroke_big)
    s_inset = max(1, inner - (inner_stroke_px // 2))
    s_inset_big = s_inset * scale
    s.ellipse(
        (s_inset_big, s_inset_big, big - 1 - s_inset_big, big - 1 - s_inset_big),
        outline=colors["stroke"],
        width=max(1, int(inner_stroke_px) * scale),
    )
    stroke = stroke_big.resize((size, size), resample=Image.Resampling.LANCZOS) if scale != 1 else stroke_big
    stroke.putalpha(ImageChops.multiply(stroke.getchannel("A"), circle))

    out = img
    out = Image.alpha_composite(out, ring_rgb)
    out = Image.alpha_composite(out, hl)
    out = Image.alpha_composite(out, stroke)
    return out


def apply_token_finish(img: Image.Image) -> Image.Image:
    out = img
    out = apply_token_vignette(out, strength=TOKEN_VIGNETTE_STRENGTH, border_px=TOKEN_BORDER_PX)
    out = apply_token_border(
        out,
        style=TOKEN_BORDER_STYLE,
        border_px=TOKEN_BORDER_PX,
        inner_stroke_px=TOKEN_INNER_STROKE_PX,
    )
    return out


def main() -> int:
    if platform.system() != "Darwin":
        print("Error: This script currently supports macOS only.", file=sys.stderr)
        return 2

    downloads_dir = Path.home() / "Downloads"
    if not downloads_dir.exists():
        downloads_dir = Path.cwd()
    out_name = f"clipboard-circle-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
    dst = downloads_dir / out_name

    with tempfile.TemporaryDirectory(prefix="dnd-clipboard-circle-") as d:
        tmp_dir = Path(d)
        src = tmp_dir / "in.bin"
        tmp_out = tmp_dir / "out.png"

        try:
            export_clipboard_png(src)
        except Exception as e:
            print(
                "Error: Clipboard doesn't contain an image (or it couldn't be read as PNG).",
                file=sys.stderr,
            )
            print(str(e), file=sys.stderr)
            return 2

        try:
            img = Image.open(src)
            out = circle_crop_rgba(img, size=TOKEN_PX)
            out = apply_token_finish(out)
            out.save(tmp_out, format="PNG", dpi=(TOKEN_DPI, TOKEN_DPI))
            shutil.move(str(tmp_out), str(dst))
        except Exception as e:
            print(f"Error: Failed to process image: {e}", file=sys.stderr)
            return 2

        try:
            import_png_to_clipboard(dst)
        except Exception as e:
            print(f"Error: Failed to write result back to clipboard: {e}", file=sys.stderr)
            return 2

        print(f"OK: saved {out.size[0]}x{out.size[1]} circular PNG to {dst}")
        print("OK: clipboard updated")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
