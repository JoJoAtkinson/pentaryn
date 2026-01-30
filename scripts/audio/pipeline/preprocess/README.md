# Step 0: Preprocess / Normalize

This step standardizes audio format and loudness for consistent model performance across all downstream steps.

## Purpose

- Convert audio to mono 16 kHz (required by Whisper, WavLM, and ECAPA models)
- Apply loudness normalization using EBU R128 standard
- Remove low-frequency rumble with optional high-pass filter
- Support both Mode A (multitrack) and Mode B (single mic)

## Technology

- **FFmpeg** with `loudnorm` filter (EBU R128 / ITU-R BS.1770)
- Two-pass normalization for accurate LUFS targeting
- FLAC output format (lossless compression)

## Usage

```bash
# Mode B (single mic)
python -m pipeline.preprocess.normalize \
  --audio Session_04.m4a \
  --output .output/Session_04/preprocess \
  --config pipeline.config.toml

# Mode A (multitrack)
python -m pipeline.preprocess.normalize \
  --audio sessions/06/tracks/ \
  --output .output/Session_06/preprocess \
  --config pipeline.config.toml \
  --audio-mode discord_multitrack
```

## Outputs

### Mode A (Multitrack)
```
preprocess/
└── normalized_tracks/
    ├── joe.flac
    ├── nicole.flac
    ├── dan.flac
    └── jeff.flac
```

### Mode B (Single Mic)
```
preprocess/
└── normalized.flac
```

## Configuration

See `[preprocess]` section in `pipeline.config.toml`:

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
```

## Why These Settings?

- **16 kHz**: Required by Whisper, WavLM, and SpeechBrain models
- **Mono**: Speaker recognition works best on single-channel audio
- **-23 LUFS**: EBU R128 broadcast standard
- **80 Hz highpass**: Removes rumble without affecting speech
- **FLAC**: Lossless compression (decode to PCM for inference)
