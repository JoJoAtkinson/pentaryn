"""Azure ML job definition for Step 3: Emotion Analysis."""

from pathlib import Path
from azure.ai.ml import command, Input, Output
from azure.ai.ml.constants import AssetTypes


def _normalize_input_value(value):
    if isinstance(value, Path):
        return str(value)
    return value


def _output_path(session_id: str, step: str) -> str:
    return f"azureml://datastores/workspaceblobstore/paths/audio-sessions/{session_id}/{step}"


def create_emotion_job(
    config,
    diarization_output_uri: str,
    preprocess_output_uri: str,
    session_id: str,
    audio_mode: str,
    batch_size: int = 8,
):
    """
    Create Azure ML job for emotion analysis.
    
    Args:
        config: PipelineConfig object
        diarization_output_uri: URI to Step 2 output directory
        preprocess_output_uri: URI to Step 0 output directory (for normalized audio)
        session_id: Session identifier
        audio_mode: "discord_multitrack" or "table_single_mic"
        batch_size: Batch size for emotion model
    
    Returns:
        Azure ML command job
    """
    # Step 3 uses GPU compute
    compute = config.azure.compute_target_gpu or config.azure.compute_target
    
    # Build command
    audio_arg = "${{inputs.preprocess}}/normalized.flac"
    if audio_mode == "discord_multitrack":
        audio_arg = "${{inputs.preprocess}}"

    cmd_parts = [
        "python -m pipeline.emotion.analyze",
        "--diarization", "${{inputs.diarization}}",
        "--audio", audio_arg,
        "--output", "${{outputs.emotion}}",
        "--config", "pipeline.config.toml",
        "--audio-mode", audio_mode,
        "--batch-size", str(batch_size),
        "--log-level", config.logging.level,
    ]
    
    command_str = " ".join(cmd_parts)
    
    component = command(
        code="./scripts/audio",
        command=command_str,
        environment=f"{config.azure.environment_name}@latest",
        compute=compute,
        inputs={
            "diarization": Input(type=AssetTypes.URI_FOLDER),
            "preprocess": Input(type=AssetTypes.URI_FOLDER),
        },
        outputs={
            "emotion": Output(
                type=AssetTypes.URI_FOLDER,
                path=_output_path(session_id, "emotion"),
            ),
        },
        display_name=f"emotion-{session_id}",
        experiment_name="audio-pipeline",
        description=f"Dimensional emotion analysis (A/V/D) - Session {session_id}",
        environment_variables={
            "HF_TOKEN": config.azure.hf_auth_token,
        },
    )

    job = component(
        diarization=_normalize_input_value(diarization_output_uri),
        preprocess=_normalize_input_value(preprocess_output_uri),
    )
    return job
