"""M9: the adjudicator prompt and the core-hold reason must name the real schedule.

The launchd plist fires the updater on Saturdays at 04:06, but ``adjudicate.SYSTEM_RULES``
told the model it was grading for "an unattended 06:00 Saturday job" and
``risk.classify_core``'s generation-change reason said "not at 06:00". The time is read
from the plist here, so a future reschedule that forgets either string fails this test.
"""

from __future__ import annotations

import plistlib
from pathlib import Path

from scripts.foundry.update import adjudicate, risk

PLIST = (Path(__file__).resolve().parents[2]
         / "automation" / "launchd" / "com.pentaryn.vtt-update.plist")


def _scheduled_time() -> str:
    cal = plistlib.loads(PLIST.read_bytes())["StartCalendarInterval"]
    assert cal["Weekday"] == 6  # Saturday
    return f"{cal['Hour']:02d}:{cal['Minute']:02d}"


def test_adjudicator_prompt_names_the_scheduled_time():
    when = _scheduled_time()
    assert "06:00" not in adjudicate.SYSTEM_RULES
    assert f"{when} Saturday" in adjudicate.SYSTEM_RULES


def test_generation_change_hold_reason_names_the_scheduled_time():
    when = _scheduled_time()
    d = risk.classify_core("13.351", {"version": "14.340"}, None, policy={})
    assert d.bucket == risk.HOLD
    reason = " ".join(d.reasons)
    assert "06:00" not in reason
    assert f"not at {when}" in reason
