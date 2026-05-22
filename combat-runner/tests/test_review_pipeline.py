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
    result = _tool_apply_command(bundle, command="1 10 heal", target_slug=npc.slug)
    assert result["ok"]
    assert npc.hp == 44


def test_apply_command_tool_damages_npc(sample_encounter):
    from gui.llm_controller import _tool_apply_command, _StateBundle
    npc = sample_encounter.npcs[0]
    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")
    result = _tool_apply_command(bundle, command="1 20 dmg", target_slug=npc.slug)
    assert result["ok"]
    assert npc.hp == 64  # 84 - 20


def test_apply_command_unknown_npc_returns_error(sample_encounter):
    from gui.llm_controller import _tool_apply_command, _StateBundle
    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")
    result = _tool_apply_command(bundle, command="1 5 dmg", target_slug="no-such-npc")
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


# ── Fix 1: apply_command skipped/no-op → ok: False ──────────────────────────

def test_apply_command_out_of_range_mob_member_returns_false(sample_encounter):
    """_tool_apply_command must return ok=False when apply_damage/apply_heal
    returns a skipped result (e.g. member index out of range for a mob)."""
    from gui.llm_controller import _tool_apply_command, _StateBundle
    from gui.state import NPCState

    # Build a 2-member mob and add it to the encounter.
    mob = NPCState(
        slug="goblin-mob",
        name="Goblin Mob",
        max_hp=10,
        ac=13,
        speed="30 ft.",
        cr=0.25,
        count=2,
    )
    sample_encounter.npcs.append(mob)

    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")

    # Sanity check: default-routed damage (no m<n>) succeeds normally.
    result = _tool_apply_command(bundle, command="1 15 dmg", target_slug="goblin-mob")
    assert result["ok"], "default-routed damage should succeed"

    # An out-of-range member m99 is a skipped no-op → ok=False.
    result = _tool_apply_command(bundle, command="1 m99 5 dmg", target_slug="goblin-mob")
    assert not result["ok"], "out-of-range mob member should be ok=False"

    # Verify that _tool_apply_command wraps a skipped apply_heal as ok=False.
    # Kill both members so apply_heal returns skipped="no member to heal".
    mob.member_hp[0] = 0
    mob.member_hp[1] = 0
    result = _tool_apply_command(bundle, command="1 5 heal", target_slug="goblin-mob")
    assert not result["ok"], "heal on all-dead mob should be ok=False"
    assert "error" in result
    assert result["error"]  # non-empty error message


def test_apply_command_no_alive_members_damage_returns_false(sample_encounter):
    """apply_command DAMAGE branch returns ok=False when all mob members are dead
    (apply_damage returns skipped='no alive members')."""
    from gui.llm_controller import _tool_apply_command, _StateBundle
    from gui.state import NPCState

    mob = NPCState(
        slug="dead-mob",
        name="Dead Mob",
        max_hp=8,
        ac=12,
        speed="30 ft.",
        cr=0.25,
        count=2,
    )
    # Kill all members.
    mob.member_hp[0] = 0
    mob.member_hp[1] = 0
    sample_encounter.npcs.append(mob)

    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")
    # DAMAGE branch: "1 10 dmg" → apply_damage with no alive members → skipped.
    result = _tool_apply_command(bundle, command="1 10 dmg", target_slug="dead-mob")
    assert not result["ok"], "damage on all-dead mob should be ok=False"
    assert "error" in result
    assert "no alive members" in result["error"] or result["error"]


# ── Fix 2: review path uses trimmed tool set; run() path uses full set ────────

def test_review_command_uses_trimmed_tool_set(controller_with_fake_client):
    """review_command must pass only the review-subset tools to messages.create,
    not the full 22-tool schema."""
    from gui.llm_controller import REVIEW_TOOL_NAMES

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
    call_kwargs = fake_client.messages.create.call_args.kwargs
    sent_tools = call_kwargs.get("tools", [])
    sent_names = {t["name"] for t in sent_tools}
    # Review path must include all REVIEW_TOOL_NAMES and nothing else.
    assert sent_names == REVIEW_TOOL_NAMES, (
        f"review used tools {sent_names!r} but expected {set(REVIEW_TOOL_NAMES)!r}"
    )


def test_run_path_uses_full_tool_set(controller_with_fake_client):
    """run() must pass the full tool set (all 22+ tools), not the review subset."""
    from gui.llm_controller import REVIEW_TOOL_NAMES

    ctrl, fake_client = controller_with_fake_client
    ctrl.run(user_input="what does prone do?", active_npc_slug=None)

    assert fake_client.messages.create.called
    call_kwargs = fake_client.messages.create.call_args.kwargs
    sent_tools = call_kwargs.get("tools", [])
    sent_names = {t["name"] for t in sent_tools}
    # run() must include more tools than the review subset.
    assert sent_names.issuperset(REVIEW_TOOL_NAMES), "run() should include all review tools"
    assert len(sent_names) > len(REVIEW_TOOL_NAMES), (
        f"run() should use more than the {len(REVIEW_TOOL_NAMES)} review tools "
        f"(got {len(sent_names)})"
    )
