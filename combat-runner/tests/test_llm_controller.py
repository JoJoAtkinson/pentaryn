"""LLM controller tests — exercises the tool dispatch surface with a mocked
Anthropic client (no real API calls). Each test verifies that a fake LLM
response with specific tool_use blocks mutates the EncounterState as expected.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

from gui.llm_controller import LLMController, RunResult
from gui.state import EncounterState, NPCState
from gui.widgets.suggestion_bar import Suggestion


# ─────────── fakes for Anthropic SDK responses ───────────

@dataclass
class FakeContent:
    type: str
    text: str = ""
    name: str = ""
    input: dict[str, Any] = field(default_factory=dict)
    id: str = "tu-1"


@dataclass
class FakeResponse:
    content: list[FakeContent]
    stop_reason: str = "end_turn"


class FakeAnthropicClient:
    """Stand-in for `anthropic.Anthropic` that returns canned responses."""

    def __init__(self, response_queue: list[FakeResponse]) -> None:
        self._queue = list(response_queue)
        self.calls: list[dict[str, Any]] = []
        self.messages = self  # so `client.messages.create(...)` works

    def create(self, **kwargs) -> FakeResponse:
        self.calls.append(kwargs)
        if not self._queue:
            return FakeResponse(content=[FakeContent(type="text", text="done")], stop_reason="end_turn")
        return self._queue.pop(0)


# ─────────── fixtures ───────────

@pytest.fixture
def encounter(tmp_path):
    return EncounterState(
        name="test",
        root=tmp_path,
        log_path=tmp_path / "log.md",
        npcs=[
            NPCState(slug="stalker", name="Stalker", max_hp=84, ac=16, speed="50 ft", cr=5),
            NPCState(slug="aelric", name="Aelric", max_hp=38, ac=12, speed="30 ft", cr=3),
        ],
    )


# ─────────── single-tool dispatch ───────────

def test_damage_npc_tool_reduces_hp(encounter):
    fake = FakeAnthropicClient([
        FakeResponse(
            content=[
                FakeContent(type="tool_use", name="damage_npc", id="t1", input={"npc_slug": "stalker", "amount": 14}),
            ],
            stop_reason="tool_use",
        ),
        FakeResponse(
            content=[FakeContent(type="text", text="Applied 14 damage to the stalker.")],
            stop_reason="end_turn",
        ),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    result = ctrl.run("hit the stalker for 14")
    assert isinstance(result, RunResult)
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    assert stalker.hp == 70
    assert result.tool_calls[0]["name"] == "damage_npc"
    assert "14 damage" in result.text


def test_heal_npc_tool_increases_hp(encounter):
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    stalker.apply_damage(50)
    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="heal_npc", id="t1", input={"npc_slug": "stalker", "amount": 20})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="Healed.")], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    ctrl.run("heal the stalker 20")
    assert stalker.hp == 54


def test_set_hp_tool_can_correct_state(encounter):
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    stalker.apply_damage(10)
    assert stalker.hp == 74
    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="set_hp", id="t1", input={"npc_slug": "stalker", "hp": 80})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="Set.")], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    ctrl.run("actually the stalker is at 80")
    assert stalker.hp == 80


def test_add_condition_tool(encounter):
    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="add_condition", id="t1", input={"npc_slug": "stalker", "condition": "Prone"})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="Done.")], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    ctrl.run("the stalker is prone")
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    assert "prone" in stalker.conditions


def test_set_round_tool_rolls_back(encounter):
    encounter.set_round(5)
    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="set_round", id="t1", input={"round_num": 3})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="Rolled back.")], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    ctrl.run("we're still on round 3")
    assert encounter.round_num == 3


def test_unknown_npc_returns_error(encounter):
    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="damage_npc", id="t1", input={"npc_slug": "no-such-npc", "amount": 5})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="Couldn't find that NPC.")], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    result = ctrl.run("hit ghost-npc for 5")
    tool_call = result.tool_calls[0]
    assert tool_call["result"]["ok"] is False
    assert "not found" in tool_call["result"]["error"].lower()


def test_state_changed_callback_fires(encounter):
    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="damage_npc", id="t1", input={"npc_slug": "stalker", "amount": 1})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="OK")], stop_reason="end_turn"),
    ])
    notify_count = []
    ctrl = LLMController(
        encounter,
        log_path=str(encounter.log_path),
        client=fake,
        on_state_changed=lambda: notify_count.append(1),
    )
    ctrl.run("tap stalker")
    assert sum(notify_count) >= 1


def test_chain_of_tool_calls(encounter):
    """Multi-turn tool_use → tool_result → tool_use → text loop should work."""
    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="damage_npc", id="t1", input={"npc_slug": "stalker", "amount": 10})],
            stop_reason="tool_use",
        ),
        FakeResponse(
            content=[FakeContent(type="tool_use", name="add_condition", id="t2", input={"npc_slug": "stalker", "condition": "bloodied"})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="Done.")], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    result = ctrl.run("rough up the stalker and mark it bloodied")
    assert len(result.tool_calls) == 2
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    assert stalker.hp == 74
    assert "bloodied" in stalker.conditions


def test_run_without_api_key_returns_error(encounter, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=None)
    result = ctrl.run("anything")
    assert result.error is not None
    assert "ANTHROPIC_API_KEY" in result.error


def test_set_hp_on_mob_without_member_rejects(encounter):
    """Regression for review-1 LLM B3: set_hp on a mob NPC without a `member`
    argument used to silently target only member 1. Now must return an error."""
    # Promote the stalker fixture to a mob
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    stalker.count = 3
    stalker.member_hp = [84, 84, 84]

    fake = FakeAnthropicClient([
        FakeResponse(content=[FakeContent(type="tool_use", name="set_hp", input={"npc_slug": "stalker", "hp": 50})], stop_reason="tool_use"),
        FakeResponse(content=[FakeContent(type="text", text="done")], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    result = ctrl.run("set stalker to 50 hp")
    # Tool call was made but it returned ok=False
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0]["result"]["ok"] is False
    assert "mob" in result.tool_calls[0]["result"]["error"]
    # Member HP unchanged
    assert stalker.member_hp == [84, 84, 84]


def test_mark_action_available_tool_undoes_mark_used(encounter):
    """Regression for review-1 LLM B2: the LLM can now un-mark a recharge."""
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    stalker.mark_action_used("glacial_roar")
    assert stalker.recharges.get("glacial_roar") == "USED"

    fake = FakeAnthropicClient([
        FakeResponse(
            content=[FakeContent(type="tool_use", name="mark_action_available", input={"npc_slug": "stalker", "action": "glacial_roar"})],
            stop_reason="tool_use",
        ),
        FakeResponse(content=[FakeContent(type="text", text="undone")], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    result = ctrl.run("actually we didn't use roar")
    assert result.tool_calls[0]["result"]["ok"] is True
    assert stalker.recharges.get("glacial_roar") != "USED"


def test_tool_loop_iteration_cap_sets_error(encounter):
    """Regression for review-1 LLM B1: when the model keeps requesting tool
    calls past the cap, RunResult.error must be set."""
    # Build 12 responses (more than MAX_TOOL_LOOP_ITERATIONS=10), each requesting
    # another tool call. The 10th iteration should be the last one consumed,
    # and the loop exits with error set.
    responses = [
        FakeResponse(
            content=[FakeContent(type="tool_use", name="add_log_entry", input={"text": f"step {i}"}, id=f"tu-{i}")],
            stop_reason="tool_use",
        )
        for i in range(12)
    ]
    fake = FakeAnthropicClient(responses)
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    result = ctrl.run("loop forever")
    assert result.error is not None
    assert "iteration cap" in result.error
    # And we made exactly MAX_TOOL_LOOP_ITERATIONS calls
    assert len(fake.calls) == LLMController.MAX_TOOL_LOOP_ITERATIONS


# ─────────── suggestion path ───────────

def test_suggest_returns_three_typed_suggestions(encounter):
    """Mock the suggestion endpoint return JSON; assert we get Suggestion objects."""
    payload = json.dumps({
        "suggestions": [
            {"slug": "Multiattack on Tenza", "action": "multiattack"},
            {"slug": "Vanish into the snow", "action": "snow_vanish"},
            {"slug": "Frozen Bile on the wizard", "action": "frozen_bile"},
        ]
    })
    fake = FakeAnthropicClient([
        FakeResponse(content=[FakeContent(type="text", text=payload)], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    suggestions = ctrl.suggest_next_actions(stalker, action_surface=[
        {"action": "multiattack", "verbs": ["attack"]},
        {"action": "snow_vanish", "verbs": ["vanish"]},
        {"action": "frozen_bile", "verbs": ["ranged"]},
    ])
    assert len(suggestions) == 3
    assert all(isinstance(s, Suggestion) for s in suggestions)
    assert suggestions[0].action_name == "multiattack"


def test_suggest_handles_code_fenced_json(encounter):
    """The model sometimes wraps JSON in ```json ... ```. Verify we strip it."""
    fenced = "```json\n" + json.dumps({"suggestions": [{"slug": "ok", "action": "multiattack"}]}) + "\n```"
    fake = FakeAnthropicClient([
        FakeResponse(content=[FakeContent(type="text", text=fenced)], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    suggestions = ctrl.suggest_next_actions(stalker, action_surface=[{"action": "multiattack", "verbs": ["a"]}])
    assert len(suggestions) == 1
    assert suggestions[0].action_name == "multiattack"


def test_suggest_returns_empty_on_malformed_json(encounter):
    fake = FakeAnthropicClient([
        FakeResponse(content=[FakeContent(type="text", text="this is not json")], stop_reason="end_turn"),
    ])
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=fake)
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    suggestions = ctrl.suggest_next_actions(stalker, action_surface=[])
    assert suggestions == []


def test_suggest_without_api_key_returns_empty(encounter, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    ctrl = LLMController(encounter, log_path=str(encounter.log_path), client=None)
    stalker = next(n for n in encounter.npcs if n.slug == "stalker")
    suggestions = ctrl.suggest_next_actions(stalker, action_surface=[])
    assert suggestions == []
