"""Tests for per-NPC enable/disable checkbox in EncounterPicker.

Themed encounters often bundle many possible NPC types under one root, but
only a subset is *present* in any given session. The picker needs a way to
opt-out a whole mob type (count=0 emitted, NPC skipped downstream).
"""

import pytest


def _picker_with_real_encounter(qtbot):
    """Build a picker against real discovery (any encounter with NPCs works)."""
    from gui.encounter_picker import EncounterPicker
    picker = EncounterPicker()
    qtbot.addWidget(picker)
    # Bail if no encounters with NPCs found — defensive; in this repo there
    # are many, so this should never fire in CI.
    enc_with_npcs = next(
        (i for i, e in enumerate(picker.encounters) if e.npcs), None
    )
    assert enc_with_npcs is not None, "no discoverable encounter has NPCs"
    picker.list_widget.setCurrentRow(enc_with_npcs)
    picker._on_select(enc_with_npcs)
    enc = picker.encounters[enc_with_npcs]
    return picker, enc


def test_picker_exposes_npc_checkboxes(qtbot):
    picker, enc = _picker_with_real_encounter(qtbot)
    assert hasattr(picker, "_count_checks"), "picker must expose _count_checks dict"
    for npc in enc.npcs:
        assert npc.slug in picker._count_checks, f"missing checkbox for {npc.slug}"


def test_npc_checkbox_defaults_to_checked(qtbot):
    picker, enc = _picker_with_real_encounter(qtbot)
    for npc in enc.npcs:
        assert picker._count_checks[npc.slug].isChecked(), (
            f"{npc.slug} checkbox should default to checked (NPC included)"
        )


def test_count_spinbox_disabled_when_checkbox_unchecked(qtbot):
    picker, enc = _picker_with_real_encounter(qtbot)
    if not enc.npcs:
        pytest.skip("no NPCs to toggle")
    slug = enc.npcs[0].slug
    picker._count_checks[slug].setChecked(False)
    assert not picker._count_spinboxes[slug].isEnabled(), (
        "count spinbox should grey out when checkbox is unchecked"
    )


def test_unchecked_npc_emits_count_zero_on_launch(qtbot):
    picker, enc = _picker_with_real_encounter(qtbot)
    if len(enc.npcs) < 2:
        pytest.skip("need at least 2 NPCs to test a mix")

    skip_slug = enc.npcs[0].slug
    keep_slug = enc.npcs[1].slug
    picker._count_checks[skip_slug].setChecked(False)

    captured: list = []
    picker.launched.connect(lambda enc, counts, party, sel: captured.append(counts))
    picker._on_launch()

    assert captured, "launched signal did not fire"
    counts = captured[0]
    assert counts[skip_slug] == 0, (
        f"{skip_slug} should emit count=0 when checkbox unchecked, got {counts[skip_slug]}"
    )
    assert counts[keep_slug] >= 1, (
        f"{keep_slug} should keep its default count, got {counts[keep_slug]}"
    )


def test_checked_npc_emits_spinbox_value_on_launch(qtbot):
    picker, enc = _picker_with_real_encounter(qtbot)
    if not enc.npcs:
        pytest.skip("no NPCs to test")

    slug = enc.npcs[0].slug
    picker._count_spinboxes[slug].setValue(4)
    assert picker._count_checks[slug].isChecked()  # already True by default

    captured: list = []
    picker.launched.connect(lambda enc, counts, party, sel: captured.append(counts))
    picker._on_launch()

    assert captured[0][slug] == 4
