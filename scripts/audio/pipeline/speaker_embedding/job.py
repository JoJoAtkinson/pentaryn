"""Azure ML job definition for Step 4: Speaker Embeddings."""

from pathlib import Path
from azure.ai.ml import command, Input, Output
from azure.ai.ml.constants import AssetTypes


def _normalize_input_value(value):
    if isinstance(value, Path):
        return str(value)
    return value


def _output_path(session_id: str, step: str) -> str:
    return f"azureml://datastores/workspaceblobstore/paths/audio-sessions/{session_id}/{step}"


def create_speaker_embedding_job(
    config,
    preprocess_output_uri: str,
    diarization_output_uri: str,
    session_id: str,
    audio_mode: str,
    device: str = "cpu",
):
    """
    Create Azure ML job for speaker embedding extraction and matching.
    
    Args:
        config: PipelineConfig object
        preprocess_output_uri: URI to Step 0 output directory
        diarization_output_uri: URI to Step 2 output directory
        session_id: Session identifier
        audio_mode: "discord_multitrack" or "table_single_mic"
        device: "cpu" or "cuda"
        
    Returns:
        Azure ML command job
    """
    # Step 4 can use GPU but also works well on CPU
    compute = config.azure.compute_target_gpu or config.azure.compute_target
    
    # Build command
    cmd_parts = [
        "python -m pipeline.speaker_embedding",
        "--preprocess", "${{inputs.preprocess}}",
        "--diarization", "${{inputs.diarization}}",
        "--output", "${{outputs.speaker_embedding}}",
        "--config", "pipeline.config.toml",
        "--audio-mode", audio_mode,
        "--device", device,
        "--log-level", config.logging.level,
    ]
    
    command_str = " ".join(cmd_parts)
    
    component = command(
        code="./scripts/audio",
        command=command_str,
        environment=f"{config.azure.environment_name}@latest",
        compute=compute,
        inputs={
            "preprocess": Input(type=AssetTypes.URI_FOLDER),
            "diarization": Input(type=AssetTypes.URI_FOLDER),
        },
        outputs={
            "speaker_embedding": Output(
                type=AssetTypes.URI_FOLDER,
                path=_output_path(session_id, "speaker_embedding"),
            ),
        },
        environment_variables={
            "PYTORCH_CUDA_ALLOC_CONF": "max_split_size_mb:512",
        },
        display_name=f"speaker-embedding-{session_id}",
        experiment_name="audio-pipeline",
        description=f"Speaker embedding extraction and matching - Session {session_id}",
    )

    job = component(
        preprocess=_normalize_input_value(preprocess_output_uri),
        diarization=_normalize_input_value(diarization_output_uri),
    )
    return job
