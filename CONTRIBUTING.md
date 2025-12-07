# Contributing to This Campaign

Thank you for being part of this D&D campaign! This guide will help players and co-DMs contribute to the campaign repository.

## 🎭 For Players

### Maintaining Your Character

1. **Character Sheet Location**: `/characters/player-characters/your-character-name.md`
2. **Keep It Updated**: Update your character sheet after each session
3. **Track Development**: Add notes about character growth and story moments

### Taking Session Notes

Players are encouraged to help with session notes:

1. Copy `/templates/session-notes-template.md`
2. Save to `/sessions/notes/session-XX-YYYY-MM-DD.md`
3. Fill in what you remember
4. DM will review and add any missing details

### Adding Character Background

Feel free to expand on your character's backstory:

- Add NPCs from your backstory to `/characters/npcs/`
- Create locations from your past in `/world/locations/`
- Link them to your character sheet

## 🎲 For Co-DMs

### Adding Content

When adding new content, always:

1. **Use the appropriate template** from `/templates/`
2. **Follow naming conventions** (kebab-case)
3. **Save to correct directory**
4. **Link related content**
5. **Add tags for organization**

### Session Planning Collaboration

1. Review `/sessions/planning/` for upcoming sessions
2. Add notes or suggestions
3. Coordinate who's preparing what

### World Building

Feel free to add:
- New locations
- NPCs
- Factions
- Historical events
- Lore and mythology

Just make sure it fits the established campaign world!

## 📝 Making Changes

### Basic Git Workflow

```bash
# Make your changes to files

# Check what changed
git status

# Add your changes
git add .

# Commit with a descriptive message
git commit -m "Add new NPC: Bob the Blacksmith"

# Push to the repository
git push
```

### Commit Message Guidelines

Good commit messages:
- "Add session 5 notes"
- "Update Thorin's character sheet with new magic item"
- "Create new quest: The Missing Heirloom"
- "Add Waterdeep location"

## 🤝 Collaboration Guidelines

### Communication

- **Discuss major changes** with the DM before adding them
- **Respect established lore** when adding content
- **Ask questions** if you're unsure where something goes

### Content Guidelines

1. **Stay Consistent**: Follow existing examples
2. **Be Complete**: Fill in all relevant template sections
3. **Link Related Content**: Connect documents together
4. **Use Tags**: Make content searchable
5. **Check Your Work**: Proofread before committing

### What to Add vs. What Not to Add

✅ **DO Add:**
- Your character's development and notes
- Session summaries and highlights
- NPCs you create or interact with significantly
- Personal quests and goals
- Items your character owns
- Notes that help everyone remember what happened

❌ **DON'T Add:**
- Spoilers for other players (keep DM secrets in DM-only files)
- Out-of-character meta-gaming notes
- Copyrighted content without permission
- Content that contradicts established campaign lore (without discussing first)

## 🏷️ Tagging System

Use consistent tags in your documents:

### Content Type Tags
- `#pc` - Player character
- `#npc` - Non-player character
- `#location` - Place or area
- `#quest` - Adventure or quest
- `#item` - Equipment or treasure
- `#creature` - Monster or beast
- `#faction` - Organization

### Status Tags
- `#active` - Currently relevant
- `#completed` - Finished
- `#planned` - Future content
- `#archive` - Old/historical

### Category Tags
- `#combat` - Combat-related
- `#social` - Social interaction
- `#mystery` - Mystery/investigation
- `#homebrew` - Custom content
- `#important` - Critical information

## 🔍 Finding Information

### Search Tips

Use your editor's search or GitHub search:
- Search for tags: `#npc`
- Search for names: `Gareth`
- Search for locations: `Rusty Dragon`
- Search for quest status: `#active`

### Navigating the Repository

Start from:
- **README.md** - Overview
- **QUICK-START.md** - Getting started
- **.github/copilot-instructions.md** - Structure guide
- Directory README files - Section-specific info

## 🆘 Need Help?

### Questions?

- Ask the DM
- Check the example files
- Review template comments
- Look at `.github/copilot-instructions.md`

### Common Tasks

**Q: How do I add a new NPC?**  
A: Copy `templates/character-template.md` to `characters/npcs/npc-name.md` and fill it in.

**Q: Where do I put session notes?**  
A: Use `templates/session-notes-template.md` and save to `sessions/notes/session-XX-YYYY-MM-DD.md`

**Q: How do I link between files?**  
A: Use relative paths: `[NPC Name](../../characters/npcs/npc-name.md)`

**Q: Can I change the templates?**  
A: Discuss with the group first, but yes! They're meant to be customized.

**Q: What if I make a mistake?**  
A: No worries! Git tracks all changes. We can always revert if needed.

## 🎯 Best Practices

1. **Commit Often**: Small, frequent commits are better than large ones
2. **Write Clear Messages**: Future you will thank you
3. **Update After Sessions**: Don't let it pile up
4. **Link Everything**: Make content discoverable
5. **Have Fun**: This is a game, not a job!

## 📚 Resources

- [Markdown Guide](https://www.markdownguide.org/)
- [Git Basics](https://git-scm.com/book/en/v2/Getting-Started-Git-Basics)
- [D&D Beyond](https://www.dndbeyond.com/) - Official rules reference
- Campaign-specific resources (add your own links here)

---

**Remember**: This repository is a tool to enhance our game, not a burden. Contribute what's helpful and fun for you! 🎲✨
