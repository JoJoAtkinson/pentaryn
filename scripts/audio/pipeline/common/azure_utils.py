"""Azure ML utilities for job submission and management."""

from pathlib import Path
from typing import Optional, Dict, Any
import logging
import sys

logger = logging.getLogger(__name__)


def get_ml_client():
    """Get authenticated Azure ML client."""
    try:
        from azure.ai.ml import MLClient
        from azure.identity import DefaultAzureCredential
        from ..config import PipelineConfig
        
        # Load config to get Azure settings
        config = PipelineConfig.from_file("pipeline.config.toml")
        
        credential = DefaultAzureCredential()
        client = MLClient(
            credential=credential,
            subscription_id=config.azure.subscription_id,
            resource_group_name=config.azure.resource_group,
            workspace_name=config.azure.workspace_name,
        )
        
        return client
    except ImportError:
        logger.warning("Azure ML SDK not installed. Install with: pip install azure-ai-ml")
        return None
    except Exception as e:
        logger.error(f"Failed to create Azure ML client: {e}")
        return None


def submit_job(
    client,
    job_config: Dict[str, Any],
    wait: bool = False,
) -> Optional[Any]:
    """
    Submit a job to Azure ML.
    
    Args:
        client: Azure ML client
        job_config: Job configuration dictionary
        wait: Wait for job completion
        
    Returns:
        Job object if successful, None otherwise
    """
    if client is None:
        logger.error("Azure ML client not available")
        return None
    
    try:
        job = client.jobs.create_or_update(job_config)
        logger.info(f"Submitted job: {job.name}")
        
        if wait:
            logger.info("Waiting for job completion...")
            client.jobs.stream(job.name)
        
        return job
    except Exception as e:
        logger.error(f"Failed to submit job: {e}")
        return None


def download_job_output(
    client,
    job_name: str,
    output_name: str,
    download_path: Path,
) -> bool:
    """
    Download output from completed Azure ML job.
    
    Args:
        client: Azure ML client
        job_name: Job name
        output_name: Name of the output to download
        download_path: Local path to download to
        
    Returns:
        True if successful, False otherwise
    """
    if client is None:
        logger.error("Azure ML client not available")
        return False
    
    try:
        download_path.mkdir(parents=True, exist_ok=True)
        client.jobs.download(
            name=job_name,
            output_name=output_name,
            download_path=str(download_path),
        )
        logger.info(f"Downloaded output to {download_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to download job output: {e}")
        return False


def validate_cuda_environment() -> bool:
    """
    Validate CUDA is available and working for GPU jobs.
    Exits with error code 1 if validation fails.
    
    Returns:
        True if CUDA is available and working
    """
    try:
        import torch
    except ImportError:
        print("ERROR: PyTorch not installed!", file=sys.stderr)
        sys.exit(1)
    
    print("="*60)
    print("CUDA Validation")
    print("="*60)
    
    if not torch.cuda.is_available():
        print("ERROR: CUDA is not available!", file=sys.stderr)
        print("This job requires GPU/CUDA support.", file=sys.stderr)
        print("torch.cuda.is_available() returned False", file=sys.stderr)
        print("\nPossible causes:", file=sys.stderr)
        print("  - GPU compute not allocated", file=sys.stderr)
        print("  - PyTorch CPU-only version installed", file=sys.stderr)
        print("  - CUDA drivers not installed", file=sys.stderr)
        sys.exit(1)
    
    print(f"✓ CUDA is available")
    print(f"✓ CUDA version: {torch.version.cuda}")
    print(f"✓ GPU count: {torch.cuda.device_count()}")
    
    for i in range(torch.cuda.device_count()):
        props = torch.cuda.get_device_properties(i)
        print(f"✓ GPU {i}: {props.name}")
        print(f"  - VRAM: {props.total_memory / 1024**3:.1f} GB")
        print(f"  - Compute capability: {props.major}.{props.minor}")
    
    # Test CUDA with a simple tensor operation
    try:
        test_tensor = torch.randn(100, 100).cuda()
        result = test_tensor @ test_tensor.t()
        print(f"✓ CUDA tensor operations working")
        del test_tensor, result
        torch.cuda.empty_cache()
    except Exception as e:
        print(f"ERROR: CUDA tensor test failed: {e}", file=sys.stderr)
        sys.exit(1)
    
    print("="*60)
    print()
    return True
