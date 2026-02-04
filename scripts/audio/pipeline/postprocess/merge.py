#!/usr/bin/env python3
"""
Step 5: Post-Processing - Merge
Combines outputs from Steps 1-4 into a unified transcript with speaker IDs and emotion.

Merging Strategy:
- Use owned-interval stitching to align transcription, diarization, and emotion by time
- Each word gets assigned to the speaker who owns that time interval
- Emotion scores are interpolated from nearest speaker turn
- Speaker IDs are resolved using matches.json

Input:
- transcription.jsonl (words with timestamps)
- diarization.jsonl (speaker turns)
- emotion.jsonl (A/V/D scores per turn)
- matches.json (speaker ID mappings)

Output:
- merged.jsonl (unified transcript with all annotations)
"""

import argparse
import json
import logging
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class Word:
    """Word with timestamp and alignment."""
    start: float
    end: float
    word: str
    score: float  # Alignment confidence


@dataclass
class SpeakerTurn:
    """Speaker turn with interval."""
    start: float
    end: float
    speaker: str
    track_id: Optional[str] = None


@dataclass
class EmotionScore:
    """Emotion scores for a speaker turn."""
    start: float
    end: float
    speaker: str
    arousal: float
    valence: float
    dominance: float


@dataclass
class MergedWord:
    """Word with all annotations."""
    start: float
    end: float
    word: str
    score: float
    speaker: str
    speaker_id: Optional[str]  # Global voice ID
    arousal: Optional[float]
    valence: Optional[float]
    dominance: Optional[float]
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "start": self.start,
            "end": self.end,
            "word": self.word,
            "score": self.score,
            "speaker": self.speaker,
            "speaker_id": self.speaker_id,
            "arousal": self.arousal,
            "valence": self.valence,
            "dominance": self.dominance,
        }


class TranscriptMerger:
    """Merges transcription, diarization, emotion, and speaker IDs."""
    
    def __init__(
        self,
        transcription_path: Path,
        diarization_path: Path,
        emotion_path: Optional[Path],
        matches_path: Optional[Path],
    ):
        """
        Args:
            transcription_path: Path to transcription.jsonl
            diarization_path: Path to diarization.jsonl
            emotion_path: Path to emotion.jsonl (optional)
            matches_path: Path to matches.json (optional)
        """
        self.transcription_path = transcription_path
        self.diarization_path = diarization_path
        self.emotion_path = emotion_path
        self.matches_path = matches_path
        
        # Loaded data
        self.words: List[Word] = []
        self.speaker_turns: List[SpeakerTurn] = []
        self.emotion_scores: List[EmotionScore] = []
        self.speaker_id_map: Dict[str, str] = {}
    
    def load_data(self):
        """Load all input files."""
        load_start = time.time()
        logger.info("Loading input files...")
        
        # Load transcription
        logger.info(f"Loading transcription from {self.transcription_path}")
        with open(self.transcription_path, "r") as f:
            for line in f:
                data = json.loads(line)
                self.words.append(Word(
                    start=data["start"],
                    end=data["end"],
                    word=data["word"],
                    score=data.get("score", 1.0),
                ))
        logger.info(f"Loaded {len(self.words)} words")
        
        # Load diarization
        logger.info(f"Loading diarization from {self.diarization_path}")
        with open(self.diarization_path, "r") as f:
            for line in f:
                data = json.loads(line)
                self.speaker_turns.append(SpeakerTurn(
                    start=data["start"],
                    end=data["end"],
                    speaker=data["speaker"],
                    track_id=data.get("track_id"),
                ))
        logger.info(f"Loaded {len(self.speaker_turns)} speaker turns")
        
        # Load emotion (optional)
        if self.emotion_path and self.emotion_path.exists():
            logger.info(f"Loading emotion from {self.emotion_path}")
            with open(self.emotion_path, "r") as f:
                for line in f:
                    data = json.loads(line)
                    self.emotion_scores.append(EmotionScore(
                        start=data["start"],
                        end=data["end"],
                        speaker=data["speaker"],
                        arousal=data["arousal"],
                        valence=data["valence"],
                        dominance=data["dominance"],
                    ))
            logger.info(f"Loaded {len(self.emotion_scores)} emotion scores")
        else:
            logger.info("No emotion data provided")
        
        # Load speaker ID mappings (optional)
        if self.matches_path and self.matches_path.exists():
            logger.info(f"Loading speaker matches from {self.matches_path}")
            with open(self.matches_path, "r") as f:
                matches = json.load(f)
                for match in matches.get("matches", []):
                    self.speaker_id_map[match["speaker"]] = match["global_voice_id"]
            logger.info(f"Loaded {len(self.speaker_id_map)} speaker ID mappings")
        else:
            logger.info("No speaker ID mappings provided")
        
        logger.info(f"✓ Loaded inputs in {(time.time() - load_start):.1f}s")
    
    def find_speaker_at_time(self, time: float) -> Optional[str]:
        """
        Find which speaker owns the given time using owned-interval logic.
        
        Args:
            time: Time in seconds
        
        Returns:
            Speaker ID or None if no speaker owns this time
        """
        for turn in self.speaker_turns:
            if turn.start <= time < turn.end:
                return turn.speaker
        return None
    
    def find_emotion_at_time(self, time: float, speaker: str) -> Optional[EmotionScore]:
        """
        Find emotion score for speaker at given time.
        
        Uses nearest turn for the same speaker (interpolation).
        
        Args:
            time: Time in seconds
            speaker: Speaker ID
        
        Returns:
            EmotionScore or None
        """
        if not self.emotion_scores:
            return None
        
        # Find all emotion scores for this speaker
        speaker_emotions = [e for e in self.emotion_scores if e.speaker == speaker]
        if not speaker_emotions:
            return None
        
        # Find exact overlap first
        for emotion in speaker_emotions:
            if emotion.start <= time < emotion.end:
                return emotion
        
        # Find nearest turn
        nearest = min(
            speaker_emotions,
            key=lambda e: min(abs(e.start - time), abs(e.end - time)),
        )
        return nearest
    
    def merge(self) -> List[MergedWord]:
        """
        Merge all data using owned-interval stitching.
        
        Returns:
            List of MergedWord objects
        """
        logger.info("Merging transcription with diarization, emotion, and speaker IDs...")
        merge_start = time.time()
        
        merged_words = []
        total_words = len(self.words)
        progress_next = 10
        
        for idx, word in enumerate(self.words, start=1):
            # Use midpoint of word for speaker/emotion lookup
            midpoint = (word.start + word.end) / 2
            
            # Find speaker at this time
            speaker = self.find_speaker_at_time(midpoint)
            if speaker is None:
                # Word falls outside any speaker turn, assign to closest
                nearest_turn = min(
                    self.speaker_turns,
                    key=lambda t: min(
                        abs(t.start - midpoint),
                        abs(t.end - midpoint),
                    ),
                )
                speaker = nearest_turn.speaker
                logger.debug(
                    f"Word '{word.word}' at {midpoint:.2f}s outside speaker turns, "
                    f"assigned to nearest {speaker}"
                )
            
            # Resolve speaker ID
            speaker_id = self.speaker_id_map.get(speaker)
            
            # Find emotion
            emotion = self.find_emotion_at_time(midpoint, speaker)
            arousal = emotion.arousal if emotion else None
            valence = emotion.valence if emotion else None
            dominance = emotion.dominance if emotion else None
            
            merged_words.append(MergedWord(
                start=word.start,
                end=word.end,
                word=word.word,
                score=word.score,
                speaker=speaker,
                speaker_id=speaker_id,
                arousal=arousal,
                valence=valence,
                dominance=dominance,
            ))
            
            percent = int(idx * 100 / total_words) if total_words else 100
            if percent >= progress_next or idx == total_words:
                logger.info(f"Merge progress: {percent}% ({idx}/{total_words} words)")
                progress_next += 10
        
        logger.info(
            f"Merged {len(merged_words)} words in {(time.time() - merge_start)/60:.2f} min"
        )
        return merged_words
    
    def write_output(self, merged_words: List[MergedWord], output_path: Path):
        """
        Write merged transcript to file.
        
        Args:
            merged_words: List of merged words
            output_path: Output file path
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        write_start = time.time()
        with open(output_path, "w") as f:
            for word in merged_words:
                f.write(json.dumps(word.to_dict()) + "\n")
        
        logger.info(
            f"Wrote merged transcript to {output_path} "
            f"in {(time.time() - write_start):.1f}s"
        )
    
    def generate_statistics(self, merged_words: List[MergedWord]) -> Dict:
        """
        Generate statistics about the merged transcript.
        
        Args:
            merged_words: List of merged words
        
        Returns:
            Statistics dictionary
        """
        total_words = len(merged_words)
        
        # Count words per speaker
        speaker_word_counts = defaultdict(int)
        for word in merged_words:
            speaker_word_counts[word.speaker] += 1
        
        # Count words with speaker IDs
        words_with_speaker_id = sum(1 for w in merged_words if w.speaker_id)
        
        # Count words with emotion
        words_with_emotion = sum(
            1 for w in merged_words
            if w.arousal is not None and w.valence is not None and w.dominance is not None
        )
        
        # Calculate duration
        if merged_words:
            duration = merged_words[-1].end - merged_words[0].start
        else:
            duration = 0.0
        
        stats = {
            "total_words": total_words,
            "total_duration_seconds": duration,
            "unique_speakers": len(speaker_word_counts),
            "words_per_speaker": dict(speaker_word_counts),
            "words_with_speaker_id": words_with_speaker_id,
            "words_with_emotion": words_with_emotion,
            "coverage": {
                "speaker_id": words_with_speaker_id / total_words if total_words > 0 else 0,
                "emotion": words_with_emotion / total_words if total_words > 0 else 0,
            },
        }
        
        return stats


def main():
    """Main entry point for merge."""
    parser = argparse.ArgumentParser(description="Step 5: Post-Processing - Merge")
    parser.add_argument(
        "--input-dir",
        type=Path,
        required=True,
        help="Input directory (contains transcription/, diarization/, emotion/, speaker_embedding/)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Output directory for merged.jsonl",
    )
    parser.add_argument(
        "--skip-emotion",
        action="store_true",
        help="Skip emotion merging (if emotion.jsonl not available)",
    )
    parser.add_argument(
        "--skip-speaker-id",
        action="store_true",
        help="Skip speaker ID resolution (if matches.json not available)",
    )
    args = parser.parse_args()
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    
    step_start = time.time()
    try:
        # Find input files
        transcription_path = args.input_dir / "transcription" / "transcription.jsonl"
        diarization_path = args.input_dir / "diarization" / "diarization.jsonl"
        emotion_path = args.input_dir / "emotion" / "emotion.jsonl" if not args.skip_emotion else None
        matches_path = args.input_dir / "speaker_embedding" / "matches.json" if not args.skip_speaker_id else None
        
        output_path = args.output_dir / "merged.jsonl"
        stats_path = args.output_dir / "merge_stats.json"
        
        # Check required files exist
        if not transcription_path.exists():
            raise FileNotFoundError(f"Transcription not found: {transcription_path}")
        if not diarization_path.exists():
            raise FileNotFoundError(f"Diarization not found: {diarization_path}")
        
        logger.info(f"Transcription: {transcription_path}")
        logger.info(f"Diarization: {diarization_path}")
        if emotion_path:
            logger.info(f"Emotion: {emotion_path}")
        if matches_path:
            logger.info(f"Speaker matches: {matches_path}")
        logger.info(f"Output: {output_path}")
        
        # Merge
        merger = TranscriptMerger(
            transcription_path=transcription_path,
            diarization_path=diarization_path,
            emotion_path=emotion_path,
            matches_path=matches_path,
        )
        
        merger.load_data()
        merged_words = merger.merge()
        merger.write_output(merged_words, output_path)
        
        # Generate statistics
        stats = merger.generate_statistics(merged_words)
        
        with open(stats_path, "w") as f:
            json.dump(stats, f, indent=2)
        
        logger.info(f"Wrote statistics to {stats_path}")
        logger.info(f"✓ Merge complete in {(time.time() - step_start)/60:.2f} min")
        
        # Print summary
        print("\n=== Merge Statistics ===")
        print(f"Total words: {stats['total_words']}")
        print(f"Duration: {stats['total_duration_seconds']:.2f}s")
        print(f"Unique speakers: {stats['unique_speakers']}")
        print(f"Speaker ID coverage: {stats['coverage']['speaker_id']:.1%}")
        print(f"Emotion coverage: {stats['coverage']['emotion']:.1%}")
        print("\nWords per speaker:")
        for speaker, count in sorted(stats['words_per_speaker'].items()):
            print(f"  {speaker}: {count}")
    except Exception as e:
        logger.error(f"Merge failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
