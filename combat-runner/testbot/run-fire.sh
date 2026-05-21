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

# A fire exits 1 on scenario failure; that's still "the cron ran fine" for
# launchd. We never propagate non-zero so launchd doesn't back off.
exit 0
