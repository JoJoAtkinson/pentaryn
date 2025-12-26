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

