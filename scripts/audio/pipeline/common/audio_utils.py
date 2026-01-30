"""Audio utilities for loading, processing, and chunking audio files."""

import subprocess
from pathlib import Path
from typing import Optional, Tuple, List
import numpy as np


def load_audio(
    audio_path: Path,
    sample_rate: int = 16000,
    mono: bool = True,
) -> Tuple[np.ndarray, int]:
    """
    Load audio file using FFmpeg.
    
    Args:
        audio_path: Path to audio file
        sample_rate: Target sample rate (default: 16000 Hz)
        mono: Convert to mono if True
        
    Returns:
        Tuple of (audio_array, sample_rate)
    """
    import librosa
    
    audio, sr = librosa.load(
        str(audio_path),
        sr=sample_rate,
        mono=mono,
    )
    
    return audio, sr


def get_audio_duration(audio_path: Path) -> float:
    """
    Get audio duration in seconds using FFprobe.
    
    Args:
        audio_path: Path to audio file
        
    Returns:
        Duration in seconds
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(audio_path),
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def resample_audio(
    audio: np.ndarray,
    orig_sr: int,
    target_sr: int,
) -> np.ndarray:
    """
    Resample audio to target sample rate.
    
    Args:
        audio: Audio array
        orig_sr: Original sample rate
        target_sr: Target sample rate
        
    Returns:
        Resampled audio array
    """
    import librosa
    
    if orig_sr == target_sr:
        return audio
        
    return librosa.resample(audio, orig_sr=orig_sr, target_sr=target_sr)


def chunk_audio(
    audio: np.ndarray,
    sample_rate: int,
    chunk_duration_seconds: float,
    overlap_seconds: float = 0.0,
) -> List[Tuple[np.ndarray, float, float]]:
    """
    Split audio into chunks with optional overlap.
    
    Args:
        audio: Audio array
        sample_rate: Sample rate
        chunk_duration_seconds: Duration of each chunk in seconds
        overlap_seconds: Overlap between chunks in seconds
        
    Returns:
        List of (chunk_audio, start_time, end_time) tuples
    """
    chunk_samples = int(chunk_duration_seconds * sample_rate)
    overlap_samples = int(overlap_seconds * sample_rate)
    step_samples = chunk_samples - overlap_samples
    
    chunks = []
    total_samples = len(audio)
    
    start_idx = 0
    while start_idx < total_samples:
        end_idx = min(start_idx + chunk_samples, total_samples)
        chunk = audio[start_idx:end_idx]
        
        start_time = start_idx / sample_rate
        end_time = end_idx / sample_rate
        
        chunks.append((chunk, start_time, end_time))
        
        if end_idx >= total_samples:
            break
            
        start_idx += step_samples
    
    return chunks


def normalize_audio_ffmpeg(
    input_path: Path,
    output_path: Path,
    sample_rate: int = 16000,
    channels: int = 1,
    loudnorm_target_lufs: float = -23.0,
    loudnorm_range_lu: float = 11.0,
    true_peak_db: float = -1.5,
    highpass_hz: Optional[int] = 80,
    two_pass: bool = True,
    output_format: str = "flac",
) -> None:
    """
    Normalize audio using FFmpeg loudnorm filter (EBU R128).
    
    Args:
        input_path: Input audio file
        output_path: Output normalized audio file
        sample_rate: Target sample rate
        channels: Number of channels (1=mono, 2=stereo)
        loudnorm_target_lufs: Target integrated loudness (LUFS)
        loudnorm_range_lu: Target loudness range (LU)
        true_peak_db: Maximum true peak level (dBFS)
        highpass_hz: High-pass filter cutoff (Hz), None to disable
        two_pass: Use two-pass normalization for accurate targeting
        output_format: Output format (flac, wav)
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    if two_pass:
        # First pass: measure loudness
        measure_cmd = [
            "ffmpeg", "-i", str(input_path),
            "-af", f"loudnorm=I={loudnorm_target_lufs}:LRA={loudnorm_range_lu}:TP={true_peak_db}:print_format=json",
            "-f", "null", "-"
        ]
        
        result = subprocess.run(
            measure_cmd,
            capture_output=True,
            text=True,
            check=True,
        )
        
        # Parse measured values from stderr (FFmpeg logs to stderr)
        import json
        import re
        
        # Extract JSON from stderr
        json_match = re.search(r'\{[^}]+\}', result.stderr.replace('\n', ''))
        if json_match:
            measured = json.loads(json_match.group())
            input_i = measured.get("input_i", str(loudnorm_target_lufs))
            input_lra = measured.get("input_lra", str(loudnorm_range_lu))
            input_tp = measured.get("input_tp", str(true_peak_db))
            input_thresh = measured.get("input_thresh", "-70.0")
            target_offset = measured.get("target_offset", "0.0")
            
            # Second pass: apply normalization with measured values
            filter_parts = [
                f"loudnorm=I={loudnorm_target_lufs}:LRA={loudnorm_range_lu}:TP={true_peak_db}",
                f":measured_I={input_i}:measured_LRA={input_lra}:measured_TP={input_tp}",
                f":measured_thresh={input_thresh}:offset={target_offset}:linear=true",
            ]
        else:
            # Fallback to single-pass if JSON parsing fails
            filter_parts = [
                f"loudnorm=I={loudnorm_target_lufs}:LRA={loudnorm_range_lu}:TP={true_peak_db}"
            ]
    else:
        # Single-pass normalization
        filter_parts = [
            f"loudnorm=I={loudnorm_target_lufs}:LRA={loudnorm_range_lu}:TP={true_peak_db}"
        ]
    
    # Add high-pass filter if specified
    if highpass_hz:
        filter_parts.insert(0, f"highpass=f={highpass_hz}")
    
    filter_chain = ",".join(filter_parts)
    
    # Build final command
    cmd = [
        "ffmpeg", "-y",  # Overwrite output
        "-i", str(input_path),
        "-af", filter_chain,
        "-ar", str(sample_rate),
        "-ac", str(channels),
    ]
    
    if output_format == "flac":
        cmd.extend(["-c:a", "flac", "-compression_level", "5"])
    elif output_format == "wav":
        cmd.extend(["-c:a", "pcm_s16le"])
    
    cmd.append(str(output_path))
    
    subprocess.run(cmd, check=True, capture_output=True)
