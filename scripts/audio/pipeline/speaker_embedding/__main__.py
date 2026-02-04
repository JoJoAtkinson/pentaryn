"""Step 4: Speaker Embeddings - Main Entry Point."""

from pathlib import Path
from typing import Dict, Any
import argparse
import sys
import time
import json

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.config import PipelineConfig
from pipeline.common.logging_utils import setup_logging, get_step_logger, format_elapsed_time
from pipeline.common.file_utils import write_jsonl, read_jsonl, ensure_dir, get_session_id_from_path, write_json
from pipeline.common.manifest_utils import build_manifest, should_skip, write_manifest
from pipeline.speaker_embedding.extract import (
    extract_embeddings_mode_a,
    extract_embeddings_mode_b,
)
from pipeline.speaker_embedding.match import (
    load_speaker_database,
    save_speaker_database,
    match_speakers_hungarian,
    update_database_mode_a,
    generate_database_delta_mode_b,
)

logger = get_step_logger("speaker_embedding")


def process_embeddings(
    preprocess_dir: Path,
    diarization_dir: Path,
    output_dir: Path,
    config: PipelineConfig,
    audio_mode: str,
    device: str = "cpu",
    session_id: str = None,
) -> dict:
    """
    Main processing function for speaker embeddings.
    
    Args:
        preprocess_dir: Step 0 output directory
        diarization_dir: Step 2 output directory
        output_dir: Output directory for this step
        config: Pipeline configuration
        audio_mode: "discord_multitrack" or "table_single_mic"
        device: "cpu" or "cuda"
        session_id: Session identifier
        
    Returns:
        Result dictionary with status and stats
    """
    step_start = time.time()
    # Load diarization segments
    diarization_path = diarization_dir / "diarization.jsonl"
    if not diarization_path.exists():
        raise FileNotFoundError(f"Diarization segments not found: {diarization_path}")
    
    diarization_segments = read_jsonl(diarization_path)
    logger.info(f"Loaded {len(diarization_segments)} diarization segments")
    
    # Load embedding model
    logger.info("Loading speaker embedding model...")
    try:
        import torch
        from speechbrain.pretrained import EncoderClassifier
        
        model_load_start = time.time()
        embedding_model = EncoderClassifier.from_hparams(
            source=config.speaker_embedding.model,
            savedir=f"models/{config.speaker_embedding.model.split('/')[-1]}",
            run_opts={"device": device}
        )
        logger.info(
            f"✓ Embedding model loaded (device: {device}) "
            f"in {(time.time() - model_load_start)/60:.2f} min"
        )
    except Exception as e:
        logger.error(f"Failed to load embedding model: {e}")
        raise
    
    # Extract embeddings based on mode
    extraction_start = time.time()
    if audio_mode == "discord_multitrack":
        logger.info("=" * 60)
        logger.info("Mode A: Clean-close-mic embeddings")
        logger.info("=" * 60)
        
        session_embeddings = extract_embeddings_mode_a(
            preprocess_dir=preprocess_dir,
            diarization_segments=diarization_segments,
            config=config,
            embedding_model=embedding_model,
            device=device,
        )
    else:  # table_single_mic
        logger.info("=" * 60)
        logger.info("Mode B: Room-mix embeddings")
        logger.info("=" * 60)
        
        session_embeddings = extract_embeddings_mode_b(
            preprocess_dir=preprocess_dir,
            diarization_segments=diarization_segments,
            config=config,
            embedding_model=embedding_model,
            device=device,
        )
    logger.info(
        f"✓ Embedding extraction complete in {format_elapsed_time(time.time() - extraction_start)}"
    )
    
    if not session_embeddings:
        logger.warning("No embeddings extracted, exiting")
        return {"status": "no_embeddings", "speakers": 0}
    
    logger.info(f"Extracted embeddings for {len(session_embeddings)} speakers")
    
    # Write embeddings
    embeddings_path = output_dir / "embeddings.jsonl"
    embeddings_list = []
    for speaker_id, emb_info in session_embeddings.items():
        embeddings_list.append({
            "session_id": session_id,
            "speaker_id": speaker_id,
            **emb_info
        })
    write_jsonl(embeddings_list, embeddings_path)
    logger.info(f"Wrote embeddings to {embeddings_path}")
    
    # Load speaker database
    db_path = Path(config.speaker_embedding.database_path)
    speaker_db = load_speaker_database(db_path)
    
    # Match speakers
    logger.info("=" * 60)
    logger.info("Matching speakers against database")
    logger.info("=" * 60)
    
    match_start = time.time()
    matches = match_speakers_hungarian(
        session_embeddings=session_embeddings,
        speaker_db=speaker_db,
        config=config,
    )
    logger.info(f"✓ Matching complete in {format_elapsed_time(time.time() - match_start)}")
    
    # Write matches
    matches_path = output_dir / "matches.json"
    write_json(matches, matches_path)
    logger.info(f"Wrote matches to {matches_path}")
    
    # Update database or generate delta
    if audio_mode == "discord_multitrack":
        logger.info("=" * 60)
        logger.info("Mode A: Auto-updating speaker database")
        logger.info("=" * 60)
        
        update_start = time.time()
        updated_db, update_log = update_database_mode_a(
            session_embeddings=session_embeddings,
            speaker_db=speaker_db,
            session_id=session_id,
            config=config,
        )
        
        # Save updated database
        save_speaker_database(updated_db, db_path)
        
        # Write update log
        log_path = output_dir / "database_update_log.txt"
        with open(log_path, "w") as f:
            f.write(f"Database Update Log - {session_id}\n")
            f.write("=" * 60 + "\n\n")
            for entry in update_log:
                f.write(entry + "\n")
        logger.info(f"Wrote update log to {log_path}")
        logger.info(f"Database updated with {len(update_log)} changes")
        logger.info(
            f"✓ Database update complete in {format_elapsed_time(time.time() - update_start)}"
        )
        
        db_action = "updated"
        
    else:  # table_single_mic
        logger.info("=" * 60)
        logger.info("Mode B: Generating database delta for manual review")
        logger.info("=" * 60)
        
        delta_start = time.time()
        delta_entries = generate_database_delta_mode_b(
            session_embeddings=session_embeddings,
            matches=matches,
            session_id=session_id,
            config=config,
        )
        
        # Write delta file
        delta_path = output_dir / "speaker_db_delta.json"
        with open(delta_path, "w") as f:
            json.dump(delta_entries, f, indent=2)
        logger.info(f"Wrote database delta to {delta_path}")
        logger.info(f"Generated {len(delta_entries)} proposed updates")
        logger.info("⚠️  Manual review required before applying database updates")
        logger.info(
            f"✓ Database delta generated in {format_elapsed_time(time.time() - delta_start)}"
        )
        
        db_action = "delta_generated"
    
    # Cleanup GPU memory
    if device == "cuda":
        import torch
        del embedding_model
        torch.cuda.empty_cache()
        logger.info("GPU memory cleared")
    
    # Compute summary statistics
    match_stats = {
        "confirmed": sum(1 for m in matches.values() if m["match_status"] == "confirmed"),
        "probable": sum(1 for m in matches.values() if m["match_status"] == "probable"),
        "unknown": sum(1 for m in matches.values() if m["match_status"] == "unknown"),
    }
    
    logger.info(
        f"✓ Speaker embedding step complete in {format_elapsed_time(time.time() - step_start)}"
    )
    return {
        "status": "success",
        "mode": audio_mode,
        "speakers": len(session_embeddings),
        "match_stats": match_stats,
        "database_action": db_action,
        "output": str(output_dir),
    }


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Step 4: Speaker Embeddings")
    parser.add_argument(
        "--preprocess",
        type=Path,
        required=True,
        help="Step 0 preprocess output directory",
    )
    parser.add_argument(
        "--diarization",
        type=Path,
        required=True,
        help="Step 2 diarization output directory",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output directory for embeddings and matches",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default="pipeline.config.toml",
        help="Pipeline configuration file",
    )
    parser.add_argument(
        "--audio-mode",
        choices=["discord_multitrack", "table_single_mic"],
        required=True,
        help="Audio mode",
    )
    parser.add_argument(
        "--device",
        choices=["cpu", "cuda"],
        default="cpu",
        help="Device for embedding model",
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
    
    # Ensure output directory
    ensure_dir(args.output)
    matches_path = args.output / "matches.json"

    # Get session ID
    session_id = get_session_id_from_path(args.diarization)

    diarization_path = args.diarization / "diarization.jsonl"
    if args.audio_mode == "discord_multitrack":
        tracks_dir = args.preprocess / "normalized_tracks"
        track_files = sorted(tracks_dir.glob(f"*.{config.preprocess.output_format}"))
        input_files = [diarization_path, *track_files]
    else:
        audio_file = args.preprocess / f"normalized.{config.preprocess.output_format}"
        input_files = [diarization_path, audio_file]

    manifest = build_manifest(
        step="speaker_embedding",
        session_id=session_id,
        input_files=input_files,
        config=config,
        extra={"audio_mode": args.audio_mode, "device": args.device},
    )

    if should_skip(args.output, manifest, [matches_path]):
        logger.info(f"✓ Existing speaker embedding output found (manifest match), skipping: {matches_path}")
        return
    
    # Log start
    logger.info("=" * 60)
    logger.info(f"STEP 4: SPEAKER EMBEDDINGS - {session_id}")
    logger.info("=" * 60)
    logger.info(f"Mode: {args.audio_mode}")
    logger.info(f"Preprocess: {args.preprocess}")
    logger.info(f"Diarization: {args.diarization}")
    logger.info(f"Output: {args.output}")
    
    start_time = time.time()
    
    try:
        result = process_embeddings(
            preprocess_dir=args.preprocess,
            diarization_dir=args.diarization,
            output_dir=args.output,
            config=config,
            audio_mode=args.audio_mode,
            device=args.device,
            session_id=session_id,
        )
        
        elapsed = time.time() - start_time
        logger.info("=" * 60)
        logger.info(f"✓ Speaker embeddings complete in {elapsed/60:.1f} minutes")
        logger.info(f"  Speakers: {result['speakers']}")
        logger.info(f"  Matches: confirmed={result['match_stats']['confirmed']}, "
                   f"probable={result['match_stats']['probable']}, "
                   f"unknown={result['match_stats']['unknown']}")
        logger.info(f"  Database: {result['database_action']}")
        logger.info(f"  Output: {result['output']}")
        logger.info("=" * 60)
        write_manifest(args.output, manifest)
        
    except Exception as e:
        logger.error(f"Speaker embedding extraction failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
