"""Step 4: Speaker Embedding Extraction."""

from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import sys
import time
import numpy as np
from collections import defaultdict

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.common.logging_utils import get_step_logger
from pipeline.common.file_utils import read_jsonl

logger = get_step_logger("speaker_embedding")


def extract_embeddings_mode_a(
    preprocess_dir: Path,
    diarization_segments: List[Dict[str, Any]],
    config,
    embedding_model,
    device: str = "cpu",
) -> Dict[str, Dict[str, Any]]:
    """
    Mode A: Extract clean-close-mic embeddings from track files.
    
    Args:
        preprocess_dir: Step 0 output directory with normalized tracks
        diarization_segments: Segments from Step 2
        config: Pipeline configuration
        embedding_model: SpeechBrain ECAPA model
        device: "cpu" or "cuda"
        
    Returns:
        Dictionary mapping speaker_id to embedding info
    """
    import soundfile as sf
    import torch
    
    logger.info("Mode A: Extracting clean-close-mic embeddings from tracks")
    
    normalized_tracks_dir = preprocess_dir / "normalized_tracks"
    if not normalized_tracks_dir.exists():
        raise FileNotFoundError(f"Normalized tracks directory not found: {normalized_tracks_dir}")
    
    # Group segments by speaker (track)
    speaker_segments = defaultdict(list)
    for seg in diarization_segments:
        speaker_id = seg["speaker_id"]
        speaker_segments[speaker_id].append(seg)
    
    logger.info(f"Found {len(speaker_segments)} speakers")
    
    # Extract embeddings per speaker
    speaker_embeddings = {}
    
    total_speakers = len(speaker_segments)
    progress_next = 10
    for idx, (speaker_id, segments) in enumerate(speaker_segments.items(), start=1):
        percent = int(idx * 100 / total_speakers) if total_speakers else 100
        # Get canonical name from TRACK_<name> format
        if not speaker_id.startswith("TRACK_"):
            logger.warning(f"Unexpected speaker_id format: {speaker_id}, skipping")
            continue
        
        canonical_name = speaker_id.replace("TRACK_", "")
        track_file = normalized_tracks_dir / f"{canonical_name}.flac"
        
        if not track_file.exists():
            logger.warning(f"Track file not found: {track_file}, skipping {speaker_id}")
            continue
        
        speaker_start = time.time()
        logger.info(
            f"Extracting embeddings for {speaker_id} "
            f"({len(segments)} segments, {idx}/{total_speakers}, {percent}%)"
        )
        
        # Select segments for embedding extraction
        # Use top_k longest segments for quality
        sorted_segments = sorted(segments, key=lambda s: s["end"] - s["start"], reverse=True)
        selected_segments = sorted_segments[:config.speaker_embedding.top_k_segments]
        
        embeddings_list = []
        total_duration = 0.0
        
        for seg in selected_segments:
            duration = seg["end"] - seg["start"]
            if duration < config.speaker_embedding.min_turn_duration_seconds:
                continue
            
            try:
                # Read audio segment
                start_sample = int(seg["start"] * 16000)
                end_sample = int(seg["end"] * 16000)
                
                audio, sr = sf.read(track_file, start=start_sample, stop=end_sample)
                
                if len(audio) < 1600:  # Skip very short segments
                    continue
                
                # Compute embedding
                audio_tensor = torch.from_numpy(audio).float().unsqueeze(0)
                with torch.no_grad():
                    embedding = embedding_model.encode_batch(audio_tensor)
                    embedding = embedding.squeeze().cpu().numpy()
                
                embeddings_list.append(embedding)
                total_duration += duration
                
            except Exception as e:
                logger.warning(f"Failed to extract embedding from segment {seg['segment_id']}: {e}")
                continue
        
        if not embeddings_list:
            logger.warning(f"No valid embeddings extracted for {speaker_id}")
            continue
        
        # Aggregate embeddings
        if config.speaker_embedding.aggregation == "mean":
            final_embedding = np.mean(embeddings_list, axis=0)
        elif config.speaker_embedding.aggregation == "median":
            final_embedding = np.median(embeddings_list, axis=0)
        else:
            final_embedding = np.mean(embeddings_list, axis=0)
        
        speaker_embeddings[speaker_id] = {
            "canonical_name": canonical_name,
            "embedding": final_embedding.tolist(),
            "source": "clean_close_mic",
            "duration_seconds": total_duration,
            "segment_count": len(embeddings_list),
        }
        
        logger.info(
            f"  ✓ {speaker_id}: {len(embeddings_list)} embeddings, "
            f"{total_duration:.1f}s in {time.time() - speaker_start:.1f}s"
        )
        if percent >= progress_next or idx == total_speakers:
            logger.info(f"Mode A embedding progress: {percent}% ({idx}/{total_speakers} speakers)")
            progress_next += 10
    
    return speaker_embeddings


def extract_embeddings_mode_b(
    preprocess_dir: Path,
    diarization_segments: List[Dict[str, Any]],
    config,
    embedding_model,
    device: str = "cpu",
) -> Dict[str, Dict[str, Any]]:
    """
    Mode B: Extract room-mix embeddings from mixed audio.
    
    Args:
        preprocess_dir: Step 0 output directory with normalized.flac
        diarization_segments: Segments from Step 2
        config: Pipeline configuration
        embedding_model: SpeechBrain ECAPA model
        device: "cpu" or "cuda"
        
    Returns:
        Dictionary mapping speaker_id to embedding info
    """
    import soundfile as sf
    import torch
    
    logger.info("Mode B: Extracting room-mix embeddings from mixed audio")
    
    normalized_audio = preprocess_dir / "normalized.flac"
    if not normalized_audio.exists():
        raise FileNotFoundError(f"Normalized audio not found: {normalized_audio}")
    
    # Group segments by speaker
    speaker_segments = defaultdict(list)
    for seg in diarization_segments:
        speaker_id = seg["speaker_id"]
        if speaker_id != "SPEAKER_UNKNOWN":
            speaker_segments[speaker_id].append(seg)
    
    logger.info(f"Found {len(speaker_segments)} identified speakers")
    
    # Extract embeddings per speaker
    speaker_embeddings = {}
    
    total_speakers = len(speaker_segments)
    progress_next = 10
    for idx, (speaker_id, segments) in enumerate(speaker_segments.items(), start=1):
        percent = int(idx * 100 / total_speakers) if total_speakers else 100
        speaker_start = time.time()
        logger.info(
            f"Extracting embeddings for {speaker_id} "
            f"({len(segments)} segments, {idx}/{total_speakers}, {percent}%)"
        )
        
        # Select segments for embedding extraction
        sorted_segments = sorted(segments, key=lambda s: s["end"] - s["start"], reverse=True)
        selected_segments = sorted_segments[:config.speaker_embedding.top_k_segments]
        
        embeddings_list = []
        total_duration = 0.0
        
        for seg in selected_segments:
            duration = seg["end"] - seg["start"]
            if duration < config.speaker_embedding.min_turn_duration_seconds:
                continue
            
            # Skip overlapping segments for cleaner embeddings
            if seg.get("overlap", False):
                continue
            
            try:
                # Read audio segment
                start_sample = int(seg["start"] * 16000)
                end_sample = int(seg["end"] * 16000)
                
                audio, sr = sf.read(normalized_audio, start=start_sample, stop=end_sample)
                
                if len(audio) < 1600:  # Skip very short segments
                    continue
                
                # Compute embedding
                audio_tensor = torch.from_numpy(audio).float().unsqueeze(0)
                with torch.no_grad():
                    embedding = embedding_model.encode_batch(audio_tensor)
                    embedding = embedding.squeeze().cpu().numpy()
                
                embeddings_list.append(embedding)
                total_duration += duration
                
            except Exception as e:
                logger.warning(f"Failed to extract embedding from segment {seg['segment_id']}: {e}")
                continue
        
        if not embeddings_list:
            logger.warning(f"No valid embeddings extracted for {speaker_id}")
            continue
        
        # Aggregate embeddings
        if config.speaker_embedding.aggregation == "mean":
            final_embedding = np.mean(embeddings_list, axis=0)
        elif config.speaker_embedding.aggregation == "median":
            final_embedding = np.median(embeddings_list, axis=0)
        else:
            final_embedding = np.mean(embeddings_list, axis=0)
        
        speaker_embeddings[speaker_id] = {
            "canonical_name": None,  # Will be assigned by matching
            "embedding": final_embedding.tolist(),
            "source": "room_mix",
            "duration_seconds": total_duration,
            "segment_count": len(embeddings_list),
        }
        
        logger.info(
            f"  ✓ {speaker_id}: {len(embeddings_list)} embeddings, "
            f"{total_duration:.1f}s in {time.time() - speaker_start:.1f}s"
        )
        if percent >= progress_next or idx == total_speakers:
            logger.info(f"Mode B embedding progress: {percent}% ({idx}/{total_speakers} speakers)")
            progress_next += 10
    
    return speaker_embeddings


def compute_embedding_stability(embeddings_list: List[np.ndarray], percentile: float = 0.10) -> float:
    """
    Compute embedding stability score (lower percentile of pairwise similarities).
    
    Args:
        embeddings_list: List of embedding vectors
        percentile: Percentile to use (0.0-1.0)
        
    Returns:
        Stability score (0.0-1.0)
    """
    if len(embeddings_list) < 2:
        return 1.0
    
    from sklearn.metrics.pairwise import cosine_similarity
    
    # Compute pairwise similarities
    similarities = []
    for i in range(len(embeddings_list)):
        for j in range(i + 1, len(embeddings_list)):
            sim = cosine_similarity([embeddings_list[i]], [embeddings_list[j]])[0, 0]
            similarities.append(sim)
    
    # Return lower percentile as stability score
    return float(np.percentile(similarities, percentile * 100))
