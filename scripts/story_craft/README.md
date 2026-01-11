# Story Craft Pipeline

Three-pass pipeline for converting D&D session transcripts into narrative prose, plus timeline generation for world history tracking.

```
transcripts.jsonl → [Pass 1] → pass1.json → [Pass 2] → pass2.json → [Pass 3] → story/the-compass-edge/*.md
                                                             ↓
                                                      [Timeline] → world/party/the-compass-edge/_history.tsv
```

## Overview

### Pass 1: Scene Detection
**Script:** `detect_scenes.py`  
**Input:** JSONL transcript with timestamps  
**Output:** JSON with scene boundaries and metadata  

Detects scene boundaries by analyzing:
- Location changes
- Goal/objective shifts
- Time jumps
- Narrative flow

**Key Features:**
- Batched processing with overlap (1000 entries, 250 overlap)
- Resource request system (identifies needed lore files)
- Speaker normalization (handles unreliable voice ID)
- OOC content filtering

### Pass 2: Scene Summarization
**Script:** `summarize_scenes.py`  
**Input:** Pass 1 scenes + transcript  
**Output:** JSON with detailed scene summaries  

Generates dual-format summaries:
- **Factual summary**: Clinical, objective event description
- **Narrative seed**: Atmospheric, story-ready prose starter

**Key Features:**
- Dynamic resource loading per scene
- Character moment tracking
- NPC interaction details
- Plot thread status
- Information gained tracking

### Pass 3: Story Generation
**Script:** `generate_story.py`  
**Input:** Pass 2 summaries  
**Output:** Numbered Markdown chapter files  

Converts summaries into flowing narrative prose with:
- Sensory expansion (smells, sounds, textures, visuals)
- Reconstructed dialogue with tone
- Internal thoughts (rotating POV)
- Scene transitions
- Intelligent file splitting

**File Splitting Logic:**
- New file on major location change
- New file on time jump > 1 hour
- New file on quest/plot resolution
- New file on significant tone shift
- Max 5 scenes per file (readability)

### Timeline Generation
**Script:** `generate_party_timeline.py`  
**Input:** Pass 2 summaries  
**Output:** TSV timeline file + updated world date  

Generates high-level daily event summaries for the party timeline:
- **10,000 foot view**: Max 3 events per day
- **Narrative grouping**: Related scenes combined into cohesive beats
- **Smart prioritization**: Combat, quests, discoveries prioritized over shopping/travel
- **Month-change events**: Automatic weather transition notices
- **World date tracking**: Updates `world/_history.config.toml` after session

**Key Features:**
- Configurable event priority scoring
- Intelligent scene grouping by narrative arc
- Month/weather transitions when crossing month boundaries
- Append mode (add to existing timeline) or clear mode (replace)
- Manual date override support

## Quick Start

### Run Full Pipeline

```bash
# Pass 1: Detect scenes
.venv/bin/python scripts/story_craft/detect_scenes.py --session 1

# Pass 2: Summarize scenes
.venv/bin/python scripts/story_craft/summarize_scenes.py --session 1

# Pass 3: Generate story
.venv/bin/python scripts/story_craft/generate_story.py --session 1

# Timeline: Generate party history
.venv/bin/python scripts/story_craft/generate_party_timeline.py --session 1
```

### Timeline Options

```bash
# Default: append to existing timeline
.venv/bin/python scripts/story_craft/generate_party_timeline.py --session 1

# Clear existing timeline first
.venv/bin/python scripts/story_craft/generate_party_timeline.py --session 1 --clear

# Preview without writing
.venv/bin/python scripts/story_craft/generate_party_timeline.py --session 1 --dry-run

# Override starting date (YYYY/MM/DD)
.venv/bin/python scripts/story_craft/generate_party_timeline.py --session 1 --start-date 4327/10/15
```

### Run via MCP Server

```bash
# List available tools
.venv/bin/python scripts/mcp/server.py --list-tools

# Tools: dnd_pass1, dnd_pass2, dnd_pass3
```

## Configuration

All configuration lives in `sessions/{NN}/config.toml`:

```toml
[session]
number = 1
recording_source = "in-person"

[session.speakers]
NICOLE = "Sabriel (player character)"
KRIS = "Marwen (player character)"
JEFF = "Bazgar (player character)"
UNKNOWN = "Could be DM or Jeff"

[context]
files = [
    "characters/player-characters/kristine-marwen.md",
    # ... other context files
]
folders = [
    "world/factions/ardenhaven/npc",
    # ... other context folders
]

[pass1]
output = "sessions/01/pass1.json"
batch_size = 1000
overlap = 250
model = "gpt-4o"

[pass2]
output = "sessions/01/pass2.json"
model = "gpt-4o"
context_before = 30.0
context_after = 30.0

[pass3]
output = "story/the-compass-edge"
model = "gpt-4o"
temperature = 0.7  # Higher for creative prose (0.0-2.0)

# Chapter numbering + filenames:
# - Files are written as: 0010-chapter-title.md (numeric prefix leaves insertion room).
chapter_number_width = 4
chapter_number_step = 10
chapter_number_start = 10

# File-splitting algorithm parameters
max_scenes_per_file = 5  # Readability limit
time_jump_threshold_seconds = 3600  # 1 hour = chapter break

# Narrative time phrases that trigger chapter breaks
time_jump_phrases = [
    "next day",
    "next morning",
    "the following day",
    "hours later",
    "long rest",
]

# Tone transitions that suggest chapter breaks
tone_break_transitions = [
    ["combat", "casual"],
    ["tense", "casual"],
    ["somber", "casual"],
]

# POV characters for rotating third-person limited perspective
pov_characters = ["Bazgar", "Sabriel", "Marwen"]

# Character voice (used in story generation prompts)
# Sourced from player character narrative sheets:
# - `characters/player-characters/*.narrative.md`
# - section: "## Voice & Manner of Speaking"

[timeline]
# Party name (maps to world/party/{party_name}/_history.tsv)
party_name = "the-compass-edge"

# Event ID prefix for timeline events
event_id_prefix = "party-compass"

# Maximum events per day (10,000 foot view)
max_events_per_day = 3

# Phrases that indicate a new day has started
new_day_indicators = [
    "next day",
    "next morning",
    "following day",
    "long rest",
]

# Priority scoring for event importance (higher = more important)
[timeline.priority_keywords]
combat = 10
boss = 10
death = 9
revelation = 8
discovery = 7
quest = 6
npc = 5
travel = 3
shopping = 2
```

**Pass 3 Configurable Parameters:**

All context-building parameters are configurable per session:

- **temperature**: API temperature (0.0-2.0, default 0.7). Higher = more creative.
- **max_scenes_per_file**: Maximum scenes before forcing new chapter (default 5)
- **time_jump_threshold_seconds**: Time gap that triggers chapter break (default 3600 = 1 hour)
- **time_jump_phrases**: List of narrative phrases that indicate time jumps
- **tone_break_transitions**: Tone shifts that suggest natural chapter boundaries
- **pov_characters**: Characters who get internal thoughts/POV rotation
- **Character voice**: Sourced from PC narrative sheets (`characters/player-characters/*.narrative.md`) to avoid drift

**Timeline Configurable Parameters:**

All timeline generation parameters are configurable per session:

- **party_name**: Name of party (maps to `world/party/{party_name}/_history.tsv`)
- **event_id_prefix**: Prefix for event IDs (e.g., `party-compass-001`)
- **max_events_per_day**: Maximum events per day in timeline (default 3 for 10,000 foot view)
- **new_day_indicators**: Phrases that signal day boundaries
- **priority_keywords**: Keyword scoring for event importance (combat=10, travel=3, etc.)

## File Structure

```
sessions/
  01/
    config.toml           # Configuration for session 1
    transcripts.jsonl     # Source transcript (timestamps)
    pass1.json           # Scene boundaries (Pass 1 output)
    pass2.json           # Scene summaries (Pass 2 output)

story/
  the-compass-edge/      # Player-facing story output repo (submodule)
    0010-the-wayward-compass.md
    0020-ruins-in-the-scrubland.md

world/
  party/
    the-compass-edge/
      _history.tsv       # Party timeline (TSV format)
  _history.config.toml   # World date tracker (updated after each session)
```

## Output Formats

### Pass 1 Output (pass1.json)

```json
{
  "metadata": { ... },
  "scenes": [
    {
      "scene_id": "S-001",
      "start_seconds": 120.0,
      "end_seconds": 1800.0,
      "location": "The Wayward Compass tavern",
      "goal": "Meet and form a party",
      "npcs_present": ["Thorgrim"],
      "emotional_tone": "casual",
      "conflict_type": "social",
      "requested_resources": [
        {
          "keyword": "The Wayward Compass",
          "requested_path": "world/factions/ardenhaven/locations/ardenford.md",
          "override": null
        }
      ]
    }
  ]
}
```

### Pass 2 Output (pass2.json)

```json
{
  "metadata": { ... },
  "summaries": [
    {
      "scene_id": "S-001",
      "factual_summary": "Three adventurers meet at tavern...",
      "narrative_seed": "Warm smoke and old stone filled the tavern...",
      "key_events": ["Event 1", "Event 2"],
      "character_moments": {
        "Bazgar": "Made confident first impression"
      },
      "npcs_encountered": [
        {
          "name": "Thorgrim",
          "role": "Barkeep",
          "interaction": "Served food and provided quest info"
        }
      ],
      "loot_and_items": [],
      "information_gained": ["Info 1", "Info 2"],
      "time_passed": "30 minutes",
      "scene_outcome": "Party formed",
      "plot_threads": [
        {
          "thread": "Party formation",
          "status": "introduced"
        }
      ]
    }
  ]
}
```

### Pass 3 Output (001-chapter.md)

```markdown
Warm smoke from the hearthfire—hickory and roasting lamb—rolled through 
the low-ceilinged common room of the Wayward Compass...

Bazgar shouldered through the door into noise: the scrape of wooden plates 
on scarred tables, a bard tuning strings near the fire...

"You the one who ordered the mutton?" Thorgrim's voice cut through the din.

Bazgar grinned. "That'd be me."

...
```

### Timeline Output (_history.tsv)

```tsv
event_id	tags	date	duration	title	summary
party-compass-001	party;the-compass-edge	4327/10/15	0	Battle Against the Undead	With Corwin buried and payment received, Renn withdrew to the gravesite to grieve, while the party turned their attention toward finding further work and funding a future expedition.
party-compass-002	party;the-compass-edge	4327/10/15	0	Combat with Goblins	The goblin-raid job is formally concluded with payment and thanks; the party transitions toward returning to Ardenford to rest at the Wayward Compass.
party-compass-003	party;the-compass-edge	4327/10/15	0	Confrontation with Imperium Traders	The scene ends with the party finishing their late-night bonding and settling on tomorrow's spider job, just as clearly identifiable Imperium traders begin entering the tavern.
party-compass-month-4327-11	party;the-compass-edge;world	4327/11/01	0	Month of Morvalos Begins	Deep Cold (midwinter): heavy snows, bitter cold, long nights
```

**Features:**
- Max 3 events per day (high-level view)
- Events on same day share the same date
- Month-change events automatically inserted with weather descriptions
- TSV format for easy timeline rendering (compatible with `build_timeline_svg.py`)

## Testing

Integration tests are available for each pass:

```bash
# Test Pass 1
pytest scripts/tests/test_story_craft_integration.py::test_pass1_scene_detection -v

# Test Pass 2
pytest scripts/tests/test_story_craft_integration.py::test_pass2_scene_summarization -v

# Test Pass 3
pytest scripts/tests/test_pass3_integration.py::test_pass3_story_generation -v

# Test full pipeline
pytest scripts/tests/test_story_craft_integration.py::test_full_pipeline -v

# Skip integration tests (don't use API tokens)
pytest scripts/tests/ -v -m "not integration"
```

**Note:** Integration tests use real API tokens and cost money (~$0.01-0.02 per test run).

## Costs

Approximate costs using `gpt-4o` (as of Jan 2026):

- **Pass 1** (30 scenes, 10k transcript lines): ~$0.50-1.00
- **Pass 2** (30 scenes with resources): ~$2.00-4.00
- **Pass 3** (30 scenes → 6-8 chapters): ~$3.00-5.00

**Total pipeline:** ~$5.50-10.00 per session

Using `gpt-4o-mini` reduces costs by ~10×.

## Tips & Tricks

### Reviewing Pass 1 Output

After Pass 1, review `pass1.json` and correct resource paths:

```json
{
  "keyword": "Thorgrim",
  "requested_path": "world/factions/ardenhaven/npc/thorgrim-ledger-scar.md",
  "override": "world/factions/ardenhaven/npc/thorgrim-ledger-scar.md"
}
```

The `override` field lets you fix incorrect guesses without re-running Pass 1.

### Speaker Identification

For in-person recordings where speaker ID is unreliable:

```toml
[session.speakers]
UNKNOWN = "Could be DM or Jeff; DM voices multiple NPCs"
notes = "In-person recording makes voice separation difficult"
```

This context helps the LLM understand ambiguity.

### Regenerating Passes

You can re-run later passes without re-running earlier ones:

```bash
# Regenerate Pass 3 with different style
.venv/bin/python scripts/story_craft/generate_story.py --session 1 --model gpt-4o
```

### Model Selection

- **gpt-4o**: Best quality, higher cost
- **gpt-4o-mini**: Good quality, 10× cheaper (recommended for testing)
- **gpt-4**: Previous generation, similar to gpt-4o but slower

## Architecture Notes

### Why Three Passes?

1. **Separation of concerns**: Scene detection, summarization, and storytelling are distinct skills
2. **Human review points**: Correct errors before they compound
3. **Flexibility**: Regenerate later passes without re-running earlier ones
4. **Cost control**: Use cheaper models for earlier passes, premium models for prose

### Why JSON → JSON → Markdown?

- **Pass 1 & 2**: Structured data for programmatic use (searching, querying, analysis)
- **Pass 3**: Human-readable prose for actual reading

### Resource Request System

Pass 1 requests resources by keyword, Pass 2 loads them:

1. Pass 1: "I see 'Thorgrim' mentioned → request NPC file"
2. Human: Reviews requests, fixes paths via `override`
3. Pass 2: Loads corrected resources and includes in prompts

This prevents hallucination while keeping the LLM flexible.

## Troubleshooting

### "OPENAI_API_KEY not set"

Add to `.env`:
```bash
OPENAI_API_KEY=sk-...
```

### Scene Boundaries Wrong

Adjust Pass 1 config:
```toml
[pass1]
batch_size = 500    # Smaller batches = more boundary opportunities
overlap = 250       # More overlap = better boundary detection
```

### Story Too Dry

Pass 3 temperature is 0.7 (creative). Try:
```python
# In generate_story.py, line ~332
temperature=0.8,  # More creative
```

### File Splits Wrong

Adjust `should_start_new_file()` logic in `generate_story.py`:
```python
if scenes_in_current_file >= 3:  # Smaller chapters
    return True, "file length limit"
```

## Future Enhancements

Potential improvements:

- [ ] Pass 2.5: Dialogue extraction (before full prose)
- [ ] Character voice consistency checking
- [ ] Automated chapter titles
- [ ] PDF export with custom styling
- [ ] Audio narration generation (TTS)
- [ ] Illustration prompts (image generation)

## Related Files

- `_shared.py`: Common utilities for all passes
- `test_story_craft_integration.py`: Integration tests
- `test_pass3_integration.py`: Pass 3 specific tests
- `README_INTEGRATION.md`: Test documentation
