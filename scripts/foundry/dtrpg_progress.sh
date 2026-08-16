#!/usr/bin/env bash
# Progress monitor for the DriveThruRPG Library App sync.
#
# The app lays downloads out as  ~/Documents/DriveThruRPG/<Publisher>/<Product>/<files>
# so "items" == product directories. The library reports 536 items, but one of those is the
# bundle wrapper itself, which ships no files and therefore creates no folder. 535 is complete.
#
# Usage: dtrpg_progress.sh [--target N]   (default target 535)
# Exit codes: 0 = still running, 10 = complete, 20 = stalled (no growth since last run)

set -euo pipefail

ROOT="$HOME/Documents/DriveThruRPG"
STATE="$HOME/.cache/dtrpg-sync-state"
TARGET="${2:-535}"

mkdir -p "$(dirname "$STATE")"
[ -d "$ROOT" ] || { echo "MISSING: $ROOT does not exist"; exit 1; }

products=$(find "$ROOT" -mindepth 2 -maxdepth 2 -type d 2>/dev/null | wc -l | tr -d ' ')
files=$(find "$ROOT" -type f ! -name '.*' 2>/dev/null | wc -l | tr -d ' ')
bytes=$(du -sk "$ROOT" 2>/dev/null | cut -f1)
human=$(du -sh "$ROOT" 2>/dev/null | cut -f1)
publishers=$(find "$ROOT" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
# partial/in-flight files the app hasn't finished writing
partial=$(find "$ROOT" -type f \( -name '*.part' -o -name '*.download' -o -name '*.tmp' \) 2>/dev/null | wc -l | tr -d ' ')
# most recent write, as a staleness signal
last_write=$(find "$ROOT" -type f -newermt '-15 minutes' 2>/dev/null | wc -l | tr -d ' ')

prev_products=0; prev_bytes=0
if [ -f "$STATE" ]; then
  # shellcheck disable=SC1090
  . "$STATE"
  prev_products="${PRODUCTS:-0}"; prev_bytes="${BYTES:-0}"
fi

delta_products=$((products - prev_products))
delta_mb=$(( (bytes - prev_bytes) / 1024 ))
pct=$(( products * 100 / TARGET ))

printf 'DTRPG SYNC  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
printf '  products   %s / %s  (%s%%)   +%s since last check\n' "$products" "$TARGET" "$pct" "$delta_products"
printf '  files      %s\n' "$files"
printf '  size       %s   (+%s MB since last check)\n' "$human" "$delta_mb"
printf '  publishers %s\n' "$publishers"
printf '  in-flight  %s partial files, %s files written in last 15 min\n' "$partial" "$last_write"

cat > "$STATE" <<EOF
PRODUCTS=$products
FILES=$files
BYTES=$bytes
CHECKED=$(date '+%Y-%m-%dT%H:%M:%S')
EOF

if [ "$products" -ge "$TARGET" ] && [ "$partial" -eq 0 ]; then
  echo "  STATUS     COMPLETE"
  exit 10
fi
if [ "$delta_products" -eq 0 ] && [ "$delta_mb" -eq 0 ] && [ "$last_write" -eq 0 ] && [ "$prev_products" -gt 0 ]; then
  echo "  STATUS     STALLED — no new products, no new bytes, nothing written in 15 min"
  exit 20
fi
echo "  STATUS     RUNNING"
exit 0
