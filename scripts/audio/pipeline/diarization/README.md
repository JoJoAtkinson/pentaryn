# Step 2: Speaker Diarization

This step identifies speakers and assigns session-stable speaker IDs to transcription segments.

## Overview

**Mode A (Multitrack)**: Track-based adapter builds diarization output without ML
**Mode B (Single Mic)**: ML-based diarization with pyannote.audio + cross-chunk speaker linking

## Mode A: Track-Based Adapter

For multitrack Discord recordings with per-speaker audio files:

1. Reads transcription segments from Step 1
2. Extracts speaker identity from track filename
3. Normalizes to canonical name format (lowercase, dash-separated)
4. Assigns speaker ID: `TRACK_<canonical_name>`
5. Detects overlapping speech between tracks
6. Writes `diarization.jsonl` without running ML models

**No ML models required** - simple file processing.

## Mode B: ML Diarization + Cross-Chunk Linking

For single-mic table recordings:

1. **Load Models**:
   - pyannote.audio 3.1 for speaker diarization
   - SpeechBrain ECAPA for speaker embeddings (cross-chunk linking)
   - Requires `HF_AUTH_TOKEN` for model access

2. **Run Diarization**:
   - Processes normalized audio from Step 0
   - Identifies speaker turns with temporal boundaries
   - Assigns chunk-local speaker labels (`SPEAKER_00`, `SPEAKER_01`, etc.)

3. **Cross-Chunk Linking** (if audio was chunked):
   - Extracts speaker embeddings from overlap windows
   - Computes cosine similarity between chunk speakers
   - Performs hierarchical clustering (average linkage)
   - Assigns session-stable speaker IDs (`SPEAKER_01`, `SPEAKER_02`, etc.)

4. **Align to Transcription**:
   - Matches diarization turns to transcription segments
   - Assigns primary speaker based on maximum overlap duration
   - Flags overlapping speakers

## Output Schema

**diarization.jsonl**:
```jsonl
{"segment_id": 0, "speaker_id": "SPEAKER_02", "chunk_label": "SPEAKER_00", "chunk_id": 1, "start": 0.0, "end": 1.5, "overlap": false, "overlap_speakers": []}
{"segment_id": 1, "speaker_id": "SPEAKER_01", "chunk_label": "SPEAKER_03", "chunk_id": 1, "start": 1.6, "end": 3.2, "overlap": true, "overlap_speakers": ["SPEAKER_02"]}
```

**Fields**:
- `segment_id`: Index matching Step 1 transcription
- `speaker_id`: Session-stable speaker ID
- `chunk_label`: Original chunk-local label (Mode B only)
- `chunk_id`: Chunk index (Mode B with chunking)
- `start`, `end`: Global timestamps (seconds)
- `overlap`: True if multiple speakers detected
- `overlap_speakers`: List of overlapping speaker IDs

**speaker_stats.json**:
```json
{
  "SPEAKER_01": {"segments": 345, "duration": 1234.5},
  "SPEAKER_02": {"segments": 298, "duration": 987.2}
}
```

## Configuration

From `pipeline.config.toml`:

```toml
[diarization]
model = "pyannote/speaker-diarization-3.1"
min_speakers = 2
max_speakers = 6
overlap_threshold = 0.5  # Seconds
device = "cpu"  # "cpu" safer for long recordings, "cuda" faster
cross_chunk_linkage = "average"  # average | maximum | minimum
cross_chunk_threshold = 0.78  # Cosine similarity threshold
overlap_window_seconds = 120.0  # Window for cross-chunk embedding extraction
```

## Usage

### Local Execution

**Mode A**:
```bash
python -m pipeline.diarization.diarize \
  --transcription .output/Session_04/transcription \
  --output .output/Session_04/diarization \
  --config pipeline.config.toml \
  --audio-mode discord_multitrack
```

**Mode B**:
```bash
python -m pipeline.diarization.diarize \
  --transcription .output/Session_04/transcription \
  --audio .output/Session_04/preprocess/normalized.flac \
  --output .output/Session_04/diarization \
  --config pipeline.config.toml \
  --audio-mode table_single_mic \
  --device cpu
```

### Azure ML Execution

```python
from pipeline.diarization.job import create_diarization_job
from pipeline.config import PipelineConfig

config = PipelineConfig.from_file("pipeline.config.toml")

job = create_diarization_job(
    config=config,
    transcription_output_uri="azureml://...",
    preprocess_output_uri="azureml://...",
    session_id="Session_04",
    audio_mode="table_single_mic",
    device="cpu",  # CPU safer for long recordings
)

ml_client.jobs.create_or_update(job)
```

## HuggingFace Model Access

Mode B requires accepting pyannote model terms:

1. Create HuggingFace account: https://huggingface.co/join
2. Accept model terms:
   - https://huggingface.co/pyannote/speaker-diarization-3.1 (click "Agree and access")
   - https://huggingface.co/pyannote/segmentation-3.0 (click "Agree and access")
3. Create access token: https://huggingface.co/settings/tokens
4. Set token in `.env`:
   ```bash
   HF_AUTH_TOKEN=hf_your_token_here
   ```

## Cross-Chunk Linking Algorithm

For recordings chunked during transcription (>3 hours):

1. **Embedding Extraction**:
   - Focus on overlap windows (first/last 120 seconds of each chunk)
   - Extract ECAPA embeddings for each chunk-local speaker
   - Use up to 3 speaker turns per chunk speaker
   - Average embeddings to create centroids

2. **Similarity Computation**:
   - Compute cosine similarity between all chunk speaker centroids
   - Convert to distance matrix: `distance = 1 - similarity`

3. **Hierarchical Clustering**:
   - Method: Average linkage (configurable)
   - Threshold: `1 - cross_chunk_threshold` (default: 0.22 distance)
   - Cut dendrogram to assign session speaker IDs

4. **Mapping Application**:
   - Map chunk-local labels to session-stable IDs
   - Preserve chunk metadata for debugging

## CPU vs GPU

**CPU (Recommended for Mode B)**:
- Safer for long recordings (avoids OOM errors)
- Diarization: ~0.8x real-time
- Cross-chunk linking: Fast (mostly CPU-bound)

**GPU (Faster but risky)**:
- 2-3x faster diarization
- Requires sufficient VRAM (16GB+ for long recordings)
- May OOM on sessions >3 hours

## Troubleshooting

**"HF_AUTH_TOKEN required"**: Set token in `.env` or environment

**"Failed to load diarization model"**: Accept model terms on HuggingFace (see links above)

**OOM errors on GPU**: Use `--device cpu` for long recordings

**Poor cross-chunk linking**: Adjust `cross_chunk_threshold` (lower = more conservative linking)

**Wrong speaker count**: Adjust `min_speakers` and `max_speakers` in config

## Performance

- **Mode A**: <1 second (file processing only)
- **Mode B Single File**: ~0.8x real-time (3-hour recording = ~2.5 hours)
- **Mode B Chunked**: ~0.8x per chunk + 2-5 minutes linking overhead
