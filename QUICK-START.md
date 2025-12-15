# Quick Start Guide

Welcome to your D&D 5.5e campaign management system! This guide will help you get started quickly.

## 🎯 First Steps

### 1. Understand the Structure

Your campaign is organized into these main areas:

- **characters/** - All player and non-player characters
- **world/** - Locations, factions, history, and lore
- **sessions/** - Session notes and planning
- **quests/** - Adventures and missions
- **items/** - Equipment and treasures
- **creatures/** - Monsters and beasts
- **rules/** - House rules and references
- **templates/** - Templates for everything

### 2. Read the Copilot Instructions

**Most Important File:** `.github/copilot-instructions.md`

This file tells AI assistants (like GitHub Copilot) how to help you organize content. If you're using Copilot or another AI tool, it will reference this file automatically.

### 3. Start Creating Content

Choose what you need first:

#### For a New Campaign

1. **Create your first session plan**
   - Copy `/templates/session-planning-template.md`
   - Save to `/sessions/planning/session-01-planning.md`
   - Fill in your planned story beats

2. **Create starting location**
   - Copy `/templates/location-template.md`
   - Save to `/world/factions/ardenhaven/locations/starting-town.md` (or your starting region)
   - Add NPCs and points of interest

3. **Create key NPCs**
   - Copy `/templates/character-template.md`
   - Save to `/characters/npcs/npc-name.md`
   - Fill in their personality and role

4. **Create an initial quest**
   - Copy `/templates/quest-template.md`
   - Save to `/quests/active/first-quest.md`
   - Plan objectives and rewards

#### For an Existing Campaign

1. **Record your next session**
   - Copy `/templates/session-notes-template.md`
   - Save to `/sessions/notes/session-XX-YYYY-MM-DD.md`
   - Record what happened

2. **Document existing characters**
   - Use `/templates/character-template.md`
   - Create files for party members and important NPCs

3. **Map your world**
   - Use `/templates/location-template.md`
   - Document places the party has visited

4. **Track active quests**
   - Use `/templates/quest-template.md`
   - Document ongoing adventures

## 📝 Using Templates

### Basic Workflow

1. **Find the right template** in `/templates/`
2. **Copy the template** (don't edit the original)
3. **Rename the file** using kebab-case: `my-character.md`
4. **Fill in the sections** with your content
5. **Save to the correct folder** (see structure above)
6. **Link related documents** using relative paths

### Example: Creating a Character

```bash
# Copy the template
cp templates/character-template.md characters/npcs/bob-the-merchant.md

# Edit the file and fill in Bob's details

# Link Bob to his shop
# In Bob's file: [Bob's Shop](../../world/factions/ardenhaven/locations/bobs-shop.md)
```

## 🔗 Linking Documents

Use relative paths to link between files:

```markdown
From characters/npcs/ to a region location:
[Location Name](../../world/factions/region-name/locations/location-name.md)

From quests/active/ to characters/npcs/:
[NPC Name](../../characters/npcs/npc-name.md)

From sessions/notes/ to quests/active/:
[Quest Name](../../quests/active/quest-name.md)
```

## 🏷️ Using Tags

Add tags at the top of each file for organization:

```markdown
**Tags:** `#npc` `#merchant` `#friendly` `#important`
```

Common tags:
- `#pc`, `#npc`, `#location`, `#quest`, `#item`, `#creature`, `#faction`
- `#active`, `#completed`, `#important`, `#homebrew`
- `#combat`, `#social`, `#mystery`

## 🤖 Working with AI Assistants

### GitHub Copilot

1. Copilot automatically reads `.github/copilot-instructions.md`
2. Ask it to create content: "Create a new NPC tavern keeper"
3. It will follow the structure and use templates

### Chat with AI

Ask questions like:
- "Create a level 3 fighter character using the template"
- "Generate a quest for investigating missing caravans"
- "Add a magical sword to the items folder"
- "Create session notes for today's game"

The AI will follow your repository's structure and conventions.

## 📊 Example Workflow: Running a Session

### Before the Session

1. **Plan the session**
   ```
   Copy: templates/session-planning-template.md
   To: sessions/planning/session-05-planning.md
   ```

2. **Prepare NPCs**
   - Review existing NPCs or create new ones
   - Have stat blocks ready

3. **Review active quests**
   - Check `/quests/active/` for what's happening

### During the Session

1. **Take notes** (keep them brief during play)
   - Important decisions
   - Combat outcomes
   - New NPCs met
   - Loot acquired

### After the Session

1. **Write session notes**
   ```
   Copy: templates/session-notes-template.md
   To: sessions/notes/session-05-2024-03-20.md
   ```

2. **Update quest progress**
   - Check off completed objectives
   - Move completed quests to `/quests/completed/`

3. **Update character sheets**
   - New items, XP, level ups

4. **Create new content as needed**
   - New NPCs met
   - New locations visited

## 🎲 Tips for Success

1. **Start small** - Don't try to document everything at once
2. **Be consistent** - Use templates and follow naming conventions
3. **Link often** - Connect related content
4. **Update regularly** - Keep information current after each session
5. **Use examples** - Check the example files for inspiration

## 📚 See Also

- [Full README](README.md) - Complete documentation
- [.github/copilot-instructions.md](.github/copilot-instructions.md) - AI assistant guide
- [Templates README](templates/README.md) - Template details

## 🆘 Need Help?

Check the example files:
- [Example NPC](characters/npcs/example-innkeeper.md)
- [Example Location](world/factions/ardenhaven/locations/example-rusty-dragon-inn.md)
- [Example Quest](quests/active/example-goblin-raid.md)

Each template has comments and examples to guide you!

---

**Ready to start?** Pick a template and create your first piece of content! 🎲
