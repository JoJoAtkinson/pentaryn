# Step 1: Transcription

Transcribes audio using WhisperX with forced alignment for word-level timestamps.

## Overview

This step converts preprocessed audio into text with precise word-level timing using WhisperX, an optimized implementation of OpenAI's Whisper with forced alignment.

**Key Features:**
- Word-level timestamps (not just segment-level)
- Forced alignment using phoneme recognition
- GPU-accelerated inference
- Chunking strategy for long recordings (3-hour chunks with overlap)
- Owned-interval stitching to merge chunks seamlessly

## Input

**From Step 0 (Preprocess):**
- `processed/audio.wav` - 16 kHz mono audio file

## Output

**transcription.jsonl** - One word per line with timestamps and confidence:
```json
{
  "start": 0.0,
  "end": 0.5,
  "word": "Hello",
  "score": 0.98
}
```

**Fields:**
- `start`: Word start time in seconds
- `end`: Word end time in seconds
- `word`: Transcribed word text
- `score`: Alignment confidence score [0, 1]

## Model

**WhisperX Large-v3**
- Architecture: Transformer encoder-decoder (1.55B parameters)
- Training: 5M hours multilingual audio
- Sample rate: 16 kHz
- Context window: 30 seconds
- Languages: 100+ (auto-detected)
- Forced alignment: wav2vec 2.0 phoneme model

**Differences from vanilla Whisper:**
- Word-level timestamps (vanilla only has segment-level)
- Batched inference for 12x speedup
- Forced alignment improves timestamp accuracy
- Memory-efficient streaming for long audio

## Processing Pipeline

### 1. Chunking (Long Recordings)
For recordings > 3 hours:
- Split into 3-hour chunks
- Add 120-second overlap between chunks
- Process each chunk independently
- Merge using owned-interval stitching

**Owned-Interval Stitching:**
- Each chunk "owns" its non-overlapping region
- Overlap regions are assigned to the chunk that produces more confident alignments
- Prevents duplicate or missing words at boundaries

### 2. Transcription
- Load WhisperX model (large-v3)
- Transcribe audio with batched inference (batch_size=16)
- Auto-detect language (or specify with `--language`)
- Get segment-level transcriptions

### 3. Forced Alignment
- Load wav2vec 2.0 alignment model for detected language
- Align transcript to audio using phoneme recognition
- Produce word-level timestamps
- Compute alignment confidence scores

### 4. Output
- Write words to `transcription.jsonl` in chronological order
- Filter low-confidence words (optional, score < 0.5)

## Configuration

From `pipeline.config.toml`:
```toml
[transcription]
model = "large-v3"
batch_size = 16
language = "auto"  # or "en", "es", "fr", etc.
compute_type = "float16"
chunk_duration = 10800  # 3 hours in seconds
chunk_overlap = 120  # 2 minutes overlap
min_word_score = 0.0  # Don't filter words by default
```

**Batch Size Guidelines:**
- 8: Safe for 16GB GPU
- 16: Balanced (default)
- 24: Fast for 24GB+ GPU
- 32: Very fast for 40GB+ GPU (A100)

**Compute Type:**
- `float16`: Fastest, 16GB GPU minimum (default)
- `int8`: Slower but uses less memory (8GB GPU)
- `float32`: Slowest, highest quality (not recommended)

## Usage

### Local Execution

```bash
python -m pipeline.transcription.transcribe \
    --config pipeline.config.toml \
    --input-dir /path/to/session/outputs/step0 \
    --output-dir /path/to/session/outputs/step1 \
    --batch-size 16 \
    --language auto
```

### Azure ML Execution

```python
from pipeline.transcription.job import create_transcription_job

job = create_transcription_job(
    config=config_dict,
    input_dir="azureml://datastores/.../session-01/step0",
    output_dir="azureml://datastores/.../session-01/step1",
    compute_target="gpu-transcribe",
)

ml_client.jobs.create_or_update(job)
```

## Performance

**Processing Speed:**
- ~10-15x real-time on T4 GPU (batch_size=16)
- ~20-25x real-time on A100 GPU (batch_size=32)
- ~0.5x real-time on CPU (not recommended)

**Example:**
- 3-hour recording
- T4 GPU (Standard_NC4as_T4_v3)
- ~12-18 minutes processing time

**Memory Usage:**
- large-v3 model: ~3GB VRAM
- Batch inference: ~4-8GB VRAM (depends on batch_size)
- Peak usage: ~10GB VRAM (batch_size=16)

## Chunking Details

### Why Chunk?
- WhisperX has 30-second context window
- Long recordings don't fit in memory
- GPU batch processing is more efficient on fixed-size chunks

### Overlap Strategy
- 120-second overlap between chunks
- Prevents cutting off words at boundaries
- Allows context for better alignment
- Owned-interval logic resolves duplicates

### Stitching Algorithm
1. For each word in overlap region:
   - Compare confidence scores from both chunks
   - Assign to chunk with higher score
2. For each word outside overlap:
   - Assign to the chunk that "owns" that time region
3. Sort all words by `start` time
4. Write to output

## Quality Metrics

**Alignment Score Distribution:**
- Mean score > 0.9: Excellent
- Mean score 0.8-0.9: Good
- Mean score 0.7-0.8: Acceptable
- Mean score < 0.7: Poor (review audio quality)

**Low Score Causes:**
- Background noise or music
- Overlapping speech
- Accents or mumbling
- Audio-visual sync issues
- Incorrect language detection

## Language Support

**Auto-Detection:**
- Analyzes first 30 seconds of audio
- Detects among 100+ languages
- Works well for monolingual recordings

**Manual Override:**
- Use `--language en` for English
- Improves accuracy if language is known
- Prevents mis-detection on code-switching

**Supported Languages (subset):**
- English (`en`)
- Spanish (`es`)
- French (`fr`)
- German (`de`)
- Italian (`it`)
- Portuguese (`pt`)
- Russian (`ru`)
- Chinese (`zh`)
- Japanese (`ja`)
- Korean (`ko`)
- [See full list in WhisperX docs]

## Mode Differences

### Mode A (Multitrack)
- Clean close-mic audio provides best transcription quality
- Higher alignment confidence scores
- Fewer transcription errors
- Can process tracks in parallel (not implemented yet)

### Mode B (Single-mic)
- Room acoustics may degrade quality
- Background noise and crosstalk affect confidence
- Consider noise reduction in Step 0
- May need lower batch_size to handle longer recordings

## Troubleshooting

**Issue: CUDA out of memory**
- Reduce `batch_size` (try 8 or 4)
- Use `compute_type=int8` instead of float16
- Process shorter chunks (`chunk_duration=7200`)

**Issue: Wrong language detected**
- Use `--language <code>` to specify language
- Check first 30 seconds of audio (used for detection)
- Ensure audio isn't silent at start

**Issue: Poor alignment scores**
- Check audio quality (noise, clipping)
- Verify sample rate is 16 kHz
- Try different Whisper model size (medium vs large-v3)
- Review preprocessing (Step 0)

**Issue: Missing words**
- Check `min_word_score` threshold (lower it to 0.0)
- Verify audio isn't clipped or corrupted
- Review chunk overlap settings

**Issue: Slow processing**
- Increase `batch_size` (if GPU has memory)
- Use larger GPU instance (A100 vs T4)
- Switch to `compute_type=int8` (faster but less accurate)

## Dependencies

**Required:**
- `whisperx` >= 3.1.0
- `torch` >= 2.0
- `torchaudio` >= 2.0
- `transformers` >= 4.30
- `faster-whisper` >= 0.9.0
- `numpy`

**GPU Required:**
- 16GB+ VRAM for large-v3 with batch_size=16
- 8GB+ VRAM for large-v3 with batch_size=8 or int8

## Output Validation

Check output quality:
```python
import json
import numpy as np

words = []
with open("transcription.jsonl") as f:
    for line in f:
        words.append(json.loads(line))

scores = [w["score"] for w in words]
print(f"Total words: {len(words)}")
print(f"Mean score: {np.mean(scores):.3f}")
print(f"Median score: {np.median(scores):.3f}")
print(f"Min score: {np.min(scores):.3f}")
print(f"Low scores (<0.7): {sum(1 for s in scores if s < 0.7)}")
```

Expected output:
```
Total words: 5234
Mean score: 0.912
Median score: 0.945
Min score: 0.432
Low scores (<0.7): 89
```

## Best Practices

1. **Verify audio preprocessing** before transcription (16 kHz, mono, normalized)
2. **Use GPU** for faster processing (CPU is 20x slower)
3. **Monitor VRAM usage** and adjust batch_size accordingly
4. **Keep batch_size as high as possible** without OOM (faster)
5. **Use auto language detection** unless you're certain of the language
6. **Review alignment scores** to identify problematic audio sections
7. **Archive raw outputs** before filtering (in case you need to adjust thresholds)

## Comparison with Vanilla Whisper

| Feature | Vanilla Whisper | WhisperX |
|---------|----------------|----------|
| Timestamps | Segment-level (~30s) | Word-level |
| Alignment | Heuristic | Forced (phoneme-based) |
| Speed | 1x baseline | 12x faster |
| Batching | No | Yes |
| Memory | ~6GB VRAM | ~10GB VRAM (batched) |
| Accuracy | High | Same + better timestamps |

## Future Enhancements

- [ ] Parallel track processing for Mode A
- [ ] Streaming transcription for real-time use
- [ ] Custom vocabulary for D&D terms
- [ ] Speaker-adaptive language models
- [ ] Post-processing spell correction
- [ ] Export to SRT/VTT subtitle formats

## References

- WhisperX paper: [https://arxiv.org/abs/2303.00747](https://arxiv.org/abs/2303.00747)
- WhisperX GitHub: [https://github.com/m-bain/whisperX](https://github.com/m-bain/whisperX)
- OpenAI Whisper: [https://github.com/openai/whisper](https://github.com/openai/whisper)
