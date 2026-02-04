# Step 4: Speaker Embeddings & Matching

This step extracts speaker embeddings and matches them against a persistent speaker database for cross-session identity tracking.

## Overview

**Mode A (Multitrack)**: Extract clean-close-mic embeddings → Auto-update database (trusted identity)  
**Mode B (Single Mic)**: Extract room-mix embeddings → Match against database → Generate delta for manual review

## Mode A: Clean-Close-Mic Embeddings (Auto-Update)

For multitrack Discord recordings with known speaker identity from track filenames:

1. **Extract Embeddings**:
   - Read normalized track audio from Step 0
   - Select top-K longest segments per speaker (default: 20)
   - Extract ECAPA embeddings from each segment
   - Aggregate via mean/median to create speaker centroid

2. **Auto-Update Database**:
   - Canonical name derived from track filename
   - Find or create global voice ID (`GV_0001`, `GV_0002`, etc.)
   - Update centroid if similarity ≥ threshold (default: 0.88)
   - Add per-session embedding record
   - **No manual review required** (trusted identity)

3. **Quality Filters**:
   - Minimum turn duration: 1.5 seconds
   - Minimum total duration: 60 seconds
   - Skip segments with overlap

## Mode B: Room-Mix Embeddings (Manual Review)

For single-mic table recordings with uncertain speaker identity:

1. **Extract Embeddings**:
   - Read normalized mixed audio from Step 0
   - Use speaker turns from Step 2 diarization
   - Extract ECAPA embeddings from non-overlapping segments
   - Aggregate to create session speaker centroids

2. **Hungarian Matching**:
   - Compute cosine similarity matrix (session speakers × database voices)
   - Apply Hungarian algorithm for optimal one-to-one assignment
   - Assign match status based on similarity:
     - **confirmed**: similarity ≥ 0.85
     - **probable**: 0.80 ≤ similarity < 0.85
     - **unknown**: similarity < 0.80

3. **Generate Delta File**:
   - Propose database updates for review
   - Actions: `UPDATE_CENTROID`, `ADD_SESSION_ONLY`, `REVIEW_REQUIRED`
   - **Manual review required** before applying updates
   - Delta file: `speaker_db_delta.json`

## Output Schema

**embeddings.jsonl**:
```jsonl
{"session_id": "Session_04", "speaker_id": "SPEAKER_02", "canonical_name": null, "embedding": [0.123, -0.456, ...], "source": "room_mix", "duration_seconds": 1234.5, "segment_count": 345}
{"session_id": "Session_04", "speaker_id": "TRACK_joe", "canonical_name": "joe", "embedding": [0.789, 0.012, ...], "source": "clean_close_mic", "duration_seconds": 987.2, "segment_count": 298}
```

**Fields**:
- `session_id`: Session identifier
- `speaker_id`: Session-local speaker ID (from Step 2)
- `canonical_name`: Normalized name (Mode A only)
- `embedding`: 192-dim ECAPA embedding vector
- `source`: `clean_close_mic` or `room_mix`
- `duration_seconds`: Total audio duration used
- `segment_count`: Number of segments aggregated

**matches.json**:
```json
{
  "SPEAKER_02": {
    "global_voice_id": "GV_0007",
    "canonical_name": "joe",
    "match_status": "confirmed",
    "candidates": [
      {"name": "joe", "global_voice_id": "GV_0007", "score": 0.91, "source": "clean_close_mic"},
      {"name": "eric", "global_voice_id": "GV_0003", "score": 0.74, "source": "room_mix"}
    ]
  }
}
```

**Match Status**:
- `confirmed`: High confidence match (similarity ≥ 0.85)
- `probable`: Likely match (0.80 ≤ similarity < 0.85)
- `unknown`: No confident match (similarity < 0.80)

**speaker_db_delta.json** (Mode B only):
```json
[
  {
    "session_speaker_id": "SPEAKER_02",
    "proposed_global_voice_id": "GV_0007",
    "proposed_canonical_name": "joe",
    "match_status": "confirmed",
    "similarity_score": 0.91,
    "action": "UPDATE_CENTROID",
    "session_id": "Session_04",
    "embedding": [...],
    "source": "room_mix",
    "duration_seconds": 1234.5,
    "candidates": [...]
  }
]
```

## Speaker Database Schema

Located at `speaker_db/embeddings.json`:

```json
{
  "GV_0007": {
    "canonical_name": "joe",
    "embeddings": {
      "clean_close_mic": {
        "centroid": [0.1, -0.2, ...],
        "num_embeddings": 120
      },
      "room_mix": {
        "centroid": [0.2, -0.1, ...],
        "num_embeddings": 40
      }
    },
    "per_session": [
      {
        "session_id": "Session_04",
        "source": "room_mix",
        "embedding": [0.12, ...],
        "duration_seconds": 940.2
      }
    ],
    "sessions": ["Session_01", "Session_02", "Session_04"],
    "last_updated": "2026-01-25T10:30:00Z"
  }
}
```

## Configuration

From `pipeline.config.toml`:

```toml
[speaker_embedding]
model = "speechbrain/spkrec-ecapa-voxceleb"
min_turn_duration_seconds = 1.5
top_k_segments = 20
max_embeddings_per_speaker = 50
aggregation = "mean"  # mean | median
database_path = "speaker_db/embeddings.json"
delta_output_path = "4_speaker_embedding/speaker_db_delta.json"

[speaker_matching]
assignment = "hungarian"
similarity_threshold = 0.85  # Assign global_voice_id if >= 0.85
centroid_update_threshold = 0.88  # Update centroid if >= 0.88
stability_percentile = 0.10
stability_threshold = 0.80
min_clean_duration_seconds = 60.0  # Minimum for clean embeddings
```

## Usage

### Local Execution

**Mode A**:
```bash
python -m pipeline.speaker_embedding \
  --preprocess .output/Session_04/preprocess \
  --diarization .output/Session_04/diarization \
  --output .output/Session_04/speaker_embedding \
  --config pipeline.config.toml \
  --audio-mode discord_multitrack \
  --device cpu
```

**Mode B**:
```bash
python -m pipeline.speaker_embedding \
  --preprocess .output/Session_04/preprocess \
  --diarization .output/Session_04/diarization \
  --output .output/Session_04/speaker_embedding \
  --config pipeline.config.toml \
  --audio-mode table_single_mic \
  --device cpu
```

### Azure ML Execution

```python
from pipeline.speaker_embedding.job import create_speaker_embedding_job
from pipeline.config import PipelineConfig

config = PipelineConfig.from_file("pipeline.config.toml")

job = create_speaker_embedding_job(
    config=config,
    preprocess_output_uri="azureml://...",
    diarization_output_uri="azureml://...",
    session_id="Session_04",
    audio_mode="table_single_mic",
    device="cpu",
)

ml_client.jobs.create_or_update(job)
```

## Hungarian Algorithm

For Mode B matching:

1. **Build Similarity Matrix**:
   - Rows: Session speakers (from Step 2)
   - Columns: Database voices
   - Cells: Cosine similarity between embeddings

2. **Convert to Cost Matrix**:
   - Cost = -similarity (minimize cost = maximize similarity)

3. **Optimal Assignment**:
   - Hungarian algorithm finds one-to-one mapping
   - Each session speaker assigned to at most one database voice
   - Maximizes total similarity

4. **Apply Thresholds**:
   - Reject assignment if similarity < threshold
   - Mark as `unknown` instead of forcing bad match

## Database Update Workflow

### Mode A (Auto-Update):
1. Run Step 4
2. Database automatically updated
3. Review `database_update_log.txt` for changes
4. No manual steps required

### Mode B (Manual Review):
1. Run Step 4
2. Review `speaker_db_delta.json`
3. Verify proposed matches (listen to audio if needed)
4. Manually apply updates to `speaker_db/embeddings.json`
5. Or reject/modify proposals

**Why manual review?**  
Room-mix embeddings are less reliable than clean-close-mic. Human verification prevents misidentification.

## Embedding Model

**SpeechBrain ECAPA-TDNN**:
- Model: `speechbrain/spkrec-ecapa-voxceleb`
- Architecture: Emphasized Channel Attention, Propagation and Aggregation
- Output: 192-dimensional embedding vector
- Training: VoxCeleb (6k+ speakers)
- Performance: State-of-the-art speaker verification

## Similarity Metrics

**Cosine Similarity**:
- Range: -1.0 to 1.0 (higher = more similar)
- Typical same-speaker: 0.85-0.95
- Typical different-speaker: 0.3-0.7
- Threshold: 0.85 for confident match

## Troubleshooting

**"No embeddings extracted"**: Check min_turn_duration and segment quality

**"Low similarity scores"**: Different acoustic conditions (Mode B room-mix vs Mode A clean)

**"Too many unknown matches"**: Lower similarity_threshold or improve audio quality

**"Database growing too large"**: Review per_session records, remove old sessions

**"Centroid drift"**: Implement stability monitoring, reject outlier embeddings

## Performance

- **Embedding extraction**: ~0.01s per segment (CPU)
- **Hungarian matching**: <1 second for 10 speakers × 100 database voices
- **Mode A (5 speakers, 20 segments each)**: ~2-3 seconds
- **Mode B (5 speakers, 20 segments each)**: ~2-3 seconds + matching overhead

## Best Practices

1. **Clean embeddings (Mode A)**: Always use for initial database population
2. **Regular database cleanup**: Archive old sessions to keep database manageable
3. **Manual verification**: Review Mode B deltas before applying
4. **Consistent naming**: Use canonical names consistently across sessions
5. **Quality thresholds**: Don't lower thresholds below 0.80 (high false positive risk)
