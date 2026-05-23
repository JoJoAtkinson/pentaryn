"""Tests for the log-area QTabWidget refactor: tab 1 = combat log, tab 2 = stat block.

The NPC's .md file is rendered into a QTextBrowser in the second tab so the DM
can quickly reference what the creature does without leaving the runner.
"""
import pytest
from pathlib import Path

from PySide6.QtWidgets import QTextEdit, QTextBrowser, QTabWidget

from gui.state import NPCState
from gui.npc_tab import NPCTab


@pytest.fixture
def stat_md(tmp_path: Path) -> Path:
    p = tmp_path / "test-creature.md"
    p.write_text(
        "---\nname: Test Creature\ntags: [\"#combat-runner\"]\n---\n"
        "# Test Creature\n\n"
        "**HP** 50 **·** **AC** 16\n\n"
        "## Tactics\n\n"
        "Charge the nearest enemy.\n",
        encoding="utf-8",
    )
    return p


@pytest.fixture
def npc_state() -> NPCState:
    return NPCState(
        slug="test-creature", name="Test Creature",
        max_hp=50, ac=16, speed="30 ft.", cr=2,
    )


def test_npc_tab_console_has_tab_widget(qtbot, npc_state, stat_md, tmp_path):
    tab = NPCTab(
        npc_state=npc_state, actions=[], log_path=tmp_path / "log.md",
        md_path=stat_md,
    )
    qtbot.addWidget(tab)
    assert hasattr(tab, "console_tabs"), "NPCTab should expose console_tabs (QTabWidget)"
    assert isinstance(tab.console_tabs, QTabWidget)
    assert tab.console_tabs.count() == 2


def test_first_tab_is_combat_log(qtbot, npc_state, stat_md, tmp_path):
    tab = NPCTab(
        npc_state=npc_state, actions=[], log_path=tmp_path / "log.md",
        md_path=stat_md,
    )
    qtbot.addWidget(tab)
    assert tab.console_tabs.widget(0) is tab.log_view
    assert "log" in tab.console_tabs.tabText(0).lower()


def test_second_tab_is_stat_block(qtbot, npc_state, stat_md, tmp_path):
    tab = NPCTab(
        npc_state=npc_state, actions=[], log_path=tmp_path / "log.md",
        md_path=stat_md,
    )
    qtbot.addWidget(tab)
    assert hasattr(tab, "stat_view")
    assert isinstance(tab.stat_view, QTextBrowser)
    assert tab.console_tabs.widget(1) is tab.stat_view
    # Anything stat-related in the tab label
    label = tab.console_tabs.tabText(1).lower()
    assert "stat" in label or "info" in label or "ref" in label or "block" in label


def test_stat_view_renders_md_body(qtbot, npc_state, stat_md, tmp_path):
    tab = NPCTab(
        npc_state=npc_state, actions=[], log_path=tmp_path / "log.md",
        md_path=stat_md,
    )
    qtbot.addWidget(tab)
    rendered = tab.stat_view.toPlainText()
    assert "Test Creature" in rendered
    assert "Tactics" in rendered
    assert "Charge the nearest enemy" in rendered


def test_stat_view_handles_missing_md(qtbot, npc_state, tmp_path):
    """If md_path doesn't exist (or isn't passed), stat tab shows a graceful note."""
    tab = NPCTab(
        npc_state=npc_state, actions=[], log_path=tmp_path / "log.md",
        md_path=tmp_path / "does-not-exist.md",
    )
    qtbot.addWidget(tab)
    rendered = tab.stat_view.toPlainText().lower()
    # Something that hints there's no stat block to show — no crash.
    assert "no stat" in rendered or "not found" in rendered or "missing" in rendered or "unavailable" in rendered


def test_stat_view_strips_frontmatter(qtbot, npc_state, stat_md, tmp_path):
    """Frontmatter (---name: ...---) shouldn't be visible in the rendered view."""
    tab = NPCTab(
        npc_state=npc_state, actions=[], log_path=tmp_path / "log.md",
        md_path=stat_md,
    )
    qtbot.addWidget(tab)
    rendered = tab.stat_view.toPlainText()
    # The frontmatter key/value pairs should not be visible
    assert "#combat-runner" not in rendered, "frontmatter tags should be stripped"


def test_log_view_still_appendable_through_tab_wrapper(qtbot, npc_state, stat_md, tmp_path):
    """Wrapping log_view in a tab must not break _append_log."""
    tab = NPCTab(
        npc_state=npc_state, actions=[], log_path=tmp_path / "log.md",
        md_path=stat_md,
    )
    qtbot.addWidget(tab)
    tab._append_log("<span>hello world</span>")
    assert "hello world" in tab.log_view.toPlainText()
