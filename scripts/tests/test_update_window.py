"""The update window gate must report what it measured, and nothing else.

On 2026-08-22 the job fired dead on schedule at 04:06:05, hung 5h17m on an invisible
TCC consent dialog, and was then declined by a gate whose message asserted "a run
launchd deferred from a sleeping Mac" — a cause it had never measured. The Mac was
plugged in and awake all night. These tests pin the distinction.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from scripts.foundry.update import apply

POLICY = {"window": {"earliest": "03:30", "latest": "09:00"}}


@pytest.fixture(autouse=True)
def _clear(monkeypatch):
    monkeypatch.delenv("VTT_UPDATE_LAUNCHED_AT", raising=False)
    apply.drain_window_notes()


def _at(hour, minute=0):
    return datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)


def _freeze(monkeypatch, when):
    class _DT(datetime):
        @classmethod
        def now(cls, tz=None):
            return when
    monkeypatch.setattr(apply, "datetime", _DT)


def test_started_and_checked_in_window_is_allowed(monkeypatch):
    monkeypatch.setenv("VTT_UPDATE_LAUNCHED_AT", str(_at(4, 6).timestamp()))
    _freeze(monkeypatch, _at(4, 8))
    apply._check_window(POLICY)  # no exception


def test_started_outside_the_window_is_a_deferral(monkeypatch):
    """The case the gate was actually built for: a missed job running on wake."""
    monkeypatch.setenv("VTT_UPDATE_LAUNCHED_AT", str(_at(14, 30).timestamp()))
    _freeze(monkeypatch, _at(14, 31))
    with pytest.raises(apply.Aborted) as exc:
        apply._check_window(POLICY)
    msg = str(exc.value)
    assert "started this run at 14:30" in msg
    assert "outside" in msg


def test_started_on_time_but_checked_late_is_reported_as_blocked(monkeypatch):
    """2026-08-22 exactly. This must NOT say the Mac was asleep."""
    monkeypatch.setenv("VTT_UPDATE_LAUNCHED_AT", str(_at(4, 6).timestamp()))
    _freeze(monkeypatch, _at(9, 22))
    with pytest.raises(apply.Aborted) as exc:
        apply._check_window(POLICY)
    msg = str(exc.value)
    assert "STARTED ON TIME at 04:06" in msg
    assert "5h16m" in msg or "5h" in msg
    assert "blocked, not deferred" in msg
    assert "asleep" not in msg.lower(), "must not assert an unmeasured cause"
    assert "defer" not in msg.replace("not deferred", "").lower()


def test_missing_launch_time_says_so_rather_than_guessing(monkeypatch):
    _freeze(monkeypatch, _at(14, 30))
    with pytest.raises(apply.Aborted) as exc:
        apply._check_window(POLICY)
    msg = str(exc.value)
    assert "Launch time was not recorded" in msg
    assert "asleep" not in msg.lower()


def test_missing_launch_time_in_window_still_allowed(monkeypatch):
    _freeze(monkeypatch, _at(4, 30))
    apply._check_window(POLICY)


def test_a_long_but_in_window_stall_leaves_a_note(monkeypatch):
    monkeypatch.setenv("VTT_UPDATE_LAUNCHED_AT", str(_at(4, 0).timestamp()))
    _freeze(monkeypatch, _at(4, 40))
    apply._check_window(POLICY)
    notes = apply.drain_window_notes()
    assert notes and "40m later" in notes[0]
    assert apply.drain_window_notes() == [], "draining must empty the buffer"


def test_no_gate_message_blames_sleep_without_measuring_it():
    """A blanket guard: the string that caused this must not come back."""
    src = (apply.__file__).replace(".pyc", ".py")
    text = open(src, encoding="utf-8").read()
    # It may appear in the explanatory docstring, but never inside a raised message.
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(("raise Aborted", 'f"', '"')) and "deferred from a sleeping" in stripped:
            raise AssertionError(f"unmeasured cause asserted in a gate message: {line}")
