#!/usr/bin/env python3
"""Old name of scripts/foundry/prompt_marker_art.py, kept so existing commands still work.

Renamed 2026-10-11 (python-tooling-38): a hyphenated file cannot be imported or tested.
Delete this shim once nothing names the old path."""

import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("prompt_marker_art.py")), run_name="__main__")
