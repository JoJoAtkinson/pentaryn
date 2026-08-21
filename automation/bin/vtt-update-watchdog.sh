#!/bin/bash
# 06:12 Saturday. Deliberately its own launchd job, not the last line of vtt-update.sh:
# one of the failures this exists to catch is "the update job never ran at all", and a
# monitor that only runs as the final step of the thing it monitors cannot report that.
#
# It distinguishes three states, which is why the updater writes its phase to
# .state/vtt-update.status as it goes rather than a single heartbeat at the end:
#
#   still running  a core download plus two world smoke tests can legitimately still be
#                  going. Say so and leave it alone.
#   died           a status file that stopped being updated, or a leftover entry-state
#                  file. RESTORE SERVICE FIRST — bring the world and tunnel back — and
#                  then notify. A notification about a table that is still down is not
#                  much use at 8am.
#   never fired    no status file from today at all. Notify; the usual cause is that the
#                  Mac was off (launchd catches up a sleeping Mac, not a powered-off one).
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$REPO/.venv/bin/python"
LOG_DIR="$REPO/.state/logs"
LOG="$LOG_DIR/vtt-update-watchdog-$(date +%F).log"
STATUS="$REPO/.state/vtt-update.status"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"
cd "$REPO" || exit 1

log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
notify() { "$PY" -m scripts.foundry.update.cli notify --kind "$1" --subtitle "$2" --message "$3" >/dev/null 2>&1; }

log "watchdog starting"

if [ ! -f "$STATUS" ]; then
  log "no status file — the updater has never run"
  notify attention "updater never ran" \
    "No update run has ever been recorded. If the Mac was powered off at 04:06, launchd cannot catch that up. Run: make vtt-update-now"
  exit 0
fi

# Age of the last status write, in seconds.
NOW=$(date +%s)
MTIME=$(stat -f %m "$STATUS")
AGE=$(( NOW - MTIME ))
OUTCOME=$("$PY" -c "import json,sys;print(json.load(open('$STATUS')).get('outcome',''))" 2>/dev/null)
PHASE=$("$PY" -c "import json,sys;print(json.load(open('$STATUS')).get('phase',''))" 2>/dev/null)
RUN_DAY=$("$PY" -c "import json,sys;print(json.load(open('$STATUS')).get('run_id','')[:8])" 2>/dev/null)
TODAY=$(date +%Y%m%d)

log "status: outcome=$OUTCOME phase=$PHASE run_day=$RUN_DAY age=${AGE}s"

if [ "$RUN_DAY" != "$TODAY" ]; then
  log "the newest run is from $RUN_DAY, not today"
  notify attention "updater did not run today" \
    "The most recent update run was $RUN_DAY. Was the Mac powered off at 04:06? Run: make vtt-update-now"
  exit 0
fi

if [ "$OUTCOME" = "running" ]; then
  # 20 minutes without a phase change while a run claims to be alive means it is not.
  if [ "$AGE" -gt 1200 ]; then
    log "run appears dead in phase=$PHASE — restoring service first"
    "$PY" -m scripts.foundry.update.cli recover-service >> "$LOG" 2>&1
    notify failed "update run died" \
      "The 04:06 run stopped responding in phase '$PHASE'. Service (world + tunnel) has been restored. See .state/logs/"
  else
    log "run still active in phase=$PHASE (${AGE}s since last update) — leaving it"
  fi
  exit 0
fi

# A finished run that left its entry-state file behind did not restore service.
if [ -f "$REPO/.state/vtt-update.entry" ]; then
  log "finished as '$OUTCOME' but left entry state behind — restoring service"
  "$PY" -m scripts.foundry.update.cli recover-service >> "$LOG" 2>&1
  notify attention "service restored after an untidy run" \
    "The 04:06 run finished as '$OUTCOME' without putting the world and tunnel back. The watchdog has done it."
  exit 0
fi

log "run finished cleanly as '$OUTCOME' — nothing to do"
find "$LOG_DIR" -name 'vtt-update-watchdog-*.log' -mtime +90 -delete 2>/dev/null
exit 0
