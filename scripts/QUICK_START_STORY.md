# Quick Start: Convert Transcript to Story

## Prerequisites

1. Install OpenAI Python package:
```bash
pip install openai
# or
uv pip install openai
```

2. Get your OpenAI API key from: https://platform.openai.com/api-keys

3. Set environment variable:
```bash
export OPENAI_API_KEY='sk-proj-...'
```

## Quick Test (First 100 lines)

```bash
# Test with small chunk to verify it works
python scripts/transcript_to_story.py \
    "recordings_transcripts/DnD 1.jsonl" \
    --overview "Session 1 Test" \
    --chunk-size 100 \
    --output test_output.md
```

## Full Session Conversion

### Option 1: Use the example script
```bash
# Edit the script to set your API key, then run:
./scripts/convert_session_1.sh
```

### Option 2: Run directly with custom options
```bash
python scripts/transcript_to_story.py \
    "recordings_transcripts/DnD 1.jsonl" \
    --context \
        world/README.md \
        characters/player-characters/*.md \
    --overview "Session 1: The party meets at the Wayward Compass" \
    --chunk-size 100 \
    --model gpt-4o \
    --output sessions/notes/session-01-story.md
```

## Monitoring Progress

The script will show progress like this:
```
Loading transcript: recordings_transcripts/DnD 1.jsonl
  Loaded 9962 transcript entries
Loading context files: 4 files
  Loaded 15234 characters of context
Creating chunks (size: 100, overlap: 10)
  Created 110 chunks

Processing chunks:
Processing chunk 1/110... ✓
Processing chunk 2/110... ✓
Processing chunk 3/110... ✓
...
```

## Expected Processing Time

For your "DnD 1.jsonl" file (9962 lines):
- Chunk size 100 = ~110 chunks
- Time per chunk: ~10-15 seconds
- **Total time: ~20-30 minutes**

## Estimated Cost

Using gpt-4o:
- ~110 chunks × ~$0.01 per chunk
- **Estimated cost: $1-2 for full session**

Using gpt-3.5-turbo (faster, cheaper):
- **Estimated cost: $0.20-0.40 for full session**

## Tips

1. **Start Small**: Test with `--chunk-size 50` on just a few chunks first
2. **Use Context**: More context files = better narrative quality
3. **Review Output**: The AI does well but may need light editing
4. **Save Money**: Use `gpt-3.5-turbo` for drafts, `gpt-4o` for final version

## Common Issues

**"API key not set"**
```bash
export OPENAI_API_KEY='your-key-here'
```

**"openai not installed"**
```bash
pip install openai
```

**"Rate limit exceeded"**
- Add `time.sleep(1)` between chunks (would need to modify script)
- Or use a lower tier model

**Output too verbose**
- Lower temperature: `--temperature 0.5`
- Increase chunk size: `--chunk-size 150`

**Output too brief**
- Raise temperature: `--temperature 0.9`
- Decrease chunk size: `--chunk-size 50`
