#!/bin/bash
# Mirror the Foundry grandmaster password from Infisical into the macOS login keychain.
#
# Infisical is the source of truth. This script does not create the secret and has no
# other source for it — if it is not in Infisical, set it there first.
#
#   Project : project-joe  (74f78c84-b0f0-45f9-8b7a-c3e54b0785b2)
#   Env     : dev      Path: /      Name: FOUNDRY_VTT_GRANDMASTER_PW
#
# Why mirror it at all: the consumer is a launchd LaunchAgent firing at 04:06 on a
# Saturday, and the infisical CLI's session is an interactive login that expires. A
# weekly job that silently stops the first time a token lapses is a trap, not
# automation. The login keychain is unlocked for the whole GUI session a LaunchAgent
# runs in, so it answers unattended. Read order at the point of use is
# env -> Infisical -> keychain; see scripts/foundry/admin_password.py.
#
# The value never reaches argv, a log, or stdout:
#   · fetched with `--plain --silent` into a shell variable in this process only;
#   · handed to `security` through `-i`, which reads a command stream on stdin.
#     (`security add-generic-password -w` takes the value as an ARGUMENT and there is
#     no stdin form. `-w -` silently stores a literal "-" — that is exactly what
#     happened on the first attempt: a 22-character password came back as 1 char.)
#
# Usage:  make foundry-admin-push
set -euo pipefail

PROJECT_ID="74f78c84-b0f0-45f9-8b7a-c3e54b0785b2"
ENVIRONMENT="dev"
SECRET_PATH="/"
SECRET_NAME="FOUNDRY_VTT_GRANDMASTER_PW"
KEYCHAIN_SERVICE="pentaryn-foundry-admin"

command -v infisical >/dev/null 2>&1 || {
  echo "  ✗ the infisical CLI is not installed" >&2
  echo "    brew install infisical/get-cli/infisical" >&2
  exit 1
}

# stdin=/dev/null so a lapsed session fails fast instead of dropping into the
# interactive domain-selection prompt and hanging forever.
if ! VALUE="$(infisical secrets get "$SECRET_NAME" \
                --projectId "$PROJECT_ID" --env "$ENVIRONMENT" --path "$SECRET_PATH" \
                --plain --silent < /dev/null 2>/dev/null)"; then
  echo "  ✗ could not read $SECRET_NAME from Infisical." >&2
  echo "    Usually an expired CLI session. Run:  infisical login" >&2
  echo "    Then re-run:  make foundry-admin-push" >&2
  exit 1
fi

VALUE="${VALUE%%$'\n'*}"
[ -n "$VALUE" ] || { echo "  ✗ $SECRET_NAME is empty in Infisical" >&2; exit 1; }
echo "  ▸ read $SECRET_NAME from Infisical (${#VALUE} chars — value not shown)"

# ── macOS login keychain ──
ESCAPED=${VALUE//\\/\\\\}       # backslashes first...
ESCAPED=${ESCAPED//\"/\\\"}     # ...then double quotes, for security's own parser
if printf 'add-generic-password -a "%s" -s "%s" -U -w "%s"\n' \
      "$USER" "$KEYCHAIN_SERVICE" "$ESCAPED" | security -i >/dev/null 2>&1; then
  STORED=$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null | tr -d '\n')
  if [ "${#STORED}" != "${#VALUE}" ]; then
    echo "  ✗ keychain round-trip mismatch (stored ${#STORED} chars, expected ${#VALUE})" >&2
    exit 1
  fi
  echo "  ✓ mirrored to login keychain (service: $KEYCHAIN_SERVICE, ${#STORED} chars verified)"
else
  echo "  ✗ could not write the keychain item" >&2
  exit 1
fi

echo ""
echo "  Verify (prints length and source only, never the value):"
echo "    make foundry-admin-check"
echo ""
echo "  Then tell Foundry itself to use it — the world must be DOWN:"
echo "    make foundry-admin-configure"
