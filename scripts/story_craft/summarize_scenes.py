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
import textwrap
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from openai import OpenAI
import tomlkit

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
                "default": "gpt-4o",
            },
        },
        "required": ["session"],
        "additionalProperties": False,
    },
    "argv": [],
    "value_flags": {
        "session": "--session",
        "pass1": "--pass1",
        "output": "--output",
        "model": "--model",
    },
}


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
        self._resource_index: Optional[Dict[str, List[Path]]] = None
    
    @staticmethod
    def wrap_text(text: str, max_length: int = 100) -> str:
        """
        Wrap text to maximum line length for readable TOML output.
        Preserves paragraph breaks and wraps long lines naturally.
        
        Args:
            text: Text to wrap
            max_length: Maximum characters per line
            
        Returns:
            Wrapped text with newlines
        """
        if not text or len(text) <= max_length:
            return text
        
        # Split into paragraphs first
        paragraphs = text.split('\n')
        wrapped_paragraphs = []
        
        for para in paragraphs:
            if not para.strip():
                wrapped_paragraphs.append('')
                continue
            
            # Wrap each paragraph
            wrapped = textwrap.fill(
                para,
                width=max_length,
                break_long_words=False,
                break_on_hyphens=False
            )
            wrapped_paragraphs.append(wrapped)
        
        return '\n'.join(wrapped_paragraphs)
    
    @staticmethod
    def format_scene_for_toml(scene: Dict[str, Any], max_line_length: int = 100) -> Dict[str, Any]:
        """
        Format scene data for human-readable TOML output.
        Wraps long strings to reasonable line lengths.
        Removes None values and empty structures.
        
        Args:
            scene: Scene data dictionary
            max_line_length: Maximum characters per line for text fields
            
        Returns:
            Formatted scene dictionary
        """
        formatted = {}
        
        # Text fields to wrap
        text_fields = [
            'summary', 'outcome', 'notes',
            'factual_summary', 'narrative_seed', 'scene_outcome'  # Legacy fields
        ]
        
        # List-of-string fields to wrap individual items
        list_text_fields = [
            'key_events', 'information', 'information_gained'
        ]
        
        def clean_value(value):
            """Remove None values and empty structures recursively."""
            if value is None:
                return None
            elif isinstance(value, dict):
                cleaned = {k: clean_value(v) for k, v in value.items() if v is not None}
                return cleaned if cleaned else None
            elif isinstance(value, list):
                cleaned = [clean_value(item) for item in value if item is not None]
                return cleaned if cleaned else None
            else:
                return value
        
        for key, value in scene.items():
            if value is None:
                continue
                
            if key in text_fields and isinstance(value, str):
                formatted[key] = SceneSummarizer.wrap_text(value, max_line_length)
            elif key in list_text_fields and isinstance(value, list):
                formatted[key] = [
                    SceneSummarizer.wrap_text(item, max_line_length) if isinstance(item, str) else item
                    for item in value
                ]
            elif key == 'character_beats' and isinstance(value, dict):
                # Wrap character beat descriptions
                formatted[key] = {
                    char: SceneSummarizer.wrap_text(desc, max_line_length) if isinstance(desc, str) else desc
                    for char, desc in value.items()
                }
            elif key == 'requested_resources' and isinstance(value, list):
                # Clean up requested_resources to remove None values in override fields
                cleaned_resources = []
                for resource in value:
                    if isinstance(resource, dict):
                        cleaned = {k: v for k, v in resource.items() if v is not None}
                        if cleaned:
                            cleaned_resources.append(cleaned)
                if cleaned_resources:
                    formatted[key] = cleaned_resources
            else:
                cleaned = clean_value(value)
                if cleaned is not None:
                    formatted[key] = cleaned
        
        return formatted
    
    def load_transcript(self, filepath: Path) -> List[Dict[str, Any]]:
        """Load transcript from JSONL file."""
        transcript = load_jsonl(filepath)
        for entry in transcript:
            entry["speaker"] = normalize_speaker_label(entry.get("speaker"))
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

    def build_resource_index(self, repo_root: Path) -> Dict[str, List[Path]]:
        """Index markdown files by stem for best-effort resource resolution."""
        if self._resource_index is not None:
            return self._resource_index

        index: Dict[str, List[Path]] = {}
        for folder in [
            repo_root / "world",
            repo_root / "characters",
            repo_root / "items",
            repo_root / "creatures",
            repo_root / "quests",
        ]:
            if not folder.exists():
                continue
            for md_file in folder.rglob("*.md"):
                index.setdefault(md_file.stem, []).append(md_file)

        # Keep stable ordering for deterministic behavior.
        for stem, paths in index.items():
            paths.sort(key=lambda p: p.as_posix())

        self._resource_index = index
        return index
    
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

                if not full_path.exists():
                    # Best-effort: allow passing just a file stem like "ardenford".
                    stem = Path(path_to_use).stem
                    if stem and ("/" not in path_to_use and "\\" not in path_to_use):
                        candidates = self.build_resource_index(repo_root).get(stem, [])
                        if len(candidates) == 1:
                            full_path = candidates[0]
                
                content = self.load_resource_file(full_path)
                resources[f"{keyword} ({path_to_use})"] = content
        
        return resources
    
    def format_transcript_entries(self, entries: List[Dict[str, Any]]) -> str:
        """Format transcript entries for inclusion in prompt."""
        lines = []
        for entry in entries:
            speaker = normalize_speaker_label(entry.get("speaker"))
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

# Resources for This Scene

{resource_text}

# Scene Transcript

```
{transcript_text}
```

# Speaker Identification Notes

{speaker_context or "No specific speaker guidance provided."}

# Your Task

Provide a concise, grounded summary of THIS scene only. Do NOT summarize previous or future scenes.

## Output Format (JSON)

```json
{{
  "scene_id": "{scene_id}",
  
  "confidence": {{
    "factual_accuracy": 0.85,
    "completeness": 0.70,
    "speculation_level": "low"
  }},
  
  "location_intelligence": {{
    "name": "Location name from scene",
    "known_details": ["detail from transcript", "detail from resources"],
    "inferred_details": ["logical inference not directly stated"],
    "confidence": 0.85
  }},
  
  "summary": "Brief factual recap of what happened in this scene",
  "outcome": "How this scene ended or transitioned",
  
  "key_events": [
    {{
      "summary": "Brief event summary",
      "details": "Longer description of what happened"
    }}
  ],
  
  "character_beats": {{
    "Character Name": "brief action or trait shown"
  }},
  
  "npcs": [
    {{
      "name": "NPC name",
      "role": "Brief role",
      "interaction": "How party interacted"
    }}
  ],
  
  "loot": [
    {{
      "item": "Item name",
      "context": "Brief context"
    }}
  ],
  
  "information": [
    {{
      "summary": "Brief info summary",
      "details": "Full details and context"
    }}
  ],
  
  "atmosphere": {{
    "mood": "tense/calm/urgent/etc",
    "lighting": "brief lighting description",
    "sounds": "brief sound description"
  }},
  
  "grounding": {{
    "transcript_timestamps": [2633.619, 2977.76],
    "resource_refs": ["file.md"],
    "inferred_content": ["what was logically inferred"]
  }},
  
  "plot_threads": [
    {{
      "thread": "Plot thread name",
      "status": "introduced|advanced|resolved|complicated"
    }}
  ]
}}
```

## Confidence Scoring (REQUIRED)

Rate each scene:
- **factual_accuracy** (0-1): How well does source material support your claims?
- **completeness** (0-1): Did you capture the full scene or is context missing?
- **speculation_level**: "low" (mostly transcript), "medium" (some inference), "high" (significant interpretation)

## Location Intelligence (REQUIRED)

For each location, separate:
- **known_details**: ONLY from transcript or resource documents
- **inferred_details**: Logical but not explicitly stated
- **confidence**: How certain are you about this location (0-1)

## Brevity Guidelines (IMPORTANT)

Write concisely without sacrificing accuracy:
- **summary**: Focus on core actions and outcomes
- **outcome**: Single clear sentence
- **key_events**: Action-focused bullets, avoid lengthy descriptions
- **character_beats**: One key trait/action per PC, not full paragraphs
- **atmosphere**: Evocative but brief sensory notes

Avoid wordiness:
- Skip filler phrases ("in order to", "proceeded to", "began to")
- Use active voice ("party entered" not "party was entering")
- Eliminate redundancy between fields
- Don't repeat information from previous summaries

## Grounding Rules (CRITICAL)

For EVERY claim in your summary:
1. Check if it's directly from transcript → cite timestamp range
2. Check if it's from resources → note which file
3. If neither → add to `inferred_content` list

Mark inferences clearly:
- If you're filling gaps or interpreting, acknowledge it
- If transcript is unclear, lower confidence scores
- Don't invent dialogue, NPC actions, or sensory details not in source

## Forbidden Behaviors (NEVER DO THIS)

❌ **Do NOT invent NPC dialogue** not in transcript  
❌ **Do NOT add sensory details** (smells, textures, colors) unless explicitly mentioned  
❌ **Do NOT describe emotions or motivations** unless stated by characters  
❌ **Do NOT repeat the same information** across multiple fields  
❌ **Do NOT include out-of-character content**:
   - Dice rolls ("I rolled a 15")
   - Table talk ("Should we take a break?")
   - Player commentary ("That's a cool item!")
   - Rules discussions ("Can I use my reaction?")
   - Technical issues ("Sorry, I was muted")

## Required Guidelines

1. **In-game narrative only** - filter OOC completely
2. **Specific and concrete** - use exact names, places, items from transcript
3. **Preserve uncertainty** - if party doesn't know, say so
4. **Cross-reference resources** - correct misidentifications using provided docs
5. **Separate facts from inference** - use grounding and inferred_content fields

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
                temperature=0.2,  # Lower temperature for more focused, less verbose output
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
        speaker_context: Optional[str] = None,
        speakers_cfg: Optional[Dict[str, Any]] = None,
        context_before_seconds: float = 30.0,
        context_after_seconds: float = 30.0,
        max_line_length: int = 100,
        scene_filter: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Main processing loop: summarize all scenes.
        
        Args:
            speaker_context: Optional speaker identification guidance
            max_line_length: Maximum line length for text wrapping in TOML
            scene_filter: Optional list of scene indices to process (0-indexed)
        
        Returns list of scene summaries.
        """
        # Store max_line_length for later use
        self._max_line_length = max_line_length
        
        print(f"Loading Pass 1 results from {pass1_path}...")
        pass1_data = self.load_pass1_results(pass1_path)
        scenes = pass1_data.get("scenes", [])
        
        # Apply scene filter if provided
        if scene_filter is not None:
            original_count = len(scenes)
            scenes = [scenes[i] for i in scene_filter if i < len(scenes)]
            print(f"Filtered to {len(scenes)} scene(s) (from {original_count} total)")
        
        print(f"Loading transcript from {transcript_path}...")
        transcript = self.load_transcript(transcript_path)
        
        print(f"Processing {len(scenes)} scenes...\n")
        
        repo_root = REPO_ROOT
        summaries = []

        observed_speakers = sorted({e.get("speaker") for e in transcript if e.get("speaker")})
        if not speaker_context and speakers_cfg is not None:
            speaker_context = format_speaker_context(speakers_cfg, observed_speakers)
        
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
                end_seconds,
                context_before_seconds=context_before_seconds,
                context_after_seconds=context_after_seconds,
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
        
        # Save results as TOML files in output directory
        print(f"Saving {len(summaries)} scene summaries to {output_path}/...")
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Save metadata file
        metadata_file = output_path / "_metadata.toml"
        metadata = tomlkit.document()
        metadata_section = tomlkit.table()
        metadata_section["source_pass1"] = str(pass1_path)
        metadata_section["source_transcript"] = str(transcript_path)
        metadata_section["generated"] = datetime.now().isoformat()
        metadata_section["total_scenes"] = len(summaries)
        metadata_section["model"] = model
        metadata["metadata"] = metadata_section
        
        with open(metadata_file, 'w', encoding='utf-8') as f:
            f.write(tomlkit.dumps(metadata))
        print(f"  ✓ Saved metadata to {metadata_file.name}")
        
        # Get max line length from config
        max_line_length = context_before_seconds  # Placeholder, will be passed properly
        if hasattr(self, '_max_line_length'):
            max_line_length = self._max_line_length
        else:
            max_line_length = 100  # Default
        
        # Save each scene as individual TOML file
        for idx, scene_data in enumerate(summaries):
            scene_id = scene_data.get('scene_id', f'S-{idx+1:03d}')
            scene_file = output_path / f"{scene_id}.toml"
            
            # Format for human readability
            formatted_scene = self.format_scene_for_toml(scene_data, max_line_length)
            
            # Top-level fields that should use multi-line strings
            multiline_fields = {
                'summary', 'outcome', 'notes', 
                'factual_summary', 'narrative_seed', 'scene_outcome'  # Legacy fields
            }
            
            # Helper to recursively format all arrays as multiline
            def format_arrays_recursive(obj):
                """Recursively format all arrays to be multiline."""
                if isinstance(obj, dict):
                    result = {}
                    for k, v in obj.items():
                        result[k] = format_arrays_recursive(v)
                    return result
                elif isinstance(obj, list):
                    # Check if this is an array of tables (list of dicts)
                    if all(isinstance(item, dict) for item in obj):
                        # Array of tables - format each dict recursively
                        return [format_arrays_recursive(item) for item in obj]
                    else:
                        # Simple array - make it multiline
                        arr = tomlkit.array()
                        arr.multiline(True)
                        for item in obj:
                            arr.append(format_arrays_recursive(item))
                        return arr
                else:
                    return obj
            
            # Convert to tomlkit document for better formatting
            doc = tomlkit.document()
            for key, value in formatted_scene.items():
                # Use multiline strings ONLY for specific top-level text fields
                if key in multiline_fields and isinstance(value, str) and '\n' in value:
                    doc[key] = tomlkit.string(value, multiline=True)
                else:
                    # Format all arrays recursively
                    doc[key] = format_arrays_recursive(value)
            
            with open(scene_file, 'w', encoding='utf-8') as f:
                f.write(tomlkit.dumps(doc))
            
            print(f"  ✓ Saved {scene_file.name}")
        
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
    parser.add_argument(
        "--pass1",
        type=str,
        help="Override Pass 1 input path (default: from config)"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Override Pass 2 output path (default: from config)"
    )
    parser.add_argument(
        "--model",
        type=str,
        help="Override model (default: from config)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Process only the first N scenes (for testing)"
    )
    parser.add_argument(
        "--scenes",
        type=str,
        help="Process specific scenes (e.g., '1', '1-3', '1,3,5')"
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
    pass1_path = (repo_root / parsed_args.pass1) if parsed_args.pass1 else (repo_root / config["pass1"]["output"])
    output_path = (repo_root / parsed_args.output) if parsed_args.output else (repo_root / config["pass2"]["output"])
    model = parsed_args.model if parsed_args.model else config["pass2"].get("model", "gpt-4o")

    context_before = float(config.get("pass2", {}).get("context_before", 30.0))
    context_after = float(config.get("pass2", {}).get("context_after", 30.0))
    max_line_length = int(config.get("pass2", {}).get("max_line_length", 100))
    
    # Validate pass1 file
    if not pass1_path.exists():
        print(f"Error: Pass 1 file not found: {pass1_path}", file=sys.stderr)
        print(f"Have you run Pass 1 (detect_scenes.py) yet?", file=sys.stderr)
        return 1
    
    # Transcript is always at sessions/{NN}/transcripts.jsonl
    transcript_path = repo_root / "sessions" / f"{session_num:02d}" / "transcripts.jsonl"
    
    if not transcript_path.exists():
        print(f"Error: Source transcript not found: {transcript_path}", file=sys.stderr)
        return 1
    
    # Parse scene selection arguments
    scene_filter = None
    if parsed_args.limit:
        scene_filter = list(range(parsed_args.limit))
        print(f"Limiting to first {parsed_args.limit} scene(s)")
    elif parsed_args.scenes:
        scene_filter = []
        for part in parsed_args.scenes.split(','):
            if '-' in part:
                start, end = map(int, part.split('-'))
                scene_filter.extend(range(start - 1, end))  # Convert to 0-indexed
            else:
                scene_filter.append(int(part) - 1)  # Convert to 0-indexed
        print(f"Processing scenes: {parsed_args.scenes}")
    
    print(f"Session: {session_num}")
    print(f"Config: sessions/{session_num:02d}/config.toml")
    print(f"Pass 1 input: {pass1_path}")
    print(f"Transcript: {transcript_path}")
    print(f"Output: {output_path}/ (TOML files)")
    print(f"Max line length: {max_line_length}")
    print()
    
    # Create summarizer and process
    try:
        summarizer = SceneSummarizer()

        speakers_cfg = config.get("session", {}).get("speakers", {})
        
        summaries = summarizer.process_scenes(
            pass1_path,
            transcript_path,
            output_path,
            model=model,
            speakers_cfg=speakers_cfg,
            context_before_seconds=context_before,
            context_after_seconds=context_after,
            max_line_length=max_line_length,
            scene_filter=scene_filter,
        )
        
        print(f"\n✓ Successfully summarized {len(summaries)} scenes")
        print(f"✓ Output saved to: {output_path}/")
        
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
