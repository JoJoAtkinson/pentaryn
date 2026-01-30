# Speaker Embedding Database

This database stores speaker voice embeddings for cross-session identity matching.

## Schema

```json
{
  "GV_0001": {
    "global_voice_id": "GV_0001",
    "canonical_name": "joe",
    "source_quality": "clean_close_mic",
    "centroid": [0.123, -0.456, ...],
    "enrollment_sessions": ["Session_01", "Session_03"],
    "last_updated": "2026-01-25T16:00:00Z",
    "total_duration_seconds": 1234.5,
    "embedding_count": 45,
    "metadata": {
      "first_seen": "Session_01",
      "notes": "GM voice"
    }
  }
}
```

## Fields

- **global_voice_id**: Unique identifier (GV_0001, GV_0002, ...)
- **canonical_name**: Normalized name from track filename
- **source_quality**: "clean_close_mic" or "room_mix"
- **centroid**: Mean embedding vector (192-dim for ECAPA)
- **enrollment_sessions**: List of sessions contributing to this voice
- **last_updated**: ISO timestamp of last update
- **total_duration_seconds**: Total audio duration used for embeddings
- **embedding_count**: Number of embeddings averaged into centroid
- **metadata**: Additional notes and context

## Usage

### Mode A (Multitrack - Auto Update)

When processing Discord multitrack audio:
1. Extract canonical name from track filename
2. Compute embeddings from clean close-mic audio
3. If name exists in DB: update centroid
4. If name is new: create new entry with new GV_ID

### Mode B (Single Mic - Manual Review)

When processing table single-mic audio:
1. Extract embeddings from room-mix diarization
2. Match against DB centroids using cosine similarity
3. Generate `speaker_db_delta.json` with proposed updates
4. **Manual review required** before committing updates

## Delta File Format

After Step 4, check `4_speaker_embedding/speaker_db_delta.json`:

```json
{
  "updates": [
    {
      "global_voice_id": "GV_0001",
      "canonical_name": "joe",
      "action": "update_centroid",
      "new_centroid": [...],
      "similarity_score": 0.89,
      "source_session": "Session_04"
    }
  ],
  "new_entries": [
    {
      "suggested_gv_id": "GV_0008",
      "session_speaker_id": "SPEAKER_03",
      "candidates": [
        {"canonical_name": "dan", "score": 0.72},
        {"canonical_name": "jeff", "score": 0.68}
      ],
      "action_required": "manual_assignment"
    }
  ]
}
```

## Initialization

Create empty database:

```bash
echo '{}' > scripts/audio/speaker_db/embeddings.json
```

## Backup

Always backup before manual edits:

```bash
cp speaker_db/embeddings.json speaker_db/embeddings.json.backup
```
