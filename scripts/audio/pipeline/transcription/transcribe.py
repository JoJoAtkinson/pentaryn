"""Step 1: Transcription with WhisperX."""

from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import argparse
import sys
import json

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.config import PipelineConfig
from pipeline.common.logging_utils import setup_logging, get_step_logger
from pipeline.common.file_utils import write_jsonl, ensure_dir, read_json, write_json
from pipeline.common.audio_utils import load_audio, get_audio_duration, chunk_audio


logger = get_step_logger("transcription")


def transcribe_audio(
    audio_path: Path,
    config: PipelineConfig,
    device: str = "cpu",
) -> Dict[str, Any]:
    """
    Transcribe audio file using WhisperX.
    
    Args:
        audio_path: Path to audio file
        config: Pipeline configuration
        device: Device to use ("cpu" or "cuda")
        
    Returns:
        Transcription result with segments and words
    """
    try:
        import whisperx
    except ImportError:
        raise ImportError(
            "WhisperX not installed. Install with: pip install whisperx"
        )
    
    logger.info(f"Loading Whisper model: {config.transcription.model}")
    model = whisperx.load_model(
        config.transcription.model,
        device=device,
        compute_type=config.transcription.compute_type,
        language=config.transcription.language,
    )
    
    logger.info(f"Transcribing {audio_path.name}...")
    audio = whisperx.load_audio(str(audio_path))
    
    result = model.transcribe(
        audio,
        batch_size=config.transcription.batch_size,
        language=config.transcription.language,
    )
    
    # Perform forced alignment for word-level timestamps
    logger.info("Performing forced alignment...")
    model_a, metadata = whisperx.load_align_model(
        language_code=config.transcription.language,
        device=device,
    )
    
    result = whisperx.align(
        result["segments"],
        model_a,
        metadata,
        audio,
        device,
        return_char_alignments=False,
    )
    
    return result


def should_chunk_audio(
    duration_seconds: float,
    chunk_duration_hours: float,
) -> bool:
    """Determine if audio needs to be chunked."""
    duration_hours = duration_seconds / 3600
    return duration_hours > chunk_duration_hours


def create_chunks(
    audio_path: Path,
    config: PipelineConfig,
) -> List[Dict[str, Any]]:
    """
    Split audio into chunks and create manifest.
    
    Args:
        audio_path: Path to normalized audio
        config: Pipeline configuration
        
    Returns:
        List of chunk metadata dictionaries
    """
    logger.info("Loading audio for chunking...")
    audio, sr = load_audio(audio_path, sample_rate=config.preprocess.sample_rate)
    
    chunk_duration_seconds = config.transcription.chunk_duration_hours * 3600
    overlap_seconds = config.transcription.overlap_seconds
    
    logger.info(f"Chunking audio: {chunk_duration_seconds}s chunks, {overlap_seconds}s overlap")
    chunks_data = chunk_audio(audio, sr, chunk_duration_seconds, overlap_seconds)
    
    manifest = []
    for idx, (chunk_audio, start_time, end_time) in enumerate(chunks_data):
        # Calculate owned interval (for stitching)
        if config.transcription.owned_interval_stitching:
            if idx == 0:
                # First chunk owns up to end minus half overlap
                owned_start = start_time
                owned_end = end_time - (overlap_seconds / 2)
            elif idx == len(chunks_data) - 1:
                # Last chunk owns from start plus half overlap
                owned_start = start_time + (overlap_seconds / 2)
                owned_end = end_time
            else:
                # Middle chunks own center portion
                owned_start = start_time + (overlap_seconds / 2)
                owned_end = end_time - (overlap_seconds / 2)
        else:
            owned_start = start_time
            owned_end = end_time
        
        manifest.append({
            "chunk_id": idx + 1,
            "start_time": start_time,
            "end_time": end_time,
            "owned_start": owned_start,
            "owned_end": owned_end,
            "duration": end_time - start_time,
        })
    
    logger.info(f"Created {len(manifest)} chunks")
    return manifest


def process_segments_for_output(
    segments: List[Dict[str, Any]],
    chunk_id: int,
    track: Optional[str] = None,
    global_offset: float = 0.0,
) -> List[Dict[str, Any]]:
    """
    Process transcription segments into standardized format.
    
    Args:
        segments: Raw segments from WhisperX
        chunk_id: Chunk identifier
        track: Track name (Mode A only)
        global_offset: Time offset for chunked audio
        
    Returns:
        List of processed segments
    """
    output_segments = []
    
    for seg_idx, seg in enumerate(segments):
        # Extract words with timestamps
        words = []
        if "words" in seg:
            for word_data in seg["words"]:
                words.append({
                    "word": word_data.get("word", ""),
                    "start": word_data.get("start", 0.0) + global_offset,
                    "end": word_data.get("end", 0.0) + global_offset,
                })
        
        output_segments.append({
            "segment_id": seg_idx,
            "text": seg.get("text", "").strip(),
            "start": seg.get("start", 0.0) + global_offset,
            "end": seg.get("end", 0.0) + global_offset,
            "chunk_id": chunk_id,
            "track": track,
            "words": words,
        })
    
    return output_segments


def transcribe_mode_a(
    tracks_dir: Path,
    output_dir: Path,
    config: PipelineConfig,
    device: str = "cpu",
) -> None:
    """
    Transcribe Mode A: Multitrack.
    Each track is transcribed independently.
    
    Args:
        tracks_dir: Directory containing normalized tracks
        output_dir: Output directory
        config: Pipeline configuration
        device: Device to use
    """
    logger.info("Mode A: Transcribing multitrack audio")
    
    # Find all normalized tracks
    track_files = sorted(tracks_dir.glob(f"*.{config.preprocess.output_format}"))
    
    if not track_files:
        raise ValueError(f"No normalized tracks found in {tracks_dir}")
    
    all_segments = []
    
    for track_file in track_files:
        track_name = track_file.stem
        logger.info(f"Transcribing track: {track_name}")
        
        result = transcribe_audio(track_file, config, device)
        
        # Process segments
        segments = process_segments_for_output(
            segments=result.get("segments", []),
            chunk_id=1,
            track=track_name,
            global_offset=0.0,
        )
        
        all_segments.extend(segments)
    
    # Write all segments to single JSONL file
    output_file = output_dir / "raw_segments.jsonl"
    write_jsonl(all_segments, output_file)
    logger.info(f"✓ Wrote {len(all_segments)} segments to {output_file}")


def transcribe_mode_b(
    audio_file: Path,
    output_dir: Path,
    config: PipelineConfig,
    device: str = "cpu",
) -> None:
    """
    Transcribe Mode B: Single mic.
    May chunk audio if duration exceeds threshold.
    
    Args:
        audio_file: Normalized audio file
        output_dir: Output directory
        config: Pipeline configuration
        device: Device to use
    """
    logger.info("Mode B: Transcribing single-mic audio")
    
    # Check if chunking is needed
    duration = get_audio_duration(audio_file)
    logger.info(f"Audio duration: {duration:.2f}s ({duration/3600:.2f} hours)")
    
    needs_chunking = should_chunk_audio(
        duration,
        config.transcription.chunk_duration_hours,
    )
    
    all_segments = []
    
    if needs_chunking:
        logger.info("Audio exceeds chunk duration, will process in chunks")
        
        # Create chunks manifest
        chunks = create_chunks(audio_file, config)
        manifest_file = output_dir / "chunks_manifest.json"
        write_json({"chunks": chunks}, manifest_file)
        logger.info(f"✓ Wrote chunks manifest to {manifest_file}")
        
        # Load full audio once
        audio, sr = load_audio(audio_file, sample_rate=config.preprocess.sample_rate)
        
        # Transcribe each chunk
        for chunk_info in chunks:
            chunk_id = chunk_info["chunk_id"]
            start_time = chunk_info["start_time"]
            end_time = chunk_info["end_time"]
            owned_start = chunk_info["owned_start"]
            owned_end = chunk_info["owned_end"]
            
            logger.info(f"Processing chunk {chunk_id}/{len(chunks)}: {start_time:.2f}s - {end_time:.2f}s")
            
            # Extract chunk audio
            start_sample = int(start_time * sr)
            end_sample = int(end_time * sr)
            chunk_audio = audio[start_sample:end_sample]
            
            # Save chunk temporarily
            import soundfile as sf
            chunk_file = output_dir / f"chunk_{chunk_id}.wav"
            sf.write(str(chunk_file), chunk_audio, sr)
            
            # Transcribe chunk
            result = transcribe_audio(chunk_file, config, device)
            
            # Process segments
            segments = process_segments_for_output(
                segments=result.get("segments", []),
                chunk_id=chunk_id,
                track=None,
                global_offset=start_time,
            )
            
            # Filter segments to owned interval
            if config.transcription.owned_interval_stitching:
                filtered_segments = []
                for seg in segments:
                    # Check if segment midpoint falls in owned interval
                    midpoint = (seg["start"] + seg["end"]) / 2
                    if owned_start <= midpoint <= owned_end:
                        filtered_segments.append(seg)
                
                logger.info(f"Chunk {chunk_id}: {len(segments)} total, {len(filtered_segments)} in owned interval")
                all_segments.extend(filtered_segments)
            else:
                all_segments.extend(segments)
            
            # Clean up temporary chunk file
            chunk_file.unlink()
    
    else:
        # Process entire file at once
        logger.info("Processing audio without chunking")
        
        result = transcribe_audio(audio_file, config, device)
        
        # Process segments
        segments = process_segments_for_output(
            segments=result.get("segments", []),
            chunk_id=1,
            track=None,
            global_offset=0.0,
        )
        
        all_segments = segments
    
    # Write all segments
    output_file = output_dir / "raw_segments.jsonl"
    write_jsonl(all_segments, output_file)
    logger.info(f"✓ Wrote {len(all_segments)} segments to {output_file}")


def transcribe(
    audio_path: Path,
    output_dir: Path,
    config: PipelineConfig,
    audio_mode: str,
    device: str = "cpu",
) -> dict:
    """
    Main transcription function.
    
    Args:
        audio_path: Path to normalized audio or tracks directory
        output_dir: Output directory
        config: Pipeline configuration
        audio_mode: "discord_multitrack" or "table_single_mic"
        device: Device to use ("cpu" or "cuda")
        
    Returns:
        Dictionary with transcription results
    """
    ensure_dir(output_dir)
    
    if audio_mode == "discord_multitrack":
        # Expect tracks directory from Step 0
        tracks_dir = audio_path / "normalized_tracks"
        if not tracks_dir.exists():
            raise ValueError(f"Expected normalized tracks directory: {tracks_dir}")
        
        transcribe_mode_a(tracks_dir, output_dir, config, device)
        return {"status": "success", "mode": "discord_multitrack"}
    
    else:  # table_single_mic
        # Expect normalized audio file from Step 0
        audio_file = audio_path / f"normalized.{config.preprocess.output_format}"
        if not audio_file.exists():
            raise ValueError(f"Expected normalized audio file: {audio_file}")
        
        transcribe_mode_b(audio_file, output_dir, config, device)
        return {"status": "success", "mode": "table_single_mic"}


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Transcription with WhisperX"
    )
    parser.add_argument(
        "--audio",
        type=Path,
        required=True,
        help="Path to Step 0 output directory (0_preprocess)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output directory for transcription",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default="pipeline.config.toml",
        help="Path to pipeline configuration file",
    )
    parser.add_argument(
        "--audio-mode",
        choices=["discord_multitrack", "table_single_mic"],
        required=True,
        help="Audio mode",
    )
    parser.add_argument(
        "--device",
        choices=["cpu", "cuda"],
        default="cpu",
        help="Device to use for inference",
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
    
    # Run transcription
    try:
        result = transcribe(
            audio_path=args.audio,
            output_dir=args.output,
            config=config,
            audio_mode=args.audio_mode,
            device=args.device,
        )
        
        logger.info("Transcription complete!")
        logger.info(f"Result: {result}")
        
    except Exception as e:
        logger.error(f"Transcription failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
