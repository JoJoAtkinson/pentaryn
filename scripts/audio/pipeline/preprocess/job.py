"""Azure ML job definition for Step 0: Preprocess."""

from pathlib import Path
from azure.ai.ml import command, Input, Output
from azure.ai.ml.constants import AssetTypes


def _normalize_input_value(value):
    if isinstance(value, Path):
        return str(value)
    return value


def _output_path(session_id: str, step: str) -> str:
    return f"azureml://datastores/workspaceblobstore/paths/audio-sessions/{session_id}/{step}"


def create_preprocess_job(
    config,
    audio_input_uri: str,
    session_id: str,
    audio_mode: str,
):
    """
    Create Azure ML job for preprocessing (CPU compute).
    
    Args:
        config: PipelineConfig object
        audio_input_uri: URI to input audio (file or folder)
        session_id: Session identifier
        audio_mode: "discord_multitrack" or "table_single_mic"
        
    Returns:
        Azure ML command job
    """
    # Step 0 uses CPU compute (FFmpeg doesn't need GPU)
    compute = config.azure.compute_target_cpu
    
    # Build command
    cmd_parts = [
        "python -m pipeline.preprocess.normalize",
        "--audio", "${{inputs.audio}}",
        "--output", "${{outputs.preprocess}}",
        "--config", "pipeline.config.toml",
        "--audio-mode", audio_mode,
        "--log-level", config.logging.level,
    ]
    
    command_str = " ".join(cmd_parts)
    
    input_type = AssetTypes.URI_FILE if audio_mode == "table_single_mic" else AssetTypes.URI_FOLDER
    
    component = command(
        code="./scripts/audio",
        command=command_str,
        environment=f"{config.azure.environment_name}@latest",
        compute=compute,
        inputs={
            "audio": Input(type=input_type),
        },
        outputs={
            "preprocess": Output(
                type=AssetTypes.URI_FOLDER,
                path=_output_path(session_id, "preprocess"),
            ),
        },
        display_name=f"preprocess-{session_id}",
        experiment_name="audio-pipeline",
        description=f"Audio normalization (CPU) - Session {session_id}",
    )
    
    job = component(audio=_normalize_input_value(audio_input_uri))
    return job
