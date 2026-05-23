"""LLM add_log_entry must surface in a tab's log_view, not just the .md file.

Reproduces: user typed `5 cast sleep dc 15` on Sabriel's tab. The fallback
LLM rolled the save, applied incapacitated, and wrote "[spell] Sabriel
casts Sleep …" to the markdown file via `add_log_entry`. The GUI's
combat-log panel saw NOTHING — the file write doesn't update widget state.

Fix: `_StateBundle` carries an `on_log_entry(text, kind)` hook; the tool
invokes it after a successful file write; MainWindow patches the hook to
append the line to the active tab's log_view (and surface a "new entry"
mark on the Combat-log sub-tab when the user is viewing Stat block).
"""
from __future__ import annotations

import pytest
from pathlib import Path

from gui.llm_controller import _StateBundle, _tool_add_log_entry


def test_state_bundle_has_on_log_entry_field(tmp_path):
    log_path = tmp_path / "log.md"
    bundle = _StateBundle(encounter=None, log_path=str(log_path))  # type: ignore[arg-type]
    assert hasattr(bundle, "on_log_entry"), "_StateBundle must carry an on_log_entry hook"
    assert bundle.on_log_entry is None, "default must be None (back-compat)"


def test_tool_add_log_entry_invokes_callback(tmp_path):
    log_path = tmp_path / "log.md"
    captured: list[tuple[str, str | None]] = []
    bundle = _StateBundle(  # type: ignore[arg-type]
        encounter=None, log_path=str(log_path),
        on_log_entry=lambda text, kind: captured.append((text, kind)),
    )
    result = _tool_add_log_entry(bundle, text="Sabriel casts Sleep (DC 15)", kind="spell")
    assert result == {"ok": True}
    assert captured == [("Sabriel casts Sleep (DC 15)", "spell")]
    # File was also written (existing behavior preserved).
    assert log_path.read_text().count("Sabriel casts Sleep") == 1


def test_tool_add_log_entry_no_callback_still_writes_file(tmp_path):
    log_path = tmp_path / "log.md"
    bundle = _StateBundle(encounter=None, log_path=str(log_path))  # type: ignore[arg-type]
    _tool_add_log_entry(bundle, text="something", kind=None)
    assert log_path.exists()
    assert "something" in log_path.read_text()


def test_tool_add_log_entry_callback_failure_does_not_block_file_write(tmp_path):
    """A buggy GUI callback must NOT prevent the markdown file from being
    written. The file is the canonical record."""
    log_path = tmp_path / "log.md"

    def boom(text, kind):
        raise RuntimeError("widget went away")

    bundle = _StateBundle(  # type: ignore[arg-type]
        encounter=None, log_path=str(log_path), on_log_entry=boom,
    )
    result = _tool_add_log_entry(bundle, text="entry", kind="event")
    # Tool returns ok=True — the FILE write is what matters for canonicality.
    assert result.get("ok") is True
    assert "entry" in log_path.read_text()


# ─────────── GUI integration — Combat-log sub-tab indicator ───────────

def _make_npc_tab(qtbot, tmp_path):
    from gui.state import NPCState
    from gui.npc_tab import NPCTab
    state = NPCState(slug="t", name="T", max_hp=10, ac=10, speed="30", cr=1)
    tab = NPCTab(npc_state=state, actions=[], log_path=tmp_path / "log.md")
    qtbot.addWidget(tab)
    return tab


def test_npc_tab_exposes_handle_log_entry_method(qtbot, tmp_path):
    """NPCTab needs a public-ish API for the LLM-log-entry hook to call."""
    tab = _make_npc_tab(qtbot, tmp_path)
    assert hasattr(tab, "receive_external_log"), (
        "NPCTab must expose receive_external_log so MainWindow can route LLM "
        "add_log_entry calls into it"
    )


def test_receive_external_log_appends_to_log_view(qtbot, tmp_path):
    tab = _make_npc_tab(qtbot, tmp_path)
    tab.receive_external_log("Sabriel casts Sleep at Glacier Stalker.", kind="spell")
    plain = tab.log_view.toPlainText()
    assert "Sabriel casts Sleep" in plain


def test_combat_log_tab_label_marks_unread_when_stat_block_active(qtbot, tmp_path):
    """User is on Stat block; LLM writes a log entry → Combat log label gets `●`."""
    tab = _make_npc_tab(qtbot, tmp_path)
    # Switch to the Stat block tab (index 1)
    tab.console_tabs.setCurrentIndex(1)
    assert tab.console_tabs.currentIndex() == 1

    tab.receive_external_log("Glacier Stalker is now Incapacitated.", kind="event")

    label = tab.console_tabs.tabText(0)
    assert "●" in label, f"Combat log tab should be marked unread, got {label!r}"


def test_combat_log_tab_label_not_marked_when_already_active(qtbot, tmp_path):
    """User is on Combat log already — no indicator needed."""
    tab = _make_npc_tab(qtbot, tmp_path)
    assert tab.console_tabs.currentIndex() == 0  # Combat log default

    tab.receive_external_log("normal entry", kind=None)

    label = tab.console_tabs.tabText(0)
    assert "●" not in label, f"no indicator when log tab is visible, got {label!r}"


def test_indicator_clears_when_user_views_combat_log(qtbot, tmp_path):
    tab = _make_npc_tab(qtbot, tmp_path)
    tab.console_tabs.setCurrentIndex(1)  # Stat block
    tab.receive_external_log("entry", kind=None)
    assert "●" in tab.console_tabs.tabText(0)
    # User clicks Combat log
    tab.console_tabs.setCurrentIndex(0)
    assert "●" not in tab.console_tabs.tabText(0)
