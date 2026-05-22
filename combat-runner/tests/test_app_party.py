"""Tests for --party / PC construction in gui/app.py (Task 2.3)."""

import pytest
from pathlib import Path


@pytest.fixture
def party_config():
    return {
        "party": "Test Party",
        "players": [
            {"name": "Vessa", "id": "1", "max_hp": 31, "ac": 15},
            {"name": "Orren", "id": "2", "max_hp": 40, "ac": 17},
        ],
    }


@pytest.fixture
def minimal_encounter(tmp_path):
    from gui.encounter_picker import DiscoveredEncounter
    return DiscoveredEncounter(
        name="test-enc", root=tmp_path, npcs=[], latest_mtime=0.0
    )


def test_build_state_includes_pcs(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(minimal_encounter, {}, party_config=party_config)
    pc_kinds = [n.kind for n in es.npcs]
    assert pc_kinds.count("pc") == 2


def test_pc_has_correct_id(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(minimal_encounter, {}, party_config=party_config)
    ids = {n.id for n in es.npcs if n.kind == "pc"}
    assert "1" in ids
    assert "2" in ids


def test_pc_name_from_config(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(minimal_encounter, {}, party_config=party_config)
    names = {n.name for n in es.npcs if n.kind == "pc"}
    assert "Vessa" in names


def test_pc_hp_from_config(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(minimal_encounter, {}, party_config=party_config)
    vessa = next(n for n in es.npcs if n.kind == "pc" and n.name == "Vessa")
    assert vessa.max_hp == 31
    assert vessa.member_hp == [31]


def test_pc_current_hp_from_selection(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(
        minimal_encounter, {},
        party_config=party_config,
        player_selections={"1": {"current_hp": 20, "included": True}},
    )
    vessa = next(n for n in es.npcs if n.id == "1")
    assert vessa.member_hp == [20]


def test_excluded_player_omitted(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(
        minimal_encounter, {},
        party_config=party_config,
        player_selections={"1": {"included": False}},
    )
    ids = {n.id for n in es.npcs if n.kind == "pc"}
    assert "1" not in ids
    assert "2" in ids


def test_npc_ids_skip_player_ids(minimal_encounter, party_config):
    """NPCs must not get ids "1" or "2" — those are reserved for PCs."""
    from gui.app import build_encounter_state
    from gui.encounter_picker import DiscoveredNPC
    # Create a minimal encounter with one NPC
    npc_md = minimal_encounter.root / "npcs" / "goblin.md"
    npc_md.parent.mkdir(parents=True, exist_ok=True)
    npc_md.write_text("---\nname: Goblin\nmax_hp: 7\nac: 13\n---\n**HP** 7 **AC** 13\n")
    enc2 = minimal_encounter.__class__(
        name="test-enc",
        root=minimal_encounter.root,
        npcs=[DiscoveredNPC(slug="goblin", name="Goblin", md_path=npc_md)],
        latest_mtime=0.0,
    )
    es = build_encounter_state(enc2, {"goblin": 1}, party_config=party_config)
    npc_ids = {n.id for n in es.npcs if n.kind == "npc"}
    assert "1" not in npc_ids
    assert "2" not in npc_ids


def test_pc_hp_defaults_to_max_when_selection_has_no_current_hp(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(
        minimal_encounter, {},
        party_config=party_config,
        player_selections={"1": {"included": True}},  # no current_hp key
    )
    vessa = next(n for n in es.npcs if n.id == "1")
    assert vessa.member_hp == [31]


def test_empty_players_list_builds_no_pcs(minimal_encounter):
    from gui.app import build_encounter_state
    es = build_encounter_state(minimal_encounter, {},
                               party_config={"party": "Empty", "players": []})
    assert [n for n in es.npcs if n.kind == "pc"] == []


def test_pcs_precede_npcs_in_turn_order(minimal_encounter, party_config):
    """PCs are the leftmost tabs — appended before NPCs."""
    from gui.app import build_encounter_state
    from gui.encounter_picker import DiscoveredNPC
    npc_md = minimal_encounter.root / "npcs" / "goblin.md"
    npc_md.parent.mkdir(parents=True, exist_ok=True)
    npc_md.write_text("---\nname: Goblin\nmax_hp: 7\nac: 13\n---\n**HP** 7 **AC** 13\n")
    enc2 = minimal_encounter.__class__(
        name="test-enc", root=minimal_encounter.root,
        npcs=[DiscoveredNPC(slug="goblin", name="Goblin", md_path=npc_md)],
        latest_mtime=0.0,
    )
    es = build_encounter_state(enc2, {"goblin": 1}, party_config=party_config)
    assert es.npcs[0].kind == "pc"
