#!/bin/bash
# stop.sh [wsl|gpu]: close the suite's harness(es) (their pages and, for wsl, the headless Chrome). The Windows GPU Chrome is left running (wingpu-start.sh restarts it).
for w in ${@:-wsl gpu}; do port=$([ "$w" = wsl ] && echo 31990 || echo 31991); curl -s -m 5 -X POST http://127.0.0.1:$port/quit >/dev/null 2>&1 && echo "$w harness stopped"; done
