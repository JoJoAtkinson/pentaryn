#!/bin/bash
# 03:00 nightly: a world left running for days still reaches the cloud every night.
#
#   Foundry up    → close the tunnel, stop Foundry, take the shutdown snapshot and WAIT for
#                   its upload (make vtt-down WAIT=1), start everything again (make vtt-up
#                   FROM=local), relaunch the world that was active, prove it serves.
#   Foundry down  → the stopped-server backup alone (make foundry-backup). Nothing starts.
#
# Started by Windows Task Scheduler through wsl.exe (automation/windows/register-vtt-nightly.ps1),
# so it assumes no shell init at all: PATH, node and the runtime dir are set here.
#
# Refuses, logged and with nothing touched:
#   - another nightly run holding the lock;
#   - an auto-update run (its lock — vtt-up/vtt-down check it themselves too);
#   - anyone connected to the world (a 3am session is not interrupted; FORCE=1 overrides);
#   - a late start outside 02:00–06:59 (StartWhenAvailable fires a missed 03:00 at the next
#     logon/wake, which can be mid-afternoon — the stopped-server backup still runs then;
#     FORCE=1 overrides);
#   - a Foundry whose state cannot be read (port or process live, /api/status failing);
#   - an admin password that cannot be resolved while a world is active — a world that is
#     stopped and then cannot be relaunched leaves players at the setup screen;
#   - this machine not being the primary (the tunnel would be skipped on the alt).
# Once it has stopped anything, an EXIT trap brings Foundry (and the tunnel, if it was
# up) back no matter which later step failed — service first, then the FAILED line.
#
# Log: .state/logs/vtt-nightly-YYYY-MM.log, one line per step; the last line of every run
# is "finished rc=N" (0 ok, 1 failed, 75 refused/skipped). DRY=1 logs the plan, changes nothing.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$REPO/.venv/bin/python"
LOG_DIR="$REPO/.state/logs"
LOG="$LOG_DIR/vtt-nightly-$(date +%Y-%m).log"
LOCK="$REPO/.run/vtt-nightly.lock"
DRY="${DRY:-}"
FORCE="${FORCE:-}"

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
NVM_BIN=$(for d in "$HOME"/.nvm/versions/node/v*/bin; do [ -d "$d" ] && echo "$d"; done | sort -V | tail -n 1)
if [ -n "$NVM_BIN" ]; then PATH="$NVM_BIN:$PATH"; fi
# systemctl --user (PENTARYN_START_CMD/STOP_CMD) needs the user manager's bus.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
# No terminal: the boot choice must never restore (FROM=local below too), nothing may prompt.
export PENTARYN_NONINTERACTIVE=1

mkdir -p "$LOG_DIR" "$REPO/.run"
cd "$REPO" || exit 1
# Everything, bash's own errors included, goes to the log: under Task Scheduler stdout is a
# console nobody reads, and one that is gone (wsl.exe killed) must not SIGPIPE the trap.
exec >>"$LOG" 2>&1

log() { echo "$(date '+%F %T %z') [$$] $*" >> "$LOG"; }

# step <label> <timeout-seconds> <command...>: run, append its output to the log, log rc.
step() {
  local label="$1" secs="$2"; shift 2
  log "▸ $label: $*"
  if [ -n "$DRY" ]; then log "  (dry run — not run)"; return 0; fi
  timeout --kill-after=30 "$secs" "$@" >> "$LOG" 2>&1
  local rc=$?
  if [ $rc -eq 124 ] || [ $rc -eq 137 ]; then log "  ✗ $label timed out after ${secs}s"
  elif [ $rc -ne 0 ]; then log "  ✗ $label failed rc=$rc"
  else log "  ✓ $label"; fi
  return $rc
}

RC=0
STOPPED=""        # set once anything has been taken down — the trap's cue
TUNNEL_WAS_UP=""
RESTARTED=""

finish() {
  # A second signal must not abort the recovery below (an exit inside the EXIT trap ends
  # it). A handler, not '' — an ignored signal would be inherited by the recovery's children.
  trap 'log "! signal during recovery — ignored"' INT TERM HUP
  if [ -n "$STOPPED" ] && [ -z "$RESTARTED" ]; then
    log "! restoring service after a failure"
    if [ -n "$TUNNEL_WAS_UP" ]; then step "recovery vtt-up" 600 make --no-print-directory vtt-up FROM=local
    else step "recovery foundry-up" 600 make --no-print-directory foundry-up FROM=local; fi
    [ $? -eq 0 ] || log "✗ FAILED: Foundry could not be brought back — run make vtt-up by hand"
    RC=1
  fi
  [ -n "$LOCK_FD" ] && exec {LOCK_FD}>&-
  log "finished rc=$RC"
  exit $RC
}
LOCK_FD=""

log "── nightly starting (host $(hostname), ${DRY:+DRY RUN, }user $(id -un)) ──"

# BOSS/WSL only: the named-fd lock below is bash 4+ (the Mac's /bin/bash is 3.2 and would die
# on it unlogged), and flock/timeout are not on macOS without Homebrew's coreutils/util-linux.
if [ "$(uname -s)" != Linux ] || ! command -v flock >/dev/null || ! command -v timeout >/dev/null; then
  log "skipped: the nightly is BOSS/WSL-only (needs Linux, flock, timeout)"
  log "finished rc=75"; exit 75
fi

exec {LOCK_FD}>"$LOCK"
if ! flock -n "$LOCK_FD"; then
  log "skipped: another nightly run holds $LOCK"
  RC=75; LOCK_FD=""; log "finished rc=$RC"; exit $RC
fi
trap finish EXIT
trap 'log "! interrupted"; RC=1; exit 1' INT TERM HUP

if [ ! -x "$PY" ]; then log "✗ FAILED: no venv python at $PY"; RC=1; exit 1; fi
ROLE=$("$PY" -m scripts.foundry.host role 2>>"$LOG")
if [ "$ROLE" != primary ]; then
  log "skipped: this host is '$ROLE', not the primary — the nightly runs on the primary only"
  RC=75; exit 75
fi
if [ -d "$REPO/.state/vtt-update.lock" ]; then
  log "skipped: an auto-update run is in progress (.state/vtt-update.lock)"
  RC=75; exit 75
fi

# What is running right now. /api/status needs no password.
# "down" only when neither the port nor the process is there: a Foundry that is starting,
# restarting (Restart=on-failure) or answering 5xx is "unknown", and nothing is touched —
# the stopped-server backup must never tar a world a live process may be opening.
STATUS=$("$PY" - 2>>"$LOG" <<'EOF'
try:
    from scripts.foundry.update.admin import FoundryAdmin, port_open, process_running
except Exception:
    print("unknown - -")
    raise SystemExit(0)
try:
    s = FoundryAdmin().status()
    print("up", s.world or "-", s.users if s.users is not None else 0)
except Exception:
    print("down - 0" if not port_open() and not process_running() else "unknown - -")
EOF
)
read -r FOUNDRY WORLD USERS <<<"${STATUS:-unknown - -}"
PIDFILE="$REPO/.run/cloudflared.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then TUNNEL_WAS_UP=1; fi
log "state: foundry=$FOUNDRY world=$WORLD users=$USERS tunnel=$([ -n "$TUNNEL_WAS_UP" ] && echo up || echo down)"

if [ "$FOUNDRY" != up ] && [ "$FOUNDRY" != down ]; then
  log "✗ FAILED: Foundry's state could not be read (port or process live, /api/status failing)"
  log "  — nothing touched"
  RC=1; exit 1
fi

if [ "$FOUNDRY" = down ]; then
  step "backup (server already stopped)" 1800 make --no-print-directory foundry-backup REASON=nightly || RC=1
  [ $RC -eq 0 ] || log "✗ FAILED: backup of the stopped server"
  exit $RC
fi

# Fail closed: anything but a plain integer counts as "someone may be connected".
case "$USERS" in ''|*[!0-9]*)
  if [ -z "$FORCE" ]; then
    log "skipped: connected-user count unreadable ('$USERS') — not risking a session (FORCE=1 overrides)"
    RC=75; exit 75
  fi
  USERS=0 ;;
esac
if [ "$USERS" -gt 0 ] && [ -z "$FORCE" ]; then
  log "skipped: $USERS user(s) connected to $WORLD — not interrupting a session (FORCE=1 overrides)"
  RC=75; exit 75
fi

HOUR=$(date +%-H)
if { [ "$HOUR" -lt 2 ] || [ "$HOUR" -ge 7 ]; } && [ -z "$FORCE" ] && [ -n "$DRY" ]; then
  log "  (dry run — started outside the 02:00–06:59 window; a real run would skip here)"
elif { [ "$HOUR" -lt 2 ] || [ "$HOUR" -ge 7 ]; } && [ -z "$FORCE" ]; then
  log "skipped: started at $(date +%H:%M), outside the 02:00–06:59 window (a missed 03:00 run"
  log "  caught up late) — not restarting a server people may be about to use (FORCE=1 overrides)"
  RC=75; exit 75
fi

# The relaunch needs the admin password: prove it resolves BEFORE taking a world down. The
# same lookup the relaunch makes (it prints source and length only, never the value).
if [ "$WORLD" != "-" ]; then
  if ! timeout 90 "$PY" -m scripts.foundry.admin_password </dev/null >>"$LOG" 2>&1; then
    log "✗ FAILED: the Foundry admin password did not resolve (Infisical auth for $(id -un)?) —"
    log "  nothing touched: $WORLD stays up, but it could not be relaunched after a restart."
    log "  Fix: check the machine identity (WSLENV) or run infisical login in WSL."
    RC=1; exit 1
  fi
fi

# ── stop + backup (WAIT=1: the upload finishes before anything restarts) ──
STOPPED=1
if [ -n "$TUNNEL_WAS_UP" ]; then
  step "stop + backup" 2400 make --no-print-directory vtt-down WAIT=1 || RC=1
else
  step "stop + backup" 2400 make --no-print-directory foundry-down WAIT=1 || RC=1
fi
[ $RC -eq 0 ] || log "✗ FAILED: stop or backup — restarting anyway"

# ── start again ──
if [ -n "$TUNNEL_WAS_UP" ]; then
  step "start" 600 make --no-print-directory vtt-up FROM=local
else
  step "start" 600 make --no-print-directory foundry-up FROM=local
fi
if [ $? -eq 0 ]; then RESTARTED=1; else RC=1; exit 1; fi   # the trap retries once

# ── relaunch the world that was active (needs the admin password from Infisical) ──
if [ "$WORLD" != "-" ] && [ -z "$DRY" ]; then
  log "▸ relaunch world $WORLD"
  if WORLD="$WORLD" timeout 360 "$PY" - >>"$LOG" 2>&1 <<'EOF'
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
  then log "  ✓ $WORLD is serving"
  else log "✗ FAILED: world $WORLD did not relaunch — Foundry is up; launch it from /setup"; RC=1
  fi
elif [ -n "$DRY" ]; then
  log "▸ relaunch world $WORLD (dry run — not run)"
fi

[ $RC -eq 0 ] && log "✓ nightly complete"
exit $RC
