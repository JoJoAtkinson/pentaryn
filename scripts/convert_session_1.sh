#!/bin/bash
# Example script for converting DnD 1.jsonl to story format

# Set your OpenAI API key (or export it in your environment)
# export OPENAI_API_KEY='your-api-key-here'

# Check if API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: OPENAI_API_KEY not set"
    echo "Please run: export OPENAI_API_KEY='your-api-key'"
    exit 1
fi

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Converting DnD Session 1 transcript to story format..."
echo ""

python "$SCRIPT_DIR/transcript_to_story.py" \
    "$REPO_ROOT/recordings_transcripts/DnD 1.jsonl" \
    --context \
        "$REPO_ROOT/world/README.md" \
        "$REPO_ROOT/characters/player-characters/jeff-bazgar.md" \
        "$REPO_ROOT/characters/player-characters/nicole-sabriel.md" \
        "$REPO_ROOT/characters/player-characters/kristine-marwen.md" \
    --overview "Session 1: The party meets at the Wayward Compass tavern" \
    --chunk-size 100 \
    --overlap 10 \
    --model gpt-4o \
    --temperature 0.7 \
    --output "$REPO_ROOT/sessions/notes/session-01-story.md"

echo ""
echo "Done! Check sessions/notes/session-01-story.md"
