"""Step 2: Speaker Diarization with cross-chunk linking."""

from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import argparse
import sys
import time
import numpy as np
from collections import defaultdict

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.config import PipelineConfig
from pipeline.common.logging_utils import setup_logging, get_step_logger
from pipeline.common.file_utils import write_jsonl, read_jsonl, ensure_dir, get_session_id_from_path
from pipeline.common.audio_utils import get_audio_duration, configure_torch_safe_globals
from pipeline.common.manifest_utils import build_manifest, should_skip, write_manifest

logger = get_step_logger("diarization")


def detect_overlaps(segments: List[Dict[str, Any]], overlap_threshold: float = 0.5) -> List[Dict[str, Any]]:
    """
    Detect overlapping speakers in segments.
    
    Args:
        segments: List of segments with start/end times
        overlap_threshold: Minimum overlap to flag (seconds)
        
    Returns:
        Segments with overlap flags and overlap_speakers list
    """
    for i, seg in enumerate(segments):
        seg["overlap"] = False
        seg["overlap_speakers"] = []
        
        seg_start = seg["start"]
        seg_end = seg["end"]
        seg_speaker = seg["speaker_id"]
        
        # Check for overlaps with other segments
        for j, other in enumerate(segments):
            if i == j:
                continue
            
            other_start = other["start"]
            other_end = other["end"]
            other_speaker = other["speaker_id"]
            
            # Calculate overlap duration
            overlap_start = max(seg_start, other_start)
            overlap_end = min(seg_end, other_end)
            overlap_duration = max(0, overlap_end - overlap_start)
            
            if overlap_duration >= overlap_threshold and seg_speaker != other_speaker:
                seg["overlap"] = True
                if other_speaker not in seg["overlap_speakers"]:
                    seg["overlap_speakers"].append(other_speaker)
    
    return segments


def process_mode_a(
    transcription_dir: Path,
    output_dir: Path,
    config: PipelineConfig,
) -> dict:
    """
    Mode A: Track-based adapter (no ML).
    
    Builds diarization.jsonl from track segments without running ML models.
    Speaker ID is derived from track filename (TRACK_<canonical_name>).
    
    Args:
        transcription_dir: Step 1 output directory
        output_dir: Output directory for this step
        config: Pipeline configuration
        
    Returns:
        Result dictionary with status and stats
    """
    logger.info("Mode A: Track-based diarization adapter")
    mode_start = time.time()
    
    # Load transcription segments
    raw_segments_path = transcription_dir / "raw_segments.jsonl"
    if not raw_segments_path.exists():
        raise FileNotFoundError(f"Transcription segments not found: {raw_segments_path}")
    
    raw_segments = read_jsonl(raw_segments_path)
    logger.info(f"Loaded {len(raw_segments)} transcription segments")
    
    # Build diarization segments from tracks
    diarization_segments = []
    speaker_stats = defaultdict(lambda: {"segments": 0, "duration": 0.0})
    
    for i, seg in enumerate(raw_segments):
        track_name = seg.get("track")
        if not track_name:
            logger.warning(f"Segment {i} missing track name, skipping")
            continue
        
        # Normalize track name to canonical form
        canonical_name = normalize_name(track_name, config.naming)
        speaker_id = f"TRACK_{canonical_name}"
        
        diarization_seg = {
            "segment_id": i,
            "speaker_id": speaker_id,
            "chunk_label": speaker_id,  # Same as speaker_id for Mode A
            "chunk_id": seg.get("chunk_id"),
            "start": seg["start"],
            "end": seg["end"],
            "overlap": False,  # Will be computed later
            "overlap_speakers": [],
        }
        
        diarization_segments.append(diarization_seg)
        
        # Update stats
        duration = seg["end"] - seg["start"]
        speaker_stats[speaker_id]["segments"] += 1
        speaker_stats[speaker_id]["duration"] += duration
    
    # Detect overlaps between tracks
    overlap_start = time.time()
    diarization_segments = detect_overlaps(diarization_segments, config.diarization.overlap_threshold)
    logger.info(f"Overlap detection complete in {(time.time() - overlap_start)/60:.2f} min")
    
    # Write outputs
    output_path = output_dir / "diarization.jsonl"
    write_jsonl(diarization_segments, output_path)
    logger.info(f"Wrote {len(diarization_segments)} diarization segments to {output_path}")
    
    # Write speaker stats
    stats_path = output_dir / "speaker_stats.json"
    import json
    with open(stats_path, "w") as f:
        json.dump(dict(speaker_stats), f, indent=2)
    logger.info(f"Wrote speaker statistics to {stats_path}")
    logger.info(f"✓ Mode A diarization complete in {(time.time() - mode_start)/60:.2f} min")
    
    return {
        "status": "success",
        "mode": "discord_multitrack",
        "segments": len(diarization_segments),
        "speakers": len(speaker_stats),
        "output": str(output_path),
    }


def normalize_name(name: str, naming_config) -> str:
    """Normalize speaker name according to config."""
    import re
    
    # Apply case
    if naming_config.canonical_name_case == "lower":
        name = name.lower()
    elif naming_config.canonical_name_case == "upper":
        name = name.upper()
    
    # Replace spaces and underscores
    if naming_config.replace_spaces_with:
        name = name.replace(" ", naming_config.replace_spaces_with)
    if naming_config.replace_underscores_with:
        name = name.replace("_", naming_config.replace_underscores_with)
    
    # Strip non-alphanumeric
    if naming_config.strip_non_alnum:
        name = re.sub(r"[^a-zA-Z0-9-]", "", name)
    
    return name


def process_mode_b(
    transcription_dir: Path,
    normalized_audio_path: Path,
    output_dir: Path,
    config: PipelineConfig,
    device: str = "cpu",
) -> dict:
    """
    Mode B: ML-based diarization with cross-chunk linking.
    
    Runs pyannote.audio diarization on normalized mixed audio,
    performs cross-chunk speaker linking via embeddings,
    and assigns session-stable speaker IDs.
    
    Args:
        transcription_dir: Step 1 output directory
        normalized_audio_path: Normalized audio file from Step 0
        output_dir: Output directory for this step
        config: Pipeline configuration
        device: "cpu" or "cuda"
        
    Returns:
        Result dictionary with status and stats
    """
    logger.info("Mode B: ML-based diarization with cross-chunk linking")
    
    # Configure PyTorch safe globals for pyannote models
    configure_torch_safe_globals()
    
    # Load transcription segments
    raw_segments_path = transcription_dir / "raw_segments.jsonl"
    if not raw_segments_path.exists():
        raise FileNotFoundError(f"Transcription segments not found: {raw_segments_path}")
    
    raw_segments = read_jsonl(raw_segments_path)
    logger.info(f"Loaded {len(raw_segments)} transcription segments")
    
    # Check for chunked transcription
    chunk_info_path = transcription_dir / "chunk_info.json"
    chunked = chunk_info_path.exists()
    
    if chunked:
        logger.info("Detected chunked transcription, will perform cross-chunk linking")
        import json
        with open(chunk_info_path) as f:
            chunk_info = json.load(f)
        num_chunks = len(chunk_info["chunks"])
        logger.info(f"Processing {num_chunks} chunks")
    else:
        logger.info("Single audio file (no chunking)")
        num_chunks = 1
        chunk_info = None
    
    # Import ML dependencies
    try:
        import torch
        from pyannote.audio import Pipeline as DiarizationPipeline
        import speechbrain
        from speechbrain.pretrained import EncoderClassifier
    except ImportError as e:
        logger.error(f"Missing ML dependencies: {e}")
        logger.error("Install with: pip install pyannote.audio speechbrain")
        raise
    
    # Load HF token from config
    hf_token = config.azure.hf_auth_token
    if not hf_token:
        raise ValueError("HF_AUTH_TOKEN required for diarization. Set in .env or environment.")
    
    # Load diarization model
    logger.info(f"Loading diarization model: {config.diarization.model}")
    diarization_load_start = time.time()
    try:
        diarization_pipeline = DiarizationPipeline.from_pretrained(
            config.diarization.model,
            use_auth_token=hf_token,
        )
        diarization_pipeline.to(torch.device(device))
    except Exception as e:
        logger.error(f"Failed to load diarization model: {e}")
        logger.error("Ensure you've accepted model terms at:")
        logger.error("  - https://huggingface.co/pyannote/speaker-diarization-3.1")
        logger.error("  - https://huggingface.co/pyannote/segmentation-3.0")
        raise
    
    logger.info(
        f"✓ Diarization model loaded (device: {device}) "
        f"in {(time.time() - diarization_load_start)/60:.2f} min"
    )
    
    # Load speaker embedding model for cross-chunk linking
    logger.info("Loading speaker embedding model for cross-chunk linking...")
    embedding_load_start = time.time()
    embedding_model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir="models/spkrec-ecapa-voxceleb",
        run_opts={"device": device}
    )
    logger.info(
        f"✓ Embedding model loaded in {(time.time() - embedding_load_start)/60:.2f} min"
    )
    
    # Run diarization
    logger.info(f"Running diarization on {normalized_audio_path}")
    diarization_params = {
        "min_speakers": config.diarization.min_speakers,
        "max_speakers": config.diarization.max_speakers,
    }
    
    diarization_start = time.time()
    diarization_result = diarization_pipeline(
        str(normalized_audio_path),
        **diarization_params
    )
    
    logger.info(f"✓ Diarization complete in {(time.time() - diarization_start)/60:.2f} min")
    
    # Extract diarization turns
    turns = []
    for segment, _, label in diarization_result.itertracks(yield_label=True):
        turns.append({
            "start": float(segment.start),
            "end": float(segment.end),
            "speaker": str(label),
        })
    
    logger.info(f"Extracted {len(turns)} speaker turns")
    
    # If chunked, perform cross-chunk linking
    if chunked:
        logger.info("Performing cross-chunk speaker linking...")
        linking_start = time.time()
        turns = link_speakers_across_chunks(
            turns=turns,
            chunk_info=chunk_info,
            normalized_audio_path=normalized_audio_path,
            embedding_model=embedding_model,
            config=config,
        )
        logger.info(
            f"✓ Cross-chunk linking complete in {(time.time() - linking_start)/60:.2f} min"
        )
    
    # Assign primary speaker to each transcription segment
    logger.info("Aligning diarization to transcription segments...")
    align_start = time.time()
    diarization_segments = align_diarization_to_segments(
        transcription_segments=raw_segments,
        diarization_turns=turns,
        overlap_threshold=config.diarization.overlap_threshold,
    )
    logger.info(f"✓ Alignment complete in {(time.time() - align_start)/60:.2f} min")
    
    # Compute speaker statistics
    speaker_stats = defaultdict(lambda: {"segments": 0, "duration": 0.0})
    for seg in diarization_segments:
        speaker_id = seg["speaker_id"]
        duration = seg["end"] - seg["start"]
        speaker_stats[speaker_id]["segments"] += 1
        speaker_stats[speaker_id]["duration"] += duration
    
    # Write outputs
    output_path = output_dir / "diarization.jsonl"
    write_jsonl(diarization_segments, output_path)
    logger.info(f"Wrote {len(diarization_segments)} diarization segments to {output_path}")
    
    stats_path = output_dir / "speaker_stats.json"
    import json
    with open(stats_path, "w") as f:
        json.dump(dict(speaker_stats), f, indent=2)
    logger.info(f"Wrote speaker statistics to {stats_path}")
    
    # Cleanup GPU memory
    if device == "cuda":
        del diarization_pipeline
        del embedding_model
        torch.cuda.empty_cache()
        logger.info("GPU memory cleared")
    
    return {
        "status": "success",
        "mode": "table_single_mic",
        "segments": len(diarization_segments),
        "speakers": len(speaker_stats),
        "chunked": chunked,
        "output": str(output_path),
    }


def link_speakers_across_chunks(
    turns: List[Dict[str, Any]],
    chunk_info: Dict[str, Any],
    normalized_audio_path: Path,
    embedding_model,
    config: PipelineConfig,
) -> List[Dict[str, Any]]:
    """
    Link speakers across chunks using embeddings and clustering.
    
    Args:
        turns: List of diarization turns with chunk-local speaker labels
        chunk_info: Chunk metadata from transcription
        normalized_audio_path: Path to normalized audio file
        embedding_model: SpeechBrain embedding model
        config: Pipeline configuration
        
    Returns:
        Turns with session-stable speaker IDs
    """
    import torch
    import soundfile as sf
    from scipy.cluster.hierarchy import linkage, fcluster
    from scipy.spatial.distance import pdist, squareform
    
    # Group turns by chunk
    chunks = chunk_info["chunks"]
    overlap_window = config.diarization.overlap_window_seconds
    
    # Extract embeddings for each chunk speaker
    logger.info("Extracting speaker embeddings for cross-chunk linking...")
    chunk_speaker_embeddings = defaultdict(list)
    
    for chunk_idx, chunk in enumerate(chunks):
        chunk_start = chunk["start"]
        chunk_end = chunk["end"]
        
        # Get turns in this chunk
        chunk_turns = [t for t in turns if chunk_start <= t["start"] < chunk_end]
        
        # Group turns by speaker label
        speaker_turns = defaultdict(list)
        for turn in chunk_turns:
            speaker_turns[turn["speaker"]].append(turn)
        
        # Extract embeddings for each speaker in overlap windows
        for speaker, speaker_turn_list in speaker_turns.items():
            # Focus on overlap regions for better linking
            overlap_turns = [
                t for t in speaker_turn_list
                if (chunk_start <= t["start"] < chunk_start + overlap_window or
                    chunk_end - overlap_window <= t["end"] <= chunk_end)
            ]
            
            if not overlap_turns:
                overlap_turns = speaker_turn_list[:3]  # Fallback to first few turns
            
            # Extract audio and compute embedding
            for turn in overlap_turns[:3]:  # Limit to 3 turns per speaker
                try:
                    audio, sr = sf.read(
                        str(normalized_audio_path),
                        start=int(turn["start"] * 16000),
                        stop=int(turn["end"] * 16000),
                    )
                    
                    if len(audio) < 1600:  # Skip very short segments
                        continue
                    
                    # Compute embedding
                    audio_tensor = torch.from_numpy(audio).float().unsqueeze(0)
                    with torch.no_grad():
                        embedding = embedding_model.encode_batch(audio_tensor)
                        embedding = embedding.squeeze().cpu().numpy()
                    
                    chunk_speaker_embeddings[(chunk_idx, speaker)].append(embedding)
                
                except Exception as e:
                    logger.warning(f"Failed to extract embedding for chunk {chunk_idx}, speaker {speaker}: {e}")
                    continue
    
    # Average embeddings per chunk speaker
    chunk_speaker_centroids = {}
    for (chunk_idx, speaker), embeddings in chunk_speaker_embeddings.items():
        if embeddings:
            chunk_speaker_centroids[(chunk_idx, speaker)] = np.mean(embeddings, axis=0)
    
    logger.info(f"Extracted centroids for {len(chunk_speaker_centroids)} chunk speakers")
    
    # Build similarity matrix and cluster
    if len(chunk_speaker_centroids) <= 1:
        # No linking needed
        logger.info("Only one chunk speaker, no cross-chunk linking needed")
        return turns
    
    keys = list(chunk_speaker_centroids.keys())
    centroids = np.array([chunk_speaker_centroids[k] for k in keys])
    
    # Compute cosine similarity
    from sklearn.metrics.pairwise import cosine_similarity
    similarity_matrix = cosine_similarity(centroids)
    distance_matrix = 1 - similarity_matrix
    
    # Hierarchical clustering
    condensed_distances = squareform(distance_matrix, checks=False)
    linkage_matrix = linkage(condensed_distances, method=config.diarization.cross_chunk_linkage)
    
    # Cut dendrogram at threshold
    threshold_distance = 1 - config.diarization.cross_chunk_threshold
    cluster_labels = fcluster(linkage_matrix, threshold_distance, criterion='distance')
    
    # Build mapping from (chunk_idx, speaker) to session speaker ID
    chunk_speaker_to_session = {}
    for i, key in enumerate(keys):
        session_speaker_id = f"SPEAKER_{cluster_labels[i]:02d}"
        chunk_speaker_to_session[key] = session_speaker_id
    
    logger.info(f"Clustered into {len(set(cluster_labels))} session speakers")
    
    # Apply mapping to turns
    for turn in turns:
        # Find which chunk this turn belongs to
        for chunk_idx, chunk in enumerate(chunks):
            if chunk["start"] <= turn["start"] < chunk["end"]:
                chunk_local_speaker = turn["speaker"]
                key = (chunk_idx, chunk_local_speaker)
                turn["chunk_label"] = chunk_local_speaker
                turn["chunk_id"] = chunk_idx
                turn["speaker"] = chunk_speaker_to_session.get(key, f"SPEAKER_UNKNOWN")
                break
    
    return turns


def align_diarization_to_segments(
    transcription_segments: List[Dict[str, Any]],
    diarization_turns: List[Dict[str, Any]],
    overlap_threshold: float = 0.5,
) -> List[Dict[str, Any]]:
    """
    Align diarization speaker labels to transcription segments.
    
    Assigns primary speaker based on maximum overlap duration.
    
    Args:
        transcription_segments: Segments from Step 1
        diarization_turns: Speaker turns from diarization
        overlap_threshold: Minimum overlap to flag (seconds)
        
    Returns:
        Aligned segments with speaker_id and overlap info
    """
    def compute_overlap(seg_start, seg_end, turn_start, turn_end):
        """Compute overlap duration between segment and turn."""
        overlap_start = max(seg_start, turn_start)
        overlap_end = min(seg_end, turn_end)
        return max(0, overlap_end - overlap_start)
    
    aligned_segments = []
    
    for i, seg in enumerate(transcription_segments):
        seg_start = seg["start"]
        seg_end = seg["end"]
        
        # Find speaker with maximum overlap
        best_speaker = "SPEAKER_UNKNOWN"
        best_overlap = 0.0
        overlapping_speakers = defaultdict(float)
        
        for turn in diarization_turns:
            overlap_duration = compute_overlap(seg_start, seg_end, turn["start"], turn["end"])
            if overlap_duration > 0:
                speaker = turn["speaker"]
                overlapping_speakers[speaker] += overlap_duration
                
                if overlap_duration > best_overlap:
                    best_overlap = overlap_duration
                    best_speaker = speaker
        
        # Build aligned segment
        aligned_seg = {
            "segment_id": i,
            "speaker_id": best_speaker,
            "chunk_label": turn.get("chunk_label", best_speaker),
            "chunk_id": seg.get("chunk_id"),
            "start": seg_start,
            "end": seg_end,
            "overlap": len(overlapping_speakers) > 1,
            "overlap_speakers": [s for s in overlapping_speakers.keys() if s != best_speaker],
        }
        
        aligned_segments.append(aligned_seg)
    
    return aligned_segments


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Step 2: Speaker Diarization")
    parser.add_argument(
        "--transcription",
        type=Path,
        required=True,
        help="Step 1 transcription output directory",
    )
    parser.add_argument(
        "--audio",
        type=Path,
        help="Normalized audio file from Step 0 (Mode B only)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output directory for diarization results",
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
        help="Device for ML models (Mode B only)",
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
    output_file = args.output / "diarization.jsonl"
    transcription_file = args.transcription / "raw_segments.jsonl"

    input_files = [transcription_file]
    if args.audio_mode == "table_single_mic" and args.audio:
        input_files.append(args.audio)

    manifest = build_manifest(
        step="diarization",
        session_id=get_session_id_from_path(args.transcription),
        input_files=input_files,
        config=config,
        extra={"audio_mode": args.audio_mode, "device": args.device},
    )

    if should_skip(args.output, manifest, [output_file]):
        logger.info(f"✓ Existing diarization found (manifest match), skipping: {output_file}")
        return
    
    # Log start
    session_id = get_session_id_from_path(args.transcription)
    logger.info("=" * 60)
    logger.info(f"STEP 2: DIARIZATION - {session_id}")
    logger.info("=" * 60)
    logger.info(f"Mode: {args.audio_mode}")
    logger.info(f"Transcription: {args.transcription}")
    logger.info(f"Output: {args.output}")
    
    start_time = time.time()
    
    try:
        if args.audio_mode == "discord_multitrack":
            result = process_mode_a(
                transcription_dir=args.transcription,
                output_dir=args.output,
                config=config,
            )
        else:  # table_single_mic
            if not args.audio:
                raise ValueError("--audio required for Mode B (table_single_mic)")
            
            result = process_mode_b(
                transcription_dir=args.transcription,
                normalized_audio_path=args.audio,
                output_dir=args.output,
                config=config,
                device=args.device,
            )
        
        elapsed = time.time() - start_time
        logger.info("=" * 60)
        logger.info(f"✓ Diarization complete in {elapsed/60:.1f} minutes")
        logger.info(f"  Segments: {result['segments']}")
        logger.info(f"  Speakers: {result['speakers']}")
        logger.info(f"  Output: {result['output']}")
        logger.info("=" * 60)
        write_manifest(args.output, manifest)
        
    except Exception as e:
        logger.error(f"Diarization failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
