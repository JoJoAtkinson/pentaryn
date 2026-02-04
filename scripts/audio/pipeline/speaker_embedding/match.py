"""Step 4: Speaker Matching and Database Management."""

from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import sys
import json
import numpy as np
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.common.logging_utils import get_step_logger
from pipeline.common.file_utils import ensure_dir

logger = get_step_logger("speaker_matching")


def load_speaker_database(db_path: Path) -> Dict[str, Any]:
    """Load speaker embedding database."""
    if not db_path.exists():
        logger.warning(f"Database not found: {db_path}, creating empty database")
        return {}
    
    try:
        with open(db_path) as f:
            db = json.load(f)
        logger.info(f"Loaded speaker database with {len(db)} known voices")
        return db
    except json.JSONDecodeError:
        logger.warning(f"Database file corrupted: {db_path}, creating empty database")
        return {}


def save_speaker_database(db: Dict[str, Any], db_path: Path) -> None:
    """Save speaker embedding database."""
    ensure_dir(db_path.parent)
    with open(db_path, "w") as f:
        json.dump(db, f, indent=2)
    logger.info(f"Saved speaker database to {db_path}")


def match_speakers_hungarian(
    session_embeddings: Dict[str, Dict[str, Any]],
    speaker_db: Dict[str, Any],
    config,
) -> Dict[str, Dict[str, Any]]:
    """
    Match session speakers to database using Hungarian algorithm.
    
    Args:
        session_embeddings: Embeddings for current session speakers
        speaker_db: Speaker database
        config: Pipeline configuration
        
    Returns:
        Matching results with candidates and confidence
    """
    from sklearn.metrics.pairwise import cosine_similarity
    from scipy.optimize import linear_sum_assignment
    
    if not speaker_db:
        logger.info("Empty database, all speakers are unknown")
        matches = {}
        for speaker_id, emb_info in session_embeddings.items():
            matches[speaker_id] = {
                "global_voice_id": None,
                "canonical_name": None,
                "match_status": "unknown",
                "candidates": [],
            }
        return matches
    
    # Build database embedding matrix
    db_voices = list(speaker_db.keys())
    db_embeddings = []
    db_sources = []
    
    for voice_id in db_voices:
        voice_data = speaker_db[voice_id]
        embeddings_dict = voice_data.get("embeddings", {})
        
        # Prefer same source type (room_mix vs clean_close_mic)
        source = session_embeddings[list(session_embeddings.keys())[0]]["source"]
        
        if source in embeddings_dict and "centroid" in embeddings_dict[source]:
            db_embeddings.append(embeddings_dict[source]["centroid"])
            db_sources.append(source)
        elif embeddings_dict:
            # Fallback to any available source
            first_source = list(embeddings_dict.keys())[0]
            db_embeddings.append(embeddings_dict[first_source]["centroid"])
            db_sources.append(first_source)
        else:
            # No embeddings available, skip
            db_embeddings.append(None)
            db_sources.append(None)
    
    # Remove None embeddings
    valid_indices = [i for i, e in enumerate(db_embeddings) if e is not None]
    db_voices = [db_voices[i] for i in valid_indices]
    db_embeddings = [db_embeddings[i] for i in valid_indices]
    db_sources = [db_sources[i] for i in valid_indices]
    
    if not db_embeddings:
        logger.warning("No valid database embeddings found")
        matches = {}
        for speaker_id in session_embeddings.keys():
            matches[speaker_id] = {
                "global_voice_id": None,
                "canonical_name": None,
                "match_status": "unknown",
                "candidates": [],
            }
        return matches
    
    db_embeddings_array = np.array(db_embeddings)
    
    # Build session embedding matrix
    session_speakers = list(session_embeddings.keys())
    session_embeddings_array = np.array([
        session_embeddings[spk]["embedding"] for spk in session_speakers
    ])
    
    # Compute similarity matrix
    similarity_matrix = cosine_similarity(session_embeddings_array, db_embeddings_array)
    
    # Convert to cost matrix (maximize similarity = minimize negative similarity)
    cost_matrix = -similarity_matrix
    
    # Hungarian algorithm for optimal assignment
    row_indices, col_indices = linear_sum_assignment(cost_matrix)
    
    # Build matches
    matches = {}
    threshold = config.speaker_matching.similarity_threshold
    
    for session_idx, db_idx in zip(row_indices, col_indices):
        speaker_id = session_speakers[session_idx]
        voice_id = db_voices[db_idx]
        similarity = similarity_matrix[session_idx, db_idx]
        
        # Get all candidates sorted by similarity
        candidates = []
        for db_i, db_v in enumerate(db_voices):
            candidates.append({
                "name": speaker_db[db_v]["canonical_name"],
                "global_voice_id": db_v,
                "score": float(similarity_matrix[session_idx, db_i]),
                "source": db_sources[db_i],
            })
        candidates.sort(key=lambda c: c["score"], reverse=True)
        
        # Determine match status
        if similarity >= threshold:
            match_status = "confirmed"
            matched_voice_id = voice_id
            matched_name = speaker_db[voice_id]["canonical_name"]
        elif similarity >= threshold - 0.05:  # Within 5% of threshold
            match_status = "probable"
            matched_voice_id = voice_id
            matched_name = speaker_db[voice_id]["canonical_name"]
        else:
            match_status = "unknown"
            matched_voice_id = None
            matched_name = None
        
        matches[speaker_id] = {
            "global_voice_id": matched_voice_id,
            "canonical_name": matched_name,
            "match_status": match_status,
            "candidates": candidates[:5],  # Top 5 candidates
        }
        
        logger.info(f"  {speaker_id} -> {matched_name or 'UNKNOWN'} "
                   f"({match_status}, similarity: {similarity:.3f})")
    
    # Add unmatched session speakers
    for speaker_id in session_speakers:
        if speaker_id not in matches:
            matches[speaker_id] = {
                "global_voice_id": None,
                "canonical_name": None,
                "match_status": "unknown",
                "candidates": [],
            }
    
    return matches


def update_database_mode_a(
    session_embeddings: Dict[str, Dict[str, Any]],
    speaker_db: Dict[str, Any],
    session_id: str,
    config,
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Mode A: Auto-update database with clean-close-mic embeddings.
    
    Trusted identity from track filenames, so we can auto-update centroids.
    
    Args:
        session_embeddings: Current session embeddings
        speaker_db: Existing database
        session_id: Session identifier
        config: Pipeline configuration
        
    Returns:
        (updated_db, update_log)
    """
    update_log = []
    
    for speaker_id, emb_info in session_embeddings.items():
        canonical_name = emb_info["canonical_name"]
        embedding = np.array(emb_info["embedding"])
        source = emb_info["source"]
        duration = emb_info["duration_seconds"]
        
        # Check if we meet minimum duration for clean embeddings
        if duration < config.speaker_matching.min_clean_duration_seconds:
            logger.info(f"  {canonical_name}: duration {duration:.1f}s < minimum "
                       f"{config.speaker_matching.min_clean_duration_seconds}s, skipping update")
            update_log.append(f"SKIP: {canonical_name} (duration {duration:.1f}s too short)")
            continue
        
        # Find or create global voice ID
        existing_voice_id = None
        for voice_id, voice_data in speaker_db.items():
            if voice_data.get("canonical_name") == canonical_name:
                existing_voice_id = voice_id
                break
        
        if existing_voice_id:
            # Update existing voice
            voice_data = speaker_db[existing_voice_id]
            embeddings_dict = voice_data.get("embeddings", {})
            
            if source not in embeddings_dict:
                embeddings_dict[source] = {
                    "centroid": embedding.tolist(),
                    "num_embeddings": 1,
                }
                update_log.append(f"ADD: {canonical_name} ({source} centroid)")
            else:
                # Update centroid with new embedding
                old_centroid = np.array(embeddings_dict[source]["centroid"])
                old_count = embeddings_dict[source]["num_embeddings"]
                
                # Check if new embedding is similar enough
                from sklearn.metrics.pairwise import cosine_similarity
                sim = cosine_similarity([embedding], [old_centroid])[0, 0]
                
                if sim >= config.speaker_matching.centroid_update_threshold:
                    # Weighted average (existing centroid + new embedding)
                    new_centroid = (old_centroid * old_count + embedding) / (old_count + 1)
                    embeddings_dict[source]["centroid"] = new_centroid.tolist()
                    embeddings_dict[source]["num_embeddings"] = min(
                        old_count + 1,
                        config.speaker_embedding.max_embeddings_per_speaker
                    )
                    update_log.append(f"UPDATE: {canonical_name} ({source} centroid, sim={sim:.3f})")
                else:
                    logger.warning(f"  {canonical_name}: new embedding too dissimilar "
                                 f"(sim={sim:.3f}), not updating centroid")
                    update_log.append(f"REJECT: {canonical_name} (sim={sim:.3f} < threshold)")
            
            # Update per-session record
            per_session = voice_data.get("per_session", [])
            per_session.append({
                "session_id": session_id,
                "source": source,
                "embedding": embedding.tolist(),
                "duration_seconds": duration,
            })
            voice_data["per_session"] = per_session
            
            # Update sessions list
            sessions = voice_data.get("sessions", [])
            if session_id not in sessions:
                sessions.append(session_id)
            voice_data["sessions"] = sessions
            
            voice_data["embeddings"] = embeddings_dict
            voice_data["last_updated"] = datetime.now().isoformat()
            
        else:
            # Create new voice entry
            new_voice_id = f"GV_{len(speaker_db) + 1:04d}"
            speaker_db[new_voice_id] = {
                "canonical_name": canonical_name,
                "embeddings": {
                    source: {
                        "centroid": embedding.tolist(),
                        "num_embeddings": 1,
                    }
                },
                "per_session": [{
                    "session_id": session_id,
                    "source": source,
                    "embedding": embedding.tolist(),
                    "duration_seconds": duration,
                }],
                "sessions": [session_id],
                "last_updated": datetime.now().isoformat(),
            }
            update_log.append(f"CREATE: {canonical_name} (new voice {new_voice_id})")
            logger.info(f"  ✓ Created new voice: {new_voice_id} ({canonical_name})")
    
    return speaker_db, update_log


def generate_database_delta_mode_b(
    session_embeddings: Dict[str, Dict[str, Any]],
    matches: Dict[str, Dict[str, Any]],
    session_id: str,
    config,
) -> List[Dict[str, Any]]:
    """
    Mode B: Generate delta file for manual review.
    
    Proposes database updates but doesn't auto-commit due to uncertain identity.
    
    Args:
        session_embeddings: Current session embeddings
        matches: Matching results from Hungarian algorithm
        session_id: Session identifier
        config: Pipeline configuration
        
    Returns:
        List of proposed updates
    """
    delta_entries = []
    
    for speaker_id, emb_info in session_embeddings.items():
        match_info = matches[speaker_id]
        embedding = emb_info["embedding"]
        source = emb_info["source"]
        duration = emb_info["duration_seconds"]
        
        # Only propose updates for confirmed/probable matches
        if match_info["match_status"] not in ["confirmed", "probable"]:
            logger.info(f"  {speaker_id}: status={match_info['match_status']}, no delta entry")
            continue
        
        # Check if similarity is high enough for centroid update
        best_candidate = match_info["candidates"][0] if match_info["candidates"] else None
        if not best_candidate:
            continue
        
        if best_candidate["score"] >= config.speaker_matching.centroid_update_threshold:
            action = "UPDATE_CENTROID"
        elif best_candidate["score"] >= config.speaker_matching.similarity_threshold:
            action = "ADD_SESSION_ONLY"
        else:
            action = "REVIEW_REQUIRED"
        
        delta_entry = {
            "session_speaker_id": speaker_id,
            "proposed_global_voice_id": match_info["global_voice_id"],
            "proposed_canonical_name": match_info["canonical_name"],
            "match_status": match_info["match_status"],
            "similarity_score": best_candidate["score"],
            "action": action,
            "session_id": session_id,
            "embedding": embedding,
            "source": source,
            "duration_seconds": duration,
            "candidates": match_info["candidates"],
        }
        
        delta_entries.append(delta_entry)
        logger.info(f"  {speaker_id} -> {match_info['canonical_name']}: {action} "
                   f"(sim={best_candidate['score']:.3f})")
    
    return delta_entries
