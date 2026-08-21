#!/bin/bash
# Build "Ardenhaven VTT.app" — the identity the updater's notifications are posted under.
#
# Why an app bundle at all: macOS attributes a notification to the process that posts
# it, and a bare `osascript` posts as Script Editor. Giving the updater its own bundle
# means the notification carries Foundry's icon, and — more usefully — the updater gets
# its OWN row in System Settings → Notifications, so it can be set to persistent Alerts
# and added to a Focus allow-list independently of anything else.
#
# The icon is Foundry's own icns, copied from the installed app. If Foundry is not
# installed the build still succeeds with the default applet icon.
#
# Idempotent: safe to re-run. Rebuild after editing notifier.applescript.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Ardenhaven VTT"
APP="$HERE/$APP_NAME.app"
SRC="$HERE/notifier.applescript"
BUNDLE_ID="com.pentaryn.ardenhaven-vtt"
FOUNDRY_ICNS="/Applications/Foundry Virtual Tabletop.app/Contents/Resources/icon.icns"

[ -f "$SRC" ] || { echo "  ✗ missing $SRC" >&2; exit 1; }

REPO="$(cd "$HERE/../.." && pwd)"   # automation/notifier -> automation -> repo root
PAYLOAD="$REPO/.state/vtt-notify.payload"

# The applet reads its payload from a file (an osacompiled applet receives neither argv
# nor `open --args`; both were tested and arrive empty). Bake in this checkout's real
# path rather than shipping a guess about where the repo lives.
BUILD_SRC="$(mktemp -t notifier).applescript"
trap 'rm -f "$BUILD_SRC"' EXIT
sed "s|@@PAYLOAD_PATH@@|$PAYLOAD|" "$SRC" > "$BUILD_SRC"

rm -rf "$APP"
osacompile -o "$APP" "$BUILD_SRC"
echo "  ✓ compiled $APP_NAME.app  (payload: $PAYLOAD)"

PLIST="$APP/Contents/Info.plist"
# osacompile does NOT write a CFBundleIdentifier, so this is Add-not-Set. Without it the
# app has no stable identity and cannot get its own notification settings row.
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $BUNDLE_ID" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleName $APP_NAME" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleName string $APP_NAME" "$PLIST"
# Keep it out of the Dock and the app switcher — it exists to post and quit.
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :LSUIElement true" "$PLIST"

if [ -f "$FOUNDRY_ICNS" ]; then
  cp "$FOUNDRY_ICNS" "$APP/Contents/Resources/applet.icns"
  echo "  ✓ icon ← Foundry's own icon.icns"
else
  echo "  ▸ Foundry not installed — keeping the default applet icon"
fi

# Ad-hoc signature: the bundle was edited after osacompile signed it, and an app with a
# broken seal can be refused at launch.
codesign --force --deep -s - "$APP" >/dev/null 2>&1 && echo "  ✓ re-signed (ad-hoc)"

# Register with LaunchServices so `open -a` finds it by name and Notification Center
# knows the bundle exists before the first post.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$APP" 2>/dev/null || true

echo ""
echo "  Built: $APP"
echo ""
echo "  ONE-TIME, BY HAND (nothing can do these for you):"
echo "    1. Run:  python -m scripts.foundry.update.cli notify --demo"
echo "       Approve the notification permission prompt the first time."
echo "    2. System Settings → Notifications → '$APP_NAME'"
echo "         · style: Alerts   (persistent — banners vanish after a few seconds)"
echo "         · turn on: Play sound, Show on Lock Screen"
echo ""
echo "  These are ordinary notifications and respect Focus. If you want them to reach"
echo "  you through a Focus, add '$APP_NAME' to that Focus's allowed apps."
