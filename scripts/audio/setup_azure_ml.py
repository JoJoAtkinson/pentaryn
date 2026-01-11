#!/usr/bin/env python3
"""
Setup Azure ML workspace, compute, and environment for audio transcription.
Run this once to create all necessary Azure resources.
"""

import sys
from pathlib import Path

try:
    from azure.ai.ml import MLClient
    from azure.ai.ml.entities import AmlCompute, Environment, BuildContext
    from azure.identity import DefaultAzureCredential, InteractiveBrowserCredential
    from azure.core.exceptions import ResourceNotFoundError
except ImportError:
    print("ERROR: Azure ML SDK not installed")
    print("Install with: pip install azure-ai-ml azure-identity")
    sys.exit(1)

from azure_ml_config import (
    SUBSCRIPTION_ID,
    RESOURCE_GROUP,
    WORKSPACE_NAME,
    COMPUTE_NAME,
    COMPUTE_SIZE,
    ENVIRONMENT_NAME,
)


def get_ml_client():
    """Get authenticated ML client."""
    print("Authenticating with Azure...")
    
    # Try DefaultAzureCredential first (works with az cli, env vars, managed identity)
    try:
        credential = DefaultAzureCredential()
        # Test the credential
        credential.get_token("https://management.azure.com/.default")
        print("✓ Authenticated using DefaultAzureCredential")
    except Exception as e:
        print(f"DefaultAzureCredential failed: {e}")
        print("Falling back to interactive browser authentication...")
        credential = InteractiveBrowserCredential()
    
    ml_client = MLClient(
        credential=credential,
        subscription_id=SUBSCRIPTION_ID,
        resource_group_name=RESOURCE_GROUP,
        workspace_name=WORKSPACE_NAME,
    )
    
    print(f"✓ Connected to workspace: {WORKSPACE_NAME}")
    return ml_client


def create_or_get_compute(ml_client):
    """Create or get existing compute cluster."""
    print(f"\nChecking compute cluster: {COMPUTE_NAME}")
    
    try:
        compute = ml_client.compute.get(COMPUTE_NAME)
        print(f"✓ Compute cluster already exists: {COMPUTE_NAME}")
        print(f"  - Size: {compute.size}")
        print(f"  - Min instances: {compute.min_instances}")
        print(f"  - Max instances: {compute.max_instances}")
        return compute
    except ResourceNotFoundError:
        print(f"Creating new compute cluster: {COMPUTE_NAME}")
        print(f"  - Size: {COMPUTE_SIZE}")
        print(f"  - Min instances: 0 (auto-shutdown when idle)")
        print(f"  - Max instances: 1")
        
        compute = AmlCompute(
            name=COMPUTE_NAME,
            type="amlcompute",
            size=COMPUTE_SIZE,
            min_instances=0,  # Scale to zero when not in use
            max_instances=1,  # Only need one for single-job execution
            idle_time_before_scale_down=300,  # 5 minutes idle before shutdown
        )
        
        compute = ml_client.compute.begin_create_or_update(compute).result()
        print(f"✓ Compute cluster created: {COMPUTE_NAME}")
        return compute


def create_or_get_environment(ml_client):
    """Create or get existing environment."""
    print(f"\nChecking environment: {ENVIRONMENT_NAME}")
    
    # Always create/update - Azure ML will create new version if changed
    print(f"Creating/updating environment: {ENVIRONMENT_NAME}")
    
    # Create environment from dockerfile + requirements
    script_dir = Path(__file__).parent
    
    # Create a simple Dockerfile for GPU + CUDA
    dockerfile_content = """FROM mcr.microsoft.com/azureml/openmpi4.1.0-cuda11.8-cudnn8-ubuntu22.04:latest

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    ffmpeg \\
    git \\
    pkg-config \\
    libavcodec-dev \\
    libavformat-dev \\
    libavutil-dev \\
    libavdevice-dev \\
    libavfilter-dev \\
    libswscale-dev \\
    libswresample-dev \\
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python requirements
COPY requirements-azure.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Verify CUDA installation
RUN python -c "import torch; print('CUDA available:', torch.cuda.is_available())"
"""
    
    dockerfile_path = script_dir / "Dockerfile.azure"
    with open(dockerfile_path, "w") as f:
        f.write(dockerfile_content)
    
    print(f"  - Created Dockerfile: {dockerfile_path}")
    
    # Create environment with build context
    environment = Environment(
        name=ENVIRONMENT_NAME,
        description="WhisperX GPU environment for audio transcription",
        build=BuildContext(
            path=str(script_dir),
            dockerfile_path="Dockerfile.azure"
        ),
    )
    
    print("  - Building environment (this may take 10-15 minutes)...")
    environment = ml_client.environments.create_or_update(environment)
    print(f"✓ Environment created: {ENVIRONMENT_NAME}")
    return environment


def verify_storage(ml_client):
    """Verify storage account is accessible."""
    print("\nVerifying storage access...")
    
    try:
        # Get default datastore
        datastore = ml_client.datastores.get_default()
        print(f"✓ Default datastore: {datastore.name}")
        print(f"  - Type: {datastore.type}")
        return True
    except Exception as e:
        print(f"WARNING: Could not verify storage access: {e}")
        print("You may need to set up storage permissions manually.")
        return False


def print_next_steps():
    """Print instructions for next steps."""
    print("\n" + "="*60)
    print("Setup Complete!")
    print("="*60)
    print("\nNext steps:")
    print("\n1. Set HuggingFace token as environment variable:")
    print("   - Get token from: https://huggingface.co/settings/tokens")
    print("   - Accept model terms:")
    print("     - https://huggingface.co/pyannote/speaker-diarization-3.1")
    print("     - https://huggingface.co/pyannote/segmentation-3.0")
    print("   - The token will be passed as a secret to your job")
    print("\n2. Run a transcription job:")
    print('   python scripts/audio/submit_transcription.py "/Users/joe/GitHub/dnd/.output/DnD 2.m4a"')
    print("\n3. Monitor job in Azure ML Studio:")
    print(f"   https://ml.azure.com/workspaces/{WORKSPACE_NAME}")
    print("="*60)


def main():
    """Main setup function."""
    print("="*60)
    print("Azure ML Audio Transcription Setup")
    print("="*60)
    print(f"\nSubscription: {SUBSCRIPTION_ID}")
    print(f"Resource Group: {RESOURCE_GROUP}")
    print(f"Workspace: {WORKSPACE_NAME}")
    print(f"Compute: {COMPUTE_NAME} ({COMPUTE_SIZE})")
    print(f"Environment: {ENVIRONMENT_NAME}")
    
    try:
        # Authenticate and connect
        ml_client = get_ml_client()
        
        # Create compute
        create_or_get_compute(ml_client)
        
        # Create environment
        create_or_get_environment(ml_client)
        
        # Verify storage
        verify_storage(ml_client)
        
        # Print next steps
        print_next_steps()
        
    except Exception as e:
        print(f"\nERROR: Setup failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
