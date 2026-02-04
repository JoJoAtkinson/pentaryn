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
from concurrent.futures import ThreadPoolExecutor, as_completed
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

_BYTES_IN_MIB = 1024 * 1024


logger.info('attempt wed feb 4 -- 2 ')

# Import WavLMWrapper at module level (requires vox-profile in sys.path via Dockerfile)
try:
    from src.model.emotion.wavlm_emotion_dim import WavLMWrapper
    _WAVLM_AVAILABLE = True
except ImportError as e:
    logger.warning(f"WavLMWrapper import failed: {e}")
    _WAVLM_AVAILABLE = False
    WavLMWrapper = None


def _format_bytes(num_bytes: int) -> str:
    """Human-readable byte count for logs."""
    if num_bytes < _BYTES_IN_MIB:
        return f"{num_bytes / 1024:.1f} KiB"
    return f"{num_bytes / _BYTES_IN_MIB:.1f} MiB"


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
        
        if not _WAVLM_AVAILABLE or WavLMWrapper is None:
            raise ImportError(
                "WavLMWrapper not available. Ensure vox-profile is installed and in sys.path."
            )
        
        load_start = time.time()
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

    def _load_audio_full(self, audio_path: Path) -> Tuple[torch.Tensor, int]:
        """
        Load the entire audio file into memory (CPU) and return a mono waveform.

        This avoids extremely slow per-segment decoder startup/seek costs when
        extracting thousands of short segments.
        """
        logger.info(f"Loading audio into memory: {audio_path}")
        load_start = time.time()
        waveform, sr = torchaudio.load(str(audio_path))

        # Convert to mono once at load-time.
        if waveform.ndim == 2 and waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        if waveform.ndim == 2:
            waveform = waveform.squeeze(0)

        # Resample once (cheaper than per-segment resampling).
        if sr != self.sample_rate:
            logger.info(f"Resampling {audio_path.name}: {sr} Hz -> {self.sample_rate} Hz")
            resampler = torchaudio.transforms.Resample(sr, self.sample_rate)
            waveform = resampler(waveform.unsqueeze(0)).squeeze(0)
            sr = self.sample_rate

        waveform = waveform.contiguous()

        mem_bytes = int(waveform.numel() * waveform.element_size())
        duration_s = waveform.shape[0] / float(sr) if sr else 0.0
        logger.info(
            f"✓ Loaded {audio_path.name}: {duration_s/60:.1f} min, "
            f"{waveform.shape[0]:,} samples @ {sr} Hz, {_format_bytes(mem_bytes)} "
            f"in {format_elapsed_time(time.time() - load_start)}"
        )
        return waveform, sr

    def _extract_segment_from_waveform(
        self,
        waveform: torch.Tensor,
        sr: int,
        start_time: float,
        end_time: float,
        target_duration: Optional[float] = None,
    ) -> Optional[torch.Tensor]:
        """Slice a segment from an in-memory waveform and normalize it."""
        try:
            segment_duration = end_time - start_time
            if target_duration is None:
                target_duration = min(
                    segment_duration, self.max_audio_length / self.sample_rate
                )

            frame_offset = int(start_time * sr)
            num_frames = int(target_duration * sr)
            if num_frames <= 0:
                return None
            if frame_offset < 0:
                frame_offset = 0

            end_frame = frame_offset + num_frames
            segment = waveform[frame_offset:end_frame]
            if segment.numel() == 0:
                return None

            # Normalize per segment (matches previous behavior).
            peak = segment.abs().max()
            segment = segment / (peak + 1e-8)

            # Ensure we don't exceed model max length.
            if segment.shape[0] > self.max_audio_length:
                segment = segment[: self.max_audio_length]

            return segment
        except Exception as e:
            logger.error(f"Failed to slice segment {start_time:.2f}-{end_time:.2f}: {e}")
            return None
    
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
        log_progress: bool = True,
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
        progress_next = 10 if log_progress else 101
        
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
            
            # Debug logging for shape investigation
            logger.info(f"DEBUG: batch_tensor.shape = {batch_tensor.shape}, dtype = {batch_tensor.dtype}, device = {batch_tensor.device}")
            logger.info(f"DEBUG: batch_tensor min = {batch_tensor.min().item():.4f}, max = {batch_tensor.max().item():.4f}")
            logger.info(f"DEBUG: Non-zero samples per item: {[(batch_tensor[j] != 0).sum().item() for j in range(len(batch))]}")
            
            # Create attention mask manually (1 for real audio, 0 for padding)
            # This may be needed for proper batch processing
            attention_mask = torch.zeros(len(batch), max_len, dtype=torch.long, device=self.device)
            for j, seg in enumerate(batch):
                length = min(seg.shape[0], max_len)
                attention_mask[j, :length] = 1
            logger.info(f"DEBUG: attention_mask.shape = {attention_mask.shape}, sum per item = {attention_mask.sum(dim=1).tolist()}")
            
            # Forward pass through WavLMWrapper
            # Try passing attention_mask explicitly
            try:
                arousal, valence, dominance = self.model(batch_tensor, attention_mask=attention_mask)
            except TypeError:
                # Model doesn't accept attention_mask parameter
                logger.warning("Model doesn't accept attention_mask, trying without...")
                arousal, valence, dominance = self.model(batch_tensor)
            
            # Convert to list of dicts
            for j in range(len(batch)):
                results.append({
                    "arousal": float(arousal[j].cpu().item()),
                    "valence": float(valence[j].cpu().item()),
                    "dominance": float(dominance[j].cpu().item()),
                })
            
            completed = min(i + self.batch_size, total_segments)
            if log_progress:
                percent = int(completed * 100 / total_segments) if total_segments else 100
                if percent >= progress_next or completed == total_segments:
                    logger.info(
                        f"Emotion inference progress: {percent}% ({completed}/{total_segments} segments)"
                    )
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
        logger.info(
            f"CPU cores: {os.cpu_count() or 'unknown'}; "
            f"torch threads: {torch.get_num_threads()}; "
            f"device: {self.device}"
        )

        # Load diarization segments
        diarization_load_start = time.time()
        segments: List[dict] = []
        with open(diarization_path, "r") as f:
            for line_num, line in enumerate(f, start=1):
                try:
                    seg = json.loads(line)
                    segments.append(seg)
                except json.JSONDecodeError as e:
                    logger.warning(f"Skipping invalid JSON at line {line_num}: {e}")
        logger.info(
            f"Diarization load took {format_elapsed_time(time.time() - diarization_load_start)}"
        )
        logger.info(f"Loaded {len(segments)} speaker turns from diarization")

        # Filter segments by duration
        filter_start = time.time()
        valid_segments: List[dict] = []
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

        logger.info(f"Segment filtering took {format_elapsed_time(time.time() - filter_start)}")
        logger.info(f"Filtered to {len(valid_segments)} valid segments")
        if skipped_too_short:
            logger.info(
                f"  - Skipped {skipped_too_short} segments (< {min_segment_duration}s)"
            )
        if truncated:
            logger.info(f"  - Truncated {truncated} segments (> {max_segment_duration}s)")

        # Build track file lookup for multitrack mode
        track_scan_start = time.time()
        track_files: Dict[str, Path] = {}
        if tracks_dir:
            logger.info("Discovering multitrack audio files...")
            if not tracks_dir.exists():
                raise FileNotFoundError(f"Tracks directory not found: {tracks_dir}")

            for track_file in tracks_dir.glob(f"*.{output_format}"):
                track_key = track_file.stem.lower()
                track_files[track_key] = track_file
                logger.debug(f"  Registered track: {track_key} -> {track_file.name}")

            if not track_files:
                raise FileNotFoundError(
                    f"No {output_format} files found in tracks directory: {tracks_dir}"
                )

            logger.info(f"Discovered {len(track_files)} track files")
            logger.debug(f"Available track keys: {sorted(track_files.keys())}")
        logger.info(f"Track discovery took {format_elapsed_time(time.time() - track_scan_start)}")

        # Pre-load audio into memory to avoid extremely slow per-segment file access.
        preload_start = time.time()
        loaded_tracks: Dict[str, Tuple[torch.Tensor, int]] = {}
        single_waveform: Optional[torch.Tensor] = None
        single_sr: Optional[int] = None
        total_audio_mem_bytes = 0

        if tracks_dir:
            logger.info(f"Preloading {len(track_files)} track files into memory...")
            # Limit to 4 workers max - I/O bound tasks don't benefit from too many threads
            max_workers = min(len(track_files), 4, os.cpu_count() or 1)
            max_workers = max(1, max_workers)
            logger.info(f"Audio preload workers: {max_workers}")

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {
                    executor.submit(self._load_audio_full, path): key
                    for key, path in track_files.items()
                }
                for fut in as_completed(futures):
                    key = futures[fut]
                    waveform, sr = fut.result()
                    loaded_tracks[key] = (waveform, sr)
                    total_audio_mem_bytes += int(waveform.numel() * waveform.element_size())
        else:
            logger.info(f"Preloading single audio file into memory: {audio_path}")
            single_waveform, single_sr = self._load_audio_full(audio_path)
            total_audio_mem_bytes = int(single_waveform.numel() * single_waveform.element_size())

        logger.info(
            f"Audio preload took {format_elapsed_time(time.time() - preload_start)} "
            f"(total in-memory audio: {_format_bytes(total_audio_mem_bytes)})"
        )

        # Stream segments through: extract -> infer -> write
        logger.info("Processing segments (extract -> infer -> write)...")
        process_start = time.time()
        extract_total_s = 0.0
        infer_total_s = 0.0
        write_total_s = 0.0

        total_segments = len(valid_segments)
        progress_next = 5
        last_progress_log = time.time()
        skipped_missing_audio = 0
        skipped_extract_failed = 0
        analyzed = 0

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            for batch_start in range(0, total_segments, self.batch_size):
                batch_end = min(batch_start + self.batch_size, total_segments)
                batch_indices: List[int] = []
                batch_audio: List[torch.Tensor] = []

                # Extract batch audio (in-memory slicing)
                batch_extract_start = time.time()
                for i in range(batch_start, batch_end):
                    seg = valid_segments[i]

                    waveform = single_waveform
                    sr = single_sr

                    if tracks_dir:
                        speaker_key = seg.get("speaker") or seg.get("speaker_id") or seg.get("track")
                        if speaker_key and str(speaker_key).startswith("TRACK_"):
                            speaker_key = str(speaker_key).replace("TRACK_", "", 1)
                        if speaker_key:
                            loaded = loaded_tracks.get(str(speaker_key).lower())
                            if loaded is not None:
                                waveform, sr = loaded

                        if waveform is None or sr is None:
                            skipped_missing_audio += 1
                            continue

                    assert waveform is not None and sr is not None

                    audio = self._extract_segment_from_waveform(
                        waveform=waveform,
                        sr=sr,
                        start_time=seg["start"],
                        end_time=seg["end"],
                        target_duration=min(seg["end"] - seg["start"], max_segment_duration),
                    )
                    if audio is None:
                        skipped_extract_failed += 1
                        continue

                    batch_indices.append(i)
                    batch_audio.append(audio)

                extract_total_s += time.time() - batch_extract_start

                if batch_audio:
                    # Inference on this batch
                    batch_infer_start = time.time()
                    emotions = self.analyze_segments(batch_audio, log_progress=False)
                    infer_total_s += time.time() - batch_infer_start

                    # Write outputs for this batch
                    batch_write_start = time.time()
                    for idx, emotion in zip(batch_indices, emotions):
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
                    write_total_s += time.time() - batch_write_start

                    analyzed += len(emotions)

                # Progress logging (time-based + % based) so long runs don't appear "hung".
                processed = batch_end
                percent = int(processed * 100 / total_segments) if total_segments else 100
                now = time.time()
                if percent >= progress_next or (now - last_progress_log) >= 60 or processed == total_segments:
                    elapsed = now - process_start
                    rate = processed / elapsed if elapsed > 0 else 0.0
                    remaining = total_segments - processed
                    eta_s = (remaining / rate) if rate > 0 else None
                    eta_str = format_elapsed_time(eta_s) if eta_s is not None else "unknown"
                    logger.info(
                        f"Progress: {percent}% ({processed}/{total_segments} segments), "
                        f"analyzed={analyzed}, skipped_missing_audio={skipped_missing_audio}, "
                        f"skipped_extract_failed={skipped_extract_failed}, "
                        f"rate={rate:.2f} seg/s, ETA={eta_str}"
                    )
                    progress_next += 5
                    last_progress_log = now

        if analyzed == 0:
            raise RuntimeError("No audio segments analyzed - cannot write emotion outputs")

        # Clear loaded audio from memory
        loaded_tracks.clear()
        if single_waveform is not None:
            del single_waveform
        
        logger.info(f"✓ Wrote {analyzed} emotion records to {output_path}")
        logger.info(
            f"Timing breakdown: "
            f"preload={format_elapsed_time(time.time() - preload_start)}, "
            f"extract={format_elapsed_time(extract_total_s)}, "
            f"infer={format_elapsed_time(infer_total_s)}, "
            f"write={format_elapsed_time(write_total_s)}, "
            f"total={format_elapsed_time(time.time() - process_start)}"
        )
        
        # Resource usage summary
        if self.device == "cuda" and torch.cuda.is_available():
            gpu_mem_allocated = torch.cuda.memory_allocated() / _BYTES_IN_MIB
            gpu_mem_reserved = torch.cuda.memory_reserved() / _BYTES_IN_MIB
            logger.info(
                f"GPU memory: {gpu_mem_allocated:.1f} MiB allocated, "
                f"{gpu_mem_reserved:.1f} MiB reserved"
            )
        
        logger.info(
            f"Summary: {len(segments)} input turns -> {len(valid_segments)} valid -> {analyzed} analyzed"
        )
        return analyzed


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
        default=3.0,
        help="Min segment duration in seconds (default: 3.0, model trained on 3-15s)",
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

        if should_skip(output_dir, manifest, [output_path]):
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
        write_manifest(output_dir, manifest)
        
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
