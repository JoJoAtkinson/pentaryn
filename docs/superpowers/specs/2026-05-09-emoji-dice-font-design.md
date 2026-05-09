---
title: Custom Emoji Dice Font + Rich JSON Roller Output
date: 2026-05-09
status: approved
---

# Custom Emoji Dice Font + Rich JSON Roller Output

## Overview

Integrate a custom emoji font library for D&D dice (d4–d20 + d100 as two d10s) into the dnd repo and configure Claude terminal to use it. Update the `roll_dice` MCP tool to return structured JSON that includes a ready-to-paste narrative with emoji, raw rolls, and bonuses applied. This allows the LLM (especially Haiku for speed) to grab the narrative without thinking, while preserving full audit trail if edge cases arise. The custom emoji proves dice rolls came from the roller, not hallucinated.

## Goals

1. **Fast for LLM:** One MCP call per roll action; Haiku can grab narrative and paste instantly
2. **Verifiable:** Custom emoji font makes it visually obvious that results came from the roller
3. **Flexible:** Support per-die bonuses, total modifiers, and multiple attack scenarios in a single call
4. **Persistent:** Font lives in repo so it's version-controlled and available across restarts

## Architecture

### 1. Custom Dice Font (`./fonts/dnd-dice.ttf`)

- **Location:** `/Users/joe/GitHub/dnd/fonts/` (checked into repo)
- **Unicode Mapping:** Private Use Area (U+E000–U+E006):
  - `U+E000` → d4 glyph (custom design/image)
  - `U+E001` → d6 glyph
  - `U+E002` → d8 glyph
  - `U+E003` → d10 glyph
  - `U+E004` → d12 glyph
  - `U+E005` → d20 glyph
  - `U+E006` → d100 glyph (or two d10s)

- **Design Process:**
  1. Source or design dice imagery (6+ images: d4, d6, d8, d10, d12, d20, optionally d100)
  2. Create TTF font file with those images mapped to private-use Unicode points
  3. Use fonttools or FontForge to build the font
  4. Place `dnd-dice.ttf` in `/fonts/`

- **Why Private Use Area:** No conflicts with standard Unicode, guaranteed to only render with your custom font, fallback shows raw codes if font unavailable

### 2. MCP Output Format

Returns JSON with narrative using private-use Unicode codes + structured data for auditing:

```json
{
  "narrative": "(15+2) (12+2) (18+2) = 51",
  "rolls": [15, 12, 18],
  "bonuses": [2, 2, 2],
  "rolls_with_bonuses": [17, 14, 20],
  "total_raw": 45,
  "total_with_bonuses": 51,
  "dice_code": "U+E005",
  "dice_notation": "3d20+2"
}
```

**How it works:**
- `` (d20) renders as your custom d20 glyph when terminal has `dnd-dice.ttf` loaded
- Without the font, shows as `🬅` or fallback character (still readable, but undecorated)
- LLM grabs narrative and pastes; terminal renders with custom font
- Raw rolls available if needed

**Quantum Marker:**
- Prefix `⚛️` appears in narrative **only** when source is `quantumnumbers` API
- No prefix if fallback to `random_org` (human can see at a glance which source was used)
- `source` field in JSON always indicates: `"quantumnumbers"` or `"random_org"`
- LLM knows from MCP description what `⚛️` means, but doesn't need to reason about it

**Example with quantum:**
```json
{
  "narrative": "⚛️ (15+2) (12+2) (18+2) = 51",
  "source": "quantumnumbers"
}
```

**Example with fallback:**
```json
{
  "narrative": "(15+2) (12+2) (18+2) = 51",
  "source": "random_org"
}
```

**Rationale for Haiku:** Structured JSON is compact. Haiku can grab the `narrative` field and paste directly. The `⚛️` marker provides human transparency without requiring LLM logic.

### 3. MCP Function Signature

```python
def roll_dice(
    num_dice: int,
    dice_size: int,
    bonuses: list[int] | None = None,
    modifier: int = 0
) -> str:
    """
    Roll D&D dice with flexible per-die bonuses.
    
    Args:
        num_dice: Number of dice to roll (1-100)
        dice_size: Sides per die (4, 6, 8, 10, 12, 20, 100)
        bonuses: Per-die bonuses [2, 2, 2] or None. Length must match num_dice or be None.
        modifier: Flat bonus/penalty applied to final total only
    
    Returns:
        JSON string with narrative + structured breakdown
    """
```

**Use Cases:**
- Single attack: `roll_dice(1, 20, bonuses=[5])` → d20+5
- Multiple attacks with same bonus: `roll_dice(2, 20, bonuses=[3, 3])`
- Damage roll with modifier: `roll_dice(3, 6, modifier=2)` → 3d6+2
- Complex (e.g., sneak attack): `roll_dice(4, 6, bonuses=[0, 0, 4, 4], modifier=1)` → base 2d6, plus 2d6 sneak attack dice

### 4. Claude Terminal Font Configuration

**Location:** Claude Code settings (`~/.claude/settings.json` or project `.claude/settings.json`)

**Configuration:**
```json
{
  "terminal": {
    "font": {
      "family": "dnd-dice",
      "fallback": "Menlo, Monaco, Courier New"
    },
    "fontPath": "/Users/joe/GitHub/dnd/fonts/dnd-dice.ttf"
  }
}
```

Or via `.claude/` if per-project:
- Store font reference in `.claude/settings.json`
- Terminal loads font from local repo path

## Data Flow

1. **User request:** "Roll 3d20+2"
2. **LLM calls MCP:** `roll_dice(num_dice=3, dice_size=20, bonuses=[2, 2, 2])`
3. **Roller returns JSON** with narrative + breakdown
4. **LLM pastes narrative:** "You rolled ⚴(15+2) ⚵(12+2) ⚶(18+2) = 51"
5. **Terminal renders** with custom emoji font
6. **User sees:** Visual emoji proof that results came from the roller

## Implementation Scope

### Phase 1: Font Library
- Source/design emoji for d4–d20
- Bundle into TTF file
- Place in `./fonts/dnd-dice.ttf`

### Phase 2: MCP Update
- Modify `scripts/dnd_roller.py`:
  - Add `bonuses` parameter (list or None)
  - Add per-die emoji glyphs to JSON output
  - Update narrative formatting to include emoji + math
  - Keep random.org fallback + quantumnumbers caching

### Phase 3: Terminal Configuration
- Update Claude Code settings to load custom font
- Test emoji rendering in terminal

## Error Handling

- **Bonuses mismatch:** If `len(bonuses) != num_dice` and `bonuses` is not None, raise ValueError
- **Invalid modifier:** Enforce -1000 to +1000 range
- **Font missing:** Terminal gracefully falls back to system emoji if custom font unavailable
- **API failure:** Existing fallback to random.org remains

## Testing

1. **Font rendering:** Verify each emoji displays correctly in terminal
2. **JSON output:** Confirm narrative math is correct for various scenarios
3. **Bonus math:** Test per-die + modifier combinations
4. **Haiku speed:** Single call, LLM can paste narrative without reasoning

## Success Criteria

- ✅ Custom emoji font loads in Claude terminal
- ✅ MCP returns JSON with narrative + structured data
- ✅ Narrative shows emoji + per-die breakdown clearly
- ✅ Haiku can grab narrative and paste in one response
- ✅ Full audit trail available in JSON for edge cases
- ✅ Font is version-controlled in repo

## Emoji Selection Strategy

Use existing Unicode die face emoji where available, with fallbacks:
- `d4` → ⚂ (Unicode U+2682, white die)
- `d6` → ⚃ (Unicode U+2683)
- `d8` → ⚄ (Unicode U+2684)
- `d10` → ⚅ (Unicode U+2685)
- `d12` → 🎲 (dice emoji, U+1F3B2) if die-specific unavailable
- `d20` → ⚁ (Unicode U+2681)
- `d100` → two ⚅ side-by-side (e.g., "⚅⚅")

**Tool:** Use fonttools (Python) to bundle existing emoji into TTF, or source pre-built emoji font and extract/configure for these glyphs only.

## Terminal Configuration Strategy

Add to project `.claude/settings.json`:
```json
{
  "terminal": {
    "fontFamily": "Monaco, Menlo",
    "fontSize": 12
  }
}
```

System fonts (macOS/Linux): Place `dnd-dice.ttf` in `~/.fonts/` or use FontBook to install. Claude terminal inherits system font settings.

If Claude Code supports custom font paths in future, update to: `"customFont": "/path/to/dnd/fonts/dnd-dice.ttf"`
