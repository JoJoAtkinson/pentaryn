#!/usr/bin/env python3
"""Test script to verify value_flags approach."""

import sys
import subprocess

# Test command
cmd = [
    sys.executable,
    "scripts/srd5_2.py",
    "--query",
    "grapple",
    "--limit",
    "2"
]

print(f"Running: {' '.join(cmd)}")
print("-" * 60)

result = subprocess.run(cmd, capture_output=True, text=True)

print("STDOUT:")
print(result.stdout)
print("\nSTDERR:")
print(result.stderr)
print("\nReturn code:", result.returncode)
