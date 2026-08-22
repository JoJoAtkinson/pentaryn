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
        tsv = tmp_path / "history"
        cfg = tmp_path / "config.toml"
        tsv.mkdir()
        (tsv / "00000-00-00_seed.md").write_text("v1\n", encoding="utf-8")
        cfg.write_text("present_year = 4000\n", encoding="utf-8")

        monkeypatch.setattr(ages_module, "_AGES_HISTORY_DIR", tsv)
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


# ---------------------------------------------------------------------------
# AgeIndex.load_global reads per-event markdown under `world/ages/history/`.
# These exist because the previous TSV loader degraded *silently* when its input
# went missing: format_year falls back to the bare year, so age_convert("4150")
# answered "4150" instead of "ᛏ200" with no error.
# ---------------------------------------------------------------------------


def _write_age(dirpath, stem, *, title, year, tags=("public", "age"), event_id=None, date=None):
    dirpath.mkdir(parents=True, exist_ok=True)
    front = [
        "---",
        f"title: {title}",
        f"event_id: {event_id or stem.split('_', 1)[-1]}",
        f"date: '{date if date is not None else year}'",
        f"year: {year}",
        "precision: year",
        "duration: 0",
        "tags:",
        *[f"- {t}" for t in tags],
        "---",
        "",
        "Body.",
    ]
    (dirpath / f"{stem}.md").write_text("\n".join(front) + "\n", encoding="utf-8")


class TestLoadGlobalFromMarkdown:
    def test_builds_windows_from_frontmatter(self, tmp_path) -> None:
        ages = tmp_path / "world" / "ages" / "history"
        _write_age(ages, "00000-00-00_age-a", title="⟂ Age A", year=0)
        _write_age(ages, "01500-00-00_age-b", title="ᛒ Age B", year=1500)
        _write_age(ages, "04277-00-00_age-c", title="⋈ Age C", year=4277)

        idx = AgeIndex.load_global(tmp_path)
        assert [a.glyph for a in idx.ages] == ["⟂", "ᛒ", "⋈"]
        # End years are derived from the next age's start.
        assert [(a.start_year, a.end_year) for a in idx.ages] == [(0, 1499), (1500, 4276), (4277, None)]
        assert idx.format_year(4327) == "⋈50"

    def test_untagged_events_are_skipped(self, tmp_path) -> None:
        ages = tmp_path / "world" / "ages" / "history"
        _write_age(ages, "00000-00-00_the-fall", title="Fall of the Ancients", year=0,
                   tags=("public", "world", "lore"))
        _write_age(ages, "01500-00-00_age-b", title="ᛒ Age B", year=1500)

        idx = AgeIndex.load_global(tmp_path)
        assert [a.event_id for a in idx.ages] == ["age-b"]

    def test_frontmatter_year_wins_over_filename(self, tmp_path) -> None:
        """One real event carries a synthetic sort slot that is not its date:
        `00000-00-01_age-ash-and-silence.md` is dated year 0. The loader must
        never derive the year from the filename."""
        ages = tmp_path / "world" / "ages" / "history"
        _write_age(ages, "00000-00-01_age-ash", title="⟂ Age of Ash", year=0, date="0")

        idx = AgeIndex.load_global(tmp_path)
        assert idx.ages[0].start_year == 0

    def test_missing_folder_returns_empty_index(self, tmp_path) -> None:
        assert AgeIndex.load_global(tmp_path).ages == ()

    def test_empty_index_raises_rather_than_answering_wrongly(self, tmp_path, monkeypatch) -> None:
        monkeypatch.setattr(ages_module, "_AGES_HISTORY_DIR", tmp_path / "nope")
        monkeypatch.setattr(ages_module, "_age_state_cache", None)
        monkeypatch.setattr(AgeIndex, "load_global", staticmethod(lambda *a, **k: AgeIndex(ages=())))
        with pytest.raises(ValueError, match="No ages loaded"):
            ages_module._get_age_state()
