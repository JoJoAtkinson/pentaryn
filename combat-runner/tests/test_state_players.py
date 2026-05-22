from gui.state import NPCState, EncounterState, assign_combatant_ids, \
    serialize_encounter, deserialize_encounter
from pathlib import Path

def _enc(*npcs):
    return EncounterState(name="t", root=Path("/t"), log_path=Path("/t/l.md"), npcs=list(npcs))

def _npc(**kw):
    base = dict(slug="x", name="X", max_hp=10, ac=12, speed="30ft", cr=0.0)
    base.update(kw)
    return NPCState(**base)

def test_npc_default_kind():
    assert _npc().kind == "npc"

def test_npc_pc_kind():
    assert _npc(kind="pc").kind == "pc"

def test_npc_default_id_empty():
    assert _npc().id == ""

def test_npc_in_melee_default_false():
    assert _npc().in_melee is False

def test_npc_pinned_notes_default_empty():
    assert _npc().pinned_notes == []

def test_id_alphabet_order():
    from gui.state import _id_alphabet
    gen = _id_alphabet()
    first = [next(gen) for _ in range(11)]
    # '0' is excluded so it remains free as the 'self' token
    assert first[:9] == ["1","2","3","4","5","6","7","8","9"]
    assert first[9] == "11"
    assert first[10] == "22"

def test_assign_ids_fills_empty():
    n1, n2 = _npc(), _npc()
    assign_combatant_ids([n1, n2])
    assert n1.id == "1"
    assert n2.id == "2"

def test_assign_ids_skips_reserved():
    n1, n2 = _npc(), _npc()
    assign_combatant_ids([n1, n2], reserved={"1", "2"})
    assert n1.id == "3"
    assert n2.id == "4"

def test_assign_ids_idempotent():
    n1 = _npc(id="5")
    assign_combatant_ids([n1])
    assert n1.id == "5"

def test_assign_ids_skips_existing_ids():
    n1 = _npc(id="1")
    n2 = _npc()
    assign_combatant_ids([n1, n2])
    assert n2.id == "2"  # "1" is taken

def test_combatant_by_id():
    n1 = _npc(slug="a", id="1")
    n2 = _npc(slug="b", id="22")
    enc = _enc(n1, n2)
    assert enc.combatant_by_id("1") is n1
    assert enc.combatant_by_id("22") is n2
    assert enc.combatant_by_id("99") is None

def test_serialization_round_trips_new_fields():
    n = _npc(kind="pc", id="3", in_melee=True, pinned_notes=["taunted"])
    enc = _enc(n)
    blob = serialize_encounter(enc)
    restored = deserialize_encounter(blob)
    rn = restored.npcs[0]
    assert rn.kind == "pc"
    assert rn.id == "3"
    assert rn.in_melee is True
    assert rn.pinned_notes == ["taunted"]

def test_old_snapshot_without_new_fields_deserializes():
    """Back-compat: a snapshot that has no kind/id/in_melee/pinned_notes loads ok."""
    blob = {
        "name": "t", "root": "/t", "log_path": "/t/l.md",
        "npcs": [{"slug": "x", "name": "X", "max_hp": 10, "ac": 12,
                  "speed": "30ft", "cr": 0.0}],
    }
    enc = deserialize_encounter(blob)
    assert enc.npcs[0].kind == "npc"
    assert enc.npcs[0].id == ""
