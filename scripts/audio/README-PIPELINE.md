# Audio Processing Pipeline Implementation

## Implementation Status

### ✅ Completed
1. **Folder Structure** - All pipeline directories created
2. **Common Utilities** - Audio, file, logging, and Azure utilities
3. **Configuration System** - Complete dataclass-based config with TOML support
4. **Step 0: Preprocess** - FFmpeg-based audio normalization (Mode A & B)
5. **Step 1: Transcription** - WhisperX with chunking support (Mode A & B)

### 🚧 In Progress
The following modules have been scaffolded and need full implementation:

- **Step 2: Diarization** - pyannote.audio speaker identification
- **Step 3: Emotion** - WavLM-based emotion analysis
- **Step 4: Speaker Embeddings** - ECAPA embeddings + cross-session matching
- **Step 5: Post-processing** - Merge all metadata + validation
- **Orchestrator** - Pipeline controller for sequential execution
- **Speaker Database** - Persistent speaker embedding storage

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/joe/GitHub/dnd
uv pip install librosa soundfile tomlkit scipy scikit-learn
uv pip install whisperx pyannote.audio speechbrain transformers
```

### 2. Configure Pipeline

Edit `scripts/audio/pipeline.config.toml` with your Azure settings.

### 3. Run Individual Steps

```bash
# Step 0: Normalize audio
python -m scripts.audio.pipeline.0_preprocess.normalize \
  --audio sessions/04/Session_04.m4a \
  --output .output/Session_04/0_preprocess \
  --config scripts/audio/pipeline.config.toml

# Step 1: Transcribe
python -m scripts.audio.pipeline.1_transcription.transcribe \
  --audio .output/Session_04/0_preprocess \
  --output .output/Session_04/1_transcription \
  --config scripts/audio/pipeline.config.toml \
  --audio-mode table_single_mic \
  --device cpu
```

### 4. Run Full Pipeline (When Orchestrator Complete)

```bash
python -m scripts.audio.pipeline.orchestrator \
  --audio sessions/04/Session_04.m4a \
  --config scripts/audio/pipeline.config.toml \
  --mode local
```

## Architecture Overview

```
Raw Audio → [0_preprocess] → [1_transcription] → [2_diarization] → 
[3_emotion] → [4_speaker_embedding] → [5_postprocess] → final.jsonl
```

### Mode A: Multitrack (Discord)
- Track-based speaker identity (trusted from filenames)
- No diarization needed
- Clean close-mic embeddings update DB automatically

### Mode B: Single Mic (Table Recording)
- Diarization assigns session-local speaker IDs
- Cross-chunk linking for session-stable IDs
- Room-mix embeddings matched against DB
- Manual review required for DB updates

## File Structure

```
scripts/audio/
├── pipeline/
│   ├── __init__.py
│   ├── config.py                    ✅ Complete
│   ├── common/
│   │   ├── audio_utils.py          ✅ Complete
│   │   ├── file_utils.py           ✅ Complete
│   │   ├── logging_utils.py        ✅ Complete
│   │   └── azure_utils.py          ✅ Complete
│   ├── 0_preprocess/
│   │   ├── normalize.py            ✅ Complete
│   │   └── README.md               ✅ Complete
│   ├── 1_transcription/
│   │   ├── transcribe.py           ✅ Complete
│   │   └── README.md               🚧 Needed
│   ├── 2_diarization/              🚧 Needs implementation
│   ├── 3_emotion/                  🚧 Needs implementation
│   ├── 4_speaker_embedding/        🚧 Needs implementation
│   ├── 5_postprocess/              🚧 Needs implementation
│   └── orchestrator.py             🚧 Needs implementation
├── speaker_db/
│   ├── embeddings.json             🚧 Needs schema
│   └── README.md                   🚧 Needed
├── pipeline.config.toml            ✅ Complete
└── README-PIPELINE.md              🚧 This file
```

## Next Steps

1. **Implement Step 2**: Diarization module with pyannote.audio
2. **Implement Step 3**: Emotion analysis with WavLM
3. **Implement Step 4**: Speaker embedding extraction and matching
4. **Implement Step 5**: Post-processing and validation
5. **Create Orchestrator**: Sequential pipeline controller
6. **Create Speaker DB**: Schema and persistence layer
7. **Testing**: End-to-end tests with sample audio

## Configuration

All settings are in `pipeline.config.toml`. Key sections:

- `[pipeline]` - Global settings, output directory
- `[azure]` - Azure ML credentials
- `[preprocess]` - Normalization parameters
- `[transcription]` - Whisper model, chunking
- `[diarization]` - Speaker count, thresholds
- `[emotion]` - Emotion model, labels
- `[speaker_embedding]` - Embedding model, matching
- `[speaker_matching]` - Similarity thresholds
- `[naming]` - Canonical name normalization
- `[postprocess]` - Validation, output format

## Output Format

Final output is `5_postprocess/final.jsonl` with this schema:

```jsonl
{
  "segment_id": 0,
  "session_id": "Session_04",
  "source": {"mode": "table_single_mic", "track": null, "chunk_id": 1},
  "start_s": 0.0,
  "end_s": 1.5,
  "speaker_id": "SPEAKER_02",
  "canonical_name": null,
  "global_voice_id": null,
  "match_status": "unknown",
  "candidates": [{"name": "joe", "score": 0.71, "source": "clean_close_mic"}],
  "overlap": false,
  "text": "Hello world",
  "words": [...],
  "emotion": {
    "arousal": 0.61,
    "valence": 0.42,
    "dominance": 0.55,
    "confidence": null,
    "derived_label": "tense"
  },
  "metadata": {
    "pipeline_version": "1.0.0",
    "models": {...}
  }
}
```

## Development Notes

- All modules use consistent logging via `common.logging_utils`
- File I/O centralized in `common.file_utils`
- Audio processing utilities in `common.audio_utils`
- Configuration loaded via dataclasses for type safety
- Each step can be run independently for debugging
- Intermediate artifacts preserved for inspection
