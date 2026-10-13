"""ROB-9: ``error_log_since`` must not miss errors after a midnight rollover.

Foundry's error log is one file per day (``error.<YYYY-MM-DD>.log``). The smoke step
marks ``(day, offset)`` before a run and reads "what is new" after each world launch.
A run that crossed midnight read only the start day's file, so every error written to
the next day's file was missed and a broken world could pass the server-side smoke.
Now the tail of the start day's file plus every later day's file (up to today) counts.
"""

from __future__ import annotations

from scripts.foundry.update import admin
from scripts.foundry.update import smoke


def _log(day: str, text: str) -> None:
    admin.LOGS_DIR.mkdir(parents=True, exist_ok=True)
    admin.error_log_path(day).write_text(text, encoding="utf-8")


def test_rob9_errors_after_midnight_are_reported():
    _log("2000-01-01", "old error\nlate error\n")
    _log("2000-01-02", "after midnight\n")
    offset = len("old error\n")

    new = admin.error_log_since(offset, "2000-01-01")

    assert "old error" not in new
    assert "late error" in new
    assert "after midnight" in new


def test_rob9_rollover_with_no_start_day_file():
    # No error before midnight means no start-day file at all; the next day's still counts.
    _log("2000-01-02", "after midnight\n")

    assert "after midnight" in admin.error_log_since(0, "2000-01-01")


def test_rob9_earlier_days_and_other_logs_are_ignored():
    _log("1999-12-31", "yesterday's news\n")
    _log("2000-01-01", "")
    (admin.LOGS_DIR / "debug.2000-01-02.log").write_text("not an error log\n")

    assert admin.error_log_since(0, "2000-01-01") == ""


def test_rob9_same_day_tail_unchanged():
    _log("2000-01-01", "before\nafter\n")

    assert admin.error_log_since(len("before\n"), "2000-01-01") == "after\n"


def test_rob9_next_world_not_blamed_for_post_midnight_errors(monkeypatch):
    """run_all advances the mark after each world; once past midnight, the second world
    must not be handed the first world's post-midnight errors again."""
    _log("2000-01-01", "")
    monkeypatch.setattr(smoke.time, "strftime", lambda *a: "2000-01-02")  # now past midnight
    monkeypatch.setattr(smoke, "_return_to_setup", lambda fa: None)
    seen: list[str] = []

    def fake_smoke(fa, world, *, policy, touched, error_offset, log_day):
        seen.append(admin.error_log_since(error_offset, log_day))
        if world["id"] == "w1":
            _log("2000-01-02", "w1 broke after midnight\n")
        return smoke.WorldResult(world=world["id"])

    monkeypatch.setattr(smoke, "_smoke_one", fake_smoke)
    smoke.run_all(object(), [{"id": "w1"}, {"id": "w2"}], policy={}, touched=set(),
                  error_offset=0, log_day="2000-01-01")

    assert seen == ["", ""]
