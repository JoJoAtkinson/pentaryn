#!/usr/bin/env python3
"""Setup Azure ML resources for audio pipeline."""

import sys
from pathlib import Path
from azure.ai.ml import MLClient
from azure.ai.ml.entities import AmlCompute
from azure.identity import DefaultAzureCredential
from azure.core.exceptions import ResourceNotFoundError

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from audio.pipeline.config import PipelineConfig

# Azure configuration
RESOURCE_GROUP = "AtJoseph-rg"
WORKSPACE_NAME = "joe-ml-sandbox"
SUBSCRIPTION_ID = "7593eb4d-6c88-49cb-a4c8-fbe209e62151"


def check_compute_exists(ml_client: MLClient, compute_name: str) -> bool:
    """Check if compute target exists."""
    try:
        ml_client.compute.get(compute_name)
        return True
    except ResourceNotFoundError:
        return False


def create_cpu_compute(ml_client: MLClient, compute_name: str) -> None:
    """Create CPU compute cluster."""
    print(f"Creating CPU compute: {compute_name}")
    
    cpu_compute = AmlCompute(
        name=compute_name,
        type="amlcompute",
        size="Standard_D4s_v3",
        min_instances=0,
        max_instances=1,
        idle_time_before_scale_down=300,
    )
    
    ml_client.compute.begin_create_or_update(cpu_compute).result()
    print(f"✓ Created {compute_name}")


def create_gpu_compute(ml_client: MLClient, compute_name: str) -> None:
    """Create GPU compute cluster."""
    print(f"Creating GPU compute: {compute_name}")
    
    gpu_compute = AmlCompute(
        name=compute_name,
        type="amlcompute",
        size="Standard_NC4as_T4_v3",
        min_instances=0,
        max_instances=2,
        idle_time_before_scale_down=300,
    )
    
    ml_client.compute.begin_create_or_update(gpu_compute).result()
    print(f"✓ Created {compute_name}")


def main():
    """Setup Azure ML resources."""
    print("Azure ML Audio Pipeline Setup")
    print("=" * 50)
    
    # Load config
    config_path = Path(__file__).parent / "pipeline.config.toml"
    config = PipelineConfig.from_file(config_path)
    
    # Create ML client
    print("\nConnecting to Azure ML workspace...")
    credential = DefaultAzureCredential()
    ml_client = MLClient(
        credential=credential,
        subscription_id=SUBSCRIPTION_ID,
        resource_group_name=RESOURCE_GROUP,
        workspace_name=WORKSPACE_NAME,
    )
    print(f"✓ Connected to workspace: {WORKSPACE_NAME}")
    
    # Check and create CPU compute
    print("\n" + "=" * 50)
    print("CPU Compute (Step 0: Preprocessing)")
    print("=" * 50)
    cpu_compute = config.azure.compute_target_cpu
    
    if check_compute_exists(ml_client, cpu_compute):
        print(f"✓ {cpu_compute} already exists")
    else:
        create_cpu_compute(ml_client, cpu_compute)
    
    # Check and create GPU compute
    print("\n" + "=" * 50)
    print("GPU Compute (Steps 1-4: AI Models)")
    print("=" * 50)
    gpu_compute = config.azure.compute_target_gpu
    
    if check_compute_exists(ml_client, gpu_compute):
        print(f"✓ {gpu_compute} already exists")
    else:
        create_gpu_compute(ml_client, gpu_compute)
    
    # Summary
    print("\n" + "=" * 50)
    print("Setup Complete!")
    print("=" * 50)
    print(f"\nCompute targets:")
    print(f"  CPU: {cpu_compute}")
    print(f"  GPU: {gpu_compute}")
    print(f"\nYou can now run the pipeline with:")
    print(f"  make audio-pipeline")


if __name__ == "__main__":
    main()
