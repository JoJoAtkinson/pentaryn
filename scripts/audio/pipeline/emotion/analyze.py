#!/usr/bin/env python3
"""
Step 3: Emotion Analysis
Extracts dimensional emotion scores (Arousal, Valence, Dominance) for each speaker turn.

Input:
- diarization.jsonl (speaker turns with start/end times)
- Processed audio from Step 0

Output:
- emotion.jsonl (A/V/D scores per speaker turn)

Models:
- WavLM (tiantiaf/wavlm-large-msp-podcast-emotion-dim): Dimensional emotion regression
  Note: Requires custom WavLMWrapper from https://github.com/tiantiaf0627/vox-profile-release
  Install: pip install git+https://github.com/tiantiaf0627/vox-profile-release.git
"""

import argparse
import json
import logging
import os
import sys
import time
import site
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torchaudio

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.config import PipelineConfig
from pipeline.common.azure_utils import validate_cuda_environment
from pipeline.common.audio_utils import configure_torch_safe_globals
from pipeline.common.logging_utils import format_elapsed_time, get_step_logger
from pipeline.common.file_utils import get_session_id_from_path
from pipeline.common.manifest_utils import build_manifest, should_skip, write_manifest

logger = get_step_logger("emotion")


class EmotionAnalyzer:
    """Dimensional emotion analysis using WavLM from vox-profile."""
    
    def __init__(
        self,
        model_name: str = "tiantiaf/wavlm-large-msp-podcast-emotion-dim",
        device: Optional[str] = None,
        batch_size: int = 8,
    ):
        """
        Args:
            model_name: HuggingFace model for emotion regression
            device: Device to use (cuda/cpu), auto-detect if None
            batch_size: Number of segments to process at once
        """
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.batch_size = batch_size
        
        logger.info(f"Initializing emotion analyzer on {self.device}")
        logger.info(f"Model: {model_name}")
        
        # Import the WavLMWrapper class from vox-profile package
        # Note: vox-profile repo is cloned to /opt/vox-profile in Dockerfile
        # The repo is added to sys.path via .pth file
        load_start = time.time()

        from src.model.emotion.wavlm_emotion_dim import WavLMWrapper
        
        try:
            self.model = WavLMWrapper.from_pretrained(model_name).to(self.device)
            self.model.eval()
            logger.info(f"✓ Model loaded in {format_elapsed_time(time.time() - load_start)}")
        except Exception as e:
            logger.error(f"Failed to load model from {model_name}: {e}")
            raise
        
        # Audio specifications from the model documentation
        self.sample_rate = 16000  # WavLM expects 16kHz
        self.max_audio_length = 15 * self.sample_rate  # 15 seconds max
        logger.info(f"Target sample rate: {self.sample_rate} Hz")
        logger.info(f"Max audio length: {self.max_audio_length / self.sample_rate:.1f}s")
    
    def extract_segment_audio(
        self,
        audio_path: Path,
        start_time: float,
        end_time: float,
        target_duration: Optional[float] = None,
    ) -> Optional[torch.Tensor]:
        """
        Extract audio segment from file.
        
        Args:
            audio_path: Path to audio file
            start_time: Start time in seconds
            end_time: End time in seconds
            target_duration: Target duration in seconds (for padding/truncation)
                           If None, uses the segment duration (up to max_audio_length)
        
        Returns:
            Audio tensor [samples] or None if extraction fails
        """
        try:
            # Calculate segment duration
            segment_duration = end_time - start_time
            if target_duration is None:
                target_duration = min(segment_duration, self.max_audio_length / self.sample_rate)
            
            # Load audio segment
            frame_offset = int(start_time * self.sample_rate)
            num_frames = int(target_duration * self.sample_rate)
            
            waveform, sr = torchaudio.load(
                str(audio_path),
                frame_offset=frame_offset,
                num_frames=num_frames,
            )
            
            # Resample if needed
            if sr != self.sample_rate:
                resampler = torchaudio.transforms.Resample(sr, self.sample_rate)
                waveform = resampler(waveform)
            
            # Convert to mono
            if waveform.shape[0] > 1:
                waveform = waveform.mean(dim=0, keepdim=True)
            
            # Normalize
            waveform = waveform / (waveform.abs().max() + 1e-8)
            
            # Ensure we don't exceed max length
            max_samples = min(self.max_audio_length, int(target_duration * self.sample_rate))
            if waveform.shape[1] > max_samples:
                waveform = waveform[:, :max_samples]
            
            return waveform.squeeze(0)  # [samples]
        
        except Exception as e:
            logger.error(f"Failed to extract segment {start_time:.2f}-{end_time:.2f}: {e}")
            return None
    
    @torch.no_grad()
    def analyze_segments(
        self,
        audio_segments: List[torch.Tensor],
    ) -> List[Dict[str, float]]:
        """
        Analyze emotion for audio segments in batch.
        
        The WavLMWrapper model expects:
        - Input shape: [batch_size, samples]
        - Sample rate: 16kHz
        - Max length: 15 seconds (240,000 samples)
        - Returns: arousal, valence, dominance tensors
        
        Args:
            audio_segments: List of audio tensors [samples]
        
        Returns:
            List of dicts with arousal, valence, dominance scores
        """
        if not audio_segments:
            return []
        
        results = []
        total_segments = len(audio_segments)
        progress_next = 10
        
        # Process in batches
        for i in range(0, total_segments, self.batch_size):
            batch = audio_segments[i:i + self.batch_size]
            
            # Pad batch to same length (required for batching)
            max_len = max(seg.shape[0] for seg in batch)
            max_len = min(max_len, self.max_audio_length)  # Cap at model max
            
            batch_tensor = torch.zeros(len(batch), max_len, device=self.device)
            for j, seg in enumerate(batch):
                length = min(seg.shape[0], max_len)
                batch_tensor[j, :length] = seg[:length].to(self.device)
            
            # Forward pass through WavLMWrapper
            # Returns: arousal, valence, dominance tensors
            arousal, valence, dominance = self.model(batch_tensor)
            
            # Convert to list of dicts
            for j in range(len(batch)):
                results.append({
                    "arousal": float(arousal[j].cpu().item()),
                    "valence": float(valence[j].cpu().item()),
                    "dominance": float(dominance[j].cpu().item()),
                })
            
            completed = min(i + self.batch_size, total_segments)
            percent = int(completed * 100 / total_segments) if total_segments else 100
            if percent >= progress_next or completed == total_segments:
                logger.info(f"Emotion inference progress: {percent}% ({completed}/{total_segments} segments)")
                progress_next += 10
        
        return results
    
    def analyze_from_diarization(
        self,
        audio_path: Path,
        diarization_path: Path,
        output_path: Path,
        min_segment_duration: float = 3.0,
        max_segment_duration: float = 15.0,
        tracks_dir: Optional[Path] = None,
        output_format: str = "flac",
    ) -> int:
        """
        Analyze emotion for all speaker turns from diarization.
        
        This method processes diarization output and extracts A/V/D emotion scores
        for each speaker turn. Supports both single-mic and multitrack audio.
        
        Note: The WavLM model was trained on 3-15 second segments. Segments shorter
        than 3 seconds may have less reliable predictions. Segments longer than 15
        seconds will be truncated.
        
        Args:
            audio_path: Path to audio file (single-mic) or base dir (multitrack)
            diarization_path: Path to diarization.jsonl with speaker turns
            output_path: Path to write emotion.jsonl results
            min_segment_duration: Skip segments shorter than this (seconds)
            max_segment_duration: Truncate segments longer than this (seconds, max 15)
            tracks_dir: If provided, look up individual track files by speaker
            output_format: Audio file extension (e.g., 'flac', 'wav')
        
        Returns:
            Number of segments successfully analyzed
        """
        logger.info(f"Loading diarization from {diarization_path}")
        
        # Load diarization segments
        segments = []
        with open(diarization_path, "r") as f:
            for line_num, line in enumerate(f, start=1):
                try:
                    seg = json.loads(line)
                    segments.append(seg)
                except json.JSONDecodeError as e:
                    logger.warning(f"Skipping invalid JSON at line {line_num}: {e}")
        
        logger.info(f"Loaded {len(segments)} speaker turns from diarization")
        
        # Filter segments by duration
        valid_segments = []
        skipped_too_short = 0
        truncated = 0
        
        for seg in segments:
            duration = seg["end"] - seg["start"]
            if duration < min_segment_duration:
                skipped_too_short += 1
                continue
            if duration > max_segment_duration:
                # Truncate to max duration (use first N seconds of segment)
                seg = {**seg, "end": seg["start"] + max_segment_duration}
                truncated += 1
            valid_segments.append(seg)
        
        logger.info(f"Filtered to {len(valid_segments)} valid segments")
        if skipped_too_short:
            logger.info(f"  - Skipped {skipped_too_short} segments (< {min_segment_duration}s)")
        if truncated:
            logger.info(f"  - Truncated {truncated} segments (> {max_segment_duration}s)")
        
        # Build track file lookup for multitrack mode
        track_files = {}
        if tracks_dir:
            logger.info("Loading multitrack audio files...")
            if not tracks_dir.exists():
                raise FileNotFoundError(f"Tracks directory not found: {tracks_dir}")
            
            for track_file in tracks_dir.glob(f"*.{output_format}"):
                # Map track filename (without extension) to full path
                # Store lowercase key for case-insensitive lookup
                track_key = track_file.stem.lower()
                track_files[track_key] = track_file
                logger.debug(f"  Registered track: {track_key} -> {track_file.name}")

            if not track_files:
                raise FileNotFoundError(
                    f"No {output_format} files found in tracks directory: {tracks_dir}"
                )

            logger.info(f"Loaded {len(track_files)} track files")
            logger.debug(f"Available track keys: {sorted(track_files.keys())}")

        # Extract audio segments from source files
        logger.info("Extracting audio segments for emotion analysis...")
        extract_start = time.time()
        audio_segments = []
        valid_indices = []  # Track which segments succeeded (0-indexed into valid_segments)
        total_segments = len(valid_segments)
        progress_next = 10
        skipped_missing_audio = 0
        
        for i, seg in enumerate(valid_segments):
            # Determine which audio file to use for this segment
            segment_audio_path = audio_path
            
            if tracks_dir:
                # Multitrack mode: look up the specific track file for this speaker
                speaker_key = seg.get("speaker") or seg.get("speaker_id") or seg.get("track")
                
                # Clean up speaker key if it has TRACK_ prefix
                if speaker_key and speaker_key.startswith("TRACK_"):
                    speaker_key = speaker_key.replace("TRACK_", "", 1)
                
                if speaker_key:
                    # Case-insensitive lookup
                    segment_audio_path = track_files.get(str(speaker_key).lower())
                    
                if segment_audio_path is None:
                    skipped_missing_audio += 1
                    available_preview = list(track_files.keys())[:3]
                    logger.warning(
                        f"Segment {i+1}/{total_segments}: no track file found for speaker '{speaker_key}' "
                        f"(available tracks: {available_preview}...)"
                    )
                    continue
                else:
                    logger.debug(f"Segment {i+1}: using track {segment_audio_path.name} for speaker '{speaker_key}'")

            # Extract the audio segment
            audio = self.extract_segment_audio(
                segment_audio_path,
                seg["start"],
                seg["end"],
                target_duration=min(seg["end"] - seg["start"], max_segment_duration),
            )
            
            if audio is not None:
                audio_segments.append(audio)
                valid_indices.append(i)
            else:
                logger.debug(f"Segment {i+1}: audio extraction failed")
            
            # Progress logging
            current = i + 1
            percent = int(current * 100 / total_segments) if total_segments else 100
            if percent >= progress_next or current == total_segments:
                logger.info(f"Extraction progress: {percent}% ({current}/{total_segments} segments)")
                progress_next += 10
        
        logger.info(f"Successfully extracted {len(audio_segments)}/{total_segments} segments")
        if skipped_missing_audio:
            logger.warning(f"Skipped {skipped_missing_audio} segments due to missing track audio")
        if len(audio_segments) == 0:
            raise RuntimeError("No audio segments extracted - cannot proceed with emotion analysis")
        logger.info(f"Audio extraction took {format_elapsed_time(time.time() - extract_start)}")
        
        # Analyze emotion
        logger.info("Analyzing emotion...")
        analyze_start = time.time()
        emotion_results = self.analyze_segments(audio_segments)
        logger.info(f"Emotion inference took {format_elapsed_time(time.time() - analyze_start)}")
        
        # Merge emotion results with diarization data
        logger.info("Writing emotion results to output file...")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, "w") as f:
            for idx, emotion in zip(valid_indices, emotion_results):
                seg = valid_segments[idx]
                speaker_key = seg.get("speaker") or seg.get("speaker_id") or seg.get("track")
                output_record = {
                    "start": seg["start"],
                    "end": seg["end"],
                    "speaker": speaker_key,
                    "arousal": emotion["arousal"],
                    "valence": emotion["valence"],
                    "dominance": emotion["dominance"],
                }
                f.write(json.dumps(output_record) + "\n")
        
        logger.info(f"✓ Wrote {len(emotion_results)} emotion records to {output_path}")
        logger.info(f"Summary: {len(segments)} input turns -> {len(valid_segments)} valid -> {len(emotion_results)} analyzed")
        return len(emotion_results)


def derive_emotion_label(arousal: float, valence: float, dominance: float) -> str:
    """
    Derive categorical emotion label from A/V/D scores.
    
    This is optional and uses a simple heuristic. More sophisticated
    mapping could use trained classifiers or lookup tables.
    
    Dimensions:
    - Arousal: Low=calm, High=excited/alert
    - Valence: Low=negative, High=positive
    - Dominance: Low=submissive, High=dominant/in-control
    
    Args:
        arousal: Arousal score [0, 1]
        valence: Valence score [0, 1]
        dominance: Dominance score [0, 1]
    
    Returns:
        Emotion label string
    """
    # Simple quadrant-based mapping
    high_arousal = arousal > 0.6
    high_valence = valence > 0.6
    low_valence = valence < 0.4
    high_dominance = dominance > 0.6
    
    if high_valence and high_arousal:
        return "excited" if high_dominance else "happy"
    elif high_valence and not high_arousal:
        return "content" if high_dominance else "calm"
    elif low_valence and high_arousal:
        return "angry" if high_dominance else "fearful"
    elif low_valence and not high_arousal:
        return "sad" if not high_dominance else "contemptuous"
    else:
        return "neutral"


def main():
    """Main entry point for emotion analysis."""
    parser = argparse.ArgumentParser(description="Step 3: Emotion Analysis")
    parser.add_argument(
        "--config",
        type=Path,
        required=True,
        help="Path to pipeline.config.toml",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        help="Legacy input directory (contains processed/ and diarization/)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Legacy output directory for emotion.jsonl",
    )
    parser.add_argument(
        "--diarization",
        type=Path,
        help="Path to diarization output dir or diarization.jsonl",
    )
    parser.add_argument(
        "--audio",
        type=Path,
        help="Path to normalized audio file or preprocess dir",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output directory for emotion.jsonl (new CLI)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=8,
        help="Batch size for emotion model (default: 8)",
    )
    parser.add_argument(
        "--min-duration",
        type=float,
        default=0.5,
        help="Min segment duration in seconds (default: 0.5)",
    )
    parser.add_argument(
        "--max-duration",
        type=float,
        default=5.0,
        help="Max segment duration in seconds (default: 5.0)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )
    parser.add_argument(
        "--audio-mode",
        choices=["discord_multitrack", "table_single_mic"],
        default=None,
        help="Audio mode (optional, for logging only)",
    )
    args = parser.parse_args()
    
    # Setup logging
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    
    start_time = time.time()
    try:
        # Validate CUDA environment if using GPU
        if torch.cuda.is_available():
            validate_cuda_environment()
        
        # Configure PyTorch safe_globals
        configure_torch_safe_globals()
        
        # Load config
        logger.info(f"Loading config from {args.config}")
        config = PipelineConfig.from_file(args.config)
        
        # Resolve inputs/outputs (support legacy and new CLI)
        if args.input_dir:
            if not args.output_dir:
                raise ValueError("--output-dir is required when using --input-dir")
            audio_path = args.input_dir / "processed" / "audio.wav"
            diarization_path = args.input_dir / "diarization" / "diarization.jsonl"
            output_dir = args.output_dir
            session_id_source = args.input_dir
        else:
            if not (args.diarization and args.audio and args.output):
                raise ValueError("Provide --diarization, --audio, and --output (or use --input-dir/--output-dir)")
            diarization_path = args.diarization
            if diarization_path.is_dir():
                diarization_path = diarization_path / "diarization.jsonl"
            audio_path = args.audio
            if audio_path.is_dir():
                audio_path = audio_path / f"normalized.{config.preprocess.output_format}"
            output_dir = args.output
            session_id_source = args.output or args.audio

        output_path = output_dir / "emotion.jsonl"
        
        # ============================================================
        # Audio Path Resolution
        # ============================================================
        # Determine audio mode and resolve paths based on actual file structure.
        # Priority: auto-detect > explicit --audio-mode flag
        # Supports both multitrack (Discord) and single-mic (table) recordings.
        
        logger.info("Resolving audio paths...")
        
        # Step 1: Determine the base audio directory and file
        # If audio_path is a directory, look for normalized audio inside it
        # If audio_path is a file, use it directly
        if audio_path.is_dir():
            audio_dir = audio_path
            single_audio_file = audio_dir / f"normalized.{config.preprocess.output_format}"
            tracks_dir = audio_dir / "normalized_tracks"
        else:
            # audio_path points to a specific file (e.g., normalized.flac)
            audio_dir = audio_path.parent
            single_audio_file = audio_path
            tracks_dir = audio_dir / "normalized_tracks"
        
        logger.debug(f"Audio dir: {audio_dir}")
        logger.debug(f"Single audio file candidate: {single_audio_file}")
        logger.debug(f"Tracks dir candidate: {tracks_dir}")
        
        # Step 2: Auto-detect audio mode if not explicitly set
        # Check what actually exists on disk
        has_tracks = tracks_dir.exists() and tracks_dir.is_dir()
        has_single_file = single_audio_file.exists() and single_audio_file.is_file()
        
        if args.audio_mode is None:
            # Auto-detect based on what exists
            if has_tracks:
                track_files = sorted(tracks_dir.glob(f"*.{config.preprocess.output_format}"))
                if track_files:
                    audio_mode = "discord_multitrack"
                    logger.info(f"Auto-detected multitrack mode ({len(track_files)} tracks found)")
                elif has_single_file:
                    audio_mode = "table_single_mic"
                    logger.info("Auto-detected single-mic mode (no tracks, but normalized file found)")
                else:
                    audio_mode = "table_single_mic"
                    logger.warning("Tracks dir exists but is empty, defaulting to single-mic mode")
            elif has_single_file:
                audio_mode = "table_single_mic"
                logger.info("Auto-detected single-mic mode (normalized file found)")
            else:
                raise FileNotFoundError(
                    f"No valid audio found. Expected either:\n"
                    f"  - Multitrack: {tracks_dir}/*.{config.preprocess.output_format}\n"
                    f"  - Single-mic: {single_audio_file}"
                )
        else:
            # User explicitly set audio mode
            audio_mode = args.audio_mode
            logger.info(f"Using explicitly set audio mode: {audio_mode}")
        
        # Step 3: Validate and prepare inputs based on detected/specified mode
        if audio_mode == "discord_multitrack":
            # Multitrack mode: need individual track files
            if not has_tracks:
                if has_single_file:
                    logger.warning(
                        f"Multitrack mode requested but no tracks dir found at {tracks_dir}. "
                        f"Falling back to single-mic mode using {single_audio_file}"
                    )
                    audio_mode = "table_single_mic"
                    audio_path = single_audio_file
                    tracks_dir = None
                    input_files = [single_audio_file, diarization_path]
                else:
                    raise FileNotFoundError(
                        f"Multitrack mode requires tracks dir: {tracks_dir}\n"
                        f"Expected: {tracks_dir}/*.{config.preprocess.output_format}"
                    )
            else:
                # Tracks dir exists, get track files
                track_files = sorted(tracks_dir.glob(f"*.{config.preprocess.output_format}"))
                if not track_files:
                    if has_single_file:
                        logger.warning(
                            f"Tracks dir {tracks_dir} is empty. "
                            f"Falling back to single-mic mode using {single_audio_file}"
                        )
                        audio_mode = "table_single_mic"
                        audio_path = single_audio_file
                        tracks_dir = None
                        input_files = [single_audio_file, diarization_path]
                    else:
                        raise FileNotFoundError(
                            f"Tracks dir {tracks_dir} is empty and no fallback audio found at {single_audio_file}"
                        )
                else:
                    # Success: have tracks
                    logger.info(f"Using {len(track_files)} track files from {tracks_dir}")
                    for i, tf in enumerate(track_files[:5], 1):  # Log first 5
                        logger.debug(f"  Track {i}: {tf.name}")
                    if len(track_files) > 5:
                        logger.debug(f"  ... and {len(track_files) - 5} more")
                    
                    # In multitrack mode, audio_path is the base directory
                    audio_path = audio_dir
                    input_files = track_files + [diarization_path]
        else:
            # Single-mic mode: need one normalized file
            tracks_dir = None
            
            if not has_single_file:
                raise FileNotFoundError(
                    f"Single-mic mode requires normalized audio file: {single_audio_file}"
                )
            
            logger.info(f"Using single audio file: {single_audio_file}")
            audio_path = single_audio_file
            input_files = [single_audio_file, diarization_path]
        
        logger.info(f"✓ Audio resolution complete - Mode: {audio_mode}")
        
        # ============================================================
        # End Audio Path Resolution
        # ============================================================

        manifest = build_manifest(
            step="emotion",
            session_id=get_session_id_from_path(session_id_source),
            input_files=input_files,
            config=config,
        )

        if should_skip(args.output_dir, manifest, [output_path]):
            logger.info(f"✓ Existing emotion output found (manifest match), skipping: {output_path}")
            return
        
        # Validate inputs exist
        if not diarization_path.exists():
            raise FileNotFoundError(f"Diarization file not found: {diarization_path}")
        
        if audio_mode == "discord_multitrack":
            if tracks_dir is None or not tracks_dir.exists():
                raise FileNotFoundError(f"Tracks directory not found: {tracks_dir}")
            # Individual track existence already validated during resolution
        else:
            if not audio_path.exists():
                raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        # Log final configuration
        logger.info("=" * 60)
        logger.info("Emotion Analysis Configuration")
        logger.info("=" * 60)
        logger.info(f"Mode: {audio_mode}")
        if audio_mode == "discord_multitrack":
            logger.info(f"Tracks dir: {tracks_dir}")
            logger.info(f"Number of tracks: {len([f for f in input_files if f != diarization_path])}")
        else:
            logger.info(f"Audio file: {audio_path}")
        logger.info(f"Diarization: {diarization_path}")
        logger.info(f"Output: {output_path}")
        logger.info(f"Batch size: {args.batch_size}")
        logger.info(f"Min duration: {args.min_duration}s")
        logger.info(f"Max duration: {args.max_duration}s")
        logger.info("=" * 60)
        
        # Initialize analyzer
        analyzer = EmotionAnalyzer(
            model_name="tiantiaf/wavlm-large-msp-podcast-emotion-dim",
            batch_size=args.batch_size,
        )
        
        # Analyze
        num_analyzed = analyzer.analyze_from_diarization(
            audio_path=audio_path,
            diarization_path=diarization_path,
            output_path=output_path,
            min_segment_duration=args.min_duration,
            max_segment_duration=args.max_duration,
            tracks_dir=tracks_dir,
            output_format=config.preprocess.output_format,
        )

        logger.info(f"Emotion analysis complete: {num_analyzed} segments")
        write_manifest(args.output_dir, manifest)
        
        # Cleanup
        del analyzer
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info(
            f"✓ Emotion step complete in {format_elapsed_time(time.time() - start_time)}"
        )
    except Exception as e:
        logger.error(f"Emotion analysis failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
