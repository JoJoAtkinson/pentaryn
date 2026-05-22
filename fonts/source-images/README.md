# Dice Source Images

This directory holds the PNG source images for the custom `dnd-dice.ttf` font.

## Required files

Download from [emoji.gg](https://emoji.gg) (Cruxoflux artist set):

| File | Source | Maps To |
|------|--------|---------|
| `d4.png` | https://emoji.gg/emoji/d4 | U+E000 |
| `d6.png` | https://emoji.gg/emoji/d6 | U+E001 |
| `d8.png` | https://emoji.gg/emoji/d8 | U+E002 |
| `d10.png` | https://emoji.gg/emoji/d10 | U+E003 |
| `d12.png` | https://emoji.gg/emoji/d12 | U+E004 |
| `d20.png` | https://emoji.gg/emoji/d20 | U+E005 |

PNGs should be RGBA (transparent background). Source resolution doesn't matter — `build_dice_font.py` resizes everything to 128x128 with transparent padding before embedding.

## Rebuilding the font

After replacing/updating PNGs, regenerate the TTF:

```bash
.venv/bin/python scripts/build_dice_font.py
```

The script outputs `fonts/dnd-dice.ttf`.
