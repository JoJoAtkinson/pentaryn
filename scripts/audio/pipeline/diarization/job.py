"""Azure ML job definition for Step 2: Diarization."""

from pathlib import Path
from azure.ai.ml import command, Input, Output
from azure.ai.ml.constants import AssetTypes


def _normalize_input_value(value):
    if isinstance(value, Path):
        return str(value)
    return value


def _output_path(session_id: str, step: str) -> str:
    return f"azureml://datastores/workspaceblobstore/paths/audio-sessions/{session_id}/{step}"


def create_diarization_job(
    config,
    transcription_output_uri: str,
    preprocess_output_uri: str,
    session_id: str,
    audio_mode: str,
    device: str = "cpu",
):
    """
    Create Azure ML job for diarization (GPU compute).
    
    Args:
        config: PipelineConfig object
        transcription_output_uri: URI to Step 1 output directory
        preprocess_output_uri: URI to Step 0 output directory (for normalized audio)
        session_id: Session identifier
        audio_mode: "discord_multitrack" or "table_single_mic"
        device: "cpu" or "cuda" (CPU safer for long recordings)
        
    Returns:
        Azure ML command job
    """
    # Step 2 uses GPU compute (or CPU for safety on long recordings)
    compute = config.azure.compute_target_gpu or config.azure.compute_target
    
    # Build command
    if audio_mode == "discord_multitrack":
        # Mode A: No audio file needed (track-based adapter)
        cmd_parts = [
            "python -m pipeline.diarization.diarize",
            "--transcription", "${{inputs.transcription}}",
            "--output", "${{outputs.diarization}}",
            "--config", "pipeline.config.toml",
            "--audio-mode", audio_mode,
            "--log-level", config.logging.level,
        ]
    else:
        # Mode B: Needs normalized audio for ML diarization
        cmd_parts = [
            "python -m pipeline.diarization.diarize",
            "--transcription", "${{inputs.transcription}}",
            "--audio", "${{inputs.preprocess}}/normalized.flac",
            "--output", "${{outputs.diarization}}",
            "--config", "pipeline.config.toml",
            "--audio-mode", audio_mode,
            "--device", device,
            "--log-level", config.logging.level,
        ]
    
    command_str = " ".join(cmd_parts)
    
    inputs = {
        "transcription": Input(type=AssetTypes.URI_FOLDER),
    }
    
    if audio_mode == "table_single_mic":
        inputs["preprocess"] = Input(type=AssetTypes.URI_FOLDER)
    
    component = command(
        code="./scripts/audio",
        command=command_str,
        environment=f"{config.azure.environment_name}@latest",
        compute=compute,
        inputs=inputs,
        outputs={
            "diarization": Output(
                type=AssetTypes.URI_FOLDER,
                path=_output_path(session_id, "diarization"),
            ),
        },
        environment_variables={
            "HF_AUTH_TOKEN": config.azure.hf_auth_token,
            "PYTORCH_CUDA_ALLOC_CONF": "max_split_size_mb:512",
        },
        display_name=f"diarization-{session_id}",
        experiment_name="audio-pipeline",
        description=f"Speaker diarization ({audio_mode}) - Session {session_id}",
    )

    job = component(
        transcription=_normalize_input_value(transcription_output_uri),
        **(
            {"preprocess": _normalize_input_value(preprocess_output_uri)}
            if audio_mode == "table_single_mic"
            else {}
        ),
    )
    return job
