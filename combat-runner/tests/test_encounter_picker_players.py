"""Tests for the Players section of EncounterPicker (Task 2.4)."""

import pytest


@pytest.fixture
def party_config():
    return {
        "party": "Test",
        "players": [
            {"name": "Vessa", "id": "1", "max_hp": 31, "ac": 15},
        ],
    }


def test_players_section_shown_with_config(qtbot, party_config):
    from gui.encounter_picker import EncounterPicker
    picker = EncounterPicker(party_config=party_config)
    qtbot.addWidget(picker)
    picker.show()
    # Player checkbox must exist
    assert "1" in picker._player_checks


def test_player_checkbox_default_checked(qtbot, party_config):
    from gui.encounter_picker import EncounterPicker
    picker = EncounterPicker(party_config=party_config)
    qtbot.addWidget(picker)
    assert picker._player_checks["1"].isChecked()


def test_player_hp_spinbox_defaults_to_max(qtbot, party_config):
    from gui.encounter_picker import EncounterPicker
    picker = EncounterPicker(party_config=party_config)
    qtbot.addWidget(picker)
    assert picker._player_hp_spins["1"].value() == 31


def test_no_party_config_no_checks(qtbot):
    from gui.encounter_picker import EncounterPicker
    picker = EncounterPicker()
    qtbot.addWidget(picker)
    assert picker._player_checks == {}
