"""Logging utilities for pipeline steps."""

import logging
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Optional, Any


def setup_logging(
    level: str = "INFO",
    log_file: Optional[Path] = None,
    format_string: Optional[str] = None,
) -> logging.Logger:
    """
    Set up logging configuration.
    
    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR)
        log_file: Optional file to write logs to
        format_string: Custom format string
        
    Returns:
        Configured logger
    """
    if format_string is None:
        format_string = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Configure root logger
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format=format_string,
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    
    # Add file handler if specified
    if log_file:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(logging.Formatter(format_string))
        logging.getLogger().addHandler(file_handler)
    
    return logging.getLogger("pipeline")


def get_step_logger(step_name: str) -> logging.Logger:
    """Get logger for specific pipeline step."""
    return logging.getLogger(f"pipeline.{step_name}")


def format_elapsed_time(seconds: float) -> str:
    """
    Format elapsed time in HH:MM:SS or MM:SS format.
    
    Args:
        seconds: Elapsed time in seconds
        
    Returns:
        Formatted time string
    """
    seconds = max(0.0, float(seconds))
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


@contextmanager
def heartbeat(label: str, interval_seconds: float = 15.0) -> Any:
    """
    Periodically print a status line while a long operation runs.
    
    This is a lightweight alternative to a progress bar for libraries
    (like pyannote diarization) that don't report progress.
    
    Args:
        label: Description of the operation
        interval_seconds: How often to print status (seconds)
        
    Example:
        with heartbeat("Loading diarization model", interval_seconds=15):
            model = load_large_model()
    """
    if interval_seconds <= 0:
        yield
        return

    stop = threading.Event()
    start = time.monotonic()

    def _worker() -> None:
        while not stop.wait(interval_seconds):
            elapsed = time.monotonic() - start
            print(f"  ... {label} ({format_elapsed_time(elapsed)} elapsed)", flush=True)

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=0.5)
