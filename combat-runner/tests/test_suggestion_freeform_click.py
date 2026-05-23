"""Clicking a freeform LLM suggestion must dispatch the SLUG (typed-equivalent).

Reproduces: LLM proposed `5 break free from sleep` as a suggestion. Clicking
it did nothing visible; TYPING the same text worked. Root cause: the
suggestion-chosen handler routed `action_name` through the action-chip path
(`_on_chip_clicked`), which builds a `command` ParsedCommand with the action
token — only valid for real DB actions. Freeform suggestions land as
unknown actions and silently no-op.

Fix: lookup the Suggestion by action_name; if it has NO panel_number (i.e.
it's not a numbered DB action), dispatch the SLUG through the dispatcher
exactly like typed input → unparseable → LLM fallback.
"""
from __future__ import annotations

import pytest
from pathlib import Path

from gui.state import NPCState
from gui.npc_tab import NPCTab
from gui.widgets.suggestion_bar import Suggestion
from gui.command_model import ParsedCommand


def _make_tab(qtbot, tmp_path, actions: list[dict] | None = None) -> NPCTab:
    state = NPCState(slug="t", name="T", max_hp=10, ac=10, speed="30", cr=1)
    tab = NPCTab(npc_state=state, actions=actions or [], log_path=tmp_path / "log.md")
    qtbot.addWidget(tab)
    return tab


def test_suggestion_bar_remembers_current_suggestions(qtbot):
    """The bar must expose the current Suggestion list so the click handler
    can recover slug/panel_number from action_name alone."""
    from gui.widgets.suggestion_bar import SuggestionBar
    bar = SuggestionBar()
    qtbot.addWidget(bar)
    suggs = [
        Suggestion(slug="Multiattack", action_name="multiattack", panel_number=1),
        Suggestion(slug="5 break free from sleep", action_name="break_free"),  # freeform
    ]
    bar.set_suggestions(suggs)
    assert list(bar.current_suggestion_objects()) == suggs


def test_freeform_suggestion_click_emits_unparseable_command(qtbot, tmp_path):
    """A suggestion with panel_number=None (i.e. not a numbered DB action) must
    route its SLUG through the dispatcher when clicked. For text like
    `5 break free from sleep` that the parser can't crack, the emitted
    ParsedCommand carries that slug verbatim — main_window will route it to
    the LLM fallback (matching typed-input behavior)."""
    tab = _make_tab(qtbot, tmp_path, actions=[])
    captured: list[ParsedCommand] = []
    tab.command_requested.connect(captured.append)

    tab.suggestion_bar.set_suggestions([
        Suggestion(slug="5 break free from sleep", action_name="break_free"),
    ])
    # Trigger as if the bar's signal fired (driving the button click directly
    # is fine but more brittle in qtbot — invoking the slot is the same path).
    tab._on_suggestion_chosen("break_free")

    assert captured, "no command emitted after suggestion click"
    cmd = captured[0]
    # The slug — the visible text the user clicked — must be the raw input.
    assert cmd.raw.lower() == "5 break free from sleep"


def test_numbered_db_action_suggestion_still_uses_chip_path(qtbot, tmp_path):
    """A suggestion with panel_number set is a numbered DB action; click must
    use the existing chip-fast-path so a real action_token gets dispatched.
    Verified by emitted ParsedCommand carrying `effects=[action: 'multiattack']`."""
    tab = _make_tab(qtbot, tmp_path, actions=[{"action": "multiattack", "type": "multiattack"}])
    captured: list[ParsedCommand] = []
    tab.command_requested.connect(captured.append)

    tab.suggestion_bar.set_suggestions([
        Suggestion(slug="Multiattack — 2 axes", action_name="multiattack", panel_number=1),
    ])
    tab._on_suggestion_chosen("multiattack")

    assert captured
    cmd = captured[0]
    assert cmd.kind == "command"
    assert any(e.kind == "action" and e.action_token == "multiattack" for e in cmd.effects)


def test_freeform_suggestion_uses_slug_even_when_action_name_differs(qtbot, tmp_path):
    """The visible BUTTON text is the slug — that's what the user expects to
    happen when they click. The handler must dispatch slug, not action_name,
    so the user's mental model matches reality."""
    tab = _make_tab(qtbot, tmp_path, actions=[])
    captured: list[ParsedCommand] = []
    tab.command_requested.connect(captured.append)

    # Slug is the verbose user-visible label; action_name is the LLM's
    # short snake-cased intent. They differ. Click MUST go via the slug.
    tab.suggestion_bar.set_suggestions([
        Suggestion(slug="2 cast fireball at the rager",
                   action_name="cast_fireball"),
    ])
    tab._on_suggestion_chosen("cast_fireball")

    assert captured
    assert captured[0].raw == "2 cast fireball at the rager"


def test_unknown_action_name_with_no_matching_suggestion_routes_through_parser(qtbot, tmp_path):
    """Defensive: if the signal fires with an action_name that doesn't match
    any currently-displayed suggestion (stale signal, race, test path), the
    handler should still produce a usable command by parsing the action_name
    itself — not silently swallow it."""
    tab = _make_tab(qtbot, tmp_path, actions=[])
    captured: list[ParsedCommand] = []
    tab.command_requested.connect(captured.append)

    # Empty bar.
    tab.suggestion_bar.set_suggestions([])
    tab._on_suggestion_chosen("multiattack")

    assert captured  # at least SOMETHING emitted; better than silent no-op
