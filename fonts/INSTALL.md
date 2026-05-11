# Installing the dnd-dice font

The `dnd-dice.ttf` font lets your terminal render custom dice glyphs returned by
the `roll_dice` MCP tool. The font hijacks rarely-used alchemical symbols
(U+1F700–U+1F705) instead of Private Use Area codepoints, because Claude Code's
TUI strips PUA from chat output (anthropics/claude-code#49270). Place
`'DnD Dice'` *first* in your terminal's font family so these codepoints resolve
to our font before the system's default emoji renderer.

## macOS

```bash
cp fonts/dnd-dice.ttf ~/Library/Fonts/
```

Then **fully quit** your terminal (Cmd+Q — not just close the window), wait a
second, and relaunch. To verify the font loaded, run:

```bash
.venv/bin/python scripts/validate_font_macos.py ~/Library/Fonts/dnd-dice.ttf
```

This calls Apple's Core Text APIs (the same ones Font Book uses) and confirms
the font is registered, all 6 codepoints map, and bitmaps actually rasterize.

### macOS font registry quirks

If `CTFontManagerCopyAvailableFontFamilyNames` doesn't list "DnD Dice" after
copying the file, the user-level font registry is stale. Two fixes:

1. **Logout + login** (or reboot) — clears the user font cache.
2. Or open the .ttf in Font Book and click Install — forces a refresh.

You can verify whether macOS sees the font with:

```bash
.venv/bin/python -c "
import CoreText, CoreFoundation
fams = CoreText.CTFontManagerCopyAvailableFontFamilyNames()
n = CoreFoundation.CFArrayGetCount(fams)
print([str(CoreFoundation.CFArrayGetValueAtIndex(fams, i)) for i in range(n)
       if 'dice' in str(CoreFoundation.CFArrayGetValueAtIndex(fams, i)).lower()])
"
```

## Linux

```bash
mkdir -p ~/.fonts
cp fonts/dnd-dice.ttf ~/.fonts/
fc-cache -fv
```

## Windows

Right-click `fonts/dnd-dice.ttf` and choose "Install for all users".

## Configure your terminal

Most terminals fall back through a font stack. Add `'DnD Dice'` to your terminal's
font family list — it only contains glyphs for the dice codepoints, so your
regular monospace font will still be used for everything else.

**iTerm2 / Terminal.app:** Settings → Profiles → Text → Font. Some apps support a
"non-ASCII font" or fallback list — set `'DnD Dice'` there.

**VS Code:** Add to settings.json:

```json
{
  "terminal.integrated.fontFamily": "'DnD Dice', Menlo, monospace"
}
```

## Codepoint reference

We hijack 6 sequential Wide pictographs. Wide (UAX #11) means terminals like
xterm.js / VSCode allocate a 2-cell-wide box per character, which matches our
1em-square bitmap. (Earlier we used Alchemical Symbols U+1F700+, which are
Neutral-width — terminals gave them only 1 cell, causing the bitmap to render
shifted/clipped.)

| Die  | Codepoint | Hijacked symbol | EAW |
|------|-----------|-----------------|-----|
| d4   | U+1F518   | RADIO BUTTON                          | W   |
| d6   | U+1F519   | BACK WITH LEFTWARDS ARROW ABOVE       | W   |
| d8   | U+1F51A   | END WITH LEFTWARDS ARROW ABOVE        | W   |
| d10  | U+1F51B   | ON WITH EXCLAMATION MARK WITH ARROW   | W   |
| d12  | U+1F51C   | SOON WITH RIGHTWARDS ARROW ABOVE      | W   |
| d20  | U+1F51D   | TOP WITH UPWARDS ARROW ABOVE          | W   |
| d100 | two U+1F51B (d10) glyphs |||

## Rebuilding the font

If you replace any PNG in `fonts/source-images/`, regenerate the TTF:

```bash
.venv/bin/python scripts/build_dice_font.py
cp fonts/dnd-dice.ttf ~/Library/Fonts/  # macOS — re-install
```
