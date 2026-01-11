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

try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib  # Fallback for older Python

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
        pass3 = self.config.get("pass3", {})
        width = int(pass3.get("chapter_number_width", 4))
        if width < 1:
            width = 4

        step = int(pass3.get("chapter_number_step", 10))
        if step < 1:
            step = 10

        start = int(pass3.get("chapter_number_start", step))
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

    def build_character_voice_section(self, pov_characters: List[str]) -> str:
        """
        Build a character voice block for the prompt.

        This is intentionally sourced from the player character narrative sheets to avoid
        config drift: `characters/player-characters/*.narrative.md` (section: "## Voice & Manner of Speaking").
        """

        pc_dir = REPO_ROOT / "characters" / "player-characters"
        if not pc_dir.exists():
            print(f"  ⚠ Character directory not found: {pc_dir}")
            return "(No character voice notes found.)"

        narrative_paths = sorted(pc_dir.glob("*.narrative.md"))
        if not narrative_paths:
            print(f"  ⚠ No narrative files found in {pc_dir}")
            return "(No character voice notes found.)"
        
        print(f"  📚 Found {len(narrative_paths)} character narrative file(s):")
        for path in narrative_paths:
            print(f"     - {path.name}")

        voice_by_token: dict[str, tuple[Path, str]] = {}

        def extract_heading_token(markdown: str) -> str:
            match = re.search(r"(?m)^#\s+(.+)$", markdown)
            if not match:
                return ""
            heading = match.group(1).strip()
            heading = heading.split("(", 1)[0].strip()
            token = (heading.split()[:1] or [""])[0].strip()
            return token

        def extract_voice_section(markdown: str) -> str:
            match = re.search(r"(?ms)^## Voice & Manner of Speaking\s*\n(.*?)(?=^## |\Z)", markdown)
            if not match:
                return ""
            return match.group(1).strip()

        for narrative_path in narrative_paths:
            try:
                pc_text = narrative_path.read_text(encoding="utf-8")
            except Exception:
                continue

            token = extract_heading_token(pc_text)
            if not token:
                continue

            voice_by_token.setdefault(token.lower(), (narrative_path, extract_voice_section(pc_text)))
        
        print(f"  🎭 Matching POV characters to voice files:")
        blocks: list[str] = []
        for char in pov_characters:
            char_name = str(char).strip()
            if not char_name:
                continue

            token = char_name.split()[0].lower()
            found = voice_by_token.get(token)
            if not found:
                print(f"     - {char_name}: ❌ No matching file found")
                blocks.append(
                    f"### {char_name}\n\n"
                    "Voice notes: (no narrative file found under `characters/player-characters/`.)"
                )
                continue

            narrative_path, voice = found
            print(f"     - {char_name}: ✓ Using {narrative_path.name}")
            try:
                rel_path = narrative_path.relative_to(REPO_ROOT).as_posix()
            except ValueError:
                rel_path = narrative_path.as_posix()

            voice_clean = (voice or "").strip()
            if not voice_clean or voice_clean.lstrip().lower().startswith("todo"):
                print(f"       └─ ⚠ Voice section is TODO/missing")
                blocks.append(
                    f"### {char_name} (source: `{rel_path}`)\n\n"
                    "Voice notes: (missing/TODO; keep voice grounded and avoid adding new quirks.)"
                )
                continue
            
            print(f"       └─ ✓ Voice section loaded ({len(voice_clean)} chars)")
            blocks.append(f"### {char_name} (source: `{rel_path}`)\n\n{voice_clean}")

        return "\n\n".join(blocks).strip() or "(No character voice notes found.)"
    
    def load_resource_files(self, resource_paths: set[str]) -> Dict[str, str]:
        """
        Load content from resource files (NPCs, locations, quests, etc.).
        
        Returns dict of {path: content} for all successfully loaded files.
        """
        loaded = {}
        for path in sorted(resource_paths):
            file_path = REPO_ROOT / path
            if file_path.exists():
                try:
                    content = file_path.read_text(encoding='utf-8')
                    # Truncate very long files to avoid token limits
                    if len(content) > 10000:
                        content = content[:10000] + "\n\n[... content truncated for length ...]"
                    loaded[path] = content
                except Exception as e:
                    print(f"    ⚠ Failed to read {path}: {e}")
            else:
                print(f"    ⚠ Resource not found: {path}")
        return loaded
    
    def load_upfront_context(self, config: Dict[str, Any]) -> Dict[str, str]:
        """
        Load upfront context files from config (files and folders).
        
        Returns dict of {path: content} for all loaded files.
        """
        context_config = config.get("context", {})
        context_files = context_config.get("files", [])
        context_folders = context_config.get("folders", [])
        
        loaded = {}
        
        # Load individual files
        for file_path in context_files:
            full_path = REPO_ROOT / file_path
            if full_path.exists():
                try:
                    content = full_path.read_text(encoding='utf-8')
                    if len(content) > 10000:
                        content = content[:10000] + "\n\n[... content truncated for length ...]"
                    loaded[file_path] = content
                except Exception as e:
                    print(f"    ⚠ Failed to read {file_path}: {e}")
        
        # Load all .md files from folders
        for folder_path in context_folders:
            full_folder = REPO_ROOT / folder_path
            if full_folder.exists() and full_folder.is_dir():
                for md_file in sorted(full_folder.glob("*.md")):
                    try:
                        rel_path = md_file.relative_to(REPO_ROOT).as_posix()
                        content = md_file.read_text(encoding='utf-8')
                        if len(content) > 10000:
                            content = content[:10000] + "\n\n[... content truncated for length ...]"
                        loaded[rel_path] = content
                    except Exception as e:
                        print(f"    ⚠ Failed to read {md_file.name}: {e}")
        
        return loaded
    
    def load_pass2_results(self, filepath: Path) -> Dict[str, Any]:
        """
        Load Pass 2 scene summaries from TOML directory format.
        
        The new format uses individual TOML files (S-*.toml) in a directory.
        Legacy JSON format is no longer supported.
        """
        if not filepath.exists():
            raise FileNotFoundError(f"Pass 2 path not found: {filepath}")
        
        if filepath.is_file():
            raise ValueError(
                f"Pass 2 JSON format is no longer supported. "
                f"Expected directory with TOML files, got file: {filepath}\n"
                f"Please use the TOML directory format (e.g., sessions/01/pass2/)"
            )
        
        if not filepath.is_dir():
            raise ValueError(f"Pass 2 path must be a directory: {filepath}")
        
        # TOML directory format
        print(f"  Using TOML directory format: {filepath.name}/")
        summaries = []
        toml_files = sorted(filepath.glob("S-*.toml"))
        
        if not toml_files:
            raise ValueError(f"No S-*.toml scene files found in {filepath}")
        
        print(f"  Loading {len(toml_files)} scene TOML file(s)...")
        for toml_file in toml_files:
            with open(toml_file, 'rb') as f:
                scene_data = tomllib.load(f)
                summaries.append(scene_data)
        
        # Load metadata if available
        metadata_file = filepath / "_metadata.toml"
        metadata = {}
        if metadata_file.exists():
            with open(metadata_file, 'rb') as f:
                metadata = tomllib.load(f).get("metadata", {})
            print(f"  ✓ Loaded metadata from _metadata.toml")
        
        return {
            "summaries": summaries,
            "metadata": metadata
        }
    
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
        pass3 = self.config.get("pass3", {})
        max_scenes = pass3.get("max_scenes_per_file", 5)
        
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
        threshold = pass3.get("time_jump_threshold_seconds", 3600)
        if time_gap_seconds > threshold:
            hours = time_gap_seconds / 3600
            return True, f"time jump: {hours:.1f} hours"
        
        # Check for narrative time jump phrases in scene outcome or factual summary
        prev_outcome = previous_scene.get("scene_outcome", "").lower()
        curr_summary = current_scene.get("factual_summary", "").lower()
        
        time_jump_phrases = pass3.get("time_jump_phrases", ["next day", "next morning", "the following day", "hours later", "long rest"])
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
        upfront_context: Optional[Dict[str, str]] = None,
        scene_resources: Optional[Dict[str, str]] = None,
    ) -> str:
        """Build the prompt for generating story prose from scene summaries."""
        
        # Format scene summaries
        scene_blocks = []
        for scene in scenes:
            scene_id = scene.get("scene_id", "Unknown")
            location = scene.get("location", "Unknown")
            
            # Main summaries
            factual = scene.get("factual_summary") or scene.get("summary", "")
            narrative = scene.get("narrative_seed") or scene.get("notes", "")
            
            time_of_day = scene.get("time_of_day", "unknown")
            goal = scene.get("goal", "unknown")
            conflict_type = scene.get("conflict_type", "unknown")
            
            # Key events
            key_events_list = scene.get("key_events", [])
            if isinstance(key_events_list, list):
                if key_events_list and isinstance(key_events_list[0], dict):
                    # TOML format: list of dicts with 'summary' and 'details'
                    key_events = "\n".join(f"  - {e.get('summary', '')}: {e.get('details', '')}" for e in key_events_list)
                else:
                    # Legacy format: list of strings
                    key_events = "\n".join(f"  - {e}" for e in key_events_list)
            else:
                key_events = ""
            
            # Character moments/beats
            char_moments = []
            character_moments = scene.get("character_moments") or scene.get("character_beats", {})
            if isinstance(character_moments, dict):
                for char, moment in character_moments.items():
                    char_moments.append(f"  - {char}: {moment}")
            char_moments_text = "\n".join(char_moments) if char_moments else "  (none)"
            
            # NPCs
            npcs = []
            npcs_list = scene.get("npcs_encountered") or scene.get("npcs") or scene.get("npcs_present", [])
            if isinstance(npcs_list, list):
                for npc in npcs_list:
                    if isinstance(npc, dict):
                        name = npc.get("name", "Unknown")
                        interaction = npc.get("interaction") or npc.get("role", "")
                        npcs.append(f"  - {name}: {interaction}")
                    else:
                        npcs.append(f"  - {npc}")
            npcs_text = "\n".join(npcs) if npcs else "  (none)"
            
            # Information gained
            info_list = scene.get("information_gained") or scene.get("information", [])
            info_lines = []
            if isinstance(info_list, list):
                for info in info_list:
                    if isinstance(info, dict):
                        summary = info.get("summary", "")
                        details = info.get("details", "")
                        info_lines.append(f"  - {summary}" + (f": {details}" if details else ""))
                    else:
                        info_lines.append(f"  - {info}")
            info_gained = "\n".join(info_lines) if info_lines else "  (none)"

            # Loot
            loot_list = scene.get("loot_and_items") or scene.get("loot", [])
            loot_lines = []
            if isinstance(loot_list, list):
                for item in loot_list:
                    if isinstance(item, dict):
                        name = item.get("name") or item.get("item") or "Unknown item"
                        details = item.get("details") or item.get("description") or item.get("context") or ""
                        loot_lines.append(f"  - {name}" + (f": {details}" if details else ""))
                    else:
                        loot_lines.append(f"  - {item}")
            loot_text = "\n".join(loot_lines) if loot_lines else "  (none)"
            
            # Atmosphere (new field in TOML)
            atmosphere = scene.get("atmosphere", {})
            if isinstance(atmosphere, dict):
                mood = atmosphere.get("mood", "")
                lighting = atmosphere.get("lighting", "")
                sounds = atmosphere.get("sounds", "")
                atmosphere_text = ""
                if mood:
                    atmosphere_text += f"\n**Mood:** {mood}"
                if lighting:
                    atmosphere_text += f"\n**Lighting:** {lighting}"
                if sounds:
                    atmosphere_text += f"\n**Sounds:** {sounds}"
            else:
                atmosphere_text = ""
            
            # Time and outcome
            time_passed = scene.get("time_passed", "unknown")
            scene_outcome = scene.get("scene_outcome") or scene.get("outcome", "unknown")
            
            # Location intelligence (new field)
            location_intel = scene.get("location_intelligence", {})
            loc_intel_text = ""
            if isinstance(location_intel, dict):
                known = location_intel.get("known_details", [])
                inferred = location_intel.get("inferred_details", [])
                if known or inferred:
                    loc_intel_text = "\n**Location Intelligence:**"
                    if known:
                        loc_intel_text += "\n  Known:\n" + "\n".join(f"    - {d}" for d in known)
                    if inferred:
                        loc_intel_text += "\n  Inferred:\n" + "\n".join(f"    - {d}" for d in inferred)
            
            # Plot threads (new field)
            plot_threads = scene.get("plot_threads", [])
            threads_text = ""
            if isinstance(plot_threads, list) and plot_threads:
                threads_text = "\n**Plot Threads:**"
                for thread in plot_threads:
                    if isinstance(thread, dict):
                        name = thread.get("thread", "")
                        status = thread.get("status", "")
                        threads_text += f"\n  - {name}: {status}"
            
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
{info_gained}

**Loot / Items:**
{loot_text}
{atmosphere_text}
{loc_intel_text}
{threads_text}

**Time Passed:** {time_passed}
**Scene Outcome:** {scene_outcome}
"""
            scene_blocks.append(scene_block)
        
        scenes_text = "\n---\n".join(scene_blocks)
        
        # Build POV list from config
        pass3 = self.config.get("pass3", {})
        pov_characters = pass3.get("pov_characters", ["Bazgar", "Sabriel", "Marwen"])
        if not isinstance(pov_characters, list) or not pov_characters:
            pov_characters = ["Bazgar", "Sabriel", "Marwen"]
        pov_characters = [str(c) for c in pov_characters]
        pov_list = ", ".join(pov_characters)

        character_voices_text = self.build_character_voice_section(pov_characters)

        extra_instructions = pass3.get("extra_instructions")
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

# World Context

The following files provide essential background about the world, factions, and campaign setting:

"""
        
        # Add upfront context
        if upfront_context:
            for path, content in upfront_context.items():
                filename = path.split('/')[-1]
                prompt += f"## {filename} ({path})\n\n```markdown\n{content}\n```\n\n"
        else:
            prompt += "(No upfront context files loaded)\n\n"
        
        prompt += """
# Scene-Specific Resources

The following files contain details about NPCs, locations, and quests referenced in these specific scenes:

"""
        
        # Add scene resources
        if scene_resources:
            for path, content in scene_resources.items():
                filename = path.split('/')[-1]
                prompt += f"## {filename} ({path})\n\n```markdown\n{content}\n```\n\n"
        else:
            prompt += "(No scene-specific resource files loaded)\n\n"
        
        prompt += f"""
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
            pass3 = self.config.get("pass3", {})
            temperature = pass3.get("temperature", 0.7)
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

    def estimate_costs(self, num_chapters: int, avg_scenes_per_chapter: float, model: str) -> dict:
        """Estimate API costs for the generation run."""
        # Rough token estimates (based on empirical testing)
        # Prompt per chapter: ~8000-12000 tokens (scene summaries + instructions)
        # Response per chapter: ~2000-4000 tokens (story prose)
        prompt_tokens_per_chapter = 10000  # Conservative estimate
        completion_tokens_per_chapter = 3000  # Conservative estimate
        
        # OpenAI pricing (as of 2024-2026, approximate)
        pricing = {
            "gpt-4o": {"input": 2.50 / 1_000_000, "output": 10.00 / 1_000_000},
            "gpt-4o-mini": {"input": 0.150 / 1_000_000, "output": 0.600 / 1_000_000},
            "gpt-5.2": {"input": 2.50 / 1_000_000, "output": 10.00 / 1_000_000},  # Estimate
        }
        
        model_pricing = pricing.get(model, pricing["gpt-4o"])  # Default to gpt-4o pricing
        
        total_prompt_tokens = num_chapters * prompt_tokens_per_chapter
        total_completion_tokens = num_chapters * completion_tokens_per_chapter
        
        input_cost = total_prompt_tokens * model_pricing["input"]
        output_cost = total_completion_tokens * model_pricing["output"]
        total_cost = input_cost + output_cost
        
        return {
            "num_chapters": num_chapters,
            "avg_scenes_per_chapter": avg_scenes_per_chapter,
            "estimated_prompt_tokens": total_prompt_tokens,
            "estimated_completion_tokens": total_completion_tokens,
            "estimated_input_cost": input_cost,
            "estimated_output_cost": output_cost,
            "estimated_total_cost": total_cost,
            "model": model,
        }

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
        
        # Load upfront context once at the beginning
        print(f"Loading upfront world context...")
        upfront_context = self.load_upfront_context(self.config)
        if upfront_context:
            print(f"  ✓ Loaded {len(upfront_context)} context file(s)")
            for path in sorted(upfront_context.keys()):
                print(f"     - {path}")
        else:
            print(f"  (No upfront context configured)")
        
        # Pre-calculate how many chapters we'll generate
        pass3 = self.config.get("pass3", {})
        max_scenes = pass3.get("max_scenes_per_file", 5)
        estimated_chapters = max(1, (len(summaries) + max_scenes - 1) // max_scenes)
        avg_scenes = len(summaries) / estimated_chapters
        
        # Show cost estimate
        cost_info = self.estimate_costs(estimated_chapters, avg_scenes, model)
        print(f"\n{'='*60}")
        print(f"GENERATION PLAN")
        print(f"{'='*60}")
        print(f"Scenes to process: {len(summaries)}")
        print(f"Estimated chapters: {estimated_chapters}")
        print(f"Avg scenes/chapter: {avg_scenes:.1f}")
        print(f"Model: {model}")
        print(f"\nESTIMATED COSTS:")
        print(f"  Input tokens:  ~{cost_info['estimated_prompt_tokens']:,}")
        print(f"  Output tokens: ~{cost_info['estimated_completion_tokens']:,}")
        print(f"  Input cost:    ${cost_info['estimated_input_cost']:.3f}")
        print(f"  Output cost:   ${cost_info['estimated_output_cost']:.3f}")
        print(f"  Total cost:    ${cost_info['estimated_total_cost']:.2f}")
        print(f"\nAPI calls: {estimated_chapters} (one per chapter)")
        print(f"Output: {output_dir}")
        print(f"{'='*60}\n")
        
        # Prompt for confirmation if cost is high
        if cost_info["estimated_total_cost"] > 5.0 and sys.stdin.isatty():
            try:
                response = input(f"Estimated cost is ${cost_info['estimated_total_cost']:.2f}. Continue? [y/N]: ")
                if response.lower() not in ["y", "yes"]:
                    print("Aborted by user.")
                    return []
            except (EOFError, KeyboardInterrupt):
                print("\nAborted by user.")
                return []
        
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
                chapter_num = len(generated_files) + 1
                print(f"\n{'='*60}")
                print(f"Chapter {chapter_num}/{estimated_chapters}: {next_chapter_number:0{width}d}")
                print(f"{'='*60}")
                print(f"  Scenes: {[s.get('scene_id') for s in current_file_scenes]}")
                print(f"  Reason for new file: {reason}")
                
                # Extract unique resource_refs from all scenes in this chapter
                all_resource_refs = set()
                for scene in current_file_scenes:
                    requested_resources = scene.get("requested_resources", [])
                    if isinstance(requested_resources, list):
                        for resource in requested_resources:
                            if isinstance(resource, dict):
                                path = resource.get("requested_path", "")
                                if path:
                                    all_resource_refs.add(path)
                
                # Check for missing resources and fail early
                missing_resources = []
                if all_resource_refs:
                    print(f"  📄 Resource refs for this chapter ({len(all_resource_refs)} unique):")
                    for ref in sorted(all_resource_refs):
                        ref_path = REPO_ROOT / ref
                        if ref_path.exists():
                            print(f"     ✓ {ref}")
                        else:
                            print(f"     ❌ {ref}")
                            missing_resources.append(ref)
                
                if missing_resources:
                    print(f"\n✗ ERROR: {len(missing_resources)} resource file(s) not found!")
                    print(f"These files are referenced in scenes but don't exist:")
                    for ref in missing_resources:
                        print(f"  - {ref}")
                    print(f"\nPlease update the Pass 2 scene files with correct paths or create the missing files.")
                    raise FileNotFoundError(f"{len(missing_resources)} resource file(s) missing")
                
                print(f"  Loading scene resources...")
                scene_resources = self.load_resource_files(all_resource_refs)
                if scene_resources:
                    print(f"  ✓ Loaded {len(scene_resources)} resource file(s)")
                
                print(f"  Building prompt with character voices and context...")
                
                suggested_title = self.suggest_chapter_title(current_file_scenes)
                prompt = self.build_story_prompt(
                    current_file_scenes,
                    is_book_start=is_book_start,
                    previous_file_ending=previous_file_ending,
                    suggested_title=suggested_title,
                    upfront_context=upfront_context,
                    scene_resources=scene_resources,
                )
                
                print(f"  Making API call... ", end='', flush=True)
                
                import time
                start_time = time.time()
                prose = self.generate_prose(prompt, model=model)
                elapsed = time.time() - start_time
                print(f"✓ ({elapsed:.1f}s)")

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
            chapter_num = len(generated_files) + 1
            print(f"\n{'='*60}")
            print(f"Chapter {chapter_num}/{estimated_chapters}: {next_chapter_number:0{width}d} (FINAL)")
            print(f"{'='*60}")
            print(f"  Scenes: {[s.get('scene_id') for s in current_file_scenes]}")
            
            # Extract unique resource_refs from all scenes in this chapter
            all_resource_refs = set()
            for scene in current_file_scenes:
                requested_resources = scene.get("requested_resources", [])
                if isinstance(requested_resources, list):
                    for resource in requested_resources:
                        if isinstance(resource, dict):
                            path = resource.get("requested_path", "")
                            if path:
                                all_resource_refs.add(path)
            
            # Check for missing resources and fail early
            missing_resources = []
            if all_resource_refs:
                print(f"  📄 Resource refs for this chapter ({len(all_resource_refs)} unique):")
                for ref in sorted(all_resource_refs):
                    ref_path = REPO_ROOT / ref
                    if ref_path.exists():
                        print(f"     ✓ {ref}")
                    else:
                        print(f"     ❌ {ref}")
                        missing_resources.append(ref)
            
            if missing_resources:
                print(f"\n✗ ERROR: {len(missing_resources)} resource file(s) not found!")
                print(f"These files are referenced in scenes but don't exist:")
                for ref in missing_resources:
                    print(f"  - {ref}")
                print(f"\nPlease update the Pass 2 scene files with correct paths or create the missing files.")
                raise FileNotFoundError(f"{len(missing_resources)} resource file(s) missing")
            
            print(f"  Loading scene resources...")
            scene_resources = self.load_resource_files(all_resource_refs)
            if scene_resources:
                print(f"  ✓ Loaded {len(scene_resources)} resource file(s)")
            
            print(f"  Building prompt with character voices and context...")
            
            suggested_title = self.suggest_chapter_title(current_file_scenes)
            prompt = self.build_story_prompt(
                current_file_scenes,
                is_book_start=is_book_start,
                previous_file_ending=previous_file_ending,
                suggested_title=suggested_title,
                upfront_context=upfront_context,
                scene_resources=scene_resources,
            )
            
            print(f"  Making API call... ", end='', flush=True)
            
            import time
            start_time = time.time()
            prose = self.generate_prose(prompt, model=model)
            elapsed = time.time() - start_time
            print(f"✓ ({elapsed:.1f}s)")

            title = self.extract_title_from_prose(prose) or suggested_title
            prose = self.ensure_title_heading(prose, title)
            slug = self.slugify_title(title)
            
            filename = f"{next_chapter_number:0{width}d}-{slug}.md"
            filepath = output_dir / filename
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(prose)
            
            generated_files.append(filepath)
            print(f"  ✓ Wrote {filepath}")
        
        print(f"\n{'='*60}")
        print(f"COMPLETE: Generated {len(generated_files)} chapter(s)")
        print(f"{'='*60}")
        
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
    # CRITICAL: output_dir MUST go to story/the-compass-edge (configured in pass3.output)
    # This is a git submodule used for publishing the final story output.
    # Do NOT change this without understanding the git submodule structure.
    output_dir = (
        (repo_root / parsed_args.output) if parsed_args.output
        else (repo_root / config.get("pass3", {}).get("output", f"sessions/{session_num:02d}/story"))
    )
    model = (
        parsed_args.model if parsed_args.model
        else config.get("pass3", {}).get("model", "gpt-4o")
    )
    
    # Validate pass2 directory
    if not pass2_path.exists():
        print(f"Error: Pass 2 directory not found: {pass2_path}", file=sys.stderr)
        print(f"Expected directory with TOML files (e.g., sessions/01/pass2/)", file=sys.stderr)
        print(f"Have you run Pass 2 (summarize_scenes.py) yet?", file=sys.stderr)
        return 1
    
    if not pass2_path.is_dir():
        print(f"Error: Pass 2 path must be a directory with TOML files: {pass2_path}", file=sys.stderr)
        print(f"JSON format is no longer supported.", file=sys.stderr)
        return 1
    
    print(f"Session: {session_num}")
    print(f"Config: sessions/{session_num:02d}/config.toml")
    print(f"Pass 2 input: {pass2_path}")
    print(f"Output directory: {output_dir}")
    print(f"Model: {model}")
    
    # Show what context files will be loaded
    print(f"\n{'='*60}")
    print(f"CONTEXT FILES")
    print(f"{'='*60}")
    
    # Check if Pass 2 is directory with TOML files
    if pass2_path.is_dir():
        print(f"Pass 2 format: TOML directory")
        toml_files = sorted(pass2_path.glob("S-*.toml"))
        print(f"  - {len(toml_files)} scene file(s) in {pass2_path.name}/")
        if pass2_path.joinpath("_metadata.toml").exists():
            print(f"  - Metadata: _metadata.toml")
    else:
        print(f"⚠ Pass 2 path is not a directory: {pass2_path}")
    
    # Show character voice context (from pass3 config)
    pass3_config = config.get("pass3", {})
    pov_chars = pass3_config.get("pov_characters", ["Bazgar", "Sabriel", "Marwen"])
    print(f"\nCharacter voices (from POV list: {pov_chars}):")
    pc_dir = REPO_ROOT / "characters" / "player-characters"
    if pc_dir.exists():
        narrative_files = sorted(pc_dir.glob("*.narrative.md"))
        print(f"  Available files: {len(narrative_files)} narrative file(s) in characters/player-characters/")
        
        # Show which POV characters will match to which files
        def extract_heading_token(markdown: str) -> str:
            match = re.search(r"(?m)^#\s+(.+)$", markdown)
            if not match:
                return ""
            heading = match.group(1).strip()
            heading = heading.split("(", 1)[0].strip()
            token = (heading.split()[:1] or [""])[0].strip()
            return token
        
        voice_by_token = {}
        for narrative_path in narrative_files:
            try:
                pc_text = narrative_path.read_text(encoding="utf-8")
                token = extract_heading_token(pc_text)
                if token:
                    voice_by_token[token.lower()] = narrative_path
            except Exception:
                continue
        
        print(f"  Character matching:")
        for char in pov_chars:
            char_name = str(char).strip()
            if not char_name:
                continue
            token = char_name.split()[0].lower()
            found = voice_by_token.get(token)
            if found:
                print(f"    ✓ {char_name} → {found.name}")
            else:
                print(f"    ❌ {char_name} (no matching file)")
    else:
        print(f"  ⚠ No character directory found at {pc_dir}")
    
    # Show upfront context files from config
    context_config = config.get("context", {})
    context_files = context_config.get("files", [])
    context_folders = context_config.get("folders", [])
    
    if context_files or context_folders:
        print(f"\nUpfront context (loaded for all chapters):")
        if context_files:
            print(f"  Files:")
            for cf in context_files:
                cf_path = REPO_ROOT / cf
                exists_marker = "✓" if cf_path.exists() else "⚠"
                print(f"    {exists_marker} {cf}")
        if context_folders:
            print(f"  Folders:")
            for folder in context_folders:
                folder_path = REPO_ROOT / folder
                if folder_path.exists():
                    md_files = list(folder_path.glob("*.md"))
                    print(f"    ✓ {folder}/ ({len(md_files)} .md file(s))")
                else:
                    print(f"    ⚠ {folder}/ (not found)")
    
    print(f"{'='*60}")
    print()
    
    # Create generator and process
    try:
        # Pass the full config (not just pass3 section) so context loading works
        generator = StoryGenerator(config=config)
        
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
