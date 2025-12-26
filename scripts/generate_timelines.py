#!/usr/bin/env python3
"""
Generate Markdown and Mermaid timeline views from *_timeline.tsv files.

Usage:
    ./venv/bin/python scripts/generate_timelines.py
    ./venv/bin/python scripts/generate_timelines.py --config world/history/timeline.config.toml
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.timeline_svg.timeline_generate import generate_from_config


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate timeline outputs.")
    parser.add_argument(
        "--config",
        default="world/history/timeline.config.toml",
        help="Path to the timeline config file.",
    )
    args = parser.parse_args()
    root = Path(".").resolve()
    config_path = (root / args.config).resolve()
    if not config_path.exists():
        raise SystemExit(f"Config file not found: {config_path}")
    generate_from_config(root=root, config_path=config_path)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover
        print(exc, file=sys.stderr)
        sys.exit(1)

