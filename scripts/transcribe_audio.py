#!/usr/bin/env python3
"""
Transcribe M4A audio files with speaker diarization using WhisperX.

Requirements:
    pip install whisperx pyannote.audio torch

Setup:
    1. Get HuggingFace token: https://huggingface.co/settings/tokens
    2. Accept pyannote model terms:
       - https://huggingface.co/pyannote/speaker-diarization-3.1
       - https://huggingface.co/pyannote/segmentation-3.0
    3. Set environment variable: export HF_TOKEN="your_token_here"

Usage:
    python scripts/transcribe_audio.py path/to/recording.m4a
    python scripts/transcribe_audio.py path/to/folder/*.m4a
"""

import argparse
from contextlib import contextmanager
import json
import os
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

# Check for required packages
try:
    import whisperx
    import torch
except ImportError:
    print("Error: Required packages not installed.", file=sys.stderr)
    print("Install with: pip install whisperx pyannote.audio torch", file=sys.stderr)
    sys.exit(1)


def _format_elapsed(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


@contextmanager
def _heartbeat(label: str, interval_s: float) -> Any:
    """
    Periodically print a status line while a long operation runs.
    This is a lightweight alternative to a real progress bar for libraries
    (like pyannote diarization) that don't report progress.
    """
    if interval_s <= 0:
        yield
        return

    stop = threading.Event()
    start = time.monotonic()

    def _worker() -> None:
        while not stop.wait(interval_s):
            elapsed = time.monotonic() - start
            print(f"  ... {label} ({_format_elapsed(elapsed)} elapsed)", flush=True)

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=0.5)


def _configure_torch_safe_globals() -> None:
    """
    PyTorch 2.6+ defaults `torch.load(weights_only=True)`, which can reject some
    pyannote/Lightning checkpoints unless certain classes are allowlisted.
    """
    try:
        import torch.serialization
        import torch.torch_version
    except Exception:
        return

    safe_globals = []
    
    # Add OmegaConf classes (for Lightning checkpoints)
    try:
        from omegaconf import DictConfig, ListConfig  # type: ignore
        safe_globals.extend([DictConfig, ListConfig])
    except Exception:
        pass
    
    # Add TorchVersion (required by pyannote models)
    try:
        safe_globals.append(torch.torch_version.TorchVersion)
    except Exception:
        pass
    
    # Add pyannote classes (required for speaker diarization models)
    try:
        import pyannote.audio.core.task as task_module
        from pyannote.audio.core.model import Model
        from pyannote.audio.core.pipeline import Pipeline
        # Add all task classes
        task_classes = [getattr(task_module, name) for name in dir(task_module) 
                       if isinstance(getattr(task_module, name), type)]
        safe_globals.extend(task_classes)
        safe_globals.extend([Model, Pipeline])
    except Exception:
        pass

    # Register all safe globals
    if safe_globals:
        try:
            torch.serialization.add_safe_globals(safe_globals)
        except Exception:
            # Older torch versions may not have add_safe_globals
            pass

def transcribe_with_diarization(
    audio_path: str,
    model_size: str = "base",
    device: str = "cpu",
    compute_type: str = "int8",
    hf_token: str | None = None,
    torch_device: str | None = None,
    num_speakers: int | None = 4,
    diarize_heartbeat_secs: float = 15.0,
) -> List[Dict[str, Any]]:
    """
    Transcribe audio file with speaker diarization.
    
    Args:
        audio_path: Path to M4A or other audio file
        model_size: Whisper model size (tiny, base, small, medium, large-v2, large-v3)
        device: WhisperX ASR device ("cpu" or "cuda")
        compute_type: "int8", "float16", or "float32"
        hf_token: HuggingFace token for pyannote models
        torch_device: Torch device for alignment/diarization ("cpu", "cuda", or "mps")
        num_speakers: Expected number of speakers (diarization); set to None to auto-detect
        diarize_heartbeat_secs: Print a status line every N seconds during diarization (0 disables)
    
    Returns:
        List of segments with speaker, text, start, and end times
    """
    torch_device = torch_device or device

    print(f"Loading Whisper model: {model_size}")
    # Use Silero VAD by default to avoid PyTorch 2.6+ `weights_only` issues in pyannote VAD checkpoints.
    model = whisperx.load_model(model_size, device, language="en", compute_type=compute_type, vad_method="silero")
    
    print(f"Transcribing: {audio_path}")
    audio = whisperx.load_audio(audio_path)
    try:
        duration_s = float(len(audio)) / 16000.0
        print(f"Audio duration: ~{duration_s/60.0:.1f} min")
    except Exception:
        pass
    print("Running VAD + transcription (first progress update may take a while)...")
    # Note: WhisperX progress reporting is most accurate with batch_size=1.
    result = model.transcribe(audio, batch_size=16, print_progress=True, combined_progress=True)
    
    # Align whisper output for word-level timestamps
    print("Aligning transcript...")
    model_a, metadata = whisperx.load_align_model(
        language_code=result["language"], device=torch_device
    )
    result = whisperx.align(
        result["segments"],
        model_a,
        metadata,
        audio,
        torch_device,
        return_char_alignments=False,
        print_progress=True,
        combined_progress=True,
    )
    
    # Perform speaker diarization
    if hf_token:
        print("Performing speaker diarization...")
        # WhisperX moved DiarizationPipeline to whisperx.diarize in newer versions.
        try:
            from whisperx.diarize import DiarizationPipeline  # type: ignore
        except ImportError:
            DiarizationPipeline = getattr(whisperx, "DiarizationPipeline", None)
            if DiarizationPipeline is None:
                raise RuntimeError(
                    "WhisperX DiarizationPipeline is not available in this environment. "
                    "Upgrade whisperx or install diarization dependencies."
                )

        try:
            # Force CPU for diarization to avoid MPS compatibility issues
            diarize_device = "cpu" if torch_device == "mps" else torch_device
            if diarize_device == "cpu":
                print("Note: diarization on CPU can be very slow for long recordings.")
                print("      First run may also download models to ~/.cache/huggingface/hub.")
            with _heartbeat("Loading diarization model", diarize_heartbeat_secs):
                diarize_model = DiarizationPipeline(use_auth_token=hf_token, device=diarize_device)
        except Exception as e:
            print(f"\n⚠️  Diarization model loading failed: {e}")
            print("Common causes:")
            print("  1. Haven't accepted BOTH model terms:")
            print("     - https://huggingface.co/pyannote/speaker-diarization-3.1 (click 'Agree and access')")
            print("     - https://huggingface.co/pyannote/segmentation-3.0 (click 'Agree and access')")
            print("  2. Invalid HuggingFace token")
            print("  3. Network connection issues")
            print("  4. Try clearing cache: rm -rf ~/.cache/huggingface/hub")
            print("\nContinuing without speaker labels...\n")
            diarize_model = None
        
        if diarize_model:
            try:
                hint = f"num_speakers={num_speakers}" if num_speakers is not None else "auto speakers"
                print(f"Running diarization ({hint})... (Ctrl-C to skip diarization)")
                diarize_kwargs = {"num_speakers": num_speakers} if num_speakers is not None else {}
                with _heartbeat("Diarization running", diarize_heartbeat_secs):
                    diarize_segments = diarize_model(audio, **diarize_kwargs)
                result = whisperx.assign_word_speakers(diarize_segments, result)
            except KeyboardInterrupt:
                print("\n⚠️  Diarization interrupted; continuing without speaker labels.\n")
    else:
        print("Warning: No HF_TOKEN provided, skipping speaker diarization")
        print("Set HF_TOKEN environment variable to enable speaker identification")
    
    # Format output
    segments = []
    for seg in result["segments"]:
        segments.append({
            "speaker": seg.get("speaker", "UNKNOWN"),
            "text": seg["text"].strip(),
            "start": seg["start"],
            "end": seg["end"],
        })
    
    return segments


@dataclass(frozen=True)
class DiarizationTurn:
    start: float
    end: float
    speaker: str


def _load_jsonl_segments(jsonl_path: Path) -> List[Dict[str, Any]]:
    """
    Load segments from our JSONL transcript format.
    Expected keys per line: speaker, text, start, end.
    """
    if not jsonl_path.exists():
        return []

    segments: List[Dict[str, Any]] = []
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                seg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(seg, dict):
                continue
            if "text" not in seg or "start" not in seg or "end" not in seg:
                continue
            segments.append(seg)

    # De-dup consecutive identical lines (older versions accidentally wrote each line twice).
    deduped: List[Dict[str, Any]] = []
    prev_key: tuple[Any, Any, Any] | None = None
    for seg in segments:
        key = (seg.get("start"), seg.get("end"), seg.get("text"))
        if key == prev_key:
            continue
        deduped.append(seg)
        prev_key = key
    return deduped


def _extract_diarization_turns(diarization: Any) -> List[DiarizationTurn]:
    """
    Normalize WhisperX diarization output into a list of speaker turns.
    Supports pyannote Annotation-like objects, list[dict], and pandas DataFrame-like.
    """
    if diarization is None:
        return []

    turns: List[DiarizationTurn] = []

    # pyannote.core.Annotation-like
    itertracks = getattr(diarization, "itertracks", None)
    if callable(itertracks):
        for segment, _, label in diarization.itertracks(yield_label=True):
            try:
                turns.append(DiarizationTurn(float(segment.start), float(segment.end), str(label)))
            except Exception:
                continue
        return turns

    # list of dicts
    if isinstance(diarization, list):
        for row in diarization:
            if not isinstance(row, dict):
                continue
            if "start" in row and "end" in row and "speaker" in row:
                try:
                    turns.append(DiarizationTurn(float(row["start"]), float(row["end"]), str(row["speaker"])))
                except Exception:
                    continue
        return turns

    # pandas DataFrame-like
    iterrows = getattr(diarization, "iterrows", None)
    if callable(iterrows):
        for _, row in diarization.iterrows():
            try:
                start = float(row["start"])
                end = float(row["end"])
                speaker = str(row["speaker"])
            except Exception:
                continue
            turns.append(DiarizationTurn(start, end, speaker))
        return turns

    return []


def _assign_speakers_by_overlap(
    segments: List[Dict[str, Any]],
    turns: List[DiarizationTurn],
    unknown_label: str = "UNKNOWN",
) -> List[Dict[str, Any]]:
    """
    Assign a single speaker label to each transcript segment by maximum time overlap
    against diarization turns. Works with segment-level timestamps (no word alignment).
    """
    if not turns:
        return segments

    def overlap(a0: float, a1: float, b0: float, b1: float) -> float:
        return max(0.0, min(a1, b1) - max(a0, b0))

    assigned: List[Dict[str, Any]] = []
    for seg in segments:
        try:
            start = float(seg["start"])
            end = float(seg["end"])
        except Exception:
            assigned.append(seg)
            continue

        best_speaker = seg.get("speaker", unknown_label) or unknown_label
        best_overlap = 0.0
        for t in turns:
            o = overlap(start, end, t.start, t.end)
            if o > best_overlap:
                best_overlap = o
                best_speaker = t.speaker

        new_seg = dict(seg)
        new_seg["speaker"] = best_speaker
        assigned.append(new_seg)

    return assigned


def save_transcript(
    segments: List[Dict[str, Any]],
    output_path: Path,
    format: str = "jsonl"
) -> None:
    """Save transcript to file in specified format."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    if format == "jsonl":
        with open(output_path, "w", encoding="utf-8") as f:
            for seg in segments:
                f.write(json.dumps(seg, ensure_ascii=False) + "\n")
    elif format == "json":
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(segments, f, indent=2, ensure_ascii=False)
    elif format == "txt":
        with open(output_path, "w", encoding="utf-8") as f:
            current_speaker = None
            for seg in segments:
                if seg["speaker"] != current_speaker:
                    current_speaker = seg["speaker"]
                    f.write(f"\n[{current_speaker}]\n")
                f.write(f"{seg['text']}\n")
    
    print(f"Saved transcript: {output_path}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Transcribe audio files with WhisperX (optional speaker diarization).")
    parser.add_argument(
        "audio_files",
        nargs="+", 
        help="Input audio files (e.g., recordings/session-01.m4a)"
        )
    parser.add_argument(
        "--model-size",
        default="medium",
        help="Whisper model size (tiny, base, small, medium, large-v2, large-v3). Default: medium",
    )
    parser.add_argument(
        "--no-diarize",
        action="store_true",
        help="Skip speaker diarization even if HF_TOKEN is set (faster).",
    )
    parser.add_argument(
        "--diarize-heartbeat-secs",
        type=float,
        default=15.0,
        help="Print a status line every N seconds while diarization loads/runs (0 to disable). Default: 15",
    )
    parser.add_argument(
        "--num-speakers",
        type=int,
        default=4,
        help="Expected number of speakers for diarization. Default: 4. Use 0 to auto-detect.",
    )
    parser.add_argument(
        "--output-dir",
        default="recordings_transcripts",
        help="Directory for output files. Default: recordings_transcripts",
    )
    parser.add_argument(
        "--reuse-jsonl",
        action="store_true",
        help="If output JSONL already exists, reuse it and (if diarization is enabled) only run speaker identification.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing outputs (otherwise existing speaker-labeled JSONL is left as-is).",
    )
    args = parser.parse_args()

    # Make progress prints show up promptly (especially when output is piped/captured).
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass

    _configure_torch_safe_globals()
    
    # Get HuggingFace token from environment
    hf_token = os.environ.get("HF_TOKEN")
    if args.no_diarize:
        hf_token = None
        print("Speaker diarization: disabled (--no-diarize)")
    elif not hf_token:
        print("Warning: HF_TOKEN not set. Speaker diarization will be skipped.")
        print("To enable diarization:")
        print("  1. Get token: https://huggingface.co/settings/tokens")
        print("  2. Accept model terms: https://huggingface.co/pyannote/speaker-diarization-3.1")
        print("  3. Set: export HF_TOKEN='your_token_here'")
        print()
    
    # Detect device (WhisperX ASR runs on CPU or CUDA; MPS is not supported by faster-whisper/CTranslate2).
    if torch.cuda.is_available():
        device = "cuda"
        compute_type = "float16"
    else:
        if torch.backends.mps.is_available():
            print("Note: MPS detected, but WhisperX transcription runs on CPU (no MPS support).")
        device = "cpu"
        compute_type = "int8"
    
    torch_device = device
    print(f"Using ASR device: {device} (compute_type: {compute_type})")
    
    # Process each audio file
    audio_files = [Path(arg) for arg in args.audio_files]
    for audio_path in audio_files:
        if not audio_path.exists():
            print(f"Error: File not found: {audio_path}", file=sys.stderr)
            continue
        
        print(f"\n{'='*60}")
        print(f"Processing: {audio_path.name}")
        print(f"{'='*60}")
        
        try:
            # Save outputs
            output_dir = Path(args.output_dir)
            base_name = audio_path.stem
            jsonl_path = output_dir / f"{base_name}.jsonl"
            txt_path = output_dir / f"{base_name}.txt"

            # Fast path: reuse existing transcript to add speaker labels without re-transcribing.
            if args.reuse_jsonl and jsonl_path.exists() and not args.overwrite:
                existing = _load_jsonl_segments(jsonl_path)
                if existing:
                    have_speakers = all((seg.get("speaker") not in (None, "", "UNKNOWN")) for seg in existing)
                    if hf_token and not have_speakers:
                        print(f"Reusing existing transcript: {jsonl_path}")
                        print("Running diarization only (no ASR/alignment)...")

                        audio = whisperx.load_audio(str(audio_path))

                        # WhisperX moved DiarizationPipeline to whisperx.diarize in newer versions.
                        try:
                            from whisperx.diarize import DiarizationPipeline  # type: ignore
                        except ImportError:
                            DiarizationPipeline = getattr(whisperx, "DiarizationPipeline", None)
                            if DiarizationPipeline is None:
                                raise RuntimeError(
                                    "WhisperX DiarizationPipeline is not available in this environment. "
                                    "Upgrade whisperx or install diarization dependencies."
                                )

                        diarize_device = "cpu" if torch_device == "mps" else torch_device
                        if diarize_device == "cpu":
                            print("Note: diarization on CPU can be very slow for long recordings.")
                            print("      First run may also download models to ~/.cache/huggingface/hub.")
                        with _heartbeat("Loading diarization model", args.diarize_heartbeat_secs):
                            diarize_model = DiarizationPipeline(use_auth_token=hf_token, device=diarize_device)
                        diarize_kwargs = {"num_speakers": (None if args.num_speakers == 0 else args.num_speakers)}
                        diarize_kwargs = {k: v for k, v in diarize_kwargs.items() if v is not None}
                        try:
                            hint = f"num_speakers={diarize_kwargs.get('num_speakers', 'auto')}"
                            print(f"Running diarization ({hint})... (Ctrl-C to skip diarization)")
                            with _heartbeat("Diarization running", args.diarize_heartbeat_secs):
                                diarization = diarize_model(audio, **diarize_kwargs)
                            turns = _extract_diarization_turns(diarization)
                            segments = _assign_speakers_by_overlap(existing, turns)
                        except KeyboardInterrupt:
                            print("\n⚠️  Diarization interrupted; leaving existing transcript unchanged.\n")
                            segments = existing

                        save_transcript(segments, jsonl_path, format="jsonl")
                        save_transcript(segments, txt_path, format="txt")
                        print(f"✓ Updated speakers: {len(segments)} segments")
                        continue

                    if have_speakers:
                        print(f"Skipping (already speaker-labeled): {jsonl_path}")
                        continue

            # Full pipeline: transcribe + (optional) diarize
            segments = transcribe_with_diarization(
                str(audio_path),
                model_size=args.model_size,
                device=device,
                compute_type=compute_type,
                hf_token=hf_token,
                torch_device=torch_device,
                num_speakers=None if args.num_speakers == 0 else args.num_speakers,
                diarize_heartbeat_secs=args.diarize_heartbeat_secs,
            )
            
            # Save JSONL (primary format)
            save_transcript(segments, jsonl_path, format="jsonl")
            
            # Also save readable TXT version
            save_transcript(segments, txt_path, format="txt")
            
            print(f"✓ Completed: {len(segments)} segments")
            
        except Exception as e:
            print(f"Error processing {audio_path}: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            continue


if __name__ == "__main__":
    main()
