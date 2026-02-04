# Audio Processing Pipeline Implementation

## Implementation Status

### ✅ Completed
1. **Folder Structure** - All pipeline directories created
2. **Common Utilities** - Audio, file, logging, and Azure utilities
3. **Configuration System** - Complete dataclass-based config with TOML support
4. **Step 0: Preprocess** - FFmpeg-based audio normalization (Mode A & B)
5. **Step 1: Transcription** - WhisperX with chunking support (Mode A & B)

### 🚧 In Progress
The following modules need full implementation:

- **Step 2: Diarization** - pyannote.audio speaker identification (Azure ML - GPU)
- **Step 3: Emotion** - WavLM-based emotion analysis (Azure ML - GPU)
- **Step 4: Speaker Embeddings** - ECAPA embeddings + cross-session matching (Azure ML - GPU)
- **Step 5: Post-processing** - Merge all metadata + validation (Local execution)
- **Azure ML Workflow** - Separate compute per step (CPU for Step 0, GPU for Steps 1-4)
- **Environment Handling** - Load HF_TOKEN from root .env, pass to Azure jobs

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

### 4. Run Full Pipeline (Azure ML)

```bash
python scripts/audio/orchestrator.py sessions/05 \
  --config scripts/audio/pipeline.config.toml
```

## Architecture Overview

```
Raw Audio → [0_preprocess (CPU)] → [1_transcription (GPU)] → [2_diarization (GPU)] → 
           [3_emotion (GPU)] ← parallel → [4_speaker_embedding (GPU)] → [5_postprocess (local)] → final.jsonl
```

**Correct Step Order for Mode B:**
- Sequential: 0 (CPU) → 1 (GPU) → 2 (GPU)
- Parallel: [3 (GPU), 4 (GPU)] (both depend on Step 2)
- Final: 5 (Local) (depends on Steps 3 & 4)

### Mode A: Multitrack (Discord)
- Track-based speaker identity (trusted from filenames)
- Skips Step 2 (no diarization ML needed—uses track-based adapter)
- Clean close-mic embeddings auto-update DB
- Order: 0 (CPU) → 1 (GPU) → [3 (GPU), 4 (GPU)] → 5 (Local)

### Mode B: Single Mic (Table Recording)
- Diarization assigns session-local speaker IDs
- Cross-chunk linking for session-stable IDs
- Room-mix embeddings matched against DB
- Manual review required for DB updates

## File Structure

```
scripts/audio/
├── orchestrator.py             ✅ Azure ML pipeline runner
├── pipeline/
│   ├── __init__.py
│   ├── config.py                    ✅ Complete (adding HF_TOKEN loading)
│   ├── common/
│   │   ├── audio_utils.py          ✅ Complete (adding safe_globals)
│   │   ├── file_utils.py           ✅ Complete
│   │   ├── logging_utils.py        ✅ Complete (adding heartbeat)
│   │   └── azure_utils.py          ✅ Complete (adding CUDA validation)
│   ├── preprocess/
│   │   ├── normalize.py            ✅ Complete
│   │   ├── job.py                  🚧 Needed (CPU compute definition)
│   │   └── README.md               ✅ Complete
│   ├── transcription/
│   │   ├── transcribe.py           ✅ Complete
│   │   ├── job.py                  🚧 Needed (GPU compute definition)
│   │   └── README.md               🚧 Needed
│   ├── diarization/
│   │   ├── diarize.py              🚧 Needs implementation
│   │   ├── job.py                  🚧 Needed (GPU compute definition)
│   │   └── README.md               🚧 Needed
│   ├── emotion/
│   │   ├── analyze.py              🚧 Needs implementation
│   │   ├── job.py                  🚧 Needed (GPU compute definition)
│   │   └── README.md               🚧 Needed
│   ├── speaker_embedding/
│   │   ├── extract.py              🚧 Needs implementation
│   │   ├── match.py                🚧 Needs implementation
│   │   ├── job.py                  🚧 Needed (GPU compute definition)
│   │   └── README.md               🚧 Needed
│   ├── postprocess/
│   │   ├── merge.py                🚧 Needs implementation
│   │   ├── validate.py             🚧 Needs implementation
│   │   └── README.md               🚧 Needed
├── speaker_db/
│   ├── embeddings.json             🚧 Needs schema
│   └── README.md                   🚧 Needed
├── pipeline.config.toml            ✅ Complete
└── README-PIPELINE.md              🚧 This file
```

## Next Steps

1. **Add utilities from existing code**: CUDA validation, PyTorch safe_globals, heartbeat logging
2. **Create Azure ML job definitions**: job.py for Steps 0-4 with compute assignments
3. **Implement Step 2**: Diarization with Mode A adapter and Mode B ML pipeline
4. **Implement Step 4**: Speaker embeddings with Mode A auto-update and Mode B matching
5. **Implement Step 3**: Emotion analysis (can parallelize with Step 4)
6. **Implement Step 5**: Post-processing merger and validation
7. **Extend Azure ML Pipeline**: Add Steps 2–4 as pipeline jobs + local Step 5 wiring
8. **Testing**: End-to-end tests with Mode A and Mode B audio

## Azure ML Compute Architecture

**Each step runs on fresh compute instance with clean memory:**

- **Step 0 (Preprocess)**: CPU compute (`Standard_D4s_v3`) - FFmpeg doesn't use GPU, saves costs
- **Step 1 (Transcription)**: GPU compute (`gpu-transcribe` / `Standard_NC4as_T4_v3`) - WhisperX
- **Step 2 (Diarization)**: GPU compute (`gpu-transcribe`) - pyannote.audio (CPU fallback for long recordings)
- **Step 3 (Emotion)**: GPU compute (`gpu-transcribe`) - WavLM
- **Step 4 (Speaker Embedding)**: GPU compute (`gpu-transcribe`) - SpeechBrain ECAPA
- **Step 5 (Post-processing)**: Local execution (no Azure job) - Pure Python merging

**Benefits:**
- Fresh memory per step prevents OOM errors
- Granular debugging: re-run failed steps individually
- Parallel execution: Steps 3 & 4 run simultaneously after Step 2
- Cost optimization: CPU-only for normalization

**Environment Variables:**
- `HF_AUTH_TOKEN` loaded from root `.env` file
- Passed to Azure ML jobs for pyannote.audio and transformers authentication

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
