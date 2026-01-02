# Audio Transcription with Speaker Diarization

Transcribe D&D session recordings (M4A files) with automatic speaker identification.

## Setup

### 1. Install Dependencies

```bash
# Using pip
pip install whisperx pyannote.audio torch

# Or add to your virtual environment
uv pip install whisperx pyannote.audio torch
```

### 2. Get HuggingFace Token

1. Create account at [HuggingFace](https://huggingface.co)
2. Generate token: https://huggingface.co/settings/tokens
3. Accept model terms:
   - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)

### 3. Set Environment Variable

```bash
export HF_TOKEN="your_token_here"
```

## Usage

### Transcribe Single File

```bash
python scripts/transcribe_audio.py recordings/session-01.m4a
```

### Transcribe Multiple Files

```bash
python scripts/transcribe_audio.py recordings/*.m4a
```

### Add Speaker Labels Later (Reuse Existing JSONL)

If you already have `recordings_transcripts/<name>.jsonl` and want to (re)run speaker diarization without re-transcribing:

```bash
export HF_TOKEN="hf_..."
python scripts/transcribe_audio.py --reuse-jsonl recordings/session-01.m4a
```

If you want to overwrite existing speaker labels:

```bash
python scripts/transcribe_audio.py --reuse-jsonl --overwrite recordings/session-01.m4a
```

### Without Speaker Diarization

If you don't set `HF_TOKEN`, the script will still transcribe but won't identify speakers:

```bash
python scripts/transcribe_audio.py recording.m4a
```

If you *do* have `HF_TOKEN` set but want a faster run without diarization:

```bash
python scripts/transcribe_audio.py --no-diarize recording.m4a
```

## Output

Creates two files in `recordings_transcripts/` for each input:

### 1. JSONL Format (machine-readable)

`recordings_transcripts/session-01.jsonl`:
```jsonl
{"speaker": "SPEAKER_00", "text": "Alright, let's start the session.", "start": 0.5, "end": 2.3}
{"speaker": "SPEAKER_01", "text": "I want to check for traps.", "start": 2.5, "end": 4.1}
{"speaker": "SPEAKER_00", "text": "Roll a perception check.", "start": 4.3, "end": 5.8}
```

### 2. TXT Format (human-readable)

`recordings_transcripts/session-01.txt`:
```
[SPEAKER_00]
Alright, let's start the session.

[SPEAKER_01]
I want to check for traps.

[SPEAKER_00]
Roll a perception check.
```

## Configuration

Use CLI flags (or edit [transcribe_audio.py](transcribe_audio.py)) to change:

- **Model size**: `--model-size base|small|medium|large-v3`
  - `tiny`: Fastest, least accurate
  - `base`: Good balance (default)
  - `small`: Better accuracy
  - `medium`: High accuracy, slower
  - `large-v3`: Best accuracy, slowest

- **Speakers**: `--num-speakers 4` (use `0` to auto-detect)
- **Output directory**: `--output-dir recordings_transcripts`

## Tips

- **Clean audio works best**: Reduce background noise if possible
- **Overlapping speech**: Diarization struggles with crosstalk
- **First run downloads models**: ~2-3GB, subsequent runs are faster
- **Processing time**: ~1-2x realtime on CPU, faster on GPU
- **Speaker labels**: "SPEAKER_00", "SPEAKER_01", etc. (you'll need to manually identify which is which)
- **If diarization feels stuck**: it can take a long time on CPU for long recordings; press Ctrl-C during diarization to skip it and still save the transcript.

## Troubleshooting

### "No HF_TOKEN" Warning

Set the environment variable:
```bash
export HF_TOKEN="hf_..."
```

### Model Download Errors

Accept model terms at:
- https://huggingface.co/pyannote/speaker-diarization-3.1
- https://huggingface.co/pyannote/segmentation-3.0

### Out of Memory

Use smaller model: `model_size="tiny"` or `model_size="base"`

### Slow Performance

- Use GPU if available (CUDA)
- Use smaller model
- Process shorter segments
