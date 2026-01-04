#!/usr/bin/env python3
"""
Pass 1: Scene Detection for D&D Session Transcripts

Processes JSONL transcripts with timestamps and detects scene boundaries.
Outputs structured JSON with scene metadata and resource requests.

Usage:
    dnd_pass1 --session 1 --transcript "recordings_transcripts/DnD 1.jsonl"
    dnd_pass1 1 recordings_transcripts/DnD\ 1.jsonl sessions/01/pass1.json

Arguments are flexible - script will figure out session number, transcript path, and output path.
"""

import argparse
import json
import os
import sys
import tomllib
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from openai import OpenAI

MCP_TOOL = {
    "name": "dnd_pass1",
    "description": (
        "Detect scene boundaries in a D&D session transcript. "
        "Analyzes JSONL transcript with timestamps and outputs JSON with scene metadata, "
        "time ranges, and resource requests for Pass 2 summarization."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "session": {
                "type": "integer",
                "description": "Session number (e.g., 1, 2, 3)",
            },
            "transcript": {
                "type": "string",
                "description": "Path to JSONL transcript file (e.g., recordings_transcripts/DnD 1.jsonl)",
            },
            "output": {
                "type": "string",
                "description": "Output JSON path (default: sessions/{NN}/pass1.json)",
            },
            "batch_size": {
                "type": "integer",
                "description": "Entries per batch (default: 1000)",
            },
            "overlap": {
                "type": "integer",
                "description": "Overlap between batches (default: 250)",
            },
            "model": {
                "type": "string",
                "description": "OpenAI model (default: gpt-4o)",
            },
        },
        "required": ["session"],
        "additionalProperties": False,
    },
    "argv": [],
}

# Load environment variables from .env file if it exists
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed, will use system env vars


def discover_latest_session(repo_root: Path) -> Optional[int]:
    """Find the highest numbered session folder."""
    sessions_dir = repo_root / "sessions"
    if not sessions_dir.exists():
        return None
    
    session_nums = []
    for item in sessions_dir.iterdir():
        if item.is_dir():
            try:
                # Try to parse folder name as number (01, 02, etc.)
                num = int(item.name)
                session_nums.append(num)
            except ValueError:
                continue
    
    return max(session_nums) if session_nums else None


def load_session_config(session_num: int, repo_root: Path) -> Dict[str, Any]:
    """Load configuration for a specific session."""
    config_path = repo_root / "sessions" / f"{session_num:02d}" / "config.toml"
    
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    
    with open(config_path, 'rb') as f:
        config = tomllib.load(f)
    
    return config


class SceneDetector:
    """Detects scene boundaries in D&D session transcripts."""
    
    def __init__(self, api_key: Optional[str] = None, batch_size: int = 1000, overlap: int = 250):
        """
        Initialize the scene detector.
        
        Args:
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
            batch_size: Number of transcript entries per batch
            overlap: Number of entries to overlap between batches
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        
        self.client = OpenAI(api_key=self.api_key)
        self.batch_size = batch_size
        self.overlap = overlap
        
    def load_transcript(self, filepath: Path) -> List[Dict[str, Any]]:
        """Load transcript from JSONL file."""
        transcript = []
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    transcript.append(json.loads(line))
        return transcript
    
    def build_resource_dict(self, folders: List[Path]) -> Dict[str, str]:
        """
        Build a dictionary of available resources from specified folders.
        
        Returns dict mapping file stems (without .md) to relative paths.
        """
        resources = {}
        for folder in folders:
            if not folder.exists():
                continue
            for md_file in folder.rglob("*.md"):
                stem = md_file.stem
                rel_path = str(md_file.relative_to(Path.cwd()))
                resources[stem] = rel_path
        return resources
    
    def load_context_file(self, filepath: Path) -> str:
        """Load a context file."""
        if not filepath.exists():
            return f"[File not found: {filepath}]"
        
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return f"## {filepath.name}\n\n{content}"
    
    def build_system_prompt(
        self, 
        context_files: Dict[str, Path],
        available_resources: Dict[str, str],
        speaker_context: Optional[str] = None
    ) -> str:
        """
        Build the system prompt with context and resource catalog.
        
        Args:
            context_files: Dictionary mapping context type to file path (upfront context)
            available_resources: Dict of available file stems -> paths
            speaker_context: Optional speaker identification notes
        
        Returns:
            Complete system prompt
        """
        # Load context files
        context_sections = []
        for ctx_name, ctx_path in context_files.items():
            content = self.load_context_file(ctx_path)
            context_sections.append(f"### {ctx_name}\n{content}")
        
        context_text = "\n\n".join(context_sections) if context_sections else "[No upfront context provided]"
        
        # Build resource catalog (just file stems for brevity)
        resource_list = "\n".join(f"- {stem}" for stem in sorted(available_resources.keys()))
        
        prompt = f"""You are detecting scene boundaries in a D&D session transcript.

# Your Task
Analyze transcript chunks and identify when scenes begin and end.

## What is a Scene?
A NEW SCENE starts when:
- **Location changes** (party moves to a new place)
- **Primary goal/objective changes** (party shifts focus)
- **Time jumps** (next day, hours later, etc.)
- **Major topic shift** (combat → investigation → social encounter)

## Scene Metadata
For each scene, track:
- **Location**: Where the scene takes place (brief)
- **Goal**: What the party is trying to accomplish
- **NPCs present**: List of NPCs encountered or mentioned
- **Time of day**: morning/afternoon/evening/night (if detectable)
- **Emotional tone**: tense/casual/mysterious/comedic/etc.
- **Conflict type**: combat/social/exploration/puzzle/none

## Resource Requests
For each scene, identify resources that would help summarize it:
- NPCs mentioned by name
- Locations visited
- Items discussed
- Factions referenced
- Quests mentioned

Format resource requests as:
```json
{{
  "keyword": "text from transcript",
  "requested_path": "best-guess-at-filename",
  "override": null
}}
```

**Available resources** (file stems only, add .md extension):
{resource_list}

**IMPORTANT**: 
- Always make your best guess at the resource path, even if uncertain
- If a folder is requested, just use folder path (e.g., "world/factions/ardenhaven/locations")
- It's okay if resources don't exist - the user will map them correctly later

# Upfront Context
You have been provided with the following context:

{context_text}

# Speaker Identification
{speaker_context or "No specific speaker guidance provided."}

# Output Format
For each batch, output JSON:
```json
{{
  "action": "continue" | "close_and_start_new" | "close_and_start_multiple",
  "current_scene": {{
    "location": "brief location",
    "goal": "what the party is trying to do",
    "npcs_present": ["NPC1", "NPC2"],
    "time_of_day": "morning|afternoon|evening|night|unknown",
    "emotional_tone": "tense|casual|etc",
    "conflict_type": "combat|social|exploration|etc",
    "notes": "one sentence about what's happening",
    "requested_resources": [
      {{"keyword": "...", "requested_path": "...", "override": null}}
    ]
  }},
  "new_scenes": [
    // Only if closing previous scene and starting new one(s)
    // Same structure as current_scene
  ]
}}
```

**CRITICAL RULES**:
- Only mark scene boundaries when they actually occur
- Most batches will be "continue"
- Base decisions ONLY on transcript evidence
- Do not invent content
- Focus on in-game events, ignore OOC content

## Filtering Out-of-Character Content

### ❌ IGNORE (Out-of-Character):
- "I rolled a 15 on perception"
- "Should we take a break?"
- "That's a cool magic item!"
- "I think the DM is hinting at something"
- "Can I use my reaction here?"
- "Sorry, I was muted"
- Rules discussions, table talk, mechanics clarifications
- Dice roll results and modifiers
- Player commentary about the game itself

### ✅ USE for scene detection (In-Character):
- Character introduces themselves to an NPC
- Party travels to a new location
- Time passes ("The next morning...", "Several hours later...")
- Goal shifts ("Let's search the library" → "Now we need to find a guide")
- Combat begins or ends
- Major topic shifts
"""
        return prompt
    
    def format_transcript_batch(self, batch: List[Dict[str, Any]]) -> str:
        """Format a batch of transcript entries for the prompt."""
        lines = []
        for entry in batch:
            speaker = entry.get("speaker", "UNKNOWN")
            text = entry.get("text", "")
            start = entry.get("start", 0)
            lines.append(f"[{start:.1f}s] {speaker}: {text}")
        return "\n".join(lines)
    
    def build_batch_prompt(
        self,
        batch: List[Dict[str, Any]],
        batch_num: int,
        total_batches: int,
        previous_scene_state: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the prompt for a single batch."""
        
        prev_state_text = "None - this is the first batch."
        if previous_scene_state:
            prev_state_text = json.dumps(previous_scene_state, indent=2)
        
        transcript_text = self.format_transcript_batch(batch)
        
        prompt = f"""# Batch {batch_num} of {total_batches}

## Previous Scene State
```json
{prev_state_text}
```

## Transcript Chunk (with overlap)
```
{transcript_text}
```

## Your Task
Analyze this transcript chunk and determine:
1. Does the current scene continue?
2. Does the current scene end and a new one begin?
3. Do multiple scenes occur in this chunk?

Output your decision as JSON following the format specified in the system prompt.
"""
        return prompt
    
    def detect_batch(
        self,
        system_prompt: str,
        batch_prompt: str,
        model: str = "gpt-4o"
    ) -> Dict[str, Any]:
        """Call the API to detect scenes in a batch."""
        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": batch_prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            print(f"Error calling API: {e}", file=sys.stderr)
            raise
    
    def process_transcript(
        self,
        transcript_path: Path,
        context_files: Dict[str, Path],
        output_path: Path,
        model: str = "gpt-4o"
    ) -> List[Dict[str, Any]]:
        """
        Main processing loop: detect scenes across the entire transcript.
        
        Returns list of detected scenes with metadata.
        """
        print(f"Loading transcript from {transcript_path}...")
        transcript = self.load_transcript(transcript_path)
        print(f"Loaded {len(transcript)} transcript entries")
        
        # Build resource dictionary
        print("Building resource catalog...")
        repo_root = Path.cwd()
        resource_folders = [
            repo_root / "world",
            repo_root / "characters",
            repo_root / "items",
            repo_root / "creatures",
            repo_root / "quests"
        ]
        available_resources = self.build_resource_dict(resource_folders)
        print(f"Found {len(available_resources)} available resources")
        
        # Build system prompt
        system_prompt = self.build_system_prompt(
            context_files, 
            available_resources,
            speaker_context=config.get("session", {}).get("speakers", {}).get("notes")
        )
        
        # Process in batches
        scenes = []
        current_scene_state = None
        scene_counter = 1
        
        total_batches = (len(transcript) + self.batch_size - 1) // self.batch_size
        
        for batch_num in range(total_batches):
            start_idx = batch_num * self.batch_size
            end_idx = min(start_idx + self.batch_size + self.overlap, len(transcript))
            batch = transcript[start_idx:end_idx]
            
            print(f"\nProcessing batch {batch_num + 1}/{total_batches} (entries {start_idx}-{end_idx})...")
            
            batch_prompt = self.build_batch_prompt(
                batch,
                batch_num + 1,
                total_batches,
                current_scene_state
            )
            
            result = self.detect_batch(system_prompt, batch_prompt, model)
            
            action = result.get("action", "continue")
            print(f"  Action: {action}")
            
            if action == "continue":
                # Update current scene state if provided
                if "current_scene" in result:
                    if current_scene_state:
                        # Merge/update existing state
                        current_scene_state.update(result["current_scene"])
                    else:
                        # First scene
                        current_scene_state = result["current_scene"]
                        current_scene_state["scene_id"] = f"S-{scene_counter:03d}"
                        current_scene_state["start_seconds"] = batch[0]["start"]
                        scene_counter += 1
            
            elif action in ["close_and_start_new", "close_and_start_multiple"]:
                # Close current scene
                if current_scene_state:
                    current_scene_state["end_seconds"] = batch[0]["start"]  # End at boundary
                    scenes.append(current_scene_state)
                    print(f"  Closed scene: {current_scene_state['scene_id']}")
                
                # Start new scene(s)
                new_scenes = result.get("new_scenes", [])
                if new_scenes:
                    for new_scene in new_scenes:
                        new_scene["scene_id"] = f"S-{scene_counter:03d}"
                        new_scene["start_seconds"] = batch[0]["start"]
                        scene_counter += 1
                        current_scene_state = new_scene
                        print(f"  Started scene: {new_scene['scene_id']}")
                else:
                    current_scene_state = None
        
        # Close final scene
        if current_scene_state:
            current_scene_state["end_seconds"] = transcript[-1]["end"]
            scenes.append(current_scene_state)
            print(f"  Closed final scene: {current_scene_state['scene_id']}")
        
        # Save results
        print(f"\nSaving {len(scenes)} scenes to {output_path}...")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        output_data = {
            "metadata": {
                "source_transcript": str(transcript_path),
                "generated": datetime.now().isoformat(),
                "total_scenes": len(scenes),
                "model": model
            },
            "scenes": scenes
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        print(f"✓ Scene detection complete!")
        return scenes


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Pass 1: Detect scene boundaries in D&D session transcripts",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s              # Use latest session
  %(prog)s --session 1  # Use specific session
  %(prog)s run          # Alias for running latest session
  
Configuration is read from sessions/{NN}/config.toml
        """
    )
    
    parser.add_argument(
        "command",
        nargs="?",
        default="run",
        help="Command to run (default: run)"
    )
    parser.add_argument(
        "--session", "-s",
        type=int,
        help="Session number (default: latest session)"
    )
    
    parsed_args = parser.parse_args()
    
    # Determine session number
    repo_root = Path.cwd()
    session_num = parsed_args.session
    
    if session_num is None:
        session_num = discover_latest_session(repo_root)
        if session_num is None:
            print("Error: No session folders found in sessions/", file=sys.stderr)
            return 1
        print(f"Using latest session: {session_num}")
    
    # Load configuration
    try:
        config = load_session_config(session_num, repo_root)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        print(f"\nCreate a config file at sessions/{session_num:02d}/config.toml", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error loading config: {e}", file=sys.stderr)
        return 1
    
    # Extract config values
    transcript_path = repo_root / "sessions" / f"{session_num:02d}" / "transcripts.jsonl"
    output_path = repo_root / config["pass1"]["output"]
    batch_size = config["pass1"].get("batch_size", 1000)
    overlap = config["pass1"].get("overlap", 250)
    model = config["pass1"].get("model", "gpt-4o")
    
    # Validate transcript file
    if not transcript_path.exists():
        print(f"Error: Transcript file not found: {transcript_path}", file=sys.stderr)
        return 1
    
    print(f"Session: {session_num}")
    print(f"Config: sessions/{session_num:02d}/config.toml")
    print(f"Transcript: {transcript_path}")
    print(f"Output: {output_path}")
    print()
    
    # Build context files dictionary from config
    context_files = {}
    
    # Load individual files
    for file_path_str in config.get("context", {}).get("files", []):
        file_path = repo_root / file_path_str
        if file_path.exists():
            context_files[file_path.stem] = file_path
        else:
            print(f"Warning: Context file not found: {file_path}", file=sys.stderr)
    
    # Load folders (all .md files)
    for folder_path_str in config.get("context", {}).get("folders", []):
        folder_path = repo_root / folder_path_str
        if folder_path.exists():
            for md_file in folder_path.glob("*.md"):
                if md_file.is_file():
                    # Determine context type from folder name
                    if "npc" in folder_path.name:
                        context_files[f"NPC: {md_file.stem}"] = md_file
                    elif "quest" in folder_path.name:
                        context_files[f"Quest: {md_file.stem}"] = md_file
                    else:
                        context_files[f"{folder_path.name}: {md_file.stem}"] = md_file
        else:
            print(f"Warning: Context folder not found: {folder_path}", file=sys.stderr)
    
    print(f"Loaded {len(context_files)} context files\n")
    
    # Create detector and process
    try:
        detector = SceneDetector(
            batch_size=batch_size,
            overlap=overlap
        )
        
        scenes = detector.process_transcript(
            transcript_path,
            context_files,
            output_path,
            model=model
        )
        
        print(f"\n✓ Successfully detected {len(scenes)} scenes")
        print(f"✓ Output saved to: {output_path}")
        
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
