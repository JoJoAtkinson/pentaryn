import os

import pytest

import scripts.ages_converter as ages_module
from scripts.ages_converter import _parse_age_label, age_to_year, convert_auto
from scripts.timeline_svg.ages import AgeIndex, AgeWindow


def _test_index() -> AgeIndex:
    return AgeIndex(
        ages=(
            AgeWindow(event_id="age-a", title="⟂ Age A", glyph="⟂", start_year=0, end_year=1499),
            AgeWindow(event_id="age-b", title="ᛏ Age B", glyph="ᛏ", start_year=3950, end_year=4276),
            AgeWindow(event_id="age-c", title="⋈ Age C", glyph="⋈", start_year=4277, end_year=None),
        )
    )


def test_age_to_year_negative_offset_counts_from_age_end() -> None:
    idx = _test_index()
    label = _parse_age_label("ᛏ-50")
    assert label is not None
    assert age_to_year(label=label, index=idx, present_year=4327) == 4227


def test_age_to_year_negative_offset_current_age_counts_from_present_year() -> None:
    idx = _test_index()
    label = _parse_age_label("⋈-50")
    assert label is not None
    assert age_to_year(label=label, index=idx, present_year=4327) == 4277


def test_convert_auto_negative_year_resolves_relative_to_present_year() -> None:
    idx = _test_index()
    assert convert_auto(value="-50", index=idx, present_year=4327) == "4277"


# ---------------------------------------------------------------------------
# A3-E4: age_to_year must raise on out-of-window offsets rather than returning
# nonsensical, non-idempotent years.
# ---------------------------------------------------------------------------


def test_age_to_year_positive_offset_past_closed_age_end_raises() -> None:
    idx = _test_index()
    # Age ᛏ spans 3950-4276 (max offset 326). 5000 overruns the window.
    label = _parse_age_label("ᛏ5000")
    assert label is not None
    with pytest.raises(ValueError, match="past the end of age"):
        age_to_year(label=label, index=idx, present_year=4327)


def test_age_to_year_negative_offset_before_age_start_raises() -> None:
    idx = _test_index()
    # Age ⟂ starts at 0; a -5000 offset reaches before the calendar's first year.
    label = _parse_age_label("⟂-5000")
    assert label is not None
    with pytest.raises(ValueError, match="before the start of age"):
        age_to_year(label=label, index=idx, present_year=4327)


def test_age_to_year_positive_offset_in_window_still_ok() -> None:
    idx = _test_index()
    # Boundary: max offset for ᛏ (3950-4276) is exactly 326.
    label = _parse_age_label("ᛏ326")
    assert label is not None
    assert age_to_year(label=label, index=idx, present_year=4327) == 4276


def test_age_to_year_open_age_offset_past_present_year_raises() -> None:
    idx = _test_index()
    # Age ⋈ is open-ended (end_year=None); offsets past present_year are invalid.
    label = _parse_age_label("⋈9999")
    assert label is not None
    with pytest.raises(ValueError, match="past present_year"):
        age_to_year(label=label, index=idx, present_year=4327)


# ---------------------------------------------------------------------------
# B3-F7: _get_age_state mtime cache — editing a backing file produces a fresh
# result; an unchanged file returns the cached value.
# ---------------------------------------------------------------------------


class TestAgeStateMtimeCache:
    @pytest.fixture
    def patched_state(self, tmp_path, monkeypatch):
        """Point the cache's backing-file constants at writable temp files and
        make load_global / _load_present_year derive observable values from them,
        so a reload is detectable. Resets the module-level cache around the test."""
        tsv = tmp_path / "_history.tsv"
        cfg = tmp_path / "_history.config.toml"
        tsv.write_text("v1\n", encoding="utf-8")
        cfg.write_text("present_year = 4000\n", encoding="utf-8")

        monkeypatch.setattr(ages_module, "_AGES_TSV_PATH", tsv)
        monkeypatch.setattr(ages_module, "_HISTORY_CONFIG_PATH", cfg)

        # load count lets us assert whether a rebuild happened.
        calls = {"load": 0}

        def fake_load_global(repo_root, *, debug=False):
            calls["load"] += 1
            # Return a distinct sentinel index per call so identity reveals reuse.
            return AgeIndex(
                ages=(
                    AgeWindow(
                        event_id=f"age-{calls['load']}",
                        title="t",
                        glyph="⟂",
                        start_year=0,
                        end_year=None,
                    ),
                )
            )

        def fake_present_year(repo_root):
            # Derive from the temp config so an edit changes the result.
            raw = cfg.read_text(encoding="utf-8")
            return int(raw.split("=", 1)[1].strip())

        monkeypatch.setattr(AgeIndex, "load_global", staticmethod(fake_load_global))
        monkeypatch.setattr(ages_module, "_load_present_year", fake_present_year)
        monkeypatch.setattr(ages_module, "_age_state_cache", None)
        return tsv, cfg, calls

    def test_unchanged_files_return_cached_state(self, patched_state) -> None:
        tsv, cfg, calls = patched_state
        idx1, py1 = ages_module._get_age_state()
        idx2, py2 = ages_module._get_age_state()
        # Second call hits the cache: no reload, same index identity.
        assert calls["load"] == 1
        assert idx1 is idx2
        assert py1 == py2 == 4000

    def test_edited_file_triggers_fresh_state(self, patched_state) -> None:
        tsv, cfg, calls = patched_state
        idx1, py1 = ages_module._get_age_state()
        assert py1 == 4000

        # Edit the config: change present_year and bump mtime.
        cfg.write_text("present_year = 4222\n", encoding="utf-8")
        future = cfg.stat().st_mtime + 5
        os.utime(cfg, (future, future))

        idx2, py2 = ages_module._get_age_state()
        # A reload happened: new index identity and fresh present_year.
        assert calls["load"] == 2
        assert idx1 is not idx2
        assert py2 == 4222
