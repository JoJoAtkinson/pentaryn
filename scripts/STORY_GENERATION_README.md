# Transcript to Story Generator

This script converts D&D session transcripts (JSONL format with speaker labels) into narrative story format using OpenAI's API.

## Features

- **Chunked Processing**: Handles long transcripts by processing in manageable chunks
- **Context Awareness**: Loads campaign lore, character sheets, and other context files
- **Continuity**: Each chunk receives the previous narrative output as context
- **Smart Conversion**: Converts dialogue to narrative prose with quoted speech and descriptive text
- **Flexible Configuration**: Customize chunk size, model, temperature, and more

## Installation

1. Install required dependencies:
```bash
pip install openai
# or with uv:
uv pip install openai
```

2. Set up your OpenAI API key:
```bash
export OPENAI_API_KEY='your-api-key-here'
```

Or pass it via `--api-key` flag.

## Usage

### Basic Usage

```bash
python scripts/transcript_to_story.py recordings_transcripts/DnD\ 1.jsonl \
    --overview "Session 1: The party meets at the Wayward Compass"
```

### With Context Files

Provide campaign lore and character information for better narrative generation:

```bash
python scripts/transcript_to_story.py recordings_transcripts/DnD\ 1.jsonl \
    --context \
        world/README.md \
        world/factions/*/README.md \
        characters/player-characters/*.md \
    --overview "Session 1: The party assembles at the Wayward Compass tavern" \
    --output sessions/notes/session-01-story.md
```

### Custom Configuration

```bash
python scripts/transcript_to_story.py recordings_transcripts/DnD\ 1.jsonl \
    --overview "Session 1" \
    --chunk-size 150 \
    --overlap 20 \
    --model gpt-4-turbo \
    --temperature 0.8 \
    --output sessions/notes/session-01-story.md
```

## Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `transcript` | Path to JSONL transcript file | Required |
| `--context` | Context files (lore, characters, etc.) | `[]` |
| `--overview` | Session overview/description | Required |
| `--output` | Output file path | stdout |
| `--api-key` | OpenAI API key | `$OPENAI_API_KEY` |
| `--model` | OpenAI model to use | `gpt-4o` |
| `--chunk-size` | Lines per chunk | `100` |
| `--overlap` | Lines to overlap between chunks | `10` |
| `--temperature` | Model temperature (0.0-1.0) | `0.7` |

## How It Works

1. **Load Transcript**: Reads the JSONL file with speaker-labeled dialogue
2. **Load Context**: Reads all provided context files (world lore, characters, etc.)
3. **Chunk Creation**: Splits transcript into overlapping chunks for processing
4. **System Prompt**: Creates comprehensive instructions for the LLM including:
   - Campaign context and lore
   - Session overview
   - Narrative style guidelines
   - Instructions for handling DM vs player voices
   - Continuity requirements
5. **Iterative Processing**: For each chunk:
   - Sends transcript chunk + previous narrative output to API
   - Receives narrative prose
   - Uses output as context for next chunk
6. **Output**: Combines all narrative sections into complete story

## Input Format (JSONL)

The script expects JSONL (JSON Lines) format with this structure:

```json
{"speaker": "DM", "text": "You enter the tavern...", "start": 0.0, "end": 2.5}
{"speaker": "Jeff", "text": "I look around for the innkeeper.", "start": 3.0, "end": 5.2}
{"speaker": "Nicole", "text": "Can I roll perception?", "start": 5.5, "end": 7.1}
```

Required fields:
- `speaker`: Who is speaking (DM, player name, or UNKNOWN)
- `text`: What they said

Optional fields:
- `start`: Timestamp start (ignored by this script)
- `end`: Timestamp end (ignored by this script)

## Output Format

The script generates a Markdown file with:

```markdown
---
title: Session 1: Meeting at the Wayward Compass
source_transcript: DnD 1.jsonl
generated_by: transcript_to_story.py
model: gpt-4o
---

# Session 1: Meeting at the Wayward Compass

The afternoon sun cast long shadows through the dusty windows of the 
Wayward Compass as Bazgar pushed through the heavy oak door. The half-orc's 
muscular frame filled the doorway for a moment before he stepped inside...

[narrative continues...]
```

## Context Files Recommendations

For best results, provide these context files:

1. **World Overview**: `world/README.md`
2. **Faction Information**: Files from `world/factions/`
3. **Character Sheets**: All files from `characters/player-characters/`
4. **Session Context**: Any relevant quest or location files

Example:
```bash
--context \
    world/README.md \
    world/factions/ardenfast/_overview.md \
    characters/player-characters/*.md \
    quests/active/*.md
```

## Performance & Cost

- **Processing Time**: ~10-30 seconds per chunk (depending on model and chunk size)
- **API Cost**: Varies by model:
  - `gpt-4o`: ~$0.005-0.015 per chunk
  - `gpt-4-turbo`: ~$0.01-0.03 per chunk
  - `gpt-3.5-turbo`: ~$0.001-0.003 per chunk
- **Chunk Size**: Larger chunks = fewer API calls but higher cost per call
  - 100 lines: Good balance
  - 50 lines: More continuity, higher cost
  - 200 lines: Faster, less expensive, slightly less continuity

## Tips for Best Results

1. **Provide Good Context**: More context = better narrative quality
2. **Descriptive Overview**: Write a clear session overview with key events
3. **Chunk Size**: Adjust based on your transcript density:
   - Heavy dialogue: 100-150 lines
   - Lots of dice rolls/mechanics: 50-75 lines
4. **Temperature**: 
   - 0.7: Balanced creativity and consistency (recommended)
   - 0.9: More creative and varied prose
   - 0.5: More conservative and predictable
5. **Review Output**: Generated stories may need light editing for:
   - Incorrectly attributed dialogue
   - Missing context that humans would infer
   - Style preferences

## Troubleshooting

### "Error: openai package not installed"
```bash
pip install openai
```

### "Error: OpenAI API key required"
```bash
export OPENAI_API_KEY='your-key'
# or
python script.py --api-key 'your-key' ...
```

### Output is too verbose/concise
- Adjust `--temperature` (lower = more concise, higher = more elaborate)
- Modify chunk size (smaller = more detailed, larger = more summary)

### Poor continuity between chunks
- Increase `--overlap` (try 15-20 lines)
- Reduce `--chunk-size` (try 50-75 lines)

### Context not being used
- Ensure context files exist and are readable
- Check that file paths are correct (use absolute paths if needed)
- Verify context files contain relevant information

## Example Workflow

Complete workflow for processing a session:

```bash
# 1. First, transcribe your audio (if not already done)
python scripts/transcribe_audio.py path/to/audio.mp3

# 2. Convert transcript to story
python scripts/transcript_to_story.py recordings_transcripts/DnD\ 1.jsonl \
    --context \
        world/README.md \
        world/factions/ardenfast/_overview.md \
        characters/player-characters/jeff-bazgar.md \
        characters/player-characters/nicole-sabriel.md \
        characters/player-characters/kristine-marwen.md \
    --overview "Session 1: The party meets at the Wayward Compass tavern and receives their first quest" \
    --chunk-size 100 \
    --model gpt-4o \
    --output sessions/notes/session-01-story.md

# 3. Review and edit the generated story
code sessions/notes/session-01-story.md

# 4. (Optional) Export to PDF
# Use VS Code task: "Markdown: Export to PDF"
```

## Advanced: Batch Processing

Process multiple session transcripts:

```bash
#!/bin/bash
for i in {1..5}; do
    echo "Processing Session $i..."
    python scripts/transcript_to_story.py \
        "recordings_transcripts/DnD $i.jsonl" \
        --context world/README.md characters/player-characters/*.md \
        --overview "Session $i" \
        --output "sessions/notes/session-$(printf '%02d' $i)-story.md"
done
```

## Models Comparison

| Model | Speed | Quality | Cost | Recommended For |
|-------|-------|---------|------|-----------------|
| `gpt-4o` | Fast | Excellent | Medium | **Best balance** |
| `gpt-4-turbo` | Medium | Excellent | High | Premium quality |
| `gpt-3.5-turbo` | Very Fast | Good | Low | Quick drafts |

## Future Enhancements

Potential improvements (contributions welcome):

- [ ] Support for speaker identification improvement
- [ ] Custom narrative style templates
- [ ] Interactive mode for reviewing/editing chunks
- [ ] Integration with session planning templates
- [ ] Character voice consistency tracking
- [ ] Automatic scene break detection
- [ ] Support for multiple output formats (HTML, EPUB)
