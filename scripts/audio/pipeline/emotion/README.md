# Step 3: Emotion Analysis

Extracts dimensional emotion scores (Arousal, Valence, Dominance) for each speaker turn using the WavLM emotion model.

## Overview

This step analyzes the emotional content of each speaker turn identified in Step 2 (Diarization). It uses a pre-trained WavLM model fine-tuned for dimensional emotion regression to extract three continuous scores:

- **Arousal**: Energy/activation level (0=calm, 1=excited/alert)
- **Valence**: Emotional positivity (0=negative, 1=positive)
- **Dominance**: Control/confidence (0=submissive, 1=dominant)

These dimensional scores provide a rich representation of emotional state that can be used for:
- Session analysis and player engagement tracking
- Character development and roleplay insights
- Identifying emotionally significant moments
- Optional conversion to categorical labels (happy, sad, angry, etc.)

## Input

**From Step 0 (Preprocess):**
- `processed/audio.wav` - Preprocessed audio file

**From Step 2 (Diarization):**
- `diarization/diarization.jsonl` - Speaker turns with timestamps

Each diarization record has:
```json
{
  "start": 0.0,
  "end": 3.5,
  "speaker": "SPEAKER_00",
  "track_id": "dan-fletcher"  // Mode A only
}
```

## Output

**emotion.jsonl** - One record per speaker turn with A/V/D scores:
```json
{
  "start": 0.0,
  "end": 3.5,
  "speaker": "SPEAKER_00",
  "arousal": 0.65,
  "valence": 0.73,
  "dominance": 0.58
}
```

All scores are in the range [0.0, 1.0].

## Model

**WavLM-Large MSP-Podcast Emotion (Dimensional)**
- HuggingFace: `tiantiaf/wavlm-large-msp-podcast-emotion-dim`
- Architecture: WavLM-Large (315M parameters) + linear regression head
- Output: 3-dimensional continuous scores (A/V/D)
- Input: 16 kHz mono audio, 3-second windows
- Training: MSP-Podcast corpus with dimensional annotations

**Model Performance:**
- Arousal: CCC ~0.70
- Valence: CCC ~0.65
- Dominance: CCC ~0.68

(CCC = Concordance Correlation Coefficient, measures agreement with human annotations)

## Processing Pipeline

1. **Load Diarization**: Read speaker turns from `diarization.jsonl`
2. **Filter Segments**: Skip turns < 0.5s, truncate turns > 5.0s
3. **Extract Audio**: Extract audio for each turn, resample to 16 kHz, normalize
4. **Batch Processing**: Process segments in batches (default: 8)
5. **Feature Extraction**: WavLM feature extractor converts audio to model inputs
6. **Emotion Regression**: Model predicts A/V/D scores
7. **Write Output**: Save scores to `emotion.jsonl`

## Configuration

From `pipeline.config.toml`:
```toml
[emotion]
model = "tiantiaf/wavlm-large-msp-podcast-emotion-dim"
batch_size = 8
min_segment_duration = 0.5  # seconds
max_segment_duration = 5.0  # seconds
```

**Batch Size Guidelines:**
- 4: Safe for 16GB GPU
- 8: Balanced (default)
- 16: Fast for 24GB+ GPU

## Usage

### Local Execution

```bash
python -m pipeline.emotion.analyze \
    --config pipeline.config.toml \
    --input-dir /path/to/session/outputs \
    --output-dir /path/to/session/outputs \
    --batch-size 8 \
    --min-duration 0.5 \
    --max-duration 5.0
```

### Azure ML Execution

```python
from pipeline.emotion.job import create_emotion_job

job = create_emotion_job(
    config=config_dict,
    input_dir="azureml://datastores/.../session-01",
    output_dir="azureml://datastores/.../session-01",
    compute_target="gpu-transcribe",
    batch_size=8,
)

ml_client.jobs.create_or_update(job)
```

## Segment Duration Handling

**Too Short (< 0.5s):**
- Skipped entirely
- Emotion models need sufficient context
- Short utterances are often filler ("um", "uh")

**Too Long (> 5.0s):**
- Truncated to first 5 seconds
- Prevents memory issues with very long turns
- Captures initial emotional state (most salient)

**Ideal Range (0.5s - 5.0s):**
- Provides good emotion signal
- Fits model's training distribution

## Dimensional Emotion Interpretation

### Arousal (Energy/Activation)
- **Low (0.0-0.3)**: Calm, relaxed, bored, sleepy
- **Medium (0.3-0.7)**: Normal conversation, neutral energy
- **High (0.7-1.0)**: Excited, alert, tense, agitated

### Valence (Positivity)
- **Low (0.0-0.3)**: Negative emotions (sad, angry, fearful)
- **Medium (0.3-0.7)**: Neutral affect
- **High (0.7-1.0)**: Positive emotions (happy, content, excited)

### Dominance (Control/Confidence)
- **Low (0.0-0.3)**: Submissive, uncertain, fearful
- **Medium (0.3-0.7)**: Balanced, neutral confidence
- **High (0.7-1.0)**: Dominant, confident, in-control

## Categorical Emotion Mapping (Optional)

The `derive_emotion_label()` function provides simple categorical labels:

```python
from pipeline.emotion import derive_emotion_label

label = derive_emotion_label(
    arousal=0.8,
    valence=0.7,
    dominance=0.6
)
# Returns: "excited"
```

**Mapping Rules:**
| Arousal | Valence | Dominance | Label |
|---------|---------|-----------|--------|
| High | High | High | Excited |
| High | High | Low | Happy |
| Low | High | High | Content |
| Low | High | Low | Calm |
| High | Low | High | Angry |
| High | Low | Low | Fearful |
| Low | Low | High | Contemptuous |
| Low | Low | Low | Sad |
| Medium | Medium | * | Neutral |

This is a simplified heuristic. More sophisticated approaches could use:
- Trained categorical classifiers
- Fuzzy logic with overlapping regions
- Context-aware label selection

## Dependencies

**Required:**
- `torch` >= 2.0
- `torchaudio` >= 2.0
- `transformers` >= 4.30
- `numpy`
- `tqdm`

**GPU Recommended:**
- 8GB+ VRAM for batch_size=8
- 16GB+ VRAM for batch_size=16

## Performance

**Processing Speed:**
- ~0.1s per segment (batch_size=8, GPU)
- ~0.5s per segment (CPU fallback)

**Typical Session:**
- 500 speaker turns
- ~50 seconds on GPU
- ~250 seconds on CPU

## Mode Differences

### Mode A (Multitrack)
- Clean close-mic audio provides better emotion signal
- Higher confidence in predictions
- Can track emotion per-player accurately

### Mode B (Single-mic)
- Room acoustics may degrade signal quality
- Background noise/crosstalk can affect predictions
- Use with caution, consider smoothing/filtering

## Troubleshooting

**Issue: Low arousal for all segments**
- Check audio normalization (should be [-1, 1])
- Verify segments aren't silence
- Try increasing `min_segment_duration`

**Issue: CUDA out of memory**
- Reduce `batch_size` (try 4 or 2)
- Reduce `max_segment_duration` (try 3.0s)
- Close other GPU processes

**Issue: Model download fails**
- Check HuggingFace connectivity
- Set `HF_HOME` for cache location
- Try manual download: `huggingface-cli download tiantiaf/wavlm-large-msp-podcast-emotion-dim`

**Issue: Unrealistic scores (all near 0.5)**
- Model may not be loading properly
- Check regression head weights
- Verify audio preprocessing (sample rate, normalization)

## Best Practices

1. **Quality Filtering**: Skip segments with low SNR or heavy overlap
2. **Temporal Smoothing**: Apply moving average to reduce frame-to-frame jitter
3. **Calibration**: Compare predictions to ground truth on known emotional moments
4. **Context Integration**: Combine with transcript for richer analysis
5. **Speaker Normalization**: Some speakers naturally show higher/lower scores

## Validation

Check output quality:
```python
import json
import numpy as np

scores = {"arousal": [], "valence": [], "dominance": []}

with open("emotion.jsonl") as f:
    for line in f:
        data = json.loads(line)
        scores["arousal"].append(data["arousal"])
        scores["valence"].append(data["valence"])
        scores["dominance"].append(data["dominance"])

# Should see reasonable distributions, not all 0.5
for dim, vals in scores.items():
    print(f"{dim}: mean={np.mean(vals):.2f}, std={np.std(vals):.2f}")
```

Expected output:
```
arousal: mean=0.55, std=0.15
valence: mean=0.58, std=0.18
dominance: mean=0.52, std=0.14
```

## Future Enhancements

- [ ] Multi-window aggregation (analyze multiple 3s windows per turn)
- [ ] Confidence scores per prediction
- [ ] Speaker-specific calibration curves
- [ ] Integration with transcript sentiment analysis
- [ ] Real-time streaming emotion tracking
