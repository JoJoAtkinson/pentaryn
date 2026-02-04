#!/usr/bin/env python3
"""
Step 5: Post-Processing - Validate
Quality assurance checks on merged transcript.

Validation Checks:
1. Timestamp monotonicity (words should be in time order)
2. Timestamp gaps (detect large gaps in transcript)
3. Speaker consistency (no rapid speaker switching)
4. Emotion score validity (values in [0, 1])
5. Speaker ID coverage (% of words with resolved IDs)
6. Alignment confidence (distribution of word scores)
"""

import argparse
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class ValidationIssue:
    """Represents a validation issue."""
    severity: str  # "error", "warning", "info"
    check: str
    message: str
    timestamp: Optional[float] = None
    details: Optional[Dict] = None


class TranscriptValidator:
    """Validates merged transcript quality."""
    
    def __init__(
        self,
        merged_path: Path,
        max_gap_seconds: float = 5.0,
        min_turn_duration: float = 0.3,
        min_speaker_id_coverage: float = 0.8,
        min_emotion_coverage: float = 0.7,
    ):
        """
        Args:
            merged_path: Path to merged.jsonl
            max_gap_seconds: Maximum allowed gap between words
            min_turn_duration: Minimum speaker turn duration
            min_speaker_id_coverage: Minimum % of words with speaker IDs
            min_emotion_coverage: Minimum % of words with emotion scores
        """
        self.merged_path = merged_path
        self.max_gap_seconds = max_gap_seconds
        self.min_turn_duration = min_turn_duration
        self.min_speaker_id_coverage = min_speaker_id_coverage
        self.min_emotion_coverage = min_emotion_coverage
        
        self.words: List[Dict] = []
        self.issues: List[ValidationIssue] = []
    
    def load_data(self):
        """Load merged transcript."""
        logger.info(f"Loading merged transcript from {self.merged_path}")
        
        with open(self.merged_path, "r") as f:
            for line in f:
                self.words.append(json.loads(line))
        
        logger.info(f"Loaded {len(self.words)} words")
    
    def check_timestamp_monotonicity(self):
        """Check that timestamps are monotonically increasing."""
        logger.info("Checking timestamp monotonicity...")
        
        for i in range(1, len(self.words)):
            prev_word = self.words[i - 1]
            curr_word = self.words[i]
            
            if curr_word["start"] < prev_word["start"]:
                self.issues.append(ValidationIssue(
                    severity="error",
                    check="timestamp_monotonicity",
                    message=f"Word '{curr_word['word']}' starts before previous word",
                    timestamp=curr_word["start"],
                    details={
                        "prev_word": prev_word["word"],
                        "prev_start": prev_word["start"],
                        "curr_start": curr_word["start"],
                    },
                ))
            
            if curr_word["end"] < curr_word["start"]:
                self.issues.append(ValidationIssue(
                    severity="error",
                    check="timestamp_monotonicity",
                    message=f"Word '{curr_word['word']}' ends before it starts",
                    timestamp=curr_word["start"],
                    details={
                        "start": curr_word["start"],
                        "end": curr_word["end"],
                    },
                ))
    
    def check_timestamp_gaps(self):
        """Check for large gaps in transcript."""
        logger.info("Checking for timestamp gaps...")
        
        gaps = []
        for i in range(1, len(self.words)):
            prev_word = self.words[i - 1]
            curr_word = self.words[i]
            gap = curr_word["start"] - prev_word["end"]
            
            if gap > self.max_gap_seconds:
                gaps.append((prev_word["end"], curr_word["start"], gap))
                self.issues.append(ValidationIssue(
                    severity="warning",
                    check="timestamp_gaps",
                    message=f"Large gap ({gap:.2f}s) in transcript",
                    timestamp=prev_word["end"],
                    details={
                        "gap_start": prev_word["end"],
                        "gap_end": curr_word["start"],
                        "gap_duration": gap,
                    },
                ))
        
        if gaps:
            logger.warning(f"Found {len(gaps)} gaps > {self.max_gap_seconds}s")
        else:
            logger.info(f"No gaps > {self.max_gap_seconds}s found")
    
    def check_speaker_consistency(self):
        """Check for rapid speaker switching."""
        logger.info("Checking speaker consistency...")
        
        # Group words into speaker turns
        turns = []
        if self.words:
            current_speaker = self.words[0]["speaker"]
            turn_start = self.words[0]["start"]
            
            for word in self.words[1:]:
                if word["speaker"] != current_speaker:
                    # Speaker changed
                    turn_end = word["start"]
                    turn_duration = turn_end - turn_start
                    
                    if turn_duration < self.min_turn_duration:
                        self.issues.append(ValidationIssue(
                            severity="warning",
                            check="speaker_consistency",
                            message=f"Very short speaker turn ({turn_duration:.2f}s) for {current_speaker}",
                            timestamp=turn_start,
                            details={
                                "speaker": current_speaker,
                                "turn_start": turn_start,
                                "turn_end": turn_end,
                                "turn_duration": turn_duration,
                            },
                        ))
                    
                    turns.append((current_speaker, turn_start, turn_end, turn_duration))
                    current_speaker = word["speaker"]
                    turn_start = word["start"]
            
            # Add final turn
            turn_end = self.words[-1]["end"]
            turn_duration = turn_end - turn_start
            turns.append((current_speaker, turn_start, turn_end, turn_duration))
        
        logger.info(f"Found {len(turns)} speaker turns")
    
    def check_emotion_validity(self):
        """Check that emotion scores are in valid range."""
        logger.info("Checking emotion score validity...")
        
        for word in self.words:
            for dim in ["arousal", "valence", "dominance"]:
                score = word.get(dim)
                if score is not None:
                    if not (0.0 <= score <= 1.0):
                        self.issues.append(ValidationIssue(
                            severity="error",
                            check="emotion_validity",
                            message=f"Invalid {dim} score ({score}) for word '{word['word']}'",
                            timestamp=word["start"],
                            details={
                                "word": word["word"],
                                "dimension": dim,
                                "score": score,
                            },
                        ))
    
    def check_coverage(self):
        """Check speaker ID and emotion coverage."""
        logger.info("Checking coverage...")
        
        total_words = len(self.words)
        if total_words == 0:
            return
        
        # Speaker ID coverage
        words_with_speaker_id = sum(1 for w in self.words if w.get("speaker_id"))
        speaker_id_coverage = words_with_speaker_id / total_words
        
        if speaker_id_coverage < self.min_speaker_id_coverage:
            self.issues.append(ValidationIssue(
                severity="warning",
                check="coverage",
                message=f"Low speaker ID coverage ({speaker_id_coverage:.1%})",
                details={
                    "coverage": speaker_id_coverage,
                    "threshold": self.min_speaker_id_coverage,
                },
            ))
        else:
            logger.info(f"Speaker ID coverage: {speaker_id_coverage:.1%} ✓")
        
        # Emotion coverage
        words_with_emotion = sum(
            1 for w in self.words
            if w.get("arousal") is not None
            and w.get("valence") is not None
            and w.get("dominance") is not None
        )
        emotion_coverage = words_with_emotion / total_words
        
        if emotion_coverage < self.min_emotion_coverage:
            self.issues.append(ValidationIssue(
                severity="warning",
                check="coverage",
                message=f"Low emotion coverage ({emotion_coverage:.1%})",
                details={
                    "coverage": emotion_coverage,
                    "threshold": self.min_emotion_coverage,
                },
            ))
        else:
            logger.info(f"Emotion coverage: {emotion_coverage:.1%} ✓")
    
    def check_alignment_quality(self):
        """Check alignment confidence scores."""
        logger.info("Checking alignment quality...")
        
        scores = [w["score"] for w in self.words if "score" in w]
        if not scores:
            logger.warning("No alignment scores found")
            return
        
        mean_score = np.mean(scores)
        median_score = np.median(scores)
        min_score = np.min(scores)
        low_score_count = sum(1 for s in scores if s < 0.5)
        
        logger.info(f"Alignment scores: mean={mean_score:.3f}, median={median_score:.3f}, min={min_score:.3f}")
        
        if mean_score < 0.7:
            self.issues.append(ValidationIssue(
                severity="warning",
                check="alignment_quality",
                message=f"Low average alignment confidence ({mean_score:.3f})",
                details={
                    "mean_score": mean_score,
                    "median_score": median_score,
                    "min_score": min_score,
                    "low_score_count": low_score_count,
                },
            ))
        
        if low_score_count > len(scores) * 0.1:
            self.issues.append(ValidationIssue(
                severity="warning",
                check="alignment_quality",
                message=f"{low_score_count} words with low alignment confidence (<0.5)",
                details={
                    "low_score_count": low_score_count,
                    "total_words": len(scores),
                    "percentage": low_score_count / len(scores),
                },
            ))
    
    def validate(self) -> Dict:
        """
        Run all validation checks.
        
        Returns:
            Validation report dictionary
        """
        logger.info("Running validation checks...")
        
        self.check_timestamp_monotonicity()
        self.check_timestamp_gaps()
        self.check_speaker_consistency()
        self.check_emotion_validity()
        self.check_coverage()
        self.check_alignment_quality()
        
        # Count issues by severity
        errors = [i for i in self.issues if i.severity == "error"]
        warnings = [i for i in self.issues if i.severity == "warning"]
        infos = [i for i in self.issues if i.severity == "info"]
        
        logger.info(f"Validation complete: {len(errors)} errors, {len(warnings)} warnings, {len(infos)} infos")
        
        report = {
            "total_words": len(self.words),
            "total_issues": len(self.issues),
            "errors": len(errors),
            "warnings": len(warnings),
            "infos": len(infos),
            "passed": len(errors) == 0,
            "issues": [
                {
                    "severity": issue.severity,
                    "check": issue.check,
                    "message": issue.message,
                    "timestamp": issue.timestamp,
                    "details": issue.details,
                }
                for issue in self.issues
            ],
        }
        
        return report


def main():
    """Main entry point for validation."""
    parser = argparse.ArgumentParser(description="Step 5: Post-Processing - Validate")
    parser.add_argument(
        "--input-dir",
        type=Path,
        required=True,
        help="Input directory containing merged.jsonl",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Output directory for validation report",
    )
    parser.add_argument(
        "--max-gap",
        type=float,
        default=5.0,
        help="Maximum allowed gap between words (seconds, default: 5.0)",
    )
    parser.add_argument(
        "--min-turn-duration",
        type=float,
        default=0.3,
        help="Minimum speaker turn duration (seconds, default: 0.3)",
    )
    parser.add_argument(
        "--min-speaker-id-coverage",
        type=float,
        default=0.8,
        help="Minimum speaker ID coverage (default: 0.8)",
    )
    parser.add_argument(
        "--min-emotion-coverage",
        type=float,
        default=0.7,
        help="Minimum emotion coverage (default: 0.7)",
    )
    args = parser.parse_args()
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    
    # Find input file
    merged_path = args.input_dir / "merged.jsonl"
    
    if not merged_path.exists():
        raise FileNotFoundError(f"Merged transcript not found: {merged_path}")
    
    logger.info(f"Input: {merged_path}")
    
    # Validate
    validator = TranscriptValidator(
        merged_path=merged_path,
        max_gap_seconds=args.max_gap,
        min_turn_duration=args.min_turn_duration,
        min_speaker_id_coverage=args.min_speaker_id_coverage,
        min_emotion_coverage=args.min_emotion_coverage,
    )
    
    validator.load_data()
    report = validator.validate()
    
    # Write report
    report_path = args.output_dir / "validation_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    logger.info(f"Wrote validation report to {report_path}")
    
    # Print summary
    print("\n=== Validation Summary ===")
    print(f"Total words: {report['total_words']}")
    print(f"Total issues: {report['total_issues']}")
    print(f"  Errors: {report['errors']}")
    print(f"  Warnings: {report['warnings']}")
    print(f"  Infos: {report['infos']}")
    print(f"Passed: {'✓' if report['passed'] else '✗'}")
    
    if report['errors'] > 0:
        print("\nErrors found:")
        for issue in report['issues']:
            if issue['severity'] == 'error':
                print(f"  [{issue['check']}] {issue['message']}")
    
    # Exit with error code if validation failed
    if not report['passed']:
        exit(1)


if __name__ == "__main__":
    main()
