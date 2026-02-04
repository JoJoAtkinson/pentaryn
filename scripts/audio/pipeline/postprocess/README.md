# Step 5: Post-Processing

Merges outputs from Steps 1-4 into a unified transcript and validates quality.

## Overview

Post-processing combines all pipeline outputs using **owned-interval stitching** to create a final transcript with:
- Word-level transcription with timestamps
- Speaker identification
- Global voice IDs (persistent speaker identities)
- Dimensional emotion scores (A/V/D)

This step runs **locally** (not on Azure ML) since it's lightweight and operates on already-downloaded outputs.

## Input

**From Step 1 (Transcription):**
- `transcription/transcription.jsonl` - Words with timestamps and alignment confidence

**From Step 2 (Diarization):**
- `diarization/diarization.jsonl` - Speaker turns with intervals

**From Step 3 (Emotion):**
- `emotion/emotion.jsonl` - A/V/D scores per speaker turn (optional)

**From Step 4 (Speaker Embedding):**
- `speaker_embedding/matches.json` - Speaker ID mappings (optional)

## Output

**merged.jsonl** - Unified transcript with all annotations:
```json
{
  "start": 0.0,
  "end": 0.5,
  "word": "Hello",
  "score": 0.98,
  "speaker": "SPEAKER_00",
  "speaker_id": "GV_0001",
  "arousal": 0.65,
  "valence": 0.73,
  "dominance": 0.58
}
```

**merge_stats.json** - Statistics about the merge:
```json
{
  "total_words": 5234,
  "total_duration_seconds": 3600.5,
  "unique_speakers": 4,
  "words_per_speaker": {
    "SPEAKER_00": 1500,
    "SPEAKER_01": 1200,
    "SPEAKER_02": 1400,
    "SPEAKER_03": 1134
  },
  "words_with_speaker_id": 5234,
  "words_with_emotion": 5100,
  "coverage": {
    "speaker_id": 1.0,
    "emotion": 0.97
  }
}
```

**validation_report.json** - Quality assurance results:
```json
{
  "total_words": 5234,
  "total_issues": 3,
  "errors": 0,
  "warnings": 3,
  "infos": 0,
  "passed": true,
  "issues": [
    {
      "severity": "warning",
      "check": "timestamp_gaps",
      "message": "Large gap (6.50s) in transcript",
      "timestamp": 1234.5,
      "details": {...}
    }
  ]
}
```

## Merging Strategy: Owned-Interval Stitching

**Core Principle:** Each word is assigned to the speaker who "owns" that time interval.

**Algorithm:**
1. For each word in transcription:
   - Calculate word midpoint: `(start + end) / 2`
   - Find speaker turn that contains this midpoint
   - If no turn contains midpoint, assign to nearest turn
2. For each assigned speaker:
   - Look up global voice ID from `matches.json`
   - Find emotion score from nearest turn (same speaker)
3. Write merged word with all annotations

**Edge Cases:**
- **Word outside speaker turns:** Assign to closest turn (by time distance)
- **Multiple speaker turns overlap word:** Use midpoint to resolve
- **Missing speaker ID:** Leave `speaker_id` as `null`
- **Missing emotion:** Leave `arousal`, `valence`, `dominance` as `null`

**Why Midpoint?**
- More robust than start/end for boundary cases
- Matches human perception of "who said this word"
- Handles small alignment errors gracefully

## Validation Checks

### 1. Timestamp Monotonicity
- **Check:** Words are in chronological order
- **Error:** Word starts before previous word
- **Error:** Word ends before it starts

### 2. Timestamp Gaps
- **Check:** No large gaps between words
- **Warning:** Gap > 5 seconds (configurable)
- **Interpretation:** May indicate silence, background music, or missing audio

### 3. Speaker Consistency
- **Check:** No rapid speaker switching
- **Warning:** Speaker turn < 0.3 seconds (configurable)
- **Interpretation:** May indicate diarization errors or actual interruptions

### 4. Emotion Score Validity
- **Check:** A/V/D scores in range [0.0, 1.0]
- **Error:** Score outside valid range
- **Interpretation:** Bug in emotion model or data corruption

### 5. Coverage
- **Check:** % of words with speaker IDs and emotion scores
- **Warning:** Speaker ID coverage < 80% (configurable)
- **Warning:** Emotion coverage < 70% (configurable)
- **Interpretation:** Incomplete pipeline or missing intermediate files

### 6. Alignment Quality
- **Check:** Distribution of word alignment confidence scores
- **Warning:** Mean score < 0.7
- **Warning:** >10% of words have score < 0.5
- **Interpretation:** Poor transcription quality or difficult audio

## Usage

### Full Pipeline (Merge + Validate)

```bash
python -m pipeline.postprocess \
    --input-dir /path/to/session/outputs \
    --output-dir /path/to/session/final \
    [--skip-emotion] \
    [--skip-speaker-id] \
    [--skip-validation]
```

### Merge Only

```bash
python -m pipeline.postprocess.merge \
    --input-dir /path/to/session/outputs \
    --output-dir /path/to/session/final \
    [--skip-emotion] \
    [--skip-speaker-id]
```

### Validate Only

```bash
python -m pipeline.postprocess.validate \
    --input-dir /path/to/session/final \
    --output-dir /path/to/session/final \
    [--max-gap 5.0] \
    [--min-turn-duration 0.3] \
    [--min-speaker-id-coverage 0.8] \
    [--min-emotion-coverage 0.7]
```

## Configuration

### Merge Options

- `--skip-emotion`: Don't merge emotion scores (if Step 3 was skipped)
- `--skip-speaker-id`: Don't resolve speaker IDs (if Step 4 was skipped)

### Validation Thresholds

- `--max-gap`: Maximum allowed gap between words (default: 5.0s)
- `--min-turn-duration`: Minimum speaker turn duration (default: 0.3s)
- `--min-speaker-id-coverage`: Minimum % words with IDs (default: 0.8)
- `--min-emotion-coverage`: Minimum % words with emotion (default: 0.7)

## Mode Differences

### Mode A (Multitrack)
- **Speaker IDs:** Should be 100% coverage (auto-updated database)
- **Emotion:** May have some gaps (short utterances filtered)
- **Validation:** Expect very few issues (clean audio)

### Mode B (Single-mic)
- **Speaker IDs:** Coverage depends on manual database review
- **Emotion:** May have lower coverage (more segments filtered)
- **Validation:** Expect more warnings (room acoustics, overlaps)

## Dependencies

**Required:**
- `numpy` (for statistics)
- Standard library: `json`, `logging`, `argparse`, `dataclasses`, `pathlib`, `collections`

**No ML models needed** - this step is pure data processing.

## Performance

**Processing Speed:**
- ~100,000 words/second (merge)
- ~50,000 words/second (validate)

**Typical Session:**
- 5,000 words
- Merge: <0.1 seconds
- Validate: <0.2 seconds
- **Total: <0.3 seconds**

## Common Issues

### Issue: Low speaker ID coverage (Mode A)

**Cause:** Speaker embedding database not updated
**Solution:** Check `speaker_embedding/matches.json` was created

### Issue: Low emotion coverage

**Cause:** Many short utterances filtered in Step 3
**Solution:** Reduce `min_segment_duration` in emotion config

### Issue: Timestamp gaps warnings

**Cause:** Silence, music, or missing audio
**Solution:** Review audio at reported timestamps, may be legitimate

### Issue: Rapid speaker switching warnings

**Cause:** Diarization errors or actual interruptions
**Solution:** Review diarization at reported timestamps

### Issue: Low alignment confidence

**Cause:** Difficult audio (background noise, accents, mumbling)
**Solution:** Review transcription quality, consider re-recording

## Output Format Details

### merged.jsonl Schema

```python
{
  "start": float,          # Word start time (seconds)
  "end": float,            # Word end time (seconds)
  "word": str,             # Transcribed word
  "score": float,          # Alignment confidence [0, 1]
  "speaker": str,          # Session speaker ID (SPEAKER_00, etc.)
  "speaker_id": str|null,  # Global voice ID (GV_0001, etc.)
  "arousal": float|null,   # Arousal score [0, 1]
  "valence": float|null,   # Valence score [0, 1]
  "dominance": float|null  # Dominance score [0, 1]
}
```

**Note:** `speaker_id` and emotion scores may be `null` if:
- Step 4 was skipped (no speaker ID resolution)
- Step 3 was skipped (no emotion analysis)
- Word fell outside any emotion turn (short utterances filtered)

## Integration with Downstream Tools

### Convert to readable transcript

```python
import json

with open("merged.jsonl") as f:
    words = [json.loads(line) for line in f]

# Group by speaker turns
current_speaker = None
current_text = []

for word in words:
    if word["speaker"] != current_speaker:
        if current_text:
            print(f"{current_speaker}: {' '.join(current_text)}")
        current_speaker = word["speaker"]
        current_text = []
    current_text.append(word["word"])

# Print final turn
if current_text:
    print(f"{current_speaker}: {' '.join(current_text)}")
```

### Extract high-arousal moments

```python
import json

with open("merged.jsonl") as f:
    for line in f:
        word = json.loads(line)
        if word.get("arousal", 0) > 0.8:
            print(f"{word['start']:.1f}s: {word['word']} (arousal={word['arousal']:.2f})")
```

### Generate speaker statistics

```python
import json
from collections import defaultdict

speaker_stats = defaultdict(lambda: {"words": 0, "duration": 0})

with open("merged.jsonl") as f:
    for line in f:
        word = json.loads(line)
        speaker = word["speaker_id"] or word["speaker"]
        speaker_stats[speaker]["words"] += 1
        speaker_stats[speaker]["duration"] += word["end"] - word["start"]

for speaker, stats in speaker_stats.items():
    print(f"{speaker}: {stats['words']} words, {stats['duration']:.1f}s")
```

## Future Enhancements

- [ ] Per-speaker normalization of emotion scores
- [ ] Confidence scores for speaker assignments
- [ ] Multi-pass merging with conflict resolution
- [ ] Export to SRT, VTT, or other subtitle formats
- [ ] Integration with LLM summarization
- [ ] Real-time streaming merge for live sessions

## Troubleshooting

**Validation fails with many errors:**
1. Check that all input files exist
2. Verify input files are valid JSON Lines format
3. Check timestamps are in seconds (not milliseconds)
4. Review diarization quality (may need re-tuning)

**Merge produces all-null speaker_ids:**
1. Check `speaker_embedding/matches.json` exists
2. Verify speaker names match between files
3. Check matches.json format (should be `{"matches": [...]`)

**Emotion scores missing for many words:**
1. Check `emotion/emotion.jsonl` exists
2. Verify emotion step used correct diarization file
3. Review Step 3 filtering (min/max duration settings)

**Merge very slow:**
1. Check merged.jsonl isn't being re-processed
2. Verify input files aren't corrupted (gigantic lines)
3. Consider splitting large sessions (>10 hours)

## Validation Report Interpretation

**Passed (errors=0):** Safe to use merged transcript
**Warnings only:** Review warnings, may be acceptable
**Errors present:** Fix upstream issues before using

**Common warning patterns:**
- Few gaps: Normal (silence, music breaks)
- Many gaps: May indicate audio segmentation issues
- Few short turns: Normal (interruptions, confirmations)
- Many short turns: Diarization needs tuning
- Low emotion coverage: Expected if many short utterances
- Low speaker ID coverage (Mode B): Expected until manual review

## Best Practices

1. **Always run validation** after merging
2. **Review validation report** before downstream use
3. **Archive merged transcript** with session metadata
4. **Include merge_stats.json** in session documentation
5. **Keep intermediate files** for debugging/re-processing
6. **Version merged outputs** if re-running with different settings
