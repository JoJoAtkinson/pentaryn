"""Configuration management for audio processing pipeline."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Literal
import os
import tomlkit as toml


@dataclass
class PipelineMetadata:
    """Pipeline metadata."""
    name: str = "dnd_audio_pipeline"
    version: str = "1.0.0"
    default_output_dir: str = ".output"
    audio_mode: Literal["auto", "discord_multitrack", "table_single_mic"] = "auto"
    session_id: str = ""


@dataclass
class AzureConfig:
    """Azure ML configuration."""
    subscription_id: str = ""
    resource_group: str = ""
    workspace_name: str = ""
    compute_target: str = "gpu-transcribe"  # Legacy: use compute_target_gpu instead
    compute_target_gpu: Optional[str] = None  # GPU compute for Steps 1-4
    compute_target_cpu: str = "cpu-preprocess"  # CPU compute for Step 0
    environment_name: str = "whisperx-gpu"
    hf_auth_token: str = ""  # HuggingFace token for pyannote/transformers
    
    def __post_init__(self):
        """Set compute_target_gpu from compute_target if not provided."""
        if self.compute_target_gpu is None:
            self.compute_target_gpu = self.compute_target



@dataclass
class PreprocessConfig:
    """Preprocessing step configuration."""
    enabled: bool = True
    sample_rate: int = 16000
    channels: int = 1
    loudnorm_target_lufs: float = -23.0
    loudnorm_range_lu: float = 11.0
    true_peak_db: float = -1.5
    highpass_hz: int = 80
    two_pass: bool = True
    output_format: Literal["flac", "wav"] = "flac"
    parallel_tracks: int = 0  # Chunk workers per track (0 = auto CPU count)
    progress_interval_seconds: int = 15


@dataclass
class TranscriptionConfig:
    """Transcription step configuration."""
    model: str = "large-v3"
    language: str = "en"
    compute_type: str = "float16"
    batch_size: int = 16
    chunk_duration_hours: float = 3.0
    overlap_seconds: float = 120.0
    vad_filter: bool = True
    owned_interval_stitching: bool = True


@dataclass
class DiarizationConfig:
    """Diarization step configuration."""
    model: str = "pyannote/speaker-diarization-3.1"
    min_speakers: int = 2
    max_speakers: int = 6
    overlap_threshold: float = 0.5
    device: Literal["cpu", "cuda"] = "cpu"
    cross_chunk_linkage: Literal["average", "maximum", "minimum"] = "average"
    cross_chunk_threshold: float = 0.78
    overlap_window_seconds: float = 120.0


@dataclass
class EmotionConfig:
    """Emotion analysis step configuration."""
    model: str = "tiantiaf/wavlm-large-msp-podcast-emotion-dim"
    label_set: str = "arousal_valence_dominance"
    batch_size: int = 32
    min_segment_duration: float = 0.5
    derived_labels: bool = True
    text_fallback: bool = False
    confidence_strategy: Literal["none", "calibrated"] = "none"


@dataclass
class SpeakerEmbeddingConfig:
    """Speaker embedding step configuration."""
    model: str = "speechbrain/spkrec-ecapa-voxceleb"
    min_turn_duration_seconds: float = 1.5
    top_k_segments: int = 20
    max_embeddings_per_speaker: int = 50
    aggregation: Literal["mean", "median"] = "mean"
    database_path: str = "speaker_db/embeddings.json"
    delta_output_path: str = "4_speaker_embedding/speaker_db_delta.json"


@dataclass
class SpeakerMatchingConfig:
    """Speaker matching configuration."""
    assignment: Literal["hungarian", "greedy"] = "hungarian"
    similarity_threshold: float = 0.85
    centroid_update_threshold: float = 0.88
    stability_percentile: float = 0.10
    stability_threshold: float = 0.80
    min_clean_duration_seconds: float = 60.0


@dataclass
class NamingConfig:
    """Canonical name normalization configuration."""
    canonical_name_case: Literal["lower", "upper", "preserve"] = "lower"
    replace_spaces_with: str = "-"
    replace_underscores_with: str = "-"
    strip_non_alnum: bool = True


@dataclass
class PostprocessConfig:
    """Post-processing step configuration."""
    validation_strict: bool = False
    unknown_speaker_handling: Literal["preserve", "merge", "flag"] = "preserve"


@dataclass
class LoggingConfig:
    """Logging configuration."""
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


@dataclass
class PipelineConfig:
    """Complete pipeline configuration."""
    pipeline: PipelineMetadata = field(default_factory=PipelineMetadata)
    azure: AzureConfig = field(default_factory=AzureConfig)
    preprocess: PreprocessConfig = field(default_factory=PreprocessConfig)
    transcription: TranscriptionConfig = field(default_factory=TranscriptionConfig)
    diarization: DiarizationConfig = field(default_factory=DiarizationConfig)
    emotion: EmotionConfig = field(default_factory=EmotionConfig)
    speaker_embedding: SpeakerEmbeddingConfig = field(default_factory=SpeakerEmbeddingConfig)
    speaker_matching: SpeakerMatchingConfig = field(default_factory=SpeakerMatchingConfig)
    naming: NamingConfig = field(default_factory=NamingConfig)
    postprocess: PostprocessConfig = field(default_factory=PostprocessConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    
    @classmethod
    def from_file(cls, path: Path) -> "PipelineConfig":
        """Load configuration from TOML file."""
        if isinstance(path, str):
            path = Path(path)
        
        if not path.exists():
            # Return default config if file doesn't exist
            return cls()
        
        with open(path, "r") as f:
            data = toml.load(f)
        
        # Load HF_AUTH_TOKEN from environment if not in config
        azure_config = data.get("azure", {})
        if not azure_config.get("hf_auth_token"):
            # Try to load from root .env file
            env_path = Path(__file__).parent.parent.parent.parent / ".env"
            if env_path.exists():
                with open(env_path) as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("HF_AUTH_TOKEN=") or line.startswith("HF_TOKEN="):
                            key, value = line.split("=", 1)
                            azure_config["hf_auth_token"] = value.strip().strip('"').strip("'")
                            break
            # Fallback to environment variable
            if not azure_config.get("hf_auth_token"):
                azure_config["hf_auth_token"] = os.environ.get("HF_AUTH_TOKEN") or os.environ.get("HF_TOKEN", "")
        
        return cls(
            pipeline=PipelineMetadata(**data.get("pipeline", {})),
            azure=AzureConfig(**azure_config),
            preprocess=PreprocessConfig(**data.get("preprocess", {})),
            transcription=TranscriptionConfig(**data.get("transcription", {})),
            diarization=DiarizationConfig(**data.get("diarization", {})),
            emotion=EmotionConfig(**data.get("emotion", {})),
            speaker_embedding=SpeakerEmbeddingConfig(**data.get("speaker_embedding", {})),
            speaker_matching=SpeakerMatchingConfig(**data.get("speaker_matching", {})),
            naming=NamingConfig(**data.get("naming", {})),
            postprocess=PostprocessConfig(**data.get("postprocess", {})),
            logging=LoggingConfig(**data.get("logging", {})),
        )
    
    def to_file(self, path: Path) -> None:
        """Save configuration to TOML file."""
        if isinstance(path, str):
            path = Path(path)
        
        path.parent.mkdir(parents=True, exist_ok=True)
        
        data = {
            "pipeline": self.pipeline.__dict__,
            "azure": self.azure.__dict__,
            "preprocess": self.preprocess.__dict__,
            "transcription": self.transcription.__dict__,
            "diarization": self.diarization.__dict__,
            "emotion": self.emotion.__dict__,
            "speaker_embedding": self.speaker_embedding.__dict__,
            "speaker_matching": self.speaker_matching.__dict__,
            "naming": self.naming.__dict__,
            "postprocess": self.postprocess.__dict__,
            "logging": self.logging.__dict__,
        }
        
        with open(path, "w") as f:
            toml.dump(data, f)
