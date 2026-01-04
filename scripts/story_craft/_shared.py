from __future__ import annotations

import json
import tomllib
from pathlib import Path
from typing import Any, Optional, Iterable

# scripts/story_craft/* -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]


def discover_latest_session(repo_root: Path = REPO_ROOT) -> Optional[int]:
    """Find the highest numbered session folder (e.g., sessions/01 -> 1)."""
    sessions_dir = repo_root / "sessions"
    if not sessions_dir.exists():
        return None

    session_nums: list[int] = []
    for item in sessions_dir.iterdir():
        if not item.is_dir():
            continue
        try:
            session_nums.append(int(item.name))
        except ValueError:
            continue

    return max(session_nums) if session_nums else None


def load_session_config(session_num: int, repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    """Load configuration for a specific session."""
    config_path = repo_root / "sessions" / f"{session_num:02d}" / "config.toml"
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    with config_path.open("rb") as f:
        return tomllib.load(f)


def normalize_speaker_label(value: Any) -> str:
    """Normalize transcript speaker labels to a stable form."""
    if value is None:
        return "UNKNOWN"
    text = str(value).strip()
    if not text:
        return "UNKNOWN"
    upper = text.upper()
    if upper in {"UNKNOWN", "UNK"}:
        return "UNKNOWN"
    if upper == "SPEAKER_UNKNOWN":
        return "UNKNOWN"
    # Whisper-style diarization labels are already stable (e.g. SPEAKER_02)
    return upper


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    """Load a JSONL file into a list of dicts."""
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON on line {line_num} in {path}") from exc
            if not isinstance(obj, dict):
                raise ValueError(f"Expected JSON object on line {line_num} in {path}")
            rows.append(obj)
    return rows


def format_speaker_context(
    speakers_cfg: Optional[dict[str, Any]],
    observed_speakers: Optional[Iterable[str]] = None,
) -> str:
    """
    Format speaker mapping + notes into a prompt-friendly block.

    `speakers_cfg` comes from `config['session']['speakers']`.
    """
    observed = sorted({normalize_speaker_label(s) for s in (observed_speakers or []) if s is not None})
    lines: list[str] = []

    if observed:
        lines.append("Transcript speaker labels observed:")
        for s in observed:
            lines.append(f"- {s}")
        lines.append("")
        lines.append("Notes:")
        lines.append("- Transcript data may label unclear speakers as 'unknown' (normalized to 'UNKNOWN').")
        lines.append("- Diarization labels like 'SPEAKER_02' may appear; treat as unmapped/uncertain unless specified.")
        lines.append("")

    if not speakers_cfg:
        return "\n".join(lines) if lines else "No specific speaker guidance provided."

    notes = speakers_cfg.get("notes")
    mapping_items = [(k, v) for k, v in speakers_cfg.items() if k != "notes"]
    mapping_items.sort(key=lambda kv: str(kv[0]))

    if mapping_items:
        lines.append("Known / assumed speaker mappings:")
        for key, value in mapping_items:
            speaker = normalize_speaker_label(key)
            desc = str(value).strip()
            if desc:
                lines.append(f"- {speaker}: {desc}")
            else:
                lines.append(f"- {speaker}: [no description]")
        lines.append("")

    if notes:
        lines.append("Additional notes:")
        lines.append(str(notes).strip())

    return "\n".join(lines).strip() or "No specific speaker guidance provided."

