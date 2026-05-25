from gui.state import EncounterState, NPCState, _id_alphabet
from itertools import islice

def test_id_alphabet_excludes_zero():
    first_ten = list(islice(_id_alphabet(), 10))
    assert "0" not in first_ten
    assert first_ten[:9] == list("123456789")
    assert first_ten[9] == "11"

def _npc(name="One", nid="1"):
    n = NPCState(slug=name.lower(), name=name, max_hp=20, ac=13,
                 speed="30 ft.", cr=1.0)
    n.id = nid
    return n


def _es(npcs=None):
    return EncounterState(
        name="t", root=__import__("pathlib").Path("."),
        log_path=__import__("pathlib").Path("log.md"),
        npcs=npcs if npcs is not None else [_npc()],
    )

def test_current_target_defaults_empty():
    """A fresh combatant has no target — `current_target` reads the active
    combatant's per-actor `target_ids`, which defaults to []."""
    assert _es().current_target == []

def test_current_target_is_per_actor():
    """`current_target` is per-actor (stored on each NPCState); setting it
    writes the active combatant's `target_ids`. Switching the active tab
    surfaces a different combatant's target."""
    a, b = _npc("A", "1"), _npc("B", "2")
    es = _es([a, b])
    es.active_tab_index = 0
    es.current_target = ["1", "2", "3"]
    assert es.current_target == ["1", "2", "3"]
    assert a.target_ids == ["1", "2", "3"]
    # Switching active tab surfaces B's (empty) target — A still remembers.
    es.active_tab_index = 1
    assert es.current_target == []
    es.active_tab_index = 0
    assert es.current_target == ["1", "2", "3"]
