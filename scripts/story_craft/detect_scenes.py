#!/usr/bin/env python3
"""
Pass 1: Scene Detection for D&D Session Transcripts

Processes JSONL transcripts with timestamps and detects scene boundaries.
Outputs structured JSON with scene metadata and resource requests.

Usage:
    dnd_pass1 --session 1 --transcript "recordings_transcripts/DnD 1.jsonl"
    dnd_pass1 1 "recordings_transcripts/DnD 1.jsonl" sessions/01/pass1.json

Arguments are flexible - script will figure out session number, transcript path, and output path.
"""

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed, will use system env vars

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from openai import OpenAI

# Add repo root to sys.path for imports
_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.story_craft._shared import (
    REPO_ROOT,
    discover_latest_session,
    format_speaker_context,
    load_jsonl,
    load_session_config,
    normalize_speaker_label,
)

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
                "default": 1000,
            },
            "overlap": {
                "type": "integer",
                "description": "Overlap between batches (default: 250)",
                "default": 250,
            },
            "model": {
                "type": "string",
                "description": "OpenAI model (default: gpt-4o)",
                "default": "gpt-4o",
            },
        },
        "required": ["session"],
        "additionalProperties": False,
    },
    "argv": [],
    "value_flags": {
        "session": "--session",
        "transcript": "--transcript",
        "output": "--output",
        "batch_size": "--batch-size",
        "overlap": "--overlap",
        "model": "--model",
    },
}


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
        transcript = load_jsonl(filepath)
        for entry in transcript:
            entry["speaker"] = normalize_speaker_label(entry.get("speaker"))
        return transcript
    
    def build_resource_list(self, repo_root: Path, folders: List[Path]) -> List[str]:
        """
        Build a list of available resource files from specified folders.
        
        Returns list of repo-root-relative `.md` paths.
        """
        resources: list[str] = []
        for folder in folders:
            if not folder.exists():
                continue
            for md_file in folder.rglob("*.md"):
                try:
                    rel_path = md_file.relative_to(repo_root).as_posix()
                except ValueError:
                    rel_path = str(md_file)
                resources.append(rel_path)
        return sorted(set(resources))
    
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
        available_resources: List[str],
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
        
        # Build resource catalog
        resource_list = "\n".join(f"- {path}" for path in available_resources)
        
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
  "requested_path": "repo-root-relative-path-or-folder",
  "override": null
}}
```

**Available resources** (repo-root-relative paths):
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
    // Only if closing previous scene and starting new one(s).
    // Each new scene MUST include start_seconds copied from a transcript line timestamp.
    {{
      "start_seconds": 1234.5,
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
    }}
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

## Timestamp Rules
- When you start a new scene, set `start_seconds` to the EXACT `[1234.5s]` value from the first transcript line of that new scene.
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
        model: str = "gpt-4o",
        speakers_cfg: Optional[Dict[str, Any]] = None,
        repo_root: Path = REPO_ROOT,
    ) -> List[Dict[str, Any]]:
        """
        Main processing loop: detect scenes across the entire transcript.
        
        Returns list of detected scenes with metadata.
        """
        print(f"Loading transcript from {transcript_path}...")
        transcript = self.load_transcript(transcript_path)
        print(f"Loaded {len(transcript)} transcript entries")
        
        # Build resource list
        print("Building resource catalog...")
        resource_folders = [
            repo_root / "world",
            repo_root / "characters",
            repo_root / "items",
            repo_root / "creatures",
            repo_root / "quests"
        ]
        available_resources = self.build_resource_list(repo_root, resource_folders)
        print(f"Found {len(available_resources)} available resources")

        observed_speakers = sorted({e.get("speaker") for e in transcript if e.get("speaker")})
        
        # Build system prompt
        system_prompt = self.build_system_prompt(
            context_files, 
            available_resources,
            speaker_context=format_speaker_context(speakers_cfg, observed_speakers),
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
            batch_start_seconds = [float(e.get("start", 0.0)) for e in batch]
            
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
                # Apply any final updates to the scene we're about to close.
                if current_scene_state and "current_scene" in result:
                    current_scene_state.update(result["current_scene"])

                # Close current scene
                raw_new_scenes = result.get("new_scenes", []) or []
                if not isinstance(raw_new_scenes, list):
                    raw_new_scenes = []

                # Parse and validate scene transition points
                new_scenes: list[dict[str, Any]] = []
                for ns in raw_new_scenes:
                    if not isinstance(ns, dict):
                        continue
                    start_raw = ns.get("start_seconds", ns.get("start"))
                    try:
                        start_seconds = float(start_raw)
                    except (TypeError, ValueError):
                        continue
                    # Snap to nearest transcript line start when close (helps when model rounds).
                    if batch_start_seconds:
                        nearest = min(batch_start_seconds, key=lambda s: abs(s - start_seconds))
                        if abs(nearest - start_seconds) <= 5.0:
                            start_seconds = nearest
                    ns["start_seconds"] = start_seconds
                    new_scenes.append(ns)

                new_scenes.sort(key=lambda s: float(s["start_seconds"]))

                # Filter out transitions that go backwards (can happen with overlap).
                min_allowed = float(current_scene_state.get("start_seconds", -1e18)) + 0.01 if current_scene_state else -1e18
                filtered: list[dict[str, Any]] = []
                last_t = -1e18
                for ns in new_scenes:
                    t = float(ns["start_seconds"])
                    if t <= min_allowed:
                        continue
                    if t <= last_t + 0.01:
                        continue
                    last_t = t
                    filtered.append(ns)

                if not filtered:
                    # Can't act on this response; treat it as a continuation update.
                    if "current_scene" in result:
                        if current_scene_state:
                            current_scene_state.update(result["current_scene"])
                        else:
                            current_scene_state = result["current_scene"]
                            current_scene_state["scene_id"] = f"S-{scene_counter:03d}"
                            current_scene_state["start_seconds"] = batch[0]["start"]
                            scene_counter += 1
                    continue

                first_boundary = float(filtered[0]["start_seconds"])
                if current_scene_state:
                    current_scene_state["end_seconds"] = first_boundary
                    scenes.append(current_scene_state)
                    print(f"  Closed scene: {current_scene_state['scene_id']} @ {first_boundary:.1f}s")
                
                # Start new scene(s). Any scene fully contained in this batch is immediately closed
                # using the next scene's start_seconds.
                current_scene_state = None
                for idx_ns, new_scene in enumerate(filtered):
                    new_scene["scene_id"] = f"S-{scene_counter:03d}"
                    scene_counter += 1

                    start_seconds = float(new_scene["start_seconds"])
                    if idx_ns < len(filtered) - 1:
                        end_seconds = float(filtered[idx_ns + 1]["start_seconds"])
                        new_scene["end_seconds"] = end_seconds
                        scenes.append(new_scene)
                        print(f"  Closed scene: {new_scene['scene_id']} @ {end_seconds:.1f}s")
                    else:
                        current_scene_state = new_scene
                        print(f"  Started scene: {new_scene['scene_id']} @ {start_seconds:.1f}s")
        
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
    parser.add_argument(
        "--transcript",
        type=str,
        help="Override transcript path (default: sessions/{NN}/transcripts.jsonl)"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Override Pass 1 output path (default: from config)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        help="Override batch size (default: from config)"
    )
    parser.add_argument(
        "--overlap",
        type=int,
        help="Override overlap size (default: from config)"
    )
    parser.add_argument(
        "--model",
        type=str,
        help="Override model (default: from config)"
    )
    
    parsed_args = parser.parse_args()
    
    # Determine session number
    repo_root = REPO_ROOT
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
    transcript_path = (
        (repo_root / parsed_args.transcript)
        if parsed_args.transcript
        else (repo_root / "sessions" / f"{session_num:02d}" / "transcripts.jsonl")
    )
    output_path = (repo_root / parsed_args.output) if parsed_args.output else (repo_root / config["pass1"]["output"])
    batch_size = parsed_args.batch_size if parsed_args.batch_size is not None else config["pass1"].get("batch_size", 1000)
    overlap = parsed_args.overlap if parsed_args.overlap is not None else config["pass1"].get("overlap", 250)
    model = parsed_args.model if parsed_args.model else config["pass1"].get("model", "gpt-4o")
    
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

        speakers_cfg = config.get("session", {}).get("speakers", {})
        
        scenes = detector.process_transcript(
            transcript_path,
            context_files,
            output_path,
            model=model,
            speakers_cfg=speakers_cfg,
            repo_root=repo_root,
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
