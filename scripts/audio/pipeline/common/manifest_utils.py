"""Manifest helpers for step reuse validation."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Iterable, Optional

from pipeline.common.file_utils import ensure_dir


def _hash_bytes(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def _file_fingerprint(path: Path) -> dict:
    stat = path.stat()
    return {
        "name": path.name,
        "size": stat.st_size,
        "sha256": _hash_bytes(path),
    }


def compute_config_hash(config) -> str:
    data = asdict(config)
    # Avoid embedding secrets in the hash
    data.get("azure", {}).update({"hf_auth_token": ""})
    serialized = json.dumps(data, sort_keys=True).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def build_manifest(
    step: str,
    session_id: str,
    input_files: Iterable[Path],
    config,
    extra: Optional[dict] = None,
) -> dict:
    inputs = [_file_fingerprint(Path(path)) for path in input_files]
    inputs.sort(key=lambda item: item["name"])

    return {
        "schema": 1,
        "step": step,
        "session_id": session_id,
        "config_hash": compute_config_hash(config),
        "inputs": inputs,
        "extra": extra or {},
    }


def load_manifest(output_dir: Path) -> Optional[dict]:
    path = output_dir / "manifest.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_manifest(output_dir: Path, manifest: dict) -> Path:
    ensure_dir(output_dir)
    path = output_dir / "manifest.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return path


def manifest_matches(output_dir: Path, expected: dict) -> bool:
    existing = load_manifest(output_dir)
    if not existing:
        return False
    return existing == expected


def should_skip(output_dir: Path, expected_manifest: dict, required_outputs: Iterable[Path]) -> bool:
    for path in required_outputs:
        if not Path(path).exists():
            return False
    return manifest_matches(output_dir, expected_manifest)
