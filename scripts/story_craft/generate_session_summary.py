#!/usr/bin/env python3
"""
Pass 3: Session Summary Generation from Pass 2 Output

Takes all pass2 scene summaries and generates a consolidated 1-2 page session summary
using configurable bardic prompt styles defined in the session config.toml.

Usage:
    dnd_pass3 --session 1
    dnd_pass3 1

Configuration in sessions/XX/config.toml:
    [summary]
    model = "gpt-4o"
    temperature = 0.7
    prompts = ["bardic-dm", "elric-chronicler"]  # or ["all"]
"""

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed, will use system env vars

import argparse
import os
import sys
import tomllib
from pathlib import Path
from typing import Dict, Any, List, Optional
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
    load_session_config,
)

MCP_TOOL = {
    "name": "dnd_pass3",
    "description": (
        "Generate session summaries from Pass 2 scene data. "
        "Creates 1-2 page bardic chronicles using prompt styles configured in sessions/XX/config.toml. "
        "Ensures balanced representation across entire session."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "session": {
                "type": "integer",
                "description": "Session number (e.g., 1, 2, 3)",
            },
        },
        "required": ["session"],
        "additionalProperties": False,
    },
    "argv": [],
    "value_flags": {
        "session": "--session",
    },
}


class SessionSummarizer:
    """Generates session summaries from pass2 scene data."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o"):
        """Initialize the session summarizer."""
        self.client = OpenAI(api_key=api_key or os.environ.get("OPENAI_API_KEY"))
        self.model = model
        self.prompts_dir = Path(__file__).parent / "prompts"
    
    def load_prompt_config(self, prompt_slug: str) -> Dict[str, Any]:
        """Load a prompt configuration from the prompts directory."""
        prompt_path = self.prompts_dir / f"{prompt_slug}.toml"
        if not prompt_path.exists():
            raise FileNotFoundError(
                f"Prompt config not found: {prompt_path}\n"
                f"Available prompts: {self.list_available_prompts()}"
            )
        
        with prompt_path.open("rb") as f:
            config = tomllib.load(f)
        
        required_fields = ["name", "slug", "system_prompt"]
        missing = [f for f in required_fields if f not in config]
        if missing:
            raise ValueError(f"Prompt config missing required fields: {missing}")
        
        return config
    
    def list_available_prompts(self) -> List[str]:
        """List all available prompt slugs."""
        if not self.prompts_dir.exists():
            return []
        return [p.stem for p in self.prompts_dir.glob("*.toml")]
    
    def load_pass2_scenes(self, session_folder: Path) -> List[Dict[str, Any]]:
        """Load all pass2 scene TOML files, sorted by scene_id."""
        pass2_dir = session_folder / "pass2"
        if not pass2_dir.exists():
            raise FileNotFoundError(f"Pass2 directory not found: {pass2_dir}")
        
        scenes = []
        for toml_file in sorted(pass2_dir.glob("S-*.toml")):
            with toml_file.open("rb") as f:
                scene = tomllib.load(f)
            scenes.append(scene)
        
        # Sort by scene_id to ensure correct order
        scenes.sort(key=lambda s: s.get("scene_id", ""))
        
        if not scenes:
            raise ValueError(f"No scene TOML files found in {pass2_dir}")
        
        print(f"Loaded {len(scenes)} scenes from {pass2_dir}")
        return scenes
    
    def format_scenes_for_summary(self, scenes: List[Dict[str, Any]]) -> str:
        """
        Format pass2 scenes into a balanced input for the summary LLM.
        
        Ensures equal representation by including key fields from all scenes
        without favoring early or late content.
        """
        lines = []
        
        for i, scene in enumerate(scenes, 1):
            scene_id = scene.get("scene_id", f"S-{i:03d}")
            lines.append(f"## Scene {scene_id}")
            lines.append("")
            
            # Core scene data (consistent across all scenes)
            lines.append(f"**Location:** {scene.get('location', 'Unknown')}")
            lines.append(f"**Time:** {scene.get('time_of_day', 'Unknown')}")
            lines.append(f"**Tone:** {scene.get('emotional_tone', 'Unknown')}")
            
            if scene.get("npcs_present"):
                npcs = scene["npcs_present"]
                if isinstance(npcs, list):
                    lines.append(f"**NPCs:** {', '.join(npcs)}")
                else:
                    lines.append(f"**NPCs:** {npcs}")
            
            lines.append("")
            
            # Goal (what the party was trying to accomplish)
            if scene.get("goal"):
                lines.append(f"**Goal:** {scene['goal']}")
                lines.append("")
            
            # Summary (the main narrative content)
            if scene.get("summary"):
                lines.append("**Summary:**")
                lines.append(scene["summary"])
                lines.append("")
            
            # Outcome (resolution/consequence)
            if scene.get("outcome"):
                lines.append("**Outcome:**")
                lines.append(scene["outcome"])
                lines.append("")
            
            # Notes (any additional context)
            if scene.get("notes"):
                lines.append("**Notes:**")
                lines.append(scene["notes"])
                lines.append("")
            
            lines.append("---")
            lines.append("")
        
        return "\n".join(lines)
    
    def generate_summary(
        self,
        scenes: List[Dict[str, Any]],
        prompt_config: Dict[str, Any],
        session_num: int,
    ) -> str:
        """Generate a session summary using the specified prompt configuration."""
        
        # Format scenes for balanced representation
        scenes_text = self.format_scenes_for_summary(scenes)
        
        # Build the user message
        user_message = f"""Below are the scene summaries from Session {session_num:02d}. 
Generate a session summary following the structure and rules provided in your system prompt.

{scenes_text}

Remember:
- Include INVENTORY CHANGES section first (if any inventory events occurred)
- Include FEATURED NPCS section second
- Include SESSION SUMMARY as the main narrative body
- Target 500-900 words for the summary section
- Each scene should get roughly equal representation
- Use paragraph breaks between scenes
- Preserve all facts exactly as given"""
        
        print(f"Generating summary with prompt: {prompt_config['name']}")
        print(f"Processing {len(scenes)} scenes...")
        print(f"Model: {self.model}")
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": prompt_config["system_prompt"]},
                {"role": "user", "content": user_message},
            ],
            temperature=0.7
        )
        
        summary = response.choices[0].message.content
        return summary
    
    def save_summary(
        self,
        summary: str,
        session_num: int,
        prompt_slug: str,
        prompt_name: str,
    ):
        """Save the summary to the appropriate location in story/the-compass-edge."""
        
        # Create output directory structure
        story_dir = REPO_ROOT / "story" / "the-compass-edge" / prompt_slug
        story_dir.mkdir(parents=True, exist_ok=True)
        
        # Create filename
        output_file = story_dir / f"session-{session_num:02d}-summary.md"
        
        # Add metadata header
        header = f"""---
session: {session_num}
prompt_style: {prompt_name}
prompt_slug: {prompt_slug}
generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
---

"""
        
        # Write file
        with output_file.open("w", encoding="utf-8") as f:
            f.write(header)
            f.write(summary)
        
        print(f"✓ Saved summary to: {output_file}")
        return output_file


def main():
    parser = argparse.ArgumentParser(
        description="Generate session summaries from Pass 2 scene data"
    )
    parser.add_argument(
        "--session",
        type=int,
        help="Session number (e.g., 1, 2, 3). If omitted, uses latest.",
    )
    
    # Handle flexible positional arguments
    parser.add_argument(
        "args",
        nargs="*",
        help="Flexible args: session number",
    )
    
    args = parser.parse_args()
    
    # Parse flexible positional arguments
    for arg in args.args:
        try:
            if args.session is None:
                args.session = int(arg)
                break
        except ValueError:
            pass
    
    # Determine session number
    if args.session is None:
        args.session = discover_latest_session()
        if args.session is None:
            print("ERROR: No session specified and no sessions found")
            sys.exit(1)
        print(f"Using latest session: {args.session}")
    
    # Load session configuration
    try:
        config = load_session_config(args.session)
    except FileNotFoundError as e:
        print(f"ERROR: {e}")
        sys.exit(1)
    
    # Get summary configuration
    summary_config = config.get("summary", {})
    if not summary_config:
        print("ERROR: No [summary] section found in config.toml")
        print("Add a [summary] section with 'prompts' and 'model' settings")
        sys.exit(1)
    
    model = summary_config.get("model", "gpt-4o")
    prompt_list = summary_config.get("prompts", [])
    
    if not prompt_list:
        print("ERROR: No prompts specified in [summary] section of config.toml")
        print("Add: prompts = [\"bardic-dm\", \"elric-chronicler\"]")
        sys.exit(1)
    
    # Initialize summarizer
    summarizer = SessionSummarizer(model=model)
    
    # Determine which prompts to use
    if "all" in prompt_list or prompt_list == ["all"]:
        prompt_slugs = summarizer.list_available_prompts()
        if not prompt_slugs:
            print("ERROR: No prompt configurations found in scripts/story_craft/prompts/")
            sys.exit(1)
        print(f"Config specifies 'all' - generating summaries with all {len(prompt_slugs)} prompt styles")
    else:
        prompt_slugs = prompt_list
        print(f"Config specifies {len(prompt_slugs)} prompt style(s): {', '.join(prompt_slugs)}")
    
    # Load session data
    session_folder = REPO_ROOT / "sessions" / f"{args.session:02d}"
    if not session_folder.exists():
        print(f"ERROR: Session folder not found: {session_folder}")
        sys.exit(1)
    
    try:
        scenes = summarizer.load_pass2_scenes(session_folder)
    except Exception as e:
        print(f"ERROR: Failed to load pass2 scenes: {e}")
        sys.exit(1)
    
    # Generate summaries for each prompt style
    print(f"\n{'='*60}")
    print(f"Generating Session {args.session:02d} Summaries")
    print(f"{'='*60}")
    print(f"Scenes: {len(scenes)}")
    print(f"Prompt styles: {len(prompt_slugs)}")
    print(f"Model: {model}")
    print(f"{'='*60}\n")
    
    outputs = []
    for prompt_slug in prompt_slugs:
        try:
            # Load prompt configuration
            prompt_config = summarizer.load_prompt_config(prompt_slug)
            
            # Generate summary
            summary = summarizer.generate_summary(
                scenes=scenes,
                prompt_config=prompt_config,
                session_num=args.session,
            )
            
            # Save summary
            output_file = summarizer.save_summary(
                summary=summary,
                session_num=args.session,
                prompt_slug=prompt_slug,
                prompt_name=prompt_config["name"],
            )
            outputs.append(output_file)
            
            print()
            
        except Exception as e:
            print(f"ERROR generating summary with prompt '{prompt_slug}': {e}")
            import traceback
            traceback.print_exc()
            continue
    
    print(f"\n{'='*60}")
    print(f"✓ Completed: {len(outputs)} summaries generated")
    print(f"{'='*60}")
    for output in outputs:
        print(f"  - {output}")
    print()


if __name__ == "__main__":
    main()
