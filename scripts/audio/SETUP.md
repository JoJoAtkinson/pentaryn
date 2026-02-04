# Azure ML Audio Pipeline Setup

## Prerequisites

Before running the audio pipeline, ensure the following Azure ML resources are configured:

### 1. Compute Targets

Two compute targets are required:

#### CPU Compute (for Step 0: Preprocessing)
```bash
az ml compute create \
  --name cpu-preprocess \
  --type amlcompute \
  --size Standard_D4s_v3 \
  --min-instances 0 \
  --max-instances 1 \
  --resource-group AtJoseph-rg \
  --workspace-name joe-ml-sandbox
```

#### GPU Compute (for Steps 1-4: Transcription, Diarization, Emotion, Speaker Embedding)
```bash
az ml compute create \
  --name gpu-transcribe \
  --type amlcompute \
  --size Standard_NC4as_T4_v3 \
  --min-instances 0 \
  --max-instances 2 \
  --resource-group AtJoseph-rg \
  --workspace-name joe-ml-sandbox
```

### 2. Environment

The pipeline requires a custom environment with all dependencies. This should be registered in Azure ML with the name specified in `pipeline.config.toml` (default: `audio-pipeline-env`).

## Quick Setup

Run the setup helper to create both compute targets:

```bash
make audio-setup
```

This will:
1. Check if compute targets already exist
2. Create missing compute targets
3. Verify the setup is complete

## Verification

Check that compute targets exist:

```bash
az ml compute list \
  --resource-group AtJoseph-rg \
  --workspace-name joe-ml-sandbox \
  -o table
```

Expected output should include both `cpu-preprocess` and `gpu-transcribe`.

## Configuration

Compute target names are defined in `scripts/audio/pipeline.config.toml`:

```toml
[azure]
compute_target_cpu = "cpu-preprocess"
compute_target_gpu = "gpu-transcribe"
environment_name = "audio-pipeline-env"
```

If you use different compute names, update the config file accordingly.
