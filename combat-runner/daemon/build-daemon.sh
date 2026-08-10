#!/usr/bin/env bash
# dnd-combat build daemon — invokes `claude` headlessly with the build prompt.
#
# Designed to be called by launchd (or cron, or just `bash build-daemon.sh`
# for a manual fire). One invocation = one build step; the daemon reads the
# state file, advances the build, writes back, exits.
#
# Idempotent: if the build is already `done` and the shipped.flag exists,
# this script becomes a no-op and unloads itself from launchd.

set -euo pipefail

# Resolve the repo root from this script's own location:
# <repo>/combat-runner/daemon/build-daemon.sh -> up two levels.
DAEMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DAEMON_DIR/../.." && pwd)"
PROMPT_FILE="$DAEMON_DIR/prompt.txt"
LOGS_DIR="$DAEMON_DIR/logs"
SHIPPED_FLAG="$DAEMON_DIR/shipped.flag"
LAUNCHD_LABEL="com.dnd.combat-build-daemon"

mkdir -p "$LOGS_DIR"
LOG="$LOGS_DIR/build-$(date +%Y-%m-%d_%H-%M-%S).log"

# Short-circuit if we've already shipped
if [[ -f "$SHIPPED_FLAG" ]]; then
  echo "$(date) shipped.flag present — daemon is idle. Use 'rm $SHIPPED_FLAG' to re-arm." >> "$LOG"
  # Unload from launchd so we stop firing
  launchctl bootout "gui/$(id -u)" "$LAUNCHD_LABEL" 2>/dev/null || true
  exit 0
fi

# Require Anthropic API key (claude -p reads from keychain on macOS, but
# .env is also acceptable)
if [[ -f "$REPO_ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$REPO_ROOT/.env"; set +a
fi

cd "$REPO_ROOT"

echo "$(date) build-daemon firing" >> "$LOG"
echo "---" >> "$LOG"

# Invoke claude in print mode with the daemon prompt.
# --print runs non-interactively; the daemon prompt is fully self-contained.
# We allow tool use and bypass permission prompts because this is headless.
claude --print "$(cat "$PROMPT_FILE")" \
  --permission-mode bypassPermissions \
  >> "$LOG" 2>&1 || {
    echo "$(date) claude invocation failed (exit $?) — see log" >> "$LOG"
    exit 1
  }

echo "$(date) build-daemon completed cleanly" >> "$LOG"
