"""
Azure ML configuration for audio transcription.
Contains all Azure-specific settings in one place.
"""

# Azure subscription and resource details
SUBSCRIPTION_ID = "7593eb4d-6c88-49cb-a4c8-fbe209e62151"
RESOURCE_GROUP = "AtJoseph-rg"
WORKSPACE_NAME = "joe-ml-sandbox"

# Compute configuration
COMPUTE_NAME = "gpu-transcribe"
COMPUTE_SIZE = "Standard_NC4as_T4_v3"  # 4 cores, 28GB RAM, NVIDIA T4 16GB

# Storage configuration
STORAGE_ACCOUNT = "joemlsandbox2882481172"
CONTAINER_NAME = "audio-transcriptions"
INPUT_FOLDER = "input"
OUTPUT_FOLDER = "output"
MODELS_FOLDER = "models"  # For caching HuggingFace models

# Environment configuration
ENVIRONMENT_NAME = "whisperx-gpu"
ENVIRONMENT_VERSION = "15"  # Increment when requirements change

# Job configuration
EXPERIMENT_NAME = "audio-transcription"
