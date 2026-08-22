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
#   launch time the moment launchd actually started this job, exported so Python
#               gates on when the run BEGAN rather than on when it got round to
#               looking at the clock. See below.
#   timeouts    a ceiling on both interpreter startup and the run itself.
#
# The lock, the pause switch, the time window and the connected-user gate are all in
# Python (scripts/foundry/update/apply.py), because the watchdog and the manual
# `make vtt-update-now` path need exactly the same checks.
#
# ── 2026-08-22: why the timeouts exist ────────────────────────────────────────
# The 04:06 run fired exactly on schedule and then sat for 5h17m01s blocked on a
# modal TCC consent dialog that nothing could see — WindowServer denied
# UserNotificationCenter the right to come to the front, so the prompt existed but
# was never displayed. The caffeinate assertion (PID 90627) held continuously from
# 04:06:05 to 09:23:06, which is the receipt: the process was alive and stuck, not
# deferred. It unblocked only when the lid was opened and the invisible dialog was
# clicked at 09:22:52.
#
# By then the clock read 09:22, and Python's window check aborted — reporting it as
# "a run launchd deferred from a sleeping Mac", a cause it had never measured. The
# Mac was plugged in and awake the whole night. Two fixes, and both are needed:
# gate on the launch time (below), and never let a startup prompt hang the job.
set -uo pipefail

# FIRST, before anything that can block: when did launchd actually start us?
export VTT_UPDATE_LAUNCHED_AT="$(date +%s)"

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$REPO/.venv/bin/python"
LOG_DIR="$REPO/.state/logs"
LOG="$LOG_DIR/vtt-update-$(date +%F).log"

# A run is tens of minutes; 90 is generous. Interpreter startup is milliseconds; 60s
# is already pathological and means something is prompting.
RUN_TIMEOUT=${VTT_UPDATE_TIMEOUT:-5400}
STARTUP_TIMEOUT=${VTT_UPDATE_STARTUP_TIMEOUT:-60}

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"
cd "$REPO" || exit 1

[ -x "$PY" ] || { echo "$(date -u +%FT%TZ) no venv at $PY — run: uv sync" >> "$LOG"; exit 1; }

{
  echo "──────────────────────────────────────────────────────────────"
  echo "$(date -u +%FT%TZ) vtt-update starting (host $(hostname -s))"
} >> "$LOG"

# macOS ships no timeout(1) and coreutils is not a dependency, so: run in the
# background, race it against a sleeping killer, reap whichever finishes.
run_with_timeout() {  # $1 = seconds, rest = command
  local secs="$1"; shift
  "$@" &
  local pid=$!
  (
    sleep "$secs"
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null
      sleep 10
      kill -KILL "$pid" 2>/dev/null
    fi
  ) &
  local killer=$!
  wait "$pid"; local rc=$?
  kill "$killer" 2>/dev/null
  wait "$killer" 2>/dev/null
  return $rc
}

# ── Preflight: can the interpreter even start? ──
# This is the check that would have turned a five-hour silent hang into a 60-second
# logged failure. A TCC consent prompt blocks here, before any of Python's own
# guards get to run.
if ! run_with_timeout "$STARTUP_TIMEOUT" "$PY" -c "pass" >/dev/null 2>&1; then
  {
    echo "  ✗ the interpreter did not start within ${STARTUP_TIMEOUT}s"
    echo "    $PY"
    echo "    Under launchd this is almost always a TCC consent prompt that cannot be"
    echo "    displayed — WindowServer refuses to front UserNotificationCenter for a"
    echo "    background job, so the dialog exists but is invisible and the process"
    echo "    waits forever. It is a uv-managed interpreter running with a working"
    echo "    directory inside ~/Documents, which is exactly the shape that triggers it."
    echo "    Grant the interpreter Full Disk Access, then re-run:"
    echo "      System Settings → Privacy & Security → Full Disk Access → +"
    echo "      $(readlink "$PY" 2>/dev/null || echo "$PY")"
    echo "    Verify with: make vtt-update-dry"
    echo "$(date -u +%FT%TZ) vtt-update finished rc=75 (startup blocked)"
  } >> "$LOG"
  exit 75
fi

# caffeinate -i (no idle sleep) -m (no disk sleep), holding the assertion for exactly
# as long as the run takes.
run_with_timeout "$RUN_TIMEOUT" caffeinate -im "$PY" -m scripts.foundry.update.cli run "$@" >> "$LOG" 2>&1
RC=$?

if [ "$RC" -eq 143 ] || [ "$RC" -eq 137 ]; then
  echo "  ✗ run exceeded ${RUN_TIMEOUT}s and was terminated" >> "$LOG"
fi

echo "$(date -u +%FT%TZ) vtt-update finished rc=$RC" >> "$LOG"

# Keep a quarter's worth of logs.
find "$LOG_DIR" -name 'vtt-update-*.log' -mtime +90 -delete 2>/dev/null

exit $RC
