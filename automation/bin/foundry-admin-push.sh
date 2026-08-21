#!/bin/bash
# Publish the Foundry administrator password to Infisical and the macOS login keychain.
#
# Source of the value: FVT_GRANDMASTER_PW in this repo's .env (gitignored, never
# committed — verified). This script is the only thing that reads it, and it never
# prints it, never echoes it, and never puts it in a command line:
#
#   · Infisical gets it through `secrets set --file`, so the value travels in a
#     0600 temp file rather than in argv, where `ps` would show it to any process.
#   · The keychain gets it on stdin via `-w -` for the same reason.
#
# Two destinations on purpose. Infisical is the source of truth and the cross-machine
# store; the keychain copy is what keeps the unattended 04:06 job working when the
# Infisical CLI's interactive session expires — which it had already done on this
# machine while this was being written.
#
# Usage:  make foundry-admin-push
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$REPO/.env"
SRC_VAR="FVT_GRANDMASTER_PW"
DEST_VAR="FOUNDRY_ADMIN_PASSWORD"
KEYCHAIN_SERVICE="pentaryn-foundry-admin"

[ -f "$ENV_FILE" ] || { echo "  ✗ no $ENV_FILE" >&2; exit 1; }
grep -q "^${SRC_VAR}=" "$ENV_FILE" || {
  echo "  ✗ $SRC_VAR is not set in $ENV_FILE" >&2; exit 1; }

# Read it into a variable in this shell only. `set +x` is already the default; the
# value is never expanded into a command line below.
# shellcheck disable=SC1090
VALUE="$(grep -m1 "^${SRC_VAR}=" "$ENV_FILE" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
[ -n "$VALUE" ] || { echo "  ✗ $SRC_VAR is empty" >&2; exit 1; }
echo "  ▸ read $SRC_VAR from .env (${#VALUE} chars — value not shown)"

TMP="$(mktemp -t fvtadmin)"
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT
printf '%s=%s\n' "$DEST_VAR" "$VALUE" > "$TMP"

# ── Infisical ──
if infisical secrets set --file "$TMP" --silent >/dev/null 2>&1; then
  echo "  ✓ $DEST_VAR → Infisical"
else
  echo "  ▸ Infisical refused (usually an expired session)."
  echo "    Run: infisical login    then re-run: make foundry-admin-push"
  echo "    The keychain copy below is written regardless, so the job still works."
fi

# ── macOS login keychain ──
# `security add-generic-password -w` takes the value as an ARGUMENT — there is no
# stdin form, and `-w -` silently stores a literal "-" (which is exactly what happened
# on the first attempt: a 22-character password came back as 1 character). The way to
# keep it out of argv is `security -i`, which reads a command stream on stdin.
ESCAPED=${VALUE//\\/\\\\}       # backslashes first...
ESCAPED=${ESCAPED//\"/\\\"}     # ...then double quotes, for security's own parser
if printf 'add-generic-password -a "%s" -s "%s" -U -w "%s"\n' \
      "$USER" "$KEYCHAIN_SERVICE" "$ESCAPED" | security -i >/dev/null 2>&1; then
  STORED=$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null | tr -d '\n')
  if [ "${#STORED}" != "${#VALUE}" ]; then
    echo "  ✗ keychain round-trip mismatch (stored ${#STORED} chars, expected ${#VALUE})" >&2
    exit 1
  fi
  echo "  ✓ $DEST_VAR → login keychain (service: $KEYCHAIN_SERVICE, ${#STORED} chars verified)"
else
  echo "  ✗ could not write the keychain item" >&2
  exit 1
fi

echo ""
echo "  Verify (prints length only, never the value):"
echo "    make foundry-admin-check"
echo ""
echo "  Then tell Foundry itself to use it — the world must be DOWN:"
echo "    make foundry-admin-configure"
