#!/bin/bash
# The Saturday-04:06 entrypoint. Invoked by com.pentaryn.vtt-update.
#
# Everything interesting lives in Python; this exists to give that Python the
# environment launchd does not:
#
#   PATH        launchd hands a job a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin).
#               node, gh, cloudflared and infisical are in /opt/homebrew/bin and
#               claude is in ~/.local/bin. Without this the run fails in ways that
#               look like "the tool is broken" rather than "the tool is not on PATH".
#   caffeinate  a run takes tens of minutes and can idle on a download. If the Mac
#               sleeps mid-update, it wakes with a half-installed package set.
#   logging     one dated log per run, pruned, so a failure a month ago is still
#               readable but the directory does not grow without bound.
#
# The lock, the pause switch, the time window and the connected-user gate are all in
# Python (scripts/foundry/update/apply.py), because the watchdog and the manual
# `make vtt-update-now` path need exactly the same checks.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$REPO/.venv/bin/python"
LOG_DIR="$REPO/.state/logs"
LOG="$LOG_DIR/vtt-update-$(date +%F).log"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"
cd "$REPO" || exit 1

[ -x "$PY" ] || { echo "$(date -u +%FT%TZ) no venv at $PY — run: uv sync" >> "$LOG"; exit 1; }

{
  echo "──────────────────────────────────────────────────────────────"
  echo "$(date -u +%FT%TZ) vtt-update starting (host $(hostname -s))"
} >> "$LOG"

# caffeinate -i (no idle sleep) -m (no disk sleep), holding the assertion for exactly
# as long as the run takes.
caffeinate -im "$PY" -m scripts.foundry.update.cli run "$@" >> "$LOG" 2>&1
RC=$?

echo "$(date -u +%FT%TZ) vtt-update finished rc=$RC" >> "$LOG"

# Keep a quarter's worth of logs.
find "$LOG_DIR" -name 'vtt-update-*.log' -mtime +90 -delete 2>/dev/null

exit $RC
