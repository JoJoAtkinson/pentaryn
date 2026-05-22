import textwrap
from pathlib import Path
import pytest
from gui.encounter_picker import load_party_config

@pytest.fixture
def roster_file(tmp_path):
    p = tmp_path / "roster.yml"
    p.write_text(textwrap.dedent("""\
        party: Black Ledger
        players:
          - { name: Vessa, id: "1", max_hp: 31, ac: 15 }
          - { name: Orren, id: "2", max_hp: 40, ac: 17 }
    """))
    return p

def test_load_party_name(roster_file):
    data = load_party_config(roster_file)
    assert data["party"] == "Black Ledger"

def test_load_players_count(roster_file):
    data = load_party_config(roster_file)
    assert len(data["players"]) == 2

def test_player_fields(roster_file):
    data = load_party_config(roster_file)
    vessa = data["players"][0]
    assert vessa["name"] == "Vessa"
    assert vessa["id"] == "1"
    assert vessa["max_hp"] == 31
    assert vessa["ac"] == 15

def test_missing_player_key_raises(tmp_path):
    p = tmp_path / "bad.yml"
    p.write_text("party: X\nplayers:\n  - { name: Y, id: '1', max_hp: 10 }\n")
    with pytest.raises(ValueError, match="missing keys"):
        load_party_config(p)

def test_missing_file_raises(tmp_path):
    with pytest.raises(ValueError, match="Cannot read"):
        load_party_config(tmp_path / "nonexistent.yml")

def test_empty_id_raises(tmp_path):
    p = tmp_path / "bad.yml"
    p.write_text('party: X\nplayers:\n  - { name: Y, id: "", max_hp: 10, ac: 12 }\n')
    with pytest.raises(ValueError, match="empty id"):
        load_party_config(p)

def test_non_repeated_digit_id_raises(tmp_path):
    """An id like '12' that is not a repeated-digit string must be rejected."""
    p = tmp_path / "bad.yml"
    p.write_text('party: X\nplayers:\n  - { name: Y, id: "12", max_hp: 10, ac: 12 }\n')
    with pytest.raises(ValueError, match="repeated-digit"):
        load_party_config(p)

def test_duplicate_id_raises(tmp_path):
    """Two players sharing the same id must be rejected."""
    p = tmp_path / "dup.yml"
    p.write_text(textwrap.dedent("""\
        party: X
        players:
          - { name: A, id: "1", max_hp: 10, ac: 12 }
          - { name: B, id: "1", max_hp: 20, ac: 14 }
    """))
    with pytest.raises(ValueError, match="duplicate"):
        load_party_config(p)

def test_valid_repeated_digit_ids_load(tmp_path):
    """Ids '1', '2', '3' are valid repeated-digit strings and must load fine."""
    p = tmp_path / "ok.yml"
    p.write_text(textwrap.dedent("""\
        party: Test Party
        players:
          - { name: A, id: "1", max_hp: 30, ac: 14 }
          - { name: B, id: "2", max_hp: 25, ac: 15 }
          - { name: C, id: "3", max_hp: 40, ac: 16 }
    """))
    data = load_party_config(p)
    assert len(data["players"]) == 3

def test_real_roster_file():
    """The committed world/party/black-ledger/roster loads correctly."""
    repo_root = Path(__file__).resolve().parents[2]
    roster = repo_root / "world" / "party" / "black-ledger" / "combat-roster.yml"
    if not roster.exists():
        pytest.skip("real roster file not committed yet")
    data = load_party_config(roster)
    assert len(data["players"]) >= 1
