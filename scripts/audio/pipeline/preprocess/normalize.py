"""Step 0: Preprocess and normalize audio files."""

from pathlib import Path
from typing import Optional, List
import argparse
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.config import PipelineConfig
from pipeline.common.logging_utils import setup_logging, get_step_logger
from pipeline.common.file_utils import ensure_dir, get_session_id_from_path
from pipeline.common.audio_utils import normalize_audio_ffmpeg, get_audio_duration


logger = get_step_logger("preprocess")


def detect_audio_mode(audio_path: Path) -> str:
    """
    Detect if input is multitrack (directory) or single mic (file).
    
    Args:
        audio_path: Path to audio file or directory
        
    Returns:
        "discord_multitrack" or "table_single_mic"
    """
    if audio_path.is_dir():
        return "discord_multitrack"
    else:
        return "table_single_mic"


def normalize_single_file(
    input_path: Path,
    output_path: Path,
    config: PipelineConfig,
) -> None:
    """Normalize a single audio file."""
    logger.info(f"Normalizing {input_path.name}...")
    
    duration = get_audio_duration(input_path)
    logger.info(f"Duration: {duration:.2f} seconds ({duration/60:.2f} minutes)")
    
    normalize_audio_ffmpeg(
        input_path=input_path,
        output_path=output_path,
        sample_rate=config.preprocess.sample_rate,
        channels=config.preprocess.channels,
        loudnorm_target_lufs=config.preprocess.loudnorm_target_lufs,
        loudnorm_range_lu=config.preprocess.loudnorm_range_lu,
        true_peak_db=config.preprocess.true_peak_db,
        highpass_hz=config.preprocess.highpass_hz,
        two_pass=config.preprocess.two_pass,
        output_format=config.preprocess.output_format,
    )
    
    logger.info(f"✓ Saved normalized audio to {output_path}")


def preprocess_mode_a(
    tracks_dir: Path,
    output_dir: Path,
    config: PipelineConfig,
) -> List[Path]:
    """
    Preprocess Mode A: Multitrack (Discord).
    Each track is normalized independently.
    
    Args:
        tracks_dir: Directory containing track files
        output_dir: Output directory for normalized tracks
        config: Pipeline configuration
        
    Returns:
        List of normalized track paths
    """
    logger.info("Mode A: Processing multitrack audio (Discord)")
    
    # Find all audio files in tracks directory
    audio_extensions = {".m4a", ".wav", ".flac", ".mp3", ".ogg"}
    track_files = [
        f for f in tracks_dir.iterdir()
        if f.is_file() and f.suffix.lower() in audio_extensions
    ]
    
    if not track_files:
        raise ValueError(f"No audio files found in {tracks_dir}")
    
    logger.info(f"Found {len(track_files)} track files")
    
    # Create output directory for normalized tracks
    normalized_dir = output_dir / "normalized_tracks"
    ensure_dir(normalized_dir)
    
    normalized_paths = []
    
    for track_file in sorted(track_files):
        output_path = normalized_dir / f"{track_file.stem}.{config.preprocess.output_format}"
        normalize_single_file(track_file, output_path, config)
        normalized_paths.append(output_path)
    
    return normalized_paths


def preprocess_mode_b(
    audio_file: Path,
    output_dir: Path,
    config: PipelineConfig,
) -> Path:
    """
    Preprocess Mode B: Single mic (table recording).
    The mixed audio is normalized once.
    
    Args:
        audio_file: Input audio file
        output_dir: Output directory
        config: Pipeline configuration
        
    Returns:
        Path to normalized audio file
    """
    logger.info("Mode B: Processing single-mic audio (table recording)")
    
    output_path = output_dir / f"normalized.{config.preprocess.output_format}"
    normalize_single_file(audio_file, output_path, config)
    
    return output_path


def preprocess(
    audio_path: Path,
    output_dir: Path,
    config: PipelineConfig,
    audio_mode: Optional[str] = None,
) -> dict:
    """
    Main preprocessing function.
    
    Args:
        audio_path: Path to audio file or tracks directory
        output_dir: Output directory for normalized audio
        config: Pipeline configuration
        audio_mode: Override auto-detection ("discord_multitrack" or "table_single_mic")
        
    Returns:
        Dictionary with preprocessing results
    """
    if not config.preprocess.enabled:
        logger.info("Preprocessing disabled in config, skipping")
        return {"status": "skipped", "reason": "disabled"}
    
    # Detect mode if not specified
    if audio_mode is None or audio_mode == "auto":
        audio_mode = detect_audio_mode(audio_path)
    
    logger.info(f"Audio mode: {audio_mode}")
    
    # Process based on mode
    if audio_mode == "discord_multitrack":
        normalized_paths = preprocess_mode_a(audio_path, output_dir, config)
        return {
            "status": "success",
            "mode": "discord_multitrack",
            "normalized_tracks": [str(p) for p in normalized_paths],
        }
    else:  # table_single_mic
        normalized_path = preprocess_mode_b(audio_path, output_dir, config)
        return {
            "status": "success",
            "mode": "table_single_mic",
            "normalized_audio": str(normalized_path),
        }


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Preprocess and normalize audio"
    )
    parser.add_argument(
        "--audio",
        type=Path,
        required=True,
        help="Path to audio file or tracks directory",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output directory for normalized audio",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default="pipeline.config.toml",
        help="Path to pipeline configuration file",
    )
    parser.add_argument(
        "--audio-mode",
        choices=["auto", "discord_multitrack", "table_single_mic"],
        default="auto",
        help="Audio mode (auto-detect if not specified)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(level=args.log_level)
    
    # Load config
    config = PipelineConfig.from_file(args.config)
    
    # Run preprocessing
    try:
        result = preprocess(
            audio_path=args.audio,
            output_dir=args.output,
            config=config,
            audio_mode=args.audio_mode,
        )
        
        logger.info("Preprocessing complete!")
        logger.info(f"Result: {result}")
        
    except Exception as e:
        logger.error(f"Preprocessing failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
