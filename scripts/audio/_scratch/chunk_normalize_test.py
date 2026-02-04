#!/usr/bin/env python3
"""Chunk + normalize a single audio file using CPU-parallel FFmpeg jobs.

This is a local test harness to validate chunking and reassembly.
"""

from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Allow imports from scripts/audio/pipeline
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.config import PipelineConfig
from pipeline.common.audio_utils import get_audio_duration, normalize_audio_ffmpeg
from pipeline.common.logging_utils import setup_logging, get_step_logger

logger = get_step_logger("chunk_test")


def _ffmpeg_extract_chunk(
    input_path: Path,
    output_path: Path,
    start_s: float,
    duration_s: float,
) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_s:.3f}",
        "-t",
        f"{duration_s:.3f}",
        "-i",
        str(input_path),
        "-c:a",
        "flac",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def _concat_flac(chunks: list[Path], output_path: Path) -> Path:
    file_list = output_path.with_suffix(".concat.txt")
    with open(file_list, "w") as f:
        for chunk in chunks:
            f.write(f"file '{chunk.resolve().as_posix()}'\n")
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(file_list),
        "-c:a",
        "flac",
        "-compression_level",
        "5",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return file_list


def main() -> int:
    parser = argparse.ArgumentParser(description="Chunk + normalize test")
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=Path("scripts/audio/pipeline.config.toml"))
    parser.add_argument("--output", type=Path, default=Path(".output/chunk_test/jeff_normalized.flac"))
    parser.add_argument("--workers", type=int, default=0, help="0 = auto (cpu count)")
    parser.add_argument("--limit-seconds", type=float, default=0.0, help="0 = full file")
    parser.add_argument("--keep-temp", action="store_true")
    args = parser.parse_args()

    setup_logging(level="INFO")

    if not args.audio.exists():
        logger.error(f"Audio not found: {args.audio}")
        return 1

    config = PipelineConfig.from_file(args.config)
    duration = get_audio_duration(args.audio)
    if args.limit_seconds and args.limit_seconds > 0:
        duration = min(duration, args.limit_seconds)

    workers = args.workers if args.workers > 0 else (os.cpu_count() or 1)
    workers = max(1, min(workers, math.ceil(duration)))

    chunk_len = duration / workers
    logger.info(f"Input duration: {duration:.2f}s, workers: {workers}, chunk_len: {chunk_len:.2f}s")

    temp_dir = args.output.parent / "tmp_chunks"
    temp_dir.mkdir(parents=True, exist_ok=True)

    extract_paths: list[Path] = []
    normalized_paths: list[Path] = []

    # Extract chunks sequentially (fast) then normalize in parallel
    start = time.time()
    for idx in range(workers):
        start_s = idx * chunk_len
        remaining = duration - start_s
        if remaining <= 0:
            break
        length = min(chunk_len, remaining)
        raw_path = temp_dir / f"chunk_{idx:02d}.flac"
        logger.info(f"Extracting chunk {idx+1}/{workers} ({start_s:.2f}s +{length:.2f}s)")
        _ffmpeg_extract_chunk(args.audio, raw_path, start_s, length)
        extract_paths.append(raw_path)

    def _normalize_chunk(raw_path: Path) -> Path:
        out_path = temp_dir / f"{raw_path.stem}_norm.{config.preprocess.output_format}"
        normalize_audio_ffmpeg(
            input_path=raw_path,
            output_path=out_path,
            sample_rate=config.preprocess.sample_rate,
            channels=config.preprocess.channels,
            loudnorm_target_lufs=config.preprocess.loudnorm_target_lufs,
            loudnorm_range_lu=config.preprocess.loudnorm_range_lu,
            true_peak_db=config.preprocess.true_peak_db,
            highpass_hz=config.preprocess.highpass_hz,
            two_pass=config.preprocess.two_pass,
            output_format=config.preprocess.output_format,
            duration_seconds=get_audio_duration(raw_path),
            progress_interval_seconds=config.preprocess.progress_interval_seconds,
        )
        return out_path

    logger.info(f"Normalizing {len(extract_paths)} chunks with {workers} workers")
    with ThreadPoolExecutor(max_workers=workers) as executor:
        normalized_paths = list(executor.map(_normalize_chunk, extract_paths))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Concatenating normalized chunks...")
    concat_list = _concat_flac(normalized_paths, args.output)

    out_duration = get_audio_duration(args.output)
    elapsed = time.time() - start
    logger.info(f"Output duration: {out_duration:.2f}s (delta {out_duration - duration:.2f}s)")
    logger.info(f"Total elapsed: {elapsed/60:.2f} min")

    if not args.keep_temp:
        for path in normalized_paths + extract_paths:
            path.unlink(missing_ok=True)
        concat_list.unlink(missing_ok=True)
        temp_dir.rmdir()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
