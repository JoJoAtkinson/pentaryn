#!/bin/bash
# Wrapper invoked by launchd every 30 minutes.
# Single fire of `run_one_scenario.py` — picks the next scenario via the
# .testbot/run-counter round-robin file.
#
# Output goes to .testbot/cron.log (stdout) and .testbot/cron.err (stderr).
# Each fire is independent; failures don't affect future fires.

set -u
cd /Users/joe/GitHub/dnd

LOG_DIR=combat-runner/.testbot
mkdir -p "$LOG_DIR"

/Users/joe/GitHub/dnd/.venv/bin/python combat-runner/testbot/run_one_scenario.py \
    >>"$LOG_DIR/cron.log" 2>>"$LOG_DIR/cron.err"
status=$?

# A fire exits 1 on scenario failure. Previously this wrapper unconditionally
# exited 0, which made real test failures completely invisible. We now surface
# the real outcome:
#   - write the most recent exit code to a `last-fire-status` sentinel file
#   - log a clear FAIL/OK line so failures are greppable in the logs
# We still exit 0 so launchd does not aggressively back off the StartInterval
# schedule on failure — inspect `last-fire-status` / the FAIL lines instead.
ts=$(date '+%Y-%m-%dT%H:%M:%S')
echo "$status" >"$LOG_DIR/last-fire-status"
if [ "$status" -ne 0 ]; then
    echo "[$ts] FAIL run_one_scenario.py exited $status" >>"$LOG_DIR/cron.err"
else
    echo "[$ts] OK run_one_scenario.py exited 0" >>"$LOG_DIR/cron.log"
fi

exit 0
