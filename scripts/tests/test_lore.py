#!/usr/bin/env python3
"""
Tests for scripts/lore.py.

These tests are pure-Python (no network); they use temporary directories so
they don't depend on the live repo content. The lore module reads files from
paths anchored to the repo root, so we patch those module-level constants for
each test rather than the entire filesystem.
"""

from __future__ import annotations

import sys
from pathlib import Path
from textwrap import dedent

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts import lore as lore_module
from scripts.lore import (
    MCP_HANDLERS,
    MCP_TOOLS,
    _slugify,
    _split_frontmatter,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_vault(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Build a small repo-shaped tree on disk and point lore.py at it."""
    # character-registry.tsv
    registry = tmp_path / "world" / "naming_conventions" / "character-registry.tsv"
    registry.parent.mkdir(parents=True)
    registry.write_text(
        "Name\tRace\tPattern\tOrigin\tType\tNotes\n"
        "Vessa Cane\tHuman\tHuman-Geography\tMerrowgate\tNPC\tBlack Ledger leader\n"
        "Ardenwick\tHuman\tHuman-Geography\tArdenhaven\tNPC\tBlack Ledger fighter\n"
        "Khardruk-dun\tDerro\tDerro-Dwarf-Heavy\tDeep Fall Ruins\tNPC\tDerro lieutenant\n"
        "Quintus Calderon\tHuman\tCalderon-Style\tCalderon Imperium\tNPC\tEmperor\n"
        "Serithael\tElf\tElven-Soft\tAraethilion\tPC\tNicole's character\n",
        encoding="utf-8",
    )

    # An NPC markdown file with frontmatter
    npc_path = tmp_path / "world" / "factions" / "calderon-imperium" / "npcs" / "quintus-calderon.md"
    npc_path.parent.mkdir(parents=True)
    npc_path.write_text(
        dedent(
            """\
            ---
            created: 2026-03-29
            tags: ["#npc", "#emperor"]
            status: stub
            ---

            # Emperor Quintus Calderon

            > "Order before all."

            Race: Human. Role: Emperor.
            """
        ),
        encoding="utf-8",
    )

    # A faction overview
    faction_path = tmp_path / "world" / "factions" / "calderon-imperium" / "_overview.md"
    faction_path.write_text(
        dedent(
            """\
            ---
            created: 2025-12-07
            tags: ["#faction"]
            ---

            # Calderon Imperium

            The empire dominates the southern reaches.
            """
        ),
        encoding="utf-8",
    )

    # Two session folders so we can verify "highest-numbered" pick
    for n, snippet in [(1, "First session opening"), (3, "Third session climax")]:
        notes_dir = tmp_path / "sessions" / f"{n:02d}" / "notes"
        notes_dir.mkdir(parents=True)
        (notes_dir / "summary.md").write_text(
            f"---\nstatus: draft\n---\n\n{snippet} content goes here.\n",
            encoding="utf-8",
        )

    # Patch the module-level paths to point at our temp tree
    monkeypatch.setattr(lore_module, "_REPO_ROOT", tmp_path)
    monkeypatch.setattr(lore_module, "_REGISTRY_PATH", registry)
    monkeypatch.setattr(lore_module, "_FACTIONS_DIR", tmp_path / "world" / "factions")
    monkeypatch.setattr(lore_module, "_PCS_DIR", tmp_path / "characters" / "player-characters")
    monkeypatch.setattr(lore_module, "_NPCS_DIR", tmp_path / "characters" / "npcs")
    monkeypatch.setattr(lore_module, "_SESSIONS_DIR", tmp_path / "sessions")
    # Reset the registry mtime cache so tests don't see stale data
    monkeypatch.setattr(lore_module, "_registry_cache", None)
    return tmp_path


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


class TestSlugify:
    def test_basic(self):
        assert _slugify("Vessa Cane") == "vessa-cane"

    def test_apostrophe_removed(self):
        assert _slugify("Baz'gar") == "bazgar"

    def test_already_slug(self):
        assert _slugify("quintus-calderon") == "quintus-calderon"

    def test_empty(self):
        assert _slugify("") == ""


class TestSplitFrontmatter:
    def test_extracts_yaml_front_matter(self):
        text = dedent(
            """\
            ---
            created: 2026-01-01
            tags: ["#x"]
            ---

            Body text here.
            """
        )
        fm, body = _split_frontmatter(text)
        assert fm.get("created") == "2026-01-01"
        assert "Body text here" in body
        assert "---" not in body  # frontmatter delimiters stripped

    def test_no_frontmatter(self):
        text = "No frontmatter, just body."
        fm, body = _split_frontmatter(text)
        assert fm == {}
        assert body == text


# ---------------------------------------------------------------------------
# Tool behavior
# ---------------------------------------------------------------------------


class TestSearchNpcs:
    def test_filter_by_affiliation(self, fake_vault):
        result = lore_module.search_npcs(affiliation="Black Ledger")
        names = [r["name"] for r in result["results"]]
        assert "Vessa Cane" in names
        assert "Ardenwick" in names
        assert "Quintus Calderon" not in names

    def test_filter_by_race(self, fake_vault):
        result = lore_module.search_npcs(race="Derro")
        names = [r["name"] for r in result["results"]]
        assert names == ["Khardruk-dun"]

    def test_filter_by_type(self, fake_vault):
        result = lore_module.search_npcs(type="PC")
        names = [r["name"] for r in result["results"]]
        assert names == ["Serithael"]

    def test_combined_filters(self, fake_vault):
        result = lore_module.search_npcs(origin="Calderon", type="NPC")
        assert {r["name"] for r in result["results"]} == {"Quintus Calderon"}

    def test_limit(self, fake_vault):
        result = lore_module.search_npcs(limit=2)
        assert len(result["results"]) == 2

    def test_count_reflects_total_matches(self, fake_vault):
        result = lore_module.search_npcs(limit=2)
        assert result["count"] >= len(result["results"])


class TestGetNpc:
    def test_finds_registry_row_and_file(self, fake_vault):
        result = lore_module.get_npc("Quintus")
        assert result["registry"]["name"] == "Quintus Calderon"
        assert "file" in result
        assert "Order before all" in result["file"]["body"]

    def test_no_file_still_returns_registry(self, fake_vault):
        result = lore_module.get_npc("Vessa")
        assert result["registry"]["name"] == "Vessa Cane"
        assert "file" not in result

    def test_unknown_name_raises(self, fake_vault):
        with pytest.raises(ValueError, match="No registry entry"):
            lore_module.get_npc("Nobody Atall")


class TestGetFactionOverview:
    def test_known_faction(self, fake_vault):
        result = lore_module.get_faction_overview("calderon-imperium")
        assert "Calderon Imperium" in result["body"]
        assert result["frontmatter"].get("created") == "2025-12-07"

    def test_unknown_faction_raises(self, fake_vault):
        with pytest.raises(ValueError, match="No overview for"):
            lore_module.get_faction_overview("nonexistent-faction")


class TestLastSessionSummary:
    def test_picks_highest_numbered_by_default(self, fake_vault):
        result = lore_module.last_session_summary()
        assert result["session"] == 3
        assert result["notes_count"] == 1
        assert "Third session climax" in result["notes"][0]["preview"]

    def test_explicit_session_number(self, fake_vault):
        result = lore_module.last_session_summary(session=1)
        assert result["session"] == 1
        assert "First session opening" in result["notes"][0]["preview"]

    def test_unknown_session_raises(self, fake_vault):
        with pytest.raises(ValueError, match="not found"):
            lore_module.last_session_summary(session=999)


class TestFindLore:
    def test_finds_match_in_npc_file(self, fake_vault):
        result = lore_module.find_lore(query="Order before all")
        assert result["count"] >= 1
        assert any("quintus-calderon.md" in h["path"] for h in result["results"])

    def test_no_match(self, fake_vault):
        result = lore_module.find_lore(query="this-string-should-not-appear-anywhere")
        assert result["count"] == 0
        assert result["truncated"] is False

    def test_path_restriction(self, fake_vault):
        # Restrict to factions; should still find the match (Quintus is in factions/)
        result = lore_module.find_lore(query="Order before all", paths="world/factions")
        assert result["count"] >= 1
        # Restrict to a path that won't contain the match
        result = lore_module.find_lore(query="Order before all", paths="sessions")
        assert result["count"] == 0

    def test_limit_truncates(self, fake_vault, tmp_path):
        # Add many files containing the same token
        spam_dir = tmp_path / "spam"
        spam_dir.mkdir()
        for i in range(8):
            (spam_dir / f"f{i}.md").write_text("uniquetoken123 in here\n", encoding="utf-8")
        result = lore_module.find_lore(query="uniquetoken123", limit=3)
        assert len(result["results"]) == 3
        assert result["truncated"] is True

    def test_case_insensitive_default(self, fake_vault):
        result = lore_module.find_lore(query="QUINTUS")
        assert result["count"] >= 1

    def test_case_sensitive_excludes_mismatch(self, fake_vault):
        result = lore_module.find_lore(query="QUINTUS", case_sensitive=True)
        # Original file has "Quintus" not "QUINTUS"
        assert result["count"] == 0

    def test_empty_query_raises(self, fake_vault):
        with pytest.raises(ValueError, match="query"):
            lore_module.find_lore(query="")


class TestRegistryMtimeCache:
    def test_reload_after_file_changes(self, fake_vault):
        # Initial load
        result1 = lore_module.search_npcs(name="Vessa")
        assert result1["count"] == 1
        # Mutate the file: add a new row, bump mtime
        registry_path = lore_module._REGISTRY_PATH
        new_text = registry_path.read_text(encoding="utf-8") + (
            "Newperson\tHuman\tHuman-Geography\tElsewhere\tNPC\tnew\n"
        )
        registry_path.write_text(new_text, encoding="utf-8")
        import os
        future = registry_path.stat().st_mtime + 5
        os.utime(registry_path, (future, future))
        # Next call should pick up the new row
        result2 = lore_module.search_npcs(name="Newperson")
        assert result2["count"] == 1


# ---------------------------------------------------------------------------
# Tool / handler symmetry
# ---------------------------------------------------------------------------


class TestToolDefinitions:
    def test_every_handler_has_a_tool_definition(self):
        tool_names = {t["name"] for t in MCP_TOOLS}
        assert set(MCP_HANDLERS.keys()) == tool_names

    def test_search_npcs_examples_use_real_param_names(self):
        tool = next(t for t in MCP_TOOLS if t["name"] == "search_npcs")
        desc = tool["description"]
        # The fix from PR review #6: examples must reference real parameters
        assert "faction=" not in desc
        assert "origin=" in desc

    def test_get_tools_have_required_args(self):
        for tool in MCP_TOOLS:
            if tool["name"].startswith("get_"):
                schema = tool["input_schema"]
                assert schema.get("required"), f"{tool['name']} should declare required args"

    def test_annotations_present(self):
        for tool in MCP_TOOLS:
            assert "annotations" in tool
            ann = tool["annotations"]
            assert ann.get("readOnlyHint") is True
            assert ann.get("openWorldHint") is False  # lore tools are local
