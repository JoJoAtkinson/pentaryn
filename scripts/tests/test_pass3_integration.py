#!/usr/bin/env python3
"""
Integration test for Pass 3 story generation.

Tests the full pipeline: Pass 2 summaries → narrative prose chapters.

To run:
    pytest scripts/tests/test_pass3_integration.py -v
"""

# Load environment variables from .env file BEFORE anything else
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import json
import os
from pathlib import Path

import pytest

# Mark all tests in this file as integration tests
pytestmark = pytest.mark.integration


@pytest.fixture
def test_workspace(tmp_path):
    """Create a temporary workspace with minimal test data."""
    workspace = tmp_path / "test_dnd"
    workspace.mkdir()
    
    # Create sessions directory
    sessions_dir = workspace / "sessions" / "99"
    sessions_dir.mkdir(parents=True)
    
    # Create minimal Pass 2 output (2 scenes)
    pass2_data = {
        "metadata": {
            "source_pass1": "sessions/99/pass1.json",
            "source_transcript": "sessions/99/transcripts.jsonl",
            "generated": "2026-01-04T00:00:00.000000",
            "total_scenes": 2,
            "model": "gpt-4o-mini"
        },
        "summaries": [
            {
                "scene_id": "S-001",
                "factual_summary": "Bazgar, Marwen, and Sabriel meet at the Wayward Compass tavern and decide to take a job hunting undead.",
                "narrative_seed": "Three strangers met over mixed-up food orders and found, instead of annoyance, the beginnings of a party.",
                "key_events": [
                    "Bazgar orders food and sits at the bar",
                    "Marwen and Sabriel are already seated",
                    "They read the writ board and choose the undead job"
                ],
                "character_moments": {
                    "Bazgar": "Makes a confident first impression with his swagger and grin",
                    "Marwen": "Observes the newcomer with curiosity",
                    "Sabriel": "Suggests they work together rather than compete"
                },
                "npcs_encountered": [
                    {
                        "name": "Thorgrim Ledger-Scar",
                        "role": "Barkeep at the Wayward Compass",
                        "interaction": "Serves food and provides information about local jobs"
                    }
                ],
                "loot_and_items": [],
                "information_gained": [
                    "Three jobs on the writ board: sheep raids, spiders, undead sighting",
                    "Undead have been seen near the eastern border watchtower"
                ],
                "time_passed": "30 minutes",
                "scene_outcome": "Party forms and decides to pursue the undead job together",
                "plot_threads": [
                    {
                        "thread": "Party formation",
                        "status": "introduced"
                    },
                    {
                        "thread": "Undead sighting investigation",
                        "status": "introduced"
                    }
                ],
                "location": "The Wayward Compass tavern",
                "start_seconds": 120.0,
                "end_seconds": 1800.0
            },
            {
                "scene_id": "S-002",
                "factual_summary": "The party travels east through forested hills toward the border watchtower to meet with Renn Caldor.",
                "narrative_seed": "Under clear morning skies, the newly formed party set out on their first adventure together, learning each other's paces on the trail.",
                "key_events": [
                    "Party leaves Ardenford heading east",
                    "Several hours of travel through wooded hills",
                    "Small talk and getting to know each other"
                ],
                "character_moments": {
                    "Marwen": "Her crow scouts ahead, showing off its intelligence",
                    "Bazgar": "Sets a steady pace, comfortable in the wilderness",
                    "Sabriel": "Observes her new companions, learning their quirks"
                },
                "npcs_encountered": [],
                "loot_and_items": [],
                "information_gained": [],
                "time_passed": "3 hours",
                "scene_outcome": "Party arrives at the watchtower area",
                "plot_threads": [
                    {
                        "thread": "Party bonding",
                        "status": "advanced"
                    }
                ],
                "location": "Eastern hills trail toward the watchtower",
                "start_seconds": 1800.0,
                "end_seconds": 5400.0
            }
        ]
    }
    
    pass2_path = sessions_dir / "pass2.json"
    with open(pass2_path, 'w', encoding='utf-8') as f:
        json.dump(pass2_data, f, indent=2)
    
    # Create config
    config_content = """
[session]
number = 99

[pass2]
output = "sessions/99/pass2.json"

[pass3]
output = "sessions/99/story"
model = "gpt-4o-mini"
"""
    
    config_path = sessions_dir / "config.toml"
    config_path.write_text(config_content)
    
    return workspace


@pytest.fixture
def api_key():
    """Get OpenAI API key from environment."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        pytest.skip("OPENAI_API_KEY not set - skipping integration test")
    return key


def test_pass3_story_generation(test_workspace, api_key):
    """
    Test Pass 3: Story generation with real API calls.
    
    This is an INTEGRATION test - it uses real API tokens.
    """
    import sys
    from pathlib import Path
    
    # Add scripts to path
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    
    from scripts.story_craft.generate_story import StoryGenerator
    
    # Set up paths
    pass2_path = test_workspace / "sessions" / "99" / "pass2.json"
    output_dir = test_workspace / "sessions" / "99" / "story"
    
    # Verify Pass 2 file exists
    assert pass2_path.exists(), "Pass 2 file not created"
    
    # Create generator
    generator = StoryGenerator(api_key=api_key)
    
    # Process summaries
    files = generator.process_summaries(
        pass2_path=pass2_path,
        output_dir=output_dir,
        model="gpt-4o-mini",  # Use cheaper model for testing
    )
    
    # Validate output
    assert len(files) >= 1, "No story files generated"
    
    for filepath in files:
        assert filepath.exists(), f"Story file not created: {filepath}"
        
        content = filepath.read_text()
        assert len(content) > 100, f"Story file too short: {filepath}"
        
        # Should contain narrative prose (not JSON)
        assert not content.strip().startswith('{'), f"Output appears to be JSON: {filepath}"
        
        # Should mention character names
        assert any(name in content for name in ["Bazgar", "Marwen", "Sabriel"]), \
            f"Character names not found in {filepath}"
    
    print(f"\n✓ Generated {len(files)} story file(s)")
    for f in files:
        word_count = len(f.read_text().split())
        print(f"  - {f.name}: {word_count} words")


if __name__ == "__main__":
    print("Run with: pytest scripts/tests/test_pass3_integration.py -v")
