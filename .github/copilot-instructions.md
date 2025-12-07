# D&D 5.5e Campaign Management - Copilot Instructions

This document provides guidance for AI assistants (like GitHub Copilot) on how to organize and structure content in this D&D campaign repository.

## Repository Structure

```
/
├── characters/
│   ├── player-characters/     # PC character sheets
│   ├── npcs/                  # Non-player characters
│   └── templates/             # Character templates
├── world/
│   ├── locations/             # Cities, dungeons, regions
│   ├── factions/              # Organizations and groups
│   ├── history/               # Historical events and timeline
│   └── lore/                  # World lore and mythology
├── sessions/
│   ├── notes/                 # Session recaps
│   ├── planning/              # Upcoming session plans
│   └── archive/               # Old campaign archives
├── quests/
│   ├── active/                # Current quests
│   ├── completed/             # Finished quests
│   └── side-quests/           # Optional adventures
├── items/
│   ├── magic-items/           # Magical equipment
│   ├── artifacts/             # Legendary artifacts
│   └── mundane/               # Regular equipment
├── creatures/
│   ├── monsters/              # Monster stat blocks
│   ├── bestiary/              # Creature descriptions
│   └── custom/                # Homebrew creatures
├── rules/
│   ├── house-rules/           # Custom rules
│   ├── references/            # Quick reference guides
│   └── mechanics/             # Game mechanics notes
└── templates/                 # All templates in one place
```

## File Naming Conventions

- Use kebab-case for file names: `character-name.md`, `quest-title.md`
- Use descriptive names that reflect content
- For characters: `firstname-lastname.md` or `character-title.md`
- For locations: `location-name.md`
- For sessions: `session-XX-YYYY-MM-DD.md` (e.g., `session-01-2024-03-15.md`)

## Template Usage

### When Creating a New Character
- Location: `/characters/player-characters/` for PCs, `/characters/npcs/` for NPCs
- Template: Use `/templates/character-template.md`
- Include: Stats, backstory, relationships, goals

### When Creating a Location
- Location: `/world/locations/`
- Template: Use `/templates/location-template.md`
- Include: Description, NPCs, points of interest, hooks

### When Recording a Session
- Location: `/sessions/notes/`
- Template: Use `/templates/session-notes-template.md`
- Include: Date, participants, summary, important events

### When Creating a Quest
- Location: `/quests/active/` for ongoing, `/quests/completed/` for finished
- Template: Use `/templates/quest-template.md`
- Include: Objectives, rewards, NPCs involved, locations

### When Adding an Item
- Location: `/items/magic-items/` or `/items/mundane/`
- Template: Use `/templates/item-template.md`
- Include: Description, properties, rarity, value

### When Adding a Creature
- Location: `/creatures/monsters/` or `/creatures/custom/`
- Template: Use `/templates/creature-template.md`
- Include: Stat block, description, tactics, lore

## Content Guidelines

### Markdown Standards
- Use `#` for main title, `##` for sections, `###` for subsections
- Use tables for stat blocks
- Use bullet points for lists
- Use `>` for quotes or read-aloud text
- Use code blocks for special formatting

### Cross-Referencing
- Link between documents using relative paths: `[Character Name](../characters/npcs/character-name.md)`
- Maintain a consistent linking structure
- Update related documents when making changes

### Metadata
- Include front matter with: created date, last modified, tags, status
- Use tags for easy searching: `#npc`, `#location`, `#quest`, `#item`, etc.

## D&D 5.5e Specific Notes

- Use 5.5e rules as default reference
- Note any differences from 5e/5.5e when applicable
- Include page references when citing rulebooks
- Follow standard D&D stat block formats

## Best Practices

1. **Be Consistent**: Follow templates and naming conventions
2. **Be Descriptive**: Include sensory details and atmosphere
3. **Be Connected**: Link related content together
4. **Be Organized**: Put files in the correct folders
5. **Be Updated**: Keep session notes and quest status current

## Quick Reference Commands

When asked to:
- **Create a character**: Use character template → Save to appropriate characters folder
- **Add a location**: Use location template → Save to world/locations
- **Record a session**: Use session template → Save to sessions/notes
- **Add a quest**: Use quest template → Save to quests/active
- **Add an item**: Use item template → Save to items folder
- **Add a creature**: Use creature template → Save to creatures folder

## Tags System

Use these tags for organization:
- `#pc` - Player character
- `#npc` - Non-player character
- `#location` - Place or area
- `#quest` - Adventure or quest
- `#item` - Equipment or treasure
- `#creature` - Monster or beast
- `#faction` - Organization
- `#session` - Game session
- `#combat` - Combat encounter
- `#social` - Social encounter
- `#homebrew` - Custom content
- `#important` - Critical information

---

*This guide helps maintain consistency and organization throughout the campaign. Follow these conventions when adding new content.*
