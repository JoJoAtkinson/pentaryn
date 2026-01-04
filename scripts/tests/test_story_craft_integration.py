#!/usr/bin/env python3
"""
Integration tests for story_craft pipeline (Pass 1 + Pass 2).

These are INTEGRATION tests - they make real API calls to OpenAI.
They use tokens and will cost money. Only run when you want to test the full pipeline.

To run:
    pytest scripts/tests/test_story_craft_integration.py -v
    
To skip these expensive tests:
    pytest scripts/tests/ -v -m "not integration"
"""

# Load environment variables from .env file BEFORE anything else
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed, will use system env vars

import json
import os
import tempfile
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
    
    # Create minimal transcript (just enough to test scene detection)
    # This is a realistic excerpt from an actual session
    transcript_data = [
        {"speaker": "JOE", "text": "Welcome to session 1 of our campaign!", "start": 0.0, "end": 3.5},
        {"speaker": "JOE", "text": "You all meet at the Wayward Compass tavern in Ardenford.", "start": 4.0, "end": 8.2},
        {"speaker": "JEFF", "text": "Bazgar walks in and orders an ale.", "start": 9.0, "end": 11.5},
        {"speaker": "NICOLE", "text": "Sabriel is sitting in the corner, reading a book.", "start": 12.0, "end": 15.3},
        {"speaker": "KRIS", "text": "Marwen approaches the bar and sits next to Bazgar.", "start": 16.0, "end": 19.8},
        {"speaker": "JOE", "text": "The bartender, a weathered dwarf named Torin, slides you drinks.", "start": 20.5, "end": 25.1},
        {"speaker": "JEFF", "text": "I thank him and take a long drink.", "start": 25.8, "end": 28.2},
        {"speaker": "JOE", "text": "Suddenly, the tavern door bursts open!", "start": 29.0, "end": 31.5},
        {"speaker": "JOE", "text": "A panicked farmer runs in shouting about goblins attacking his farm.", "start": 32.0, "end": 36.8},
        {"speaker": "NICOLE", "text": "Sabriel closes her book and stands up.", "start": 37.5, "end": 40.2},
        {"speaker": "KRIS", "text": "We should help. Let's go!", "start": 40.8, "end": 42.9},
        {"speaker": "JEFF", "text": "Agreed. Bazgar grabs his weapon and heads for the door.", "start": 43.5, "end": 47.1},
        {"speaker": "JOE", "text": "You all rush outside and head toward the farmlands.", "start": 48.0, "end": 51.5},
        {"speaker": "JOE", "text": "About twenty minutes later, you arrive at the farm.", "start": 52.0, "end": 55.3},
        {"speaker": "JOE", "text": "You see smoke rising from the barn.", "start": 56.0, "end": 58.5},
        {"speaker": "KRIS", "text": "I want to investigate the barn carefully.", "start": 59.2, "end": 61.8},
        {"speaker": "NICOLE", "text": "I'll check the farmhouse for survivors.", "start": 62.5, "end": 65.1},
        {"speaker": "JEFF", "text": "I'll cover Nicole while she searches.", "start": 65.8, "end": 68.2},
        {"speaker": "JOE", "text": "Roll for investigation, Marwen.", "start": 69.0, "end": 71.2},
        {"speaker": "KRIS", "text": "I rolled a 15.", "start": 71.8, "end": 73.1},
        {"speaker": "JOE", "text": "You find tracks leading into the woods - definitely goblin prints.", "start": 73.8, "end": 78.5},
    ]
    
    transcript_path = sessions_dir / "transcripts.jsonl"
    with open(transcript_path, 'w', encoding='utf-8') as f:
        for entry in transcript_data:
            f.write(json.dumps(entry) + '\n')
    
    # Create minimal config
    config_content = """
[session]
number = 99
recording_source = "in-person"

[session.speakers]
JOE = "Dungeon Master"
NICOLE = "Sabriel (player)"
KRIS = "Marwen (player)"
JEFF = "Bazgar (player)"
UNKNOWN = "Uncertain speaker"

[context]
files = []
folders = []

[pass1]
output = "sessions/99/pass1.json"
batch_size = 100
overlap = 10
model = "gpt-4o-mini"

[pass2]
output = "sessions/99/pass2.json"
model = "gpt-4o-mini"
context_before = 5.0
context_after = 5.0
"""
    
    config_path = sessions_dir / "config.toml"
    config_path.write_text(config_content)
    
    # Create minimal world structure for resources
    world_dir = workspace / "world" / "factions" / "ardenhaven" / "locations"
    world_dir.mkdir(parents=True)
    
    ardenford_content = """# Ardenford

A bustling trade town in the Ardenhaven region.

## Notable Locations
- **Wayward Compass Tavern**: Popular gathering spot for adventurers
- **Market Square**: Daily trading hub

## NPCs
- **Torin Ironfist**: Dwarf bartender at the Wayward Compass
"""
    
    (world_dir / "ardenford.md").write_text(ardenford_content)
    
    return workspace


@pytest.fixture
def api_key():
    """Get OpenAI API key from environment."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        pytest.skip("OPENAI_API_KEY not set - skipping integration test")
    return key


def test_pass1_scene_detection(test_workspace, api_key):
    """
    Test Pass 1: Scene detection with real API calls.
    
    This is an INTEGRATION test - it uses real API tokens.
    """
    import sys
    from pathlib import Path
    
    # Add scripts to path
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    
    from scripts.story_craft.detect_scenes import SceneDetector
    
    # Set up paths
    config_path = test_workspace / "sessions" / "99" / "config.toml"
    transcript_path = test_workspace / "sessions" / "99" / "transcripts.jsonl"
    output_path = test_workspace / "sessions" / "99" / "pass1.json"
    
    # Verify files exist
    assert config_path.exists(), "Config file not created"
    assert transcript_path.exists(), "Transcript file not created"
    
    # Create detector
    detector = SceneDetector(api_key=api_key, batch_size=100, overlap=10)
    
    # Process transcript
    scenes = detector.process_transcript(
        transcript_path=transcript_path,
        context_files={},  # No upfront context for test
        output_path=output_path,
        model="gpt-4o-mini",  # Use cheaper model for testing
        speakers_cfg={
            "JOE": "Dungeon Master",
            "NICOLE": "Sabriel (player)",
            "KRIS": "Marwen (player)",
            "JEFF": "Bazgar (player)",
        },
        repo_root=test_workspace,
    )
    
    # Validate output
    assert output_path.exists(), "Pass 1 output not created"
    
    with open(output_path, 'r', encoding='utf-8') as f:
        output_data = json.load(f)
    
    # Check structure
    assert "metadata" in output_data
    assert "scenes" in output_data
    assert output_data["metadata"]["model"] == "gpt-4o-mini"
    
    # Should detect at least one scene
    assert len(scenes) >= 1, "No scenes detected"
    
    # Validate scene structure
    for scene in scenes:
        assert "scene_id" in scene
        assert "start_seconds" in scene
        assert "end_seconds" in scene
        assert "location" in scene
        assert "goal" in scene
        assert "npcs_present" in scene
        assert "requested_resources" in scene
        
        # Time boundaries should be sensible
        assert scene["start_seconds"] >= 0
        assert scene["end_seconds"] > scene["start_seconds"]
        assert scene["end_seconds"] <= 80  # Our test transcript is ~78 seconds
    
    print(f"\n✓ Pass 1 detected {len(scenes)} scene(s)")
    for scene in scenes:
        print(f"  - Scene {scene['scene_id']}: {scene['location']} ({scene['start_seconds']:.1f}s - {scene['end_seconds']:.1f}s)")


def test_pass2_scene_summarization(test_workspace, api_key):
    """
    Test Pass 2: Scene summarization with real API calls.
    
    This is an INTEGRATION test - it uses real API tokens.
    Requires Pass 1 to have run first.
    """
    import sys
    from pathlib import Path
    
    # Add scripts to path
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    
    from scripts.story_craft.detect_scenes import SceneDetector
    from scripts.story_craft.summarize_scenes import SceneSummarizer
    
    # Set up paths
    transcript_path = test_workspace / "sessions" / "99" / "transcripts.jsonl"
    pass1_output_path = test_workspace / "sessions" / "99" / "pass1.json"
    pass2_output_path = test_workspace / "sessions" / "99" / "pass2.json"
    
    # Run Pass 1 first if output doesn't exist
    if not pass1_output_path.exists():
        detector = SceneDetector(api_key=api_key, batch_size=100, overlap=10)
        detector.process_transcript(
            transcript_path=transcript_path,
            context_files={},
            output_path=pass1_output_path,
            model="gpt-4o-mini",
            speakers_cfg={
                "JOE": "Dungeon Master",
                "NICOLE": "Sabriel (player)",
                "KRIS": "Marwen (player)",
                "JEFF": "Bazgar (player)",
            },
            repo_root=test_workspace,
        )
    
    # Create summarizer
    summarizer = SceneSummarizer(api_key=api_key)
    
    # Process scenes
    summaries = summarizer.process_scenes(
        pass1_path=pass1_output_path,
        transcript_path=transcript_path,
        output_path=pass2_output_path,
        model="gpt-4o-mini",  # Use cheaper model for testing
        speakers_cfg={
            "JOE": "Dungeon Master",
            "NICOLE": "Sabriel (player)",
            "KRIS": "Marwen (player)",
            "JEFF": "Bazgar (player)",
        },
        context_before_seconds=5.0,
        context_after_seconds=5.0,
    )
    
    # Validate output
    assert pass2_output_path.exists(), "Pass 2 output not created"
    
    with open(pass2_output_path, 'r', encoding='utf-8') as f:
        output_data = json.load(f)
    
    # Check structure
    assert "metadata" in output_data
    assert "summaries" in output_data
    assert output_data["metadata"]["model"] == "gpt-4o-mini"
    
    # Should have at least one summary
    assert len(summaries) >= 1, "No summaries generated"
    
    # Validate summary structure
    for summary in summaries:
        assert "scene_id" in summary
        assert "factual_summary" in summary
        assert "narrative_seed" in summary
        assert "key_events" in summary
        assert "character_moments" in summary
        assert "npcs_encountered" in summary
        assert "loot_and_items" in summary
        assert "information_gained" in summary
        assert "plot_threads" in summary
        
        # Summaries should have content
        assert len(summary["factual_summary"]) > 0, "Empty factual summary"
        assert len(summary["narrative_seed"]) > 0, "Empty narrative seed"
    
    print(f"\n✓ Pass 2 generated {len(summaries)} summary(ies)")
    for summary in summaries:
        print(f"  - Scene {summary['scene_id']}:")
        print(f"    Factual: {summary['factual_summary'][:80]}...")
        print(f"    Narrative: {summary['narrative_seed'][:80]}...")


def test_full_pipeline(test_workspace, api_key):
    """
    Test the full pipeline: Pass 1 → Pass 2.
    
    This is an INTEGRATION test - it uses real API tokens.
    """
    import sys
    from pathlib import Path
    
    # Add scripts to path
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    
    from scripts.story_craft.detect_scenes import SceneDetector
    from scripts.story_craft.summarize_scenes import SceneSummarizer
    
    # Set up paths
    transcript_path = test_workspace / "sessions" / "99" / "transcripts.jsonl"
    pass1_output_path = test_workspace / "sessions" / "99" / "pass1.json"
    pass2_output_path = test_workspace / "sessions" / "99" / "pass2.json"
    
    speakers_cfg = {
        "JOE": "Dungeon Master",
        "NICOLE": "Sabriel (player)",
        "KRIS": "Marwen (player)",
        "JEFF": "Bazgar (player)",
    }
    
    # Pass 1: Detect scenes
    print("\n=== Running Pass 1: Scene Detection ===")
    detector = SceneDetector(api_key=api_key, batch_size=100, overlap=10)
    scenes = detector.process_transcript(
        transcript_path=transcript_path,
        context_files={},
        output_path=pass1_output_path,
        model="gpt-4o-mini",
        speakers_cfg=speakers_cfg,
        repo_root=test_workspace,
    )
    
    assert len(scenes) >= 1, "Pass 1 should detect at least one scene"
    print(f"✓ Detected {len(scenes)} scene(s)")
    
    # Pass 2: Summarize scenes
    print("\n=== Running Pass 2: Scene Summarization ===")
    summarizer = SceneSummarizer(api_key=api_key)
    summaries = summarizer.process_scenes(
        pass1_path=pass1_output_path,
        transcript_path=transcript_path,
        output_path=pass2_output_path,
        model="gpt-4o-mini",
        speakers_cfg=speakers_cfg,
        context_before_seconds=5.0,
        context_after_seconds=5.0,
    )
    
    assert len(summaries) == len(scenes), "Should have one summary per scene"
    print(f"✓ Generated {len(summaries)} summary(ies)")
    
    # Validate pipeline coherence
    for i, (scene, summary) in enumerate(zip(scenes, summaries)):
        assert scene["scene_id"] == summary["scene_id"], f"Scene ID mismatch at index {i}"
    
    print("\n✓ Full pipeline test successful!")
    print(f"  Input: {len(transcript_path.read_text().splitlines())} transcript lines")
    print(f"  Output: {len(scenes)} scenes, {len(summaries)} summaries")


if __name__ == "__main__":
    # Allow running directly for quick testing
    print("Run with: pytest scripts/tests/test_story_craft_integration.py -v")
