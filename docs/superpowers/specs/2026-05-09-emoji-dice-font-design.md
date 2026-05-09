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

### 1. Font Library (`./fonts/dnd-dice.ttf`)

- **Location:** `/Users/joe/GitHub/dnd/fonts/` (checked into repo)
- **Contents:** Custom emoji font with glyphs for:
  - `d4` → emoji representation (e.g., ⚂ or custom glyph)
  - `d6` → emoji representation (e.g., ⚃)
  - `d8` → emoji representation (e.g., ⚄)
  - `d10` → emoji representation (e.g., ⚅)
  - `d12` → emoji representation (e.g., custom or ⚀)
  - `d20` → emoji representation (e.g., custom or ⚁)
  - `d100` → display as two d10 emoji (percentile-style)

- **Creation:** Download/source emoji for each die, bundle into TTF using fonttools or similar
- **Format:** TrueType font (widely supported, small file size)

### 2. MCP Output Format

Returns JSON with narrative ready for LLM + structured data for auditing:

```json
{
  "narrative": "⚴(15+2) ⚵(12+2) ⚶(18+2) = 51",
  "rolls": [15, 12, 18],
  "bonuses": [2, 2, 2],
  "rolls_with_bonuses": [17, 14, 20],
  "total_raw": 45,
  "total_with_bonuses": 51,
  "emoji": "⚴",
  "dice_notation": "3d20+2"
}
```

**Rationale for Haiku:** Structured JSON is compact and unambiguous. Haiku can grab the `narrative` field and paste directly into game text without parsing prose + JSON. Raw fields available for edge cases.

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
