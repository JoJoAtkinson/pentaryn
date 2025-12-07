# D&D 5.5e Campaign Management

A markdown-based system for organizing and tracking a Dungeons & Dragons 5th Edition (2024 rules / 5.5e) campaign. This repository provides a comprehensive structure for managing characters, locations, quests, items, creatures, and session notes.

## 🎲 Repository Structure

```
/
├── .github/
│   └── copilot-instructions.md    # Guide for AI assistants
├── characters/
│   ├── player-characters/          # PC character sheets
│   └── npcs/                       # Non-player characters
├── world/
│   ├── locations/                  # Cities, dungeons, regions
│   ├── factions/                   # Organizations and groups
│   ├── history/                    # Historical events
│   └── lore/                       # World mythology
├── sessions/
│   ├── notes/                      # Session recaps
│   ├── planning/                   # Upcoming sessions
│   └── archive/                    # Old campaigns
├── quests/
│   ├── active/                     # Current quests
│   ├── completed/                  # Finished quests
│   └── side-quests/                # Optional adventures
├── items/
│   ├── magic-items/                # Magical equipment
│   ├── artifacts/                  # Legendary items
│   └── mundane/                    # Regular gear
├── creatures/
│   ├── monsters/                   # Monster stat blocks
│   ├── bestiary/                   # Creature lore
│   └── custom/                     # Homebrew creatures
├── rules/
│   ├── house-rules/                # Custom rules
│   ├── references/                 # Quick references
│   └── mechanics/                  # Game mechanics
└── templates/                      # All templates
```

## 🚀 Getting Started

### For Dungeon Masters

1. **Start with templates** - All templates are in the `/templates` directory
2. **Create your campaign** - Begin with session planning and core NPCs
3. **Build your world** - Add locations and factions as needed
4. **Track sessions** - Use session notes to record what happens
5. **Stay organized** - Follow the naming conventions and folder structure

### For Players

Players can use this structure to:
- Maintain detailed character sheets
- Track personal quests and goals
- Record character backstory and development
- Keep notes on NPCs and locations

## 📝 Templates Available

- **[Character Template](templates/character-template.md)** - PC and NPC character sheets
- **[Location Template](templates/location-template.md)** - Places and areas
- **[Session Notes Template](templates/session-notes-template.md)** - Recording sessions
- **[Session Planning Template](templates/session-planning-template.md)** - Preparing sessions
- **[Quest Template](templates/quest-template.md)** - Adventures and missions
- **[Item Template](templates/item-template.md)** - Equipment and treasures
- **[Creature Template](templates/creature-template.md)** - Monsters and beasts
- **[Faction Template](templates/faction-template.md)** - Organizations

## 🤖 AI Assistant Integration

This repository is designed to work seamlessly with AI assistants like GitHub Copilot. The `.github/copilot-instructions.md` file provides comprehensive guidance on:

- Where to place different types of content
- How to structure new documents
- Naming conventions and organization
- Cross-referencing and linking
- Best practices for consistency

**For AI assistants:** Always reference `.github/copilot-instructions.md` when creating new content in this repository.

## 📖 How to Use

### Creating New Content

1. **Choose the right template** from `/templates`
2. **Copy the template** (don't edit the original)
3. **Fill in the sections** with your content
4. **Save to the correct directory** following the structure
5. **Link related documents** for easy navigation

### Naming Conventions

- Use **kebab-case** for filenames: `character-name.md`
- For sessions: `session-XX-YYYY-MM-DD.md` (e.g., `session-01-2024-03-15.md`)
- Use descriptive names that reflect content
- Keep names concise but clear

### Cross-Referencing

Link between documents using relative paths:
```markdown
[Character Name](../characters/npcs/character-name.md)
[Location](../world/locations/city-name.md)
[Quest](../quests/active/quest-title.md)
```

### Tags for Organization

Use consistent tags in your documents:
- `#pc` - Player character
- `#npc` - Non-player character
- `#location` - Place
- `#quest` - Quest/Adventure
- `#item` - Equipment
- `#creature` - Monster
- `#faction` - Organization
- `#session` - Game session
- `#homebrew` - Custom content

## 🎯 Best Practices

1. **Stay Consistent** - Use templates and follow conventions
2. **Update Regularly** - Keep information current after each session
3. **Link Everything** - Connect related documents
4. **Be Descriptive** - Include sensory details and atmosphere
5. **Track Progress** - Update quest status and character development
6. **Backup Often** - Use Git to track changes and history

## 🔍 Quick Reference

### For Common Tasks

- **Recording a session**: Use `session-notes-template.md` → save to `sessions/notes/`
- **Planning a session**: Use `session-planning-template.md` → save to `sessions/planning/`
- **Adding a character**: Use `character-template.md` → save to `characters/npcs/` or `characters/player-characters/`
- **Creating a location**: Use `location-template.md` → save to `world/locations/`
- **Adding a quest**: Use `quest-template.md` → save to `quests/active/`
- **Adding an item**: Use `item-template.md` → save to appropriate `items/` subdirectory

## 📚 Resources

### D&D 5.5e (2024 Rules)

This repository is designed for D&D 5th Edition with the 2024 rules update (often called 5.5e). Key resources:

- Player's Handbook (2024)
- Dungeon Master's Guide (2024)
- Monster Manual (2024)
- D&D Beyond
- Official D&D Resources

### Markdown Guide

- [Markdown Basic Syntax](https://www.markdownguide.org/basic-syntax/)
- [GitHub Flavored Markdown](https://github.github.com/gfm/)

## 🤝 Contributing

This is a campaign management system. Feel free to:

- Customize templates for your needs
- Add new templates for unique content
- Modify the structure to fit your campaign
- Share improvements and ideas

## 📄 License

This repository structure and templates are provided as-is for D&D campaign management. Content you create in your campaign is yours. The D&D game system and rules are owned by Wizards of the Coast.

---

**Ready to start your campaign?** Begin by reviewing the templates and `.github/copilot-instructions.md`, then start creating content!

Happy adventuring! 🗡️🛡️✨