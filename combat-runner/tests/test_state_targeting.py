from gui.state import EncounterState, NPCState, _id_alphabet
from itertools import islice

def test_id_alphabet_excludes_zero():
    first_ten = list(islice(_id_alphabet(), 10))
    assert "0" not in first_ten
    assert first_ten[:9] == list("123456789")
    assert first_ten[9] == "11"

def _es():
    return EncounterState(name="t", root=__import__("pathlib").Path("."),
                          log_path=__import__("pathlib").Path("log.md"))

def test_current_target_defaults_empty():
    assert _es().current_target == []

def test_current_target_is_settable():
    es = _es()
    es.current_target = ["1", "2", "3"]
    assert es.current_target == ["1", "2", "3"]
