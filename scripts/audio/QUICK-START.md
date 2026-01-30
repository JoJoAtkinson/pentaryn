# Audio Processing Pipeline - Quick Start Guide

## Overview

A modular, step-based pipeline for processing D&D session recordings into enriched transcripts with speaker identification, emotion analysis, and cross-session speaker matching.

## Installation

### 1. Install Python Dependencies

```bash
cd /Users/joe/GitHub/dnd

# Core dependencies (already in pyproject.toml)
# - whisperx, torch, azure-ai-ml, azure-identity, etc.

# Additional dependencies needed
uv pip install librosa soundfile scipy scikit-learn
uv pip install pyannote.audio speechbrain transformers
```

### 2. Install System Dependencies

```bash
# FFmpeg (for audio processing)
brew install ffmpeg

# For high-quality text rendering (optional)
brew install libraqm harfbuzz fribidi freetype
```

### 3. Configure Pipeline

Edit `scripts/audio/pipeline.config.toml`:

```toml
[pipeline]
default_output_dir = ".output"

[azure]
subscription_id = "your-subscription-id"
resource_group = "your-resource-group"
workspace_name = "your-workspace"

# Other settings have sensible defaults
```

## Basic Usage

### Process a Single Recording

```bash
# Full pipeline (Steps 0-1 currently implemented)
python -m scripts.audio.pipeline.orchestrator \
  --audio sessions/04/Session_04.m4a \
  --config scripts/audio/pipeline.config.toml

# Output: .output/Session_04/
```

### Run Individual Steps

```bash
# Step 0: Normalize audio
python -m scripts.audio.pipeline.preprocess.normalize \
  --audio sessions/04/Session_04.m4a \
  --output .output/Session_04/preprocess \
  --config scripts/audio/pipeline.config.toml

# Step 1: Transcribe (requires Step 0 output)
python -m scripts.audio.pipeline.transcription.transcribe \
  --audio .output/Session_04/preprocess \
  --output .output/Session_04/transcription \
  --config scripts/audio/pipeline.config.toml \
  --audio-mode table_single_mic \
  --device cpu
```

## Pipeline Steps

| Step | Module | Status | Description |
|------|--------|--------|-------------|
| 0 | `preprocess` | ✅ Complete | Normalize audio (16kHz mono, EBU R128) |
| 1 | `transcription` | ✅ Complete | WhisperX transcription with word timestamps |
| 2 | `diarization` | 🚧 Stub | pyannote.audio speaker identification |
| 3 | `emotion` | 🚧 Stub | WavLM emotion analysis (A/V/D) |
| 4 | `speaker_embedding` | 🚧 Stub | ECAPA embeddings + DB matching |
| 5 | `postprocess` | 🚧 Stub | Merge metadata + validation |

## Audio Modes

### Mode A: Discord Multitrack
- Multiple close-mic tracks (one per speaker)
- Speaker identity from filenames
- Clean embeddings → auto DB update

```bash
python -m scripts.audio.pipeline.orchestrator \
  --audio sessions/06/tracks/ \
  --audio-mode discord_multitrack
```

### Mode B: Table Single Mic
- Single recording of multiple speakers
- Diarization assigns speaker IDs
- Room-mix embeddings → manual DB review

```bash
python -m scripts.audio.pipeline.orchestrator \
  --audio sessions/04/Session_04.m4a \
  --audio-mode table_single_mic
```

## Output Structure

```
.output/Session_04/
├── preprocess/
│   └── normalized.flac              # Normalized audio
├── transcription/
│   ├── raw_segments.jsonl           # Transcription segments
│   └── chunks_manifest.json         # Chunk metadata (if chunked)
├── diarization/                     # (not yet implemented)
│   └── diarization.jsonl
├── emotion/                         # (not yet implemented)
│   └── emotion_scores.jsonl
├── speaker_embedding/               # (not yet implemented)
│   ├── embeddings.jsonl
│   ├── matches.json
│   └── speaker_db_delta.json
└── postprocess/                     # (not yet implemented)
    ├── final.jsonl                  # Enhanced transcript
    └── validation_report.json
```

## Configuration Reference

### Key Settings

```toml
[preprocess]
sample_rate = 16000                  # Required by Whisper/WavLM
loudnorm_target_lufs = -23.0         # EBU R128 broadcast standard
highpass_hz = 80                     # Remove rumble

[transcription]
model = "large-v3"                   # Whisper model size
chunk_duration_hours = 3.0           # Split long recordings
overlap_seconds = 120                # Chunk overlap for continuity
owned_interval_stitching = true      # Prevent duplicate segments

[diarization]
model = "pyannote/speaker-diarization-3.1"
min_speakers = 2
max_speakers = 6

[emotion]
model = "tiantiaf/wavlm-large-msp-podcast-emotion-dim"
label_set = "arousal_valence_dominance"

[speaker_embedding]
model = "speechbrain/spkrec-ecapa-voxceleb"
similarity_threshold = 0.85          # Match confidence
```

## Troubleshooting

### FFmpeg Not Found
```bash
brew install ffmpeg
```

### WhisperX Import Error
```bash
uv pip install whisperx
```

### CUDA Out of Memory
- Use smaller Whisper model: `model = "large-v2"` or `"medium"`
- Reduce batch size: `batch_size = 8`
- Use CPU: `--device cpu`

### Audio Too Long
- Pipeline automatically chunks audio > 3 hours
- Adjust: `chunk_duration_hours = 2.0`

## Development Status

### ✅ Implemented
- Complete folder structure
- Configuration system (TOML + dataclasses)
- Common utilities (audio, file, logging, Azure)
- Step 0: Audio preprocessing with FFmpeg
- Step 1: Transcription with WhisperX + chunking
- Basic orchestrator for sequential execution

### 🚧 In Progress (Stubs Created)
- Step 2: Diarization with pyannote.audio
- Step 3: Emotion analysis with WavLM
- Step 4: Speaker embeddings with ECAPA
- Step 5: Post-processing and validation
- Speaker database schema and persistence
- Azure ML job submission

## Next Steps

1. **Test Steps 0-1**: Run on sample audio to verify
2. **Implement Step 2**: Add diarization module
3. **Implement Step 3**: Add emotion analysis
4. **Implement Step 4**: Add speaker embeddings
5. **Implement Step 5**: Add post-processing
6. **Azure ML Integration**: Submit jobs to cloud

## Examples

### Process Recent Session
```bash
python -m scripts.audio.pipeline.orchestrator \
  --audio sessions/04/Session_04.m4a \
  --output .output/Session_04
```

### Run Specific Steps
```bash
# Just normalize and transcribe
python -m scripts.audio.pipeline.orchestrator \
  --audio sessions/04/Session_04.m4a \
  --steps 0 1
```

### Use GPU for Transcription
```bash
python -m scripts.audio.pipeline.orchestrator \
  --audio sessions/04/Session_04.m4a \
  --device cuda
```

## Support

See full documentation in:
- [PIPELINE-PLAN.md](PIPELINE-PLAN.md) - Complete architecture spec
- [README-PIPELINE.md](README-PIPELINE.md) - Implementation status
- Individual step READMEs in each module folder
