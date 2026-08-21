#!/usr/bin/env python3
"""macOS notifications, in three classes, from the updater's own app identity.

``done``       the weekly "here is what changed" — silent by design.
``attention``  something is held and needs a human: a high-risk migration, a fork
               behind upstream, a core generation bump. Notification + sound.
``failed``     an update broke something and was rolled back. Notification + sound.

All three are ordinary Notification Center posts. They respect Focus and Do Not
Disturb, which is what Joe asked for — the earlier design raised a blocking alert
window for the two urgent classes specifically to get around that, and it is not
wanted. The only difference between the classes now is the sound and the prefix.

They are posted through ``Ardenhaven VTT.app`` rather than bare ``osascript`` so they
carry Foundry's icon and get their own row in System Settings → Notifications, which is
what makes them individually configurable.

If the notifier app has not been built, this degrades to `osascript` (Script Editor's
icon, but a notification still arrives) rather than failing — a run must never die on
its way to telling you what it did.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
NOTIFIER_APP = REPO_ROOT / "automation" / "notifier" / "Ardenhaven VTT.app"
PAYLOAD_PATH = REPO_ROOT / ".state" / "vtt-notify.payload"

# macOS system sounds. "Submarine" carries over a room; "Basso" reads as a failure.
CLASSES = {
    "done":      {"sound": "-",         "modal": False, "prefix": "✅"},
    "attention": {"sound": "Submarine", "modal": False, "prefix": "⚠️"},
    "failed":    {"sound": "Basso",     "modal": False, "prefix": "❌"},
}


def notify(kind: str, subtitle: str, message: str, *, title: str = "Ardenhaven VTT",
           modal: bool | None = None, sound: str | None = None) -> None:
    """Post one notification. Never raises — this is the last thing in a run.

    ``modal=True`` still raises a blocking alert window that Focus cannot suppress. No
    class uses it; it is kept for the case where something genuinely must not be missed
    and you decide the interruption is worth it.
    """
    spec = CLASSES.get(kind, CLASSES["done"])
    use_modal = spec["modal"] if modal is None else modal
    use_sound = sound if sound is not None else spec["sound"]

    # Newlines are the payload's record separator, so they cannot survive in the
    # single-line header fields.
    header_title = f"{spec['prefix']} {title}".replace("\n", " ")
    payload = "\n".join([
        header_title,
        subtitle.replace("\n", " ")[:120],
        use_sound,
        "modal" if use_modal else "-",
        message.strip(),
    ])

    try:
        PAYLOAD_PATH.parent.mkdir(parents=True, exist_ok=True)
        PAYLOAD_PATH.write_text(payload, encoding="utf-8")
    except OSError:
        pass

    if NOTIFIER_APP.exists():
        try:
            # Asynchronous on purpose: a modal alert blocks its own process until
            # someone clicks it, and the run must not wait for that.
            subprocess.Popen(["open", "-a", str(NOTIFIER_APP)],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except OSError:
            pass
    _fallback(header_title, subtitle, message, use_sound, use_modal)


def _fallback(title: str, subtitle: str, message: str, sound: str, modal: bool) -> None:
    """No app bundle: post through osascript. Wrong icon, right information."""
    body = message.strip().replace('"', "'")[:400]
    script = (f'display notification "{body}" with title "{title}" '
              f'subtitle "{subtitle}"')
    if sound != "-":
        script += f' sound name "{sound}"'
    subprocess.run(["osascript", "-e", script], capture_output=True)
    if sound != "-":
        subprocess.Popen(["afplay", f"/System/Library/Sounds/{sound}.aiff"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if modal:
        alert = (f'display alert "{title}" message "{body}" as critical '
                 f'buttons {{"OK"}} default button "OK"')
        subprocess.Popen(["osascript", "-e", alert],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def demo() -> None:
    """Post one of each class, so the permission prompt and the Focus settings can be
    dealt with before a real run depends on them."""
    import time

    notify("done", "weekly update", "3 modules updated, nothing held.\n"
                                    "This is what a quiet Saturday looks like.")
    time.sleep(4)
    notify("attention", "needs you",
           "Foundry 15 is available. A generation change disables every module that "
           "has not been re-verified — this one is a hands-on migration.")
    time.sleep(4)
    notify("failed", "rolled back",
           "dnd5e 5.4.0 failed its smoke test; the world was restored from "
           "world-2026-08-21-060312-fvtt14.365.tar.gz. Nothing else was applied.")
