#!/usr/bin/env bash
# Install the headless Assistant-GM bot on this host (BOSS / Linux). Idempotent; re-run it
# to pick up a newer chrome-headless-shell or a changed unit file.
# Use-doc: context/foundry/headless-gm.md · make target: foundry-headless-install
#
#   1. node deps (puppeteer-core, @puppeteer/browsers) — npm install in this folder
#   2. chrome-headless-shell → ~/.cache/pentaryn-chrome
#   3. Chrome's missing system libraries (libnss3, libnspr4, libasound2t64):
#        default  — `apt-get download` + `dpkg-deb -x` into ~/.cache/pentaryn-chrome/root (no sudo)
#        APT=1    — `sudo apt-get install` them system-wide instead
#   4. PENTARYN_HEADLESS_CHROME / PENTARYN_HEADLESS_LIBS → ~/.config/pentaryn/env
#   5. the systemd --user unit, rendered with this checkout's path; enable --now
#      (NO_START=1 installs and enables without starting)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CACHE="${PENTARYN_CHROME_CACHE:-$HOME/.cache/pentaryn-chrome}"
ENV_FILE="${PENTARYN_ENV_FILE:-$HOME/.config/pentaryn/env}"
UNIT=foundry-headless-gm
UNIT_SRC="$REPO/automation/systemd/$UNIT.service"
UNIT_DST="$HOME/.config/systemd/user/$UNIT.service"
LIB_PKGS=(libnss3 libnspr4 libasound2t64)

say() { echo "  $*"; }

[ "$(uname -s)" = Linux ] || { say "✗ the headless GM runs on the Linux host (BOSS) only"; exit 1; }

NODE="${PENTARYN_NODE:-$(command -v node || true)}"
[ -x "$NODE" ] || { say "✗ no node (set PENTARYN_NODE in $ENV_FILE)"; exit 1; }
NPM="$(dirname "$NODE")/npm"; [ -x "$NPM" ] || NPM="$(command -v npm)"
export PATH="$(dirname "$NODE"):$PATH"

say "▸ node deps"
# npm install, not ci: this repo gitignores package-lock.json
(cd "$HERE" && "$NPM" install --no-audit --no-fund --silent)

say "▸ chrome-headless-shell"
line=$(cd "$HERE" && "$NODE" node_modules/@puppeteer/browsers/lib/cjs/main-cli.js \
         install chrome-headless-shell@stable --path "$CACHE" | tail -n 1)
CHROME="${line#* }"
[ -x "$CHROME" ] || { say "✗ could not resolve the chrome binary from: $line"; exit 1; }
say "  $CHROME"

say "▸ system libraries: ${LIB_PKGS[*]}"
LIBS=""
if [ -n "${APT:-}" ]; then
  sudo apt-get install -y "${LIB_PKGS[@]}" fonts-liberation
elif ! ldd "$CHROME" | grep -q "not found"; then
  say "  already present system-wide"
else
  mkdir -p "$CACHE/debs" "$CACHE/root"
  (cd "$CACHE/debs" && rm -f ./*.deb && apt-get download "${LIB_PKGS[@]}" >/dev/null)
  for d in "$CACHE"/debs/*.deb; do dpkg-deb -x "$d" "$CACHE/root"; done
  LIBS="$CACHE/root/usr/lib/x86_64-linux-gnu"
  say "  unpacked to $LIBS (no sudo; APT=1 installs them system-wide instead)"
fi
missing=$(LD_LIBRARY_PATH="${LIBS}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" ldd "$CHROME" | grep "not found" || true)
[ -z "$missing" ] || { say "✗ chrome still lacks: $missing"; exit 1; }

# set_key KEY VALUE: replace or append one line of the env file (never a secret).
set_key() {
  mkdir -p "$(dirname "$ENV_FILE")"; touch "$ENV_FILE"
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}
say "▸ $ENV_FILE"
grep -q "headless Assistant-GM" "$ENV_FILE" 2>/dev/null \
  || printf '\n# The headless Assistant-GM bot (make foundry-headless-install writes these).\n' >> "$ENV_FILE"
set_key PENTARYN_HEADLESS_CHROME "$CHROME"
if [ -n "$LIBS" ]; then set_key PENTARYN_HEADLESS_LIBS "$LIBS"; fi
grep -q "^PENTARYN_NODE=" "$ENV_FILE" || set_key PENTARYN_NODE "$NODE"

say "▸ systemd --user unit $UNIT"
mkdir -p "$(dirname "$UNIT_DST")"
sed "s|@REPO@|$REPO|g" "$UNIT_SRC" > "$UNIT_DST"
systemctl --user daemon-reload
if [ -n "${NO_START:-}" ]; then
  systemctl --user enable "$UNIT"
else
  systemctl --user enable "$UNIT"
  systemctl --user restart "$UNIT"
fi
linger=$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || echo unknown)
[ "$linger" = yes ] || say "! linger is $linger — run: sudo loginctl enable-linger $(id -un)"
say "✓ installed — make foundry-headless-status"
