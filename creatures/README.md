# Creatures

This directory contains monster stat blocks, creature descriptions, and bestiary information.

## Structure

- **monsters/** - Standard D&D monsters and enemies
- **bestiary/** - Detailed creature descriptions and ecology
- **custom/** - Homebrew creatures and variants

## Creature Management

### Creating a New Creature
1. Use `/templates/creature-template.md`
2. Save to appropriate subdirectory:
   - Standard monsters → `monsters/`
   - Detailed lore entries → `bestiary/`
   - Homebrew creatures → `custom/`
3. Include complete stat block following D&D 5.5e format

### Stat Block Format
Follow the standard D&D format:
- Size, type, alignment
- AC, HP, Speed
- Ability scores
- Saves, skills, resistances, immunities
- Senses and languages
- Traits, actions, reactions
- Legendary/lair actions if applicable

### CR and Balance
- Use CR appropriate for party level
- Test custom creatures in combat
- Adjust as needed based on performance

### Creature Organization Tips
- Include ecology and habitat information
- Note tactics and combat behavior
- Link to locations where they appear
- Include lore for knowledge checks
- List typical treasure

## Quick Reference

### CR to Party Level

| CR | Party Level | Difficulty |
|----|-------------|------------|
| 0-1/4 | 1-2 | Trivial |
| 1/2-2 | 1-4 | Easy |
| 3-5 | 5-10 | Medium |
| 6-10 | 11-16 | Hard |
| 11-15 | 17-20 | Deadly |
| 16+ | 20+ | Legendary |

## Quick Links

- [Creature Template](../templates/creature-template.md)
- [Monsters](monsters/)
- [Bestiary](bestiary/)
- [Custom Creatures](custom/)
