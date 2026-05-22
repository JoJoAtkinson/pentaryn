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


def _affected(**over):
    """Build one affected-target dict with sensible defaults."""
    base = {
        "id": "5", "name": "Goblin", "slug": "goblin", "kind": "npc",
        "hp_before": 7, "hp_after": 0, "max_hp": 7,
        "conditions_before": [], "conditions_after": [],
        "immunities": [],
    }
    base.update(over)
    return base


def test_review_command_calls_api(controller_with_fake_client):
    ctrl, fake_client = controller_with_fake_client
    ctrl.review_command(
        raw="5 12 fire",
        actor={"id": "1", "name": "Vessa", "slug": "pc-1", "kind": "pc"},
        affected=[_affected(hp_before=7, hp_after=0)],
        roster=[{"id": "5", "name": "Goblin", "kind": "npc"}],
        applied_direction="damage", applied_amount=12,
        log_tail="",
    )
    assert fake_client.messages.create.called


def test_review_silent_returns_no_error(controller_with_fake_client):
    ctrl, _ = controller_with_fake_client
    result = ctrl.review_command(
        raw="5 12", actor={"id": "1", "name": "A", "slug": "a", "kind": "npc"},
        affected=[_affected(name="B", hp_before=10, hp_after=-2, max_hp=10)],
        roster=[{"id": "5", "name": "B", "kind": "npc"}],
        applied_direction="damage", applied_amount=12, log_tail="",
    )
    assert result.error is None


# ── GAP coverage: the review user_msg now carries real context ────────────────

def test_review_user_msg_contains_before_after_hp():
    """GAP 1 — the review context shows the real before→after HP delta."""
    from gui.llm_controller import LLMController

    msg = LLMController.build_review_user_msg(
        raw="2 80 melee",
        actor={"id": "1", "name": "Vessa", "kind": "pc"},
        affected=[_affected(name="Marwen", id="2", hp_before=32, hp_after=0, max_hp=32)],
        roster=[{"id": "2", "name": "Marwen", "kind": "npc"}],
        applied_direction="damage", applied_amount=80, log_tail="",
    )
    assert "32→0" in msg, msg
    assert "damage 80" in msg


def test_review_user_msg_contains_immunities():
    """GAP 2 — each target's damage immunities appear in the context."""
    from gui.llm_controller import LLMController

    msg = LLMController.build_review_user_msg(
        raw="2 30 fire",
        actor={"id": "1", "name": "Mage", "kind": "pc"},
        affected=[_affected(name="Fire Elemental", id="2",
                            hp_before=50, hp_after=20,
                            immunities=["fire", "poison"])],
        roster=[{"id": "2", "name": "Fire Elemental", "kind": "npc"}],
        applied_direction="damage", applied_amount=30, log_tail="",
    )
    assert "fire" in msg and "poison" in msg
    assert "immunities" in msg.lower()
    # resistances are not in the data — the context must say so.
    assert "resistances" in msg.lower()


def test_review_user_msg_contains_all_targets():
    """GAP 3 — a multi-target command lists ALL its targets, not just the first."""
    from gui.llm_controller import LLMController

    msg = LLMController.build_review_user_msg(
        raw="123 fireball",
        actor={"id": "9", "name": "Mage", "kind": "pc"},
        affected=[
            _affected(name="Goblin A", id="1", hp_before=10, hp_after=0),
            _affected(name="Goblin B", id="2", hp_before=12, hp_after=2),
            _affected(name="Goblin C", id="3", hp_before=8, hp_after=0),
        ],
        roster=[
            {"id": "1", "name": "Goblin A", "kind": "npc"},
            {"id": "2", "name": "Goblin B", "kind": "npc"},
            {"id": "3", "name": "Goblin C", "kind": "npc"},
        ],
        applied_direction=None, applied_amount=None, log_tail="",
    )
    assert "Goblin A" in msg and "Goblin B" in msg and "Goblin C" in msg


def test_review_user_msg_contains_roster():
    """GAP 4 — the full combatant roster (id/name/pc-vs-npc) is in the context."""
    from gui.llm_controller import LLMController

    msg = LLMController.build_review_user_msg(
        raw="7 20 heal",
        actor={"id": "1", "name": "Cleric", "kind": "pc"},
        affected=[_affected(name="Orc", id="7", hp_before=10, hp_after=30)],
        roster=[
            {"id": "1", "name": "Cleric", "kind": "pc"},
            {"id": "7", "name": "Orc", "kind": "npc"},
        ],
        applied_direction="heal", applied_amount=20, log_tail="",
    )
    assert "Cleric" in msg and "[pc]" in msg
    assert "Orc" in msg and "[npc]" in msg


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


def test_main_window_enqueues_review_no_op_without_controller(qtbot, sample_encounter):
    """With no LLM controller wired, _enqueue_review is a safe no-op.

    This is NOT a test that review is triggered (test_review_trigger.py covers
    that); it verifies the guard-clause — _llm_controller absent → no worker
    spawned, no crash, no inflight signals added.
    """
    from gui.dispatcher import parse
    from gui.main_window import MainWindow
    from gui.state import serialize_encounter
    sample_encounter.npcs[0].id = "1"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    # No controller attached — _enqueue_review must return silently.
    before_inflight = len(win._inflight_llm_signals)
    snap = serialize_encounter(sample_encounter)
    win._enqueue_review(parse("1 18 dmg"), sample_encounter.npcs[0], ["1"],
                        snap, snap)
    # No new workers should be in-flight since there is no controller.
    assert len(win._inflight_llm_signals) == before_inflight


def test_main_window_not_review_for_note(qtbot, sample_encounter):
    """note commands must NOT enqueue a review.

    Since the async LLM review pipeline was re-wired (fix 4, commit 8dff4e0),
    _enqueue_review IS now a live code path that fires after every real
    state-mutating command.  This test verifies that note commands (which return
    early in _on_command before any mutation / review gate) are excluded — i.e.
    the patch below will actually catch a regression if a future change
    accidentally routes notes through the mutation path.
    """
    from gui.main_window import MainWindow
    sample_encounter.npcs[0].id = "1"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    reviewed = []
    original = win._enqueue_review
    win._enqueue_review = lambda *a, **kw: reviewed.append(1)
    tab = win.tabs.widget(0)
    tab._on_submitted("note this is a test")
    assert reviewed == [], (
        "note command must not trigger _enqueue_review (not a state mutation)"
    )
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
        actor={"id": "1", "name": "Vessa", "slug": "pc-1", "kind": "pc"},
        affected=[_affected(hp_before=7, hp_after=0)],
        roster=[{"id": "5", "name": "Goblin", "kind": "npc"}],
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
