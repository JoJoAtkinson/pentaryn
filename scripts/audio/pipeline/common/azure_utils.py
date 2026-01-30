"""Azure ML utilities for job submission and management."""

from pathlib import Path
from typing import Optional, Dict, Any
import logging

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
