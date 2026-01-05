#!/usr/bin/env python3
"""
Generate party timeline events from Pass 2 summaries.

Takes Pass 2 output (scene summaries) and generates high-level daily events
for the party timeline at world/party/{party_name}/_history.tsv.

After building the timeline, advances the current date in world/_history.config.toml
and inserts month-change events with weather transitions as needed.

Tags are dynamically validated against:
- scripts/timeline_svg/assets/tags (available timeline tags)
- world/factions (faction folder names)

Supports optional LLM enhancement for better summaries.
"""

import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not required, will use system env vars

try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib  # Fallback for Python 3.10

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


# Month names and characteristics
MONTHS = [
    {"num": 1, "name": "Arumel", "season": "First Thaw (early spring)", "weather": "cold rain, melting snow, mud"},
    {"num": 2, "name": "Veleara", "season": "Green Rise (spring)", "weather": "warming days, frequent rain, budding life"},
    {"num": 3, "name": "Lumaeos", "season": "Brightening (late spring)", "weather": "clear skies, gentle winds, flowers blooming"},
    {"num": 4, "name": "Thaeorum", "season": "High Sun (early summer)", "weather": "hot days, warm nights, dry air"},
    {"num": 5, "name": "Aoruvan", "season": "Harvest Flame (midsummer)", "weather": "scorching heat, dust storms, harvest preparations"},
    {"num": 6, "name": "Voraela", "season": "Long Light (late summer)", "weather": "lingering warmth, golden evenings, harvest season"},
    {"num": 7, "name": "Ulemar", "season": "First Chill (early autumn)", "weather": "crisp mornings, falling leaves, cooler winds"},
    {"num": 8, "name": "Saraenos", "season": "Reaping (autumn)", "weather": "harvest completion, fog, shortening days"},
    {"num": 9, "name": "Ithraeum", "season": "Falling Dark (late autumn)", "weather": "cold winds, bare trees, early frosts"},
    {"num": 10, "name": "Arethum", "season": "Frost Lock (early winter)", "weather": "freezing temperatures, ice forming, first snows"},
    {"num": 11, "name": "Morvalos", "season": "Deep Cold (midwinter)", "weather": "heavy snows, bitter cold, long nights"},
    {"num": 12, "name": "Aneumos", "season": "Year's End (late winter)", "weather": "thawing begins, last snows, hope returns"},
]


def get_month_info(month_num: int) -> dict:
    """Get month information by number (1-12)."""
    return MONTHS[month_num - 1]


def load_available_tags(repo_root: Path) -> set[str]:
    """
    Load available tags from scripts/timeline_svg/assets/tags directory.
    Returns set of valid tag names (without .svg extension).
    """
    tags_dir = repo_root / "scripts" / "timeline_svg" / "assets" / "tags"
    if not tags_dir.exists():
        return set()
    
    tags = set()
    for file in tags_dir.iterdir():
        if file.suffix == ".svg":
            tags.add(file.stem)
    
    # Also read from tags.toml if available
    tags_toml = tags_dir / "tags.toml"
    if tags_toml.exists():
        with open(tags_toml, "rb") as f:
            toml_data = tomllib.load(f)
            if "tags" in toml_data:
                tags.update(toml_data["tags"].keys())
    
    return tags


def load_available_factions(repo_root: Path) -> set[str]:
    """
    Load available faction slugs from world/factions directory.
    Returns set of valid faction folder names.
    """
    factions_dir = repo_root / "world" / "factions"
    if not factions_dir.exists():
        return set()
    
    factions = set()
    for item in factions_dir.iterdir():
        if item.is_dir() and not item.name.startswith("."):
            factions.add(item.name)
    
    return factions


def add_days_in_world(year: int, month: int, day: int, days_to_add: int) -> tuple[int, int, int]:
    """
    Add days to a date in the in-world calendar (360 days/year, 12 months x 30 days).
    Returns (new_year, new_month, new_day).
    """
    total_days = (year * 360) + ((month - 1) * 30) + day + days_to_add
    
    new_year = (total_days - 1) // 360
    remaining_days = (total_days - 1) % 360
    new_month = (remaining_days // 30) + 1
    new_day = (remaining_days % 30) + 1
    
    return (new_year, new_month, new_day)


def load_world_present_date(world_config_path: Path) -> tuple[int, int, int]:
    """
    Load the world's current date from `world/_history.config.toml`.

    Supports either:
    - `present_date = "YYYY/MM/DD"` (legacy/alternate)
    - `present_year`, `present_month`, `present_day` (current convention)
    """
    with open(world_config_path, "rb") as f:
        world_config = tomllib.load(f)

    present_date = str(world_config.get("present_date") or "").strip()
    if present_date:
        parts = present_date.split("/")
        if len(parts) != 3:
            raise ValueError(f"Invalid present_date in {world_config_path}: {present_date!r} (expected YYYY/MM/DD)")
        return (int(parts[0]), int(parts[1]), int(parts[2]))

    year = int(world_config.get("present_year", 0) or 0)
    month = int(world_config.get("present_month", 1) or 1)
    day = int(world_config.get("present_day", 1) or 1)
    if year <= 0:
        raise ValueError(f"Missing/invalid present_year in {world_config_path}")
    return (year, month, day)


def find_next_event_counter(output_path: Path, event_prefix: str) -> int:
    """Return the next numeric counter for `{event_prefix}-NNN` event ids in an existing TSV."""
    if not output_path.exists():
        return 1

    pattern = re.compile(rf"^{re.escape(event_prefix)}-(\d+)$")
    best = 0
    with output_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            event_id = (row.get("event_id") or "").strip()
            m = pattern.match(event_id)
            if not m:
                continue
            try:
                best = max(best, int(m.group(1)))
            except ValueError:
                continue
    return best + 1


def group_scenes_by_day(summaries: list[dict], config: dict) -> dict:
    """
    Group scenes into days based on time_of_day progression and indicators.
    Returns dict of {day_1: [scenes], day_2: [scenes], ...}
    """
    days = {}
    current_day = 1
    current_day_scenes = []
    last_time = None
    
    new_day_indicators = config.get("new_day_indicators", [
        "next day",
        "next morning",
        "following day",
        "long rest",
    ])
    
    for scene in summaries:
        time_of_day = scene.get("time_of_day", "").lower()
        notes = scene.get("notes", "").lower()
        outcome = scene.get("scene_outcome", "").lower()
        
        # Detect day boundary
        day_changed = False
        
        # Check for explicit indicators
        combined_text = f"{notes} {outcome}"
        for indicator in new_day_indicators:
            if indicator.lower() in combined_text:
                day_changed = True
                break
        
        # Check for time wrapping (e.g., night → morning)
        if last_time and not day_changed:
            if "morning" in time_of_day and ("night" in last_time or "evening" in last_time):
                day_changed = True
        
        if day_changed and current_day_scenes:
            days[f"day_{current_day}"] = current_day_scenes
            current_day += 1
            current_day_scenes = []
        
        current_day_scenes.append(scene)
        last_time = time_of_day
    
    # Add final day
    if current_day_scenes:
        days[f"day_{current_day}"] = current_day_scenes
    
    return days


def summarize_day_events(day_scenes: list[dict], day_num: int, config: dict, use_llm: bool = False) -> list[dict]:
    """
    Create high-level event summaries for a single day.
    Max 3 events per day, groups related scenes into narrative beats.
    
    If use_llm=True and model is configured, uses LLM to generate better summaries.
    """
    max_events = config.get("max_events_per_day", 3)
    
    # Identify major story beats
    beats = []
    current_beat = []
    current_location = None
    current_goal = None
    
    for scene in day_scenes:
        location = scene.get("location", "").split(",")[0].strip()
        goal = scene.get("goal", "")
        conflict = scene.get("conflict_type", "")
        
        # Start new beat if location/goal shifts significantly
        if current_beat and (
            (conflict == "combat" and scene.get("conflict_type") != "combat") or
            (not any(word in goal.lower() for word in ["return", "report", "collect"]) 
             and current_goal and goal != current_goal and 
             not location.startswith(current_location.split()[0] if current_location else ""))
        ):
            beats.append(current_beat)
            current_beat = [scene]
            current_location = location
            current_goal = goal
        else:
            current_beat.append(scene)
            if not current_location:
                current_location = location
            if not current_goal:
                current_goal = goal
    
    if current_beat:
        beats.append(current_beat)
    
    def beat_score(beat: list[dict]) -> int:
        score = 0
        has_combat = any(s.get("conflict_type") == "combat" for s in beat)
        has_quest = any("quest" in str(s.get("plot_threads", [])).lower() for s in beat)
        has_important_npc = any(len(s.get("npcs_present", [])) > 0 for s in beat)
        has_loot = any(len(s.get("loot_and_items", [])) > 0 for s in beat)

        if has_combat:
            score += 10
        if has_quest:
            score += 6
        if has_important_npc:
            score += 3
        if has_loot:
            score += 2
        return score

    # If we have too many beats, merge the least important beat into an adjacent beat.
    # This preserves chronological order while still enforcing max_events_per_day.
    while len(beats) > max_events and len(beats) >= 2:
        scores = [beat_score(b) for b in beats]
        i_min = min(range(len(scores)), key=lambda i: (scores[i], i))
        if i_min == 0:
            beats[1] = beats[0] + beats[1]
            del beats[0]
        elif i_min == len(beats) - 1:
            beats[-2] = beats[-2] + beats[-1]
            del beats[-1]
        else:
            # Prefer merging into the neighbor with the higher score (keeps important beats intact).
            left_score = scores[i_min - 1]
            right_score = scores[i_min + 1]
            if right_score >= left_score:
                beats[i_min + 1] = beats[i_min] + beats[i_min + 1]
                del beats[i_min]
            else:
                beats[i_min - 1] = beats[i_min - 1] + beats[i_min]
                del beats[i_min]
    
    top_beats = beats
    
    # Generate events from beats
    events = []
    for beat in top_beats:
        # Use LLM for both title and summary if enabled, otherwise use algorithmic
        if use_llm:
            event_title, event_summary = generate_llm_title_and_summary_from_beat(beat, config)
        else:
            event_title = generate_event_title_from_beat(beat)
            event_summary = generate_event_summary_from_beat(beat)
        
        events.append({
            "title": event_title,
            "summary": event_summary,
            "scenes": [s.get("scene_id") for s in beat],
        })
    
    return events


def _time_of_day_to_hour(value: str) -> int:
    raw = (value or "").strip().lower()
    if "dawn" in raw or "early" in raw:
        return 6
    if "morning" in raw:
        return 9
    if "midday" in raw or "noon" in raw:
        return 12
    if "afternoon" in raw:
        return 15
    if "evening" in raw:
        return 19
    if "night" in raw or "midnight" in raw:
        return 22
    return 12


def assign_hours_for_day(events: list[dict], day_scenes: list[dict]) -> list[int]:
    """
    Assign an in-world hour (0-23) for each event so events flow forward in time within a day.

    If time is unclear, space events a few hours apart (same day). If we run out of day, clamp to 23.
    """
    scene_by_id = {s.get("scene_id"): s for s in day_scenes}
    hours: list[int] = []
    prev = -1
    for event in events:
        scene_ids = event.get("scenes") or []
        tod = ""
        for sid in scene_ids:
            sc = scene_by_id.get(sid)
            if not sc:
                continue
            tod = (sc.get("time_of_day") or "").strip()
            if tod:
                break
        hour = _time_of_day_to_hour(tod)
        # Ensure monotonic forward time.
        if prev >= 0:
            hour = max(hour, prev + 2)  # "a few hours after the previous event"
        hour = min(hour, 23)
        if prev >= 0 and hour < prev:
            hour = prev
        hours.append(hour)
        prev = hour
    return hours


def generate_event_title_from_beat(scenes: list[dict]) -> str:
    """Generate a concise, narrative-focused title from a beat."""
    if not scenes:
        return "Unknown Event"
    
    first_scene = scenes[0]
    last_scene = scenes[-1]
    
    primary_location = first_scene.get("location", "").split(",")[0].strip()
    goal = first_scene.get("goal", "")
    conflict = first_scene.get("conflict_type", "")
    outcome = last_scene.get("scene_outcome", "")
    
    quest_completed = any("completed" in s.get("scene_outcome", "").lower() for s in scenes)
    has_combat = any(s.get("conflict_type") == "combat" for s in scenes)
    
    # Extract quest/goal keywords
    if "undead" in goal.lower() or "undead" in primary_location.lower():
        if quest_completed:
            return "Stopped the Undead Threat"
        elif has_combat:
            return "Battle Against the Undead"
        else:
            return "Investigating Undead Sightings"
    
    elif "goblin" in goal.lower() or "goblin" in primary_location.lower():
        if quest_completed:
            return "Resolved the Goblin Raids"
        elif has_combat:
            return "Combat with Goblins"
        else:
            return "Negotiating with Goblins"
    
    elif "spider" in goal.lower() or "spider" in primary_location.lower():
        if quest_completed:
            return "Cleared the Spider Infestation"
        elif has_combat:
            return "Battle with Giant Spiders"
        else:
            return "Investigating Spider Lair"
    
    elif "imperium" in outcome.lower() or "trader" in outcome.lower():
        return "Confrontation with Imperium Traders"
    
    # Generic fallback
    if has_combat:
        return f"Combat at {primary_location}"
    elif "social" in conflict:
        return f"Meeting at {primary_location}"
    elif "exploration" in conflict:
        return f"Exploration of {primary_location}"
    else:
        return f"Activity at {primary_location}"


def generate_event_summary_from_beat(scenes: list[dict]) -> str:
    """Generate a high-level summary from a beat of related scenes (algorithmic fallback)."""
    if not scenes:
        return "No details available."
    
    # Find scene with most conclusive outcome
    best_scene = scenes[-1]
    best_score = 0
    
    completion_words = ["completed", "received", "payment", "resolved", "concluded", "succeeded", "finished"]
    
    for scene in scenes:
        outcome = scene.get("scene_outcome", "")
        score = 0
        outcome_lower = outcome.lower()
        
        for word in completion_words:
            if word in outcome_lower:
                score += 2
        
        if len(outcome) > 100:
            score += 1
        
        if score > best_score:
            best_score = score
            best_scene = scene
    
    outcome = best_scene.get("scene_outcome", "")
    
    if outcome:
        summary = outcome.split("(transition")[0].strip()
        summary = summary.split("transition to")[0].strip()
        
        if len(summary) > 300:
            sentences = summary[:300].split(". ")
            if len(sentences) > 1:
                summary = ". ".join(sentences[:-1]) + "."
            else:
                summary = summary[:297] + "..."
        
        return summary
    
    # Fallback
    key_events = scenes[0].get("key_events", [])
    if key_events:
        summary = " ".join(key_events[:2])
        if len(summary) > 300:
            summary = summary[:297] + "..."
        return summary
    
    return scenes[0].get("factual_summary", "Event occurred.")[:300]


def generate_llm_summary_from_beat(scenes: list[dict], title: str, config: dict) -> str:
    """
    Use LLM to generate a concise timeline summary from a beat of scenes.
    This creates better, more cohesive summaries than algorithmic extraction.
    """
    if not OPENAI_AVAILABLE:
        print("  ⚠️  OpenAI not available, falling back to algorithmic summary")
        return generate_event_summary_from_beat(scenes)
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("  ⚠️  OPENAI_API_KEY not set, falling back to algorithmic summary")
        return generate_event_summary_from_beat(scenes)
    
    # Prepare scene data for LLM
    scene_summaries = []
    for scene in scenes:
        summary_text = f"- {scene.get('notes', '')}"
        if scene.get("scene_outcome"):
            summary_text += f" → {scene.get('scene_outcome', '')}"
        scene_summaries.append(summary_text)
    
    scenes_text = "\n".join(scene_summaries)
    
    prompt = f"""You are creating a timeline entry for a D&D campaign history. 

EVENT TITLE: {title}

SCENE DETAILS:
{scenes_text}

Write a concise 1-2 sentence summary (max 250 characters) suitable for a timeline. Focus on:
- What happened (outcomes, not processes)
- Key NPCs or locations involved
- Quest/objective completion if applicable

Write in past tense, third person. Be factual and concise - this is a historical record, not narrative prose.

SUMMARY:"""
    
    try:
        client = OpenAI(api_key=api_key)
        model = config.get("model", "gpt-4o-mini")
        temperature = config.get("temperature", 0.3)
        
        response = client.chat.completions.create(
            model=model,
            temperature=temperature,
            messages=[
                {"role": "system", "content": "You are a precise historical chronicler creating timeline entries."},
                {"role": "user", "content": prompt}
            ]
        )
        
        summary = response.choices[0].message.content.strip()
        
        # Enforce length limit
        if len(summary) > 300:
            sentences = summary[:300].split(". ")
            if len(sentences) > 1:
                summary = ". ".join(sentences[:-1]) + "."
            else:
                summary = summary[:297] + "..."
        
        return summary
        
    except Exception as e:
        print(f"  ⚠️  LLM error: {e}, falling back to algorithmic summary")
        return generate_event_summary_from_beat(scenes)


def generate_llm_title_and_summary_from_beat(scenes: list[dict], config: dict) -> tuple[str, str]:
    """
    Use LLM to generate both title and summary from a beat of scenes.
    This ensures they match and accurately reflect what actually happened.
    """
    if not OPENAI_AVAILABLE:
        print("  ⚠️  OpenAI not available, falling back to algorithmic")
        return (generate_event_title_from_beat(scenes), generate_event_summary_from_beat(scenes))
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("  ⚠️  OPENAI_API_KEY not set, falling back to algorithmic")
        return (generate_event_title_from_beat(scenes), generate_event_summary_from_beat(scenes))
    
    # Prepare scene data for LLM
    scene_summaries = []
    for scene in scenes:
        summary_text = f"- {scene.get('notes', '')}"
        if scene.get("scene_outcome"):
            summary_text += f" → {scene.get('scene_outcome', '')}"
        scene_summaries.append(summary_text)
    
    scenes_text = "\n".join(scene_summaries)
    
    prompt = f"""You are creating a timeline entry for a D&D campaign history. 

SCENE DETAILS:
{scenes_text}

Generate a timeline event with:
1. TITLE: 3-7 words capturing the main action/event (e.g., "Battle with Giant Spiders", "Meeting at Ardenford", "Goblin Raid Resolution")
2. SUMMARY: 1-2 sentences (max 250 characters) with key outcomes

Focus on what ACTUALLY HAPPENED in these scenes, not what was discussed or planned for later.

Write in past tense, third person. Be factual and concise - this is a historical record.

Format your response as:
TITLE: [title here]
SUMMARY: [summary here]"""
    
    try:
        client = OpenAI(api_key=api_key)
        model = config.get("model", "gpt-4o-mini")
        temperature = config.get("temperature", 0.3)
        
        response = client.chat.completions.create(
            model=model,
            temperature=temperature,
            messages=[
                {"role": "system", "content": "You are a precise historical chronicler creating timeline entries."},
                {"role": "user", "content": prompt}
            ]
        )
        
        content = response.choices[0].message.content.strip()
        
        # Parse response
        title = ""
        summary = ""
        
        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("TITLE:"):
                title = line.replace("TITLE:", "").strip()
            elif line.startswith("SUMMARY:"):
                summary = line.replace("SUMMARY:", "").strip()
        
        # Fallback if parsing failed
        if not title or not summary:
            print("  ⚠️  Failed to parse LLM response, falling back to algorithmic")
            return (generate_event_title_from_beat(scenes), generate_event_summary_from_beat(scenes))
        
        # Enforce length limits
        if len(summary) > 300:
            sentences = summary[:300].split(". ")
            if len(sentences) > 1:
                summary = ". ".join(sentences[:-1]) + "."
            else:
                summary = summary[:297] + "..."
        
        return (title, summary)
        
    except Exception as e:
        print(f"  ⚠️  LLM error: {e}, falling back to algorithmic")
        return (generate_event_title_from_beat(scenes), generate_event_summary_from_beat(scenes))


def generate_event_tags(
    title: str,
    summary: str,
    config: dict,
    available_tags: set[str],
    available_factions: set[str]
) -> str:
    """
    Generate tags for an event.

    Always includes:
    - `party`
    - the party slug from config (`party_name`) so view filters can target a party even if no icon exists.
    """
    tags: set[str] = set()

    tags.add("party")
    party_slug = str(config.get("party_name") or "").strip()
    if party_slug:
        tags.add(party_slug)

    # Detect content-based tags
    text = (title + " " + summary).lower()
    
    # Combat/battle
    if any(word in text for word in ["battle", "combat", "fight", "attacked", "defeated"]):
        if "battle" in available_tags:
            tags.add("battle")
    
    # Quest-related
    if any(word in text for word in ["quest", "mission", "completed", "resolved"]):
        if "lore" in available_tags:
            tags.add("lore")
    
    # Social/diplomatic
    if any(word in text for word in ["meeting", "negotiation", "diplomacy", "talked", "discussed"]):
        if "diplomacy" in available_tags:
            tags.add("diplomacy")
    
    # Exploration
    if any(word in text for word in ["explored", "discovered", "investigation", "searching"]):
        if "location" in available_tags:
            tags.add("location")
    
    # Check for faction mentions
    for faction in available_factions:
        if faction.lower() in text:
            tags.add(faction)
    
    # Filter to only valid tags/factions
    required = [t for t in ("party", party_slug) if t]
    rest = sorted(t for t in tags if t not in set(required))
    return ";".join(required + rest)


def write_timeline_events(
    events_by_day: dict,
    start_date: tuple[int, int, int],
    party_name: str,
    event_prefix: str,
    timeline_config: dict,
    output_path: Path,
    clear_existing: bool,
    available_tags: set[str],
    available_factions: set[str]
) -> tuple[int, int, int]:
    """
    Write events to timeline TSV file.
    Returns the final date (year, month, day).
    """
    year, month, day = start_date
    current_month = month
    
    # Prepare output
    if clear_existing and output_path.exists():
        output_path.unlink()

    # Create header if new file
    if not output_path.exists():
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("event_id\ttags\tdate\tduration\ttitle\tsummary\n")

    event_counter = 1 if clear_existing else find_next_event_counter(output_path, event_prefix)
    
    with open(output_path, "a", encoding="utf-8") as f:
        for day_num in sorted(events_by_day.keys()):
            day_payload = events_by_day[day_num]
            day_events = day_payload["events"]
            day_scenes = day_payload["scenes"]
            day_hours = assign_hours_for_day(day_events, day_scenes)
            
            # Check for month change
            if month != current_month:
                month_info = get_month_info(month)
                month_event_id = f"{event_prefix}-month-{year:04d}-{month:02d}"
                month_tags_set = {"party", party_name}
                if "world" in available_tags:
                    month_tags_set.add("world")
                month_tags = ";".join(t for t in ("party", party_name, "world") if t in month_tags_set)
                month_title = f"Month of {month_info['name']} Begins"
                month_summary = f"{month_info['season']}: {month_info['weather']}"
                
                f.write(f"{month_event_id}\t{month_tags}\t{year}/{month:02d}/01\t0\t{month_title}\t{month_summary}\n")
                current_month = month
            
            # Write day's events
            for event, hour in zip(day_events, day_hours):
                event_id = f"{event_prefix}-{event_counter:03d}"
                tags = generate_event_tags(
                    event["title"],
                    event["summary"],
                    timeline_config,
                    available_tags,
                    available_factions
                )
                date_str = f"{year}/{month:02d}/{day:02d}-{hour:02d}"
                title = event["title"]
                summary = event["summary"]
                
                f.write(f"{event_id}\t{tags}\t{date_str}\t0\t{title}\t{summary}\n")
                event_counter += 1
            
            # Advance to next day
            if day_num < max(events_by_day.keys()):
                year, month, day = add_days_in_world(year, month, day, 1)
    
    return (year, month, day)


def update_world_date(config_path: Path, final_date: tuple[int, int, int]):
    """Update `present_year`/`present_month`/`present_day` in `world/_history.config.toml`."""
    year, month, day = final_date
    content = config_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    def _replace_scalar(key: str, value: str) -> bool:
        for idx, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith(f"{key} " ) or stripped.startswith(f"{key}="):
                lines[idx] = f"{key} = {value}"
                return True
        return False

    updated = False
    updated |= _replace_scalar("present_year", str(year))
    updated |= _replace_scalar("present_month", str(month))
    updated |= _replace_scalar("present_day", str(day))

    if not updated:
        # Fallback: support alternate configs that use `present_date = "YYYY/MM/DD"`.
        new_date = f"{year}/{month:02d}/{day:02d}"
        for idx, line in enumerate(lines):
            if line.strip().startswith("present_date"):
                lines[idx] = f'present_date = "{new_date}"'
                updated = True
                break

    config_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✓ Updated world date to: {year}/{month:02d}/{day:02d}")


def main():
    parser = argparse.ArgumentParser(description="Generate party timeline from Pass 2 summaries")
    parser.add_argument("--session", type=int, required=True, help="Session number")
    parser.add_argument("--clear", action="store_true", help="Clear existing timeline before writing")
    parser.add_argument("--start-date", help="Override start date (YYYY/MM/DD)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be generated without writing")
    
    args = parser.parse_args()
    
    # Find repository root
    repo_root = Path(__file__).parent.parent.parent
    
    # Load session config
    session_dir = repo_root / "sessions" / f"{args.session:02d}"
    config_path = session_dir / "config.toml"
    
    if not config_path.exists():
        print(f"Error: Config not found at {config_path}")
        return 1
    
    with open(config_path, "rb") as f:
        config = tomllib.load(f)
    
    timeline_config = config.get("timeline", {})
    party_name = timeline_config.get("party_name", "unknown-party")
    event_prefix = timeline_config.get("event_id_prefix", "party")
    
    # Load Pass 2 output
    pass2_path = session_dir / "pass2.json"
    if not pass2_path.exists():
        print(f"Error: Pass 2 output not found at {pass2_path}")
        print("Run Pass 2 first: python scripts/story_craft/summarize_scenes.py --session N")
        return 1
    
    print(f"Loading session {args.session} data...")
    with open(pass2_path) as f:
        pass2_data = json.load(f)
    
    summaries = pass2_data.get("summaries", [])
    if not summaries:
        print("No summaries found in Pass 2 output")
        return 1
    
    # Load available tags and factions
    print("Loading available tags and factions...")
    available_tags = load_available_tags(repo_root)
    available_factions = load_available_factions(repo_root)
    print(f"  Found {len(available_tags)} valid tags")
    print(f"  Found {len(available_factions)} valid factions")
    
    # Determine start date
    if args.start_date:
        parts = args.start_date.split("/")
        start_date = (int(parts[0]), int(parts[1]), int(parts[2]))
        print(f"Using override start date: {args.start_date}")
    else:
        world_config_path = repo_root / "world" / "_history.config.toml"
        start_date = load_world_present_date(world_config_path)
        print(f"Using world present date: {start_date[0]}/{start_date[1]:02d}/{start_date[2]:02d}")
    
    print(f"Found {len(summaries)} scenes to process")
    
    # Group by day
    print("\nGrouping scenes by day...")
    days = group_scenes_by_day(summaries, timeline_config)
    print(f"Identified {len(days)} days of activity")
    
    # Check if LLM should be used
    use_llm = bool(timeline_config.get("model"))
    if use_llm:
        if not OPENAI_AVAILABLE:
            print("⚠️  OpenAI not installed. Install with: pip install openai")
            print("Falling back to algorithmic summaries")
            use_llm = False
        elif not os.getenv("OPENAI_API_KEY"):
            print("⚠️  OPENAI_API_KEY not set")
            print("Falling back to algorithmic summaries")
            use_llm = False
        else:
            model = timeline_config.get("model")
            print(f"Using LLM for summaries: {model}")
    else:
        print("Using algorithmic summaries (no model specified in config)")
    
    print("\nGenerating daily events...")
    events_by_day = {}
    
    for day_key in sorted(days.keys(), key=lambda x: int(x.split("_")[1])):
        day_num = int(day_key.split("_")[1])
        day_scenes = days[day_key]
        
        print(f"  Day {day_num}: {len(day_scenes)} scenes")
        day_events = summarize_day_events(day_scenes, day_num, timeline_config, use_llm=use_llm)
        events_by_day[day_num] = {"events": day_events, "scenes": day_scenes}
        
        for event in day_events:
            print(f"    - {event['title']}")
    
    # Calculate final date
    num_days = len(events_by_day)
    final_date = add_days_in_world(*start_date, num_days - 1)
    print(f"\nFinal date: {final_date[0]}/{final_date[1]:02d}/{final_date[2]:02d}")
    
    total_events = sum(len(payload["events"]) for payload in events_by_day.values())
    print(f"Generated {total_events} total events across {num_days} days")
    
    if args.dry_run:
        print("\n[DRY RUN] Would write events but --dry-run specified")
        return 0
    
    # Write timeline
    output_path = repo_root / "world" / "party" / party_name / "_history.tsv"
    write_timeline_events(
        events_by_day,
        start_date,
        party_name,
        event_prefix,
        timeline_config,
        output_path,
        args.clear,
        available_tags,
        available_factions
    )
    print(f"✓ Wrote {total_events} events to {output_path}")
    
    # Update world date
    world_config_path = repo_root / "world" / "_history.config.toml"
    update_world_date(world_config_path, final_date)
    
    print("\n✓ Timeline generation complete!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
