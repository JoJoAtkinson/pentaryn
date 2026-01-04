#!/usr/bin/env python3
"""
Pass 3: Story Generation from Scene Summaries

Converts structured scene summaries (Pass 2 output) into flowing narrative prose.
Generates numbered markdown files with intelligent scene grouping based on location,
time, and narrative flow.

Usage:
    dnd_pass3
    dnd_pass3 --session 1
    dnd_pass3 1 sessions/01/story/

Arguments are flexible - script will figure out session number and output path.
"""

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import argparse
import json
import os
import re
import sys
import unicodedata
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
    load_session_config,
)

MCP_TOOL = {
    "name": "dnd_pass3",
    "description": (
        "Generate story prose from D&D session scene summaries. "
        "Reads Pass 2 summaries and creates flowing narrative chapters with intelligent "
        "file splitting based on location changes, time jumps, and narrative flow."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "session": {
                "type": "integer",
                "description": "Session number (e.g., 1, 2, 3)",
            },
            "pass2": {
                "type": "string",
                "description": "Path to Pass 2 summaries JSON (default: sessions/{NN}/pass2.json)",
            },
            "output": {
                "type": "string",
                "description": "Output directory for story files (default: sessions/{NN}/story/)",
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
        "pass2": "--pass2",
        "output": "--output",
        "model": "--model",
    },
}


class StoryGenerator:
    """Generates narrative prose from scene summaries."""
    
    def __init__(self, api_key: Optional[str] = None, config: Optional[Dict[str, Any]] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        
        self.client = OpenAI(api_key=self.api_key)
        self.config = config or {}

    def _chapter_numbering(self) -> tuple[int, int, int]:
        """Return (width, step, start) for chapter file numbering."""
        width = int(self.config.get("chapter_number_width", 4))
        if width < 1:
            width = 4

        step = int(self.config.get("chapter_number_step", 10))
        if step < 1:
            step = 10

        start = int(self.config.get("chapter_number_start", step))
        if start < 0:
            start = step

        return width, step, start

    def find_latest_chapter_number(self, output_dir: Path) -> Optional[int]:
        """
        Find the latest chapter number from existing chapter markdown filenames.

        Scans recursively so chapters can be moved into arc/part folders.
        """
        width, _, _ = self._chapter_numbering()
        pattern = re.compile(rf"^(\d{{{width}}})-(.+)\.md$", re.IGNORECASE)

        best: Optional[int] = None
        for path in output_dir.rglob("*.md"):
            match = pattern.match(path.name)
            if not match:
                continue
            slug = match.group(2)
            if not re.search(r"[a-z]", slug, re.IGNORECASE):
                continue
            try:
                num = int(match.group(1))
            except ValueError:
                continue
            best = num if best is None else max(best, num)
        return best

    def find_chapter_file(self, output_dir: Path, chapter_number: int) -> Optional[Path]:
        """Find a chapter markdown file by its numeric prefix (searches recursively)."""
        width, _, _ = self._chapter_numbering()
        pattern = re.compile(rf"^{chapter_number:0{width}d}-(.+)\.md$", re.IGNORECASE)

        candidates: list[Path] = []
        for path in output_dir.rglob("*.md"):
            match = pattern.match(path.name)
            if not match:
                continue
            slug = match.group(1)
            if not re.search(r"[a-z]", slug, re.IGNORECASE):
                continue
            candidates.append(path)

        if not candidates:
            return None

        candidates.sort(key=lambda p: (-(p.stat().st_mtime), len(p.parts), p.as_posix()))
        return candidates[0]

    def slugify_title(self, title: str, max_len: int = 80) -> str:
        """Convert a chapter title into a filesystem-friendly slug."""
        text = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
        text = text.lower()
        text = re.sub(r"[^a-z0-9]+", "-", text)
        text = re.sub(r"-{2,}", "-", text).strip("-")
        if not text or not re.search(r"[a-z]", text):
            return "chapter"
        if len(text) > max_len:
            text = text[:max_len].rstrip("-")
        return text

    def extract_title_from_prose(self, prose: str) -> Optional[str]:
        """Extract the first Markdown H1 title (`# Title`) from model output."""
        for line in prose.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("# "):
                title = stripped[2:].strip()
                return title or None
            return None
        return None

    def ensure_title_heading(self, prose: str, title: str) -> str:
        """Ensure the prose starts with `# <title>` as the first non-empty line."""
        existing = self.extract_title_from_prose(prose)
        if existing:
            return prose
        cleaned_title = title.strip() or "Untitled"
        return f"# {cleaned_title}\n\n{prose.lstrip()}"

    def suggest_chapter_title(self, scenes: List[Dict[str, Any]]) -> str:
        """Best-effort title suggestion from scene data (used if model omits a title)."""
        first = scenes[0] if scenes else {}
        location = str(first.get("location") or "").strip()
        if location:
            location = location.split(",")[0].strip()
            location = location.split("(")[0].strip()
            if location:
                return location
        goal = str(first.get("goal") or "").strip()
        if goal:
            return goal
        return "Untitled"
    
    def load_pass2_results(self, filepath: Path) -> Dict[str, Any]:
        """Load Pass 2 scene summaries."""
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def should_start_new_file(
        self,
        current_scene: Dict[str, Any],
        previous_scene: Optional[Dict[str, Any]],
        scenes_in_current_file: int
    ) -> tuple[bool, str]:
        """
        Determine if we should start a new markdown file.
        
        Returns:
            (should_start_new, reason)
        """
        if previous_scene is None:
            return True, "first scene"
        
        # Get config values
        max_scenes = self.config.get("max_scenes_per_file", 5)
        
        # Force new file if current file has too many scenes (readability)
        if scenes_in_current_file >= max_scenes:
            return True, f"file length limit ({max_scenes} scenes)"
        
        # Extract locations
        curr_location = current_scene.get("location", "")
        prev_location = previous_scene.get("location", "")
        
        # Major location change (different building, area, or wilderness)
        # Simple heuristic: if location strings don't share significant words
        def tokenize_location(text: str) -> set[str]:
            return set(re.findall(r"[a-z0-9']+", text.lower()))

        curr_words = tokenize_location(curr_location)
        prev_words = tokenize_location(prev_location)
        
        # Remove common words
        common_words = {"the", "a", "an", "in", "at", "on", "near", "by", "to", "from", "of", "and"}
        curr_words -= common_words
        prev_words -= common_words
        
        # If locations share no significant words, it's a major change
        if curr_words and prev_words and not (curr_words & prev_words):
            return True, f"location change: {prev_location} → {curr_location}"
        
        # Check time jump
        curr_time = current_scene.get("start_seconds", 0)
        prev_end = previous_scene.get("end_seconds", 0)
        time_gap_seconds = curr_time - prev_end
        
        # Get time jump threshold from config
        threshold = self.config.get("time_jump_threshold_seconds", 3600)
        if time_gap_seconds > threshold:
            hours = time_gap_seconds / 3600
            return True, f"time jump: {hours:.1f} hours"
        
        # Check for narrative time jump phrases in scene outcome or factual summary
        prev_outcome = previous_scene.get("scene_outcome", "").lower()
        curr_summary = current_scene.get("factual_summary", "").lower()
        
        time_jump_phrases = self.config.get("time_jump_phrases", ["next day", "next morning", "the following day", "hours later", "long rest"])
        if any(phrase in prev_outcome or phrase in curr_summary for phrase in time_jump_phrases):
            return True, "narrative time jump detected"
        
        # Check for quest/chapter completion
        prev_threads = previous_scene.get("plot_threads", [])
        resolved_count = sum(1 for t in prev_threads if t.get("status") == "resolved")
        
        if resolved_count > 0:
            return True, "quest/plot resolution"
        
        # Check for major tone shift
        curr_tone = current_scene.get("emotional_tone", "")
        prev_tone = previous_scene.get("emotional_tone", "")
        
        # Get tone break transitions from config (convert list of lists to tuples)
        tone_breaks_config = self.config.get("tone_break_transitions", [["combat", "casual"], ["tense", "casual"], ["somber", "casual"]])
        tone_breaks = [tuple(tb) for tb in tone_breaks_config]
        
        if (prev_tone, curr_tone) in tone_breaks:
            return True, f"tone shift: {prev_tone} → {curr_tone}"
        
        # Continue in current file
        return False, "continuing narrative flow"
    
    def build_story_prompt(
        self,
        scenes: List[Dict[str, Any]],
        is_book_start: bool,
        previous_file_ending: Optional[str] = None,
        suggested_title: Optional[str] = None,
    ) -> str:
        """Build the prompt for generating story prose from scene summaries."""
        
        # Format scene summaries
        scene_blocks = []
        for scene in scenes:
            scene_id = scene.get("scene_id", "Unknown")
            location = scene.get("location", "Unknown")
            factual = scene.get("factual_summary", "")
            narrative = scene.get("narrative_seed", "")
            time_of_day = scene.get("time_of_day", "unknown")
            goal = scene.get("goal", "unknown")
            conflict_type = scene.get("conflict_type", "unknown")
            
            key_events = "\n".join(f"  - {e}" for e in scene.get("key_events", []))
            
            char_moments = []
            for char, moment in scene.get("character_moments", {}).items():
                char_moments.append(f"  - {char}: {moment}")
            char_moments_text = "\n".join(char_moments) if char_moments else "  (none)"
            
            npcs = []
            for npc in scene.get("npcs_encountered", []):
                name = npc.get("name", "Unknown")
                interaction = npc.get("interaction", "")
                npcs.append(f"  - {name}: {interaction}")
            npcs_text = "\n".join(npcs) if npcs else "  (none)"
            
            info_gained = "\n".join(f"  - {i}" for i in scene.get("information_gained", []))

            loot_lines = []
            for item in scene.get("loot_and_items", []) or []:
                if isinstance(item, dict):
                    name = item.get("name") or item.get("item") or "Unknown item"
                    details = item.get("details") or item.get("description") or ""
                    loot_lines.append(f"  - {name}" + (f": {details}" if details else ""))
                else:
                    loot_lines.append(f"  - {item}")
            loot_text = "\n".join(loot_lines) if loot_lines else "  (none)"
            
            scene_block = f"""
### {scene_id}: {location}

**Time of Day:** {time_of_day}
**Scene Goal:** {goal}
**Conflict Type:** {conflict_type}

**Factual Summary:**
{factual}

**Narrative Seed:**
{narrative}

**Key Events:**
{key_events}

**Character Moments:**
{char_moments_text}

**NPCs:**
{npcs_text}

**Information Gained:**
{info_gained or "  (none)"}

**Loot / Items:**
{loot_text}

**Time Passed:** {scene.get("time_passed", "unknown")}
**Scene Outcome:** {scene.get("scene_outcome", "unknown")}
"""
            scene_blocks.append(scene_block)
        
        scenes_text = "\n---\n".join(scene_blocks)
        
        # Build character voices section from config
        character_voices = self.config.get("character_voices", {
            "Bazgar": "Confident, direct, occasional swagger; carries orc heritage but defies stereotypes",
            "Sabriel": "Observant, measured, hints of mystery; hides more than she reveals",
            "Marwen": "Curious, practical, slightly eccentric; comfortable with the strange"
        })
        
        # Build POV list from config
        pov_characters = self.config.get("pov_characters", ["Bazgar", "Sabriel", "Marwen"])
        pov_list = ", ".join(pov_characters)

        ordered_voice_items: list[tuple[str, str]] = []
        if isinstance(character_voices, dict):
            seen = set()
            for char in pov_characters:
                desc = character_voices.get(char)
                if isinstance(desc, str) and desc.strip():
                    ordered_voice_items.append((char, desc.strip()))
                    seen.add(char)
            for char, desc in character_voices.items():
                if char in seen:
                    continue
                if isinstance(desc, str) and desc.strip():
                    ordered_voice_items.append((str(char), desc.strip()))
        character_voices_text = "\n".join(f"- **{char}**: {desc}" for char, desc in ordered_voice_items)

        words_per_scene_min = int(self.config.get("words_per_scene_min", 600))
        words_per_scene_max = int(self.config.get("words_per_scene_max", 900))
        if words_per_scene_min < 0:
            words_per_scene_min = 0
        if words_per_scene_max < words_per_scene_min:
            words_per_scene_max = words_per_scene_min
        target_min = words_per_scene_min * len(scenes)
        target_max = words_per_scene_max * len(scenes)

        extra_instructions = self.config.get("extra_instructions")
        extra_instructions_block = ""
        if isinstance(extra_instructions, str) and extra_instructions.strip():
            extra_instructions_block = f"""

## Additional Instructions
{extra_instructions.strip()}
"""
        
        suggested_title_text = (suggested_title or "").strip()

        # Build opening context
        if is_book_start:
            opening_context = """
This is the FIRST chapter of the story. Begin with a compelling hook that:
- Establishes atmosphere and setting
- Introduces characters with vivid first impressions
- Creates immediate interest
- Avoids "Chapter 1" or similar meta-labels (just start the story)
"""
        else:
            opening_context = f"""
This is a NEW chapter continuing the story. Begin with:
- A brief transition acknowledging the previous chapter's ending
- Re-establish setting and atmosphere
- Continue the narrative flow naturally
- Avoid restating what readers already know

Previous chapter ending context:
{previous_file_ending or "(not available)"}
"""
        
        prompt = f"""You are a fantasy novelist converting D&D session notes into engaging narrative prose.

# Your Task

Convert the following scene summaries into flowing narrative prose suitable for a fantasy novel.

{opening_context}

# Writing Guidelines

## Sensory Expansion
- **Smells**: Specific (hearth smoke + roasting mutton, not just "food")
- **Sounds**: Layered (conversations + clinking plates + crackling fire)
- **Textures**: Physical (sticky floors, rough rope, cold iron)
- **Visuals**: Detailed (quality of light, weather, colors, physical descriptions)

## Dialogue
- Reconstruct conversations from summaries into natural-sounding dialogue
- Include speaker tags with action/tone: `"I'll go," Bazgar said, hand already on his axe.`
- Show personality through word choice and speech patterns
- Use body language and physical reactions during dialogue

## Character Voice
{character_voices_text}

## Tense & POV (Third-Person Limited)
- Write in past tense.
- Keep a single POV character at a time.
- You may rotate POV between scenes/section breaks (primarily {pov_list}), but do NOT head-hop mid-scene.
- Show internal reactions, motivations, doubts.
- Use italics sparingly for direct thoughts: *What is she hiding?*

## Pacing
- **Linger** on: Emotional beats, character development, mysteries, combat climaxes
- **Montage** through: Routine travel, shopping details, repeated actions
- **Cut**: OOC content (already filtered), excessive mechanics

## Length
- Aim for roughly **{target_min}–{target_max} words** for this chapter (adjust as needed for pace).

## Narrative Flow
- Use scene transitions between locations/times
- Vary sentence structure (short for action, long for description)
- Show don't tell (especially emotions)
- Foreshadow when appropriate

## Canon Guardrails
- Keep all names, places, and outcomes consistent with the summaries.
- Do not invent major new lore, NPCs, or plot twists; if details are missing, stay vague and grounded.

## Avoid
- ❌ "Meanwhile..." or "Back at..." (maintain single POV flow)
- ❌ Dice mechanics ("rolled a 15", "failed the check")
- ❌ Game terms ("took a short rest", "gained XP")
- ❌ Meta-commentary about the story itself
- ❌ References to sessions, players, or the table
- ❌ Purple prose or overwriting (keep it grounded)

{extra_instructions_block}

# Scene Summaries to Convert

{scenes_text}

# Output Format

Provide ONLY the narrative prose in Markdown format:
- The FIRST line MUST be `# <Chapter Title>` (Title Case, no chapter numbers).
- Use `##` for scene transitions within the chapter
- Use `---` (horizontal rule) for significant time/location jumps
- Use proper Markdown formatting (italics, bold, etc.)
- NO JSON, no meta-commentary, just the story text

Suggested chapter title (optional):
{suggested_title_text or "(choose your own)"}

Begin writing the narrative now:
"""
        return prompt
    
    def generate_prose(
        self,
        prompt: str,
        model: str = "gpt-4o"
    ) -> str:
        """Call the API to generate narrative prose."""
        try:
            temperature = self.config.get("temperature", 0.7)
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a skilled fantasy novelist."},
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,  # From config (higher for creative prose)
            )
            
            content = response.choices[0].message.content
            if not content:
                raise ValueError("Model returned empty content")
            return content
            
        except Exception as e:
            print(f"Error calling API: {e}", file=sys.stderr)
            raise

    def extract_ending_context(self, prose: str, max_chars: int = 800) -> Optional[str]:
        """Extract a useful ending snippet to help the next chapter start smoothly."""
        text = prose.strip()
        if not text:
            return None

        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        if not paragraphs:
            return None

        ending = None
        for p in reversed(paragraphs):
            if p.lstrip().startswith("#"):
                continue
            ending = p
            break
        if ending is None:
            ending = paragraphs[-1]

        if len(ending) > max_chars:
            ending = "…" + ending[-max_chars:]
        return ending
    
    def process_summaries(
        self,
        pass2_path: Path,
        output_dir: Path,
        model: str = "gpt-4o",
    ) -> List[Path]:
        """
        Main processing loop: generate story files from scene summaries.
        
        Returns list of generated markdown file paths.
        """
        print(f"Loading Pass 2 summaries from {pass2_path}...")
        pass2_data = self.load_pass2_results(pass2_path)
        summaries = pass2_data.get("summaries", [])
        
        print(f"Loaded {len(summaries)} scene summaries")
        print(f"Output directory: {output_dir}\n")
        
        # Create output directory
        output_dir.mkdir(parents=True, exist_ok=True)
        
        width, step, start = self._chapter_numbering()
        latest_existing = self.find_latest_chapter_number(output_dir)
        next_chapter_number = (latest_existing + step) if latest_existing is not None else start

        generated_files = []
        current_file_scenes = []
        previous_file_ending = None
        is_book_start = (latest_existing is None)
        if latest_existing is not None:
            previous_chapter_path = self.find_chapter_file(output_dir, latest_existing)
            if previous_chapter_path is not None:
                try:
                    previous_content = previous_chapter_path.read_text(encoding="utf-8")
                    previous_file_ending = self.extract_ending_context(previous_content)
                except Exception:
                    previous_file_ending = None
        
        for idx, summary in enumerate(summaries):
            scene_id = summary.get("scene_id", f"S-{idx+1:03d}")
            
            # Determine if we should start a new file
            previous_scene = summaries[idx - 1] if idx > 0 else None
            should_split, reason = self.should_start_new_file(
                summary,
                previous_scene,
                len(current_file_scenes)
            )
            
            if should_split and current_file_scenes:
                # Generate prose for current batch
                print(f"\n=== Generating Chapter {next_chapter_number:0{width}d} ===")
                print(f"  Scenes: {[s.get('scene_id') for s in current_file_scenes]}")
                print(f"  Reason for new file: {reason}")
                
                suggested_title = self.suggest_chapter_title(current_file_scenes)
                prompt = self.build_story_prompt(
                    current_file_scenes,
                    is_book_start=is_book_start,
                    previous_file_ending=previous_file_ending,
                    suggested_title=suggested_title,
                )
                
                prose = self.generate_prose(prompt, model=model)

                title = self.extract_title_from_prose(prose) or suggested_title
                prose = self.ensure_title_heading(prose, title)
                slug = self.slugify_title(title)
                
                # Save to file
                filename = f"{next_chapter_number:0{width}d}-{slug}.md"
                filepath = output_dir / filename
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(prose)
                
                generated_files.append(filepath)
                print(f"  ✓ Wrote {filepath}")
                
                # Save last paragraph as context for next file
                previous_file_ending = self.extract_ending_context(prose) or previous_file_ending
                
                # Reset for next file
                current_file_scenes = []
                next_chapter_number += step
                is_book_start = False
            
            # Add scene to current batch
            current_file_scenes.append(summary)
        
        # Generate final file if there are remaining scenes
        if current_file_scenes:
            print(f"\n=== Generating Chapter {next_chapter_number:0{width}d} (final) ===")
            print(f"  Scenes: {[s.get('scene_id') for s in current_file_scenes]}")
            
            suggested_title = self.suggest_chapter_title(current_file_scenes)
            prompt = self.build_story_prompt(
                current_file_scenes,
                is_book_start=is_book_start,
                previous_file_ending=previous_file_ending,
                suggested_title=suggested_title,
            )
            
            prose = self.generate_prose(prompt, model=model)

            title = self.extract_title_from_prose(prose) or suggested_title
            prose = self.ensure_title_heading(prose, title)
            slug = self.slugify_title(title)
            
            filename = f"{next_chapter_number:0{width}d}-{slug}.md"
            filepath = output_dir / filename
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(prose)
            
            generated_files.append(filepath)
            print(f"  ✓ Wrote {filepath}")
        
        return generated_files


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Pass 3: Generate story prose from D&D session scene summaries",
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
        "--pass2",
        type=str,
        help="Override Pass 2 input path (default: from config)"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Override output directory (default: from config)"
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
            print("Error: No sessions found", file=sys.stderr)
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
    pass2_path = (
        (repo_root / parsed_args.pass2) if parsed_args.pass2 
        else (repo_root / config["pass2"]["output"])
    )
    output_dir = (
        (repo_root / parsed_args.output) if parsed_args.output
        else (repo_root / config.get("pass3", {}).get("output", f"sessions/{session_num:02d}/story"))
    )
    model = (
        parsed_args.model if parsed_args.model
        else config.get("pass3", {}).get("model", "gpt-4o")
    )
    
    # Validate pass2 file
    if not pass2_path.exists():
        print(f"Error: Pass 2 file not found: {pass2_path}", file=sys.stderr)
        print(f"Have you run Pass 2 (summarize_scenes.py) yet?", file=sys.stderr)
        return 1
    
    print(f"Session: {session_num}")
    print(f"Config: sessions/{session_num:02d}/config.toml")
    print(f"Pass 2 input: {pass2_path}")
    print(f"Output directory: {output_dir}")
    print(f"Model: {model}")
    print()
    
    # Create generator and process
    try:
        # Extract pass3 config section
        pass3_config = config.get("pass3", {})
        generator = StoryGenerator(config=pass3_config)
        
        files = generator.process_summaries(
            pass2_path,
            output_dir,
            model=model,
        )
        
        print(f"\n✓ Successfully generated {len(files)} story chapter(s)")
        print(f"✓ Output saved to: {output_dir}")
        
        for f in files:
            print(f"  - {f.name}")
        
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
