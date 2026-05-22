"""Phase 4 — command pipeline + LLM review tests.

All tests use a fake Anthropic client (MagicMock); no real API calls. Covers:
  - `review_command` calls the API and returns no error on a silent review
  - the `apply_command` tool heals / damages an NPC and errors on unknown slug
  - MainWindow enqueues a review for state-changing commands (no-op without
    an LLM controller wired) and does NOT review `note` commands
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest


@pytest.fixture
def controller_with_fake_client(sample_encounter):
    """LLMController backed by a MagicMock client whose review returns silently
    (no text, no tools)."""
    from gui.llm_controller import LLMController

    fake_client = MagicMock()
    resp = MagicMock()
    resp.stop_reason = "end_turn"
    resp.content = []
    fake_client.messages.create.return_value = resp

    ctrl = LLMController(
        sample_encounter,
        log_path=str(sample_encounter.log_path),
        client=fake_client,
    )
    return ctrl, fake_client


def test_review_command_calls_api(controller_with_fake_client):
    ctrl, fake_client = controller_with_fake_client
    ctrl.review_command(
        raw="5 12 fire",
        actor={"id": "1", "name": "Vessa", "slug": "pc-1"},
        target={"id": "5", "name": "Goblin", "slug": "goblin",
                "hp": 7, "max_hp": 7, "conditions": [], "in_melee": False},
        applied_direction="damage", applied_amount=12,
        log_tail="",
    )
    assert fake_client.messages.create.called


def test_review_silent_returns_no_error(controller_with_fake_client):
    ctrl, _ = controller_with_fake_client
    result = ctrl.review_command(
        raw="5 12", actor={"id": "1", "name": "A", "slug": "a"},
        target={"id": "5", "name": "B", "slug": "b",
                "hp": 10, "max_hp": 10, "conditions": [], "in_melee": False},
        applied_direction="damage", applied_amount=12, log_tail="",
    )
    assert result.error is None


def test_apply_command_tool_heals_npc(sample_encounter):
    from gui.llm_controller import _tool_apply_command, _StateBundle
    npc = sample_encounter.npcs[0]
    npc.apply_damage(50)  # 84 → 34 HP
    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")
    result = _tool_apply_command(bundle, command="+10", target_slug=npc.slug)
    assert result["ok"]
    assert npc.hp == 44


def test_apply_command_tool_damages_npc(sample_encounter):
    from gui.llm_controller import _tool_apply_command, _StateBundle
    npc = sample_encounter.npcs[0]
    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")
    result = _tool_apply_command(bundle, command="1 20", target_slug=npc.slug)
    assert result["ok"]
    assert npc.hp == 64  # 84 - 20


def test_apply_command_unknown_npc_returns_error(sample_encounter):
    from gui.llm_controller import _tool_apply_command, _StateBundle
    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")
    result = _tool_apply_command(bundle, command="1 5", target_slug="no-such-npc")
    assert not result["ok"]
    assert "not found" in result["error"]


def test_main_window_enqueues_review_for_state_commands(qtbot, sample_encounter):
    """When a tab emits review_needed, MainWindow starts a review worker IF an
    LLM controller is wired. With no controller, the enqueue is a no-op."""
    from gui.main_window import MainWindow
    sample_encounter.npcs[0].id = "1"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    # With no LLM controller, _enqueue_review is a no-op (no crash).
    win._enqueue_review("−18", sample_encounter.npcs[0], sample_encounter.npcs[0],
                        applied_direction="damage", applied_amount=18)


def test_main_window_not_review_for_note(qtbot, sample_encounter):
    """note commands must not enqueue review."""
    from gui.main_window import MainWindow
    sample_encounter.npcs[0].id = "1"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    reviewed = []
    original = win._enqueue_review
    win._enqueue_review = lambda *a, **kw: reviewed.append(1)
    tab = win.tabs.widget(0)
    tab._on_submitted("note this is a test")
    assert reviewed == []
    win._enqueue_review = original
