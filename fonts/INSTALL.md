# Installing the dnd-dice font

The `dnd-dice.ttf` font lets your terminal render custom dice glyphs returned by
the `roll_dice` MCP tool (private-use Unicode U+E000–U+E005).

## macOS

```bash
cp fonts/dnd-dice.ttf ~/Library/Fonts/
```

Then restart your terminal application (Terminal.app, iTerm2, VS Code's integrated
terminal) so it picks up the new font.

## Linux

```bash
mkdir -p ~/.fonts
cp fonts/dnd-dice.ttf ~/.fonts/
fc-cache -fv
```

## Windows

Right-click `fonts/dnd-dice.ttf` and choose "Install for all users".

## Configure your terminal

Most terminals fall back through a font stack. Add `dnd-dice` to your terminal's
font family list — it only contains glyphs for the dice codepoints, so your
regular monospace font will still be used for everything else.

**iTerm2 / Terminal.app:** Settings → Profiles → Text → Font. Some apps support a
"non-ASCII font" or fallback list — set `dnd-dice` there.

**VS Code:** Add to settings.json:

```json
{
  "terminal.integrated.fontFamily": "Menlo, 'DnD Dice', monospace"
}
```

## Codepoint reference

| Die  | Codepoint |
|------|-----------|
| d4   | U+E000    |
| d6   | U+E001    |
| d8   | U+E002    |
| d10  | U+E003    |
| d12  | U+E004    |
| d20  | U+E005    |
| d100 | two U+E003 (d10) glyphs |

## Rebuilding the font

If you replace any PNG in `fonts/source-images/`, regenerate the TTF:

```bash
.venv/bin/python scripts/build_dice_font.py
cp fonts/dnd-dice.ttf ~/Library/Fonts/  # macOS — re-install
```
