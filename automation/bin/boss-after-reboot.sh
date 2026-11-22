#!/usr/bin/env bash
# Bring the Pentaryn table back after a BOSS (Windows) reboot, then report.
# Run inside WSL as joe:  ~/code/pentaryn/automation/bin/boss-after-reboot.sh [--claude <session-id> <remote-name> <prompt>]
# Called from C:\operations-win\NEXT.md by the Windows-side check-in Claude. Safe to run twice.
set -u
REPO="$HOME/code/pentaryn"; cd "$REPO" || exit 1
PY="$REPO/.venv/bin/python"
WORLD="${PENTARYN_DEFAULT_WORLD:-$($PY -m scripts.foundry.host default-world 2>/dev/null || echo pentaryn)}"
say() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }

say "networking mode: $(wslinfo --networking-mode 2>/dev/null || echo '?')"
say "udp buffers: rmem_max=$(sysctl -n net.core.rmem_max) wmem_max=$(sysctl -n net.core.wmem_max)"

# 1. Foundry (systemd user unit) — wait for the HTTP port
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:30000/ && break; sleep 5; done
say "foundryvtt: $(systemctl --user is-active foundryvtt)"

# 2. The world (the unit comes back at /setup) — same snippet as the nightly's relaunch_world
WORLD="$WORLD" timeout 360 "$PY" - <<'EOF'
import os
from scripts.foundry.update.admin import FoundryAdmin
from scripts.foundry.admin_password import foundry_admin_password
world = os.environ["WORLD"]
a = FoundryAdmin(admin_password=foundry_admin_password())
if a.status().world != world:
    a.authenticate()
    a.launch_world(world)
print("  world serving:", a.wait_for_world(world, timeout=300))
EOF

# 3. Tunnel (no unit; started by make). Exactly one connector must exist afterwards.
make -s tunnel-up
sleep 10
CONN=$(timeout 30 cloudflared tunnel info ardenhaven 2>/dev/null | grep -cE '^[0-9a-f]{8}-')
say "tunnel connectors: $CONN (want 1); processes: $(pgrep -fc 'cloudflared .*run ardenhaven')"
say "public: $(curl -s -o /dev/null -w '%{http_code}' https://vtt.atjoseph.com/) (want 302)"
grep -E 'UDP Connectivity|SUMMARY|Initial protocol' .run/cloudflared.log | tail -4

# 4. Headless GM (reconnects and unpauses on its own)
systemctl --user restart foundry-headless-gm
sleep 45
make -s foundry-headless-status 2>&1 | tail -5

# 5. Optionally resume a Claude Code session in tmux with remote control
if [ "${1:-}" = "--claude" ] && [ $# -ge 4 ]; then
  SID="$2"; NAME="$3"; PROMPT="$4"
  if tmux has-session -t "$NAME" 2>/dev/null; then say "tmux session $NAME already running"
  else
    tmux new-session -d -s "$NAME" -c "$REPO" \
      "$HOME/.local/bin/claude --dangerously-skip-permissions --resume $SID --remote-control $NAME $(printf '%q' "$PROMPT")"
    sleep 5; say "claude tmux session: $(tmux has-session -t "$NAME" 2>/dev/null && echo started || echo FAILED)"
  fi
fi
