#!/usr/bin/env bash
# Sanity-check a combat-runner party roster before the GUI loads it.
#
#   ./scripts/check-roster.sh <roster.yml>            # warn, but continue
#   ./scripts/check-roster.sh <roster.yml> --report   # one-line status, no warn
#
# Checks:
#   - file exists
#   - no PLACEHOLDER entries left in it
#   - every `id` is a repeated-digit string ("1", "22", "333"), because the
#     GUI's `<who> <stream>` grammar cannot address anything else
#
# Never blocks a launch — a warning at the table beats a refusal.

set -uo pipefail

ROSTER="${1:-}"
MODE="${2:-warn}"

if [[ -z "$ROSTER" ]]; then
  echo "usage: $0 <roster.yml> [--report]" >&2
  exit 2
fi

name="$(basename "$(dirname "$ROSTER")")"

if [[ ! -f "$ROSTER" ]]; then
  if [[ "$MODE" == "--report" ]]; then
    printf '  %-22s MISSING (%s)\n' "$name" "$ROSTER"
  else
    echo "⚠️  roster not found: $ROSTER" >&2
  fi
  exit 0
fi

players=$(grep -cE '^\s*-\s*\{' "$ROSTER" || true)
placeholders=$(grep -ciE 'PLACEHOLDER' "$ROSTER" || true)

# Collect ids that are not all-one-repeated-digit.
bad_ids=""
while read -r id; do
  [[ -z "$id" ]] && continue
  first="${id:0:1}"
  if [[ ! "$id" =~ ^${first}+$ ]] || [[ ! "$id" =~ ^[0-9]+$ ]]; then
    bad_ids="$bad_ids $id"
  fi
done < <(grep -oE 'id:[[:space:]]*"[^"]+"' "$ROSTER" | sed -E 's/.*"([^"]+)".*/\1/')

if [[ "$MODE" == "--report" ]]; then
  status="ready"
  [[ "$placeholders" -gt 0 ]] && status="PLACEHOLDERS"
  [[ -n "$bad_ids" ]] && status="BAD IDS:$bad_ids"
  printf '  %-22s %-2s players   %s\n' "$name" "$players" "$status"
  exit 0
fi

if [[ "$placeholders" -gt 0 ]]; then
  echo "⚠️  $ROSTER still has PLACEHOLDER entries — PC tabs will show fake names and HP." >&2
fi
if [[ -n "$bad_ids" ]]; then
  echo "⚠️  $ROSTER has non-repeated-digit id(s):$bad_ids — those PCs can't be addressed by the command grammar." >&2
fi

exit 0
