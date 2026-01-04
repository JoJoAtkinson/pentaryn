#!/usr/bin/env python3
"""
Pass 2: Scene Summarization for D&D Sessions

Takes scene boundaries from Pass 1 and generates detailed summaries with both
factual and narrative content. Dynamically loads resources per scene.

Usage:
    dnd_pass2 --session 1
    dnd_pass2 1 sessions/01/pass2.json
    dnd_pass2 1 sessions/01/pass1.json sessions/01/pass2.json

Arguments are flexible - script will figure out session number and paths.
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
    "name": "dnd_pass2",
    "description": (
        "Summarize detected scenes from a D&D session transcript. "
        "Reads Pass 1 scene boundaries, queries transcript by time ranges, "
        "dynamically loads resources, and generates detailed scene summaries with both "
        "factual and narrative content."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "session": {
                "type": "integer",
                "description": "Session number (e.g., 1, 2, 3)",
            },
            "pass1": {
                "type": "string",
                "description": "Path to Pass 1 scene detection JSON (default: sessions/{NN}/pass1.json)",
            },
            "output": {
                "type": "string",
                "description": "Output JSON path (default: sessions/{NN}/pass2.json)",
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


class SceneSummarizer:
    """Summarizes detected scenes with full narrative detail."""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the scene summarizer.
        
        Args:
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        
        self.client = OpenAI(api_key=self.api_key)
    
    def load_transcript(self, filepath: Path) -> List[Dict[str, Any]]:
        """Load transcript from JSONL file."""
        transcript = []
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    transcript.append(json.loads(line))
        return transcript
    
    def load_pass1_results(self, filepath: Path) -> Dict[str, Any]:
        """Load Pass 1 scene detection results."""
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def extract_scene_transcript(
        self, 
        transcript: List[Dict[str, Any]], 
        start_seconds: float, 
        end_seconds: float,
        context_before_seconds: float = 30.0,
        context_after_seconds: float = 30.0
    ) -> List[Dict[str, Any]]:
        """
        Extract transcript entries for a specific time range with context.
        
        Args:
            transcript: Full transcript
            start_seconds: Scene start time
            end_seconds: Scene end time
            context_before_seconds: How many seconds before to include
            context_after_seconds: How many seconds after to include
        
        Returns:
            List of transcript entries for this scene
        """
        context_start = start_seconds - context_before_seconds
        context_end = end_seconds + context_after_seconds
        
        scene_entries = []
        for entry in transcript:
            entry_start = entry.get("start", 0)
            if context_start <= entry_start <= context_end:
                scene_entries.append(entry)
        
        return scene_entries
    
    def load_resource_file(self, filepath: Path) -> str:
        """Load a resource file (NPC, location, etc.)."""
        if not filepath.exists():
            return f"[Resource not found: {filepath}]"
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            return content
        except Exception as e:
            return f"[Error loading {filepath}: {e}]"
    
    def load_scene_resources(
        self, 
        scene: Dict[str, Any],
        repo_root: Path
    ) -> Dict[str, str]:
        """
        Load all resources requested for a scene.
        
        Returns dict mapping resource description -> file content
        """
        resources = {}
        
        requested = scene.get("requested_resources", [])
        for resource_req in requested:
            keyword = resource_req.get("keyword", "")
            requested_path = resource_req.get("requested_path", "")
            override_path = resource_req.get("override")
            
            # Use override if provided, otherwise use requested path
            path_to_use = override_path if override_path else requested_path
            
            if not path_to_use:
                continue
            
            # Check if it's a folder request
            full_path = repo_root / path_to_use
            
            if full_path.is_dir():
                # Load all .md files in folder
                folder_contents = []
                for md_file in full_path.glob("*.md"):
                    content = self.load_resource_file(md_file)
                    folder_contents.append(f"### {md_file.name}\n\n{content}")
                
                if folder_contents:
                    resources[f"Folder: {path_to_use}"] = "\n\n---\n\n".join(folder_contents)
            else:
                # Single file
                if not full_path.suffix:
                    full_path = full_path.with_suffix('.md')
                
                content = self.load_resource_file(full_path)
                resources[f"{keyword} ({path_to_use})"] = content
        
        return resources
    
    def format_transcript_entries(self, entries: List[Dict[str, Any]]) -> str:
        """Format transcript entries for inclusion in prompt."""
        lines = []
        for entry in entries:
            speaker = entry.get("speaker", "UNKNOWN")
            text = entry.get("text", "")
            start = entry.get("start", 0)
            
            # Format timestamp as MM:SS
            minutes = int(start // 60)
            seconds = int(start % 60)
            timestamp = f"{minutes:02d}:{seconds:02d}"
            
            lines.append(f"[{timestamp}] {speaker}: {text}")
        
        return "\n".join(lines)
    
    def build_scene_prompt(
        self,
        scene: Dict[str, Any],
        scene_transcript: List[Dict[str, Any]],
        scene_resources: Dict[str, str],
        previous_summary: Optional[Dict[str, Any]] = None,
        next_scene: Optional[Dict[str, Any]] = None,
        speaker_context: Optional[str] = None
    ) -> str:
        """Build the summarization prompt for a single scene.
        
        Args:
            speaker_context: Optional speaker identification guidance
        """
        
        # Format scene metadata
        scene_id = scene.get("scene_id", "Unknown")
        location = scene.get("location", "Unknown")
        goal = scene.get("goal", "Unknown")
        npcs = ", ".join(scene.get("npcs_present", []))
        time_of_day = scene.get("time_of_day", "unknown")
        emotional_tone = scene.get("emotional_tone", "unknown")
        conflict_type = scene.get("conflict_type", "unknown")
        
        # Format previous summary
        prev_text = "This is the first scene of the session."
        if previous_summary:
            prev_id = previous_summary.get("scene_id", "Unknown")
            prev_factual = previous_summary.get("factual_summary", "")
            prev_text = f"**Previous Scene ({prev_id}):**\n{prev_factual}"
        
        # Format next scene preview
        next_text = "This is the final scene of the session."
        if next_scene:
            next_id = next_scene.get("scene_id", "Unknown")
            next_location = next_scene.get("location", "Unknown")
            next_goal = next_scene.get("goal", "Unknown")
            next_text = f"**Next Scene ({next_id}):**\nLocation: {next_location}\nGoal: {next_goal}"
        
        # Format resources
        resource_text = "\n\n---\n\n".join(
            f"### {name}\n\n{content}" 
            for name, content in scene_resources.items()
        ) if scene_resources else "[No additional resources loaded for this scene]"
        
        # Format transcript
        transcript_text = self.format_transcript_entries(scene_transcript)
        
        prompt = f"""You are summarizing a single scene from a D&D session.

# Scene Context

**Scene ID:** {scene_id}
**Location:** {location}
**Goal:** {goal}
**NPCs Present:** {npcs or "None detected"}
**Time of Day:** {time_of_day}
**Emotional Tone:** {emotional_tone}
**Conflict Type:** {conflict_type}

{prev_text}

{next_text}

# Resources for This Scene

{resource_text}

# Scene Transcript

```
{transcript_text}
```

# Speaker Identification Notes

{speaker_context or "No specific speaker guidance provided."}

# Your Task

Provide a comprehensive summary of THIS scene only. Do NOT summarize previous or future scenes.

## Output Format (JSON)

```json
{{
  "scene_id": "{scene_id}",
  "factual_summary": "2-4 sentence factual summary of what happened",
  "narrative_seed": "2-3 sentence narrative-style summary with atmosphere and tone",
  "key_events": [
    "Specific event 1",
    "Specific event 2"
  ],
  "character_moments": {{
    "Character Name": "Important character moment or decision"
  }},
  "npcs_encountered": [
    {{
      "name": "NPC name",
      "role": "Brief role/description",
      "interaction": "How party interacted with them"
    }}
  ],
  "loot_and_items": [
    {{
      "item": "Item name",
      "description": "What it is",
      "acquisition": "How it was obtained"
    }}
  ],
  "information_gained": [
    "Important piece of information 1",
    "Important piece of information 2"
  ],
  "time_passed": "Estimate of in-game time for this scene",
  "scene_outcome": "How this scene ended or transitioned",
  "plot_threads": [
    {{
      "thread": "Plot thread name/description",
      "status": "introduced|advanced|resolved|complicated"
    }}
  ]
}}
```

## Important Guidelines

1. **Focus on in-game content only**
   - Ignore out-of-character (OOC) chat
   - Ignore dice rolls and mechanical discussions
   - Ignore rules clarifications
   - Focus on narrative events and character actions
   
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

2. **Be specific and detailed**
   - Include exact names, places, and items mentioned
   - Capture important dialogue or character reactions
   - Note decisions made and their reasoning

3. **Maintain both factual and narrative perspectives**
   - Factual summary: clinical, clear, objective
   - Narrative seed: atmospheric, evocative, story-ready

4. **Cross-reference with resources**
   - Use provided context to enrich details
   - Correct any misidentifications
   - Add relevant lore connections

5. **Preserve uncertainty**
   - If the party doesn't know something, reflect that
   - Mark mysteries and unanswered questions
   - Note suspicions vs confirmations

Output ONLY valid JSON. No additional commentary.
"""
        return prompt
    
    def summarize_scene(
        self,
        prompt: str,
        model: str = "gpt-4o"
    ) -> Dict[str, Any]:
        """Call the API to summarize a single scene."""
        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            print(f"Error calling API: {e}", file=sys.stderr)
            raise
    
    def process_scenes(
        self,
        pass1_path: Path,
        transcript_path: Path,
        output_path: Path,
        model: str = "gpt-4o",
        speaker_context: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Main processing loop: summarize all scenes.
        
        Args:
            speaker_context: Optional speaker identification guidance
        
        Returns list of scene summaries.
        """
        print(f"Loading Pass 1 results from {pass1_path}...")
        pass1_data = self.load_pass1_results(pass1_path)
        scenes = pass1_data.get("scenes", [])
        
        print(f"Loading transcript from {transcript_path}...")
        transcript = self.load_transcript(transcript_path)
        
        print(f"Processing {len(scenes)} scenes...\n")
        
        repo_root = Path.cwd()
        summaries = []
        
        for idx, scene in enumerate(scenes):
            scene_id = scene.get("scene_id", f"S-{idx+1:03d}")
            start_seconds = scene.get("start_seconds", 0)
            end_seconds = scene.get("end_seconds", 0)
            
            print(f"Scene {idx+1}/{len(scenes)}: {scene_id}")
            print(f"  Time range: {start_seconds:.1f}s - {end_seconds:.1f}s")
            print(f"  Location: {scene.get('location', 'Unknown')}")
            
            # Extract transcript for this scene
            scene_transcript = self.extract_scene_transcript(
                transcript,
                start_seconds,
                end_seconds
            )
            print(f"  Transcript entries: {len(scene_transcript)}")
            
            # Load resources for this scene
            scene_resources = self.load_scene_resources(scene, repo_root)
            print(f"  Resources loaded: {len(scene_resources)}")
            
            # Get adjacent scenes for context
            previous_summary = summaries[-1] if summaries else None
            next_scene = scenes[idx + 1] if idx < len(scenes) - 1 else None
            
            # Build prompt
            prompt = self.build_scene_prompt(
                scene,
                scene_transcript,
                scene_resources,
                previous_summary,
                next_scene,
                speaker_context
            )
            
            # Summarize
            print(f"  Summarizing...")
            summary = self.summarize_scene(prompt, model)
            
            # Merge scene metadata with summary
            full_summary = {
                **scene,  # Include all Pass 1 metadata
                **summary  # Add Pass 2 summary data
            }
            
            summaries.append(full_summary)
            print(f"  ✓ Complete\n")
        
        # Save results
        print(f"Saving {len(summaries)} scene summaries to {output_path}...")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        output_data = {
            "metadata": {
                "source_pass1": str(pass1_path),
                "source_transcript": str(transcript_path),
                "generated": datetime.now().isoformat(),
                "total_scenes": len(summaries),
                "model": model
            },
            "summaries": summaries
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        print(f"✓ Scene summarization complete!")
        return summaries


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Pass 2: Summarize scenes from D&D session transcripts",
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
    pass1_path = repo_root / config["pass1"]["output"]
    output_path = repo_root / config["pass2"]["output"]
    model = config["pass2"].get("model", "gpt-4o")
    
    # Validate pass1 file
    if not pass1_path.exists():
        print(f"Error: Pass 1 file not found: {pass1_path}", file=sys.stderr)
        print(f"Have you run Pass 1 (detect_scenes.py) yet?", file=sys.stderr)
        return 1
    
    # Get transcript path from pass1 metadata
    with open(pass1_path, 'r') as f:
        pass1_data = json.load(f)
    
    transcript_path = Path(pass1_data["metadata"]["source_transcript"])
    
    if not transcript_path.exists():
        print(f"Error: Source transcript not found: {transcript_path}", file=sys.stderr)
        return 1
    
    print(f"Session: {session_num}")
    print(f"Config: sessions/{session_num:02d}/config.toml")
    print(f"Pass 1 input: {pass1_path}")
    print(f"Transcript: {transcript_path}")
    print(f"Output: {output_path}")
    print()
    
    # Create summarizer and process
    try:
        summarizer = SceneSummarizer()
        
        speaker_context = config.get("session", {}).get("speakers", {}).get("notes")
        
        summaries = summarizer.process_scenes(
            pass1_path,
            transcript_path,
            output_path,
            model=model,
            speaker_context=speaker_context
        )
        
        print(f"\n✓ Successfully summarized {len(summaries)} scenes")
        print(f"✓ Output saved to: {output_path}")
        
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
