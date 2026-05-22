"""Tests for combat-grammar-fixes: action context to reviewer (A), digit-glue +
whitespace input normalization (B + C).

Changes A, B, C as specified in the fix round (2026-05-22).
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

# ─── CHANGE B — digit→letter glue normalization ─────────────────────────────


def test_digit_glue_2_8melee_parsed_same_as_2_8_melee():
    """B: `2 8melee` must parse identically to `2 8 melee`."""
    from gui.dispatcher import parse

    canonical = parse("2 8 melee")
    glued = parse("2 8melee")
    assert glued.kind == canonical.kind == "command"
    assert glued.target_ids == canonical.target_ids == ["2"]
    e_glued = glued.effects[0]
    e_canon = canonical.effects[0]
    assert e_glued.kind == "amount"
    assert e_glued.amount == e_canon.amount == 8
    assert e_glued.amount_tags.get("delivery") == "melee"


def test_digit_glue_7m3_6_melee():
    """B: `7m3 6 melee` → target 7, members [3], 6 melee damage."""
    from gui.dispatcher import parse

    c = parse("7m3 6 melee")
    assert c.kind == "command"
    assert c.target_ids == ["7"]
    e = c.effects[0]
    assert e.kind == "amount" and e.amount == 6
    assert e.members == [3]
    assert e.amount_tags.get("delivery") == "melee"


def test_digit_glue_does_not_split_mob_sigil():
    """B: `m3` (letter→digit) must NOT be split — the mob sigil stays intact."""
    from gui.dispatcher import parse

    # `7 m3 6 melee` — m3 must not be split to `m 3`
    c = parse("7 m3 6 melee")
    assert c.kind == "command"
    e = c.effects[0]
    assert e.members == [3]


def test_digit_glue_skipped_for_note_text():
    """B: `note the gnoll8 stirs` — note text must be left unmangled."""
    from gui.dispatcher import parse

    c = parse("note the gnoll8 stirs")
    assert c.kind == "note"
    assert "gnoll8" in c.note_text, (
        f"note text mangled: {c.note_text!r}"
    )


def test_digit_glue_skipped_for_slash_commands():
    """B: `/reorder slug8b slug8a` — slash args left verbatim."""
    from gui.dispatcher import parse

    c = parse("/reorder slug8b slug8a")
    assert c.kind == "reorder"
    assert "slug8b" in c.reorder_slugs


# ─── CHANGE C — whitespace + trailing-punctuation normalization ──────────────


def test_trailing_period_stripped():
    """C: `2 8 melee.` parses the same as `2 8 melee`."""
    from gui.dispatcher import parse

    with_dot = parse("2 8 melee.")
    without = parse("2 8 melee")
    assert with_dot.kind == without.kind == "command"
    assert with_dot.effects[0].amount == without.effects[0].amount == 8


def test_trailing_comma_stripped():
    """C: trailing `,` is stripped."""
    from gui.dispatcher import parse

    c = parse("2 8 melee,")
    assert c.kind == "command"
    assert c.effects[0].amount == 8


def test_trailing_semicolon_stripped():
    """C: trailing `;` is stripped."""
    from gui.dispatcher import parse

    c = parse("2 8 melee;")
    assert c.kind == "command"
    assert c.effects[0].amount == 8


def test_double_spaces_collapsed():
    """C: internal double-spaces are collapsed to a single space."""
    from gui.dispatcher import parse

    c = parse("2  8  melee")
    assert c.kind == "command"
    assert c.effects[0].amount == 8


def test_leading_trailing_spaces_stripped():
    """C: leading/trailing whitespace is stripped before parsing."""
    from gui.dispatcher import parse

    c = parse("  2 8 melee  ")
    assert c.kind == "command"
    assert c.target_ids == ["2"]


# ─── CHANGE A — action context in review payload ────────────────────────────


def test_build_review_user_msg_includes_action_run_line():
    """A: when `action` is provided, the review payload contains 'Action run:'."""
    from gui.llm_controller import LLMController

    action_info = {
        "name": "Cleave",
        "panel": 3,
        "spec": {
            "type": "multiattack",
            "multiattack": {
                "attacks": [
                    {"damage_dice": "1d8", "damage_modifier": 3},
                    {"damage_dice": "1d8", "damage_modifier": 3},
                ],
            },
        },
    }
    msg = LLMController.build_review_user_msg(
        raw="5 3",
        actor={"id": "9", "name": "Stalker", "kind": "npc"},
        affected=[{
            "id": "5", "name": "Goblin", "slug": "goblin", "kind": "npc",
            "hp_before": 10, "hp_after": 0, "max_hp": 10,
            "conditions_before": [], "conditions_after": [],
            "immunities": [],
        }],
        roster=[{"id": "5", "name": "Goblin", "kind": "npc"}],
        applied_direction=None, applied_amount=None, log_tail="",
        action=action_info,
    )
    assert "Action run:" in msg, f"Expected 'Action run:' in payload:\n{msg}"
    assert "Cleave" in msg
    assert "(#3)" in msg


def test_build_review_user_msg_no_action_run_line_for_plain_damage():
    """A: when `action` is None (plain damage/condition), no 'Action run:' line."""
    from gui.llm_controller import LLMController

    msg = LLMController.build_review_user_msg(
        raw="5 12 fire",
        actor={"id": "1", "name": "Vessa", "kind": "pc"},
        affected=[{
            "id": "5", "name": "Goblin", "slug": "goblin", "kind": "npc",
            "hp_before": 12, "hp_after": 0, "max_hp": 12,
            "conditions_before": [], "conditions_after": [],
            "immunities": [],
        }],
        roster=[{"id": "5", "name": "Goblin", "kind": "npc"}],
        applied_direction="damage", applied_amount=12, log_tail="",
        action=None,
    )
    assert "Action run:" not in msg, (
        f"'Action run:' must not appear for a plain damage command:\n{msg}"
    )


def test_review_command_passes_action_to_api(sample_encounter):
    """A: review_command threads `action` through to the API call (via
    build_review_user_msg), so the review payload contains the action line."""
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

    action_info = {
        "name": "frozen_bile",
        "panel": 2,
        "spec": {"type": "single_attack", "attack": {"damage_dice": "2d6", "damage_modifier": 4}},
    }
    ctrl.review_command(
        raw="5 2",
        actor={"id": "1", "name": "Stalker", "slug": "glacier-stalker", "kind": "npc"},
        affected=[{
            "id": "5", "name": "Goblin", "slug": "goblin", "kind": "npc",
            "hp_before": 10, "hp_after": 0, "max_hp": 10,
            "conditions_before": [], "conditions_after": [],
            "immunities": [],
        }],
        roster=[{"id": "5", "name": "Goblin", "kind": "npc"}],
        applied_direction=None, applied_amount=None,
        log_tail="",
        action=action_info,
    )
    assert fake_client.messages.create.called
    call_kwargs = fake_client.messages.create.call_args.kwargs
    # The user message (first item in messages list) should contain the action line.
    messages = call_kwargs.get("messages", [])
    assert messages, "No messages passed to API"
    user_content = messages[0].get("content", "")
    assert "Action run:" in user_content, (
        f"'Action run:' not found in API message:\n{user_content}"
    )
    assert "frozen_bile" in user_content


def test_review_system_prompt_has_action_invocation_clause():
    """A: REVIEW_SYSTEM_PROMPT mentions 'Action run:' and instructs NOT to flag
    valid action invocations as malformed."""
    from gui.llm_controller import LLMController

    prompt = LLMController.REVIEW_SYSTEM_PROMPT
    assert "Action run:" in prompt, "Prompt must reference 'Action run:' line"
    # Should instruct the reviewer not to flag it as malformed/unrecognised
    assert "valid action invocation" in prompt.lower() or "action invocation" in prompt.lower()
