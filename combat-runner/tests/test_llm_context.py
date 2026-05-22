"""Tests for build_correction_context — the pure helper that assembles
LLM fallback context (state, recent command history, pending effects).
"""

from gui.llm_controller import build_correction_context  # new pure helper


def test_correction_context_has_state_history_pending():
    ctx = build_correction_context(state_dict={"npcs": []},
                                   recent_commands=["2 8 slash", "undo"],
                                   pending=[{"combatant_id": "2", "full_amount": 9}])
    assert "npcs" in ctx["state"]
    assert ctx["recent_commands"][-1] == "undo"
    assert ctx["pending"][0]["combatant_id"] == "2"
