#!/usr/bin/env python3
"""
Submit audio transcription job to Azure ML.
Handles upload, job submission, monitoring, and download.

Usage:
    python submit_transcription.py /path/to/audio.m4a
    python submit_transcription.py /path/to/audio.m4a --model-size large-v3 --no-diarize
"""

import argparse
import os
import sys
import time
from pathlib import Path
from datetime import datetime

try:
    from azure.ai.ml import MLClient, command, Input, Output
    from azure.ai.ml.constants import AssetTypes
    from azure.identity import DefaultAzureCredential, InteractiveBrowserCredential
    from azure.storage.blob import BlobServiceClient
except ImportError:
    print("ERROR: Azure ML SDK not installed")
    print("Install with: pip install azure-ai-ml azure-identity azure-storage-blob")
    sys.exit(1)

from azure_ml_config import (
    SUBSCRIPTION_ID,
    RESOURCE_GROUP,
    WORKSPACE_NAME,
    COMPUTE_NAME,
    ENVIRONMENT_NAME,
    STORAGE_ACCOUNT,
    CONTAINER_NAME,
    INPUT_FOLDER,
    OUTPUT_FOLDER,
    EXPERIMENT_NAME,
)


def get_ml_client():
    """Get authenticated ML client."""
    try:
        credential = DefaultAzureCredential()
        credential.get_token("https://management.azure.com/.default")
    except Exception:
        credential = InteractiveBrowserCredential()
    
    return MLClient(
        credential=credential,
        subscription_id=SUBSCRIPTION_ID,
        resource_group_name=RESOURCE_GROUP,
        workspace_name=WORKSPACE_NAME,
    )


def upload_audio_file(audio_path: Path, ml_client) -> str:
    """Upload audio file to Azure blob storage and return data URI."""
    print(f"\nUploading audio file: {audio_path.name}")
    print(f"  Size: {audio_path.stat().st_size / 1024**2:.1f} MB")
    
    # Get the default datastore
    datastore = ml_client.datastores.get_default()
    
    # Create data asset for the audio file
    # Sanitize filename: replace spaces and special chars with dashes/underscores
    safe_stem = audio_path.stem.replace(" ", "-").replace(".", "_")
    # Remove any remaining invalid characters
    safe_stem = "".join(c if c.isalnum() or c in "-_" else "_" for c in safe_stem)
    data_name = f"audio-{safe_stem}"
    
    try:
        from azure.ai.ml.entities import Data
        
        audio_data = Data(
            path=str(audio_path),
            type=AssetTypes.URI_FILE,
            name=data_name,
            description=f"Audio file for transcription: {audio_path.name}",
        )
        
        audio_data = ml_client.data.create_or_update(audio_data)
        print(f"✓ Uploaded to: {audio_data.path}")
        return audio_data.path
        
    except Exception as e:
        print(f"ERROR: Upload failed: {e}")
        sys.exit(1)


def submit_job(ml_client, audio_uri: str, args):
    """Submit transcription job to Azure ML."""
    print("\nSubmitting transcription job...")
    
    # Get HuggingFace token from environment
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token and not args.no_diarize:
        print("WARNING: HF_TOKEN not set. Speaker diarization will be skipped.")
        print("Set HF_TOKEN environment variable to enable speaker identification.")
        response = input("Continue without diarization? [y/N]: ")
        if response.lower() != 'y':
            print("Cancelled.")
            sys.exit(0)
    
    # Build command arguments with proper quoting
    cmd_parts = [
        "python azure_transcribe_wrapper.py",
        "\"${{inputs.audio_file}}\"",
        "--output-dir", "\"${{outputs.transcripts}}\"",
        "--model-size", args.model_size,
        "--min-speakers", str(args.min_speakers),
        "--max-speakers", str(args.max_speakers),
    ]
    
    if args.no_diarize:
        cmd_parts.append("--no-diarize")
    
    command_str = " ".join(cmd_parts)
    
    # Get environment
    environment = f"{ENVIRONMENT_NAME}@latest"
    
    # Create command job
    job = command(
        code="./scripts/audio",  # Upload only the audio scripts directory
        command=command_str,
        environment=environment,
        compute=COMPUTE_NAME,
        inputs={
            "audio_file": Input(type=AssetTypes.URI_FILE, path=audio_uri),
        },
        outputs={
            "transcripts": Output(type=AssetTypes.URI_FOLDER),
        },
        environment_variables={
            "HF_TOKEN": hf_token if hf_token else "",
            "PYTORCH_CUDA_ALLOC_CONF": "max_split_size_mb:512",  # Help with memory fragmentation
        },
        display_name=f"transcribe-{Path(audio_uri).stem}",
        experiment_name=EXPERIMENT_NAME,
        description=f"Audio transcription with WhisperX on GPU",
    )
    
    # Submit job
    print(f"  - Compute: {COMPUTE_NAME}")
    print(f"  - Environment: {environment}")
    print(f"  - Model: {args.model_size}")
    print(f"  - Diarization: {'disabled' if args.no_diarize else 'enabled'}")
    
    job = ml_client.jobs.create_or_update(job)
    
    print(f"\n✓ Job submitted: {job.name}")
    print(f"  - Status: {job.status}")
    print(f"  - Studio URL: {job.studio_url}")
    
    return job


def monitor_job(ml_client, job):
    """Monitor job progress and print updates."""
    print("\nMonitoring job (Ctrl+C to stop monitoring, job will continue)...")
    print("Note: First run will take longer as environment/models are downloaded")
    print()
    
    last_status = None
    start_time = time.time()
    
    try:
        while True:
            job = ml_client.jobs.get(job.name)
            
            if job.status != last_status:
                elapsed = time.time() - start_time
                print(f"[{elapsed/60:.1f}m] Status: {job.status}")
                last_status = job.status
            
            if job.status in ["Completed", "Failed", "Canceled"]:
                break
            
            time.sleep(30)  # Check every 30 seconds
            
    except KeyboardInterrupt:
        print("\n⚠️  Monitoring stopped (job continues in background)")
        print(f"Check status at: {job.studio_url}")
        return job
    
    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"Job {job.status}")
    print(f"Total time: {elapsed/60:.1f} minutes")
    print(f"{'='*60}")
    
    return job


def download_outputs(ml_client, job, output_dir: Path):
    """Download job outputs to local directory."""
    if job.status != "Completed":
        print(f"\n⚠️  Job not completed (status: {job.status})")
        print("Cannot download outputs.")
        return False
    
    print(f"\nDownloading outputs to: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Download outputs
        ml_client.jobs.download(
            name=job.name,
            download_path=str(output_dir),
            output_name="transcripts",
        )
        
        # List downloaded files
        transcript_dir = output_dir / "named-outputs" / "transcripts"
        if transcript_dir.exists():
            files = list(transcript_dir.glob("*"))
            print(f"\n✓ Downloaded {len(files)} files:")
            for f in files:
                print(f"  - {f.name} ({f.stat().st_size / 1024:.1f} KB)")
            return True
        else:
            print("⚠️  Output directory not found")
            return False
            
    except Exception as e:
        print(f"ERROR: Download failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Submit audio transcription job to Azure ML"
    )
    parser.add_argument(
        "audio_file",
        help="Path to audio file (e.g., /Users/joe/GitHub/dnd/.output/DnD 2.m4a)"
    )
    parser.add_argument(
        "--model-size",
        default="large-v3",
        choices=["tiny", "base", "small", "medium", "large-v2", "large-v3"],
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
        help="Skip speaker diarization (faster, but no speaker labels)"
    )
    parser.add_argument(
        "--output-dir",
        default="recordings_transcripts",
        help="Local directory for outputs (default: recordings_transcripts)"
    )
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Submit job and exit without waiting for completion"
    )
    
    args = parser.parse_args()
    
    # Validate audio file
    audio_path = Path(args.audio_file)
    if not audio_path.exists():
        print(f"ERROR: Audio file not found: {audio_path}")
        sys.exit(1)
    
    print("="*60)
    print("Azure ML Audio Transcription")
    print("="*60)
    print(f"Audio file: {audio_path.name}")
    print(f"Workspace: {WORKSPACE_NAME}")
    print(f"Compute: {COMPUTE_NAME} (Standard_NC4as_T4_v3)")
    print("="*60)
    
    try:
        # Connect to Azure ML
        ml_client = get_ml_client()
        print("✓ Connected to Azure ML workspace")
        
        # Upload audio file
        audio_uri = upload_audio_file(audio_path, ml_client)
        
        # Submit job
        job = submit_job(ml_client, audio_uri, args)
        
        if args.no_wait:
            print("\nJob submitted. Exiting without waiting.")
            print(f"Monitor at: {job.studio_url}")
            return
        
        # Monitor job
        job = monitor_job(ml_client, job)
        
        # Download outputs if completed
        if job.status == "Completed":
            output_dir = Path(args.output_dir)
            if download_outputs(ml_client, job, output_dir):
                print(f"\n✓ Transcription complete!")
                print(f"Outputs saved to: {output_dir}")
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
