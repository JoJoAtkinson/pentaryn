#!/usr/bin/env python3
"""
Wrapper script for running transcribe_audio.py in Azure ML.
Validates CUDA availability and handles Azure-specific setup.
"""

import argparse
import os
import sys
import torch
from pathlib import Path


def validate_cuda():
    """Validate CUDA is available and working. Exit with error if not."""
    print("="*60)
    print("CUDA Validation")
    print("="*60)
    
    if not torch.cuda.is_available():
        print("ERROR: CUDA is not available!")
        print("This script requires GPU/CUDA support.")
        print("torch.cuda.is_available() returned False")
        print("\nPossible causes:")
        print("  - GPU compute not allocated")
        print("  - PyTorch CPU-only version installed")
        print("  - CUDA drivers not installed")
        sys.exit(1)
    
    print(f"✓ CUDA is available")
    print(f"✓ CUDA version: {torch.version.cuda}")
    print(f"✓ GPU count: {torch.cuda.device_count()}")
    
    for i in range(torch.cuda.device_count()):
        props = torch.cuda.get_device_properties(i)
        print(f"✓ GPU {i}: {props.name}")
        print(f"  - VRAM: {props.total_memory / 1024**3:.1f} GB")
        print(f"  - Compute capability: {props.major}.{props.minor}")
    
    # Test CUDA with a simple tensor operation
    try:
        test_tensor = torch.randn(100, 100).cuda()
        result = test_tensor @ test_tensor.t()
        print(f"✓ CUDA tensor operations working")
        del test_tensor, result
        torch.cuda.empty_cache()
    except Exception as e:
        print(f"ERROR: CUDA tensor test failed: {e}")
        sys.exit(1)
    
    print("="*60)
    print()


def setup_huggingface_cache():
    """Setup HuggingFace cache directory to use Azure ML mounted storage."""
    # Check if HF_HOME is already set (from environment or mounted storage)
    hf_home = os.environ.get("HF_HOME")
    
    # Check for models folder in current directory (Azure ML mounts)
    models_dir = Path("models")
    if models_dir.exists() and models_dir.is_dir():
        hf_cache = models_dir / "huggingface"
        hf_cache.mkdir(parents=True, exist_ok=True)
        os.environ["HF_HOME"] = str(hf_cache)
        os.environ["TRANSFORMERS_CACHE"] = str(hf_cache / "transformers")
        os.environ["HF_DATASETS_CACHE"] = str(hf_cache / "datasets")
        print(f"✓ HuggingFace cache set to: {hf_cache}")
        return str(hf_cache)
    
    # Fallback to default cache
    if not hf_home:
        print("Note: Using default HuggingFace cache (~/.cache/huggingface)")
    else:
        print(f"✓ HuggingFace cache: {hf_home}")
    
    return hf_home


def main():
    parser = argparse.ArgumentParser(
        description="Azure ML wrapper for audio transcription with CUDA validation"
    )
    parser.add_argument(
        "audio_file",
        help="Path to audio file (relative to mounted input folder)"
    )
    parser.add_argument(
        "--output-dir",
        default="outputs",
        help="Output directory (default: outputs)"
    )
    parser.add_argument(
        "--model-size",
        default="large-v3",
        help="Whisper model size (default: large-v3)"
    )
    parser.add_argument(
        "--min-speakers",
        type=int,
        default=4,
        help="Minimum number of speakers (default: 4)"
    )
    parser.add_argument(
        "--max-speakers",
        type=int,
        default=10,
        help="Maximum number of speakers (default: 10)"
    )
    parser.add_argument(
        "--no-diarize",
        action="store_true",
        help="Skip speaker diarization"
    )
    
    args = parser.parse_args()
    
    # Validate CUDA before proceeding
    validate_cuda()
    
    # Setup HuggingFace cache
    setup_huggingface_cache()
    
    # Check for HuggingFace token
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token and not args.no_diarize:
        print("WARNING: HF_TOKEN not set. Speaker diarization will be skipped.")
        print("To enable diarization, set HF_TOKEN as an environment variable in Azure ML.")
        print()
    
    # Validate input file exists
    audio_path = Path(args.audio_file)
    if not audio_path.exists():
        print(f"ERROR: Audio file not found: {audio_path}")
        sys.exit(1)
    
    print(f"Processing: {audio_path}")
    print(f"Output directory: {args.output_dir}")
    print()
    
    # Import and run the actual transcription script
    # We need to add the parent directory to the path to import transcribe_audio
    script_dir = Path(__file__).parent
    sys.path.insert(0, str(script_dir))
    
    # Import the transcription module
    import transcribe_audio
    
    # Build arguments for transcribe_audio
    transcribe_args = [
        str(audio_path),
        "--model-size", args.model_size,
        "--output-dir", args.output_dir,
        "--min-speakers", str(args.min_speakers),
        "--max-speakers", str(args.max_speakers),
    ]
    
    if args.no_diarize:
        transcribe_args.append("--no-diarize")
    
    # Override sys.argv and run
    original_argv = sys.argv
    try:
        sys.argv = ["transcribe_audio.py"] + transcribe_args
        transcribe_audio.main()
    finally:
        sys.argv = original_argv
    
    print()
    print("="*60)
    print("Transcription completed successfully")
    print("="*60)


if __name__ == "__main__":
    main()
