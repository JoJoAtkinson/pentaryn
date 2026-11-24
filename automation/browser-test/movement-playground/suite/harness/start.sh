#!/bin/bash
# start.sh wsl|gpu : start the suite's own harness (wsl :31990 software GL, gpu :31991 BOSS GPU Chrome over CDP). Idempotent.
HERE="$(cd "$(dirname "$0")" && pwd)"
export PATH=$HOME/.nvm/versions/node/v24.22.3/bin:$PATH
which=$1; [ "$which" = wsl ] && port=31990 || port=31991
if curl -s -m 2 http://127.0.0.1:$port/ >/dev/null; then echo "$which harness already up on :$port"; exit 0; fi
cd "$HERE"
if [ "$which" = wsl ]; then
  set -a; . <(grep -E '^PENTARYN_HEADLESS' ~/.config/pentaryn/env); set +a
  setsid nohup node wsl.mjs > wsl.log 2>&1 < /dev/null &
else
  GW=$(ip route | awk '/default/{print $3}')
  # this session's own interop socket can be stale (accept4 failed 110): use the first one that answers
  for s in "$WSL_INTEROP" /run/WSL/2_interop $(ls /run/WSL/*_interop 2>/dev/null); do [ -S "$s" ] || continue; if (cd /mnt/c && WSL_INTEROP=$s timeout 8 /mnt/c/Windows/System32/cmd.exe /c ver >/dev/null 2>&1); then export WSL_INTEROP=$s; break; fi; done
  if ! curl -s -m 3 http://$GW:9334/json/version | grep -q Browser; then /home/joe/code/pentaryn/automation/browser-test/wingpu-start.sh || exit 1; fi
  GPU_URL=http://$GW:9334 setsid nohup node gpu.mjs > gpu.log 2>&1 < /dev/null &
fi
for i in $(seq 40); do curl -s -m 2 http://127.0.0.1:$port/ >/dev/null && { echo "$which harness up on :$port"; exit 0; }; sleep 0.5; done
echo "FAILED to start $which harness"; cat "$HERE/$which.log"; exit 1
