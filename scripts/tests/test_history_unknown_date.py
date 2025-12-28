from __future__ import annotations

from pathlib import Path

import pytest

from scripts.timeline_svg.history_render import _read_history_rows


def test_read_history_rows_accepts_unknown_date(tmp_path: Path) -> None:
    path = tmp_path / "_history.tsv"
    path.write_text(
        "event_id\ttags\tdate\tduration\ttitle\tsummary\n"
        "e1\tpublic\t???\t0\tUnknown Thing\tHappened sometime.\n",
        encoding="utf-8",
    )
    rows = _read_history_rows(path)
    assert len(rows) == 1
    assert rows[0]["date_unknown"] is True


def test_read_history_rows_accepts_tbd_date(tmp_path: Path) -> None:
    path = tmp_path / "_history.tsv"
    path.write_text(
        "event_id\ttags\tdate\tduration\ttitle\tsummary\n"
        "e1\tpublic\tTBD\t0\tUnknown Thing\tHappened sometime.\n",
        encoding="utf-8",
    )
    rows = _read_history_rows(path)
    assert rows[0]["date_unknown"] is True


def test_read_history_rows_rejects_invalid_date(tmp_path: Path) -> None:
    path = tmp_path / "_history.tsv"
    path.write_text(
        "event_id\ttags\tdate\tduration\ttitle\tsummary\n"
        "e1\tpublic\tnot-a-date\t0\tBad\tNope.\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError):
        _read_history_rows(path)
