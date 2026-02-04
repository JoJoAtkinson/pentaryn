#!/usr/bin/env python3
"""
Step 5: Post-Processing
Main entry point that runs both merge and validation.
"""

import argparse
import logging
import sys
import time
from pathlib import Path

from .merge import main as merge_main
from .validate import main as validate_main

logger = logging.getLogger(__name__)


def main():
    """Main entry point for post-processing."""
    parser = argparse.ArgumentParser(description="Step 5: Post-Processing")
    parser.add_argument(
        "--input-dir",
        type=Path,
        required=True,
        help="Input directory (contains transcription/, diarization/, etc.)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Output directory for merged.jsonl and validation report",
    )
    parser.add_argument(
        "--skip-emotion",
        action="store_true",
        help="Skip emotion merging",
    )
    parser.add_argument(
        "--skip-speaker-id",
        action="store_true",
        help="Skip speaker ID resolution",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip validation step",
    )
    args = parser.parse_args()
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    
    overall_start = time.time()
    logger.info("Starting post-processing...")
    
    # Step 1: Merge
    logger.info("=== Step 5a: Merge ===")
    merge_args = [
        "--input-dir", str(args.input_dir),
        "--output-dir", str(args.output_dir),
    ]
    if args.skip_emotion:
        merge_args.append("--skip-emotion")
    if args.skip_speaker_id:
        merge_args.append("--skip-speaker-id")
    
    # Temporarily replace sys.argv to call merge_main
    old_argv = sys.argv
    sys.argv = ["merge.py"] + merge_args
    try:
        merge_start = time.time()
        merge_main()
    finally:
        sys.argv = old_argv
    
    logger.info(f"Merge complete in {(time.time() - merge_start)/60:.2f} min")
    
    # Step 2: Validate
    if not args.skip_validation:
        logger.info("=== Step 5b: Validate ===")
        validate_args = [
            "--input-dir", str(args.output_dir),
            "--output-dir", str(args.output_dir),
        ]
        
        # Temporarily replace sys.argv to call validate_main
        old_argv = sys.argv
        sys.argv = ["validate.py"] + validate_args
        try:
            validate_start = time.time()
            validate_main()
        except SystemExit as e:
            # validate_main() calls exit(1) on validation failure
            if e.code != 0:
                logger.error("Validation failed")
                sys.exit(1)
        finally:
            sys.argv = old_argv
        
        logger.info(f"Validation complete in {(time.time() - validate_start)/60:.2f} min")
    
    logger.info(f"Post-processing complete in {(time.time() - overall_start)/60:.2f} min")


if __name__ == "__main__":
    main()
