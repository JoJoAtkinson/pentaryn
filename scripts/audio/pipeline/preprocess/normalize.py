"""Step 0: Preprocess and normalize audio files."""

from pathlib import Path
from typing import Optional, List
import argparse
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.config import PipelineConfig
from pipeline.common.logging_utils import setup_logging, get_step_logger
from pipeline.common.file_utils import ensure_dir, get_session_id_from_path
from pipeline.common.audio_utils import normalize_audio_ffmpeg, get_audio_duration
from pipeline.common.manifest_utils import build_manifest, should_skip, write_manifest


logger = get_step_logger("preprocess")

_AUDIO_EXTS = {".m4a", ".wav", ".flac", ".mp3", ".ogg"}


def _ffmpeg_extract_chunk(
    input_path: Path,
    output_path: Path,
    start_s: float,
    duration_s: float,
    output_format: str,
) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_s:.3f}",
        "-t",
        f"{duration_s:.3f}",
        "-i",
        str(input_path),
    ]
    if output_format == "flac":
        cmd.extend(["-c:a", "flac", "-compression_level", "5"])
    else:
        cmd.extend(["-c:a", "pcm_s16le"])
    cmd.append(str(output_path))
    
    result = subprocess.run(cmd, check=True, capture_output=True)
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError(f"FFmpeg failed to create chunk: {output_path}")


def _concat_chunks(chunks: List[Path], output_path: Path, output_format: str) -> Path:
    file_list = output_path.with_suffix(".concat.txt")
    with open(file_list, "w") as f:
        for chunk in chunks:
            if not chunk.exists():
                raise FileNotFoundError(f"Chunk missing before concatenation: {chunk}")
            f.write(f"file '{chunk.resolve().as_posix()}'\n")

    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(file_list),
    ]
    if output_format == "flac":
        cmd.extend(["-c:a", "flac", "-compression_level", "5"])
    else:
        cmd.extend(["-c:a", "pcm_s16le"])
    cmd.append(str(output_path))
    
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", errors="replace") if exc.stderr else ""
        raise RuntimeError(f"FFmpeg concat failed: {stderr}") from exc
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError(f"FFmpeg failed to concatenate chunks: {output_path}")
    return file_list


def _normalize_chunked_file(
    input_path: Path,
    output_path: Path,
    config: PipelineConfig,
    duration: float,
) -> None:
    workers = getattr(config.preprocess, "parallel_tracks", 1)
    if workers <= 0:
        workers = os.cpu_count() or 1
    workers = max(1, min(workers, int(max(1, duration))))

    chunk_len = duration / workers
    temp_dir = output_path.parent / f".tmp_{input_path.stem}_chunks"
    ensure_dir(temp_dir)

    raw_chunks: List[Path] = []
    normalized_chunks: List[Path] = []

    logger.info(f"Chunking {input_path.name}: {workers} chunks @ {chunk_len:.2f}s")
    for idx in range(workers):
        start_s = idx * chunk_len
        remaining = duration - start_s
        if remaining <= 0:
            break
        length = min(chunk_len, remaining)
        raw_path = temp_dir / f"chunk_{idx:03d}.{config.preprocess.output_format}"
        logger.info(f"Extracting chunk {idx + 1}/{workers} ({start_s:.2f}s +{length:.2f}s)")
        _ffmpeg_extract_chunk(
            input_path=input_path,
            output_path=raw_path,
            start_s=start_s,
            duration_s=length,
            output_format=config.preprocess.output_format,
        )
        raw_chunks.append(raw_path)

    def _normalize_chunk(raw_path: Path) -> Path:
        out_path = temp_dir / f"{raw_path.stem}_norm.{config.preprocess.output_format}"
        chunk_label = f"{input_path.stem} {raw_path.stem}"
        normalize_audio_ffmpeg(
            input_path=raw_path,
            output_path=out_path,
            sample_rate=config.preprocess.sample_rate,
            channels=config.preprocess.channels,
            loudnorm_target_lufs=config.preprocess.loudnorm_target_lufs,
            loudnorm_range_lu=config.preprocess.loudnorm_range_lu,
            true_peak_db=config.preprocess.true_peak_db,
            highpass_hz=config.preprocess.highpass_hz,
            two_pass=config.preprocess.two_pass,
            output_format=config.preprocess.output_format,
            duration_seconds=get_audio_duration(raw_path),
            progress_interval_seconds=config.preprocess.progress_interval_seconds,
            progress_label=chunk_label,
        )
        return out_path

    logger.info(f"Normalizing {len(raw_chunks)} chunks with {workers} workers")
    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            for idx, chunk_output in enumerate(executor.map(_normalize_chunk, raw_chunks), start=1):
                logger.info(f"Chunk {idx}/{len(raw_chunks)} normalized")
                normalized_chunks.append(chunk_output)

        logger.info("Concatenating normalized chunks...")
        concat_list = _concat_chunks(normalized_chunks, output_path, config.preprocess.output_format)
    finally:
        # Clean up temp files even if processing fails
        logger.debug(f"Cleaning up {len(normalized_chunks) + len(raw_chunks)} temp files")
        for path in normalized_chunks + raw_chunks:
            path.unlink(missing_ok=True)
        if 'concat_list' in locals() and concat_list.exists():
            concat_list.unlink(missing_ok=True)
        if temp_dir.exists() and not any(temp_dir.iterdir()):
            temp_dir.rmdir()


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
    start_time = time.time()
    
    duration = get_audio_duration(input_path)
    logger.info(f"Duration: {duration:.2f} seconds ({duration/60:.2f} minutes)")

    _normalize_chunked_file(
        input_path=input_path,
        output_path=output_path,
        config=config,
        duration=duration,
    )
    
    elapsed = time.time() - start_time
    logger.info(f"✓ Saved normalized audio to {output_path} ({elapsed/60:.2f} min)")


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
    start_time = time.time()
    
    # Find all audio files in tracks directory
    track_files = [
        f for f in tracks_dir.iterdir()
        if f.is_file() and f.suffix.lower() in _AUDIO_EXTS
    ]
    
    if not track_files:
        raise ValueError(f"No audio files found in {tracks_dir}")
    
    logger.info(f"Found {len(track_files)} track files")
    
    # Create output directory for normalized tracks
    normalized_dir = output_dir / "normalized_tracks"
    ensure_dir(normalized_dir)
    
    normalized_paths = []
    sorted_tracks = sorted(track_files)

    for track_file in sorted_tracks:
        output_path = normalized_dir / f"{track_file.stem}.{config.preprocess.output_format}"
        if output_path.exists():
            logger.info(f"✓ Existing normalized track found, skipping: {output_path.name}")
            normalized_paths.append(output_path)
            continue
        normalize_single_file(track_file, output_path, config)
        normalized_paths.append(output_path)

    elapsed = time.time() - start_time
    logger.info(f"✓ Preprocess Mode A complete in {elapsed/60:.2f} min")
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
    start_time = time.time()
    
    output_path = output_dir / f"normalized.{config.preprocess.output_format}"
    if output_path.exists():
        logger.info(f"✓ Existing normalized audio found, skipping: {output_path.name}")
        return output_path
    normalize_single_file(audio_file, output_path, config)
    
    elapsed = time.time() - start_time
    logger.info(f"✓ Preprocess Mode B complete in {elapsed/60:.2f} min")
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

    session_id = get_session_id_from_path(audio_path)
    if audio_mode == "discord_multitrack":
        track_files = [
            f for f in audio_path.iterdir()
            if f.is_file() and f.suffix.lower() in _AUDIO_EXTS
        ]
        normalized_dir = output_dir / "normalized_tracks"
        required_outputs = [
            normalized_dir / f"{track_file.stem}.{config.preprocess.output_format}"
            for track_file in sorted(track_files)
        ]
        manifest = build_manifest(
            step="preprocess",
            session_id=session_id,
            input_files=track_files,
            config=config,
            extra={"audio_mode": audio_mode},
        )
    else:
        required_outputs = [output_dir / f"normalized.{config.preprocess.output_format}"]
        manifest = build_manifest(
            step="preprocess",
            session_id=session_id,
            input_files=[audio_path],
            config=config,
            extra={"audio_mode": audio_mode},
        )

    if should_skip(output_dir, manifest, required_outputs):
        logger.info("✓ Existing preprocess outputs found (manifest match), skipping Step 0")
        return {"status": "skipped", "reason": "output_exists", "output_dir": str(output_dir)}
    
    # Process based on mode
    if audio_mode == "discord_multitrack":
        normalized_paths = preprocess_mode_a(audio_path, output_dir, config)
        write_manifest(output_dir, manifest)
        return {
            "status": "success",
            "mode": "discord_multitrack",
            "normalized_tracks": [str(p) for p in normalized_paths],
        }
    else:  # table_single_mic
        normalized_path = preprocess_mode_b(audio_path, output_dir, config)
        write_manifest(output_dir, manifest)
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
