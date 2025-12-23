#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

UPDATE_LOCK=1
if [[ "${1:-}" == "--no-lock" ]]; then
  UPDATE_LOCK=0
elif [[ "${1:-}" == "--lock" ]]; then
  UPDATE_LOCK=1
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--lock|--no-lock]"
  exit 2
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "ERROR: Homebrew is required (brew not found). Install Homebrew first."
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "ERROR: uv is required (uv not found). Install uv first."
  exit 1
fi

echo "==> Installing native deps (libraqm stack)"
brew install pkg-config freetype harfbuzz fribidi libraqm

echo "==> Verifying libraqm via pkg-config"
pkg-config --modversion raqm

PY="./venv/bin/python"
if [[ ! -x "$PY" ]]; then
  PY="./.venv/bin/python"
fi
if [[ ! -x "$PY" ]]; then
  echo "ERROR: venv python not found at ./venv/bin/python or ./.venv/bin/python"
  exit 1
fi

echo "==> Rebuilding Pillow from source (enables RAQM when native deps are present)"
uv pip uninstall -p "$PY" pillow || true
uv cache clean pillow || true
uv pip install -p "$PY" -v --no-binary=:all: pillow

echo "==> Verifying required Python deps are importable"
"$PY" -c "import PIL, pandas, pytest, cairosvg, ipykernel; print('ok: imports')"

echo "==> Verifying Pillow RAQM support"
"$PY" -c "from PIL import features; print('raqm:', features.check('raqm'))"

if [[ "$UPDATE_LOCK" == "1" ]]; then
  echo "==> Updating uv.lock (so uv sync won't silently revert Pillow)"
  uv lock
  echo "==> Reminder: commit updated uv.lock if you want this to persist in git."
fi
