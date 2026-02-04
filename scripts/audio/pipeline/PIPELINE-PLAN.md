# Audio Processing Pipeline Architecture
## Planning Document

> **Implementation Status**: ✅ Steps 0-1 complete and functional. Steps 2-5 scaffolded (stubs created).
> See [IMPLEMENTATION-SUMMARY.md](IMPLEMENTATION-SUMMARY.md) for details.

---

## 1. Overview

This document outlines a modular, step-based audio processing pipeline for D&D session recordings. The architecture transforms raw audio files into enriched, structured transcripts with speaker identification, emotional context, and cross-session consistency.

### High-Level Architecture

The pipeline follows a **staged processing model** where each step is independent, idempotent, and can be run locally or on Azure ML. Data flows through numbered stages:

```
Raw Audio → Preprocess → Transcription → Diarization → Emotion → Speaker Embeddings → Post-processing → Enhanced JSONL
```

Each stage:
- Reads from previous stage's output
- Writes to its own output directory
- Can be run independently for debugging
- Uses Azure ML for GPU-accelerated tasks
- Maintains full audit trail via intermediate artifacts

### Key Principles

1. **Modularity**: Each stage is a separate module with clear inputs/outputs
2. **Idempotency**: Re-running a stage produces identical results
3. **Fresh Memory**: Each Azure ML job starts with clean environment (no state leakage)
4. **Local/Cloud Parity**: Same code runs locally and on Azure ML
5. **Chunking for Scale**: Long recordings (>3 hours) split into manageable chunks
6. **Consistent Audio Prep**: Normalize audio to 16 kHz mono + EBU R128 loudness
7. **Speaker Persistence**: Speaker embeddings enable cross-session identity matching
8. **DRY Principle**: Shared utilities extracted to common modules
9. **Low Coupling**: Stages communicate only through file artifacts
10. **Unattended Runs**: No manual steps mid-pipeline; review happens after completion

---

## 2. Folder Structure

```
scripts/audio/
├── pipeline/                          # New pipeline implementation
│   ├── __init__.py
│   ├── config.py                      # Configuration dataclasses
│   ├── common/                        # Shared utilities
│   │   ├── __init__.py
│   │   ├── audio_utils.py            # Audio loading, chunking
│   │   ├── file_utils.py             # Path handling, JSONL I/O
│   │   ├── logging_utils.py          # Logging setup
│   │   └── azure_utils.py            # Azure ML helpers
│   ├── 0_preprocess/
│   │   ├── __init__.py
│   │   ├── normalize.py              # ✅ Resample + loudness normalize
│   │   ├── job.py                    # TODO: Azure ML job definition
│   │   └── README.md                 # ✅ Complete
│   ├── 1_transcription/
│   │   ├── __init__.py
│   │   ├── transcribe.py             # ✅ Whisper transcription
│   │   ├── job.py                    # TODO: Azure ML job definition
│   │   └── README.md                 # TODO: Needs creation
│   ├── 2_diarization/
│   │   ├── __init__.py               # ✅ Stub
│   │   ├── diarize.py                # TODO: Speaker diarization
│   │   ├── job.py                    # TODO: Azure ML job definition
│   │   └── README.md                 # TODO
│   ├── 3_emotion/
│   │   ├── __init__.py               # ✅ Stub
│   │   ├── analyze.py                # TODO: Emotion classification
│   │   ├── job.py                    # TODO: Azure ML job definition
│   │   └── README.md                 # TODO
│   ├── 4_speaker_embedding/
│   │   ├── __init__.py               # ✅ Stub
│   │   ├── extract.py                # TODO: Extract speaker embeddings
│   │   ├── match.py                  # TODO: Match speakers across sessions
│   │   ├── job.py                    # TODO: Azure ML job definition
│   │   └── README.md                 # TODO
│   ├── 5_postprocess/
│   │   ├── __init__.py               # ✅ Stub
│   │   ├── merge.py                  # TODO: Merge all metadata
│   │   ├── validate.py               # TODO: Quality checks
│   │   └── README.md                 # TODO
│   └── orchestrator.py                # ✅ Pipeline controller (Steps 0-1)
├── speaker_db/                        # Speaker embedding database
│   ├── embeddings.json               # ✅ Initialized (empty)
│   └── README.md                     # ✅ Complete schema docs
├── pipeline.config.toml               # ✅ Complete configuration
├── transcribe_audio.py                # KEEP: Existing monolithic script
├── azure_transcribe_wrapper.py       # KEEP: Existing Azure wrapper
├── submit_transcription.py            # KEEP: Existing submission script
├── QUICK-START.md                     # ✅ Usage guide
├── README-PIPELINE.md                 # ✅ Implementation tracker
├── IMPLEMENTATION-SUMMARY.md          # ✅ What was built
└── verify_pipeline.py                 # ✅ Verification script
```

### Output Structure (per audio file)

```
.output/
└── Session_04/
    ├── audio/
    │   ├── Session_04.m4a             # Mode B: mixed input
    │   ├── tracks/                    # Mode A: per-person tracks
    │   │   ├── joe.m4a
    │   │   ├── eric.m4a
    │   │   └── manifest.json          # Optional auto-generated list
    │   └── chunks/                    # Mode B chunking (>3 hours)
    │       ├── chunk_001.flac
    │       ├── chunk_002.flac
    │       └── manifest.json
    ├── 0_preprocess/
    │   ├── normalized.flac            # Mode B normalized audio
    │   ├── normalized_tracks/         # Mode A normalized tracks
    │   │   ├── joe.flac
    │   │   └── eric.flac
    │   └── log.txt
    ├── 1_transcription/
    │   ├── raw_segments.jsonl         # Whisper output
    │   ├── metadata.json              # Model info, timing
    │   └── log.txt
    ├── 2_diarization/
    │   ├── diarization.jsonl          # Speaker turns
    │   ├── speaker_stats.json         # Speaker time stats
    │   └── log.txt
    ├── 3_emotion/
    │   ├── emotion_scores.jsonl       # Per-segment emotions
    │   ├── model_info.json
    │   └── log.txt
    ├── 4_speaker_embedding/
    │   ├── embeddings.jsonl           # Per-speaker vectors
    │   ├── matches.json               # Cross-session matches
    │   ├── speaker_db_delta.json      # Mode B: DB update proposal
    │   └── log.txt
    ├── 5_postprocess/
    │   ├── final.jsonl                # Enhanced output
    │   ├── validation_report.json
    │   └── log.txt
    └── pipeline_manifest.json         # Full pipeline metadata
```

---

## 3. Pipeline Steps

### Step 0: Preprocess / Normalize (`0_preprocess/`)

**Purpose**: Standardize audio format and loudness for consistent model performance

**Technology**: FFmpeg `loudnorm` (EBU R128 / ITU-R BS.1770)

**Key Operations**:
1. Resolve inputs (Mode A tracks or Mode B mixed file)
   - Mode A: normalize each track independently
   - Mode B: normalize the mixed track once
2. Convert to mono 16 kHz PCM and store as FLAC
3. Apply loudness normalization (two-pass) to target LUFS
4. Apply optional high-pass filter to remove rumble
5. Write normalized audio artifacts

**Why these settings** (online references):
- Whisper uses **16 kHz** input (`SAMPLE_RATE = 16000`)
- WavLM is pretrained on **16 kHz** audio
- SpeechBrain ECAPA is trained on **16 kHz, single-channel** audio
- FFmpeg `loudnorm` implements **EBU R128** loudness normalization
**Recommended defaults**:
- `loudnorm_target_lufs = -23.0`, `loudnorm_range_lu = 11.0`, `true_peak_db = -1.5`, `highpass_hz = 80`

**Output**:
- Mode A: `0_preprocess/normalized_tracks/*.flac`
- Mode B: `0_preprocess/normalized.flac`

**Configuration**:
```toml
[preprocess]
enabled = true
sample_rate = 16000
channels = 1
loudnorm_target_lufs = -23.0
loudnorm_range_lu = 11.0
true_peak_db = -1.5
highpass_hz = 80
two_pass = true
output_format = "flac"
output_format = "flac"      # flac | wav
```
**Implementation note**:
- Use FFmpeg `loudnorm` in two-pass mode (measure → normalize) for stable LUFS targeting.
- FLAC is lossless; decode to PCM for model inference to avoid any quality loss.

**Azure ML Job**:
- Compute: CPU (fast)
- Inputs: Raw audio or track directory
- Outputs: `0_preprocess/` directory

### Step 1: Transcription (`1_transcription/`)

**Purpose**: Convert audio to text with word-level timestamps

**Technology**: WhisperX (faster-whisper + forced alignment)

**Key Operations**:
1. Load normalized audio from `0_preprocess/` (FLAC → PCM decode as needed)
2. Mode A: iterate per-person tracks and transcribe each track
3. Mode B: load mixed audio and check if chunking needed (duration > 3 hours)
4. Run Whisper model (`large-v2` or `large-v3`)
5. Perform forced alignment for word timestamps
6. Write raw segments to JSONL (track-aware for Mode A, chunk-aware for Mode B)

**Output Schema** (`raw_segments.jsonl`):
```jsonl
{"segment_id": 0, "text": "Hello world", "start": 0.0, "end": 1.5, "chunk_id": 1, "track": null, "words": [{"word": "Hello", "start": 0.0, "end": 0.5}, {"word": "world", "start": 0.6, "end": 1.5}]}
{"segment_id": 1, "text": "How are you?", "start": 1.6, "end": 3.2, "chunk_id": 1, "track": null, "words": [...]}
```
**Note**: `start`/`end` are global timestamps for Mode B; `track` is populated for Mode A.

**Chunking Strategy (Mode B)**:
- Target: 3 hours per chunk (safe margin under 4-hour limit)
- Split on silence boundaries (using VAD)
- Include 120-second overlap for continuity
- Write `manifest.json` with global offsets
- **Owned-interval stitching** to prevent duplicates:
  - First chunk: `[t0, t1 - O/2]`
  - Middle chunks: `[t0 + O/2, t1 - O/2]`
  - Last chunk: `[t0 + O/2, t1]`
  - Keep segments whose midpoint falls in the owned interval
**Note**: Chunking runs on normalized audio from Step 0.

**Configuration**:
```toml
[transcription]
model = "large-v3"
language = "en"
compute_type = "float16"
batch_size = 16
chunk_duration_hours = 3.0
overlap_seconds = 120
vad_filter = true
owned_interval_stitching = true
```

**Azure ML Job**:
- Compute: `Standard_NC4as_T4_v3` (NVIDIA T4, 16GB)
- Runtime: ~1.5x real-time for `large-v3`
- Inputs: Audio file
- Outputs: `1_transcription/` directory

---

### Step 2: Diarization + Cross-Chunk Linking (`2_diarization/`)

**Purpose**: Identify speaker turns and assign **session-stable** speaker IDs (Mode B)
Mode A uses a lightweight adapter to emit `diarization.jsonl` without ML.

**Technology**: pyannote.audio 3.x

**Key Operations**:
1. Mode A: **adapter step** (no ML). Build diarization.jsonl from track segments (`speaker_id = TRACK_<canonical_name>`) and compute overlaps.
2. Mode B: run diarization per chunk on normalized mixed audio
3. Extract embeddings per chunk speaker (SpeechBrain ECAPA) for linking (Mode B only)
4. Cross-chunk linking:
   - Anchor adjacent chunks via overlap windows
   - Constrained agglomerative clustering (average linkage)
   - Assign **session-level** `speaker_id` (e.g., `SPEAKER_02`)
5. Align diarization to transcription segments via time overlap (Mode B)
6. Generate speaker statistics (total time, turn count)
7. **Primary speaker rule**: choose the speaker with the highest overlap duration per segment; store others in `overlap_speakers`.

**Output Schema** (`diarization.jsonl`):
```jsonl
{"segment_id": 0, "speaker_id": "SPEAKER_02", "chunk_label": "SPEAKER_00", "chunk_id": 1, "start": 0.0, "end": 1.5, "overlap": false}
{"segment_id": 1, "speaker_id": "SPEAKER_01", "chunk_label": "SPEAKER_03", "chunk_id": 1, "start": 1.6, "end": 3.2, "overlap": true, "overlap_speakers": ["SPEAKER_02"]}
```
**Note**: `start`/`end` are **global** timestamps (chunk offsets applied).
Mode A uses `speaker_id = TRACK_<canonical_name>` and `chunk_label = TRACK_<canonical_name>` via the adapter.

**Configuration**:
```toml
[diarization]
model = "pyannote/speaker-diarization-3.1"
min_speakers = 2
max_speakers = 6
overlap_threshold = 0.5  # Minimum overlap for speaker assignment
cross_chunk_linkage = "average"
cross_chunk_threshold = 0.78
overlap_window_seconds = 120
```

**Azure ML Job**:
- Compute: `Standard_NC4as_T4_v3` (can use CPU if GPU unavailable)
- Runtime: ~0.8x real-time
- Inputs: Audio file, `1_transcription/raw_segments.jsonl`
- Outputs: `2_diarization/` directory

---

### Step 3: Emotion Analysis (`3_emotion/`)

**Purpose**: Classify emotional tone per **speaker turn**

**Technology**: `tiantiaf/wavlm-large-msp-podcast-emotion-dim`
- Label set (dimensional): **Arousal**, **Valence**, **Dominance**
- Output values are 0.0–1.0 per dimension
**Configurable**: model ID is read from `pipeline.config.toml` and can be swapped without code changes.
**Dependency note**: This model requires the Vox-Profile wrapper for inference (not a standard HF pipeline).

**Key Operations**:
1. Load speaker turns (single-speaker windows)
   - Mode A: turns are derived from track segments
   - Mode B: turns are derived from diarization
2. Extract audio features for each turn
3. Run dimensional emotion model
4. Write A/V/D scores with optional derived label + confidence (if calibrated)
5. Text fallback is disabled by default (configurable)

**Output Schema** (`emotion_scores.jsonl`):
```jsonl
{"segment_id": 0, "arousal": 0.61, "valence": 0.42, "dominance": 0.55, "confidence": 0.63, "derived_label": "tense"}
{"segment_id": 1, "arousal": 0.18, "valence": 0.76, "dominance": 0.44, "confidence": 0.71, "derived_label": "positive_calm"}
```

**Configuration**:
```toml
[emotion]
model = "tiantiaf/wavlm-large-msp-podcast-emotion-dim"
label_set = "arousal_valence_dominance"
batch_size = 32
min_segment_duration = 0.5  # Skip very short segments
derived_labels = true       # Optional mapping from A/V/D to coarse labels
text_fallback = false
confidence_strategy = "calibrated"  # "none" | "calibrated" (set to none until tuned)
```
If `confidence_strategy = "none"`, set `emotion.confidence = null` in outputs.

**Azure ML Job**:
- Compute: `Standard_NC4as_T4_v3`
- Runtime: ~0.5x real-time
- Inputs: Audio file, `1_transcription/raw_segments.jsonl`
- Outputs: `3_emotion/` directory

---

### Step 4: Speaker Embeddings + Matching (`4_speaker_embedding/`)

**Purpose**: Extract speaker embeddings for cross-session identity matching and DB updates

**Technology**: `speechbrain/spkrec-ecapa-voxceleb`
**Configurable**: model ID is read from `pipeline.config.toml` for easy upgrades.

**Key Operations**:
1. Mode A: derive `canonical_name` from filename (normalized), compute clean-close-mic embeddings
2. Mode B: compute embeddings for each session speaker (room-mix), using normalized audio turns
3. Match session speakers to DB using **one-to-one assignment** (Hungarian) + thresholds
4. Emit `match_status` + `candidates` for ambiguous or unknown matches
5. Update DB:
   - Mode A: auto-approve centroid updates (trusted identity)
   - Mode B: write `speaker_db_delta.json` for review (no auto-commit)

**Output Schema** (`embeddings.jsonl`):
```jsonl
{"session_id": "Session_04", "speaker_id": "SPEAKER_02", "embedding": [0.123, -0.456, ...], "source": "room_mix", "duration_seconds": 1234.5, "segment_count": 345}
{"session_id": "Session_04", "speaker_id": "TRACK_joe", "embedding": [0.789, 0.012, ...], "source": "clean_close_mic", "duration_seconds": 987.2, "segment_count": 298}
```

**Matches Schema** (`matches.json`):
```json
{
  "SPEAKER_02": {
    "global_voice_id": "GV_0007",
    "canonical_name": "joe",
    "match_status": "confirmed",
    "candidates": [
      {"name": "joe", "score": 0.91, "source": "clean_close_mic"},
      {"name": "eric", "score": 0.74, "source": "room_mix"}
    ]
  }
}
```
If no match is confident, set `match_status = "unknown"` and leave `canonical_name`/`global_voice_id` null.
Mode A sets `match_status = "confirmed"` and assigns `canonical_name` directly from the track name.

**Speaker Database** (`speaker_db/embeddings.json`):
```json
{
  "GV_0007": {
    "canonical_name": "joe",
    "embeddings": {
      "clean_close_mic": {"centroid": [0.1, -0.2, ...], "num_embeddings": 120},
      "room_mix": {"centroid": [0.2, -0.1, ...], "num_embeddings": 40}
    },
    "per_session": [
      {"session_id": "Session_04", "source": "room_mix", "embedding": [0.12, ...], "duration_seconds": 940.2}
    ],
    "sessions": ["Session_01", "Session_02", "Session_04"],
    "last_updated": "2026-01-25T10:30:00Z"
  }
}
```

**Configuration**:
```toml
[speaker_embedding]
model = "speechbrain/spkrec-ecapa-voxceleb"
min_turn_duration_seconds = 1.5
top_k_segments = 20
max_embeddings_per_speaker = 50
aggregation = "mean"

[speaker_matching]
assignment = "hungarian"
similarity_threshold = 0.85         # Assign global_voice_id if median sim >= 0.85
centroid_update_threshold = 0.88    # Update centroid if median sim >= 0.88
min_clean_duration_seconds = 60
```

**Azure ML Job**:
- Compute: `Standard_NC4as_T4_v3` (or CPU)
- Runtime: ~0.3x real-time
- Inputs: Audio file, `2_diarization/diarization.jsonl`, `speaker_db/embeddings.json`
- Outputs: `4_speaker_embedding/` directory, `speaker_db_delta.json`

---

### Step 5: Post-Processing (`5_postprocess/`)

**Purpose**: Merge all metadata, validate, and produce final output

**Key Operations**:
1. Load all intermediate results (transcription, diarization, emotion, embeddings)
2. Merge by **global time** (owned-interval stitching + overlap-aware join)
3. Apply `canonical_name` and `global_voice_id` from matches
4. Preserve overlap flags and candidates
5. Validate completeness and consistency
6. Generate validation report
7. Write final enhanced JSONL

**Output Schema** (`final.jsonl`):
```jsonl
{"segment_id": 0, "session_id": "Session_04", "source": {"mode": "table_single_mic", "track": null, "chunk_id": 1}, "start_s": 0.0, "end_s": 1.5, "speaker_id": "SPEAKER_02", "canonical_name": null, "global_voice_id": null, "match_status": "unknown", "candidates": [{"name": "joe", "score": 0.71, "source": "clean_close_mic"}], "overlap": false, "overlap_speakers": [], "text": "Hello world", "words": [...], "emotion": {"arousal": 0.61, "valence": 0.42, "dominance": 0.55, "confidence": 0.63, "derived_label": "tense"}, "metadata": {"pipeline_version": "1.0.0", "models": {"transcription": "large-v3", "diarization": "pyannote/speaker-diarization-3.1", "emotion": "tiantiaf/wavlm-large-msp-podcast-emotion-dim", "embedding": "speechbrain/spkrec-ecapa-voxceleb"}}}
```

**Validation Report** (`validation_report.json`):
```json
{
  "total_segments": 1234,
  "validated": 1230,
  "warnings": [
    {"type": "unknown_speaker", "segment_ids": [45, 89], "count": 2},
    {"type": "low_emotion_confidence", "segment_ids": [123, 456], "count": 2}
  ],
  "errors": [],
  "duration_seconds": 3456.7,
  "speaker_stats": {
    "SPEAKER_01": {"segments": 345, "duration": 1234.5},
    "SPEAKER_02": {"segments": 298, "duration": 987.2}
  }
}
```

**Configuration**:
```toml
[postprocess]
validation_strict = false  # Fail on warnings vs. errors only
unknown_speaker_handling = "preserve"  # "preserve" | "merge" | "flag"
```

**Execution**: Local (no Azure ML needed)

---

## 4. Data Flow

**Mode A (multitrack)**:
```
Tracks → Preprocess → Transcription → Emotion → Embeddings/DB Update → Post-process → final.jsonl
```

**Mode B (single mic)**:
```
Mixed Audio → Preprocess → Transcription → Diarization + Cross-Chunk Linking → Emotion → Embeddings/Matching → Post-process → final.jsonl
```

### Flow Diagram

```
┌─────────────────┐
│  Raw Audio      │
│  (M4A/WAV)      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ Step 0: Preprocess (CPU)                                │
│ - Resample to 16 kHz mono                               │
│ - Loudness normalize (EBU R128)                         │
└────────┬────────────────────────────────────────────────┘
         │ normalized audio
         ▼
┌─────────────────────────────────────────────────────────┐
│ Step 1: Transcription (Azure ML - GPU)                  │
│ - Whisper large-v3                                      │
│ - Forced alignment                                      │
│ - Chunking if needed                                    │
└────────┬────────────────────────────────────────────────┘
         │ raw_segments.jsonl
         ▼
┌─────────────────────────────────────────────────────────┐
│ Step 2: Diarization + Cross-Chunk Linking               │
│ - pyannote.audio                                        │
│ - Session-stable speaker IDs                            │
└────────┬────────────────────────────────────────────────┘
         │ diarization.jsonl
         ▼
┌─────────────────────────────────────────────────────────┐
│ Step 3: Emotion (Azure ML - GPU)                        │
│ - WavLM (MSP-Podcast, A/V/D)                            │
│ - Per-segment emotion scores                            │
└────────┬────────────────────────────────────────────────┘
         │ emotion_scores.jsonl
         ▼
┌─────────────────────────────────────────────────────────┐
│ Step 4: Speaker Embeddings (Azure ML - GPU/CPU)         │
│ - Extract speaker vectors                               │
│ - Match against speaker DB                              │
│ - Update canonical names                                │
└────────┬────────────────────────────────────────────────┘
         │ embeddings.jsonl, matches.json
         ▼
┌─────────────────────────────────────────────────────────┐
│ Step 5: Post-Process (Local)                            │
│ - Merge all metadata                                    │
│ - Validate                                              │
│ - Generate final output                                 │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  final.jsonl    │ ← Enhanced transcript
└─────────────────┘
```
Mode A skips Step 2; speaker identity comes from track filenames.

### Persistence Strategy

**Intermediate Artifacts**: All steps write to disk
- **Benefit**: Can restart pipeline at any step
- **Benefit**: Debugging and inspection
- **Cost**: Disk space (~2GB per 3-hour session)

**Cleanup**: Optional `--cleanup` flag removes intermediate directories after success

**Caching**: Each step checks if output already exists
- Skip if output present and `--force` not specified
- Checksum validation of inputs ensures correctness

---

## 5. Configuration

### Master Config File (`pipeline.config.toml`)

```toml
[pipeline]
name = "dnd_audio_pipeline"
version = "1.0.0"
default_output_dir = ".output"
audio_mode = "auto"  # auto | discord_multitrack | table_single_mic
session_id = "Session_04"

[azure]
subscription_id = "7593eb4d-6c88-49cb-a4c8-fbe209e62151"
resource_group = "AtJoseph-rg"
workspace_name = "joe-ml-sandbox"
compute_target = "gpu-transcribe"
environment_name = "whisperx-gpu"

[preprocess]
enabled = true
sample_rate = 16000
channels = 1
loudnorm_target_lufs = -23.0
loudnorm_range_lu = 11.0
true_peak_db = -1.5
highpass_hz = 80
two_pass = true

[transcription]
model = "large-v3"
language = "en"
compute_type = "float16"
batch_size = 16
chunk_duration_hours = 3.0
overlap_seconds = 120
vad_filter = true
owned_interval_stitching = true

[diarization]
model = "pyannote/speaker-diarization-3.1"
min_speakers = 2
max_speakers = 6
overlap_threshold = 0.5
device = "cpu"  # "cpu" | "cuda"
cross_chunk_linkage = "average"
cross_chunk_threshold = 0.78
overlap_window_seconds = 120

[emotion]
model = "tiantiaf/wavlm-large-msp-podcast-emotion-dim"
label_set = "arousal_valence_dominance"
batch_size = 32
min_segment_duration = 0.5
derived_labels = true
text_fallback = false

[speaker_embedding]
model = "speechbrain/spkrec-ecapa-voxceleb"
min_turn_duration_seconds = 1.5
top_k_segments = 20
max_embeddings_per_speaker = 50
aggregation = "mean"
database_path = "speaker_db/embeddings.json"
delta_output_path = "4_speaker_embedding/speaker_db_delta.json"

[speaker_matching]
assignment = "hungarian"
similarity_threshold = 0.85
centroid_update_threshold = 0.88
stability_percentile = 0.10
stability_threshold = 0.80
min_clean_duration_seconds = 60

[naming]
canonical_name_case = "lower"
replace_spaces_with = "-"
replace_underscores_with = "-"
strip_non_alnum = true

[postprocess]
validation_strict = false
unknown_speaker_handling = "preserve"

[logging]
level = "INFO"
format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
```

### Per-Job Config Override

```python
# Example: Override config for single job
from pipeline.config import PipelineConfig

config = PipelineConfig.from_file("pipeline.config.toml")
config.transcription.model = "large-v2"  # Use smaller model for testing
config.diarization.max_speakers = 4      # Know exact speaker count
```

---

## 6. Azure ML Integration

### Decision: Pipeline vs. Single Job

**Recommendation: Azure ML Pipeline** (with separate jobs per step)

#### Rationale

| Aspect | Single Job | Pipeline (Separate Jobs) |
|--------|-----------|-------------------------|
| Memory Management | ❌ Shared memory, potential leaks | ✅ Fresh environment per step |
| Debugging | ❌ Hard to isolate failures | ✅ Can re-run specific steps |
| Parallelization | ❌ Sequential only | ✅ Can run emotion + embeddings in parallel |
| Cost | ✅ Single compute session | ⚠️ Multiple startups (mitigated by fast steps) |
| Complexity | ✅ Simpler orchestration | ⚠️ Requires pipeline definition |
| State Management | ❌ In-memory state risky | ✅ File-based state explicit |

**Verdict**: Use Azure ML Pipeline for production. Fresh environment per step prevents memory issues and enables granular debugging.

**Current implementation note (February 4, 2026)**: `scripts/audio/orchestrator.py` submits an **Azure ML pipeline job** for Steps 0–4 and downloads outputs for local Step 5 post-processing. The legacy `scripts/audio/pipeline/orchestrator.py` (local/stepwise Azure command jobs) has been removed.

#### Implementation: `orchestrator.py`

```python
from azure.ai.ml import MLClient, Input, Output
from azure.ai.ml.dsl import pipeline
from azure.ai.ml.entities import JobInput, JobOutput

@pipeline(name="audio_processing", description="Audio → Enhanced Transcript")
def audio_pipeline(audio_file: Input, config_file: Input, speaker_db: Input):
    # Step 0: Preprocess
    preprocess_job = run_preprocess(
        audio=audio_file,
        config=config_file
    )

    # Step 1: Transcription
    transcription_job = run_transcription(
        audio=preprocess_job.outputs.normalized_audio,
        config=config_file
    )
    
    # Step 2: Diarization
    diarization_job = run_diarization(
        audio=preprocess_job.outputs.normalized_audio,
        transcription=transcription_job.outputs.segments,
        config=config_file
    )
    
    # Step 3 & 4: Run in parallel (no dependencies between them)
    emotion_job = run_emotion(
        audio=preprocess_job.outputs.normalized_audio,
        transcription=transcription_job.outputs.segments,
        config=config_file
    )
    
    embedding_job = run_speaker_embedding(
        audio=preprocess_job.outputs.normalized_audio,
        diarization=diarization_job.outputs.diarization,
        speaker_db=speaker_db,
        config=config_file
    )
    
    # Step 5: Post-process (depends on all previous steps)
    final_job = run_postprocess(
        transcription=transcription_job.outputs.segments,
        diarization=diarization_job.outputs.diarization,
        emotion=emotion_job.outputs.emotion_scores,
        embeddings=embedding_job.outputs.matches,
        config=config_file
    )
    
    return {
        "final_transcript": final_job.outputs.final_jsonl,
        "validation_report": final_job.outputs.validation_report,
        "speaker_db_delta": embedding_job.outputs.speaker_db_delta
    }
```

### Legacy (Removed): Per-step Azure Command Jobs

The per-step Azure command-job orchestrator (`scripts/audio/pipeline/orchestrator.py`) was removed on February 4, 2026.  
For step-specific runs, call the individual step modules directly (see Local Testing below).

---

## 7. Speaker Context/Embeddings

### Identity Sources by Mode

- **Mode A (multitrack)**: speaker identity is **trusted** from filename
- **Mode B (single mic)**: speaker identity is discovered via diarization + matching
**Alignment guarantee**: Discord multitrack files are aligned to a shared zero-time start.

**Enrollment note**: Any Mode A session can serve as an enrollment run (not just the first session). Clean-close-mic embeddings are always accepted into the DB.
In other words: **Mode A should always run Step 4 (Speaker Embeddings)** so the database keeps improving over time.

### Canonical Name Normalization

Normalize filename stems to a consistent canonical name:
1. Lowercase
2. Trim leading/trailing whitespace
3. Replace `_` and spaces with `-`
4. Collapse multiple `-` into one
5. Remove non-alphanumeric characters except `-`

Example: `Joe_Smith (GM).m4a` → `joe-smith-gm`

### Embedding Extraction (SpeechBrain ECAPA)

- Model: `speechbrain/spkrec-ecapa-voxceleb`
- **Quality filtering**:
  - `min_turn_duration_seconds = 1.5`
  - Select top `K = 20` turns by `(energy × SNR estimate)`
  - Cap storage at `max_embeddings_per_speaker = 50`
- **Roleplay safeguard (Mode A)**:
  - Build the baseline centroid from the **dominant cluster** of embeddings
  - Treat outlier clusters as character voices (do not update centroid)
- **Storage**: write per-session embeddings + rolling centroids to `speaker_db/embeddings.json`

### Cross-Chunk Linking (Mode B)

1. Extract embeddings for each chunk-local speaker
2. Anchor adjacent chunks using overlap windows
3. Constrained agglomerative clustering (average linkage, cosine similarity)
4. Assign **session-stable** `speaker_id` (`SPEAKER_01`, `SPEAKER_02`, ...)

### Cross-Session Matching (Mode B)

Use one-to-one assignment (Hungarian) with thresholds and candidate lists:

```python
similarities = cosine_matrix(session_speakers, db_centroids)
assignment = hungarian(similarities)

for speaker_id, global_voice_id in assignment:
    scores = similarities[speaker_id]
    median_score = np.median(scores)
    stable = np.percentile(scores, 10) >= 0.80
    if median_score >= 0.85 and stable:
        match_status = "confirmed"
    elif median_score >= 0.75:
        match_status = "tentative"
    else:
        match_status = "unknown"
```

### Database Update Strategy

- **Mode A**: auto-update `clean_close_mic` centroids (trusted identity)
- **Mode B**: write `speaker_db_delta.json` only; update `room_mix` centroid **only** if high-confidence gates pass

When a new canonical name is introduced (Mode A), assign a new `global_voice_id` (e.g., `GV_0001`) and persist it in the DB.

### Handling Edge Cases

| Case | Handling |
|------|----------|
| Unknown speaker | `speaker_id` only; `canonical_name = null`, `match_status = "unknown"` |
| Ambiguous match | `match_status = "tentative"` + `candidates` list |
| Roleplay voices | Treat as same human unless embeddings split strongly |
| Speaker absent | No DB update |

---

## 8. Output Format

### Enhanced JSONL Schema

**File**: `final.jsonl`
**Note**: JSONL is the primary artifact; no `transcript.txt` is required.

**Schema** (per line):
```jsonl
{
  "segment_id": 123,
  "session_id": "2026-01-25-table",
  "source": {"mode": "table_single_mic", "track": null, "chunk_id": 3},
  "start_s": 145.6,
  "end_s": 148.3,
  "speaker_id": "SPEAKER_02",
  "canonical_name": null,
  "global_voice_id": null,
  "match_status": "unknown",
  "candidates": [{"name": "eric", "score": 0.71, "source": "clean_close_mic"}],
  "overlap": false,
  "overlap_speakers": [],
  "text": "I cast fireball at the goblins!",
  "words": [
    {"word": "I", "start": 145.6, "end": 145.7},
    {"word": "cast", "start": 145.8, "end": 146.1},
    ...
  ],
  "emotion": {"arousal": 0.61, "valence": 0.42, "dominance": 0.55, "confidence": 0.63, "derived_label": "tense"},
  "metadata": {"pipeline_version": "1.0.0", "models": {"transcription": "large-v3", "diarization": "pyannote/speaker-diarization-3.1", "emotion": "tiantiaf/wavlm-large-msp-podcast-emotion-dim", "embedding": "speechbrain/spkrec-ecapa-voxceleb"}}
}
```

### Metadata Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `segment_id` | int | Unique ID within session (0-indexed) |
| `session_id` | str | Session identifier |
| `source.mode` | str | `discord_multitrack` or `table_single_mic` |
| `source.track` | str\|null | Track name (Mode A only) |
| `source.chunk_id` | int | Chunk index if audio was split |
| `start_s` | float | Start time in seconds |
| `end_s` | float | End time in seconds |
| `speaker_id` | str | Session-local speaker ID (`SPEAKER_01`, `TRACK_joe`) |
| `canonical_name` | str\|null | Normalized name if known |
| `global_voice_id` | str\|null | Stable cross-session ID if matched |
| `match_status` | str | `confirmed` \| `tentative` \| `unknown` |
| `candidates` | list | Ranked name candidates with scores |
| `overlap` | bool | True if overlapping speech detected |
| `overlap_speakers` | list | Other speakers detected during overlap |
| `text` | str | Transcribed text |
| `words` | list | Word-level timestamps |
| `emotion` | dict | Dimensional A/V/D scores + optional confidence + derived label |
| `metadata.pipeline_version` | str | Pipeline version for reproducibility |
| `metadata.models` | dict | Model IDs used for each step |

### Backward Compatibility

**Existing format** (from `transcripts.jsonl`):
```jsonl
{"speaker": "NICOLE", "text": "Oh man, you missed your whole intro.", "start": 3.139, "end": 4.782}
```

**Enhanced format** adds richer metadata and different field names.
Provide a helper export that maps to legacy fields (`speaker`, `text`, `start`, `end`) when needed.

---

## 9. Running the Pipeline

### Local Testing

```bash
# Test individual steps
python -m pipeline.1_transcription.transcribe --audio Session_04.m4a --audio-mode table_single_mic --output .output/Session_04/1_transcription/
python -m pipeline.2_diarization.diarize --audio Session_04.m4a --audio-mode table_single_mic --transcription .output/Session_04/1_transcription/raw_segments.jsonl --output .output/Session_04/2_diarization/
```

### Azure ML Deployment

```bash
# Submit full Azure ML pipeline (Steps 0–4) and download outputs for local Step 5
python scripts/audio/orchestrator.py sessions/05 \
  --config scripts/audio/pipeline.config.toml

# Fire-and-forget submission
python scripts/audio/orchestrator.py sessions/05 \
  --config scripts/audio/pipeline.config.toml \
  --no-wait

# Download outputs but skip local post-processing
python scripts/audio/orchestrator.py sessions/05 \
  --config scripts/audio/pipeline.config.toml \
  --skip-postprocess
```

### CLI Arguments

```
orchestrator.py arguments:

Required:
  session_dir               Path to session directory (contains audio/ or audio.<ext>)

Optional:
  --config CONFIG            Path to pipeline.config.toml
  --no-wait                  Submit pipeline and exit without monitoring
  --skip-postprocess         Skip local Step 5 post-processing
```

### Example Workflows

**Standard workflow**:
```bash
# Mode B: session_dir/audio.<ext>
python scripts/audio/orchestrator.py sessions/05 --config scripts/audio/pipeline.config.toml

# Mode A: session_dir/audio/ contains per-speaker files
python scripts/audio/orchestrator.py sessions/06 --config scripts/audio/pipeline.config.toml

# Outputs:
# - sessions/05/outputs/...
# - sessions/05/final/...
```

**Incremental workflow** (re-run step after fixing bug):
```bash
# Re-run transcription locally using existing preprocess outputs
python -m scripts.audio.pipeline.transcription.transcribe \
  --audio .output/Session_05/preprocess \
  --output .output/Session_05/transcription \
  --config scripts/audio/pipeline.config.toml \
  --audio-mode table_single_mic \
  --device cpu
```

**Batch processing**:
```bash
# Process multiple sessions
for session in sessions/*; do
  python scripts/audio/orchestrator.py "$session" --config scripts/audio/pipeline.config.toml
done

# Check all jobs in Azure ML Studio
```

---

## 10. Design Decisions

### 1. Why Separate Jobs Instead of Single Job?

**Decision**: Use separate Azure ML jobs per step

**Rationale**:
- **Memory isolation**: Each step starts with fresh Python environment (prevents CUDA memory leaks)
- **Debugging**: Can re-run individual steps without repeating entire pipeline
- **Parallelization**: Emotion + embeddings can run concurrently
- **Cost**: Overhead minimal (~2 min per job startup vs. hours of compute)

**Trade-off**: Slightly more complex orchestration, but worth it for robustness

### 2. Why Preprocess/Normalize Audio?

**Decision**: Add a preprocessing step with resampling + loudness normalization

**Rationale**:
- **Model compatibility**: Whisper, WavLM, and SpeechBrain ECAPA are trained on **16 kHz** audio
- **Stability**: Loudness normalization reduces variance across sessions (single mic vs multitrack)
- **Standards-based**: EBU R128 is a widely accepted loudness normalization standard

**Trade-off**: Small added runtime, but improves consistency across models

### 3. Why Chunking at 3 Hours Instead of 4 Hours?

**Decision**: Split audio at 3 hours with 120-second overlap

**Rationale**:
- **Safety margin**: WhisperX can occasionally exceed memory limits near 4 hours
- **Overlap**: Prevents losing context at chunk boundaries
- **VAD-based splitting**: Split on silence (not arbitrary timestamps)

**Trade-off**: Slight inefficiency from overlap, but ensures no lost words

### 4. Why File-Based State Instead of Database?

**Decision**: Use JSONL files and JSON for intermediate state

**Rationale**:
- **Simplicity**: No database setup/maintenance
- **Portability**: Works on local and Azure ML without changes
- **Debugging**: Can inspect intermediate outputs with text editor
- **Version control**: Can commit intermediate outputs for regression testing

**Trade-off**: Slightly slower than in-memory, but negligible for 3-hour sessions

### 5. Why Speaker Embeddings Instead of Just Diarization?

**Decision**: Extract and persist speaker embeddings

**Rationale**:
- **Cross-session consistency**: Map arbitrary `SPEAKER_00` labels to canonical names
- **New speaker detection**: Automatically identify guests
- **Quality metrics**: Embedding similarity indicates confidence

**Trade-off**: Extra compute step, but enables high-value feature

### 6. Why Emotion Analysis?

**Decision**: Include emotion classification step

**Rationale**:
- **Narrative context**: Detect tension, excitement, humor in session
- **Highlight generation**: Find emotional peaks for session summaries
- **Character analysis**: Track emotional arcs of PCs/NPCs

**Trade-off**: ~30% additional compute time, but enriches downstream analysis

### 7. Why Keep `transcribe_audio.py` Instead of Replacing?

**Decision**: Create new pipeline alongside existing script

**Rationale**:
- **Backward compatibility**: Existing workflows don't break
- **Migration path**: Can test new pipeline on subset of sessions
- **Fallback**: If pipeline has issues, can fall back to proven script

**Trade-off**: Code duplication, but mitigated by extracting shared utilities to `common/`

### 8. Why TOML for Config Instead of YAML/JSON?

**Decision**: Use TOML for `pipeline.config.toml`

**Rationale**:
- **Readability**: Better comments and typing than JSON
- **Python native**: `tomllib` in Python 3.11+ (stdlib)
- **Type safety**: Explicit types vs. YAML's implicit parsing

**Trade-off**: None (TOML clearly superior for config)

### 9. Why Not Use Existing WhisperX Diarization?

**Decision**: Separate diarization step instead of WhisperX built-in

**Rationale**:
- **Modularity**: Can swap diarization model independently
- **Speaker embeddings**: WhisperX doesn't extract/persist embeddings
- **Control**: More control over speaker assignment logic

**Trade-off**: Extra step, but necessary for cross-session matching

---

## 11. Migration Path

### Phase 1: Extract Shared Utilities (Week 1)

**Goal**: Reduce duplication between old and new code

**Tasks**:
1. Create `pipeline/common/` directory
2. Extract functions from `transcribe_audio.py`:
   - Audio loading → `common/audio_utils.py`
   - JSONL I/O → `common/file_utils.py`
   - Logging setup → `common/logging_utils.py`
3. Update `transcribe_audio.py` to import from `common/`
4. Verify existing script still works

**Validation**: Run `transcribe_audio.py` on test audio, compare output to baseline

### Phase 2: Build Step 0 (Preprocess) (Week 2)

**Goal**: Implement audio normalization

**Tasks**:
1. Create `pipeline/0_preprocess/`
2. Implement resample + loudnorm pipeline (EBU R128)
3. Add optional high-pass filter
4. Create Azure ML job definition
5. Test on one multitrack and one single-mic session

**Validation**:
- Confirm 16 kHz mono output
- Loudness within target range

### Phase 3: Build Step 1 (Transcription) (Week 2)

**Goal**: Implement first pipeline step

**Tasks**:
1. Create `pipeline/1_transcription/`
2. Port transcription logic from `transcribe_audio.py`
3. Add chunking support for >3 hour audio
4. Create Azure ML job definition (`1_transcription/job.py`)
5. Test locally and on Azure ML

**Validation**:
- Compare output to `transcribe_audio.py` on same audio
- Test chunking on 5-hour recording
- Verify Azure ML job completes

### Phase 4: Build Step 2 (Diarization) (Week 2)

**Goal**: Implement diarization step

**Tasks**:
1. Create `pipeline/2_diarization/`
2. Port diarization logic from `transcribe_audio.py`
3. Add cross-chunk linking (overlap-anchored + clustering)
4. Mode A: speaker assignment from track identity
5. Create Azure ML job definition
6. Test on Step 1 output

**Validation**:
- Compare speaker labels to existing output
- Test min/max speaker constraints

### Phase 5: Build Step 3 (Emotion) (Week 3)

**Goal**: Add emotion analysis (new feature)

**Tasks**:
1. Implement `tiantiaf/wavlm-large-msp-podcast-emotion-dim` (A/V/D outputs)
2. Create `pipeline/3_emotion/`
3. Implement batch processing for efficiency
4. Create Azure ML job definition
5. Test on various session types (combat vs. roleplay)

**Validation**:
- Manual review of emotion labels on sample segments
- Check confidence scores distribution

### Phase 6: Build Step 4 (Speaker Embeddings) (Week 3-4)

**Goal**: Implement cross-session speaker matching

**Tasks**:
1. Create speaker DB schema (`global_voice_id`, clean/room centroids)
2. Implement SpeechBrain ECAPA embedding extraction with quality filters
3. Implement one-to-one matching + candidate lists
4. Mode A enrollment + Mode B DB delta output
5. Test on multitrack + single-mic sessions

**Validation**:
- Verify JEFF/NICOLE/KRISTINE/DAN consistently matched across sessions
- Check false positive rate on guest speakers

### Phase 7: Build Step 5 (Post-Processing) (Week 4)

**Goal**: Merge all metadata and validate

**Tasks**:
1. Create merge logic (`5_postprocess/merge.py`)
2. Implement validation checks (`5_postprocess/validate.py`)
3. Generate validation reports
4. Write final enhanced JSONL

**Validation**:
- Schema validation on output
- Check no segments lost in merging
- Verify metadata completeness

### Phase 8: Build Orchestrator (Week 5)

**Goal**: Tie all steps together

**Tasks**:
1. Extend `scripts/audio/orchestrator.py` (Azure ML pipeline runner)
2. Add config parsing (`pipeline/config.py`)
3. Create Azure ML pipeline definition
4. Add CLI argument parsing
5. Write comprehensive tests

**Validation**:
- End-to-end test on single session
- Test error handling (step failure, interruption)
- Test incremental re-runs

### Phase 9: Documentation & Migration (Week 6)

**Goal**: Prepare for production use

**Tasks**:
1. Write `README-PIPELINE.md`
2. Document each step in step-specific READMEs
3. Create migration guide for existing sessions
4. Add troubleshooting guide
5. Batch-process all existing sessions

**Validation**:
- Fresh user can run pipeline following docs
- All 4 existing sessions processed successfully

---

## 12. Decisions Locked In

### Mode + Identity
1. **Mode selection**: `auto` detects multitrack vs single-mic; fallback to Mode B
2. **Mode A (multitrack)**: filename-derived `canonical_name`, skip diarization
3. **Mode B (single mic)**: diarization + cross-chunk linking, one-to-one matching
4. **Unknown speakers**: session-local `SPEAKER_01` labels; no forced names

### Models
5. **ASR**: Whisper (configurable)
6. **Diarization**: `pyannote/speaker-diarization-3.1`
7. **Emotion**: `tiantiaf/wavlm-large-msp-podcast-emotion-dim` (A/V/D)
8. **Embeddings**: `speechbrain/spkrec-ecapa-voxceleb`

### Matching + DB
9. **Matching strategy**: Hungarian + thresholds; `global_voice_id` only on high confidence
10. **DB policy**: Mode A auto-commit; Mode B writes delta for review
11. **DB storage**: git as source of truth, blob for job outputs

### Chunking + Stitching
12. **Chunk size**: 3 hours with 120s overlap
13. **Stitching**: owned-interval rule to avoid duplicates

### Testing
14. **Evaluation**: 10-minute labeled sample for diarization + ID accuracy + emotion spot-check

### Remaining Open Questions
- None. (Revisit thresholds after first few sessions.)

---

## Next Steps

### Immediate Actions (User)

1. **Confirm input conventions**
   - Folder layout for multitrack sessions
   - Session naming scheme (`session_id`)
2. **Run first enrollment session (Mode A)**
   - Seed clean-close-mic embeddings
3. **Run a 10-minute evaluation sample**
   - Validate diarization + ID accuracy on single-mic
   - Adjust thresholds if needed

### Implementation Sequence (Developer)

1. **Week 1**: Extract common utilities, add mode detection + naming normalization
2. **Week 2**: Implement Step 0 (preprocess normalization) + Step 1 (transcription + chunking + owned-interval stitching)
3. **Week 3**: Implement Step 2 (diarization + cross-chunk linking)
4. **Week 4**: Implement Step 3 (emotion on speaker turns)
5. **Week 5**: Implement Step 4 (embeddings + matching + DB delta)
6. **Week 6**: Implement Step 5 (merge + validation) + orchestrator + tests

---

## 13. Implementation Steps (LLM-Oriented)

This section is a **step-by-step build guide** for an LLM or automated engineer. It assumes no manual steps during a run.

### A. Core Scaffolding

1. **Config + dataclasses**
   - Implement `pipeline/config.py` with typed config sections:
     - `[pipeline]`, `[transcription]`, `[diarization]`, `[emotion]`, `[speaker_embedding]`, `[speaker_matching]`, `[naming]`, `[logging]`
   - Ensure config supports **audio-mode** and **session_id**.
2. **Mode detection + input resolver**
   - If `--audio` is a directory or multi-file list → Mode A
   - If `--audio` is a single file → Mode B
   - Normalize track names via naming rules and emit `canonical_name`
3. **Shared utilities**
   - Audio IO: mono/16kHz conversion, VAD, chunking
   - JSONL helpers: read/write, schema validation
   - Logging: structured step logs

### B. Step Implementations

4. **Step 0: Preprocess / Normalize**
   - Mode A: normalize each track to 16 kHz mono (store as FLAC)
   - Mode B: normalize mixed audio to 16 kHz mono (store as FLAC)
   - Apply EBU R128 loudness normalization (two-pass)
   - Store outputs in `0_preprocess/` as FLAC (lossless)
   - Decode to PCM for downstream model inference
5. **Step 1: Transcription**
   - Mode A: transcribe each track separately
   - Mode B: chunk with 3h + 120s overlap, VAD split
   - Write `raw_segments.jsonl` with global timestamps and `chunk_id`
   - Apply owned-interval stitching to de-duplicate overlaps
6. **Step 2: Diarization + Cross-Chunk Linking (Mode B only)**
   - Run pyannote diarization per chunk
   - Extract ECAPA embeddings per chunk speaker
   - Cross-chunk linking:
     - Anchor adjacent chunks via overlap windows
     - Average-linkage clustering with threshold 0.78
   - Emit session-stable `speaker_id` and `chunk_label`
7. **Step 3: Emotion (audio-only)**
   - Run `tiantiaf/wavlm-large-msp-podcast-emotion-dim` on speaker turns
   - Store `arousal`, `valence`, `dominance`, plus optional derived label
   - If confidence is enabled, write `emotion.confidence`
8. **Step 4: Embeddings + Matching**
   - Extract embeddings using SpeechBrain ECAPA
   - Quality filtering: `min_turn_duration_seconds = 1.5`, top-K by `(energy × SNR)`
   - Match with Hungarian assignment
   - Assign `global_voice_id` only when threshold gates pass
   - Mode A: auto-update `clean_close_mic` centroid
   - Mode B: write `speaker_db_delta.json` only
9. **Step 5: Post-process**
   - Merge via global time (not `segment_id`)
   - Preserve overlap flags + candidates
   - Emit `final.jsonl` using the contract in Section 8
   - Generate `validation_report.json`

### C. Orchestration + Data Contracts

9. **Orchestrator**
   - Accept `--audio`, `--audio-mode`, `--config`
   - Pass speaker DB into jobs; collect DB delta on output
   - Ensure step outputs are deterministic (idempotent)
10. **DB handling**
   - Source of truth = git
   - Job output = blob (DB + delta)
   - After run: pull DB outputs and commit manually
11. **Contracts and invariants**
   - `speaker_id` is session-local
   - `canonical_name` is normalized or null
   - `global_voice_id` is set only on high-confidence matches

### D. Testing Checklist

12. **Unit tests**
   - Name normalization
   - Owned-interval stitching
   - One-to-one assignment correctness
13. **Integration tests**
   - 10-minute Mode A session (validate known names)
   - 10-minute Mode B session (validate speaker count + overlap handling)
14. **Regression**
   - Ensure `final.jsonl` schema stable; export legacy format on demand

---

## Appendices

### A. Comparison: Monolithic vs. Pipeline

| Aspect | `transcribe_audio.py` (Current) | Pipeline (Proposed) |
|--------|--------------------------------|---------------------|
| Lines of code | ~728 | ~200 per step × 5 = 1000 |
| Modularity | Low | High |
| Testability | Hard | Easy (per-step) |
| Debugging | Hard | Easy (step isolation) |
| Features | Transcription + diarization | + Emotion + embeddings |
| Memory safety | Risky (single process) | Safe (separate jobs) |
| Restart capability | None | Per-step |
| Parallel execution | No | Yes (steps 3-4) |
| Output format | Simple JSONL | Enhanced JSONL |

### B. Estimated Costs (Azure ML)

**Assumptions**:
- 3-hour session
- Standard_NC4as_T4_v3 @ $0.526/hour
- Step runtimes:
  - Transcription: 4.5 hours (1.5x real-time)
  - Diarization: 2.4 hours (0.8x real-time)
  - Emotion: 1.5 hours (0.5x real-time)
  - Embeddings: 0.9 hours (0.3x real-time)
  - Post-process: Local (free)
- Startup overhead: 2 min per job × 4 jobs = 8 min

**Total compute time**: 4.5 + 2.4 + 1.5 + 0.9 + 0.13 = **9.43 hours**

**Cost per session**: 9.43 × $0.526 = **$4.96**

**Optimization** (run diarization + embeddings on CPU):
- Diarization: CPU (free, on local machine)
- Embeddings: CPU (free, on local machine)
- New compute time: 4.5 + 1.5 = 6 hours
- **Optimized cost**: 6 × $0.526 = **$3.16**

### C. Example Output Comparison

**Current format** (`transcripts.jsonl`):
```jsonl
{"speaker": "JEFF", "text": "I cast fireball.", "start": 145.6, "end": 148.3}
```

**Enhanced format** (pipeline):
```jsonl
{"segment_id": 123, "session_id": "2026-01-25-table", "source": {"mode": "table_single_mic", "track": null, "chunk_id": 0}, "start_s": 145.6, "end_s": 148.3, "speaker_id": "SPEAKER_02", "canonical_name": null, "global_voice_id": null, "match_status": "unknown", "candidates": [{"name": "joe", "score": 0.71, "source": "clean_close_mic"}], "overlap": false, "overlap_speakers": [], "text": "I cast fireball.", "words": [{"word": "I", "start": 145.6, "end": 145.7}, {"word": "cast", "start": 145.8, "end": 146.1}, {"word": "fireball", "start": 146.2, "end": 148.3}], "emotion": {"arousal": 0.61, "valence": 0.42, "dominance": 0.55, "confidence": 0.63, "derived_label": "tense"}, "metadata": {"pipeline_version": "1.0.0", "models": {"transcription": "large-v3", "diarization": "pyannote/speaker-diarization-3.1", "emotion": "tiantiaf/wavlm-large-msp-podcast-emotion-dim", "embedding": "speechbrain/spkrec-ecapa-voxceleb"}}}
```

**Value added**:
- Word-level timestamps (for precise alignment)
- Emotion dimensions (arousal/valence/dominance)
- Speaker identity candidates + match status
- Cross-session voice IDs when high-confidence
- Metadata for reproducibility

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-25  
**Status**: Draft - Awaiting User Approval
