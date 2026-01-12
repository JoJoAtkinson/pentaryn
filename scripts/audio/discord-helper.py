#!/usr/bin/env python3
"""
Combine multiple Discord JSONL transcript files and sort all utterances by time.

Input format (per line, JSONL):
  {"speaker": "NAME", "text": "...", "start": 12.345, "end": 15.678}

Usage:
  # Most common: select all *.jsonl in a folder, write to sessions/03
  python3 scripts/audio/discord-helper.py \\
    --input-dir .output/session03/named-outputs/transcripts \\
    --out-dir /Users/joe/GitHub/dnd/sessions/03

  # Even shorter: pass the folder positionally (defaults output to sessions/03)
  python3 scripts/audio/discord-helper.py .output/session03/named-outputs/transcripts

  # Explicit input files, explicit output path
  python3 scripts/audio/discord-helper.py \\
    .output/session03/named-outputs/transcripts/1-joemind.jsonl \\
    .output/session03/named-outputs/transcripts/2-12thknight.jsonl \\
    .output/session03/named-outputs/transcripts/3-completenictory.jsonl \\
    .output/session03/named-outputs/transcripts/4-wickerdolphin.jsonl \\
    -o /Users/joe/GitHub/dnd/sessions/03/combined.jsonl
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

DEFAULT_OUTPUT_NAME_JSONL = "transcripts.jsonl"
DEFAULT_OUTPUT_NAME_TXT = "combined.txt"
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = REPO_ROOT / "sessions" / "03"


@dataclass(frozen=True)
class _Row:
    start: float
    end: float
    input_index: int
    line_number: int
    obj: dict[str, Any]


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _extract_start_end(obj: dict[str, Any]) -> tuple[float, float]:
    start = _coerce_float(obj.get("start"))
    end = _coerce_float(obj.get("end"))
    if start is None:
        start = math.inf
    if end is None:
        end = start
    return start, end


def _iter_rows(path: Path, input_index: int) -> Iterable[_Row]:
    with path.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                obj = json.loads(stripped)
            except json.JSONDecodeError as e:
                print(
                    f"[warn] {path}:{line_number}: invalid JSON ({e})",
                    file=sys.stderr,
                )
                continue

            if not isinstance(obj, dict):
                print(
                    f"[warn] {path}:{line_number}: expected JSON object, got {type(obj).__name__}",
                    file=sys.stderr,
                )
                continue

            start, end = _extract_start_end(obj)
            yield _Row(
                start=start,
                end=end,
                input_index=input_index,
                line_number=line_number,
                obj=obj,
            )


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Combine multiple Discord transcript JSONL files and sort by `start` time."
    )
    parser.add_argument(
        "inputs",
        nargs="*",
        help="Input JSONL files and/or folders (folders will be scanned for *.jsonl).",
    )
    parser.add_argument(
        "--input-dir",
        help="Scan this folder for *.jsonl (same as passing the folder as a positional arg).",
    )
    parser.add_argument(
        "--glob",
        default="*.jsonl",
        help="Glob to use when scanning input folders (default: *.jsonl).",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Output file path (overrides --out-dir).",
    )
    parser.add_argument(
        "--out-dir",
        help=f"Output directory (default filename: {DEFAULT_OUTPUT_NAME_JSONL} / {DEFAULT_OUTPUT_NAME_TXT}).",
    )
    parser.add_argument(
        "--txt",
        action="store_true",
        help="Write a human-readable text transcript instead of JSONL.",
    )
    parser.add_argument(
        "--add-source",
        action="store_true",
        help="Add `_source_file` and `_source_line` fields to each output JSON object.",
    )
    return parser.parse_args(argv)


def _format_time(seconds: float) -> str:
    if not math.isfinite(seconds) or seconds < 0:
        return "?:??"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _iter_input_jsonl_files(paths: Iterable[Path], glob_pat: str) -> list[Path]:
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            files.extend(sorted(p.glob(glob_pat)))
        else:
            files.append(p)
    return files


def main(argv: list[str]) -> int:
    args = _parse_args(argv)

    input_candidates: list[Path] = [Path(p) for p in args.inputs]
    if args.input_dir:
        input_candidates.append(Path(args.input_dir))

    if not input_candidates:
        print(
            "[error] provide input files/folders or use --input-dir",
            file=sys.stderr,
        )
        return 2

    for p in input_candidates:
        if not p.exists():
            print(f"[error] input not found: {p}", file=sys.stderr)
            return 2

    folder_mode = any(p.is_dir() for p in input_candidates)
    input_paths = _iter_input_jsonl_files(input_candidates, glob_pat=str(args.glob))
    if not input_paths:
        print("[error] no input files found", file=sys.stderr)
        return 2

    for p in input_paths:
        if not p.exists():
            print(f"[error] input not found: {p}", file=sys.stderr)
            return 2
        if p.is_dir():
            print(f"[error] expected a file but got a directory: {p}", file=sys.stderr)
            return 2

    rows: list[_Row] = []
    for i, path in enumerate(input_paths):
        rows.extend(_iter_rows(path, input_index=i))

    rows.sort(
        key=lambda r: (
            r.start,
            r.end,
            r.input_index,
            r.line_number,
        )
    )

    output_path: str | None = args.output
    if output_path is None:
        if args.out_dir:
            out_dir = Path(args.out_dir)
        elif folder_mode:
            out_dir = DEFAULT_OUT_DIR
        else:
            out_dir = None

        if out_dir is not None:
            out_dir.mkdir(parents=True, exist_ok=True)
            output_name = DEFAULT_OUTPUT_NAME_TXT if args.txt else DEFAULT_OUTPUT_NAME_JSONL
            output_path = str(out_dir / output_name)

    out_f = None
    try:
        if output_path:
            out_f = open(output_path, "w", encoding="utf-8")
            out = out_f
        else:
            out = sys.stdout

        if args.txt:
            for r in rows:
                speaker = str(r.obj.get("speaker") or "UNKNOWN")
                text = str(r.obj.get("text") or "")
                start = _format_time(r.start)
                end = _format_time(r.end)
                out.write(f"[{start}–{end}] {speaker}: {text}\n")
            return 0

        for r in rows:
            obj = dict(r.obj)
            if args.add_source:
                obj["_source_file"] = str(input_paths[r.input_index])
                obj["_source_line"] = r.line_number
            out.write(json.dumps(obj, ensure_ascii=False) + "\n")
        return 0
    finally:
        if out_f is not None:
            out_f.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
