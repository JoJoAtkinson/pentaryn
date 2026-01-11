# Azure ML Audio Transcription

Run WhisperX audio transcription on Azure ML GPU compute (NVIDIA T4) with automatic setup, execution, and cleanup.

## Overview

This setup allows you to:
- Upload audio files to Azure blob storage
- Automatically spin up a GPU compute instance (Standard_NC4as_T4_v3)
- Run transcription with WhisperX + speaker diarization
- Download results automatically
- Compute auto-scales to zero when idle (no ongoing costs)

**Cost**: ~$0.53/hour when running (only charged for actual compute time)

## One-Time Setup

### 1. Install Dependencies

```bash
pip install azure-ai-ml azure-identity azure-storage-blob
```

### 2. Authenticate with Azure

```bash
# Login to Azure CLI (if not already logged in)
az login

# Set default subscription
az account set --subscription 7593eb4d-6c88-49cb-a4c8-fbe209e62151
```

### 3. Get HuggingFace Token

For speaker diarization, you need a HuggingFace token:

1. Create account: https://huggingface.co/join
2. Get token: https://huggingface.co/settings/tokens
3. Accept model terms:
   - https://huggingface.co/pyannote/speaker-diarization-3.1
   - https://huggingface.co/pyannote/segmentation-3.0

```bash
export HF_TOKEN="your_token_here"
```

**Important**: Add this to your `~/.zshrc` or `~/.bashrc` to persist:

```bash
echo 'export HF_TOKEN="your_token_here"' >> ~/.zshrc
source ~/.zshrc
```

### 4. Run Setup Script

```bash
cd /Users/joe/GitHub/dnd
python scripts/audio/setup_azure_ml.py
```

This will:
- Create GPU compute cluster (auto-scales to 0)
- Build Docker environment with CUDA + WhisperX
- Verify storage access

**Note**: First-time setup takes 10-15 minutes to build the environment.

## Running Transcriptions

### Basic Usage

```bash
python scripts/audio/submit_transcription.py "/Users/joe/GitHub/dnd/.output/DnD 2.m4a"
```

### Advanced Options

```bash
# Use different Whisper model
python scripts/audio/submit_transcription.py audio.m4a --model-size medium

# Skip speaker diarization (faster)
python scripts/audio/submit_transcription.py audio.m4a --no-diarize

# Specify speaker count range
python scripts/audio/submit_transcription.py audio.m4a --min-speakers 2 --max-speakers 6

# Submit and exit without waiting
python scripts/audio/submit_transcription.py audio.m4a --no-wait

# Custom output directory
python scripts/audio/submit_transcription.py audio.m4a --output-dir ~/Downloads/transcripts
```

## What Happens When You Submit

1. **Upload** (1-2 min): Audio file uploaded to Azure blob storage
2. **Compute Start** (2-3 min): GPU instance spins up
3. **Environment Load** (1-2 min, first run only): Docker image loaded
4. **CUDA Validation**: Script verifies GPU is working
5. **Model Download** (2-5 min, first run only): WhisperX + diarization models downloaded and cached
6. **Transcription** (varies): Actual processing (~0.1x realtime for large-v3 on GPU)
7. **Download** (1 min): Results downloaded to local folder
8. **Compute Shutdown** (automatic): Instance scales to zero after 5 minutes idle

## Output Files

Outputs are saved to `recordings_transcripts/named-outputs/transcripts/`:

- `{audio_name}.jsonl`: JSON Lines format (one segment per line)
- `{audio_name}.txt`: Human-readable transcript with speaker labels

Example JSONL:
```json
{"speaker": "SPEAKER_00", "text": "Welcome to the game.", "start": 0.0, "end": 2.5}
{"speaker": "SPEAKER_01", "text": "Thanks for having me.", "start": 2.8, "end": 4.2}
```

## CUDA Validation

The wrapper script automatically validates CUDA before running:

```
==============================================================
CUDA Validation
==============================================================
✓ CUDA is available
✓ CUDA version: 11.8
✓ GPU count: 1
✓ GPU 0: Tesla T4
  - VRAM: 15.8 GB
  - Compute capability: 7.5
✓ CUDA tensor operations working
==============================================================
```

If CUDA is not available, the job will **error immediately** and stop (no wasted compute time).

## Monitoring

### From Terminal

The script automatically monitors job progress:

```
[0.5m] Status: Preparing
[2.3m] Status: Running
[15.7m] Status: Completed
```

Press Ctrl+C to stop monitoring (job continues in background).

### From Azure Portal

Job URL is printed when submitted:

```
✓ Job submitted: brave_carpet_abc123
  - Studio URL: https://ml.azure.com/runs/brave_carpet_abc123?wsid=...
```

View logs, GPU metrics, and detailed progress in Azure ML Studio.

## Model Caching

Models are downloaded once and cached in Azure storage:

- WhisperX models: `~/.cache/torch/whisperx/`
- HuggingFace models: `models/huggingface/` (mounted from blob)
- Subsequent runs skip download and start immediately

## Cost Optimization

- **Compute cost**: $0.53/hour (NVIDIA T4 GPU)
- **Auto-shutdown**: Scales to zero after 5 minutes idle
- **No ongoing cost**: Only pay when job is running
- **Storage cost**: ~$0.02/GB/month for audio files

Example costs:
- 1 hour audio (large-v3 + diarization): ~$0.20 (≈20 min processing)
- 2 hour audio (large-v3 + diarization): ~$0.35 (≈40 min processing)

## Troubleshooting

### "CUDA is not available" Error

This means the GPU wasn't allocated correctly. Check:
- Compute cluster is using `Standard_NC4as_T4_v3` (not CPU)
- Environment has PyTorch CUDA version (not CPU-only)
- Run setup script again: `python scripts/audio/setup_azure_ml.py`

### "HuggingFace token invalid" Error

1. Verify token is correct: `echo $HF_TOKEN`
2. Accept model terms (both links above)
3. Try a new token from https://huggingface.co/settings/tokens

### Job Stuck in "Preparing"

First run downloads environment (10-15 min). Check Azure ML Studio logs.

### Out of Memory Error

Reduce batch size in `transcribe_audio.py`:
```python
result = model.transcribe(audio, batch_size=4, ...)  # Was 6
```

Or use a smaller model:
```bash
python submit_transcription.py audio.m4a --model-size medium
```

## Architecture

```
Local Machine
    ↓ (upload audio)
Azure Blob Storage
    ↓ (mount data)
GPU Compute (T4)
    ├── CUDA validation
    ├── Model loading (cached)
    ├── WhisperX transcription
    ├── Speaker diarization
    └── Save outputs
    ↓ (download)
Local Machine
```

## Files

- `azure_ml_config.py`: Azure resource configuration
- `setup_azure_ml.py`: One-time setup (compute, environment)
- `submit_transcription.py`: Submit jobs and download results
- `azure_transcribe_wrapper.py`: CUDA validation + transcription wrapper
- `requirements-azure.txt`: Python dependencies for Azure environment
- `Dockerfile.azure`: GPU-enabled Docker image (auto-generated)

## Next Steps

After setup, transcription is a single command:

```bash
python scripts/audio/submit_transcription.py "/path/to/audio.m4a"
```

The script handles everything: upload → compute → transcription → download → cleanup.
