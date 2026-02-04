#!/usr/bin/env python3
"""
Pipeline Orchestrator
Submits and manages the full 5-step audio processing pipeline on Azure ML.

Session Structure:
    Mode A (multitrack): session_dir/audio/ folder containing track files (named by speaker)
    Mode B (single-mic): session_dir/audio.<ext> file (wav, flac, m4a, etc.)

Usage:
    python orchestrator.py /path/to/session-05
    python orchestrator.py ../../sessions/05
    
The mode is automatically detected based on the session structure.
"""

import argparse
import json
import os
import sys
import time
import subprocess
from pathlib import Path
from typing import Dict, List, Optional

try:
    from azure.ai.ml import MLClient
    from azure.ai.ml.entities import PipelineJob
    from azure.ai.ml.dsl import pipeline
    from azure.identity import DefaultAzureCredential, InteractiveBrowserCredential
    from azure.core.exceptions import ResourceNotFoundError
except ImportError:
    print("ERROR: Azure ML SDK not installed")
    print("Install with: pip install azure-ai-ml azure-identity")
    sys.exit(1)

from azure_ml_config import (
    SUBSCRIPTION_ID,
    RESOURCE_GROUP,
    WORKSPACE_NAME,
    COMPUTE_NAME,  # GPU compute
    EXPERIMENT_NAME,
)

# Import job definitions
from pipeline.preprocess.job import create_preprocess_job
from pipeline.transcription.job import create_transcription_job
from pipeline.diarization.job import create_diarization_job
from pipeline.emotion.job import create_emotion_job
from pipeline.speaker_embedding.job import create_speaker_embedding_job
from pipeline.config import PipelineConfig


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


def detect_session_mode(session_dir: Path) -> tuple[str, Optional[List[str]]]:
    """
    Auto-detect processing mode based on session structure.
    
    Mode A (multitrack): session_dir/audio/ folder with track files
    Mode B (single-mic): session_dir/audio.<ext> file
    
    Args:
        session_dir: Local session directory
    
    Returns:
        Tuple of (mode, tracks) where:
        - mode: "A" or "B"
        - tracks: List of track filenames for Mode A, None for Mode B
    """
    audio_dir = session_dir / "audio"
    
    # Check for Mode A (audio folder with tracks)
    if audio_dir.exists() and audio_dir.is_dir():
        # Find all audio files in the audio folder
        audio_extensions = [".wav", ".flac", ".m4a", ".mp3", ".ogg", ".opus"]
        track_files = []
        
        for ext in audio_extensions:
            track_files.extend(audio_dir.glob(f"*{ext}"))
        
        if not track_files:
            raise FileNotFoundError(f"No audio files found in {audio_dir}")
        
        # Extract just the filenames (relative to audio folder)
        tracks = [f.name for f in sorted(track_files)]
        return "A", tracks
    
    # Check for Mode B (single audio file)
    audio_extensions = [".wav", ".flac", ".m4a", ".mp3", ".ogg", ".opus"]
    audio_files = []
    
    for ext in audio_extensions:
        audio_files.extend(session_dir.glob(f"audio{ext}"))
    
    if audio_files:
        return "B", None
    
    # No valid audio structure found
    raise FileNotFoundError(
        f"No valid audio structure found in {session_dir}\n"
        f"Expected either:\n"
        f"  - Mode A: {session_dir}/audio/ folder with track files\n"
        f"  - Mode B: {session_dir}/audio.<ext> file (wav, flac, m4a, etc.)"
    )


def _azcopy_v10_available() -> bool:
    try:
        result = subprocess.run(
            ["azcopy", "--version"],
            capture_output=True,
            text=True,
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False

    output = (result.stdout or result.stderr or "").lower()
    return "azcopy version 10" in output


def _ensure_azcopy_logged_in() -> None:
    try:
        status = subprocess.run(
            ["azcopy", "login", "status"],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return

    if status.returncode == 0 and "logged in" in (status.stdout or "").lower():
        return

    login = subprocess.run(
        ["azcopy", "login", "--login-type=azcli"],
        capture_output=True,
        text=True,
    )
    if login.returncode != 0:
        raise RuntimeError(
            "AzCopy login failed. Ensure `az login` is complete for this account."
        )


def _get_datastore_upload_paths(ml_client, session_dir: Path) -> tuple[str, str]:
    datastore = ml_client.datastores.get_default()
    remote_prefix = f"audio-sessions/{session_dir.name}"
    azureml_uri = f"azureml://datastores/{datastore.name}/paths/{remote_prefix}/"
    blob_url = (
        f"{datastore.protocol}://{datastore.account_name}.blob.core.windows.net/"
        f"{datastore.container_name}/audio-sessions"
    )
    return azureml_uri, blob_url


def _remote_prefix_exists(ml_client, session_dir: Path) -> bool:
    try:
        from azure.identity import DefaultAzureCredential
        from azure.storage.blob import BlobServiceClient
    except ImportError:
        return False

    try:
        datastore = ml_client.datastores.get_default()
        account_url = f"{datastore.protocol}://{datastore.account_name}.blob.core.windows.net"
        blob_service_client = BlobServiceClient(
            account_url=account_url,
            credential=DefaultAzureCredential(),
        )
        container_client = blob_service_client.get_container_client(datastore.container_name)
        prefix = f"audio-sessions/{session_dir.name}/"
        return next(container_client.list_blobs(name_starts_with=prefix), None) is not None
    except Exception:
        return False


def upload_session_files(ml_client, session_dir: Path, mode: str, tracks: Optional[List[str]] = None) -> str:
    """
    Upload session files to Azure blob storage.
    
    Args:
        ml_client: Azure ML client
        session_dir: Local session directory
        mode: Processing mode ("A" or "B")
        tracks: List of track filenames for Mode A (None for Mode B)
    
    Returns:
        Data URI for uploaded session
    """
    print(f"\nUploading session: {session_dir.name}")
    print(f"  Mode: {mode}")
    
    # Validate session structure
    if mode == "A":
        print(f"  Tracks: {len(tracks)} files")
        for track in tracks:
            print(f"    - {track}")
        input_subpath = "audio"
    else:
        # Mode B: find the audio file
        audio_extensions = [".wav", ".flac", ".m4a", ".mp3", ".ogg", ".opus"]
        audio_files = []
        for ext in audio_extensions:
            audio_files.extend(session_dir.glob(f"audio{ext}"))
        
        if not audio_files:
            raise FileNotFoundError(f"No audio file found in {session_dir}")
        print(f"  Recording: {audio_files[0].name}")
        input_subpath = audio_files[0].name
    
    azureml_uri, blob_url = _get_datastore_upload_paths(ml_client, session_dir)

    if _remote_prefix_exists(ml_client, session_dir):
        audio_input_uri = f"{azureml_uri.rstrip('/')}/{input_subpath}"
        print(f"✓ Remote session already present, skipping upload: {audio_input_uri}")
        return audio_input_uri

    if _azcopy_v10_available():
        print("Using AzCopy v10 for upload...")
        _ensure_azcopy_logged_in()
        env = os.environ.copy()
        env.setdefault("AZCOPY_AUTO_LOGIN_TYPE", "AZCLI")
        cmd = [
            "azcopy",
            "copy",
            str(session_dir),
            blob_url,
            "--recursive=true",
            "--overwrite=false",
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            raise RuntimeError(
                "AzCopy upload failed. Ensure you're logged in with `az login` (or `azcopy login`) "
                "and have the 'Storage Blob Data Contributor' role on the storage account. "
                f"Destination: {blob_url}"
            )
        audio_input_uri = f"{azureml_uri.rstrip('/')}/{input_subpath}"
        print(f"✓ Uploaded to: {audio_input_uri}")
        return audio_input_uri

    # Fallback to Azure ML data upload if AzCopy is unavailable
    from azure.ai.ml.entities import Data
    from azure.ai.ml.constants import AssetTypes

    data_name = f"session-{session_dir.name}"
    session_data = Data(
        path=str(session_dir),
        type=AssetTypes.URI_FOLDER,
        name=data_name,
        description=f"Session data for pipeline: {session_dir.name}",
    )
    session_data = ml_client.data.create_or_update(session_data)
    audio_input_uri = f"{str(session_data.path).rstrip('/')}/{input_subpath}"
    print(f"✓ Uploaded to: {audio_input_uri}")
    return audio_input_uri


def validate_compute_exists(ml_client: MLClient, config: PipelineConfig) -> None:
    """Validate that required compute targets exist."""
    cpu_compute = config.azure.compute_target_cpu
    # Support both compute_target_gpu and compute_target (legacy)
    gpu_compute = getattr(config.azure, 'compute_target_gpu', getattr(config.azure, 'compute_target', None))
    
    if not gpu_compute:
        print("\n❌ ERROR: No GPU compute target configured")
        print("Add compute_target_gpu to [azure] section in pipeline.config.toml")
        sys.exit(1)
    
    missing_computes = []
    
    # Check CPU compute
    try:
        ml_client.compute.get(cpu_compute)
    except ResourceNotFoundError:
        missing_computes.append(cpu_compute)
    
    # Check GPU compute
    try:
        ml_client.compute.get(gpu_compute)
    except ResourceNotFoundError:
        missing_computes.append(gpu_compute)
    
    if missing_computes:
        print("\n❌ ERROR: Required compute targets not found:")
        for compute in missing_computes:
            print(f"  - {compute}")
        print("\nRun setup first:")
        print("  make audio-setup")
        print("\nOr create manually:")
        if cpu_compute in missing_computes:
            print(f"  az ml compute create --name {cpu_compute} --type amlcompute --size Standard_D4s_v3 --min-instances 0 --max-instances 1")
        if gpu_compute in missing_computes:
            print(f"  az ml compute create --name {gpu_compute} --type amlcompute --size Standard_NC4as_T4_v3 --min-instances 0 --max-instances 2")
        sys.exit(1)
    
    print(f"✓ Compute validated: {cpu_compute}, {gpu_compute}")


def create_pipeline_job(
    config: PipelineConfig,
    audio_input_uri: str,
    session_id: str,
    mode: str,
    tracks: Optional[List[str]] = None,
) -> PipelineJob:
    """
    Create Azure ML pipeline job with all steps.
    
    Pipeline Structure:
    Step 0 (CPU) → Step 1 (GPU) → Step 2 (GPU) → [Step 3 (GPU), Step 4 (GPU)] → (local Step 5)
    
    Args:
        config: Pipeline configuration
        session_uri: Azure data URI for session folder
        mode: Processing mode ("A" or "B")
        tracks: List of track filenames for Mode A
    
    Returns:
        Azure ML pipeline job
    """
    from azure.ai.ml import Input, Output
    from azure.ai.ml.constants import AssetTypes
    
    # Build track list argument for Step 0
    if mode == "A" and tracks:
        track_arg = ",".join(tracks)
    else:
        track_arg = ""
    
    # Get compute targets from config
    cpu_compute = config.azure.compute_target_cpu
    gpu_compute = COMPUTE_NAME
    
    # Convert config to dict for passing to job functions
    config_dict = {
        "config_file": str(config.config_file) if hasattr(config, 'config_file') else "pipeline.config.toml",
    }
    
    @pipeline(
        name="audio-processing-pipeline",
        description="5-step audio processing pipeline with parallel emotion and speaker embedding",
        experiment_name=EXPERIMENT_NAME,
    )
    def audio_pipeline(audio_input):
        """Define pipeline DAG."""
        from azure.ai.ml import Input, Output
        from azure.ai.ml.constants import AssetTypes
        
        # Determine session_id and audio_mode
        audio_mode = "discord_multitrack" if mode == "A" else "table_single_mic"
        
        # Step 0: Preprocess (CPU)
        step0 = create_preprocess_job(
            config=config,
            audio_input_uri=audio_input,
            session_id=session_id,
            audio_mode=audio_mode,
        )
        
        # Step 1: Transcription (GPU)
        step1 = create_transcription_job(
            config=config,
            preprocess_output_uri=step0.outputs.preprocess,
            session_id=session_id,
            audio_mode=audio_mode,
        )
        
        # Step 2: Diarization (GPU)
        step2 = create_diarization_job(
            config=config,
            transcription_output_uri=step1.outputs.transcription,
            preprocess_output_uri=step0.outputs.preprocess,
            session_id=session_id,
            audio_mode=audio_mode,
        )
        
        # Step 3: Emotion (GPU) - parallel with Step 4
        step3 = create_emotion_job(
            config=config,
            diarization_output_uri=step2.outputs.diarization,
            preprocess_output_uri=step0.outputs.preprocess,
            session_id=session_id,
            audio_mode=audio_mode,
        )
        
        # Step 4: Speaker Embedding (GPU) - parallel with Step 3
        step4 = create_speaker_embedding_job(
            config=config,
            diarization_output_uri=step2.outputs.diarization,
            preprocess_output_uri=step0.outputs.preprocess,
            session_id=session_id,
            audio_mode=audio_mode,
        )
        
        # Note: Step 5 (post-processing) runs locally after download
        
        return {
            "preprocess": step0.outputs.preprocess,
            "transcription": step1.outputs.transcription,
            "diarization": step2.outputs.diarization,
            "emotion": step3.outputs.emotion,
            "speaker_embedding": step4.outputs.speaker_embedding,
        }
    
    # Create pipeline instance with input
    from azure.ai.ml import Input
    from azure.ai.ml.constants import AssetTypes
    
    pipeline_job = audio_pipeline(
        audio_input=Input(
            type=AssetTypes.URI_FOLDER if mode == "A" else AssetTypes.URI_FILE,
            path=audio_input_uri,
        )
    )
    
    return pipeline_job


def monitor_pipeline(ml_client, pipeline_job):
    """Monitor pipeline progress and print updates."""
    print("\nMonitoring pipeline (Ctrl+C to stop monitoring, pipeline will continue)...")
    print("Note: Steps 3 and 4 will run in parallel after Step 2 completes")
    print()
    
    last_status = {}
    start_time = time.time()
    
    try:
        while True:
            job = ml_client.jobs.get(pipeline_job.name)
            
            # Get child jobs (pipeline steps)
            try:
                child_jobs = list(ml_client.jobs.list(parent_job_name=job.name))
                
                for child in child_jobs:
                    step_name = child.display_name or child.name
                    status = child.status
                    
                    if step_name not in last_status or last_status[step_name] != status:
                        elapsed = time.time() - start_time
                        print(f"[{elapsed/60:.1f}m] {step_name}: {status}")
                        last_status[step_name] = status
            except Exception:
                # Fallback to pipeline-level status
                if "pipeline" not in last_status or last_status["pipeline"] != job.status:
                    elapsed = time.time() - start_time
                    print(f"[{elapsed/60:.1f}m] Pipeline: {job.status}")
                    last_status["pipeline"] = job.status
            
            if job.status in ["Completed", "Failed", "Canceled"]:
                break
            
            time.sleep(30)  # Check every 30 seconds
            
    except KeyboardInterrupt:
        print("\n⚠️  Monitoring stopped (pipeline continues in background)")
        print(f"Check status at: {job.studio_url}")
        return job
    
    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"Pipeline {job.status}")
    print(f"Total time: {elapsed/60:.1f} minutes")
    print(f"{'='*60}")
    
    return job


def download_outputs(ml_client, pipeline_job, session_dir: Path):
    """Download pipeline outputs to local session directory."""
    if pipeline_job.status != "Completed":
        print(f"\n⚠️  Pipeline not completed (status: {pipeline_job.status})")
        print("Cannot download outputs.")
        return False
    
    output_dir = session_dir / "outputs"
    print(f"\nDownloading pipeline outputs to: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Download all outputs
        ml_client.jobs.download(
            name=pipeline_job.name,
            download_path=str(output_dir),
            all=True,
        )
        
        print(f"\n✓ Downloaded pipeline outputs")
        
        # List output structure
        for step_dir in output_dir.glob("**/step*"):
            files = list(step_dir.glob("*"))
            print(f"  {step_dir.name}: {len(files)} files")
        
        return True
        
    except Exception as e:
        print(f"ERROR: Download failed: {e}")
        return False


def run_local_postprocess(session_dir: Path, skip_emotion: bool = False, skip_speaker_id: bool = False):
    """Run Step 5 (post-processing) locally."""
    print("\n" + "="*60)
    print("Running Step 5: Post-Processing (local)")
    print("="*60)
    
    from pipeline.postprocess.merge import TranscriptMerger
    from pipeline.postprocess.validate import TranscriptValidator
    
    outputs_dir = session_dir / "outputs"
    final_dir = session_dir / "final"
    final_dir.mkdir(parents=True, exist_ok=True)
    
    # Find downloaded outputs
    transcription_path = None
    diarization_path = None
    emotion_path = None
    matches_path = None
    
    for step_dir in outputs_dir.glob("**/step1"):
        transcription_path = step_dir / "transcription.jsonl"
        if transcription_path.exists():
            break
    
    for step_dir in outputs_dir.glob("**/step2"):
        diarization_path = step_dir / "diarization.jsonl"
        if diarization_path.exists():
            break
    
    if not skip_emotion:
        for step_dir in outputs_dir.glob("**/step3"):
            emotion_path = step_dir / "emotion.jsonl"
            if emotion_path.exists():
                break
    
    if not skip_speaker_id:
        for step_dir in outputs_dir.glob("**/step4"):
            matches_path = step_dir / "matches.json"
            if matches_path.exists():
                break
    
    if not transcription_path or not transcription_path.exists():
        print("ERROR: Transcription output not found")
        return False
    if not diarization_path or not diarization_path.exists():
        print("ERROR: Diarization output not found")
        return False
    
    print(f"Transcription: {transcription_path}")
    print(f"Diarization: {diarization_path}")
    if emotion_path:
        print(f"Emotion: {emotion_path}")
    if matches_path:
        print(f"Speaker matches: {matches_path}")
    
    # Merge
    print("\nMerging outputs...")
    merger = TranscriptMerger(
        transcription_path=transcription_path,
        diarization_path=diarization_path,
        emotion_path=emotion_path,
        matches_path=matches_path,
    )
    
    merger.load_data()
    merged_words = merger.merge()
    
    merged_path = final_dir / "merged.jsonl"
    stats_path = final_dir / "merge_stats.json"
    
    merger.write_output(merged_words, merged_path)
    
    stats = merger.generate_statistics(merged_words)
    with open(stats_path, "w") as f:
        json.dump(stats, f, indent=2)
    
    print(f"✓ Merged transcript: {merged_path}")
    print(f"✓ Statistics: {stats_path}")
    
    # Validate
    print("\nValidating merged transcript...")
    validator = TranscriptValidator(
        merged_path=merged_path,
        max_gap_seconds=5.0,
        min_turn_duration=0.3,
        min_speaker_id_coverage=0.8,
        min_emotion_coverage=0.7,
    )
    
    validator.load_data()
    report = validator.validate()
    
    report_path = final_dir / "validation_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"✓ Validation report: {report_path}")
    
    print("\n=== Validation Summary ===")
    print(f"Total words: {report['total_words']}")
    print(f"Errors: {report['errors']}")
    print(f"Warnings: {report['warnings']}")
    print(f"Passed: {'✓' if report['passed'] else '✗'}")
    
    return report['passed']


def load_dotenv_if_available() -> None:
    """Load .env from repo root if python-dotenv is available."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    env_path = Path(__file__).resolve().parents[2] / ".env"
    if env_path.exists():
        load_dotenv(env_path)


def main():
    parser = argparse.ArgumentParser(
        description="Submit audio processing pipeline to Azure ML",
        epilog="""
Session Structure:
  Mode A (multitrack): session_dir/audio/ folder containing track files (named by speaker)
  Mode B (single-mic): session_dir/audio.<ext> file (wav, flac, m4a, etc.)
  
The mode is automatically detected based on the session structure.
        """
    )
    parser.add_argument(
        "session_dir",
        type=Path,
        help="Path to session directory (e.g., /Users/joe/GitHub/dnd/sessions/05)"
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).parent / "pipeline.config.toml",
        help="Path to pipeline.config.toml"
    )
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Submit pipeline and exit without waiting for completion"
    )
    parser.add_argument(
        "--skip-postprocess",
        action="store_true",
        help="Skip local post-processing (Step 5)"
    )
    
    args = parser.parse_args()

    load_dotenv_if_available()
    
    # Validate inputs
    if not args.session_dir.exists():
        print(f"ERROR: Session directory not found: {args.session_dir}")
        sys.exit(1)
    
    if not args.config.exists():
        print(f"ERROR: Config file not found: {args.config}")
        sys.exit(1)
    
    # Auto-detect mode
    try:
        mode, tracks = detect_session_mode(args.session_dir)
    except FileNotFoundError as e:
        print(f"ERROR: {e}")
        sys.exit(1)
    
    # Check HF_TOKEN for GPU steps
    hf_token = os.environ.get("HF_AUTH_TOKEN") or os.environ.get("HF_TOKEN")
    if not hf_token:
        print("WARNING: HF_TOKEN not set. Steps 2-4 may fail.")
        print("Set HF_TOKEN environment variable for pyannote.audio models.")
        response = input("Continue anyway? [y/N]: ")
        if response.lower() != 'y':
            print("Cancelled.")
            sys.exit(0)
    
    print("="*60)
    print("Azure ML Audio Processing Pipeline")
    print("="*60)
    print(f"Session: {args.session_dir.name}")
    print(f"Mode: {mode} ({'multitrack' if mode == 'A' else 'single-mic'})")
    print(f"Workspace: {WORKSPACE_NAME}")
    print(f"Config: {args.config}")
    print("="*60)
    
    try:
        # Load config
        config = PipelineConfig.from_file(args.config)
        
        # Connect to Azure ML
        ml_client = get_ml_client()
        print("✓ Connected to Azure ML workspace")
        
        # Validate compute targets exist
        print("\nValidating Azure ML resources...")
        validate_compute_exists(ml_client, config)
        
        # Upload session files
        session_id = args.session_dir.name
        audio_input_uri = upload_session_files(ml_client, args.session_dir, mode, tracks)
        
        # Create pipeline job
        print("\nCreating pipeline job...")
        pipeline_job = create_pipeline_job(config, audio_input_uri, session_id, mode, tracks)
        
        # Submit pipeline
        print("Submitting pipeline...")
        pipeline_job = ml_client.jobs.create_or_update(pipeline_job)
        
        print(f"\n✓ Pipeline submitted: {pipeline_job.name}")
        print(f"  - Status: {pipeline_job.status}")
        print(f"  - Studio URL: {pipeline_job.studio_url}")
        
        if args.no_wait:
            print("\nPipeline submitted. Exiting without waiting.")
            print(f"Monitor at: {pipeline_job.studio_url}")
            return
        
        # Monitor pipeline
        pipeline_job = monitor_pipeline(ml_client, pipeline_job)
        
        # Download outputs if completed
        if pipeline_job.status == "Completed":
            if download_outputs(ml_client, pipeline_job, args.session_dir):
                
                if not args.skip_postprocess:
                    # Run local post-processing
                    if run_local_postprocess(args.session_dir):
                        print(f"\n✓ Pipeline complete!")
                        print(f"Final outputs: {args.session_dir / 'final'}")
                    else:
                        print("\n⚠️  Pipeline complete but validation failed")
                        sys.exit(1)
                else:
                    print(f"\n✓ Pipeline complete!")
                    print(f"Outputs: {args.session_dir / 'outputs'}")
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
