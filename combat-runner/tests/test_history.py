from pathlib import Path
from gui.history import PendingEffect, UndoStack
from gui.state import EncounterState, NPCState

def _es():
    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="g", name="Goblin", max_hp=10, ac=12, speed="30", cr=1))
    return es

def test_pending_effect_fields():
    p = PendingEffect(combatant_id="2", full_amount=12, applied_amount=6, kind="save")
    assert p.resolved is False

def test_undo_round_trip():
    es = _es()
    stack = UndoStack()
    stack.snapshot(es)                       # snapshot the 10-hp state
    es.npcs[0].member_hp[0] = 3              # mutate
    restored = stack.undo()                  # -> EncounterState restored to 10
    assert restored is not None
    assert restored.npcs[0].member_hp[0] == 10

def test_undo_empty_returns_none():
    assert UndoStack().undo() is None

def test_undo_is_multi_level():
    es = _es()
    stack = UndoStack()
    stack.snapshot(es); es.npcs[0].member_hp[0] = 8
    stack.snapshot(es); es.npcs[0].member_hp[0] = 5
    assert stack.undo().npcs[0].member_hp[0] == 8   # back one
    assert stack.undo().npcs[0].member_hp[0] == 10  # back two

def test_undo_stack_caps():
    es = _es()
    stack = UndoStack(cap=3)
    for _ in range(10):
        stack.snapshot(es)
    assert len(stack._snapshots) == 3
