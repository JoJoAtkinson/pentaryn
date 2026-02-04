"""File utilities for reading/writing JSONL and managing paths."""

import json
from pathlib import Path
from typing import List, Dict, Any, Optional
import re


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    """
    Read JSONL file into list of dictionaries.
    
    Args:
        path: Path to JSONL file
        
    Returns:
        List of parsed JSON objects
    """
    if not path.exists():
        return []
    
    data = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                data.append(json.loads(line))
    
    return data


def write_jsonl(data: List[Dict[str, Any]], path: Path) -> None:
    """
    Write list of dictionaries to JSONL file.
    
    Args:
        data: List of dictionaries to write
        path: Output path
    """
    ensure_dir(path.parent)
    
    with open(path, "w", encoding="utf-8") as f:
        for item in data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")


def read_json(path: Path) -> Dict[str, Any]:
    """Read JSON file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(data: Dict[str, Any], path: Path, indent: int = 2) -> None:
    """Write JSON file."""
    ensure_dir(path.parent)
    
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)


def ensure_dir(path: Path) -> None:
    """Create directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)


def get_output_path(
    base_dir: Path,
    session_id: str,
    step: str,
    filename: str,
) -> Path:
    """
    Get standardized output path for pipeline artifacts.
    
    Args:
        base_dir: Base output directory
        session_id: Session identifier
        step: Pipeline step (e.g., "0_preprocess")
        filename: Output filename
        
    Returns:
        Full output path
    """
    output_dir = base_dir / session_id / step
    ensure_dir(output_dir)
    return output_dir / filename


def get_session_id_from_path(audio_path: Path) -> str:
    """
    Extract session ID from audio file path.
    
    Examples:
        Session_04.m4a -> Session_04
        sessions/05/Session_05.m4a -> Session_05
        sessions/03/recording.m4a -> Session_03
        sessions/03/tracks/ -> Session_03
        
    Args:
        audio_path: Path to audio file
        
    Returns:
        Session ID
    """
    parts = list(audio_path.parts)

    # Common layout: sessions/<NN>/...
    # (Works for both file paths and directories like sessions/03/tracks)
    for idx, part in enumerate(parts):
        if part.lower() == "sessions" and idx + 1 < len(parts):
            maybe_num = parts[idx + 1]
            if re.fullmatch(r"\d{1,3}", maybe_num):
                return f"Session_{int(maybe_num):02d}"

    # Try to extract from filename
    stem = audio_path.stem
    
    # Check if it starts with "Session_"
    if stem.startswith("Session_"):
        return stem
    
    # Check parent directory
    if audio_path.parent.name.startswith("Session_"):
        return audio_path.parent.name

    # If the immediate folder is numeric (e.g., "03"), treat as Session_03
    if re.fullmatch(r"\d{1,3}", audio_path.name):
        return f"Session_{int(audio_path.name):02d}"
    if re.fullmatch(r"\d{1,3}", audio_path.parent.name):
        return f"Session_{int(audio_path.parent.name):02d}"
    
    # Fallback: use stem
    return stem
