"""Pipeline orchestrator for sequential step execution."""

from pathlib import Path
from typing import Optional
import argparse
import sys
import time

sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.config import PipelineConfig
from pipeline.common.logging_utils import setup_logging, get_step_logger
from pipeline.common.file_utils import get_session_id_from_path, ensure_dir


logger = get_step_logger("orchestrator")


class PipelineOrchestrator:
    """Orchestrate pipeline execution across steps."""
    
    def __init__(self, config: PipelineConfig):
        """Initialize orchestrator with configuration."""
        self.config = config
    
    def run_step_0(self, audio_path: Path, output_base: Path, audio_mode: str) -> dict:
        """Run Step 0: Preprocess."""
        from pipeline.preprocess.normalize import preprocess
        
        logger.info("=" * 60)
        logger.info("STEP 0: PREPROCESS / NORMALIZE")
        logger.info("=" * 60)
        
        output_dir = output_base / "preprocess"
        
        result = preprocess(
            audio_path=audio_path,
            output_dir=output_dir,
            config=self.config,
            audio_mode=audio_mode,
        )
        
        logger.info(f"✓ Step 0 complete: {result['status']}")
        return result
    
    def run_step_1(self, output_base: Path, audio_mode: str, device: str = "cpu") -> dict:
        """Run Step 1: Transcription."""
        from pipeline.transcription.transcribe import transcribe
        
        logger.info("=" * 60)
        logger.info("STEP 1: TRANSCRIPTION")
        logger.info("=" * 60)
        
        input_dir = output_base / "preprocess"
        output_dir = output_base / "transcription"
        
        result = transcribe(
            audio_path=input_dir,
            output_dir=output_dir,
            config=self.config,
            audio_mode=audio_mode,
            device=device,
        )
        
        logger.info(f"✓ Step 1 complete: {result['status']}")
        return result
    
    def run_step_2(self, output_base: Path, audio_mode: str) -> dict:
        """Run Step 2: Diarization (stub)."""
        logger.info("=" * 60)
        logger.info("STEP 2: DIARIZATION")
        logger.info("=" * 60)
        logger.warning("Step 2 not yet implemented - skipping")
        
        return {"status": "skipped", "reason": "not_implemented"}
    
    def run_step_3(self, output_base: Path) -> dict:
        """Run Step 3: Emotion Analysis (stub)."""
        logger.info("=" * 60)
        logger.info("STEP 3: EMOTION ANALYSIS")
        logger.info("=" * 60)
        logger.warning("Step 3 not yet implemented - skipping")
        
        return {"status": "skipped", "reason": "not_implemented"}
    
    def run_step_4(self, output_base: Path, audio_mode: str) -> dict:
        """Run Step 4: Speaker Embeddings (stub)."""
        logger.info("=" * 60)
        logger.info("STEP 4: SPEAKER EMBEDDINGS")
        logger.info("=" * 60)
        logger.warning("Step 4 not yet implemented - skipping")
        
        return {"status": "skipped", "reason": "not_implemented"}
    
    def run_step_5(self, output_base: Path, audio_mode: str) -> dict:
        """Run Step 5: Post-processing (stub)."""
        logger.info("=" * 60)
        logger.info("STEP 5: POST-PROCESSING")
        logger.info("=" * 60)
        logger.warning("Step 5 not yet implemented - skipping")
        
        return {"status": "skipped", "reason": "not_implemented"}
    
    def run_pipeline(
        self,
        audio_path: Path,
        output_base: Path,
        audio_mode: str = "auto",
        device: str = "cpu",
        steps: Optional[list] = None,
    ) -> dict:
        """
        Run complete pipeline.
        
        Args:
            audio_path: Path to audio file or tracks directory
            output_base: Base output directory
            audio_mode: Audio mode ("auto", "discord_multitrack", "table_single_mic")
            device: Device for GPU steps ("cpu" or "cuda")
            steps: List of steps to run (None = all)
            
        Returns:
            Dictionary with results for each step
        """
        start_time = time.time()
        
        # Detect audio mode if auto
        if audio_mode == "auto":
            audio_mode = "discord_multitrack" if audio_path.is_dir() else "table_single_mic"
        
        logger.info(f"Starting pipeline: {audio_path.name}")
        logger.info(f"Audio mode: {audio_mode}")
        logger.info(f"Output directory: {output_base}")
        
        results = {}
        
        # Define all steps
        all_steps = [
            (0, lambda: self.run_step_0(audio_path, output_base, audio_mode)),
            (1, lambda: self.run_step_1(output_base, audio_mode, device)),
            (2, lambda: self.run_step_2(output_base, audio_mode)),
            (3, lambda: self.run_step_3(output_base)),
            (4, lambda: self.run_step_4(output_base, audio_mode)),
            (5, lambda: self.run_step_5(output_base, audio_mode)),
        ]
        
        # Filter steps if specified
        if steps:
            all_steps = [(num, fn) for num, fn in all_steps if num in steps]
        
        # Run each step
        for step_num, step_fn in all_steps:
            try:
                result = step_fn()
                results[f"step_{step_num}"] = result
            except Exception as e:
                logger.error(f"Step {step_num} failed: {e}", exc_info=True)
                results[f"step_{step_num}"] = {"status": "error", "error": str(e)}
                
                # Decide whether to continue or abort
                if step_num in [0, 1]:  # Critical steps
                    logger.error("Critical step failed, aborting pipeline")
                    break
        
        elapsed = time.time() - start_time
        logger.info("=" * 60)
        logger.info(f"PIPELINE COMPLETE in {elapsed:.2f}s")
        logger.info("=" * 60)
        
        return results


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Audio Processing Pipeline Orchestrator"
    )
    parser.add_argument(
        "--audio",
        type=Path,
        required=True,
        help="Path to audio file or tracks directory",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default="scripts/audio/pipeline.config.toml",
        help="Path to pipeline configuration file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output base directory (default: .output/<session_id>)",
    )
    parser.add_argument(
        "--audio-mode",
        choices=["auto", "discord_multitrack", "table_single_mic"],
        default="auto",
        help="Audio mode (auto-detect if not specified)",
    )
    parser.add_argument(
        "--device",
        choices=["cpu", "cuda"],
        default="cpu",
        help="Device for GPU steps",
    )
    parser.add_argument(
        "--steps",
        type=int,
        nargs="+",
        help="Run specific steps only (e.g., --steps 0 1 2)",
    )
    parser.add_argument(
        "--mode",
        choices=["local", "azure"],
        default="local",
        help="Execution mode (local or Azure ML)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(level=args.log_level)
    
    # Load config
    config = PipelineConfig.from_file(args.config)
    
    # Determine output directory
    if args.output:
        output_base = args.output
    else:
        session_id = get_session_id_from_path(args.audio)
        output_base = Path(config.pipeline.default_output_dir) / session_id
    
    ensure_dir(output_base)
    
    # Run pipeline
    if args.mode == "azure":
        logger.error("Azure ML mode not yet implemented")
        sys.exit(1)
    
    orchestrator = PipelineOrchestrator(config)
    
    try:
        results = orchestrator.run_pipeline(
            audio_path=args.audio,
            output_base=output_base,
            audio_mode=args.audio_mode,
            device=args.device,
            steps=args.steps,
        )
        
        # Print summary
        logger.info("\nPipeline Results:")
        for step, result in results.items():
            status = result.get("status", "unknown")
            logger.info(f"  {step}: {status}")
        
    except Exception as e:
        logger.error(f"Pipeline failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
